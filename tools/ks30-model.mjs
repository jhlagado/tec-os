#!/usr/bin/env node
// KS30's model: shell simplification, gate KG34. Every figure of the stage's
// figures.json, measured on the landed tree against the brief's baseline, in
// the same keys and units: the ROM census, the choices the stage settled by
// building each arrangement, TPA and the resident figures, reset to a usable
// prompt and warm boot with SD reads on the shipped card for each case, the
// stack census, three reproducible builds, and the mutants.
//
//   node tools/ks30-model.mjs [--landed REV] [--reference REV] [--mutants]
//                             [--against FIGURES.json] [--out FILE]
//
// --landed is the tree measured, 3223ab2 by default (its fixes are dbdce5c);
// --reference is the baseline, 2d5ce25. The trees are git archives in
// build/model-ks30/. The shipped card is each tree's own dist/starter.img,
// made by its tools/media.mjs, which needs the pinned EDIT.COM (EDIT_COM).
// --mutants applies each mutant to a copy of the landed tree and runs the
// tests or the build that should catch it. --against prints, for every key
// of a recorded figures.json, whether it reproduces. The figures go to
// stdout as JSON, or to --out.
//
// KG33's readings, beside the boot figures, are the baseline's: KG33 judged
// 2d5ce25. The proved driver depths and the choices' wording are carried
// from the stage's record and marked so in --against.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./lib/model.mjs";
import { mutate, MUTANTS_KS30 } from "./lib/mutants.mjs";
import { against } from "./lib/against.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const WORK = resolve(M.ROOT, "build/model-ks30");
const CASES = Object.keys(M.CASES);

// The worker: one measurement in a tree, by its own host and test library.
if (process.argv[2] === "--worker") {
  const job = JSON.parse(process.argv[3]);
  const t = await M.inTree(job.dir);
  let out;
  if (job.task === "cold") out = t.cold(job.name).out;
  else if (job.task === "tpa") out = t.tpaOn(job.card, job.display);
  else if (job.task === "watch") out = t.watchFreedPage();
  console.log(JSON.stringify(out));
  process.exit(0);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const LANDED = arg("--landed", "3223ab2");
const REFERENCE = arg("--reference", "2d5ce25");

/** A tree of REV, built, with its release set. */
async function prepared(name, rev) {
  const dir = M.tree(WORK, name, rev);
  M.log(`${name}: ${M.commit(rev).slice(0, 7)}, building`);
  await M.build(dir);
  await M.media(dir);
  return dir;
}

/** Build a copy of DIR changed by EDIT (a function of the copy's path), and give its ROM used. */
async function variant(dir, name, edit) {
  const copy = M.copyTree(dir, WORK, `variant-${name}`);
  edit(copy);
  await M.build(copy, ["debug80"]);
  return M.rom(copy).census.rom.used;
}

/** Replace FROM by TO in FILE of tree DIR, which must hold FROM once. */
function patch(dir, file, from, to) {
  const path = resolve(dir, file);
  const text = readFileSync(path, "utf8");
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${file}: ${JSON.stringify(from)} found ${n} times`);
  writeFileSync(path, text.replace(from, to));
}

// The build's check of the RET, which a variant without one can't pass.
const noRetCheck = (d) => patch(d, "tools/build.mjs", `  check(at("OLDVOL") === 0xc01d && rom[0x1d] === 0xc9, "ABI 3's ABIVOL must hold a RET");\n`, "");
const KEYWORD = 'TYPEKEY:\n\tDB\t"TYPE",0\nOLDVOL:\tDB\t$C9\t\t; C01Dh: RET, checked by the build\n';

/** KS30's choices, each arrangement built on the landed tree. */
async function choices(dir, census) {
  const r = M.rom(dir);
  const data = r.census.rom.regions.find((g) => g.label === "data");
  let c9 = 0;
  for (let a = data.start; a < data.end; a += 1) if (a !== 0xc01d && r.image[a - 0xc000] === 0xc9) c9 += 1;
  const used = r.census.rom.used;
  const [noRet, filler, retNz, inline] = await Promise.all([
    variant(dir, "no-ret", (d) => (noRetCheck(d), patch(d, "src/data.asm", KEYWORD, 'TYPEKEY:\n\tDB\t"TYPE",0\n'))),
    variant(dir, "filler", (d) => patch(d, "src/data.asm", KEYWORD, '\tDB\t0,0,0,0,0\nOLDVOL:\tDB\t$C9\nTYPEKEY:\tDB\t"TYPE",0\n')),
    variant(dir, "ret-nz", (d) => patch(d, "src/glcd.asm", "\tJR\tNZ,WRDCLR\t", "\tRET\tNZ\t")),
    variant(dir, "inline", (d) => {
        patch(d, "src/glcd.asm", "\tJR\tNZ,WRDCLR\t", "\tRET\tNZ\t");
        patch(
          d,
          "src/glcd.asm",
          "CONSET:\tCALL\tWRDCLR\t\t; a display has come: the word is false\n",
          "CONSET:\tLD\tHL,CONDEV\n\tBIT\t7,(HL)\n\tJR\tZ,CONST1\n\tRES\t7,(HL)\n\tPUSH\tBC\n\tLD\tHL,PICCLR\n\tCALL\tLCD3\n\tPOP\tBC\nCONST1:\n",
        );
        const path = resolve(d, "src/glcd.asm");
        const text = readFileSync(path, "utf8");
        const at = text.indexOf("; Clear the ROM's word from row 3");
        writeFileSync(path, text.slice(0, at) + text.slice(text.indexOf("\tRET\n", text.indexOf("WRDCLR:")) + 5));
      }),
  ]);
  const layout = readFileSync(resolve(dir, "src/layout.asm"), "utf8");
  const ccpstn = Number(/^CCPSTN\s+EQU\s+(\d+)/m.exec(layout)[1]);
  const floor = Number(/need (\d+) bytes of it/.exec(layout.replace(/\n;\s*/g, " "))[1]);
  const lim = r.symbols.get("DRVLIM") - 0xc000;
  return {
    c01d: {
      other0xC9InTheData: c9,
      rom: { noRet, typeKeywordThenRet: used, fiveFillerBytesThenRet: filler },
      cost: { typeKeywordThenRet: used - noRet, fiveFillerBytesThenRet: filler - noRet },
      rejected:
        "The other C9h bytes in the data are bytes of code addresses, as WBOOTR in page C9h would be with the BIOS table at C018h: no ROM bytes, but every later code change would move them",
      settled: "CCP keyword TYPE, 5 bytes, then a RET: 1 byte, checked by the build",
    },
    glcdAtLoad: { landed: used, retNzKeepingTheRoutine: retNz, wordClearedInlineAtTakesOnly: inline, costOfClearingAtLoad: used - inline },
    ccpstn: { CCPSTN: ccpstn, floor, deepest: census.ccp.deepest, limit: [...r.image.subarray(lim, lim + 3)], note: "Any change waits for KS33, since it also moves DRVLIM" },
  };
}

const TPA_DISPLAYS = ["serial", "pico80", "pico40", "pico32", "glcd", "both"];
async function tpa(dir) {
  const jobs = [];
  for (const card of ["starter", "fourG8M"]) for (const display of TPA_DISPLAYS) jobs.push({ card, display });
  const got = await Promise.all(jobs.map((j) => M.worker(SCRIPT, { task: "tpa", dir, ...j })));
  const out = { starter: {}, fourG8M: {} };
  jobs.forEach((j, i) => (out[j.card][j.display] = got[i]));
  return out;
}

async function boots(dir) {
  const got = await Promise.all(CASES.map((name) => M.worker(SCRIPT, { task: "cold", dir, name })));
  return Object.fromEntries(CASES.map((n, i) => [n, got[i]]));
}

const stackRuns = (c) => Object.fromEntries(Object.entries(c.runs).map(([k, r]) => [k, M.depths(r)]));

async function main() {
  const t0 = Date.now();
  const [landed, reference] = await Promise.all([prepared("landed", LANDED), prepared("reference", REFERENCE)]);
  M.log("measuring: boots, TPA, stacks, choices, builds");
  const [bootL, bootR, tpaL, tpaR, censusL, censusR, watch] = await Promise.all([
    boots(landed),
    boots(reference),
    tpa(landed),
    tpa(reference),
    M.stackCensus(landed),
    M.stackCensus(reference),
    M.worker(SCRIPT, { task: "watch", dir: landed }),
  ]);
  const chosen = await choices(landed, censusL);
  const romL = M.romFigures(landed);
  const romR = M.romFigures(reference);
  const resL = M.resident(landed);
  const resR = M.resident(reference);
  const runsL = stackRuns(censusL);
  const runsR = stackRuns(censusR);
  const gone = Object.keys(runsR).filter((k) => !(k in runsL));
  const deepestCcpRun = Object.entries(runsL).reduce((a, b) => (b[1].ccp > a[1].ccp ? b : a))[0];
  const drv = (n) => readFileSync(resolve(landed, "dist/files", n));
  const limit = chosen.ccpstn.limit;
  const vs = {};
  for (const n of CASES) {
    const p = bootL[n];
    const k = bootR[n];
    vs[n] = { seconds: p.seconds, sdReads: p.sdReads, row3: p.row3, kg33Seconds: k.seconds, kg33Reads: k.sdReads, kg33Row3: k.row3 };
    if (p.warmBoot) Object.assign(vs[n], { warmBoot: p.warmBoot.seconds, kg33WarmBoot: k.warmBoot.seconds });
  }
  const figures = {
    baseline: REFERENCE,
    assembler: `ATOM ${JSON.parse(readFileSync(resolve(landed, "package.json"), "utf8")).devDependencies["atom-z80"]}`,
    prototype: M.commit(LANDED),
    rom: {
      reference: { used: romR.used, free: romR.free },
      ...Object.fromEntries(["used", "free"].map((k) => [k, romL[k]])),
      saving: romR.used - romL.used,
      ...Object.fromEntries(Object.entries(romL).filter(([k]) => !["used", "free"].includes(k))),
    },
    choices: chosen,
    tpa: { prototype: tpaL, reference: tpaR },
    resident: {
      reference: resR,
      prototype: resL,
      workspaceReleased: resR.stateAboveTheTable - resL.stateAboveTheTable,
      expand1: watch.free ? "BE00h to BEFFh free, 256 bytes, watched by the host" : `not watched: ${JSON.stringify(watch)}`,
    },
    boot: { prototype: bootL, reference: bootR, kg33: bootR, against: vs },
    stacks: {
      reference: M.depths(censusR),
      prototype: M.depths(censusL),
      reserved: { bdos: censusL.bdos.reserved, ccp: censusL.ccp.reserved, bios: censusL.bios.reserved },
      pathsGone: gone,
      goneReadings: Object.fromEntries(gone.map((k) => [k, runsR[k]])),
      runs: runsL,
      deepestCcpRun,
      proved: {
        "PICO.DRV": { declared: M.declaredStacks(drv("PICO.DRV")), peakOverReference: [0, 0, 0] },
        "GLCD.DRV": { declared: M.declaredStacks(drv("GLCD.DRV")), overBase: [2, 0, 6] },
      },
      limit,
      everyQuarterFree: ["bdos", "ccp", "bios"].every((k) => (censusL[k].reserved - censusL[k].deepest) * 4 >= censusL[k].reserved),
    },
    reproducible: await M.reproducible(landed),
  };
  if (process.argv.includes("--mutants")) Object.assign(figures, await mutate(landed, WORK, MUTANTS_KS30));
  const text = JSON.stringify(figures, null, 2) + "\n";
  const out = arg("--out");
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  const recorded = arg("--against");
  if (recorded) {
    const carried = ["choices.c01d.rejected", "choices.c01d.settled", "choices.ccpstn.note", "stacks.proved.PICO.DRV.peakOverReference", "stacks.proved.GLCD.DRV.overBase"];
    against(JSON.parse(readFileSync(recorded, "utf8")), figures, { carried, mutants: process.argv.includes("--mutants") });
  }
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
