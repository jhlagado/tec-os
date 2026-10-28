// Helpers for the warm boot tests (KS18): a machine that counts the blocks
// the BIOS reads, BDOS and BIOS callers, and allocation vectors read from
// memory or rebuilt by a full scan of the same card.

import { boot, standardCard } from "./fixtures.mjs";

const BACK = 0x0f00;
const STACK = 0x1000;
const FCB = 0x005c;
export const w = (m, a) => m.read(a) | (m.read(a + 1) << 8);

/**
 * A machine on IMAGE, counting the blocks the BIOS reads: each BIOS READ of
 * a block other than the last one read, whether the card or the block cache
 * serves it. With BDOS and BIOS callers.
 */
export function rig(image = standardCard()) {
  const m = boot(image);
  const cread = m.sym("CREAD");
  const lba = m.sym("SDLBA");
  let last = -1;
  let reads = 0;
  const r = { m, image };
  Object.defineProperty(r, "reads", {
    get: () => reads,
    set: (v) => [(reads = v), (last = -1)],
  });
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === cread) {
      const b = w(m, lba) + w(m, lba + 2) * 0x10000;
      if (b !== last) [(reads += 1), (last = b)];
    }
    return step();
  };
  r.call = (addr, { a = 0, c = 0, de = 0, bc } = {}) => {
    const cpu = m.cpu.cpu;
    const saved = { pc: cpu.pc, sp: cpu.sp };
    m.write(STACK - 2, BACK & 0xff);
    m.write(STACK - 1, BACK >> 8);
    Object.assign(cpu, { a, c, d: de >> 8, e: de & 0xff, sp: STACK - 2, pc: addr });
    if (bc !== undefined) Object.assign(cpu, { b: bc >> 8, c: bc & 0xff });
    m.runUntil(() => m.pc === BACK, 200_000_000, `the return from ${addr.toString(16)}`);
    const out = cpu.a;
    Object.assign(cpu, saved);
    return out;
  };
  r.bdos = (fn, de = FCB) => r.call(5, { c: fn, de });
  r.fcb = (drive, name) => [drive, ...Buffer.from(name.padEnd(11)), ...new Array(24).fill(0)].forEach((v, i) => m.write(FCB + i, v));
  /** JP 0000h, to the CCP waiting for input: T-states and blocks read. */
  r.warm = () => {
    r.reads = 0;
    const t0 = m.cycles;
    m.mark = m.output.length;
    m.cpu.cpu.pc = 0;
    m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "the prompt after a warm boot");
    return { t: m.cycles - t0, reads: r.reads };
  };
  return r;
}

/** Drive D's allocation vector as the machine holds it. */
export function alv(m, d) {
  const dph = m.sym("DPHTAB") + 16 * d;
  const dpb = w(m, dph + 10);
  return Array.from({ length: (w(m, dpb + 5) >> 3) + 1 }, (_, i) => m.read(w(m, dph + 14) + i));
}

/** Drive D's vector from a full scan: the same card cold booted, D selected. */
export function rebuilt(image, d) {
  const f = boot(new Uint8Array(image));
  if (d) f.command(`${"AB"[d]}:`);
  return alv(f, d);
}

