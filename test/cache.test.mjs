// The block cache (KS21): 30 lines of EXPAND 1 over the card, every volume's
// reads, and the one volume marked :wb written behind. Reads come back the
// same and a reread makes no card read; write-through volumes write as
// f49e380 did; a volume written behind reads back from the cache and from
// the card after warm boot, keeps its directory behind its data at every
// cut, keeps the no-pre-read rule safe, serves BLOCK from a dirty line and
// says when a card has gone; and the ROM before the cache mounts a :wb
// volume written through. The ROMs of f49e380 and 4ea57f7 are fixtures.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContainer, headerChecksum, parseContainer } from "../tools/lib/container.mjs";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, boot, program, romFor, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { rig } from "./lib/warmboot.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const pattern = (n, f) => Uint8Array.from({ length: n }, (_, i) => f(i) & 0xff);
const DATA = pattern(6000, (i) => i * 7 + 1);

/** A ROM kept as a fixture: { rom, symbols }. */
function oldRom(commit) {
  const f = JSON.parse(readFileSync(resolve(ROOT, `test/fixtures/rom-${commit}.json`), "utf8"));
  return { rom: Buffer.from(f.rom, "base64"), symbols: new Map(Object.entries(f.symbols).map(([k, v]) => [k.toUpperCase(), v])) };
}

/** SYSTEM on A:, WORK on B:, written behind when wb. */
const card = (wb = true) =>
  createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: wb },
  ]);

async function load(image, names, extra = {}) {
  const a = volume(image, "A");
  for (const n of names) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  for (const [n, data] of Object.entries(extra)) a.write(n, data);
  return image;
}

/** A machine on IMAGE (with ROM if given), at its first prompt. */
function start(image, { rom, ram96 = false, onSdWrite } = {}) {
  if (!rom && !onSdWrite) return boot(image, { ram96 });
  const r = rom ?? romFor();
  const m = new Machine({ ...r, sdImage: image, clock: TEST_CLOCK, ram96, onSdWrite });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}

/**
 * Follow M's card: each SDREAD and SDWRITE (with its block), and each BIOS
 * WRITE with the SDWRITEs made before it returned.
 */
function trace(m) {
  const s = (n) => m.sym(n);
  const t = { reads: 0, writes: [], bwrites: [], outside: 0 };
  const lba = () => word(m, s("SDLBA")) + word(m, s("SDLBA") + 2) * 0x10000;
  let bw = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    const sp = m.cpu.cpu.sp;
    if (pc === s("SDREAD")) t.reads += 1;
    if (pc === s("SDWRITE")) {
      t.writes.push(lba());
      if (bw) bw.sd.push(lba());
      else t.outside += 1;
    }
    if (!bw && pc === s("BWRITE")) bw = { ret: word(m, sp), sp, sd: [] };
    const r = step();
    if (bw && m.pc === bw.ret && m.cpu.cpu.sp === bw.sp + 2) [t.bwrites.push(bw.sd), (bw = null)];
    return r;
  };
  return t;
}

const cmd = (m, line) => m.command(line, { prompt: /\r\n[A-P]>$/, maxCycles: 2_000_000_000 });
const sumOf = (bytes) => {
  const recs = Math.ceil(bytes.length / 128);
  let s = 0;
  for (let i = 0; i < recs * 128; i += 1) s = (s + (bytes[i] ?? 0)) & 0xffff; // the card pads with zeros
  return `SUM ${s.toString(16).toUpperCase().padStart(4, "0")} RECS ${recs.toString(16).toUpperCase().padStart(4, "0")}`;
};

test("a file read again comes from the cache, with no card read, and the same bytes", async () => {
  const image = await load(standardCard(), ["readf", "sum"]);
  const r12 = pattern(12 * 1024, (i) => i * 13 + 5);
  volume(image, "B").write("R12.DAT", r12);
  const m = start(image);
  cmd(m, "DIR B:"); // B: logged in: its directory scan fills every line once
  const t = trace(m);
  cmd(m, "READF B:R12.DAT");
  const first = t.reads;
  cmd(m, "READF B:R12.DAT");
  assert.ok(first >= 24, `${first} card reads the first time`);
  assert.equal(t.reads - first, 0, "none the second time");
  assert.match(cmd(m, "SUM B:R12.DAT"), new RegExp(sumOf(r12)));
  assert.deepEqual(m.violations, []);
});

test("write-through volumes write the card as f49e380 did, block for block, before each BIOS WRITE returns", async () => {
  const run = async (rom) => {
    const image = await load(standardCard(), ["wbtest", "sum"], { "DATA.BIN": DATA });
    // COPY is the shell's, where the old ROM's was the CCP's. Both cards hold the
    // shell's files, so that their blocks lie where they do for each ROM.
    withShell(image);
    const m = start(image, { rom });
    const t = trace(m);
    for (const line of ["SAVE 8 X.COM", "COPY DATA.BIN B:DATA.CPY", "WBTEST", "ERA X.COM", "SAVE 2 B:Y.COM"]) cmd(m, line);
    return t;
  };
  const now = await run();
  const before = await run(oldRom("f49e380"));
  assert.ok(now.bwrites.length > 100, `${now.bwrites.length} BIOS WRITEs`);
  assert.ok(now.bwrites.every((w) => w.length === 1), "each BIOS WRITE writes its block once before it returns");
  assert.equal(now.outside, 0, "and nothing else writes the card");
  assert.deepEqual(now.bwrites, before.bwrites, "the same blocks in the same order as f49e380");
});

test("on a volume written behind, SAVE, COPY and a program's writes read back from the cache, and from the card after warm boot", async () => {
  const image = withShell(await load(card(), ["wbtest", "sum"], { "DATA.BIN": DATA })); // COPY is the shell's
  const m = start(image);
  const t = trace(m);
  const tpa = pattern(16 * 256, (i) => i * 3 + 7);
  tpa.forEach((v, i) => m.write(0x100 + i, v));
  const w0 = t.writes.length;
  cmd(m, "SAVE 16 B:S.COM");
  assert.ok(t.writes.length - w0 < 16, `${t.writes.length - w0} card writes for 32 records: each block once`);
  assert.match(cmd(m, "SUM B:S.COM"), new RegExp(sumOf(tpa)));
  cmd(m, "COPY DATA.BIN B:DATA.CPY");
  assert.match(cmd(m, "SUM B:DATA.CPY"), new RegExp(sumOf(DATA)));
  assert.match(cmd(m, "WBTEST"), /WB OK/);
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  const b = volume(image, "B");
  assert.deepEqual(b.read("S.COM"), tpa, "S.COM on the card");
  assert.deepEqual(b.read("DATA.CPY").slice(0, DATA.length), DATA, "DATA.CPY on the card");
  const seq = b.read("SEQ.DAT");
  assert.equal(seq.length, 64 * 128);
  for (let r = 0; r < 64; r += 1) assert.ok(seq.slice(r * 128, r * 128 + 128).every((v) => v === ((r * 3 + 1) & 0xff)), `SEQ.DAT record ${r}`);
  const rnd = b.read("RND.DAT");
  for (const r of [0, 40, 100]) assert.ok(rnd.slice(r * 128, r * 128 + 128).every((v) => v === (r ^ 0x5a)), `RND.DAT record ${r}`);
  assert.deepEqual(m.violations, []);
});

test("at every card write while a file is erased and its blocks reused, the volume verifies and no entry names another file's data", async () => {
  const image = await load(card(), []);
  let cuts = 0;
  const problems = [];
  const fill = { "F1.DAT": 0xa1, "F2.DAT": 0xb2 };
  const check = (img) => {
    cuts += 1;
    const b = volume(img, "B");
    problems.push(...b.verify().map((p) => `cut ${cuts}: ${p}`));
    for (const f of b.list())
      if (fill[f.name] !== undefined && !b.read(f.name).every((v) => v === fill[f.name])) problems.push(`cut ${cuts}: ${f.name} names another file's data`);
  };
  const m = start(image, { onSdWrite: check });
  const saveFilled = (name, v) => {
    for (let i = 0; i < 12 * 256; i += 1) m.write(0x100 + i, v);
    cmd(m, `SAVE 12 B:${name}`);
  };
  saveFilled("F1.DAT", 0xa1);
  const blocks = (n) => volume(image, "B").find(n).entries.flatMap((e) => [...e.slots].map(([, k]) => k));
  const f1 = blocks("F1.DAT");
  cmd(m, "ERA B:F1.DAT");
  const at = cuts;
  saveFilled("F2.DAT", 0xb2);
  assert.ok(cuts - at >= 4, `${cuts - at} cuts while F2.DAT reuses the blocks`);
  assert.deepEqual(blocks("F2.DAT").slice(0, 1), f1.slice(0, 1), "F2.DAT took F1.DAT's blocks");
  assert.deepEqual(problems, []);
});

test("a write after the block before it was cleared keeps a block's records that its line no longer holds", async () => {
  const image = await load(card(), ["npr"]);
  const b = volume(image, "B");
  b.write("BIG.DAT", pattern(24 * 1024, (i) => i)); // more than the cache's 15 KiB
  b.write("OLD.DAT", pattern(16 * 128, () => 0x4f));
  const m = start(image);
  assert.match(cmd(m, "NPR"), /NPR OK/);
  assert.deepEqual(m.violations, []);
});

/** Run code from 3000h to its final JR $ on M. */
function stub(m, code) {
  [...code, 0x18, 0xfe].forEach((v, i) => m.write(0x3000 + i, v));
  m.cpu.cpu.sp = 0x3000;
  m.cpu.cpu.pc = 0x3000;
  m.runUntil(() => m.pc === 0x3000 + code.length, 400_000_000, "the stub");
}
/** BDOS function FN with DE from a stub. */
const bdos = (m, fn, de) => stub(m, [0x0e, fn, 0x11, de & 0xff, de >> 8, 0xcd, 0x05, 0x00]);

/** B:Q.DAT made and four records written, not closed: dirty lines. */
function dirty(m) {
  [2, ...Buffer.from("Q       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 22, 0x5c);
  for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, 0xc3);
  bdos(m, 26, 0x2000);
  for (let r = 0; r < 4; r += 1) bdos(m, 21, 0x5c);
}

test("a card removed with dirty lines leaves the console working, and warm boot says the write was lost", async () => {
  const m = start(card());
  dirty(m);
  m.sd = null; // the card out
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0; // warm boot
  let seen = -1;
  for (let i = 0; i < 200 && !/\r\n[A-P]>$/.test(m.text(m.mark)); i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && /\r\n[A-P]>$/.test(m.text(m.mark))), 30_000_000, "the prompt");
    if (m.waitingForInput() && m.output.length === seen) m.type("\r"); // a BDOS error's key
    seen = m.output.length;
  }
  assert.match(m.text(m.mark), /Write lost/);
  assert.match(m.text(m.mark), /\r\n[A-P]>$/);
  assert.match(cmd(m, "USER 0"), /\r\n[A-P]>$/, "the console works");
});

test("the same card put back isn't started: Write lost once, the failed lines dropped, and a reset finds the records gone (KS36b)", async () => {
  const image = card();
  const m = start(image);
  dirty(m);
  m.sd = null; // the card out
  const warm = () => {
    m.mark = m.output.length;
    m.cpu.cpu.pc = 0;
    let seen = -1;
    for (let i = 0; i < 200 && !/\r\n[A-P]>$/.test(m.text(m.mark)); i += 1) {
      const end = m.cycles + 20_000_000;
      m.runUntil(() => m.cycles >= end || (m.waitingForInput() && /\r\n[A-P]>$/.test(m.text(m.mark))), 30_000_000, "the prompt");
      if (m.waitingForInput() && m.output.length === seen) m.type("\r");
      seen = m.output.length;
    }
    return m.text(m.mark);
  };
  assert.match(warm(), /Write lost/);
  m.swapCard(image);
  assert.doesNotMatch(warm(), /Write lost/, "the failed lines were dropped: nothing is said twice");
  m.reset();
  m.expect(/A>$/, { from: m.output.length, maxCycles: 200_000_000 });
  assert.equal(volume(image, "B").read("Q.DAT").length, 0, "the name was on the card, and its records are gone");
});

test("the ROM before the cache, 4ea57f7, mounts a :wb volume written through", async () => {
  const image = card();
  const m = start(image, { rom: oldRom("4ea57f7") });
  const t = trace(m);
  const tpa = pattern(4 * 256, (i) => i ^ 0x3c);
  tpa.forEach((v, i) => m.write(0x100 + i, v));
  cmd(m, "SAVE 4 B:X.COM");
  assert.ok(t.writes.length >= 8, `${t.writes.length} card writes: one for each of 8 records`);
  assert.deepEqual(volume(image, "B").read("X.COM"), tpa, "on the card before any warm boot");
  assert.deepEqual(m.violations, []);
});

/**
 * Card writes for which FAIL(block, data) gives "fail" or "commit" are
 * answered with a write error; "commit" writes the block first, as a card
 * that took the data and then failed.
 */
function failing(m, fail) {
  const sd = m.sd;
  const commit = sd.commitWrite.bind(sd);
  sd.commitWrite = () => {
    const w = sd.writeState;
    const how = w && fail(w.start / 512, w.buffer);
    if (!how) return commit();
    if (how === "commit") commit();
    sd.writeState = null;
    sd.pendingResponse = [0x0d, 0xff];
    sd.delayBytes = 1;
  };
}

/** SYSTEM on A:, WORK on B: (written behind when wb), and ARCHIVE, index 2, on no drive; C: has a slot. */
const card3 = (wb = true) =>
  createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B", writeBehind: wb },
      { geometry: "G8M", label: "ARCHIVE", mount: "-" },
    ],
    { drives: 3 },
  );

/** Type LINE and run to the prompt, answering a BDOS error with ^C. */
function through(m, line) {
  m.mark = m.output.length;
  m.type(line);
  for (let i = 0; i < 50; i += 1) {
    m.runUntil(() => m.waitingForInput(), 2_000_000_000, line);
    if (/\r\n[A-P]>$/.test(m.text(m.mark))) return m.text(m.mark);
    m.type("\x03");
  }
  throw new Error(`no prompt after ${line}`);
}

test("a directory write whose data line fails leaves the card's directory the truth, at every cut, through warm boot and a remount", async () => {
  const image = await load(card3(), ["mount"]);
  let cuts = 0;
  const problems = [];
  const fill = { "F1.DAT": 0xa1, "F2.DAT": 0xb2 };
  const check = (img) => {
    cuts += 1;
    const b = volume(img, "B");
    problems.push(...b.verify().map((p) => `cut ${cuts}: ${p}`));
    for (const f of b.list())
      if (fill[f.name] !== undefined && !b.read(f.name).every((v) => v === fill[f.name])) problems.push(`cut ${cuts}: ${f.name} names another file's data`);
  };
  const m = start(image, { onSdWrite: check });
  const fillTpa = (v) => {
    for (let i = 0; i < 12 * 256; i += 1) m.write(0x100 + i, v);
  };
  fillTpa(0xa1);
  cmd(m, "SAVE 12 B:F1.DAT");
  cmd(m, "ERA B:F1.DAT");
  let bad = null; // the first of F2.DAT's blocks the close's flush writes: it never reaches the card
  failing(m, (block, data) => {
    if (bad === null && data.every((v) => v === 0xb2)) bad = block;
    return block === bad && "fail";
  });
  fillTpa(0xb2);
  const out = through(m, "SAVE 12 B:F2.DAT\r");
  assert.notEqual(bad, null, "a data line failed");
  assert.match(out, /Bad Sector/, "the close's flush failed, and the BDOS says so");
  assert.equal(out.match(/Write lost/g)?.length, 1, "the failed line was kept dirty by that flush, so warm boot tried it again and says Write lost once (KE-AR8)");
  through(m, "MOUNT B: ARCHIVE\r");
  through(m, "MOUNT B: WORK\r");
  check(image);
  assert.deepEqual(problems, []);
  assert.deepEqual(m.violations, []);
});

/** NPR's run on B:, written behind or through; G.DAT's records back from the card. */
async function nprRun(wb) {
  const image = await load(card(wb), ["npr"]);
  const b = volume(image, "B");
  b.write("BIG.DAT", pattern(24 * 1024, (i) => i)); // more than the cache's 15 KiB
  b.write("OLD.DAT", pattern(16 * 128, () => 0x4f));
  const m = start(image);
  assert.match(cmd(m, "NPR"), /NPR OK/);
  assert.deepEqual(m.violations, []);
  return volume(image, "B").read("G.DAT");
}

test("a block that needs no pre-read reaches the card with its unwritten records zero, on a volume written behind and through", async () => {
  for (const wb of [true, false]) {
    const g = await nprRun(wb);
    const rec = (r) => g.slice(r * 128, r * 128 + 128);
    for (const r of [1, 2, 3, 4]) assert.ok(rec(r).every((v) => v === 0), `${wb ? ":wb" : "through"}: G.DAT record ${r} zero, not OLD.DAT's`);
    assert.ok(rec(5).every((v) => v === 0x55), "record 5 as written");
    assert.ok(rec(6).every((v) => v === 0x66), "record 6 as written");
  }
});

test("more than the cache written behind with no directory write between: dirty lines evicted, and the file the same from the cache and from the card", async () => {
  const image = card();
  const m = start(image);
  const t = trace(m);
  const tpa = pattern(63 * 256, (i) => (i * 11 + (i >> 9)) ^ 0x5a); // 15.75 KiB: 32 blocks, one extent
  tpa.forEach((v, i) => m.write(0x100 + i, v));
  cmd(m, "SAVE 63 B:E.COM");
  assert.ok(t.writes.length > 0, "lines written to make room");
  [2, ...Buffer.from("E       COM"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 15, 0x5c);
  for (let r = 0; r < 126; r += 1) {
    bdos(m, 26, 0x4000 + r * 128);
    bdos(m, 20, 0x5c);
  }
  const back = Uint8Array.from({ length: tpa.length }, (_, i) => m.read(0x4000 + i));
  assert.deepEqual(back, tpa, "from the cache");
  assert.deepEqual(volume(image, "B").read("E.COM"), tpa, "from the card");
});

test("an unclosed file's records reach the card at warm boot", async () => {
  const image = card();
  const m = start(image, { ram96: true });
  dirty(m);
  const table = m.sym("CTAB") - 0x8000;
  const d = m.sym("CDIRTY") - 0x8000;
  const line = Array.from({ length: 30 }, (_, i) => i).find((i) => m.expand[1][d + i]);
  const lba = [0, 1, 2, 3].reduce((a, k) => a + m.expand[1][table + 4 * line + k] * 256 ** k, 0);
  assert.ok(!image.slice(lba * 512, lba * 512 + 512).every((v) => v === 0xc3), "not on the card yet");
  m.cpu.cpu.pc = 0; // warm boot, as ^C
  m.mark = m.output.length;
  m.expect(/\r\nA>$/);
  assert.ok(image.slice(lba * 512, lba * 512 + 512).every((v) => v === 0xc3), "Q.DAT's four records on the card");
});

test("MOUNT writes the dirty lines before it changes a drive", async () => {
  const image = card3();
  const m = start(image, { ram96: true });
  dirty(m);
  const table = m.sym("CTAB") - 0x8000;
  const d = m.sym("CDIRTY") - 0x8000;
  const line = Array.from({ length: 30 }, (_, i) => i).find((i) => m.expand[1][d + i]);
  const lba = [0, 1, 2, 3].reduce((a, k) => a + m.expand[1][table + 4 * line + k] * 256 ** k, 0);
  stub(m, [0x06, 1, 0x0e, 9, 0x1e, 2, 0xcd, m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8]); // TNMOUNT B: with index 2, ARCHIVE
  assert.equal(m.cpu.cpu.a, 0, "mounted");
  assert.ok(image.slice(lba * 512, lba * 512 + 512).every((v) => v === 0xc3), "Q.DAT's records on the card before the drive changed");
});

test("a failed write-through write drops its block's line, so a reread comes from the card", async () => {
  const image = card(false);
  const m = start(image);
  const base = word(m, 1) - 3; // the BIOS jump table
  const bios = (n, bc) => [0x01, bc & 0xff, bc >> 8, 0xcd, (base + 3 * n) & 0xff, (base + 3 * n) >> 8];
  const at = [...bios(9, 1), ...bios(10, 6), ...bios(11, 2), ...bios(12, 0x2000)]; // B:, track 6, sector 2, DMA 2000h
  stub(m, [...at, ...bios(13, 0)]); // READ: the block now has a line
  const first = Array.from({ length: 128 }, (_, i) => m.read(0x2000 + i));
  for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, 0x77);
  let n = 0;
  failing(m, () => (n += 1) && "commit"); // the card takes the record and reports a failure
  stub(m, [...at, ...bios(14, 0)]); // WRITE
  assert.ok(n > 0 && m.cpu.cpu.a !== 0, "the write failed");
  failing(m, () => false);
  for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, 0);
  stub(m, [...at, ...bios(13, 0)]);
  const got = Array.from({ length: 128 }, (_, i) => m.read(0x2000 + i));
  assert.notDeepEqual(first, got);
  assert.ok(got.every((v) => v === 0x77), "the card's record, not the line's");
});

test("a volume remounted on another drive, with another on its old drive, reads back right", async () => {
  const image = await load(card3(false), ["mount", "sum"]);
  const work = pattern(6 * 1024, (i) => i * 5 + 1);
  const arch = pattern(6 * 1024, (i) => i * 9 + 2);
  volume(image, "B").write("R.DAT", work);
  volume(image, "ARCHIVE").write("R.DAT", arch);
  const m = start(image);
  assert.match(cmd(m, "SUM B:R.DAT"), new RegExp(sumOf(work)));
  assert.match(cmd(m, "MOUNT B: ARCHIVE"), /B: ARCHIVE/);
  assert.match(cmd(m, "SUM B:R.DAT"), new RegExp(sumOf(arch)), "B:'s new volume, not the lines of its old one");
  assert.match(cmd(m, "MOUNT C: WORK"), /C: WORK/);
  assert.match(cmd(m, "SUM C:R.DAT"), new RegExp(sumOf(work)), "WORK on C:");
  assert.deepEqual(m.violations, []);
});

test("descriptor byte 15's other bits reach no drive flag", async () => {
  for (const [v, flags] of [[0xfe, 0], [0xff, 2]]) {
    const image = card(false);
    image[32 + 32 + 15] = v;
    const sum = headerChecksum(image.subarray(0, 512));
    [image[20], image[21]] = [sum & 0xff, sum >> 8];
    const m = start(image);
    assert.equal(m.read(m.sym("DRVTAB") + 8 + 7), flags, `byte 15 ${v.toString(16)}h`);
  }
});

test("the harness takes the copy core's writes below BD00h as the cache's only when the cache called it", async () => {
  const m = start(card(), { ram96: true });
  cmd(m, "DIR B:");
  assert.deepEqual(m.expand1Writes, [], "the cache's own copies");
  m.write(m.sym("XMDST"), 1);
  m.write(m.sym("XMSRC"), 0);
  const mv = m.sym("MVCOPY");
  stub(m, [0x21, 0x00, 0x90, 0x11, 0x00, 0x20, 0x01, 0x10, 0x00, 0xcd, mv & 0xff, mv >> 8]); // 16 bytes to 9000h, bank 1
  assert.equal(m.expand1Writes.length, 16, "a copy not called by the cache is reported");
  EXPAND1_WRITES.splice(0);
});

/** Where 128 bytes of V lie in IMAGE, or -1. */
const runOf = (image, v) => Buffer.from(image).indexOf(Buffer.alloc(128, v));

test("function 48 puts the lines written behind on the card, A = 0, and FFh if a write fails, which warm boot doesn't say again (KS36b)", async () => {
  const image = card();
  const m = start(image);
  dirty(m);
  assert.equal(runOf(image, 0xc3), -1, "the records are only in the cache");
  bdos(m, 48, 0);
  assert.equal(m.cpu.cpu.a, 0);
  assert.notEqual(runOf(image, 0xc3), -1, "and on the card after function 48, before any close");

  const failed = card();
  const n = start(failed);
  dirty(n);
  failing(n, () => "fail");
  bdos(n, 48, 0);
  assert.equal(n.cpu.cpu.a, 0xff, "a failed write: FFh");
  n.mark = n.output.length;
  n.cpu.cpu.pc = 0;
  n.runUntil(() => n.waitingForInput() && /\r\n[A-P]>$/.test(n.text(n.mark)), 400_000_000, "warm boot");
  assert.doesNotMatch(n.text(n.mark), /Write lost/, "the failed line was dropped and reported by function 48");
});

test("function 45: FFh returns a BDOS error to the program, A = FFh and H the code, FEh says it first, and warm boot puts the default back (KS36b)", async () => {
  const m = start(card());
  for (const [mode, said] of [[0xff, false], [0xfe, true]]) {
    bdos(m, 45, mode);
    m.mark = m.output.length;
    bdos(m, 14, 15); // select P:, which has no volume
    assert.deepEqual([m.cpu.cpu.a, m.cpu.cpu.h], [0xff, 4], `mode ${mode.toString(16)}: a select error, returned`);
    assert.equal(/Bdos Err On P: Select/.test(m.text(m.mark)), said, `mode ${mode.toString(16)}: the message ${said ? "said" : "not said"}`);
  }
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput(), 400_000_000, "warm boot");
  assert.equal(m.read(m.sym("ERRMODE")), 0, "warm boot: the default again");
});

test("function 47's warm boot puts the lines written behind on the card before the chained program loads (KS36b)", async () => {
  const image = await load(card(), ["say"]);
  const m = start(image);
  dirty(m);
  [..."SAY", 0].forEach((v, i) => m.write(0x2100 + i, typeof v === "string" ? v.charCodeAt(0) : v));
  bdos(m, 26, 0x2100);
  let onCard = null;
  const step = m.step.bind(m);
  m.step = () => {
    if (onCard === null && m.pc === m.sym("LOADCOM")) onCard = runOf(image, 0xc3) !== -1;
    return step();
  };
  m.mark = m.output.length;
  m.write(0x3000, 0x0e); m.write(0x3001, 47); m.write(0x3002, 0xcd); m.write(0x3003, 0x05); m.write(0x3004, 0x00);
  m.cpu.cpu.sp = 0x3100;
  m.cpu.cpu.pc = 0x3000;
  m.runUntil(() => m.waitingForInput() && /\nSAY\r\n[A-P]>$/.test(m.text(m.mark)), 400_000_000, "the chained SAY");
  m.step = step;
  assert.equal(onCard, true, "the records were on the card when the CCP began to load SAY");
});

test("a flush tries every line: the first line's write failing, the next still reaches the card, and warm boot says Write lost once (KS36b)", async () => {
  const image = card();
  const m = start(image);
  // B:R.DAT, eight records not closed: a block of C3h and one of D4h, two dirty lines.
  [2, ...Buffer.from("R       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 22, 0x5c);
  for (const v of [0xc3, 0xd4])
    for (let r = 0; r < 4; r += 1) {
      for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, v);
      bdos(m, 26, 0x2000);
      bdos(m, 21, 0x5c);
    }
  failing(m, (block, data) => data.every((v) => v === 0xc3) && "fail");
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /\r\n[A-P]>$/.test(m.text(m.mark)), 400_000_000, "warm boot");
  assert.equal(runOf(image, 0xc3), -1, "the failed line never reached the card");
  assert.notEqual(runOf(image, 0xd4), -1, "the next line did");
  assert.equal(m.text(m.mark).match(/Write lost/g)?.length, 1);
});

test("the cold mount reads the table through a cache line, and leaves the TPA as it found it (KS36b)", () => {
  const m = boot(standardCard(), { ramFill: 0x76 });
  const tpa = Array.from({ length: 0x600 }, (_, i) => m.read(0x200 + i));
  assert.ok(tpa.every((v) => v === 0x76), "0200h-07FFh untouched by the mount");
});

/** BIOS entry N (0 cold boot, 9 SELDSK, ...) with BC from a stub. */
function bios(m, n, bc) {
  const at = word(m, 1) - 3 + 3 * n;
  stub(m, [0x01, bc & 0xff, bc >> 8, 0xcd, at & 0xff, at >> 8]);
  return m.cpu.cpu;
}

test("a BIOS WRITE of type 1 to a directory block no line holds, on the volume written behind with dirty data lines, puts the data on the card first and then the directory (KS36b review)", async () => {
  const image = await load(card(), [], { "BIG.DAT": pattern(40 * 512, (i) => i) });
  const runs = (img) => (Buffer.from(img).toString("latin1").match(/\xc3{512}/g) ?? []).length;
  const writes = [];
  const m = start(image, { onSdWrite: (img) => writes.push(runs(img)) });
  dirty(m);
  // B:'s first directory record, read by the BIOS into 2400h.
  const c = bios(m, 9, 1);
  const dpb = word(m, ((c.h << 8) | c.l) + 10);
  bios(m, 10, word(m, dpb + 13));
  bios(m, 11, 0);
  bios(m, 12, 0x2400);
  assert.equal(bios(m, 13, 0).a, 0);
  // A:BIG.DAT read through: its 40 blocks take every clean line, the directory's with it.
  [1, ...Buffer.from("BIG     DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x2100 + i, v));
  bdos(m, 15, 0x2100);
  bdos(m, 26, 0x2200);
  for (let r = 0; r < 160; r += 1) bdos(m, 20, 0x2100);
  bdos(m, 26, 0x2000);
  for (let r = 0; r < 4; r += 1) bdos(m, 21, 0x5c); // records 4 to 7: a dirty data line
  assert.equal(runs(image), 0, "Q.DAT's two blocks dirty, none on the card");
  const from = writes.length;
  bios(m, 9, 1);
  bios(m, 10, word(m, dpb + 13));
  bios(m, 11, 0);
  bios(m, 12, 0x2400);
  assert.equal(bios(m, 14, 1).a, 0, "the directory record written back, type 1");
  const after = writes.slice(from);
  assert.ok(after.length >= 3, `the data and the directory reached the card (${after.length} card writes)`);
  assert.equal(after[0], 1, "a data line first");
  assert.equal(after.at(-2), 2, "both before the directory, last");
  assert.deepEqual(m.violations, []);
});

/** Card block LBA's reads fail at SDREAD, as a card that won't give it. */
function unreadable(m, lba) {
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("SDREAD")) {
      const a = m.sym("SDLBA");
      if ((m.read(a) | (m.read(a + 1) << 8) | (m.read(a + 2) << 16)) === lba) m.cpu.cpu.pc = m.sym("SDRCMD");
    }
    return step();
  };
}

const fcbAt = (m, a) => Array.from({ length: 36 }, (_, i) => m.read(a + i));

test("function 45's returned error leaves the FCB on the record a sequential read didn't read, as CP/M 3 does (KS36b review)", async () => {
  const image = await load(card(false), [], { "R.DAT": pattern(8 * 128, (i) => (i >> 7) + 0x30) });
  const lba = Buffer.from(image).indexOf(Buffer.alloc(128, 0x34)) / 512; // records 4 to 7's block
  const m = start(image);
  [1, ...Buffer.from("R       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 15, 0x5c);
  bdos(m, 26, 0x2000);
  for (let r = 0; r < 4; r += 1) bdos(m, 20, 0x5c);
  bdos(m, 45, 0xff);
  unreadable(m, lba);
  const before = fcbAt(m, 0x5c);
  bdos(m, 20, 0x5c);
  assert.deepEqual([m.cpu.cpu.a, m.cpu.cpu.h], [0xff, 1], "a disk error, returned");
  assert.deepEqual(fcbAt(m, 0x5c), before, "the FCB where it was: record 4 next");
});

test("function 45's returned error leaves the FCB on the record a sequential write didn't write, as CP/M 3 does (KS36b review)", async () => {
  const image = await load(card(false), []);
  const m = start(image);
  [2, ...Buffer.from("W       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 22, 0x5c);
  bdos(m, 26, 0x2000);
  for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, 0xc3);
  for (let r = 0; r < 3; r += 1) bdos(m, 21, 0x5c);
  bdos(m, 45, 0xff);
  failing(m, (block, data) => data.some((v) => v === 0xc3) && "fail");
  const before = fcbAt(m, 0x5c);
  bdos(m, 21, 0x5c);
  assert.deepEqual([m.cpu.cpu.a, m.cpu.cpu.h], [0xff, 1], "a disk error, returned");
  assert.deepEqual(fcbAt(m, 0x5c), before, "the FCB where it was: record 3 next, the record count unraised");
});

test("when every line is dirty and the forced write of the next in turn fails, the next miss doesn't try that write again, and warm boot's flush does (KE-187)", async () => {
  const image = card();
  const m = start(image, { ram96: true });
  const d = m.sym("CDIRTY") - 0x8000;
  const table = m.sym("CTAB") - 0x8000;
  const allDirty = () => Array.from({ length: 30 }, (_, i) => m.expand[1][d + i]).every((v) => v);
  // B:Q.DAT made and written, not closed, until every line is dirty.
  [2, ...Buffer.from("Q       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 22, 0x5c);
  bdos(m, 26, 0x2000);
  for (let r = 0; r < 128 && !allDirty(); r += 1) {
    for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, (r * 3 + i) & 0xff);
    bdos(m, 21, 0x5c);
  }
  assert.ok(allDirty(), "every line dirty");
  const line = m.read(m.sym("CNEXT"));
  const block = [0, 1, 2, 3].reduce((a, k) => a + m.expand[1][table + 4 * line + k] * 256 ** k, 0);
  let tries = 0;
  failing(m, (b) => b === block && (tries += 1) && "fail");
  const base = word(m, 1) - 3; // the BIOS jump table
  const bios = (n, bc) => [0x01, bc & 0xff, bc >> 8, 0xcd, (base + 3 * n) & 0xff, (base + 3 * n) >> 8];
  const read = (track) => (stub(m, [...bios(9, 0), ...bios(10, track), ...bios(11, 0), ...bios(12, 0x2000), ...bios(13, 0)]), m.cpu.cpu.a);
  assert.notEqual(read(20), 0, "the first miss: the forced write fails, and so does the read");
  assert.equal(tries, 1, "that line's write tried once");
  assert.equal(read(21), 0, "the next miss reads");
  assert.equal(read(22), 0, "and the one after");
  assert.equal(tries, 1, "the failed line's write not tried again by a miss");
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0; // warm boot: the line, still dirty, tried by the flush
  m.runUntil(() => m.waitingForInput() && /\r\n[A-P]>$/.test(m.text(m.mark)), 400_000_000, "warm boot");
  assert.equal(tries, 2, "the flush tried it");
  assert.equal(m.text(m.mark).match(/Write lost/g)?.length, 1, "and said so");
});

// KE-AR7: a write that reads its block first, to any block but the key's own,
// ends the run of blocks cleared rather than read, so the key never names a
// block before one already written. Random writes into a new allocation block
// out of order: its first card block, its last, those between in turn, then
// the last again. Each geometry, written through and written behind.
const recordOf = (r) => Uint8Array.from({ length: 128 }, (_, k) => (r * 131 + k * 7 + 1) & 0xff);
for (const [geometry, wb] of [["G1M", false], ["G1M", true], ["G8M", false], ["G8M", true]])
  test(`random writes out of order into a new ${geometry} allocation block, ${wb ? "written behind" : "written through"}, keep every record, from the BDOS and on the card (KE-AR7)`, () => {
    const image = createContainer([
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry, label: "WORK", mount: "B", writeBehind: wb },
    ]);
    const r = rig(image);
    const m = r.m;
    const n = geometry === "G1M" ? 4 : 8; // card blocks of 4 records an allocation block
    const order = [0, 4 * (n - 1), ...Array.from({ length: n - 2 }, (_, i) => 4 * (i + 1)), 4 * (n - 1) + 1];
    const rr = (rec) => [rec & 0xff, rec >> 8, 0].forEach((v, i) => m.write(0x5c + 33 + i, v));
    r.fcb(2, "RAND    DAT");
    assert.equal(r.bdos(22), 0, "made");
    for (const rec of order) {
      recordOf(rec).forEach((v, k) => m.write(0x80 + k, v));
      rr(rec);
      assert.equal(r.bdos(34), 0, `record ${rec} written`);
    }
    assert.notEqual(r.bdos(16), 255, "closed");
    r.fcb(2, "RAND    DAT");
    assert.notEqual(r.bdos(15), 255, "opened");
    for (const rec of order) {
      rr(rec);
      assert.equal(r.bdos(33), 0, `record ${rec} read`);
      assert.deepEqual(Uint8Array.from({ length: 128 }, (_, k) => m.read(0x80 + k)), recordOf(rec), `record ${rec}, from the BDOS`);
    }
    r.warm();
    const card = volume(image, "B").read("RAND.DAT");
    for (const rec of order) assert.deepEqual(card.subarray(rec * 128, rec * 128 + 128), recordOf(rec), `record ${rec}, on the card`);
  });

// KE-AR8: a directory write on the volume written behind whose data lines
// fail leaves those lines dirty and drops only its own, so a close retried
// fails again until the card takes the data, and warm boot says Write lost.
/** WB.DAT made on B: (G8M, written behind) and records 0-7 written, with function 45 in FFh mode; the card refuses B:'s data blocks while refuse() says so. */
function closing(refuse) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true },
  ]);
  const r = rig(image);
  const m = r.m;
  r.call(5, { c: 45, de: 0xff });
  r.fcb(2, "WB      DAT");
  assert.equal(r.bdos(22), 0, "made");
  for (let rec = 0; rec < 8; rec += 1) {
    recordOf(rec).forEach((v, k) => m.write(0x80 + k, v));
    assert.equal(r.bdos(21), 0, `record ${rec}`);
  }
  const b = parseContainer(image).volumes[1];
  const data = (block) => block >= b.start + 32 && block < b.start + b.length; // past G8M's 32 directory blocks
  failing(m, (block) => refuse() && data(block) && "fail");
  return { r, m, image };
}

test("a close whose data lines the card refuses fails, and retried fails again until the card takes them, then the file is whole (KE-AR8)", () => {
  let refuse = true;
  const { r, m, image } = closing(() => refuse);
  assert.equal(r.bdos(16), 0xff, "the close fails");
  assert.equal(m.cpu.cpu.h, 1, "a BDOS error");
  assert.equal(r.bdos(16), 0xff, "retried with the card still refusing, it fails again");
  refuse = false;
  assert.equal(r.bdos(16), 0, "retried with the card taking the data, it succeeds");
  r.warm();
  const card = volume(image, "B").read("WB.DAT");
  assert.equal(card.length, 8 * 128, "eight records");
  for (let rec = 0; rec < 8; rec += 1) assert.deepEqual(card.subarray(rec * 128, rec * 128 + 128), recordOf(rec), `record ${rec}, on the card`);
});

test("a close whose data lines the card refuses leaves them for warm boot, which says Write lost, and the card's directory names no record (KE-AR8)", () => {
  const { r, m, image } = closing(() => true);
  assert.equal(r.bdos(16), 0xff, "the close fails");
  r.warm();
  assert.equal(m.text(m.mark).match(/Write lost/g)?.length, 1, "Write lost, once");
  const f = volume(image, "B").find("WB.DAT");
  assert.ok(!f || f.records === 0, `the card's entry names ${f?.records} records`);
});
