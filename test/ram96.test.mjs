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

// TEC-OS on the 96K model (KS9 items 1 and 2): cold boot counts the MAIN
// regions and gives MAIN 1 a copy of page zero; a warm boot from MAIN 1 or
// from EXPAND 1 comes back in MAIN 0 and EXPAND 0.
const FILL = 0x76;
const mainsAt = (m) => m.read(m.read(0xff0e) | (m.read(0xff0f) << 8));
const defined = [0x00, 0x01, 0x02, 0x05, 0x06, 0x07, ...Array.from({ length: 0x33 }, (_, i) => 0x08 + i), 0x41, 0x44, 0x66, 0x67];

test("cold boot counts the MAIN regions and leaves MAIN 1 as it found it, but for page zero", { skip: !ram96 }, () => {
  for (const mains of [1, 2]) {
    const m = boot(standardCard(), { ram96: true, mains, ramFill: FILL });
    assert.ok(m.read(0xff03) === 2 && m.read(0xff04) >= 1, "ABI 2.1 or later");
    assert.equal(mainsAt(m), mains, `${mains} MAIN region(s) found`);
    if (mains === 2) {
      const p1 = m.main[1];
      const changed = [];
      for (let a = 0x0100; a < 0x8000; a += 1) if (p1[a] !== FILL) changed.push(a);
      assert.deepEqual(changed, [], "MAIN 1 untouched above page zero");
      for (const a of defined) assert.equal(p1[a], m.main[0][a], `page zero byte ${a.toString(16)}h copied`);
    }
    const h1 = m.expand[1];
    const touched = [];
    const warm = m.sym("RAMBIOS") + 3;
    // Above the block cache's lines and table (8000h-BCFFh, which the boot's
    // reads fill), EXPAND 1 is clear but for warm boot's jump.
    for (let a = 0x3d00; a < 0x4000; a += 1) if (h1[a] !== 0 && a + 0x8000 !== warm && a + 0x8000 !== warm + 1 && a + 0x8000 !== warm + 2) touched.push(a + 0x8000);
    assert.deepEqual(touched, [], "EXPAND 1 cleared above the cache but for its warm-boot jump");
    assert.deepEqual(m.violations, []);
  }
});

test("a warm boot from MAIN 1 or from EXPAND 1 returns to MAIN 0 and EXPAND 0", { skip: !ram96 }, () => {
  // Each stub selects the other memory and jumps to 0000h: from 9000h for
  // MAIN 1 (code must sit above 8000h), from 0200h for EXPAND 1 (below it).
  for (const [at, latch, what] of [
    [0x9000, 0x09, "MAIN 1"],
    [0x0200, 0x05, "EXPAND 1"],
  ]) {
    const m = boot(standardCard(), { ram96: true });
    [0x3e, latch, 0xd3, 0xff, 0xc3, 0x00, 0x00].forEach((b, i) => m.write(at + i, b));
    m.mark = m.output.length;
    m.cpu.cpu.pc = at;
    m.runUntil(() => m.waitingForInput() && /A>$/.test(m.text(m.mark)), 200_000_000, `the prompt after an exit from ${what}`);
    assert.equal(m.sysCtrl & 0x0c, 0, `MAIN 0 and EXPAND 0 after an exit from ${what}`);
    assert.deepEqual(m.violations, []);
  }
});
