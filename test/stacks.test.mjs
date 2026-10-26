// Stack high-water marks under the heaviest workloads in the suite. Every
// memory write is watched; the lowest address written in each stack (other
// than by the LDIR that clears the workspace at warm boot) gives its depth.
// Emulator evidence; the figures go to build/stack-census.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, program, standardCard, volume } from "./lib/fixtures.mjs";

test("measured stack depths stay inside their reservations", { timeout: 900_000 }, async () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PROBE.COM", (await program("probe")).bytes);
  a.write("DATA.BIN", new Uint8Array(20000).map((_, i) => i & 0xff));
  const m = boot(image, { tms: true, matrix: true });
  const s = (n) => m.sym(n);
  const stacks = {
    bdos: [s("STKBASE"), s("STKTOP")],
    ccp: [s("CSTKBAS"), s("CSTKTOP")],
    bios: [s("BSTKB"), s("BSTK")],
  };
  const low = Object.fromEntries(Object.entries(stacks).map(([k, [, top]]) => [k, top]));
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir =
      (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir) {
      for (const [k, [base, top]] of Object.entries(stacks)) {
        if (addr >= base && addr < top && addr < low[k]) low[k] = addr;
      }
    }
    write(addr, value);
  };
  for (const cmd of ["PROBE", "COPY DATA.BIN B:DATA.CPY", "DIR B:", "SAVE 4 S.COM", "TYPE S.COM", "ERA S.COM"]) {
    m.command(cmd, { maxCycles: 2_000_000_000 });
  }
  const census = Object.fromEntries(
    Object.entries(stacks).map(([k, [base, top]]) => [k, { reserved: top - base, deepest: top - low[k] }]),
  );
  census.workload = "PROBE, COPY of 20000 bytes A: to B:, DIR, SAVE, TYPE, ERA; TMS9918 console on";
  mkdirSync(resolve(ROOT, "build"), { recursive: true });
  writeFileSync(resolve(ROOT, "build/stack-census.json"), JSON.stringify(census, null, 2) + "\n");
  console.log(JSON.stringify(census));
  for (const [k, v] of Object.entries(census)) {
    if (typeof v === "object") assert.ok(v.deepest < v.reserved, `${k} used ${v.deepest} of ${v.reserved}`);
  }
  assert.deepEqual(m.violations, []);
});
