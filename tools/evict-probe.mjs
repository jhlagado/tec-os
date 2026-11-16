// Prototype probe for the service-evict model: the starter card's services
// evicted for EVBIG.COM, which overwrites the whole TPA, and brought back
// at the prompt. Prints figures; asserts nothing. node tools/evict-probe.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, program, startupFile, volume } from "../test/lib/fixtures.mjs";
import { EXPAND1_WRITES } from "../test/lib/machine.mjs";
import { pendingSayFailure, pendingSayFiles } from "../test/lib/pending-say.mjs";
import { makeSvc } from "./lib/svc.mjs";
import { CODES, LINEP, SAY, chain, execSvc, owners, word } from "../test/lib/shell.mjs";

const EVBIG = (await program("evbig")).bytes;
const CLOCK = 4_000_000;
const ms = (cycles) => Math.round((cycles * 1000) / CLOCK);
const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");

// Test services with an execution record that asks for no entry: KEEP's
// REMOVE refuses, FIXED is not removable, S1 to S5 are plain.
const svc = async (name, over = {}) => (await execSvc({ ENTER: 0, HDRNAME: JSON.stringify(name.padEnd(8)), ...over })).file;
const EXTRA = {
  "EVBIG.COM": EVBIG,
  "SAY.COM": SAY,
  "F.COM": CODES["F.COM"],
  "ONE.COM": CODES["ONE.COM"],
  "CHF.COM": chain("F &SAY"),
  "LINE.COM": LINEP,
  // LD C,0 then JP 0005h: an exit by BDOS 0.
  "B0.COM": Uint8Array.from([0x0e, 0x00, 0xc3, 0x05, 0x00]),
  "CH.COM": chain("EVBIG !SAY"),
  "KEEP.SVC": await svc("KEEP", { V_KEEP: 1 }),
  "FIXED.SVC": await svc("FIXED", { FLAGS: 0 }),
};
for (const n of ["S1", "S2", "S3", "S4", "S5"]) EXTRA[`${n}.SVC`] = await svc(n);

// test/programs/svcdemo.asm: DEMO publishes a registry record, CLIENT binds
// to it as a dependency, HOOKS replaces the RAM BIOS CONOUT entry and VECS
// claims restart slot 08h. TP asks to be entered and takes any origin.
const DEMOV = ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"];
const demo = async (name, over = {}, opt = {}) => {
  const defs = { ...Object.fromEntries(DEMOV.map((v) => [v, 0])), VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: JSON.stringify(name.padEnd(8)), RECNAME: JSON.stringify(name.padEnd(8)), RECVER: 2, ...over };
  return (await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc"), ...opt })).file;
};
Object.assign(EXTRA, {
  "DEMO.SVC": await demo("DEMO"),
  "CLIENT.SVC": await demo("CLIENT", { V_DEP: 1 }, { deps: [{ name: "DEMO", version: 2 }] }),
  "HOOKS.SVC": await demo("HOOKS", { V_HOOK: 1 }),
  "VECS.SVC": await demo("VECS", { V_VEC: 1, FLAGS: 3 }),
  "TP.SVC": await svc("TP", { ENTER: 1 }),
  "HOOK.COM": (await program("hook")).bytes,
  "EVLEFT.COM": (await program("evleft")).bytes,
  "EVWIPE.COM": (await program("evwipe")).bytes,
  "XCOPY.COM": (await program("copy")).bytes,
  "SUM.COM": (await program("sum")).bytes,
  // Larger than the cache's thirty 512-byte lines.
  "BIG.BIN": Uint8Array.from({ length: 24_000 }, (_, i) => (i * 7) & 0xff),
});

function card({ startup = true, lines, extra = {}, games = {} } = {}) {
  const image = new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img")));
  const a = volume(image, "A");
  for (const [n, b] of Object.entries({ ...EXTRA, ...extra })) a.write(n, b);
  // Files for the volume labelled GAMES, which CD A:GAMES puts on A:.
  if (Object.keys(games).length) {
    const g = volume(image, "GAMES");
    for (const [n, b] of Object.entries(games)) g.write(n, b);
  }
  if (lines) a.write("STARTUP.CMD", startupFile(...lines));
  // A file of one comment line: no startup line runs, so no shell.
  if (!startup) a.write("STARTUP.CMD", Buffer.from(";\r\n\x1a", "latin1"));
  return image;
}

const STACKS = { BDOS: ["STKBASE", "STKTOP"], BIOS: ["BSTKB", "BSTK"], CCP: ["CSTKBAS", "CSTKTOP"] };

/** Watch the three ROM stacks: lay() starts a reading, depth() gives the deepest write since. */
function watch(m) {
  const ranges = Object.entries(STACKS).map(([n, [lo, hi]]) => [n, m.sym(lo), m.sym(hi)]);
  let low = {};
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    // EXPAND 1's cache tables share these addresses once the workspace grows.
    if (!ldir && m.classicBankIn) for (const [n, b, t] of ranges) if (addr >= b && addr < t && addr < low[n]) low[n] = addr;
    write(addr, value);
  };
  m.lay = () => { low = Object.fromEntries(ranges.map(([n, , t]) => [n, t])); };
  m.depth = () => Object.fromEntries(ranges.map(([n, , t]) => [n, t - low[n]]));
  m.lay();
}

/** The four RAM BIOS targets a program hooks, the registry's head and restart slot 08h. */
const words = (m) => ({
  bios: [1, 2, 3, 4].map((i) => hex(word(m, m.sym("RAMBIOS") + 3 * i + 1))).join(" "),
  registry: hex(word(m, m.sym("REGHEAD"))),
  rst08: m.read(8) === 0xc3 ? `JP ${hex(word(m, 9))}` : hex(m.read(8)).slice(2),
  uc1: hex(word(m, m.sym("GLVEC"))),
});

/**
 * EVICT's record: the slots' lines as EXPAND 1 holds them. Read with the
 * classic bank in view, when the host keeps EXPAND 1's bytes in banks[0].
 */
const record = (m) => {
  const at = m.sym("EVREC") - 0x8000;
  const len = m.sym("EVSLEN");
  return Array.from({ length: m.sym("EVMAX") }, (_, i) => {
    const slot = Array.from((m.expand ? m.expand[1] : m.banks[0]).slice(at + len * i, at + len * (i + 1)));
    const end = slot.indexOf(0);
    return Buffer.from(slot.slice(0, end < 0 ? len : end)).toString("latin1");
  }).join("|");
};

const state = (m) => ({
  gen: m.read(m.sym("SVCGEN")),
  code: hex(word(m, m.sym("PRGCODE"))),
  top: hex(word(m, 6)),
  tpa: word(m, 6) - 0x100,
  owners: owners(m).map((o) => `${o.name}@${o.page.toString(16)}`).join(" "),
  shell: hex(word(m, m.sym("SHOWN"))),
  iobyte: m.read(3),
  conmod: m.read(m.sym("CONMOD")),
  evn: m.read(m.sym("EVN")),
});

/**
 * OS-owned words that point into FROM..TO: the shell hook, the console's
 * tables and vectors, the registry's head, the RAM BIOS table's targets
 * and the restart slots' jumps.
 */
function dangling(m, from, to) {
  const hit = [];
  const see = (name, v) => { if (v >= from && v < to) hit.push(`${name}=${hex(v)}`); };
  for (const n of ["SHOWN", "GLVEC", "PIVEC", "REGHEAD", "VPUTV", "VGETV", "VCLRV", "VRSTV", "VRDRV", "VWRRV", "VFNV"]) see(n, word(m, m.sym(n)));
  for (let i = 0; i < 17; i += 1) see(`BIOS${i}`, word(m, m.sym("RAMBIOS") + 3 * i + 1));
  for (let a = 8; a < 0x40; a += 8) if (m.read(a) === 0xc3) see(`RST${a.toString(16)}`, word(m, a + 1));
  see("SVCHEAD", m.read(m.sym("SVCHEAD")) << 8);
  return hit;
}

/**
 * Type LINE and run to the next ready prompt. The cycles in all, and from
 * the program's exit, the first warm boot after it started at 0100h, to
 * that prompt.
 */
function run(m, line, { re, max = 900_000_000, atStart, raw } = {}) {
  const start = m.cycles;
  let began = 0;
  let exit = 0;
  let during = null;
  const before = word(m, 6);
  const wboot = m.sym("WBOOTR");
  m.mark = m.output.length;
  m.type(raw ? line : `${line}\r`);
  const done = re ? () => m.waitingForInput() && re.test(m.text(m.mark)) : () => m.ready();
  m.runUntil(() => {
    if (m.pc === 0x100) {
      if (!began && atStart) atStart(m);
      // What the program finds: its top, the console, and no word left pointing at freed pages.
      during = { top: hex(word(m, 6)), iobyte: m.read(3), conmod: m.read(m.sym("CONMOD")), owners: owners(m).length, dangling: dangling(m, before & 0xff00, word(m, m.sym("STUBAD"))), evn: m.read(m.sym("EVN")), record: record(m) };
      began = m.cycles;
      exit = 0;
    } else if (m.pc === wboot && began && !exit) {
      exit = m.cycles;
      during.recordAtExit = record(m);
    }
    return done();
  }, max, `the prompt after ${line}`);
  return { text: m.text(m.mark), total: m.cycles - start, afterExit: exit ? m.cycles - exit : null, toStart: began ? began - start : null, during };
}

function scenario(name, opts, steps) {
  console.log(`\n== ${name}`);
  const { startup, lines, extra, games, pending, wipes, ...board } = opts;
  const image = card({ startup, lines, extra, games });
  const m = boot(image, board);
  // With pending set, the first write SAY.COM leaves behind is refused by the card until released.
  if (pending) m.fault = pendingSayFailure(m, image);
  watch(m);
  console.log("boot", JSON.stringify(state(m)));
  for (const step of steps) {
    if (typeof step === "function") {
      const said = step(m);
      if (said !== undefined) console.log("   ", typeof said === "string" ? said : JSON.stringify(said));
      continue;
    }
    const [line, opts2] = Array.isArray(step) ? step : [step, {}];
    m.lay();
    const r = run(m, line, opts2);
    console.log(JSON.stringify(line), JSON.stringify({ ...state(m), totalMs: ms(r.total), toStartMs: r.toStart && ms(r.toStart), afterExitMs: r.afterExit && ms(r.afterExit), stacks: m.depth() }));
    if (r.during) console.log("    at 0100h", JSON.stringify(r.during));
    console.log("   ", JSON.stringify(r.text));
  }
  console.log("violations", JSON.stringify(m.violations));
  // Writes to EXPAND 1 that the host's watch does not allow. A scenario
  // whose program makes them on purpose says so with wipes.
  console.log("expand 1 writes", JSON.stringify(m.expand1Writes.map((w) => hex(w.addr)).filter((a, i, all) => i === 0 || i === all.length - 1)), m.expand1Writes.length);
  if (wipes) for (const w of m.expand1Writes) if (EXPAND1_WRITES.includes(w)) EXPAND1_WRITES.splice(EXPAND1_WRITES.indexOf(w), 1);
  return m;
}

const MON3 = [/MON3> ?$/];
const ANY = { re: />$/ };
const screens = (m) => {
  const rows = (f) => { try { return f().filter((l) => l.length).slice(-4); } catch { return null; } };
  return { pico: rows(() => m.screen()), glcd: rows(() => m.glcdScreen()), matrixKeyboard: m.videoConsole() };
};
// Type ^W at the shell's prompt and read what it recalls, then ^X to drop it.
const recall = (m) => {
  m.mark = m.output.length;
  m.type("\x17");
  for (let i = 0; i < 600_000; i += 1) m.step();
  const shown = m.text(m.mark);
  m.type("\x18");
  for (let i = 0; i < 600_000; i += 1) m.step();
  return `^W recalls ${JSON.stringify(shown)}`;
};
const SCENARIOS = {
  serial: ["serial board: SHELL.SVC only", {}, ["EVBIG", "EVICT EVBIG", "EVICT EVBIG J", "EVICT EVBIG", "EVBIG"]],
  glcd: ["GLCD and matrix keyboard: SHELL.SVC and GLCD.SVC", { matrix: true }, ["EVBIG", "EVICT EVBIG", "EVBIG"]],
  pico: ["PICO9918 and matrix keyboard", { matrix: true, tms: true }, ["EVBIG", "EVICT EVBIG", "EVBIG"]],
  mon3: ["GLCD board with MON3.SVC installed too", { matrix: true }, [["MON3.SVC", { re: MON3[0] }], "EXIT", "EVBIG", "EVICT EVBIG", "EVBIG", ["MON3.SVC", { re: MON3[0] }], "EXIT"]],
  both: ["both displays, the GLCD chosen by CON UC1:", { matrix: true, tms: true }, ["CON UC1:", "EVBIG", "EVICT EVBIG", "EVBIG"]],
  cycles: ["five evictions in a row", { matrix: true }, ["EVICT EVBIG", "EVICT EVBIG", "EVICT EVBIG", "EVICT EVBIG", "EVICT EVBIG", "EVICT"]],
  notfound: ["a command that is not there", { matrix: true }, ["EVICT NOPE", "EVBIG"]],
  missing: ["a service's file gone before EVICT", { matrix: true }, ["ERA GLCD.SVC", "EVICT EVBIG", "EVBIG"]],
  missing2: ["the shell's file gone before EVICT", { matrix: true }, ["ERA SHELL.SVC", "EVICT EVBIG", "EVBIG"]],
  erased: ["the shell's file erased by the evicted command", {}, ["EVICT ERA SHELL.SVC", "DIR", "EVBIG"]],
  cd: ["A: on another volume", {}, ["CD A:GAMES", "EVICT EVBIG", "CD A:SYSTEM", "EVICT EVBIG"]],
  fixed: ["a service that is not removable, lowest", {}, ["FIXED.SVC", "EVICT EVBIG", "EVBIG"]],
  keep: ["a REMOVE that refuses, with a service below it", {}, ["KEEP.SVC", "S1.SVC", "EVICT EVBIG", "SERVICES"]],
  five: ["five services: one more than the record holds", {}, ["S1.SVC", "S2.SVC", "S3.SVC", "S4.SVC", "EVICT EVBIG", "SERVICES"]],
  four: ["four services: the record full", {}, ["S1.SVC", "S2.SVC", "S3.SVC", "EVICT EVBIG", "SERVICES"]],
  user: ["another user number, where the files are not", {}, ["USER 1", "EVICT A:EVBIG", "USER 0", "EVBIG"]],
  pieces: ["pieces after EVICT's on the line", {}, ["EVICT EVBIG !SAY", "SAY"]],
  bare: ["no shell: the bare prompt, two services", { startup: false }, ["S1.SVC", "S2.SVC", "EVBIG", "EVICT EVBIG", "EVBIG"]],
  cardout: ["the card taken out while the evicted program runs", {}, [["EVICT EVBIG", { atStart: (m) => m.swapCard(null), re: />$/ }]]],
  cardout2: ["the card taken out, the shell's blocks no longer in the cache", {}, ["COPY BAZA.COM B:X.COM", "COPY BAZA.RTL B:Y.RTL", ["EVICT EVBIG", { atStart: (m) => m.swapCard(null), re: /Bad Sector$/ }], ["", { re: />$/ }], ["EVBIG", { re: /Bad Sector$|>$/ }]]],
  code: ["the evicted command's return code after the services are back", {}, ["EVICT ONE", "EVICT F", "EVICT CHF"]],
  ctrlc: ["^C at the evicted program's line input", { matrix: true }, [["EVICT LINE", { re: /\n$/ }], ["\x03", { raw: true }], "EVBIG"]],
  bdos0: ["the evicted program ends by BDOS 0", { matrix: true }, ["EVICT B0", "EVBIG"]],
  reset: ["a reset while the services are out", { matrix: true }, [["EVICT EVBIG", { atStart: (m) => m.reset() }], "EVBIG"]],
  chain: ["the evicted program chains a line by function 47", {}, ["EVICT CH"]],
  ttychosen: ["GLCD board, the serial terminal chosen with CON TTY:", { matrix: true }, ["CON TTY:", ["EVICT EVBIG", ANY], screens]],
  bothkept: ["both displays, GLCD.SVC loaded, the PICO9918 kept", { matrix: true, tms: true }, [["GLCD.SVC", ANY], ["EVICT EVBIG", ANY], screens]],
  bothfail: ["both displays, the GLCD chosen, GLCD.SVC erased by the evicted command", { matrix: true, tms: true }, ["CON UC1:", ["EVICT ERA GLCD.SVC", ANY], screens]],
  glcdfail: ["GLCD board, GLCD.SVC erased by the evicted command", { matrix: true }, [["EVICT ERA GLCD.SVC", ANY], screens]],
  conchange: ["both displays, the GLCD chosen, the evicted command is CON TTY:", { matrix: true, tms: true }, ["CON UC1:", ["EVICT CON TTY:", ANY], screens]],
  apphook: ["a program that leaves RAM BIOS entries in its own image, plain", {}, [words, "HOOK J", words, "SAY"]],
  apphook2: ["the same program under EVICT", {}, [words, "EVICT HOOK J", words, "SAY"]],
  leftovers: ["a program that leaves a restart jump and a UC1 table in its image, and tries the shell hook", { matrix: true }, [words, ["EVICT EVLEFT", ANY], words, screens, "EVBIG"]],
  held: ["services that hold a registry record, a dependency, a RAM BIOS entry and a restart slot", { startup: false }, ["DEMO.SVC", "CLIENT.SVC", "HOOKS.SVC", "VECS.SVC", words, "EVICT EVBIG", words, "EVICT", words]],
  whole: ["a service that is not removable, installed before the shell: nothing is removed", { lines: ["FIXED.SVC"] }, ["SHELL.SVC", "DIR B:", recall, "EVICT EVBIG !SAY", recall]],
  rename: ["a service installed from a renamed copy, M2.SVC", {}, ["COPY MON3.SVC M2.SVC", ["M2.SVC", { re: MON3[0] }], "EXIT", "SERVICES", "EVICT EVBIG", "SERVICES", ["M2.SVC", { re: MON3[0] }], "EXIT", "SERVICES"]],
  otherdrive: ["a service installed from B:Q.SVC, then another file of that name put on A:", {}, ["COPY S1.SVC B:Q.SVC", "B:Q.SVC", "EVICT EVBIG", "COPY S2.SVC Q.SVC", "EVICT EVBIG", "SERVICES"]],
  svccmd: ["the evicted command would install a service", { matrix: true }, ["DEMO.SVC", "EVICT DEMO.SVC", "EVICT S1.SVC", ["EVICT CON UC1:", ANY], "SERVICES", screens]],
  nested: ["EVICT inside EVICT's command, both displays, the GLCD chosen", { matrix: true, tms: true }, ["CON UC1:", "EVICT EVICT EVBIG", screens]],
  origin: ["a service whose entry takes any origin as a call to start", {}, ["TP.SVC", "EVICT EVBIG"]],
  badcount: ["a count in the record that cannot be one", {}, [(m) => { m.write(m.sym("EVN"), 9); return "EVN set to 9 by the probe"; }, ["", ANY], "EVBIG"]],
  cachework: ["the record while the evicted program fills and empties the cache", { matrix: true }, [["MON3.SVC", { re: MON3[0] }], "EXIT", "EVICT XCOPY BIG.BIN NEW.BIN", "EVICT SUM NEW.BIN", "EVICT ERA NEW.BIN", "SERVICES"]],
  wipez: ["a program overwrites the record in EXPAND 1 with zeros", { wipes: true }, ["S1.SVC", ["EVICT EVWIPE Z", ANY], ["SHELL.SVC", ANY], "SERVICES", "EVICT EVBIG"]],
  wipef: ["the same with FFh", { wipes: true }, ["S1.SVC", ["EVICT EVWIPE F", ANY], ["SHELL.SVC", ANY], "SERVICES", "EVICT EVBIG"]],
  wipex: ["the same with the letter X", { wipes: true }, ["S1.SVC", ["EVICT EVWIPE X", ANY], ["SHELL.SVC", ANY], "SERVICES", "EVICT EVBIG"]],
  wipe3: ["the same with three services out, on the GLCD board", { wipes: true, matrix: true }, [["MON3.SVC", { re: MON3[0] }], "EXIT", ["EVICT EVWIPE X", ANY], screens]],
  volume: ["the evicted command puts another volume on A:, with another Q.SVC on it", { extra: { "Q.SVC": EXTRA["S1.SVC"] }, games: { "Q.SVC": EXTRA["DEMO.SVC"] } }, ["Q.SVC", "SERVICES", words, ["EVICT CD A:GAMES", ANY], words, ["DIR", ANY], ["CD A:SYSTEM", ANY], ["SHELL.SVC", ANY], "SERVICES"]],
  pending: ["a pending write the card refuses at the evicted program's exit", { pending: true, extra: pendingSayFiles() }, [["EVICT SAY", ANY], (m) => { m.fault.release(); return "the card accepts again"; }, ["", ANY], (m) => { m.fault.assertRecovered(); return "written once"; }]],
  pending3: ["the same with GLCD.SVC and MON3.SVC to bring back too", { pending: true, matrix: true, extra: pendingSayFiles() }, [["MON3.SVC", { re: MON3[0] }], "EXIT", ["EVICT SAY", ANY], (m) => { m.fault.release(); return "the card accepts again"; }, ["", ANY], (m) => { m.fault.assertRecovered(); return "written once"; }]],
};
const which = process.argv.slice(2);
for (const [key, [name, opts, steps]] of Object.entries(SCENARIOS)) if (!which.length || which.includes(key)) scenario(name, opts, steps);
