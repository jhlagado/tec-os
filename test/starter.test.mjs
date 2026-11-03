// The starter card that `npm run media` builds: exactly six files on A:, each
// the bytes its source or pin gives, with room for TED's files and a source,
// and it boots to a MOUNT that lists its volumes. Emulator evidence. TED.COM and
// TAS.COM are pinned inputs (test/inputs.json).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_SVC, PICO_SVC, ROOT, boot, program, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TED = pinned("TED.COM");
const TAS = pinned("TAS.COM");
const sha = (b) => createHash("sha256").update(b).digest("hex");

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

test("the starter card holds exactly six files, each by its hash", { skip: TED.skip || TAS.skip, timeout: 300_000 }, async () => {
  check(TED);
  check(TAS);
  const { card, recipe } = starter();
  const want = {
    "STARTUP.CMD": Buffer.from("PICO.SVC\r\nGLCD.SVC\r\n\x1a", "latin1"),
    "PICO.SVC": PICO_SVC["PICO.SVC"],
    "GLCD.SVC": GLCD_SVC,
    "MOUNT.COM": (await program("mount")).bytes,
    "TAS.COM": readFileSync(TAS.path),
    "TED.COM": readFileSync(TED.path),
  };
  const a = volume(card, "A");
  assert.deepEqual(a.list().map((f) => f.name).sort(), Object.keys(want).sort());
  assert.deepEqual(recipe.components.map((c) => c.name).sort(), Object.keys(want).sort());
  for (const [name, bytes] of Object.entries(want)) {
    assert.equal(sha(a.read(name).subarray(0, bytes.length)), sha(bytes), `${name} on the card`);
    assert.equal(recipe.components.find((c) => c.name === name).files[0].sha256, sha(bytes), `${name} in the recipe`);
  }
  assert.deepEqual(volume(card, "B").list(), [], "B: is empty");
});

test("the starter's A: has room for TED's files and a 4 KiB source", { skip: TED.skip || TAS.skip, timeout: 300_000 }, () => {
  const a = volume(starter().card, "A");
  // THOR.PRJ, .SES, .ERR, .$$$ and .BAK, a block each, and the source.
  const need = 5 * a.blockBytes + 4096;
  assert.ok(a.freeBytes() >= need, `${a.freeBytes()} bytes free on A:, ${need} needed`);
});

test("the starter card boots, and MOUNT lists its volumes", { skip: TED.skip || TAS.skip, timeout: 300_000 }, () => {
  const m = boot(Uint8Array.from(starter().card));
  assert.match(m.command("MOUNT"), /^00 SYSTEM +G1M A:\r\n01 WORK +G8M B:\r\n/m);
  assert.deepEqual(m.violations, []);
});
