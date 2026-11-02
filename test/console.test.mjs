// Console devices on the Debug80 TEC-1G model: TMS9918 screen, matrix
// keyboard and serial together. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { Machine } from "./lib/machine.mjs";
import { GLCD_SVC, TEST_CLOCK, boot, program, romFor, standardCard, volume } from "./lib/fixtures.mjs";

test("with PICO.SVC in the startup file, the banner goes to serial, and the screen is the console from its take", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  const screen = m.screen();
  const at = screen.indexOf("A>");
  assert.ok(at >= 0, "the prompt on the screen");
  assert.equal(m.cell(at, 2), 0xa0, "cursor is the reverse image of a space");
  assert.match(m.bootText, /A: SYSTEM/);
  const serial = m.serialText();
  assert.match(serial, /TEC-OS 0\.1 for TEC-1G\r\nA: SYSTEM *\r\nB: WORK *\r\n\r\nA>PICO\.SVC\r\r\n$/, "up to the take");
  m.command("DIR");
  assert.equal(m.serialText(), serial, "and nothing goes to the serial port after it");
  assert.equal(m.read(3) & 3, 1, "IOBYTE CON: is CRT:");
});

test("without the matrix keyboard the serial terminal is the console, even with a display", () => {
  const m = boot(standardCard(), { tms: true });
  assert.match(m.serialText(), /B: WORK *\r\n\r\nA>$/);
  assert.equal(m.read(3) & 3, 0, "IOBYTE CON: is TTY:");
  assert.equal(m.read(m.sym("VWID")), 0, "no screen geometry");
  assert.ok(m.screen().every((line) => line === ""), "the PICO9918 stays blank");
});

test("CON switches the console between devices and falls back to serial", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC); // CON UC1: loads the GLCD's resident
  const m = boot(image, { tms: true, matrix: true });
  assert.match(m.command("CON"), /CON: CRT: PICO9918/);
  m.mark = m.output.length;
  m.typeMatrix("con uc1:\r");
  m.expect(/A>$/);
  assert.equal(m.read(3) & 3, 3);
  assert.deepEqual(m.glcdScreen().slice(0, 3), ["CON: UC1: GLCD", "A>", ""]);
  m.mark = m.output.length;
  m.typeMatrix("con tty\r");
  assert.match(m.expect(/A>$/), /CON: TTY: serial terminal/);
  assert.match(m.serialText(), /CON: TTY: serial terminal\r\nA>$/);
  m.command("CON CRT");
  assert.ok(m.screen().some((line) => line === "CON: CRT: PICO9918"));
  assert.match(m.command("CON XYZ"), /\r\nXYZ\?/);
  assert.deepEqual(m.violations, []);
});

test("CRT: without a PICO9918 falls back to the serial terminal", () => {
  const m = boot(standardCard(), { matrix: true });
  assert.equal(m.read(3) & 3, 3, "the GLCD is chosen at boot");
  m.mark = m.output.length;
  m.typeMatrix("con crt\r");
  m.expect(/A>$/);
  assert.match(m.serialText(), /CON: TTY: serial terminal/);
});

test("the matrix keyboard types at the prompt", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  m.mark = m.output.length;
  m.typeMatrix("save 1 key.com\r");
  m.expect(/A>$/);
  m.command("DIR");
  assert.match(m.screen().join("\n"), /KEY\.COM/);
  m.mark = m.output.length;
  m.typeMatrix("Era \"key.com\r");
  assert.match(m.expect(/A>$/), /Era "key\.com/);
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

test("PICO32.SVC uses TMS9918 Graphics I", () => {
  const m = boot(standardCard(), { tms: true, matrix: true, profile: "debug80g32" });
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
  const tms = boot(image, { tms: true, matrix: true, profile: "debug80t40" });
  tms.command("DIR");
  const s = tms.screen();
  const at = s.indexOf("A>DIR");
  assert.deepEqual(s.slice(at + 1, at + 5), [
    "COPY.COM     TERM.COM     PROBE.COM",
    "MANUAL.TXT   README.TXT   X",
    "PICO40.SVC   STARTUP.CMD",
    "8 files, 1000K free",
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
  m.expect(/A>$/);
  m.command("DIR");
  assert.ok(m.glcdScreen().includes("G.COM"));
  assert.deepEqual(m.violations, []);
});

function numberedLines(n) {
  return Array.from({ length: n }, (_, i) => `line ${String(i + 1).padStart(2, "0")}`).join("\n") + "\n";
}

test("TYPE pauses a screen at a time on the 8-row GLCD and can be stopped", () => {
  const image = standardCard();
  volume(image, "A").write("LINES.TXT", Buffer.from(numberedLines(20)), { text: true });
  const m = boot(image, { matrix: true });
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
  m.expect(/A>$/);
  assert.doesNotMatch(m.text(m.mark), /line 15/);
  assert.deepEqual(m.violations, []);
});

test("TYPE fills a 24-row, 40-column screen before pausing, and long lines count as wrapped", () => {
  const image = standardCard();
  const long = "x".repeat(70);
  volume(image, "A").write("WIDE.TXT", Buffer.from(`${long}\n${numberedLines(40)}`), { text: true });
  const m = boot(image, { tms: true, matrix: true, profile: "debug80t40" });
  m.mark = m.output.length;
  m.type("TYPE WIDE.TXT\r");
  m.expect(/\[more\]$/);
  const s = m.screen();
  assert.equal(s[23], "[more]");
  assert.equal(s[22], "line 21", "70 characters take two 40-column lines");
  m.type(" ");
  assert.match(m.expect(/A>$/, { maxCycles: 400_000_000 }), /line 40/);
});

test("a long DIR pauses too", () => {
  const image = standardCard();
  const a = volume(image, "A");
  for (let i = 0; i < 30; i += 1) a.write(`F${i}.DAT`, new Uint8Array(1));
  const m = boot(image, { matrix: true });
  m.mark = m.output.length;
  m.type("DIR\r");
  m.expect(/\[more\]$/);
  assert.equal(m.glcdScreen()[7], "[more]");
  let all = "";
  let pauses = 1;
  for (;;) {
    m.type(" ");
    const page = m.expect(/(\[more\]|A>)$/, { maxCycles: 400_000_000 });
    all += page;
    if (page.endsWith("A>")) break;
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
  assert.match(m.expect(/A>$/), /1B 5B 41 1B 5B 44 /);
});

test("the default console is the PICO9918's 80 x 24 text mode", () => {
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of ["COPY.COM", "TERM.COM", "PROBE.COM", "MANUAL.TXT", "README.TXT", "X"]) a.write(n, new Uint8Array(300));
  a.write("WIDE.TXT", Buffer.from(`${"y".repeat(79)}Z\n${"w".repeat(85)}\n`), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const r = m.tec1g.state.display.tms9918.stateSnapshot().registers;
  assert.equal(r[0], 0x04, "R0: 80-column text");
  assert.equal(r[1], 0x50, "R1: display on, text mode");
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
  m.expect(/A>$/);
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
  m.expect(/A>$/);
  assert.deepEqual(m.violations, []);
});

test("a GLCD board with no startup file keeps the serial console; CON UC1 with no GLCD.SVC says so on the LCD", () => {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: standardCard(), matrix: true, clock: TEST_CLOCK });
  m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  assert.equal(m.read(3) & 3, 0, "TTY:");
  assert.match(m.serialText(), /A>$/);
  m.command("CON UC1");
  assert.equal(m.read(m.sym("CONMOD")), 0, "still the serial terminal");
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd(), "GLCD?");
});

test("UNLOAD removes the GLCD's resident and the console goes back to serial", () => {
  const stub = boot(standardCard()).read(6);
  const m = boot(standardCard(), { matrix: true });
  const word = (a) => m.read(a) | (m.read(a + 1) << 8);
  assert.equal(m.read(3) & 3, 3);
  assert.equal(word(6), (word(m.sym("PZTOP")) & 0xff00) + 6, "GLCD.SVC is the resident below the BDOS");
  assert.equal(word(m.sym("VPUTV")), word(word(m.sym("GLVEC"))), "the vector is its table's");
  m.mark = m.output.length;
  m.typeMatrix("unload\r");
  m.expect(/A>$/);
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [3, 0], "IOBYTE stays UC1:, served by serial");
  assert.equal(m.read(6), stub, "its pages given back to the TPA");
  assert.equal(word(m.sym("GLVEC")), 0, "its table dropped");
  assert.deepEqual(m.violations, []);
});
