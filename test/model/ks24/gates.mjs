// KS24's gates on the Debug80 host machine, for a built tree: the reset
// fetch trace, (0006h) on the starter card, and every table entry reached
// through an include by TABLE (table.asm). The machine, the card tools and
// ATOM are the tree's own.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HERE } from "./draft.mjs";

const hex = (v, w = 4) => v.toString(16).toUpperCase().padStart(w, "0") + "h";

async function load(dir) {
  const m = (p) => import(pathToFileURL(resolve(dir, p)));
  const [machine, container, atom] = await Promise.all([m("host/machine.mjs"), m("tools/lib/container.mjs"), import("atom-z80")]);
  return { ...machine, ...container, atom };
}

/** The starter card's volumes, as tools/media.mjs makes them. */
const starter = (lib) =>
  lib.createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true },
  ]);

/** TABLE assembled at 7000h with INC (abi.inc or abi27.inc) beside it. */
async function probe(lib, work, inc) {
  mkdirSync(work, { recursive: true });
  copyFileSync(resolve(HERE, "table.asm"), resolve(work, "table.asm"));
  copyFileSync(inc, resolve(work, "abi.inc"));
  const r = await lib.atom.assembleAtomProject({ root: work, entry: "table.asm" });
  const { bytes } = lib.atom.materializeAtomGeneration(r.generation, { base: 0x7000 });
  const symbols = Object.fromEntries(lib.atom.writeAtomD8(r.project, r.generation, { base: 0x7000 }).symbols.map((s) => [s.name, s.address ?? s.value]));
  return { bytes, done: symbols.DONE };
}

/**
 * Boot PROFILE of the tree at DIR from reset on the starter card, tracing
 * every instruction fetched below 0800h until the first OUT (SYSLAT), then
 * to the first prompt. Then (0006h), and TABLE's results.
 */
export async function gates(dir, profile, inc) {
  const lib = await load(dir);
  const rom = readFileSync(resolve(dir, "build", profile, "tecos.rom"));
  const symbols = lib.symbolsFromD8(JSON.parse(readFileSync(resolve(dir, "build", profile, "tecos.d8.json"), "utf8")));
  const card = starter(lib);
  const m = new lib.Machine({ rom, symbols, sdImage: card, tms: true, matrix: true, clock: new Date(2026, 0, 1, 12, 0, 0) });

  // The reset trace. An instruction's fetched bytes: JP nn is 3; anything
  // else below 0800h is listed by its opcode.
  const low = [];
  let latch = null;
  let next = null;
  const LEN = { 0x31: 3, 0xf3: 1, 0xc3: 3 };
  while (latch === null) {
    const pc = m.pc;
    const op = m.read(pc);
    if (pc < 0x800) low.push({ pc, op, bytes: LEN[op] ?? 1 });
    if (op === 0xd3 && m.read(pc + 1) === 0xff) latch = pc;
    m.step();
    if (next === null && pc < 0x800 && m.pc >= 0x800) next = m.pc;
    if (m.cycles > 1_000_000) throw new Error("no OUT (SYSLAT) in the first million T-states");
  }
  const fetched = low.flatMap(({ pc, bytes }) => Array.from({ length: bytes }, (_, i) => pc + i));
  const reset = {
    instructionsBelow0800: low.map(({ pc, op }) => `${hex(pc)} ${hex(op, 2)}`),
    bytesFetched: `${hex(Math.min(...fetched))}-${hex(Math.max(...fetched))}`,
    onlyFirstThree: fetched.every((a) => a <= 2) && fetched.length === 3,
    nextPc: hex(next),
    cold: hex(m.sym("COLD")),
    nextIsCold: next === m.sym("COLD") && next >= 0xc000,
    outSyslatAt: hex(latch),
  };
  m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the first input request");
  reset.prompt = true;
  const tpa = { bdosVector: hex(m.read(6) | (m.read(7) << 8)), bytes: (m.read(6) | (m.read(7) << 8)) - 0x100 };

  // TABLE from the prompt: a nested CCP's prompt is answered with EXIT.
  const { bytes, done } = await probe(lib, resolve(dir, "build/model-ks24-probe"), inc);
  bytes.forEach((v, i) => m.write(0x7000 + i, v));
  Object.assign(m.cpu.cpu, { sp: 0x7f00, pc: 0x7000 });
  m.mark = m.output.length;
  const start = m.mark;
  let exits = 0;
  m.runUntil(
    () => {
      if (m.pc === done) return true;
      if (m.waitingForInput() && /\r\n[A-P]>$/.test(m.text(m.mark))) {
        m.type("EXIT\r");
        m.mark = m.output.length;
        exits += 1;
      }
      return false;
    },
    400_000_000,
    "TABLE's end",
  );
  const res = Array.from({ length: 93 }, (_, i) => m.read(0x7800 + i));
  const text = m.text(start).replace(/\r/g, "");
  return { profile, reset, tpa, table: { results: res, text, exits, violations: m.violations.length } };
}

/** TABLE's results as named fields, for the report. */
export function fields(r) {
  const w = (i) => r[i] | (r[i + 1] << 8);
  return {
    signature: String.fromCharCode(...r.slice(0, 3)),
    version: `${r[3]}.${r[4]}`,
    console: `${r[5]} x ${r[6]}`,
    hwInfo: { a: r[7], b: r[8], de: w(9), hl: w(11), f: r[13] },
    hwHexB: { a: r[14], b: r[15], f: r[16] },
    mains: r[17],
    xmark: r[18],
    fontA: r.slice(19, 27),
    xmove: { a: r[27], f: r[28] },
    move: { a: r[29], f: r[30], bytes: r.slice(31, 47) },
    describe0: { a: r[47], f: r[48], descriptor: r.slice(49, 81) },
    glcdHook0: { a: r[81], f: r[82], hl: w(83) },
    xcmd: { a: r[85], f: r[86], hl: w(87) },
    xccp: { a: r[89], f: r[90], hl: w(91) },
  };
}
