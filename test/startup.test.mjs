// A:STARTUP.CMD at cold boot: its one record, its lines run from MLREAD at
// level 0, the keypad's skip, and a card with GLCD.DRV on boards with and
// without a GLCD. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { makeDrv } from "../tools/lib/drv.mjs";
import { Machine } from "./lib/machine.mjs";
import { GLCD_DRV, ROOT, TEST_CLOCK, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

function start(files, { key = false, ...opts } = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\n\x1a", "latin1"));
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, ...opts });
  if (key) m.tec1g.applyKeySilent(0x01, true);
  return m;
}
const prompt = (m, max = 400_000_000) => m.runUntil(() => m.ready() && /[A-P]>$/.test(m.text(0)), max, "a usable prompt");
const user = (m) => m.read(4) >> 4;

test("each line runs, echoed, and a failing one prints its message; a warm boot doesn't run the file", () => {
  const m = start({ "STARTUP.CMD": startupFile("NOSUCH", "", "USER 3", "TYPE HELLO.TXT") });
  prompt(m);
  const text = m.text(0);
  assert.match(text, /A>NOSUCH\r\r\nNOSUCH\?/);
  assert.match(text, /A>TYPE HELLO.TXT\r\r\n/);
  assert.equal(user(m), 3);
  const mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(mark)), 200_000_000, "warm boot");
  assert.doesNotMatch(m.text(mark), /USER/);
});

test("a nested level takes no line, and EXIT resumes the file", () => {
  const m = start({ "STARTUP.CMD": startupFile("CCP", "USER 3") });
  m.runUntil(() => m.waitingForInput() && m.read(m.sym("CCPLVL")) === 1, 400_000_000, "the nested prompt");
  assert.equal(user(m), 0);
  m.type("EXIT\r");
  prompt(m);
  assert.equal(user(m), 3);
});

test("a file with no lines, and no file, reach the prompt; a file over one record ends at it", () => {
  prompt(start({ "STARTUP.CMD": new Uint8Array(0) }));
  prompt(start({}));
  const m = start({ "STARTUP.CMD": Buffer.from("USER 1\r\n".repeat(60) + "USER 2\r\n\x1a", "latin1") });
  prompt(m);
  assert.equal((m.text(0).match(/USER 1/g) ?? []).length, 16, "the lines whole in the record");
  assert.equal(user(m), 1);
});

test("a key held through reset skips the file: a hanging INIT reaches a prompt, and with no key it hangs", async () => {
  const defs = { FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, DRVNAME: '"HANG    "', SVCNAME: '"HANG    "', SVCVER: 1 };
  for (const v of ["V_FAIL", "V_PROBE", "V_CCP", "V_CMD", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFAIL", "V_WB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO"]) defs[v] = 0;
  defs.V_HANG = 1;
  const { file } = await makeDrv(resolve(ROOT, "test/programs/drvdemo.asm"), { defs, work: resolve(ROOT, "build/drv") });
  const files = { "HANG.DRV": file, "STARTUP.CMD": startupFile("HANG.DRV") };
  const held = start(files, { key: true });
  prompt(held);
  assert.equal(held.read(held.sym("DRVHEAD")), 0);
  const free = start(files);
  assert.throws(() => prompt(free, 60_000_000));
  assert.ok(free.pc < 0xc000, "in the driver");
});

for (const [name, opts] of [["no GLCD", { matrix: true, glcd: false }], ["no matrix keyboard", {}]]) {
  test(`a machine with ${name} refuses GLCD.DRV from the file and the prompt follows`, () => {
    const m = start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("GLCD.DRV") }, opts);
    prompt(m);
    assert.match(m.text(0), /GLCD\.DRV\?/);
    assert.equal(m.read(m.sym("DRVHEAD")), 0);
    assert.equal(m.read(3) & 3, 0, "TTY:");
  });
}

test("on a PICO9918 and matrix board GLCD.DRV loads and the PICO9918 keeps the console", () => {
  const m = start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("GLCD.DRV") }, { tms: true, matrix: true });
  prompt(m);
  assert.notEqual(m.read(m.sym("DRVHEAD")), 0);
  assert.equal(m.read(3) & 3, 1, "CRT:");
});
