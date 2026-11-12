// EXPAND 1, TEC-OS's own: one RAM check before the banner stops a board
// without it, cold boot clears it and warm boot leaves it, and the harness
// sees a program's write there. Function 50, MOVE and XMOVE went in KS36a,
// and with them MAIN 1's copy and EXPAND 1's warm-boot jump. The harness's
// matrix keys read KBLAST only while the classic bank is in. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, romFor, standardCard } from "./lib/fixtures.mjs";

const STUB = 0x0080;

test("without EXPAND 1, cold boot says TEC-OS needs 64K and stops, before the banner", () => {
  for (const mains of [1, 2]) {
    const { rom, symbols } = romFor();
    const m = new Machine({ rom, symbols, sdImage: standardCard(), ram96: true, mains, expands: 1, clock: TEST_CLOCK });
    m.runUntil(() => m.pc === m.sym("RAMSTOP"), 80_000_000, "RAMSTOP");
    const stop = m.cycles + 2_000_000;
    m.runUntil(() => m.cycles >= stop);
    assert.equal(m.pc, m.sym("RAMSTOP"));
    assert.equal(m.serialText(), "\r\nTEC-OS needs 64K RAM\r\n", "nothing before it: no banner, no volumes");
  }
});

test("cold boot clears EXPAND 1 but for the cache's table; warm boot leaves it", () => {
  const m = boot(standardCard(), { ram96: true, ramFill: 0x76 });
  const table = m.sym("CTAB") - 0x8000;
  const lines = Array.from({ length: 30 }, (_, n) => m.expand[1][table + 4 * n] & m.expand[1][table + 4 * n + 1] & m.expand[1][table + 4 * n + 2] & m.expand[1][table + 4 * n + 3]);
  assert.ok(lines.some((b) => b === 0xff), "empty lines, FFFFFFFFh");
  const past = Array.from(m.expand[1]).flatMap((v, i) => (i < table + 0x100 || v === 0 ? [] : [i + 0x8000]));
  assert.deepEqual(past.slice(0, 4), [], "zero above the table, and no jump at BF03h");
  assert.deepEqual(Array.from(m.expand[1].slice(table + 0x80, table + 0x80 + 30)), new Array(30).fill(0), "no line dirty");
  m.expand[1][0x2000] = 0x5a;
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  assert.equal(m.expand[1][0x2000], 0x5a, "warm boot leaves it");
  assert.equal(m.expand[1][0x3f03], 0, "and plants nothing");
  assert.deepEqual(m.violations, []);
});

test("the harness sees a program's write to EXPAND 1 below the history ring", () => {
  const m = boot(standardCard(), { ram96: true });
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

test("BDOS function 50 is gone: it returns 0, as every number past 40 does", () => {
  const m = boot(standardCard());
  // LD C,50 / CALL 5 / LD (0090h),A / JR $
  const code = [0x0e, 0x32, 0xcd, 0x05, 0x00, 0x32, 0x90, 0x00, 0x18, 0xfe];
  m.write(0x90, 0xaa);
  code.forEach((v, i) => m.write(0x0100 + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = 0x0100;
  m.runUntil(() => m.pc === 0x0100 + code.length - 2, 10_000_000, "the call's return");
  assert.equal(m.read(0x90), 0);
});

test("the harness sees a program's write to EXPAND 1's free top page, BF00h-BFFFh, as well (A12)", () => {
  const m = boot(standardCard(), { ram96: true });
  // LD A,05h / OUT (FFh),A / LD (BF80h),A / LD A,01h / OUT (FFh),A
  const code = [0x3e, 0x05, 0xd3, 0xff, 0x32, 0x80, 0xbf, 0x3e, 0x01, 0xd3, 0xff, 0x18, 0xfe];
  code.forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.pc === STUB + code.length - 2, 1_000_000, "the stub");
  assert.deepEqual(m.expand1Writes.map((w) => w.addr), [0xbf80]);
  for (const w of m.expand1Writes) EXPAND1_WRITES.splice(EXPAND1_WRITES.indexOf(w), 1); // this one was asked for
});

test("a program that ends with EXPAND 1 in view warm boots into EXPAND 0, and its file's lines reach the card (B1)", () => {
  const m = boot(standardCard(), { ram96: true });
  const fcb = [0, ..."B1      TMP"].map((c) => (typeof c === "string" ? c.charCodeAt(0) : c));
  fcb.concat(new Array(24).fill(0)).forEach((v, i) => m.write(0x5c + i, v));
  for (let i = 0; i < 128; i += 1) m.write(0x80 + i, i < 127 ? 0x42 : 0x1a); // B..B, ^Z
  // MAKE, WRITE and CLOSE B1.TMP, then LD A,05h / OUT (FFh),A / JP 0000h
  const call = (c) => [0x0e, c, 0x11, 0x5c, 0x00, 0xcd, 0x05, 0x00];
  const code = [...call(22), ...call(21), ...call(16), 0x3e, 0x05, 0xd3, 0xff, 0xc3, 0x00, 0x00];
  code.forEach((v, i) => m.write(0x0100 + i, v));
  const from = m.output.length;
  m.cpu.cpu.sp = 0x8000; // clear of the record at 0080h
  m.cpu.cpu.pc = 0x0100;
  m.expect(/\r\nA>$/, { from });
  assert.doesNotMatch(m.text(from), /TEC-OS/, "a warm boot, not a cold one");
  assert.equal(m.sysCtrl & 0x04, 0, "EXPAND 0 in view");
  m.reset();
  m.expect(/\r\nA>$/, { from: 0 });
  assert.match(m.command("TYPE B1.TMP"), /B{127}/, "the file's record on the card after a reset");
  assert.deepEqual(m.expand1Writes, []);
});

test("a write to EXPAND 1 by ROM code outside the cache, between CDI and CTADR, fails the host's watch (KS38a's review)", () => {
  const m = boot(standardCard(), { ram96: true });
  const [cdi, ctadr, mnfill] = ["CDI", "CTADR", "MNFILL"].map((n) => m.sym(n));
  assert.ok(cdi < mnfill && mnfill < ctadr, "MNFILL, in vol.asm, lies between them since the moves");
  // LD A,05h / OUT (FFh),A / LD HL,9000h / LD IX,0200h / CALL MNFILL / LD A,01h / OUT (FFh),A / JR $
  const code = [0x3e, 0x05, 0xd3, 0xff, 0x21, 0x00, 0x90, 0xdd, 0x21, 0x00, 0x02, 0xcd, mnfill & 0xff, mnfill >> 8, 0x3e, 0x01, 0xd3, 0xff, 0x18, 0xfe];
  code.forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.pc === STUB + code.length - 2, 1_000_000, "the stub");
  assert.ok(m.expand1Writes.length >= 8, `MNFILL's eight bytes at 9000h seen: ${m.expand1Writes.length}`);
  assert.ok(m.expand1Writes.every((w) => w.pc >= mnfill && w.pc < ctadr));
  for (const w of m.expand1Writes) EXPAND1_WRITES.splice(EXPAND1_WRITES.indexOf(w), 1); // these were asked for
});

test("a matrix key the harness holds is let go only on KBLAST in the classic bank, not on EXPAND 1's byte at its address", () => {
  const m = boot(standardCard(), { matrix: true });
  const kblast = m.sym("KBLAST");
  const latch = m.sysCtrl;
  m.enqueueInput("x", "matrix");
  m.pumpInput();
  const head = m.pending[0];
  assert.ok(head.down, "the key is down");
  m.cpu.hardware.ioWrite(0xff, latch | 0x04);
  m.write(kblast, head.key); // EXPAND 1's byte, as if TEC-OS had seen the key
  m.pumpInput();
  assert.equal(head.up, undefined, "not let go while EXPAND 1 is in");
  m.write(kblast, 0xff);
  m.pumpInput();
  assert.equal(m.pending.length, 1, "nor taken off the queue");
  m.cpu.hardware.ioWrite(0xff, latch);
  assert.notEqual(m.read(kblast), head.key, "the classic bank's KBLAST hasn't seen it");
  m.runUntil(() => (m.pumpInput(), !m.pending.length && /A>x$/i.test(m.text(0))), 50_000_000, "the key, seen in the classic bank and echoed");
});
