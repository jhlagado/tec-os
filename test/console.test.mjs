// Console devices on the Debug80 TEC-1G model: TMS9918 screen, matrix
// keyboard and serial together. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { Machine } from "./lib/machine.mjs";
import { GLCD_SVC, TEST_CLOCK, boot, program, romFor, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { rig } from "./lib/warmboot.mjs";

test("with a PICO9918 and the matrix keyboard the screen is the console from the banner on, with no file, and nothing goes to serial (KS39)", () => {
  const m = boot(standardCard(), { tms: true, matrix: true, width: 40 });
  const screen = m.screen();
  assert.deepEqual(screen.slice(0, 4), ["", "TEC-OS 0.1 for TEC-1G", "A: SYSTEM", "B: WORK"], "the banner and volumes on the screen");
  const at = screen.indexOf("A>");
  assert.ok(at >= 0, "the prompt on the screen");
  assert.equal(m.cell(at, 2), 0xa0, "cursor is the reverse image of a space");
  m.command("DIR");
  assert.equal(m.serialText(), "", "nothing goes to the serial port");
  assert.equal(m.read(3) & 3, 1, "IOBYTE CON: is CRT:");
});

test("without the matrix keyboard the serial terminal is the console, even with a display", () => {
  const m = boot(standardCard(), { tms: true });
  assert.match(m.serialText(), /B: WORK *\r\n\r\nA(:\S*)?>$/);
  assert.equal(m.read(3) & 3, 0, "IOBYTE CON: is TTY:");
  assert.equal(m.read(m.sym("VWID")), 0, "no screen geometry");
  assert.ok(m.screen().every((line) => line === ""), "the PICO9918 stays blank");
});

test("CON switches the console between devices and falls back to serial", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC); // CON UC1: loads the GLCD's resident
  const m = boot(image, { tms: true, matrix: true });
  assert.match(m.command("CON"), /CON: CRT:\r\n/);
  m.mark = m.output.length;
  m.typeMatrix("con uc1:\r");
  m.expect(/A(:\S*)?>$/);
  assert.equal(m.read(3) & 3, 3);
  assert.deepEqual(m.glcdScreen().slice(0, 3), ["CON: UC1:", "A>", ""]);
  m.mark = m.output.length;
  m.typeMatrix("con tty\r");
  assert.match(m.expect(/A(:\S*)?>$/), /CON: TTY:\r\n/);
  assert.match(m.serialText(), /CON: TTY:\r\nA(:\S*)?>$/);
  m.command("CON CRT");
  assert.ok(m.screen().some((line) => line === "CON: CRT:"));
  assert.match(m.command("CON XYZ"), /\r\nXYZ\?/);
  assert.deepEqual(m.violations, []);
});

test("CON PICO and CON GLCD name CRT: and UC1:; a width goes after CRT or PICO alone, 80, 40 or 32, and only to a driver whose table has the width (KD-174)", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  const m = boot(image, { tms: true, matrix: true });
  m.command("CON GLCD");
  assert.equal(m.read(3) & 3, 3, "GLCD is UC1:");
  m.command("CON TTY");
  assert.equal(m.read(3) & 3, 0);
  m.command("CON PICO:");
  assert.equal(m.read(3) & 3, 1, "PICO is CRT:");
  m.command("CON TTY");
  for (const line of ["CON PICO 50", "CON PICO 4", "CON PICO 400", "CON PICO 4O", "CON GLCD 40", "CON TTY 80", "CON PICOX", "CON PIC", "CON GLC 40", "CON CRT80", "CON PICO80", "CON PICO:80"])
    assert.match(m.command(line), /\?\r\n/, `${line}: refused`);
  // The error names what is wrong: the width when the name is right, the word when it isn't (KS36c review).
  assert.match(m.command("CON PICO 50"), /\r\n50\?\r\n/);
  assert.match(m.command("CON GLCD 40"), /\r\n40\?\r\n/);
  assert.match(m.command("CON CRT80"), /\r\nCRT80\?\r\n/);
  assert.equal(m.read(3) & 3, 0, "nothing changed");
  assert.deepEqual(m.violations, []);
});

test("CRT: without a PICO9918 falls back to the serial terminal", () => {
  const m = boot(standardCard(), { matrix: true });
  assert.equal(m.read(3) & 3, 3, "the GLCD is chosen at boot");
  m.mark = m.output.length;
  m.typeMatrix("con crt\r");
  m.expect(/A(:\S*)?>$/);
  assert.match(m.serialText(), /CON: TTY:\r\n/, "no description, the mode in effect");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [0, 0], "the field holds the mode taken, TTY:");
  assert.equal(m.symbols.get("CONACT"), undefined, "CONACT is gone");
  for (const t of ["serial terminal", "PICO9918", "reader and list"]) assert.equal(romFor().rom.includes(t), false, `no "${t}" in the ROM`);
});

test("the matrix keyboard types at the prompt", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  m.mark = m.output.length;
  m.typeMatrix("save 1 key.com\r");
  m.expect(/A(:\S*)?>$/);
  m.command("DIR");
  assert.match(m.screen().join("\n"), /KEY\.COM/);
  m.mark = m.output.length;
  m.typeMatrix("Era \"key.com\r");
  assert.match(m.expect(/A(:\S*)?>$/), /Era "key\.com/);
  assert.deepEqual(m.violations, []);
});

test("the video terminal implements its ANSI subset", async () => {
  const image = standardCard();
  volume(image, "A").write("TERM.COM", (await program("term")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.command("TERM");
  const s = m.screen();
  assert.equal(s[0], "AB");
  assert.equal(s[4], "         XR");
  assert.equal(m.cell(4, 9), 0x58);
  assert.equal(m.cell(4, 10), 0xd2, "reverse R");
  m.command("TERM S");
  const t = m.screen();
  assert.equal(t[21], "L29");
  assert.equal(t[0], "L08");
  assert.equal(t[23], "A>");
});

test("CON PICO 32 uses TMS9918 Graphics I", () => {
  const m = boot(standardCard(), { tms: true, matrix: true, width: 32 });
  assert.ok(m.screen(32).includes("A>"));
  assert.equal(m.tec1g.state.display.tms9918.stateSnapshot().registers[1], 0xc0);
});

test("the 20 x 4 LCD shows the banner and mounted drives", () => {
  const m = boot(standardCard());
  const lcd = serializeTec1gUpdateFromRuntimeState(m.tec1g.state).lcd;
  const row = (r) => String.fromCharCode(...lcd.slice(r * 20, r * 20 + 20)).trimEnd();
  assert.equal(row(0), "TEC-OS 0.1  TEC-1G");
  assert.equal(row(1), "A: SYSTEM");
  assert.equal(row(2), "B: WORK");
});

test("DIR lays out names to fit the display and reports free space", () => {
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of ["COPY.COM", "TERM.COM", "PROBE.COM", "MANUAL.TXT", "README.TXT", "X"]) a.write(n, new Uint8Array(300));
  const tms = boot(image, { tms: true, matrix: true, width: 40 });
  tms.command("DIR");
  const s = tms.screen();
  const at = s.indexOf("A>DIR");
  assert.deepEqual(s.slice(at + 1, at + 5), [
    "COPY.COM     TERM.COM     PROBE.COM",
    "MANUAL.TXT   README.TXT   X",
    "6 files, 1004K free",
    "A>",
  ]);
  const small = standardCard();
  for (const n of ["COPY.COM", "TERM.COM", "PROBE.COM", "MANUAL.TXT", "README.TXT", "X"]) volume(small, "A").write(n, new Uint8Array(300));
  const glcd = boot(small, { matrix: true });
  glcd.command("DIR *.COM");
  const g = glcd.glcdScreen();
  const from = g.indexOf("COPY.COM"); // GLCD.SVC and STARTUP.CMD are on A: too
  assert.deepEqual(g.slice(from, from + 5), ["COPY.COM", "TERM.COM", "PROBE.COM", "3 files, 1000K free", "A>"]);
  assert.match(tms.command("DIR B:"), /NO FILE/);
});

test("the GLCD is the console when no TMS9918 answers", () => {
  const m = boot(standardCard(), { matrix: true });
  // The banner and the volumes go to serial and the LCD; the CCP's first
  // startup loads GLCD.SVC, and the GLCD is the console from its next prompt.
  assert.match(m.serialText(), /TEC-OS 0\.1 for TEC-1G\r\nA: SYSTEM *\r\nB: WORK/);
  assert.equal(m.glcdScreen().find((l) => l !== ""), "A>");
  m.mark = m.output.length;
  m.typeMatrix("save 1 g.com\r");
  m.expect(/A(:\S*)?>$/);
  m.command("DIR");
  assert.ok(m.glcdScreen().includes("G.COM"));
  assert.deepEqual(m.violations, []);
});

function numberedLines(n) {
  return Array.from({ length: n }, (_, i) => `line ${String(i + 1).padStart(2, "0")}`).join("\n") + "\n";
}

test("SH11 TYPE pauses a screen at a time on the 8-row GLCD and can be stopped", () => {
  const image = withShell(standardCard(), "GLCD.SVC"); // the pager is the shell's
  volume(image, "A").write("LINES.TXT", Buffer.from(numberedLines(20)), { text: true });
  const m = boot(image, { matrix: true });
  m.runUntil(() => m.ready() && m.read(m.sym("CONMOD")) === 3, 400_000_000, "the GLCD's prompt");
  m.mark = m.output.length;
  m.type("TYPE LINES.TXT\r");
  m.expect(/\[more\]$/);
  let screen = m.glcdScreen();
  assert.equal(screen[6], "line 07");
  assert.equal(screen[7], "[more]");
  m.type(" ");
  m.expect(/\[more\]$/);
  screen = m.glcdScreen();
  assert.equal(screen[6], "line 14");
  m.type("q");
  m.expect(/A(:\S*)?>$/);
  assert.doesNotMatch(m.text(m.mark), /line 15/);
  assert.deepEqual(m.violations, []);
});

test("SH11 TYPE fills a 24-row, 40-column screen before pausing, and long lines count as wrapped", () => {
  const image = withShell(standardCard());
  const long = "x".repeat(70);
  volume(image, "A").write("WIDE.TXT", Buffer.from(`${long}\n${numberedLines(40)}`), { text: true });
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  m.mark = m.output.length;
  m.type("TYPE WIDE.TXT\r");
  m.expect(/\[more\]$/);
  const s = m.screen();
  assert.equal(s[23], "[more]");
  assert.equal(s[22], "line 21", "70 characters take two 40-column lines");
  m.type(" ");
  assert.match(m.expect(/A(:\S*)?>$/, { maxCycles: 400_000_000 }), /line 40/);
});

test("SH11 a long DIR pauses too", () => {
  const image = withShell(standardCard(), "GLCD.SVC");
  const a = volume(image, "A");
  for (let i = 0; i < 29; i += 1) a.write(`F${i}.DAT`, new Uint8Array(1)); // with SHELL.SVC, GLCD.SVC and STARTUP.CMD, 32
  const m = boot(image, { matrix: true });
  m.runUntil(() => m.ready() && m.read(m.sym("CONMOD")) === 3, 400_000_000, "the GLCD's prompt");
  m.mark = m.output.length;
  // The ROM's listing, which DIR /W gives under the shell.
  m.type("DIR /W\r");
  m.expect(/\[more\]$/);
  assert.equal(m.glcdScreen()[7], "[more]");
  let all = "";
  let pauses = 1;
  for (;;) {
    m.type(" ");
    const page = m.expect(/(\[more\]|A(:\S*)?>)$/, { maxCycles: 400_000_000 });
    all += page;
    if (/A(:\S*)?>$/.test(page)) break;
    pauses += 1;
  }
  assert.equal(pauses, 4, "31 lines at 7 lines a screen");
  assert.match(all, /32 files/);
});

test("matrix arrow keys arrive as ANSI cursor sequences", async () => {
  const image = standardCard();
  volume(image, "A").write("KEYS.COM", (await program("keys")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.mark = m.output.length;
  m.typeMatrix("keys\r");
  m.typeMatrix("\x03\x05"); // up, left
  assert.match(m.expect(/A(:\S*)?>$/), /1B 5B 41 1B 5B 44 /);
});

test("the default console is the PICO9918's 80 x 24 text mode", () => {
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of ["COPY.COM", "TERM.COM", "PROBE.COM", "MANUAL.TXT", "README.TXT", "X"]) a.write(n, new Uint8Array(300));
  a.write("WIDE.TXT", Buffer.from(`${"y".repeat(79)}Z\n${"w".repeat(85)}\n`), { text: true });
  const m = boot(image, { tms: true, matrix: true, width: 80 });
  const r = m.tec1g.state.display.tms9918.stateSnapshot().registers;
  assert.equal(r[0], 0x04, "R0: 80-column text");
  assert.equal(r[1], 0xd0, "R1: 16K VRAM, display on, text mode");
  assert.equal(r[2], 0x07, "R2: names at 1000h");
  assert.equal(m.read(m.sym("VWID")), 80);
  m.command("DIR");
  let s = m.screen();
  let at = s.indexOf("A>DIR");
  assert.equal(s[at + 1], "COPY.COM     TERM.COM     PROBE.COM    MANUAL.TXT   README.TXT   X");
  m.command("TYPE WIDE.TXT");
  s = m.screen();
  at = s.indexOf("A>TYPE WIDE.TXT");
  assert.equal(s[at + 1], `${"y".repeat(79)}Z`, "80 characters fill one line");
  assert.equal(s[at + 2], "w".repeat(80));
  assert.equal(s[at + 3], "wwwww");
  assert.equal(s[at + 5], "A>");
});

test("the video terminal inserts and deletes characters and lines", async () => {
  const image = standardCard();
  volume(image, "A").write("INSDEL.COM", (await program("insdel")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.command("INSDEL");
  const s = m.screen();
  assert.deepEqual(s.slice(0, 4), ["ABxyCDE", "", "row3", "row4"]);
  assert.deepEqual(m.violations, []);
});

test("the cursor shows while a program polls for a key, and goes with the next output", async () => {
  const image = standardCard();
  volume(image, "A").write("POLL.COM", (await program("poll")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.mark = m.output.length;
  m.typeMatrix("poll\r");
  const shown = m.sym("VCURV");
  m.runUntil(() => m.pc >= 0x0100 && m.pc < 0x0110, 100_000_000, "POLL running");
  m.runUntil(() => m.read(shown) === 1, 50_000_000, "the cursor");
  m.runUntil(() => m.waitingForInput(), 50_000_000, "the next poll");
  const row = m.read(m.sym("VROW"));
  const col = m.read(m.sym("VCOL"));
  assert.equal(m.read(m.sym("VCURV")), 1);
  assert.equal(m.cell(row, col), 0xa0, "the reverse image of a space");
  m.typeMatrix("x");
  m.expect(/A(:\S*)?>$/);
  assert.notEqual(m.cell(row, col), 0xa0, "removed before the next output");
});

test("a scroll region scrolls only its own rows", async () => {
  const image = standardCard();
  volume(image, "A").write("REGION.COM", (await program("region")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.command("REGION");
  assert.deepEqual(m.screen().slice(0, 5), ["top", "b", "c", "d", "bottom"]);
  assert.deepEqual(m.violations, []);
});

test("a row move on the PICO9918 is built out of sight and shown when the program asks for a key", async () => {
  const image = standardCard();
  volume(image, "A").write("FLIP.COM", (await program("flip")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  m.mark = m.output.length;
  m.typeMatrix("flip\r");
  m.runUntil(() => m.pc === m.sym("VTMEND"), 100_000_000, "the end of the move");
  assert.deepEqual(m.screen().slice(0, 3), ["L1", "L2", "L3"], "the shown page is untouched");
  const page = m.tmsLayout().base;
  m.runUntil(() => m.tmsLayout().base !== page, 100_000_000, "the flip");
  assert.deepEqual(m.screen().slice(0, 3), ["L2", "L3", ""], "the moved rows appear at once");
  m.expect(/A(:\S*)?>$/);
  assert.deepEqual(m.violations, []);
});

test("a second row move with no key asked between shows the first before it is built, the rows intact", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  /** Bytes through BIOS CONOUT, then BIOS CONST if asked, from a stub at 0200h. */
  const out = (text, constAfter = false) => {
    const code = [];
    for (const ch of text) code.push(0x0e, ch.charCodeAt(0), 0xcd, 0x0c, 0xbf);
    if (constAfter) code.push(0xcd, 0x06, 0xbf);
    code.push(0x18, 0xfe);
    code.forEach((v, i) => m.write(0x200 + i, v));
    const end = 0x200 + code.length - 2;
    Object.assign(m.cpu.cpu, { sp: 0x100, pc: 0x200 });
    m.runUntil(() => m.pc === end, 100_000_000, JSON.stringify(text));
  };
  out("\x1b[2J\x1b[HL1\r\nL2\r\nL3\r\nL4\r\nL5", true);
  const rows = ["L1", "L2", "L3", "L4", "L5"];
  assert.deepEqual(m.screen().slice(0, 5), rows);
  out("\x1b[3;1H\x1b[L");
  const before = m.tmsLayout().base;
  assert.deepEqual(m.screen().slice(0, 5), rows, "the first move out of sight");
  out("\x1b[1;1HX");
  out("\x1b[3;1H\x1b[L");
  assert.notEqual(m.tmsLayout().base, before, "the first move shown when the second began");
  assert.deepEqual(m.screen().slice(0, 6), ["X1", "L2", "", "L3", "L4", "L5"], "the first move, shown");
  out("", true);
  assert.deepEqual(m.screen().slice(0, 6), ["X1", "L2", "", "", "L3", "L4"], "the second at the next CONST, the rows above it copied across");
  assert.deepEqual(m.violations, []);
});

test("a GLCD board with no startup file keeps the serial console; CON UC1 with no GLCD.SVC says so on the LCD", () => {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: standardCard(), matrix: true, clock: TEST_CLOCK });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 80_000_000 });
  assert.equal(m.read(3) & 3, 0, "TTY:");
  assert.match(m.serialText(), /A(:\S*)?>$/);
  m.command("CON UC1");
  assert.equal(m.read(m.sym("CONMOD")), 0, "still the serial terminal");
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd(), "GLCD?");
});

test("UNLOAD removes the GLCD's resident and the console goes back to serial", () => {
  const stub = boot(standardCard()).read(6);
  const m = boot(standardCard(), { matrix: true });
  const word = (a) => m.read(a) | (m.read(a + 1) << 8);
  assert.equal(m.read(3) & 3, 3);
  assert.equal(word(6), word(m.sym("PZTOP")) & 0xff00, "GLCD.SVC is the resident below the BDOS");
  assert.equal(word(m.sym("VPUTV")), word(word(m.sym("GLVEC"))), "the vector is its table's");
  m.mark = m.output.length;
  m.typeMatrix("unload\r");
  m.expect(/A(:\S*)?>$/);
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [0, 0], "the field takes the mode in effect, TTY:, when serial serves it");
  assert.equal(m.read(6), stub, "its pages given back to the TPA");
  assert.equal(word(m.sym("GLVEC")), 0, "its table dropped");
  assert.deepEqual(m.violations, []);
});

test("cold boot lists each drive's whole 11-character label, its spaces too (KS38b's DRVLAB)", () => {
  const m = boot(standardCard());
  assert.match(m.serialText(), /\r\nA: SYSTEM {5}\r\nB: WORK {7}\r\n/);
});

test("SHOWVOL lists the drives without touching LINEBUF, the video terminal's buffer (KS38b's review)", () => {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: standardCard(), clock: TEST_CLOCK });
  const [showvol, lcdvols, linebuf] = ["SHOWVOL", "LCDVOLS", "LINEBUF"].map((n) => m.sym(n));
  m.runUntil(() => m.pc === showvol, 80_000_000, "SHOWVOL");
  for (let i = 0; i < 80; i += 1) m.write(linebuf + i, 0x5a);
  m.runUntil(() => m.pc === lcdvols, 20_000_000, "LCDVOLS, after it");
  assert.deepEqual(Array.from({ length: 80 }, (_, i) => m.read(linebuf + i)), new Array(80).fill(0x5a));
  assert.match(m.serialText(), /A: SYSTEM {5}\r\nB: WORK {7}\r\n/);
});

test("^C as the key that ends a ^S pause ends the program by warm boot, as CP/M 2.2 does (KE-180)", () => {
  const { m } = rig();
  const text = 0x2000;
  [...Buffer.from("x".repeat(400)), 0x24].forEach((v, i) => m.write(text + i, v));
  const cpu = m.cpu.cpu;
  m.write(0x0ffe, 0x00);
  m.write(0x0fff, 0x0f);
  Object.assign(cpu, { c: 9, d: text >> 8, e: text & 0xff, sp: 0x0ffe, pc: 0x0005 });
  m.enqueueInput("\x13\x03");
  const wboot = m.sym("RAMBIOS") + 3;
  m.runUntil(() => (m.pumpInput(), m.pc === 0x0f00 || m.pc === wboot), 200_000_000, "the end of the output");
  assert.equal(m.pending.length, 0, "both keys taken");
  assert.equal(m.pc, wboot, "the program ended by warm boot, not returned to");
});

test("console output keeps the character for its column when a program's CONOUT in the RAM jump table destroys C (KE-181)", () => {
  const r = rig();
  const { m } = r;
  const at = m.sym("RAMBIOS") + 0x0d;
  const conout = m.read(at) | (m.read(at + 1) << 8);
  [0xcd, conout & 0xff, conout >> 8, 0x0e, 0x78, 0xc9].forEach((v, i) => m.write(0x0e00 + i, v)); // CALL CONOUT, LD C,"x", RET
  m.write(at, 0x00);
  m.write(at + 1, 0x0e);
  m.mark = m.output.length;
  for (const ch of "\rAB\tX") r.bdos(2, ch.charCodeAt(0));
  assert.equal(m.text(m.mark), "\rAB      X", "the tab goes to column 8");
});
