// PRL files, made as Digital Research made them: the source assembled at
// origin 0000h and at 0100h, with a bitmap bit for each byte that differs
// (each must differ by exactly 1, the high byte of an address). A 256-byte
// header gives the code length; then the code for 0100h and the bitmap.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { assembleProgram } from "./assemble.mjs";

/** SOURCE assembled at ORIGIN: its "ORG $0100" line rewritten in a copy in WORK. */
export async function assembleAt(source, origin, work) {
  if (origin === 0x100) return (await assembleProgram(source, { base: origin })).bytes;
  const text = readFileSync(source, "utf8");
  const org = /^(\s+ORG\s+)\$0100\s*$/m;
  if (!org.test(text)) throw new Error(`${source} has no "ORG $0100" line`);
  const hex = origin.toString(16).toUpperCase().padStart(4, "0");
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  mkdirSync(work, { recursive: true });
  const copy = resolve(work, `${basename(source, ".asm")}-${digest}-at${hex}.asm`);
  writeFileSync(copy, text.replace(org, (_, lead) => `${lead}$${hex}`));
  return (await assembleProgram(copy, { base: origin })).bytes;
}

/** The PRL file for SOURCE, its 0000h assembly, for the bitmap, made in WORK. */
export async function makePrl(source, work) {
  const at0 = await assembleAt(source, 0, work);
  const at1 = await assembleAt(source, 0x100, work);
  const n = at0.length;
  if (at1.length !== n) throw new Error(`${source}: the two assemblies differ in length`);
  const bitmap = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i += 1) {
    if (at0[i] === at1[i]) continue;
    if (((at0[i] + 1) & 0xff) !== at1[i]) throw new Error(`${source}: byte ${i} is not relocatable`);
    bitmap[i >> 3] |= 0x80 >> (i & 7);
  }
  const file = new Uint8Array(256 + n + bitmap.length);
  file.set([0, n & 0xff, n >> 8]);
  file.set(at1, 256);
  file.set(bitmap, 256 + n);
  return file;
}
