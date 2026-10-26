// The FF0Bh hardware services, called directly at the A> prompt with the
// arguments in the registers and a return address on a stack in the TPA.
// Every write below that stack counts towards the service's stack depth.
// Emulator evidence; the depths go to build/hwsvc-stacks.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { ROOT, boot, standardCard } from "./lib/fixtures.mjs";

const HWSVC = 0xff0b;
const BACK = 0x0f00; // the sentinel return address
const STACK = 0x1000; // the caller's stack top
const BUF = 0x2000; // argument and result buffers
const depths = {};

/** Call service c with the registers given; returns the registers, the flags,
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
    m.runUntil(() => m.pc === BACK, maxCycles, `service ${c} returning`);
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
  assert.equal(cpu.sp, STACK, `service ${c} balances the stack`);
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
const words = (...w) => w.flatMap((v) => [v & 0xff, v >> 8]);

/** Port writes during fn(), as [port, value]. */
function outs(m, fn) {
  const seen = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (port, value) => {
    seen.push([port & 0xff, value & 0xff]);
    io(port, value);
  };
  try {
    return [fn(), seen];
  } finally {
    m.cpu.hardware.ioWrite = io;
  }
}

test("hardware services: information, bad numbers, digits, LEDs, LCD, tone, delay", () => {
  const m = boot(standardCard());
  const info = svc(m, 0);
  ok(info);
  assert.equal(info.b & 0x08, 0x08, "the DS1302 answers");
  assert.equal(info.de, m.sym("ROMVER"));
  assert.equal(info.hl, 0, "serial console: no columns or rows");
  fails(svc(m, 19), 1);
  fails(svc(m, 0xff), 1);

  const hex = Array.from({ length: 16 }, (_, n) => svc(m, 2, { a: n }).b);
  assert.deepEqual(hex.slice(0, 4), [0xeb, 0x28, 0xcd, 0xad]);
  assert.equal(svc(m, 2, { a: 0x1f }).b, 0x47, "only the low four bits");

  put(m, BUF, [1, 2, 3, 4, 5, 6]);
  const [dig, dout] = outs(m, () => svc(m, 1, { hl: BUF }));
  ok(dig);
  const selects = dout.filter(([p]) => p === 0x01).map(([, v]) => v);
  assert.deepEqual(selects, [0x60, 0x40, 0x50, 0x40, 0x48, 0x40, 0x44, 0x40, 0x42, 0x40, 0x41, 0x40], "each digit, then off, serial idle");
  assert.deepEqual(dout.filter(([p]) => p === 0x02).map(([, v]) => v), [1, 2, 3, 4, 5, 6]);

  put(m, BUF, Array.from({ length: 24 }, (_, i) => i));
  const [led, lout] = outs(m, () => svc(m, 3, { hl: BUF }));
  ok(led);
  const rows = lout.filter(([p, v]) => p === 0x05 && v).map(([, v]) => v);
  assert.deepEqual(rows, [1, 2, 4, 8, 16, 32, 64, 128]);
  assert.deepEqual(lout.at(-1), [0x05, 0], "all rows off at the end");
  assert.deepEqual(lout.filter(([p]) => p === 0xf9).map(([, v]) => v), [2, 5, 8, 11, 14, 17, 20, 23], "blue bytes");

  put(m, BUF, [..."Row two of the LCD.."].map((ch) => ch.charCodeAt(0)));
  ok(svc(m, 4, { b: 2, hl: BUF }));
  const lcd = serializeTec1gUpdateFromRuntimeState(m.tec1g.state).lcd;
  assert.equal(String.fromCharCode(...lcd.slice(40, 60)), "Row two of the LCD..");
  fails(svc(m, 4, { b: 4, hl: BUF }), 1);

  const [tone, tout] = outs(m, () => svc(m, 6, { b: 100, de: 20 }));
  ok(tone);
  const levels = tout.filter(([p]) => p === 0x01).map(([, v]) => v);
  assert.equal(levels.length, 21);
  assert.ok(levels.every((v) => (v & 0x40) !== 0), "the serial line stays idle");
  assert.deepEqual(levels.slice(0, 4), [0xc0, 0x40, 0xc0, 0x40], "the speaker bit toggles");
  assert.equal(levels.at(-1), 0x40);
  const half = tone.cycles / 20;
  assert.ok(half > 1640 && half < 1680, `a half cycle of B = 100 is about 1,659 T-states, not ${half}`);
  ok(svc(m, 6, { b: 10, de: 0 }));

  const ms = svc(m, 11, { de: 10 }).cycles / 10;
  assert.ok(Math.abs(ms - 4000) < 80, `a millisecond is about 4,000 T-states at 4 MHz, not ${ms}`);
  assert.ok(svc(m, 11, { de: 0 }).cycles < 260, "no wait beyond the dispatch");
  assert.deepEqual(m.violations, []);
});

test("hardware services: joystick, matrix keys, serial, card blocks, random numbers", () => {
  const image = standardCard();
  const m = boot(image, { matrix: true });
  m.tec1g.state.input.joystickState = 0x05;
  assert.equal(svc(m, 7).b, 0x05, "joystick up and right");
  m.tec1g.state.input.joystickState = 0;
  assert.equal(svc(m, 7).b, 0);

  m.tec1g.applyMatrixKey(2, 5, true);
  m.tec1g.applyMatrixKey(6, 0, true);
  ok(svc(m, 8, { hl: BUF }));
  assert.deepEqual(bytes(m, BUF, 8), [0, 0, 0x20, 0, 0, 0, 0x01, 0]);
  m.tec1g.applyMatrixKey(2, 5, false);
  m.tec1g.applyMatrixKey(6, 0, false);
  svc(m, 8, { hl: BUF });
  assert.deepEqual(bytes(m, BUF, 8), [0, 0, 0, 0, 0, 0, 0, 0]);

  const sent = m.serial.length;
  ok(svc(m, 9, { a: 0xa5, b: 0 }));
  assert.deepEqual([...m.serial.slice(sent)], [0xa5]);
  const timeout = svc(m, 9, { b: 1, de: 3 }, 100_000);
  fails(timeout, 3);
  assert.ok(timeout.cycles > 3 * 3800 && timeout.cycles < 5 * 4200, `about 4 ms of waiting, not ${timeout.cycles}`);
  m.tec1g.queueSerial([0x3c]);
  const nul = svc(m, 9, { b: 1, de: 1000 }, 10_000_000); // the emulator's line sends a NUL first
  ok(nul);
  assert.equal(nul.b, 0);
  const rx = svc(m, 9, { b: 1, de: 1000 }, 10_000_000);
  ok(rx);
  assert.equal(rx.b, 0x3c);

  put(m, BUF, [0, 0, 0, 0]);
  ok(svc(m, 10, { hl: BUF, de: BUF + 0x100 }));
  assert.deepEqual(bytes(m, BUF + 0x100, 512), [...image.slice(0, 512)], "block 0 of the card");
  put(m, BUF, [3, 0, 0, 0]);
  ok(svc(m, 10, { hl: BUF, de: BUF + 0x100 }));
  assert.deepEqual(bytes(m, BUF + 0x100, 512), [...image.slice(3 * 512, 4 * 512)], "block 3, least significant byte first");

  m.write(m.sym("RNDST"), 0);
  m.write(m.sym("RNDST") + 1, 0);
  let x = 0xace1;
  for (let i = 0; i < 5; i++) {
    x ^= (x << 7) & 0xffff;
    x ^= x >> 9;
    x ^= (x << 8) & 0xffff;
    const r = svc(m, 17);
    ok(r);
    assert.equal(r.hl, x, `random number ${i}`);
  }
  assert.deepEqual(m.violations, []);
});

test("hardware services: the claimed PICO9918 and text at a position", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  const vdp = () => m.tec1g.state.display.tms9918.stateSnapshot();
  put(m, BUF, [..."HELLO"].map((ch) => ch.charCodeAt(0)));
  ok(svc(m, 16, { de: 0x0502, b: 5, hl: BUF }));
  assert.equal(m.screen()[5].slice(2, 7), "HELLO");
  ok(svc(m, 16, { de: 78, b: 5, hl: BUF }));
  assert.equal(m.screen()[0].slice(78), "HE", "clipped at the right edge");
  ok(svc(m, 16, { de: 0x1800, b: 5, hl: BUF }), "a row off the screen draws nothing");

  fails(svc(m, 12, { a: 0, b: 7 }), 5);
  fails(svc(m, 13, { a: 0, de: 4, hl: 0 }), 5);
  fails(svc(m, 14, { hl: BUF }), 5);
  fails(svc(m, 15, { hl: BUF }), 5);

  ok(svc(m, 5, { b: 1 }));
  fails(svc(m, 16, { de: 0, b: 1, hl: BUF }), 2);
  ok(svc(m, 12, { a: 0xf4, b: 7 }));
  assert.equal(vdp().registers[7], 0xf4);
  ok(svc(m, 13, { a: 0x5a, de: 300, hl: 0x3000 }));
  const v = vdp().vram;
  assert.ok(v.slice(0x3000, 0x3000 + 300).every((b) => b === 0x5a));
  put(m, BUF + 0x10, Array.from({ length: 40 }, (_, i) => i * 3));
  put(m, BUF, words(0x3200, BUF + 0x10, 40));
  ok(svc(m, 14, { hl: BUF }));
  assert.deepEqual([...vdp().vram.slice(0x3200, 0x3228)], bytes(m, BUF + 0x10, 40));
  put(m, BUF, words(0x3000, BUF + 0x100, 300));
  ok(svc(m, 15, { hl: BUF }));
  assert.ok(bytes(m, BUF + 0x100, 300).every((b) => b === 0x5a), "VRAM read back");
  ok(svc(m, 5, { b: 0 }));
  assert.deepEqual([...vdp().registers.slice(0, 2)], [0x04, 0x50], "text mode again");
  assert.deepEqual(m.violations, []);
});

test("hardware services: the DS1302 clock", () => {
  const m = boot(standardCard());
  ok(svc(m, 18, { b: 0, hl: BUF }));
  const now = new Date();
  const bcd = (n) => ((n / 10) << 4) | n % 10;
  const got = bytes(m, BUF, 7);
  assert.equal(got[3], bcd(now.getDate()), "date");
  assert.equal(got[4], bcd(now.getMonth() + 1), "month");
  assert.equal(got[6], bcd(now.getFullYear() % 100), "year");
  put(m, BUF, [0x30, 0x59, 0x12, 0x25, 0x12, 0x04, 0x26]);
  ok(svc(m, 18, { b: 1, hl: BUF }));
  ok(svc(m, 18, { b: 0, hl: BUF + 0x10 }));
  const set = bytes(m, BUF + 0x10, 7);
  assert.deepEqual(set.slice(1), [0x59, 0x12, 0x25, 0x12, 0x04, 0x26]);
  assert.ok(set[0] >= 0x30 && set[0] <= 0x31, "seconds as set");
  assert.deepEqual(m.violations, []);
});

test("hardware services: stack depths", () => {
  mkdirSync(resolve(ROOT, "build"), { recursive: true });
  writeFileSync(resolve(ROOT, "build/hwsvc-stacks.json"), JSON.stringify(depths, null, 2) + "\n");
  console.log(JSON.stringify(depths));
  for (const [c, d] of Object.entries(depths)) assert.ok(d <= 16, `service ${c} used ${d} bytes of stack`);
});
