// The stage models' mutants. Each is a list of edits to a copy of the landed
// tree and the test files to run on it, with a pattern for the names of the
// tests meant to catch it where those are fewer than the file's. An edit to assembly source names a
// run of consecutive lines by their code, comments and spacing aside, which
// must occur once in the file, and the lines that replace it; an edit to any
// other file is a text that must occur once and its replacement. A mutant is
// caught when the build fails or a test fails, and "by" names the first three
// to fail, in the files' order: the build's message, a test's name, or a
// test file whose run failed outside any test, at its end, where the host's
// watch of EXPAND 1 asserts. The names are the stage's record's; where a
// mutant's change had to be reconstructed from its name, the comment beside
// it says what it does.

import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, copyTree, log, node } from "./model.mjs";

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

/** Apply each of MUTANTS to a copy of DIR at WORK, building nothing: the errors of those that don't apply. */
export function check(dir, work, mutants) {
  return mutants.flatMap((m, i) => {
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
export async function mutate(dir, work, mutants) {
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
  try {
    const only = m.only ? [`--test-name-pattern=${m.only}`] : [];
    tap = await node(copy, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...only, ...m.tests]);
  } catch (e) {
    tap = e.message;
  }
  // A failure outside any test is named by its file: the host's watch of EXPAND 1
  // asserts in test/lib/machine.mjs, after a file's last test, at the file's end.
  const where = (n) => (isAbsolute(n) ? relative(copy, n) : n);
  const failed = [...tap.matchAll(/^\s*not ok \d+ - (.*?)(?: # .*)?$/gm)].map((x) => where(x[1])).map((n) => (n === "test/lib/machine.mjs" ? "the file's end" : n));
  const names = failed.filter((n) => !m.tests.includes(n) && n !== "the file's end");
  const by = (names.length ? names : failed).slice(0, 3);
  log(`mutant ${m.name}: ${by.length ? "caught" : "survived"}`);
  return { caught: by.length > 0, by };
}

const RESET = ["test/reset.test.mjs"];
const B = "src/boot.asm";
const V = "src/vol.asm";
const D = "src/drv.asm";
const r = (find, put, tests = RESET, file = B) => ({ edits: [asm(file, find, put)], tests });

/** KS31's mutants and its review's, on a tree with KE-126's fix: b6fd6f6 has the code two of them change. */
export const MUTANTS_KS31 = [
  { name: "recognition: (0000h) unread", ...r(["RSLCAP: LD A,($0000)", "CP $C3", "JR NZ,RSLNO"], ["RSLCAP: LD A,($0000)", "CP $C3"]) },
  { name: "recognition: (0001h) unread", ...r(["SBC HL,DE", "JR NZ,RSLNO", "LD A,(PZBDOS)"], ["SBC HL,DE", "LD A,(PZBDOS)"]) },
  { name: "recognition: (0005h) unread", ...r(["LD A,(PZBDOS)", "CP $C3", "JR NZ,RSLNO"], ["LD A,(PZBDOS)", "CP $C3"]) },
  { name: "recognition: S low byte unread", ...r(["LD A,L", "CP 6", "JR NZ,RSLNO", "LD E,H"], ["LD A,L", "CP 6", "LD E,H"]) },
  { name: "recognition: the stub's JP unread", ...r(["LD A,(HL)", "CP $C3", "JR NZ,RSLNO", "INC HL"], ["LD A,(HL)", "CP $C3", "INC HL"]) },
  { name: "recognition: BENTRY's low byte unread", ...r(["CP LOW(BENTRY)", "JR NZ,RSLNO"], ["CP LOW(BENTRY)"]) },
  { name: "recognition: BENTRY's high byte unread", ...r(["CP HIGH(BENTRY)", "JR NZ,RSLNO"], ["CP HIGH(BENTRY)"]) },
  { name: "recognition: W low byte unread", ...r(["LD A,L", "CP 6", "JR NZ,RSLNO", "LD A,H"], ["LD A,L", "CP 6", "LD A,H"]) },
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
  { name: "reset state: workspace kept, console and drivers with it", ...r(["LD HL,WSBASE", "LD DE,WSBASE+1", "LD BC,WSSPAN", "LD (HL),0", "LDIR"], []) },
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
  { name: "startup: a program's exit ends the file", ...r(["LD HL,DRVBSY", "RES 7,(HL)"], ["LD HL,DRVBSY", "RES 7,(HL)", "LD HL,STPOS", "SET 7,(HL)"]) },
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
    edits: [asm(DATA, ["TYPEKEY:", 'DB "TYPE",0', "OLDVOL: DB $C9"], ["ABIXCCP: JP DRVSVC", "DB 0,0", "OLDVOL: DB $C9", "TYPEKEY:", 'DB "TYPE",0'])],
    tests: ["test/devices.test.mjs"],
  },
  { name: "commands: CCP still a built-in, not reaching the transient path", ...builtin("CCP") },
  { name: "commands: EXIT still a built-in, not reaching the transient path", ...builtin("EXIT") },
  // With no resident, UNLOAD returns with carry clear, as if it had removed one.
  { name: "commands: UNLOAD with no resident not refused", ...t30(["LD A,(DRVHEAD)", "CP H", "JR NZ,PRLRF", "LD L,DFLG"], ["LD A,(DRVHEAD)", "CP H", "JR Z,UNLHAS", "OR A", "RET", "UNLHAS: LD L,DFLG"], ["test/commands.test.mjs", "test/drv.test.mjs"], D) },
  { name: "commands: UNLOAD ignores the removable flag", ...t30(["LD L,DFLG", "BIT 0,(HL)", "JR Z,PRLRF"], ["LD L,DFLG"], ["test/commands.test.mjs", "test/drv.test.mjs"], D) },
  { name: "guard: load path ignores it", ...t30(["LD (DRVRC),A", "LD A,(DRVBSY)", "OR A", "JR NZ,PRLRF"], ["LD (DRVRC),A"], ["test/drv.test.mjs"], D) },
  { name: "guard: UNLOAD ignores it", ...t30(["DRVUNL: LD A,(DRVBSY)", "OR A", "JR NZ,PRLRF"], ["DRVUNL: XOR A"], ["test/drv.test.mjs"], D) },
  { name: "guard: never set", ...t30(["DRVCALL: LD A,$80", "LD (DRVBSY),A"], ["DRVCALL: LD A,$80"], ["test/drv.test.mjs"], D) },
  { name: "guard: not reset at warm boot", ...t30(["LD HL,DRVBSY", "RES 7,(HL)"], [], ["test/drv.test.mjs"], B) },
  { name: "guard: not reset after REMOVE or INIT", ...t30(["DRVSHUT: LD A,0", "LD (DRVBSY),A"], ["DRVSHUT: LD A,0"], ["test/drv.test.mjs"], D) },
  // Startup's position set finished as its first line is taken.
  { name: "startup: lines stop after the first", ...t30(["STL2: LD A,L", "SUB LOW(STREC)-1"], ["STL2: LD A,$80+LOW(STREC)-1", "SUB LOW(STREC)-1"], ["test/startup.test.mjs"], D) },
  // Warm boot empties the ring: HHEAD 0, and the entry before it, at HRING+FFh, 0.
  { name: "history: cleared at warm boot", ...t30(["LD HL,DRVBSY", "RES 7,(HL)"], ["LD HL,DRVBSY", "RES 7,(HL)", "XOR A", "LD (HHEAD),A", "LD HL,$BDFF", "CALL HPUT"], ["test/history.test.mjs"], B) },
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
  { name: "row 3: a load under PICO.DRV leaves GLCD?", ...t30(["JR NZ,WRDCLR"], ["RET NZ"], ["test/pico.test.mjs"], G) },
  { name: "row 3: STDONE not masked", ...t30(["AND $FF-CDWRD"], [], ["test/pico.test.mjs"], D) },
  { name: "row 3: the word cleared leaves carry set", ...t30(["POP BC", "OR A", "RET"], ["POP BC", "RET"], ["test/pico.test.mjs"], G) },
  { name: "row 3: INFO loses the bit", ...t30(["LD B,A", "LD DE,ROMVER"], ["AND $7F", "LD B,A", "LD DE,ROMVER"], ["test/pico.test.mjs"], H) },
];
