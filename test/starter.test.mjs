// The starter card built by tools/media.mjs is also the Viewer's card:
// seventeen source/pinned files on A:, booting to the shell. BAZA builds
// BOUNCE's game, TAS builds DEMO and HELLO3 from source, and MON3.SVC loads
// HELLO3's generated image. The web host upgrades older system services.
// Emulator evidence; external programs are pinned in test/inputs.json.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_SVC, ROOT, boot, starterOn, volume, SHELL_SVC } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";
import { fontBytes } from "../tools/lib/font.mjs";
import { bounceSource } from "../tools/lib/bounce-source.mjs";
import { digitsOf, find, hello3, lcdRows, line, mon3Svc, svcMutant } from "./lib/mon3.mjs";
import { assembleProgram } from "../tools/lib/assemble.mjs";
import { buildRecipe, fileFetcher } from "../tools/tecvol.mjs";
import { needsStarter, prepareCard } from "../host/card.mjs";

const TED = pinned("TED.COM");
const TAS = pinned("TAS.COM");
const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");
const BOUNCE = pinned("BOUNCE.BAS");
const TBG = ["TBG.SVC", "TBGSYM.SVC", "TBG.HLP"].map(pinned);
const PAGE_SKIP = TED.skip || TAS.skip || BAZA.skip || RTL.skip || BOUNCE.skip || TBG.some((p) => p.skip);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const textAt = (path) => Buffer.from(readFileSync(resolve(ROOT, path), "utf8").replace(/\n/g, "\r\n") + "\x1a", "latin1");
const text = (name) => textAt(`programs/${name}`);
// The starter adapts the pinned LF
// example to the glyph service, then
// holds it as CP/M text.
const bounceText = () => Buffer.from(bounceSource(ROOT).toString("latin1").replace(/\n/g, "\r\n") + "\x1a", "latin1");

let built;
/** The starter card and its recipe, made once by tools/media.mjs. */
function starter() {
  if (!built) {
    execFileSync(process.execPath, ["tools/media.mjs"], { cwd: ROOT, stdio: "ignore" });
    built = {
      card: new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img"))),
      recipe: JSON.parse(readFileSync(resolve(ROOT, "dist/starter.recipe.json"), "utf8")),
      // A copy of the card with the themed volume LABEL on A:, as CD A:LABEL leaves it.
      on: (label) => starterOn(label, Uint8Array.from(built.card)),
    };
  }
  return built;
}

test("each A: volume holds the core set and its theme's files, each by its hash, the PICO9918's console being the ROM's", { skip: PAGE_SKIP, timeout: 300_000 }, async () => {
  check(TED);
  check(TAS);
  check(BAZA);
  check(RTL);
  check(BOUNCE);
  for (const p of TBG) check(p);
  const { card, recipe } = starter();
  const snake = await assembleProgram(resolve(ROOT, "programs/SNAKE9.ASM"), { base: 0x4000 });
  assert.equal(sha(snake.bytes), "c1fa08cc2e19f13a56b41a484a56d9c9d1876ffa2d9ec4a82cdb780b962c3c5d", "the published Snake9 binary is preserved");
  const caverns = JSON.parse(readFileSync(resolve(ROOT, "test/caverns-basic.json"), "utf8"));
  const want = {
    "STARTUP.CMD": sha(Buffer.from("SHELL.SVC\r\nGLCD.SVC\r\n\x1a", "latin1")),
    "SHELL.SVC": sha(SHELL_SVC),
    "GLCD.SVC": sha(GLCD_SVC),
    "TED.COM": sha(readFileSync(TED.path)),
    "TBG.SVC": sha(readFileSync(TBG[0].path)),
    "TBGSYM.SVC": sha(readFileSync(TBG[1].path)),
    "TBG.HLP": sha(readFileSync(TBG[2].path)),
    "TAS.COM": sha(readFileSync(TAS.path)),
    "BAZA.COM": sha(readFileSync(BAZA.path)),
    "BAZA.RTL": sha(readFileSync(RTL.path)),
    "SAMPLE.ASM": sha(text("SAMPLE.ASM")),
    "TIMES.BAS": sha(text("TIMES.BAS")),
    "BOUNCE.BAS": sha(bounceText()),
    "CAVERNS.BAS": sha(text("CAVERNS.BAS")),
    "CAVERNS.TXT": sha(text("CAVERNS.TXT")),
    "DEMO.ASM": sha(text("DEMO.ASM")),
    "MON3.SVC": sha((await mon3Svc()).file),
    "HELLO3.ASM": sha(textAt("test/programs/hello3.asm")),
    "SNAKE9.ASM": sha(text("SNAKE9.ASM")),
    "SNAKE9.BIN": sha(snake.bytes),
    // Compiled by the pinned BAZA as the card is built: the Caverns record's, and Bounce's.
    "CAVERNS.COM": caverns.comSha256,
    "BOUNCE.COM": "fa7c30104ea434e3f10c5bc0f350980f887e038d86a13f5fe8dba8ffc90d48ef",
  };
  const core = ["STARTUP.CMD", "SHELL.SVC", "GLCD.SVC", "TED.COM", "TBG.SVC", "TBGSYM.SVC", "TBG.HLP"];
  const themes = {
    SYSTEM: ["TAS.COM", "BAZA.COM", "BAZA.RTL", "MON3.SVC", "SAMPLE.ASM", "TIMES.BAS"],
    ASM: ["TAS.COM", "SAMPLE.ASM", "DEMO.ASM", "HELLO3.ASM"],
    BASIC: ["BAZA.COM", "BAZA.RTL", "TIMES.BAS", "BOUNCE.BAS", "CAVERNS.BAS", "CAVERNS.TXT"],
    MON3: ["MON3.SVC", "TAS.COM", "SNAKE9.ASM", "SNAKE9.BIN", "HELLO3.ASM"],
    GAMES: ["CAVERNS.COM", "CAVERNS.TXT", "BOUNCE.COM", "MON3.SVC", "SNAKE9.BIN"],
  };
  assert.equal(sha(bounceText()), "9d9092748d11be539c86e79ba591849191540812c4342f601ac9c1de065fc0d6", "the adapted CP/M source pin");
  assert.equal(volume(card, "A").list().length, core.length + themes.SYSTEM.length, "SYSTEM is on A:");
  const placed = [];
  for (const [label, theme] of Object.entries(themes)) {
    const v = volume(card, label);
    const names = [...core, ...theme];
    assert.deepEqual(v.list().map((f) => f.name).sort(), [...names].sort(), `${label}'s files`);
    for (const name of names) {
      const bytes = v.read(name);
      const c = recipe.components.find((x) => x.files[0].name === name && x.files[0].drive === label);
      assert.ok(c, `${name} on ${label} in the recipe`);
      assert.equal(c.id, `${label}-${name}`.toLowerCase().replace(/\W/g, "-"));
      assert.equal(sha(bytes.subarray(0, c.files[0].bytes)), want[name], `${name} on ${label}`);
      assert.equal(c.files[0].sha256, want[name], `${name} on ${label} in the recipe`);
      placed.push(c.id);
    }
  }
  assert.deepEqual(recipe.components.map((c) => c.id).sort(), placed.sort(), "the recipe places nothing else");
  assert.deepEqual(Object.keys(want).sort(), [...new Set(recipe.components.map((c) => c.name))].sort(), "every card file on some volume");
  assert.deepEqual(volume(card, "B").list(), [], "B: is empty");
  assert.equal(recipe.widths, undefined, "no drivers' widths in the recipe");
  for (const name of ["PICO.SVC", "PICO40.SVC", "PICO32.SVC"]) assert.equal(existsSync(resolve(ROOT, "dist/files", name)), false, `no ${name} in dist/files`);
});

test("the starter card boots, and CD ? lists its volumes", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const m = boot(Uint8Array.from(starter().card));
  assert.match(m.command("CD ?"), /\r\nSYSTEM +A:\r\nWORK +B:\r\nASM *\r\nBASIC *\r\nMON3 *\r\nGAMES *\r\nA:SYSTEM>$/);
  assert.deepEqual(m.violations, []);
});

/** The card as the web page makes it: from the recipe and dist/'s files. */
async function pageCard() {
  const { recipe } = starter();
  return buildRecipe(recipe, fileFetcher(resolve(ROOT, "dist")));
}

test("the web page's card is the starter card, byte for byte, its instruction naming each program and no DEMO.COM on any volume", { skip: PAGE_SKIP, timeout: 300_000 }, async () => {
  const { card, recipe } = starter();
  assert.equal(existsSync(resolve(ROOT, "dist/page.recipe.json")), false, "no second recipe");
  assert.equal(sha(await pageCard()), sha(card), "the recipe's card is dist/starter.img");
  assert.deepEqual(readdirSync(resolve(ROOT, "dist/files")).sort(), [...new Set(recipe.components.map((c) => c.name))].sort(), "dist/files holds the recipe's files");
  assert.match(recipe.instruction, /TAS DEMO then DEMO/);
  assert.match(recipe.instruction, /BOUNCE plays a game on the PICO9918/);
  assert.match(recipe.instruction, /BAZA CAVERNS and BAZA BOUNCE rebuild them/);
  assert.match(recipe.instruction, /TAS HELLO3 HELLO3\.BIN, then MON3\.SVC, LOAD HELLO3\.BIN and GO/);
  assert.match(recipe.instruction, /tap W\/A\/S\/D or the arrow keys, Q to quit/);
  assert.doesNotMatch(recipe.instruction, /CHAIN/);
  for (const label of ["SYSTEM", "ASM", "BASIC", "MON3", "GAMES"])
    assert.ok(!volume(card, label).list().some((f) => f.name === "DEMO.COM"), `no DEMO.COM on ${label}: TAS DEMO makes it`);
});

// BOUNCE.BAS, Baza's CALL demonstration, on a card as the Viewer runs it: the
// PICO9918 at 40 columns and the matrix keyboard. What it checks follows
// Baza's tools/qualify-call-demo.mjs.
function bounceRound(card) {
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  const vdp = () => m.tec1g.state.display.tms9918.stateSnapshot();
  const run = (cycles) => {
    const end = m.cycles + cycles;
    m.runUntil(() => m.cycles >= end, cycles + 1_000_000, "BOUNCE running");
  };
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), 600_000_000, what);
  };
  const text = (registers) => Array.from(registers.slice(0, 8));
  const console40 = text(vdp().registers);
  let mark = m.output.length;
  keys("baza bounce\r", "BAZA's build", () => m.ready() && /A(:\S*)?>$/.test(m.text(mark)));
  assert.match(m.text(mark), /COM written\r\n/);
  const com = Buffer.from(volume(card, "A").read("BOUNCE.COM"));
  // The adapted source's compiled length and hash, retaken from the build.
  assert.equal(com.length, 16000, "adapted BOUNCE.COM's length");
  assert.equal(sha(com), "fa7c30104ea434e3f10c5bc0f350980f887e038d86a13f5fe8dba8ffc90d48ef", "adapted BOUNCE.COM as the pinned BAZA compiles it");
  m.enqueueInput("bounce\r", "matrix");
  m.runUntil(() => (m.pumpInput(), !m.pending?.length), 50_000_000, "the command line");
  run(150_000_000);
  let s = vdp();
  assert.deepEqual(text(s.registers), [0, 0xc2, 6, 0x80, 0, 0x36, 7, 1], "Graphics I with 16 x 16 sprites");
  assert.deepEqual(Array.from(s.vram.slice(0x100, 0x400)), Array.from(fontBytes(ROOT)), "the ROM's font at 0100h, glyph by glyph through service 17");
  const title = " BAZA BASIC ON THE PICO9918 ";
  assert.equal(Buffer.from(s.vram.slice(0x1802, 0x1802 + title.length)).toString("latin1"), title, "the title in the name table");
  const attrs = (v) => Array.from(v.slice(0x1b00, 0x1b18));
  const first = attrs(s.vram);
  assert.deepEqual([2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 20].map((i) => first[i]), [0, 8, 0, 3, 0, 7, 0, 13, 4, 15, 208], "four balls, the ship and the table's end");
  assert.deepEqual([first[16], first[17]], [150, 120], "the ship at Y 150, X 120");
  const tap = (k) => {
    m.typeMatrix(k);
    run(20_000_000);
  };
  for (const k of "DDDD") tap(k);
  for (const k of "AA") tap(k);
  for (const k of "WWW") tap(k);
  tap("S");
  s = vdp();
  const moved = attrs(s.vram);
  assert.deepEqual([moved[16], moved[17]], [150 - 18 + 6, 120 + 24 - 12], "the ship after DDDD AA WWW S");
  assert.notDeepEqual(moved.slice(0, 16), first.slice(0, 16), "the balls move");
  // The arrow keys as the Viewer sends them from the PICO9918's screen: the
  // matrix's own arrow keys, which TEC-OS turns into ESC [ A, B, C or D.
  const ship = () => {
    const a = attrs(vdp().vram);
    return [a[16], a[17]];
  };
  for (const [key, name, dy, dx] of [["\x05", "left", 0, -6], ["\x06", "right", 0, 6], ["\x03", "up", -6, 0], ["\x04", "down", 6, 0]]) {
    const [y, x] = ship();
    tap(key);
    assert.deepEqual(ship(), [y + dy, x + dx], `the ship after the ${name} arrow`);
  }
  // A sequence that isn't an arrow's moves nothing, and the game goes on.
  const before = attrs(vdp().vram);
  m.typeMatrix("\x1b[Z");
  run(20_000_000);
  const after = attrs(vdp().vram);
  assert.deepEqual([after[16], after[17]], [before[16], before[17]], "the ship after ESC [ Z");
  assert.notDeepEqual(after.slice(0, 16), before.slice(0, 16), "the balls move after ESC [ Z");
  const [y, x] = ship();
  tap("\x05");
  assert.deepEqual(ship(), [y, x - 6], "the left arrow after ESC [ Z");
  mark = m.output.length;
  m.typeMatrix("Q");
  m.runUntilChecked(() => m.ready() && /A(:\S*)?>$/.test(m.text(mark)), 400_000_000, "the prompt after Q");
  assert.match(m.text(mark), /THANKS FOR PLAYING\. SCORE -?\d+ \r\n/);
  assert.deepEqual(text(vdp().registers), console40, "the console's VDP mode back");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.ok(m.screen().some((l) => /^THANKS FOR PLAYING\. SCORE/.test(l)), "on the console's screen");
  assert.deepEqual(m.violations, []);
}

test("on the card, BAZA BOUNCE compiles, BOUNCE takes Graphics I with sprites, W/A/S/D and the arrow keys move the ship, ESC [ Z moves nothing, and Q gives the display back at A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  check(BOUNCE);
  bounceRound(starter().on("BASIC"));
});

// The card holds the demo as source only: TAS DEMO makes the pinned
// 1,191-byte DEMO.COM, and DEMO runs it.
test("on the card, TAS DEMO builds DEMO.COM and DEMO runs it until a key", { skip: PAGE_SKIP, timeout: 1_800_000 }, async () => {
  const card = starter().on("ASM");
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  let mark = m.output.length;
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), 3_000_000_000, what);
  };
  keys("tas demo\r", "TAS's build", () => m.ready() && /A(:\S*)?>$/.test(m.text(mark)));
  assert.match(m.text(mark), /DEMO\.COM written/);
  const built = Buffer.from(volume(card, "A").read("DEMO.COM"));
  assert.equal(sha(built.subarray(0, 1191)), "7514c21df1dfabe11ddfa5ba94df9a40871f197e3e9b9d2e239c2b4988a9482d", "the pinned DEMO.COM");
  assert.ok(built.subarray(1191).every((b) => b === 0 || b === 0x1a), "nothing after the program but the record's padding");
  mark = m.output.length;
  keys("demo\r", "the demo's loop", () => /Press any key to stop\./.test(m.text(mark)));
  const end = m.cycles + 100_000_000;
  m.runUntil(() => m.cycles >= end, 101_000_000, "the demo running");
  assert.deepEqual(Array.from(m.tec1g.state.display.tms9918.stateSnapshot().registers.slice(0, 8)), [0, 0xc2, 6, 0x80, 0, 0x36, 7, 1], "Graphics I on the PICO9918");
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(0, 20)), "TEC-OS hardware demo", "the LCD's first row");
  m.enqueueInput(" ", "matrix");
  m.runUntilChecked(() => (m.pumpInput(), m.ready() && /Demo stopped\.\r\n[^]*A(:\S*)?>$/.test(m.text(mark))), 400_000_000, "the prompt after a key");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.deepEqual(m.violations, []);
});

const HELLO3_ROWS = ["MON-3 ON TEC-OS     ", "LCD BY RST 10H      ", "DIGITS BY RST 20H   ", "KEY BEEPS, AD QUITS "];

// HELLO3 as the card's instruction gives it, on the card as the web page runs
// it: the PICO9918 at 40 columns and the matrix keyboard, whose Esc MON-3
// takes as AD. Esc goes in as the page sends a key, held until TEC-OS's
// console has read it: the service waits for it to go up, and the line
// after MON3> must not see it.
function hello3Round(card) {
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  assert.match(m.command("TAS HELLO3 HELLO3.BIN", { maxCycles: 3_000_000_000 }), /HELLO3\.BIN written/);
  assert.ok(line(m, "MON3.SVC").mon3, "MON3.SVC gives MON3>");
  assert.match(line(m, "LOAD HELLO3.BIN").out, /MON3>$/);
  m.type("GO\r");
  m.runUntilChecked(() => lcdRows(m).join("") === HELLO3_ROWS.join(""), 50_000_000, "HELLO3's lines on the LCD");
  const digits = () => Array.from(m.tec1g.state.display.digits);
  const shown = digits();
  const end = m.cycles + 4_000_000;
  m.runUntil(() => m.cycles >= end, 5_000_000, "HELLO3 counting");
  assert.notDeepEqual(digits(), shown, "the count moves on the digits");
  const from = m.output.length;
  m.enqueueInput("\x1b", "matrix");
  const step = m.step.bind(m), lineKey = m.sym("LINKEY");
  let heldEscapes = 0;
  m.step = () => {
    if (m.pc === lineKey && m.cpu.cpu.a === 0x1b) heldEscapes++;
    return step();
  };
  try {
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && m.text(from).includes("MON3>")), 50_000_000, "MON3> after Esc");
  } finally {
    m.step = step;
  }
  assert.equal(heldEscapes, 0, "no held Escape reaches monitor line input");
  assert.match(m.text(from), /\r\nMON3>$/, "nothing after MON3>");
  assert.deepEqual(lcdRows(m), HELLO3_ROWS, "the LCD as HELLO3 left it");
  const exit = line(m, "EXIT");
  assert.equal(exit.out, "EXIT\r\r\n\r\nA:SYSTEM>", "EXIT, the first line typed, goes to A>");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.deepEqual(m.violations, []);
}

test("on the card, MON3.SVC, LOAD HELLO3.BIN and GO write HELLO3's four lines on the LCD, Esc returns to MON3> and EXIT to A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  hello3Round(starter().on("MON3"));
});

/** The service's matrix scan without its LD (KBLAST),A: TEC-OS's held-key byte left as it was. */
function noRecord(b, at) {
  const i = find(b, at("MS3"), [0x7b, 0x32, 0xef, 0xbf, 0xfe, 0x40], 16);
  b.fill(0, i + 1, i + 4);
}

// The matrix scan's record alone keeps a held Esc from the MON3> line, so this
// mutant drops it too, to show what the wait does. Observe delivery before
// buffered input can discard Escape without echoing it.
test("mutant: a MON3.SVC that doesn't wait for release or record keys delivers Esc to monitor line input", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("KEYUP"), [0x3a, 0x03, 0x00, 0x0f, 0x30], 6);
    b[i + 4] = 0x18; // JR: no wait, whatever the keys
    noRecord(b, at);
  });
  const card = starter().on("MON3");
  volume(card, "A").write("MON3.SVC", file);
  assert.throws(() => hello3Round(card), /no held Escape reaches monitor line input/);
});

// The same after CON TTY, the console the page's serial terminal gives: TEC-OS
// reads no matrix key there, so the page never lets Esc go, and the return
// must not wait for it.
function hello3OnTty(card) {
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  m.command("CON TTY");
  assert.ok(!m.videoConsole(), "the serial terminal is the console");
  assert.match(m.command("TAS HELLO3 HELLO3.BIN", { maxCycles: 3_000_000_000 }), /HELLO3\.BIN written/);
  assert.ok(line(m, "MON3.SVC").mon3, "MON3.SVC gives MON3>");
  assert.match(line(m, "LOAD HELLO3.BIN").out, /MON3>$/);
  m.type("GO\r");
  m.runUntilChecked(() => lcdRows(m).join("") === HELLO3_ROWS.join(""), 50_000_000, "HELLO3's lines on the LCD");
  const from = m.output.length;
  m.enqueueInput("\x1b", "matrix");
  m.runUntilChecked(() => (m.pumpInput(), m.waitingForInput() && m.text(from).includes("MON3>")), 20_000_000, "MON3> after Esc on TTY");
  assert.match(m.text(from), /\r\nMON3>$/, "nothing after MON3>");
  const exit = line(m, "EXIT");
  assert.equal(exit.out, "EXIT\r\r\n\r\nA:SYSTEM>", "EXIT, the first line typed, goes to A>");
  assert.deepEqual(m.violations, []);
}

test("on the card after CON TTY, Esc held as the page holds it returns to MON3> and EXIT to A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  hello3OnTty(starter().on("MON3"));
});

// The wait's own scan records the key, so the page lets it go and the wait
// ends: this mutant drops the record too, to show what the console test does.
test("mutant: a MON3.SVC that waits for the keys whatever the console, and doesn't record them, hangs after CON TTY", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("KEYUP"), [0x3a, 0x03, 0x00, 0x0f, 0x30], 6);
    b[i + 4] = 0x00; // NOP NOP: the wait on any console
    b[i + 5] = 0x00;
    noRecord(b, at);
  });
  const card = starter().on("MON3");
  volume(card, "A").write("MON3.SVC", file);
  assert.throws(() => hello3OnTty(card), /no MON3> after Esc on TTY/);
});

// A key, then Esc, on the card at 40 columns on CRT:, each held as the page
// holds a key, until TEC-OS's held-key byte shows it. While HELLO3 runs, only
// MON3.SVC's scan reads the matrix, so it must record the key there too, or
// the 1 is never let go and the Esc never comes.
function hello3KeyThenEsc(card) {
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  assert.ok(m.videoConsole(), "CRT: is the console");
  assert.match(m.command("TAS HELLO3 HELLO3.BIN", { maxCycles: 3_000_000_000 }), /HELLO3\.BIN written/);
  assert.ok(line(m, "MON3.SVC").mon3, "MON3.SVC gives MON3>");
  assert.match(line(m, "LOAD HELLO3.BIN").out, /MON3>$/);
  m.type("GO\r");
  m.runUntilChecked(() => lcdRows(m).join("") === HELLO3_ROWS.join(""), 50_000_000, "HELLO3's lines on the LCD");
  m.enqueueInput("1", "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && digitsOf(m).key === 0x01), 20_000_000, "key 1 on HELLO3's digits, and let go");
  const from = m.output.length;
  m.enqueueInput("\x1b", "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && m.text(from).includes("MON3>")), 50_000_000, "MON3> after 1 and Esc");
  assert.match(m.text(from), /\r\nMON3>$/, "nothing after MON3>");
  const exit = line(m, "EXIT");
  assert.equal(exit.out, "EXIT\r\r\n\r\nA:SYSTEM>", "EXIT, the first line typed, goes to A>");
  assert.deepEqual(m.violations, []);
}

test("on the card, a key and then Esc, held as the page holds them, reach HELLO3, which shows the key and returns to MON3>, and EXIT to A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  hello3KeyThenEsc(starter().on("MON3"));
});

test("mutant: a MON3.SVC whose matrix scan doesn't record the key leaves the 1 held, and the Esc never comes", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, noRecord);
  const card = starter().on("MON3");
  volume(card, "A").write("MON3.SVC", file);
  assert.throws(() => hello3KeyThenEsc(card), /no key 1 on HELLO3's digits, and let go/);
});

// The starter holds only the source; the card's assembler makes the image.
test("on the card, TAS HELLO3 HELLO3.BIN builds the source-only example", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const card = starter().on("ASM");
  const want = await hello3();
  const m = boot(card);
  assert.ok(!volume(card, "A").list().some((f) => f.name === "HELLO3.BIN"), "no prebuilt image");
  assert.match(m.command("TAS HELLO3 HELLO3.BIN", { maxCycles: 3_000_000_000 }), /HELLO3\.BIN written/);
  const built = Buffer.from(volume(card, "A").read("HELLO3.BIN"));
  assert.equal(sha(built.subarray(0, want.length)), sha(want), "the card's HELLO3.BIN");
  assert.ok(built.subarray(want.length).every((b) => b === 0 || b === 0x1a), "nothing after the program but the record's padding");
  assert.deepEqual(m.violations, []);
});

// At the Viewer's 40 columns, TED shows BOUNCE.BAS's lines cut at column 40
// and scrolls sideways to reach the rest. At the end of the longest line the
// view shows the 40 columns that end there, every row cut at the same place,
// and back at column 1 it starts at column 1 again. A TED that didn't scroll
// sideways would keep the first 40 columns in view and fail the check at the line's end.
test("on the card at 40 columns, TED BOUNCE.BAS scrolls sideways along its longest line and back", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  check(BOUNCE);
  const card = starter().on("BASIC");
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), 3_000_000_000, what);
  };
  const source = Buffer.from(volume(card, "A").read("BOUNCE.BAS")).toString("latin1")
    .split("\x1a", 1)[0].replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const n = source.reduce((best, l, i) => (l.length > source[best].length ? i : best), 0);
  const len = source[n].length;
  assert.ok(len > 40, "a line longer than the screen");
  const rows = 23;
  const view = () => m.screen().slice(0, rows).map((l) => l.trimEnd());
  const cut = (from, top) => source.slice(top, top + rows).map((l) => l.slice(from, from + 40).trimEnd());
  const status = () => m.screen()[rows];
  keys("ted bounce.bas\r", "TED", () => /L1 C1\b/.test(status() ?? ""));
  assert.equal(m.read(m.sym("VWID")), 40, "a 40-column console");
  assert.deepEqual(view(), cut(0, 0), "each line cut at column 40");
  const at = (col) => new RegExp(`L${n + 1} C${col}\\b`);
  // Going down to the line scrolls just far enough to bring it to the last row.
  const top = Math.max(0, n - (rows - 1));
  keys("\x1b[B".repeat(n), `line ${n + 1}`, () => at(1).test(status()));
  assert.deepEqual(view(), cut(0, top), `the rows from line ${top + 1}, cut at column 40`);
  keys("\x1b[C".repeat(len - 1), `column ${len}`, () => at(len).test(status()));
  assert.deepEqual(view(), cut(len - 40, top), `the view of columns ${len - 39} to ${len}`);
  assert.equal(view()[n - top], source[n].slice(len - 40), "the longest line's last 40 columns");
  keys("\x1b[D".repeat(len - 1), "column 1", () => at(1).test(status()));
  assert.deepEqual(view(), cut(0, top), "back to the view from column 1");
  keys("\x11", "the prompt", () => m.screen().some((l) => l.startsWith("A:SYSTEM>")));
  assert.deepEqual(m.violations, []);
});

// A card the Viewer saved before the shell landed: the starter card's files of
// that time, with no SHELL.SVC, a MON3.SVC that installs without being
// entered, and the startup line the page wrote for the PICO9918 at 40 columns.
const OLD_MON3 = JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/mon3-55f0171.json"), "utf8"));
const NOTES = Buffer.from("my own notes\r\n\x1a", "latin1");
function preShellCard(startup = "CON PICO 40\r\n") {
  const card = Uint8Array.from(starter().card);
  const a = volume(card, "A");
  a.erase("SHELL.SVC");
  a.write("MON3.SVC", Buffer.from(OLD_MON3.file, "base64"));
  a.write("STARTUP.CMD", Buffer.from(`${startup}\x1a`, "latin1"));
  a.write("NOTES.TXT", NOTES);
  a.write("SAMPLE.ASM", Buffer.from("; the user's own edit\r\n\x1a", "latin1"));
  volume(card, "B").write("WORK.TXT", NOTES);
  return card;
}
const filesOf = (card, drive) => Object.fromEntries(volume(card, drive).list().map((f) => [f.name, sha(volume(card, drive).read(f.name))]));
const startupOf = (card) => Buffer.from(volume(card, "A").read("STARTUP.CMD")).toString("latin1").split("\x1a")[0];
/** IMAGE is BEFORE byte for byte; on a difference, the first offset, never a diff of 10 MiB. */
function sameImage(image, before, what) {
  if (Buffer.compare(Buffer.from(image.buffer, image.byteOffset, image.length), Buffer.from(before.buffer, before.byteOffset, before.length)) === 0) return;
  const at = image.findIndex((b, i) => b !== before[i]);
  assert.fail(`${what}: the card differs at ${at < 0 ? `its length, ${image.length} against ${before.length}` : `${at.toString(16)}h`}`);
}
const userFiles = (card) => {
  const { "SHELL.SVC": _s, "MON3.SVC": _m, "STARTUP.CMD": _c, ...rest } = filesOf(card, "A");
  return { A: rest, B: filesOf(card, "B") };
};

test("the web host: a card saved before the shell gets the starter's SHELL.SVC and MON3.SVC, SHELL.SVC first in STARTUP.CMD, keeps the user's files, and boots with the shell", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const card = preShellCard();
  assert.equal(OLD_MON3.sha256, sha(Buffer.from(OLD_MON3.file, "base64")), "the fixture's MON3.SVC");
  const before = userFiles(card);
  const bare = boot(Uint8Array.from(card), { tms: true, matrix: true, width: 40 });
  assert.match(bare.command("SERVICES"), /SERVICES\?/, "unprepared, it boots to the ROM's own prompt");
  assert.equal(needsStarter(card), true, "the page fetches the starter card for it");
  const got = prepareCard(card, "tms", "40", starter().card);
  assert.equal(got.problem, null);
  assert.equal(got.changed, true);
  assert.equal(got.note, "This card is from before the shell: the page gave it the starter card's SHELL.SVC and MON3.SVC, and put SHELL.SVC first in STARTUP.CMD. Its other files are as they were.");
  const want = filesOf(starter().card, "A");
  const now = filesOf(card, "A");
  for (const name of ["SHELL.SVC", "MON3.SVC"]) assert.equal(now[name], want[name], `the starter's ${name}`);
  assert.equal(startupOf(card), "SHELL.SVC\r\nCON PICO 40\r\n");
  assert.deepEqual(userFiles(card), before, "every other file on A: and B: as it was");
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  assert.match(m.command("SERVICES"), /SHELL/, "the shell is in");
  assert.deepEqual(m.violations, []);
  assert.deepEqual(prepareCard(card, "tms", "40", starter().card), { problem: null, note: null, changed: false }, "once is enough");
});

test("the web host: a current card is unchanged by the starter's files, and one whose SHELL.SVC the user erased stays without it", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const card = Uint8Array.from(starter().card);
  assert.equal(needsStarter(card), false, "no starter card fetched for it");
  assert.equal(needsStarter(new Uint8Array(4096)), false, "nor for a card with no drive A");
  prepareCard(card, "tms", "40");
  const ready = card.slice();
  assert.deepEqual(prepareCard(card, "tms", "40", starter().card), { problem: null, note: null, changed: false });
  sameImage(card, ready, "byte for byte");
  volume(card, "A").erase("SHELL.SVC");
  const erased = filesOf(card, "A");
  assert.equal(prepareCard(card, "tms", "40", starter().card).note, null);
  assert.equal(volume(card, "A").find("SHELL.SVC"), undefined, "its newer MON3.SVC says it is a current card: no SHELL.SVC put back");
  assert.equal(filesOf(card, "A")["MON3.SVC"], erased["MON3.SVC"]);
  assert.equal(startupOf(card), "CON PICO 40\r\n", "the display's line alone, as for any card without the shell");
});

test("the web host: a pre-shell card's own STARTUP.CMD lines follow SHELL.SVC and the display's line and run under the shell, and a read-only one leaves the card as it was", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const card = preShellCard("GLCD.SVC\r\nTYPE NOTES.TXT\r\nDIR B: &CON");
  const prepared = prepareCard(card, "tms", "40", starter().card);
  assert.equal(prepared.changed, true);
  assert.match(prepared.note, /its later lines, which the ROM alone never ran, now run under the shell/);
  assert.equal(startupOf(card), "SHELL.SVC\r\nCON PICO 40\r\nTYPE NOTES.TXT\r\nDIR B: &CON\r\n");
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  assert.match(m.text(0), />TYPE NOTES\.TXT\r\r\nmy own notes\r\n/, "the user's TYPE ran");
  assert.match(m.text(0), />DIR B: &CON\r\r\n\r\nWORK\.TXT +\d+\r\n[\s\S]*? free on B:WORK\r\nA(:\S*)?>CON\r\n/, "and the chained line, piece by piece under the shell");
  assert.deepEqual(m.violations, []);

  const locked = preShellCard();
  volume(locked, "A").write("STARTUP.CMD", Buffer.from("CON PICO 40\r\n\x1a", "latin1"), { readOnly: true });
  const before = locked.slice();
  const got = prepareCard(locked, "tms", "40", starter().card);
  assert.equal(got.problem, null, "its display line is already right");
  assert.match(got.note, /couldn't add the shell .*STARTUP\.CMD is read-only.*boots without the shell/);
  assert.equal(got.changed, false);
  sameImage(locked, before, "no SHELL.SVC without its line: the card boots as it is");
});

test("the web host: a pre-shell card with no MON3.SVC gets SHELL.SVC alone, and only user 0's files count", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const card = preShellCard();
  volume(card, "A").erase("MON3.SVC");
  const got = prepareCard(card, "tms", "40", starter().card);
  assert.match(got.note, /starter card's SHELL\.SVC, and put/, "the note names what was written");
  assert.equal(volume(card, "A").find("MON3.SVC"), undefined, "no MON3.SVC written onto a card that had none");
  assert.equal(filesOf(card, "A")["SHELL.SVC"], filesOf(starter().card, "A")["SHELL.SVC"]);

  // Another user's SHELL.SVC and newer MON3.SVC aren't the ROM's: user 0 is upgraded, and they stay.
  const others = preShellCard();
  const a = volume(others, "A");
  const from = volume(starter().card, "A");
  a.write("SHELL.SVC", from.read("SHELL.SVC"), { user: 2 });
  a.write("MON3.SVC", from.read("MON3.SVC"), { user: 3 });
  const theirs = [sha(a.read("SHELL.SVC", { user: 2 })), sha(a.read("MON3.SVC", { user: 3 }))];
  assert.equal(needsStarter(others), true);
  assert.match(prepareCard(others, "tms", "40", starter().card).note, /SHELL\.SVC and MON3\.SVC/);
  const now = filesOf(others, "A");
  for (const name of ["SHELL.SVC", "MON3.SVC"]) assert.equal(now[name], filesOf(starter().card, "A")[name], `user 0's ${name}, the starter's`);
  assert.deepEqual([sha(a.read("SHELL.SVC", { user: 2 })), sha(a.read("MON3.SVC", { user: 3 }))], theirs, "users 2 and 3 as they were");
});

test("the web host: a pre-shell card the shell can't be added to, a read-only MON3.SVC, a full A: or a full directory, gets its display line alone and a note", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const fill = (a) => a.write("FILL.DAT", new Uint8Array(a.freeBytes()));
  const cases = [
    ["a read-only MON3.SVC", (a) => a.write("MON3.SVC", Buffer.from(OLD_MON3.file, "base64"), { readOnly: true }), /MON3\.SVC is read-only/],
    ["a full A:", fill, /disk full/],
    ["a full directory", (a) => {
      for (let i = 0; a.scan().length < a.entries; i += 1) a.write(`E${i}.DAT`, new Uint8Array());
    }, /directory full/],
  ];
  for (const [what, spoil, why] of cases) {
    const card = preShellCard("GLCD.SVC\r\nTYPE NOTES.TXT\r\n");
    spoil(volume(card, "A"));
    const mon3 = sha(volume(card, "A").read("MON3.SVC"));
    const got = prepareCard(card, "tms", "40", starter().card);
    assert.equal(got.problem, null, what);
    assert.equal(got.changed, true, `${what}: the display's line is set`);
    assert.match(got.note, /couldn't add the shell/, what);
    assert.match(got.note, why, what);
    assert.equal(startupOf(card), "CON PICO 40\r\nTYPE NOTES.TXT\r\n", `${what}: the display's line alone, as with no starter card`);
    assert.equal(volume(card, "A").find("SHELL.SVC"), undefined, `${what}: no SHELL.SVC`);
    assert.equal(sha(volume(card, "A").read("MON3.SVC")), mon3, `${what}: its own MON3.SVC`);
  }
});

test("the web host: a pre-shell card that can't show the display chosen, the GLCD with no GLCD.SVC, says so and is left as it was, starter card or not", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const card = preShellCard("GLCD.SVC\r\n");
  volume(card, "A").erase("GLCD.SVC");
  const before = card.slice();
  const got = prepareCard(card, "glcd", "40", starter().card);
  assert.match(got.problem, /no GLCD\.SVC/);
  assert.equal(got.note, null);
  assert.equal(got.changed, false);
  sameImage(card, before, "no SHELL.SVC and no display line on a card with a problem");
});
