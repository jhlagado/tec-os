// BIOS WRITE and the write type: a newly allocated block is not read before
// its first write, and on A:, which coalesces, every record is on the card
// at the next flush point. Emulator evidence, calling the BDOS directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, standardCard, volume } from "./lib/fixtures.mjs";
import { alv, rig as callRig } from "./lib/warmboot.mjs";

const BACK = 0x0f00;
const STACK = 0x1000;
const FCB = 0x005c;
const DMA = 0x0080;

/** A machine on a fresh standard card, with a BDOS caller and an SD count. */
function rig() {
  const image = standardCard();
  const m = boot(image);
  const counts = { reads: 0, writes: 0 };
  const sdread = m.sym("SDREAD");
  const sdwrite = m.sym("SDWRITE");
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === sdread) counts.reads += 1;
    else if (m.pc === sdwrite) counts.writes += 1;
    return step();
  };
  const bdos = (c, de = FCB, after) => {
    const cpu = m.cpu.cpu;
    const saved = { pc: cpu.pc, sp: cpu.sp };
    m.write(STACK - 2, BACK & 0xff);
    m.write(STACK - 1, BACK >> 8);
    Object.assign(cpu, { c, d: de >> 8, e: de & 0xff, sp: STACK - 2, pc: 0x0005 });
    m.runUntil(() => m.pc === BACK, 200_000_000, `BDOS ${c}`);
    const a = cpu.a;
    Object.assign(cpu, saved);
    after?.();
    return a;
  };
  const name = (n) => {
    const fcb = [0, ...Buffer.from(n.padEnd(11)), ...new Array(24).fill(0)];
    fcb.forEach((v, i) => m.write(FCB + i, v));
  };
  const record = (r) => {
    for (let k = 0; k < 128; k += 1) m.write(DMA + k, (r * 131 + k * 7 + 1) & 0xff);
  };
  return { image, m, counts, bdos, name, record };
}

const expected = (n) => Uint8Array.from({ length: n * 128 }, (_, i) => ((i >> 7) * 131 + (i & 127) * 7 + 1) & 0xff);

test("a 16 KiB save reads no data block, only the directory", () => {
  const { image, counts, bdos, name, record } = rig();
  name("SAVE16  DAT");
  assert.notEqual(bdos(22), 0xff);
  const made = counts.writes;
  for (let r = 0; r < 128; r += 1) {
    record(r);
    assert.equal(bdos(21), 0, `record ${r}`);
  }
  assert.notEqual(bdos(16), 0xff);
  assert.ok(counts.reads <= 2, `${counts.reads} block reads`);
  assert.equal(counts.writes - made, 33, "after the make, each of the 32 card blocks once, then the directory at the close");
  assert.deepEqual(volume(image, "A").read("SAVE16.DAT"), expected(128));
});

/** The card block of record R, from the FCB's allocation map (16-bit on G1M). */
const blockOf = (m, r) => m.read(FCB + 16 + 2 * (r >> 4)) | (m.read(FCB + 17 + 2 * (r >> 4)) << 8);

test("a newly allocated block holds zeros in the records not yet written", () => {
  const { image, m, bdos, name, record } = rig();
  name("ONE     DAT");
  assert.notEqual(bdos(22), 0xff);
  record(0);
  assert.equal(bdos(21), 0);
  const at = blockOf(m, 0) * 2048;
  assert.notEqual(bdos(16), 0xff);
  const data = volume(image, "A").data;
  assert.deepEqual(data.subarray(at, at + 128), expected(1));
  assert.ok(data.subarray(at + 128, at + 512).every((b) => b === 0), "the rest of its SD block is zeros");
});

test("every write is on the card at the next flush point", () => {
  const { image, m, bdos, name, record } = rig();
  name("THRU    DAT");
  assert.notEqual(bdos(22), 0xff);
  const data = volume(image, "A").data;
  for (let r = 0; r < 40; r += 1) {
    record(r);
    assert.equal(bdos(21), 0, `record ${r}`);
    // BDOS 11, a console read, is a flush point.
    let onCard = null;
    bdos(11, 0, () => {
      const at = blockOf(m, r) * 2048 + (r & 15) * 128;
      onCard = data.subarray(at, at + 128);
    });
    assert.deepEqual(onCard, expected(r + 1).subarray(r * 128), `record ${r} on the card at the next flush point`);
  }
});

test("a random write into an allocated block keeps its neighbours", () => {
  const { image, m, bdos, name, record } = rig();
  name("RAND    DAT");
  assert.notEqual(bdos(22), 0xff);
  for (let r = 0; r < 32; r += 1) {
    record(r);
    assert.equal(bdos(21), 0);
  }
  // Random writes (function 34) of records 2, 21 and 18, then records 40 and
  // 41 past the end, in a new allocation block.
  const want = new Uint8Array(42 * 128);
  want.set(expected(32));
  for (const r of [2, 21, 18, 40, 41]) {
    for (let k = 0; k < 128; k += 1) m.write(DMA + k, 0x40 + r);
    want.fill(0x40 + r, r * 128, r * 128 + 128);
    m.write(FCB + 33, r);
    m.write(FCB + 34, 0);
    m.write(FCB + 35, 0);
    assert.equal(bdos(34), 0, `random write ${r}`);
  }
  const at = blockOf(m, 40) * 2048 + (40 & 15) * 128;
  assert.notEqual(bdos(16), 0xff);
  const got = volume(image, "A").read("RAND.DAT");
  assert.deepEqual(got.subarray(0, 32 * 128), want.subarray(0, 32 * 128));
  assert.deepEqual(got.subarray(40 * 128, 42 * 128), want.subarray(40 * 128, 42 * 128));
  const card = volume(image, "A").data;
  assert.ok(card.subarray(at + 256, at + 512).every((b) => b === 0), "records 42 and 43, in the SD block written, are zeros");
});

test("a write after a new block on drive B reads a block of drive A", () => {
  const { image, m, bdos, name, record } = rig();
  name("KEEP    DAT");
  assert.notEqual(bdos(22), 0xff);
  for (let r = 0; r < 16; r += 1) {
    record(r);
    assert.equal(bdos(21), 0);
  }
  assert.notEqual(bdos(16), 0xff);
  // A new file on B: its first record leaves a cleared block in the buffer.
  const fcbB = [2, ...Buffer.from("NEWB    DAT"), ...new Array(24).fill(0)];
  fcbB.forEach((v, i) => m.write(FCB + i, v));
  assert.notEqual(bdos(22), 0xff);
  record(0);
  assert.equal(bdos(21), 0);
  assert.notEqual(bdos(16), 0xff);
  // Then A's record 5 rewritten at random: its block must be read first.
  name("KEEP    DAT");
  assert.notEqual(bdos(15), 0xff);
  for (let k = 0; k < 128; k += 1) m.write(DMA + k, 0x77);
  m.write(FCB + 33, 5);
  m.write(FCB + 34, 0);
  m.write(FCB + 35, 0);
  assert.equal(bdos(34), 0);
  assert.notEqual(bdos(16), 0xff);
  const want = expected(16);
  want.fill(0x77, 5 * 128, 6 * 128);
  assert.deepEqual(volume(image, "A").read("KEEP.DAT"), want);
});

/** BIOS WRITE, through the RAM jump table, replaced by LD A,1 / RET: every write fails. Returns the restore. */
function failWrites(m) {
  const at = m.sym("RAMBIOS") + 0x2b;
  const was = [m.read(at), m.read(at + 1)];
  [0x3e, 0x01, 0xc9].forEach((v, i) => m.write(0x0e00 + i, v));
  m.write(at, 0x00);
  m.write(at + 1, 0x0e);
  return () => was.forEach((v, i) => m.write(at + i, v));
}

test("a sequential write whose close of the extent it leaves fails returns 1 and leaves the FCB on record 128 (KE-175)", () => {
  const image = standardCard();
  const r = callRig(image);
  const { m } = r;
  r.fcb(0, "GONE    DAT");
  assert.notEqual(r.bdos(22), 0xff);
  for (let rec = 0; rec < 128; rec += 1) {
    for (let k = 0; k < 128; k += 1) m.write(DMA + k, rec);
    assert.equal(r.bdos(21), 0, `record ${rec}`);
  }
  [0, ...Buffer.from("GONE    DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x0200 + i, v));
  assert.equal(r.bdos(19, 0x0200), 0, "the file deleted under the open FCB");
  assert.equal(r.bdos(21), 1, "record 128: extent 0 cannot be closed, so the write is refused");
  assert.deepEqual([m.read(FCB + 12), m.read(FCB + 32)], [0, 128], "the FCB stays on extent 0, record 128");
  const disk = volume(image, "A");
  const left = Array.from({ length: disk.entries }, (_, i) => disk.entry(i)).filter((e) => e[0] !== 0xe5 && Buffer.from(e.subarray(1, 12)).toString("latin1") === "GONE    DAT");
  assert.deepEqual(left, [], "no entry made for the deleted file");
});

test("a zero-filling write whose block fails returns the error with the program's DMA address back in the BIOS (KE-176)", () => {
  const image = standardCard();
  volume(image, "A").write("DATA.DAT", new Uint8Array(128).fill(0x5a));
  const r = callRig(image);
  const { m } = r;
  [0, ...Buffer.from("DATA    DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x0200 + i, v));
  assert.notEqual(r.bdos(15, 0x0200), 0xff, "DATA.DAT opened through a second FCB");
  r.bdos(45, 0xff);
  r.fcb(0, "NEW     DAT");
  assert.notEqual(r.bdos(22), 0xff);
  const restore = failWrites(m);
  assert.equal(r.bdos(40), 0xff, "function 40: the block's zeroing fails, the error returned");
  restore();
  for (let k = 0; k < 128; k += 1) m.write(DMA + k, 0);
  assert.equal(r.bdos(20, 0x0200), 0, "DATA.DAT's first record read, with no directory read before it");
  assert.deepEqual(Array.from({ length: 128 }, (_, k) => m.read(DMA + k)), new Array(128).fill(0x5a), "the record is at the program's DMA address");
});

test("a write that fails after its block is claimed leaves no block marked used that no directory entry holds (KE-177)", () => {
  const image = standardCard();
  const r = callRig(image);
  const { m } = r;
  r.bdos(45, 0xff);
  r.fcb(0, "LEAK    DAT");
  assert.notEqual(r.bdos(22), 0xff);
  const restore = failWrites(m);
  assert.equal(r.bdos(21), 0xff, "the write fails, the error returned");
  restore();
  const block = m.read(FCB + 16) | (m.read(FCB + 17) << 8);
  assert.notEqual(block, 0, "a block was claimed for record 0");
  assert.notEqual(r.bdos(16), 0xff, "closed");
  const used = (alv(m, 0)[block >> 3] >> (7 - (block & 7))) & 1;
  const disk = volume(image, "A");
  const entry = Array.from({ length: disk.entries }, (_, i) => disk.entry(i)).find((e) => e[0] === 0 && Buffer.from(e.subarray(1, 12)).toString("latin1") === "LEAK    DAT");
  const held = [...Array(8).keys()].some((i) => (entry[16 + 2 * i] | (entry[17 + 2 * i] << 8)) === block);
  assert.ok(!used || held, `block ${block}: ${used ? "used in the vector" : "free"}, ${held ? "held" : "not held"} by LEAK.DAT's entry`);
});
