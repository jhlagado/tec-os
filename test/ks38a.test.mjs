// None of the old file and label names that the renames retired is left in
// src/. The lists are test/model/ks38a/kg41.json's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchNames } from "../tools/lib/ks38-check.mjs";
import { ROOT } from "./lib/fixtures.mjs";

const KG41 = JSON.parse(readFileSync(resolve(ROOT, "test/model/ks38a/kg41.json"), "utf8"));

test("KG41: none of KS38a's old file and label names is left in src/", () => {
  assert.deepEqual(searchNames(ROOT, KG41.oldNames), []);
});
