// What is left of the CCP's own commands once nested levels went: CCP and EXIT
// are names like any other, UNLOAD is last in, first out, the freed page of
// EXPAND 1 stays free, and a program's and a warm boot's route to the prompt.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, driver, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C

async function machine(files = {}, opts = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("RES.DRV", await driver("res"));
  for (const [n, b] of Object.entries(files)) a.write(n, b);
  return boot(image, opts);
}

for (const name of ["CCP", "EXIT"]) {
  test(`${name} says so with no file, and runs a file of that name`, async () => {
    const none = await machine();
    assert.match(none.command(name), new RegExp(`${name}\\?`));
    const m = await machine({ [`${name}.COM`]: SAY });
    assert.match(m.command(name), /C\r\n/);
    assert.deepEqual([m.violations, m.read(4)], [[], 0], "no level, and the same drive");
  });
}

test("UNLOAD is refused with no resident, and removes residents last in, first out", async () => {
  const m = await machine();
  assert.match(m.command("UNLOAD"), /UNLOAD\?/);
  const stub = word(m, 6);
  m.command("RES.DRV");
  m.command("RES.DRV");
  assert.equal(word(m, 6), stub - 0x200);
  m.command("UNLOAD");
  assert.equal(word(m, 6), stub - 0x100);
  m.command("UNLOAD");
  assert.equal(word(m, 6), stub);
  assert.match(m.command("UNLOAD"), /UNLOAD\?/);
  assert.deepEqual(m.violations, []);
});

test("nothing is kept for a level: the table ends at ABIDRV and the page at BE00h is free", async () => {
  const m = await machine({}, { ram96: true });
  assert.equal(m.read(m.sym("XMARK")), 0x80, "no range for MOVE in EXPAND 1");
  assert.equal(m.sym("HRING"), 0xbd00);
  assert.equal(m.sym("ABIEND"), m.sym("ABIDRV") + 3);
  assert.deepEqual(m.violations, []);
});

test("a write to BE00h-BEFFh in EXPAND 1 fails the host's watch, and BDFFh and BF00h do not", async () => {
  const m = await machine();
  const poke = (a) => {
    // EXPAND 1 in view, one byte written, EXPAND 0 back, from a stub in page zero.
    [0x3e, 0x05, 0xd3, 0xff, 0x3e, 0xa5, 0x32, a & 0xff, a >> 8, 0x3e, 0x01, 0xd3, 0xff, 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
    const { pc, sp } = m.cpu.cpu;
    Object.assign(m.cpu.cpu, { pc: 0x60, sp: 0x100 });
    m.runUntil(() => m.pc === 0x6d, 1_000_000, "the stub");
    Object.assign(m.cpu.cpu, { pc, sp });
  };
  for (const a of [0xbdff, 0xbf00]) poke(a);
  assert.deepEqual(m.expand1Writes, []);
  for (const a of [0xbe00, 0xbeff]) poke(a);
  assert.deepEqual(m.expand1Writes.map((w) => w.addr), [0xbe00, 0xbeff]);
  EXPAND1_WRITES.length = 0; // the two writes this test made, which the file's end would otherwise fail
});

test("startup lines go on after ^C at a program", async () => {
  const WAIT = Uint8Array.from([0x0e, 0x01, 0xcd, 0x05, 0x00, 0xc9]); // reads a key
  const image = standardCard();
  const a = volume(image, "A");
  a.write("WAIT.COM", WAIT);
  a.write("STARTUP.CMD", startupFile("WAIT", "USER 3"));
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
  m.expect(/WAIT\r/, { from: 0, maxCycles: 200_000_000 });
  m.type("\x03");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  assert.equal(m.read(4) >> 4, 3, "the next line ran");
});
