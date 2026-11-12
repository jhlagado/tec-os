import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from './lib/machine.mjs';
import { ABI, romFor, TEST_CLOCK, volume } from './lib/fixtures.mjs';
import { createContainer, parseContainer } from '../tools/lib/container.mjs';

function start(opts = {}) {
  const image = createContainer([
    { geometry: 'G1M', label: 'SYSTEM', mount: 'A' },
    { geometry: 'G8M', label: 'WORK', mount: 'B', writeBehind: true },
    { geometry: 'G1M', label: 'OTHER' },
  ], { drives: 4 });
  volume(image, 'A').write('KEEP.DAT', new Uint8Array(128).fill(0xaa));
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, ...opts });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000);
  return { m, image };
}
const bytes = (m, a, n) => Uint8Array.from({ length: n }, (_, i) => m.read(a + i));
const word = (m, n, v) => { m.write(m.sym(n), v & 255); m.write(m.sym(n) + 1, v >> 8); };
function call(m, name, regs = {}) {
  m.write(0x3000, 0); m.write(0x3001, 0x20);
  Object.assign(m.cpu.cpu, { sp: 0x3000, pc: typeof name === 'number' ? name : m.sym(name), ...regs });
  m.runUntil(() => m.pc === 0x2000, 100_000_000, String(name));
  assert.equal(m.cpu.cpu.sp, 0x3002, 'balanced return to the caller');
  return m.cpu.cpu.a;
}
// The volume services by their old operation: 0 mount, 1 unmount, 2 describe; drive C.
const svc = (m, a, c = 1, e = 2) => call(m, 'ABICALL', { b: c, c: [ABI.TNMOUNT, ABI.TNUNMNT, ABI.TNDESC][a], e, h: 0x50, l: 0 });
function writeRecord(m, drive, sector, value) {
  call(m, 'BSELDSK', { c: drive });
  word(m, 'DSKTRK', 2); word(m, 'DSKSEC', sector); word(m, 'DSKDMA', 0x4000);
  for (let i = 0; i < 128; i++) m.write(0x4000 + i, value);
  assert.equal(call(m, 'BWRITE', { c: 0 }), 0);
}
function failIO(m, entry) {
  const step = m.step.bind(m);
  let count = 0;
  m.step = () => {
    if (m.pc === m.sym(entry)) {
      count++; m.cpu.cpu.a = 5; m.cpu.cpu.pc = m.sym('SDFAIL');
    }
    return step();
  };
  return { restore: () => { m.step = step; }, count: () => count };
}

for (const operation of ['describe', 'rejected mount', 'failed descriptor read']) {
  test(`${operation} invalidates the deblocking key before metadata reuse`, () => {
    const { m, image } = start();
    writeRecord(m, 0, 0, 0xaa);
    const offset = (parseContainer(image).volumes[0].start + 32) * 512;
    const before = image.slice(offset, offset + 512);
    const fault = operation === 'failed descriptor read' ? failIO(m, 'SDREAD') : null;
    const result = operation === 'rejected mount' ? svc(m, 0, 1, 0) : svc(m, 2);
    fault?.restore();
    assert.equal(result, operation === 'describe' ? 0 : ABI.TNEBAD);
    if (fault) assert.ok(fault.count() > 0);
    assert.equal(m.read(m.sym('BUFOK')), 0);
    writeRecord(m, 0, 1, 0xbb);
    // A: coalesces: function 48 puts the pending block, both records, on the card.
    assert.equal(call(m, 5, { c: 48 }), 0);
    before.fill(0xaa, 0, 128);
    before.fill(0xbb, 128, 256);
    assert.deepEqual(image.slice(offset, offset + 512), before, 'all untouched records survive');
  });
}

for (const dirty of [false, true]) {
  test(`mount restores the requested drive and descriptor after a ${dirty ? 'dirty' : 'clean'} flush`, () => {
    const { m, image } = start();
    if (dirty) writeRecord(m, 1, 0, 0x6b);
    const step = m.step.bind(m);
    let clear = null;
    m.step = () => {
      if (m.pc === m.sym('VCLEAR')) {
        assert.equal(m.cpu.cpu.a, 1, 'only drive B is cleared');
        assert.equal(m.cpu.cpu.c, 1);
        clear = { ram: bytes(m, m.sym('WSBASE'), 0xbf00 - m.sym('WSBASE')), ret: m.read(m.cpu.cpu.sp) | m.read(m.cpu.cpu.sp + 1) << 8 };
      }
      if (clear && m.pc === clear.ret) {
        const after = bytes(m, m.sym('WSBASE'), clear.ram.length);
        for (let i = 0; i < after.length; i++) {
          const a = m.sym('WSBASE') + i;
          if ((a >= m.sym('DRVTAB') + 8 && a < m.sym('DRVTAB') + 16) || a === m.sym('DRVIDX') + 1) continue;
          assert.equal(after[i], clear.ram[i], `VCLEAR changed unrelated RAM at ${a.toString(16)}`);
        }
        clear = null;
      }
      return step();
    };
    assert.equal(svc(m, 0), 0);
    m.step = step;
    assert.equal(m.read(m.sym('DRVIDX') + 1), 3);
    const desc = parseContainer(image).volumes[2];
    const drive = bytes(m, m.sym('DRVTAB') + 8, 8);
    assert.equal(drive[0] | drive[1] << 8 | drive[2] << 16 | drive[3] << 24, desc.start);
    assert.equal(drive[6], desc.geometry);
    assert.equal(svc(m, 2), 0);
    assert.equal(m.read(0x5000 + 14), 1, 'describe reports the new drive');
  });
}

for (const op of [0, 1]) {
  test(`failed flush aborts ${op ? 'unmount' : 'mount'} without publishing mapping or descriptor changes`, () => {
    const { m, image } = start();
    writeRecord(m, 1, 0, 0x6b);
    const table = bytes(m, m.sym('DRVTAB'), 36);
    const dph = bytes(m, m.sym('DPHTAB'), 64);
    const card = image.slice();
    const fault = failIO(m, 'SDWRITE');
    const result = svc(m, op);
    fault.restore();
    assert.ok(fault.count() > 0, 'real dirty line reached SDWRITE');
    assert.equal(result, ABI.TNEBAD);
    assert.deepEqual(bytes(m, m.sym('DRVTAB'), 36), table);
    assert.deepEqual(bytes(m, m.sym('DPHTAB'), 64), dph);
    assert.deepEqual(image, card);
    if (!op) assert.equal(m.read(m.cpu.cpu.ix + 14), 255, 'buffer descriptor remains unmounted');
    assert.equal(svc(m, 2), 0);
    assert.equal(m.read(0x5000 + 14), 255);
    assert.equal(svc(m, 2, 1, 1), 0);
    assert.equal(m.read(0x5000 + 14), 1, 'old volume remains on B');
    // The flush kept the line whose write failed, so the retry writes it and succeeds.
    assert.equal(svc(m, op), 0, 'the retry succeeds');
    const offset = (parseContainer(image).volumes[1].start + 32) * 512;
    assert.deepEqual(image.slice(offset, offset + 128), new Uint8Array(128).fill(0x6b), 'the failed record reached the card at the retry');
  });
}

const bdos = (m, c, de) => call(m, 5, { c, d: de >> 8, e: de & 255 });
function fcb(m, drive = 0) {
  for (let i = 0; i < 36; i++) m.write(0x5000 + i, 0);
  m.write(0x5000, drive);
  for (let i = 0; i < 11; i++) m.write(0x5001 + i, 'KEEP    DAT'.charCodeAt(i));
}
function random(m, n) {
  for (let i = 0; i < 3; i++) m.write(0x5021 + i, n >> (8 * i) & 255);
}
for (const fn of [33, 34, 40]) for (const n of [0x10000, 0x3ffff, 0x40000, 0xffffff]) {
  test(`BDOS ${fn} rejects record ${n.toString(16)} with code 6 and retains the complete FCB`, () => {
    const { m, image } = start();
    fcb(m); assert.notEqual(bdos(m, 15, 0x5000), 255);
    bdos(m, 26, 0x4000);
    for (let i = 0; i < 128; i++) m.write(0x4000 + i, 0xbb);
    random(m, n);
    const before = bytes(m, 0x5000, 36), card = image.slice();
    assert.equal(bdos(m, fn, 0x5000), 6, `record ${n.toString(16)}`);
    assert.deepEqual(bytes(m, 0x5000, 36), before);
    assert.deepEqual(bytes(m, 0x4000, 128), new Uint8Array(128).fill(0xbb));
    assert.deepEqual(image, card);
    assert.notEqual(bdos(m, 16, 0x5000), 255);
    assert.deepEqual(volume(image, 'A').read('KEEP.DAT'), new Uint8Array(128).fill(0xaa));
    random(m, 0);
    assert.equal(bdos(m, fn, 0x5000), 0, 'valid request works after rejection');
  });
}

for (const fn of [34, 40]) test(`BDOS ${fn} accepts random record 65535 with exact extent and current record`, () => {
  const { m } = start();
  fcb(m, 2); assert.notEqual(bdos(m, 22, 0x5000), 255);
  bdos(m, 26, 0x4000);
  for (let i = 0; i < 128; i++) m.write(0x4000 + i, i ^ 0xa5);
  random(m, 65535);
  assert.equal(bdos(m, fn, 0x5000), 0);
  assert.equal(m.read(0x500c), 31);
  assert.equal(m.read(0x500e) & 63, 15);
  assert.equal(m.read(0x5020), 127);
  for (let i = 0; i < 128; i++) m.write(0x4000 + i, 0);
  assert.equal(bdos(m, 33, 0x5000), 0);
  assert.deepEqual(bytes(m, 0x4000, 128), Uint8Array.from({ length: 128 }, (_, i) => i ^ 0xa5));
});

// A3: MOUNT and UNMOUNT write a drive's dirty lines first. Each volume service's
// stack stays within abi.inc's bound of 24 bytes below the return address, with
// the cache clean and with every line dirty, so that taking a line for the
// table writes one first (KS36b review).
const dirtyLines = (m) => {
  const at = m.sym('CDIRTY') - 0x8000;
  return Array.from({ length: m.sym('NLINES') }, (_, i) => m.expand[1][at + i]).filter(Boolean).length;
};
/** Record R of B:'s data area, from track 2, holding VALUE. */
function writeAt(m, r, value) {
  call(m, 'BSELDSK', { c: 1 });
  const dph = m.cpu.cpu.h << 8 | m.cpu.cpu.l;
  const dpb = m.read(dph + 10) | m.read(dph + 11) << 8;
  const spt = m.read(dpb) | m.read(dpb + 1) << 8;
  word(m, 'DSKTRK', 2 + Math.floor(r / spt)); word(m, 'DSKSEC', r % spt); word(m, 'DSKDMA', 0x4000);
  for (let i = 0; i < 128; i++) m.write(0x4000 + i, value);
  assert.equal(call(m, 'BWRITE', { c: 0 }), 0, `record ${r}`);
}
/** Drive D's entry in the drive table, and its DPB through BSELDSK. */
function mounted(m, d) {
  const entry = bytes(m, m.sym('DRVTAB') + 8 * d, 8);
  call(m, 'BSELDSK', { c: d });
  const dph = m.cpu.cpu.h << 8 | m.cpu.cpu.l;
  return { entry, dpb: dph ? bytes(m, m.read(dph + 10) | m.read(dph + 11) << 8, 15) : null };
}
test("MOUNT, UNMOUNT and DESCRIBE stay within abi.inc's 24 bytes of stack, clean and with every line dirty, walk the cache with interrupts off, and MOUNT and UNMOUNT write the lines (A3); with every line dirty DESCRIBE returns the card's descriptor and MOUNT installs C: as from a clean cache (KE-AR3)", (t) => {
  const deepest = {};
  const clean = {}; // what each service gives with the cache clean
  // B: is left dirty: UNMOUNT takes B: away, MOUNT puts OTHER on C:, DESCRIBE reads OTHER's descriptor.
  for (const every of [false, true])
    for (const [name, op, drive, index] of [['UNMOUNT', 1, 1, 0], ['MOUNT', 0, 2, 2], ['DESCRIBE', 2, 0, 2]]) {
      const { m, image } = start({ ram96: true });
      const n = every ? m.sym('NLINES') : 6;
      for (let block = 0; block < n; block += 1) writeAt(m, 4 * block, 0x40 + block);
      if (every) assert.equal(dirtyLines(m), m.sym('NLINES'), 'every line dirty');
      const before = image.slice();
      let low = 0x3000, walkedOn = 0;
      const walk = new Set(['CLOOK', 'CTAKE', 'CFILL'].map((n) => m.sym(n)));
      const step = m.step.bind(m);
      m.step = () => {
        const sp = m.cpu.cpu.sp;
        if (sp < low && sp > 0x2f00) low = sp;
        if (walk.has(m.pc) && m.cpu.cpu.iff1) walkedOn += 1;
        return step();
      };
      m.cpu.cpu.iff1 = m.cpu.cpu.iff2 = 1; // called with interrupts on
      const got = svc(m, op, drive, index);
      m.step = step;
      const key = `${name}${every ? ', every line dirty' : ''}`;
      deepest[key] = 0x3000 - low;
      assert.equal(got, 0, `${key} succeeds`);
      assert.equal(walkedOn, 0, `${key}: the cache walked with interrupts off`);
      // KE-AR3: the table block read into the line taken, not the BIOS's record's block.
      const result = name === 'DESCRIBE' ? { desc: bytes(m, 0x5000, 32) } : name === 'MOUNT' ? mounted(m, 2) : null;
      if (result && !every) clean[name] = result;
      if (result && every) assert.deepEqual(result, clean[name], `${key}: as with the cache clean`);
      if (name === 'DESCRIBE') {
        const card = image.slice(96, 128); // index 2's descriptor in block 0
        assert.deepEqual([...result.desc].filter((_, i) => i !== 14), [...card].filter((_, i) => i !== 14), `${key}: the card's descriptor, but for its drive`);
      }
      if (name === 'MOUNT') assert.equal(result.entry[6], parseContainer(image).volumes[2].geometry, `${key}: C:'s geometry`);
      if (name !== 'DESCRIBE') {
        const [work, other] = parseContainer(image).volumes.slice(1, 3);
        const changed = image.findIndex((v, i) => v !== before[i]);
        assert.ok(changed >= work.start * 512 && changed < other.start * 512, `${key}: B:'s dirty lines reached the card, first change at ${changed}`);
      }
    }
  t.diagnostic(`stack below the return address: ${JSON.stringify(deepest)}`);
  for (const [key, d] of Object.entries(deepest)) assert.ok(d > 0 && d <= 24, `${key}: ${d} bytes below the return address`);
});
