// The ROM's own clients on the table: DEMO.COM, MOUNT.COM and VOLS.COM each test
// the tag and major version 4, stop with a word on any other, and run on 4.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, program, romFor, standardCard, volume } from "./lib/fixtures.mjs";

/** A serial board at its prompt, the ROM's bytes at C003h changed as `edit` says. */
async function machine(edit = () => {}) {
  const { rom, symbols } = romFor();
  const patched = Uint8Array.from(rom);
  edit(patched);
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of ["demo", "mount", "vols"]) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  const m = new Machine({ rom: patched, symbols, sdImage: image, clock: TEST_CLOCK });
  m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}

const MAJOR3 = (r) => (r[6] = 3);
const NOTAG = (r) => (r[3] = 0x58);
const WORDS = { DEMO: "DEMO needs TEC-OS with ABI 4.", "MOUNT B:": "MOUNT needs TEC-OS with ABI 4.", VOLS: "VOLS needs TEC-OS with ABI 4." };

for (const [line, word] of Object.entries(WORDS)) {
  for (const [why, edit] of [["major 3", MAJOR3], ["no TNA tag", NOTAG]]) {
    test(`${line} refuses ${why}`, async () => {
      const m = await machine(edit);
      assert.ok(m.command(line).includes(word));
      assert.deepEqual(m.violations, []);
    });
  }
}

test("MOUNT and VOLS run on major 4", async () => {
  const m = await machine();
  assert.match(m.command("VOLS"), /^00 SYSTEM/m);
  assert.match(m.command("MOUNT B:"), /B:/);
  assert.deepEqual(m.violations, []);
});
