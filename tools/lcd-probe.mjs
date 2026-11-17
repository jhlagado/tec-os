#!/usr/bin/env node
// Probes behind the LCD console model's figures that no test holds yet: the
// refusals, the time of a scroll and of a character, a panel that never
// answers, INFO through the table, the diagnostic console's stack, a MON-3
// program that writes the LCD under MON3.SVC, and, with "stacks", the stack
// census's console workload on each console (about five minutes).
// Emulator evidence. Run after npm run build.
//
//   node tools/lcd-probe.mjs          the short probes
//   node tools/lcd-probe.mjs stacks   the stack census workload as well

import { Machine } from "../test/lib/machine.mjs";
import { ABI, GLCD_SVC, ROOT, TEST_CLOCK, program, romFor, standardCard, startupFile, volume, withShell } from "../test/lib/fixtures.mjs";
import { run, watch } from "../test/lib/census.mjs";
import { MON3, card, hello3, line, mon3Svc, runFor, runTo } from "../test/lib/mon3.mjs";
import { createContainer } from "../tools/lib/container.mjs";
import { makeSvc } from "./lib/svc.mjs";
import { resolve } from "node:path";

const LCD_SVC = (await makeSvc(resolve(ROOT, "drivers/lcd.asm"), { work: resolve(ROOT, "build/svc") })).file;
const { rom, symbols } = romFor();

function start({ files = {}, card = true, ...opts } = {}) {
  const image = card ? standardCard() : undefined;
  if (image) for (const [n, b] of Object.entries(files)) volume(image, "A").write(n, b);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, glcd: false, ...opts });
  if (!card) return m;
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  return m;
}
const rows = (m) => m.lcdScreen().map((l) => l.trimEnd());
const geo = (m) => `${m.read(m.sym("VWID"))}x${m.read(m.sym("VHGT"))} CONMOD ${m.read(m.sym("CONMOD"))} IOBYTE ${m.read(3) & 3} (0006h)=${(m.read(6) | (m.read(7) << 8)).toString(16)}`;
const text = (lines) => Buffer.from(lines.join("\r\n") + "\r\n\x1a", "latin1");

let m = start({});
console.log("1 no keyboard, CON LCD:", JSON.stringify(m.command("CON LCD")), geo(m));

m = start({ matrix: true });
console.log("2a LCD console, CON GLCD with no file:", JSON.stringify(m.command("CON GLCD")), geo(m), JSON.stringify(rows(m)), "CDWRD", (m.read(m.sym("CONDEV")) & 0x80) !== 0);
m = start({ matrix: true, files: { "GLCD.SVC": GLCD_SVC } });
console.log("2b LCD console, CON GLCD with the file and no GLCD:", JSON.stringify(m.command("CON GLCD")), geo(m), JSON.stringify(rows(m)));
console.log("2c then CON UC1:", JSON.stringify(m.command("CON UC1")), geo(m));

{
  const image = standardCard();
  const a = volume(image, "A");
  a.write("GLCD.SVC", GLCD_SVC);
  a.write("LCD.SVC", LCD_SVC);
  const g = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, matrix: true });
  g.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  g.runUntil(() => g.ready(), 200_000_000, "prompt");
  g.command("CON GLCD");
  const before = geo(g);
  console.log("3 GLCD on UC1, LCD.SVC typed:", JSON.stringify(g.command("LCD.SVC")), before, "->", geo(g));
}
m = start({ files: { "LCD.SVC": LCD_SVC } });
console.log("4a no keyboard, LCD.SVC typed:", JSON.stringify(m.command("LCD.SVC")), geo(m));
m = start({ files: { "LCD.SVC": LCD_SVC, "STARTUP.CMD": startupFile("LCD.SVC") } });
console.log("4b no keyboard, LCD.SVC in STARTUP.CMD:", JSON.stringify(m.text(0).slice(-60)), geo(m));
m = start({ matrix: true, tms: true, files: { "LCD.SVC": LCD_SVC, "STARTUP.CMD": startupFile("LCD.SVC") } });
console.log("4c PICO board, LCD.SVC in STARTUP.CMD:", JSON.stringify(m.text(0).slice(-40)), geo(m));

// 5 timing: one scroll and one character, by the driver's routines' time.
m = start({ matrix: true, files: { "S.TXT": text(["row one", "row two", "row three", "row four", "row five", "row six"]) } });
// Time VTDLR (the scroll) from its entry to the return to its caller.
{
  const vtdlr = m.sym("VTDLR"), vput = m.sym("LCVPUT");
  const scroll = [], put = [];
  let s0 = -1, ssp = 0, p0 = -1, psp = 0;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc, sp = m.cpu.cpu.sp;
    if (s0 < 0 && pc === vtdlr) { s0 = m.cycles; ssp = sp; }
    if (p0 < 0 && pc === vput && m.cpu.cpu.a !== 0x80) { p0 = m.cycles; psp = sp; }
    const r = step();
    if (s0 >= 0 && m.cpu.cpu.sp === ssp + 2 && m.pc !== vtdlr) { scroll.push(m.cycles - s0); s0 = -1; }
    if (p0 >= 0 && m.cpu.cpu.sp === psp + 2) { put.push(m.cycles - p0); p0 = -1; }
    return r;
  };
  m.command("TYPE S.TXT");
  const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  console.log(`5 scroll: ${scroll.length} scrolls, ${Math.min(...scroll)}-${Math.max(...scroll)} T, mean ${avg(scroll)} (${(avg(scroll) / 4000).toFixed(1)} ms at 4 MHz); put: ${put.length} puts, ${Math.min(...put)}-${Math.max(...put)} T, mean ${avg(put)}`);
}

m = start({ matrix: true, lcd: false, files: { "S.TXT": text(["row one", "row two", "row three", "row four", "row five"]) } });
let from = m.cycles;
m.command("TYPE S.TXT");
console.log("6 a panel that never answers: TYPE of five lines", m.cycles - from, "T,", ((m.cycles - from) / 4e6).toFixed(2), "s;", geo(m));
m = start({ matrix: true, files: { "S.TXT": text(["row one", "row two", "row three", "row four", "row five"]) } });
from = m.cycles;
m.command("TYPE S.TXT");
console.log("6b the same with the panel:", m.cycles - from, "T");

// 7 INFO through the table: L and H kept at 0130h.
const INFO = Uint8Array.from([0x0e, ABI.TNINFO, 0xcd, ABI.ABICALL & 0xff, ABI.ABICALL >> 8, 0x22, 0x30, 0x01, 0x78, 0x32, 0x32, 0x01, 0xc9]);
m = start({ matrix: true, files: { "INFO.COM": INFO } });
m.command("INFO");
console.log("7 INFO: L", m.read(0x130), "H", m.read(0x131), "B", m.read(0x132).toString(16));

// 8 the diagnostic console on the LCD: stack depth.
{
  const d = new Machine({ rom, symbols, clock: TEST_CLOCK, matrix: true, glcd: false });
  const depths = watch(d);
  d.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  for (const key of ["H", "R", "H", "H", "H", "H", "H", "H"]) {
    d.mark = d.output.length;
    d.typeMatrix(key);
    d.expect(/R retry> $/, { maxCycles: 200_000_000 });
  }
  const r = depths({ pattern: false });
  console.log("8 diagnostic console on the LCD: bdos", r.bdos.deepest, "bios", r.bios.deepest, "ccp", r.ccp.deepest, JSON.stringify(rows(d)));
  const s = new Machine({ rom, symbols, clock: TEST_CLOCK, glcd: false });
  const ds = watch(s);
  s.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  for (const key of ["H", "R", "H"]) { s.mark = s.output.length; s.type(key); s.expect(/R retry> $/, { maxCycles: 200_000_000 }); }
  const rs = ds({ pattern: false });
  console.log("8b diagnostic console on serial: bdos", rs.bdos.deepest, "bios", rs.bios.deepest);
}

// 9 a MON-3 program that writes the LCD, under MON3.SVC, with the LCD as the console.
const mimage = card({ "MON3.SVC": (await mon3Svc()).file, "HELLO3.BIN": await hello3() });
m = new Machine({ rom, symbols, sdImage: mimage, clock: TEST_CLOCK, matrix: true, glcd: false });
m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
m.runUntil(() => m.ready(), 200_000_000, "prompt");
const shown = () => JSON.stringify(rows(m));
console.log("9 boot", shown(), geo(m));
console.log("9 MON3.SVC ->", line(m, "MON3.SVC").mon3, shown());
console.log("9 LOAD ->", line(m, "LOAD HELLO3.BIN").mon3, shown());
m.mark = m.output.length;
m.type("GO\r");
runTo(m, 0x4000, 20_000_000);
runFor(m, 3_000_000);
console.log("9 running", shown());
m.tec1g.applyMatrixKey(1, 4, true); // Esc, which MON-3 takes as AD
const mfrom = m.output.length;
m.runUntil(() => m.pc === 0x0049, 10_000_000, "the return after AD");
runFor(m, 2_000_000);
m.tec1g.applyMatrixKey(1, 4, false);
m.runUntil(() => MON3.test(m.text(mfrom)), 10_000_000, "MON3> after AD");
m.runUntil(() => m.waitingForInput(), 10_000_000, "the MON3> read");
console.log("9 back at MON3>", shown(), geo(m));
console.log("9 EXIT ->", !line(m, "EXIT").mon3, shown(), geo(m));
console.log("9 DIR:", JSON.stringify(m.command("DIR").slice(0, 60)), shown());
console.log("9 violations", m.violations.length);

// 10 stack depths under the stack census's console workload, by console.
const PROGRAMS = ["probe", "term", "insdel", "region", "flip", "vidmode", "dirty"];
const COMMANDS = ["PROBE\r", "TERM\r", "TERM S\r", "INSDEL\r", "REGION\r", "FLIP\r", "VIDMODE\r", "COPY DATA.BIN B:DATA.CPY\r", "DIR B:\r", "SAVE 4 S.COM\r", "TYPE S.COM\r", "ERA S.COM\r", "TYPE LINES.TXT\r", "ABC\b\b\x15XYZ\x12\x05Q\r", "\x03", "SAVE 1 C:X.COM\r", "DIR E:\r", "E:\r"];
async function consoleRun(opts, lines = []) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
  ]);
  const a = volume(image, "A");
  for (const n of PROGRAMS) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("DATA.BIN", new Uint8Array(20000).map((_, i) => i & 0xff));
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1}\r\n`).join("") + "\x1a", "latin1"));
  if (lines.includes("LCD.SVC")) a.write("LCD.SVC", LCD_SVC);
  withShell(image, ...lines);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, highCapacity: true, tms: false, matrix: false, glcd: false, ...opts });
  const depths = watch(m);
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  const conmod = m.read(m.sym("CONMOD"));
  for (const line of COMMANDS) run(m, line);
  if (m.violations.length) throw new Error("violations");
  return { ...depths(), conmod, geom: `${m.read(m.sym("VWID"))}x${m.read(m.sym("VHGT"))}`, entry: (m.read(6) | (m.read(7) << 8)).toString(16) };
}
const fmt = (r) => `bdos ${r.bdos.deepest} bios ${r.bios.deepest} ccp ${r.ccp.deepest} worker ${r.worker.deepest} conmod ${r.conmod} ${r.geom} (0006h)=${r.entry}`;
if (process.argv[2] === "stacks") {
  console.log("10 serial      ", fmt(await consoleRun({})));
  console.log("10 pico        ", fmt(await consoleRun({ tms: true, matrix: true })));
  console.log("10 lcd (ROM)   ", fmt(await consoleRun({ matrix: true })));
  console.log("10 LCD.SVC 40x4", fmt(await consoleRun({ matrix: true, lcd40: true }, ["LCD.SVC"])));
}
