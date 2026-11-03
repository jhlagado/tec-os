#!/usr/bin/env node
// KS36a's model: removals and ABI 5. Every figure the gates need, measured on
// the prototype against the baseline: the ROM census and what each part took
// out; the TPA on each card and the stacks; the table's 8 bytes and each
// numbered service's entry and stack through the dispatcher, against what
// abi.inc states; the names and terms gone from everything not historical;
// and the tests' files. --mutants runs KS36a's set on the landed tree.
//
//   node tools/ks36a-model.mjs [--landed REV] [--reference REV] [--mutants]
//                              [--sets-only] [--list] [--slice FROM:TO] [--out FILE]
//
// --landed is the tree measured, HEAD by default; --reference the baseline,
// a1c4141. The trees are git archives in build/model-ks36a/, each built with
// its release set. A short account goes to stderr.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./lib/model.mjs";
import { MUTANTS_KS36A, mutate } from "./lib/mutants.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const WORK = resolve(M.ROOT, "build/model-ks36a");
const text = (dir, f) => readFileSync(resolve(dir, f), "utf8");

// ---- In a worker --------------------------------------------------------------

/** Each numbered service called through ABICALL on a PICO9918 board: its result and the most it took below its return address. */
async function services(job) {
  const t = await M.inTree(job.dir);
  const { fx } = t;
  const abi = fx.ABI;
  const m = fx.boot(fx.standardCard([{ geometry: "G1M", label: "THIRD", mount: "-" }]), { tms: true, matrix: true });
  const BACK = 0x0f00, TOP = 0x1000, BUF = 0x2000;
  "PICO    ".split("").forEach((ch, i) => m.write(BUF + 0x40 + i, ch.charCodeAt(0)));
  const call = (c, { b = 0, de = 0, hl = 0 } = {}) => {
    const cpu = m.cpu.cpu;
    const saved = { pc: cpu.pc, sp: cpu.sp };
    m.write(TOP - 2, BACK & 0xff);
    m.write(TOP - 1, BACK >> 8);
    Object.assign(cpu, { a: 0x55, b, c, d: de >> 8, e: de & 0xff, h: hl >> 8, l: hl & 0xff, sp: TOP - 2, pc: abi.ABICALL });
    let low = TOP - 2;
    const step = m.step.bind(m);
    m.step = () => {
      if (cpu.sp < low && cpu.sp > TOP - 0x100) low = cpu.sp;
      return step();
    };
    try {
      m.runUntil(() => m.pc === BACK, 400_000_000, `service ${c}`);
    } finally {
      m.step = step;
    }
    const r = { a: cpu.a, carry: cpu.flags.C, stack: TOP - 2 - low, balanced: cpu.sp === TOP };
    Object.assign(cpu, saved);
    return r;
  };
  const runs = [
    ["TNINFO", {}], ["TNDIGIT", { hl: BUF }], ["TNLCD", { b: 3, hl: BUF }], ["TNVIDEO", { b: 1 }], ["TNVIDEO", { b: 0 }],
    ["TNTONE", { b: 1, de: 2 }], ["TNJOY", {}], ["TNKEYS", { hl: BUF }], ["TNPUTAT", { b: 4, hl: BUF }], ["TNRTC", { b: 0, hl: BUF }],
    ["TNDESC", { de: 2, hl: BUF }], ["TNUNMNT", { b: 1 }], ["TNMOUNT", { b: 1, de: 2 }], ["TNUNMNT", { b: 1 }], ["TNMOUNT", { b: 1, de: 1 }],
    ["TNDRVR", { b: 1, hl: 0x3000 }], ["TNFIND", { b: 1, de: BUF + 0x40 }], ["TNLIST", { b: 0 }],
  ];
  const out = {};
  for (const [name, regs] of runs) {
    const r = call(abi[name], regs);
    out[name] = { ...r, stack: Math.max(out[name]?.stack ?? 0, r.stack) };
  }
  out.pastTheTable = call(abi.TNCOUNT, { b: 0x5a, de: 0x1234, hl: 0x5678 });
  return { services: out, violations: m.violations.length };
}

if (process.argv[2] === "--worker") {
  const job = JSON.parse(process.argv[3]);
  if (job.task === "services") console.log(JSON.stringify(await services(job)));
  else await M.runWorker(job);
  process.exit(0);
}

// ---- The figures ----------------------------------------------------------------

/** abi.inc's services: each number, its stated stack, and the ROM's table word for it. */
function table(dir) {
  const inc = text(dir, "src/abi.inc");
  const { symbols, image } = M.rom(dir);
  const byte = (a) => image[a - 0xc000];
  const word = (a) => byte(a) | (byte(a + 1) << 8);
  const at = (n) => symbols.get(n);
  const stated = {};
  for (const m of inc.matchAll(/^(TN[A-Z]+)\s+EQU\s+(\d+)\b([\s\S]*?)(?=^\w|\n\n)/gm)) {
    const s = /Stack (\d+)/.exec(m[3]);
    if (s) stated[m[1]] = { number: Number(m[2]), stack: Number(s[1]) };
  }
  const entries = Object.fromEntries(Object.entries(stated).map(([n, v]) => [n, word(at("SVTAB") + 2 * v.number)]));
  const names = new Map([...symbols.entries()].map(([k, v]) => [v, k]));
  return {
    bytes: Array.from({ length: 8 }, (_, i) => byte(0xc003 + i)),
    tna: String.fromCharCode(byte(0xc003), byte(0xc004), byte(0xc005)),
    major: byte(0xc006),
    minor: byte(0xc007),
    jumpTo: names.get(word(0xc009)),
    end: at("ABIEND"),
    count: at("TNCOUNT"),
    stated,
    entries: Object.fromEntries(Object.entries(entries).map(([n, a]) => [n, names.get(a) ?? a])),
    numbersInOrder: Object.values(stated).map((v) => v.number).join() === Array.from({ length: Object.keys(stated).length }, (_, i) => i).join(),
  };
}

/** Each part's names gone from the prototype's symbol map; its bytes are the files' spans. */
function removed(landed) {
  const gone = (n) => M.rom(landed).symbols.get(n) === undefined;
  const all = (names) => ({ names, gone: names.every(gone) });
  return {
    part1: all(["XMOVE", "MOVE", "MVRANGE", "FNBIOS", "XMARK"]),
    part2: all(["MNCOPY", "MAINS", "EXPANDS", "LATMAIN", "ABIMAIN"]),
    part6: { plantedJump: !/LD\s+\(RAMBIOS\+3\),A/.test(text(landed, "src/boot.asm")) },
    part8: all(["PRLGO", "PRLBITS", "PRLPROG", "PRLTOP"]),
    part3: all(["ABIHW", "ABIVOL", "ABIGLCD", "ABISVC", "ABIVID", "OLDVOL", "HWBASE", "SVCREG"]),
  };
}

/** The ROM's bytes in each source file, landed against reference. */
function fileSpans(dir) {
  const { symbols } = M.rom(dir);
  const src = text(dir, "src/rom.asm");
  const files = [...src.matchAll(/^%INCLUDE "(.+)"/gm)].map((m) => m[1]);
  const firstLabel = (f) => {
    const p = resolve(dir, "src", f);
    if (!existsSync(p)) return null;
    const m = /^([A-Z][A-Z0-9]*):/m.exec(readFileSync(p, "utf8"));
    return m ? symbols.get(m[1]) : null;
  };
  const starts = files.map((f) => [f, firstLabel(f)]).filter(([, a]) => a >= 0xc000).sort((x, y) => x[1] - y[1]);
  const end = symbols.get("CODEEND");
  return Object.fromEntries(starts.map(([f, a], i) => [f, (starts[i + 1]?.[1] ?? end) - a]));
}

/** No name of a removed piece left, outside history, in the docs, the source, the tools and the tests. */
function noneLeft(dir) {
  const term = /\b(ABIHW|ABIVOL|ABIGLCD|ABISVC|ABIVID|ABIMAIN|ABIDRV|HWBASE|OLDVOL|XMARK|MVRANGE|FNBIOS|PRLGO|MNCOPY|EXPANDS)\b|function 50|C01Dh/;
  const HISTORICAL = /^(docs\/(decisions|history|changelog)|test\/model|test\/fixtures|tools\/ks\d|tools\/lib\/mutants\.mjs|build|dist|node_modules|web\/dist)/;
  const hits = [];
  const walk = (d) =>
    readdirSync(resolve(dir, d), { withFileTypes: true }).forEach((e) => {
      const p = join(d, e.name);
      if (HISTORICAL.test(p) || e.name.startsWith(".")) return;
      if (e.isDirectory()) walk(p);
      else if (/\.(asm|inc|mjs|md|json|html)$/.test(e.name))
        text(dir, p).split("\n").forEach((l, i) => term.test(l) && hits.push(`${relative(dir, resolve(dir, p))}:${i + 1}`));
    });
  walk(".");
  return { hits, none: hits.length === 0 };
}

function account(f) {
  const p = [];
  p.push(`KS36a model: prototype ${f.prototype.slice(0, 7)} against ${f.baseline}`);
  p.push(`ROM ${f.rom.used} used, ${f.rom.free} free (reference ${f.rom.reference.used}/${f.rom.reference.free}), net ${-f.rom.saving}, reconciled ${f.rom.reconciled}, contiguous ${f.rom.contiguous}, ${f.rom.sha256.slice(0, 16)}`);
  p.push(`table ${JSON.stringify({ ...f.table, stated: undefined, entries: undefined })}`);
  p.push(`entries ${JSON.stringify(f.table.entries)}`);
  p.push(`services ${JSON.stringify(f.services)}`);
  p.push(`stackWithin ${JSON.stringify(f.stackWithin)}`);
  p.push(`TPA ${JSON.stringify(f.tpa.prototype)} (${JSON.stringify(f.tpa.reference)})`);
  p.push(`stacks ${JSON.stringify(f.stacks.prototype)} (${JSON.stringify(f.stacks.reference)})`);
  p.push(`removed ${JSON.stringify(f.removed)}`);
  p.push(`files ${JSON.stringify(f.files)}`);
  p.push(`none left ${JSON.stringify(f.noneLeft)}`);
  p.push(`reproducible ${f.reproducible.same ?? JSON.stringify(f.reproducible).slice(0, 60)}`);
  return p.join("\n") + "\n";
}

const LANDED = M.arg("--landed", "HEAD");
const REFERENCE = M.arg("--reference", "a1c4141");
const slice = (set) => set.slice(...(M.arg("--slice") ?? "0:9999").split(":").map(Number));

async function main() {
  const t0 = Date.now();
  if (process.argv.includes("--sets-only")) {
    if (process.argv.includes("--list")) {
      console.log(MUTANTS_KS36A.map((m, i) => `${i}: ${m.name}`).join("\n"));
      return;
    }
    const got = await mutate(await M.prepared(WORK, "landed", LANDED), WORK, slice(MUTANTS_KS36A));
    writeFileSync(M.arg("--out"), JSON.stringify({ prototype: M.commit(LANDED), ...got }, null, 2) + "\n");
    M.log(`mutants ${got.mutantScore.caught} of ${got.mutantScore.total} caught; done in ${Math.round((Date.now() - t0) / 1000)} s`);
    return;
  }
  const [landed, reference] = await Promise.all([M.prepared(WORK, "landed", LANDED), M.prepared(WORK, "reference", REFERENCE)]);
  M.log("measuring");
  const tpaL = await M.tpaTable(SCRIPT, landed);
  const tpaR = await M.tpaTable(SCRIPT, reference);
  const censusL = await M.stackCensus(landed);
  const censusR = await M.stackCensus(reference);
  const rom = M.romSection(landed, reference);
  const t = table(landed);
  const svc = await M.worker(SCRIPT, { task: "services", dir: landed });
  const stackWithin = Object.fromEntries(Object.entries(t.stated).map(([n, v]) => [n, { stated: v.stack, measured: svc.services[n]?.stack, within: (svc.services[n]?.stack ?? Infinity) <= v.stack }]));
  const [fl, fr] = [fileSpans(landed), fileSpans(reference)];
  const figures = {
    ...M.heading(REFERENCE, landed, LANDED),
    rom,
    table: t,
    services: svc,
    stackWithin,
    allWithin: Object.values(stackWithin).every((v) => v.within),
    tpa: { prototype: tpaL, reference: tpaR },
    cards: { prototype: M.rom(landed).census.ram.cards, reference: M.rom(reference).census.ram.cards },
    stacks: M.stackFigures(censusL, censusR, landed, M.svclim(landed)),
    removed: removed(landed),
    files: Object.fromEntries([...new Set([...Object.keys(fl), ...Object.keys(fr)])].map((f) => [f, { prototype: fl[f] ?? 0, reference: fr[f] ?? 0, change: (fl[f] ?? 0) - (fr[f] ?? 0) }])),
    noneLeft: noneLeft(landed),
    reproducible: await M.reproducible(landed),
  };
  if (process.argv.includes("--mutants")) Object.assign(figures, await mutate(landed, WORK, slice(MUTANTS_KS36A)));
  writeFileSync(M.arg("--out"), JSON.stringify(figures, null, 2) + "\n");
  process.stderr.write(account(figures));
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
