// Where the BDOS and CCP follow CP/M 2.2: a sequential write with the
// directory full, function 32's mask, function 13 and the user number, and
// File R/O for a write or rename of a read-only file; and the prompt after
// the current drive is unmounted. Emulator evidence, calling the BDOS
// directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, standardCard, volume } from "./lib/fixtures.mjs";
import { alv, rig } from "./lib/warmboot.mjs";

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

test("function 32 keeps E's low five bits, for every E from 10h to FEh, and FFh gets the user number", () => {
  const r = rig();
  for (let e = 0x10; e <= 0xfe; e += 1) {
    r.call(5, { c: 32, de: e });
    assert.equal(r.call(5, { c: 32, de: 0xff }), e & 0x1f, `E = ${e.toString(16)}h`);
  }
  r.call(5, { c: 32, de: 0x07 });
  r.call(5, { c: 32, de: 0xff });
  assert.equal(r.call(5, { c: 32, de: 0xff }), 7, "FFh leaves it");
});

test("function 32 with E5h is user 5: erased entries stay erased", () => {
  const image = standardCard();
  const r = rig(image);
  r.fcb(0, "GONE    DAT");
  assert.notEqual(r.bdos(22), 0xff);
  assert.notEqual(r.bdos(16), 0xff);
  assert.equal(r.bdos(19), 0);
  r.call(5, { c: 32, de: 0xe5 });
  assert.equal(r.call(5, { c: 32, de: 0xff }), 5);
  r.fcb(0, "GONE    DAT");
  assert.equal(r.bdos(17), 0xff, "search finds no erased file");
  assert.equal(r.bdos(15), 0xff, "nor does open");
  r.fcb(0, "NEW     DAT");
  assert.notEqual(r.bdos(22), 0xff);
  assert.notEqual(r.bdos(16), 0xff);
  const disk = volume(image, "A");
  assert.deepEqual(disk.list({ user: 5 }).map((x) => x.name), ["NEW.DAT"], "made in user 5, not as an erased entry");
});

test("function 13 from user 5 leaves the user number 5, on drive A", () => {
  const image = standardCard();
  volume(image, "A").write("FIVE.DAT", new Uint8Array(128), { user: 5 });
  const r = rig(image);
  r.call(5, { c: 32, de: 5 });
  r.call(5, { c: 14, de: 1 });
  assert.equal(r.bdos(13), 0);
  assert.equal(r.call(5, { c: 32, de: 0xff }), 5, "the user number");
  assert.equal(r.bdos(25), 0, "the drive: A");
  r.fcb(0, "FIVE    DAT");
  assert.notEqual(r.bdos(15), 0xff, "user 5's file opens");
});

/** BDOS function C, to its return or to a BDOS error's wait for a key; then the key, and the CCP's prompt. */
function attempt(r, c, de = FCB) {
  const { m } = r;
  const cpu = m.cpu.cpu;
  const saved = { pc: cpu.pc, sp: cpu.sp };
  m.write(0x0ffe, 0x00);
  m.write(0x0fff, 0x0f);
  Object.assign(cpu, { c, d: de >> 8, e: de & 0xff, sp: 0x0ffe, pc: 0x0005 });
  m.mark = m.output.length;
  const [cin, cinEnd] = [m.sym("CINLP"), m.sym("CINWE")]; // a wait for a key, not a poll
  m.runUntil(() => m.pc === 0x0f00 || (m.pc >= cin && m.pc < cinEnd), 200_000_000, `BDOS ${c}`);
  if (m.pc === 0x0f00) {
    const a = cpu.a;
    Object.assign(cpu, saved);
    return { a };
  }
  const text = m.text(m.mark);
  m.type(" ");
  m.expect(/\r\nA>$/, { maxCycles: 100_000_000 });
  m.runUntil(() => m.ready(), 20_000_000, "the prompt's input");
  return { text };
}

test("functions 21, 34, 40 and 23 refuse a read-only file with File R/O, and the card is unchanged", () => {
  const image = standardCard();
  volume(image, "A").write("R.DAT", Uint8Array.from({ length: 256 }, (_, i) => i & 0xff), { readOnly: true });
  const r = rig(image);
  const { m } = r;
  const open = () => {
    r.fcb(0, "R       DAT");
    assert.notEqual(r.bdos(15), 0xff);
    assert.equal(m.read(FCB + 9) & 0x80, 0x80, "open gives the FCB the attribute");
    fill(9).forEach((v, k) => m.write(DMA + k, v));
  };
  const cases = [
    ["21", () => open(), 21],
    ["34", () => (open(), m.write(FCB + 33, 1)), 34],
    ["40", () => (open(), m.write(FCB + 33, 5)), 40],
    ["23", () => (r.fcb(0, "R       DAT"), [0, ...Buffer.from("S       DAT")].forEach((v, i) => m.write(FCB + 16 + i, v))), 23],
  ];
  for (const [name, setup, fn] of cases) {
    const before = image.slice();
    setup();
    const got = attempt(r, fn);
    assert.match(got.text ?? `returned ${got.a}`, /Bdos Err On A: File R\/O/, `function ${name}`);
    assert.equal(Buffer.compare(image, before), 0, `function ${name}: the card unchanged`);
  }
  assert.deepEqual(volume(image, "A").list().map((x) => [x.name, x.readOnly]), [["R.DAT", true]]);
});

test("function 16 of a never-opened FCB on a drive function 28 made read-only returns success and writes nothing, as CP/M 2.2's close does (A8, KE-148)", () => {
  const image = standardCard();
  volume(image, "A").write("C.DAT", new Uint8Array(128));
  const r = rig(image);
  r.call(5, { c: 28 });
  r.fcb(0, "C       DAT"); // never opened: S2's bit 7 is clear
  const before = image.slice();
  const got = attempt(r, 16);
  assert.equal(got.text, undefined, `no error: ${got.text}`);
  assert.equal(got.a, 0, "success");
  assert.equal(Buffer.compare(image, before), 0, "the card unchanged");
});

test("function 30 still changes a read-only file's attributes, as CP/M 2.2's does, and the file can then be written", () => {
  const image = standardCard();
  volume(image, "A").write("R.DAT", new Uint8Array(128), { readOnly: true });
  const r = rig(image);
  r.fcb(0, "R       DAT");
  assert.equal(r.bdos(30), 0, "the attribute cleared");
  assert.deepEqual(volume(image, "A").list().map((x) => [x.name, x.readOnly]), [["R.DAT", false]]);
  r.fcb(0, "R       DAT");
  assert.notEqual(r.bdos(15), 0xff);
  fill(1).forEach((v, k) => r.m.write(DMA + k, v));
  r.m.write(FCB + 32, 1);
  assert.equal(r.bdos(21), 0, "a write once it is read-write");
  assert.notEqual(r.bdos(16), 0xff);
  assert.equal(volume(image, "A").read("R.DAT").length, 256);
});

test("a write in place reaches the card before any close, and the recovery guide says so (KE-156)", () => {
  const image = standardCard();
  const old = Uint8Array.from({ length: 256 }, () => 0x11);
  volume(image, "A").write("OLD.DAT", old);
  const r = rig(image);
  const { m } = r;
  r.fcb(0, "OLD     DAT");
  assert.notEqual(r.bdos(15), 0xff, "opened");
  fill(7).forEach((v, k) => m.write(DMA + k, v));
  assert.equal(r.bdos(21), 0, "record 0 written over, and the file never closed");
  // A: coalesces: the block reaches the card at the next flush point, here a console read.
  r.bdos(11);
  const onCard = volume(image, "A").read("OLD.DAT");
  assert.deepEqual([...onCard.subarray(0, 128)], [...fill(7)], "the old record is gone from the card already");
  assert.deepEqual([...onCard.subarray(128, 256)], [...old.subarray(128)], "the record not written stays");
  const guide = readFileSync(resolve(ROOT, "docs/recovery.md"), "utf8");
  assert.doesNotMatch(guide, /never reaches any card/, "the guide no longer says unclosed data never reaches the card");
  for (const kind of ["Unwritten dirty data", "New allocations", "In-place overwrites"]) assert.match(guide, new RegExp(`\\*\\*${kind}\\.\\*\\*`), kind);
  assert.match(guide, /nothing is rolled back/);
  // KE-166: before a directory write, a volume written behind may already have some changes on the card, through eviction.
  assert.doesNotMatch(guide, /the card holds the volume as it was then/, "the card isn't said to hold the volume as it was");
  assert.match(guide, /already be on the card, written when their\s+lines were taken for other blocks/);
});

test("function 22 clears S2 and keeps EX, as CP/M 2.2's make does after clrmodnum, and a random write's make keeps the module it needs (KE-178)", () => {
  const image = standardCard();
  const r = rig(image);
  const { m } = r;
  r.fcb(0, "EXT     DAT");
  m.write(FCB + 12, 3);
  m.write(FCB + 14, 1);
  assert.notEqual(r.bdos(22), 0xff);
  assert.deepEqual([m.read(FCB + 12), m.read(FCB + 14)], [3, 0x80], "EX 3 kept, S2 0 with its bit 7 set: unmodified");
  const disk = () => volume(image, "A");
  const entries = () => Array.from({ length: disk().entries }, (_, i) => disk().entry(i)).filter((e) => e[0] === 0 && Buffer.from(e.subarray(1, 12)).toString("latin1") === "EXT     DAT");
  assert.deepEqual(entries().map((e) => [e[12], e[14], e[15]]), [[3, 0, 0]], "one entry, extent 3 of module 0, empty");
  // Record 4096 is extent 0 of module 1: the random write makes that entry through MAKEFCB, its S2 kept.
  [0x00, 0x10, 0x00].forEach((v, i) => m.write(FCB + 33 + i, v));
  fill(1).forEach((v, k) => m.write(DMA + k, v));
  assert.equal(r.bdos(34), 0, "record 4096 written");
  assert.deepEqual([m.read(FCB + 12), m.read(FCB + 14) & 0x3f], [0, 1], "the FCB on extent 0 of module 1");
  assert.notEqual(r.bdos(16), 0xff);
  assert.deepEqual(entries().map((e) => [e[12], e[14]]).sort((x, y) => x[1] - y[1] || x[0] - y[0]), [[3, 0], [0, 1]], "module 1's entry made beside the first");
});

/** The SD write after this call fails once, as a card's failed write does; later writes succeed. Returns a count of failures made. */
function failOneSdWrite(m, skip = 0) {
  const step = m.step.bind(m);
  const sdwrite = m.sym("SDWRITE");
  const sdfail = m.sym("SDFAIL");
  const got = { failed: 0, seen: 0 };
  m.step = () => {
    if (m.pc === sdwrite && got.failed === 0 && got.seen++ === skip) {
      got.failed += 1;
      m.cpu.cpu.a = 5;
      m.cpu.cpu.pc = sdfail;
    }
    return step();
  };
  got.restore = () => (m.step = step);
  return got;
}

const blocksOf = (fs, name) => fs.list().find((f) => f.name === name)?.entries.flatMap((e) => e.blocks) ?? [];

test("an erase whose directory write fails and returns the error frees none of the file's blocks, so a file made next takes others (KE-AR1)", () => {
  for (const mode of [0xff, 0xfe]) {
    const image = standardCard();
    volume(image, "A").write("OLD.DAT", new Uint8Array(128).fill(0x11));
    const r = rig(image);
    const { m } = r;
    r.bdos(45, mode);
    const before = alv(m, 0);
    r.fcb(0, "OLD     DAT");
    const fail = failOneSdWrite(m);
    assert.equal(r.bdos(19), 0xff, `mode ${mode.toString(16)}: the erase's error returned`);
    fail.restore();
    assert.equal(fail.failed, 1, "one SD write failed");
    assert.deepEqual(alv(m, 0), before, "the vector as it was: OLD.DAT's blocks still used");
    const oldBlocks = blocksOf(volume(image, "A"), "OLD.DAT");
    assert.notDeepEqual(oldBlocks, [], "OLD.DAT still on the card");
    r.fcb(0, "NEW     DAT");
    assert.notEqual(r.bdos(22), 0xff);
    for (let k = 0; k < 128; k += 1) m.write(DMA + k, 0x77);
    assert.equal(r.bdos(21), 0);
    assert.notEqual(r.bdos(16), 0xff);
    const fs = volume(image, "A");
    const newBlocks = blocksOf(fs, "NEW.DAT");
    assert.ok(!newBlocks.some((b) => oldBlocks.includes(b)), `NEW.DAT's blocks ${newBlocks} are not OLD.DAT's ${oldBlocks}`);
    assert.deepEqual(fs.verify(), []);
    assert.deepEqual([...new Set(fs.read("OLD.DAT"))], [0x11], "OLD.DAT's bytes intact");
  }
});

test("a wildcard erase whose second directory write fails keeps the first file erased and freed, and the second whole (KE-AR1)", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("ONE.DAT", new Uint8Array(128).fill(0x21));
  a.write("TWO.DAT", new Uint8Array(128).fill(0x22));
  const [one, two] = ["ONE.DAT", "TWO.DAT"].map((n) => blocksOf(a, n));
  const r = rig(image);
  const { m } = r;
  r.bdos(45, 0xff);
  r.fcb(0, "???     DAT");
  const fail = failOneSdWrite(m, 1);
  assert.equal(r.bdos(19), 0xff, "the second entry's write fails, the error returned");
  fail.restore();
  const fs = volume(image, "A");
  assert.deepEqual(fs.list().map((f) => f.name), ["TWO.DAT"], "ONE.DAT erased on the card, TWO.DAT not");
  const used = (b) => (alv(m, 0)[b >> 3] >> (7 - (b & 7))) & 1;
  assert.deepEqual([...one.map(used), ...two.map(used)], [...one.map(() => 0), ...two.map(() => 1)], "ONE.DAT's blocks free, TWO.DAT's still used");
  assert.deepEqual([...new Set(fs.read("TWO.DAT"))], [0x22]);
});

// KE-AR2: a random record in an extent not on the card, on drive A (G1M) and drive B (G8M). ONE.DAT holds one
// record of 35h; record 1024 is extent 8 of module 0.
const fcbFields = (m) => ({ ex: m.read(FCB + 12), s2: m.read(FCB + 14) & 0x3f, rc: m.read(FCB + 15), map: bytes(m, FCB + 16, 16) });
const setRecord = (m, rec) => [rec & 0xff, rec >> 8, 0].forEach((v, i) => m.write(FCB + 33 + i, v));
const fillDma = (m, v) => {
  for (let k = 0; k < 128; k += 1) m.write(DMA + k, v);
};
function oneRecord(drive, prepare) {
  const image = standardCard();
  volume(image, drive).write("ONE.DAT", new Uint8Array(128).fill(0x35));
  prepare?.(volume(image, drive));
  const r = rig(image);
  r.fcb(drive === "A" ? 1 : 2, "ONE     DAT");
  assert.notEqual(r.bdos(15), 0xff, "ONE.DAT opened");
  return { image, r, m: r.m, opened: fcbFields(r.m), card: () => volume(image, drive) };
}
const extents = (fs) => fs.list().find((f) => f.name === "ONE.DAT").entries.map((e) => e.extent).sort((x, y) => x - y);

for (const drive of ["A", "B"]) {
  test(`a random read of a missing extent returns 4 each time and leaves the FCB on its extent, on ${drive}: (KE-AR2)`, () => {
    const { m, r, opened } = oneRecord(drive);
    setRecord(m, 1024);
    for (let i = 0; i < 3; i += 1) {
      fillDma(m, 0xcc);
      const got = r.bdos(33);
      assert.deepEqual(bytes(m, DMA, 128), new Array(128).fill(0xcc), `read ${i + 1}: the DMA untouched`);
      assert.equal(got, 4, `read ${i + 1}: an extent not written`);
    }
    assert.deepEqual(fcbFields(m), opened, "EX, S2, RC and the map those of extent 0");
    fillDma(m, 0xcc);
    assert.equal(r.bdos(20), 0, "a sequential read after the misses reads extent 0's record");
    assert.deepEqual(bytes(m, DMA, 128), new Array(128).fill(0x35));
  });

  test(`a random write after a missed random read makes the extent and leaves record 0 alone, on ${drive}: (KE-AR2)`, () => {
    const { m, r, card } = oneRecord(drive);
    setRecord(m, 1024);
    assert.equal(r.bdos(33), 4, "the miss");
    fillDma(m, 0x77);
    const wrote = r.bdos(34);
    assert.deepEqual([...new Set(card().read("ONE.DAT").subarray(0, 128))], [0x35], "record 0 on the card untouched by the write");
    assert.equal(wrote, 0, "record 1024 written");
    assert.deepEqual([m.read(FCB + 12), m.read(FCB + 14) & 0x3f], [8, 0], "the FCB on extent 8");
    assert.notEqual(r.bdos(16), 0xff, "closed");
    const fs = card();
    const data = fs.read("ONE.DAT");
    assert.deepEqual([...new Set(data.subarray(0, 128))], [0x35], "record 0 on the card as it was");
    assert.deepEqual([...new Set(data.subarray(1024 * 128, 1025 * 128))], [0x77], "record 1024 on the card");
    assert.deepEqual(extents(fs), [0, 8]);
    assert.deepEqual(fs.verify(), []);
  });

  /** ONE.DAT open on DRIVE with every free directory entry taken by an empty file F0000000.DAT on. */
  const fullDirectory = () =>
    oneRecord(drive, (fs) => {
      let n = 0;
      for (let i = 0; i < fs.entries; i += 1) {
        const e = fs.entry(i);
        if (e[0] !== 0xe5) continue;
        e.fill(0);
        e.set(Buffer.from(`F${String(n).padStart(7, "0")}DAT`), 1);
        n += 1;
      }
    });
  const record0 = (card) => [...new Set(card().read("ONE.DAT").subarray(0, 128))];

  test(`a random write refused with the directory full is refused again, record 0 left alone, on ${drive}: (KE-AR2)`, () => {
    const { m, r, card, opened } = fullDirectory();
    setRecord(m, 1024);
    for (const v of [0x77, 0x78]) {
      fillDma(m, v);
      const got = r.bdos(34);
      assert.deepEqual(record0(card), [0x35], `the write of ${v.toString(16)}h: record 0 on the card untouched`);
      assert.equal(got, 5, `the write of ${v.toString(16)}h: the directory full`);
    }
    assert.deepEqual(fcbFields(m), opened, "the FCB back on extent 0");
    assert.deepEqual(extents(card()), [0]);
  });

  test(`a random write retried after the full directory gains a free entry makes the extent, record 0 left alone, on ${drive}: (KE-AR2)`, () => {
    const { m, r, card } = fullDirectory();
    setRecord(m, 1024);
    fillDma(m, 0x77);
    assert.equal(r.bdos(34), 5, "the directory full");
    putFcb(m, FCB2, drive === "A" ? 1 : 2, "F0000000DAT");
    assert.equal(r.call(5, { c: 19, de: FCB2 }), 0, "an entry freed");
    fillDma(m, 0x79);
    const got = r.bdos(34);
    assert.deepEqual(record0(card), [0x35], "record 0 on the card untouched by the retry");
    assert.equal(got, 0, "the retry makes extent 8 and writes record 1024");
    assert.notEqual(r.bdos(16), 0xff, "closed");
    const fs = card();
    assert.deepEqual([...new Set(fs.read("ONE.DAT").subarray(1024 * 128, 1025 * 128))], [0x79], "record 1024 on the card");
    assert.deepEqual(extents(fs), [0, 8]);
    assert.deepEqual(fs.verify(), []);
  });
}
