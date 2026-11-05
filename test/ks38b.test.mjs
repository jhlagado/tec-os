// KG42, KS38b's gate: against KS38a's landed tip, the ROM falls by exactly the
// sum the merges state, only the merged routines and their callers differ label
// by label, and the hot paths are equal. The lists are
// test/model/ks38b/kg42.json's. Both registered artifacts are built from git;
// later CCP work is qualified by its own gate, not KG42's exact merge list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "../tools/lib/model.mjs";
import { built, compareLabels } from "../tools/lib/ks38-check.mjs";
import { ROOT } from "./lib/fixtures.mjs";

const KG42 = JSON.parse(readFileSync(resolve(ROOT, "test/model/ks38b/kg42.json"), "utf8"));

test("historical KG42 at 626ee41: the ROM falls by the merges' stated bytes, only their routines differ, and the hot paths are equal", { timeout: 300_000 }, async () => {
  const dir = M.tree(resolve(ROOT, "build/ks38b-test"), "baseline", KG42.baseline);
  const reference = { env: { TECOS_ROM_ASSEMBLER: "atom" } };
  await M.build(dir, [], reference);
  const landed = M.tree(resolve(ROOT, "build/ks38b-test"), "landed", "626ee41");
  await M.build(landed, [], reference);
  const r = compareLabels(built(dir), built(landed), { markers: KG42.markers });
  const merges = Object.values(KG42.merges);
  const stated = merges.reduce((n, m) => n + m.bytes, 0);
  assert.equal(r.used[0] - r.used[1], stated, `the ROM falls by ${stated}, the merges' sum`);
  const allowed = new Set(merges.flatMap((m) => m.routines));
  const others = r.differences.filter((d) => d.kind !== "used" && !d.label.split("/").some((n) => allowed.has(n)));
  assert.deepEqual(others, [], "nothing outside the merged routines and their callers");
  const hot = r.differences.filter((d) => d.label.split("/").some((n) => KG42.hotPaths.includes(n)));
  assert.deepEqual(hot, [], "the hot paths equal");
});
