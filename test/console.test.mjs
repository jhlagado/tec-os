// Console devices on the Debug80 TEC-1G model: TMS9918 screen, matrix
// keyboard and serial together. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { boot, program, standardCard, volume } from "./lib/fixtures.mjs";

test("with a TMS9918 the session appears on screen and on serial", () => {
  const m = boot(standardCard(), { tms: true });
  const screen = m.screen();
  assert.equal(screen[1], "TEC-OS 0.1 for TEC-1G");
  assert.equal(screen[2], "A: SYSTEM");
  assert.equal(screen[5], "A>");
  assert.equal(m.cell(5, 2), 0xa0, "cursor is the reverse image of a space");
  assert.match(m.bootText, /A: SYSTEM/);
});

test("the matrix keyboard and serial both type at the prompt", () => {
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
  const m = boot(image, { tms: true });
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

test("the 32-column profile uses TMS9918 Graphics I", () => {
  const m = boot(standardCard(), { tms: true, profile: "debug80g32" });
  const s = m.screen(32);
  assert.equal(s[1], "TEC-OS 0.1 for TEC-1G");
  assert.equal(s[5], "A>");
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
  for (const n of ["COPY.COM", "TERM.COM", "PROBE.COM", "NATDEMO.TNX", "README.TXT", "X"]) a.write(n, new Uint8Array(300));
  const tms = boot(image, { tms: true });
  tms.command("DIR");
  const s = tms.screen();
  const at = s.indexOf("A>DIR");
  assert.deepEqual(s.slice(at + 1, at + 5), [
    "COPY.COM     TERM.COM     PROBE.COM",
    "NATDEMO.TNX  README.TXT   X",
    "6 files, 1004K free",
    "A>",
  ]);
  const glcd = boot(image);
  glcd.command("DIR *.COM");
  assert.deepEqual(glcd.glcdScreen().slice(-5), ["COPY.COM", "TERM.COM", "PROBE.COM", "3 files, 1004K free", "A>"]);
  assert.match(tms.command("DIR B:"), /NO FILE/);
});

test("the GLCD is the console when no TMS9918 answers", () => {
  const m = boot(standardCard(), { matrix: true });
  assert.deepEqual(m.glcdScreen().slice(0, 6), ["", "TEC-OS 0.1 for TEC-1G", "A: SYSTEM", "B: WORK", "", "A>"]);
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
  const m = boot(image);
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

test("TYPE fills a 24-row TMS9918 screen before pausing, and long lines count as wrapped", () => {
  const image = standardCard();
  const long = "x".repeat(70);
  volume(image, "A").write("WIDE.TXT", Buffer.from(`${long}\n${numberedLines(40)}`), { text: true });
  const m = boot(image, { tms: true });
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
  const m = boot(image);
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
  assert.match(all, /30 files/);
});
