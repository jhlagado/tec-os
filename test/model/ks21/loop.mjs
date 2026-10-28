// KS21's choice 4 and the speed gate's figures: workloads run once on
// today's ROM, with three models of the disk attached to the same run:
// today (no cache), the cache with every volume written through, and the
// cache with B: written behind. Every file is on B:, and the commands run
// there. The times are T-states of work: the machine's waits for a key are
// left out.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assemble, fixtures, machine as harness } from "../ks20/lib.mjs";
import { attach } from "./cache.mjs";
import { HERE } from "./here.mjs";
import { source } from "./source.mjs";

const { boot, standardCard, volume } = fixtures;
export const TAS = resolve(process.env.HOME, "projects/thorium/build/tas/TAS.COM");
export const EDIT = resolve(process.env.HOME, "projects/edit/dist/EDIT.COM");

const MODES = { today: { lines: 0 }, writeThrough: { wb: null }, writeBehind: { wb: 1 } };

async function rig(cost, files) {
  const image = standardCard();
  const b = volume(image, "B");
  for (const [n, data] of Object.entries(files)) b.write(n, data);
  const m = boot(image, { tms: true, matrix: true });
  const sims = Object.fromEntries(Object.entries(MODES).map(([k, o]) => [k, attach(m, { ...o, cost })]));
  const cmd = (line) => m.command(line, { prompt: /\r\nB>$/, maxCycles: 6_000_000_000 });
  cmd("B:");
  /** The modelled T-states of FN's work, in each mode. */
  const time = (fn) => {
    const marks = Object.fromEntries(Object.entries(sims).map(([k, s]) => [k, s.mark()]));
    fn();
    return Object.fromEntries(Object.entries(sims).map(([k, s]) => [k, s.since(marks[k])]));
  };
  return { m, image, sims, cmd, time };
}

/** One round of the loop: edit X.ASM (a ';' at its start, save, quit), TAS X, run X. */
function round(r) {
  const { m, cmd, time, sims } = r;
  const screen = () => m.screen();
  const quiet = (n) => () => m.waitingForInput() && m.cycles - sims.today.lastDisk > n;
  const open = time(() => {
    m.mark = m.output.length;
    m.typeMatrix("edit x.asm\r");
    m.runUntilChecked(() => m.waitingForInput() && /X: prints a line/.test(screen()[0] ?? ""), 2_000_000_000, "the editor's first screen");
  });
  const before = sims.today.counts.cardWrites;
  const save = time(() => {
    m.typeMatrix(";");
    m.typeMatrix("\x13");
    m.runUntilChecked(() => sims.today.counts.cardWrites > before && quiet(4_000_000)(), 2_000_000_000, "the save");
  });
  const quit = time(() => {
    m.typeMatrix("\x11");
    m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => l.startsWith("B>")), 2_000_000_000, "the prompt");
  });
  const assembleIt = time(() => cmd("TAS X"));
  const run = time(() => cmd("X"));
  const parts = { open, save, quit, assemble: assembleIt, run };
  const total = Object.fromEntries(Object.keys(MODES).map((k) => [k, Object.values(parts).reduce((a, p) => a + p[k], 0)]));
  return { ...parts, total };
}

const seconds = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, +(v / 4e6).toFixed(2)]));

export async function loopModel(cost) {
  const readf = (await assemble.assembleProgram(resolve(HERE, "readf.asm"))).bytes;
  const data = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + 7) & 0xff);
  const out = { inputs: {} };
  // The speed gate: a 16 KiB save, a 12 KiB file read again, a 20 KiB scan read again.
  {
    const r = await rig(cost, { "READF.COM": readf, "R12.DAT": data(12 * 1024), "R20.DAT": data(20 * 1024) });
    out.save16 = r.time(() => r.cmd("SAVE 64 S16.COM"));
    r.cmd("ERA S16.COM");
    out.reread12 = { first: r.time(() => r.cmd("READF R12.DAT")), second: r.time(() => r.cmd("READF R12.DAT")) };
    out.scan20 = { first: r.time(() => r.cmd("READF R20.DAT")), second: r.time(() => r.cmd("READF R20.DAT")) };
    out.speedCounts = Object.fromEntries(Object.entries(r.sims).map(([k, s]) => [k, s.counts]));
  }
  // The development loop, a source under 15 KiB and one over: two rounds,
  // the second reported.
  const tas = readFileSync(TAS);
  const edit = readFileSync(EDIT);
  out.inputs = { "TAS.COM": tas.length, "EDIT.COM": edit.length };
  for (const [label, size] of [["source10k", 10 * 1024], ["source20k", 20 * 1024]]) {
    const r = await rig(cost, { "EDIT.COM": edit, "TAS.COM": tas, "X.ASM": source(size) });
    round(r);
    const second = round(r);
    out[label] = { sourceBytes: size, ...second, seconds: Object.fromEntries(Object.entries(second).map(([k, v]) => [k, seconds(v)])) };
    out[label].counts = Object.fromEntries(Object.entries(r.sims).map(([k, s]) => [k, s.counts]));
  }
  harness.EXPAND1_WRITES.splice(0);
  const ratio = (a, b) => +(a / b).toFixed(2);
  out.gate = {
    save16WriteThroughOverWriteBehind: ratio(out.save16.writeThrough, out.save16.writeBehind),
    save16TodayOverWriteBehind: ratio(out.save16.today, out.save16.writeBehind),
    reread12TodayOverCache: ratio(out.reread12.second.today, out.reread12.second.writeThrough),
    scan20CacheOverToday: ratio(out.scan20.second.writeThrough, out.scan20.second.today),
  };
  return out;
}
