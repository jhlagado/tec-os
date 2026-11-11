// MON3.SVC's tests: the service and its test program, the MON-3 reference
// they are compared with, a machine with a chosen ROM, and mutants made by
// patching the ROM's or the service's bytes at a named routine.
//
// The reference is MON-3's own ROM, a pinned input (test/inputs.json), run on
// the same pinned Debug80 runtime as TEC-OS: entered where its GO key clears
// the LCD, with the page of vectors and the defaults its reset would have
// left in RAM.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTec1gHeadlessSession } from "@jhlagado/debug80-runtime/headless";
import { makeSvc } from "../../tools/lib/svc.mjs";
import { Machine } from "./machine.mjs";
import { GLCD_SVC, ROOT, TEST_CLOCK, program, romFor, standardCard, volume, withDisplay } from "./fixtures.mjs";
import { check, pinned } from "./inputs.mjs";
import { run as censusRun, watch } from "./census.mjs";

export const MON3_BIN = pinned("MON3.BIN");
export const HELLO3_SHA = "666ca183a9014e3bb170033afaaf4c6397917dcf3719aa4b43ffb6897ed4d913";
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** HELLO3.BIN, built from test/programs/hello3.asm at 4000h: 173 bytes, by its hash. */
export async function hello3() {
  const { bytes } = await program("hello3", { base: 0x4000 });
  assert.equal(sha(bytes), HELLO3_SHA, "HELLO3.BIN is the pinned program");
  return Uint8Array.from(bytes);
}

/** test/programs/svcexec.asm's file with OVER's definitions: a test service with an execution record. */
export async function execFile(over = {}) {
  const defs = { V_NRDY: 0, V_NODEV: 0, V_KEEP: 0, FLAGS: 1, RECVER: 1, HDRNAME: '"X       "', ...over };
  return (await makeSvc(resolve(ROOT, "test/programs/svcexec.asm"), { defs, work: resolve(ROOT, "build/svc") })).file;
}

/** MON3.SVC's SHA-256: the file the card holds, as media writes it. */
export const MON3_SVC_SHA = "e85342e3f4a21c5e10733543d39742cff9328e27a6ab52050893b5f3d5c41bde";

/** The card's MON3.SVC, by media's writer: the pinned file, and the same as SVC, the tests' own build. */
export async function cardMon3(svc) {
  const { tasAssembler } = await import("../../tools/lib/tas-rom.mjs");
  const { assembleMon3 } = await import("../../tools/lib/tas-distribution.mjs");
  const file = await assembleMon3(ROOT, await tasAssembler());
  assert.equal(sha(file), MON3_SVC_SHA, "the card's MON3.SVC is the pinned file");
  assert.deepEqual([...svc.file], [...file], "the tests' MON3.SVC is the card's");
}

/** MON3.SVC from drivers/mon3.asm: { file, symbols (offsets from the header), image }. OPT as makeSvc's. */
export const mon3Svc = (opt = {}) => makeSvc(resolve(ROOT, "drivers/mon3.asm"), { work: resolve(ROOT, "build/svc"), ...opt });

/**
 * The ceiling for MON3.SVC on the starter card: header and image, pages,
 * the least (0006h), and the least TPA alone and with GLCD.SVC. Every size
 * test reads it.
 */
export const MON3_CEILING = { bytes: 4608, pages: 18, top: 0xa700, tpa: 42496, tpaGlcd: 41728 };

/** What follows from a build SVC on the starter card: its pages, (0006h), its entry, the TPA and its SERVICES line. */
export function figures(svc) {
  const pages = Math.ceil(svc.image / 256);
  const top = (0xb9 - pages) << 8;
  return { pages, top, entry: top + 41, tpa: top - 0x100, line: `MON3 ${pages}` };
}

/** MON3.SVC's source files, drivers/mon3.asm first and then those it includes: { name: text }. */
export const MON3_FILES = ["mon3.asm", "mon3api.asm", "mon3io.asm", "mon3hex.asm", "mon3gfx.asm"];
export function mon3Sources() {
  const out = {};
  for (const n of MON3_FILES) {
    try {
      out[n] = readFileSync(resolve(ROOT, "drivers", n), "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return out;
}
/** The whole source as one text, for reading its tables and constants. */
export const mon3Text = () => Object.values(mon3Sources()).join("\n");

/**
 * MON3.SVC built with EDITS ([old, new], each standing once in all its files
 * together) applied to its source: a mutant or a variant, built beside the
 * build. OPT as makeSvc's.
 */
export async function mon3Variant(edits, opt = {}) {
  const files = mon3Sources();
  for (const [old, now] of edits) {
    const hits = Object.keys(files).filter((n) => files[n].includes(old));
    const count = hits.reduce((k, n) => k + files[n].split(old).length - 1, 0);
    assert.equal(count, 1, `the edit's text stands once: ${old}`);
    files[hits[0]] = files[hits[0]].replace(old, now);
  }
  const dir = resolve(ROOT, "build/mon3-variants", sha(JSON.stringify(edits)).slice(0, 16));
  mkdirSync(dir, { recursive: true });
  for (const [n, text] of Object.entries(files)) writeFileSync(resolve(dir, n), text.replace('%INCLUDE "../src/abi.inc"', `%INCLUDE "${resolve(ROOT, "src/abi.inc")}"`));
  return makeSvc(resolve(dir, "mon3.asm"), { work: resolve(ROOT, "build/svc"), ...opt });
}

// MON-3's addresses, from its listing: where the GO key's handler clears the
// LCD, the monitor's return address for a program, and its defaults table.
const KEYGO = 0xc284;
const SOFTBOOT = 0xc209;
const DEFAULTS = 0x1400;
const DEFAULTS_SIZE = 0x17;

/** MON-3's hex digit for a segment code, or -1. */
const SEGMENTS = [0xeb, 0x28, 0xcd, 0xad, 0x2e, 0xa7, 0xe7, 0x29, 0xef, 0x2f, 0x6f, 0xe6, 0xc3, 0xec, 0xc7, 0x47];
const hexOf = (code) => SEGMENTS.indexOf(code);

/** The six digit latches, rightmost first, as HELLO3 shows them: { count, key, raw }. */
export function hello3Digits(digits) {
  const d = digits.map(hexOf);
  return { count: (d[5] << 12) | (d[4] << 8) | (d[3] << 4) | d[2], key: (d[1] << 4) | d[0], raw: digits.map((x) => x.toString(16).padStart(2, "0")).join(" ") };
}

const flagsOf = (c) => Object.fromEntries(Object.entries(c.flags).map(([k, v]) => [k, v ? 1 : 0]));
const regsOf = (c) => ({ a: c.a, b: c.b, c: c.c, de: (c.d << 8) | c.e, hl: (c.h << 8) | c.l, sp: c.sp & 0xffff, iff1: c.iff1 ? 1 : 0, flags: flagsOf(c) });

/** The keypad codes the runtime takes for key 5 and the AD key. */
export const KEY5 = 0x25;
export const KEYAD = 0x33;

/**
 * BIN run by MON-3's GO at 4000h: the registers and the LCD's fourth row at
 * 4000h, the LCD, digits and speaker edges 3,000,000 cycles later, the same
 * after key 5 held 400,000 cycles and released 400,000, and where AD's RET
 * lands.
 */
export function reference(bin) {
  check(MON3_BIN);
  const rom = readFileSync(MON3_BIN.path);
  const memory = new Uint8Array(0x10000);
  memory.set(rom, 0xc000);
  memory.set(rom.subarray(0, 0x100), 0x0000); // the page its reset copies down
  memory.set(rom.subarray(DEFAULTS, DEFAULTS + DEFAULTS_SIZE), 0x0886); // its defaults, at CEL
  memory[0x089d] = 0x01; // SYS_MODE: the overlay off, no PROTECT, no EXPAND
  memory.set(bin, 0x4000);
  const s = createTec1gHeadlessSession({
    program: { memory, startAddress: KEYGO },
    entry: KEYGO,
    stackPointer: 0x0880,
    config: { romRanges: [{ start: 0xc000, end: 0xffff }], appStart: 0x4000, entry: KEYGO },
  });
  s.cpu.cpu.h = 0x40;
  s.cpu.cpu.l = 0x00;
  const rows = () => s.lcdSnapshot().rows.map((r) => r);
  const digits = () => hello3Digits(s.hudSnapshot().digits);
  s.runUntil((x) => (x.cpu.getPC() & 0xffff) === 0x4000, { maxCycles: 5_000_000 }, "the program's entry");
  const at4000 = { ...regsOf(s.cpu.cpu), edges: s.speakerEdges.length, row4: rows()[3] };
  s.runCycles(3_000_000);
  const after = { rows: rows(), edges: s.speakerEdges.length, digits: digits() };
  const before = s.speakerEdges.length;
  s.tec1g.applyKey(KEY5, true);
  s.runCycles(400_000);
  s.tec1g.applyKey(KEY5, false);
  s.runCycles(400_000);
  const key = { edges: s.speakerEdges.length - before, digits: digits() };
  s.tec1g.applyKey(KEYAD, true);
  s.runUntil((x) => (x.cpu.getPC() & 0xffff) === SOFTBOOT, { maxCycles: 2_000_000 }, "the return to MON-3");
  return { at4000, after, key, back: { pc: SOFTBOOT, sp: s.cpu.cpu.sp & 0xffff } };
}

/** A starter-layout card with FILES ({ name: bytes }) on A:. */
export function card(files = {}, image = standardCard()) {
  const a = volume(image, "A");
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  return image;
}

/** A machine at its first prompt, with ROM and SYMBOLS in place of the build's when given. OPTS as Machine's. */
export function machine(image, { rom, symbols, tms = false, matrix = false, width = 80, ...opts } = {}) {
  const built = romFor();
  if (image) withDisplay(image, { tms, matrix, width });
  const m = new Machine({ rom: rom ?? built.rom, symbols: symbols ?? built.symbols, sdImage: image, tms, matrix, clock: TEST_CLOCK, ...opts });
  m.expect(/A>$/, { from: 0, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the first prompt");
  // Speaker edges: changes of bit 7 in writes to port 01h.
  m.edges = 0;
  let last = 0;
  const write = m.tec1g.ioHandlers.write;
  m.tec1g.ioHandlers.write = (port, value) => {
    if ((port & 0xff) === 0x01) {
      const bit = value & 0x80;
      if (bit !== last) {
        m.edges += 1;
        last = bit;
      }
    }
    return write(port, value);
  };
  return m;
}

export const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
export const bytesAt = (m, a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));
/** The BDOS 108 return code. */
export const code = (m) => word(m, m.sym("PRGCODE"));
/** The four LCD rows, each 20 characters. */
export const lcdRows = (m) => [0, 1, 2, 3].map((r) => String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(r * 20, r * 20 + 20)));
export const digitsOf = (m) => hello3Digits(m.tec1g.state.display.digits);
/** The warm-boot entry's target: the word after the JP that 0001h points to. */
export const warmTarget = (m) => word(m, word(m, 1) + 1);
/** SERVICES' lines. */
export const services = (m) =>
  m
    .command("SERVICES")
    .split("\r\n")
    .map((l) => l.trim())
    .filter((l) => /^\S+ \d+$/.test(l));

export const PROMPT = /\r\n\d*[A-P]>$/;
export const MON3 = /MON3>$/;

/** Type LINE and run to MON3> or the CCP's prompt: the text printed, and which came. */
export function line(m, text, { maxCycles = 400_000_000 } = {}) {
  const from = m.output.length;
  m.mark = from;
  m.type(`${text}\r`);
  // The CCP's prompt counts once a chained line has no piece left.
  const chpos = m.sym("CHPOS");
  m.runUntil(() => m.waitingForInput() && (MON3.test(m.text(from)) || (PROMPT.test(m.text(from)) && m.read(chpos) === 0)), maxCycles, `a prompt after ${text}`);
  const out = m.text(from);
  return { out, mon3: MON3.test(out) };
}

/** Run M to PC, at most MAX cycles. */
export const runTo = (m, pc, max = 50_000_000) => m.runUntil(() => m.pc === pc, max, `pc ${pc.toString(16)}`);
/** Run M for N cycles. */
export function runFor(m, n) {
  const end = m.cycles + n;
  m.runUntil(() => m.cycles >= end, n + 1_000_000, `${n} cycles`);
}

/**
 * The index in BYTES, from FROM and within SPAN, where PATTERN stands: a
 * number matches itself and null any byte. It must stand there once.
 */
export function find(bytes, from, pattern, span = 256) {
  const hits = [];
  for (let i = from; i + pattern.length <= Math.min(bytes.length, from + span); i += 1) if (pattern.every((p, k) => p === null || bytes[i + k] === p)) hits.push(i);
  assert.equal(hits.length, 1, `pattern ${pattern.map((p) => (p === null ? "??" : p.toString(16))).join(" ")} found ${hits.length} times`);
  return hits[0];
}

/** The build's ROM with EDIT(bytes, at) applied, at(NAME) being a symbol's index: { rom, symbols }. */
export function romMutant(edit) {
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom);
  edit(bytes, (name) => symbols.get(name) - 0xc000);
  return { rom: bytes, symbols };
}

/** SVC's file with EDIT(bytes, at) applied, at(NAME) being a symbol's offset in the file. */
export function svcMutant(svc, edit) {
  const bytes = Uint8Array.from(svc.file);
  edit(bytes, (name) => {
    assert.ok(name in svc.symbols, `no symbol ${name}`);
    return svc.symbols[name];
  });
  return bytes;
}

/** A program of BYTES as a one-record .BIN. */
export const bin = (...bytes) => Uint8Array.from(bytes.flat());

export { GLCD_SVC };

/**
 * The NAME.SVC /E lines of the stack census, on the serial console: a refused
 * switch, /E installing and entering, re-entry, a never-ready /E install
 * removed, and UNLOAD of MON3.SVC. The census's depths: { bdos, ccp, bios }.
 */
export async function ks53Census() {
  const { rom, symbols } = romFor();
  const image = card({ "MON3.SVC": (await mon3Svc()).file, "NRDY.SVC": await execFile({ V_NRDY: 1 }) });
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, highCapacity: true });
  const depths = watch(m);
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  for (const [l, re] of [["MON3.SVC /X\r"], ["MON3.SVC /E\r", MON3], ["EXIT\r"], ["MON3.SVC /E\r", MON3], ["EXIT\r"], ["NRDY.SVC /E\r"], ["UNLOAD\r"]]) censusRun(m, l, re);
  assert.deepEqual(m.violations, []);
  return depths();
}
