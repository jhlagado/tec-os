#!/usr/bin/env node
// Legacy tab-layout formatter. Do not use on current compact ROM sources.
// Lays out each legacy FILE by tabs (tools/lib/style.mjs's
// toTabs), in place: the bytes it assembles to don't change, which
// tools/ks38-check.mjs same then shows for the ROM.
//
//   node tools/style-tabs.mjs FILE...
// See docs/assembly-style.md for current compact and retained legacy profiles.

import { readFileSync, writeFileSync } from "node:fs";
import { toTabs } from "./lib/style.mjs";

for (const file of process.argv.slice(2)) {
  const before = readFileSync(file, "latin1");
  const after = toTabs(before);
  if (after !== before) writeFileSync(file, after, "latin1");
  console.log(`${file}: ${Buffer.byteLength(before, "latin1")} -> ${Buffer.byteLength(after, "latin1")} bytes`);
}
