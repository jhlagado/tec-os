#!/usr/bin/env node
// Exercise the shared DMA/read helper under LOADA's saved-user frame and
// at LOADLIM's scratch read, with and without a resident display service.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, rom } from "./lib/model.mjs";
import { Machine } from "../host/machine.mjs";
import { makeSvc } from "./lib/svc.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";
const glcd = (await makeSvc(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/ccp-load-svc") })).file;
const dirs = [process.argv[2] ?? resolve(ROOT, "build/ccp-model/incumbent"), process.argv[3] ?? resolve(ROOT, "build/ccp-model/combined")];
const output = process.argv[4] ?? resolve(ROOT, "build/ccp-model/load.json");
const volume = (image) => { const v = findVolume(parseContainer(image), "A"); return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false }); };
function boot(r, image, resident) {
  const m = new Machine({ rom: r.image, symbols: r.symbols, sdImage: image, glcd: resident, matrix: resident, clock: new Date(2026, 0, 1) });
  m.runUntil(() => m.ready() && /A>$/.test(m.text()), 200000000, "prompt");
  return m;
}
function run(r, resident, delta) {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }]);
  if (resident) { volume(image).write("GLCD.SVC", glcd); volume(image).write("STARTUP.CMD", Buffer.from("GLCD.SVC\r\n\x1a")); }
  const calibrated = boot(r, image.slice(), resident);
  const ceiling = calibrated.read(7) << 8;
  const bytes = ceiling - 0x100 + delta;
  const program = new Uint8Array(bytes).fill(0x76); program[0] = 0xc9;
  volume(image).write("EDGE.COM", program); // user 0 only; command runs from user 3
  const m = boot(r, image, resident);
  assert.equal(m.read(7) << 8, ceiling, "calibrated resident ceiling");
  m.command("USER 3");
  const top = m.sym("CSTKTOP"), guard = m.sym("STKGUARD"), base = m.sym("CSTKBAS");
  const before = [...Array(32).keys()].map((i) => m.read(ceiling + i));
  let peak = 0, setDmaPeak = 0, limits = 0, entries = 0;
  const hits = [], write = m.cpu.hardware.memWrite, step = m.step.bind(m);
  const clearSites = [];
  for (let a = m.sym("CPMINIT"); a < m.sym("CPMIG"); a++) if (m.read(a) === 0xed && m.read(a + 1) === 0xb0) clearSites.push(a);
  assert.equal(clearSites.length, 1, "one known workspace-initialization LDIR");
  m.cpu.hardware.memWrite = (a, v) => {
    if (a >= guard && a < base) {
      const clear = v === 0 && (m.pc === clearSites[0] || m.pc === clearSites[0] + 1);
      const fill = v === 0xa5 && (m.pc === m.sym("CPMIG") || m.pc === m.sym("CPMIG") + 1);
      if (!clear && !fill) hits.push([m.pc, a, v]);
    }
    write(a, v);
  };
  m.step = () => {
    const sp = m.cpu.cpu.sp;
    if (sp >= guard && sp <= top) {
      peak = Math.max(peak, top - sp);
      if (m.pc === 5 && m.cpu.cpu.c === 26) setDmaPeak = Math.max(setDmaPeak, top - sp);
    }
    if (m.pc === m.sym("LOADLIM")) limits++;
    if (m.pc === 0x100) entries++;
    return step();
  };
  const from = m.output.length, start = m.cycles;
  m.type("EDGE\r");
  m.runUntil(() => m.ready() && m.read(m.sym("CHPOS")) === 0 && /A>$/.test(m.text(from)), 600000000, "loaded program or refusal");
  assert.equal(entries, delta <= 0 ? 1 : 0, "exact ceiling accepted, one record beyond refused");
  assert.equal(limits, delta >= 0 ? 1 : 0, "LOADLIM reached only at the ceiling");
  assert.deepEqual([...Array(32).keys()].map((i) => m.read(ceiling + i)), before, "ceiling bytes remain untouched");
  assert.equal(m.read(4), 0x30, "user 3 restored after user-0 search");
  assert.deepEqual(hits, [], "guard never written by a stack frame");
  assert.deepEqual(m.violations, []);
  return { resident, delta, ceiling, bytes, output: m.text(from), entries, limits, driveUser: m.read(4), peak, setDmaPeak, cycles: m.cycles - start };
}
const result = { romHashes: dirs.map((d) => createHash("sha256").update(rom(d).image).digest("hex")), runs: [] };
for (const resident of [false, true]) for (const delta of [-128, 0, 128]) {
  const pair = dirs.map((dir) => run(rom(dir), resident, delta));
  const visible = ({ peak, setDmaPeak, cycles, ...r }) => r;
  assert.deepEqual(visible(pair[1]), visible(pair[0]), `resident ${resident}, delta ${delta}`);
  result.runs.push({ resident, delta, equivalent: true, reference: pair[0], candidate: pair[1] });
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.error(`resident ${resident}, delta ${delta}: matched, peak ${pair[1].peak}, SETDMA ${pair[1].setDmaPeak}`);
}
console.log(JSON.stringify(result, null, 2));
