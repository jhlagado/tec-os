// Prototype probe for the service-evict model: the starter card's services
// evicted for EVBIG.COM, which overwrites the whole TPA, and brought back
// at the prompt. Prints figures; asserts nothing. node tools/evict-probe.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, program, volume } from "../test/lib/fixtures.mjs";
import { CODES, SAY, chain, execSvc, owners, word } from "../test/lib/shell.mjs";

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
  "CH.COM": chain("EVBIG !SAY"),
  "KEEP.SVC": await svc("KEEP", { V_KEEP: 1 }),
  "FIXED.SVC": await svc("FIXED", { FLAGS: 0 }),
};
for (const n of ["S1", "S2", "S3", "S4", "S5"]) EXTRA[`${n}.SVC`] = await svc(n);

function card({ startup = true } = {}) {
  const image = new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img")));
  const a = volume(image, "A");
  for (const [n, b] of Object.entries(EXTRA)) a.write(n, b);
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
function run(m, line, { re, max = 900_000_000, atStart } = {}) {
  const start = m.cycles;
  let began = 0;
  let exit = 0;
  let during = null;
  const before = word(m, 6);
  const wboot = m.sym("WBOOTR");
  m.mark = m.output.length;
  m.type(`${line}\r`);
  const done = re ? () => m.waitingForInput() && re.test(m.text(m.mark)) : () => m.ready();
  m.runUntil(() => {
    if (m.pc === 0x100) {
      if (!began && atStart) atStart(m);
      // What the program finds: its top, the console, and no word left pointing at freed pages.
      during = { top: hex(word(m, 6)), iobyte: m.read(3), conmod: m.read(m.sym("CONMOD")), owners: owners(m).length, dangling: dangling(m, before & 0xff00, word(m, m.sym("STUBAD"))) };
      began = m.cycles;
      exit = 0;
    } else if (m.pc === wboot && began && !exit) exit = m.cycles;
    return done();
  }, max, `the prompt after ${line}`);
  return { text: m.text(m.mark), total: m.cycles - start, afterExit: exit ? m.cycles - exit : null, toStart: began ? began - start : null, during };
}

function scenario(name, opts, steps) {
  console.log(`\n== ${name}`);
  const { startup, ...board } = opts;
  const m = boot(card({ startup }), board);
  watch(m);
  console.log("boot", JSON.stringify(state(m)));
  for (const step of steps) {
    const [line, opts2] = Array.isArray(step) ? step : [step, {}];
    m.lay();
    const r = run(m, line, opts2);
    console.log(JSON.stringify(line), JSON.stringify({ ...state(m), totalMs: ms(r.total), toStartMs: r.toStart && ms(r.toStart), afterExitMs: r.afterExit && ms(r.afterExit), stacks: m.depth() }));
    if (r.during) console.log("    at 0100h", JSON.stringify(r.during));
    console.log("   ", JSON.stringify(r.text));
  }
  console.log("violations", JSON.stringify(m.violations));
  return m;
}

const MON3 = [/MON3> ?$/];
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
  chain: ["the evicted program chains a line by function 47", {}, ["EVICT CH"]],
};
const which = process.argv.slice(2);
for (const [key, [name, opts, steps]] of Object.entries(SCENARIOS)) if (!which.length || which.includes(key)) scenario(name, opts, steps);
