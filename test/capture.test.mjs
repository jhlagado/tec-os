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
  assert.match(out, /A>DIR\n/, "the three keys made one line");
  assert.match(out, /A>DIR\nNO FILE\nA>/, "and Return ran it, on an empty card");
  assert.doesNotMatch(out, /@PRESS/i);
});
