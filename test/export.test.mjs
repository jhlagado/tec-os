// A file exported from a card (CpmVolume.read, tecvol get) holds each
// directory entry's records and nothing past them: a short entry before the
// file's last leaves the rest of its block out, a gap reads as zeros, and an
// entry that covers more than one logical extent ends at its own record
// count (KE-AR5). Host evidence, and one file the BDOS made in the emulator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { cpmName } from "../tools/lib/cpmfs.mjs";
import { ROOT, standardCard, volume } from "./lib/fixtures.mjs";
import { rig } from "./lib/warmboot.mjs";

const RECORD = 128;
/** Records FROM to TO (exclusive) of BYTES, as one array. */
const records = (bytes, from, to) => bytes.subarray(from * RECORD, to * RECORD);
const zero = (a) => a.every((v) => v === 0);

/** Directory entry INDEX of FS: NAME's extent EXTENT, RC records in its last, blocks BLOCKS from slot 0. */
function entry(fs, index, name, extent, rc, blocks) {
  const e = fs.entry(index);
  e.fill(0);
  e.set(cpmName(name), 1);
  e[12] = extent & 0x1f;
  e[14] = extent >> 5;
  e[15] = rc;
  const wide = fs.d.dsm > 255; // 16-bit block numbers
  blocks.forEach((b, k) => (wide ? e.set([b & 0xff, b >> 8], 16 + 2 * k) : (e[16 + k] = b)));
}

test("an entry of one record before the file's last exports that record, not the rest of its block, and tecvol get the same (KE-AR5)", () => {
  const image = standardCard();
  const fs = volume(image, "A");
  const per = fs.blockBytes / RECORD;
  entry(fs, 0, "SPARSE.DAT", 0, 1, [4]); // extent 0: record 0 only
  entry(fs, 1, "SPARSE.DAT", 1, 1, [5]); // extent 1: record 128 only
  fs.data.fill(0x66, 4 * fs.blockBytes, 5 * fs.blockBytes); // block 4's slack
  fs.data.fill(0x11, 4 * fs.blockBytes, 4 * fs.blockBytes + RECORD);
  fs.data.fill(0x22, 5 * fs.blockBytes, 6 * fs.blockBytes);
  assert.deepEqual(fs.verify(), []);
  const check = (got, how) => {
    assert.equal(got.length, 129 * RECORD, `${how}: 129 records`);
    assert.ok(records(got, 0, 1).every((v) => v === 0x11), `${how}: record 0`);
    assert.ok(zero(records(got, 1, 128)), `${how}: records 1 to 127 zero, block 4's other ${per - 1} records left out`);
    assert.ok(records(got, 128, 129).every((v) => v === 0x22), `${how}: record 128`);
  };
  check(fs.read("SPARSE.DAT"), "read");
  const dir = mkdtempSync(resolve(tmpdir(), "export-"));
  try {
    const path = resolve(dir, "card.img");
    writeFileSync(path, image);
    check(new Uint8Array(execFileSync(process.execPath, [resolve(ROOT, "tools/tecvol.mjs"), "get", path, "A", "SPARSE.DAT"])), "tecvol get");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an entry covering two logical extents (EXM 1) ends at its own record count, its last block's slack left out (KE-AR5)", () => {
  const image = standardCard();
  const fs = volume(image, "B"); // G8M: EXM 1, an entry holds two logical extents
  assert.equal(fs.extentsPerEntry, 2);
  const per = fs.blockBytes / RECORD;
  const slots = 128 / per; // a logical extent's blocks
  const first = Array.from({ length: slots + 1 }, (_, k) => 8 + k); // extents 0 and 1: 129 records
  entry(fs, 0, "WIDE.DAT", 1, 1, first);
  const second = first.map((b) => b + 100);
  entry(fs, 1, "WIDE.DAT", 3, 1, second); // extents 2 and 3, the second's record 384 only
  for (const b of first) fs.data.fill(0x33, b * fs.blockBytes, (b + 1) * fs.blockBytes);
  for (const b of second) fs.data.fill(0x55, b * fs.blockBytes, (b + 1) * fs.blockBytes);
  assert.deepEqual(fs.verify(), []);
  const got = fs.read("WIDE.DAT");
  assert.equal(got.length, 385 * RECORD, "385 records");
  assert.ok(records(got, 0, 129).every((v) => v === 0x33), "the first entry's 129 records");
  assert.ok(zero(records(got, 129, 256)), `records 129 to 255 zero: its last block's other ${per - 1} records left out`);
  assert.ok(records(got, 256, 385).every((v) => v === 0x55), "the second entry's records, a full extent and record 384, the file's end");
});

test("a sparse file the BDOS made exports zeros where it wrote nothing, not an erased file's bytes (KE-AR5)", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("OLD.DAT", new Uint8Array(2048).fill(0x66)); // the block SPARSE.DAT takes next
  a.erase("OLD.DAT");
  const r = rig(image);
  const m = r.m;
  r.fcb(1, "SPARSE  DAT");
  assert.equal(r.bdos(22), 0, "made");
  for (let i = 0; i < RECORD; i += 1) m.write(0x80 + i, 0x11);
  assert.equal(r.bdos(21), 0, "record 0, written in sequence");
  for (let i = 0; i < RECORD; i += 1) m.write(0x80 + i, 0x22);
  [128, 0, 0].forEach((v, i) => m.write(0x7d + i, v));
  assert.equal(r.bdos(34), 0, "record 128, written at random");
  assert.notEqual(r.bdos(16), 255, "closed");
  const fs = volume(image, "A");
  const f = fs.find("SPARSE.DAT");
  assert.deepEqual(f.entries.map((e) => [e.extent, e.rc]), [[0, 1], [1, 1]], "two entries of one record each");
  const got = fs.read("SPARSE.DAT");
  assert.equal(got.length, 129 * RECORD);
  assert.ok(records(got, 0, 1).every((v) => v === 0x11), "record 0");
  assert.ok(zero(records(got, 1, 128)), "records 1 to 127, which the BDOS reads as unwritten, zero");
  assert.ok(records(got, 128, 129).every((v) => v === 0x22), "record 128");
});
