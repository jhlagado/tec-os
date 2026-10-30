import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from './lib/machine.mjs';
import { romFor, TEST_CLOCK, volume } from './lib/fixtures.mjs';
import { createContainer, parseContainer } from '../tools/lib/container.mjs';

function start() {
  const image = createContainer([
    { geometry: 'G1M', label: 'SYSTEM', mount: 'A' },
    { geometry: 'G8M', label: 'WORK', mount: 'B', writeBehind: true },
    { geometry: 'G1M', label: 'OTHER' },
  ], { drives: 4 });
  volume(image, 'A').write('KEEP.DAT', new Uint8Array(128).fill(0xaa));
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
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
const svc = (m, a, c = 1, e = 2) => call(m, 'ABIVOL', { a, c, e, h: 0x50, l: 0 });
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
    assert.equal(result, operation === 'describe' ? 0 : 255);
    if (fault) assert.ok(fault.count() > 0);
    assert.equal(m.read(m.sym('BUFOK')), 0);
    writeRecord(m, 0, 1, 0xbb);
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
    assert.equal(result, 255);
    assert.deepEqual(bytes(m, m.sym('DRVTAB'), 36), table);
    assert.deepEqual(bytes(m, m.sym('DPHTAB'), 64), dph);
    assert.deepEqual(image, card);
    if (!op) assert.equal(m.read(m.cpu.cpu.ix + 14), 255, 'buffer descriptor remains unmounted');
    assert.equal(svc(m, 2), 0);
    assert.equal(m.read(0x5000 + 14), 255);
    assert.equal(svc(m, 2, 1, 1), 0);
    assert.equal(m.read(0x5000 + 14), 1, 'old volume remains on B');
    assert.equal(svc(m, op), 0, 'dirty data remains retryable');
    const offset = (parseContainer(image).volumes[1].start + 32) * 512;
    assert.deepEqual(image.slice(offset, offset + 128), new Uint8Array(128).fill(0x6b));
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
