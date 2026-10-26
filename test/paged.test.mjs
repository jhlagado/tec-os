// The harness's paged memory option (KS9): the system latch decoded as the
// TEC-1G documentation's 96K scheme. Bit 3 picks the low page at
// 0000h-7FFFh, bit 2 the U9 half at 8000h-BFFFh, and neither moves the other
// region or ROM. Emulator evidence about the harness itself. TEST_PAGED=0
// runs the same checks with the option off, where they fail: the runtime
// decodes bits 3-6 as a bank field for the window (D03).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { romFor } from "./lib/fixtures.mjs";

const paged = process.env.TEST_PAGED !== "0";
const LOWPAGE = 0x08;
const EXPAND = 0x04;

function machine(lowPages) {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, paged, lowPages });
  m.latch = (v) => m.cpu.hardware.ioWrite(0xff, v | 0x01); // overlay off
  return m;
}

// Write a different marker into each region under each latch setting, then
// read them all back under each setting.
const SPOTS = [0x0000, 0x0100, 0x7fff, 0x8000, 0xb400, 0xbfff];
function marks(m, settings) {
  for (const s of settings) {
    m.latch(s);
    for (const a of SPOTS) m.write(a, (a >> 8) ^ (a & 0xff) ^ (s * 17));
  }
  return Object.fromEntries(settings.map((s) => [s, (m.latch(s), SPOTS.map((a) => m.read(a)))]));
}

test("latch bit 3 switches only the low 32 KiB and bit 2 only the window, as the 96K board does", () => {
  const m = machine(2);
  const rom = Array.from({ length: 16 }, (_, i) => m.read(0xc000 + i * 1024));
  const seen = marks(m, [0, LOWPAGE, EXPAND, LOWPAGE | EXPAND]);
  const low = (s) => seen[s].slice(0, 3);
  const win = (s) => seen[s].slice(3);
  assert.notDeepEqual(low(0), low(LOWPAGE), "bit 3 shows another low page");
  assert.deepEqual(low(0), low(EXPAND), "bit 2 leaves the low page");
  assert.deepEqual(low(LOWPAGE), low(LOWPAGE | EXPAND), "bit 2 leaves low page 1");
  assert.notDeepEqual(win(0), win(EXPAND), "bit 2 shows the other U9 half");
  assert.deepEqual(win(0), win(LOWPAGE), "bit 3 leaves the window");
  assert.deepEqual(win(EXPAND), win(LOWPAGE | EXPAND), "bit 3 leaves window half 1");
  for (const s of [LOWPAGE, EXPAND, LOWPAGE | EXPAND]) {
    m.latch(s);
    assert.deepEqual(Array.from({ length: 16 }, (_, i) => m.read(0xc000 + i * 1024)), rom, `ROM in view with latch ${s}`);
  }
});

test("without the second low page, bit 3 changes nothing", () => {
  const m = machine(1);
  const seen = marks(m, [0, LOWPAGE]);
  assert.deepEqual(seen[0], seen[LOWPAGE]);
});
