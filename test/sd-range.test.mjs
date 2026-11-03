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

test("a standard card's volume at block 800800h: SAVE and DIR to it are refused, and no block of the card changes (KE-151)", () => {
  const image = farCard(0x800800);
  const before = image.slice();
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, highCapacity: false });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first prompt");
  for (const line of ["SAVE 1 B:X.COM", "DIR B:"]) {
    const from = m.output.length;
    m.type(`${line}\r`);
    m.expect(/Bdos Err On B: Bad Sector/, { from, maxCycles: 200_000_000 });
    m.type(" "); // CP/M's error waits for a key, then warm boots
    m.expect(/\r\nA>$/, { from, maxCycles: 200_000_000 });
  }
  assert.equal(m.read(m.sym("SDERR")), 9, "SDERNG: no command for a block the card can't name");
  const changed = [];
  for (let i = 0; i < before.length; i += 1) if (image[i] !== before[i] && changed.length < 4) changed.push(i.toString(16));
  assert.deepEqual(changed, [], "the card byte for byte, the blocks below 800h above all");
  assert.deepEqual(m.violations, []);
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
