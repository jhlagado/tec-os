// NMI from the hex keypad (74C923) cannot be masked. These tests press the
// keypad repeatedly through cold boot, the overlay exit and the native bank
// calls and copies. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { program, romFor, standardCard, volume, boot } from "./lib/fixtures.mjs";

/** Step until done(), pressing a keypad key every `every` cycles from `start`. */
function runWithNmis(m, done, { every, start = 0, enabled = () => true, maxCycles = 2_000_000_000 }) {
  let next = m.cycles + start;
  let taken = 0;
  const limit = m.cycles + maxCycles;
  while (!done()) {
    if (m.cycles >= next && enabled()) {
      m.tec1g.applyKey(0x00);
      next = m.cycles + every;
    }
    const before = m.pc;
    m.step();
    if (m.pc === 0x0066 && before !== 0x0065) taken += 1;
    if (m.cycles > limit) throw new Error(`not done; pc=${m.pc.toString(16)}\n${m.text()}`);
  }
  return taken;
}

test("cold boot survives NMIs from the first instruction after LD SP onwards", () => {
  const { rom, symbols } = romFor();
  for (const every of [997, 1499, 4001]) {
    const m = new Machine({ rom, symbols, sdImage: standardCard() });
    const taken = runWithNmis(m, () => /A>$/.test(m.text()), { every, start: 11 });
    assert.ok(taken > 100, `only ${taken} NMIs taken`);
    assert.match(m.text(), /A: SYSTEM/);
    assert.equal(m.sysCtrl, 0x01);
    assert.deepEqual(m.violations, []);
  }
});

test("native bank calls and copies survive NMIs", { timeout: 900_000 }, async () => {
  const image = standardCard();
  volume(image, "A").write("NATDEMO.TNX", (await program("natdemo", { base: 0x0780 })).bytes);
  const m = boot(image);
  m.mark = m.output.length;
  m.type("NATDEMO\r");
  const osmode = m.sym("OSMODE");
  const taken = runWithNmis(m, () => /NATIVE DONE\r\n\r\nA>$/.test(m.text(m.mark)), {
    every: 2003,
    enabled: () => m.read(osmode) === 1,
  });
  const out = m.text(m.mark);
  assert.ok(taken > 500, `only ${taken} NMIs taken`);
  assert.deepEqual(out.match(/N\d\d FAIL/g) ?? [], []);
  assert.equal((out.match(/N\d\d ok/g) ?? []).length, 13);
  assert.deepEqual(m.violations, []);
});
