#!/usr/bin/env node
// Observable DIR edge cases and two explicit negative controls. Mutants
// alter one verified instruction byte in a private ROM copy, never a build.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, rom } from "./lib/model.mjs";
import { Machine } from "../host/machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";
const dirs = [process.argv[2] ?? resolve(ROOT, "build/ccp-model/incumbent"), process.argv[3] ?? resolve(ROOT, "build/ccp-model/combined")];
const output = process.argv[4] ?? resolve(ROOT, "build/ccp-model/dir.json");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const cases = [
  { name: "empty", files: 0 }, { name: "system-only", files: 0, system: true },
  { name: "singular", files: 1 }, { name: "column-boundary", files: 7 }, { name: "count-high-byte", files: 256 },
];
function run(r, spec, command = "DIR") {
  const image = createContainer([{ geometry: "G8M", label: "SYSTEM", mount: "A" }]);
  const v = findVolume(parseContainer(image), "A");
  const a = new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
  for (let n = 0; n < spec.files; n++) a.write(`F${String(n).padStart(3, "0")}.DAT`, Uint8Array.of(n));
  if (spec.system) a.write("SECRET.DAT", Uint8Array.of(99), { system: true });
  const before = sha(image);
  const m = new Machine({ rom: r.image, symbols: r.symbols, sdImage: image, glcd: false, clock: new Date(2026, 0, 1) });
  m.runUntil(() => m.ready() && /A>$/.test(m.text()), 200000000, "initial prompt");
  const from = m.output.length;
  m.type(command + "\r");
  let pauses = 0;
  const idle = () => m.ready() && m.read(m.sym("CHPOS")) === 0 && /A>$/.test(m.text(from));
  while (!idle()) {
    m.runUntil(() => idle() || (m.waitingForInput() && m.text(from).endsWith("[more]")), 600000000, "page or final prompt");
    if (!idle()) { assert.ok(++pauses <= 8, "bounded directory pages"); m.type(" "); }
  }
  assert.deepEqual(m.violations, []);
  assert.equal(sha(image), before, "DIR does not alter persisted storage");
  return { output: m.text(from), pauses, driveUser: m.read(4), cardHash: sha(image) };
}
const [reference, candidate] = dirs.map((dir) => rom(dir));
const result = { romHashes: [sha(reference.image), sha(candidate.image)], cases: [], controls: [] };
for (const spec of cases) {
  const pair = [reference, candidate].map((r) => run(r, spec));
  assert.deepEqual(pair[1], pair[0], spec.name);
  if (spec.files === 0) assert.match(pair[1].output, /NO FILE/);
  if (spec.system) assert.doesNotMatch(pair[1].output, /SECRET/);
  if (spec.files === 1) assert.match(pair[1].output, /1 file, /);
  if (spec.files === 256) assert.match(pair[1].output, /256 files, /);
  result.cases.push({ ...spec, equivalent: true, observation: pair[1] });
}
function changed(label, offset, before, after) {
  const image = Uint8Array.from(candidate.image), at = candidate.symbols.get(label) - 0xc000 + offset;
  assert.equal(image[at], before, `${label}+${offset} opcode prerequisite`);
  image[at] = after;
  return { ...candidate, image };
}
const columns = run(changed("DIRPAD", 3, 0x35, 0x34), cases[3]); // DEC (HL) -> INC (HL)
assert.notEqual(columns.output, result.cases[3].observation.output, "wrong column counter is distinguished");
result.controls.push({ name: "column-counter-increments", detected: true, output: columns.output });
const normal = run(candidate, cases[2], "DIRX");
assert.match(normal.output, /DIRX\?/);
const delimiter = run(changed("KEYEND", 4, 0x20, 0x58), cases[2], "DIRX"); // accepts X instead of space
assert.notEqual(delimiter.output, normal.output, "wrong keyword delimiter is distinguished");
assert.match(delimiter.output, /F000\.DAT/, "the mutant actually dispatches DIR");
result.controls.push({ name: "keyword-accepts-X", detected: true, normal: normal.output, mutated: delimiter.output });
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
