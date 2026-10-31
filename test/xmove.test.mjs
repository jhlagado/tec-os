// XMOVE and MOVE on the harness's 96K option, called directly and
// through BDOS function 50: copies within bank 0, the program's view, as
// LDIR does, and every copy to or from bank 1 refused, since EXPAND 1 is
// TEC-OS's own and its low mark is 80h. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, romFor, standardCard } from "./lib/fixtures.mjs";

const STUB = 0x0080;
const MAIN = 0x08;
const EXPAND = 0x04;

/** A booted machine, its program memory filled with a pattern from seed. */
function machine({ mains = 2, seed = 1 } = {}) {
  const m = boot(standardCard(), { ram96: true, mains });
  const entry = m.read(6) | (m.read(7) << 8);
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) >>> 16) & 0xff;
  for (let a = 0x0100; a < 0x8000; a += 1) m.main[0][a] = rnd();
  for (let a = 0x8000; a < entry; a += 1) m.expand[0][a - 0x8000] = rnd();
  for (let a = 0x8000; a < 0xbf00; a += 1) m.expand[1][a - 0x8000] = rnd();
  return m;
}

/** Bank b's byte at a, read from or written to the harness's RAM arrays. */
const cell = (mem, b, a) => (b === 1 ? [mem.expand[1], a - 0x8000] : a < 0x8000 ? [mem.main[0], a] : [mem.expand[0], a - 0x8000]);
const snapshot = (m) => ({ main: m.main.map((r) => r.slice()), expand: m.expand.map((r) => r.slice()) });

const le = (a) => [a & 0xff, a >> 8];

/** Run XMOVE then MOVE from a stub at 0080h; the registers, latch writes and memory after. */
function move(m, { dst, src, hl, de, bc, iff = false, latch = 0x01, entry }) {
  if (entry !== undefined) [m.write(6, entry & 0xff), m.write(7, entry >> 8)];
  m.write(m.sym("LATCHV"), latch);
  m.cpu.hardware.ioWrite(0xff, latch);
  const code = [...(iff ? [0xfb] : [0xf3]), 0x06, dst, 0x0e, src, 0xcd, ...le(m.sym("XMOVE")), 0x21, hl & 0xff, hl >> 8, 0x11, de & 0xff, de >> 8, 0x01, bc & 0xff, bc >> 8, 0xcd, ...le(m.sym("MOVE")), 0x18, 0xfe];
  code.forEach((v, i) => m.write(STUB + i, v));
  const before = snapshot(m);
  const writes = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (port, value) => {
    if ((port & 0xff) === 0xff) writes.push(value & 0xff);
    io(port, value);
  };
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.pc === STUB + code.length - 2, 20_000_000, "the end of the stub");
  m.cpu.hardware.ioWrite = io;
  const c = m.cpu.cpu;
  return { before, writes, a: c.a, hl: (c.h << 8) | c.l, de: (c.d << 8) | c.e, iff: c.iff1, latch: m.sysCtrl };
}

/** The memory a MOVE must leave: an LDIR-style copy over the snapshot, or none. */
function expected(before, { dst, src, hl, de, bc }, accepted) {
  const want = { main: before.main.map((r) => r.slice()), expand: before.expand.map((r) => r.slice()) };
  if (accepted)
    for (let i = 0; i < bc; i += 1) {
      const [r, j] = cell(want, src, de + i);
      const [w, k] = cell(want, dst, hl + i);
      w[k] = r[j];
    }
  return want;
}

/** Bytes that differ, outside the stub and its stack (0080h-00FFh) and the workspace at and above (0006h). */
function differences(m, want, entry) {
  const list = [];
  const now = snapshot(m);
  now.main.forEach((r, k) => r.forEach((v, a) => (k > 0 || a < 0x80 || a >= 0x100) && v !== want.main[k][a] && list.push(`MAIN ${k} ${a.toString(16)}h`)));
  now.expand.forEach((r, k) => r.forEach((v, i) => (k > 0 || i + 0x8000 < entry) && v !== want.expand[k][i] && list.push(`EXPAND ${k} ${(i + 0x8000).toString(16)}h`)));
  return list;
}

function check(m, c, accepted) {
  const entry = m.read(6) | (m.read(7) << 8);
  const r = move(m, c);
  const label = `${c.label}`;
  assert.equal(r.a, accepted ? 0 : 0xff, `${label}: A`);
  assert.deepEqual([r.hl, r.de], accepted ? [(c.hl + c.bc) & 0xffff, (c.de + c.bc) & 0xffff] : [c.hl, c.de], `${label}: HL and DE`);
  assert.deepEqual(differences(m, expected(r.before, c, accepted), entry).slice(0, 4), [], `${label}: memory`);
  assert.equal(r.latch, c.latch ?? 0x01, `${label}: the latch as it was`);
  assert.equal(r.iff, c.iff ? 1 : 0, `${label}: the interrupt state as it was`);
  assert.deepEqual(r.writes.filter((v) => (v & MAIN) !== 0), [], `${label}: latch bit 3 never written`);
  assert.deepEqual(m.violations, []);
  return r;
}

// Copies of every shape; those that touch bank 1 are refused, since its
// range, 8000h up to the low mark, is empty. TOP is where it ended at
// b025dbb, so the shapes are the ones bank 1 once took.
const copies = (top) => [

  { label: "MAIN 0 to bank 1, 513 bytes", dst: 1, src: 0, hl: 0x9000, de: 0x1000, bc: 513 },
  { label: "bank 1 to MAIN 0, 128 bytes", dst: 0, src: 1, hl: 0x1000, de: 0x9000, bc: 128 },
  { label: "EXPAND 0 to bank 1, 513 bytes", dst: 1, src: 0, hl: 0x9000, de: 0x9800, bc: 513 },
  { label: "bank 1 to EXPAND 0, 127 bytes", dst: 0, src: 1, hl: 0x9800, de: 0x9000, bc: 127 },
  { label: "the whole of bank 1 to MAIN 0 and EXPAND 0, across 8000h", dst: 0, src: 1, hl: 0x7000, de: 0x8000, bc: top - 0x8000 },
  { label: "MAIN 0 to the whole of bank 1", dst: 1, src: 0, hl: 0x8000, de: 0x0100, bc: top - 0x8000 },
  { label: "overlapping, forward, within bank 1", dst: 1, src: 1, hl: 0x9001, de: 0x9000, bc: 600 },
  { label: "overlapping, forward, within bank 0 across 8000h", dst: 0, src: 0, hl: 0x7f01, de: 0x7f00, bc: 600 },
  { label: "1 byte, EXPAND 0 to bank 1", dst: 1, src: 0, hl: top - 1, de: 0x8000, bc: 1 },
  { label: "0 bytes", dst: 1, src: 0, hl: 0x9000, de: 0x1000, bc: 0 },
];

test("the table gives the MAIN count; the mark stays 80h and EXPAND is always 2", () => {
  for (const mains of [2, 1]) {
    const m = boot(standardCard(), { ram96: true, mains });
    const S = (n) => m.sym(n);
    assert.ok(m.read(S("ABIMAJ")) === 4, "ABI 4");
    const at = (a) => m.read(m.read(a) | (m.read(a + 1) << 8));
    assert.deepEqual([at(S("ABIMAIN")), m.read(S("EXPANDS")), m.read(S("XMARK"))], [mains, 2, 0x80], `MAIN ${mains}`);
  }
});

test("MOVE copies within bank 0 as LDIR does, refuses every copy to or from bank 1, and changes nothing else", { timeout: 600_000 }, () => {
  for (const expandOnly of [false, true])
    for (const c of copies(0xbd00)) {
      const m = machine({ mains: expandOnly ? 1 : 2, seed: c.hl ^ c.de ^ c.bc });
      assert.equal(m.read(m.sym("XMARK")), 0x80, "the low mark");
      check(m, c, c.dst === 0 && c.src === 0);
    }
});

test("MOVE returns with the latch and the interrupt state as it found them", () => {
  for (const latch of [0x01, 0x81])
    for (const iff of [false, true]) {
      const m = machine();
      check(m, { ...copies(0xbd00)[7], latch, iff }, true);
    }
});

test("without EXPAND 1, cold boot says TEC-OS needs 64K and stops", () => {
  for (const mains of [1, 2]) {
    const { rom, symbols } = romFor();
    const m = new Machine({ rom, symbols, sdImage: standardCard(), ram96: true, mains, expands: 1, clock: TEST_CLOCK });
    m.runUntil(() => m.pc === m.sym("RAMSTOP"), 80_000_000, "RAMSTOP");
    const stop = m.cycles + 2_000_000;
    m.runUntil(() => m.cycles >= stop);
    assert.equal(m.pc, m.sym("RAMSTOP"));
    assert.match(m.serialText(), /\r\nTEC-OS needs 64K RAM\r\n$/);
    assert.doesNotMatch(m.text(0), /A>/, "the CCP never runs");
  }
});

test("MOVE refuses any bank-1 byte, and a bank-0 byte at or above (0006h)", () => {
  const entry = 0xb806;
  for (const [c, ok] of [
    [{ label: "bank 1 from 7FFFh", dst: 0, src: 1, hl: 0x1000, de: 0x7fff, bc: 2 }, false],
    [{ label: "bank 1 at BCFFh, below the history", dst: 1, src: 0, hl: 0xbcff, de: 0x1000, bc: 1 }, false],
    [{ label: "bank 0 to the entry", dst: 0, src: 0, hl: entry - 0x10, de: 0x9000, bc: 0x10 }, true],
    [{ label: "bank 0 past the entry", dst: 0, src: 0, hl: entry - 0x10, de: 0x9000, bc: 0x11 }, false],
    [{ label: "into the BDOS stack", dst: 0, src: 0, hl: 0xb980, de: 0x9000, bc: 0x40 }, false],
    [{ label: "bank 0 past FFFFh", dst: 0, src: 0, hl: 0xffff, de: 0x1000, bc: 2 }, false],
    [{ label: "bank 2", dst: 2, src: 0, hl: 0x9000, de: 0x1000, bc: 2 }, false],
    [{ label: "(0006h) lowered: into the gap", dst: 0, src: 0, hl: 0xa100, de: 0x9000, bc: 0x10, entry: 0xa006 }, false],
    [{ label: "(0006h) lowered: up to it", dst: 0, src: 0, hl: 0x9ff6, de: 0x9000, bc: 0x10, entry: 0xa006 }, true],
  ])
    check(machine(), c, ok);
});

test("BDOS function 50 reaches the RAM BIOS table, XMOVE and MOVE, and refuses SELMEM", () => {
  const m = machine();
  const pb = 0x00c0;
  const call = (func, { a = 0, bc = 0, de = 0, hl = 0 } = {}) => {
    [func, a, bc & 0xff, bc >> 8, de & 0xff, de >> 8, hl & 0xff, hl >> 8].forEach((v, i) => m.write(pb + i, v));
    [0x0e, 50, 0x11, pb & 0xff, pb >> 8, 0xcd, 0x05, 0x00, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
    m.cpu.cpu.sp = 0x0100;
    m.cpu.cpu.pc = STUB;
    m.runUntil(() => m.pc === STUB + 8, 20_000_000, "function 50");
    return m.cpu.cpu.a;
  };
  m.mark = m.output.length;
  call(4, { bc: 0x5a }); // CONOUT
  assert.equal(m.text(m.mark), "Z", "function 4 writes through the RAM BIOS table");
  call(29, { bc: 0x0100 }); // XMOVE: to bank 1 from bank 0
  const bank1 = m.expand[1].slice(0x1000, 0x1010);
  assert.equal(call(25, { hl: 0x9000, de: 0x2000, bc: 16 }), 0xff, "MOVE to bank 1 refused");
  assert.deepEqual(m.expand[1].slice(0x1000, 0x1010), bank1, "and bank 1 untouched");
  call(29, { bc: 0x0000 }); // XMOVE: within bank 0
  const want = Array.from({ length: 16 }, (_, i) => m.read(0x2000 + i));
  assert.equal(call(25, { hl: 0x3000, de: 0x2000, bc: 16 }), 0, "MOVE within bank 0 accepted");
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => m.read(0x3000 + i)), want, "and copied");
  assert.equal(call(27, { a: 1 }), 0xff, "SELMEM is not offered");
  assert.equal(call(17), 0xff, "nor any other number");
  assert.equal(m.sysCtrl & (MAIN | EXPAND), 0);
  assert.deepEqual(m.violations, []);
});

test("cold boot clears EXPAND 1 and sets the low mark to 80h; warm boot leaves both", () => {
  const m = boot(standardCard(), { ram96: true, ramFill: 0x76 });
  const mark = m.sym("XMARK");
  assert.equal(m.read(mark), 0x80);
  const wb = m.sym("WBOOTR");
  // The cache's lines may hold what the boot read; past them, its table's
  // blocks and dirty bytes, then zeros but for the jump at BF03h.
  const table = m.sym("CTAB") - 0x8000;
  const lines = Array.from({ length: 30 }, (_, n) => m.expand[1][table + 4 * n] & m.expand[1][table + 4 * n + 1] & m.expand[1][table + 4 * n + 2] & m.expand[1][table + 4 * n + 3]);
  assert.ok(lines.some((b) => b === 0xff), "empty lines, FFFFFFFFh");
  const want = (i) => (i === 0x3f03 ? 0xc3 : i === 0x3f04 ? wb & 0xff : i === 0x3f05 ? wb >> 8 : 0);
  const past = Array.from(m.expand[1]).flatMap((v, i) => (i < table + 0x100 || v === want(i) ? [] : [i + 0x8000]));
  assert.deepEqual(past.slice(0, 4), [], "zero above the table but for the jump at BF03h");
  assert.deepEqual(Array.from(m.expand[1].slice(table + 0x80, table + 0x80 + 30)), new Array(30).fill(0), "no line dirty");
  m.write(mark, 0xa0);
  m.expand[1][0x2000] = 0x5a;
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  assert.deepEqual([m.read(mark), m.expand[1][0x2000]], [0xa0, 0x5a], "warm boot keeps the mark and the allocated bytes");
  assert.deepEqual(m.violations, []);
});

test("MOVE has no range in bank 1: a byte there is refused, and 0 bytes at 8000h are not", () => {
  for (const [c, ok] of [
    [{ label: "1 byte at 8000h", dst: 1, src: 0, hl: 0x8000, de: 0x1000, bc: 1 }, false],
    [{ label: "1 byte from 8000h", dst: 0, src: 1, hl: 0x1000, de: 0x8000, bc: 1 }, false],
    [{ label: "the free page", dst: 1, src: 0, hl: 0xbe00, de: 0x1000, bc: 0x10 }, false],
    [{ label: "0 bytes at 8000h", dst: 1, src: 0, hl: 0x8000, de: 0x1000, bc: 0 }, true],
  ])
    check(machine(), c, ok);
});

test("the harness sees a program's write to EXPAND 1 below the history ring", () => {
  const m = machine();
  // LD A,05h / OUT (FFh),A / LD (9000h),A / LD A,01h / OUT (FFh),A
  const code = [0x3e, 0x05, 0xd3, 0xff, 0x32, 0x00, 0x90, 0x3e, 0x01, 0xd3, 0xff, 0x18, 0xfe];
  code.forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.pc === STUB + code.length - 2, 1_000_000, "the stub");
  assert.deepEqual(m.expand1Writes, [{ addr: 0x9000, pc: m.expand1Writes[0]?.pc }]);
  assert.equal(m.expand[1][0x1000], 5);
  for (const w of m.expand1Writes) EXPAND1_WRITES.splice(EXPAND1_WRITES.indexOf(w), 1); // this one was asked for
});
