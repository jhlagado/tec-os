// KG65's differential harness. One driver program, test/programs/kg65drv.asm,
// runs each input row on two machines of the same pinned runtime: MON-3's
// own ROM (the reference), and TEC-OS with a MON3.SVC session that has
// loaded the driver and run it by GO. Each row records the registers, the
// bytes of 0800h-0DFFh, the port writes in order with their cycles, the
// serial bytes, and the latch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Machine as HostMachine } from "../../host/machine.mjs";
import { TEST_CLOCK, program } from "./fixtures.mjs";
import { MON3_BIN, line } from "./mon3.mjs";
import { check } from "./inputs.mjs";
import { inSession, pageOf } from "./mon3s2.mjs";

const DEFAULTS = 0x1400; // MON-3's defaults, in its ROM
const DEFAULTS_SIZE = 0x17;

/** The driver: { bytes, symbols }, assembled once at 4000h. */
let driverMade;
export const driver = async () => (driverMade ??= await program("kg65drv", { base: 0x4000 }));

/** MON-3's ROM, the pinned input. */
export function mon3Rom() {
  check(MON3_BIN);
  return Uint8Array.from(readFileSync(MON3_BIN.path));
}

/**
 * The fixed image of 0800h-0DFFh that every row starts from, the same on both
 * sides: ROMSIG, MON-3's defaults with MENU_CFG 0, SYS_MODE 01h, RNG_SEED 5Ah,
 * BAUD 001Bh, and zero elsewhere. 0892h-0895h are never copied.
 */
export function fixedImage() {
  const rom = mon3Rom();
  const img = new Uint8Array(0x600);
  img.set(Buffer.from("MON3.1G\u00002025.16\u0000", "latin1"), 0);
  img.set(rom.subarray(DEFAULTS, DEFAULTS + DEFAULTS_SIZE), 0x86);
  img[0x99] = 0;
  img[0x9a] = 0; // MENU_CFG
  img[0x92] = img[0x93] = img[0x94] = img[0x95] = 0; // not copied
  img[0x9d] = 0x01; // SYS_MODE
  img[0x9e] = img[0x9f] = 0;
  img[0x9c] = 0; // CAPS_LOCK
  img[0xb0] = 0x5a; // RNG_SEED
  img[0xb1] = 0x1b;
  img[0xb2] = 0x00; // BAUD
  return img;
}

/** The routine that RST 10h selector N runs on SIDE: the word in its API table. */
export function routineOf(side, n) {
  const table = side.kind === "reference" ? 0xc000 + 0x1300 : side.at("API");
  return side.m.read(table + 2 * n) | (side.m.read(table + 2 * n + 1) << 8);
}

/**
 * One side of the comparison: a machine at the driver's START with the hooks
 * that record a row. KIND is "reference" or "session".
 */
class Side {
  constructor(kind, m, sym) {
    this.kind = kind;
    this.m = m;
    this.sym = sym;
    this.writes = [];
    this.reads = [];
    this.stub = [];
    const io = m.tec1g.ioHandlers;
    const write = io.write;
    const read = io.read;
    io.write = (port, value) => {
      const p = port & 0xff;
      const pc = m.cpu.cpu.pc & 0xffff;
      if (kind === "session" && p === 0xff && pc === 0x46) this.stub.push({ value, latchv: m.read(0x40) });
      else this.writes.push({ port: p, value: value & 0xff, cycle: m.cycles, pc });
      return write(port, value);
    };
    io.read = (port) => {
      const v = read(port);
      this.reads.push({ port: port & 0xff, value: v, cycle: m.cycles });
      return v;
    };
    this.tick = m.cpu.hardware.ioTick;
  }

  /** Put the latch at VALUE, as a row's start has it, and LATCHV with it on the session. */
  latch(value) {
    this.m.tec1g.ioHandlers.write(0xff, value);
    if (this.kind === "session") this.m.write(0x40, value);
  }

  /** Raise an interrupt (NMI when NMI) after the next instruction; irqAt is then the cycle its acknowledge starts at. */
  interrupt(nmi) {
    const tick = this.tick;
    this.irqAt = undefined;
    this.irqTaken = false;
    this.m.cpu.hardware.ioTick = () => {
      this.m.cpu.hardware.ioTick = tick;
      tick();
      this.irqTaken = true;
      return { interrupt: { nonMaskable: nmi, data: 0xff } };
    };
  }

  /** Run ROW (see rowOf) from START to STOP: what it left. */
  run(row, image) {
    const { m, sym } = this;
    const s = (n) => sym[n];
    this.latch(row.latch ?? 0x01);
    m.tec1g.ioHandlers.write(0x01, 0x40); // the serial line idle, no digit
    m.tec1g.ioHandlers.write(0x02, 0x00);
    this.writes.length = 0;
    this.reads.length = 0;
    this.stub.length = 0;
    for (let i = 0; i < image.length; i += 1) m.write(s("IMAGE") + i, image[i]);
    const put = (at, bytes) => bytes.forEach((b, i) => m.write(at + i, b));
    const regs = (r) => {
      const g = { a: 0x3c, f: 0, bc: 0x1234, de: 0x5678, hl: 0x9abc, iy: 0x2222, ...r };
      return [g.f, g.a, g.bc & 0xff, g.bc >> 8, g.de & 0xff, g.de >> 8, g.hl & 0xff, g.hl >> 8, g.iy & 0xff, g.iy >> 8];
    };
    put(s("R1"), regs(row.regs));
    put(s("R2"), regs(row.regs2 ?? {}));
    const [to, bytes] = row.mem ?? [0, []];
    put(s("MEMTO"), [to & 0xff, to >> 8, bytes.length & 0xff, bytes.length >> 8]);
    put(s("MEMB"), bytes);
    m.write(s("OP1"), row.op ?? 0xd7);
    m.write(s("OP2"), row.op2 ?? 0xd7);
    const next = row.next ? s(row.next) : row.regs2 ? s("CALL2") : s("STOP");
    put(s("NEXT") + 1, [next & 0xff, next >> 8]);
    row.setup?.(this);
    m.cpu.cpu.pc = s("START");
    const serialFrom = m.serial.length;
    const start = m.cycles;
    // To the restart, then the row's own setting: keys down, the RX queue.
    m.runUntil(() => m.pc === s("OP1"), 2_000_000, "the row's restart");
    const at = m.cycles;
    row.atRestart?.(this);
    const events = [...(row.events ?? [])].sort((x, y) => x.at - y.at);
    const stopAt = row.stopAt ?? s("STOP");
    const marks = {};
    const watch = row.watch ?? {};
    this.irqTaken = false;
    this.irqAt = undefined;
    m.runUntil(() => {
      if (this.irqTaken && this.irqAt === undefined) this.irqAt = m.cycles;
      while (events.length && m.cycles - at >= events[0].at) events.shift().fire(this);
      for (const [name, pc] of Object.entries(watch)) if (m.pc === pc && marks[name] === undefined) marks[name] = m.cycles;
      return m.pc === stopAt;
    }, row.max ?? 20_000_000, `the row's stop (${row.name})`);
    row.atStop?.(this);
    const c = m.cpu.cpu;
    const hl = (c.h << 8) | c.l;
    const str = row.strAtHL ? Array.from({ length: row.strAtHL }, (_, i) => m.read(hl + i)) : undefined;
    const flags = (c.flags.S << 7) | (c.flags.Z << 6) | (c.flags.Y << 5) | (c.flags.H << 4) | (c.flags.X << 3) | (c.flags.P << 2) | (c.flags.N << 1) | c.flags.C;
    const out = {
      regs: { a: c.a, f: flags, b: c.b, c: c.c, d: c.d, e: c.e, h: c.h, l: c.l, iy: c.iy & 0xffff, sp: c.sp & 0xffff, iff1: c.iff1 ? 1 : 0 },
      mem: Uint8Array.from({ length: 0x600 }, (_, i) => m.read(0x800 + i)),
      writes: [...this.writes],
      reads: [...this.reads],
      stub: [...this.stub],
      serial: m.serial.slice(serialFrom),
      latch: m.sysCtrl,
      latchv: this.kind === "session" ? m.read(0x40) : undefined,
      start,
      atRestart: at,
      end: m.cycles,
      marks,
      str,
      irqAt: this.irqAt,
    };
    row.release?.(this);
    return out;
  }
}

/** The reference: MON-3's ROM with its page zero in RAM, the driver at 4000h, the overlay off. MATRIX: the matrix fitted. */
export async function referenceSide({ matrix = false } = {}) {
  const { bytes, symbols } = await driver();
  const rom = mon3Rom();
  const m = new HostMachine({ rom, symbols: new Map(), matrix, clock: TEST_CLOCK, rtc: false });
  m.tec1g.ioHandlers.write(0xff, 0x01);
  for (let i = 0; i < 0x100; i += 1) m.write(i, rom[i]);
  // USER_INT and USER_NMI as MON-3's reset leaves them: its RETI and RETN.
  for (let i = 0x0c; i < 0x10; i += 1) m.write(0x0886 + i, rom[DEFAULTS + i]);
  bytes.forEach((b, i) => m.write(0x4000 + i, b));
  m.cpu.cpu.pc = symbols.WAIT;
  m.cpu.cpu.sp = 0x3f00;
  const side = new Side("reference", m, symbols);
  primeRx(side);
  return side;
}

/** The session: TEC-OS with MON3.SVC (SVC) entered, the driver loaded as DRV.BIN and run by GO to START. */
export async function sessionSide({ svc, matrix = false } = {}) {
  const { bytes, symbols } = await driver();
  const { m, svc: s } = await inSession({ "DRV.BIN": bytes }, { svc, machine: { matrix } });
  assert.ok(line(m, "LOAD DRV.BIN").mon3);
  m.mark = m.output.length;
  m.type("GO\r");
  m.runUntil(() => m.pc === symbols.START, 20_000_000, "the driver's START");
  m.cpu.cpu.pc = symbols.WAIT;
  const side = new Side("session", m, symbols);
  side.svc = s;
  side.page = pageOf(m);
  /** The address of the service's symbol NAME. */
  side.at = (name) => (side.page << 8) + s.symbols[name];
  primeRx(side);
  return side;
}

/** The runtime's RX starts with a byte of its own once; let it pass on each side alike. */
function primeRx(side) {
  const { m } = side;
  m.tec1g.queueSerial([0]);
  m.tec1g.ioHandlers.read(0x00);
  const end = m.cycles + 40_000;
  m.runUntil(() => m.cycles >= end, 100_000, "the RX prime");
}

/** Press keypad key CODE (the runtime's code) now, as an event. */
export const keyDown = (code) => (side) => side.m.tec1g.applyKey(code, true);
export const keyUp = (code) => (side) => side.m.tec1g.applyKey(code, false);
export const matrixDown = (...keys) => (side) => keys.forEach((k) => side.m.tec1g.applyMatrixKey(k >> 3, k & 7, true));
export const matrixUp = (...keys) => (side) => keys.forEach((k) => side.m.tec1g.applyMatrixKey(k >> 3, k & 7, false));

/** Collapse repeats: any block of up to MAX entries that follows itself at once is kept once. */
export function collapse(list, key = (x) => JSON.stringify(x), max = 64) {
  const k = list.map(key);
  let changed = true;
  while (changed) {
    changed = false;
    for (let len = 1; len <= max && !changed; len += 1) {
      for (let i = 0; i + 2 * len <= k.length; i += 1) {
        let same = true;
        for (let j = 0; j < len && same; j += 1) same = k[i + j] === k[i + len + j];
        if (same) {
          k.splice(i + len, len);
          changed = true;
          break;
        }
      }
    }
  }
  return k;
}

const h2 = (n) => n.toString(16).padStart(2, "0");

/** The rows whose H and L went uncompared because MON-3's HL was in its ROM. */
export const ROM_HL_ROWS = new Set();

/**
 * The differences between the reference's result R and the session's S for
 * ROW: registers, 0800h-0DFFh, the port writes, the serial bytes and the
 * latch. ROW.skip names registers not compared; ROW.tx6 masks port 01h's bit
 * 6 in the writes; ROW.waits collapses repeated scans; ROW.reads compares
 * the reads of those ports too.
 */
export function differences(row, R, S) {
  const out = [];
  const skip = new Set(row.skip ?? []);
  // ROW.romHL: H and L not compared where MON-3's HL ends in its ROM.
  if (row.romHL && ((R.regs.h << 8) | R.regs.l) >= 0xc000) {
    skip.add("h");
    skip.add("l");
    ROM_HL_ROWS.add(row.name);
  }
  for (const k of ["a", "f", "b", "c", "d", "e", "h", "l", "iy", "sp"]) if (!skip.has(k) && R.regs[k] !== S.regs[k]) out.push(`${k}: ${R.regs[k].toString(16)} vs ${S.regs[k].toString(16)}`);
  for (let i = 0; i < 0x600; i += 1) {
    const a = 0x800 + i;
    if (a >= 0x892 && a < 0x896) continue;
    if ((row.memSkip ?? []).some(([x, y]) => a >= x && a < y)) continue;
    if (R.mem[i] !== S.mem[i]) {
      out.push(`${a.toString(16)}h: ${h2(R.mem[i])} vs ${h2(S.mem[i])}`);
      if (out.length > 12) break;
    }
  }
  const stream = (x) => {
    const w = x.writes.map((v) => ({ port: v.port, value: v.port === 0x01 && row.tx6 ? v.value & 0xbf : v.value }));
    const r = (row.reads ?? []).length ? x.reads.filter((v) => row.reads.includes(v.port)).map((v) => ({ port: v.port, read: v.value, cycle: v.cycle })) : [];
    const all = [...x.writes.map((v, i) => ({ ...w[i], cycle: v.cycle })), ...r].sort((p, q) => p.cycle - q.cycle).map(({ cycle, ...v }) => v);
    return row.waits ? collapse(all) : all.map((v) => JSON.stringify(v));
  };
  const [rs, ss] = [stream(R), stream(S)];
  const n = Math.max(rs.length, ss.length);
  for (let i = 0; i < n; i += 1)
    if (rs[i] !== ss[i]) {
      out.push(`port write ${i} of ${rs.length}/${ss.length}: ${rs[i]} vs ${ss[i]}`);
      break;
    }
  // Under the bit 6 exception MON-3's digit writes move its serial line, and
  // the runtime decodes noise from them: the session must send nothing.
  if (row.tx6) {
    if (S.serial.length) out.push(`serial from the session: ${S.serial.map(h2).join(" ")}`);
  } else if (R.serial.join() !== S.serial.join()) out.push(`serial: ${R.serial.map(h2).join(" ")} vs ${S.serial.map(h2).join(" ")}`);
  if (R.str && R.str.join() !== S.str.join()) out.push(`the string at HL: ${R.str.map(h2).join(" ")} vs ${S.str.map(h2).join(" ")}`);
  if (R.latch !== S.latch) out.push(`latch: ${h2(R.latch)} vs ${h2(S.latch)}`);
  if (S.latchv !== S.latch) out.push(`LATCHV ${h2(S.latchv)} is not the latch ${h2(S.latch)}`);
  for (const w of S.stub) if (w.value !== w.latchv) out.push(`the stub wrote ${h2(w.value)} with LATCHV ${h2(w.latchv)}`);
  return out;
}

/** Each row in ROWS on both sides, twice, with F 00h and FFh: the rows that differ, by name. */
export function compareRows(ref, ses, rows) {
  const image = fixedImage();
  const bad = [];
  for (const row of rows) {
    for (const f of row.flags ?? [0x00, 0xff]) {
      const r = { ...row, regs: { ...row.regs, f: row.regs?.f ?? f } };
      // A row the reference runs otherwise: a refusal against call 11.
      const R = ref.run(row.ref ? { ...r, ...row.ref, regs: { ...r.regs, ...row.ref.regs } } : r, image);
      const S = ses.run(r, image);
      row.check?.(R, S);
      const d = differences(r, R, S);
      if (d.length) bad.push(`${row.name}, F ${h2(r.regs.f)}: ${d.join("; ")}`);
    }
  }
  return bad;
}

// MON-3's own addresses, from its listing at the pin.
export const MON3_KEYGO = 0xc284; // where its GO key's handler starts
export const MON3_PASS = 0xcc34; // displayPass, where intelHexLoad ends well

/** BYTES of Intel HEX through MON-3's call 24 from the fixed image: the reference's memory then. */
export async function referenceHexLoad(text) {
  const ref = await referenceSide();
  ref.run({ name: "call 24", regs: { bc: 0x1200 | 24 }, atRestart: (side) => {
    side.m.tec1g.queueSerial([...text]);
    side.m.tec1g.ioHandlers.read(0x00);
  }, stopAt: MON3_PASS, max: 200_000_000 }, fixedImage());
  return (a) => ref.m.read(a);
}

/**
 * BIN run by MON-3's GO on the pinned runtime, from the fixed image: a
 * HostMachine at MON-3's GO key with HL 4000h, as its monitor leaves it.
 * MATRIX: the matrix fitted.
 */
export function mon3Go(bin, { matrix = false } = {}) {
  const rom = mon3Rom();
  const m = new HostMachine({ rom, symbols: new Map(), matrix, clock: TEST_CLOCK, rtc: false });
  m.tec1g.ioHandlers.write(0xff, 0x01);
  for (let i = 0; i < 0x100; i += 1) m.write(i, rom[i]);
  const image = fixedImage();
  for (let i = 0; i < image.length; i += 1) m.write(0x800 + i, image[i]);
  for (let i = 0x0c; i < 0x10; i += 1) m.write(0x0886 + i, rom[DEFAULTS + i]);
  bin.forEach((b, i) => m.write(0x4000 + i, b));
  const c = m.cpu.cpu;
  c.pc = MON3_KEYGO;
  c.sp = 0x0880;
  c.h = 0x40;
  c.l = 0x00;
  const side = new Side("reference", m, {});
  primeRxAt(m);
  c.pc = MON3_KEYGO;
  return side;
}

/** The RX prime with the CPU held in place. */
function primeRxAt(m) {
  const pc = m.cpu.cpu.pc;
  m.write(0x3ff0, 0x18);
  m.write(0x3ff1, 0xfe); // JR $
  m.cpu.cpu.pc = 0x3ff0;
  m.tec1g.queueSerial([0]);
  m.tec1g.ioHandlers.read(0x00);
  const end = m.cycles + 40_000;
  m.runUntil(() => m.cycles >= end, 100_000, "the RX prime");
  m.cpu.cpu.pc = pc;
}
