// The shell's test library: SHELL.SVC and its variants, the probe shell
// HOOK.SVC, cards that boot with them, and the run to a prompt with nothing
// of a line or a script left. test/shell.test.mjs and the moved tests share
// it.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeSvc } from "../../tools/lib/svc.mjs";
import { Machine } from "./machine.mjs";
import { ROOT, TEST_CLOCK, program, romFor, standardCard, startupFile, volume } from "./fixtures.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const SOURCES = ["shell.asm", "shellcmd.asm", "shellio.asm", "shellcd.asm", "shelldir.asm"];

/** SHELL.SVC from drivers/shell.asm: { file, symbols (offsets from the header), image }. */
export const shellSvc = () => makeSvc(resolve(ROOT, "drivers/shell.asm"), { work: resolve(ROOT, "build/svc") });

/**
 * SHELL.SVC with EDITS, each [old, new] standing once in the three sources
 * together: a mutant, built beside the build.
 */
export async function shellVariant(edits) {
  const files = Object.fromEntries(SOURCES.map((n) => [n, readFileSync(resolve(ROOT, "drivers", n), "utf8")]));
  for (const [old, now] of edits) {
    const hits = SOURCES.filter((n) => files[n].includes(old));
    const count = hits.reduce((k, n) => k + files[n].split(old).length - 1, 0);
    assert.equal(count, 1, `the edit's text stands once: ${old}`);
    files[hits[0]] = files[hits[0]].replace(old, now);
  }
  const dir = resolve(ROOT, "build/shell-variants", sha(JSON.stringify(edits)).slice(0, 16));
  mkdirSync(dir, { recursive: true });
  for (const [n, text] of Object.entries(files)) writeFileSync(resolve(dir, n), text.replace('%INCLUDE "../src/abi.inc"', `%INCLUDE "${resolve(ROOT, "src/abi.inc")}"`));
  return makeSvc(resolve(dir, "shell.asm"), { work: resolve(ROOT, "build/svc") });
}

/** HOOK.SVC, the probe shell, from test/programs/shhook.asm, with DEFS. */
export const hookSvc = (defs = {}) => makeSvc(resolve(ROOT, "test/programs/shhook.asm"), { defs, work: resolve(ROOT, "build/svc") });

export const SHELL = await shellSvc();
export const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

// Programs that set a code and return: FF00h, 0, 1, FFFEh and FFFFh (BDOS 108
// with FFFFh queries, so FFFF.COM leaves the code as it is), and one that
// prints SAY.
const setter = (code) => Uint8Array.from([0x11, code & 0xff, code >> 8, 0x0e, 108, 0xcd, 0x05, 0x00, 0xc9]);
export const CODES = { "F.COM": setter(0xff00), "OK.COM": setter(0), "ONE.COM": setter(1), "FE.COM": setter(0xfffe), "FFFF.COM": setter(0xffff) };
export const SAY = (await program("say")).bytes;
export const LINEP = (await program("line")).bytes;
/** A program that chains TEXT through function 47 and returns if refused. */
export function chain(text) {
  const t = Buffer.from(`${text}\0`, "latin1");
  return Uint8Array.from([0x21, 0x11, 0x01, 0x11, 0x80, 0x00, 0x01, t.length, 0x00, 0xed, 0xb0, 0x0e, 47, 0xcd, 0x05, 0x00, 0xc9, ...t]);
}

export const HELLO = Buffer.from("hello\r\nthere\r\n\x1a", "latin1");

/**
 * A card with SHELL.SVC (or SHELL's file), the code setters, SAY.COM and
 * HELLO.TXT on A:, FILES, and STARTUP.CMD of STARTUP's lines (none: no
 * file).
 */
export function shellCard(files = {}, { startup = ["SHELL.SVC"], shell = SHELL.file, image = standardCard() } = {}) {
  const a = volume(image, "A");
  for (const [n, b] of Object.entries({ "SHELL.SVC": shell, ...CODES, "SAY.COM": SAY, "HELLO.TXT": HELLO, ...files })) if (b) a.write(n, b);
  if (startup?.length) a.write("STARTUP.CMD", startupFile(...startup));
  return image;
}

/** The resident pages, lowest first: { page, name }. */
export function owners(m) {
  const out = [];
  for (let p = m.read(m.sym("SVCHEAD")); p; p = m.read((p << 8) + 8)) out.push({ page: p, name: String.fromCharCode(...Array.from({ length: 8 }, (_, i) => m.read((p << 8) + 17 + i))).trim() });
  return out;
}

/** The page of the resident named NAME, 0 for none, as an address. */
export const pageOf = (m, name = "SHELL") => (owners(m).find((o) => o.name === name)?.page ?? 0) << 8;

/**
 * The guard under SHELL.SVC's own 48-byte stack. With GUARDS.on, each
 * machine shellMachine makes lays a pattern there at each prompt, below
 * the frames in use, and first reads how deep the run since the last
 * prompt went; each entry's read() gives the deepest of its machine's runs.
 * Only the build's SHELL.SVC is read: a variant's stack may lie elsewhere.
 */
export const GUARDS = { on: false, machines: [] };
const GUARD = 0xa5;
const STACK = 48;

function guarded(m) {
  const g = { m, deepest: 0, page: 0 };
  // The build's SHELL.SVC takes its stack with LD SP,STKTOP at the build's
  // STKTOP; a variant laid out otherwise has none such.
  const known = (p) => {
    const top = p + SHELL.symbols.STKTOP;
    for (let a = p; a < p + SHELL.symbols.STKBOT; a += 1) if (m.read(a) === 0x31 && m.read(a + 1) === (top & 0xff) && m.read(a + 2) === top >> 8) return true;
    return false;
  };
  const prompt = () => {
    const p = pageOf(m);
    if (!p || !known(p)) return;
    const base = p + SHELL.symbols.STKBOT;
    // A fresh install clears its pages: its stack's low half is still zero.
    const fresh = p !== g.page || Array.from({ length: 8 }, (_, i) => m.read(base + i)).every((b) => b === 0);
    if (!fresh) {
      let free = 0;
      while (free < STACK && m.read(base + free) === GUARD) free += 1;
      g.deepest = Math.max(g.deepest, STACK - free);
    }
    // At its own line input the shell's frames lie above the SP it called
    // the BDOS with: only the bytes below that are laid.
    const caller = word(m, m.sym("OLDSP"));
    const live = caller >= base && caller < base + STACK ? caller : base + STACK;
    for (let a = base; a < live; a += 1) m.write(a, GUARD);
    g.page = p;
  };
  const ready = m.ready.bind(m);
  let was = false;
  m.ready = () => {
    const r = ready();
    if (r && !was) prompt();
    was = r;
    return r;
  };
  g.read = () => {
    if (g.page && known(g.page) && pageOf(m) === g.page) {
      const base = g.page + SHELL.symbols.STKBOT;
      let free = 0;
      while (free < STACK && m.read(base + free) === GUARD) free += 1;
      g.deepest = Math.max(g.deepest, STACK - free);
    }
    return g.deepest;
  };
  GUARDS.machines.push(g);
}

/** A machine with ROM (default the build's) on IMAGE, run to its first prompt unless NOWAIT. */
export function shellMachine(image, { rom, symbols, noWait = false, ...opts } = {}) {
  const built = romFor();
  const m = new Machine({ rom: rom ?? built.rom, symbols: symbols ?? built.symbols, sdImage: image, clock: TEST_CLOCK, ...opts });
  if (GUARDS.on) guarded(m);
  if (!noWait) m.runUntil(() => m.ready(), 900_000_000, "the first prompt");
  return m;
}

const PROMPT = /\r\n\d*[A-P](:\S*)?>$/;

/**
 * Type LINE and run until the next prompt with nothing of it left: the
 * CCP's or a shell's typed line input, as Machine.ready says, and RE (a
 * prompt) at the output's end. The text since.
 */
export function at(m, line, { re = PROMPT, max = 900_000_000 } = {}) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  // Another prompt, such as MON3>, is a program's line input: any input wait.
  const waiting = re === PROMPT ? () => m.ready() : () => m.waitingForInput();
  m.runUntil(() => waiting() && re.test(m.text(m.mark)), max, `the prompt after ${JSON.stringify(line)}`);
  return m.text(m.mark);
}

export const code = (m) => word(m, m.sym("PRGCODE"));
export const user = (m) => m.read(4) >> 4;
export const count = (text, re) => (text.match(re) ?? []).length;
export const hellos = (t) => count(t, /hello\r\nthere/g);

/** A ROM image with EDIT(bytes, at) applied, at(NAME) a symbol's offset in the ROM. */
export function romMutant(edit) {
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom);
  edit(bytes, (name) => {
    assert.ok(symbols.has(name), `no symbol ${name}`);
    return symbols.get(name) - 0xc000;
  });
  return { rom: bytes, symbols };
}

/** The offset of PATTERN (null matches any byte) in BYTES from FROM, within SPAN. */
export function find(bytes, from, pattern, span = 256) {
  for (let i = from; i < from + span; i += 1) if (pattern.every((b, j) => b === null || bytes[i + j] === b)) return i;
  throw new Error(`pattern ${pattern} not found from ${from}`);
}

/** test/programs/svcexec.asm with OVER's definitions, as mon3.mjs's execFile, with its symbols. */
export const execSvc = (over = {}) => makeSvc(resolve(ROOT, "test/programs/svcexec.asm"), {
  defs: { V_NRDY: 0, V_NODEV: 0, V_KEEP: 0, FLAGS: 1, RECVER: 1, ENTER: 1, HDRNAME: '"X       "', ...over },
  work: resolve(ROOT, "build/svc"),
});

/** host/card.mjs with EDITS, each [old, new] standing once in it: a mutant, imported from beside the build. */
export async function cardVariant(edits) {
  let text = readFileSync(resolve(ROOT, "host/card.mjs"), "utf8");
  for (const [old, now] of edits) {
    assert.equal(text.split(old).length - 1, 1, `the edit's text stands once: ${old}`);
    text = text.replace(old, now);
  }
  text = text.replaceAll('from "../tools/', `from "${resolve(ROOT, "tools")}/`);
  const dir = resolve(ROOT, "build/card-variants");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `card-${sha(JSON.stringify(edits)).slice(0, 16)}.mjs`);
  writeFileSync(path, text);
  return import(path);
}
