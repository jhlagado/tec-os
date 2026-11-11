// The pinned MON-3 repository's programs, from its src/, each a pinned
// input, converted for TAS by these rules:
// 0x numbers to $; leading dots dropped from directives; NAME: EQU to NAME
// EQU; .include inlined; names over 8 characters renamed Q000, Q001 and on,
// in their sorted (ASCII) order; ORG blocks placed in address order.
//
// The GLCD programs take four rules more, and only they do:
//  R7  names are matched without case, as MON-3's assembler matches them:
//      each name outside quotes is taken in upper case before the rename;
//  R8  an operand that opens with "(" and goes on past its ")" gets "0+"
//      before it, so TAS reads an expression, not an indirection;
//  R9  a one-character string in double quotes, as an instruction's operand
//      (not DB's, DW's or DS's), is written in single quotes;
//  R10 EQU lines that do not read "$", the location, go before the code, in
//      their order, so no expression refers forward to an equate.
// Their .include lines name files under lib/, and each such file is a
// pinned input of its own (INCLUDES), found by that path and no other.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assembleProgram } from "../../tools/lib/assemble.mjs";
import { ROOT } from "./fixtures.mjs";
import { check, pinned } from "./inputs.mjs";

/** The programs, by name: the pinned input and the binary's SHA-256. */
export const PROGRAMS = {
  "lcd-test": { input: "MON3 lcd-test.asm", bytes: 151, sha256: "d20a5f60bfefc2a0f83bb262c84fe049396c949a7b29fde2b6ced63bbb2204b5" },
  serial: { input: "MON3 serial.asm", bytes: 277, sha256: "85cee2797a395b88ec264fccc25bd2ab692fbc017ed24332e3ced6dce4a5885c" },
  "matrix-demo": { input: "MON3 matrix-demo.asm", bytes: 70, sha256: "3aa0569ca82a9dff6c1a74f2f024ba9cdfb5968c32ada0d762f37a5c6640a9b3" },
  "matrix-demo-rgb": { input: "MON3 matrix-demo-rgb.asm", bytes: 119, sha256: "5efd79b5dbab0f1c67fb61a2ec2a53ea8abd7b0ad150a72d1cfc426c6acee39f" },
  matrixz80: { input: "MON3 matrixz80.asm", bytes: 280, sha256: "a7b63de8c6f5961881b669285a9592bc1a39ab222522e76f1b4727213c3eeb8e" },
};

/** The GLCD programs, by name, as PROGRAMS. */
export const GLCD_PROGRAMS = {
  "glcd-mad": { input: "MON3 glcd-mad.asm", bytes: 1631, sha256: "56820285587c150c7c2d6c87703e6d4f4c0957730529cd9baa7c268035c3a5ca" },
  "glcd-maze": { input: "MON3 glcd-maze.asm", bytes: 729, sha256: "83e812e1355bd1072fe729723ff75286bd4dfbffb67ec7ce0d551edb1138a792" },
  "glcd-text": { input: "MON3 glcd-text.asm", bytes: 101, sha256: "6ba44c1f9e8f59e194bd1a519d8d198a1cc97d8c2c2b8a14a8bb7004a620b4b6" },
  "glcd-3d": { input: "MON3 glcd-3d.asm", bytes: 2787, sha256: "c29e82243916c4ebd67b851a76e90f3f32024d4603ef7914c127b35572d49e4f" },
  "glcd-demo": { input: "MON3 glcd-demo.asm", bytes: 3905, sha256: "08607c6acb8be6bf8c4473fbe34ffc29dcfda955797aae8d11568f5bf017e297" },
};

/** The files the GLCD programs include, by the path their .include names, and the input that holds each. */
export const INCLUDES = {
  "lib/glcd_library.z80": "MON3 glcd_library.z80",
  "lib/glcd_defs.z80": "MON3 glcd_defs.z80",
  "lib/mon3_api.z80": "MON3 mon3_api.z80",
};

/** The four GLCD rules, each on. */
export const RULES = { r7: true, r8: true, r9: true, r10: true };

/** An included file's text from DIR, as the first five programs find theirs. */
const fromDir = (dir) => (name) => readFileSync(resolve(dir, name), "utf8");

/** An included file's text from its pinned input, by its lib/ path; any other path fails. */
export function fromInputs(name) {
  const input = INCLUDES[name];
  if (!input) throw new Error(`.include "${name}" is no pinned input`);
  const found = pinned(input);
  check(found);
  if (found.skip) throw new Error(found.skip);
  return readFileSync(found.path, "utf8");
}

/** TEXT's lines, each .include replaced by the text INCLUDE gives for its path; with INCLUDE false, dropped. */
function inlined(text, include) {
  return text.split(/\r?\n/).flatMap((l) => {
    const m = /^\s*\.?include\s+"([^"]+)"/i.exec(l);
    if (!m) return [l];
    if (include === false) return [];
    return inlined(include(m[1]), include);
  });
}

/** The code before a comment, outside quotes, and the comment. */
function split(line) {
  let q = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === ";") return line.slice(0, i);
  }
  return line;
}

/** Apply FN to the parts of CODE outside quotes. */
const outside = (code, fn) => code.split(/("[^"]*"|'[^']*')/).map((p, i) => (i % 2 ? p : fn(p))).join("");

const NAME = /(?<![$%'"0-9A-Za-z_])([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * SOURCE text converted by the rules. Its includes are read from DIR, or
 * by INCLUDE (a function of the path, or false to drop them). RULES turns on
 * R7 to R10, and KEEP_ORDER leaves ORG blocks in source order.
 */
export function convert(source, dir, { keepOrder = false, rules = {}, include = fromDir(dir) } = {}) {
  let code = inlined(source, include).map((l) =>
    outside(split(l), (p) =>
      p
        .replace(/\b0x([0-9A-Fa-f]+)\b/g, "$$$1")
        .replace(/(^|\s)\.(org|equ|db|dw|ds|include|end)\b/gi, "$1$2")
        .replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*):(\s+EQU)\b/i, "$1$2"),
    ),
  );
  if (rules.r9) code = code.map((c) => (/^\s*([A-Za-z_][A-Za-z0-9_]*:)?\s*(DB|DW|DS)\b/i.test(c) ? c : c.replace(/"([^"])"/g, "'$1'")));
  if (rules.r7) code = code.map((c) => outside(c, (p) => p.replace(NAME, (n) => n.toUpperCase())));
  if (rules.r8) code = code.map((c) => c.replace(/^(\s*(?:[A-Za-z_][A-Za-z0-9_]*:)?\s*[A-Za-z]+\s+(?:[^,]*,\s*)?)\((?=[^)]*\)\s*[-+*\/&|])/, "$10+("));
  const names = new Set();
  for (const c of code) outside(c, (p) => (p.replace(NAME, (n) => (n.length > 8 && names.add(n), n)), p));
  const renamed = new Map([...names].sort().map((n, i) => [n, `Q${String(i).padStart(3, "0")}`]));
  const lines = code.map((c) => outside(c, (p) => p.replace(NAME, (n) => renamed.get(n) ?? n)).trimEnd());
  // R10's equates first, then ORG blocks in address order, each with the
  // lines that follow it.
  const EQ = /^\s*[A-Za-z_][A-Za-z0-9_]*:?\s+EQU\s+(.*)$/i;
  const early = rules.r10 ? lines.filter((l) => { const m = EQ.exec(l); return m && !/\$(?![0-9A-Fa-f])/.test(m[1]); }) : [];
  const pre = [...early];
  const blocks = [];
  for (const l of lines) {
    if (early.includes(l)) continue;
    const m = /^\s*ORG\s+\$([0-9A-Fa-f]+)/i.exec(l);
    if (m) blocks.push({ at: parseInt(m[1], 16), lines: [l] });
    else if (blocks.length) blocks.at(-1).lines.push(l);
    else pre.push(l);
  }
  if (!keepOrder) blocks.sort((a, b) => a.at - b.at);
  return `${[...pre, ...blocks.flatMap((b) => b.lines)].join("\n")}\n`;
}

/** NAME's binary at 4000h, from its pinned source by the conversion. OPTS as convert's. */
export async function realProgram(name, opts = {}) {
  return (await realBuild(name, opts)).bytes;
}

/**
 * NAME built: { bytes, symbols }. A GLCD program takes R7 to R10 (OPTS.rules
 * may turn one off) and its includes from the pinned inputs (OPTS.include
 * false drops them).
 */
export async function realBuild(name, opts = {}) {
  const glcd = name in GLCD_PROGRAMS;
  const input = pinned((glcd ? GLCD_PROGRAMS : PROGRAMS)[name].input);
  check(input);
  const how = glcd ? { include: fromInputs, ...opts, rules: { ...RULES, ...opts.rules } } : opts;
  const text = convert(readFileSync(input.path, "utf8"), dirname(input.path), how);
  const variant = glcd && (opts.include === false || Object.values(how.rules).includes(false));
  const dir = resolve(ROOT, "build/mon3src", opts.keepOrder ? "source-order" : variant ? "variant" : "converted");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name.replace(/-/g, "").slice(0, 8)}.asm`);
  writeFileSync(path, text);
  const { bytes, symbols } = await assembleProgram(path, { base: 0x4000 });
  return { bytes: Uint8Array.from(bytes), symbols };
}
