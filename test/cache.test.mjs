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
import { createContainer } from "../tools/lib/container.mjs";
import { Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, boot, program, romFor, standardCard, volume } from "./lib/fixtures.mjs";

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
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the first input request");
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
  const image = await load(card(), ["wbtest", "sum"], { "DATA.BIN": DATA });
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

test("BLOCK on a dirty block returns its line, not the card", async () => {
  const image = card();
  const m = start(image, { ram96: true });
  dirty(m);
  const table = m.sym("CTAB") - 0x8000;
  const d = m.sym("CDIRTY") - 0x8000;
  const line = Array.from({ length: 30 }, (_, i) => i).find((i) => m.expand[1][d + i]);
  assert.notEqual(line, undefined, "a dirty line");
  const lba = [0, 1, 2, 3].map((k) => m.expand[1][table + 4 * line + k]);
  const block = lba[0] | (lba[1] << 8) | (lba[2] << 16) | (lba[3] << 24);
  lba.forEach((v, k) => m.write(0x2800 + k, v));
  stub(m, [0x0e, 10, 0x21, 0x00, 0x28, 0x11, 0x00, 0x24, 0xcd, 0x0b, 0xff]); // BLOCK: HL = the LBA, DE = 2400h
  const got = Array.from({ length: 512 }, (_, i) => m.read(0x2400 + i));
  assert.deepEqual(got, Array.from(m.expand[1].slice(line * 512, line * 512 + 512)), "the line's bytes");
  assert.ok(got.slice(0, 128).every((v) => v === 0xc3), "with the record written");
  assert.ok(!image.slice(block * 512, block * 512 + 128).every((v) => v === 0xc3), "which the card has not got");
});

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
