#!/usr/bin/env node
// KS38b's mutants (KG42): MUTANTS_KS38B on the registered tree 626ee41 by default, built
// in build/model-ks38b/. --slice FROM:TO runs part of the set, for one at a
// time under the memory guard; --list names them. Later CCP stages remove
// CPSRC, so their trees are not substitutes for this historical gate.
//
//   node tools/ks38b-model.mjs [--landed REV] [--slice FROM:TO] [--list] --out FILE

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "./lib/model.mjs";
import { MUTANTS_KS38B, mutate } from "./lib/mutants.mjs";

const WORK = resolve(M.ROOT, "build/model-ks38b");
const LANDED = M.arg("--landed", "626ee41");

async function main() {
  if (process.argv.includes("--list")) {
    console.log(MUTANTS_KS38B.map((m, i) => `${i}: ${m.name}`).join("\n"));
    return;
  }
  const [from, to] = (M.arg("--slice") ?? `0:${MUTANTS_KS38B.length}`).split(":").map(Number);
  const t0 = Date.now();
  const got = await mutate(await M.prepared(WORK, "landed", LANDED), WORK, MUTANTS_KS38B.slice(from, to));
  writeFileSync(M.arg("--out"), JSON.stringify({ prototype: M.commit(LANDED), ...got }, null, 2) + "\n");
  M.log(`mutants ${got.mutantScore.caught} of ${got.mutantScore.total} caught; done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
