// Choice 1: GLCD as a resident. The driver of drivers/glcd.asm, rebuilt as a
// kind-1 module (glcd-resident.asm), runs on the product's ROM with one byte
// changed: CONSW's LD HL,DRVVEC becomes LD HL,(GLVEC), the word the
// resident's INIT sets, which stands for the entry the brief adds. The same
// workload runs on the driver and on the resident; the model compares the
// ST7920's graphics RAM after each command, (0006h), and the depth of every
// CONOUT call on the stack it was made on.

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HERE, WORK, fixtures, machine, prlLib, assemble, symbolOf, w } from "./lib.mjs";
import { createHash } from "node:crypto";

const { romFor, standardCard, volume, program, TEST_CLOCK, GLCD_PRL } = fixtures;
const { Machine } = machine;

// The stacks census's workload (test/stacks.test.mjs), then CONOUT.COM.
const PROGRAMS = ["probe", "term", "insdel", "region", "flip", "vidmode"];
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
  "ABC\b\b\x15XYZ\x12\x05Q\r",
  "\x03",
  "SAVE 1 C:X.COM\r",
  "DIR E:\r",
  "E:\r",
  "A:\r",
  "CONOUT\r",
];

/** GLVEC: the two bytes DRVPG and DRVNP, which drivers no longer need. */
const glvecOf = (symbols) => symbolOf(symbols, "DRVPG");

export async function residentPrl(symbols, { removeIsNop = false, rowCols = 0 } = {}) {
  const S = (n) => symbolOf(symbols, n);
  const hex = (v) => `$${v.toString(16).toUpperCase().padStart(4, "0")}`;
  const inc = [
    `GLVEC   EQU     ${hex(glvecOf(symbols))}`,
    ...["LINEBUF", "CONDEV", "TMSVEC", "VIDSET", "SERCON"].map((n) => `${n.padEnd(8)}EQU     ${hex(S(n))}`),
  ].join("\n");
  const name = removeIsNop ? "glcd-resident-nop" : rowCols ? `glcd-resident-cols${rowCols}` : "glcd-resident";
  let text = readFileSync(resolve(HERE, "glcd-resident.asm"), "utf8").replace("; ROM EQUS", inc);
  if (removeIsNop) text = text.replace(/^REMOVE: LD      HL,CONDEV.*$/m, "REMOVE: RET\n        LD      HL,CONDEV");
  // A fault for the screens gate: the row moves copy too few columns.
  if (rowCols) text = text.replaceAll("        LD      DE,(LBUF)\n        LD      BC,GLCOLS", `        LD      DE,(LBUF)\n        LD      BC,${rowCols}`);
  const src = resolve(WORK, `${name}.asm`);
  writeFileSync(src, text);
  return prlLib.makePrl(src, WORK);
}

/** The ROM with CONSW's LD HL,DRVVEC (21h nn nn) made LD HL,(GLVEC) (2Ah nn nn). */
export function patchedRom(rom, symbols) {
  const S = (n) => symbolOf(symbols, n);
  const out = Buffer.from(rom);
  const v = S("DRVVEC");
  let at = -1;
  for (let a = S("CONSW"); a < S("CONSWV"); a += 1) {
    const o = a - 0xc000;
    if (out[o] === 0x21 && out[o + 1] === (v & 0xff) && out[o + 2] === v >> 8) at = o;
  }
  if (at < 0) throw new Error("CONSW's LD HL,DRVVEC not found");
  const g = glvecOf(symbols);
  out[at] = 0x2a;
  out[at + 1] = g & 0xff;
  out[at + 2] = g >> 8;
  return out;
}

/** Type a line and run to the prompt, answering [more] or an error's key. */
function run(m, line) {
  m.mark = m.output.length;
  m.type(line);
  const prompt = /\r\n[A-P]>$/;
  let seen = -1;
  for (let i = 0; i < 400; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(m.mark))), 30_000_000, line);
    const t = m.text(m.mark);
    if (prompt.test(t) && m.waitingForInput()) return;
    if (m.output.length === seen && m.waitingForInput()) m.type(/\[more\]$/.test(t) ? " " : "\r");
    seen = m.output.length;
  }
  throw new Error(`no prompt after ${JSON.stringify(line)}`);
}

/**
 * Every BIOS CONOUT call's depth below its caller's SP before the CALL,
 * by the stack it was made on; and the driver stack's depth in EXPAND 1
 * (SP at BF80h-C000h, which no workspace stack reaches).
 */
function watchConout(m) {
  const S = (n) => m.sym(n);
  const entry = S("BCONOUT");
  const stacks = { bdos: [S("STKBASE"), S("STKTOP")], ccp: [S("CSTKBAS"), S("CSTKTOP")] };
  for (const [, [, top]] of Object.entries(stacks)) if (top >= 0xbf80) throw new Error("a workspace stack reaches BF80h");
  const deepest = { bdos: 0, ccp: 0, program: 0, other: 0 };
  let lowestProgram = 0x10000; // the lowest SP in a program's CONOUT call
  let driver = 0xc000;
  let active = null;
  const step = m.step.bind(m);
  m.step = () => {
    const r = step();
    const c = m.cpu.cpu;
    const sp = c.sp & 0xffff;
    if (sp >= 0xbf80 && sp <= 0xc000) driver = Math.min(driver, sp);
    if (!active && c.pc === entry) {
      // A call from a program (its return address in the TPA) is counted
      // apart from the BDOS's and the CCP's own.
      const ret = w(m, sp);
      const kind = ret < 0x8000 ? "program" : (Object.entries(stacks).find(([, [b, t]]) => sp >= b && sp <= t)?.[0] ?? "other");
      active = { sp0: sp, ret, min: sp, kind };
    } else if (active) {
      if (!(sp >= 0xbf80 && sp <= 0xc000)) active.min = Math.min(active.min, sp);
      if (c.pc === active.ret && sp === active.sp0 + 2) {
        deepest[active.kind] = Math.max(deepest[active.kind], active.sp0 + 2 - active.min);
        if (active.kind === "program") lowestProgram = Math.min(lowestProgram, active.min);
        active = null;
      }
    }
    return r;
  };
  // CONOUT.COM starts with SP at CSTKTOP - 2 (the CCP pushed WBOOT): how far
  // below that its calls reach, against the 25 bytes free there.
  return () => ({ conout: deepest, programReach: S("CSTKTOP") - 2 - lowestProgram, driverStack: 0xc000 - driver });
}

/** The stacks census's watch: the lowest address written in each resident stack. */
function watchStacks(m) {
  const s = (n) => m.sym(n);
  const stacks = { bdos: [s("STKBASE"), s("STKTOP")], ccp: [s("CSTKBAS"), s("CSTKTOP")], bios: [s("BSTKB"), s("BSTK")] };
  const low = Object.fromEntries(Object.entries(stacks).map(([k, [, top]]) => [k, top]));
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir) for (const [k, [b, t]] of Object.entries(stacks)) if (addr >= b && addr < t && addr < low[k]) low[k] = addr;
    write(addr, value);
  };
  return () => Object.fromEntries(Object.entries(stacks).map(([k, [b, t]]) => [k, { reserved: t - b, deepest: t - low[k] }]));
}

async function card(glcdFile) {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  const a = volume(image, "A");
  for (const n of PROGRAMS) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("CONOUT.COM", (await assemble.assembleProgram(resolve(HERE, "conout.asm"))).bytes);
  a.write("FILL.COM", (await assemble.assembleProgram(resolve(HERE, "fill.asm"))).bytes);
  a.write("DATA.BIN", new Uint8Array(20000).map((_, i) => i & 0xff));
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1}\r\n`).join("") + "\x1a", "latin1"));
  a.write("GLCD.PRL", glcdFile);
  return image;
}

const digest = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

/**
 * UNLOAD, then FILL.COM: the TPA up to (0006h) filled with HALT, then a
 * line printed through the BDOS. Whether the line reached the serial
 * console, and the machine's state after.
 */
function unloadThenFill(m) {
  const r = { unloadPrompt: true };
  try {
    m.mark = m.output.length;
    m.type("UNLOAD\r");
    m.runUntil(() => m.waitingForInput() && m.read(3) % 4 === 0 && /[A-P]>$/.test(m.text(m.mark)), 50_000_000, "the prompt after UNLOAD");
  } catch {
    r.unloadPrompt = false;
    r.screen = m.glcdScreen();
    r.tail = m.text(m.mark).slice(-80);
    return r;
  }
  const s0 = m.serialText().length;
  m.type("FILL\r");
  const end = m.cycles + 60_000_000;
  m.runUntil(() => m.cycles >= end || (m.serialText().slice(s0).includes("FILLED") && m.waitingForInput()), 70_000_000, "FILL");
  return { ...r, tpa: w(m, 6), iobyteConsole: m.read(3) & 3, fillPrinted: m.serialText().slice(s0).includes("FILLED"), halted: !!m.cpu.cpu.halted };
}

/** One GLCD board run: the workload, snapshots, depths and TPA. */
async function boardRun(rom, symbols, glcdFile, { unload = false, commands = COMMANDS } = {}) {
  const m = new Machine({ rom, symbols, sdImage: await card(glcdFile), clock: TEST_CLOCK, highCapacity: true, tms: false, matrix: true });
  const conout = watchConout(m);
  const stacks = watchStacks(m);
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the first input request");
  const tpa = w(m, 6);
  const shots = [];
  for (const line of commands) {
    run(m, line);
    const g = m.tec1g.state.display.glcdCtrl.glcd;
    shots.push({ line: JSON.stringify(line), gdram: digest(Uint8Array.from(g)), screen: m.glcdScreen() });
  }
  const out = { tpa, shots, stacks: stacks(), ...conout(), violations: m.violations };
  if (unload) out.afterUnload = unloadThenFill(m);
  return out;
}

export { boardRun };

export async function glcdModel() {
  const { rom, symbols } = romFor();
  const resident = await residentPrl(symbols);
  const nop = await residentPrl(symbols, { removeIsNop: true });
  const patched = patchedRom(rom, symbols);
  const n = (f) => f[1] | (f[2] << 8);
  const size = (f) => ({ fileBytes: f.length, codeBytes: n(f), pages: Math.ceil(n(f) / 256) });

  const driverRun = await boardRun(rom, symbols, GLCD_PRL, { unload: true });
  const residentRun = await boardRun(patched, symbols, resident, { unload: true });
  const fresh = { commands: ["CONOUT\r"], unload: true };
  const driverFresh = await boardRun(rom, symbols, GLCD_PRL, fresh);
  const residentFresh = await boardRun(patched, symbols, resident, fresh);
  const nopFresh = await boardRun(patched, symbols, nop, fresh);
  const short = await residentPrl(symbols, { rowCols: 20 });
  // On the census's first three commands, whose text never reaches the 21st
  // column, and on CONOUT.COM, whose wrapped lines fill every column.
  const shortCensus = await boardRun(patched, symbols, short, { commands: COMMANDS.slice(0, 3) });
  const shortConout = await boardRun(patched, symbols, short, fresh);
  const shortDiffer = {
    census3: shortCensus.shots.filter((x, i) => x.gdram !== driverRun.shots[i].gdram).length,
    conout: shortConout.shots.filter((x, i) => x.gdram !== driverFresh.shots[i].gdram).length,
  };
  const plain = new Machine({ rom, symbols, sdImage: standardCard(), clock: TEST_CLOCK, tms: true, matrix: true });
  plain.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  const differ = driverRun.shots
    .map((s, i) => ({ line: s.line, driver: s.screen, resident: residentRun.shots[i].screen, same: s.gdram === residentRun.shots[i].gdram }))
    .filter((d) => !d.same);

  return {
    driver: {
      prl: size(GLCD_PRL),
      tpa: driverRun.tpa,
      stacks: driverRun.stacks,
      conout: driverRun.conout,
      programReach: driverRun.programReach,
      driverStack: driverRun.driverStack,
      violations: driverRun.violations.length,
      afterUnload: driverRun.afterUnload,
      afterUnloadFresh: driverFresh.afterUnload,
    },
    resident: {
      prl: size(resident),
      tpa: residentRun.tpa,
      tpaDropBytes: driverRun.tpa - residentRun.tpa,
      tpaDropPages: (driverRun.tpa - residentRun.tpa) / 256,
      stacks: residentRun.stacks,
      conout: residentRun.conout,
      programReach: residentRun.programReach,
      violations: residentRun.violations.length,
      afterUnload: residentRun.afterUnload,
      afterUnloadFresh: residentFresh.afterUnload,
    },
    removeIsNop: { prl: size(nop), afterUnloadFresh: nopFresh.afterUnload },
    noGlcd: { tpa: w(plain, 6) },
    screens: { commands: COMMANDS.length, sameGdram: COMMANDS.length - differ.length, differ },
    screensFault: { fault: "VRDROW copies 20 of the 21 columns", screensThatDiffer: shortDiffer },
    ccpStackFreeForAProgram: symbolOf(symbols, "CSTKTOP") - 2 - symbolOf(symbols, "CSTKBAS"),
    bdosStackReserved: symbolOf(symbols, "STKTOP") - symbolOf(symbols, "STKBASE"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await glcdModel(), null, 2));
