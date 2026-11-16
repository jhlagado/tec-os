// The character LCD as a console: the ROM's own 20 x 4 console for UC1 on
// the runtime's panel, and LCD.SVC's 40 x 4 on the host's two-controller model
// (host/lcd40.mjs). Prototype tests for the LCD console model: each names the
// proposed gate it measures. Emulator evidence only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import { ABI, GLCD_SVC, ROOT, TEST_CLOCK, romFor, standardCard, startupFile, volume, withShell } from "./lib/fixtures.mjs";
import { makeSvc } from "../tools/lib/svc.mjs";

const LCD_SVC = (await makeSvc(resolve(ROOT, "drivers/lcd.asm"), { work: resolve(ROOT, "build/svc") })).file;

/** A machine at its first prompt. files: name to bytes on A:. */
function start({ files = {}, card = true, ...opts } = {}) {
  const { rom, symbols } = romFor();
  const image = card ? standardCard() : undefined;
  if (image) for (const [n, b] of Object.entries(files)) volume(image, "A").write(n, b);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, glcd: false, ...opts });
  // Every read of the LCD's data port, the panel's display memory read back.
  m.lcdReads = 0;
  const { ioRead } = m.cpu.hardware;
  if (ioRead)
    m.cpu.hardware.ioRead = (port) => {
      if ((port & 0xff) === 0x84) m.lcdReads += 1;
      return ioRead(port);
    };
  if (!card) return m;
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  return m;
}

const rows = (m) => m.lcdScreen().map((l) => l.trimEnd());
const geometry = (m) => [m.read(m.sym("VWID")), m.read(m.sym("VHGT"))];
const entry = (m) => m.read(6) | (m.read(7) << 8);
const text = (lines) => Buffer.from(lines.join("\r\n") + "\r\n\x1a", "latin1");

// A program that asks TNLCD to write row 1 and keeps the result at 0130h.
const RAWLCD = Uint8Array.from([
  0x06, 0x01, 0x21, 0x40, 0x01, 0x0e, ABI.TNLCD, 0xcd, ABI.ABICALL & 0xff, ABI.ABICALL >> 8, 0x32, 0x30, 0x01, 0xc9,
  ...new Array(0x32).fill(0),
  ...Buffer.from("RAW ROW FROM PROGRAM", "latin1"),
]);

test("LC-1 with the matrix keyboard and no PICO9918 a reset starts on the LCD, 20 x 4, at no cost in TPA", () => {
  const serial = start();
  const m = start({ matrix: true });
  assert.equal(m.read(m.sym("CONMOD")), 3, "UC1 in effect");
  assert.equal(m.read(3) & 3, 3, "and in the IOBYTE");
  assert.deepEqual(geometry(m), [20, 4]);
  assert.deepEqual(rows(m), ["A: SYSTEM", "B: WORK", "", "A>"]);
  assert.equal(m.serialText(), "", "nothing on the serial line");
  assert.equal(entry(m), entry(serial), "the BDOS entry where a serial board has it");
  assert.equal(m.tec1g.state.lcdCtrl.lcdCursorOn, true, "the hardware cursor at the prompt");
  assert.equal(m.tec1g.state.lcdCtrl.lcdAddr, 0xd4 + 2, "on the cell after A>");
  assert.deepEqual(m.violations, []);
});

test("LC-1 the Matrix switch off keeps the serial console, and a PICO9918 is preferred", () => {
  const serial = start();
  assert.equal(serial.read(serial.sym("CONMOD")), 0);
  assert.deepEqual(rows(serial).slice(0, 3), ["TEC-OS 0.1  TEC-1G", "A: SYSTEM", "B: WORK"], "the LCD shows status");
  const pico = start({ matrix: true, tms: true });
  assert.equal(pico.read(pico.sym("CONMOD")), 1);
  assert.deepEqual(rows(pico).slice(0, 3), ["TEC-OS 0.1  TEC-1G", "A: SYSTEM", "B: WORK"]);
});

test("LC-2 characters, wrap, CR, LF and clear at 20 columns", () => {
  const m = start({ matrix: true, files: { "T.TXT": text(["12345678901234567890AB", "a\tb\tc\tZ"]), "W.TXT": text(["12345678901234567890", "x"]), "F.TXT": Buffer.from("one\r\n\x0ctwo\r\n\x1a", "latin1") } });
  m.command("TYPE T.TXT");
  // A full row wraps at the next character. The BDOS spreads its tabs to
  // columns 8, 16 and 24, so the Z is on a row of its own.
  assert.deepEqual(rows(m), ["a       b       c", "    Z", "", "A>"]);
  m.command("TYPE W.TXT");
  assert.deepEqual(rows(m), ["12345678901234567890", "x", "", "A>"], "a full row and CR LF leave no blank row");
  m.command("TYPE F.TXT");
  assert.deepEqual(rows(m), ["two", "", "A>", ""], "form feed clears and homes");
});

test("LC-3 a scroll moves the rows by reading the panel's own memory", () => {
  const m = start({ matrix: true, files: { "S.TXT": text(["row one", "row two", "row three", "row four", "row five"]) } });
  const before = m.lcdReads;
  m.command("TYPE S.TXT");
  assert.deepEqual(rows(m), ["row four", "row five", "", "A>"]);
  assert.ok(m.lcdReads - before >= 5 * 3 * 20, `${m.lcdReads - before} cells read back`);
});

test("LC-4 a typed line: echo, backspace, ^U, ^R, and the cursor where the next key goes", () => {
  const m = start({ matrix: true });
  m.type("DIX");
  m.runUntil(() => m.waitingForInput() && rows(m)[3] === "A>DIX", 20_000_000, "the echo");
  assert.equal(m.tec1g.state.lcdCtrl.lcdAddr, 0xd4 + 5);
  m.type("\bR");
  m.runUntil(() => m.waitingForInput() && rows(m)[3] === "A>DIR", 20_000_000, "the backspace");
  m.type("\x15USER 0");
  m.runUntil(() => m.waitingForInput() && rows(m)[3] === "USER 0", 20_000_000, "^U");
  assert.equal(rows(m)[2], "A>DIR#");
  m.type("\x12");
  m.runUntil(() => m.waitingForInput() && rows(m)[2] === "USER 0#" && rows(m)[3] === "USER 0", 20_000_000, "^R");
  m.type("\r");
  m.expect(/A>$/);
  assert.equal(m.tec1g.state.lcdCtrl.lcdCursorOn, true);
});

test("LC-4 a line past 20 columns wraps; backspace stops at the left edge of the last row", () => {
  const m = start({ matrix: true });
  m.type("ABCDEFGHIJKLMNOPQRSTUVW");
  m.runUntil(() => m.waitingForInput() && rows(m)[3] === "STUVW", 20_000_000, "the wrapped line");
  assert.equal(rows(m)[2], "A>ABCDEFGHIJKLMNOPQR");
  m.type("\b\b\b\b\b\b\b");
  m.runUntil(() => m.waitingForInput() && rows(m)[3] === "", 20_000_000, "the last row erased");
  // The two characters erased past the edge are gone from the line, and stay on
  // the screen: the terminal's backspace does not go back up a row. ^R shows the line.
  assert.equal(rows(m)[2], "A>ABCDEFGHIJKLMNOPQR");
  m.type("\x12");
  m.runUntil(() => m.waitingForInput() && rows(m)[3] === "ABCDEFGHIJKLMNOP", 20_000_000, "^R");
});

test("LC-5 CON LCD and CON LCD 20 select it; CON LCD 40 is refused with nothing changed", () => {
  const m = start({ matrix: true, tms: true });
  assert.match(m.command("CON LCD"), /CON: UC1:/);
  assert.deepEqual(geometry(m), [20, 4]);
  assert.equal(rows(m)[0], "CON: UC1:");
  assert.match(m.command("CON PICO"), /CON: CRT:/);
  assert.match(m.command("CON LCD 20"), /CON: UC1:/);
  assert.match(m.command("CON LCD 40"), /\r\n40\?\r\n/);
  assert.equal(m.read(m.sym("CONMOD")), 3, "still the LCD");
  assert.deepEqual(geometry(m), [20, 4]);
  for (const line of ["CON LCD 2", "CON LCD 200", "CON LCD20", "CON LCDX"]) assert.match(m.command(line), /\?\r\n/, line);
  assert.match(m.command("CON TTY"), /CON: TTY:/);
  assert.equal(m.read(m.sym("CONMOD")), 0);
});

test("LC-5 CON LCD is refused while GLCD.SVC holds UC1, and UNLOAD gives UC1 back to the LCD", () => {
  const { rom, symbols } = romFor();
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, matrix: true });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  assert.deepEqual(geometry(m), [20, 4], "the LCD until the driver loads");
  assert.match(m.command("CON GLCD"), /CON: UC1:/);
  assert.deepEqual(geometry(m), [21, 8], "the GLCD");
  assert.match(m.command("CON LCD"), /LCD\?/);
  assert.deepEqual(geometry(m), [21, 8]);
  m.command("UNLOAD");
  assert.deepEqual(geometry(m), [20, 4], "the LCD again");
  assert.equal(rows(m).at(-1) === "A>" || rows(m).includes("A>"), true);
});

test("LC-6 the raw row service is refused while the LCD is the console, and works again after CON TTY", () => {
  const m = start({ matrix: true, files: { "RAW.COM": RAWLCD } });
  m.command("RAW");
  assert.equal(m.read(0x130), ABI.TNENODV, "TNENODV");
  assert.ok(!rows(m).some((r) => r.includes("RAW ROW")), "nothing written");
  m.command("CON TTY");
  m.command("RAW");
  assert.equal(m.read(0x130), 0);
  assert.equal(rows(m)[1], "RAW ROW FROM PROGRAM");
});

test("LC-7 a warm boot keeps the screen and the console, and a reset starts it again", () => {
  const m = start({ matrix: true, files: { "RAW.COM": RAWLCD } });
  m.command("RAW"); // a program's exit is a warm boot
  assert.equal(m.read(m.sym("CONMOD")), 3);
  assert.deepEqual(rows(m).slice(-3), ["A>RAW", "", "A>"]);
  m.reset();
  m.expect(/A(:\S*)?>$/, { maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the prompt after the reset");
  assert.equal(m.read(m.sym("CONMOD")), 3);
  assert.deepEqual(rows(m), ["A: SYSTEM", "B: WORK", "", "A>"]);
});

test("LC-8 with no card the retry prompt is on the LCD and the matrix keyboard's R retries", () => {
  const m = start({ matrix: true, card: false });
  m.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  assert.ok(rows(m).some((r) => r.startsWith("R retry>")), rows(m).join("|"));
  m.mark = m.output.length;
  m.typeMatrix("R");
  m.expect(/R retry> $/, { maxCycles: 200_000_000 });
  assert.equal(m.read(m.sym("CONMOD")), 3);
});

test("LC-9 [more] pages three lines at a time under the shell", () => {
  const { rom, symbols } = romFor();
  const image = withShell(standardCard());
  volume(image, "A").write("L.TXT", text(Array.from({ length: 7 }, (_, i) => `line ${i + 1}`)));
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, matrix: true, glcd: false });
  m.expect(/>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the shell's prompt");
  m.mark = m.output.length;
  m.type("TYPE L.TXT\r");
  m.expect(/\[more\]$/, { maxCycles: 200_000_000 });
  assert.deepEqual(rows(m), ["line 1", "line 2", "line 3", "[more]"]);
  m.mark = m.output.length;
  m.type(" ");
  m.expect(/\[more\]$/, { maxCycles: 200_000_000 });
  assert.deepEqual(rows(m), ["line 4", "line 5", "line 6", "[more]"]);
});

test("LC-10 LCD.SVC on a two-controller panel is 40 x 4, and UNLOAD gives UC1 back to the ROM's console", () => {
  const { rom, symbols } = romFor();
  const image = standardCard();
  const a = volume(image, "A");
  a.write("LCD.SVC", LCD_SVC);
  a.write("STARTUP.CMD", startupFile("LCD.SVC"));
  a.write("S.TXT", text(["0123456789012345678901234567890123456789XY"]));
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, matrix: true, glcd: false, lcd40: true });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  const scr = () => m.lcd40Screen().map((l) => l.trimEnd());
  assert.deepEqual(geometry(m), [40, 4]);
  assert.equal(entry(m) & 0xff, 0, "a loaded driver's page");
  m.command("TYPE S.TXT");
  // Written on row 3, the second controller's, and scrolled up to row 0, the first's.
  assert.deepEqual(scr(), ["0123456789012345678901234567890123456789", "XY", "", "A>"], "rows moved from one controller to the other");
  assert.deepEqual(m.lcd40.cursor(), { row: 3, col: 2 }, "the cursor on the second controller alone");
  assert.match(m.command("CON LCD 40"), /CON: UC1:/);
  assert.match(m.command("CON LCD 20"), /\r\n20\?\r\n/);
  assert.deepEqual(geometry(m), [40, 4]);
  m.command("UNLOAD");
  assert.deepEqual(geometry(m), [20, 4], "the ROM's console");
  assert.deepEqual(m.violations, []);
});

test("LC-10 LCD.SVC on the 20 x 4 panel finds no second controller and is 20 x 4", () => {
  const m = start({ matrix: true, files: { "LCD.SVC": LCD_SVC } });
  m.command("LCD.SVC");
  assert.deepEqual(geometry(m), [20, 4]);
  assert.equal(entry(m) & 0xff, 0, "loaded");
  assert.match(m.command("CON LCD 40"), /\r\n40\?\r\n/);
  assert.ok(rows(m).includes("40?"));
});

test("LC-11 a panel that never answers costs bounded time and leaves the console running", () => {
  const m = start({ matrix: true, lcd: false, files: { "S.TXT": text(["row one", "row two", "row three", "row four", "row five"]) } });
  assert.equal(m.read(m.sym("CONMOD")), 3);
  const from = m.cycles;
  m.command("TYPE S.TXT");
  assert.ok(m.cycles - from < 40_000_000, `${m.cycles - from} T-states for five lines and their scrolls`);
  assert.match(m.command("CON TTY"), /CON: TTY:/);
});
