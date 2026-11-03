#!/usr/bin/env node
// KS36b's model: the block cache's replacement rule and size, on the other
// study's development loop (P2: tools/t4/timing.mjs, ^T B and ^T R in TED on a
// small source and a 30K one). For each size, 30, 20, 10 and 5 lines, a tree
// of REV with NLINES changed is built and the loop timed on it, today's rule,
// turn by turn, with every BIOS READ's card block traced. The traces are then
// played through each rule: turn by turn, which must give each size's measured
// misses; a second-chance bit a line (clock); and a mark on the blocks LOADCOM
// reads, held until the next load. A miss costs what the measured runs say a
// miss costs; the other rules' seconds are the measured turn-by-turn seconds
// plus their change in misses at that cost. One size is played again with a
// run-time mount, which takes a scratch line and drops it, before each build.
//
//   node tools/ks36b-model.mjs [--landed REV] [--sizes 30,20,10,5] --ted TED.COM
//        --sym TED.SYM --tas TAS.COM --timing PATH/timing.mjs --out FILE
//
// Each timing runs as its own process, one at a time.

import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as M from "./lib/model.mjs";

const WORK = resolve(M.ROOT, "build/model-ks36b");
const LANDED = M.arg("--landed", "HEAD");
const SIZES = M.arg("--sizes", "30,20,10,5").split(",").map(Number);
const HZ = 4_000_000;

// The tracer, added to a model tree's fixtures only: each machine's BIOS READs,
// with the card block, whether the line held it, and whether LOADCOM asked.
const TRACER = `
const KS36B_RUNS = [];
if (process.env.KS36B_TRACE) process.on("exit", () => writeFileSync(process.env.KS36B_TRACE, JSON.stringify(KS36B_RUNS)));
function ks36bTrace(m) {
  if (!process.env.KS36B_TRACE) return;
  const at = (n) => { try { return m.sym(n); } catch { return -1; } }; // a tree without one (CREFR after KS36b) never matches
  const [cread, ctake, cfill, loadcom, cmdrun, badcmd, sdlba, crefr, bentry] = ["CREAD", "CTAKE", "CFILL", "LOADCOM", "CMDRUN", "BADCMD", "SDLBA", "CREFR", "BENTRY"].map(at);
  const run = { reads: [], writes: 0, loop: -1 };
  KS36B_RUNS.push(run);
  let loading = false, inRead = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.cpu.cpu.pc & 0xffff;
    if (pc === bentry && m.cpu.cpu.c === 47 && run.loop < 0) run.loop = run.reads.length; // the loop's key: TED's chain
    if (pc === loadcom) loading = true;
    else if (pc === cmdrun || pc === badcmd) loading = false;
    else if (pc === cread) {
      inRead = { block: m.read(sdlba) | (m.read(sdlba + 1) << 8) | (m.read(sdlba + 2) << 16), load: loading, hit: true, at: m.cycles };
      if (!run.reads.length) {
        // The cache as the first read finds it: each line's block (EXPAND 1's table at BC00h) and CNEXT.
        const x = m.expand[1];
        const t = at("CTAB") - 0x8000;
        run.start = { lines: Array.from({ length: at("NLINES") }, (_, i) => (x[t + 4 * i + 3] === 0xff ? null : x[t + 4 * i] | (x[t + 4 * i + 1] << 8) | (x[t + 4 * i + 2] << 16))), next: m.read(at("CNEXT")) };
      }
      run.reads.push(inRead);
    } else if (pc === ctake && inRead) inRead.hit = false;
    else if (pc === crefr) run.writes += 1;
    return step();
  };
}
`;

function tree(n) {
  const dir = M.tree(WORK, `lines-${n}`, LANDED);
  M.patch(dir, "src/layout.asm", "NLINES  EQU     30", `NLINES  EQU     ${n}`);
  M.patch(dir, "test/lib/fixtures.mjs", "export function boot(", `${TRACER}\nexport function boot(`);
  M.patch(dir, "test/lib/fixtures.mjs", '  m.runUntil(() => m.ready(), 200_000_000, "the first input request");\n  return m;', '  m.runUntil(() => m.ready(), 200_000_000, "the first input request");\n  ks36bTrace(m);\n  return m;');
  if (!/writeFileSync/.test(readFileSync(resolve(dir, "test/lib/fixtures.mjs"), "utf8").split("\n").slice(0, 20).join("\n")))
    M.patch(dir, "test/lib/fixtures.mjs", "import ", 'import { writeFileSync } from "node:fs";\nimport ');
  return dir;
}

// ---- The rules, played on a run's reads -----------------------------------------

/** Misses of RULE with N lines on READS; MOUNTS: read indexes before which a run-time mount takes a scratch line and drops it. */
function play(reads, n, rule, mounts = new Set(), from = 0, start = { lines: [], next: 0 }) {
  const line = Array.from({ length: n }, (_, i) => start.lines[i] ?? null); // each line's block
  const ref = new Array(n).fill(false); // second chance
  const mark = new Array(n).fill(false); // a load's block
  let hand = start.next % n;
  let misses = 0;
  let diverge = 0; // reads where the play's hit or miss isn't the machine's
  let wasLoading = false;
  const where = new Map(line.flatMap((b, i) => (b === null ? [] : [[b, i]])));
  const victim = () => {
    if (rule === "clock") {
      for (;;) {
        if (line[hand] === null || !ref[hand]) break;
        ref[hand] = false;
        hand = (hand + 1) % n;
      }
    } else if (rule === "mark") {
      for (let k = 0; k < n; k += 1) {
        const at = (hand + k) % n;
        if (line[at] === null || !mark[at]) {
          hand = at;
          break;
        }
      }
    }
    const v = hand;
    hand = (hand + 1) % n;
    return v;
  };
  const take = (block, load) => {
    const v = victim();
    if (line[v] !== null) where.delete(line[v]);
    line[v] = block;
    if (block !== null) where.set(block, v);
    ref[v] = rule === "clock";
    mark[v] = rule === "mark" && load;
    return v;
  };
  reads.forEach((r, i) => {
    if (mounts.has(i)) {
      const v = take(null, false); // the scratch line, then dropped: empty
      line[v] = null;
    }
    if (rule === "mark" && r.load && !wasLoading) mark.fill(false); // a new load: the last one's marks go
    wasLoading = r.load;
    const at = where.get(r.block);
    if ((at !== undefined) !== r.hit) diverge += 1;
    if (at !== undefined) {
      ref[at] = true;
      if (r.load) mark[at] = rule === "mark";
      return;
    }
    if (i >= from) misses += 1;
    take(r.block, r.load);
  });
  play.diverge = diverge;
  return misses;
}

async function main() {
  const t0 = Date.now();
  const [ted, sym, tas, timing] = ["--ted", "--sym", "--tas", "--timing"].map((a) => resolve(M.arg(a)));
  const measured = {};
  for (const n of SIZES) {
    const dir = tree(n);
    M.log(`lines ${n}: building`);
    await M.build(dir);
    M.log(`lines ${n}: timing`);
    const out = resolve(dir, "timing.json");
    const trace = resolve(dir, "trace.json");
    // The tool, copied unchanged into the tree, so that its imports resolve against the tree's packages.
    const t4 = resolve(dir, "build/t4");
    cpSync(dirname(timing), t4, { recursive: true });
    await M.node(dir, [resolve(t4, "timing.mjs"), ted, sym, tas, out], { env: { T4_TREE: dir, T4_RAM96: "1", KS36B_TRACE: trace } });
    const t = JSON.parse(readFileSync(out, "utf8"));
    const runs = JSON.parse(readFileSync(trace, "utf8")).filter((r) => r.reads.length);
    measured[n] = { timing: t.results, runs };
  }
  const names = Object.keys(measured[SIZES[0]].timing);
  // The traced runs are, per loop, the boot's machine: one machine a loop.
  const reads = (n, k) => measured[n].runs[k].reads;
  const from = (n, k) => measured[n].runs[k].loop;
  const loopMisses = (n, k) => reads(n, k).filter((r, i) => i >= from(n, k) && !r.hit).length;
  // A miss's cost: the loop's seconds against its misses, across the sizes (least squares).
  const rows = [];
  for (const [k, name] of names.entries()) {
    const pts = SIZES.map((n) => ({ x: loopMisses(n, k), y: measured[n].timing[name].total }));
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / (pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1);
    for (const n of SIZES) {
      const traced = reads(n, k);
      const missesTurn = loopMisses(n, k);
      const base = measured[n].timing[name].total;
      const inLoop = traced.slice(from(n, k));
      const row = { loop: name, lines: n, reads: inLoop.length, loadReads: inLoop.filter((r) => r.load).length, measuredMisses: missesTurn, secondsPerMiss: +slope.toFixed(5) };
      for (const rule of ["turn", "clock", "mark"]) {
        const misses = play(traced, n, rule, new Set(), from(n, k), measured[n].runs[k].start);
        row[rule] = { misses, seconds: +(base + (misses - missesTurn) * slope).toFixed(3) };
      }
      play(traced, n, "turn", new Set(), from(n, k), measured[n].runs[k].start);
      row.turn.matchesMeasured = row.turn.misses === missesTurn;
      row.turn.readsDiverging = play.diverge;
      rows.push(row);
    }
  }
  // A run-time mount before each program's load, at the smallest size.
  const small = Math.min(...SIZES);
  const mount = names.map((name, k) => {
    const traced = reads(small, k);
    const starts = new Set(traced.flatMap((r, i) => (i >= from(small, k) && r.load && !traced[i - 1].load ? [i] : [])));
    const slope = rows.find((r) => r.loop === name).secondsPerMiss;
    const base = measured[small].timing[name].total;
    const missesTurn = loopMisses(small, k);
    return {
      loop: name,
      lines: small,
      mounts: starts.size,
      ...Object.fromEntries(["turn", "clock", "mark"].map((rule) => { const misses = play(traced, small, rule, starts, from(small, k), measured[small].runs[k].start); return [rule, { misses, seconds: +(base + (misses - missesTurn) * slope).toFixed(3) }]; })),
    };
  });
  const figures = { landed: M.commit(LANDED), sizes: SIZES, rows, mount, timing: Object.fromEntries(SIZES.map((n) => [n, measured[n].timing])) };
  writeFileSync(M.arg("--out"), JSON.stringify(figures, null, 2) + "\n");
  for (const r of rows) M.log(`${r.loop.padEnd(10)} ${String(r.lines).padStart(2)} lines: reads ${r.reads}, misses turn ${r.turn.misses}${r.turn.matchesMeasured && !r.turn.readsDiverging ? "" : " (MEASURED " + r.measuredMisses + ", " + r.turn.readsDiverging + " reads diverge)"} ${r.turn.seconds} s, clock ${r.clock.misses} ${r.clock.seconds} s, mark ${r.mark.misses} ${r.mark.seconds} s`);
  for (const r of mount) M.log(`${r.loop.padEnd(10)} ${r.lines} lines with ${r.mounts} mounts: turn ${r.turn.misses} ${r.turn.seconds} s, clock ${r.clock.misses} ${r.clock.seconds} s, mark ${r.mark.misses} ${r.mark.seconds} s`);
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
