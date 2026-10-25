// BIOS devices and the boundary between CP/M programs and the native ABI.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, program, standardCard, volume } from "./lib/fixtures.mjs";

const noViolations = (m) => assert.deepEqual(m.violations, []);

test("a CP/M program calling the native service entry is refused and keeps its memory", async () => {
  const image = standardCard();
  volume(image, "A").write("NATCALL.COM", (await program("natcall")).bytes);
  const m = boot(image);
  // Status 0Bh (not a native program), carry set, 0200h-05FFh untouched.
  assert.match(m.command("NATCALL"), /0BC OK\r\n/);
  noViolations(m);
});

test("warm boot restores the PICO9918 text mode and font after a program changes them", async () => {
  const image = standardCard();
  volume(image, "A").write("VIDMODE.COM", (await program("vidmode")).bytes);
  const m = boot(image, { tms: true });
  m.command("VIDMODE");
  const vdp = m.tec1g.state.display.tms9918.stateSnapshot();
  assert.deepEqual([...vdp.registers.slice(0, 8)], [0x04, 0x50, 0x07, 0x00, 0x00, 0x00, 0x00, 0xf4]);
  const font = m.sym("FONT") + (0x41 - 0x20) * 8;
  const glyph = (base) => [...vdp.vram.slice(base + 0x41 * 8, base + 0x41 * 8 + 8)];
  assert.deepEqual(glyph(0), Array.from({ length: 8 }, (_, i) => m.read(font + i)), "pattern for A");
  assert.deepEqual(glyph(0x400), Array.from({ length: 8 }, (_, i) => ~m.read(font + i) & 0xff), "reverse A");
  assert.ok(m.screen().some((line) => line.startsWith("A>")));
  noViolations(m);
});

test("warm boot turns the GLCD display and graphics back on", async () => {
  const image = standardCard();
  volume(image, "A").write("VIDMODE.COM", (await program("vidmode")).bytes);
  const m = boot(image, { tms: false });
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
  assert.match(text, /PUN41 C3 0D \r\n/);
  noViolations(m);
});
