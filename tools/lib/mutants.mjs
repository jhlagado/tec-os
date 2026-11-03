// The stage models' mutants. Each is a list of edits to a copy of the landed
// tree and the test files to run on it, with a pattern for the names of the
// tests meant to catch it where those are fewer than the file's. An edit to assembly source names a
// run of consecutive lines by their code, comments and spacing aside, which
// must occur once in the file, and the lines that replace it; an edit to any
// other file is a text that must occur once and its replacement. A mutant is
// caught when the build fails or a test fails, and "by" names the first three
// to fail, in the files' order: the build's message or a test's name. A test
// file whose run failed outside any test is named by the test it failed in,
// from the trace test/lib/machine.mjs keeps with TEST_TRACE set: the test
// running when its process died, or each test that wrote EXPAND 1 where the
// host's watch asserts, at the file's end. Only a file that keeps no trace, or
// died outside any test, is named as a file. The names are the stage's record's; where a
// mutant's change had to be reconstructed from its name, the comment beside
// it says what it does.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, copyTree, fileType, log, node } from "./model.mjs";

/** A line's code: its comment and label spacing gone, its spaces single. */
function code(line) {
  let out = "";
  let quote = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ";") break;
    out += ch;
  }
  return out.replace(/^(\w+:)\s*/, "$1 ").replace(/\s+/g, " ").trim();
}

/** In assembly FILE, the lines whose code is FIND, once, replaced by PUT. */
export const asm = (file, find, put) => ({ file, find, put });
/** In FILE, the text FROM, once, replaced by TO. */
export const text = (file, from, to) => ({ file, from, to });

function apply(dir, e) {
  const path = resolve(dir, e.file);
  const src = readFileSync(path, "utf8");
  if (e.rebuild) return; // after the build: see one()
  if (e.from !== undefined) {
    const n = src.split(e.from).length - 1;
    if (n !== 1) throw new Error(`${e.file}: ${JSON.stringify(e.from)} found ${n} times`);
    writeFileSync(path, src.replace(e.from, e.to));
    return;
  }
  const lines = src.split("\n");
  const codes = lines.map(code);
  const want = e.find.map(code);
  const at = [];
  for (let i = 0; i + want.length <= lines.length; i += 1) if (want.every((w, k) => codes[i + k] === w)) at.push(i);
  if (at.length !== 1) throw new Error(`${e.file}: ${JSON.stringify(e.find)} found ${at.length} times`);
  // A label or an EQU's name at the margin, an instruction a tab in.
  const put = e.put.map((l) => (/^\w+:/.test(l) ? l.replace(/^(\w+:)\s*/, "$1\t") : /^\w+ EQU /i.test(l) ? l : `\t${l}`).replace(/ /, "\t").trimEnd());
  lines.splice(at[0], want.length, ...put);
  writeFileSync(path, lines.join("\n"));
}

// The sets are written in the names of a tree with src/svc.asm. A tree without
// it takes each old name instead, in the text, the source paths and the test
// paths alike, and in the mutants' own names, which its record gives.
const OLD_NAMES = {
  SVCBSY: "DRVBSY",
  SVCCALL: "DRVCALL",
  SVCHEAD: "DRVHEAD",
  SVCRC: "DRVRC",
  SVCREG: "DRVSVC",
  SVCSHUT: "DRVSHUT",
  SVCUNL: "DRVUNL",
  "PICO.SVC": "PICO.DRV",
  "console and services": "console and drivers",
  "src/svc.asm": "src/drv.asm",
  "test/svc.test.mjs": "test/drv.test.mjs",
};
const OLD_NAME = new RegExp(Object.keys(OLD_NAMES).map((n) => n.replaceAll(".", "\\.")).join("|"), "g");
const oldNames = (v) => {
  if (typeof v === "string") return v.replace(OLD_NAME, (n) => OLD_NAMES[n]);
  if (Array.isArray(v)) return v.map(oldNames);
  return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, oldNames(x)])) : v;
};

/** MUTANTS in the names of tree DIR. */
export const forTree = (dir, mutants) => (fileType(dir) === "SVC" ? mutants : oldNames(mutants));

/** Apply each of MUTANTS to a copy of DIR at WORK, building nothing: the errors of those that don't apply. */
export function check(dir, work, mutants) {
  return forTree(dir, mutants).flatMap((m, i) => {
    const copy = copyTree(dir, work, `mutant-${i}`);
    try {
      for (const e of m.edits) apply(copy, e);
      return [];
    } catch (e) {
      return [`${m.name}: ${e.message}`];
    }
  });
}

/** Run MUTANTS on copies of DIR at WORK; the figures' mutants and mutantScore. */
export async function mutate(dir, work, set) {
  const mutants = forTree(dir, set);
  const results = await Promise.all(mutants.map((m, i) => one(dir, work, m, i)));
  const out = Object.fromEntries(mutants.map((m, i) => [m.name, results[i]]));
  const caught = results.filter((r) => r.caught).length;
  log(`mutants: ${caught} of ${mutants.length} caught`);
  return { mutants: out, mutantScore: { caught, total: mutants.length } };
}

async function one(dir, work, m, i) {
  const copy = copyTree(dir, work, `mutant-${i}`);
  for (const e of m.edits) apply(copy, e);
  if (!m.tests.length) log(`mutant ${m.name}: for the build`);
  try {
    await build(copy);
  } catch (e) {
    const why = /placement check failed:.*|error.*$/im.exec(e.message)?.[0] ?? "it failed";
    log(`mutant ${m.name}: caught by the build`);
    return { caught: true, by: [`the build: ${why.trim()}`] };
  }
  for (const e of m.edits.filter((x) => x.rebuild)) {
    const { assembleProgram } = await import(pathToFileURL(resolve(copy, "tools/lib/assemble.mjs")).href);
    writeFileSync(resolve(copy, e.file), (await assembleProgram(resolve(copy, e.rebuild), { base: 0x100 })).bytes);
  }
  if (!m.tests.length) return { caught: false, by: [] };
  let tap;
  const traceFile = resolve(copy, "test-trace.jsonl");
  rmSync(traceFile, { force: true });
  try {
    const only = m.only ? [`--test-name-pattern=${m.only}`] : [];
    tap = await node(copy, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...only, ...m.tests], { env: { TEST_TRACE: traceFile } });
  } catch (e) {
    tap = e.message;
  }
  const where = (n) => (isAbsolute(n) ? relative(copy, n) : n);
  const traced = existsSync(traceFile) ? readFileSync(traceFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const failed = [...tap.matchAll(/^\s*not ok \d+ - (.*?)(?: # .*)?$/gm)].flatMap((x) => named(where(x[1]), m.tests, traced.map((t) => ({ ...t, file: where(t.file) }))));
  const by = [...new Set(failed)].slice(0, 3);
  log(`mutant ${m.name}: ${by.length ? "caught" : "survived"}`);
  return { caught: by.length > 0, by };
}

/**
 * The names for a failure the TAP names N. A test's name is itself. The host's
 * watch of EXPAND 1 asserts in test/lib/machine.mjs, after a file's last test:
 * the tests that wrote it, from the trace. A test file, one of FILES, failed
 * outside any test: the test the trace shows it in when its process died.
 */
function named(n, files, traced) {
  if (n === "test/lib/machine.mjs") {
    const wrote = traced.filter((t) => t.what === "expand1").map((t) => `${t.test} (a write to EXPAND 1, at the file's end)`);
    return wrote.length ? wrote : ["the file's end"];
  }
  if (!files.includes(n)) return [n];
  const last = traced.filter((t) => t.file === n).at(-1);
  return last?.what === "start" ? [`${last.test} (its file died in it)`] : [n];
}

const RESET = ["test/reset.test.mjs"];
const B = "src/boot.asm";
const V = "src/vol.asm";
const D = "src/svc.asm";
const r = (find, put, tests = RESET, file = B) => ({ edits: [asm(file, find, put)], tests });

/** KS31's mutants and its review's, on a tree with KE-126's fix: b6fd6f6 has the code two of them change. */
export const MUTANTS_KS31 = [
  { name: "recognition: (0000h) unread", ...r(["RSLCAP: LD A,($0000)", "CP $C3", "JR NZ,RSLNO"], ["RSLCAP: LD A,($0000)", "CP $C3"]) },
  { name: "recognition: (0001h) unread", ...r(["SBC HL,DE", "JR NZ,RSLNO", "LD A,(PZBDOS)"], ["SBC HL,DE", "LD A,(PZBDOS)"]) },
  { name: "recognition: (0005h) unread", ...r(["LD A,(PZBDOS)", "CP $C3", "JR NZ,RSLNO"], ["LD A,(PZBDOS)", "CP $C3"]) },
  { name: "recognition: the stub's JP unread", ...r(["LD A,(HL)", "CP $C3", "JR NZ,RSLNO", "INC HL"], ["LD A,(HL)", "CP $C3", "INC HL"]) },
  { name: "recognition: BENTRY's low byte unread", ...r(["CP LOW(BENTRY)", "JR NZ,RSLNO"], ["CP LOW(BENTRY)"]) },
  { name: "recognition: BENTRY's high byte unread", ...r(["CP HIGH(BENTRY)", "JR NZ,RSLNO"], ["CP HIGH(BENTRY)"]) },
  { name: "recognition: W low byte unread", ...r(["LD A,L", "OR A", "JR NZ,RSLNO", "LD A,D"], ["LD A,L", "OR A", "LD A,D"]) },
  { name: "recognition: W below 8000h allowed", ...r(["CP $80", "JR C,RSLNO"], ["CP $80"]) },
  { name: "recognition: 8000h one low", ...r(["CP $80", "JR C,RSLNO"], ["CP $7F", "JR C,RSLNO"]) },
  { name: "recognition: 8000h one high", ...r(["CP $80", "JR C,RSLNO"], ["CP $81", "JR C,RSLNO"]) },
  { name: "recognition: W above S allowed", ...r(["CP H", "JR C,RSLNO", "RSLYES: LD HL,DRVTAB"], ["CP H", "RSLYES: LD HL,DRVTAB"]) },
  { name: "recognition: W equal to S refused", ...r(["CP H", "JR C,RSLNO", "RSLYES: LD HL,DRVTAB"], ["CP H", "JR C,RSLNO", "JR Z,RSLNO", "RSLYES: LD HL,DRVTAB"]) },
  { name: "recognition: always", ...r(["RSLCAP: LD A,($0000)"], ["RSLCAP: JR RSLYES", "LD A,($0000)"]) },
  { name: "recognition: never", ...r(["RSLCAP: LD A,($0000)"], ["RSLCAP: JR RSLNO", "LD A,($0000)"]) },
  {
    name: "recognition: after the clears",
    edits: [asm(B, ["IM 1", "CALL RSLCAP"], ["IM 1"]), asm(B, ["LD SP,BSTK", "CALL CONINIT"], ["CALL RSLCAP", "LD SP,BSTK", "CALL CONINIT"])],
    tests: RESET,
  },
  { name: "recognition: A not reloaded for LATCHV", ...r(["COLDZ: LD A,LATCLAS"], ["COLDZ:"], [...RESET, "test/system.test.mjs"]) },
  { name: "capture: RSLNO leaves the old buffer", ...r(["RSLNO: XOR A", "LD (RSLBUF+6),A", "RET"], ["RSLNO: RET"]) },
  { name: "capture: D: lost", ...r(["LD BC,32"], ["LD BC,24"]) },
  { name: "abandon: a failed read ignored", ...r(["CALL DESCIX", "RET NZ", "LD HL,RSLTMP"], ["CALL DESCIX", "LD HL,RSLTMP"], RESET, V) },
  { name: "abandon: one descriptor on two drives", ...r(["JR RSDESC"], [], RESET, V) },
  // KE-126 undone: RSLTMP's geometry zeroed after a match, as b6fd6f6 did, so that a retained drive of geometry 0 matches next.
  { name: "abandon: a drive of geometry 0 matched", ...r(["LD (HL),A", "JR RSDESC"], ["LD (HL),A", "XOR A", "LD (RSLTMP+6),A"], RESET, V) },
  { name: "abandon: no slot check", ...r(["CALL VSLOT", "RET C"], [], RESET, V) },
  // The review's M4: VSLOT passed over for a drive with no slot.
  {
    name: "abandon: a drive with slot 0 taken as fitting",
    ...r(["CALL VSLOT", "RET C", "LD HL,RSLIDX"], ["LD HL,DRVSLOT", "LD B,0", "ADD HL,BC", "LD A,(HL)", "OR A", "JR Z,RSFIT", "CALL VSLOT", "RET C", "RSFIT: LD HL,RSLIDX"], RESET, V),
  },
  // The size VSLOT asks of a slot one less: none for a small volume, G1M's for a large.
  { name: "abandon: slot check one size small", ...r(["LD A,2", "SBC A,0"], ["LD A,1", "SBC A,0"], RESET, V) },
  { name: "abandon: a retained drive with no match", ...r(["OR (HL)", "RET NZ", "RSCHK1: INC DE"], ["OR (HL)", "RSCHK1: INC DE"], RESET, V) },
  { name: "abandon: no retained A: test", ...r(["RESEL: LD A,(RSLBUF+6)", "OR A", "RET Z"], ["RESEL:"], RESET, V) },
  { name: "compare: flags left out", ...r(["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ"], ["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ-1"], RESET, V) },
  { name: "compare: geometry left out too", ...r(["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ"], ["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ-2"], RESET, V) },
  { name: "compare: length left out too", ...r(["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ"], ["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ-4"], RESET, V) },
  // The start's low byte, then length, geometry and flags: the start's upper three bytes skipped.
  {
    name: "compare: start by its low byte only",
    ...r(
      ["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD B,DRVESZ"],
      ["RSEQ: PUSH DE", "LD HL,RSLTMP", "LD A,(DE)", "CP (HL)", "JR NZ,RSEQ2", "INC DE", "INC DE", "INC DE", "INC DE", "INC HL", "INC HL", "INC HL", "INC HL", "LD B,DRVESZ-4"],
      RESET,
      V,
    ),
  },
  { name: "step 2: indices not copied", ...r(["LD BC,MAXDRV*DRVESZ+MAXDRV", "LDIR", "LD C,0"], ["LD BC,MAXDRV*DRVESZ", "LDIR", "LD C,0"], RESET, V) },
  { name: "step 2: index off by one", ...r(["ADD HL,BC", "LD A,(MNTI)", "INC A", "LD (HL),A"], ["ADD HL,BC", "LD A,(MNTI)", "LD (HL),A"], RESET, V) },
  { name: "step 2: no DPH built", ...r(["LD A,E", "CALL MNDPH"], ["LD A,E"], RESET, V) },
  // The review's M5.
  { name: "step 2: a DPH rebuilt for A: only", ...r(["RSDPH1: INC C", "LD A,C", "CP MAXDRV", "JR C,RSDPH"], ["RSDPH1: INC C", "LD A,C", "CP 1", "JR C,RSDPH"], RESET, V) },
  // The review's M10 and M11.
  { name: "DIAG: the header dump zeroes RSLBUF+6", ...r(["CP 'H'", "JR NZ,DGLOOP", "LD HL,BLKBUF"], ["CP 'H'", "JR NZ,DGLOOP", "XOR A", "LD (RSLBUF+6),A", "LD HL,BLKBUF"], RESET, "src/diag.asm") },
  {
    name: "MOUNT: no default A: let through when a selection is retained",
    ...r(["LD A,(DRVTAB+6)", "OR A", "LD A,MENOA", "JR Z,MNTERR"], ["LD A,(DRVTAB+6)", "LD HL,RSLBUF+6", "OR (HL)", "LD A,MENOA", "JR Z,MNTERR"], RESET, V),
  },
  // The walk ends after its first descriptor, as a walk that never reads on would.
  { name: "step 2: the walk stops at the first block", ...r(["LD A,(MNTCNT)", "CP (HL)", "JR NZ,RSWALK"], ["LD A,1", "CP (HL)", "JR NZ,RSWALK"], RESET, V) },
  { name: "RESEL before ALVINIT", ...r(["CALL ALVINIT", "CALL RESEL"], ["CALL RESEL", "CALL ALVINIT"]) },
  { name: "RESEL never called", ...r(["CALL ALVINIT", "CALL RESEL"], ["CALL ALVINIT"]) },
  // IOBYTE and the drive and user byte carried past the clears, in TPA bytes nothing writes before MEMINIT.
  {
    name: "reset state: IOBYTE kept",
    edits: [asm(B, ["IM 1", "CALL RSLCAP"], ["IM 1", "CALL RSLCAP", "LD A,(IOBYTE)", "LD (RSLBUF+48),A"]), asm(B, ["LD (PZDU),A", "CALL PZINIT"], ["LD (PZDU),A", "LD A,(RSLBUF+48)", "LD (IOBYTE),A", "CALL PZINIT"])],
    tests: RESET,
  },
  {
    name: "reset state: drive and user kept",
    edits: [asm(B, ["IM 1", "CALL RSLCAP"], ["IM 1", "CALL RSLCAP", "LD A,(PZDU)", "LD (RSLBUF+48),A"]), asm(B, ["XOR A", "LD (PZDU),A", "CALL PZINIT"], ["LD A,(RSLBUF+48)", "LD (PZDU),A", "CALL PZINIT"])],
    tests: RESET,
  },
  { name: "reset state: workspace kept, console and services with it", ...r(["LD HL,WSBASE", "LD DE,WSBASE+1", "LD BC,WSSPAN", "LD (HL),0", "LDIR"], []) },
  { name: "KE-121: a drive beyond MNTDRV mounts", ...r(["LD A,(MNTDRV)", "DEC A", "CP (IX+DMOUNT)", "LD A,MEMOUNT", "JP C,MNTERR"], [], RESET, V) },
  { name: "KE-121: one drive short", ...r(["LD A,(MNTDRV)", "DEC A", "CP (IX+DMOUNT)"], ["LD A,(MNTDRV)", "SUB 2", "CP (IX+DMOUNT)"], RESET, V) },
  { name: "KE-122: the card's letter", ...r(["JR NZ,SHVN", "LD A,C", "ADD A,'A'"], ["JR NZ,SHVN", "LD A,(IX+DMOUNT)", "ADD A,'A'"], [...RESET, "test/mount.test.mjs"], V) },
  { name: "startup: opened at every warm boot", ...r(["OR A", "RET NZ", "SET 7,(HL)"], ["OR A", "SET 7,(HL)"], [...RESET, "test/startup.test.mjs"], D) },
  {
    name: "startup: marked after the open",
    edits: [asm(D, ["SET 7,(HL)", "IN A,(STSPORT)"], ["IN A,(STSPORT)"]), asm(D, ["LD C,15", "CALL BDOS", "INC A", "JR Z,STBDMA"], ["LD C,15", "CALL BDOS", "LD HL,STPOS", "SET 7,(HL)", "INC A", "JR Z,STBDMA"])],
    tests: RESET,
  },
  // User 1 set before the open.
  { name: "startup: at the wrong user", ...r(["LD DE,STREC", "LD C,26", "CALL BDOS"], ["LD E,1", "LD C,32", "CALL BDOS", "LD DE,STREC", "LD C,26", "CALL BDOS"], RESET, D) },
  { name: "startup: from B:", ...r(['STFCB: DB 1,"STARTUP CMD"'], ['STFCB: DB 2,"STARTUP CMD"'], RESET, "src/data3.asm") },
  { name: "startup: the skip gone", ...r(["IN A,(STSPORT)", "AND $40", "RET Z"], [], RESET, D) },
  // Every warm boot marks the file finished.
  { name: "startup: a program's exit ends the file", ...r(["LD HL,SVCBSY", "RES 7,(HL)"], ["LD HL,SVCBSY", "RES 7,(HL)", "LD HL,STPOS", "SET 7,(HL)"]) },
  { name: "dirty cache: EXPAND 1 not cleared", ...r(["LD HL,$8000", "LD DE,$8001", "LD BC,$3FFF", "LD (HL),0", "LDIR"], []) },
  {
    name: "host: the guard not rearmed by a reset",
    edits: [text("host/machine.mjs", "if (pc >= coldz && pc < coldz + 0x20) cleared = false;", "if (false) cleared = false;")],
    tests: RESET,
  },
  {
    name: "host: swapCard keeps the old card",
    edits: [text("host/machine.mjs", "    this.sd = image ? new SdSpi({ image, highCapacity, ...(onSdWrite ? { onWrite: onSdWrite } : {}) }) : null;\n  }\n", "  }\n")],
    tests: RESET,
  },
  { name: "recognition: a write before the decision", ...r(["RSLCAP: LD A,($0000)"], ["RSLCAP: LD (RSLBUF),A", "LD A,($0000)"]) },
  // A call into what the old RAM holds: its warm boot jump.
  { name: "recognition: old code run", ...r(["RSLYES: LD HL,DRVTAB"], ["RSLYES: CALL $0000", "LD HL,DRVTAB"]) },
];

const H = "src/hwsvc.asm";
const G = "src/glcd.asm";
const DATA = "src/data.asm";
const MJS = "host/machine.mjs";
const NORETCHECK = text("tools/build.mjs", `  check(at("OLDVOL") === 0xc01d && rom[0x1d] === 0xc9, "ABI 3's ABIVOL must hold a RET");\n`, "");
const t30 = (find, put, tests, file) => ({ edits: [asm(file, find, put)], tests: [tests].flat() });
const WATCH = "(a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbe00 && a < 0xbf00)";
const watch = (to) => ({ edits: [text(MJS, WATCH, to)], tests: ["test/commands.test.mjs"] });
/** C01Dh a jump to a stub that passes the mount service's function N on, and returns from any other. */
const oldFwd = (n, only) => ({
  edits: [NORETCHECK, asm(DATA, ["OLDVOL: DB $C9"], ["OLDVOL: JP OLDFWD"]), asm("src/end.asm", ["CODEEND:"], [`OLDFWD: CP ${n}`, "JP Z,VOLSVC", "RET", "CODEEND:"])],
  tests: ["test/clients.test.mjs"],
  only,
});
/** A keyword the CCP takes as a built-in that refuses, before the transient path. */
const builtin = (word) => ({
  edits: [
    asm("src/data3.asm", ["UNLKEY:"], [`${word}KEY: DB "${word}",0`, "UNLKEY:"]),
    asm("src/cpm/ccp.asm", ["LD DE,UNLKEY", "CALL ISCMD"], [`LD DE,${word}KEY`, "CALL ISCMD", "JP Z,BADCMD", "LD DE,UNLKEY", "CALL ISCMD"]),
  ],
  tests: ["test/commands.test.mjs"],
});

/** KS30's mutants, on 3223ab2. */
export const MUTANTS_KS30 = [
  { name: "rom: no RET at C01Dh (the build)", ...t30(["OLDVOL: DB $C9"], ["OLDVOL:"], [], DATA) },
  { name: "rom: the RET one byte out (the build)", ...t30(['DB "TYPE",0', "OLDVOL: DB $C9"], ['DB "TYPE",0,0', "OLDVOL: DB $C9"], [], DATA) },
  // ABIXCCP's jump kept at C018h, where the table ended before, with two bytes after it so that C01Dh still holds the RET.
  {
    name: "rom: a retired entry left in the table",
    edits: [asm(DATA, ["TYPEKEY:", 'DB "TYPE",0', "OLDVOL: DB $C9"], ["ABIXCCP: JP SVCREG", "DB 0,0", "OLDVOL: DB $C9", "TYPEKEY:", 'DB "TYPE",0'])],
    tests: ["test/devices.test.mjs"],
  },
  { name: "commands: CCP still a built-in, not reaching the transient path", ...builtin("CCP") },
  { name: "commands: EXIT still a built-in, not reaching the transient path", ...builtin("EXIT") },
  // With no resident, UNLOAD returns with carry clear, as if it had removed one.
  { name: "commands: UNLOAD with no resident not refused", ...t30(["LD A,(SVCHEAD)", "CP H", "JR NZ,PRLRF", "LD L,DFLG"], ["LD A,(SVCHEAD)", "CP H", "JR Z,UNLHAS", "OR A", "RET", "UNLHAS: LD L,DFLG"], ["test/commands.test.mjs", "test/svc.test.mjs"], D) },
  { name: "commands: UNLOAD ignores the removable flag", ...t30(["LD L,DFLG", "BIT 0,(HL)", "JR Z,PRLRF"], ["LD L,DFLG"], ["test/commands.test.mjs", "test/svc.test.mjs"], D) },
  { name: "guard: load path ignores it", ...t30(["LD (SVCRC),A", "LD A,(SVCBSY)", "OR A", "JR NZ,PRLRF"], ["LD (SVCRC),A"], ["test/svc.test.mjs"], D) },
  { name: "guard: UNLOAD ignores it", ...t30(["SVCUNL: LD A,(SVCBSY)", "OR A", "JR NZ,PRLRF"], ["SVCUNL: XOR A"], ["test/svc.test.mjs"], D) },
  { name: "guard: never set", ...t30(["SVCCALL: LD A,$80", "LD (SVCBSY),A"], ["SVCCALL: LD A,$80"], ["test/svc.test.mjs"], D) },
  { name: "guard: not reset at warm boot", ...t30(["LD HL,SVCBSY", "RES 7,(HL)"], [], ["test/svc.test.mjs"], B) },
  { name: "guard: not reset after REMOVE or INIT", ...t30(["SVCSHUT: LD A,0", "LD (SVCBSY),A"], ["SVCSHUT: LD A,0"], ["test/svc.test.mjs"], D) },
  // Startup's position set finished as its first line is taken.
  { name: "startup: lines stop after the first", ...t30(["STL2: LD A,L", "SUB LOW(STREC)-1"], ["STL2: LD A,$80+LOW(STREC)-1", "SUB LOW(STREC)-1"], ["test/startup.test.mjs"], D) },
  // Warm boot empties the ring: HHEAD 0, and the entry before it, at HRING+FFh, 0.
  { name: "history: cleared at warm boot", ...t30(["LD HL,SVCBSY", "RES 7,(HL)"], ["LD HL,SVCBSY", "RES 7,(HL)", "XOR A", "LD (HHEAD),A", "LD HL,$BDFF", "CALL HPUT"], ["test/history.test.mjs"], B) },
  { name: "freed page: the watch gone", ...watch("(a < 0xbd00 ? !cacheWrite(pc) : false)") },
  { name: "freed page: the watch a byte short at the top", ...watch("(a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbe00 && a < 0xbeff)") },
  { name: "freed page: the watch a byte short at the bottom", ...watch("(a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbe01 && a < 0xbf00)") },
  { name: "freed page: the watch spills onto the history", ...watch("(a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbdff && a < 0xbf00)") },
  { name: "freed page: the watch spills onto the reserved page", ...watch("(a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbe00 && a < 0xbf01)") },
  { name: "selector: base test one low", ...t30(["SUB HWBASE", "CP HWCOUNT"], ["SUB HWBASE-1", "CP HWCOUNT"], ["test/hwsvc.test.mjs"], H) },
  { name: "selector: base test one high", ...t30(["SUB HWBASE", "CP HWCOUNT"], ["SUB HWBASE+1", "CP HWCOUNT"], ["test/hwsvc.test.mjs"], H) },
  { name: "selector: upper test one high", ...t30(["SUB HWBASE", "CP HWCOUNT"], ["SUB HWBASE", "CP HWCOUNT+1"], ["test/hwsvc.test.mjs"], H) },
  { name: "selector: upper test one low", ...t30(["SUB HWBASE", "CP HWCOUNT"], ["SUB HWBASE", "CP HWCOUNT-1"], ["test/hwsvc.test.mjs"], H) },
  { name: "selector: the table not offset", ...t30(["LD HL,HWTAB0"], ["LD HL,HWTAB"], ["test/hwsvc.test.mjs"], H) },
  {
    name: "selector: a refusal clobbers B",
    edits: [asm(H, ["CP HWCOUNT", "LD A,HWEBAD", "JR NC,HWERR"], ["CP HWCOUNT", "LD A,HWEBAD", "JR NC,HWREF"]), asm(H, ["HWERR: OR A"], ["HWREF: LD B,A", "HWERR: OR A"])],
    tests: ["test/hwsvc.test.mjs"],
  },
  {
    name: "selector: a refusal clobbers HL",
    edits: [asm(H, ["CP HWCOUNT", "LD A,HWEBAD", "JR NC,HWERR"], ["CP HWCOUNT", "LD A,HWEBAD", "JR NC,HWREF"]), asm(H, ["HWERR: OR A"], ["HWREF: LD H,A", "HWERR: OR A"])],
    tests: ["test/hwsvc.test.mjs"],
  },
  { name: "selector: abi.inc out of step (the build)", ...t30(["HWLCD EQU 21"], ["HWLCD EQU 22"], [], "src/abi.inc") },
  // HWBASE moved in hwsvc.asm and abi.inc alike, the services' numbers left.
  { name: "selector: HWBASE out of step with HWINFO (the build)", edits: [asm(H, ["HWBASE EQU 19"], ["HWBASE EQU 20"]), asm("src/abi.inc", ["HWBASE EQU 19"], ["HWBASE EQU 20"])], tests: [] },
  // The dispatcher as ABI 3's: numbers from 0.
  { name: "old DEMO: reaches the services", edits: [asm(H, ["SUB HWBASE", "CP HWCOUNT"], ["CP HWCOUNT"]), asm(H, ["LD HL,HWTAB0"], ["LD HL,HWTAB"])], tests: ["test/clients.test.mjs"], only: "^an old DEMO" },
  { name: "old DEMO: refusal without carry", ...t30(["HWERR: OR A", "SCF", "RET"], ["HWERR: OR A", "RET"], ["test/clients.test.mjs"], H) },
  { name: "old VOLS: reaches the mount service", ...oldFwd(2, "^an old VOLS") },
  { name: "old MOUNT unmounting: reaches the mount service", ...oldFwd(1, "^an old MOUNT, to unmount") },
  { name: "old MOUNT mounting: reaches the mount service", ...oldFwd(0, "^an old MOUNT, to mount") },
  { name: "old VOLS: no RET, runs on into the data", edits: [NORETCHECK, asm(DATA, ["OLDVOL: DB $C9"], ["OLDVOL: DB $00"])], tests: ["test/clients.test.mjs"], only: "^an old VOLS" },
  // The pinned DEMO.COM replaced by test/programs/demo.asm as this tree builds it.
  { name: "old binaries: a rebuilt fixture", edits: [{ file: "test/fixtures/edc2745/DEMO.COM", rebuild: "test/programs/demo.asm" }], tests: ["test/clients.test.mjs"] },
  { name: "row 3: PICO? sets no flag", ...t30(["LD HL,PICMSG", "JP LCDWRD"], ["LD HL,PICMSG", "JP LCD3"], ["test/pico.test.mjs"], D) },
  { name: "row 3: GLCD? sets no flag", ...t30(["LD HL,GLCMSG", "JP LCDWRD"], ["LD HL,GLCMSG", "JP LCD3"], ["test/pico.test.mjs"], G) },
  { name: "row 3: a program's write leaves the flag", ...t30(["LD HL,CONDEV", "RES 7,(HL)", "HWSL1: LD HL,LCDROWS"], ["HWSL1: LD HL,LCDROWS"], ["test/pico.test.mjs"], H) },
  { name: "row 3: the wrong row resets it", ...t30(["LD A,B", "CP 3", "JR NZ,HWSL1"], ["LD A,B", "CP 2", "JR NZ,HWSL1"], ["test/pico.test.mjs"], H) },
  { name: "row 3: every take blanks it", ...t30(["WRDCLR: LD HL,CONDEV", "BIT 7,(HL)", "RET Z"], ["WRDCLR: LD HL,CONDEV"], ["test/pico.test.mjs"], G) },
  { name: "row 3: no take clears a word", ...t30(["WRDCLR: LD HL,CONDEV"], ["WRDCLR: OR A", "RET", "LD HL,CONDEV"], ["test/pico.test.mjs"], G) },
  { name: "row 3: the flag stays after a take", ...t30(["RET Z", "RES 7,(HL)", "PUSH BC"], ["RET Z", "PUSH BC"], ["test/pico.test.mjs"], G) },
  { name: "row 3: a load under PICO.SVC leaves GLCD?", ...t30(["JR NZ,WRDCLR"], ["RET NZ"], ["test/pico.test.mjs"], G) },
  { name: "row 3: STDONE not masked", ...t30(["AND $FF-CDWRD"], [], ["test/pico.test.mjs"], D) },
  { name: "row 3: the word cleared leaves carry set", ...t30(["POP BC", "OR A", "RET"], ["POP BC", "RET"], ["test/pico.test.mjs"], G) },
  { name: "row 3: INFO loses the bit", ...t30(["LD B,A", "LD DE,ROMVER"], ["AND $7F", "LD B,A", "LD DE,ROMVER"], ["test/pico.test.mjs"], H) },
];

const C = "src/cpm/ccp.asm";
const BD = "src/cpm/bdos.asm";
const CHAIN = ["test/chain.test.mjs"];
const k = (find, put, file = C, tests = CHAIN) => ({ edits: [asm(file, find, put)], tests });
const FAILED = ["XOR A", "LD (CHPOS),A", "JP STARTED", "MLTKC: INC HL"];

/** KS32's mutants: each rule of the chained line, function 47 and KE-127's fix. */
export const MUTANTS_KS32 = [
  { name: "line: ! not a separator", ...k(["CP '!'", "JR Z,MLTK2"], []) },
  { name: "line: an empty piece not passed over", ...k(["CHSK1: LD A,(HL)", "CP SPACE", "JR Z,CHSK2", "CP '!'", "JR NZ,CHSK3"], ["CHSK1: LD A,(HL)", "CP SPACE", "JR NZ,CHSK3"]) },
  {
    name: "line: the rest not kept over warm boot",
    ...k(["CPMINIT: LD HL,CCPCLR", "LD DE,CCPCLR+1", "LD BC,BDOSRME-CCPCLR-1"], ["CPMINIT: LD HL,CCPRAM", "LD DE,CCPRAM+1", "LD BC,BDOSRME-CCPRAM-1"], B, [...CHAIN, "test/walk.test.mjs"]),
  },
  {
    name: "line: a startup line before the rest",
    ...k(["CALL CHSKIP", "JR NZ,MLECHO", "LD (CHPOS),A", "CALL STLINE", "JR NC,MLGOT"], ["CALL STLINE", "JR NC,MLGOT", "CALL CHSKIP", "JR NZ,MLECHO", "LD (CHPOS),A"]),
  },
  { name: "line: a piece not echoed", ...k(["LD E,A", "PUSH HL", "CALL PUTCHAR", "POP HL", "INC HL", "JR MLEC1"], ["INC HL", "JR MLEC1"]) },
  { name: "line: no upper case", ...k(["AND $DF", "LD (HL),A", "MLTKN: INC HL"], ["MLTKN: INC HL"]) },
  { name: "line: no 0 after a typed line", ...k(["ADD HL,DE", "LD (HL),D", "LD A,1"], ["ADD HL,DE", "LD A,1"]) },
  { name: "line: each piece parsed from the line's start", ...k(["LD HL,(ARGSTRT)", "CALL CMDSKIP"], ["LD HL,CMDTXT", "CALL CMDSKIP"]) },
  { name: ": not a prefix", ...k(["CP ':'", "JR NZ,MLTK0"], ["JR MLTK0"]) },
  { name: ": runs after a failure", ...k(FAILED, ["MLTKC: INC HL"]) },
  { name: ": FFFFh a failure", ...k(["LD A,E", "INC A", "JR Z,MLTKC"], []) },
  { name: ": failure from FE00h", ...k(["LD A,D", "INC A", "JR NZ,MLTKC"], ["LD A,D", "INC A", "INC A", "JR NZ,MLTKC"]) },
  {
    name: ": after a failure only that piece skipped",
    ...k(FAILED, ["MLSKP: LD A,(HL)", "OR A", "JR Z,MLSK3", "INC HL", "CP '!'", "JR NZ,MLSKP", "LD A,L", "SUB LOW(CMDTXT-1)", "MLSK3: LD (CHPOS),A", "JP STARTED", "MLTKC: INC HL"]),
  },
  { name: "code: not cleared as a piece is taken", ...k(["LD HL,0", "LD (PRGCODE),HL", "LD HL,(ARGSTRT)"], ["LD HL,(ARGSTRT)"]) },
  {
    name: "code: cleared only as a program starts",
    edits: [asm(C, ["LD HL,0", "LD (PRGCODE),HL", "LD HL,(ARGSTRT)"], ["LD HL,(ARGSTRT)"]), asm(C, ["CMDRUN: CALL PREPPAGE"], ["CMDRUN: LD HL,0", "LD (PRGCODE),HL", "CALL PREPPAGE"])],
    tests: CHAIN,
  },
  { name: "code: NAME? and a built-in's error leave it", ...k(["ERRGO: LD HL,RCFAIL", "LD (PRGCODE),HL"], ["ERRGO:"]) },
  { name: "code: NO FILE leaves it", ...k(["FILENO:", "LD DE,NOFILE", "JP ERRGO"], ["FILENO:", "LD DE,NOFILE", "JP PRTGO"]) },
  { name: "code: FILE EXISTS leaves it", ...k(["RENEXIST:", "LD DE,FILEEX", "JP ERRGO"], ["RENEXIST:", "LD DE,FILEEX", "JP PRTGO"]) },
  { name: "code: COPY's success a failure", ...k(["JP PRTGO", "CPFAIL:", "JP ERRGO"], ["CPFAIL:", "JP ERRGO"]) },
  { name: "47: not dispatched", ...k(["CP 47", "JR Z,FNCHAIN"], [], BD) },
  { name: "47: a CR let through", ...k(["CP CR", "JR Z,FNCHNO", "CP LF", "JR Z,FNCHNO"], ["CP LF", "JR Z,FNCHNO"], BD) },
  { name: "47: an LF let through", ...k(["CP CR", "JR Z,FNCHNO", "CP LF", "JR Z,FNCHNO"], ["CP CR", "JR Z,FNCHNO"], BD) },
  { name: "47: a 0 looked for in 129 bytes", ...k(["FNCHAIN:", "LD HL,(CURDMA)", "LD B,128"], ["FNCHAIN:", "LD HL,(CURDMA)", "LD B,129"], BD) },
  { name: "47: a 0 looked for in 127 bytes", ...k(["FNCHAIN:", "LD HL,(CURDMA)", "LD B,128"], ["FNCHAIN:", "LD HL,(CURDMA)", "LD B,127"], BD) },
  { name: "47: 64 bytes copied", ...k(["LD DE,CMDTXT", "LD BC,128", "LDIR"], ["LD DE,CMDTXT", "LD BC,64", "LDIR"], BD) },
  { name: "47: the program goes on", ...k(["LD A,1", "LD (CHPOS),A", "JP BIOWBT"], ["LD A,1", "LD (CHPOS),A", "JP RETZERO"], BD) },
  { name: "47: the line not marked", ...k(["LD A,1", "LD (CHPOS),A", "JP BIOWBT"], ["JP BIOWBT"], BD) },
  { name: "47: refused with A = 0", ...k(["FNCHNO: LD A,$FF"], ["FNCHNO: LD A,0"], BD) },
  { name: "stop: ^C keeps the rest", ...k(["LD C,'C'", "CALL ECHOCHAR", "JP CHDROP"], ["LD C,'C'", "CALL ECHOCHAR", "JP BIOWBT"], BD) },
  { name: "stop: a bad sector keeps the rest", ...k(["BADSECT:", "LD HL,ERRBAD", "CALL DISKERR", "JP CHDROP"], ["BADSECT:", "LD HL,ERRBAD", "CALL DISKERR", "JP BIOWBT"], BD) },
  // The review's R1 to R4: the other four BDOS error exits, each back to BIOWBT.
  { name: "stop: a read-only drive keeps the rest", ...k(["LD HL,ERRRO", "CALL DISKERR", "JP CHDROP"], ["LD HL,ERRRO", "CALL DISKERR", "JP BIOWBT"], BD) },
  { name: "stop: a failed select keeps the rest", ...k(["SELFAIL:", "LD HL,ERRSEL", "CALL DISKERR", "JP CHDROP"], ["SELFAIL:", "LD HL,ERRSEL", "CALL DISKERR", "JP BIOWBT"], BD) },
  { name: "stop: ERA's read-only file keeps the rest", ...k(["LD HL,ERRFILE", "CALL DISKERR", "JP CHDROP"], ["LD HL,ERRFILE", "CALL DISKERR", "JP BIOWBT"], BD) },
  // R5: SAVE's NO SPACE leaving the code.
  { name: "code: NO SPACE leaves it", ...k(["SAVENOSP:", "LD DE,NOSPACE", "JP ERRGO"], ["SAVENOSP:", "LD DE,NOSPACE", "JP PRTGO"]) },
  { name: "stop: a write lost at warm boot keeps the rest", ...k(["XOR A", "LD (HL),A", "LD (CHPOS),A", "LD HL,CWMSG"], ["LD (HL),0", "LD HL,CWMSG"], "src/cache.asm") },
  { name: "stop: ^C at [more] keeps the rest", ...k(["CP 3", "JR Z,PGDROP"], ["CP 3", "JR Z,PGSTOP"]) },
  { name: "stop: CHDROP drops nothing", ...k(["CHDROP: XOR A", "LD (CHPOS),A", "JP BIOWBT"], ["CHDROP: JP BIOWBT"], BD) },
  // CHPOS past HIRME and the line past cold boot's clear: either alone is masked by the other.
  {
    name: "stop: a reset keeps the rest",
    edits: [
      asm("src/ram.asm", ["CHPOS: DS 1", "HIRME:"], ["HIRME:", "CHPOS: DS 1"]),
      asm(B, ["LD HL,WSBASE", "LD DE,WSBASE+1", "LD BC,WSSPAN", "LD (HL),0", "LDIR"], ["LD HL,WSBASE", "LD DE,WSBASE+1", "LD BC,CMDFCB-WSBASE-1", "LD (HL),0", "LDIR", "LD HL,CCPCLR", "LD DE,CCPCLR+1", "LD BC,WSEND-CCPCLR-1", "LD (HL),0", "LDIR"]),
    ],
    tests: CHAIN,
  },
  { name: "KE-127: a startup line not cut at 127", ...k(["INC B", "DEC B", "JR Z,STL1"], [], D) },
  { name: "KE-127: a startup line cut at 128", ...k(["LD DE,CMDTXT", "LD B,127"], ["LD DE,CMDTXT", "LD B,128"], D) },
];

const CT = "tools/lib/container.mjs";
const VERIFY = ["test/verify-mount.test.mjs"];
const CPM = ["test/cpm22.test.mjs"];
const f = (find, put, tests = CPM, file = BD) => ({ edits: [asm(file, find, put)], tests });

/** The fixes after KS32: each mutant undoes one, and its test catches it. */
export const MUTANTS_FIXES = [
  {
    name: "tecvol: a 1.0 card's order not checked",
    edits: [text(CT, "    if (volumes.length && v.start < volumes.at(-1).start", "    if (minor >= 1 && volumes.length && v.start < volumes.at(-1).start")],
    tests: VERIFY,
  },
  {
    name: "tecvol: a drive past the drives field let through",
    edits: [text(CT, "drives && v.mount >= drives) fail(", "drives && v.mount >= 99) fail(")],
    tests: VERIFY,
  },
  { name: "write: the FCB left on the next extent when its make fails", ...f(["EXTFULL:", "CALL FCBEX", "POP DE", "LD (HL),E", "INC HL", "INC HL", "LD (HL),D"], ["EXTFULL:", "POP DE"]) },
  {
    name: "write: the extent moved on after record 127",
    ...f(["JR NZ,WRITEBAD", "XOR A", "RET", "", "WRITEBAD:"], ["JR NZ,WRITEBAD", "CALL FCBCR", "LD A,(ZEROFIL)", "ADD A,(HL)", "CP 128", "CALL Z,ADVEXT", "XOR A", "RET", "", "WRITEBAD:"]),
  },
  { name: "32: E stored unmasked", ...f(["CP $FF", "JR Z,GETUSER", "AND $1F", "LD (USERNO),A"], ["CP $FF", "JR Z,GETUSER", "LD (USERNO),A"]) },
  {
    name: "CCP: a drive with no volume selected at warm boot",
    ...f(["CP MAXDRV", "JR NC,CCPDA", "LD E,A", "LD D,0", "LD HL,DRVIDX", "ADD HL,DE", "LD A,(HL)", "OR A", "LD A,E", "JR NZ,CCPDR", "CCPDA: XOR A", "CCPDR: LD (BOOTDRV),A"], ["LD (BOOTDRV),A"], ["test/mount.test.mjs"], C),
  },
  { name: "13: the user number set to 0", ...f(["RSTAIL: XOR A", "LD (CURDRV),A", "LD H,A"], ["RSTAIL: XOR A", "LD (CURDRV),A", "LD (USERNO),A", "LD H,A"]) },
  { name: "R/O: a sequential write let through", ...f(["FNWRITE:", "CALL ROFCB"], ["FNWRITE:", "CALL CHKRO"]) },
  { name: "R/O: a random write let through", ...f(["LD (ZEROFIL),A", "CALL ROFCB", "CALL RANDPREP"], ["LD (ZEROFIL),A", "CALL CHKRO", "CALL RANDPREP"]) },
  { name: "R/O: a rename let through", ...f(["JR Z,MUTCOPY", "LD HL,(MATCHPTR)", "CALL ROTEST", "MUTCOPY:"], ["JR Z,MUTCOPY", "MUTCOPY:"]) },
  { name: "R/O: function 30 refused as well", ...f(["AND $10", "JR Z,MUTCOPY"], ["AND $10"]) },
];

// ---- KS33: the rename ---------------------------------------------------

export const CCP_OLD_TYPE = [text(C, "LD      DE,'V'*256+'S'", "LD      DE,'R'*256+'D'"), text(C, "CP      'C'\n        JR      NZ,CMDCOM", "CP      'V'\n        JR      NZ,CMDCOM")];

export const MUTANTS_KS33 = [
  { name: "the CCP left on .DRV", edits: CCP_OLD_TYPE, tests: ["test/svc.test.mjs", "test/glcd.test.mjs", "test/pico.test.mjs", "test/startup.test.mjs", "test/clients.test.mjs"] },
  { name: "CON UC1 left on GLCD.DRV", edits: [text("src/data3.asm", '"GLCD    SVC"', '"GLCD    DRV"')], tests: ["test/pico.test.mjs"] },
  { name: "the listing left as DRIVERS", edits: [text("src/data3.asm", '"SERVICES",0', '"DRIVERS",0')], tests: ["test/svc.test.mjs"] },
  { name: "the alias gone from abi.inc", edits: [text("src/abi.inc", "ABIDRV\tEQU\tABISVC", "ABIXXX\tEQU\tABISVC")], tests: ["test/svc.test.mjs"], only: "ABIDRV" },
  { name: "the demo out of the source check", edits: [text("tools/build.mjs", 'n.startsWith("svc")', 'n.startsWith("drv")')], tests: [] },
  { name: "the page: a chained line taken whole", edits: [text("host/card.mjs", 'line.split("!").forEach(', 'line.split("\\n").forEach(')], tests: ["test/pico.test.mjs"] },
  { name: "the page: a colon kept after a display piece", edits: [text("host/card.mjs", "!taken ? own : i === 0 ? own && colon : colon", "own")], tests: ["test/pico.test.mjs"], only: "loses its colon" },
  { name: "the page: an old card's words name the first file", edits: [text("host/card.mjs", 'files.find((f) => f.name === asked) ?? ', "")], tests: ["test/pico.test.mjs"], only: "name the display asked for" },
  { name: "the page: an old card's own words gone", edits: [text("host/card.mjs", "if (old) return", "if (!old) return")], tests: ["test/pico.test.mjs"] },
  { name: "the media tool takes any TAS.COM", edits: [text("tools/media.mjs", "if (got !== entry.sha256) throw", "if (false) throw")], tests: ["test/tas.test.mjs"], only: "the media tool refuses" },
];

// KS34: kept vectors, the resident header, masks, the safe read and function
// 47, each with the tests meant to catch it.
const SVCF = "src/svc.asm";
const PICOF = "drivers/pico.asm";
const CONF = "src/console.asm";
const ks34 = (file, find, put, tests) => ({ edits: [asm(file, find, put)], tests });
const VEC = ["test/svc.test.mjs"];
const SYS = ["test/system.test.mjs"];
const MASK = ["test/masking.test.mjs"];
export const MUTANTS_KS34 = [
  { name: "sweep: stops at 0037h", ...ks34(B, ["CP $40", "JR NZ,RSTCLR"], ["CP $38", "JR NZ,RSTCLR"], VEC) },
  { name: "sweep: the top itself kept", ...ks34(B, ["SUB (HL)", "INC HL"], ["SUB (HL)", "CCF", "INC HL"], VEC) },
  { name: "sweep: the bound back at C0h", ...ks34(B, ["LD A,(PZTOP+1)", "SBC A,(HL)"], ["LD A,$BF", "SBC A,(HL)"], VEC) },
  { name: "sweep: the bound on the page alone", ...ks34(B, ["SUB (HL)", "INC HL", "LD A,(PZTOP+1)"], ["SCF", "INC HL", "LD A,(PZTOP+1)"], VEC) },
  { name: "sweep: 003Fh keeps its RET", ...ks34(B, ["LD (RST7+7),A"], ["NOP"], SYS) },
  { name: "sweep: exits with carry set", ...ks34(B, ["LD A,$FB", "LD (RST7),A", "RET"], ["LD A,$FB", "LD (RST7),A", "SCF", "RET"], VEC) },
  { name: "failed INIT: a claimed slot left", ...ks34(SVCF, ["LD H,D", "CALL SVCFRE"], ["LD H,D"], VEC) },
  { name: "unload: no sweep", ...ks34(SVCF, ["CALL PRLTOP", "JP PZSWP"], ["JP PRLTOP"], VEC) },
  { name: "failed INIT: no sweep", ...ks34(SVCF, ["LD (PZBDOS+1),HL", "CALL PZSWP"], ["LD (PZBDOS+1),HL"], VEC) },
  { name: "unload: a claimed slot left", ...ks34(SVCF, ["LD (HL),D"], ["NOP"], VEC) },
  { name: "unload: the slots a place out", ...ks34(SVCF, ["LD HL,8", "LD DE,8", "SRL A", "SVCUC: SRL A"], ["LD HL,16", "LD DE,8", "SRL A", "SVCUC: SRL A"], VEC) },
  { name: "claims: a held slot let through", ...ks34(SVCF, ["CP $C3", "JP Z,PRLRF"], ["CP $C3"], VEC) },
  { name: "claims: the slots a place out", ...ks34(SVCF, ["LD HL,8", "LD DE,8", "SRL A", "SVCMC: SRL A"], ["LD HL,16", "LD DE,8", "SRL A", "SVCMC: SRL A"], VEC) },
  { name: "claims: format 3's flags of 1 claim", ...ks34(SVCF, ["LD DE,8", "SRL A", "SVCMC: SRL A"], ["LD DE,8", "NOP", "NOP", "SVCMC: SRL A"], VEC) },
  { name: "reset: a vector kept", edits: [asm(B, ["LD HL,0", "LD DE,1", "LD BC,$FF"], ["LD HL,$40", "LD DE,$41", "LD BC,$BF"]), asm(B, ["LD A,(PZTOP+1)", "SBC A,(HL)"], ["LD A,$7F", "SBC A,(HL)"])], tests: VEC },
  { name: "entry: the link restored", ...ks34(SVCF, ["LD HL,BENTRY"], ["LD HL,(PZTOP)"], VEC) },
  { name: "header: the fields below (0006h)", ...ks34(SVCF, ["LD H,A", "LD L,B", "LD (PZBDOS+1),HL"], ["LD H,A", "LD L,3", "LD (PZBDOS+1),HL"], VEC) },
  { name: "header: the owner not kept", ...ks34(SVCF, ["LD DE,DF+DOLD", "LD BC,3"], ["LD DE,DF+DOLD", "LD BC,2"], VEC) },
  { name: "header: the top from the stub alone", ...ks34("src/prl.asm", ["OR A", "JR NZ,PRLT1"], ["OR A", "NOP", "NOP"], VEC) },
  { name: "header: the page above from nothing", ...ks34(SVCF, ["RET NZ", "LD A,(STUBAD+1)"], ["RET NZ", "LD A,$BF"], VEC) },
  { name: "stub: a byte low", ...ks34("src/vol.asm", ["DEC HL", "DEC HL", "DEC HL", "LD (STUBAD),HL"], ["DEC HL", "DEC HL", "DEC HL", "DEC HL", "LD (STUBAD),HL"], SYS) },
  { name: "recognition: W = S refused", ...ks34(B, ["SBC HL,DE", "JR Z,RSLYES"], ["SBC HL,DE", "NOP", "NOP"], ["test/reset.test.mjs"]) },
  { name: "recognition: S below 8000h let through", ...ks34(B, ["LD A,H", "CP $80", "JR C,RSLNO", "LD DE,(STUBAD)"], ["LD A,H", "CP $80", "LD DE,(STUBAD)"], ["test/reset.test.mjs"]) },
  { name: "mask: VPAIR with no DI", ...ks34(PICOF, ["VPAIR1: PUSH AF", "DI"], ["VPAIR1: PUSH AF", "NOP"], MASK) },
  { name: "mask: VPAIR leaves them off", ...ks34(PICOF, ["RET PO", "EI", "RET"], ["RET PO", "RET"], MASK) },
  { name: "mask: VPAIR turns them on", ...ks34(PICOF, ["RET PO", "EI", "RET"], ["NOP", "EI", "RET"], MASK) },
  { name: "mask: GFXREG bare", ...ks34(PICOF, ["GFXREG: LD L,A", "LD A,B", "OR $80", "LD H,A", "JP VPAIR"], ["GFXREG: OUT (VDPCTL),A", "LD A,B", "OR $80", "OUT (VDPCTL),A", "RET"], MASK) },
  { name: "mask: TMSR bare", ...ks34(PICOF, ["TMSR: LD A,(HL)", "PUSH HL", "LD L,A", "LD H,C", "CALL VPAIR", "POP HL"], ["TMSR: LD A,(HL)", "OUT (VDPCTL),A", "LD A,C", "OUT (VDPCTL),A"], MASK) },
  { name: "mask: TXBYTE with no DI", ...ks34(CONF, ["CALL IFFGET", "PUSH AF", "DI", "LD B,9"], ["CALL IFFGET", "PUSH AF", "NOP", "LD B,9"], MASK) },
  { name: "mask: RXBITS with no DI", ...ks34(CONF, ["PUSH AF", "DI", "LD D,RXHALF"], ["PUSH AF", "NOP", "LD D,RXHALF"], MASK) },
  { name: "mask: TXBYTE leaves them off", ...ks34(CONF, ["JR NZ,TXS", "POP AF", "RET PO", "EI", "RET"], ["JR NZ,TXS", "POP AF", "RET"], MASK) },
  { name: "mask: RXBITS leaves them off", ...ks34(CONF, ["LD A,C", "RET PO", "EI", "RET"], ["LD A,C", "RET"], MASK) },
  { name: "mask: RXHALF not re-derived", edits: [text("tools/build.mjs", "1.5 * bit - 51 - 58.5 - kbLate / 2", "1.5 * bit - 51 - kbLate / 2")], tests: MASK },
  { name: "erratum: IFFGET's bare read", ...ks34("src/cache.asm", ["IFFGET: LD A,I", "RET PE", "LD A,I", "RET"], ["IFFGET: LD A,I", "RET"], MASK) },
  { name: "erratum: VPAIR's bare read", ...ks34(PICOF, ["VPAIR: LD A,I", "JP PE,VPAIR1", "LD A,I"], ["VPAIR: LD A,I"], MASK) },
  { name: "47: the guard outlives a warm boot, from INIT", ...ks34(B, ["LD HL,SVCBSY", "RES 7,(HL)"], ["LD HL,SVCBSY", "NOP", "NOP"], VEC), only: "function 47 from INIT" },
  { name: "47: the guard outlives a warm boot, from REMOVE", ...ks34(B, ["LD HL,SVCBSY", "RES 7,(HL)"], ["LD HL,SVCBSY", "NOP", "NOP"], VEC), only: "function 47 from REMOVE" },
];

// KS36a: removals and ABI 5. Each mutant names a test that can fail; parts 1,
// 2 and 8 are deletions, judged by the tests deleted and kept with them.
const CCPF = "src/cpm/ccp.asm";
const BDOSF = "src/cpm/bdos.asm";
const HWF = "src/hwsvc.asm";
const VOLF = "src/vol.asm";
const GLF = "src/glcd.asm";
const EXP = ["test/expand.test.mjs"];
const SRCH = ["test/search.test.mjs", "test/chain.test.mjs"];
const HWT = ["test/hwsvc.test.mjs"];
export const MUTANTS_KS36A = [
  { name: "64K: EXPAND 1 not looked for", ...ks34(B, ["CALL RAMPAT", "LD A,LATEXP", "LD HL,DETEXP", "CALL DETECT", "CP 2", "RET Z", "JR RAMBAD"], ["CALL RAMPAT", "RET"], EXP) },
  { name: "64K: the check after the banner", edits: [asm(B, ["CALL RAMCHK"], ["NOP", "NOP", "NOP"]), asm(B, ["COLDRT: CALL LCDINIT"], ["COLDRT: CALL RAMCHK", "CALL LCDINIT"])], tests: EXP },
  { name: "search: none", ...ks34(CCPF, ["INC (HL)", "CALL LOADA"], ["JR BADCMD", "CALL LOADA"], SRCH) },
  { name: "search: a named drive searched too", ...ks34(CCPF, ["OR A", "JR NZ,BADCMD", "LD A,(PZDU)", "AND $0F", "JR Z,BADCMD", "INC (HL)"], ["OR A", "LD A,(PZDU)", "AND $0F", "JR Z,BADCMD", "LD (HL),1"], SRCH) },
  { name: "search: the current drive left on A:", ...ks34(CCPF, ["INC (HL)", "CALL LOADA"], ["INC (HL)", "XOR A", "LD (PZDU),A", "CALL LOADA"], SRCH) },
  { name: "A7: A:'s user 0 not searched", ...ks34(CCPF, ["AND $F0", "SCF", "RET Z", "PUSH AF"], ["AND $F0", "SCF", "RET", "PUSH AF"], ["test/search.test.mjs"]) },
  { name: "B1: a program's run into C000h cold boots", ...ks34(B, ["CP HIGH(RSTENT)", "JP NZ,WBOOTR"], ["CP HIGH(RSTENT)", "NOP", "NOP", "NOP"], EXP) },
  { name: "KE-149: the case folded before Return", ...ks34(CCPF, ["CP CR", "JP Z,STARTED", "AND $DF"], ["AND $DF", "CP CR", "JP Z,STARTED"], ["test/commands.test.mjs"]) },
  { name: "KE-148: close writes a read-only drive", ...ks34(BDOSF, ["CALL RONZ", "LD A,0", "RET NZ", "CALL FINDEXCT"], ["CALL FINDEXCT"], ["test/cpm22.test.mjs"]) },
  { name: "EXPAND 1: the warm-boot jump planted again", ...ks34(B, ["WBOOTR: DI", "LD A,LATCLAS"], ["WBOOTR: DI", "LD A,LATCLAS+LATEXP", "OUT (SYSLAT),A", "LD A,$C3", "LD (RAMBIOS+3),A", "LD A,LATCLAS"], EXP) },
  { name: "dispatch: one past the table taken", ...ks34(HWF, ["CP TNCOUNT"], ["CP TNCOUNT+1"], HWT) },
  { name: "dispatch: the last number refused", ...ks34(HWF, ["CP TNCOUNT"], ["CP TNCOUNT-1"], ["test/svc.test.mjs"]) },
  { name: "dispatch: a refusal's status 0", ...ks34(HWF, ["CP TNCOUNT", "LD A,TNEBAD"], ["CP TNCOUNT", "LD A,0"], HWT) },
  { name: "INFO: probes the clock again", ...ks34(HWF, ["HWSINFO:", "LD A,(CONDEV)"], ["HWSINFO:", "CALL RTCHAS", "LD A,(CONDEV)"], HWT) },
  { name: "INFO: the clock's bit not set at cold boot", ...ks34(B, ["LD HL,CONDEV", "SET 3,(HL)"], ["LD HL,CONDEV", "NOP", "NOP"], HWT) },
  { name: "startup: the clock's bit not masked", ...ks34(SVCF, ["AND $FF-CDWRD-CDRTC"], ["AND $FF-CDWRD"], ["test/pico.test.mjs"]) },
  { name: "volumes: a refusal without carry", ...ks34(VOLF, ["VBAD: LD A,TNEBAD", "SCF", "RET"], ["VBAD: LD A,TNEBAD", "OR A", "RET"], HWT) },
  { name: "volumes: B not the drive", ...ks34(VOLF, ["VSIN: LD C,B"], ["VSIN: LD C,1"], ["test/reset.test.mjs"]) },
  { name: "driver hook: a refusal's status 0", ...ks34(GLF, ["LD A,TNEBAD", "RET C", "XOR A"], ["LD A,0", "RET C", "XOR A"], HWT) },
  { name: "find: B not the least version", ...ks34(SVCF, ["SVFND: LD C,B", "LD B,0"], ["SVFND: LD C,0", "LD B,0"], ["test/svc.test.mjs", "test/pico.test.mjs"]) },
  { name: "list: one off", ...ks34(SVCF, ["SVLST: LD C,B", "LD HL,(REGHEAD)", "INC C"], ["SVLST: LD C,B", "LD HL,(REGHEAD)", "INC C", "INC C"], ["test/svc.test.mjs"]) },
  { name: "A1: VIDEO takes any B", ...ks34(HWF, ["HWSVID: LD A,B", "CP 2", "LD A,TNEBAD", "JP NC,HWERR"], ["HWSVID: LD A,B", "CP 2", "LD A,TNEBAD"], HWT) },
  { name: "A1: RTC takes any B", ...ks34(HWF, ["HWSRTC: LD A,B", "CP 2", "LD A,TNEBAD", "JP NC,HWERR"], ["HWSRTC: LD A,B", "CP 2", "LD A,TNEBAD"], HWT) },
  { name: "A1: the driver hook takes any B", ...ks34(GLF, ["SVDRV: LD A,B", "CP CMCRT"], ["SVDRV: LD A,B", "JR SVDRV1", "CP CMCRT"], HWT) },
  { name: "format: 3 accepted", ...ks34(SVCF, ["DMAGIC EQU SVCFMT*256+'D'"], ["DMAGIC EQU 3*256+'D'"], ["test/clients.test.mjs"]) },
];
