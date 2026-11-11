// The stack census's watch: the lowest address written in each of the
// ROM's three stacks, an NMI pressed at each new depth, and a line typed and
// run to its prompt. test/stacks.test.mjs and test/lib/mon3.mjs's census share it.

import assert from "node:assert/strict";

/** Watch the three resident stacks of `m`, pressing an NMI at each new depth. */
export function watch(m) {
  const s = (n) => m.sym(n);
  const guardHits = [];
  const stacks = { bdos: [s("STKBASE"), s("STKTOP")], ccp: [s("CSTKBAS"), s("CSTKTOP")], bios: [s("BSTKB"), s("BSTK")] };
  const low = Object.fromEntries(Object.entries(stacks).map(([k, [, top]]) => [k, top]));
  const lowSp = { ...low };
  const [guard, guardEnd] = [s("STKGUARD"), s("STKGUEND")];
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir) for (const [k, [b, t]] of Object.entries(stacks)) if (addr >= b && addr < t && addr < low[k]) low[k] = addr;
    if (!ldir && addr >= guard && addr < guardEnd && value !== 0xa5) guardHits.push(addr);
    write(addr, value);
  };
  const step = m.step.bind(m);
  m.step = () => {
    const r = step();
    if (m.pc !== 0x66 && m.pc !== 0x67 && m.read(0x66) === 0xed && m.read(0x67) === 0x45) {
      const sp = m.cpu.cpu.sp & 0xffff;
      for (const [k, [b, t]] of Object.entries(stacks)) {
        if (sp >= b && sp <= t && sp < lowSp[k]) {
          lowSp[k] = sp;
          m.tec1g.applyKey(0x00);
        }
      }
    }
    return r;
  };
  // The pattern is set at warm boot, which the diagnostic console never reaches.
  return ({ pattern = true } = {}) => {
    assert.deepEqual(guardHits, [], "a write to STKGUARD");
    if (pattern) assert.deepEqual(Array.from({ length: guardEnd - guard }, (_, i) => m.read(guard + i)), new Array(guardEnd - guard).fill(0xa5), "STKGUARD holds its pattern");
    return Object.fromEntries(Object.entries(stacks).map(([k, [b, t]]) => [k, { reserved: t - b, deepest: t - low[k] }]));
  };
}

/**
 * Type a line and run to the prompt, answering a [more] or an error's key.
 * RE is the prompt: the CCP's unless another, such as a service's, is given.
 */
const CCP_PROMPT = /\r\n[A-P]>$/;
export function run(m, line, re = CCP_PROMPT) {
  m.mark = m.output.length;
  m.type(line);
  // Not the prompt before a line's next piece: the CCP's or the shell's own
  // line input, as Machine.ready says. Another prompt, such as MON3>, is
  // taken as it comes.
  const prompt = { test: (t) => re.test(t) && (re !== CCP_PROMPT || m.ready()) };
  let seen = -1;
  for (let i = 0; i < 400; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(m.mark))), 30_000_000, line);
    const t = m.text(m.mark);
    if (prompt.test(t) && m.waitingForInput()) return;
    if (m.output.length === seen && m.waitingForInput()) m.type(/\[more\]$/.test(t) ? " " : "\r");
    seen = m.output.length;
  }
  throw new Error(`no prompt after ${JSON.stringify(line)}: ${m.text(m.mark)}`);
}
