// BIOS devices, the hardware services and the table at C003h.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { Machine } from "./lib/machine.mjs";
import { boot, program, standardCard, volume } from "./lib/fixtures.mjs";

const noViolations = (m) => assert.deepEqual(m.violations, []);

test("the table at C003h: TNA, ABI 4.0, the entries abi.inc names, and the old table's addresses each mapped", () => {
  const m = boot(standardCard());
  const S = (n) => m.sym(n);
  assert.equal(S("ABITAB"), 0xc003);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => m.read(S("ABITAB") + i)), [0x54, 0x4e, 0x41, 4, 0], "TNA 4.0");
  for (const n of ["ABIHW", "ABIVOL", "ABIGLCD", "ABIDRV"]) assert.equal(m.read(S(n)), 0xc3, `${n} is a jump`);
  // ABI 3.1's addresses: the first five hold still, the rest moved or left.
  const mapped = { C003: "ABITAB", C006: "ABIMAJ", C007: "ABIMIN", C008: "ABIVID", C00A: "ABIHW", C00D: "ABIMAIN", C00F: "ABIVOL", C012: "ABIGLCD", C015: "ABIDRV" };
  for (const [at, n] of Object.entries(mapped)) assert.equal(S(n), parseInt(at, 16), n);
  assert.equal(S("ABIEND"), 0xc018);
  assert.equal(m.read(0xc01d), 0xc9, "a RET where ABI 3 had ABIVOL");
  for (const n of ["ABIFONT", "ABIMOVE", "ABIXMOV", "ABIXMRK", "ABIXCCP", "ABIXCMD", "XCCP", "XCMD", "XEXIT", "CCPFLG", "CCPLVL", "LVBASE", "FONT", "HWSEGT", "RNDST", "HWARGA", "CBLOCK"]) assert.equal(m.symbols.get(n), undefined, `${n} is gone`);
  noViolations(m);
});

test("warm boot restores the PICO9918 text mode and font after a program changes them", async () => {
  const image = standardCard();
  volume(image, "A").write("VIDMODE.COM", (await program("vidmode")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.command("VIDMODE");
  const vdp = m.tec1g.state.display.tms9918.stateSnapshot();
  assert.deepEqual([...vdp.registers.slice(0, 8)], [0x04, 0x50, 0x07, 0x00, 0x00, 0x00, 0x00, 0xf4]);
  const font = Machine.font.subarray((0x41 - 0x20) * 8, (0x41 - 0x20) * 8 + 8);
  const glyph = (base) => [...vdp.vram.slice(base + 0x41 * 8, base + 0x41 * 8 + 8)];
  assert.deepEqual(glyph(0), [...font], "pattern for A");
  assert.deepEqual(glyph(0x400), [...font].map((v) => ~v & 0xff), "reverse A");
  assert.ok(m.screen().some((line) => line.startsWith("A>")));
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
  assert.ok(m.glcdScreen().some((line) => line.startsWith("A>")));
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
  const text = m.expect(/\r\nA>$/);
  assert.match(text, /41 C3 0D \r\n/);
  assert.match(m.serialText(), /PUN41 C3 0D /, "punch and console share the serial line");
  noViolations(m);
});

test("DEMO.COM drives the LCD, clock, digits, its own LED scan and a claimed PICO9918", async () => {
  const image = standardCard();
  volume(image, "A").write("DEMO.COM", (await program("demo")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  assert.equal(m.read(m.sym("ABIMAJ")), 4, "ABI 4");
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
  m.expect(/A>$/);
  const after = m.tec1g.state.display.tms9918.stateSnapshot();
  assert.deepEqual([...after.registers.slice(0, 2)], [0x04, 0x50], "80-column text again");
  assert.ok(m.screen().includes("Demo stopped."));
  assert.deepEqual(serializeTec1gUpdateFromRuntimeState(m.tec1g.state).digits, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(m.violations, []);
});
