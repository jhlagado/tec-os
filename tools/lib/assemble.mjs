// Assemble a stand-alone program (a CP/M COM file, a MON-3 program or a test
// image) with TAS: the pinned TAS.COM, run on the host by tools/lib/tas-rom.mjs.

import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tasAssembler } from "./tas-rom.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// The runner checks its pins once, on first use.
let runner;

/**
 * Assemble SOURCE with its ORG lines as written; its image starts at `base`,
 * which must be its first ORG (0100h for COM, 4000h for a MON-3 program).
 * The symbols are TAS's globals, labels and EQUs, by name.
 */
export async function assembleProgram(source, { base = 0x100 } = {}) {
  runner ??= tasAssembler();
  const run = await runner;
  const src = resolve(source);
  readFileSync(src);
  // A source in this repository may include from anywhere in it; one outside
  // it, only from beside it.
  const inside = relative(ROOT, src);
  const root = inside.startsWith("..") || isAbsolute(inside) ? dirname(src) : ROOT;
  const { image, globals } = await run({ root, entry: relative(root, src), origin: base, phase: "program", target: basename(src), flat: true });
  const symbols = Object.fromEntries([...globals].map(([name, symbol]) => [name, symbol.value]));
  return { bytes: Uint8Array.from(image), symbols };
}
