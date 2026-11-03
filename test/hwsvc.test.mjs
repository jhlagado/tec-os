// The hardware services through ABICALL, called directly at the A> prompt with the
// arguments in the registers and a return address on a stack in the TPA.
// Every write below that stack counts towards the hardware service's stack depth.
// Emulator evidence; the depths go to build/hwsvc-stacks.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { ABI, GLCD_SVC, ROOT, boot, romFor, standardCard, volume } from "./lib/fixtures.mjs";

const HWSVC = romFor().symbols.get("ABICALL");
const HW = Object.fromEntries(["INFO", "DIGIT", "LCD", "VIDEO", "TONE", "JOY", "KEYS", "PUTAT", "RTC"].map((n) => [n, ABI[`TN${n}`]]));
const BACK = 0x0f00; // the sentinel return address
const STACK = 0x1000; // the caller's stack top
const BUF = 0x2000; // argument and result buffers
const depths = {};

/** Call hardware service c with the registers given; returns the registers, the flags,
 *  the T-states it took and the bytes of stack it used. */
function svc(m, c, { a = 0, b = 0, de = 0, hl = 0 } = {}, maxCycles = 20_000_000) {
  const cpu = m.cpu.cpu;
  const saved = { pc: cpu.pc, sp: cpu.sp };
  m.write(STACK - 2, BACK & 0xff);
  m.write(STACK - 1, BACK >> 8);
  Object.assign(cpu, { a, b, c, d: de >> 8, e: de & 0xff, h: hl >> 8, l: hl & 0xff, sp: STACK - 2, pc: HWSVC });
  let low = STACK - 2;
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    if (addr >= STACK - 0x100 && addr < low) low = addr;
    write(addr, value);
  };
  const start = m.cycles;
  try {
    m.runUntil(() => m.pc === BACK, maxCycles, `hardware service ${c} returning`);
  } finally {
    m.cpu.hardware.memWrite = write;
  }
  const r = {
    a: cpu.a,
    b: cpu.b,
    de: (cpu.d << 8) | cpu.e,
    hl: (cpu.h << 8) | cpu.l,
    z: cpu.flags.Z,
    carry: cpu.flags.C,
    cycles: m.cycles - start,
    stack: STACK - 2 - low,
  };
  assert.equal(cpu.sp, STACK, `hardware service ${c} balances the stack`);
  depths[c] = Math.max(depths[c] ?? 0, r.stack);
  Object.assign(cpu, saved);
  return r;
}

const ok = (r) => {
  assert.equal(r.a, 0, "status 0");
  assert.equal(r.carry, 0, "carry clear");
  assert.equal(r.z, 1, "Z set");
};
const fails = (r, status) => {
  assert.equal(r.a, status, `status ${status}`);
  assert.equal(r.carry, 1, "carry set");
};
const bytes = (m, addr, n) => Array.from({ length: n }, (_, i) => m.read(addr + i));
const put = (m, addr, list) => list.forEach((v, i) => m.write(addr + i, v));

/** Port writes during fn(), as [port, value]. */
function outs(m, fn) {
  const seen = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (port, value) => {
    seen.push([port & 0xff, value & 0xff, m.cycles]);
    io(port, value);
  };
  try {
    return [fn(), seen];
  } finally {
    m.cpu.hardware.ioWrite = io;
  }
}

test("hardware services: information, bad numbers, digits, LCD, tone", () => {
  const m = boot(standardCard());
  const info = svc(m, HW.INFO);
  ok(info);
  assert.equal(info.b & 0x08, 0x08, "the DS1302 answers");
  assert.equal(info.de, m.sym("ROMVER"));
  assert.equal(info.hl, 0, "serial console: no columns or rows");
  assert.deepEqual(Object.values(HW), [0, 1, 2, 3, 4, 5, 6, 7, 8], "0 to 8");
  // Every number past the last refuses, and leaves B, DE and HL as they came.
  for (let n = ABI.TNCOUNT; n < 256; n += 1) {
    const r = svc(m, n, { b: 0x5a, de: 0x1234, hl: 0x5678 });
    fails(r, 1);
    assert.deepEqual([r.b, r.de, r.hl], [0x5a, 0x1234, 0x5678], `hardware service ${n} leaves the registers`);
  }

  put(m, BUF, [1, 2, 3, 4, 5, 6]);
  const [dig, dout] = outs(m, () => svc(m, HW.DIGIT, { hl: BUF }));
  ok(dig);
  const selects = dout.filter(([p]) => p === 0x01).map(([, v]) => v);
  assert.deepEqual(selects, [0x60, 0x40, 0x50, 0x40, 0x48, 0x40, 0x44, 0x40, 0x42, 0x40, 0x41, 0x40], "each digit, then off, serial idle");
  assert.deepEqual(dout.filter(([p]) => p === 0x02).map(([, v]) => v), [1, 2, 3, 4, 5, 6]);

  put(m, BUF, [..."Row two of the LCD.."].map((ch) => ch.charCodeAt(0)));
  ok(svc(m, HW.LCD, { b: 2, hl: BUF }));
  const lcd = serializeTec1gUpdateFromRuntimeState(m.tec1g.state).lcd;
  assert.equal(String.fromCharCode(...lcd.slice(40, 60)), "Row two of the LCD..");
  fails(svc(m, HW.LCD, { b: 4, hl: BUF }), 1);

  const [tone, tout] = outs(m, () => svc(m, HW.TONE, { b: 100, de: 20 }));
  ok(tone);
  const levels = tout.filter(([p]) => p === 0x01).map(([, v]) => v);
  assert.equal(levels.length, 21);
  assert.ok(levels.every((v) => (v & 0x40) !== 0), "the serial line stays idle");
  assert.deepEqual(levels.slice(0, 4), [0xc0, 0x40, 0xc0, 0x40], "the speaker bit toggles");
  assert.equal(levels.at(-1), 0x40);
  const at = tout.filter(([p]) => p === 0x01).map(([, , t]) => t);
  const halves = at.slice(1, 20).map((t, i) => t - at[i]);
  assert.deepEqual([...new Set(halves)], [16 * 100 + 51], "a half cycle of B = 100 is 16 x B + 51 T-states");
  ok(svc(m, HW.TONE, { b: 10, de: 0 }));
  assert.deepEqual(m.violations, []);
});

test("hardware services: joystick and matrix keys", () => {
  const m = boot(standardCard(), { matrix: true });
  m.tec1g.state.input.joystickState = 0x05;
  assert.equal(svc(m, HW.JOY).b, 0x05, "joystick up and left");
  m.tec1g.state.input.joystickState = 0;
  assert.equal(svc(m, HW.JOY).b, 0);

  m.tec1g.applyMatrixKey(2, 5, true);
  m.tec1g.applyMatrixKey(6, 0, true);
  ok(svc(m, HW.KEYS, { hl: BUF }));
  assert.deepEqual(bytes(m, BUF, 8), [0, 0, 0x20, 0, 0, 0, 0x01, 0]);
  m.tec1g.applyMatrixKey(2, 5, false);
  m.tec1g.applyMatrixKey(6, 0, false);
  svc(m, HW.KEYS, { hl: BUF });
  assert.deepEqual(bytes(m, BUF, 8), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(m.violations, []);
});

test("hardware services: the claim, INFO's claim bit, and text at a position", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  put(m, BUF, [..."HELLO"].map((ch) => ch.charCodeAt(0)));
  ok(svc(m, HW.PUTAT, { de: 0x0502, b: 5, hl: BUF }));
  assert.equal(m.screen()[5].slice(2, 7), "HELLO");
  ok(svc(m, HW.PUTAT, { de: 78, b: 5, hl: BUF }));
  assert.equal(m.screen()[0].slice(78), "HE", "clipped at the right edge");
  ok(svc(m, HW.PUTAT, { de: 0x1800, b: 5, hl: BUF }), "a row off the screen draws nothing");

  assert.equal(svc(m, HW.INFO).b & 0x10, 0, "not claimed");
  ok(svc(m, HW.VIDEO, { b: 1 }));
  assert.equal(svc(m, HW.INFO).b & 0x10, 0x10, "claimed");
  fails(svc(m, HW.PUTAT, { de: 0, b: 1, hl: BUF }), 2);
  ok(svc(m, HW.VIDEO, { b: 0 }));
  assert.equal(svc(m, HW.INFO).b & 0x10, 0, "released");
  assert.deepEqual([...m.tec1g.state.display.tms9918.stateSnapshot().registers.slice(0, 2)], [0x04, 0x50], "text mode again");
  assert.deepEqual(m.violations, []);
});

test("hardware services: the DS1302 clock", () => {
  const m = boot(standardCard());
  ok(svc(m, HW.RTC, { b: 0, hl: BUF }));
  // The test clock starts at 12:00:00 on Thursday 1 January 2026 and runs
  // with the emulated cycles, so the boot has used a second or two of it.
  const got = bytes(m, BUF, 7);
  assert.ok(got[0] <= 0x05, `seconds ${got[0].toString(16)}`);
  assert.deepEqual(got.slice(1), [0x00, 0x12, 0x01, 0x01, 0x04, 0x26], "minutes, hours, date, month, weekday, year");
  put(m, BUF, [0x30, 0x59, 0x12, 0x25, 0x12, 0x04, 0x26]);
  ok(svc(m, HW.RTC, { b: 1, hl: BUF }));
  ok(svc(m, HW.RTC, { b: 0, hl: BUF + 0x10 }));
  const set = bytes(m, BUF + 0x10, 7);
  assert.deepEqual(set.slice(1), [0x59, 0x12, 0x25, 0x12, 0x04, 0x26]);
  assert.ok(set[0] >= 0x30 && set[0] <= 0x31, "seconds as set");
  // The host stalls for 1.2 s between the set and the next read, and the
  // machine runs no cycles: the clock reads what it read before.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  ok(svc(m, HW.RTC, { b: 0, hl: BUF + 0x20 }));
  assert.deepEqual(bytes(m, BUF + 0x20, 7), set, "no host time counted after a stall");
  // A second of emulated cycles moves it on by one.
  const end = m.cycles + 4_000_000;
  m.runUntil(() => m.cycles >= end, 5_000_000, "a second of cycles");
  ok(svc(m, HW.RTC, { b: 0, hl: BUF + 0x30 }));
  const later = bytes(m, BUF + 0x30, 7);
  assert.equal(later[0], set[0] + 1, "a second later");
  assert.deepEqual(m.violations, []);
});

test("a volume or driver hook refusal is TNEBAD with carry, and nothing changes", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  const drives = () => Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d));
  const before = drives();
  fails(svc(m, ABI.TNDESC, { de: 40, hl: BUF }), ABI.TNEBAD); // an index past the table
  fails(svc(m, ABI.TNUNMNT, { b: 0 }), ABI.TNEBAD); // A: is never left empty
  fails(svc(m, ABI.TNMOUNT, { b: 1, de: 0 }), ABI.TNEBAD); // SYSTEM is on A: already
  assert.deepEqual(drives(), before);
  fails(svc(m, ABI.TNDRVR, { b: 1, hl: 0x3000 }), ABI.TNEBAD); // CRT: has PICO.SVC's table
  assert.deepEqual(m.violations, []);
});

test("VIDEO, RTC and the driver hook refuse any other B with TNEBAD, and nothing changes (A1)", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  const vectors = () => Array.from({ length: 8 }, (_, i) => m.read(m.sym("PIVEC") - 2 + i));
  const claim = () => m.read(m.sym("VCLAIM"));
  const before = [vectors(), claim()];
  for (const b of [2, 3, 0x80, 0xff]) {
    fails(svc(m, ABI.TNVIDEO, { b }), ABI.TNEBAD);
    const [, ports] = outs(m, () => fails(svc(m, ABI.TNRTC, { b, hl: BUF }), ABI.TNEBAD));
    assert.deepEqual(ports.filter(([p]) => p === 0xfc), [], `RTC with B = ${b} touches no clock`);
  }
  for (const b of [0, 2, 4, 5, 0xff]) fails(svc(m, ABI.TNDRVR, { b, hl: 0x3000 }), ABI.TNEBAD);
  fails(svc(m, ABI.TNDRVR, { b: 2, hl: 0 }), ABI.TNEBAD);
  assert.deepEqual([vectors(), claim()], before, "no word beside PIVEC written, no claim taken");
  assert.deepEqual(m.violations, []);
});

test("hardware services: a claim stops PUTAT only while the PICO9918 is the console", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  const m = boot(image, { tms: true, matrix: true });
  m.command("CON UC1");
  ok(svc(m, HW.VIDEO, { b: 1 }));
  ok(svc(m, HW.PUTAT, { b: 4, hl: BUF }));
  ok(svc(m, HW.VIDEO, { b: 0 }));
});

test("hardware services: stack depths", () => {
  mkdirSync(resolve(ROOT, "build"), { recursive: true });
  writeFileSync(resolve(ROOT, "build/hwsvc-stacks.json"), JSON.stringify(depths, null, 2) + "\n");
  console.log(JSON.stringify(depths));
  // The hardware services, 0 to 7 and the clock; the others' figures are abi.inc's, which KS36a's model checks.
  for (const [c, d] of Object.entries(depths).filter(([c]) => Number(c) <= ABI.TNRTC)) assert.ok(d <= (Number(c) === HW.PUTAT ? 22 : 16), `hardware service ${c} used ${d} bytes of stack`);
});

test("every service keeps IY, and all but MOUNT, UNMOUNT and DESCRIBE keep IX and the alternates too (A4)", () => {
  const image = standardCard([{ geometry: "G1M", label: "THIRD", mount: "-" }]);
  const m = boot(image, { tms: true, matrix: true });
  put(m, BUF + 0x40, [..."PICO    "].map((ch) => ch.charCodeAt(0)));
  const alt = ["a_prime", "b_prime", "c_prime", "d_prime", "e_prime", "h_prime", "l_prime"];
  const set = () => {
    const cpu = m.cpu.cpu;
    Object.assign(cpu, { ix: 0x1357, iy: 0x2468 });
    alt.forEach((r, i) => (cpu[r] = 0x31 + i));
    return () => ({ ix: cpu.ix, iy: cpu.iy, alt: alt.map((r) => cpu[r]) });
  };
  const kept = { ix: 0x1357, iy: 0x2468, alt: alt.map((_, i) => 0x31 + i) };
  const calls = [
    ["TNINFO", {}], ["TNDIGIT", { hl: BUF }], ["TNLCD", { b: 3, hl: BUF }], ["TNVIDEO", { b: 1 }], ["TNVIDEO", { b: 0 }],
    ["TNTONE", { b: 1, de: 2 }], ["TNJOY", {}], ["TNKEYS", { hl: BUF }], ["TNPUTAT", { b: 2, hl: BUF }], ["TNRTC", { b: 0, hl: BUF }],
    ["TNDESC", { de: 2, hl: BUF }], ["TNUNMNT", { b: 1 }], ["TNMOUNT", { b: 1, de: 1 }],
    ["TNDRVR", { b: 1, hl: 0x3000 }], ["TNFIND", { b: 1, de: BUF + 0x40 }], ["TNLIST", { b: 0 }],
  ];
  for (const [name, regs] of calls) {
    const read = set();
    svc(m, ABI[name], regs);
    const after = read();
    assert.equal(after.iy, kept.iy, `${name} keeps IY`);
    if (["TNMOUNT", "TNUNMNT", "TNDESC"].includes(name)) continue; // abi.inc lets these change IX and the alternates
    assert.deepEqual(after, kept, `${name} keeps IX, IY and the alternates`);
  }
  assert.deepEqual(m.violations, []);
});
