// .SVC files. The source is assembled at 0000h and at 0100h, as a PRL is; the
// bytes that differ by exactly 1 are the fixups. The file is the image made
// for page 0, its header included, then the dependencies (least version, then
// an 8-byte name), then the relocation data.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { assembleProgram } from "./assemble.mjs";
import { FORMAT } from "./svc-format.mjs";
import { ORG_LINE, assembleAt, onDisk } from "./prl.mjs";

export { onDisk };

export const DHLEN = 25;
export { FORMAT }; // the loader's DMAGIC. Version 4 has version 1's layout: it rose with ABI 5,
// as 3 did with ABI 4, whose tables an older service would read wrongly.
// $C000 and 0C000h. A decimal or binary form of an address isn't caught.
const ROM_ADDRESS = /\$[C-Fc-f][0-9A-Fa-f]{3}\b|\b0[C-Fc-f][0-9A-Fa-f]{3}[Hh]\b/;

/** Refuse a source naming a ROM address; only abi.inc may. */
export function checkInterfaces(text, name) {
  const code = text.split("\n").map((l) => l.replace(/;.*$/, "")).join("\n");
  const hit = ROM_ADDRESS.exec(code);
  if (hit) throw new Error(`${name} names the ROM address ${hit[0]}: only abi.inc's names may be used`);
}

export const encoders = {
  bitmap(fixups, n) {
    const b = new Uint8Array(Math.ceil(n / 8));
    for (const f of fixups) b[f >> 3] |= 0x80 >> (f & 7);
    return b;
  },
  offsets(fixups) {
    return Uint8Array.from(fixups.flatMap((f) => [f & 0xff, f >> 8]));
  },
  // The gap from each fixup to the next, the first from the byte before the
  // image; 255 is a gap and no fixup.
  delta(fixups) {
    const out = [];
    let at = -1;
    for (const f of fixups) {
      let gap = f - at;
      for (; gap >= 255; gap -= 255) out.push(255);
      out.push(gap);
      at = f;
    }
    return Uint8Array.from(out);
  },
};


/** %IF expression ... %ENDIF, nested, resolved from defs. */
function conditions(text, defs) {
  const on = [true];
  const out = [];
  for (const line of text.split("\n")) {
    const m = /^%IF\s+(.*)$/.exec(line);
    if (m) on.push(on.at(-1) && Boolean(new Function(...Object.keys(defs), `return ${m[1]}`)(...Object.values(defs))));
    else if (/^%ENDIF/.test(line)) on.pop();
    else if (on.at(-1)) out.push(line);
  }
  return out.join("\n");
}

/** Fixups of the two assemblies, as offsets from `skip`. */
export function fixupsOf(at0, at1, skip, name) {
  const fixups = [];
  for (let i = 0; i < at0.length; i += 1) {
    if (at0[i] === at1[i]) continue;
    if (((at0[i] + 1) & 0xff) !== at1[i]) throw new Error(`${name}: byte ${i} is not relocatable`);
    if (i < skip) throw new Error(`${name}: byte ${i} in the header is relocatable`);
    fixups.push(i - skip);
  }
  return fixups;
}

/** An %INCLUDE line below a source's ORG, whose file is copied in. */
const BELOW = /^%INCLUDE\s+"([^"]+)"\s*$/gm;

/** The files SOURCE includes below its ORG, and those they include: paths. */
export function includedFiles(source) {
  const out = [];
  const visit = (file, text) => {
    for (const [, p] of text.matchAll(BELOW)) {
      const path = onDisk(dirname(file), p);
      out.push(path);
      visit(path, readFileSync(path, "utf8"));
    }
  };
  const text = readFileSync(source, "utf8");
  visit(source, text.slice(Math.max(0, text.search(ORG_LINE))));
  return out;
}

/**
 * The .SVC for SOURCE. defs: %IF names, EQUs and strings for the source; deps:
 * [{ name, version }]; raw: EQUs naming ROM addresses, for variants that break
 * the interface rule on purpose; reloc: an encoder's name; relocatedEntry: let
 * an execution record's entry carry a fixup, for the test of the ROM's refusal.
 */
export async function makeSvc(source, { defs = {}, deps = [], raw = {}, work, reloc = "delta", relocatedEntry = false }) {
  const text = readFileSync(source, "utf8");
  checkInterfaces(text, basename(source));
  mkdirSync(work, { recursive: true });
  const equ = [...Object.entries(defs), ...Object.entries(raw)].filter(([k, v]) => k.length <= 8 && !k.startsWith("V_") && typeof v === "number");
  const prelude = equ.map(([k, v]) => `${k.padEnd(8)}EQU     ${v}\n`).join("");
  const tag = createHash("sha256").update(JSON.stringify(defs)).digest("hex").slice(0, 12);
  const copy = resolve(work, `${basename(source, ".asm")}-${tag}.asm`);
  let body = conditions(text, defs);
  for (const [k, v] of Object.entries(defs)) if (typeof v === "string") body = body.replaceAll(k, v);
  // ATOM takes %INCLUDE only in a file's header, so those above the ORG go to it
  // with their paths moved, and one below it, the font placed last, is copied in.
  const org = body.search(ORG_LINE);
  // An included file may include others; each is held to the interface rule
  // and takes the same %IF and string definitions as the source.
  const inside = (p, dir) => {
    const path = onDisk(dir, p);
    const t = readFileSync(path, "utf8");
    checkInterfaces(t, basename(path));
    let b = conditions(t, defs);
    for (const [k, v] of Object.entries(defs)) if (typeof v === "string") b = b.replaceAll(k, v);
    return b.replace(BELOW, (_, q) => inside(q, dirname(path)));
  };
  body = body.slice(0, org).replace(/^(%INCLUDE\s+")([^"]+)"/gm, (_, head, p) => `${head}${relative(work, onDisk(dirname(source), p))}"`) + prelude + body.slice(org).replace(BELOW, (_, p) => inside(p, dirname(source)));
  // ATOM takes at most 64 KB in one source part, and the files copied in
  // make one part with the source. A line that holds only a comment is
  // blanked in the copy: every line keeps its number, and no byte changes.
  body = body.replace(/^[ \t]*;.*$/gm, "");
  writeFileSync(copy, body);
  const at0 = await assembleAt(copy, 0, work);
  const { bytes: at1, symbols } = await assembleProgram(copy, { base: 0x100 });
  if (symbols.INIT === undefined || symbols.REMOVE === undefined) throw new Error(`${source}: INIT and REMOVE required`);
  if (at0.length !== at1.length) throw new Error(`${source}: the two assemblies differ in length`);
  const fixups = fixupsOf(at0, at1, DHLEN, basename(source));
  return { ...packSvc(at0, symbols, fixups, { deps, reloc, relocatedEntry }), copy };
}

/** The offset in the image of an execution record's entry word: "EX", version 1, a state byte, then the word. */
export const EXENTRY = 4;

/**
 * Whether the image AT0 starts with an execution record. The ROM adds the
 * service's page to the record's entry itself, so the word is an offset from
 * the header, as INIT and REMOVE are, and must carry no fixup.
 */
export const hasExecRecord = (at0) => at0[DHLEN] === 0x45 && at0[DHLEN + 1] === 0x58 && at0[DHLEN + 2] === 1;

export function packSvc(at0, symbols, fixups, { deps = [], reloc = "delta", relocatedEntry = false } = {}) {
  if (!relocatedEntry && hasExecRecord(at0) && (fixups.includes(EXENTRY) || fixups.includes(EXENTRY + 1))) {
    throw new Error("the execution record's entry is relocated: write it as an offset from the header");
  }
  let previous = -1;
  for (const offset of fixups) {
    if (!Number.isInteger(offset) || offset <= previous || offset >= at0.length - DHLEN) {
      throw new Error("relocation offset outside the service body or unordered");
    }
    previous = offset;
  }
  const data = encoders[reloc](fixups, at0.length - DHLEN);
  for (const d of deps) if (d.name.length > 8) throw new Error(`${d.name}: a dependency's name is at most 8 bytes`);
  const list = Uint8Array.from(deps.flatMap((d) => [d.version, ...Buffer.from(d.name.padEnd(8), "latin1")]));
  const file = new Uint8Array(at0.length + list.length + data.length);
  file.set(at0);
  file.set(list, at0.length);
  file.set(data, at0.length + list.length);
  file[1] = FORMAT;
  file[2] = deps.length;
  const put = (at, v) => {
    file[at] = v & 0xff;
    file[at + 1] = v >> 8;
  };
  put(4, symbols.REMOVE - 0x100);
  put(6, at0.length);
  put(10, data.length);
  put(15, symbols.INIT - 0x100);
  const offsets = Object.fromEntries(Object.entries(symbols).map(([k, v]) => [k, v - 0x100]));
  return { file, symbols: offsets, image: at0.length, fixups, data };
}
