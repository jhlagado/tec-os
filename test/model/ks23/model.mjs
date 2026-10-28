#!/usr/bin/env node
// KS23's model: COPY's bytes at b8c7214 and in the draft (copy.asm), and
// the gate cases on each, written to figures.json.
//
//   node test/model/ks23/model.mjs

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, HERE, copyBytes, tree } from "./rom.mjs";
import { runCases } from "./cases.mjs";

const out = { base: BASE, builds: {} };
for (const [name, draft] of [["base", null], ["draft", "copy.asm"]]) {
  const dir = tree(name, draft);
  const cases = await runCases(dir);
  out.builds[name] = { bytes: copyBytes(dir), passed: cases.filter((c) => c.pass).length, of: cases.length, cases };
}
writeFileSync(resolve(HERE, "figures.json"), JSON.stringify(out, null, 2) + "\n");
for (const [name, b] of Object.entries(out.builds)) console.log(name, b.bytes.total, `${b.passed}/${b.of}`);
