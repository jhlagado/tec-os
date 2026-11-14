// The shell: the ROM's shell hook, enter-on-install and MON3.SVC,
// SHELL.SVC's size, pieces, scripts, startup and re-entry, the stack census
// with the shell, the docs and the version fields. The minimal ROM CCP's own
// tests are in commands.test.mjs and startup.test.mjs; the tests moved with
// COPY, the history and chained lines are in copy.test.mjs,
// history.test.mjs and chain.test.mjs. Emulator evidence; each mutant is
// built and run here, one at a time.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, GLCD_SVC, ROOT, romFor, service, standardCard, startupFile, volume } from "./lib/fixtures.mjs";
import { execFile, mon3Svc, mon3Variant } from "./lib/mon3.mjs";
import { run as censusRun, watch } from "./lib/census.mjs";
import { GUARDS, HELLO, LINEP, SHELL, at, cardVariant, chain, code, count, execSvc, find, hellos, hookSvc, owners, pageOf, romMutant, shellCard, shellMachine, shellVariant, user, word } from "./lib/shell.mjs";
import { setDisplayLine } from "../host/card.mjs";
import { toLatin1 } from "../tools/lib/bytes.mjs";

import { pendingSayFiles, pendingSayFailure } from "./lib/pending-say.mjs";

const HOOK = await hookSvc();
const MON3 = await mon3Svc();
const S = /\r\nS>$/; // HOOK.SVC's prompt
const P = /\r\n\d*[A-P](:\S*)?>$/; // the CCP's or SHELL.SVC's
const M3 = /MON3>$/;
const sym = SHELL.symbols;

// After every test, the guard under the shell's own stack: each machine's
// deepest run between prompts leaves a quarter of the 48 bytes unused.
GUARDS.on = true;
afterEach(() => {
  const machines = GUARDS.machines.splice(0);
  for (const g of machines) assert.ok(g.read() <= 36, `the shell's own stack: ${g.deepest} of 48 between prompts`);
});
const hsym = HOOK.symbols;
const lowest = (m) => m.read(m.sym("SVCHEAD")) << 8;
const shown = (m) => word(m, m.sym("SHOWN"));
const stubPage = (m) => word(m, m.sym("STUBAD")) & 0xff00;

// TNSHELL from a program: LD HL,table; LD C,16; CALL ABICALL; PUSH AF; POP
// HL; LD (00F0h),HL; LD (00F2h),BC; LD (00F4h),IX; RET. 00F0h holds F, then
// A; 00F2h BC; 00F4h IX. IX is set first to 5678h and B to 12h, so BC is
// 1210h at the call.
const tnshell = (t) => Uint8Array.from([0x01, 0x34, 0x12, 0xdd, 0x21, 0x78, 0x56, 0x21, t & 0xff, t >> 8, 0x0e, ABI.TNSHELL, 0x06, 0x12, 0xcd, 0x08, 0xc0,
  0xf5, 0xe1, 0x22, 0xf0, 0x00, 0xed, 0x43, 0xf2, 0x00, 0xdd, 0x22, 0xf4, 0x00, 0xc9]);
// A program that sets HOOK.SVC's INJ, so the next LINE returns its INJTXT:
// filled in by the test after the hook is claimed.
const DIRP = Uint8Array.from([0x0e, 0x11, 0x11, 0x5c, 0x00, 0xcd, 0x05, 0x00, 0xc9]); // search first: a BDOS call
/** A bare card: no STARTUP.CMD, HOOK.SVC and FILES on A:. */
const bareCard = (files = {}) => shellCard({ "HOOK.SVC": HOOK.file, ...files }, { startup: [] });
const bare = (files = {}, opts = {}) => shellMachine(bareCard(files), opts);
/** A machine whose STARTUP.CMD is SHELL.SVC, then LINES. */
const shelled = (files = {}, lines = [], opts = {}) => shellMachine(shellCard(files, { startup: ["SHELL.SVC", ...lines] }), opts);
/** HOOK.SVC's state word or byte. */
const hw = (m, n) => word(m, lowest(m) + hsym[n]);
const hb = (m, n) => m.read(lowest(m) + hsym[n]);
/** Make HOOK.SVC's next LINE return TEXT (128 bytes, as given) with origin A. */
function inject(m, text, origin = 0) {
  const p = lowest(m);
  const bytes = Buffer.alloc(128);
  Buffer.from(text, "latin1").copy(bytes);
  for (let i = 0; i < 128; i += 1) m.write(p + hsym.INJTXT + i, bytes[i]);
  m.write(p + hsym.INJORG, origin);
  m.write(p + hsym.INJ, 1);
}

// --- Every landing keeps the version fields --------------------------------

test("SH16 version fields", () => {
  const inc = readFileSync(resolve(ROOT, "src/abi.inc"), "utf8");
  assert.match(inc, /^SVCFMT EQU 4$/m);
  assert.equal(ABI.TNSHELL, 16);
  assert.equal(ABI.TNCOUNT, 17);
  const { rom } = romFor();
  assert.deepEqual([...rom.subarray(3, 8)], [0x54, 0x4e, 0x41, 5, 1], "TNA 5.1: ABIMIN unchanged");
  for (const f of [SHELL.file, MON3.file, HOOK.file]) assert.deepEqual([...f.subarray(25, 28)], [0x45, 0x58, 1], "the record's version byte stays 1");
  assert.match(readFileSync(resolve(ROOT, "tools/build.mjs"), "utf8"), /^const VERSION = \{ major: 0, minor: 1 \};$/m);
});

// --- The shell hook's contract ---------------------------------------------

const TRIES = { T0200: 0x0200, TE000: 0xe000 };
// TNSHELL with T, then again with the table it returned, so the hook is put
// back before the program's warm boot: 00F0h holds the first call's F and A,
// 00F8h the table the second replaced, T when the first was taken.
const tnshellBack = (t) => Uint8Array.from([0x21, t & 0xff, t >> 8, 0x0e, ABI.TNSHELL, 0xcd, 0x08, 0xc0, 0xf5, 0x22, 0xf6, 0x00,
  0x0e, ABI.TNSHELL, 0xcd, 0x08, 0xc0, 0x22, 0xf8, 0x00, 0xe1, 0x22, 0xf0, 0x00, 0xc9]);
const tnshellMachine = () => bare({ "T0.COM": tnshell(0) });

test("SH5 tnshell", () => {
  const m = tnshellMachine();
  assert.equal(shown(m), 0, "cold boot: no hook");
  at(m, "HOOK.SVC", { re: S });
  const page = lowest(m);
  assert.equal(shown(m), page + hsym.TABLE, "HOOK's entry claimed the hook");
  assert.equal(hw(m, "PREV"), 0, "and the table it replaced is none");
  // TNSHELL 0 from a program gives the prompt back: A = 0, carry clear, BC
  // and IX kept.
  m.write(0xf0, 0xff);
  at(m, "T0");
  assert.deepEqual({ a: m.read(0xf1), carry: m.read(0xf0) & 1, bc: word(m, 0xf2), ix: word(m, 0xf4) }, { a: 0, carry: 0, bc: 0x1210, ix: 0x5678 });
  assert.equal(shown(m), 0, "HL = 0: the bare prompt");
  // HOOK claims again: TNSHELL returns the table it replaced, 0.
  at(m, "HOOK.SVC", { re: S });
  assert.equal(hw(m, "PREV"), 0);
});

test("SH5 tnshell refuses", () => {
  const image = bareCard();
  const a = volume(image, "A");
  // The tables are known only once HOOK is in: its page is fixed by the card.
  const probe = bare();
  at(probe, "HOOK.SVC", { re: S });
  const page = lowest(probe);
  const stub = stubPage(probe);
  const tries = { ...TRIES, TSTUB: stub + 0x10, TF9: page + 0xf9, TF8: page + 0xf8 };
  for (const [n, t] of Object.entries(tries)) a.write(`${n}.COM`, tnshellBack(t));
  const m = shellMachine(image);
  at(m, "HOOK.SVC", { re: S });
  assert.equal(lowest(m), page);
  const before = shown(m);
  const res = {};
  for (const n of Object.keys(tries)) {
    at(m, n, { re: S });
    res[n] = { a: m.read(0xf1), carry: m.read(0xf0) & 1, shown: shown(m), held: word(m, 0xf8) };
  }
  for (const n of ["T0200", "TE000", "TSTUB", "TF9"]) assert.deepEqual({ a: res[n].a, carry: res[n].carry, shown: res[n].shown }, { a: ABI.TNEBAD, carry: 1, shown: before }, `${n}: refused with carry, the hook unchanged`);
  assert.deepEqual({ a: res.TF8.a, carry: res.TF8.carry, held: res.TF8.held, shown: res.TF8.shown }, { a: 0, carry: 0, held: page + 0xf8, shown: before }, "a table at xxF8h in a resident's page is taken");
});

test("SH5 line at each prompt", () => {
  const m = bare({ "B.TXT": HELLO, "LINE.COM": LINEP });
  at(m, "HOOK.SVC", { re: S });
  const calls = () => hw(m, "LINES");
  let n = calls();
  for (const line of ["USER 0", "B:", "A:", "", "DIR B.TXT", "SAY"]) {
    at(m, line, { re: S });
    assert.equal(calls(), n + 1, `one LINE call after ${JSON.stringify(line)}`);
    n = calls();
  }
  // A warm boot from a program: one LINE call too.
  m.mark = m.output.length;
  m.type("LINE\r");
  m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 200_000_000, "LINE's input");
  m.type("\x03");
  m.runUntil(() => m.ready() && S.test(m.text(m.mark)), 200_000_000, "the prompt after ^C");
  assert.equal(calls(), n + 1);
});

test("SH5 line flags after a BDOS error", () => {
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOK.file }, { startup: [], image: standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]) }));
  at(m, "HOOK.SVC", { re: S });
  m.mark = m.output.length;
  m.type("SAVE 1 C:X.COM\r");
  m.runUntil(() => m.waitingForInput() && /Bdos Err On C: R\/O/.test(m.text(m.mark)), 200_000_000, "the error");
  m.type("\r");
  m.runUntil(() => m.ready() && S.test(m.text(m.mark)), 200_000_000, "the prompt after the error");
  assert.equal(hb(m, "FLAGS"), 2, "after a BDOS error's exit: bit 1");
  at(m, "", { re: S });
  assert.equal(hb(m, "FLAGS"), 0, "and 0 at the next");
});

test("SH5 line flags after a retained write fails at warm boot", () => {
  const m = bare(pendingSayFiles());
  at(m, "HOOK.SVC", { re: S });
  const fault = pendingSayFailure(m, m.sdImage);
  const out = at(m, "SAY", { re: S });
  assert.equal((out.match(/Write pending/g) ?? []).length, 1);
  assert.doesNotMatch(out, /Write lost|NO ACK/);
  assert.equal(hb(m, "FLAGS"), 2, "a failed warm flush drops continuation: bit 1");
  fault.assertPending();
  const next = at(m, "", { re: S });
  assert.equal(hb(m, "FLAGS"), 0, "the next ordinary line clears the flag");
  assert.doesNotMatch(next, /Write pending/); fault.assertPending();
  fault.release(); at(m, "", { re: S }); fault.assertRecovered();
  assert.equal(hb(m, "FLAGS"), 0);
});

test("SH5 line flags", () => {
  const m = bare({ "LINE.COM": LINEP, "CH.COM": chain("SAY") });
  at(m, "HOOK.SVC", { re: S });
  assert.equal(hb(m, "FLAGS"), 0, "after a typed line");
  at(m, "CH", { re: S });
  assert.equal(hb(m, "FLAGS"), 1, "after function 47: bit 0");
  assert.equal(toLatin1(Uint8Array.from(Array.from({ length: 3 }, (_, i) => m.read(m.sym("CMDTXT") + i)))), "SAY", "the line at DE");
  m.mark = m.output.length;
  m.type("LINE\r");
  m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 200_000_000, "LINE's input");
  m.type("\x03");
  m.runUntil(() => m.ready() && S.test(m.text(m.mark)), 200_000_000, "the prompt after ^C");
  assert.equal(hb(m, "FLAGS"), 2, "after ^C at a program's line input: bit 1");
  assert.equal(m.read(m.sym("CHPOS")), 0, "the flags cleared after LINE's call");
  at(m, "", { re: S });
  assert.equal(hb(m, "FLAGS"), 0, "and 0 at the next");
  const owns = hw(m, "OWNS");
  assert.deepEqual({ b: owns >> 8, c: owns & 0xff }, { b: m.read(m.sym("SVCHEAD")), c: stubPage(m) >> 8 }, "B the lowest owner's page, C the stub's");
  assert.equal(hw(m, "BUFP"), m.sym("CMDTXT"), "DE the CCP's line buffer");
  assert.equal(hw(m, "SEENSP"), m.sym("CSTKTOP") - 4, "SP two words below the CCP's stack top");
});

test("SH5 line origin", () => {
  const m = bare({ "OTHER.SVC": GLCD_SVC }, { matrix: true, glcd: false });
  at(m, "HOOK.SVC", { re: S });
  // GLCD.SVC on a board with no GLCD: typed, refused; with the startup
  // line's origin, quiet.
  inject(m, "OTHER.SVC", 0);
  const typed = at(m, "", { re: S });
  assert.match(typed, /OTHER\.SVC\?/, "typed origin: the absent device refused");
  inject(m, "OTHER.SVC", 0xff);
  const quiet = at(m, "", { re: S });
  assert.doesNotMatch(quiet, /OTHER\.SVC\?/, "A = FFh: the startup line's quiet path");
  assert.equal(code(m), 0);
});

test("SH5 zero bound", () => {
  const m = bare();
  at(m, "HOOK.SVC", { re: S });
  inject(m, `SAY ${"X".repeat(124)}`);
  const out = at(m, "", { re: S });
  assert.match(out, /SAY/);
  assert.equal(m.read(m.sym("CMDTXT") + 127), 0, "the byte at the buffer's end is zero after the return");
});

test("SH5 history only after line", () => {
  const m = bare({ "LINE.COM": LINEP });
  at(m, "HOOK.SVC", { re: S });
  const recs = hw(m, "RECS");
  const stos = hw(m, "STOS");
  m.mark = m.output.length;
  m.type("\x17\r");
  m.runUntil(() => m.ready() && S.test(m.text(m.mark)), 200_000_000, "the prompt after ^W");
  assert.equal(hw(m, "RECS"), recs + 1, "the first BDOS 10 after LINE offers ^W through HREC");
  at(m, "SAY", { re: S });
  assert.ok(hw(m, "STOS") > stos, "and stores through HSTORE");
  // A program's line input after an injected line: no BDOS 10 since LINE.
  inject(m, "LINE");
  const r2 = hw(m, "RECS");
  const s2 = hw(m, "STOS");
  m.mark = m.output.length;
  m.type("\r");
  m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 200_000_000, "LINE's input");
  m.type("A\x17\r");
  m.runUntil(() => m.ready() && S.test(m.text(m.mark)), 200_000_000, "the prompt after LINE");
  assert.deepEqual({ recs: hw(m, "RECS"), stos: hw(m, "STOS") }, { recs: r2, stos: s2 }, "a program's BDOS 10 neither recalls nor stores");
});

test("SH5 page", () => {
  const long = Buffer.from(`${"abcdefghij".repeat(10)}\r\n\x1a`, "latin1");
  const m = bare({ "L.TXT": long, "B.TXT": HELLO });
  at(m, "HOOK.SVC", { re: S });
  let p = hw(m, "PAGES");
  at(m, "TYPE L.TXT", { re: S });
  assert.equal(hw(m, "PAGES") - p, 102, "TYPE sends every byte through PAGE");
  p = hw(m, "PAGES");
  at(m, "DIR", { re: S });
  const rows = hw(m, "PAGES") - p;
  assert.ok(rows >= 2 && rows % 2 === 0, `DIR sends its row breaks, CR and LF: ${rows}`);
  m.write(lowest(m) + hsym.STOP, 1);
  p = hw(m, "PAGES");
  const out = at(m, "TYPE L.TXT", { re: S });
  assert.equal(hw(m, "PAGES") - p, 1, "carry stops the listing");
  assert.doesNotMatch(out, /bcd/);
});

test("SH5 no hook", () => {
  const long = Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i}\r\n`).join("") + "\x1a", "latin1");
  const m = bare({ "L.TXT": long });
  const out = at(m, "TYPE L.TXT");
  assert.equal(count(out, /line \d+/g), 30, "TYPE prints with no pause");
  assert.doesNotMatch(out, /\[more\]/);
  assert.match(at(m, "DIR"), /L\.TXT/);
});

test("SH5 drop flag cleared", () => {
  const m = bare({ "LINE.COM": LINEP });
  m.mark = m.output.length;
  m.type("LINE\r");
  m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 200_000_000, "LINE's input");
  m.type("\x03");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 200_000_000, "the prompt after ^C");
  assert.equal(m.read(m.sym("CHPOS")), 0, "the bare prompt clears the drop flag");
  at(m, "HOOK.SVC", { re: S });
  assert.equal(hb(m, "FLAGS"), 0, "a shell installed later sees no stale drop");
});

/** HOOK.SVC in, its REMOVE's ABICALL taken out, then UNLOAD: the sweep's test. */
function leaveHook(m) {
  at(m, "HOOK.SVC", { re: S });
  const page = lowest(m);
  const i = find(Array.from({ length: 256 }, (_, k) => m.read(page + k)), 0, [0xcd, 0x08, 0xc0], 256);
  for (let k = 0; k < 3; k += 1) m.write(page + i + k, 0);
  return at(m, "UNLOAD");
}

test("SH5 release sweep", () => {
  const m = bare();
  const out = leaveHook(m);
  assert.match(out, P, "a REMOVE that leaves the hook: the bare prompt");
  assert.equal(shown(m), 0, "swept at the release of pages");
  // At warm boot too: a table set below PZTOP's page by hand is dropped.
  m.write(m.sym("SHOWN"), 0x10);
  m.write(m.sym("SHOWN") + 1, 0x80);
  at(m, "SAY");
  assert.equal(shown(m), 0, "swept at warm boot");
});

test("SH5 cold boot clears", () => {
  const m = bare();
  at(m, "HOOK.SVC", { re: S });
  assert.ok(shown(m));
  m.reset();
  m.runUntil(() => m.ready(), 900_000_000, "the prompt after a reset");
  assert.equal(shown(m), 0);
  assert.equal(m.read(m.sym("SVCHEAD")), 0);
});

test("SH5 mutant: without the sweep in PZSWP, a REMOVE that leaves the hook runs freed pages", () => {
  const mut = romMutant((b, s) => {
    const i = find(b, s("PZSWP"), [0x30, null], 12); // JR NC,PZSW1
    b[i] = 0x18;
  });
  const m = shellMachine(bareCard(), mut);
  assert.throws(() => leaveHook(m));
});

test("SH5 mutant: SVSHL without its check takes a table at E000h", () => {
  const mut = romMutant((b, s) => {
    const i = find(b, s("SVSHL"), [0x28, null], 4); // JR Z,SVSH1
    b[i] = 0x18;
  });
  const m = shellMachine(bareCard({ "TE000.COM": tnshell(0xe000) }), mut);
  m.mark = m.output.length;
  m.type("TE000\r");
  const until = m.cycles + 300_000_000;
  m.runUntil(() => shown(m) === 0xe000 || m.cycles > until, 400_000_000, "TE000");
  assert.equal(shown(m), 0xe000, "the mutant takes E000h");
});

test("SH5 mutant: SHLINE not clearing the history gate offers ^W to a program", () => {
  const mut = romMutant((b, s) => {
    const i = find(b, s("SHLINE") + 20, [0x36, 0x00, 0xc9], 40); // LD (HL),0; RET
    b[i] = b[i + 1] = 0;
  });
  const m = shellMachine(bareCard({ "LINE.COM": LINEP }), mut);
  at(m, "HOOK.SVC", { re: S });
  inject(m, "LINE");
  const r = hw(m, "RECS");
  m.mark = m.output.length;
  m.type("\r");
  m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 200_000_000, "LINE's input");
  m.type("A\x17\r");
  m.runUntil(() => m.ready() && S.test(m.text(m.mark)), 200_000_000, "the prompt after LINE");
  assert.notEqual(hw(m, "RECS"), r, "the program's BDOS 10 reached HREC");
});

test("SH5 mutant: SHLINE without the zero bound leaves the line unended", () => {
  const mut = romMutant((b, s) => {
    const end = s("CMDTXT") + 0xc000 + 127; // LD HL,CMDTXT+127; LD (HL),0: the bound
    const i = find(b, s("SHLINE"), [0x21, end & 0xff, end >> 8, 0x36, 0x00], 48);
    b[i + 3] = b[i + 4] = 0;
  });
  const m = shellMachine(bareCard(), mut);
  at(m, "HOOK.SVC", { re: S });
  inject(m, `SAY ${"X".repeat(124)}`);
  at(m, "", { re: S });
  assert.notEqual(m.read(m.sym("CMDTXT") + 127), 0);
});

// --- The record's bit 1 and the name typed ---------------------------------

/** Count BDOS 15 calls on M from now. */
function opens(m) {
  let n = 0;
  const bdos = m.sym("BDOS") ?? 5;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 5 && m.cpu.cpu.c === 15) n += 1;
    return step();
  };
  return () => n;
}

test("SH6 install and enter", async () => {
  const x = await execSvc();
  const m = shellMachine(shellCard({ "X.SVC": x.file }, { startup: ["X.SVC FROMSTART"] }));
  assert.match(m.text(0), /EXEC X/, "entered from the startup line");
  assert.equal(m.read(lowest(m) + x.symbols.ENTA), 0xff, "A = FFh at entry from the startup line");
  const m2 = shellMachine(shellCard({ "X.SVC": x.file }, { startup: [] }));
  const out = at(m2, "X.SVC TYPED");
  assert.match(out, /EXEC X/, "typed: entered");
  assert.equal(m2.read(lowest(m2) + x.symbols.ENTA), 0, "A = 0 typed");
  assert.equal(toLatin1(Uint8Array.from(Array.from({ length: m2.read(0x80) }, (_, i) => m2.read(0x81 + i)))), " TYPED", "the tail as a .COM's");
});

test("SH6 enter again, no file", async () => {
  const x = await execFile();
  const m = shellMachine(shellCard({ "X.SVC": x }, { startup: [] }));
  at(m, "X.SVC");
  const head = m.read(m.sym("SVCHEAD"));
  const n = opens(m);
  assert.match(at(m, "X.SVC"), /EXEC X/);
  assert.equal(n(), 0, "no file opened");
  assert.equal(m.read(m.sym("SVCHEAD")), head, "one copy");
});

test("SH6 bit 1 clear installs only", async () => {
  const lib = await execFile({ ENTER: 0 });
  const m = shellMachine(shellCard({ "X.SVC": lib }, { startup: [] }));
  assert.doesNotMatch(at(m, "X.SVC"), /EXEC/);
  assert.doesNotMatch(at(m, "X.SVC"), /EXEC/);
  assert.equal(owners(m).length, 2, "each typing installs another copy");
  const res = shellMachine(shellCard({ "RES.SVC": await service("res") }, { startup: [] }));
  at(res, "RES.SVC");
  at(res, "RES.SVC");
  assert.equal(owners(res).length, 2, "a service with no record installs only, each time");
});

test("SH6 never ready removed", async () => {
  const x = await execFile({ V_NRDY: 1 });
  const m = shellMachine(shellCard({ "X.SVC": x }, { startup: [] }));
  const top = word(m, 6);
  assert.match(at(m, "X.SVC"), /X\.SVC\?/);
  assert.equal(code(m), 0xff00);
  assert.deepEqual(owners(m), []);
  assert.equal(word(m, 6), top);
});

test("SH6 never ready removed, from the startup line", async () => {
  const x = await execFile({ V_NRDY: 1 });
  const top = word(shellMachine(shellCard({ "X.SVC": x }, { startup: [] })), 6);
  const m = shellMachine(shellCard({ "X.SVC": x }, { startup: ["X.SVC"] }));
  assert.match(m.text(0), /A(:\S*)?>X\.SVC\r[\s\S]*X\.SVC\?/, "the ROM's one line refused");
  assert.equal(code(m), 0xff00);
  assert.deepEqual(owners(m), []);
  assert.equal(word(m, 6), top, "(0006h) as before");
  // A later line of the file, run by the shell.
  const shelledTop = word(shellMachine(shellCard({ "X.SVC": x })), 6);
  const s = shellMachine(shellCard({ "X.SVC": x }, { startup: ["SHELL.SVC", "X.SVC"] }));
  assert.match(s.text(0), /A(:\S*)?>X\.SVC\r[\s\S]*X\.SVC\?/, "the shell's later line refused");
  assert.equal(code(s), 0xff00);
  assert.deepEqual(owners(s).map((o) => o.name), ["SHELL"]);
  assert.equal(word(s, 6), shelledTop, "(0006h) as with the shell alone");
});

test("SH6 two refused", async () => {
  const x = await execFile();
  const m = shellMachine(shellCard({ "X.SVC": x }, { startup: [] }));
  at(m, "X.SVC");
  // A second ready copy, made by hand: the first's pages copied below it.
  const lib = await execFile({ ENTER: 0 });
  const m2 = shellMachine(shellCard({ "X.SVC": x, "Y.SVC": lib }, { startup: [] }));
  at(m2, "X.SVC");
  at(m2, "Y.SVC");
  const y = lowest(m2);
  // Make Y's record X's: name and state.
  const xp = owners(m2)[1].page << 8;
  for (let i = 0; i < 16; i += 1) m2.write(y + 25 + i, m2.read(xp + 25 + i));
  const out = at(m2, "X.SVC");
  assert.match(out, /X\.SVC\?/);
  assert.doesNotMatch(out, /EXEC/);
  assert.equal(code(m2), 0xff00);
});

test("SH6 old /E line", async () => {
  const x = await execFile();
  const m = shellMachine(shellCard({ "X.SVC": x }, { startup: [] }));
  assert.match(at(m, "X.SVC /E"), /EXEC X/);
  assert.equal(String.fromCharCode(m.read(0x82), m.read(0x83)), "/E", "the /E reaches the entry as its tail");
});

test("SH6 entry bound", async () => {
  const x = await execFile();
  const bad = Uint8Array.from(x);
  bad[25 + 4] = 0xff; // the entry far past the image
  bad[25 + 5] = 0x0f;
  const m = shellMachine(shellCard({ "X.SVC": bad }, { startup: [] }));
  assert.match(at(m, "X.SVC"), /X\.SVC\?/);
  assert.equal(m.read(m.sym("SVCRC")), 0, "refused by the loader");
  assert.deepEqual(owners(m), []);
});

test("SH6 mutant: EXREC testing bit 0 only enters a library with a record", async () => {
  const mut = romMutant((b, s) => {
    const i = find(b, s("EXREC"), [0x2f, 0xe6, 0x03], 12); // CPL; AND 3
    b[i + 2] = 1;
  });
  const lib = await execFile({ ENTER: 0 });
  const m = shellMachine(shellCard({ "X.SVC": lib }, { startup: [] }), mut);
  at(m, "X.SVC");
  assert.match(at(m, "X.SVC"), /EXEC X/, "the mutant enters the installed library");
});

test("SH6 mutant: without SVCRUN's first EXFIND the file is read again", async () => {
  const mut = romMutant((b, s) => {
    const i = s("SVCRUN"); // CALL EXFIND; DEC A; JR Z,SVCENT; INC A; JR NZ,SVBAD
    for (let k = 0; k < 9; k += 1) b[i + k] = 0;
  });
  const x = await execFile();
  const m = shellMachine(shellCard({ "X.SVC": x }, { startup: [] }), mut);
  at(m, "X.SVC");
  const n = opens(m);
  at(m, "X.SVC");
  assert.ok(n() > 0, "the mutant opens the file again, where one copy is in");
});

// --- MON3.SVC and the card -------------------------------------------------

test("SH14 mon3 record", () => {
  const f = MON3.file;
  assert.deepEqual([...f.subarray(25, 29)], [0x45, 0x58, 1, 2], "version 1, bit 1 set in the file");
  const extra = f[8] | (f[9] << 8);
  assert.ok(Math.ceil((MON3.image + extra) / 256) <= 18, "within 18 pages");
});

test("SH14 mon3 enter and again", () => {
  const m = shellMachine(shellCard({ "MON3.SVC": MON3.file }, { startup: [] }));
  const page = () => lowest(m);
  assert.match(at(m, "MON3.SVC", { re: M3 }), /MON3>$/);
  const p = page();
  assert.equal(m.read(p + 25 + 3), 3, "INIT set bit 0 alone: ready and bit 1");
  at(m, "EXIT");
  const n = opens(m);
  assert.match(at(m, "MON3.SVC", { re: M3 }), /MON3>$/, "typed again: entered");
  assert.equal(n(), 0, "without a file read");
  assert.equal(owners(m).length, 1);
  at(m, "EXIT");
  at(m, "UNLOAD");
  assert.deepEqual(owners(m), []);
});

test("SH14 card startup", async () => {
  const { displayFiles, STARTUP_LINES } = await import("../tools/lib/starter.mjs");
  const files = await displayFiles(ROOT);
  assert.deepEqual(files.map((f) => f.name), ["SHELL.SVC", "GLCD.SVC", "STARTUP.CMD"]);
  assert.deepEqual([...files[0].bytes], [...SHELL.file], "the card's SHELL.SVC is the build's");
  assert.equal(toLatin1(files[2].bytes), "SHELL.SVC\r\nGLCD.SVC\r\n\x1a");
  assert.deepEqual(STARTUP_LINES, ["SHELL.SVC", "GLCD.SVC"]);
  const recipe = JSON.parse(readFileSync(resolve(ROOT, "dist/starter.recipe.json"), "utf8"));
  assert.ok(recipe.components.some((c) => c.name === "SHELL.SVC"), "on the starter card");
});

const startupOf = (image) => toLatin1(volume(image, "A").read("STARTUP.CMD")).split("\x1a")[0];

test("SH14 display line after the shell", () => {
  for (const [display, line] of [["glcd", "GLCD.SVC"], ["tms", "CON PICO 40"]]) {
    const image = shellCard({}, { startup: ["SHELL.SVC", "GLCD.SVC", "TYPE HELLO.TXT"] });
    a: {
      setDisplayLine(image, display, 40);
      assert.equal(startupOf(image), `SHELL.SVC\r\n${line}\r\nTYPE HELLO.TXT\r\n`, `${display}: the shell first, the display line second`);
    }
  }
  const old = shellCard({}, { startup: ["GLCD.SVC"], shell: null });
  setDisplayLine(old, "tms", 80);
  assert.equal(startupOf(old), "CON PICO 80\r\n", "a card with no SHELL.SVC: the display line first");
});

test("SH14 card pieces", () => {
  const cases = [
    [["GLCD.SVC &TYPE X!DIR"], "TYPE X!DIR"],
    [["SAY!GLCD.SVC &TYPE X"], "SAY &TYPE X"],
    [["SAY!CON PICO 40!:TYPE X"], "SAY &TYPE X"],
    [["SAY!GLCD.SVC!:TYPE X"], "SAY &TYPE X"],
    [["SAY &:TYPE X"], "SAY &TYPE X"],
    [["X /M:&HE000"], "X /M:&HE000"],
  ];
  for (const [lines, rest] of cases) {
    const image = shellCard({}, { startup: ["SHELL.SVC", ...lines] });
    setDisplayLine(image, "glcd");
    assert.equal(startupOf(image), `SHELL.SVC\r\nGLCD.SVC\r\n${rest}\r\n`, JSON.stringify(lines));
    assert.doesNotMatch(startupOf(image), /(^|[!& ]):/m, "no : is written");
  }
});

test("SH14 card boards", async () => {
  const { displayFiles } = await import("../tools/lib/starter.mjs");
  const files = await displayFiles(ROOT);
  const card = () => {
    const image = shellCard({}, { startup: [] });
    for (const f of files) volume(image, "A").write(f.name, f.bytes);
    return image;
  };
  const glcd = shellMachine(card(), { matrix: true, glcd: true, noWait: true });
  glcd.runUntil(() => glcd.ready() && glcd.read(glcd.sym("CONMOD")) === 3 && owners(glcd).length === 2, 900_000_000, "the GLCD board's prompt");
  assert.deepEqual(owners(glcd).map((o) => o.name), ["GLCD", "SHELL"], "a GLCD board: the shell in, the GLCD the console");
  const pico = card();
  setDisplayLine(pico, "tms", 40);
  const p = shellMachine(pico, { matrix: true, tms: true, noWait: true });
  p.runUntil(() => p.ready() && owners(p).length === 1, 900_000_000, "the PICO board's prompt");
  assert.equal(p.read(p.sym("VWID")), 40, "a PICO9918 board at the width chosen");
  assert.deepEqual(owners(p).map((o) => o.name), ["SHELL"]);
  const serial = shellMachine(card(), { glcd: false, noWait: true });
  serial.runUntil(() => serial.ready(), 900_000_000, "the serial board's prompt");
  assert.deepEqual(owners(serial).map((o) => o.name), ["SHELL"], "a serial board: the shell in");
});

test("SH14 mutant: MON3.SVC with today's INIT loses bit 1, so a second copy installs", async () => {
  const mut = await mon3Variant([["  set 0,(hl)     ; ready, bit 1 kept", "  ld (hl),1      ; ready"]]);
  const m = shellMachine(shellCard({ "MON3.SVC": mut.file }, { startup: [] }));
  assert.doesNotMatch(at(m, "MON3.SVC"), /MON3>/, "installed, not entered");
  at(m, "MON3.SVC");
  assert.equal(owners(m).length, 2);
});

test("SH14 mutant: setDisplayLine writing its display line first, the shell never loads", async () => {
  const mut = await cardVariant([["const first = shell ? [\"SHELL.SVC\", display1] : [display1];", "const first = shell ? [display1, \"SHELL.SVC\"] : [display1];"]]);
  for (const [display, opts] of [["glcd", { matrix: true, glcd: true }], ["tms", { matrix: true, tms: true }]]) {
    const image = shellCard({ "GLCD.SVC": GLCD_SVC }, { startup: ["SHELL.SVC"] });
    mut.setDisplayLine(image, display, 40);
    const m = shellMachine(image, { ...opts, noWait: true });
    m.runUntil(() => m.ready(), 900_000_000, "the prompt");
    assert.equal(pageOf(m), 0, `${display}: no shell`);
  }
});

test("SH14 mutant: withoutDisplay keeping its : makes a kept piece a bad name", async () => {
  const mut = await cardVariant([["const body = text.replace(/^(\\s*):/, \"$1\");", "const body = text;"]]);
  const image = shellCard({ "GLCD.SVC": GLCD_SVC }, { startup: ["SHELL.SVC", "GLCD.SVC!:SAY &:SAY"] });
  mut.setDisplayLine(image, "glcd");
  const m = shellMachine(image, { matrix: true, glcd: true, noWait: true });
  m.runUntil(() => m.ready() && m.read(m.sym("CONMOD")) === 3, 900_000_000, "the prompt");
  assert.match(m.text(0), /:SAY\?/);
});

// --- Size, stacks and the TPA ----------------------------------------------

const pages = (svc) => Math.ceil((svc.image + (svc.file[8] | (svc.file[9] << 8))) / 256);

test("SH7 size", () => {
  assert.ok(pages(SHELL) <= 15, `SHELL.SVC in 15 pages: ${SHELL.image} + extra`);
  assert.ok(SHELL.image + (SHELL.file[8] | (SHELL.file[9] << 8)) <= 3840);
  assert.equal(sym.RING % 256, 0, "the ring's page aligned");
});

/** The deepest each of the three stacks goes below a service entry's SP, as svc.test.mjs's watch measures. */
function entries(m, lo, hi) {
  const s = (n) => m.sym(n);
  const stacks = { bdos: [s("STKBASE"), s("STKTOP")], ccp: [s("CSTKBAS"), s("CSTKTOP")], bios: [s("BSTKB"), s("BSTK")] };
  const use = { bdos: 0, ccp: 0, bios: 0, other: 0 };
  let open = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    const sp = m.cpu.cpu.sp & 0xffff;
    const inside = pc >= lo && pc < hi;
    if (!open && inside) {
      const k = Object.keys(stacks).find((n) => sp >= stacks[n][0] && sp <= stacks[n][1]) ?? "other";
      open = { k, sp, low: sp, range: stacks[k] };
    } else if (open) {
      if ((inside || sp <= open.sp) && (!open.range || (sp >= open.range[0] && sp <= open.range[1]))) open.low = Math.min(open.low, sp);
      if (!inside && sp > open.sp) {
        use[open.k] = Math.max(use[open.k], open.sp - open.low);
        open = null;
      }
    }
    return step();
  };
  return use;
}

/** The shell's workload: pieces, a script, a listing with [more], history, COPY, SERVICES. */
function workload(m) {
  for (const l of ["DIR", "TYPE HELLO.TXT", "F &DIR", "F!DIR", "COPY HELLO.TXT C.TXT", "SERVICES", "S.CMD", "NOSUCH", "CH"]) at(m, l);
  m.mark = m.output.length;
  m.type("\x17\x17\x0e\r");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 400_000_000, "a recalled line");
  m.mark = m.output.length;
  m.type("TYPE L.TXT\r");
  m.runUntil(() => /\[more\]$/.test(m.text(m.mark)), 400_000_000, "[more]");
  m.type(" ");
  m.runUntil(() => /\[more\]$/.test(m.text(m.mark).slice(-6)) || (m.ready() && P.test(m.text(m.mark))), 400_000_000, "[more] again");
  if (!m.ready()) m.type("\x03");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 400_000_000, "the prompt after [more]");
}

const LONG = Buffer.from(`${"W".repeat(100)}\r\n${Array.from({ length: 40 }, (_, i) => `line ${i}\r\n`).join("")}\x1a`, "latin1");
const WORK = { "S.CMD": Buffer.from("TYPE HELLO.TXT\r\n; c\r\nDIR\r\n\x1a", "latin1"), "L.TXT": LONG, "CH.COM": chain("F &SAY!SAY") };

test("SH7 declared stacks", () => {
  assert.deepEqual([...SHELL.file.subarray(12, 15)], [6, 0, 0], "declared: BDOS 6, BIOS 0, CCP 0");
  const m = shelled(WORK);
  const page = pageOf(m);
  const use = entries(m, page, page + pages(SHELL) * 256);
  workload(m);
  assert.ok(use.bdos <= 6, `the BDOS's: ${use.bdos}`);
  assert.equal(use.bios, 0);
  assert.equal(use.ccp, 0, "LINE and PAGE take the shell's own stack at once");
  // The allowance is a sum: SHELL.SVC's and GLCD.SVC's together within SVCLIM.
  const glcd = [...GLCD_SVC.subarray(12, 15)];
  assert.deepEqual(glcd, [2, 0, 6]);
  const { rom, symbols } = romFor();
  const lim = [0, 1, 2].map((i) => rom[symbols.get("SVCLIM") - 0xc000 + i]);
  assert.deepEqual(lim, [8, 12, 6]);
  for (let i = 0; i < 3; i += 1) assert.ok(SHELL.file[12 + i] + glcd[i] <= lim[i]);
});

/** A GLCD board with the matrix keyboard, whose STARTUP.CMD is LINES. */
const glcdBoard = (lines) => shellMachine(shellCard({ "GLCD.SVC": GLCD_SVC, "MON3.SVC": MON3.file }, { startup: lines }), { matrix: true, glcd: true, noWait: true });
const names = (m) => owners(m).map((o) => o.name).reverse().join(",");

test("SH7 with glcd and mon3", () => {
  {
    const m = glcdBoard(["SHELL.SVC", "GLCD.SVC", "MON3.SVC"]);
    m.runUntil(() => M3.test(m.text(0)) && m.waitingForInput(), 900_000_000, "MON3>");
    assert.equal(names(m), "SHELL,GLCD,MON3");
    assert.equal(m.read(m.sym("CONMOD")), 3, "the GLCD the console");
    assert.equal(word(m, 6), 0x9500);
  }
  {
    const m = glcdBoard(["SHELL.SVC", "MON3.SVC", "GLCD.SVC"]);
    m.runUntil(() => M3.test(m.text(0)) && m.waitingForInput(), 900_000_000, "MON3>");
    m.mark = m.output.length;
    m.type("EXIT\r");
    m.runUntil(() => m.ready() && m.read(m.sym("CONMOD")) === 3, 900_000_000, "GLCD.SVC after EXIT");
    assert.equal(names(m), "SHELL,MON3,GLCD");
    assert.equal(word(m, 6), 0x9500);
  }
  {
    const m = glcdBoard(["GLCD.SVC"]);
    m.runUntil(() => m.ready() && m.read(m.sym("CONMOD")) === 3, 900_000_000, "the GLCD's prompt");
    at(m, "SHELL.SVC");
    m.mark = m.output.length;
    m.type("MON3.SVC\r");
    m.runUntil(() => M3.test(m.text(m.mark)) && m.waitingForInput(), 900_000_000, "MON3>");
    assert.equal(names(m), "GLCD,SHELL,MON3");
    assert.equal(m.read(m.sym("CONMOD")), 3);
    assert.equal(word(m, 6), 0x9500);
  }
});

test("SH7 tpa figures", () => {
  const m = shelled({ "MON3.SVC": MON3.file });
  assert.equal(word(m, 6), 0xaa00, "SHELL.SVC alone: TPA 43,264");
  at(m, "MON3.SVC", { re: M3 });
  assert.equal(word(m, 6), 0x9800, "with MON3.SVC: 38,656");
  const g = glcdBoard(["SHELL.SVC", "GLCD.SVC"]);
  g.runUntil(() => g.ready() && g.read(g.sym("CONMOD")) === 3, 900_000_000, "the GLCD's prompt");
  assert.equal(word(g, 6), 0xa700, "with GLCD.SVC: 42,496");
});

test("SH7 mutant: SHELL.SVC declaring 6 on the CCP's stack makes GLCD.SVC?", async () => {
  const mut = await shellVariant([["  DB 6,0,0\n", "  DB 6,0,6\n"]]);
  const m = shellMachine(shellCard({ "GLCD.SVC": GLCD_SVC }, { startup: ["SHELL.SVC", "GLCD.SVC"], shell: mut.file }), { matrix: true, glcd: true, noWait: true });
  m.runUntil(() => m.ready(), 900_000_000, "the prompt");
  assert.match(m.text(0), /GLCD\.SVC\?/);
});

test("SH7 mutant: a 128-byte recall buffer takes a sixteenth page", async () => {
  const mut = await shellVariant([["STKTOP    EQU   STKBOT+48\n", "STKTOP    EQU   STKBOT+48+128\n"]]);
  assert.equal(pages(mut), 16);
});

// --- Pieces, separators and lines ------------------------------------------

/** A machine with the shell and the code setters, at its first prompt. */
const pm = (files = {}) => shelled({ "LINE.COM": LINEP, ...files });

test("SH8 bang always", () => {
  const m = pm();
  for (const f of ["F", "FE", "OK", "ONE", "FFFF"]) assert.equal(hellos(at(m, `${f}!TYPE HELLO.TXT`)), 1, `${f}!TYPE runs TYPE`);
  assert.equal(hellos(at(m, "F !TYPE HELLO.TXT")), 1);
});

test("SH8 amp on success", () => {
  const m = pm();
  const runs = (line) => hellos(at(m, line));
  assert.equal(runs("F &TYPE HELLO.TXT"), 0, "after FF00h it skips");
  assert.equal(runs("FE &TYPE HELLO.TXT"), 0, "after FFFEh it skips");
  assert.equal(runs("OK &TYPE HELLO.TXT"), 1, "after 0 it runs");
  assert.equal(runs("ONE &TYPE HELLO.TXT"), 1, "after 1 it runs");
  assert.equal(runs("FFFF &TYPE HELLO.TXT"), 1, "after FFFFh it runs");
  assert.equal(runs("F & TYPE HELLO.TXT"), 0, "& with blanks round it");
  assert.equal(runs("OK X\t&TYPE HELLO.TXT"), 1, "a tab before & is a blank");
  assert.equal(runs("F X\t&TYPE HELLO.TXT"), 0, "a tab before & is a blank, after a failure");
  assert.equal(runs("OK\t&TYPE HELLO.TXT"), 1, "the piece ends before the tab: OK runs");
  const w = at(m, "TYPE HELLO.TXT\t!SAY");
  assert.equal(hellos(w), 1, "a tab before ! leaves the tail's name whole");
  assert.doesNotMatch(w, /\?/, "nothing refused");
});

test("SH8 amp after blank only", () => {
  const m = pm({ "OK&TYPE.COM": null });
  const w = at(m, "OK&TYPE HELLO.TXT");
  assert.match(w, /OK&TYPE\?/, "an & inside a word is text: the name OK&TYPE");
  assert.equal(hellos(w), 0);
  at(m, "SAY X /M:&HE000");
  assert.equal(toLatin1(Uint8Array.from(Array.from({ length: m.read(0x80) }, (_, i) => m.read(0x81 + i)))), " X /M:&HE000", "the tail passes whole");
});

test("SH8 runs", () => {
  const m = pm();
  assert.equal(hellos(at(m, "F &!TYPE HELLO.TXT")), 1, "&! runs");
  assert.equal(hellos(at(m, "F !&TYPE HELLO.TXT")), 1, "!& runs");
  assert.equal(hellos(at(m, "F &&TYPE HELLO.TXT")), 0, "&& is one conditional run");
  assert.equal(hellos(at(m, "F & & TYPE HELLO.TXT")), 0);
  assert.equal(hellos(at(m, "F ! & TYPE HELLO.TXT")), 1);
});

test("SH8 skipped leaves the code", () => {
  const m = pm();
  assert.equal(hellos(at(m, "F &OK &TYPE HELLO.TXT")), 0, "both skipped");
  assert.equal(code(m), 0xff00);
  assert.equal(hellos(at(m, "F &OK !TYPE HELLO.TXT")), 1, "! after a skipped piece runs");
});

test("SH8 leading amp refused", () => {
  const m = pm();
  at(m, "OK");
  for (const line of ["&TYPE HELLO.TXT", " !&TYPE HELLO.TXT", "\t&TYPE HELLO.TXT"]) {
    const t = at(m, line);
    assert.match(t, /\r\n&TYPE\?\r\n\r\nA(:\S*)?>$/, `${JSON.stringify(line)}: refused, a blank line before the prompt`);
    assert.equal(hellos(t), 0, "nothing of it runs");
    assert.equal(code(m), 0xff00);
  }
});

test("SH8 codes", () => {
  const m = pm();
  assert.equal(hellos(at(m, "NOSUCH &TYPE HELLO.TXT")), 0, "a refused command is a failure");
  assert.equal(hellos(at(m, "TYPE NONE.TXT &TYPE HELLO.TXT")), 0, "NO FILE is a failure");
  assert.equal(hellos(at(m, "ERA NONE.TXT &TYPE HELLO.TXT")), 0);
  assert.equal(hellos(at(m, "COPY NONE.TXT X.TXT &TYPE HELLO.TXT")), 0, "the shell's own failures too");
  assert.equal(hellos(at(m, "COPY HELLO.TXT X.TXT &TYPE HELLO.TXT")), 1);
});

test("SH8 lines go on", () => {
  const m = pm();
  at(m, "F");
  assert.equal(hellos(at(m, "TYPE HELLO.TXT")), 1, "each new line runs whatever the last returned");
  const m2 = pm({ "S.CMD": Buffer.from("F\r\nTYPE HELLO.TXT\r\n\x1a", "latin1") });
  assert.equal(hellos(at(m2, "S.CMD")), 1, "a script's line after a failing line runs");
});

test("SH8 amp on script lines", () => {
  const m = pm({ "S.CMD": Buffer.from("F &TYPE HELLO.TXT\r\n&TYPE HELLO.TXT\r\nOK &TYPE HELLO.TXT\r\n\x1a", "latin1") });
  const t = at(m, "S.CMD");
  assert.equal(hellos(t), 1, "the & piece after F skipped, the one after OK run");
  assert.match(t, /&TYPE\?/, "a script line starting & refused");
  assert.match(t, /\r\nA(:\S*)?>OK &TYPE HELLO\.TXT\r+\n\r\nA(:\S*)?>TYPE HELLO\.TXT\r\nhello/, "and the next line runs");
});

test("SH8 colon refused", () => {
  const m = pm();
  const t = at(m, "OK!:TYPE HELLO.TXT");
  assert.match(t, /:TYPE\?/);
  assert.equal(code(m), 0xff00);
  assert.match(at(m, ":TYPE HELLO.TXT"), /:TYPE\?/);
});

test("SH8 echo", () => {
  const m = pm();
  const e = at(m, "OK!TYPE HELLO.TXT &TYPE C.TXT");
  assert.match(e, /\r\nA(:\S*)?>TYPE HELLO\.TXT\r\n/, "echoed after its prompt, up to the blanks before its separator");
  assert.match(e, /\r\nA(:\S*)?>TYPE C\.TXT\r\n/);
  assert.doesNotMatch(e, /A(:\S*)?>OK!/);
});

test("SH8 drops", () => {
  const m = pm({ "L.TXT": LONG });
  m.mark = m.output.length;
  m.type("LINE!TYPE HELLO.TXT\r");
  m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 400_000_000, "LINE's input");
  m.type("\x03");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 400_000_000, "the prompt after ^C");
  assert.equal(hellos(m.text(m.mark)), 0, "^C at a program's line input drops the rest");
  // ^C at [more] drops the rest; Esc and Q stop only the listing.
  for (const [key, n] of [["\x03", 0], ["\x1b", 1], ["Q", 1]]) {
    m.mark = m.output.length;
    m.type("TYPE L.TXT!TYPE HELLO.TXT\r");
    m.runUntil(() => /\[more\]$/.test(m.text(m.mark)), 400_000_000, "[more]");
    m.type(key);
    m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 400_000_000, "the prompt");
    assert.equal(hellos(m.text(m.mark)), n, `${JSON.stringify(key)} at [more]`);
  }
});

test("SH8 function 47 line", () => {
  const m = pm({ "CH.COM": chain("F &TYPE HELLO.TXT!TYPE HELLO.TXT"), "CH2.COM": chain("&TYPE HELLO.TXT") });
  assert.equal(hellos(at(m, "CH")), 1, "under the shell, ! and & take a function 47 line apart");
  assert.match(at(m, "CH2"), /&TYPE\?/, "and its leading & is refused");
});

test("SH8 ted build line", () => {
  // TED's A:TAS NAME!A:TED: the build fails, and TED comes back.
  const tas = Uint8Array.from([0x11, 0x00, 0xff, 0x0e, 108, 0xcd, 0x05, 0x00, 0xc9]);
  const ted = Uint8Array.from([0x1e, 0x54, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints T
  const m = pm({ "TAS.COM": tas, "TED.COM": ted });
  const t = at(m, "A:TAS NAME!A:TED");
  assert.match(t, /A(:\S*)?>A:TED\r\nT/, "TED runs after a failed build");
});

const shellWith = (edits) => shellVariant(edits);
async function pmWith(edits, files = {}) {
  const mut = await shellWith(edits);
  return shellMachine(shellCard({ "LINE.COM": LINEP, ...files }, { startup: ["SHELL.SVC"], shell: mut.file }));
}

test("SH8 mutant: & acting as ! runs a failing piece's next", async () => {
  const m = await pmWith([["  sub '!'        ; ! or & here\n  ld b,a         ; 0 for !, else &", "  xor a\n  ld b,a"]]);
  assert.equal(hellos(at(m, "F &TYPE HELLO.TXT")), 1);
});

test("SH8 mutant: ! acting as & stops TED's build line", async () => {
  const m = await pmWith([["  sub '!'        ; ! or & here\n  ld b,a         ; 0 for !, else &", "  or a\n  ld b,a"]]);
  assert.equal(hellos(at(m, "F!TYPE HELLO.TXT")), 0);
});

test("SH8 mutant: a skipped piece setting code 0", async () => {
  const m = await pmWith([["  call SPLIT     ; skipped", "  call SPLIT\n  ld de,0\n  ld c,108\n  call BDOS"]]);
  assert.equal(hellos(at(m, "F &OK &TYPE HELLO.TXT")), 1);
});

test("SH8 mutant: the code read once per line", async () => {
  const m = await pmWith([["  ld a,(LCOND)\n  or a\n  jr z,LNRUN     ; after !: it runs", "  ld a,(LCOND)\n  or a\n  jr z,LNRUN\n  ld a,(PDNZ)\n  or a\n  jr nz,LNRUN\n  ld a,1\n  ld (PDNZ),a"]]);
  at(m, "SAY");
  assert.equal(hellos(at(m, "OK &F &TYPE HELLO.TXT")), 1);
});

test("SH8 mutant: a tab before & taken as text", async () => {
  const m = await pmWith([["  cp TAB         ; or a tab?\n  ld a,b         ; the & again\n  jr nz,SP3      ; no: it is text", "  ld a,b\n  jr SP3"]]);
  assert.equal(hellos(at(m, "OK X\t&TYPE HELLO.TXT")), 0);
});

test("SH8 mutant: a piece keeping the blanks before its separator", async () => {
  const m = await pmWith([["  ex de,hl\n  ld (hl),0      ; the end, at DE\n  ex de,hl", "  ld (hl),0"]]);
  assert.equal(hellos(at(m, "OK\t&TYPE HELLO.TXT")), 0);
});

test("SH8 mutant: & splitting inside a word", async () => {
  const m = await pmWith([["  jr nz,SP3      ; no: it is text", "  jr SPAMP"]]);
  assert.doesNotMatch(at(m, "OK&TYPE HELLO.TXT"), /OK&TYPE\?/);
});

test("SH8 mutant: a leading & testing the last line's code", async () => {
  const m = await pmWith([["  cp '&'\n  ret nz         ; HL: the first piece", "  cp '&'\n  ret nz\n  inc hl\n  ld (LPOS),hl\n  ld a,1\n  ld (LCOND),a\n  jp LN2"]]);
  at(m, "F");
  // The prompt as text: the mutant's skipped line leaves no gate for ready().
  assert.doesNotMatch(at(m, "&TYPE HELLO.TXT", { re: /A(:\S*)?>$/ }), /&TYPE\?/);
});

test("SH8 mutant: any nonzero code a failure skips after a program returning 1", async () => {
  const m = await pmWith([["  ld a,h         ; FFh in the high\n  inc a\n  jr nz,LN3      ; high byte below FFh\n  ld a,l         ; and FFh in the low\n  inc a\n  jr z,LN3       ; FFFFh: not a failure", "  ld a,h\n  or l\n  jr z,LN3"]]);
  assert.equal(hellos(at(m, "ONE &TYPE HELLO.TXT")), 0);
});

// --- .CMD scripts ----------------------------------------------------------

const crlf = (...lines) => Buffer.from(lines.join("\r\n") + "\r\n\x1a", "latin1");

test("SH9 records", () => {
  const pad = Array.from({ length: 6 }, (_, i) => `; padding ${i} to pass one record`);
  const script = crlf("USER 1", ...pad, "USER 2", ...pad, ...pad, "USER 3");
  assert.ok(script.length > 256, "three records");
  const m = pm({ "S.CMD": script });
  at(m, "S.CMD");
  assert.equal(user(m), 3, "every record's lines run");
  const m2 = pm({ "Z.CMD": Buffer.from("USER 4\r\n\x1aUSER 5\r\n", "latin1"), "Y.CMD": Buffer.from("USER 6\r\n\0USER 7\r\n", "latin1"), "W.CMD": Buffer.from("USER 8", "latin1") });
  at(m2, "Z.CMD");
  assert.equal(user(m2), 4, "1Ah ends it");
  at(m2, "USER 0"); // the scripts are in user 0's directory
  at(m2, "Y.CMD");
  assert.equal(user(m2), 6, "a zero ends it");
  at(m2, "USER 0");
  at(m2, "W.CMD");
  assert.equal(user(m2), 8, "the last record's end ends an unended line");
});

test("SH9 127", () => {
  const long = `SAY ${"X".repeat(123)}`; // 127 characters
  const m = pm({ "S.CMD": crlf(`${long}YYYY`, "USER 2") });
  const t = at(m, "S.CMD");
  assert.match(t, new RegExp(`A(:\\S*)?>${long}\\r`), "the first 127 kept");
  assert.doesNotMatch(t, /XY/);
  assert.equal(user(m), 2, "the rest of the line dropped, the next line read");
});

test("SH9 line ends", () => {
  const m = pm({ "S.CMD": Buffer.from("USER 1\rUSER 2\nUSER 3\r\nUSER 4\n\rUSER 5\r\n\x1a", "latin1") });
  const t = at(m, "S.CMD");
  assert.equal(count(t, /A(:\S*)?>USER \d\r/g), 5, "CR, LF and CR LF each end a line");
  assert.equal(user(m), 5);
});

test("SH9 passed over", () => {
  const m = pm({ "S.CMD": crlf("; a comment", "", "   ", " ! !", "\t", "TYPE HELLO.TXT") });
  const t = at(m, "S.CMD");
  assert.doesNotMatch(t, /; a comment|A(:\S*)?> |A(:\S*)?>\t|A(:\S*)?>\r/);
  assert.equal(count(t, /\r\n\d*A(:\S*)?>/g), 2, "one prompt for the line that runs, one after");
  assert.equal(hellos(t), 1);
  const m2 = pm({ "S.CMD": crlf("  ; after blanks") });
  assert.match(at(m2, "S.CMD"), /;\?/, "a ; after blanks is not a comment: the CCP refuses it");
});

test("SH9 echo", () => {
  const m = pm({ "S.CMD": crlf("SAY!TYPE HELLO.TXT") });
  assert.match(at(m, "S.CMD"), /A(:\S*)?>SAY!TYPE HELLO\.TXT\r/, "the line echoed whole");
});

test("SH9 where", () => {
  const image = shellCard({}, { startup: ["SHELL.SVC"] });
  volume(image, "B").write("S.CMD", crlf("USER 4"));
  volume(image, "A").write("T.CMD", crlf("USER 5"));
  const m = shellMachine(image);
  at(m, "B:S.CMD");
  assert.equal(user(m), 4, "the drive named");
  at(m, "USER 0");
  at(m, "B:");
  assert.match(at(m, "T.CMD"), /T\.CMD\?/, "the current drive, no fallback to A:");
  assert.equal(code(m), 0xff00);
  at(m, "A:");
  at(m, "USER 1");
  assert.match(at(m, "T.CMD"), /T\.CMD\?/, "the current user");
  at(m, "USER 0");
  at(m, "T.CMD");
  assert.equal(user(m), 5);
});

test("SH9 no nesting", () => {
  const m = pm({ "S.CMD": crlf("T.CMD", "USER 3"), "T.CMD": crlf("USER 9") });
  const t = at(m, "S.CMD");
  assert.match(t, /T\.CMD\?/, "a script piece inside a script is refused");
  assert.equal(user(m), 3, "and the next line runs");
});

test("SH9 pieces after", () => {
  const m = pm({ "S.CMD": crlf("USER 9") });
  const t = at(m, "S.CMD!USER 2");
  assert.match(t, /S\.CMD\?/);
  assert.equal(user(m), 2, "the ! piece after it runs");
});

test("SH9 tail", () => {
  const m = pm({ "S.CMD": crlf("USER 6") });
  at(m, "S.CMD ANY TEXT");
  assert.equal(user(m), 6);
});

test("SH9 typed origin", () => {
  const m = shellMachine(shellCard({ "S.CMD": crlf("NODEV.SVC"), "NODEV.SVC": GLCD_SVC }, { startup: ["SHELL.SVC"] }), { glcd: false });
  assert.match(at(m, "S.CMD"), /NODEV\.SVC\?/, "no startup quiet path in a script");
});

test("SH9 mutant: one record read only", async () => {
  const pad = Array.from({ length: 6 }, (_, i) => `; padding ${i} to pass one record`);
  const m = await pmWith([["  xor a          ; offset 0\n  ld (SOFF),a\n  ld (SLOAD),a   ; not read yet", "  ld a,l\n  or h\n  jp nz,SGEND\n  ld (SOFF),a\n  ld (SLOAD),a"]], { "S.CMD": crlf("USER 1", ...pad, "USER 2") });
  at(m, "S.CMD");
  assert.equal(user(m), 1);
});

test("SH9 mutant: ; after blanks taken as a comment", async () => {
  const m = await pmWith([["  ld a,(LTXT)    ; its first byte\n  cp ';'", "  ld hl,LTXT\n  call SKIPSP\n  cp ';'"]], { "S.CMD": crlf("  ; after blanks") });
  assert.doesNotMatch(at(m, "S.CMD"), /;\?/);
});

// --- The rest of STARTUP.CMD -----------------------------------------------

/** A machine booting STARTUP.CMD of LINES, run until its prompt with USER u. */
function boots(lines, files = {}, opts = {}) {
  const m = shellMachine(shellCard(files, { startup: lines }), { noWait: true, ...opts });
  m.runUntil(() => m.ready(), 900_000_000, "the prompt after startup");
  return m;
}

test("SH10 the rest runs", () => {
  const pad = Array.from({ length: 6 }, (_, i) => `; padding ${i} to pass one record`);
  const m = boots(["SHELL.SVC", "; the rest", "TYPE HELLO.TXT", ...pad, "USER 2!USER 5"]);
  assert.equal(user(m), 5, "every later line, from every record");
  assert.equal(hellos(m.text(0)), 1, "once");
});

test("SH10 shell again runs the rest once", () => {
  const m = boots(["SHELL.SVC", "TYPE HELLO.TXT", "SHELL.SVC", "USER 2"]);
  assert.equal(hellos(m.text(0)), 1);
  assert.equal(user(m), 2, "the file goes on after the second SHELL.SVC");
  assert.equal(owners(m).length, 1);
});

test("SH10 quiet paths", () => {
  const m = boots(["SHELL.SVC", "NODEV.SVC", "USER 3"], { "NODEV.SVC": GLCD_SVC }, { glcd: false });
  assert.doesNotMatch(m.text(0), /NODEV\.SVC\?/, "the startup line's quiet path for an absent device");
  assert.equal(user(m), 3);
});

test("SH10 key skips", () => {
  const m = shellMachine(shellCard({}, { startup: ["SHELL.SVC", "USER 3"] }), { noWait: true });
  m.tec1g.applyKeySilent(0x01, true); // a keypad key held through reset
  m.runUntil(() => m.ready(), 900_000_000, "the prompt");
  assert.equal(pageOf(m), 0, "the shell is not in");
  assert.equal(user(m), 0, "nothing ran");
});

test("SH10 warm boot", () => {
  const m = boots(["SHELL.SVC", "TYPE HELLO.TXT"]);
  const t = at(m, "SAY");
  assert.equal(hellos(t), 0, "a warm boot never runs the file again");
});

test("SH10 no shell one line", () => {
  const m = boots(["USER 3", "USER 5"], {});
  assert.equal(user(m), 3, "without the shell only the first line runs");
});

test("SH10 mutant: the rest started at every entry loops", async () => {
  const mut = await shellVariant([["  ld a,(CLAIMD)  ; the first claim?\n  or a\n  ret nz         ; not the first entry", "  ld a,(CLAIMD)\n  or a\n  ld (PREV),hl\n  ld a,b\n  inc a\n  ret nz\n  dec a\n  ld (STSKIP),a\n  ret"]]);
  const m = shellMachine(shellCard({}, { startup: ["SHELL.SVC", "TYPE HELLO.TXT", "SHELL.SVC", "USER 2"], shell: mut.file }), { noWait: true });
  assert.throws(() => m.runUntil(() => m.ready() && user(m) === 2 && hellos(m.text(0)) === 1, 300_000_000, "the end"));
});

test("SH10 mutant: the file started from its first line enters SHELL.SVC again", async () => {
  const mut = await shellVariant([["  call SLINE     ; past the ROM's line\n  ret nc", "  or a\n  ret nc"]]);
  const m = shellMachine(shellCard({}, { startup: ["SHELL.SVC", "USER 2"], shell: mut.file }), { noWait: true });
  m.runUntil(() => m.ready(), 900_000_000, "the prompt");
  assert.equal(count(m.text(0), /A(:\S*)?>SHELL\.SVC\r/g), 2);
});

test("SH10 mutant: the rest given typed origin says NODEV.SVC?", async () => {
  const mut = await shellVariant([["  ld a,$FF       ; its lines quiet\n  ld (SORG),a    ; the startup origin", "  xor a\n  ld (SORG),a"]]);
  const m = shellMachine(shellCard({ "NODEV.SVC": GLCD_SVC }, { startup: ["SHELL.SVC", "NODEV.SVC"], shell: mut.file }), { noWait: true, glcd: false });
  m.runUntil(() => m.ready(), 900_000_000, "the prompt");
  assert.match(m.text(0), /NODEV\.SVC\?/);
});

// --- Mutants of the moved commands (their tests are in their own files) ----

test("SH11 mutant: the ring's duplicate test removed stores a line twice", async () => {
  const mut = await shellVariant([["  jr z,HSKEEP    ; a repeat", "  nop\n  nop"]]);
  const m = shellMachine(shellCard({}, { startup: ["SHELL.SVC"], shell: mut.file }));
  at(m, "SAY");
  at(m, "SAY");
  const ring = pageOf(m) + mut.symbols.RING;
  const text = toLatin1(Uint8Array.from(Array.from({ length: 16 }, (_, i) => m.read(ring + i))));
  assert.equal(count(text, /SAY\0/g), 2);
});

test("SH11 mutant: PAGE counting a tab as one column wraps late", async () => {
  const tabs = Buffer.from(`${"\t".repeat(11)}X\r\n`.repeat(30) + "\x1a", "latin1"); // past 80 columns
  const right = shellMachine(shellCard({ "T.TXT": tabs }, { startup: ["SHELL.SVC"] }));
  const mut = await shellVariant([["  ld a,(PGCOL)   ; the column\n  or 7\n  inc a          ; the next eighth", "  ld a,(PGCOL)\n  inc a\n  nop\n  nop"]]);
  const wrong = shellMachine(shellCard({ "T.TXT": tabs }, { startup: ["SHELL.SVC"], shell: mut.file }));
  const more = (m) => {
    m.mark = m.output.length;
    m.type("TYPE T.TXT\r");
    m.runUntil(() => /\[more\]$/.test(m.text(m.mark)), 400_000_000, "[more]");
    return count(m.text(m.mark), /X/g);
  };
  assert.notEqual(more(right), more(wrong));
});

// --- Re-entry, unload and recovery -----------------------------------------

const HOOKZ = HOOK; // HOOK.SVC declares no stack, so two fit beside SHELL.SVC

test("SH12 unload last", () => {
  const m = shellMachine(shellCard({}, { startup: [] }));
  const top = word(m, 6);
  at(m, "SHELL.SVC");
  at(m, "UNLOAD");
  assert.equal(shown(m), 0);
  assert.equal(word(m, 6), top, "(0006h) as before");
});

test("SH12 unload order", () => {
  const m = shelled({ "MON3.SVC": MON3.file });
  at(m, "MON3.SVC", { re: M3 });
  at(m, "EXIT");
  const sp = pageOf(m);
  at(m, "UNLOAD");
  assert.equal(shown(m), sp + sym.TABLE, "MON3.SVC goes first; the shell keeps the prompt");
  assert.deepEqual(owners(m).map((o) => o.name), ["SHELL"]);
});

test("SH12 two shells", () => {
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOKZ.file }, { startup: ["SHELL.SVC"] }));
  const sp = pageOf(m);
  at(m, "HOOK.SVC", { re: S });
  assert.equal(shown(m), lowest(m) + hsym.TABLE);
  at(m, "UNLOAD");
  assert.equal(shown(m), sp + sym.TABLE, "UNLOAD gives the prompt to the one before");
  at(m, "UNLOAD");
  assert.equal(shown(m), 0);
});

test("SH12 re-entry under a later shell", () => {
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOKZ.file }, { startup: ["SHELL.SVC"] }));
  const sp = pageOf(m);
  at(m, "HOOK.SVC", { re: S });
  at(m, "SHELL.SVC");
  assert.equal(shown(m), sp + sym.TABLE, "the shell takes the prompt back");
  assert.equal(word(m, sp + sym.PREV), 0, "and keeps the table from its first claim");
  at(m, "UNLOAD");
  assert.equal(shown(m), sp + sym.TABLE, "HOOK's UNLOAD leaves the prompt with it");
  at(m, "UNLOAD");
  assert.equal(shown(m), 0, "the last UNLOAD gives the bare prompt");
});

/** HOOK, HOOK2, then SHELL; HOOK entered again; UNLOAD: who holds the prompt. */
function giveBack(shell, rom) {
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOKZ.file, "HOOK2.SVC": HOOKZ.file }, { startup: [], shell }), rom ?? {});
  at(m, "HOOK.SVC", { re: S });
  const h1 = lowest(m);
  at(m, "HOOK2.SVC", { re: S });
  at(m, "SHELL.SVC");
  at(m, "HOOK.SVC", { re: S });
  at(m, "UNLOAD", { re: S });
  return { m, h1 };
}

test("SH12 guarded give-back", () => {
  const { m, h1 } = giveBack();
  assert.equal(shown(m), h1 + hsym.TABLE, "with an earlier shell holding the hook, REMOVE leaves it");
});

test("SH12 swept", () => {
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOKZ.file }, { startup: [] }));
  assert.match(leaveHook(m), P);
  assert.equal(shown(m), 0);
});

test("SH12 reset", () => {
  const m = shelled();
  assert.ok(pageOf(m));
  m.reset();
  m.tec1g.applyKeySilent(0x01, true); // held through the reset
  m.runUntil(() => m.ready(), 900_000_000, "the prompt after a reset with a key held");
  assert.equal(shown(m), 0, "the bare prompt");
  assert.equal(pageOf(m), 0);
});

const OVERWRITE = ["  ld a,(CLAIMD)  ; the first claim?\n  or a\n  ret nz         ; not the first entry", "  ld a,(CLAIMD)\n  or a\n  ld (PREV),hl\n  ret nz"];

test("SH12 mutant: re-entry overwriting the kept table", async () => {
  const mut = await shellVariant([OVERWRITE]);
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOKZ.file }, { startup: ["SHELL.SVC"], shell: mut.file }));
  const sp = pageOf(m);
  at(m, "HOOK.SVC", { re: S });
  at(m, "SHELL.SVC");
  assert.notEqual(word(m, sp + mut.symbols.PREV), 0);
});

test("SH12 mutant: the give-back unguarded hands the prompt to HOOK2", async () => {
  const mut = await shellVariant([["  jr z,RM1       ; it was this shell", "  jr RM1"]]);
  const { m, h1 } = giveBack(mut.file);
  assert.notEqual(shown(m), h1 + hsym.TABLE);
});

test("SH12 mutant: the last UNLOAD with the sweep removed, under the overwriting mutant, jumps to a freed table", async () => {
  const mut = await shellVariant([OVERWRITE]);
  const sweep = romMutant((b, s) => { b[find(b, s("PZSWP"), [0x30, null], 12)] = 0x18; });
  const m = shellMachine(shellCard({ "HOOK.SVC": HOOKZ.file }, { startup: ["SHELL.SVC"], shell: mut.file }), sweep);
  at(m, "HOOK.SVC", { re: S });
  at(m, "SHELL.SVC");
  at(m, "UNLOAD");
  m.mark = m.output.length;
  m.type("UNLOAD\r");
  const until = m.cycles + 100_000_000;
  m.runUntil(() => m.cycles > until, 200_000_000, "the last UNLOAD");
  assert.ok(shown(m) && shown(m) >> 8 < word(m, 6) >> 8, `the hook kept at ${shown(m).toString(16)}h, in freed pages`);
});

// --- The stack census with the shell ---------------------------------------

/** The census's watch with the shell in: its three stacks, and the shell's own, which the machine's guard reads. */
function census(lines, opts) {
  const m = shellMachine(shellCard({ ...WORK, "GLCD.SVC": GLCD_SVC, "MON3.SVC": MON3.file, "LINE.COM": LINEP }, { startup: lines }), { noWait: true, ...opts });
  m.runUntil(() => m.ready() && pageOf(m), 900_000_000, "the prompt");
  const guard = GUARDS.machines.find((g) => g.m === m);
  const done = watch(m);
  if (opts?.glcd) {
    // The GLCD's 8 rows pause most listings: the census's run answers [more].
    for (const l of ["DIR", "TYPE HELLO.TXT", "F &DIR", "F!DIR", "COPY HELLO.TXT C.TXT", "SERVICES", "S.CMD", "CH", "TYPE L.TXT"]) censusRun(m, `${l}\r`);
    censusRun(m, "MON3.SVC\r", /MON3>$/);
    censusRun(m, "EXIT\r");
  } else {
    workload(m);
    // ^C's drop, on the serial console.
    m.mark = m.output.length;
    m.type("LINE!SAY\r");
    m.runUntil(() => m.read(m.sym("LINMAX")) === 20 && m.waitingForInput(), 400_000_000, "LINE's input");
    m.type("\x03");
    m.runUntil(() => m.ready(), 400_000_000, "the prompt after ^C");
  }
  return { stacks: done({ pattern: true }), shell: guard.read() };
}

test("SH13 guard read between prompts", () => {
  const m = shelled({ "LINE.COM": LINEP });
  const g = GUARDS.machines.find((x) => x.m === m);
  assert.ok(g, "the machine's guard is laid");
  for (const l of ["DIR", "TYPE HELLO.TXT", "F &SAY!SAY", "COPY HELLO.TXT C.TXT", "SERVICES"]) at(m, l);
  const deepest = g.read();
  assert.ok(deepest > 0 && deepest <= 24, `the shell's own stack: ${deepest} of 48`);
});

test("SH13 mutant: PAGE's stack 16 bytes lower reads above 24", async () => {
  // The same size, so the guard reads it: PAGE takes its stack at STKTOP-16.
  const mut = await shellVariant([["  ld (PGSP),sp   ; the caller's SP\n  ld sp,STKTOP   ; the shell's stack", "  ld (PGSP),sp\n  ld sp,STKTOP-16"]]);
  assert.equal(mut.file.length, SHELL.file.length, "the same size");
  const m = shellMachine(shellCard({}, { shell: mut.file }));
  const at0 = GUARDS.machines.findIndex((x) => x.m === m);
  assert.ok(at0 >= 0, "the guard reads the variant");
  const [g] = GUARDS.machines.splice(at0, 1);
  at(m, "TYPE HELLO.TXT");
  const deepest = g.read();
  assert.ok(deepest > 24, `the shell's own stack: ${deepest} of 48, past the bound`);
});

test("SH13 census with the shell", () => {
  const { stacks, shell } = census(["SHELL.SVC"]);
  console.log(JSON.stringify({ stacks, shell }));
  for (const [k, s] of Object.entries(stacks)) assert.ok(s.deepest <= s.reserved * 0.75, `${k}: ${s.deepest} of ${s.reserved}, a quarter free`);
  assert.ok(shell >= 12 && shell <= 24, `the shell's own stack: ${shell} of 48, the docs' 16 within 12 to 24`);
});

test("SH13 census with the three", () => {
  const { stacks, shell } = census(["SHELL.SVC", "GLCD.SVC"], { matrix: true, glcd: true });
  assert.ok(shell >= 12 && shell <= 24, `the shell's own stack: ${shell} of 48, the docs' 16 within 12 to 24`);
  for (const [k, s] of Object.entries(stacks)) assert.ok(s.deepest <= s.reserved * 0.75, `${k}: ${s.deepest} of ${s.reserved}`);
});

test("SH13 mutant: PAGE on the CCP's stack uses the CCP's room it declared 0 of", async () => {
  const mut = await shellVariant([["  ld (PGSP),sp   ; the caller's SP\n  ld sp,STKTOP   ; the shell's stack\n  call PGPUT     ; the byte\n  ld sp,(PGSP)   ; back, carry kept", "  call PGPUT"]]);
  const m = shellMachine(shellCard(WORK, { startup: ["SHELL.SVC"], shell: mut.file }));
  const page = pageOf(m);
  const use = entries(m, page, page + pages(mut) * 256);
  at(m, "TYPE HELLO.TXT");
  assert.ok(use.ccp > 0);
});

// --- Docs, the CP/M 3 departures and TED -----------------------------------

const doc = (n) => readFileSync(resolve(ROOT, n), "utf8");
const ROMDOCS = ["docs/services.md", "docs/mon3.md", "docs/rom-services.md", "docs/ccp-integration.md", "docs/compatibility.md", "docs/console.md", "docs/memory-map.md", "README.md"];

test("SH15 docs agree", () => {
  for (const n of ROMDOCS) {
    const t = doc(n);
    assert.doesNotMatch(t, /MON3\.SVC \/E/, `${n}: no MON3.SVC /E`);
    assert.doesNotMatch(t, /!:/, `${n}: no !: example`);
    assert.doesNotMatch(t, /one record[^.]*at most 128 bytes/i, `${n}: not one record of lines`);
  }
  const shell = doc("docs/shell.md");
  for (const s of ["TNSHELL", "LINE", "PAGE", "HREC", "HSTORE", ".CMD", "&", "!", "STARTUP.CMD"]) assert.ok(shell.includes(s), `docs/shell.md names ${s}`);
  assert.match(shell, /TED/);
  assert.match(shell, /whole/);
  assert.match(shell, new RegExp(`${pages(SHELL)} pages`));
});

test("SH15 compatibility departures", () => {
  const t = doc("docs/compatibility.md");
  assert.match(t, /TED X\.ASM!TAS X &X/);
  assert.match(t, /BAZA BAD &TIMES/);
  assert.match(t, /`&`/);
  assert.match(t, /`:`/);
});

test("SH15 ted build returns", () => {
  const tas = Uint8Array.from([0x11, 0x00, 0xff, 0x0e, 108, 0xcd, 0x05, 0x00, 0xc9]);
  const ted = chain("A:TAS NAME!A:TED2");
  const ted2 = Uint8Array.from([0x1e, 0x54, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]);
  const m = pm({ "TAS.COM": tas, "TED.COM": ted, "TED2.COM": ted2 });
  const t = at(m, "TED");
  assert.match(t, /A(:\S*)?>A:TED2\r\nT/, "TED's build line comes back to TED after a failed build");
});
