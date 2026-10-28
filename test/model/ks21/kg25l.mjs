#!/usr/bin/env node
// KG25 (l), measured at the build: the product's ROM against f49e380's
// (test/fixtures/rom-f49e380.json), both run, not modelled. Times are
// T-states of work, the machine's waits for a key left out. Every file is
// on B:, and the commands run there.
//
//   (l1) a 16 KiB SAVE on B: written behind, against B: written through,
//        at least 2.8 times faster;
//   (l2) a 12 KiB file read again, against f49e380, at least 4.5 times;
//   (l3) a 20 KiB file read again, against f49e380, at most 5 percent slower;
//   (l4) a round of EDIT, TAS and the program with a 10 KiB source on B:
//        written behind, against f49e380, at least 15 percent faster.
//
//   node test/model/ks21/kg25l.mjs > kg25l.json

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assemble, fixtures, machine as harness } from "../ks20/lib.mjs";
import { attach } from "./cache.mjs";
import { HERE } from "./here.mjs";
import { EDIT, TAS } from "./loop.mjs";
import { source } from "./source.mjs";

const { container } = await import("../ks20/lib.mjs");
const { Machine } = harness;
const { TEST_CLOCK, romFor, volume } = fixtures;

function f49e380() {
  const f = JSON.parse(readFileSync(resolve(HERE, "../../fixtures/rom-f49e380.json"), "utf8"));
  return { rom: Buffer.from(f.rom, "base64"), symbols: new Map(Object.entries(f.symbols).map(([k, v]) => [k.toUpperCase(), v])) };
}

function rig(rom, { wb = false, files = {} } = {}) {
  const image = container.createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: wb },
  ]);
  const b = volume(image, "B");
  for (const [n, data] of Object.entries(files)) b.write(n, data);
  const m = new Machine({ ...rom, sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the first input request");
  const t = attach(m, { lines: 0, cost: {} });
  const cmd = (line) => m.command(line, { prompt: /\r\nB>$/, maxCycles: 6_000_000_000 });
  cmd("B:");
  const time = (fn) => {
    const mk = t.mark();
    fn();
    return t.since(mk);
  };
  return { m, t, cmd, time };
}

/** One round: EDIT X.ASM, a ';' at its start, ^S, ^Q; TAS X; X. */
function round(r) {
  const { m, t, cmd, time } = r;
  return time(() => {
    m.typeMatrix("edit x.asm\r");
    m.runUntilChecked(() => m.waitingForInput() && /X: prints a line/.test(m.screen()[0] ?? ""), 2_000_000_000, "the editor");
    const before = t.counts.cardWrites + t.avg.nw;
    m.typeMatrix(";");
    m.typeMatrix("\x13");
    m.runUntilChecked(() => t.avg.nw + t.counts.cardWrites > before && m.waitingForInput() && m.cycles - t.lastDisk > 4_000_000, 2_000_000_000, "the save");
    m.typeMatrix("\x11");
    m.runUntilChecked(() => m.waitingForInput() && m.screen().some((l) => l.startsWith("B>")), 2_000_000_000, "the prompt");
    cmd("TAS X");
    cmd("X");
  });
}

const readf = (await assemble.assembleProgram(resolve(HERE, "../../programs/readf.asm"))).bytes;
const data = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + 7) & 0xff);
const now = romFor();
const old = f49e380();
const out = {};

// (l1)
{
  const wt = rig(now);
  const wb = rig(now, { wb: true });
  out.save16 = { writeThrough: wt.time(() => wt.cmd("SAVE 64 S16.COM")), writeBehind: wb.time(() => wb.cmd("SAVE 64 S16.COM")) };
  out.save16.ratio = +(out.save16.writeThrough / out.save16.writeBehind).toFixed(2);
}
// (l2), (l3): the second of two runs, on the build and on f49e380
for (const [label, size] of [["reread12", 12 * 1024], ["scan20", 20 * 1024]]) {
  const files = { "READF.COM": readf, "R.DAT": data(size) };
  const row = {};
  for (const [k, rom] of [["f49e380", old], ["build", now]]) {
    const r = rig(rom, { files });
    r.time(() => r.cmd("READF R.DAT"));
    row[k] = r.time(() => r.cmd("READF R.DAT"));
  }
  row.ratio = +(row.f49e380 / row.build).toFixed(2);
  out[label] = row;
}
// (l4): the second of two rounds
{
  const files = { "EDIT.COM": readFileSync(EDIT), "TAS.COM": readFileSync(TAS), "X.ASM": source(10 * 1024) };
  const row = {};
  for (const [k, rom, wb] of [["f49e380", old, false], ["buildWriteBehind", now, true]]) {
    const r = rig(rom, { wb, files });
    round(r);
    row[k] = round(r);
  }
  row.faster = +(1 - row.buildWriteBehind / row.f49e380).toFixed(3);
  out.round10k = row;
}
harness.EXPAND1_WRITES.splice(0);
out.pass = {
  l1: out.save16.ratio >= 2.8,
  l2: out.reread12.ratio >= 4.5,
  l3: out.scan20.build / out.scan20.f49e380 <= 1.05,
  l4: out.round10k.faster >= 0.15,
};
console.log(JSON.stringify(out, null, 2));
