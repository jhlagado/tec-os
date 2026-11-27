// tools/capture.mjs, the book's capture tool: "@press X" sends a key with no
// wait for a prompt (KB-25), so a line can be built a key at a time, and
// "@fn D" and "@arrow KEYS" press the matrix's Fn chords and arrow keys.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, program, standardCard, volume } from "./lib/fixtures.mjs";

test("capture follows named prompts after a drive change and CD A:, then GAMES's own startup after reset", () => {
  const out = execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--", "B:", "A:", "CD A:GAMES", "@reset"], { encoding: "utf8", timeout: 120_000 });
  assert.match(out, /B:WORK>A:/);
  assert.match(out, /A:GAMES>\n/);
  assert.match(out, /A: GAMES *\n[^]*A:GAMES>SHELL\.SVC\n[^]*A:GAMES>\n$/, "the reset keeps GAMES on A:, whose STARTUP.CMD loads the shell");
});

test("@press sends a key and goes on without a prompt: D, I, R, then Return run DIR (KB-25)", () => {
  const dir = mkdtempSync(resolve(ROOT, "build/capture-"));
  const card = resolve(dir, "card.img");
  writeFileSync(card, standardCard());
  const out = execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--rom", resolve(ROOT, "build/tecos/tecos.rom"), "--card", card, "--", "@press D", "@press I", "@press R", "^M"], { encoding: "utf8" });
  rmSync(dir, { recursive: true });
  assert.match(out, /A(:\S*)?>DIR\n/, "the three keys made one line");
  assert.match(out, /A(:\S*)?>DIR\nNO FILE\nA(:\S*)?>/, "and Return ran it, on an empty card");
  assert.doesNotMatch(out, /@PRESS/i);
});

test("@fn and @arrow press the matrix's Fn chords and arrow keys: F1 and Left reach a program, Up recalls a line", async () => {
  const dir = mkdtempSync(resolve(ROOT, "build/capture-"));
  const card = resolve(dir, "card.img");
  const image = standardCard();
  volume(image, "A").write("KEYS.COM", (await program("keys")).bytes);
  writeFileSync(card, image);
  const run = (...lines) => execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--rom", resolve(ROOT, "build/tecos/tecos.rom"), "--card", card, "--board", "pico", "--", ...lines], { encoding: "utf8", timeout: 120_000 });
  const keys = run("@start KEYS", "@fn 1", "@arrow L", "@run 20");
  const history = run("ECHO ONE", "@arrow U", "^M");
  rmSync(dir, { recursive: true });
  assert.match(keys, /1B 4F 50 1B 5B 44 /, "F1 as ESC O P, then Left as ESC [ D, from Fn+1 and the Left key");
  // The bare prompt has no ECHO, so each run answers ECHO?: what counts is the line Up brings back.
  assert.match(history, /A(:\S*)?>ECHO ONE\nECHO\?\n[^]*A(:\S*)?>ECHO ONE\nECHO\?\n/, "Up brings ECHO ONE back, and Return runs it again");
  assert.throws(() => execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--", "@fn 1"], { encoding: "utf8", stdio: "pipe", timeout: 120_000 }), /matrix keyboard needs --board pico or glcd/);
});

test("@fn and @arrow reach TBUG, which reads the matrix itself: F8 steps SAMPLE and Down moves Code's selection", () => {
  const out = execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--board", "pico", "--lcd", "--", "UNLOAD", "TBUG.SVC", "TAS SAMPLE", "@start TBUG.SVC SAMPLE", "@run 20", "@fn 8", "@arrow D"], { encoding: "utf8", timeout: 300_000 });
  const lcd = out.slice(out.lastIndexOf("--- LCD"));
  assert.match(lcd, /\n \x7e0103 /, "F8 ran SAMPLE's first instruction: PC, marked by the LCD's arrow, is on 0103");
  assert.match(lcd, /\n> 0106 /, "Down moved the selection to the next instruction");
});

test("--card none reaches DIAG's prompt, R retry>, and stops there with the LCD's rows (KE-172)", () => {
  const out = execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--rom", resolve(ROOT, "build/tecos/tecos.rom"), "--card", "none", "--lcd"], { encoding: "utf8", timeout: 120_000 });
  assert.match(out, /R retry> /, "the diagnostic prompt");
  assert.match(out, /CARD\?/, "and CARD? on the LCD");
});

for (const width of [40, 32]) {
  test(`--screen dumps a ${width}-column screen as ${width}-column rows (KE-189)`, () => {
    const dir = mkdtempSync(resolve(ROOT, "build/capture-"));
    const card = resolve(dir, "card.img");
    writeFileSync(card, standardCard());
    const out = execFileSync(process.execPath, [resolve(ROOT, "tools/capture.mjs"), "--rom", resolve(ROOT, "build/tecos/tecos.rom"), "--card", card, "--board", "pico", "--screen", "--", `CON CRT ${width}`, "DIR"], { encoding: "utf8", timeout: 120_000 });
    rmSync(dir, { recursive: true });
    const rows = out.split("--- screen\n")[1].split("\n");
    assert.ok(rows.every((r) => r.length <= width), `no row past ${width} columns`);
    assert.ok(rows.includes("A:SYSTEM>DIR") && rows.includes("NO FILE"), `each line its own row:\n${rows.join("\n")}`);
  });
}
