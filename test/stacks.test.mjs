// Stack high-water marks from reset, under the heaviest workloads in the
// suite, on the serial console, the PICO9918 and the GLCD with the matrix
// keyboard, on the serial console with B: written behind, on the diagnostic
// console without a card, serial and on a PICO9918 board, and on the CCP's two deepest paths: CON UC1 loading
// GLCD.SVC on a PICO9918 and matrix board, whose console is the ROM's, and on a GLCD board. Every memory write
// is watched; the lowest address written in each stack (other than by an
// LDIR, which clears the workspace) gives its depth. A keypad NMI is pressed
// whenever SP reaches a new low in a stack while 0066h holds RETN. TEC-OS
// writes no handler there, so none is taken; a ROM with one would have
// each depth include the NMI's frame. Emulator evidence; the figures go to
// build/stack-census.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import { createContainer } from "../tools/lib/container.mjs";
import { GLCD_SVC, ROOT, TEST_CLOCK, program, romFor, service, startupFile, volume, withDisplay } from "./lib/fixtures.mjs";

const PROGRAMS = ["probe", "term", "insdel", "region", "flip", "vidmode", "dirty"];
const COMMANDS = [
  "PROBE\r",
  "TERM\r",
  "TERM S\r",
  "INSDEL\r",
  "REGION\r",
  "FLIP\r",
  "VIDMODE\r",
  "COPY DATA.BIN B:DATA.CPY\r",
  "DIR B:\r",
  "SAVE 4 S.COM\r",
  "TYPE S.COM\r",
  "ERA S.COM\r",
  "TYPE LINES.TXT\r",
  "ABC\b\b\x15XYZ\x12\x05Q\r", // the line editor: backspace, ^U, ^R, ^E
  "\x03",
  "SAVE 1 C:X.COM\r", // a BDOS error on the read-only C:, then a key
  "DIR E:\r",
  "E:\r",
];

/** Watch the three resident stacks of `m`, pressing an NMI at each new depth. */
function watch(m) {
  const s = (n) => m.sym(n);
  const guardHits = [];
  const stacks = { bdos: [s("STKBASE"), s("STKTOP")], ccp: [s("CSTKBAS"), s("CSTKTOP")], bios: [s("BSTKB"), s("BSTK")] };
  const low = Object.fromEntries(Object.entries(stacks).map(([k, [, top]]) => [k, top]));
  const lowSp = { ...low };
  const [guard, guardEnd] = [s("STKGUARD"), s("STKGUEND")];
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir) for (const [k, [b, t]] of Object.entries(stacks)) if (addr >= b && addr < t && addr < low[k]) low[k] = addr;
    if (!ldir && addr >= guard && addr < guardEnd && value !== 0xa5) guardHits.push(addr);
    write(addr, value);
  };
  const step = m.step.bind(m);
  m.step = () => {
    const r = step();
    if (m.pc !== 0x66 && m.pc !== 0x67 && m.read(0x66) === 0xed && m.read(0x67) === 0x45) {
      const sp = m.cpu.cpu.sp & 0xffff;
      for (const [k, [b, t]] of Object.entries(stacks)) {
        if (sp >= b && sp <= t && sp < lowSp[k]) {
          lowSp[k] = sp;
          m.tec1g.applyKey(0x00);
        }
      }
    }
    return r;
  };
  // The pattern is set at warm boot, which the diagnostic console never reaches.
  return ({ pattern = true } = {}) => {
    assert.deepEqual(guardHits, [], "a write to STKGUARD");
    if (pattern) assert.deepEqual(Array.from({ length: guardEnd - guard }, (_, i) => m.read(guard + i)), new Array(guardEnd - guard).fill(0xa5), "STKGUARD holds its pattern");
    return Object.fromEntries(Object.entries(stacks).map(([k, [b, t]]) => [k, { reserved: t - b, deepest: t - low[k] }]));
  };
}

/** Type a line and run to the prompt, answering a [more] or an error's key. */
function run(m, line) {
  m.mark = m.output.length;
  m.type(line);
  const re = /\r\n[A-P]>$/;
  // Not the prompt before a chained line's next piece (KS32).
  const prompt = { test: (t) => re.test(t) && m.read(m.sym("CHPOS")) === 0 };
  let seen = -1;
  for (let i = 0; i < 400; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(m.mark))), 30_000_000, line);
    const t = m.text(m.mark);
    if (prompt.test(t) && m.waitingForInput()) return;
    if (m.output.length === seen && m.waitingForInput()) m.type(/\[more\]$/.test(t) ? " " : "\r");
    seen = m.output.length;
  }
  throw new Error(`no prompt after ${JSON.stringify(line)}: ${m.text(m.mark)}`);
}

// With B: written behind: its lines written inside BIOS WRITE at each
// directory write, and by warm boot after DIRTY leaves a file unclosed.
const WRITE_BEHIND = ["SAVE 4 B:S.COM\r", "COPY DATA.BIN B:DATA.CP2\r", "DIRTY\r"];

async function consoleRun(opts, { wb = false } = {}) {
  const { rom, symbols } = romFor();
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: wb },
    { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
  ]);
  const a = volume(image, "A");
  for (const n of PROGRAMS) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("DATA.BIN", new Uint8Array(20000).map((_, i) => i & 0xff));
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1}\r\n`).join("") + "\x1a", "latin1"));
  withDisplay(image, { tms: false, matrix: false, ...opts });
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, highCapacity: true, tms: false, matrix: false, ...opts });
  const depths = watch(m);
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  const conmod = m.read(m.sym("CONMOD"));
  for (const line of [...COMMANDS, ...(wb ? WRITE_BEHIND : [])]) run(m, line);
  assert.deepEqual(m.violations, []);
  return { ...depths(), conmod };
}

/** A line such as CON UC1 loading GLCD.SVC, on a card with the display's files. */
async function deepPaths(lines, opts = { tms: true, matrix: true }, { files = {} } = {}) {
  const { rom, symbols } = romFor();
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }]);
  const a = volume(image, "A");
  a.write("GLCD.SVC", GLCD_SVC);
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, highCapacity: true, tms: false, matrix: false, ...opts });
  const depths = watch(m);
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  for (const line of lines) run(m, line);
  assert.deepEqual(m.violations, []);
  const row3 = String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd();
  return { ...depths(), conmod: m.read(m.sym("CONMOD")), row3 };
}

/**
 * Chained lines (KS32): pieces split at !, a : piece after a failure, a
 * BDOS error and ^C that drop the rest, and function 47 from a program, its
 * line holding ! and :.
 */
async function chainRun() {
  const { rom, symbols } = romFor();
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
  ]);
  const a = volume(image, "A");
  for (const n of ["probe", "line"]) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("CHAIN.COM", Uint8Array.from([...(await program("chain")).bytes, ...Buffer.from("PROBE!DIR B:!:DIR\0", "latin1")]));
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1}\r\n`).join("") + "\x1a", "latin1"));
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, highCapacity: true });
  const depths = watch(m);
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  for (const line of ["PROBE!DIR!USER 0\r", "ERA NOSUCH.X!:DIR!DIR\r", "CHAIN!PROBE\r", "SAVE 1 C:X.COM!PROBE\r", "LINE!PROBE\r", "\x03"]) run(m, line);
  assert.deepEqual(m.violations, []);
  assert.equal(m.read(m.sym("CHPOS")), 0);
  return depths();
}

/** A recognised reset with a remapped A:, through RSLCAP and RESEL, watched from the reset on. */
async function resetRun() {
  const { rom, symbols } = romFor();
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "ALT", mount: "-" },
  ]);
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, highCapacity: true });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  [0x06, 0, 0x0e, 9, 0x1e, 2, 0xcd, m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8, 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
  const { pc, sp } = m.cpu.cpu;
  Object.assign(m.cpu.cpu, { pc: 0x60, sp: 0x100 });
  m.runUntil(() => m.pc === 0x69, 80_000_000, "the mount");
  Object.assign(m.cpu.cpu, { pc, sp });
  const depths = watch(m);
  const from = m.output.length;
  m.reset();
  m.expect(/A>$/, { from, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the prompt after the reset");
  assert.equal(m.read(m.sym("DRVIDX")), 3, "the reset kept the selection");
  return depths();
}

/**
 * The diagnostic console without a card: H, R to retry, H. On a PICO9918 and
 * matrix board, the ROM's console, with KEYS enough H presses that it scrolls.
 */
function diagnosticRun(opts = {}, keys = ["H", "R", "H"]) {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, clock: TEST_CLOCK, ...opts });
  const depths = watch(m);
  m.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  for (const key of keys) {
    m.mark = m.output.length;
    if (opts.matrix) m.typeMatrix(key);
    else m.type(key);
    m.expect(/R retry> $/, { maxCycles: 200_000_000 });
  }
  return { ...depths({ pattern: false }), lines: m.text().split("\r\n").length, conmod: m.read(m.sym("CONMOD")) };
}

test("each stack keeps a quarter of its reservation free, and every STKGUARD byte survives the deepest built-in and error paths", { timeout: 1_800_000 }, async () => {
  const runs = {
    serial: await consoleRun({}),
    pico9918: await consoleRun({ tms: true, matrix: true }),
    glcd: await consoleRun({ matrix: true }),
    writeBehind: await consoleRun({}, { wb: true }),
    diagnostics: diagnosticRun(),
    diagnosticsPico: diagnosticRun({ tms: true, matrix: true }, [..."HHHHHHHHHHHHHHHHHHHHHHHHHHHHHH", "R", "H"]),
    conUc1: await deepPaths(["CON UC1\r"]),
    conUc1Glcd: await deepPaths(["CON UC1\r"], { matrix: true }),
    picoRom: await deepPaths(["DIR\r", "CON PICO 40\r", "DIR\r", "CON PICO 32\r", "DIR\r", "CON PICO 80\r"]),
    recognisedReset: await resetRun(),
    chained: await chainRun(),
    serialPlain: await deepPaths(["TYPE STARTUP.CMD\r", "DIR\r", "CON\r"], {}),
    resident: await deepPaths(["RES.SVC\r", "TYPE STARTUP.CMD\r", "DIR\r", "CON\r"], {}, { files: { "RES.SVC": await service("res") } }),
  };
  assert.equal(runs.pico9918.conmod, 1, "the pico9918 run is on CRT:");
  assert.equal(runs.diagnosticsPico.conmod, 1, "the PICO9918 DIAG run is on CRT:");
  assert.ok(runs.diagnosticsPico.lines > 30, "and scrolls its 24 rows");
  assert.equal(runs.glcd.conmod, 3, "the glcd run is on UC1:");
  assert.equal(runs.conUc1.conmod, 3, "both displays, CON UC1 took the GLCD");
  for (const [k, more] of [["bdos", 2], ["bios", 0], ["ccp", 0]]) {
    assert.ok(runs.resident[k].deepest <= runs.serialPlain[k].deepest + more, `RES.SVC declares ${more} on the ${k} stack`);
  }
  const census = Object.fromEntries(
    ["bdos", "ccp", "bios"].map((k) => [k, { reserved: runs.serial[k].reserved, deepest: Math.max(...Object.values(runs).map((r) => r[k].deepest)) }]),
  );
  census.runs = runs;
  census.workload =
    "From reset: PROBE, TERM, TERM S, INSDEL, REGION, FLIP, VIDMODE, COPY of 20000 bytes A: to B:, DIR, SAVE, TYPE, ERA, a paged TYPE, the line editor, ^C, a BDOS error on a read-only drive, a select error; on the serial console, the PICO9918 and the GLCD; on the serial console with B: written behind, adding a SAVE and a COPY to B: and a file left unclosed for warm boot to write; the diagnostic console without a card, on serial and on a PICO9918 board, scrolling; CON UC1 loading GLCD.SVC on a PICO9918 and matrix board, and on a GLCD board; the ROM's PICO9918 console through CON PICO 40, 32 and 80; a recognised reset with a remapped A:; and chained lines, typed and from function 47, with a : piece after a failure, a BDOS error and ^C. An NMI at each new depth where 0066h holds RETN.";
  mkdirSync(resolve(ROOT, "build"), { recursive: true });
  writeFileSync(resolve(ROOT, "build/stack-census.json"), JSON.stringify(census, null, 2) + "\n");
  console.log(JSON.stringify(census));
  for (const k of ["bdos", "ccp", "bios"]) {
    const { reserved, deepest } = census[k];
    assert.ok((reserved - deepest) * 4 >= reserved, `${k} used ${deepest} of ${reserved}, less than a quarter left`);
  }
  // A service's limit is counted from the base, the deepest use with no resident, so the base and
  // the limit together keep a quarter of each stack free (KE-173). SVCLIM is BDOS, BIOS, CCP.
  const { rom, symbols } = romFor();
  const lim = Object.fromEntries(["bdos", "bios", "ccp"].map((k, i) => [k, rom[symbols.get("SVCLIM") - 0xc000 + i]]));
  const bare = ["serial", "pico9918", "writeBehind", "diagnostics", "diagnosticsPico", "picoRom", "recognisedReset", "chained", "serialPlain"];
  for (const k of ["bdos", "ccp", "bios"]) {
    const base = Math.max(...bare.map((r) => runs[r][k].deepest));
    const { reserved } = census[k];
    assert.ok((base + lim[k]) * 4 <= reserved * 3, `${k}: the base ${base} and the services' limit ${lim[k]} take more than three quarters of ${reserved}`);
  }
  // docs/services.md's stack table states these figures: it must say what this census measures.
  const doc = readFileSync(resolve(ROOT, "docs/services.md"), "utf8");
  for (const [k, name] of [["bdos", "BDOS"], ["bios", "BIOS"], ["ccp", "CCP"]]) {
    const base = Math.max(...bare.map((r) => runs[r][k].deepest));
    const row = `| ${name} | ${census[k].reserved} | ${base} | ${census[k].deepest} | ${lim[k]} |`;
    assert.ok(doc.includes(row), `docs/services.md's stack table has no row ${row}`);
  }
});

test("RES.SVC declares the word MYCO pushes on the BDOS's stack", async () => {
  const bytes = await service("res");
  assert.deepEqual([...bytes.subarray(12, 15)], [2, 0, 0]);
});
