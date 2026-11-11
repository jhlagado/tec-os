// The starter card that `npm run media` builds: exactly ten files on A:, each
// the bytes its source or pin gives, the page's width drivers pinned in its
// recipe, and it boots to a MOUNT that lists its volumes. Its BOUNCE.BAS is
// compiled by BAZA and runs its sprites on the PICO9918. The page's card adds
// DEMO.ASM, which TAS builds into the demo. Emulator evidence. TED.COM, TAS.COM, BAZA.COM, BAZA.RTL and
// BOUNCE.BAS are pinned inputs (test/inputs.json).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_SVC, ROOT, boot, program, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";
import { buildRecipe, fileFetcher } from "../tools/tecvol.mjs";

const TED = pinned("TED.COM");
const TAS = pinned("TAS.COM");
const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");
const BOUNCE = pinned("BOUNCE.BAS");
const PAGE_SKIP = TED.skip || TAS.skip || BAZA.skip || RTL.skip || BOUNCE.skip;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const text = (name) => Buffer.from(readFileSync(resolve(ROOT, "programs", name), "utf8").replace(/\n/g, "\r\n") + "\x1a", "latin1");
// Baza's examples/BOUNCE.BAS is LF text: the card holds it as CP/M text, as TIMES.BAS.
const bounceText = () => Buffer.from(readFileSync(BOUNCE.path, "latin1").replace(/\r?\n/g, "\r\n") + "\x1a", "latin1");

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

test("the starter card holds exactly ten files, each by its hash, the PICO9918's console being the ROM's (KS39)", { skip: PAGE_SKIP, timeout: 300_000 }, async () => {
  check(TED);
  check(TAS);
  check(BAZA);
  check(RTL);
  check(BOUNCE);
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

/** The page's card, built from its recipe and dist/'s files. */
async function pageCard() {
  starter();
  const page = JSON.parse(readFileSync(resolve(ROOT, "dist/page.recipe.json"), "utf8"));
  return { page, card: await buildRecipe(page, fileFetcher(resolve(ROOT, "dist"))) };
}

test("the web page's card is the starter with DEMO.ASM, which the starter lacks, and no DEMO.COM", { skip: PAGE_SKIP, timeout: 300_000 }, async () => {
  check(BOUNCE);
  const { card, recipe } = starter();
  const { page, card: pc } = await pageCard();
  const bounce = bounceText();
  const names = (r) => r.components.map((c) => c.name).sort();
  assert.deepEqual(names(page), [...names(recipe), "DEMO.ASM"].sort());
  assert.ok(names(recipe).includes("BOUNCE.BAS"), "BOUNCE.BAS on the starter");
  assert.equal(page.components.find((c) => c.name === "BOUNCE.BAS").files[0].sha256, sha(bounce));
  const demoSource = Buffer.from(readFileSync(resolve(ROOT, "programs/DEMO.ASM"), "utf8").replace(/\n/g, "\r\n") + "\x1a", "latin1");
  assert.equal(page.components.find((c) => c.name === "DEMO.ASM").files[0].sha256, sha(demoSource));
  assert.match(page.instruction, /TAS DEMO then DEMO/);
  assert.match(page.instruction, /BAZA BOUNCE then BOUNCE for a game on the PICO9918/);
  assert.match(recipe.instruction, /BAZA BOUNCE then BOUNCE for a game on the PICO9918/);
  for (const name of ["DEMO.COM", "DEMO.ASM"]) assert.equal(volume(card, "A").list().some((f) => f.name === name), false, `${name} not on the starter`);
  const onPage = volume(pc, "A");
  assert.ok(!onPage.list().some((f) => f.name === "DEMO.COM"), "no DEMO.COM: TAS DEMO makes it");
  assert.equal(sha(onPage.read("BOUNCE.BAS").subarray(0, bounce.length)), sha(bounce), "BOUNCE.BAS on the page's card");
  assert.equal(sha(onPage.read("DEMO.ASM").subarray(0, demoSource.length)), sha(demoSource), "DEMO.ASM on the page's card");
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

test("on the starter card, BAZA BOUNCE compiles, BOUNCE takes Graphics I with sprites, W/A/S/D move the ship, and Q gives the display back at A>", { skip: PAGE_SKIP, timeout: 900_000 }, () => {
  check(BOUNCE);
  bounceRound(Uint8Array.from(starter().card));
});

test("on the page's card, BAZA BOUNCE compiles, BOUNCE takes Graphics I with sprites, W/A/S/D move the ship, and Q gives the display back at A>", { skip: PAGE_SKIP, timeout: 900_000 }, async () => {
  check(BOUNCE);
  bounceRound((await pageCard()).card);
});

// The page's card holds the demo as source only: TAS DEMO makes the pinned
// 1,191-byte DEMO.COM, and DEMO runs it.
test("on the page's card, TAS DEMO builds DEMO.COM and DEMO runs it until a key", { skip: PAGE_SKIP, timeout: 1_800_000 }, async () => {
  const { card } = await pageCard();
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
