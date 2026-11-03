// EXPAND 1, TEC-OS's own: one RAM check before the banner stops a board
// without it, cold boot clears it and warm boot leaves it, and the harness
// sees a program's write there. Function 50, MOVE and XMOVE went in KS36a,
// and with them MAIN 1's copy and EXPAND 1's warm-boot jump. Emulator evidence.

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
