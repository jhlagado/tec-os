// KG66's real programs: sources from jhlagado/debug80-tec1g-mon3 at 000c052,
// src/, each a pinned input, converted for ATOM by these rules only:
// 0x numbers to $; leading dots dropped from directives; NAME: EQU to NAME
// EQU; .include inlined; names over 8 characters renamed Q000, Q001 and on,
// in their sorted (ASCII) order; ORG blocks placed in address order.

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

/** TEXT's lines, each .include replaced by its file's, read from DIR. */
function inlined(text, dir) {
  return text.split(/\r?\n/).flatMap((l) => {
    const m = /^\s*\.?include\s+"([^"]+)"/i.exec(l);
    if (!m) return [l];
    const path = resolve(dir, m[1]);
    return inlined(readFileSync(path, "utf8"), dirname(path));
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

/** SOURCE text (from DIR, for includes) converted by the rules. KEEP_ORDER leaves ORG blocks in source order. */
export function convert(source, dir, { keepOrder = false } = {}) {
  const code = inlined(source, dir).map((l) =>
    outside(split(l), (p) =>
      p
        .replace(/\b0x([0-9A-Fa-f]+)\b/g, "$$$1")
        .replace(/(^|\s)\.(org|equ|db|dw|ds|include|end)\b/gi, "$1$2")
        .replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*):(\s+EQU)\b/i, "$1$2"),
    ),
  );
  const names = new Set();
  for (const c of code) outside(c, (p) => (p.replace(NAME, (n) => (n.length > 8 && names.add(n), n)), p));
  const renamed = new Map([...names].sort().map((n, i) => [n, `Q${String(i).padStart(3, "0")}`]));
  const lines = code.map((c) => outside(c, (p) => p.replace(NAME, (n) => renamed.get(n) ?? n)).trimEnd());
  // ORG blocks in address order, each with the lines that follow it.
  const pre = [];
  const blocks = [];
  for (const l of lines) {
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

/** NAME built: { bytes, symbols }. */
export async function realBuild(name, opts = {}) {
  const input = pinned(PROGRAMS[name].input);
  check(input);
  const text = convert(readFileSync(input.path, "utf8"), dirname(input.path), opts);
  const dir = resolve(ROOT, "build/mon3src", opts.keepOrder ? "source-order" : "converted");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name.replace(/-/g, "").slice(0, 8)}.asm`);
  writeFileSync(path, text);
  const { bytes, symbols } = await assembleProgram(path, { base: 0x4000 });
  return { bytes: Uint8Array.from(bytes), symbols };
}
