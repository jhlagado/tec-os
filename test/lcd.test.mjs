// The character LCD as a console: the ROM's own 20 x 4 console for UC1 on
// the runtime's panel, and LCD.SVC's 40 x 4 on two host panels of two
// controllers (host/lcd40.mjs), one written here and one made of the
// runtime's own controllers. Prototype tests for the LCD console model: each
// names the proposed gate it measures; LC-20 and LC-21 are revision 2's confirmed
// console change and its swap key. Emulator evidence only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { ABI, GLCD_SVC, ROOT, TEST_CLOCK, romFor, standardCard, startupFile, volume, withShell } from "./lib/fixtures.mjs";

const BANNER = "\r\nTEC-OS 0.1 for TEC-1G\r\n";

/** A machine at its first prompt. files: name to bytes on A:. shell: SHELL.SVC and its startup line. */
function start({ files = {}, card = true, shell = false, prompt = /A(:\S*)?>$/, ...opts } = {}) {
  const { rom, symbols } = romFor();
  const image = card ? standardCard() : undefined;
  if (image && shell) withShell(image);
  if (image) for (const [n, b] of Object.entries(files)) volume(image, "A").write(n, b);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, glcd: false, ...opts });
  // Every read of the LCD's data port, the panel's display memory read back,
  // and every data byte written while LCDROW runs with the LCD as the console.
  m.lcdReads = 0;
  m.statusWrites = 0;
  m.statusCalls = 0;
  m.lcdSecondAccesses = 0;
  const { ioRead, ioWrite } = m.cpu.hardware;
  m.cpu.hardware.ioRead = (port) => {
    if ([0x0c, 0x8c].includes(port & 0xff)) m.lcdSecondAccesses += 1;
    if ((port & 0xff) === 0x84) m.lcdReads += 1;
    return ioRead(port);
  };
  let inRow = -1;
  m.cpu.hardware.ioWrite = (port, value) => {
    if ([0x0c, 0x8c].includes(port & 0xff)) m.lcdSecondAccesses += 1;
    if (inRow >= 0 && (port & 0xff) === 0x84) m.statusWrites += 1;
    return ioWrite(port, value);
  };
  const lcdrow = m.sym("LCDROW");
  const vhgt = m.sym("VHGT");
  const step = m.step.bind(m);
  m.step = () => {
    const sp = m.cpu.cpu.sp & 0xffff;
    if (inRow >= 0 && sp > inRow) inRow = -1;
    if (m.pc === lcdrow && m.read(vhgt) === 4) {
      inRow = sp;
      m.statusCalls += 1;
    }
    return step();
  };
  if (!card) return m;
  m.expect(prompt, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  return m;
}

const rows = (m) => m.lcdScreen().map((l) => l.trimEnd());
const rows40 = (m) => m.lcd40Screen().map((l) => l.trimEnd());
const geometry = (m) => [m.read(m.sym("VWID")), m.read(m.sym("VHGT"))];
const entry = (m) => m.read(6) | (m.read(7) << 8);
const text = (lines) => Buffer.from(lines.join("\r\n") + "\r\n\x1a", "latin1");
const lcd = (m) => m.tec1g.state.lcdCtrl;
/** Run on until the LCD's rows satisfy TEST while a key is awaited. */
const until = (m, testRows, what) => m.runUntil(() => m.waitingForInput() && testRows(rows(m)), 40_000_000, what);
/** The line BDOS function 10 is reading, as typed so far. */
/**
 * Type LINE, a CON command, at the prompt and run to the next prompt. When the
 * console changes, the new one shows "Press a key": a key on it (serial's for
 * TTY, the matrix keyboard's for the screens) keeps the change. The text since.
 */
function con(m, line) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  const done = /[A-P](:\S*)?>$/;
  m.runUntil(() => m.waitingForInput() && (/Press a key$/.test(m.text(m.mark)) || done.test(m.text(m.mark))), 200_000_000, `the question or the prompt after ${line}`);
  if (/Press a key$/.test(m.text(m.mark))) m.type(" ");
  return m.expect(done, { maxCycles: 200_000_000 });
}
const lineTaken = (m) => String.fromCharCode(...Array.from({ length: m.read(m.sym("LINCNT")) }, (_, i) => m.read(m.lineBuf + 2 + i)));

// A program that asks TNLCD to write row 1 and keeps the result at 0130h.
const RAWLCD = Uint8Array.from([
  0x06, 0x01, 0x21, 0x40, 0x01, 0x0e, ABI.TNLCD, 0xcd, ABI.ABICALL & 0xff, ABI.ABICALL >> 8, 0x32, 0x30, 0x01, 0xc9,
  ...new Array(0x32).fill(0),
  ...Buffer.from("RAW ROW FROM PROGRAM", "latin1"),
]);

// INFO through the table: L, H and B kept at 0130h.
const INFO = Uint8Array.from([0x0e, ABI.TNINFO, 0xcd, ABI.ABICALL & 0xff, ABI.ABICALL >> 8, 0x22, 0x30, 0x01, 0x78, 0x32, 0x32, 0x01, 0xc9]);

/** A program that registers a table of COLS by ROWS on UC1, at 8000h, whose routines only return. Result at 0130h. */
const register = (cols, rowCount) =>
  Uint8Array.from([
    0x21, 0x00, 0x80, 0x06, 0x07, 0x36, 0x10, 0x23, 0x36, 0x80, 0x23, 0x10, 0xf8, 0x36, cols, 0x23, 0x36, rowCount,
    0x3e, 0xc9, 0x32, 0x10, 0x80, 0x06, 0x03, 0x21, 0x00, 0x80, 0x0e, ABI.TNDRVR, 0xcd, ABI.ABICALL & 0xff, ABI.ABICALL >> 8, 0x32, 0x30, 0x01, 0xc9,
  ]);

// A program that sends the LCD commands 05h (shift with each write), 0Fh
// (cursor and blink), 18h twice (the display two columns left) and 48h (a
// CGRAM address), each after the busy flag clears, and returns.
const MODES = Uint8Array.from([...[0x05, 0x0f, 0x18, 0x18, 0x48].flatMap((c) => [0xdb, 0x04, 0x07, 0x38, 0xfb, 0x3e, c, 0xd3, 0x04]), 0xc9]);

test("LC-1 with the matrix keyboard and no PICO9918 a reset starts on the LCD, 20 x 4, at no cost in TPA", () => {
  const serial = start();
  const m = start({ matrix: true, files: { "INFO.COM": INFO } });
  assert.equal(m.read(m.sym("CONMOD")), 3, "UC1 in effect");
  assert.equal(m.read(3) & 3, 3, "and in the IOBYTE");
  assert.deepEqual(geometry(m), [20, 4]);
  assert.deepEqual(rows(m), ["A: SYSTEM", "B: WORK", "", "A>"]);
  assert.equal(m.serialText(), BANNER, "the banner on the serial line, and nothing after it");
  assert.equal(entry(m), entry(serial), "the BDOS entry where a serial board has it");
  assert.equal(lcd(m).lcdCursorOn, true, "the hardware cursor at the prompt");
  assert.equal(lcd(m).lcdAddr, 0xd4 + 2, "on the cell after A>");
  m.command("INFO");
  assert.deepEqual([m.read(0x130), m.read(0x131)], [20, 4], "INFO's L and H");
  assert.equal(m.read(0x132) & 0x04, 0, "no GLCD bit");
  assert.deepEqual(m.violations, []);
});

test("LC-1 the Matrix switch off keeps the serial console; with a PICO9918 too a reset starts on the LCD, and CON PICO moves there", () => {
  const serial = start();
  assert.equal(serial.read(serial.sym("CONMOD")), 0);
  assert.deepEqual(rows(serial).slice(0, 3), ["TEC-OS 0.1  TEC-1G", "A: SYSTEM", "B: WORK"], "the LCD shows status");
  const pico = start({ matrix: true, tms: true });
  assert.equal(pico.read(pico.sym("CONMOD")), 3, "the LCD, the board's own console");
  assert.deepEqual(rows(pico), ["A: SYSTEM", "B: WORK", "", "A>"]);
  assert.equal(pico.serialText(), BANNER, "the banner on the serial line");
  assert.match(con(pico, "CON PICO"), /CON: CRT:\r\nPress a key\r\nA>$/);
  assert.equal(pico.read(pico.sym("CONMOD")), 1, "a key on the PICO9918's keyboard kept it");
});

test("LC-1 CON TTY in STARTUP.CMD asks on the serial line: a key there keeps it, nothing brings the LCD back; serial bytes do not reach the LCD's console", () => {
  const back = start({ matrix: true, files: { "STARTUP.CMD": startupFile("CON TTY") } });
  assert.equal(back.read(back.sym("CONMOD")), 3, "nothing on the serial line: the LCD again");
  assert.match(back.serialText(), /CON: TTY:\r\nPress a key\r\n$/, "the question's line ended on the serial line");
  assert.deepEqual(rows(back).slice(0, 2), ["CON: UC1:", "A>"], "and the LCD's console reported on its cleared screen");
  const { rom, symbols } = romFor();
  const image = standardCard();
  volume(image, "A").write("STARTUP.CMD", startupFile("CON TTY"));
  const tty = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, glcd: false, matrix: true });
  tty.runUntil(() => tty.waitingForInput() && /Press a key$/.test(tty.serialText()), 200_000_000, "the question on the serial line");
  tty.type(" ");
  tty.runUntil(() => tty.ready(), 200_000_000, "the prompt");
  assert.equal(tty.read(tty.sym("CONMOD")), 0);
  assert.match(tty.serialText(), /CON: TTY:\r\nPress a key\r\nA>$/);
  const m = start({ matrix: true });
  const before = m.output.length;
  m.tec1g.queueSerial([..."DIR\r"].map((c) => c.charCodeAt(0)));
  const end = m.cycles + 8_000_000;
  m.runUntil(() => m.cycles >= end, 9_000_000, "two seconds at the prompt");
  assert.equal(m.output.length, before, "nothing echoed");
  assert.deepEqual(rows(m), ["A: SYSTEM", "B: WORK", "", "A>"]);
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

test("LC-3 the screen is the same on a panel whose address counter steps as a real controller's does", () => {
  const files = { "S.TXT": text(["row one", "12345678901234567890AB", "row three", "row four", "row five"]) };
  const runtime = start({ matrix: true, files });
  const real = start({ matrix: true, lcdReal: true, files });
  for (const m of [runtime, real]) {
    m.command("TYPE S.TXT");
    m.command("DIR");
  }
  assert.deepEqual(rows40(real), rows(runtime));
  assert.deepEqual([rows(runtime)[0], rows(runtime)[3]], ["A>DIR", "A>"]);
});

test("LC-4 a typed line: echo, backspace, ^U, ^R, and the cursor where the next key goes", () => {
  const m = start({ matrix: true });
  m.type("DIX");
  until(m, (r) => r[3] === "A>DIX", "the echo");
  assert.equal(lcd(m).lcdAddr, 0xd4 + 5);
  m.type("\bR");
  until(m, (r) => r[3] === "A>DIR", "the backspace");
  m.type("\x15CON");
  until(m, (r) => r[3] === "CON", "^U");
  assert.equal(rows(m)[2], "A>DIR#");
  m.type("\x12");
  until(m, (r) => r[2] === "CON#" && r[3] === "CON", "^R");
  m.type("\r");
  m.expect(/CON: UC1:\r\nA>$/);
  assert.equal(lcd(m).lcdCursorOn, true);
});

test("LC-4 backspace crosses the wrap: the screen shows the line that will be taken", () => {
  const m = start({ matrix: true });
  m.type("ABCDEFGHIJKLMNOPQRSTUVW");
  until(m, (r) => r[3] === "STUVW", "the wrapped line");
  assert.equal(rows(m)[2], "A>ABCDEFGHIJKLMNOPQR");
  m.type("\b\b\b\b\b\b\b");
  until(m, (r) => r[3] === "" && r[2] === "A>ABCDEFGHIJKLMNOP", "seven characters erased across the wrap");
  assert.equal(lineTaken(m), "ABCDEFGHIJKLMNOP");
  assert.equal(lcd(m).lcdAddr, 0x94 + 18, "the cursor after the P, on the row above");
  m.type("XYZ");
  until(m, (r) => r[2] === "A>ABCDEFGHIJKLMNOPXY" && r[3] === "Z", "typed across the wrap again");
  assert.equal(lineTaken(m), "ABCDEFGHIJKLMNOPXYZ");
});

test("LC-4 under the shell's prompt a wrapped line is erased, recalled and replaced with the screen in step", () => {
  const m = start({ matrix: true, shell: true, prompt: />$/, files: { "LINES.TXT": text(["one"]) } });
  const prompt = rows(m).findLast((r) => r !== "");
  assert.equal(prompt, "A:SYSTEM>");
  m.type("TYPE LINES.TXT");
  until(m, (r) => r.includes("TXT"), "the line wrapped after LINES.");
  assert.ok(rows(m).includes("A:SYSTEM>TYPE LINES."));
  m.type("\b\b\b\b\b\b");
  until(m, (r) => r.includes("A:SYSTEM>TYPE LIN") && !r.includes("TXT"), "six characters erased across the wrap");
  assert.equal(lineTaken(m), "TYPE LIN");
  m.type("ES.TXT\r");
  m.expect(/one\r\n[\s\S]*>$/, { maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the prompt after TYPE");
  const last = (r, n) => r.filter((x) => x !== "").slice(-n);
  m.type("\x17"); // ^W: the line before
  until(m, (r) => lineTaken(m) === "TYPE LINES.TXT" && last(r, 2).join("|") === "A:SYSTEM>TYPE LINES.|TXT", "the recalled line, wrapped");
  m.type("\x0e"); // ^N: the line after it, none
  until(m, (r) => lineTaken(m) === "" && last(r, 1)[0] === "A:SYSTEM>", "both rows of the recalled line erased");
  m.type("DIR");
  until(m, (r) => last(r, 1)[0] === "A:SYSTEM>DIR", "the new line");
  assert.equal(lineTaken(m), "DIR");
});

test("LC-4 a line longer than the screen is taken whole", () => {
  const m = start({ matrix: true });
  const long = "ECHO" + "ABCDEFGHIJ".repeat(9); // 94 characters with the prompt: more than 80 cells
  m.type(long);
  until(m, (r) => r[3] !== "" && r[3] === long.slice(-r[3].length) && r[3].length === ("A>" + long).length % 20, "the line's tail on the last row");
  assert.equal(lineTaken(m), long);
  m.mark = m.output.length;
  m.type("\r");
  assert.match(m.expect(/A>$/), new RegExp(`${long}\\?`), "the CCP names the whole word");
});

test("LC-5 CON LCD and CON LCD 20 select it; CON LCD 40 is refused with nothing changed", () => {
  const m = start({ matrix: true, tms: true });
  assert.match(m.command("CON LCD"), /CON: UC1:\r\nA>$/, "already the console: no question");
  assert.deepEqual(geometry(m), [20, 4]);
  assert.deepEqual(rows(m).slice(-2), ["CON: UC1:", "A>"]);
  assert.match(con(m, "CON PICO"), /CON: CRT:/);
  assert.match(con(m, "CON LCD 20"), /CON: UC1:/);
  assert.match(m.command("CON LCD 40"), /\r\n40\?\r\n/);
  assert.equal(m.read(m.sym("CONMOD")), 3, "still the LCD");
  assert.deepEqual(geometry(m), [20, 4]);
  for (const line of ["CON LCD 2", "CON LCD 200", "CON LCD20", "CON LCDX"]) assert.match(m.command(line), /\?\r\n/, line);
  assert.match(con(m, "CON TTY"), /CON: TTY:/);
  assert.equal(m.read(m.sym("CONMOD")), 0);
});

test("LC-5 LCD and UC1 remain selectable with GLCD loaded, and unloading it keeps LCD", () => {
  const m = start({ matrix: true, glcd: true, files: { "GLCD.SVC": GLCD_SVC, "INFO.COM": INFO } });
  assert.match(m.command("CON UC1"), /CON: UC1:/);
  assert.deepEqual(geometry(m), [20, 4], "UC1 is the LCD alias");
  assert.equal(m.read(m.sym("GLVEC") + 1), 0, "UC1 loads no driver");
  assert.match(con(m, "CON GLCD"), /CON: UC1:/);
  assert.deepEqual(geometry(m), [21, 8]);
  const table = m.read(m.sym("GLVEC")) | m.read(m.sym("GLVEC") + 1) << 8;
  assert.ok(table !== 0);
  assert.match(con(m, "CON LCD"), /CON: UC1:/);
  assert.deepEqual(geometry(m), [20, 4]);
  assert.equal(m.read(m.sym("GLVEC")) | m.read(m.sym("GLVEC") + 1) << 8, table, "driver still registered");
  m.command("INFO");
  assert.equal(m.read(0x132) & 0x04, 0x04, "INFO retains GLCD presence");
  m.command("UNLOAD");
  assert.deepEqual(geometry(m), [20, 4]);
  assert.equal(m.read(m.sym("GLVEC") + 1), 0);
  assert.equal(m.read(m.sym("CONAUX")), 0);
  assert.deepEqual(m.violations, []);
});

test("LC-5 a program registering UC1 under LCD leaves the selected LCD intact", () => {
  const m = start({ matrix: true, files: { "REG.COM": register(10, 5) } });
  m.command("REG");
  assert.equal(m.read(0x130), 0, "registered");
  assert.equal(m.read(m.sym("GLVEC")) | m.read(m.sym("GLVEC") + 1) << 8, 0x8000);
  assert.deepEqual(geometry(m), [20, 4], "LCD still selected");
  assert.equal(m.read(m.sym("CONAUX")), 0);
  assert.equal(m.read(m.sym("CONMOD")), 3);
});

test("LC-5 UC1 asked for with no keyboard, and CRT with no PICO9918, fall back to serial", () => {
  const none = start({});
  assert.match(none.command("CON LCD"), /CON: TTY:/);
  assert.match(none.command("CON UC1"), /CON: TTY:/);
  const lcdBoard = start({ matrix: true });
  assert.match(con(lcdBoard, "CON CRT"), /CON: TTY:/);
  assert.equal(lcdBoard.read(lcdBoard.sym("CONMOD")), 0);
});

test("LC-6 the raw row service is refused while the LCD is the console, and works again after CON TTY", () => {
  const m = start({ matrix: true, files: { "RAW.COM": RAWLCD } });
  m.command("RAW");
  assert.equal(m.read(0x130), ABI.TNENODV, "TNENODV");
  assert.ok(!rows(m).some((r) => r.includes("RAW ROW")), "nothing written");
  con(m, "CON TTY");
  m.command("RAW");
  assert.equal(m.read(0x130), 0);
  assert.equal(rows(m)[1], "RAW ROW FROM PROGRAM");
});

test("LC-6 once the LCD is the console no status text is written: the labels, GLCD? and CARD? at a retry", () => {
  const m = start({ matrix: true });
  assert.ok(m.statusCalls >= 2, "the two labels were asked for");
  m.command("CON GLCD"); // no GLCD.SVC: the word GLCD? is asked for
  assert.ok(m.statusCalls >= 3);
  assert.equal(m.statusWrites, 0, "and no byte of them reached the panel");
  assert.equal(m.read(m.sym("CONMOD")), 3);
  const d = start({ matrix: true, card: false });
  d.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  d.mark = d.output.length;
  d.typeMatrix("R");
  d.expect(/R retry> $/, { maxCycles: 200_000_000 });
  assert.ok(d.statusCalls >= 2, "the banner and CARD? were asked for at the retry");
  assert.equal(d.statusWrites, 0);
});

test("LC-6 four rows mean the LCD: a four-row table on UC1 stops the raw row service, an eight-row one does not", () => {
  const four = start({ matrix: true, files: { "REG.COM": register(16, 4), "RAW.COM": RAWLCD } });
  four.command("REG");
  four.command("RAW");
  assert.equal(four.read(0x130), ABI.TNENODV);
  const eight = start({ matrix: true, files: { "REG.COM": register(16, 8), "RAW.COM": RAWLCD } });
  eight.command("REG");
  eight.command("RAW");
  assert.equal(eight.read(0x130), 0);
  assert.equal(rows(eight)[1], "RAW ROW FROM PROGRAM");
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

test("LC-7 a program's entry mode, blink, CGRAM address and display shift are gone after its exit", () => {
  const m = start({ matrix: true, files: { "MODES.COM": MODES } });
  m.command("MODES");
  const s = lcd(m);
  assert.deepEqual([s.lcdEntryIncrement, s.lcdEntryShift], [true, false], "addresses rise, no shift with a write");
  assert.equal(s.lcdCursorBlink, false, "no blink");
  assert.equal(s.lcdAddrMode, "ddram", "the display's memory addressed");
  assert.equal(s.lcdDisplayShift, 0, "the display not shifted");
  assert.deepEqual(rows(m).slice(-3), ["A>MODES", "", "A>"]);
  assert.equal(s.lcdAddr, 0xd4 + 2, "the cursor after the prompt");
});

test("LC-8 with no card the retry prompt is on the LCD, its long line wrapped, and the matrix keyboard's R retries", () => {
  const m = start({ matrix: true, card: false });
  m.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  assert.deepEqual(rows(m), ["No volume mounted, e", "rror 01", "R retry>", ""]);
  assert.equal(m.serialText(), BANNER);
  m.mark = m.output.length;
  m.typeMatrix("R");
  m.expect(/R retry> $/, { maxCycles: 200_000_000 });
  assert.equal(m.read(m.sym("CONMOD")), 3);
  assert.ok(rows(m).includes("R retry> R"), "the first prompt and its key are still on the screen");
});

test("LC-9 [more] pages three lines at a time under the shell, and twenty-three on a PICO9918", () => {
  const files = { "L.TXT": text(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)) };
  const m = start({ matrix: true, shell: true, prompt: />$/, files });
  m.mark = m.output.length;
  m.type("TYPE L.TXT\r");
  m.expect(/\[more\]$/, { maxCycles: 200_000_000 });
  assert.deepEqual(rows(m), ["line 1", "line 2", "line 3", "[more]"]);
  m.mark = m.output.length;
  m.type(" ");
  m.expect(/\[more\]$/, { maxCycles: 200_000_000 });
  assert.deepEqual(rows(m), ["line 4", "line 5", "line 6", "[more]"]);
  const pico = start({ matrix: true, tms: true, shell: true, prompt: />$/, files });
  con(pico, "CON PICO");
  pico.mark = pico.output.length;
  pico.type("TYPE L.TXT\r");
  const page = pico.expect(/\[more\]$/, { maxCycles: 200_000_000 });
  assert.equal(page.split("\r\n").filter((l) => /^line \d+$/.test(l)).length, 23);
});

for (const panel of [true, "runtime"]) {
  const name = panel === true ? "the host panel" : "two runtime controllers";
  test(`LC-10 explicit ROM LCD 40 on ${name} wraps and scrolls across both controllers`, () => {
    const m = start({ matrix: true, lcd40: panel, files: {
      "INFO.COM": INFO,
      "S.TXT": text(["0123456789012345678901234567890123456789XY"]),
    } });
    const before = entry(m);
    assert.equal(m.lcdSecondAccesses, 0, "default boot does not access second ports");
    con(m, "CON LCD 40");
    assert.ok(m.lcdSecondAccesses > 0);
    assert.deepEqual(geometry(m), [40, 4]);
    assert.equal(entry(m), before, "no resident or extra TPA allocation");
    m.command("TYPE S.TXT");
    assert.deepEqual(rows40(m), ["0123456789012345678901234567890123456789", "XY", "", "A>"], "a row crosses controllers while scrolling");
    assert.deepEqual(m.lcd40.cursor(), { row: 3, col: 2 });
    m.command("INFO");
    assert.deepEqual([m.read(0x130), m.read(0x131)], [40, 4]);
    assert.equal(m.read(0x132) & 0x04, 0);
    con(m, "CON TTY");
    con(m, "CON UC1");
    assert.deepEqual(geometry(m), [40, 4], "omitted width retains the profile");
    con(m, "CON LCD 20");
    assert.deepEqual(geometry(m), [20, 4]);
    assert.equal(entry(m), before);
    assert.deepEqual(m.violations, []);
  });
}

test("LC-10 explicit LCD 40 rejects one, aliased or absent controllers without changing the profile", () => {
  for (const [what, opts] of [
    ["one controller", {}],
    ["aliased controller", { lcdReal: "aliased" }],
    ["absent controller", { lcd: false }],
  ]) {
    const m = start({ matrix: true, ...opts });
    const before = entry(m);
    assert.equal(m.lcdSecondAccesses, 0, what);
    assert.match(m.command("CON LCD 40"), /40\?/, what);
    assert.deepEqual(geometry(m), [20, 4], what);
    assert.equal(m.read(m.sym("LCDPRF")), 0, what);
    assert.equal(entry(m), before, what);
    assert.deepEqual(m.violations, [], what);
  }
});

test("LC-11 a panel that never answers costs bounded time and leaves the console running", () => {
  const m = start({ matrix: true, lcd: false, files: { "S.TXT": text(["row one", "row two", "row three", "row four", "row five"]) } });
  assert.equal(m.read(m.sym("CONMOD")), 3);
  const from = m.cycles;
  m.command("TYPE S.TXT");
  // 11,635,414 measured: the bound is a quarter over it.
  assert.ok(m.cycles - from < 14_600_000, `${m.cycles - from} T-states for five lines and their scrolls`);
  assert.match(m.command("CON TTY"), /CON: TTY:/);
});

const CLOCK = 4_000_000; // the board's T-states a second
/** Type LINE on the LCD and run on until the new console asks: the cycle count then. */
function asked(m, line) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => m.waitingForInput() && /Press a key$/.test(m.text(m.mark)), 200_000_000, `the question after ${line}`);
  return m.cycles;
}
/** Run on until the LCD is the console again and its prompt is back: the cycle count then. */
function backOnLcd(m) {
  m.runUntil(() => m.read(m.sym("CONMOD")) === 3 && m.ready(), 200_000_000, "the LCD again");
  return m.cycles;
}

test("LC-20 CON TTY with nothing on the serial line, and CON CRT with no key, come back to the LCD after about ten seconds", () => {
  for (const [line, opts] of [["CON TTY", {}], ["CON CRT", { tms: true }]]) {
    const m = start({ matrix: true, ...opts });
    const t = asked(m, line);
    const seconds = (backOnLcd(m) - t) / CLOCK;
    assert.ok(seconds > 9.5 && seconds < 10.5, `${line}: ${seconds.toFixed(2)} s`);
    assert.deepEqual(rows(m).slice(0, 2), ["CON: UC1:", "A>"], `${line}: reported on the LCD`);
    assert.equal(m.read(3) & 3, 3, `${line}: the IOBYTE's CON field back to UC1`);
  }
});

test("LC-20 a key on the new console keeps it; a matrix key while serial asks does not", () => {
  const tty = start({ matrix: true });
  asked(tty, "CON TTY");
  tty.type(" ");
  tty.runUntil(() => tty.ready(), 200_000_000, "the prompt");
  assert.equal(tty.read(tty.sym("CONMOD")), 0, "a serial key kept TTY");
  const pico = start({ matrix: true, tms: true });
  asked(pico, "CON CRT");
  pico.type(" ");
  pico.runUntil(() => pico.ready(), 200_000_000, "the prompt");
  assert.equal(pico.read(pico.sym("CONMOD")), 1, "a matrix key kept CRT");
  const wrong = start({ matrix: true });
  asked(wrong, "CON TTY");
  wrong.tec1g.applyMatrixKey(4, 4, true); // held through the wait: the matrix keyboard is not TTY's
  backOnLcd(wrong);
  wrong.tec1g.applyMatrixKey(4, 4, false);
  assert.equal(wrong.read(wrong.sym("CONMOD")), 3);
});

test("LC-20 a program that writes the IOBYTE's CON field is not asked about it", () => {
  // LD A,1 / LD (0003h),A / RET: CON to CRT.
  const m = start({ matrix: true, tms: true, files: { "TOCRT.COM": Uint8Array.from([0x3e, 0x01, 0x32, 0x03, 0x00, 0xc9]) } });
  m.mark = m.output.length;
  m.type("TOCRT\r");
  m.runUntil(() => m.ready() && m.read(m.sym("CONMOD")) === 1, 200_000_000, "the prompt on the PICO9918");
  assert.doesNotMatch(m.text(m.mark), /Press a key/);
});

/** Fn and Space on the matrix keyboard, down until TEC-OS has seen them, then up. */
function hotkey(m) {
  const kb = m.sym("KBLAST");
  m.tec1g.applyMatrixKey(0, 2, true);
  m.tec1g.applyMatrixKey(1, 5, true);
  m.runUntil(() => m.read(kb) === 0x0d, 20_000_000, "Fn and Space seen");
  m.tec1g.applyMatrixKey(1, 5, false);
  m.tec1g.applyMatrixKey(0, 2, false);
  m.runUntil(() => m.read(kb) === 0xff && m.waitingForInput(), 20_000_000, "their release");
}

test("LC-21 Fn and Space swap the console between the LCD and the PICO9918, the typed line kept; with no PICO9918 they do nothing", () => {
  const m = start({ matrix: true, tms: true });
  m.type("DI");
  until(m, (r) => r[3] === "A>DI", "the echo");
  hotkey(m);
  assert.equal(m.read(m.sym("CONMOD")), 1, "the PICO9918");
  assert.equal(m.read(3) & 3, 1, "and in the IOBYTE");
  m.mark = m.output.length;
  m.type("R\r");
  assert.match(m.expect(/A>$/), /NO FILE/, "the line typed across the swap is DIR");
  hotkey(m);
  assert.equal(m.read(m.sym("CONMOD")), 3, "the LCD again");
  const lcdOnly = start({ matrix: true });
  hotkey(lcdOnly);
  assert.equal(lcdOnly.read(lcdOnly.sym("CONMOD")), 3);
  assert.deepEqual(rows(lcdOnly), ["A: SYSTEM", "B: WORK", "", "A>"], "nothing typed");
});


test("LC-21 the hotkey cycles LCD, PICO, loaded GLCD and LCD without unloading", () => {
  const m = start({ matrix: true, tms: true, glcd: true, files: { "GLCD.SVC": GLCD_SVC } });
  m.command("GLCD.SVC");
  con(m, "CON LCD");
  const before = entry(m);
  hotkey(m);
  assert.equal(m.read(m.sym("CONMOD")), 1, "PICO");
  hotkey(m);
  assert.deepEqual(geometry(m), [21, 8], "GLCD");
  hotkey(m);
  assert.deepEqual(geometry(m), [20, 4], "LCD");
  assert.equal(entry(m), before, "no service removed");
  assert.ok(m.read(m.sym("GLVEC") + 1) !== 0);
  assert.deepEqual(m.violations, []);
});


test("LC-20 a same-mode PICO width request is confirmed and timeout restores its former width", () => {
  const m = start({ matrix: true, tms: true });
  con(m, "CON PICO 40");
  assert.deepEqual(geometry(m), [40, 24]);
  asked(m, "CON PICO 80");
  assert.deepEqual(geometry(m), [80, 24]);
  m.runUntil(() => m.ready() && m.read(m.sym("PIWID")) === 40, 200_000_000, "the former PICO width");
  assert.deepEqual(geometry(m), [40, 24]);
  assert.equal(m.read(m.sym("CONOLD")) & 0x80, 0);
  assert.deepEqual(m.violations, []);
});

test("LC-20 LCD to GLCD under UC1 asks and timeout restores the LCD without unloading", () => {
  const m = start({ matrix: true, glcd: true, files: { "GLCD.SVC": GLCD_SVC } });
  m.command("GLCD.SVC");
  con(m, "CON LCD");
  const before = entry(m);
  asked(m, "CON GLCD");
  assert.deepEqual(geometry(m), [21, 8]);
  backOnLcd(m);
  assert.deepEqual(geometry(m), [20, 4]);
  assert.equal(m.read(m.sym("CONAUX")), 0);
  assert.equal(entry(m), before);
  assert.ok(m.read(m.sym("GLVEC") + 1) !== 0);
  assert.deepEqual(m.violations, []);
});

test("LC-20 LCD profile rollback restores 20 columns after a successful but unanswered 40-column request", () => {
  const m = start({ matrix: true, lcd40: true });
  asked(m, "CON LCD 40");
  assert.deepEqual(geometry(m), [40, 4]);
  backOnLcd(m);
  assert.deepEqual(geometry(m), [20, 4]);
  assert.equal(m.read(m.sym("LCDPRF")), 0);
  assert.equal(m.read(m.sym("CONOLD")) & 0x80, 0);
  assert.deepEqual(m.violations, []);
});

test("LC-20 serial NUL traffic does not confirm or suspend the finite wait", () => {
  const m = start({ matrix: true });
  const from = asked(m, "CON TTY");
  m.tec1g.queueSerial(Array(10000).fill(0));
  const seconds = (backOnLcd(m) - from) / CLOCK;
  assert.ok(seconds >= 9.5 && seconds <= 10.5, `NUL traffic: ${seconds} seconds`);
  assert.equal(m.read(m.sym("CONMOD")), 3);
  assert.deepEqual(m.violations, []);
});

test("LC-20 an invalid command clears its transaction so the recovery hotkey still works", () => {
  const m = start({ matrix: true, tms: true });
  assert.match(m.command("CON LCDX"), /LCDX\?/);
  assert.equal(m.read(m.sym("CONOLD")) & 0x80, 0);
  hotkey(m);
  assert.equal(m.read(m.sym("CONMOD")), 1);
  assert.deepEqual(m.violations, []);
});
