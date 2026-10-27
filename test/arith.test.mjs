// DIV16 and PUTDEC in the ROM, and the BDOS's track and sector through
// DIV16 at the far end of an 8 MiB volume. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, standardCard, volume } from "./lib/fixtures.mjs";

const BACK = 0x0f00;
const STACK = 0x1000;

function caller(m) {
  return (addr, { hl = 0, de = 0, c = 0 } = {}) => {
    const cpu = m.cpu.cpu;
    const saved = { pc: cpu.pc, sp: cpu.sp };
    m.write(STACK - 2, BACK & 0xff);
    m.write(STACK - 1, BACK >> 8);
    Object.assign(cpu, { c, d: de >> 8, e: de & 0xff, h: hl >> 8, l: hl & 0xff, sp: STACK - 2, pc: addr });
    const t0 = m.cycles;
    m.runUntil(() => m.pc === BACK, 200_000_000, `the return from ${addr.toString(16)}`);
    const r = { a: cpu.a, de: (cpu.d << 8) | cpu.e, hl: (cpu.h << 8) | cpu.l, t: m.cycles - t0 };
    Object.assign(cpu, saved);
    return r;
  };
}

test("DIV16 divides HL by DE for divisors up to 8000h, in at most 1,300 T-states", () => {
  const m = boot(standardCard());
  const call = caller(m);
  const pairs = [[0, 1], [65535, 1], [65535, 10], [65535, 64], [65535, 32768], [32767, 32768], [12345, 7], [9, 10], [100, 100]];
  let x = 99;
  for (let i = 0; i < 200; i += 1) pairs.push([(x = (x * 75 + 74) % 65537) & 0xffff, 1 + ((x * 31) % 32768)]);
  for (const [a, b] of pairs) {
    const r = call(m.sym("DIV16"), { hl: a, de: b });
    assert.deepEqual([r.de, r.hl], [Math.floor(a / b), a % b], `${a} / ${b}`);
    assert.ok(r.t <= 1300, `${a} / ${b}: ${r.t} T-states`);
  }
});

test("PUTDEC prints HL in decimal without leading zeros", () => {
  const m = boot(standardCard());
  const call = caller(m);
  for (const n of [0, 1, 9, 10, 99, 100, 1000, 9999, 10000, 12345, 32768, 65535]) {
    m.mark = m.output.length;
    call(m.sym("PUTDEC"), { hl: n });
    assert.equal(m.text(m.mark), String(n));
  }
});

test("random records at the end of the 8 MiB volume are written and read where the host puts them", () => {
  const image = standardCard();
  const m = boot(image);
  const call = caller(m);
  const FCB = 0x005c;
  const fcb = [2, ...Buffer.from("FAR     DAT"), ...new Array(24).fill(0)];
  fcb.forEach((v, i) => m.write(FCB + i, v));
  assert.notEqual(call(5, { c: 22, de: FCB }).a, 0xff);
  const recs = [0, 1, 63, 64, 4095, 4096, 30000, 32767, 40000, 50000, 65534];
  for (const r of recs) {
    for (let k = 0; k < 128; k += 1) m.write(0x80 + k, (r + k) & 0xff);
    m.write(FCB + 33, r & 0xff);
    m.write(FCB + 34, r >> 8);
    m.write(FCB + 35, 0);
    assert.equal(call(5, { c: 34, de: FCB }).a, 0, `write ${r}`);
  }
  assert.notEqual(call(5, { c: 16, de: FCB }).a, 0xff);
  const back = volume(image, "B").read("FAR.DAT");
  for (const r of recs) assert.deepEqual(back.subarray(r * 128, r * 128 + 128), Uint8Array.from({ length: 128 }, (_, k) => (r + k) & 0xff), `record ${r}`);
  for (const r of recs) {
    m.write(FCB + 33, r & 0xff);
    m.write(FCB + 34, r >> 8);
    assert.equal(call(5, { c: 33, de: FCB }).a, 0, `read ${r}`);
    assert.equal(m.read(0x80), r & 0xff, `read ${r} back`);
  }
});
