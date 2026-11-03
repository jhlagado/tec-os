import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { createContainer, parseContainer, volumePayload } from '../tools/lib/container.mjs';
import { CpmVolume } from '../tools/lib/cpmfs.mjs';
import { buildRecipe } from '../tools/lib/recipe.mjs';

function card() {
  const image = createContainer([{ geometry: 'G1M', label: 'SYSTEM', mount: 'A' }]);
  const v = parseContainer(image).volumes[0];
  return { image, fs: new CpmVolume(volumePayload(image, v), v.g) };
}

for (const capacity of ['disk', 'directory']) {
  test(`failed replacement preserves every byte on full ${capacity}`, () => {
    const { image, fs } = card();
    fs.write('KEEP.TXT', new Uint8Array(128).fill(0xaa));
    if (capacity === 'disk') fs.write('FILL.DAT', new Uint8Array(fs.freeBytes()));
    else for (let i = 1; i < fs.entries; i++) fs.write(`F${i}`, new Uint8Array());
    const before = image.slice();
    const size = capacity === 'disk' ? 2 * fs.blockBytes : 128 * fs.extentsPerEntry * 128 + 128;
    assert.throws(() => fs.write('KEEP.TXT', new Uint8Array(size)), new RegExp(`${capacity} full`));
    assert.equal(Buffer.compare(image, before), 0);
    assert.equal(fs.read('KEEP.TXT')[0], 0xaa);
    fs.write('KEEP.TXT', new Uint8Array(128).fill(0xbb));
    assert.equal(fs.read('KEEP.TXT')[0], 0xbb);
    assert.deepEqual(fs.verify(), []);
  });
}


/** The page's function NAME's text. */
function fn(source, name) {
  const at = source.indexOf(name);
  return source.slice(at, source.indexOf("\n}\n", at) + 3);
}

/** The page's code from START to END, after the helpers the import's handler calls: importSave (KE-163) and serial (KE-168). */
function withImportSave(source, start, end) {
  const serial = source.includes("function serial(") ? `let turn = Promise.resolve();\n${fn(source, "function serial(")}` : "";
  return `${fn(source, "async function importSave")}\n${serial}\n${source.slice(start, end)}`;
}

test('replacement reuses all old entries and blocks at both capacity limits', () => {
  const { fs } = card();
  const bytes = new Uint8Array(fs.freeBytes()).fill(0xaa);
  fs.write('KEEP.DAT', bytes);
  const occupied = fs.scan().length;
  for (let i = occupied; i < fs.entries; i++) fs.write(`F${i}`, new Uint8Array());
  assert.equal(fs.freeBytes(), 0);
  bytes.fill(0xbb);
  fs.write('KEEP.DAT', bytes);
  assert.deepEqual(fs.read('KEEP.DAT'), bytes);
  assert.deepEqual(fs.verify(), []);
});

for (const count of [15, 16, 17]) {
  test(`recipe seals read-only descriptors across ${count} volumes`, async () => {
    const volumes = Array.from({ length: count }, (_, i) => ({ geometry: 'G1M', label: `V${i}`, mount: i === 0 ? 'A' : undefined, readOnly: i >= 14 }));
    const image = await buildRecipe({ schema: 'tecos-file-recipe-v1', volumes, components: [] }, async () => { throw Error('unexpected fetch'); });
    assert.deepEqual(parseContainer(image).volumes.map(v => v.readOnly), volumes.map(v => v.readOnly));
  });
}

test('verify diagnoses the exact second descriptor despite a numeric label', () => {
  const image = createContainer([{ geometry: 'G1M', label: '2', mount: 'A' }, { geometry: 'G1M', label: 'WORK', mount: 'B' }]);
  const v = parseContainer(image).volumes[1];
  const fs = new CpmVolume(volumePayload(image, v), v.g);
  fs.write('BAD.DAT', new Uint8Array(128));
  fs.entry(0)[15] = 255;
  const dir = mkdtempSync(join(tmpdir(), 'host-boundaries-'));
  try {
    const path = join(dir, 'card.img');
    writeFileSync(path, image);
    const result = spawnSync(process.execPath, ['tools/tecvol.mjs', 'verify', path], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /BAD.DAT: extent 0 has record count 255/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('browser stages the whole import before saving or publishing', async () => {
  const { image } = card();
  const source = readFileSync(new URL('../web/src/main.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('$("putfile").addEventListener');
  const end = source.indexOf('$("drive").addEventListener', start);
  const state = { card: image };
  const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {}, putfile: { addEventListener: (_type, fn) => { handler = fn; } } };
  let handler, saves = 0, resets = 0;
  const context = { state, CpmVolume, parseContainer, volumePayload, $: id => elements[id], saveCard: async () => { saves++; }, reset: () => { resets++; }, refreshFiles: () => {} };
  context.currentVolume = () => {
    const v = parseContainer(state.card).volumes[0];
    return new CpmVolume(volumePayload(state.card, v), v.g);
  };
  runInNewContext(withImportSave(source, start, end), context);
  const before = image.slice();
  const file = (name, size) => ({ name, arrayBuffer: async () => new ArrayBuffer(size) });
  await handler({ target: { files: [file('GOOD.TXT', 128), file('HUGE.DAT', 2 * 1024 * 1024)] } });
  assert.equal(state.card, image);
  assert.equal(Buffer.compare(state.card, before), 0);
  assert.equal(saves, 0);
  assert.equal(resets, 0);
  await handler({ target: { files: [file('GOOD.TXT', 128)] } });
  assert.equal(state.card, image);
  assert.ok(context.currentVolume().find('GOOD.TXT'));
  assert.equal(saves, 1);
  assert.equal(resets, 1);
});

for (const running of [true, false]) {
  for (const failure of [null, 'read', 'save']) {
    test(`browser import restores running=${running} after ${failure ?? 'success'}`, async () => {
      const { image } = card();
      const before = image.slice();
      const state = { card: image, running };
      const source = readFileSync(new URL('../web/src/main.mjs', import.meta.url), 'utf8');
      const start = source.indexOf('$("putfile").addEventListener');
      const end = source.indexOf('$("drive").addEventListener', start);
      let handler, releaseRead, releaseSave, saves = 0, resets = 0;
      const readGate = new Promise(resolve => { releaseRead = resolve; });
      const saveGate = new Promise(resolve => { releaseSave = resolve; });
      const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {}, putfile: { addEventListener: (_type, fn) => { handler = fn; } } };
      runInNewContext(withImportSave(source, start, end), {
        state, CpmVolume, parseContainer, volumePayload, $: id => elements[id],
        currentVolume: () => new CpmVolume(volumePayload(image, parseContainer(image).volumes[0]), parseContainer(image).volumes[0].g),
        saveCard: async () => {
          saves++;
          assert.equal(state.running, false);
          await saveGate;
          assert.equal(state.running, false);
          if (failure === 'save') throw Error('save failed');
        },
        reset: () => { assert.equal(state.running, false); resets++; },
        refreshFiles: () => {},
      });
      const pending = handler({ target: { files: [{ name: 'KEEP.TXT', arrayBuffer: async () => {
        assert.equal(state.running, false);
        await readGate;
        assert.equal(state.running, false);
        if (failure === 'read') throw Error('read failed');
        return new ArrayBuffer(128);
      } }] } });
      const pausedDuringRead = state.running;
      releaseRead();
      // Allow the handler to reach the pending save without completing it.
      await new Promise(resolve => setImmediate(resolve));
      if (failure !== 'read') {
        assert.equal(saves, 1);
        assert.equal(state.running, false);
        assert.equal(Buffer.compare(image, before), 0);
      }
      releaseSave();
      await pending;
      assert.equal(pausedDuringRead, false);
      assert.equal(state.importBusy, false);
      assert.equal(state.running, running);
      assert.equal(resets, failure ? 0 : 1);
      if (failure) assert.equal(Buffer.compare(image, before), 0);
    });
  }
}

for (const running of [true, false]) {
  for (const failure of [false, true]) {
    test(`browser import guard excludes competing operations, running=${running}, failure=${failure}`, async () => {
      const { image, fs } = card();
      const before = image.slice();
      const state = { card: image, running, cardDirty: true };
      const source = readFileSync(new URL('../web/src/main.mjs', import.meta.url), 'utf8');
      const handlers = {};
      const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {} };
      const $ = id => elements[id] ??= { addEventListener: (_type, fn) => { handlers[id] = fn; } };
      let releaseRead, releaseSave, saves = 0, powers = 0, steps = 0, autosave;
      const readGate = new Promise(resolve => { releaseRead = resolve; });
      const saveGate = new Promise(resolve => { releaseSave = resolve; });
      const context = { state, $, CpmVolume, parseContainer, volumePayload,
        currentVolume: () => fs,
        saveCard: async () => { saves++; await saveGate; if (failure) throw Error('save failed'); },
        reset: () => {}, refreshFiles: () => {}, refreshCard: () => {}, powerOn: async () => { powers++; },
        setInterval: fn => { autosave = fn; }, performance: { now: () => 0 }, CPU_HZ: 1000,
        requestAnimationFrame: () => {}, render: () => {},
      };
      const importStart = source.indexOf('$("putfile").addEventListener');
      const pauseStart = source.indexOf('$("pause").addEventListener');
      const useStart = source.indexOf('async function useCard(');
      const autosaveStart = source.indexOf('setInterval(async () =>');
      runInNewContext([
        withImportSave(source, importStart, source.indexOf('$("drive").addEventListener', importStart)),
        source.slice(pauseStart, source.indexOf('setInterval(refreshFiles', pauseStart)),
        source.slice(useStart, source.indexOf('$("starter").addEventListener', useStart)),
        source.slice(autosaveStart, source.indexOf('// ---- Run loop', autosaveStart)),
        source.slice(source.indexOf('let last ='), source.indexOf('// ---- Rendering')),
        'this.useCard = useCard; this.frame = frame;',
      ].join('\n'), context);
      state.machine = { cycles: 0, step() { steps++; this.cycles++; } };
      const pending = handlers.putfile({ target: { files: [{ name: 'FIRST.TXT', arrayBuffer: async () => { await readGate; return new ArrayBuffer(128); } }] } });
      const busyDuringRead = state.importBusy;
      let secondReads = 0;
      const overlapping = handlers.putfile({ target: { files: [{ name: 'SECOND.TXT', arrayBuffer: async () => { secondReads++; return new ArrayBuffer(128); } }] } });
      const busyAfterOverlap = state.importBusy;
      handlers.pause();
      const runningAfterPause = state.running;
      const replacement = context.useCard(card().image);
      const cardAfterReplacement = state.card;
      const powersAfterReplacement = powers;
      const autosaveRead = autosave();
      const savesDuringRead = saves;
      const dirtyDuringRead = state.cardDirty;
      // The frame guard must hold even if another control changes running.
      state.running = true;
      context.frame(10);
      const stepsDuringRead = steps;
      state.running = false;
      releaseRead();
      await new Promise(resolve => setImmediate(resolve));
      const busyDuringSave = state.importBusy;
      handlers.pause();
      const runningDuringSave = state.running;
      const autosaveSave = autosave();
      const savesDuringSave = saves;
      releaseSave();
      await Promise.all([pending, overlapping, replacement, autosaveRead, autosaveSave].map(p => Promise.resolve(p).catch(() => {})));
      assert.equal(busyDuringRead, true);
      assert.equal(busyAfterOverlap, true);
      assert.equal(secondReads, 0);
      assert.equal(runningAfterPause, false);
      assert.equal(cardAfterReplacement, image);
      assert.equal(powersAfterReplacement, 0);
      assert.equal(savesDuringRead, 0);
      assert.equal(dirtyDuringRead, true);
      assert.equal(stepsDuringRead, 0);
      assert.equal(busyDuringSave, true);
      assert.equal(runningDuringSave, false);
      assert.equal(savesDuringSave, 1);
      assert.equal(state.importBusy, false);
      assert.equal(state.running, running);
      assert.equal(state.card, image);
      assert.equal(fs.find('SECOND.TXT'), undefined);
      if (failure) assert.equal(Buffer.compare(image, before), 0);
      else assert.ok(fs.find('FIRST.TXT'));
    });
  }
}

test("a width chosen while an import's files are read is the width on the card the import publishes (KE-168)", async () => {
  const { image } = card();
  const source = readFileSync(new URL('../web/src/main.mjs', import.meta.url), 'utf8');
  const life = source.slice(source.indexOf("let turn = Promise.resolve();"), source.indexOf("\nfunction reset()"));
  const start = source.indexOf('$("putfile").addEventListener');
  const end = source.indexOf('$("drive").addEventListener', start);
  const state = { card: image, display: 'tms', width: '80' };
  const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {}, putfile: { addEventListener: (_type, f) => { handler = f; } } };
  let handler, releaseRead;
  const readGate = new Promise((ok) => { releaseRead = ok; });
  const volumeOf = (img) => { const v = parseContainer(img).volumes[0]; return new CpmVolume(volumePayload(img, v), v.g); };
  const context = {
    state, CpmVolume, parseContainer, volumePayload, $: (id) => elements[id],
    saveCard: async () => {}, reset: () => {}, refreshFiles: () => {}, appendSerial: () => {},
    fetch: async () => ({ json: async () => ({}) }), fetchBytes: async () => new Uint8Array(0),
    widthDrivers: async () => ({ drivers: {} }), loadRom: async () => ({ rom: new Uint8Array(0), symbols: new Map() }),
    Machine: class {},
    // The card's driver stood in for by a file on A: naming the width it was prepared at.
    prepareCard: (img, _display, width) => { volumeOf(img).write('WIDTH.TXT', new TextEncoder().encode(width)); return { problem: null, note: null, changed: true }; },
  };
  const page = source.includes("let turn = Promise.resolve();")
    ? `${life}\n${fn(source, "async function importSave")}\n${source.slice(start, end)}\nthis.powerOn = powerOn;`
    : `${source.slice(source.indexOf("async function powerOn"), source.indexOf("\nfunction reset()"))}\n${withImportSave(source, start, end)}\nthis.powerOn = powerOn;`;
  runInNewContext(page, context);
  await context.powerOn(); // power on at 80
  const imported = handler({ target: { files: [{ name: 'new.txt', arrayBuffer: async () => { await readGate; return new Uint8Array([65]).buffer; } }], value: 'x' } });
  await new Promise((ok) => setTimeout(ok, 0));
  state.width = '40'; // chosen, and the power on done, while the file is still read
  await context.powerOn();
  releaseRead();
  await imported;
  const a = volumeOf(state.card);
  assert.ok(a.find('NEW.TXT'), 'the import published');
  assert.equal(new TextDecoder().decode(a.read('WIDTH.TXT')).replace(/\0+$/, ''), '40', 'and the card holds the width chosen last');
});
