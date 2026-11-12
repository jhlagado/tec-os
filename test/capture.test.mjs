// tools/capture.mjs, the book's capture tool: "@press X" sends a key with no
// wait for a prompt (KB-25), so a line can be built a key at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, standardCard } from "./lib/fixtures.mjs";

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
    assert.ok(rows.includes("A>DIR") && rows.includes("NO FILE"), `each line its own row:\n${rows.join("\n")}`);
  });
}
