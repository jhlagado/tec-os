// KG41, KS38a's gate: after the renames and moves, the image equals the
// baseline's label by label, each address taken by its label, and none of the
// old file and label names is left in src/. The lists are
// test/model/ks38a/kg41.json's; the baseline is built from git.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "../tools/lib/model.mjs";
import { built, compareLabels, searchNames } from "../tools/lib/ks38-check.mjs";
import { ROOT } from "./lib/fixtures.mjs";

const KG41 = JSON.parse(readFileSync(resolve(ROOT, "test/model/ks38a/kg41.json"), "utf8"));

test("KG41: none of KS38a's old file and label names is left in src/", () => {
  assert.deepEqual(searchNames(ROOT, KG41.oldNames), []);
});

test("KG41: the image equals the baseline's label by label, with KS38a's renames and markers", { timeout: 300_000 }, async () => {
  const dir = M.tree(resolve(ROOT, "build/ks38a-test"), "baseline", KG41.baseline);
  await M.build(dir);
  const r = compareLabels(built(dir), built(ROOT), { renames: KG41.renames, markers: KG41.markers });
  assert.deepEqual(r.differences, []);
  assert.equal(r.used[1], 14827);
});
