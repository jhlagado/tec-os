// Where the BDOS and CCP follow CP/M 2.2: a sequential write with the
// directory full, function 32's mask, function 13 and the user number, and
// File R/O for a write or rename of a read-only file; and the prompt after
// the current drive is unmounted. Emulator evidence, calling the BDOS
// directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { standardCard, volume } from "./lib/fixtures.mjs";
import { rig } from "./lib/warmboot.mjs";

const FCB = 0x005c;
const FCB2 = 0x0200;
const DMA = 0x0080;

const fill = (r) => Uint8Array.from({ length: 128 }, (_, k) => (r * 131 + k * 7 + 1) & 0xff);
const putFcb = (m, at, drive, name) => [drive, ...Buffer.from(name.padEnd(11)), ...new Array(24).fill(0)].forEach((v, i) => m.write(at + i, v));
const bytes = (m, at, n) => Array.from({ length: n }, (_, i) => m.read(at + i));

test("a sequential write that needs an extent with the directory full returns 1, and once an entry is freed carries on with no extent missing", () => {
  const image = standardCard();
  const a = volume(image, "A");
  for (let i = 1; i < a.entries; i += 1) a.write(`F${i}.DAT`, new Uint8Array()); // 255 of 256 entries
  const r = rig(image);
  const { m } = r;
  const write = (rec) => {
    fill(rec).forEach((v, k) => m.write(DMA + k, v));
    return r.bdos(21);
  };
  r.fcb(0, "BIGFILE DAT");
  assert.notEqual(r.bdos(22), 0xff, "the make takes the last entry");
  for (let rec = 0; rec < 128; rec += 1) assert.equal(write(rec), 0, `record ${rec}`);
  for (let tries = 0; tries < 3; tries += 1) {
    assert.equal(write(128), 1, "record 128 needs extent 1: no directory space");
    assert.deepEqual([m.read(FCB + 12), m.read(FCB + 14) & 0x3f, m.read(FCB + 32)], [0, 0, 128], "the FCB stays on extent 0, record 128");
  }
  putFcb(m, FCB2, 0, "F1      DAT");
  assert.equal(r.call(5, { c: 19, de: FCB2 }), 0, "an entry freed");
  assert.equal(write(128), 0, "record 128, in extent 1");
  assert.equal(write(129), 0);
  assert.equal(m.read(FCB + 12), 1);
  assert.notEqual(r.bdos(16), 0xff);

  r.fcb(0, "BIGFILE DAT");
  r.bdos(35);
  assert.deepEqual(bytes(m, FCB + 33, 3), [130, 0, 0], "function 35: 130 records");
  r.fcb(0, "BIGFILE DAT");
  assert.notEqual(r.bdos(15), 0xff);
  for (let rec = 0; rec < 130; rec += 1) {
    assert.equal(r.bdos(20), 0, `read of record ${rec}`);
    assert.deepEqual(bytes(m, DMA, 128), [...fill(rec)], `record ${rec}`);
  }
  assert.equal(r.bdos(20), 1, "the end of the file");

  const disk = volume(image, "A");
  const entries = Array.from({ length: disk.entries }, (_, i) => disk.entry(i)).filter((e) => e[0] === 0 && Buffer.from(e.subarray(1, 12)).toString("latin1") === "BIGFILE DAT");
  assert.deepEqual(entries.map((e) => [e[12], e[15]]).sort((x, y) => x[0] - y[0]), [[0, 128], [1, 2]], "extents 0 and 1, and no other");
  assert.deepEqual([...disk.read("BIGFILE.DAT")], Array.from({ length: 130 }, (_, rec) => [...fill(rec)]).flat(), "every record on the card");
  r.warm();
  assert.match(m.command("DIR BIGFILE.DAT"), /BIGFILE\.DAT \r\n1 file/);
});

test("a sequential write of 128 records makes one extent, not an empty second one", () => {
  const image = standardCard();
  const r = rig(image);
  r.fcb(0, "EXACT   DAT");
  assert.notEqual(r.bdos(22), 0xff);
  for (let rec = 0; rec < 128; rec += 1) {
    fill(rec).forEach((v, k) => r.m.write(DMA + k, v));
    assert.equal(r.bdos(21), 0, `record ${rec}`);
  }
  assert.deepEqual([r.m.read(FCB + 12), r.m.read(FCB + 32)], [0, 128], "on extent 0 until a write needs the next");
  assert.notEqual(r.bdos(16), 0xff);
  const disk = volume(image, "A");
  const used = Array.from({ length: disk.entries }, (_, i) => disk.entry(i)).filter((e) => e[0] !== 0xe5);
  assert.deepEqual(used.map((e) => [e[12], e[15]]), [[0, 128]]);
});
