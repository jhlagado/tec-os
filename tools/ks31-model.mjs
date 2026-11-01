#!/usr/bin/env node
// KS31's model: reset selection, gate KG35. Every figure of the stage's
// figures.json, measured on the landed tree against the brief's baseline, in
// the same keys and units: the ROM census and its net cost, the choices the
// stage settled, TPA and the resident figures, cold boot and a recognised
// reset to a usable prompt with SD reads on the shipped card for each case,
// a selection on a 20-volume card, warm boot, the stack census with its reset
// path, three reproducible builds, and the mutants.
//
//   node tools/ks31-model.mjs [--landed REV] [--reference REV] [--kg32 REV]
//                             [--mutants] [--against FIGURES.json] [--out FILE]
//
// --landed is the tree measured, b6fd6f6 by default; --reference the
// baseline, dbdce5c, which is also KS30's landed tree and so gives KG34's
// readings. --kg32 is the tree KG32's readings are measured on, edc2745.
// The trees are git archives in build/model-ks31/, and the shipped card is
// each tree's own dist/starter.img, by its tools/media.mjs, which needs the
// pinned EDIT.COM (EDIT_COM). --mutants and --against are as for
// tools/ks30-model.mjs.
//
// RESEL inside MOUNT, the arrangement the stage rejected, was a prototype's
// and isn't rebuilt here: its figures are null. The repeated DPH is rebuilt
// by putting MNDPH's body in place of each call. The proved driver depths,
// the file limit and the choices' wording are carried, and marked so.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./lib/model.mjs";
import { mutate, MUTANTS_KS31 } from "./lib/mutants.mjs";
import { against } from "./lib/against.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const WORK = resolve(M.ROOT, "build/model-ks31");

if (process.argv[2] === "--worker") {
  await M.runWorker(JSON.parse(process.argv[3]));
  process.exit(0);
}

const LANDED = M.arg("--landed", "b6fd6f6");
const REFERENCE = M.arg("--reference", "dbdce5c");
const KG32 = M.arg("--kg32", "edc2745");
const CASES = Object.keys(M.CASES);
// A recognised reset of each case but bothDisplays, which is pico80 with a GLCD that takes no part.
const RECOGNISED = ["serial", "pico80", "pico40", "pico32", "glcd", "missingDrivers", "badDriver", "keypadSkip", "badCard", "retry", "noCard"];

/** MNDPH's body in place of each CALL MNDPH, and the routine gone: the DPH's fields repeated. */
function repeatDph(dir) {
  const path = resolve(dir, "src/vol.asm");
  let text = readFileSync(path, "utf8");
  const head = text.indexOf("; Build drive A's DPH for geometry C.");
  const start = text.indexOf("MNDPH:", head);
  const end = text.indexOf("\tRET\n", start);
  const body = text.slice(start + "MNDPH:".length, end);
  text = text.slice(0, head) + text.slice(end + "\tRET\n".length).replace(/^\n/, "");
  let n = 0;
  text = text.replace(/^\tCALL\tMNDPH\n/gm, () => ((n += 1), body.replace(/\bMNZ\b/g, `MNZ${n}`)));
  if (n !== 2) throw new Error(`vol.asm: ${n} calls of MNDPH`);
  writeFileSync(path, text);
}

async function choices(dir) {
  const used = M.rom(dir).census.rom.used;
  const repeated = await M.variant(WORK, dir, "repeated-dph", repeatDph);
  const volAsmBytes = readFileSync(resolve(dir, "src/vol.asm")).length;
  const fileLimit = 24576;
  return {
    reselPlace: {
      routineAfterAlvinit: used,
      insideMount: null,
      landedCosts: null,
      settled: "the routine: the walk stays out of a pass whose failures unmount everything, and a read failure leaves the defaults",
      note: "inside MOUNT a failed read would take the card to DIAG, where the brief keeps the defaults",
    },
    dphSplit: { split: used, repeated, saves: repeated - used, volAsmBytes, fileLimit, underTheLimit: volAsmBytes < fileLimit, settled: repeated > used ? "split" : "repeated" },
  };
}

const pair = (b) => (b ? [b.seconds, b.sdReads] : null);

async function main() {
  const t0 = Date.now();
  const [landed, reference, kg32] = await Promise.all([
    M.prepared(WORK, "landed", LANDED),
    M.prepared(WORK, "reference", REFERENCE),
    M.prepared(WORK, "kg32", KG32),
  ]);
  M.log("measuring: boots, resets, TPA, stacks, choices, builds");
  const [cold, ref, kg32Boot, recog, defaults, selected, tpaL, tpaR, censusL, censusR, watch, chosen] = await Promise.all([
    M.bootTable(SCRIPT, landed, "cold"),
    M.bootTable(SCRIPT, reference, "cold"),
    M.bootTable(SCRIPT, kg32, "cold"),
    M.bootTable(SCRIPT, landed, "recognised", RECOGNISED),
    M.worker(SCRIPT, { task: "selection", dir: landed, selected: false }),
    M.worker(SCRIPT, { task: "selection", dir: landed, selected: true }),
    M.tpaTable(SCRIPT, landed),
    M.tpaTable(SCRIPT, reference),
    M.stackCensus(landed),
    M.stackCensus(reference),
    M.worker(SCRIPT, { task: "watch", dir: landed }),
    choices(landed),
  ]);
  const vs = {};
  for (const n of CASES) {
    const c = cold[n];
    const r = recog[n];
    vs[n] = { cold: pair(c), recognised: pair(r), kg34: pair(ref[n]), kg32: pair(kg32Boot[n]), row3: c.row3 };
    if (r) vs[n].recognisedRow3 = r.row3;
    if (c.warmBoot) Object.assign(vs[n], { warmBoot: c.warmBoot.seconds, kg34WarmBoot: ref[n].warmBoot.seconds });
  }
  const figures = {
    ...M.heading(REFERENCE, landed, LANDED),
    rom: M.romSection(landed, reference),
    choices: chosen,
    tpa: { prototype: tpaL, reference: tpaR },
    resident: M.residentSection(landed, reference, watch),
    boot: {
      cold,
      reference: ref,
      recognised: recog,
      selection: { defaultsOn20Volumes: defaults, selectedOn20Volumes: selected },
      kg34: ref,
      kg32: kg32Boot,
      against: vs,
    },
    stacks: M.stackFigures(censusL, censusR, landed, M.drvlim(landed)),
    reproducible: await M.reproducible(landed),
  };
  if (process.argv.includes("--mutants")) Object.assign(figures, await mutate(landed, WORK, MUTANTS_KS31));
  const text = JSON.stringify(figures, null, 2) + "\n";
  const out = M.arg("--out");
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  const recorded = M.arg("--against");
  if (recorded) {
    const carried = [
      "choices.reselPlace.settled",
      "choices.reselPlace.note",
      "choices.dphSplit.fileLimit",
      "stacks.proved.PICO.DRV.peakOverReference",
      "stacks.proved.GLCD.DRV.overBase",
    ];
    against(JSON.parse(readFileSync(recorded, "utf8")), figures, { carried, mutants: process.argv.includes("--mutants") });
  }
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
