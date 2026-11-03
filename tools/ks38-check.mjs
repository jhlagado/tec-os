#!/usr/bin/env node
// KS38's checks against a named baseline, on this tree as built (npm run build
// first). The baseline is a git archive of REV in build/ks38-check/, built
// there.
//
//   node tools/ks38-check.mjs same --baseline REV
//       the image byte for byte: a rename's check
//   node tools/ks38-check.mjs labels --baseline REV [--renames FILE] [--markers A,B]
//       label by label, an address in the ROM taken by its label: a move's
//       check. FILE is JSON, {"OLD": "NEW", ...}, the labels renamed since REV;
//       the markers, such as ROMDATA, mark a place and are left out.
//   node tools/ks38-check.mjs names NAME ... | --list FILE
//       the old file and label names, as whole words, in src/; history and
//       generated files are outside. FILE holds one name a line.
//
// Each exits 1 when it finds a difference or a name, and prints what it found.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "./lib/model.mjs";
import { built, compareLabels, sameImage, searchNames } from "./lib/ks38-check.mjs";

const WORK = resolve(M.ROOT, "build/ks38-check");
const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0") + "h";

async function baseline() {
  const rev = M.arg("--baseline");
  if (!rev) throw new Error("--baseline REV is required");
  // A baseline built already, of the same commit, is used again.
  const dir = resolve(WORK, "baseline");
  const stamp = resolve(dir, "build/ks38-baseline");
  const full = M.commit(rev);
  if (!existsSync(stamp) || readFileSync(stamp, "utf8") !== full) {
    M.tree(WORK, "baseline", rev);
    await M.build(dir);
    writeFileSync(stamp, full);
  }
  return { rev: full.slice(0, 7), side: built(dir) };
}

function here() {
  if (!existsSync(resolve(M.ROOT, "build/tecos/tecos.rom"))) throw new Error("build/tecos/tecos.rom missing: run npm run build first");
  return built(M.ROOT);
}

async function main() {
  const [what, ...rest] = process.argv.slice(2);
  if (what === "same") {
    const { rev, side } = await baseline();
    const r = sameImage(side.image, here().image);
    if (r.same) console.log(`the image equals ${rev}'s, byte for byte`);
    else console.log(`the image differs from ${rev}'s in ${r.count} bytes; first ${r.first.map((d) => `${hex(d.address)} ${d.a}/${d.b}`).join(", ")}`);
    return r.same;
  }
  if (what === "labels") {
    const { rev, side } = await baseline();
    const file = M.arg("--renames");
    const renames = file ? JSON.parse(readFileSync(file, "utf8")) : {};
    const markers = (M.arg("--markers") ?? "").split(",").filter(Boolean);
    const r = compareLabels(side, here(), { renames, markers });
    if (r.same) console.log(`${r.groups} label groups equal ${rev}'s, ${r.masked} addresses, ${r.maskedBytes} address halves and ${r.maskedJumps} relative jumps taken by their labels, ${r.used[1]} bytes used`);
    else for (const d of r.differences) console.log(JSON.stringify(d));
    return r.same;
  }
  if (what === "names") {
    const list = M.arg("--list");
    const names = list ? readFileSync(list, "utf8").split(/\s+/).filter(Boolean) : rest.filter((a) => !a.startsWith("--"));
    if (!names.length) throw new Error("no names given");
    const hits = searchNames(M.ROOT, names);
    for (const h of hits) console.log(`${h.file}:${h.line}: ${h.name}`);
    if (!hits.length) console.log(`none of ${names.length} names in src/`);
    return hits.length === 0;
  }
  throw new Error("same, labels or names");
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (e) => {
    console.error(e.message);
    process.exit(2);
  },
);
