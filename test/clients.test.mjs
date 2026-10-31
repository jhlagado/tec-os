// The ROM's own clients on the table: DEMO.COM, MOUNT.COM and VOLS.COM each test
// the tag and major version 4, stop with a word on any other, and run on 4.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ABI, ROOT, TEST_CLOCK, boot, program, romFor, sourceDigest, standardCard, volume } from "./lib/fixtures.mjs";

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

const SEGMENTS = [0xeb, 0x28, 0xcd, 0xad, 0x2e, 0xa7, 0xe7, 0x29, 0xef, 0xaf, 0x6f, 0xe6, 0xc3, 0xec, 0xc7, 0x47];

/** DEMO running on a PICO9918 board for CYCLES, with what it wrote to each port. */
async function demoRun(cycles) {
  const image = standardCard();
  volume(image, "A").write("DEMO.COM", (await program("demo")).bytes);
  const m = boot(image, { tms: true, matrix: true });
  const seen = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (port, value) => {
    seen.push([port & 0xff, value & 0xff]);
    io(port, value);
  };
  m.typeMatrix("demo\r");
  const end = m.cycles + cycles;
  m.runUntil(() => m.cycles > end, cycles + 1_000_000, "the demo running");
  return { m, seen, to: (port) => seen.filter(([p]) => p === port).map(([, v]) => v) };
}

test("DEMO's own tables: each hex digit's pattern, each colour port and random colours", async () => {
  const { m, seen, to } = await demoRun(30_000_000);
  assert.deepEqual(m.violations, []);

  // The counter, one scan a frame from 1: the first 32 frames pass every digit.
  const hex6 = (n) => [...n.toString(16).padStart(6, "0")].map((d) => SEGMENTS[parseInt(d, 16)]);
  const digits = to(0x02);
  assert.ok(digits.length >= 6 * 32, `${digits.length / 6} scans`);
  for (let frame = 0; frame < 32; frame += 1) assert.deepEqual(digits.slice(frame * 6, frame * 6 + 6), hex6(frame + 1), `frame ${frame}`);

  // The first LED scan, at phase 0: colour (row + column) mod 8, 0 shown as white.
  const colour = (r, c) => ((r + c) & 7) || 7;
  const column = (bit) => Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (colour(r, c) & bit ? 1 << c : 0)).reduce((a, b) => a | b));
  assert.deepEqual(to(0x06).slice(0, 8), column(1), "red");
  assert.deepEqual(to(0xf8).slice(0, 8), column(2), "green");
  assert.deepEqual(to(0xf9).slice(0, 8), column(4), "blue");
  assert.deepEqual(to(0x05).slice(0, 8), [1, 0, 2, 0, 4, 0, 8, 0], "each row lit, then dark");

  // Each bounce's colour, written to the sprite's fourth byte at 1B03h, from the
  // xorshift (7, 9, 8) from its seed.
  const colours = [];
  seen.forEach(([p, v], i) => {
    if (p === 0xbf && v === 0x5b && seen[i - 1][1] === 0x03) colours.push(seen.slice(i).find(([q]) => q === 0xbe)[1]);
  });
  let x = 0xace1;
  const want = colours.map(() => {
    x ^= (x << 7) & 0xffff;
    x ^= x >> 9;
    x ^= (x << 8) & 0xffff;
    return (x & 7) | 8;
  });
  assert.ok(colours.length >= 4, `${colours.length} bounces`);
  assert.ok(new Set(colours).size >= 2, "the colours vary");
  assert.deepEqual(colours, want);
});

test("a program's digest covers what it includes, nested", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "digest-"));
  const [a, b, c] = ["a.asm", "b.inc", "c.inc"].map((f) => resolve(dir, f));
  writeFileSync(a, '%INCLUDE "b.inc"\n');
  writeFileSync(b, '%INCLUDE "c.inc"\n');
  writeFileSync(c, "X EQU 1\n");
  const first = sourceDigest(a);
  writeFileSync(c, "X EQU 2\n");
  assert.notEqual(sourceDigest(a), first);
  rmSync(dir, { recursive: true });
});

test("abi.inc's numbers reach the tests by name", () => {
  assert.deepEqual([ABI.HWBASE, ABI.HWINFO, ABI.HWRTC, ABI.HWCOUNT, ABI.HWBWRD, ABI.PICOREG, ABI.PICORD], [19, 19, 27, 9, 0x80, 16, 22]);
});

// Binaries from an edc2745 starter card, ABI 3.1, as they might still sit on a
// stored card. Pinned by hash: they are the evidence that an old program does
// no harm, and must not be rebuilt.
const OLD = {
  "DEMO.COM": "92918e238d08803acf25523b372aa463b76a02a83430f9322d5a075de817be1f",
  "MOUNT.COM": "2ad307aee40367bf17732b37e6c806cba1f372845a2ba96d5cad48dfb0b869b6",
  "VOLS.COM": "b2867c02d518a5b605905f7c3c9d542053cd20c9649492185386103b23be8599",
};
const old = (name) => {
  const bytes = readFileSync(resolve(ROOT, "test/fixtures/edc2745", name));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), OLD[name], `${name} is the pinned binary`);
  return bytes;
};

/** A board at its prompt with OLD's binaries on A:, and each pc reached in the services. */
function oldMachine(opts = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of Object.keys(OLD)) a.write(n, old(n));
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, ...opts });
  m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  const seen = { services: 0, svc: 0, c01d: 0 };
  const inService = [...symbols.entries()].filter(([k]) => /^HWS[A-Z]+$/.test(k) && k !== "HWSVC").map(([, v]) => v);
  const step = m.step.bind(m);
  m.step = () => {
    if (inService.includes(m.pc)) seen.services += 1;
    if (m.pc === symbols.get("HWSVC")) seen.svc += 1;
    if (m.pc === 0xc01d) seen.c01d += 1;
    return step();
  };
  return { m, seen, image };
}
// Page zero, less 0040h-004Fh, the BIOS's scratch, which every key typed moves.
const pageZero = (m) => Array.from({ length: 0x5c }, (_, i) => (i >= 0x40 && i < 0x50 ? 0 : m.read(i)));

test("an old DEMO prints no throughout, reaches no service, and leaves page zero unchanged", () => {
  const { m, seen } = oldMachine();
  const before = pageZero(m);
  const from = m.output.length;
  m.type("DEMO\r");
  m.expect(/Press any key to stop\.\r\n/, { from, maxCycles: 80_000_000 });
  const text = m.text(from);
  assert.match(text, /PICO9918: no/);
  assert.match(text, /GLCD: no/);
  assert.match(text, /clock: no/);
  const end = m.cycles + 8_000_000;
  m.runUntil(() => m.cycles > end, 9_000_000, "the demo running");
  assert.ok(seen.svc > 10, "it called, and each call was refused");
  assert.equal(seen.services, 0, "no service ran");
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(0, 20)).startsWith("TEC-OS hardware demo"), false, "the LCD isn't written");
  m.type("x");
  m.expect(/A>$/, { maxCycles: 80_000_000 });
  assert.deepEqual(pageZero(m), before);
  assert.deepEqual(m.violations, []);
});

for (const [line, name] of [["VOLS", "VOLS"], ["MOUNT B:", "MOUNT, to unmount"], ["MOUNT B: 0", "MOUNT, to mount"]]) {
  test(`an old ${name} returns through C01Dh and changes nothing`, () => {
    const { m, seen, image } = oldMachine();
    const card = Uint8Array.from(image);
    const mounts = Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d));
    const before = pageZero(m);
    m.command(line);
    assert.ok(seen.c01d >= 1, "it called C01Dh");
    assert.deepEqual(Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d)), mounts);
    assert.deepEqual(pageZero(m), before);
    assert.deepEqual([...image], [...card], "the card byte for byte");
    assert.deepEqual(m.violations, []);
  });
}
