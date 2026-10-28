// KS20's model: the product it runs against, and small helpers.
//
// PRODUCT is a built TEC-OS tree (npm ci, npm run build); by default this
// repository. The figures in report.md come from an extract of b025dbb.

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PRODUCT = resolve(process.env.PRODUCT ?? resolve(HERE, "../../.."));
export const WORK = resolve(PRODUCT, "build/model-ks20");
mkdirSync(WORK, { recursive: true });

const load = (p) => import(pathToFileURL(resolve(PRODUCT, p)));
export const fixtures = await load("test/lib/fixtures.mjs");
export const machine = await load("test/lib/machine.mjs");
export const prlLib = await load("tools/lib/prl.mjs");
export const assemble = await load("tools/lib/assemble.mjs");
export const container = await load("tools/lib/container.mjs");

export const w = (m, a) => m.read(a) | (m.read(a + 1) << 8);
export const ms = (t) => Math.round(t / 400) / 10; // T-states at 4 MHz, in ms to 0.1

/** A symbol of the debug80 ROM, by name; throws if it is missing. */
export function symbolOf(symbols, name) {
  const v = symbols.get(name.toUpperCase());
  if (v === undefined) throw new Error(`no symbol ${name}`);
  return v;
}

/**
 * Call ADDR on M with the given registers and run to its return. The stack
 * is the 16-byte guard below the CCP's stack, which nothing uses while the
 * CCP waits for input, so a call that loads the TPA cannot overwrite it.
 * Returns the T-states, the registers after, and the carry.
 */
export function call(m, addr, { a = 0, bc = 0, de = 0, hl = 0 } = {}) {
  const cpu = m.cpu.cpu;
  const regs = ["a", "b", "c", "d", "e", "h", "l", "ix", "iy", "sp", "pc", "iff1", "iff2"];
  const saved = Object.fromEntries(regs.map((k) => [k, cpu[k]]));
  saved.flags = { ...cpu.flags };
  const back = 0x0008;
  const sp = m.sym("STKGUEND") - 2;
  m.write(sp, back & 0xff);
  m.write(sp + 1, back >> 8);
  Object.assign(cpu, { a, b: bc >> 8, c: bc & 0xff, d: de >> 8, e: de & 0xff, h: hl >> 8, l: hl & 0xff, sp, pc: addr });
  const t0 = m.cycles;
  m.runUntil(() => m.pc === back, 400_000_000, `the return from ${addr.toString(16)}`);
  const out = { t: m.cycles - t0, a: cpu.a, hl: (cpu.h << 8) | cpu.l, bc: (cpu.b << 8) | cpu.c, de: (cpu.d << 8) | cpu.e, carry: cpu.flags.C };
  Object.assign(cpu, saved);
  return out;
}
