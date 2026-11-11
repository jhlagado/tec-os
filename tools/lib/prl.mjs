// PRL files, as Digital Research laid them out: the source assembled at two
// origins a page apart, 0100h and 0200h, with a bitmap bit for each byte that
// differs (each must differ by exactly 1, the high byte of an address). A
// 256-byte header gives the code length; then the code for 0100h and the bitmap.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { assembleProgram } from "./assemble.mjs";

/**
 * PATH from DIR as the disk spells it: each part matched without regard to
 * case, as CP/M and TAS match names, so %INCLUDE "ABI.INC" finds abi.inc on a
 * case-sensitive file system too (B2). An exact spelling is taken first; a part
 * found in no spelling is left as written, for the assembler's own message.
 */
export function onDisk(dir, path) {
  let at = isAbsolute(path) ? resolve("/") : resolve(dir);
  for (const part of path.split(/[\\/]/)) {
    if (part === "" || part === "." || part === "..") {
      at = resolve(at, part || ".");
      continue;
    }
    let names = [];
    try {
      names = readdirSync(at);
    } catch {}
    at = resolve(at, names.includes(part) ? part : names.find((n) => n.toLowerCase() === part.toLowerCase()) ?? part);
  }
  return at;
}

/** A source's one "ORG $0100" line, indented, with nothing after it. */
export const ORG_LINE = /^([ \t]+ORG[ \t]+)\$0100[ \t]*\r?$/m;

/**
 * SOURCE assembled at ORIGIN, its "ORG $0100" line rewritten in a copy in
 * WORK: { bytes, symbols }, as assembleProgram gives them.
 */
export async function assembleAt(source, origin, work) {
  if (origin === 0x100) return assembleProgram(source, { base: origin });
  const text = readFileSync(source, "utf8");
  if (!ORG_LINE.test(text)) throw new Error(`${source} has no "ORG $0100" line`);
  const hex = origin.toString(16).toUpperCase().padStart(4, "0");
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  // The copy keeps the source's own name, which TAS takes as a CP/M name.
  const dir = resolve(work, `${basename(source, ".asm")}-${digest}-at${hex}`);
  mkdirSync(dir, { recursive: true });
  const copy = resolve(dir, basename(source));
  const repoint = (t) => t.replace(/^(%INCLUDE\s+")([^"]+)"/gm, (_, head, p) => `${head}${relative(dir, onDisk(dirname(source), p))}"`);
  writeFileSync(copy, repoint(text.replace(ORG_LINE, (_, lead) => `${lead}$${hex}`)));
  return assembleProgram(copy, { base: origin });
}

/** The PRL file for SOURCE, its 0200h assembly, for the bitmap, made in WORK. */
export async function makePrl(source, work) {
  const at1 = (await assembleAt(source, 0x100, work)).bytes;
  const at2 = (await assembleAt(source, 0x200, work)).bytes;
  const n = at1.length;
  if (at2.length !== n) throw new Error(`${source}: the two assemblies differ in length`);
  const bitmap = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i += 1) {
    if (at1[i] === at2[i]) continue;
    if (((at1[i] + 1) & 0xff) !== at2[i]) throw new Error(`${source}: byte ${i} is not relocatable`);
    bitmap[i >> 3] |= 0x80 >> (i & 7);
  }
  const file = new Uint8Array(256 + n + bitmap.length);
  file.set([0, n & 0xff, n >> 8]);
  file.set(at1, 256);
  file.set(bitmap, 256 + n);
  return file;
}
