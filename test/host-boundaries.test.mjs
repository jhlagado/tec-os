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
  runInNewContext(source.slice(start, end), context);
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
