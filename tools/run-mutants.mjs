#!/usr/bin/env node
// A mutant set from tools/lib/mutants.mjs, MUTANTS_<SET>, on a tree of REV,
// HEAD by default, built in build/model-mutants/. --slice FROM:TO runs part of
// the set, for one at a time under the memory guard; --list names them.
//
//   node tools/run-mutants.mjs --set KS36B [--landed REV] [--slice FROM:TO] [--list] --out FILE

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "./lib/model.mjs";
import * as sets from "./lib/mutants.mjs";

const WORK = resolve(M.ROOT, "build/model-mutants");
const SET = sets[`MUTANTS_${M.arg("--set", "")}`];
if (!SET) throw new Error(`no mutant set MUTANTS_${M.arg("--set", "")}`);

async function main() {
  if (process.argv.includes("--list")) {
    console.log(SET.map((m, i) => `${i}: ${m.name}`).join("\n"));
    return;
  }
  const landed = M.arg("--landed", "HEAD");
  const [from, to] = (M.arg("--slice") ?? `0:${SET.length}`).split(":").map(Number);
  const t0 = Date.now();
  const got = await sets.mutate(await M.prepared(WORK, "landed", landed), WORK, SET.slice(from, to));
  writeFileSync(M.arg("--out"), JSON.stringify({ prototype: M.commit(landed), ...got }, null, 2) + "\n");
  M.log(`mutants ${got.mutantScore.caught} of ${got.mutantScore.total} caught; done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
