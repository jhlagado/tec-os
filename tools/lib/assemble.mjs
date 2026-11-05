// Assemble a stand-alone program (a CP/M COM file or a TEC-OS .TNX) with ATOM.

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Assemble SOURCE; bytes start at `base` (0100h for COM, 0780h for .TNX). */
export async function assembleProgram(source, { base = 0x100 } = {}) {
  const { assembleAtomProject, materializeAtomGeneration, writeAtomD8 } = await import("atom-z80");
  const src = resolve(source);
  readFileSync(src);
  const r = await assembleAtomProject({ root: ROOT, entry: relative(ROOT, src) });
  const { bytes } = materializeAtomGeneration(r.generation, { base });
  const symbols = Object.fromEntries(
    writeAtomD8(r.project, r.generation, { base }).symbols.map((s) => [s.name, s.address ?? s.value]),
  );
  return { bytes, symbols };
}
