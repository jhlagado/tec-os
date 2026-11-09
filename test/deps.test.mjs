// KE-157: what the tests load is declared and pinned. playwright, which drives
// Chromium against the local web/ page, is declared at an exact version and
// package-lock.json pins that version and its core. The page's own browser
// tests moved to the Viewer (KD-239).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ROOT } from "./lib/fixtures.mjs";

const read = (f) => JSON.parse(readFileSync(resolve(ROOT, f), "utf8"));

test("playwright is a devDependency at an exact version, and the lock pins it and its core (KE-157)", () => {
  const pkg = read("package.json");
  const lock = read("package-lock.json");
  const want = pkg.devDependencies?.playwright;
  assert.match(want ?? "", /^\d+\.\d+\.\d+$/, "declared, exactly");
  assert.equal(lock.packages[""].devDependencies.playwright, want);
  for (const name of ["playwright", "playwright-core"]) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.equal(entry?.version, want, `${name} locked at ${want}`);
    assert.match(entry.integrity, /^sha512-/);
  }
  assert.match(readFileSync(resolve(ROOT, "README.md"), "utf8"), /npx playwright install chromium/, "the browser's install documented");
});

test("a model reads an older tree's own inputs.json, whatever this tree pins: TED from that tree's pin, by PINS_DIR", async () => {
  const { tedCom } = await import("../tools/lib/model.mjs");
  const old = mkdtempSync(resolve(ROOT, "build/older-"));
  const pins = mkdtempSync(resolve(ROOT, "build/pins-"));
  const bytes = Buffer.from("an older tree's TED");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  mkdirSync(resolve(old, "test"));
  writeFileSync(resolve(old, "test/inputs.json"), JSON.stringify({ inputs: { "TED.COM": { env: "TED_OLD_UNSET", default: "../none/TED.COM", sha256 } } }));
  writeFileSync(resolve(pins, sha256), bytes);
  const was = process.env.PINS_DIR;
  process.env.PINS_DIR = pins;
  try {
    assert.equal(tedCom(old), resolve(pins, sha256), "the older tree's pin, not this tree's");
  } finally {
    if (was === undefined) delete process.env.PINS_DIR;
    else process.env.PINS_DIR = was;
    rmSync(old, { recursive: true });
    rmSync(pins, { recursive: true });
  }
});

test("test/inputs.json holds only what a live test reads, each one file with its repo, commit and path", () => {
  const { inputs } = read("test/inputs.json");
  assert.deepEqual(Object.keys(inputs).sort(), ["TAS.COM", "TED.COM"], "ATOM.COM and triptych-headless went: nothing live read them");
  for (const [name, e] of Object.entries(inputs)) {
    assert.match(e.repo, /^[\w-]+\/[\w.-]+$/, name);
    assert.match(e.commit, /^[0-9a-f]{40}$/, `${name}: a full commit`);
    assert.ok(e.path && !e.tree, `${name}: one file`);
    assert.ok(e.source.includes(e.commit.slice(0, 7)), `${name}: source and commit agree`);
  }
});
