#!/usr/bin/env node
// Executable CCP alternatives. Production source is never patched: every
// variant is a fresh archive of BASE under build/ccp-model, assembled by ATOM.
// Run the whole command under Origo's shared memory guard, MODEL_JOBS=1.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";
import { ROOT, tree, build, rom, patch } from "./lib/model.mjs";
import { Machine } from "../host/machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";

const BASE = "d18c893";
const WORK = resolve(ROOT, "build/ccp-model");
const outPath = process.argv[2] ?? resolve(WORK, "figures.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ccp = "src/cpm/ccp.asm";
const edit = (dir, from, to) => patch(dir, ccp, from, to);

function parser(dir) {
  edit(dir, "        LD      (FCBBASE),DE\n        PUSH    HL\n        PUSH    DE", "        LD      (FCBBASE),DE\n        PUSH    DE");
  edit(dir, "        POP     DE\n        POP     HL\n\n        LD      A,(HL)", "        POP     DE\n\n        LD      A,(HL)");
  edit(dir, `FCBDOT:
        INC     HL
        PUSH    HL
        LD      HL,(FCBBASE)
        LD      DE,9
        ADD     HL,DE
        EX      DE,HL
        POP     HL
        LD      B,3`, `FCBDOT:
        INC     HL
        LD      A,E             ; B is the unfilled part of the name field
        ADD     A,B
        LD      E,A
        JR      NC,FCBTYP
        INC     D
FCBTYP: LD      B,3`);
  edit(dir, `PARLONG:
        INC     HL
        LD      A,(HL)
        OR      A
        JR      Z,PLEND
        CP      SPACE
        JR      Z,PLEND
        CP      '='
        JR      Z,PLEND
        CP      '.'
        JR      NZ,PARLONG`, `PARLONG:
        INC     HL
        CALL    FCBEND
        JR      NZ,PARLONG`);
  edit(dir, `VALIDCHR:
        PUSH    HL
        PUSH    BC
        LD      HL,BADCHARS
        LD      B,13

VLDLOOP:
        CP      (HL)
        JR      Z,VALIDBAD
        INC     HL
        DJNZ    VLDLOOP
        POP     BC
        POP     HL
        OR      A
        RET

VALIDBAD:
        POP     BC
        POP     HL
        SCF
        RET`, `VALIDCHR:
        PUSH    HL
        PUSH    BC
        LD      HL,BADCHARS
        LD      BC,13
        CPIR                    ; equality means a forbidden byte
        POP     BC
        POP     HL
        SCF
        RET     Z
        OR      A
        RET`);
}

function listing(dir) {
  edit(dir, "        LD      (DIRENTP),HL", "        PUSH    HL              ; live until DIRNAME; abort resets SP");
  edit(dir, "        LD      HL,(DIRENTP)", "        POP     HL");
  edit(dir, `PUTNAME:
        LD      A,(HL)
        AND     $7F
        LD      E,A
        CALL    PUTCHAR
        INC     HL
        DJNZ    PUTNAME
        RET

`, "");
}

function parserShared(dir) {
  parser(dir);
  edit(dir, `UNAMBIG:
        PUSH    HL
        PUSH    BC
        LD      HL,(FCBBASE)
        INC     HL
        LD      A,(HL)
        CP      SPACE
        JR      Z,UNAMBAD
        LD      B,11

UNAMLOOP:
        LD      A,(HL)
        CP      '?'
        JR      Z,UNAMBAD
        INC     HL
        DJNZ    UNAMLOOP
        POP     BC
        POP     HL
        OR      A
        RET

UNAMBAD:
        POP     BC
        POP     HL
        SCF
        RET`, `UNAMBIG:
        PUSH    HL
        PUSH    BC
        LD      HL,(FCBBASE)
        INC     HL
        LD      A,(HL)
        CP      SPACE
        JR      Z,CHRRET
        LD      BC,11
        LD      A,'?'
        CPIR                    ; equality means an ambiguous name
        JR      CHRRET`);
  edit(dir, "        CPIR                    ; equality means a forbidden byte\n        POP     BC", "        CPIR                    ; equality means a forbidden byte\nCHRRET: POP     BC");
}

function listingCounter(dir) {
  listing(dir);
  edit(dir, "DIRHEAD:\n        LD      A,(DIRANY)", "DIRHEAD:\n        LD      A,(DIRNCOL)    ; columns remaining in this row\n        LD      (DIRCOL),A\n        LD      A,(DIRANY)");
  edit(dir, `DIRPAD:
        LD      A,(DIRCOL)
        INC     A
        LD      HL,DIRNCOL
        CP      (HL)
        JR      C,DIRPADL
        XOR     A
        LD      (DIRCOL),A
        JR      DIRNEXT
DIRPADL:
        LD      (DIRCOL),A
DIRPADC:`, `DIRPAD:
        LD      HL,DIRCOL
        DEC     (HL)
        JR      Z,DIRNEXT
DIRPADC:`);
}

function listingState(dir) {
  listingCounter(dir);
  edit(dir, "        LD      (DIRCOL),A\n        LD      (DIRANY),A", "        LD      (DIRCOL),A");
  edit(dir, "        LD      (DIRCOL),A\n        LD      A,(DIRANY)\n        OR      A", "        LD      (DIRCOL),A\n        LD      HL,(DIRNUM)\n        LD      A,H\n        OR      L");
  edit(dir, "DIRNAME:\n        LD      A,1\n        LD      (DIRANY),A\n        LD      HL,(DIRNUM)", "DIRNAME:\n        LD      HL,(DIRNUM)");
  edit(dir, "DIRDONE:\n        LD      A,(DIRANY)\n        OR      A", "DIRDONE:\n        LD      HL,(DIRNUM)\n        LD      A,H\n        OR      L");
}

function dispatch(dir) {
  edit(dir, `KEYNXT:\tPUSH\tDE
\tCALL\tISCMD\t\t; Z: the word, DE at its 0
\tPOP\tHL\t\t; the word's start
\tJR\tNZ,KEYSK
\tEX\tDE,HL\t\t; the word matched: its handler, after the 0`, `KEYNXT:\tCALL\tISCMD\t\t; DE at the mismatch or the word's 0
\tEX\tDE,HL\t\t; skip only the unmatched suffix
\tJR\tNZ,KEYSK`);
}

const variants = {
  incumbent() {}, parser, "parser-shared": parserShared, listing, "listing-counter": listingCounter, "listing-state": listingState, dispatch,
  combined(dir) { parserShared(dir); listingState(dir); dispatch(dir); },
  "mutant-parser-overflow"(dir) { parser(dir); edit(dir, "PLEND:\n        SCF\n        RET", "PLEND:\n        OR      A\n        RET"); },
  "mutant-parser-tail"(dir) { parser(dir); edit(dir, "        LD      B,24", "        LD      B,20"); },
};

function corpus() {
  const cases = new Set(["", " ", "A:", "P:", "Q:", "@:", "A=", ".TXT", "*.*", "A*.T*", "ABCDEFGH.XYZ", "ABCDEFGHI.XYZ", "A.XYZZ", "A".repeat(127), "A." + "B".repeat(125)]);
  for (const n of [0, 1, 7, 8, 9, 16]) for (const e of [0, 1, 2, 3, 4, 8])
    for (const d of ["", "A:", "P:", "Q:"]) cases.add(d + "A".repeat(n) + "." + "B".repeat(e));
  for (const b of Array.from({ length: 256 }, (_, n) => n)) {
    const c = String.fromCharCode(b);
    for (const form of [c + "X.T", "X" + c + ".T", "X." + c, "ABCDEFGH" + c + "Q", "X.ABC" + c + "Q"])
      cases.add(form);
  }
  for (const name of ["*", "A*", "ABCDEFG*", "ABCDEFGH*", "ABCDEFGHI*", "?", "A?", "????????"])
    for (const tail of ["", ".TXT", "!X", "=OLD", " X", ".*TAIL"]) cases.add(name + tail);
  return [...cases];
}

function parserRead(r, input, at) {
  const memory = new Uint8Array(65536).fill(0xa5);
  memory.set(r.image, 0xc000);
  memory.set(Buffer.from(input + "\0", "latin1"), 0x2000);
  memory[0x3ffe] = 0; memory[0x3fff] = 0x30;
  const m = createZ80Runtime({ memory, startAddress: r.symbols.get("PARSEFCB") }, 0, { read: () => 255, write() {} });
  const actual = m.hardware.memory; // createZ80Runtime copies the input image
  Object.assign(m.cpu, { pc: r.symbols.get("PARSEFCB"), sp: 0x3ffe, h: 0x20, l: 0, d: at >> 8, e: at & 255, b: 0x5a, c: 0x69 });
  let cycles = 0, low = 0x3ffe, count = 0;
  while (m.cpu.pc !== 0x3000) {
    assert.ok(++count < 10000, `parser did not return: ${JSON.stringify(input)}`);
    cycles += m.step().cycles;
    low = Math.min(low, m.cpu.sp);
  }
  assert.equal(m.cpu.sp, 0x4000, "parser stack balanced");
  assert.equal(actual[at - 1], 0xa5, "FCB lower canary");
  assert.equal(actual[at + 36], 0xa5, "FCB upper canary");
  const state = { fcb: [...actual.slice(at, at + 36)], cursor: (m.cpu.h << 8 | m.cpu.l) - 0x2000, carry: m.cpu.flags.C };
  const hl = m.cpu.h << 8 | m.cpu.l;
  Object.assign(m.cpu, { pc: r.symbols.get("UNAMBIG"), sp: 0x3ffe, b: 0x3c, c: 0xa7 });
  count = 0;
  while (m.cpu.pc !== 0x3000) {
    assert.ok(++count < 1000, "UNAMBIG did not return");
    cycles += m.step().cycles;
    low = Math.min(low, m.cpu.sp);
  }
  assert.equal(m.cpu.sp, 0x4000, "UNAMBIG stack balanced");
  assert.equal(m.cpu.h << 8 | m.cpu.l, hl, "UNAMBIG preserves cursor");
  assert.equal(m.cpu.b << 8 | m.cpu.c, 0x3ca7, "UNAMBIG preserves BC");
  state.unambiguous = !m.cpu.flags.C;
  return { state, cycles, stack: 0x3ffe - low };
}

function volume(image, drive) {
  const info = parseContainer(image), v = findVolume(info, drive);
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
}
function boot(r) {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G1M", label: "WORK", mount: "B" }]);
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\nworld\r\n\x1a"));
  a.write("SECOND.TXT", Buffer.from("second\r\n\x1a"));
  a.write("PROBE.COM", Uint8Array.of(0xc9));
  for (let n = 0; n < 4; n++) a.write(`F${n}.DAT`, Uint8Array.of(n)); // seven entries cross the six-column boundary
  const m = new Machine({ rom: r.image, symbols: r.symbols, sdImage: image, glcd: false, clock: new Date(2026, 0, 1) });
  m.expect(/A>$/, { from: 0, maxCycles: 80000000 });
  m.runUntil(() => m.ready(), 200000000, "first prompt");
  return { m, image };
}
const commands = [
  "DIR", "TYPE HELLO.TXT", "DIR *.TXT", "TYPE ABCDEFGHI.TXT", "TYPE HELLO.TXTT", "TYPE *.TXT",
  "REN NEW.TXT=SECOND.TXT", "COPY HELLO.TXT B:", "TYPE B:HELLO.TXT", "ERA NEW.TXT", "DIR",
  "USER 15", "USER 16", "USER 0", "SAVE 0 ZERO.BIN", "DIR ZERO.BIN", "ERA ZERO.BIN",
  "B:", "PROBE A:FOO*.BAR BAZ.QUX", "A:", "CON TTY", "SERVICES", "UNLOAD", "DIRX",
  "DIR A B", "REN =HELLO.TXT", "COPY HELLO.TXT HELLO.TXT", "TYPE HELLO.TXT!DIR", "NOFILE!:DIR",
];
function sessions(r) {
  const { m, image } = boot(r), rows = [], entries = [];
  let peak = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100) entries.push({ page: [...Array(128).keys()].map((n) => m.read(0x80 + n)), fcbs: [...Array(36).keys()].map((n) => m.read(0x5c + n)), drive: m.read(0x50) });
    const sp = m.cpu.cpu.sp;
    if (sp >= m.sym("CSTKBAS") && sp <= m.sym("CSTKTOP")) peak = Math.max(peak, m.sym("CSTKTOP") - sp);
    return step();
  };
  for (const command of commands) {
    const before = m.cycles;
    const output = m.command(command);
    for (let a = m.sym("STKGUARD"); a < m.sym("STKGUEND"); a++) assert.equal(m.read(a), 0xa5, `${command}: CCP stack guard`);
    rows.push({ command, output, driveUser: m.read(4), code: m.read(m.sym("PRGCODE")) | m.read(m.sym("PRGCODE") + 1) << 8, cycles: m.cycles - before });
  }
  m.cpu.cpu.pc = 0; m.runUntil(() => m.ready(), 200000000, "warm reboot flush");
  const files = ["A", "B"].map((drive) => ({ drive, files: volume(image, drive).list().map((f) => ({ ...f, bytesHash: sha(volume(image, drive).read(f.name)) })) }));
  assert.deepEqual(m.violations, []);
  return { rows, entries, files, peak, cardHash: sha(image) };
}

mkdirSync(WORK, { recursive: true });
const cases = corpus(), figures = { baseline: BASE, runnerSha256: sha(readFileSync(new URL(import.meta.url))), assembler: "atom-z80 0.3.7", commands, parserCases: cases.length * 2, variants: {} };
let baselineParsers, baselineSession;
for (const [name, change] of Object.entries(variants)) {
  console.error(`CCP model: ${name}`);
  const dir = tree(WORK, name, BASE);
  change(dir);
  await build(dir);
  const r = rom(dir);
  const parserRows = cases.flatMap((input) => [0x2100, 0x21f8].map((at) => parserRead(r, input, at)));
  baselineParsers ??= parserRows;
  const mismatches = parserRows.flatMap((row, i) => JSON.stringify(row.state) === JSON.stringify(baselineParsers[i].state) ? [] : [i]);
  const result = {
    sha256: sha(r.image), rom: r.census.rom.used, ccp: r.symbols.get("BDOSBAS") - r.symbols.get("CCPBAS"),
    romRegions: r.census.rom.regions, ramRegions: r.census.ram.regions, stacks: r.census.ram.stacks,
    ram: r.census.ram.regions.find((x) => x.label === "CCP state and stack").bytes,
    tpa: r.census.ram.tpa.bytes, parser: { mismatches: mismatches.length, examples: mismatches.slice(0, 8).map((i) => cases[Math.floor(i / 2)]), cycles: parserRows.reduce((n, r) => n + r.cycles, 0), peak: Math.max(...parserRows.map((r) => r.stack)) },
  };
  const worst = parserRows.map((row, i) => ({ index: i, delta: row.cycles - baselineParsers[i].cycles })).sort((a, b) => b.delta - a.delta)[0];
  result.parser.worstCycleDelta = { input: cases[Math.floor(worst.index / 2)], cycles: worst.delta };
  result.outsideCcpBytes = result.rom - result.ccp;
  if (!name.startsWith("mutant")) {
    const session = sessions(r);
    baselineSession ??= session;
    const semantics = (s) => ({ rows: s.rows.map(({ cycles, ...rest }) => rest), entries: s.entries, files: s.files, cardHash: s.cardHash });
    assert.deepEqual(semantics(session), semantics(baselineSession), `${name}: command session changed`);
    result.session = { equivalent: true, peak: session.peak, cycles: session.rows.map((row) => ({ command: row.command, cycles: row.cycles })) };
    assert.equal(mismatches.length, 0, `${name}: parser mismatch`);
  } else assert.ok(mismatches.length > 0, `${name} must be distinguished`);
  result.delta = result.rom - (figures.variants.incumbent?.rom ?? result.rom);
  figures.variants[name] = result;
  writeFileSync(outPath, JSON.stringify(figures, null, 2) + "\n");
}
console.log(JSON.stringify(figures, null, 2));
