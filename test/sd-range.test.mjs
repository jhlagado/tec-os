// KE-151: a standard-capacity card addresses bytes, so a block at 800000h or
// above has no address. A volume a card's header places there is refused at
// each read and write, before any command, instead of reaching the block its
// address wraps to. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, romFor, standardCard } from "./lib/fixtures.mjs";
import { descriptorAt, headerChecksum, tableSum } from "../tools/lib/container.mjs";
import { format } from "../tools/lib/format.mjs";

const H = format.header.fields;
const D = format.descriptor.fields;
const put32 = (b, at, v) => [0, 1, 2, 3].forEach((i) => (b[at + i] = (v >>> (8 * i)) & 0xff));

/** The standard card with B:'s volume moved to block START, the container long enough to hold it, and the header resealed. */
function farCard(start) {
  const img = standardCard();
  const length = img[descriptorAt(1) + D.lengthBlocks.offset] | (img[descriptorAt(1) + D.lengthBlocks.offset + 1] << 8) | (img[descriptorAt(1) + D.lengthBlocks.offset + 2] << 16);
  put32(img, descriptorAt(1) + D.startBlock.offset, start);
  put32(img, H.containerBlocks.offset, start + length);
  img.set([tableSum(img, 2) & 0xff, tableSum(img, 2) >> 8], H.tableSum.offset);
  const s = headerChecksum(img.subarray(0, 512));
  img.set([s & 0xff, s >> 8], H.checksum.offset);
  return img;
}

/** Cold boot on CARD: the mount's error, two hex digits, or "booted". */
function mountOf(card, highCapacity) {
  const m = new Machine({ ...romFor(), sdImage: card, clock: TEST_CLOCK, highCapacity });
  const out = m.expect(/R retry> $|A>$/, { from: 0, maxCycles: 200_000_000 });
  return /A>$/.test(out) ? "booted" : out.match(/error ([0-9A-F]{2})/)?.[1];
}

test("a standard card's volume past block 7FFFFFh is refused at mount, error 27, and the card is left as it was (KE-151, KE-158)", () => {
  for (const [start, what] of [[0x800800, "wholly past the bound"], [0x7ff000, "straddling it"]]) {
    const image = farCard(start);
    const before = image.slice();
    assert.equal(mountOf(image, false), "27", `a volume ${what}: MERANGE`);
    assert.deepEqual(image, before, `${what}: the card byte for byte`);
  }
  assert.equal(mountOf(farCard(0x800000 - 0x4000), false), "booted", "a volume ending at 800000h itself mounts");
  assert.equal(mountOf(farCard(0x7ff000), true), "booted", "on a high-capacity card the same volume mounts");
});

test("on a standard card, LBAARG names block 7FFFFFh and refuses 800000h: the bound is exact", () => {
  const m = new Machine({ ...romFor(), sdImage: standardCard(), clock: TEST_CLOCK, highCapacity: false });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  const cpu = m.cpu.cpu;
  const word32 = (a) => [0, 1, 2, 3].reduce((v, i) => v * 256 + m.read(a + i), 0); // SDARG is sent most significant byte first
  const lbaarg = (lba) => {
    [0, 1, 2, 3].forEach((i) => m.write(m.sym("SDLBA") + i, (lba >>> (8 * i)) & 0xff));
    [0, 1, 2, 3].forEach((i) => m.write(m.sym("SDARG") + i, 0x5a));
    const saved = { pc: cpu.pc, sp: cpu.sp };
    m.write(0x0ffe, 0x00);
    m.write(0x0fff, 0x0f);
    Object.assign(cpu, { sp: 0x0ffe, pc: m.sym("LBAARG") });
    m.runUntil(() => m.pc === 0x0f00, 1_000_000, "LBAARG");
    const r = { carry: cpu.flags.C, arg: word32(m.sym("SDARG")) };
    Object.assign(cpu, saved);
    return r;
  };
  assert.deepEqual(lbaarg(0x7fffff), { carry: 0, arg: 0xfffffe00 }, "the last block a byte address names");
  assert.deepEqual(lbaarg(0x800000), { carry: 1, arg: 0x5a5a5a5a }, "the first it can't, SDARG left");
  assert.deepEqual(lbaarg(0x800800), { carry: 1, arg: 0x5a5a5a5a }, "KE-151's block");
});

// KE-155, with debug80-runtime 0.3.3: the SD model refuses a block past its
// image with R1 40h and no data, and a high-capacity block's byte offset no
// longer wraps at 32 bits, so the ROM sees each as a failed command.
function sdCall(m, entry, lba, buf) {
  const cpu = m.cpu.cpu;
  [0, 1, 2, 3].forEach((i) => m.write(m.sym("SDLBA") + i, (lba >>> (8 * i)) & 0xff));
  const saved = { pc: cpu.pc, sp: cpu.sp };
  m.write(0x0ffe, 0x00);
  m.write(0x0fff, 0x0f);
  Object.assign(cpu, { sp: 0x0ffe, pc: m.sym(entry), h: buf >> 8, l: buf & 0xff });
  m.runUntil(() => m.pc === 0x0f00, 50_000_000, entry);
  const r = { z: cpu.flags.Z, err: m.read(m.sym("SDERR")) };
  Object.assign(cpu, saved);
  return r;
}

test("past the card's image, a read and a write fail and change nothing; a high block doesn't wrap to a low one (KE-155)", () => {
  const image = standardCard();
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, highCapacity: true });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  const BUF = 0x2000;
  const blocks = image.length / 512;
  const fill = (v) => Array.from({ length: 512 }, (_, i) => m.write(BUF + i, v));
  const buf = () => Array.from({ length: 512 }, (_, i) => m.read(BUF + i));
  const before = image.slice();
  fill(0x5a);
  assert.deepEqual(sdCall(m, "SDREAD", blocks, BUF), { z: 0, err: 5 }, "a read past the image: the command refused");
  assert.ok(buf().every((v) => v === 0x5a), "and no data");
  assert.deepEqual(sdCall(m, "SDWRITE", blocks + 7, BUF), { z: 0, err: 5 }, "a write past it: refused");
  // Block 1's bytes, read at block 800001h, which a 32-bit byte offset would wrap to.
  fill(0xa5);
  assert.deepEqual(sdCall(m, "SDREAD", 0x800001, BUF), { z: 0, err: 5 }, "block 800001h is past the image, not block 1");
  assert.ok(buf().every((v) => v === 0xa5), "nothing read");
  assert.equal(sdCall(m, "SDREAD", 1, BUF).z, 1, "block 1 itself reads");
  assert.deepEqual(buf(), [...image.subarray(512, 1024)]);
  assert.deepEqual(image, before, "the card byte for byte");
});
