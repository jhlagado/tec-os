#!/usr/bin/env node
// The ROMs KG25 compares the block cache with, kept as test fixtures: the
// debug80 image and its label and EQU symbols, from a built extract of each
// commit. test/cache.test.mjs runs them in today's harness.
//
//   node test/model/ks21/oldroms.mjs COMMIT DIR [COMMIT DIR ...]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HERE } from "./here.mjs";

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const [commit, dir] = [args[i], args[i + 1]];
  const rom = readFileSync(resolve(dir, "build/debug80/tecos.rom"));
  const d8 = JSON.parse(readFileSync(resolve(dir, "build/debug80/tecos.d8.json"), "utf8"));
  const symbols = Object.fromEntries(d8.symbols.map((s) => [s.name, s.address ?? s.value]).filter(([, v]) => typeof v === "number"));
  const out = { commit, profile: "debug80", sha256: createHash("sha256").update(rom).digest("hex"), rom: rom.toString("base64"), symbols };
  writeFileSync(resolve(HERE, `../../fixtures/rom-${commit}.json`), JSON.stringify(out) + "\n");
  console.log(`${commit}: ${out.sha256}, ${Object.keys(symbols).length} symbols`);
}
