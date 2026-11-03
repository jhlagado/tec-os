// The harness's 96K option (KS9): the system latch decoded as the TEC-1G
// documentation's 96K scheme. Bit 3 (MAIN) picks MAIN 0 or MAIN 1 at
// 0000h-7FFFh, bit 2 (EXPAND) EXPAND 0 or EXPAND 1 at 8000h-BFFFh, and neither
// moves the other region or ROM. Emulator evidence about the harness itself. TEST_RAM96=0
// runs the same checks with the option off, where they fail: the runtime
// decodes bits 3-6 as a bank field for the window.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { boot, romFor, standardCard } from "./lib/fixtures.mjs";

const ram96 = process.env.TEST_RAM96 !== "0";
const MAIN = 0x08;
const EXPAND = 0x04;

function machine(mains) {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, ram96, mains });
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

test("latch bit 3 switches only MAIN and bit 2 only EXPAND, as the 96K board does", () => {
  const m = machine(2);
  const rom = Array.from({ length: 16 }, (_, i) => m.read(0xc000 + i * 1024));
  const seen = marks(m, [0, MAIN, EXPAND, MAIN | EXPAND]);
  const main = (s) => seen[s].slice(0, 3);
  const expand = (s) => seen[s].slice(3);
  assert.notDeepEqual(main(0), main(MAIN), "bit 3 shows MAIN 1");
  assert.deepEqual(main(0), main(EXPAND), "bit 2 leaves MAIN 0");
  assert.deepEqual(main(MAIN), main(MAIN | EXPAND), "bit 2 leaves MAIN 1");
  assert.notDeepEqual(expand(0), expand(EXPAND), "bit 2 shows EXPAND 1");
  assert.deepEqual(expand(0), expand(MAIN), "bit 3 leaves EXPAND 0");
  assert.deepEqual(expand(EXPAND), expand(MAIN | EXPAND), "bit 3 leaves EXPAND 1");
  for (const s of [MAIN, EXPAND, MAIN | EXPAND]) {
    m.latch(s);
    assert.deepEqual(Array.from({ length: 16 }, (_, i) => m.read(0xc000 + i * 1024)), rom, `ROM in view with latch ${s}`);
  }
});

test("without MAIN 1, bit 3 changes nothing", () => {
  const m = machine(1);
  const seen = marks(m, [0, MAIN]);
  assert.deepEqual(seen[0], seen[MAIN]);
});
