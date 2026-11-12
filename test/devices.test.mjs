// BIOS devices, the hardware services and the table at C003h.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { Machine } from "./lib/machine.mjs";
import { boot, program, standardCard, volume } from "./lib/fixtures.mjs";

const noViolations = (m) => assert.deepEqual(m.violations, []);

test("the table at C003h: TNA, ABI 5.1 and one jump to the services, 8 bytes, and the old entries gone", () => {
  const m = boot(standardCard());
  const S = (n) => m.sym(n);
  assert.equal(S("ABITAB"), 0xc003);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => m.read(S("ABITAB") + i)), [0x54, 0x4e, 0x41, 5, 1, 0xc3], "TNA 5.1, then JP");
  assert.equal(m.read(S("ABICALL") + 1) | (m.read(S("ABICALL") + 2) << 8), S("SVCDSP"));
  assert.deepEqual([S("ABICALL"), S("ABIEND")], [0xc008, 0xc00b]);
  for (const n of ["ABIVID", "ABIHW", "ABIMAIN", "ABIVOL", "ABIGLCD", "ABISVC", "ABIDRV", "OLDVOL", "HWBASE", "ABIFONT", "ABIMOVE", "ABIXMOV", "ABIXMRK", "ABIXCCP", "ABIXCMD", "XCCP", "XCMD", "XEXIT", "CCPFLG", "CCPLVL", "LVBASE", "HWSEGT", "RNDST", "HWARGA", "CBLOCK"]) assert.equal(m.symbols.get(n), undefined, `${n} is gone`);
  noViolations(m);
});

test("warm boot turns the GLCD display and graphics back on", async () => {
  const image = standardCard();
  volume(image, "A").write("VIDMODE.COM", (await program("vidmode")).bytes);
  const m = boot(image, { matrix: true });
  m.command("VIDMODE");
  const g = m.tec1g.state.display.glcdCtrl;
  assert.equal(g.glcdDisplayOn, true);
  assert.equal(g.glcdGraphics, true);
  assert.ok(m.glcdScreen().some((line) => /^A(:\S*)?>/.test(line)));
  noViolations(m);
});

test("punch and reader are the serial port, eight bits wide", async () => {
  const image = standardCard();
  volume(image, "A").write("PUNRDR.COM", (await program("punrdr")).bytes);
  const m = boot(image);
  m.mark = m.output.length;
  m.type("PUNRDR\r");
  const wait = m.sym("BRDWT");
  const got = m.sym("BRDRX");
  for (const code of [0x41, 0xc3, 0x0d]) {
    m.runUntil(() => m.pc === wait, 50_000_000, "the reader waiting");
    m.tec1g.queueSerial([code]);
    m.runUntil(() => m.pc === got, 50_000_000, `reception of ${code.toString(16)}`);
    assert.equal(m.cpu.cpu.a, code);
  }
  const text = m.expect(/\r\nA(:\S*)?>$/);
  assert.match(text, /41 C3 0D \r\n/);
  assert.match(m.serialText(), /PUN41 C3 0D /, "punch and console share the serial line");
  noViolations(m);
});

test("DEMO.COM drives the LCD, clock, digits, its own LED scan and a claimed PICO9918", async () => {
  const image = standardCard();
  volume(image, "A").write("DEMO.COM", (await program("demo")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  assert.equal(m.read(m.sym("ABIMAJ")), 5, "ABI 5");
  m.mark = m.output.length;
  m.typeMatrix("demo\r");
  const t = m.cycles + 8_000_000;
  m.runUntil(() => m.cycles > t, 9_000_000, "the demo running");
  assert.match(m.text(m.mark), /PICO9918: yes/);
  assert.match(m.text(m.mark), /clock: yes/);
  const p = serializeTec1gUpdateFromRuntimeState(m.tec1g.state);
  assert.equal(String.fromCharCode(...p.lcd.slice(0, 20)), "TEC-OS hardware demo");
  assert.match(String.fromCharCode(...p.lcd.slice(60, 80)), /^Time     12:00:0\d   $/, "the clock on the last row, from TEST_CLOCK");
  assert.ok(p.digits.some((d) => d !== 0), "the counter is on the digits");
  assert.ok((p.matrixScanCycles?.length ?? 0) > 0, "complete scans of the 8 x 8 LEDs");
  const vdp = m.tec1g.state.display.tms9918.stateSnapshot();
  assert.deepEqual([...vdp.registers.slice(0, 8)], [0x00, 0xc2, 0x06, 0x80, 0x00, 0x36, 0x07, 0x01], "Graphics I while claimed");
  m.typeMatrix("x");
  m.expect(/A(:\S*)?>$/);
  const after = m.tec1g.state.display.tms9918.stateSnapshot();
  assert.deepEqual([...after.registers.slice(0, 2)], [0x04, 0xd0], "80-column text again");
  assert.ok(m.screen().includes("Demo stopped."));
  assert.deepEqual(serializeTec1gUpdateFromRuntimeState(m.tec1g.state).digits, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(m.violations, []);
});
