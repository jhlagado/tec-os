#!/usr/bin/env node
// KS24's model: a trial build of the brief's compact ROM on BASE's inputs,
// with a figure for each choice and each gate, written to figures.json.
//
//   node test/model/ks24/model.mjs            builds, choices and host gates
//   node test/model/ks24/model.mjs --suite    the same, then the full strict
//                                             suite twice on the draft
//
// The trees are in build/model-ks24/: base (BASE as it is), draft (the
// chosen design, with its tests adapted) and one per variant. The suite
// needs the pinned inputs: set ATOM_COM, EDIT_COM and TRIPTYCH_HEADLESS,
// since the trees sit deeper than the repository.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, HERE, baseTree, build, draftTree } from "./draft.mjs";
import { fields, gates } from "./gates.mjs";

const PROFILES = ["debug80", "debug80t40", "debug80g32", "board"];
const hex = (v) => v.toString(16).toUpperCase().padStart(4, "0") + "h";
const log = (...a) => console.error(...a);

function map(dir, profile = "debug80") {
  const d8 = JSON.parse(readFileSync(resolve(dir, "build", profile, "tecos.d8.json"), "utf8"));
  const sym = new Map(d8.symbols.map((s) => [s.name, s.address ?? s.value]));
  const at = (n) => {
    if (!sym.has(n)) throw new Error(`${dir}: no symbol ${n}`);
    return sym.get(n);
  };
  const census = JSON.parse(readFileSync(resolve(dir, "build", profile, "census.json"), "utf8"));
  const rom = readFileSync(resolve(dir, "build", profile, "tecos.rom"));
  return { d8, sym, at, census, rom };
}

/** The bytes the brief removes, measured at BASE. */
function removed(b) {
  const { at } = b;
  const parts = {
    padding: at("INT38") - (at("RESET") + 7),
    int38: at("ROMSIG") - at("INT38"),
    resetSpDi: 4,
    tableEntries: 1 + 3 + 2, // FF05h, FF06h, FF10h
    nonatsv: at("HWERR") - at("NONATSV"),
    romsigRomvers: at("COLD") - at("ROMSIG"),
    bdosSix: at("BENTRY") - at("BDOSBAS"),
  };
  return { parts, total: Object.values(parts).reduce((a, n) => a + n, 0) };
}

/** Segments of kind in [lo, hi) of a build's map. */
function segments(m, lo = 0xc000, hi = 0x10000) {
  const out = [];
  for (const [file, f] of Object.entries(m.d8.files)) for (const g of f.segments ?? []) if (g.start >= lo && g.start < hi) out.push({ file, ...g });
  return out.sort((a, b) => a.start - b.start);
}

/** JPs (unconditional, NZ, Z, NC, C) whose target a JR would reach. */
function jrReach(m, lo, hi) {
  let n = 0;
  for (const g of segments(m, lo, hi)) {
    if (g.kind !== "code") continue;
    const op = m.rom[g.start - 0xc000];
    if (![0xc3, 0xc2, 0xca, 0xd2, 0xda].includes(op) || g.end - g.start !== 3) continue;
    const target = m.rom[g.start - 0xc000 + 1] | (m.rom[g.start - 0xc000 + 2] << 8);
    const d = target - (g.start + 2);
    if (d >= -128 && d <= 127) n += 1;
  }
  return n;
}

/** The draft's data block, by the source file each run came from. */
function dataBySource(dir, m) {
  const out = {};
  for (const part of ["data.asm", "data2.asm", "data3.asm"]) {
    const lines = readFileSync(resolve(dir, "src", part), "utf8").split("\n");
    const owner = [];
    let cur = null;
    lines.forEach((l, i) => {
      const h = /^; ---- (\S+) -/.exec(l);
      if (h) cur = h[1];
      owner[i + 1] = cur;
    });
    for (const g of m.d8.files[part]?.segments ?? []) out[owner[g.line]] = (out[owner[g.line]] ?? 0) + g.end - g.start;
  }
  for (const gen of ["gen/font.asm", "gen/geom.asm"]) out[gen] = (m.d8.files[gen]?.segments ?? []).reduce((a, g) => a + g.end - g.start, 0);
  return out;
}

/** Every symbol below C000h (RAM labels and constants) that differs. */
function ramDiff(b, d) {
  const diff = [];
  for (const [n, v] of b.sym) if (v < 0xc000 && d.sym.has(n) && d.sym.get(n) !== v) diff.push(`${n} ${hex(v)} -> ${hex(d.sym.get(n))}`);
  const gone = [...b.sym].filter(([n, v]) => v < 0xc000 && !d.sym.has(n)).map(([n]) => n);
  return { compared: [...b.sym].filter(([n, v]) => v < 0xc000 && d.sym.has(n)).length, differ: diff, gone };
}

function runSuite(dir, run) {
  const env = { ...process.env, STRICT: "1" };
  const t0 = Date.now();
  let out;
  try {
    out = execSync("node --test --test-concurrency=1 --test-reporter=spec test/*.test.mjs", { cwd: dir, env, stdio: "pipe", maxBuffer: 64 << 20 }).toString();
  } catch (e) {
    out = `${e.stdout}`;
  }
  writeFileSync(resolve(dir, `build/suite-${run}.txt`), out);
  const n = (k) => Number(new RegExp(`^ℹ ${k} (\\d+)`, "m").exec(out)?.[1]);
  const tail = out.split("✖ failing tests:")[1] ?? "";
  const failed = [...tail.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]);
  return { tests: n("tests"), pass: n("pass"), fail: n("fail"), skipped: n("skipped"), failed, seconds: Math.round((Date.now() - t0) / 1000) };
}

const figures = { base: BASE, profiles: PROFILES };

// ---- The base and the draft, on every profile ----------------------------------
log("base");
const base = baseTree("base");
const baseErr = build(base);
if (baseErr) throw new Error(baseErr);
log("draft");
const draft = draftTree("draft");
const draftErr = build(draft.dir);
if (draftErr) throw new Error(draftErr);
figures.draft = { options: draft.options, notes: draft.notes, adapted: draft.adapted };

const B = map(base);
const D = map(draft.dir);
const cut = removed(B);
figures.removed = cut;

figures.rom = {};
for (const p of PROFILES) {
  const b = map(base, p).census.rom;
  const d = map(draft.dir, p).census.rom;
  const floor = b.free + cut.total;
  figures.rom[p] = { oldFree: b.free, newFree: d.free, gained: d.free - b.free, floor, pass: d.free >= floor, short: Math.max(0, floor - d.free), regions: Object.fromEntries(d.regions.map((r) => [r.label, { start: hex(r.start), bytes: r.bytes }])) };
}

// ---- Layout: the blocks from the symbol table and the map's segments ---------
const codeSegs = segments(D, D.at("ROMCODE"), D.at("CODEEND"));
const dataSegs = segments(D, D.at("ROMDATA"), D.at("ROMCODE"));
figures.layout = {};
for (const p of PROFILES) {
  const m = map(draft.dir, p);
  const at = m.at;
  const cs = segments(m, at("ROMCODE"), at("CODEEND"));
  const ds = segments(m, at("ROMDATA"), at("ROMCODE"));
  figures.layout[p] = {
    reset: hex(at("RESET")),
    table: `${hex(at("ABITAB"))}-${hex(at("ABIEND") - 1)}`,
    data: `${hex(at("ROMDATA"))}-${hex(at("ROMCODE") - 1)}`,
    code: `${hex(at("ROMCODE"))}-${hex(at("CODEEND") - 1)}`,
    free: `${hex(at("CODEEND"))}-FFFFh`,
    inOrder: at("RESET") === 0xc000 && at("ABITAB") === 0xc003 && at("ABIEND") === at("ROMDATA") && at("ROMDATA") <= at("ROMCODE") && at("ROMCODE") <= at("CODEEND"),
    dataInCode: cs.filter((g) => g.kind !== "code").reduce((a, g) => a + g.end - g.start, 0),
    codeBytesCovered: cs.reduce((a, g) => a + g.end - g.start, 0) === at("CODEEND") - at("ROMCODE"),
    codeInData: ds.filter((g) => g.kind === "code").map((g) => g.file + ":" + g.line).length,
    codeInDataIsBiosTable: ds.filter((g) => g.kind === "code").reduce((a, g) => a + g.end - g.start, 0) === 51,
  };
}
figures.layout.dataBySource = dataBySource(draft.dir, D);
figures.layout.dataBlockBytes = D.at("ROMCODE") - D.at("ROMDATA");
figures.layout.baseDataSegmentBytes = segments(B).filter((g) => g.kind === "data").reduce((a, g) => a + g.end - g.start, 0);
figures.layout.ram = ramDiff(B, D);
const old = existsSync(resolve(draft.dir, "src")) && execSync(`grep -rniE '\\$FF([01][0-9A-F]|2[0-7])\\b' src drivers test/programs --include=*.asm || true`, { cwd: draft.dir }).toString().trim();
figures.layout.oldAddressesInAsm = old ? old.split("\n") : [];

// ---- The choices -----------------------------------------------------------------
log("variants");
const variant = (name, options) => {
  const v = draftTree(name, options);
  const err = build(v.dir, ["debug80"]);
  if (err) return { options, error: err.split("\n").filter((l) => l.trim()).pop() };
  const m = map(v.dir);
  return { options, free: m.census.rom.free, codeEnd: hex(m.at("CODEEND")), table: hex(m.at("ABITAB")) };
};
const top = variant("v-top", { table: "top" });
const offsets = variant("v-offsets", { dispatch: "offsets" });
const inCode = variant("v-offsets-in-code", { dispatch: "offsets-in-code" });
const words = variant("v-lengths-data", { lengths: "data" });
const drafted = figures.rom.debug80.newFree;
figures.choices = {
  table: {
    front: { free: drafted, at: "C003h", entryAdded: "the data and the code move up by its bytes; every table address stays" },
    top,
    note: "ATOM emits no byte at FFFFh, so the top table is at FFDDh-FFFEh; an entry added moves its start, and every address, down, and the free gap sits between the code and the table",
    picked: "front",
  },
  dispatch: {
    words: { free: drafted, costBytes: inCode.free - drafted, map: draft.notes[0] },
    offsetsInData: offsets,
    offsetsInCode: { ...inCode, note: "the table as at BASE, left in the BDOS's code: data inside the code block, so the layout gate fails" },
    picked: "words",
  },
  lengths: { immediate: { free: drafted }, data: words, savedBytes: drafted - words.free, picked: "immediate" },
  order: {
    jpWithinJrBase: jrReach(B, 0xc000, 0x10000),
    jpWithinJrDraft: jrReach(D, D.at("ROMCODE"), D.at("CODEEND")),
    note: "ATOM never turns a JP into a JR, so no order saves a byte by itself; each JP in reach is a byte for KS28 to take",
    picked: "the source order of BASE in both blocks",
  },
};
// Every other move costs nothing: the draft's bytes reconcile.
const bUsed = B.census.rom.used;
const dUsed = D.census.rom.used;
figures.reconcile = {
  baseUsed: bUsed,
  removed: cut.total,
  dispatchFlag: figures.choices.dispatch.words.costBytes,
  lengthsAsOperands: -figures.choices.lengths.savedBytes,
  expectedUsed: bUsed - cut.total + figures.choices.dispatch.words.costBytes - figures.choices.lengths.savedBytes,
  draftUsed: dUsed,
};
figures.reconcile.otherMovesCost = dUsed - figures.reconcile.expectedUsed;

// ---- Host gates on every profile -------------------------------------------------
log("host gates");
figures.reset = {};
figures.tpa = {};
figures.table = {};
for (const p of PROFILES) {
  const gb = await gates(base, p, resolve(HERE, "abi27.inc"));
  const gd = await gates(draft.dir, p, resolve(HERE, "abi.inc"));
  figures.reset[p] = { base: gb.reset, draft: gd.reset, pass: gd.reset.onlyFirstThree && gd.reset.nextIsCold && gd.reset.prompt };
  figures.tpa[p] = { base: gb.tpa, draft: gd.tpa, pass: gb.tpa.bdosVector === gd.tpa.bdosVector };
  const fb = fields(gb.table.results);
  const fd = fields(gd.table.results);
  const differ = Object.keys(fb).filter((k) => JSON.stringify(fb[k]) !== JSON.stringify(fd[k]));
  figures.table[p] = {
    base: { version: fb.version, text: gb.table.text },
    draft: fields(gd.table.results),
    draftText: gd.table.text,
    differ,
  };
  // The version is the one field that should differ.
  figures.table[p].pass = differ.every((k) => k === "version") && fd.version === "3.0" && gb.table.text === gd.table.text && gd.table.violations === 0;
}

// ---- The suite ---------------------------------------------------------------------
if (process.argv.includes("--suite")) {
  log("suite");
  figures.suite = { runs: [runSuite(draft.dir, 1), runSuite(draft.dir, 2)] };
  const stack = (dir) => JSON.parse(readFileSync(resolve(dir, "build/stack-census.json"), "utf8"));
  log("base suite, for the stacks");
  figures.suite.base = runSuite(base, 1);
  const sb = stack(base);
  const sd = stack(draft.dir);
  figures.suite.stacks = Object.fromEntries(
    Object.keys(sb)
      .filter((k) => sb[k]?.deepest !== undefined)
      .map((k) => [k, { base: sb[k].deepest, draft: sd[k]?.deepest, reserved: sd[k]?.reserved, same: sb[k].deepest === sd[k]?.deepest }]),
  );
}

writeFileSync(resolve(HERE, "figures.json"), JSON.stringify(figures, null, 2) + "\n");
for (const p of PROFILES) log(p, figures.rom[p].oldFree, "->", figures.rom[p].newFree, figures.rom[p].pass ? "pass" : `short ${figures.rom[p].short}`);
