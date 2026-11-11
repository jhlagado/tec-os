// The ROM's own clients on the table: DEMO.COM and MOUNT.COM each test the tag
// and major version 5, stop with a word on any other, and run on 5.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ABI, ROOT, TEST_CLOCK, boot, program, romFor, sourceDigest, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

/** A serial board at its prompt, the ROM's bytes at C003h changed as `edit` says. */
async function machine(edit = () => {}) {
  const { rom, symbols } = romFor();
  const patched = Uint8Array.from(rom);
  edit(patched);
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of ["demo", "mount"]) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  const m = new Machine({ rom: patched, symbols, sdImage: image, clock: TEST_CLOCK });
  m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}

const MAJOR3 = (r) => (r[6] = 3);
const NOTAG = (r) => (r[3] = 0x58);
const WORDS = { DEMO: "DEMO needs TEC-OS with ABI 5.", "MOUNT B:": "MOUNT needs TEC-OS with ABI 5.", MOUNT: "MOUNT needs TEC-OS with ABI 5." };

for (const [line, word] of Object.entries(WORDS)) {
  for (const [why, edit] of [["major 3", MAJOR3], ["no TNA tag", NOTAG]]) {
    test(`${line} refuses ${why}`, async () => {
      const m = await machine(edit);
      assert.ok(m.command(line).includes(word));
      assert.deepEqual(m.violations, []);
    });
  }
}

test("MOUNT lists and unmounts on major 5", async () => {
  const m = await machine();
  assert.match(m.command("MOUNT"), /^00 SYSTEM +G1M A:\r\n01 WORK +G8M B:\r\n/m);
  assert.match(m.command("MOUNT X:"), /^MOUNT \[D: \[NAME or INDEX\]\]/m, "a bad drive gets the usage line");
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
  assert.deepEqual([ABI.TNINFO, ABI.TNRTC, ABI.TNMOUNT, ABI.TNLIST, ABI.TNSHELL, ABI.TNCOUNT, ABI.HWBWRD, ABI.PICOREG, ABI.PICORD], [0, 8, 9, 14, 16, 17, 0x80, 16, 22]);
});

// ABI 3's binaries, which a stored card might hold and which test no major,
// are no longer covered: ABI 5 has no RET at C01Dh (KS36a's part 3). Programs
// that test the major stop themselves, as the tests above show.

// PICO.SVC from a 2d5ce25 starter card, format 3. ABI 5 raised the format to 4,
// so the loader refuses it before its INIT can call an old address: no stale
// driver runs.
const OLD_PICO = "23513b3ba4931a183b097f0753209e0b03bbea6168127a56279fc41cfb95a58a";

test("a 2d5ce25 PICO.SVC is refused by its format: its name with a question mark, nothing loaded, the ROM's console in place", () => {
  const bytes = readFileSync(resolve(ROOT, "test/fixtures/2d5ce25/PICO.DRV"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), OLD_PICO, "the pinned binary");
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.SVC", bytes);
  a.write("STARTUP.CMD", startupFile("PICO.SVC"));
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  assert.match(m.text(0), /PICO\.SVC\?/);
  assert.deepEqual([m.read(m.sym("SVCRC")), m.read(m.sym("SVCHEAD")), m.read(m.sym("CONMOD"))], [0, 0, 1], "no INIT ran; CRT:, the ROM's");
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd(), "", "no word on row 3");
  assert.deepEqual(m.violations, []);
});
