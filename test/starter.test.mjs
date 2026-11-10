// The starter card that `npm run media` builds: exactly nine files on A:, each
// the bytes its source or pin gives, the page's width drivers pinned in its
// recipe, and it boots to a MOUNT that lists its volumes. Emulator evidence.
// TED.COM, TAS.COM, BAZA.COM and BAZA.RTL are pinned inputs (test/inputs.json).

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
const sha = (b) => createHash("sha256").update(b).digest("hex");
const text = (name) => Buffer.from(readFileSync(resolve(ROOT, "programs", name), "utf8").replace(/\n/g, "\r\n") + "\x1a", "latin1");

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

test("the starter card holds exactly nine files, each by its hash, the PICO9918's console being the ROM's (KS39)", { skip: TED.skip || TAS.skip || BAZA.skip || RTL.skip, timeout: 300_000 }, async () => {
  check(TED);
  check(TAS);
  check(BAZA);
  check(RTL);
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

test("the starter card boots, and MOUNT lists its volumes", { skip: TED.skip || TAS.skip || BAZA.skip || RTL.skip, timeout: 300_000 }, () => {
  const m = boot(Uint8Array.from(starter().card));
  assert.match(m.command("MOUNT"), /^00 SYSTEM +G1M A:\r\n01 WORK +G8M B:\r\n/m);
  assert.deepEqual(m.violations, []);
});

test("the web page's card is the starter with DEMO.COM, which the starter lacks (KD-170)", { skip: TED.skip || TAS.skip || BAZA.skip || RTL.skip, timeout: 300_000 }, async () => {
  const { card, recipe } = starter();
  const page = JSON.parse(readFileSync(resolve(ROOT, "dist/page.recipe.json"), "utf8"));
  const demo = (await program("demo")).bytes;
  const names = (r) => r.components.map((c) => c.name).sort();
  assert.deepEqual(names(page), [...names(recipe), "DEMO.COM"].sort());
  assert.equal(page.components.find((c) => c.name === "DEMO.COM").files[0].sha256, sha(demo));
  assert.match(page.instruction, /DEMO/);
  assert.equal(volume(card, "A").list().some((f) => f.name === "DEMO.COM"), false, "not on the starter");
  const onPage = volume(await buildRecipe(page, fileFetcher(resolve(ROOT, "dist"))), "A");
  assert.equal(sha(onPage.read("DEMO.COM").subarray(0, demo.length)), sha(demo), "on the page's card");
});
