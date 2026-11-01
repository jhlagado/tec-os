#!/usr/bin/env node
// KS32's model: the chained command line, form D as chosen (KD-148). Every
// figure of the stage's figures.json, measured on the prototype against the
// brief's baseline: the ROM census and its net cost; the four choices the
// brief leaves to the model, each option built as a variant of the
// prototype's tree and measured, with the lines that tell them apart run on
// it; TPA on the starter card and four G8M and the resident figures; warm
// boot on the serial console; the stack census with its chained path; the
// walk, ERA X.COM!EDIT X.ASM!ATOM X!:X, with the shipped Edit and Atom, once
// failing and once assembling; three reproducible builds; and the mutants.
//
//   node tools/ks32-model.mjs [--landed REV] [--reference REV] [--mutants]
//                             [--against FIGURES.json] [--out FILE]
//
// --landed is the tree measured, HEAD by default; --reference the baseline,
// 98c6416. The trees are git archives in build/model-ks32/, each built with
// its release set, which needs the pinned EDIT.COM (EDIT_COM); the walk also
// needs ATOM.COM (ATOM_COM). Variants are copies of the landed tree with the
// option's source in place of the prototype's, built for debug80 alone. A
// variant that doesn't build is measured by the build's refusal. --mutants
// runs MUTANTS_KS32 (tools/lib/mutants.mjs) on the landed tree, and
// --against is as for tools/ks30-model.mjs. A short account of the figures
// goes to stderr at the end.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as M from "./lib/model.mjs";
import { mutate, MUTANTS_KS32 } from "./lib/mutants.mjs";
import { against } from "./lib/against.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const WORK = resolve(M.ROOT, "build/model-ks32");

// ---- The variants: each an option's source in place of the prototype's ----

const C = "src/cpm/ccp.asm";
const BD = "src/cpm/bdos.asm";
const RAM = "src/ram.asm";
const DRV = "src/drv.asm";

/** The line's store back inside CPMINIT's clear, as at 98c6416. */
function lineCleared(dir) {
  M.patch(dir, RAM, "        DS      128\nCCPCLR:\nBOOTDRV:", "        DS      128\nBOOTDRV:");
  M.patch(dir, RAM, "\nCMDFCB:\n        DS      36\n", "\nCCPCLR:\nCMDFCB:\n        DS      36\n");
}

/** CHTXT, 128 bytes, the line's own copy: MLGOT copies a line to it, each piece goes from it to CMDTXT, function 47 writes it. */
function separateCopy(dir) {
  M.patch(dir, C, "        LD      HL,CMDTXT-1\n        ADD     HL,DE\n", "        LD      HL,CHTXT-1\n        ADD     HL,DE\n");
  M.patch(dir, C, "        SUB     LOW(CMDTXT-1)\nMLTK3:", "        SUB     LOW(CHTXT-1)\nMLTK3:");
  M.patch(dir, C, "        LD      (HL),D\n        LD      A,1\n", "        LD      (HL),D\n        LD      HL,CMDTXT\n        LD      DE,CHTXT\n        LD      BC,128\n        LDIR\n        LD      A,1\n");
  M.patch(
    dir,
    C,
    "        LD      (PRGCODE),HL\n        LD      HL,(ARGSTRT)\n        CALL    SKIPSP\n",
    "        LD      (PRGCODE),HL\n        LD      HL,(ARGSTRT)\n        LD      DE,CMDTXT\n        LD      (ARGSTRT),DE\nMLCPY:  LD      A,(HL)\n        LD      (DE),A\n        INC     HL\n        INC     DE\n        OR      A\n        JR      NZ,MLCPY\n        LD      HL,(ARGSTRT)\n        CALL    SKIPSP\n",
  );
  M.patch(dir, BD, "        LD      DE,CMDTXT\n        LD      BC,128\n", "        LD      DE,CHTXT\n        LD      BC,128\n");
}

const STORAGE = {
  /** CHTXT kept below the RAM BIOS table, outside the clear, which grows the workspace. */
  separateBelowRambios(dir) {
    lineCleared(dir);
    M.patch(dir, RAM, "\nCCPCLR:\nCMDFCB:\n", "\nCHTXT:  DS      128             ; KS32's variant: the line's own copy\nCCPCLR:\nCMDFCB:\n");
    separateCopy(dir);
  },
  /** CHTXT above the RAM BIOS table, beside CHPOS, kept over warm boot and cleared by reset. */
  separateAboveRambios(dir) {
    lineCleared(dir);
    M.patch(dir, RAM, "CHPOS:  DS      1", "CHTXT:  DS      128             ; KS32's variant: the line's own copy\nCHPOS:  DS      1");
    separateCopy(dir);
  },
  /** The line in EXPAND 1's BE00h page, read and written a byte at a time by HGET and HPUT; the host's watch of the page off. */
  expandPage(dir) {
    lineCleared(dir);
    M.patch(dir, C, "RCFAIL  EQU", "CHPAGE  EQU     $BE00           ; KS32's variant: the line, in EXPAND 1\nRCFAIL  EQU");
    M.patch(
      dir,
      C,
      "        LD      E,A\n        LD      D,0\n        LD      HL,CMDTXT-1\n        ADD     HL,DE\nCHSK1:  LD      A,(HL)\n",
      "        LD      L,A\n        DEC     L\n        LD      H,HIGH(CHPAGE)\nCHSK1:  CALL    HGET\n",
    );
    M.patch(dir, C, "CHSK2:  INC     HL\n", "CHSK2:  INC     L\n");
    M.patch(
      dir,
      C,
      "        LD      (HL),D\n        LD      A,1\n",
      "        LD      (HL),D\n        LD      DE,CMDTXT\n        LD      HL,CHPAGE\nMLGCP:  LD      A,(DE)\n        CALL    HPUT\n        INC     DE\n        INC     L\n        OR      A\n        JR      NZ,MLGCP\n        LD      A,1\n",
    );
    M.patch(dir, C, "MLEC1:  LD      A,(HL)\n", "MLEC1:  CALL    HGET\n");
    M.patch(dir, C, "        POP     HL\n        INC     HL\n        JR      MLEC1\n", "        POP     HL\n        INC     L\n        JR      MLEC1\n");
    M.patch(dir, C, "MLTAKE: LD      A,(HL)\n", "MLTAKE: CALL    HGET\n");
    M.patch(dir, C, "MLTKC:  INC     HL\nMLTK0:  LD      (ARGSTRT),HL\nMLTK1:  LD      A,(HL)\n", "MLTKC:  INC     L\nMLTK0:  LD      DE,CMDTXT\n        LD      (ARGSTRT),DE\nMLTK1:  CALL    HGET\n");
    M.patch(
      dir,
      C,
      "        AND     $DF\n        LD      (HL),A\nMLTKN:  INC     HL\n        JR      MLTK1\nMLTK2:  LD      (HL),0\n        INC     HL\n        LD      A,L\n        SUB     LOW(CMDTXT-1)\nMLTK3:  LD      (CHPOS),A\n",
      "        AND     $DF\nMLTKN:  LD      (DE),A\n        INC     DE\n        INC     L\n        JR      MLTK1\nMLTK2:  INC     L\n        LD      A,L\n        INC     A\nMLTK3:  LD      (CHPOS),A\n        XOR     A\n        LD      (DE),A\n",
    );
    M.patch(
      dir,
      BD,
      "FNCH2:  LD      HL,(CURDMA)     ; the command, its 0 and what follows\n        LD      DE,CMDTXT\n        LD      BC,128\n        LDIR\n",
      "FNCH2:  LD      DE,(CURDMA)\n        LD      HL,CHPAGE\nFNCH3:  LD      A,(DE)\n        CALL    HPUT\n        INC     DE\n        INC     L\n        OR      A\n        JR      NZ,FNCH3\n",
    );
    M.patch(dir, "host/machine.mjs", "(a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbe00 && a < 0xbf00)", "(a < 0xbd00 ? !cacheWrite(pc) : false)");
  },
};

/** The : test after the scan, as a piece's code is cleared: FAIL is what a failure does. */
function scanFirst(dir, fail) {
  const text = readFileSync(resolve(dir, C), "utf8");
  const a = text.indexOf("MLTAKE: LD      A,(HL)\n");
  const b = text.indexOf("MLTK1:  LD      A,(HL)\n");
  M.patch(dir, C, text.slice(a, b), "MLTAKE: LD      (ARGSTRT),HL\n");
  M.patch(
    dir,
    C,
    "MLTK3:  LD      (CHPOS),A\n",
    `MLTK3:  LD      (CHPOS),A\n        LD      HL,(ARGSTRT)\n        LD      A,(HL)\n        CP      ':'\n        JR      NZ,MLRUN\n        INC     HL\n        LD      (ARGSTRT),HL\n        LD      DE,(PRGCODE)\n        LD      A,D\n        INC     A\n        JR      NZ,MLRUN\n        LD      A,E\n        INC     A\n${fail}MLRUN:\n`,
  );
}

const AFTER_FAILED_COLON = {
  /** Drop, with the : test after the scan. */
  dropScanFirst: (dir) => scanFirst(dir, "        JR      Z,MLRUN\n        XOR     A\n        LD      (CHPOS),A\n        JP      STARTED\n"),
  /** Skip that piece alone: the scan has passed it, so a failure goes to the prompt with CHPOS kept. */
  skipScanFirst: (dir) => scanFirst(dir, "        JP      NZ,STARTED\n"),
  /** Skip that piece alone with the : test first: the failure scans to the piece's end itself. */
  skipTestFirst(dir) {
    M.patch(
      dir,
      C,
      "        XOR     A               ; failed: the rest of the line dropped\n        LD      (CHPOS),A\n        JP      STARTED\n",
      "MLSKP:  LD      A,(HL)\n        OR      A\n        JR      Z,MLSK3\n        INC     HL\n        CP      '!'\n        JR      NZ,MLSKP\n        LD      A,L\n        SUB     LOW(CMDTXT-1)\nMLSK3:  LD      (CHPOS),A\n        JP      STARTED\n",
    );
  },
};

const BUILTIN_ERRORS = {
  /** A built-in's error leaves the code 0; only a command not found or not loaded sets FF00h, at NOLOAD. */
  leaveZero(dir) {
    M.patch(dir, C, "ERRGO:  LD      HL,RCFAIL\n        LD      (PRGCODE),HL\nPRTGO:", "ERRGO:\nPRTGO:");
    M.patch(dir, C, "        JP      PRTGO\nCPFAIL:\n        JP      ERRGO\n", "CPFAIL:\n        JP      PRTGO\n");
    M.patch(dir, C, "        CALL    UNAMBIG\n        JR      C,BADCMD\n        LD      HL,(CMDFCB+9)", "        CALL    UNAMBIG\n        JR      C,NOLOAD\n        LD      HL,(CMDFCB+9)");
    M.patch(dir, C, "        CALL    DRVGO\n        JR      C,BADCMD\n", "        CALL    DRVGO\n        JR      C,NOLOAD\n");
    M.patch(dir, C, "        JR      NC,CMDRUN\n        JR      NZ,BADCMD", "        JR      NC,CMDRUN\n        JR      NZ,NOLOAD");
    M.patch(dir, C, "        CALL    LOADCOM\n        JR      C,BADCMD\n        CALL    PRLGO\n        JR      C,BADCMD\n", "        CALL    LOADCOM\n        JR      C,NOLOAD\n        CALL    PRLGO\n        JR      C,NOLOAD\n");
    M.patch(dir, C, "        JP      TPA\n", "        JP      TPA\nNOLOAD: LD      HL,RCFAIL\n        LD      (PRGCODE),HL\n        JR      BADCMD\n");
  },
};

/** STLINE copying every character of a line, as at 98c6416. */
function noCap(dir) {
  M.patch(dir, DRV, "\tLD\tDE,CMDTXT\n\tLD\tB,127\t\t; the characters a line may hold\n", "\tLD\tDE,CMDTXT\n");
  M.patch(dir, DRV, "\tINC\tB\n\tDEC\tB\n\tJR\tZ,STL1\t\t; past the 127th: passed over\n", "");
  M.patch(dir, DRV, "\tINC\tDE\n\tDEC\tB\n\tJR\tSTL1", "\tINC\tDE\n\tJR\tSTL1");
}

const KE127 = {
  /** No fix: STLINE as at 98c6416. */
  none: noCap,
  /** PREPPAGE stops the tail at 126 characters, its zero at FFh. */
  tail126(dir) {
    noCap(dir);
    M.patch(dir, C, "        INC     B\n        JR      TAILLOOP\n", "        INC     B\n        LD      A,E\n        INC     A\n        JR      NZ,TAILLOOP\n");
  },
  /** PREPPAGE writes no zero at or above 0100h. */
  noZeroAt100(dir) {
    noCap(dir);
    M.patch(dir, C, "        XOR     A\n        LD      (DE),A\n        LD      DE,CMDTAIL\n", "        LD      A,D\n        OR      A\n        JR      NZ,TAILNZ\n        LD      (DE),A\nTAILNZ: LD      DE,CMDTAIL\n");
  },
};

/** A copy of DIR changed by EDIT, built for debug80: its directory, or the build's refusal. */
async function variant(dir, name, edit) {
  const copy = M.copyTree(dir, WORK, `variant-${name}`);
  edit(copy);
  try {
    await M.build(copy, ["debug80"]);
    return { dir: copy };
  } catch (e) {
    return { refused: (/placement check failed:.*|error.*$/im.exec(e.message)?.[0] ?? "it failed").trim() };
  }
}

/** The ROM and RAM figures of a built tree, from its census. */
function memory(dir) {
  const { census, symbols } = M.rom(dir);
  const ram = census.ram;
  return {
    romUsed: census.rom.used,
    romFree: census.rom.free,
    workspaceBelowRambios: ram.ramBios - ram.fixedBase,
    stateAboveRambios: ram.regions.find((g) => g.label === "SD, keyboard and GLCD state").bytes,
    freeAboveRambios: 0xc000 - symbols.get("WSEND"),
    keptOverWarmBoot: symbols.get("CCPCLR") !== undefined ? symbols.get("CCPCLR") - symbols.get("CCPRAM") : 0,
    tpa: { starter: ram.cards.starter.tpa, fourG8M: ram.cards.fourG8M.tpa },
  };
}

// ---- In a worker: lines, startup records and the walk, on a tree ------------

/** The prompt with nothing left of a chained line and startup finished. */
const idle = (m, from) => m.ready() && !m.read(m.sym("CHPOS")) && /[A-P]>$/.test(m.text(from));
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

async function runTask(job) {
  const t = await M.inTree(job.dir);
  const { fx } = t;
  const programs = async (image, files = {}) => {
    const a = fx.volume(image, "A");
    for (const n of ["say", "rc"]) a.write(`${n.toUpperCase()}.COM`, (await fx.program(n)).bytes);
    for (const [n, b] of Object.entries(files)) a.write(n, Uint8Array.from(b));
    if (job.chain !== undefined) a.write("CHAIN.COM", Uint8Array.from([...(await fx.program("chain")).bytes, ...Buffer.from(`${job.chain}\0`, "latin1")]));
    return image;
  };
  if (job.task === "lines") {
    // Each line typed at the prompt: the text to the prompt after its last piece, the user and the code.
    const m = fx.boot(await programs(fx.standardCard(), job.files));
    return job.lines.map((line) => {
      const from = m.output.length;
      m.type(`${line}\r`);
      m.runUntil(() => idle(m, from), 800_000_000, line);
      return { line, text: m.text(from), user: m.read(4) >> 4, code: word(m, m.sym("PRGCODE")).toString(16) };
    });
  }
  if (job.task === "startup") {
    // A STARTUP.CMD of one record, LINE, run from cold boot: what X.COM finds at each start, and the text.
    const image = await programs(fx.standardCard(), { "X.COM": new Uint8Array(128).fill(0xc9), "STARTUP.CMD": Buffer.from(job.line, "latin1") });
    const m = new t.Machine({ ...fx.romFor(), sdImage: image, clock: fx.TEST_CLOCK });
    const entries = [];
    const step = m.step.bind(m);
    m.step = () => {
      if (m.pc === 0x100 && m.read(0x101) === 0xc9) entries.push({ b100: m.read(0x100), tail: m.read(0x80), ff: m.read(0xff) });
      return step();
    };
    m.runUntil(() => idle(m, 0), 800_000_000, "the prompt");
    const text = m.text(0);
    return { entries, text: text.slice(text.indexOf("A>", text.indexOf("WORK")) - 0) };
  }
  if (job.task === "walk") return walk(t, job);
  return null;
}

const GOOD = 'ORG $100\nLD DE,MSG\nLD C,9\nCALL 5\nRET\nMSG: DB "X RAN",13,10,"$"\n';
const SOURCES = { fails: GOOD.replace("CALL 5", "CALL NOWHERE"), assembles: GOOD };
const WALK = "era x.com!edit x.asm!atom x!:x";

/** The walk on the PICO9918 and matrix keyboard, X.COM a stale RET at the start: the screen at the prompt after it. */
async function walk(t, job) {
  const { fx } = t;
  const inputs = await import(pathToFileURL(resolve(job.dir, "test/lib/inputs.mjs")).href);
  const { editForAbi4 } = await import(pathToFileURL(resolve(job.dir, "tools/lib/edit.mjs")).href);
  const atom = inputs.pinned("ATOM.COM");
  const edit = inputs.pinned("EDIT.COM");
  if (atom.skip || edit.skip) return { skipped: atom.skip || edit.skip };
  inputs.check(atom);
  inputs.check(edit);
  const image = fx.standardCard();
  const a = fx.volume(image, "A");
  a.write("ATOM.COM", new Uint8Array(readFileSync(atom.path)));
  a.write("EDIT.COM", editForAbi4(new Uint8Array(readFileSync(edit.path)), job.dir));
  a.write("X.ASM", Buffer.from(SOURCES[job.source]), { text: true });
  if (job.stale !== false) a.write("X.COM", Uint8Array.from([0xc9]));
  const m = fx.boot(image, { tms: true, matrix: true });
  const t0 = m.cycles;
  m.typeMatrix(`${WALK}\r`);
  m.runUntilChecked(() => m.waitingForInput() && m.screen()[0] === "ORG $100", 800_000_000, "Edit's first screen");
  m.typeMatrix("\x11"); // ^Q
  m.runUntilChecked(() => m.ready() && !m.read(m.sym("CHPOS")), 3_000_000_000, "the prompt after the line", 200_000);
  return {
    line: WALK.toUpperCase(),
    source: job.source,
    screen: m.screen().filter((l) => l),
    xComAfter: fx.volume(image, "A").list().some((f) => f.name === "X.COM"),
    seconds: M.seconds(m.cycles - t0),
    violations: m.violations.length,
  };
}

if (process.argv[2] === "--worker") {
  const job = JSON.parse(process.argv[3]);
  if (["lines", "startup", "walk"].includes(job.task)) console.log(JSON.stringify(await runTask(job)));
  else await M.runWorker(job);
  process.exit(0);
}

// ---- The choices -------------------------------------------------------------

const LANDED = M.arg("--landed", "HEAD");
const REFERENCE = M.arg("--reference", "98c6416");
const lines = (dir, ls, chain) => M.worker(SCRIPT, { task: "lines", dir, lines: ls, chain });
const startup = (dir, line) => M.worker(SCRIPT, { task: "startup", dir, line });
const plain = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof Uint8Array ? [...v] : v]));

/** Each option of a choice as a variant of DIR: its memory figures, or the refusal, and its directory for the lines. */
async function options(dir, table, prototype) {
  const out = { [prototype]: { dir, ...memory(dir) } };
  for (const [name, edit] of Object.entries(table)) {
    const v = await variant(dir, name, edit);
    out[name] = v.dir ? { dir: v.dir, ...memory(v.dir) } : { refused: v.refused };
  }
  const base = out[prototype].romUsed;
  for (const o of Object.values(out)) if (o.romUsed !== undefined) o.romOverPrototype = o.romUsed - base;
  return out;
}
const strip = (os) => Object.fromEntries(Object.entries(os).map(([k, { dir, ...v }]) => [k, v]));

// The lines that tell options apart: X.COM absent, as after a failed assembly with the erase first.
const COLON_LINES = ["RC FF00!:SAY!SAY!USER 6", "USER 0", "NOSUCH!:SAY!SAY"];
const ERA_LINES = ["ERA X.COM!:SAY", "ERA X.COM!SAY!:SAY", "TYPE NONE.TXT!:SAY", "NOSUCH!:SAY"];
const SMOKE = ["SAY!SAY", "say!user 3!user 0!:say", "NOSUCH!:SAY", "CHAIN"];
const prl = (s) => s.replace(/\r\n/g, "|");

async function choices(landed, walks) {
  const storage = await options(landed, STORAGE, "cmdtxtOutOfClear");
  const after = await options(landed, AFTER_FAILED_COLON, "dropTestFirst");
  const errors = await options(landed, BUILTIN_ERRORS, "setFF00");
  const ke = await options(landed, KE127, "lineCutAt127");
  // The variants that build run the same chained lines; CHAIN.COM chains SAY!:SAY.
  const smoke = async (o) => {
    if (!o.dir) return null;
    const got = await lines(o.dir, SMOKE, "SAY!:SAY");
    return got.map((r) => `${r.line} -> ${(r.text.match(/PRL/g) ?? []).length} PRL, user ${r.user}, code ${r.code}`);
  };
  for (const o of Object.values(storage)) o.lines = await smoke(o);
  const colon = Object.fromEntries(await Promise.all(Object.entries(after).map(async ([k, o]) => [k, (await lines(o.dir, COLON_LINES)).map((r) => ({ line: r.line, ran: prl(r.text), user: r.user }))])));
  const era = Object.fromEntries(await Promise.all(Object.entries(errors).map(async ([k, o]) => [k, (await lines(o.dir, ERA_LINES)).map((r) => ({ line: r.line, saysPrl: (r.text.match(/PRL/g) ?? []).length, code: r.code }))])));
  // KE-127: a 128-character line, and one that changes drive and then runs past the record's end after a warm boot.
  const long = `X ${"A".repeat(126)}`;
  const past = "B:!A:X!DIR A:X.COM".padEnd(128, " ");
  const ke127 = Object.fromEntries(
    await Promise.all(
      Object.entries(ke).map(async ([k, o]) => {
        const a = await startup(o.dir, long);
        const b = await startup(o.dir, past);
        const last = b.text.slice(b.text.lastIndexOf(">DIR A:X.COM") - 1).replace(/ {2,}/g, " ");
        return [k, { line128: a.entries, line128PastTheRecord: { line: past.trimEnd() + ` (padded to 128)`, after: prl(last) } }];
      }),
    ),
  );
  const walkSkip = await Promise.all(["fails", "assembles"].map((source) => M.worker(SCRIPT, { task: "walk", dir: after.skipScanFirst.dir, source })));
  const base = (o, k) => o[k].romUsed;
  return {
    storage: {
      options: strip(storage),
      ram: {
        cmdtxtOutOfClear: "1 byte above RAMBIOS (CHPOS); CMDTXT's 128 and the FCBs' 72 move out of CPMINIT's clear, none added",
        separateBelowRambios: "1 byte above RAMBIOS and 128 below it, a TPA page on the starter card and four G8M",
        separateAboveRambios: `129 bytes above RAMBIOS, where ${memory(landed).freeAboveRambios} are free: the build refuses it`,
        expandPage: "1 byte above RAMBIOS and EXPAND 1's BE00h page, 128 of its 256 bytes, the host's watch of it off",
      },
      settled: "cmdtxtOutOfClear: the fewest ROM bytes, no TPA, no change to the host's watch",
    },
    afterFailedColon: {
      options: strip(after),
      linesUnderEach: colon,
      walkUnderSkip: walkSkip,
      walkUnderDrop: walks,
      walkSame: JSON.stringify(walks.map((w) => w.screen)) === JSON.stringify(walkSkip.map((w) => w.screen)),
      settled: `dropTestFirst: ${base(after, "skipScanFirst") - base(after, "dropTestFirst")} bytes against skip's cheapest form (the : test after the scan), and a failure stops the line, so no later piece runs on a failed build; the walk is the same under both, its : piece last`,
    },
    builtinErrors: {
      options: strip(errors),
      linesUnderEach: era,
      walkLeadingEra: "X.COM absent: ERA X.COM prints NO FILE and, under setFF00, sets FF00h; EDIT X.ASM is not a : piece and clears it as it is taken, so the walk is the same under both",
      settled: `setFF00: ${base(errors, "setFF00") - base(errors, "leaveZero")} byte(s) more, and : means "the last command succeeded" for built-ins too; leaveZero would also leave 0 after a command word that doesn't parse, since that reaches BADCMD before the transient path`,
    },
    ke127: {
      options: strip(ke),
      runs: ke127,
      settled: `lineCutAt127: ${base(ke, "lineCutAt127") - base(ke, "tail126")} bytes more than tail126 and ${base(ke, "lineCutAt127") - base(ke, "noZeroAt100")} more than noZeroAt100, but only it keeps a startup line to 127 characters, as typed and chained lines are: under the other two a 128-character line's 0 is BOOTDRV, which CCPENT rewrites, so a piece taken after a warm boot on B: reads 01h into its tail (line128PastTheRecord)`,
    },
  };
}

function account(f) {
  const lines = [];
  const p = (...a) => lines.push(a.join(" "));
  p(`KS32 model: prototype ${f.prototype.slice(0, 7)} against ${f.baseline}`);
  p(`ROM ${f.rom.used} used, ${f.rom.free} free (reference ${f.rom.reference.used}/${f.rom.reference.free}), net cost ${-f.rom.saving}, reconciled ${f.rom.reconciled}, contiguous ${f.rom.contiguous}, one image ${f.rom.oneImage}`);
  for (const [name, c] of Object.entries(f.choices)) {
    p(`choice ${name}:`);
    for (const [k, o] of Object.entries(c.options)) p(`  ${k}: ${o.refused ? `refused (${o.refused})` : `ROM ${o.romUsed} (${o.romOverPrototype >= 0 ? "+" : ""}${o.romOverPrototype}), below RAMBIOS ${o.workspaceBelowRambios}, above ${o.stateAboveRambios}, TPA ${o.tpa.starter}/${o.tpa.fourG8M}`}`);
    p(`  settled: ${c.settled}`);
  }
  p(`TPA starter serial ${f.tpa.prototype.starter.serial} (reference ${f.tpa.reference.starter.serial}), four G8M ${f.tpa.prototype.fourG8M.serial} (${f.tpa.reference.fourG8M.serial})`);
  p(`warm boot on serial ${f.warmBoot.prototype.seconds} s (reference ${f.warmBoot.reference.seconds} s), ${f.warmBoot.prototype.cycles - f.warmBoot.reference.cycles} T-states more`);
  p(`stacks deepest ${JSON.stringify(f.stacks.prototype)} (reference ${JSON.stringify(f.stacks.reference)}), chained ${JSON.stringify(f.stacks.runs.chained)}`);
  for (const w of f.walk) p(`walk, source that ${w.source}: ${w.seconds} s, X.COM after ${w.xComAfter}; screen: ${w.screen.join(" / ")}`);
  p(`reproducible ${f.reproducible.equal}`);
  if (f.mutantScore) p(`mutants ${f.mutantScore.caught} of ${f.mutantScore.total} caught`);
  return lines.join("\n") + "\n";
}

async function main() {
  const t0 = Date.now();
  const [landed, reference] = await Promise.all([M.prepared(WORK, "landed", LANDED), M.prepared(WORK, "reference", REFERENCE)]);
  M.log("measuring: walk, choices, TPA, warm boot, stacks, builds");
  const walks = await Promise.all(["fails", "assembles"].map((source) => M.worker(SCRIPT, { task: "walk", dir: landed, source })));
  const [chosen, tpaL, tpaR, warmL, warmR, censusL, censusR, watch] = await Promise.all([
    choices(landed, walks),
    M.tpaTable(SCRIPT, landed),
    M.tpaTable(SCRIPT, reference),
    M.bootTable(SCRIPT, landed, "cold", ["serial"]),
    M.bootTable(SCRIPT, reference, "cold", ["serial"]),
    M.stackCensus(landed),
    M.stackCensus(reference),
    M.worker(SCRIPT, { task: "watch", dir: landed }),
  ]);
  const figures = {
    ...M.heading(REFERENCE, landed, LANDED),
    recommended: { storage: "cmdtxtOutOfClear", afterFailedColon: "dropTestFirst", builtinErrors: "setFF00", ke127: "lineCutAt127" },
    rom: M.romSection(landed, reference),
    choices: chosen,
    tpa: { prototype: tpaL, reference: tpaR },
    resident: M.residentSection(landed, reference, watch),
    warmBoot: { prototype: warmL.serial.warmBoot, reference: warmR.serial.warmBoot, coldPrototype: plain(warmL.serial), coldReference: plain(warmR.serial) },
    stacks: M.stackFigures(censusL, censusR, landed, M.drvlim(landed)),
    walk: walks,
    reproducible: await M.reproducible(landed),
  };
  if (process.argv.includes("--mutants")) Object.assign(figures, await mutate(landed, WORK, MUTANTS_KS32));
  const text = JSON.stringify(figures, null, 2) + "\n";
  const out = M.arg("--out");
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
  process.stderr.write(account(figures));
  const recorded = M.arg("--against");
  if (recorded) against(JSON.parse(readFileSync(recorded, "utf8")), figures, { carried: ["choices.storage.ram", "choices.afterFailedColon.settled", "choices.builtinErrors.walkLeadingEra", "choices.builtinErrors.settled", "choices.ke127.settled", "choices.storage.settled"], mutants: process.argv.includes("--mutants") });
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
