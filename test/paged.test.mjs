// The harness's paged memory option (KS9): the system latch decoded as the
// TEC-1G documentation's 96K scheme. Bit 3 picks the low page at
// 0000h-7FFFh, bit 2 the U9 half at 8000h-BFFFh, and neither moves the other
// region or ROM. Emulator evidence about the harness itself. TEST_PAGED=0
// runs the same checks with the option off, where they fail: the runtime
// decodes bits 3-6 as a bank field for the window (D03).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { boot, romFor, standardCard } from "./lib/fixtures.mjs";

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

// TEC-OS on the paged model (KS9 items 1 and 2): cold boot counts the low
// pages and gives low page 1 a copy of page zero; a warm boot from page 1 or
// from U9 half 1 comes back in page 0 and half 0.
const FILL = 0x76;
const pagesAt = (m) => m.read(m.read(0xff0e) | (m.read(0xff0f) << 8));
const defined = [0x00, 0x01, 0x02, 0x05, 0x06, 0x07, ...Array.from({ length: 0x33 }, (_, i) => 0x08 + i), 0x41, 0x66, 0x67];

test("cold boot counts the low pages and leaves page 1 as it found it, but for page zero", { skip: !paged }, () => {
  for (const lowPages of [1, 2]) {
    const m = boot(standardCard(), { paged: true, lowPages, ramFill: FILL });
    assert.deepEqual([m.read(0xff03), m.read(0xff04)], [2, 1], "ABI 2.1");
    assert.equal(pagesAt(m), lowPages, `${lowPages} low page(s) found`);
    if (lowPages === 2) {
      const p1 = m.lowPages[1];
      const changed = [];
      for (let a = 0x0100; a < 0x8000; a += 1) if (p1[a] !== FILL) changed.push(a);
      assert.deepEqual(changed, [], "page 1 untouched above page zero");
      for (const a of defined) assert.equal(p1[a], m.lowPages[0][a], `page zero byte ${a.toString(16)}h copied`);
    }
    const h1 = m.halves[1];
    const touched = [];
    for (let a = 0; a < 0x4000; a += 1) if (h1[a] !== FILL) touched.push(a + 0x8000);
    assert.deepEqual(touched, [0xb503, 0xb504, 0xb505], "U9 half 1: only its warm-boot jump");
    assert.deepEqual(m.violations, []);
  }
});

test("a warm boot from low page 1 or from U9 half 1 returns to page 0 and half 0", { skip: !paged }, () => {
  // Each stub selects the other memory and jumps to 0000h: from 9000h for low
  // page 1 (code must sit above 8000h), from 0200h for half 1 (below it).
  for (const [at, latch, what] of [
    [0x9000, 0x09, "low page 1"],
    [0x0200, 0x05, "U9 half 1"],
  ]) {
    const m = boot(standardCard(), { paged: true });
    [0x3e, latch, 0xd3, 0xff, 0xc3, 0x00, 0x00].forEach((b, i) => m.write(at + i, b));
    m.mark = m.output.length;
    m.cpu.cpu.pc = at;
    m.runUntil(() => m.waitingForInput() && /A>$/.test(m.text(m.mark)), 200_000_000, `the prompt after an exit from ${what}`);
    assert.equal(m.sysCtrl & 0x0c, 0, `page 0 and half 0 after an exit from ${what}`);
    assert.deepEqual(m.violations, []);
  }
});
