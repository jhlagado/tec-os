// The starter card that `npm run media` builds, the one card, which the web
// page runs too: exactly fifteen files on A:, each the bytes its source or
// pin gives, and it boots to a MOUNT that lists its volumes. Its BOUNCE.BAS is
// compiled by BAZA and runs its sprites on the PICO9918, TAS builds DEMO.ASM
// into the demo, MON3.SVC loads and runs HELLO3.BIN, which writes the LCD,
// and TAS builds CHAIN.ASM, written with several statements on a line, into
// a program that runs, with TED showing its lines whole at 80 columns.
// Emulator evidence. TED.COM, TAS.COM, BAZA.COM, BAZA.RTL and BOUNCE.BAS
// are pinned inputs (test/inputs.json).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_SVC, ROOT, boot, program, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";
import { digitsOf, find, hello3, lcdRows, line, mon3Svc, svcMutant } from "./lib/mon3.mjs";
import { buildRecipe, fileFetcher } from "../tools/tecvol.mjs";

const TED = pinned("TED.COM");
const TAS = pinned("TAS.COM");
const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");
const BOUNCE = pinned("BOUNCE.BAS");
const CHAIN = pinned("CHAIN.ASM");
const PAGE_SKIP = TED.skip || TAS.skip || BAZA.skip || RTL.skip || BOUNCE.skip || CHAIN.skip;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const textAt = (path) => Buffer.from(readFileSync(resolve(ROOT, path), "utf8").replace(/\n/g, "\r\n") + "\x1a", "latin1");
const text = (name) => textAt(`programs/${name}`);
// Baza's examples/BOUNCE.BAS is LF text: the card holds it as CP/M text, as TIMES.BAS.
const bounceText = () => Buffer.from(readFileSync(BOUNCE.path, "latin1").replace(/\r?\n/g, "\r\n") + "\x1a", "latin1");
// So is Thorium's demo/chain/chain.asm.
const chainText = () => Buffer.from(readFileSync(CHAIN.path, "latin1").replace(/\r?\n/g, "\r\n") + "\x1a", "latin1");

let built;
/** The starter card and its recipe, made once by tools/media.mjs. */
function starter() {
  if (!built) {
    execFileSync(process.execPath, ["tools/media.mjs"], { cwd: ROOT, stdio: "ignore" });
    built = {
      card: new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img"))),
      recipe: JSON.parse(readFileSync(resolve(ROOT, "dist/starter.recipe.json"), "utf8")),
    };
  }
  return built;
}

test("the starter card holds exactly fifteen files, each by its hash, the PICO9918's console being the ROM's", { skip: PAGE_SKIP, timeout: 300_000 }, async () => {
  check(TED);
  check(TAS);
  check(BAZA);
  check(RTL);
  check(BOUNCE);
  check(CHAIN);
  const { card, recipe } = starter();
  const want = {
    "STARTUP.CMD": Buffer.from("GLCD.SVC\r\n\x1a", "latin1"),
    "GLCD.SVC": GLCD_SVC,
    "MOUNT.COM": (await program("mount")).bytes,
    "TAS.COM": readFileSync(TAS.path),
    "TED.COM": readFileSync(TED.path),
    "BAZA.COM": readFileSync(BAZA.path),
    "BAZA.RTL": readFileSync(RTL.path),
    "SAMPLE.ASM": text("SAMPLE.ASM"),
    "TIMES.BAS": text("TIMES.BAS"),
    "BOUNCE.BAS": bounceText(),
    "DEMO.ASM": text("DEMO.ASM"),
    "MON3.SVC": (await mon3Svc()).file,
    "HELLO3.ASM": textAt("test/programs/hello3.asm"),
    "HELLO3.BIN": await hello3(),
    "CHAIN.ASM": chainText(),
  };
  const a = volume(card, "A");
  assert.deepEqual(a.list().map((f) => f.name).sort(), Object.keys(want).sort());
  assert.deepEqual(recipe.components.map((c) => c.name).sort(), Object.keys(want).sort());
  for (const [name, bytes] of Object.entries(want)) {
    assert.equal(sha(a.read(name).subarray(0, bytes.length)), sha(bytes), `${name} on the card`);
    assert.equal(recipe.components.find((c) => c.name === name).files[0].sha256, sha(bytes), `${name} in the recipe`);
  }
  assert.deepEqual(volume(card, "B").list(), [], "B: is empty");
  assert.equal(recipe.widths, undefined, "no drivers' widths in the recipe");
  for (const name of ["PICO.SVC", "PICO40.SVC", "PICO32.SVC"]) assert.equal(existsSync(resolve(ROOT, "dist/files", name)), false, `no ${name} in dist/files`);
});

test("the starter card boots, and MOUNT lists its volumes", { skip: PAGE_SKIP, timeout: 300_000 }, () => {
  const m = boot(Uint8Array.from(starter().card));
  assert.match(m.command("MOUNT"), /^00 SYSTEM +G1M A:\r\n01 WORK +G8M B:\r\n/m);
  assert.deepEqual(m.violations, []);
});

/** The card as the web page makes it: from the recipe and dist/'s files. */
async function pageCard() {
  const { recipe } = starter();
  return buildRecipe(recipe, fileFetcher(resolve(ROOT, "dist")));
}

test("the web page's card is the starter card, byte for byte, its instruction naming each program and no DEMO.COM on it", { skip: PAGE_SKIP, timeout: 300_000 }, async () => {
  const { card, recipe } = starter();
  assert.equal(existsSync(resolve(ROOT, "dist/page.recipe.json")), false, "no second recipe");
  assert.equal(sha(await pageCard()), sha(card), "the recipe's card is dist/starter.img");
  assert.deepEqual(readdirSync(resolve(ROOT, "dist/files")).sort(), recipe.components.map((c) => c.name).sort(), "dist/files holds the recipe's files");
  assert.match(recipe.instruction, /TAS DEMO then DEMO/);
  assert.match(recipe.instruction, /BAZA BOUNCE then BOUNCE for a game on the PICO9918/);
  assert.match(recipe.instruction, /MON3\.SVC \/E, then LOAD HELLO3\.BIN and GO/);
  assert.match(recipe.instruction, /TAS CHAIN then CHAIN runs a program written with several statements on a line/);
  assert.match(recipe.instruction, /TED CHAIN\.ASM at 80 columns \(CON PICO 80, or 80 in the width selector\)/);
  assert.ok(!volume(card, "A").list().some((f) => f.name === "DEMO.COM"), "no DEMO.COM: TAS DEMO makes it");
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
  keys("baza bounce\r", "BAZA's build", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /COM written\r\n/);
  m.enqueueInput("bounce\r", "matrix");
  m.runUntil(() => (m.pumpInput(), !m.pending?.length), 50_000_000, "the command line");
  run(150_000_000);
  let s = vdp();
  assert.deepEqual(text(s.registers), [0, 0xc2, 6, 0x80, 0, 0x36, 7, 1], "Graphics I with 16 x 16 sprites");
  const font = m.sym("FONT");
  assert.deepEqual(Array.from(s.vram.slice(0x100, 0x400)), Array.from({ length: 768 }, (_, i) => m.read(font + i)), 'the ROM\'s font at 0100h, found by reg("HL")');
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
  mark = m.output.length;
  m.typeMatrix("Q");
  m.runUntilChecked(() => m.ready() && /A>$/.test(m.text(mark)), 400_000_000, "the prompt after Q");
  assert.match(m.text(mark), /THANKS FOR PLAYING\. SCORE -?\d+ \r\n/);
  assert.deepEqual(text(vdp().registers), console40, "the console's VDP mode back");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.ok(m.screen().some((l) => /^THANKS FOR PLAYING\. SCORE/.test(l)), "on the console's screen");
  assert.deepEqual(m.violations, []);
}

test("on the card, BAZA BOUNCE compiles, BOUNCE takes Graphics I with sprites, W/A/S/D move the ship, and Q gives the display back at A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  check(BOUNCE);
  bounceRound(Uint8Array.from(starter().card));
});

// The card holds the demo as source only: TAS DEMO makes the pinned
// 1,191-byte DEMO.COM, and DEMO runs it.
test("on the card, TAS DEMO builds DEMO.COM and DEMO runs it until a key", { skip: PAGE_SKIP, timeout: 1_800_000 }, async () => {
  const card = Uint8Array.from(starter().card);
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  let mark = m.output.length;
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), 3_000_000_000, what);
  };
  keys("tas demo\r", "TAS's build", () => m.ready() && /A>$/.test(m.text(mark)));
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
  m.runUntilChecked(() => (m.pumpInput(), m.ready() && /Demo stopped\.\r\n[^]*A>$/.test(m.text(mark))), 400_000_000, "the prompt after a key");
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
  assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E gives MON3>");
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
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && m.text(from).includes("MON3>")), 50_000_000, "MON3> after Esc");
  assert.match(m.text(from), /\r\nMON3>$/, "nothing after MON3>");
  assert.deepEqual(lcdRows(m), HELLO3_ROWS, "the LCD as HELLO3 left it");
  const exit = line(m, "EXIT");
  assert.equal(exit.out, "EXIT\r\r\n\r\nA>", "EXIT, the first line typed, goes to A>");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.deepEqual(m.violations, []);
}

test("on the card, MON3.SVC /E, LOAD HELLO3.BIN and GO write HELLO3's four lines on the LCD, Esc returns to MON3> and EXIT to A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  hello3Round(Uint8Array.from(starter().card));
});

/** The service's matrix scan without its LD (KBLAST),A: TEC-OS's held-key byte left as it was. */
function noRecord(b, at) {
  const i = find(b, at("MS3"), [0x7b, 0x32, 0xef, 0xbf, 0xfe, 0x40], 16);
  b.fill(0, i + 1, i + 4);
}

// The matrix scan's record alone keeps a held Esc from the MON3> line, so this
// mutant drops it too, to show what the wait does.
test("mutant: a MON3.SVC that doesn't wait for the keys to go up, nor record them, lets Esc reach the line after MON3>", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("KEYUP"), [0x3a, 0x8a, 0x08, 0xb7, 0x20], 16);
    b[i + 4] = 0x18; // JR: up, whatever the keys
    noRecord(b, at);
  });
  const card = Uint8Array.from(starter().card);
  volume(card, "A").write("MON3.SVC", file);
  assert.throws(() => hello3Round(card), /nothing after MON3>/);
});

// The same after CON TTY, the console the page's serial terminal gives: TEC-OS
// reads no matrix key there, so the page never lets Esc go, and the return
// must not wait for it.
function hello3OnTty(card) {
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  m.command("CON TTY");
  assert.ok(!m.videoConsole(), "the serial terminal is the console");
  assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E gives MON3>");
  assert.match(line(m, "LOAD HELLO3.BIN").out, /MON3>$/);
  m.type("GO\r");
  m.runUntilChecked(() => lcdRows(m).join("") === HELLO3_ROWS.join(""), 50_000_000, "HELLO3's lines on the LCD");
  const from = m.output.length;
  m.enqueueInput("\x1b", "matrix");
  m.runUntilChecked(() => (m.pumpInput(), m.waitingForInput() && m.text(from).includes("MON3>")), 20_000_000, "MON3> after Esc on TTY");
  assert.match(m.text(from), /\r\nMON3>$/, "nothing after MON3>");
  const exit = line(m, "EXIT");
  assert.equal(exit.out, "EXIT\r\r\n\r\nA>", "EXIT, the first line typed, goes to A>");
  assert.deepEqual(m.violations, []);
}

test("on the card after CON TTY, Esc held as the page holds it returns to MON3> and EXIT to A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  hello3OnTty(Uint8Array.from(starter().card));
});

// The wait's own scan records the key, so the page lets it go and the wait
// ends: this mutant drops the record too, to show what the console test does.
test("mutant: a MON3.SVC that waits for the keys whatever the console, and doesn't record them, hangs after CON TTY", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("KEYUP") - 6, [0x3a, 0x03, 0x00, 0x0f, 0x30], 6);
    b[i + 4] = 0x00; // NOP NOP: the wait on any console
    b[i + 5] = 0x00;
    noRecord(b, at);
  });
  const card = Uint8Array.from(starter().card);
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
  assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E gives MON3>");
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
  assert.equal(exit.out, "EXIT\r\r\n\r\nA>", "EXIT, the first line typed, goes to A>");
  assert.deepEqual(m.violations, []);
}

test("on the card, a key and then Esc, held as the page holds them, reach HELLO3, which shows the key and returns to MON3>, and EXIT to A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  hello3KeyThenEsc(Uint8Array.from(starter().card));
});

test("mutant: a MON3.SVC whose matrix scan doesn't record the key leaves the 1 held, and the Esc never comes", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, noRecord);
  const card = Uint8Array.from(starter().card);
  volume(card, "A").write("MON3.SVC", file);
  assert.throws(() => hello3KeyThenEsc(card), /no key 1 on HELLO3's digits, and let go/);
});

// The card's HELLO3.ASM builds on the card into the HELLO3.BIN beside it.
test("on the card, TAS HELLO3 HELLO3.BIN rebuilds HELLO3.BIN as it is", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  const card = Uint8Array.from(starter().card);
  const want = await hello3();
  const m = boot(card);
  m.command("ERA HELLO3.BIN");
  assert.match(m.command("TAS HELLO3 HELLO3.BIN", { maxCycles: 3_000_000_000 }), /HELLO3\.BIN written/);
  const built = Buffer.from(volume(card, "A").read("HELLO3.BIN"));
  assert.equal(sha(built.subarray(0, want.length)), sha(want), "the card's HELLO3.BIN");
  assert.ok(built.subarray(want.length).every((b) => b === 0 || b === 0x1a), "nothing after the program but the record's padding");
  assert.deepEqual(m.violations, []);
});

// CHAIN.ASM on the card, on the PICO9918 with the matrix keyboard, after the
// instruction's CON PICO 80: TAS CHAIN makes Thorium's 43-byte demonstration
// image, the one its statements give one to a line, CHAIN prints LINE 1 to
// LINE 5, and TED shows each of its lines whole.
test("on the card after CON PICO 80, TAS CHAIN builds CHAIN.COM, CHAIN prints LINE 1 to LINE 5, and TED CHAIN.ASM shows every line whole", { skip: PAGE_SKIP, timeout: 1_800_000 }, () => {
  const card = Uint8Array.from(starter().card);
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), 3_000_000_000, what);
  };
  keys("con pico 80\r", "CON PICO 80", () => m.ready() && m.read(m.sym("VWID")) === 80);
  let mark = m.output.length;
  keys("tas chain\r", "TAS's build", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /CHAIN\.COM written/);
  const built = Buffer.from(volume(card, "A").read("CHAIN.COM"));
  assert.equal(sha(built.subarray(0, 43)), "9af074cd7f1db991184a306ae9974b393ba6dc66c9b53a08a7f6f59cb3865422", "Thorium's CHAIN image");
  assert.ok(built.subarray(43).every((b) => b === 0 || b === 0x1a), "nothing after the program but the record's padding");
  mark = m.output.length;
  keys("chain\r", "CHAIN", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /^chain\r\r?\nLINE 1\r\nLINE 2\r\nLINE 3\r\nLINE 4\r\nLINE 5\r\n\r?\n?A>$/i);
  const source = readFileSync(CHAIN.path, "latin1").replace(/\n$/, "").split("\n");
  keys("ted chain.asm\r", "TED", () => m.screen()[0].startsWith("; CHAIN:") && /CHAIN/.test(m.screen()[23]));
  assert.deepEqual([m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], [80, 24], "an 80-column console");
  assert.deepEqual(m.screen().slice(0, source.length).map((l) => l.trimEnd()), source, "each line whole");
  keys("\x11", "the prompt", () => m.screen().some((l) => l.startsWith("A>")));
  assert.deepEqual(m.violations, []);
});

// At the Viewer's 40 columns, TED shows CHAIN.ASM's lines cut at column 40
// and scrolls sideways to reach the rest: at line 10, column 63, the view
// shows columns 24 to 63, and back at column 1 it starts at column 1 again.
test("on the card at 40 columns, TED CHAIN.ASM scrolls sideways along a long line and back", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  const card = Uint8Array.from(starter().card);
  const m = boot(card, { tms: true, matrix: true, width: 40 });
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), 3_000_000_000, what);
  };
  const source = readFileSync(CHAIN.path, "latin1").replace(/\n$/, "").split("\n");
  const view = () => m.screen().slice(0, source.length).map((l) => l.trimEnd());
  const cut = (from) => source.map((l) => l.slice(from, from + 40).trimEnd());
  keys("ted chain.asm\r", "TED", () => m.screen()[0].startsWith("; CHAIN:") && /L1 C1\b/.test(m.screen()[23]));
  assert.equal(m.read(m.sym("VWID")), 40, "a 40-column console");
  assert.deepEqual(view(), cut(0), "each line cut at column 40");
  keys("\x1b[B".repeat(9), "line 10", () => /L10 C1\b/.test(m.screen()[23]));
  keys("\x1b[C".repeat(62), "column 63", () => /L10 C63\b/.test(m.screen()[23]));
  assert.deepEqual(view(), cut(23), "the view of columns 24 to 63");
  assert.match(m.screen()[9], /; count five lines, numbered fr$/, "line 10's comment in view");
  keys("\x1b[D".repeat(62), "column 1", () => /L10 C1\b/.test(m.screen()[23]));
  assert.deepEqual(view(), cut(0), "back to the view from column 1");
  keys("\x11", "the prompt", () => m.screen().some((l) => l.startsWith("A>")));
  assert.deepEqual(m.violations, []);
});
