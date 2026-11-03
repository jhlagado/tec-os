// KE-157: what the tests load is declared and pinned. The page's tests drive
// Chromium through playwright, so package.json declares it at an exact version
// and package-lock.json pins that version and its core.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
