// Assemble a stand-alone program (a CP/M COM file or a TEC-OS .TNX) with ATOM.

import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { assembleAtomProject, materializeAtomGeneration, writeAtomD8 } from "atom-z80";

/** Assemble SOURCE; bytes start at `base` (0100h for COM, 0780h for .TNX). */
export async function assembleProgram(source, { base = 0x100 } = {}) {
  const src = resolve(source);
  readFileSync(src);
  const r = await assembleAtomProject({ root: dirname(src), entry: basename(src) });
  const { bytes } = materializeAtomGeneration(r.generation, { base });
  const symbols = Object.fromEntries(
    writeAtomD8(r.project, r.generation, { base }).symbols.map((s) => [s.name, s.address ?? s.value]),
  );
  return { bytes, symbols };
}
