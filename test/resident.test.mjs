// Residents and BDOS function 108: a service's place below (0006h), removal
// last in, first out, and the program return code. The PRL loader went in
// KS36a. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, service, program, standardCard, volume } from "./lib/fixtures.mjs";

const STUB = 0x0080;
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const bytes = (m, a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));

async function machine(files, opts = {}) {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  for (const [name, data] of Object.entries(files)) volume(image, "A").write(name, data);
  return boot(image, opts);
}

/** Run code from 0080h to its final JR $; A, HL and carry back. */
function run(m, code) {
  [...code, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.pc === STUB + code.length, 20_000_000, "the stub");
  const c = m.cpu.cpu;
  return { a: c.a, hl: (c.h << 8) | c.l, carry: c.flags.C };
}
const back = (m) => {
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /\r\nA>$/.test(m.text(m.mark)), 200_000_000, "the prompt");
};

test("a resident goes below (0006h), chains its BDOS jump, and warm boot keeps it", async () => {
  const m = await machine({ "RES.SVC": await service("res"), "HOOK.COM": (await program("hook")).bytes });
  const stub = word(m, 6);
  const p1 = (stub >> 8) - 1; // one page below the stub's
  m.command("RES.SVC");
  assert.equal(word(m, 6), p1 << 8, "(0006h) is the resident's base");
  assert.equal(word(m, m.sym("PZTOP")), p1 << 8);
  assert.equal(word(m, m.sym("RAMBIOS") + 13) >> 8, p1, "its INIT hooked CONOUT");
  m.command("RES.SVC");
  const low = (p1 - 1) << 8;
  assert.equal(word(m, 6), low, "a second resident below the first");
  assert.equal(word(m, low + 1), m.sym("BENTRY"), "its JP is straight into the BDOS");
  // Warm boots by ^C, JP 0000h and BDOS function 0, and a disk error.
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  assert.equal(word(m, 6), low, "after ^C");
  back(m);
  assert.equal(word(m, 6), low, "after JP 0000h");
  m.mark = m.output.length;
  [0x0e, 0x00, 0xcd, 0x05, 0x00].forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.waitingForInput() && /\r\nA>$/.test(m.text(m.mark)), 200_000_000, "BDOS 0");
  assert.equal(word(m, 6), low, "after BDOS function 0");
  m.mark = m.output.length;
  m.type("SAVE 1 C:X.COM\r");
  m.runUntil(() => m.waitingForInput(), 400_000_000, "the disk error");
  m.type("\r");
  m.expect(/\r\nA>$/);
  assert.equal(word(m, 6), low, "after a disk error");
  const pages = (low >> 8) - 1; // SAVE counts pages from 0100h
  assert.match(m.command(`SAVE ${pages + 1} Y.COM`), /\r\n\d+\?\r\n/, "SAVE stops below the resident");
  assert.doesNotMatch(m.command(`SAVE ${pages} Y.COM`), /\?/, "and reaches up to it");
  assert.deepEqual(m.violations, []);
});

test("residents are removed last in, first out, each REMOVE undoing its INIT", async () => {
  const m = await machine({ "RES.SVC": await service("res") });
  const conout = () => word(m, m.sym("RAMBIOS") + 13); // CONOUT's JP target
  const rom = conout();
  const stub = word(m, 6);
  const [up, lo] = [(stub & 0xff00) - 0x100, (stub & 0xff00) - 0x200];
  m.command("RES.SVC");
  const first = conout();
  m.command("RES.SVC");
  assert.notEqual(conout(), first);
  assert.equal(word(m, 6), lo);
  m.command("UNLOAD");
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP")), conout()], [up, up, first]);
  m.command("UNLOAD");
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP")), conout()], [stub, stub, rom]);
  assert.match(m.command("UNLOAD"), /UNLOAD\?/, "the stub is no resident");
  back(m);
  assert.equal(word(m, 6), stub);
  assert.deepEqual(m.violations, []);
});

test("a cold boot clears every resident", async () => {
  const m = await machine({ "RES.SVC": await service("res") });
  const stub = word(m, 6);
  m.command("RES.SVC");
  assert.equal(word(m, 6), (stub & 0xff00) - 0x100);
  m.reset();
  m.expect(/A>$/, { maxCycles: 80_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the prompt after reset");
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP"))], [stub, stub]);
});

test("BDOS function 108 gets and sets the program return code, kept across a warm boot", async () => {
  const m = await machine({});
  const get = () => run(m, [0x11, 0xff, 0xff, 0x0e, 108, 0xcd, 0x05, 0x00]).hl;
  assert.equal(get(), 0, "0 after cold boot");
  run(m, [0x11, 0x34, 0x12, 0x0e, 108, 0xcd, 0x05, 0x00]);
  assert.equal(get(), 0x1234);
  back(m);
  assert.equal(get(), 0x1234, "after a warm boot, for the parent");
  assert.deepEqual(m.violations, []);
});
