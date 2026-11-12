// CP/M 3's extras (KS36c): function 44's count of 1, 46's free space from the
// allocation vector, 99's refusal, and the user number in the prompt. Emulator
// evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createContainer } from "../tools/lib/container.mjs";
import { boot, volume } from "./lib/fixtures.mjs";

/** SYSTEM on A:, WORK on B: with a file on each. */
function card() {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
  ]);
  volume(image, "A").write("KEEP.DAT", new Uint8Array(5000).fill(0xaa));
  volume(image, "B").write("BIG.DAT", new Uint8Array(70000).fill(0xbb));
  return image;
}

/** BDOS function FN with DE from a stub at 3000h: A, and HL. */
function bdos(m, fn, de) {
  const code = [0x0e, fn, 0x11, de & 0xff, de >> 8, 0xcd, 0x05, 0x00];
  [...code, 0x18, 0xfe].forEach((v, i) => m.write(0x3000 + i, v));
  m.cpu.cpu.sp = 0x3000;
  m.cpu.cpu.pc = 0x3000;
  m.runUntil(() => m.pc === 0x3000 + code.length, 400_000_000, `function ${fn}`);
  return { a: m.cpu.cpu.a, hl: (m.cpu.cpu.h << 8) | m.cpu.cpu.l };
}

test("function 44: a count of 1 succeeds, any other returns FFh", () => {
  const m = boot(card());
  assert.equal(bdos(m, 44, 1).a, 0);
  for (const n of [0, 2, 16, 128]) assert.equal(bdos(m, 44, n).a, 0xff, `count ${n}`);
});

test("function 46: each drive's free records, three bytes at the DMA address, as the card's directory gives them, and the default drive kept", () => {
  const image = card();
  const m = boot(image);
  bdos(m, 26, 0x2000);
  for (const [drive, letter] of [[0, "A"], [1, "B"]]) {
    m.write(0x2002, 0x5a);
    assert.equal(bdos(m, 46, drive).a, 0);
    const records = m.read(0x2000) | (m.read(0x2001) << 8) | (m.read(0x2002) << 16);
    assert.equal(records, volume(image, letter).freeBytes() / 128, `${letter}:`);
  }
  assert.equal(bdos(m, 25, 0).a, 0, "the default is still A:");
});

test("DIR's footer, from function 46, is the free space in kilobytes", () => {
  const image = card();
  const m = boot(image);
  for (const letter of ["A", "B"]) {
    const kb = volume(image, letter).freeBytes() / 1024;
    assert.match(m.command(`DIR ${letter}:`), new RegExp(`, ${kb}K free`), letter);
  }
  assert.match(m.command("DIR"), /KEEP\.DAT/, "and DIR on the current drive after it");
});

test("function 99, truncate, returns FFh and leaves the file as it was", () => {
  const image = card();
  const m = boot(image);
  const fcb = 0x2100;
  [1, ...Buffer.from("KEEP    DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(fcb + i, v));
  [0x10, 0x00, 0x00].forEach((v, i) => m.write(fcb + 33 + i, v)); // record 16
  assert.equal(bdos(m, 99, fcb).a, 0xff);
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput(), 400_000_000, "warm boot");
  assert.equal(volume(image, "A").read("KEEP.DAT").length, 5000 + (128 - (5000 % 128)) % 128);
});

test("the prompt shows the user number before the drive unless it is 0, as CP/M 3 does: 3A>", () => {
  const m = boot(card());
  assert.match(m.command("USER 3"), /\r\n3A(:\S*)?>$/);
  assert.match(m.command("B:"), /\r\n3B(:\S*)?>$/);
  assert.match(m.command("USER 15"), /\r\n15B>$/);
  assert.match(m.command("USER 0"), /\r\nB(:\S*)?>$/);
});
