// MON-3's RST 18h graphics calls, run on both sides of the comparison:
// MON-3's own ROM (the reference, from its GO with the fixed image) and a
// MON3.SVC session that has loaded a small driver and run it by GO. Each row
// writes the same starting state on both sides, runs one RST 18h and stops
// at a JR $; it records the registers, 0800h up to the stack, the ST7920's
// state and the writes to its two ports with the cycles between them.
//
// Also here: the counter of RST 18h and RST 10h fetched from 4000h up, the
// pin of R at stated fetches, and a digest of the panel and the graphics
// workspace for the programs.

import { createHash } from "node:crypto";
import { differences, fixedImage, keyDown, keyUp, mon3Go, mon3Rom } from "./kg65.mjs";
import { line } from "./mon3.mjs";
import { goTo, inSession, pageOf } from "./mon3s2.mjs";

const sha = (b) => createHash("sha256").update(Uint8Array.from(b)).digest("hex");
const h4 = (n) => n.toString(16).padStart(4, "0");

/** GBUF, the buffer MON-3's drawing calls use by default, and its workspace, 0E00h-0E19h. */
export const GBUF = 0x0a00;
export const GVARS = 0x0e00;
export const GVARS_END = 0x0e1a;
export const VPORT = 0x0e13;
export const CLRBUF = 0x0e0c;

/** MON-3's own addresses: its RST 18h table, its displayError, and softBoot, where a program's RET lands. */
export const MON3_GTABLE = 0xd280;
export const MON3_SOFTBOOT = 0xc209;
/** A session's program return: the fetch at GO's return address. */
export const GORET = 0x0049;

/** The pattern byte at index I: (37i + 11) AND FFh, in GBUF and at 1000h-13FFh. */
export const pattern = (i) => (i * 37 + 11) & 0xff;

/** The ST7920's state on M: graphics RAM, DDRAM and the mode bits. */
export function glcdOf(m) {
  const g = m.tec1g.state.display.glcdCtrl;
  return {
    gdram: Uint8Array.from(g.glcd),
    ddram: Buffer.from(g.glcdDdram).toString("latin1"),
    re: Boolean(g.glcdRe),
    graphics: Boolean(g.glcdGraphics),
    on: Boolean(g.glcdDisplayOn),
    reverse: g.glcdReverseMask,
    scroll: g.glcdScroll,
  };
}

/** A program's end state, by digest: GBUF, 0E00h-0E19h, graphics RAM, DDRAM and the mode. */
export function snap(m) {
  const g = glcdOf(m);
  const mem = (a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));
  return {
    gbuf: sha(mem(GBUF, 0x400)).slice(0, 16),
    vars: mem(GVARS, GVARS_END - GVARS).map((x) => x.toString(16).padStart(2, "0")).join(""),
    gdram: sha(g.gdram).slice(0, 16),
    pixels: g.gdram.reduce((k, b) => k + b.toString(2).replace(/0/g, "").length, 0),
    ddram: g.ddram,
    mode: { re: g.re, graphics: g.graphics, on: g.on },
  };
}

/** The registers the programs' rows compare. */
export const regsOf = (c) => ({ a: c.a, bc: (c.b << 8) | c.c, de: (c.d << 8) | c.e, hl: (c.h << 8) | c.l, iy: c.iy & 0xffff, sp: c.sp & 0xffff });

/**
 * Count the RST 18h and RST 10h opcodes M fetches from 4000h up, and set R
 * to 0 at the fetch of each address in LDAR: { 0x18, 0x10 }.
 */
export function instrument(m, { ldar = [] } = {}) {
  const count = { 0x18: 0, 0x10: 0 };
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    if (pc >= 0x4000) {
      const op = m.read(pc);
      if (op === 0xdf) count[0x18] += 1;
      else if (op === 0xd7) count[0x10] += 1;
    }
    if (ldar.includes(pc)) m.cpu.cpu.r = 0;
    return step();
  };
  return count;
}

/** The addresses of every LD A,R (EDh 5Fh) in BYTES at 4000h. */
export const ldarOf = (bytes) => bytes.flatMap((b, i) => (b === 0xed && bytes[i + 1] === 0x5f ? [0x4000 + i] : []));

// The call driver: RST 18h at 4000h and a JR $; at 4010h for printString,
// whose text follows the RST; printChars' text at 4020h.

export const DRV = new Uint8Array(0x40);
DRV.set([0xdf, 0x18, 0xfe], 0);
DRV.set([0xdf, ...Buffer.from("ROW TEXT", "latin1"), 0, 0x18, 0xfe], 0x10);
DRV.set([...Buffer.from("AB CD", "latin1"), 0], 0x20);
export const STOPS = [0x4001, 0x401a];
export const TEXT14 = 0x4020;

/** Log M's writes to ports 07h and 87h, as [port, value, cycle], in M.glcdWrites. */
function logGlcd(m) {
  m.glcdWrites = [];
  const io = m.tec1g.ioHandlers;
  const write = io.write;
  io.write = (port, value) => {
    const p = port & 0xff;
    if (p === 0x07 || p === 0x87) m.glcdWrites.push([p, value & 0xff, m.cycles]);
    return write(port, value);
  };
}

/** The two sides for the call rows: { ref, ses }, each { kind, m, routine(sel) }. SVC: the service to run. */
export async function callSides({ svc } = {}) {
  const r = mon3Go(DRV);
  r.m.runUntil(() => r.m.pc === 0x4000, 5_000_000, "the driver under MON-3");
  logGlcd(r.m);
  const rom = mon3Rom();
  const ref = { kind: "reference", m: r.m, side: r, routine: (a) => rom[MON3_GTABLE - 0xc000 + 2 * a] | (rom[MON3_GTABLE - 0xc000 + 2 * a + 1] << 8) };
  const { m, svc: built } = await inSession({ "DRV.BIN": DRV }, { svc });
  line(m, "LOAD DRV.BIN");
  goTo(m, "GO", 0x4000, 20_000_000);
  logGlcd(m);
  const page = pageOf(m) << 8;
  const ses = { kind: "session", m, svc: built, at: (n) => page + built.symbols[n] };
  ses.routine = (a) => m.read(ses.at("GAPI") + 2 * a) | (m.read(ses.at("GAPI") + 2 * a + 1) << 8);
  return { ref, ses };
}

const P = (x, y) => (x << 8) | y;

/** The call rows: [selector, inputs]. Inputs: bc, de, hl, clrbuf, vport. */
export const CALL_ROWS = [
  [0, {}], [1, {}], [2, {}], [3, {}], [4, {}], [5, {}],
  ...[[0, 0, 127, 63], [10, 5, 20, 40], [20, 40, 10, 5], [130, 70, 1, 1]].map(([a, b, c, d]) => [6, { bc: P(a, b), de: P(c, d) }]),
  ...[[0, 0, 127, 63], [127, 0, 0, 63], [5, 5, 5, 5], [0, 10, 127, 10], [128, 0, 0, 0]].map(([a, b, c, d]) => [7, { bc: P(a, b), de: P(c, d) }]),
  ...[[64, 32, 20], [0, 0, 5], [64, 32, 0], [64, 32, 31]].map(([a, b, r]) => [8, { bc: P(a, b), de: r }]),
  ...[9, 19, 20].flatMap((s) => [[0, 0], [4, 0], [127, 63], [64, 32], [128, 0], [0, 64]].map(([x, y]) => [s, { bc: P(x, y) }])),
  [10, { bc: P(10, 10), de: P(30, 20) }], [10, { bc: P(0, 0), de: P(127, 63) }],
  [11, { bc: P(64, 32), de: 10 }],
  [12, { clrbuf: 0 }], [12, { clrbuf: 0xff }],
  ...[0, 1, 2, 3, 4].map((c) => [13, { bc: c }]),
  ...[[0, 0], [7, 3], [3, 1]].map(([b, c]) => [14, { bc: P(b, c), hl: TEXT14 }]),
  [1, { vport: 0x1000 }], [9, { vport: 0x1000, bc: P(4, 0) }], [9, { vport: 0x1000, bc: P(64, 32) }], [12, { vport: 0x1000, clrbuf: 0xff }],
  [15, {}], [16, { de: 0x0001 }], [16, { de: 0x0140 }], [17, {}], [18, { clrbuf: 0xff }],
];

/** A row's name. */
export const rowName = ([sel, inp]) => `call ${sel}${Object.entries(inp).map(([k, v]) => ` ${k} ${h4(v)}`).join(",")}`;

/** The highest byte the call rows compare: one below the lowest SP either side reaches. */
export const CALL_TOP = 0x3ef1;

/** Write ROW's starting state on M, up to TOP, with every flag F (0 or FFh). */
export function setState(m, [sel, inp], f, top = CALL_TOP, image) {
  for (let i = 0; i < image.length; i += 1) if (i < 0x92 || i > 0x95) m.write(0x800 + i, image[i]);
  for (let i = 0; i < 0x400; i += 1) m.write(GBUF + i, pattern(i));
  for (let a = GVARS; a <= top; a += 1) m.write(a, a >= 0x1000 && a < 0x1400 ? pattern(a - 0x1000) : 0);
  const vp = inp.vport ?? GBUF;
  m.write(VPORT, vp & 0xff);
  m.write(VPORT + 1, vp >> 8);
  if (inp.clrbuf !== undefined) m.write(CLRBUF, inp.clrbuf);
  DRV.forEach((b, i) => m.write(0x4000 + i, b));
  const g = m.tec1g.state.display.glcdCtrl;
  for (let i = 0; i < 1024; i += 1) g.glcd[i] = (i * 13 + 5) & 0xff;
  g.glcdDdram.set(Buffer.from("0123456789ABCDEF".repeat(4), "latin1"));
  Object.assign(g, { glcdRe: true, glcdGraphics: true, glcdDisplayOn: true, glcdRowAddr: 0, glcdCol: 0, glcdRowBase: 0, glcdGdramPhase: 0, glcdDdramAddr: 0x80, glcdDdramPhase: 0, glcdExpectColumn: false, glcdReadPrimed: false });
  const c = m.cpu.cpu;
  const w = (r, v) => {
    c[r[0]] = v >> 8;
    c[r[1]] = v & 0xff;
  };
  c.a = sel;
  w("bc", inp.bc ?? 0x1234);
  w("de", inp.de ?? 0x5678);
  w("hl", inp.hl ?? 0x9abc);
  c.iy = 0x2222;
  c.sp = 0x3f00;
  c.iff1 = c.iff2 = 0;
  for (const k of Object.keys(c.flags)) c.flags[k] = f ? 1 : 0;
  c.pc = sel === 13 ? 0x4010 : 0x4000;
}

const flagsByte = (fl) => (fl.S << 7) | (fl.Z << 6) | (fl.Y << 5) | (fl.H << 4) | (fl.X << 3) | (fl.P << 2) | (fl.N << 1) | fl.C;

/**
 * Run ROW on SIDE from its state to the stop: { regs, mem, glcd, ports,
 * cycles, lowSP, entry }. ENTRY is the cycles from the RST's fetch to the
 * routine's first instruction.
 */
export function runRow(side, row, f, { top = CALL_TOP, image, max = 20_000_000 } = {}) {
  const { m } = side;
  setState(m, row, f, top, image);
  m.glcdWrites = [];
  const target = side.routine(row[0]);
  const c0 = m.cycles;
  let lowSP = 0x3f00;
  let entry;
  m.runUntil(() => {
    const sp = m.cpu.cpu.sp & 0xffff;
    if (sp < lowSP) lowSP = sp;
    if (entry === undefined && m.pc === target) entry = m.cycles - c0;
    return STOPS.includes(m.pc);
  }, max, `${rowName(row)} on ${side.kind}`);
  const c = m.cpu.cpu;
  return {
    regs: { a: c.a, f: flagsByte(c.flags), bc: (c.b << 8) | c.c, de: (c.d << 8) | c.e, hl: (c.h << 8) | c.l, iy: c.iy & 0xffff, sp: c.sp & 0xffff },
    mem: Uint8Array.from({ length: top - 0x7ff }, (_, i) => m.read(0x800 + i)),
    glcd: glcdOf(m),
    ports: m.glcdWrites.map(([p, v, t], i, a) => [p, v, i ? t - a[i - 1][2] : 0]),
    cycles: m.cycles - c0,
    lowSP,
    entry,
  };
}

/** What differs between the reference's R and the session's S for ROW, up to TOP. */
export function callDifferences([sel], R, S, top = CALL_TOP) {
  const out = [];
  for (const k of ["a", "f", "bc", "de", "hl", "iy", "sp"]) {
    if (k === "de" && sel === 14) continue;
    if (R.regs[k] !== S.regs[k]) out.push(`${k} ${R.regs[k].toString(16)} vs ${S.regs[k].toString(16)}`);
  }
  for (let a = 0x800; a <= top; a += 1) {
    if (a >= 0x892 && a <= 0x895) continue;
    if (R.mem[a - 0x800] !== S.mem[a - 0x800]) {
      out.push(`${h4(a)}h ${R.mem[a - 0x800].toString(16)} vs ${S.mem[a - 0x800].toString(16)}`);
      break;
    }
  }
  if (sha(R.glcd.gdram) !== sha(S.glcd.gdram)) out.push("graphics RAM");
  if (R.glcd.ddram !== S.glcd.ddram) out.push(`DDRAM ${JSON.stringify(R.glcd.ddram)} vs ${JSON.stringify(S.glcd.ddram)}`);
  for (const k of ["re", "graphics", "on"]) if (R.glcd[k] !== S.glcd[k]) out.push(`${k} ${R.glcd[k]} vs ${S.glcd[k]}`);
  const n = Math.max(R.ports.length, S.ports.length);
  for (let i = 0; i < n; i += 1)
    if (JSON.stringify(R.ports[i]) !== JSON.stringify(S.ports[i])) {
      out.push(`port write ${i} of ${R.ports.length}/${S.ports.length}: ${JSON.stringify(R.ports[i])} vs ${JSON.stringify(S.ports[i])}`);
      break;
    }
  return out;
}

/**
 * Every row of ROWS on both sides, with F 00h and FFh: { rows, bad, extra,
 * lowSP }. EXTRA maps each selector to the set of cycle differences, the
 * session's run less the reference's; ENTRY the same from the RST to the
 * routine's first instruction.
 */
export function compareCalls({ ref, ses }, rows = CALL_ROWS, image = fixedImage()) {
  const bad = [];
  const extra = {};
  const entry = {};
  let lowSP = 0x3f00;
  let n = 0;
  for (const row of rows) {
    for (const f of [0x00, 0xff]) {
      const R = runRow(ref, row, f, { image });
      const S = runRow(ses, row, f, { image });
      const top = Math.min(CALL_TOP, R.lowSP - 1, S.lowSP - 1);
      lowSP = Math.min(lowSP, R.lowSP, S.lowSP);
      const d = callDifferences(row, R, S, top);
      if (d.length) bad.push(`${rowName(row)}, F ${f ? "FF" : "00"}: ${d.join("; ")}`);
      (extra[row[0]] ??= new Set()).add(S.cycles - R.cycles);
      (entry[row[0]] ??= new Set()).add(`${S.entry}/${R.entry}`);
      n += 1;
    }
  }
  return { rows: n, bad, extra, entry, lowSP };
}

// The refusals: RST 18h with a selector of 21 to 33, 34 or FFh, on the
// sides of the RST 10h comparison and its driver. Each shows displayError
// as MON-3's call 11 does on the same key, and changes nothing else.

export const REFUSED18 = [...Array.from({ length: 13 }, (_, i) => 21 + i), 34, 0xff];
/** The highest byte a refusal's end state covers; 3E00h-3EFFh is the stack displayError waits on. */
export const REFUSAL_TOP = 0x3dff;
const K5 = 0x25; // the runtime's code for MON-3's key 5

/** The fixed image with the call rows' pattern in GBUF. */
export function patternImage() {
  const img = fixedImage();
  for (let i = 0; i < 0x400; i += 1) img[GBUF - 0x800 + i] = pattern(i);
  return img;
}

/** 0E00h-3DFFh as a refusal row starts them: 0E00h-0E19h zero but VPORT 0A00h, the pattern at 1000h-13FFh, zero elsewhere. */
function writeAbove(m) {
  for (let a = GVARS; a <= REFUSAL_TOP; a += 1) m.write(a, a >= 0x1000 && a < 0x1400 ? pattern(a - 0x1000) : 0);
  m.write(VPORT, GBUF & 0xff);
  m.write(VPORT + 1, GBUF >> 8);
}

/** The ST7920 as a call row starts it. */
function writePanel(m) {
  const g = m.tec1g.state.display.glcdCtrl;
  for (let i = 0; i < 1024; i += 1) g.glcd[i] = (i * 13 + 5) & 0xff;
  g.glcdDdram.set(Buffer.from("0123456789ABCDEF".repeat(4), "latin1"));
  Object.assign(g, { glcdRe: true, glcdGraphics: true, glcdDisplayOn: true });
}

/** Whether A is DISP_BUFF, a key variable, or USER_INT or USER_NMI: the bytes a refusal may write. */
const mayWrite = (a) => (a >= 0x880 && a < 0x886) || (a >= 0x889 && a < 0x88c) || a === 0x88e || (a >= 0x892 && a < 0x896);

/**
 * The refusal row for RST 18h with A = SEL. AGAINST: "call 11" compares
 * with MON-3's displayError by RST 10h; "rst 18h" with MON-3's own RST 18h.
 */
export function refusal18(sel, against = "call 11") {
  return {
    name: `RST 18h, A ${sel.toString(16)}h, against MON-3's ${against}`,
    op: 0xdf,
    regs: { a: sel },
    ...(against === "call 11" ? { ref: { op: 0xd7, regs: { bc: 0x1200 | 11, a: sel } } } : {}),
    events: [{ at: 200_000, fire: keyDown(K5) }],
    atRestart: (side) => {
      side.lowSP = 0x3f00;
    },
    release: (side) => {
      keyUp(K5)(side);
      side.m.step = side.plainStep;
    },
    setup: (side) => {
      writeAbove(side.m);
      writePanel(side.m);
      side.panelBefore = glcdOf(side.m);
      side.lowSP = 0x3f00;
      side.plainStep ??= side.m.step.bind(side.m);
      side.m.step = () => {
        const sp = side.m.cpu.cpu.sp & 0xffff;
        if (sp < side.lowSP) side.lowSP = sp;
        return side.plainStep();
      };
    },
    skip: ["h", "l"],
    tx6: true,
    waits: true,
  };
}

/**
 * Each refusal on REF and SES, with F 00h and FFh: { bad, lowSP }. A 34 and
 * FFh are also compared with MON-3's own RST 18h, which refuses them too.
 */
export function compareRefusals(ref, ses, sels = REFUSED18) {
  const image = patternImage();
  const bad = [];
  let lowSP = 0x3f00;
  const rows = sels.flatMap((s) => (s >= 34 ? [refusal18(s), refusal18(s, "rst 18h")] : [refusal18(s)]));
  for (const row of rows) {
    for (const f of [0x00, 0xff]) {
      const r = { ...row, regs: { ...row.regs, f } };
      const R = ref.run(row.ref ? { ...r, ...row.ref, regs: { ...r.regs, ...row.ref.regs } } : r, image);
      const S = ses.run(r, image);
      const d = differences(r, R, S);
      const m = ses.m;
      for (let a = 0x800; a <= REFUSAL_TOP; a += 1) {
        if (mayWrite(a)) continue;
        const want = a < GVARS ? image[a - 0x800] : a === VPORT ? GBUF & 0xff : a === VPORT + 1 ? GBUF >> 8 : a >= 0x1000 && a < 0x1400 ? pattern(a - 0x1000) : 0;
        if (m.read(a) !== want) {
          d.push(`${h4(a)}h changed: ${m.read(a).toString(16)}`);
          break;
        }
      }
      if (S.latch !== 0x01) d.push(`the latch ${S.latch.toString(16)}h`);
      const gw = S.writes.filter((w) => w.port === 0x07 || w.port === 0x87).length;
      if (gw) d.push(`${gw} writes to the ST7920`);
      const after = glcdOf(m);
      const before = ses.panelBefore;
      if (sha(after.gdram) !== sha(before.gdram) || after.ddram !== before.ddram || ["re", "graphics", "on"].some((k) => after[k] !== before[k])) d.push("the ST7920 changed");
      lowSP = Math.min(lowSP, ses.lowSP);
      if (d.length) bad.push(`${row.name}, F ${f ? "FF" : "00"}: ${d.join("; ")}`);
    }
  }
  return { bad, lowSP };
}
