// Cooperative integrity checks: ordinary OS entry progresses pending data;
// input, directory and recovery boundaries perform their required flush work.
// Updates already present in a block still coalesce. Byte integrity, write
// ordering and refusal retention are checked before traffic or timing limits.
// Emulator fault controls patch one guarded instruction span at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, ROOT, SHELL_SVC, abiDeclarations, boot, romFor, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";
import { recoveryInput } from "./lib/public-caller.mjs";
import { BUF, DMA, FCB, FCB2, FCB3, MUTANTS, backlog, card, closed8, dirBlocks, flushRun, pat, rig, same, three } from "./lib/coalesce.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const readText = (n) => readFileSync(resolve(ROOT, n), "utf8");
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

// The shell's landing, measured on its own build: the ROM, the TPA, abi.inc,
// the census's BDOS deepest, BDOS 11 with nothing waiting and BDOS 11 after
// each of 32 records, in cycles from the stub.
// abi is the digest of abi.inc's declarations, its comment lines left out.
const LANDING = { used: 14769, tpa: 47273, abi: "254a794dd99a0c7a189b06bff0b219671cf0eec5a5249ddd9bcacb3e54c43504", bdosDeepest: 32, bdos11: 3814, worst: 7_523_831 };
const INTEGRITY = { used: 16016, tpa: 47237, starter: 46533, entry: 0xb6c5 };

// Qualified control's costs in this exact returned-input fixture: one empty
// status call, and 32 write/status pairs on each logged drive. The integrity
// ceiling for the file sums only its 128 writes and close.
const QUALIFIED_COST = { bdos11: 3886, worstOnB: 7_552_243, worstOnA: 7_806_699 };
const COST = { emptyIncrease: 360, file16: 30_328_602 };

// --- Every landing keeps the version fields --------------------------------

test("AC12 version fields", () => {
  const inc = readText("src/abi.inc");
  assert.equal(sha(Buffer.from(abiDeclarations(inc), "utf8")), LANDING.abi, "abi.inc's declarations as at the shell's landing");
  assert.match(inc, /^SVCFMT EQU 4$/m);
  assert.equal(ABI.TNCOUNT, 17);
  const { rom } = romFor();
  assert.deepEqual([...rom.subarray(3, 8)], [0x54, 0x4e, 0x41, 5, 1], "TNA 5.1: ABIMIN unchanged");
  assert.match(readText("tools/build.mjs"), /^const VERSION = \{ major: 0, minor: 1 \};$/m);
  assert.deepEqual([...SHELL_SVC.subarray(25, 28)], [0x45, 0x58, 1], "the execution record's version byte stays 1");
});

// --- The ROM, RAM and TPA --------------------------------------------------

test("AC1 rom and tpa", () => {
  const census = JSON.parse(readText("build/tecos/census.json"));
  const { used, regions } = census.rom;
  assert.ok(used <= INTEGRITY.used, `${used} used, the combined integrity ceiling ${INTEGRITY.used}`);
  const gaps = regions.filter((r) => r.label === "free");
  assert.deepEqual(gaps.map((g) => g.end), [0x10000], "one contiguous free tail");
  const { symbols } = romFor();
  const at = symbols.get("CPEND");
  assert.ok(at >= symbols.get("RAMBIOS") + 51 && at < 0xc000, `CPEND at ${at.toString(16)}, above the RAM BIOS table`);
  assert.equal(census.ram.tpa.bytes, INTEGRITY.tpa, "the shared recovery allocation");
  assert.equal(census.ram.tpa.card, "twoVolume", "the coalescing reference remains explicit");
  assert.equal(census.ram.cards.twoVolume.tpa, INTEGRITY.tpa);
  assert.equal(census.ram.cards.starter.tpa, INTEGRITY.starter, "the four-drive starter has its own figure");
  assert.equal(census.ram.cards.starter.entry, INTEGRITY.entry);
  const m = boot(standardCard());
  assert.equal(word(m, 6) - 0x100, INTEGRITY.tpa, "(0006h) on the card");
  console.log(`ROM ${used} used (+${used - LANDING.used}), ${16384 - used} free, TPA ${census.ram.tpa.bytes}, CPEND ${at.toString(16)}h`);
});

// --- The flush rule ---------------------------------------------------------

/** The card block that holds record R of the file at FCB in R's machine. */
function lbaOf(r, rec) {
  const start = [...dirBlocks(r.image)][0];
  return start + Math.floor((r.blockOf(rec) * 2048 + (rec & 15) * 128) / 512);
}

const NO_FLUSH = [
  ["nothing", () => {}],
  ["BDOS 2", (r) => r.bdos(2, 0x41)],
  ["BDOS 9", (r) => ([0x41, 0x24].forEach((v, i) => r.m.write(BUF + i, v)), r.bdos(9, BUF))],
  ["BDOS 12", (r) => r.bdos(12, 0)],
  ["BDOS 6 output", (r) => r.bdos(6, 0x41)],
  ["BDOS 20 of a file already open", (r) => r.bdos(20, FCB2)],
  ["a fourth record in the same block", (r) => (r.put(3), r.bdos(21))],
  ["the BIOS's CONST", (r) => r.bios(0x06)],
];
const CONSOLE = [
  ["BDOS 1", (r) => (r.m.enqueueInput("x"), r.bdos(1, 0, true))],
  ["BDOS 6 E=FFh", (r) => r.bdos(6, 0xff)],
  ["BDOS 10", (r) => (r.m.write(BUF, 20), r.m.enqueueInput("x\r"), r.bdos(10, BUF, true))],
  ["BDOS 11", (r) => r.bdos(11, 0)],
];
const CONIN = [["the BIOS's CONIN", (r) => (r.m.enqueueInput("x"), r.bios(0x09, true))]];
const DIRECTORY = [
  ["BDOS 15", (r) => (r.name("Q       DAT", FCB2), r.bdos(15, FCB2))],
  ["BDOS 17", (r) => (r.name("???????????", FCB2), r.bdos(17, FCB2))],
  ["BDOS 35", (r) => (r.name("ZZ      DAT", FCB2), r.bdos(35, FCB2))],
];
/** BDOS 16 of the file's FCB copied to FCB2 with S2's bit 7 set: nothing changed. */
const unmodified = (r) => {
  const s = Array.from({ length: 36 }, (_, i) => r.m.read(FCB + i));
  s[14] |= 0x80;
  s.forEach((v, i) => r.m.write(FCB2 + i, v));
  return r.bdos(16, FCB2);
};
const CLOSE = [
  ["BDOS 16", (r) => r.bdos(16), 2],
  ["BDOS 16 of an unmodified FCB", unmodified],
];
const VOLUMES = [
  ["BDOS 48", (r) => r.bdos(48, 0)],
  ["MOUNT C: ARCHIVE", (r) => r.svc(9, 2, 2)],
  ["unmount B:", (r) => r.svc(10, 1, 0)],
];

/** Full-drain boundaries start with eight acknowledged blocks, not the single
 * latest update left by healthy ordinary-entry progress. */
function fullDrainCall([what, call], rom) {
  const r = backlog({ rom });
  const { before } = r;
  const next = before.round.slice(before.position).find(line => line !== 0xff) ?? before.queue[0];
  const entry = before.entries.find(e => e.line === next);
  assert.ok(entry, "the frozen round's next eligible line belongs to the retained queue");
  const first = r.attempts.length;
  r.backend.refusing = false;
  const result = call(r);
  const after = r.cacheState(), made = r.attempts.slice(first);
  assert.equal(result.a, what === "BDOS 1" || what === "the BIOS's CONIN" ? 0x78 : 0, `${what}: the functional result`);
  if (what === "BDOS 10") assert.deepEqual([r.m.read(BUF + 1), r.m.read(BUF + 2)], [1, 0x78], "the counted input is returned intact");
  if (what === "MOUNT C: ARCHIVE") assert.equal(r.m.read(r.m.sym("DRVIDX") + 2), 3);
  if (what === "unmount B:") assert.equal(r.m.read(r.m.sym("DRVIDX") + 1), 0);
  assert.deepEqual([after.depth, after.busy], [0, 0], "the public call returns to its outer caller");
  return { what, r, before, after, made, entry };
}

function checkFullDrain({ what, r, before, after, made, entry }) {
  assert.equal(after.queue.length, 0, `${what}: required drain completes all eight blocks`);
  assert.ok(after.dirty.every(v => !v));
  assert.deepEqual([after.any, after.pending], [0, 0]);
  assert.deepEqual(made.map(a => a.block), [entry.block, ...before.entries.filter(e => e.line !== entry.line).map(e => e.block)], "one ordinary entry attempt precedes the first-dirty full pass");
  assert.ok(made.every(a => a.accepted));
  for (const [block, expected] of r.expected) assert.deepEqual(r.image.slice(block * 512, (block + 1) * 512), expected, "all thirty-two acknowledged records are on the card");
}

const fullDrainRows = (rows, rom) => rows.forEach(row => checkFullDrain(fullDrainCall(row, rom)));

function checkMissingDrain(c) {
  const { r, before, after, made, entry } = c;
  assert.equal(after.queue.length, 7, "the omitted required drain leaves seven valid blocks");
  assert.deepEqual(made.map(a => a.block), [entry.block], "ordinary entry alone commits its actual next eligible line");
  assert.ok(made[0].accepted);
  assert.deepEqual(after.queue, before.queue.filter(line => line !== entry.line));
  assert.equal(after.dirty.filter(Boolean).length, 7, "there is no unqueued dirty block");
  assert.deepEqual(after.entries, before.entries.filter(e => e.line !== entry.line), "the exact intact complement of the entry commit remains queued");
  for (const e of after.entries) {
    assert.equal(e.dirty, 1);
    assert.deepEqual(e.payload, r.expected.get(e.block), "every omitted block remains intact in the queue");
  }
  for (const [block, expected] of r.expected) assert.deepEqual(r.image.slice(block * 512, (block + 1) * 512), block === entry.block ? expected : r.original.slice(block * 512, (block + 1) * 512));
  assert.throws(() => checkFullDrain(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], `${c.what}: required drain completes all eight blocks`);
    assert.equal(error.actual, 7);
    assert.equal(error.expected, 0);
    return true;
  });
}

function pendingFrame(r, block, line) {
  const { m } = r;
  assert.equal(m.expand, undefined);
  assert.ok(m.classicBankIn);
  const cache = m.banks[0];
  assert.equal(cache.length, 0x4000);
  const tag = cache.slice(m.sym("CTAB") - 0x8000 + line * 4, m.sym("CTAB") - 0x8000 + (line + 1) * 4);
  const dirty = Array.from(cache.subarray(m.sym("CDIRTY") - 0x8000, m.sym("CDIRTY") - 0x8000 + m.sym("NLINES")));
  return {
    pending: r.pending(),
    depth: m.read(m.sym("HKDEP")), busy: m.read(m.sym("HKBUSY")),
    queue: Array.from({ length: m.read(m.sym("HKCNT")) }, (_, i) => m.read(m.sym("HKQ") + i)),
    block: [...tag].reduce((n, b, i) => n + b * 256 ** i, 0),
    payload: cache.slice(line * 512, (line + 1) * 512),
    dirty, card: r.image.slice(block * 512, (block + 1) * 512),
  };
}

function healthyProgress(rows) {
  for (const [what, call] of rows) {
    const r = three({ open: true });
    const block = lbaOf(r, 0), line = r.pending() - 1;
    assert.ok(line >= 0 && line < r.m.sym("NLINES"));
    const want = new Uint8Array(512);
    for (let k = 0; k < 3; k++) want.set(pat(k), k * 128);
    const old = Uint8Array.from(want); old.fill(0, 256);
    const before = pendingFrame(r, block, line);
    assert.equal(before.block, block);
    assert.deepEqual([before.pending, before.depth, before.busy], [line + 1, 0, 0]);
    assert.deepEqual(before.queue, [line]);
    assert.equal(before.dirty.filter(Boolean).length, 1);
    assert.equal(before.dirty[line], 1);
    assert.deepEqual(before.payload, want);
    assert.deepEqual(before.card, old);
    assert.equal(r.state(), "CC-", "earlier healthy entries committed the first two records");
    const w0 = r.t.writes.length;
    const result = call(r);
    const after = pendingFrame(r, block, line);
    assert.deepEqual(r.t.writes.slice(w0), what === "nothing" ? [] : [block]);
    assert.deepEqual(after.card, what === "nothing" ? old : want);
    const remains = what === "nothing" || what === "a fourth record in the same block";
    assert.deepEqual(after.queue, remains ? [line] : []);
    assert.equal(after.dirty.filter(Boolean).length, remains ? 1 : 0);
    assert.equal(after.pending, remains ? line + 1 : 0);
    assert.deepEqual([after.depth, after.busy], [0, 0]);
    if (what === "a fourth record in the same block") {
      want.set(pat(3), 384);
      assert.equal(result.a, 0);
      assert.deepEqual(after.payload, want, "the new fourth record is received after the entry commit");
      assert.equal(r.onCard(3), false, "that newly received update has had no later opportunity");
    }
    if (what === "BDOS 12") assert.equal(result.a, 0x22);
    if (what === "BDOS 20 of a file already open" || what === "the BIOS's CONST") assert.equal(result.a, 0);
  }
}

/** Refuse earlier opportunities, recover at the same instruction boundary in
 * positive and omitted-prerequisite images, and copy the first cut before
 * later directory scans can repair it. No continuation or API context is reset. */
function pendingBoundary([what, call], kind, rom, omitted = false) {
  const r = three({ open: true, rom });
  const block = lbaOf(r, 0), line = r.pending() - 1;
  assert.ok(line >= 0 && line < r.m.sym("NLINES"));
  const want = new Uint8Array(512);
  for (let k = 0; k < 3; k++) want.set(pat(k), k * 128);
  const old = Uint8Array.from(want); old.fill(0, 256);
  const before = pendingFrame(r, block, line);
  assert.deepEqual([before.block, before.pending, before.depth, before.busy], [block, line + 1, 0, 0]);
  assert.deepEqual(before.queue, [line]);
  assert.equal(before.dirty.filter(Boolean).length, 1);
  assert.equal(before.dirty[line], 1);
  assert.deepEqual(before.payload, want);
  assert.deepEqual(before.card, old);
  const start = r.m.sym(kind), release = start + (kind === "READDIR" ? 3 : 0), observe = release + 6;
  const callBytes = name => [0xcd, r.m.sym(name) & 255, r.m.sym(name) >> 8];
  const tail = omitted ? new Array(6).fill(0) : [...callBytes("CPOUT"), 0xc2, r.m.sym("BADSECT") & 255, r.m.sym("BADSECT") >> 8];
  const span = [...(kind === "READDIR" ? callBytes("HKPOINT") : []), ...tail];
  assert.deepEqual(Array.from({ length: span.length }, (_, i) => r.m.read(start + i)), span, "the complete common prerequisite span is bound to this image");
  const fault = r.refuse(), attempts = [];
  const commit = r.m.sd.commitWrite.bind(r.m.sd);
  r.m.sd.commitWrite = () => {
    const { start, buffer } = r.m.sd.writeState;
    const payload = Uint8Array.from(buffer), accepted = !fault.on;
    assert.equal(start / 512, block);
    assert.deepEqual(payload, want);
    attempts.push({ block, payload, accepted });
    commit();
    if (accepted) {
      assert.equal(r.m.sd.pendingResponse[0], 0x05);
      assert.deepEqual(r.image.slice(start, start + 512), want);
    }
  };
  let atRelease, cut;
  const step = r.m.step.bind(r.m);
  r.m.step = () => {
    if (!atRelease && r.m.pc === release) {
      atRelease = pendingFrame(r, block, line);
      assert.deepEqual([atRelease.depth, atRelease.busy, atRelease.pending], [1, 0, line + 1]);
      assert.deepEqual(atRelease.queue, [line]);
      assert.equal(atRelease.block, block);
      assert.equal(atRelease.dirty.filter(Boolean).length, 1);
      assert.deepEqual(atRelease.payload, want);
      assert.deepEqual(atRelease.card, old);
      assert.ok(attempts.length > 0 && attempts.every(a => !a.accepted), "earlier real entry/private attempts were refused");
      fault.on = false;
    }
    if (!cut && r.m.pc === observe) cut = { ...pendingFrame(r, block, line), attempts: attempts.slice() };
    return step();
  };
  const result = call(r);
  r.m.step = step;
  assert.ok(atRelease && cut, "the common release and first continuation are actually reached");
  assert.deepEqual([cut.depth, cut.busy], [1, 0], "the copied cut remains inside its original outer API");
  if (what === "BDOS 35") {
    assert.equal(result.a, 0xff, "function 35's defined completion value");
    assert.deepEqual(Array.from({ length: 3 }, (_, i) => r.m.read(FCB2 + 33 + i)), [0, 0, 0], "the missing ZZ file has zero computed random-record size");
  }
  else assert.ok(result.a >= 0 && result.a <= 3, `${what}: successful slot/no-write result`);
  return { what, r, before, atRelease, cut, block, line, want, old };
}

function checkPendingBoundary(c) {
  assert.equal(c.cut.pending, 0, `${c.what}: the pending block is committed before the first continuation`);
  assert.deepEqual(c.cut.queue, []);
  assert.ok(c.cut.dirty.every(v => !v));
  assert.equal(c.cut.block, c.block);
  assert.deepEqual(c.cut.payload, c.want);
  assert.deepEqual(c.cut.card, c.want);
  assert.deepEqual(c.cut.attempts.filter(a => a.accepted).map(a => a.block), [c.block]);
}

function checkOmittedPending(c) {
  assert.equal(c.cut.pending, c.line + 1);
  assert.deepEqual(c.cut.queue, [c.line]);
  assert.equal(c.cut.dirty.filter(Boolean).length, 1);
  assert.equal(c.cut.dirty[c.line], 1);
  assert.equal(c.cut.block, c.block);
  assert.deepEqual(c.cut.payload, c.want);
  assert.deepEqual(c.cut.card, c.old);
  assert.ok(c.cut.attempts.every(a => !a.accepted));
  assert.throws(() => checkPendingBoundary(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], `${c.what}: the pending block is committed before the first continuation`);
    assert.equal(error.actual, c.line + 1);
    assert.equal(error.expected, 0);
    return true;
  });
}

/** These calls deliberately enter the private BIOS handler. They test the
 * pending-block protocol inside one logical operation, before any later
 * public entry can commit or repair its data. */
function privateWrite(kind, rom) {
  const image = card();
  for (const [drive, value] of [["A", 0x6b], ["B", 0x7d]]) {
    const v = volume(image, drive), off = v.g.dirBlocks * v.blockBytes;
    v.data.fill(value, off, drive === "A" ? v.data.length : off + 512);
  }
  const r = three({ open: true, image, rom });
  const block = lbaOf(r, 0), line = r.pending() - 1;
  assert.ok(line >= 0 && line < r.m.sym("NLINES"));
  const want = new Uint8Array(512);
  for (let k = 0; k < 3; k++) want.set(pat(k), k * 128);
  const old = Uint8Array.from(want); old.fill(0, 256);
  const before = pendingFrame(r, block, line);
  assert.deepEqual([before.block, before.pending, before.depth, before.busy], [block, line + 1, 0, 0]);
  assert.deepEqual(before.queue, [line]);
  assert.equal(before.dirty.filter(Boolean).length, 1);
  assert.equal(before.dirty[line], 1);
  assert.deepEqual(before.payload, want);
  assert.deepEqual(before.card, old);
  const aStart = [...dirBlocks(image)][0], relative = block - aStart;
  const key = [r.m.read(r.m.sym("BUFOK")), r.m.read(r.m.sym("BUFDRV")), word(r.m, r.m.sym("BUFBLK"))];
  assert.deepEqual(key, [2, 0, relative], "the actual no-pre-read key belongs to this A block");
  if (kind === "same") assert.notEqual(r.m.read(r.m.sym("CNEXT")), line, "the by-line fault must disagree with the real pending tag");
  const drive = kind === "other" ? "B" : "A", v = volume(image, drive);
  assert.equal(v.d.spt, 64); assert.equal(v.d.off, 0);
  const start = [...dirBlocks(image, drive)][0];
  const targetBlock = kind === "other" ? start + v.g.dirBlocks * v.blockBytes / 512 : block + (kind === "next" ? 1 : 0);
  const slot = kind === "same" ? 3 : 0, record = (targetBlock - start) * 4 + slot;
  if (kind === "next") assert.equal(Math.floor((targetBlock - start) * 512 / v.blockBytes), r.blockOf(0), "the next SD block is inside the already allocated file block");
  const targetOld = image.slice(targetBlock * 512, (targetBlock + 1) * 512);
  if (kind !== "same") assert.ok(targetOld.every(b => b === (kind === "next" ? 0x6b : 0x7d)));
  const targetWant = kind === "same" ? Uint8Array.from(want) : kind === "next" ? new Uint8Array(512) : Uint8Array.from(targetOld);
  const update = kind === "same" ? 3 : kind === "next" ? 4 : 9;
  targetWant.set(pat(update), slot * 128);
  r.put(update);
  const putWord = (name, value) => { r.m.write(r.m.sym(name), value & 255); r.m.write(r.m.sym(name) + 1, value >> 8); };
  r.m.write(r.m.sym("DSKCUR"), drive === "A" ? 0 : 1);
  putWord("DSKTRK", Math.floor(record / 64)); putWord("DSKSEC", record % 64); putWord("DSKDMA", DMA);
  const expectedMap = { drive: drive === "A" ? 0 : 1, track: Math.floor(record / 64), sector: record % 64, dma: DMA, offset: targetBlock - start, slot, absolute: targetBlock, preRead: kind === "next" ? 1 : 0 };
  const mapping = () => ({ drive: r.m.read(r.m.sym("DSKCUR")), track: word(r.m, r.m.sym("DSKTRK")), sector: word(r.m, r.m.sym("DSKSEC")), dma: word(r.m, r.m.sym("DSKDMA")), offset: word(r.m, r.m.sym("BLKOFF")), slot: r.m.read(r.m.sym("BLKSLOT")), absolute: word(r.m, r.m.sym("SDLBA")) + word(r.m, r.m.sym("SDLBA") + 2) * 65536, preRead: r.m.cpu.cpu.c });
  const made = [], maps = [];
  const commit = r.m.sd.commitWrite.bind(r.m.sd);
  r.m.sd.commitWrite = () => {
    const { start, buffer } = r.m.sd.writeState;
    const payload = Uint8Array.from(buffer);
    assert.equal(start / 512, block);
    assert.deepEqual(payload, want, "only already received data is committed before the private boundary");
    commit();
    assert.equal(r.m.sd.pendingResponse[0], 0x05);
    assert.deepEqual(image.slice(start, start + 512), want);
    made.push({ block, payload });
  };
  const step = r.m.step.bind(r.m), w0 = r.t.writes.length, rd0 = r.t.reads.length;
  r.m.step = () => {
    assert.notEqual(r.m.pc, r.m.sym("HKENTER"), "this test must not silently become an outer API call");
    if (r.m.pc === r.m.sym("BWGET") || r.m.pc === r.m.sym("CWRBH")) {
      assert.deepEqual([r.m.read(r.m.sym("HKDEP")), r.m.read(r.m.sym("HKBUSY"))], [0, 0]);
      const observed = mapping();
      assert.deepEqual(observed, expectedMap, "writeback must preserve the independently staged mapping and pre-read choice");
      maps.push({ pc: r.m.pc, ...observed });
    }
    return step();
  };
  const entry = r.m.sym("BWRITE");
  const result = r.stub([0x0e, 0, 0xcd, entry & 255, entry >> 8]);
  r.m.step = step;
  assert.equal(result.a, 0);
  assert.equal(r.m.cpu.cpu.sp, 0x3000);
  assert.deepEqual(maps.map(x => x.pc), [r.m.sym("BWGET"), r.m.sym("CWRBH")]);
  assert.deepEqual(r.t.writes.slice(w0), made.map(a => a.block));
  assert.deepEqual(r.t.reads.slice(rd0), kind === "other" ? [targetBlock] : [], "only the other drive needs its own neighbour pre-read");
  const oldAfter = pendingFrame(r, block, line);
  const cache = r.m.banks[0];
  const matches = Array.from({ length: r.m.sym("NLINES") }, (_, i) => i).filter(i => [0, 1, 2, 3].reduce((n, k) => n + cache[r.m.sym("CTAB") - 0x8000 + i * 4 + k] * 256 ** k, 0) === targetBlock);
  assert.equal(matches.length, 1);
  const targetLine = matches[0], target = pendingFrame(r, targetBlock, targetLine);
  assert.deepEqual(target.payload, targetWant);
  assert.equal(target.dirty[targetLine], 1);
  return { kind, r, block, line, want, old, before, made, oldAfter, targetBlock, targetLine, target, targetOld, targetWant };
}

function checkPrivateWrite(c) {
  assert.equal(c.made.length, c.kind === "same" ? 0 : 1, `${c.kind}: the private pending prerequisite's write count`);
  assert.deepEqual(c.oldAfter.card, c.kind === "same" ? c.old : c.want);
  assert.deepEqual(c.target.queue, [c.targetLine]);
  assert.equal(c.target.dirty.filter(Boolean).length, 1);
  assert.equal(c.target.pending, c.kind === "other" ? 0 : c.targetLine + 1);
  assert.deepEqual(c.target.card, c.targetOld, "the new received update has no later public opportunity");
}

function checkPrivateOmission(c) {
  assert.equal(c.made.length, 0);
  assert.deepEqual(c.oldAfter.card, c.old);
  assert.deepEqual(c.oldAfter.payload, c.want);
  assert.equal(c.oldAfter.dirty[c.line], 1);
  assert.deepEqual(c.target.queue, [c.line, c.targetLine]);
  assert.equal(c.target.dirty.filter(Boolean).length, 2);
  assert.deepEqual(c.target.card, c.targetOld);
  assert.throws(() => checkPrivateWrite(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], `${c.kind}: the private pending prerequisite's write count`);
    assert.equal(error.actual, 0); assert.equal(error.expected, 1);
    return true;
  });
}

function closePublication(rom) {
  const r = three({ open: true, rom }), w0 = r.t.writes.length;
  const file = volume(r.image, "A").find("P.DAT");
  assert.equal(file.records, 0, "the setup has a real unpublished extent");
  assert.equal(file.entries.length, 1);
  const offset = file.entries[0].index * 32;
  const directoryBlock = [...dirBlocks(r.image)][0] + Math.floor(offset / 512);
  const directoryWant = r.image.slice(directoryBlock * 512, (directoryBlock + 1) * 512);
  directoryWant.set(Array.from({ length: 20 }, (_, i) => r.m.read(FCB + 12 + i)), offset % 512 + 12);
  assert.equal(r.state(), "CC-");
  const result = r.bdos(16);
  assert.ok(result.a >= 0 && result.a <= 3);
  return { r, made: r.t.writes.slice(w0), published: volume(r.image, "A").find("P.DAT").records, directoryBlock, directoryWant, want: Uint8Array.from([0, 1, 2].flatMap(k => [...pat(k)])) };
}

function checkPublication(c) {
  assert.equal(c.published, 3, "the successful close publishes all three records");
  assert.equal(c.made.length, 2);
  assert.equal(c.made[0], lbaOf(c.r, 0));
  assert.ok(dirBlocks(c.r.image).has(c.made[1]));
  assert.equal(c.r.pending(), 0);
  assert.deepEqual(c.r.image.slice(c.directoryBlock * 512, (c.directoryBlock + 1) * 512), c.directoryWant, "the pre-close FCB changes only its own extent fields, preserving all neighbouring entries");
  assert.deepEqual(volume(c.r.image, "A").read("P.DAT"), c.want);
  assert.deepEqual(volume(c.r.image, "A").verify(), []);
}

test("AC2 healthy ordinary and selected opportunities", () => healthyProgress(NO_FLUSH));
test("AC2 console reads flush", () => fullDrainRows(CONSOLE));
test("AC2 bios conin flushes", () => fullDrainRows(CONIN));
test("AC2 directory requests preserve the pending-block prerequisite", () => {
  for (const row of DIRECTORY) checkPendingBoundary(pendingBoundary(row, "READDIR"));
});
test("AC2 close preserves publication and the unmodified pending-block prerequisite", () => {
  checkPublication(closePublication());
  checkPendingBoundary(pendingBoundary(CLOSE[1], "FNCLSE"));
});
test("AC2 private same-block merge and next-block prerequisite", () => {
  for (const kind of ["same", "next"]) checkPrivateWrite(privateWrite(kind));
});
test("AC2 private other-drive prerequisite preserves its neighbours", () => checkPrivateWrite(privateWrite("other")));
test("AC2 function 48, mount and unmount", () => fullDrainRows(VOLUMES));

/** After three records, a warm boot started by GO: the card and its writes when it enters the CCP. */
function warmRow(go) {
  const r = three({ open: true });
  const entry = r.m.sym("CCPENT");
  const w0 = r.t.writes.length;
  let seen = null;
  const step = r.m.step.bind(r.m);
  r.m.step = () => {
    if (seen === null && r.m.pc === entry) seen = { state: r.state(), writes: r.t.writes.length - w0 };
    return step();
  };
  r.warm(() => go(r));
  return seen;
}
const program = (r, code) => {
  [...code].forEach((v, i) => r.m.write(0x3000 + i, v));
  Object.assign(r.m.cpu.cpu, { sp: 0x3000, pc: 0x3000 });
};

test("AC2 warm boot", () => {
  const rows = {
    // A program printing A for ever, stopped by ^S then ^C.
    "^C": (r) => (program(r, [0x0e, 2, 0x1e, 0x41, 0xcd, 5, 0, 0x18, 0xf7]), r.m.enqueueInput("\x13\x03")),
    "JP 0000h": (r) => program(r, [0xc3, 0, 0]),
    "BDOS 0": (r) => program(r, [0x0e, 0, 0xcd, 5, 0]),
    "function 47": (r) => {
      [..."USER 0"].forEach((c, i) => r.m.write(0x2100 + i, c.charCodeAt(0)));
      r.m.write(0x2106, 0);
      program(r, [0x0e, 26, 0x11, 0x00, 0x21, 0xcd, 5, 0, 0x0e, 47, 0xcd, 5, 0]);
    },
  };
  for (const [what, go] of Object.entries(rows)) assert.deepEqual(warmRow(go), { state: "CCC", writes: 1 }, `${what}: the block on the card as the CCP starts`);
});

test("AC2 directory last", () => {
  const r = three({ open: true });
  const w0 = r.t.writes.length;
  assert.notEqual(r.bdos(16).a, 0xff, "closed");
  const made = r.t.writes.slice(w0);
  assert.equal(made.length, 2, "the close: the block, then the directory");
  assert.equal(made[0], lbaOf(r, 0), "the data block first");
  assert.ok(dirBlocks(r.image).has(made[1]), "then a directory block");
  assert.equal(r.pending(), 0, "nothing pending after the close");
});

test("AC2 mutant: FNSTAT without its call leaves seven blocks after ordinary entry", () => {
  const c = fullDrainCall(CONSOLE[3], MUTANTS.fnstat());
  checkMissingDrain(c);
});
test("AC2 mutant: READDIR without its prerequisite leaves the block pending at the first cut", () => {
  const mut = MUTANTS.readdir();
  for (const row of DIRECTORY) {
    const c = pendingBoundary(row, "READDIR", mut, true);
    checkOmittedPending(c);
  }
});
test("AC2 mutant: FNCLSE without its prerequisite leaves the block pending at the unmodified close", () => {
  const c = pendingBoundary(CLOSE[1], "FNCLSE", MUTANTS.fnclse(), true);
  checkOmittedPending(c);
});
test("AC2 mutant: BCONIN without its call leaves seven blocks after ordinary entry", () => {
  const c = fullDrainCall(CONIN[0], MUTANTS.bconin());
  checkMissingDrain(c);
});
test("AC2 mutant: omitted CPMOVE leaves acknowledged data across private block boundaries", () => {
  const mut = MUTANTS.cpmove();
  for (const kind of ["next", "other"]) {
    const c = privateWrite(kind, mut);
    checkPrivateOmission(c);
  }
});
test("AC2 mutant: coalesced type 1 leaves successful-close metadata unpublished", () => {
  const c = closePublication(MUTANTS.type1());
  assert.equal(c.published, 0);
  assert.deepEqual(c.made, [lbaOf(c.r, 0)]);
  assert.equal(c.r.state(), "CCC", "the data was committed, but its directory was not");
  const line = c.r.pending() - 1;
  assert.ok(line >= 0 && line < c.r.m.sym("NLINES"));
  const cache = c.r.m.banks[0];
  const block = [0, 1, 2, 3].reduce((n, k) => n + cache[c.r.m.sym("CTAB") - 0x8000 + line * 4 + k] * 256 ** k, 0);
  assert.ok(dirBlocks(c.r.image).has(block));
  const pending = pendingFrame(c.r, block, line);
  assert.equal(block, c.directoryBlock);
  assert.deepEqual(pending.payload, c.directoryWant, "the complete pending directory matches independently predicted extent fields and original neighbours");
  assert.deepEqual(pending.queue, [line]);
  assert.equal(pending.dirty.filter(Boolean).length, 1);
  assert.equal(pending.dirty[line], 1);
  const overlay = Uint8Array.from(c.r.image);
  overlay.set(pending.payload, block * 512);
  assert.equal(volume(overlay, "A").find("P.DAT").records, 3);
  assert.deepEqual(volume(overlay, "A").read("P.DAT"), c.want, "the observed pending metadata describes the independently known complete file");
  assert.deepEqual(volume(overlay, "A").verify(), []);
  assert.throws(() => checkPublication(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], "the successful close publishes all three records");
    assert.equal(error.actual, 0); assert.equal(error.expected, 3);
    return true;
  });
});

// --- Progressing acknowledged updates --------------------------------------

const knownRecords = count => Uint8Array.from(Array.from({ length: count }, (_, k) => [...pat(k)]).flat());

/** Check the actual accepted block payload against updates acknowledged before
 * this call, then check that publication follows all acknowledged data. */
function acknowledgedWrites(r, drive = "A") {
  const model = new Map(), commits = [], directories = dirBlocks(r.image, drive);
  let closing = false;
  const commit = r.m.sd.commitWrite.bind(r.m.sd);
  r.m.sd.commitWrite = () => {
    const { start, buffer } = r.m.sd.writeState;
    const block = start / 512, payload = Uint8Array.from(buffer);
    if (!directories.has(block)) {
      assert.ok(model.has(block), "data commits belong to an acknowledged block");
      assert.deepEqual(payload, model.get(block), "a commit includes all previously acknowledged updates");
    } else if (closing) {
      for (const [tag, want] of model) assert.deepEqual(r.image.slice(tag * 512, (tag + 1) * 512), want, "acknowledged data precedes directory publication");
    }
    commit();
    assert.equal(r.m.sd.pendingResponse[0], 0x05);
    assert.deepEqual(r.image.slice(start, start + 512), payload);
    commits.push(block);
  };
  return { commits, model, close: () => { closing = true; }, acknowledge: rec => {
    const fs = volume(r.image, drive), at = Math.floor(rec / (fs.blockBytes / 128));
    assert.ok(at < fs.pointers);
    const block = fs.wide ? word(r.m, FCB + 16 + 2 * at) : r.m.read(FCB + 16 + at);
    assert.ok(block >= fs.g.dirBlocks && block <= fs.d.dsm);
    const absolute = [...directories][0] + Math.floor((block * fs.blockBytes + rec % (fs.blockBytes / 128) * 128) / 512);
    if (!model.has(absolute)) model.set(absolute, new Uint8Array(512));
    model.get(absolute).set(pat(rec), (rec & 3) * 128);
  } };
}

/** The 16 KiB file: 128 writes and close, excluding make and readback. */
function file16(rom) {
  const r = rig({ rom }), observed = acknowledgedWrites(r), mark = r.m.output.length;
  r.name("S16     DAT");
  assert.ok(r.bdos(22).a <= 3);
  r.bdos(26, DMA);
  const [w0, rd0] = [r.t.writes.length, r.t.reads.length];
  let cycles = 0;
  for (let k = 0; k < 128; k++) {
    r.put(k);
    const result = r.bdos(21);
    assert.equal(result.a, 0);
    assert.equal(r.m.read(FCB + 32), k + 1);
    cycles += result.cycles;
    observed.acknowledge(k);
  }
  assert.equal(volume(r.image, "A").find("S16.DAT").records, 0, "unclosed file metadata is not published early");
  observed.close();
  const closed = r.bdos(16); assert.ok(closed.a <= 3); cycles += closed.cycles;
  const writes = r.t.writes.slice(w0), reads = r.t.reads.slice(rd0);
  const data = new Set(observed.model.keys()), want = knownRecords(128), fs = volume(r.image, "A"), dir = dirBlocks(r.image);
  assert.equal(data.size, 32);
  assert.deepEqual(fs.read("S16.DAT"), want, "all 16 KiB reach the card before traffic is assessed");
  assert.deepEqual(fs.verify(), []);
  assert.deepEqual(r.t.writes, observed.commits, "each SDWRITE has one accepted backend commit");
  assert.ok(reads.every(block => dir.has(block)), "no data preread during writes or close");
  r.name("S16     DAT", FCB2); assert.ok(r.bdos(15, FCB2).a <= 3);
  const back = [];
  for (let k = 0; k < 128; k++) {
    assert.equal(r.bdos(20, FCB2).a, 0);
    for (let i = 0; i < 128; i++) back.push(r.m.read(DMA + i));
  }
  assert.deepEqual(Uint8Array.from(back), want, "the complete file reads through the cache");
  assert.equal(r.m.text(mark), "");
  const beforeReset = sha(r.image); r.reset();
  assert.deepEqual(volume(r.image, "A").read("S16.DAT"), want);
  assert.deepEqual(volume(r.image, "A").verify(), []); assert.equal(sha(r.image), beforeReset);
  return { cycles, writes, data, dir };
}

function checkFile16(rom) {
  const f = file16(rom);
  assert.equal(f.writes.length, 129, "128 progressing data commits and the directory after make");
  assert.deepEqual(new Set(f.writes.slice(0, -1)), f.data);
  for (const block of f.data) assert.equal(f.writes.filter(b => b === block).length, 4, "each block contains four successive acknowledged record versions");
  assert.ok(f.dir.has(f.writes.at(-1)), "the directory is last");
  return f;
}

test("AC3 16 KiB file", () => checkFile16());
test("AC3 mutant: by-line pending comparison unnecessarily commits a private same-block merge", () => {
  const c = privateWrite("same", MUTANTS.byline());
  assert.equal(c.made.length, 1);
  assert.deepEqual(c.oldAfter.card, c.want);
  assert.deepEqual(c.target.queue, [c.line]);
  assert.equal(c.target.dirty.filter(Boolean).length, 1);
  assert.equal(c.target.pending, c.line + 1);
  assert.throws(() => checkPrivateWrite(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], "same: the private pending prerequisite's write count");
    assert.equal(error.actual, 1); assert.equal(error.expected, 0);
    return true;
  });
});
/**
 * Logged on B:, records 0 to 4 written to A:, the card refusing the write
 * that moves on to the next block, then the retry once it takes writes, and
 * BDOS 11: whether these first five records are on the card at that later
 * input boundary. Ordinary entries and input can repair an earlier omitted
 * private prerequisite; the separate private-boundary controls observe it
 * before that repair. This reading does not compare complete FCB outcomes.
 */
function atKeyWait(rom) {
  const r = three({ rom, budget: BOUND });
  const f = r.refuse();
  r.put(3);
  r.bdos(21);
  r.put(4);
  r.bdos(21); // the build refuses it: FFh
  f.on = false;
  r.bdos(21); // the retry, or a further write if the earlier one succeeded
  r.bdos(11, 0);
  return r.state(5);
}

test("AC3 later public input repairs the private CPMOVE omission", { timeout: 300_000 }, () => {
  assert.equal(atKeyWait(), "CCCCC", "the build: every record on the card at the key wait");
  assert.equal(atKeyWait(MUTANTS.cpmove()), "CCCCC", "later ordinary entry and input recover queued data; the private-boundary negative is checked separately");
});

// The starter card's commands, as the Viewer runs them: the PICO9918 at 40
// columns and the matrix keyboard.
const PINS = ["BAZA.COM", "BAZA.RTL", "BOUNCE.BAS", "TAS.COM", "TED.COM"].map(pinned);
// A prompt, with or without the shell's volume label.
const PROMPT = /\r\n\d*[A-P](:\S*)?>$/;
const CARD_SKIP = PINS.some((p) => p.skip);
let starter;
const starterCard = () => {
  if (!starter) {
    execFileSync(process.execPath, ["tools/media.mjs"], { cwd: ROOT, stdio: "ignore" });
    starter = readFileSync(resolve(ROOT, "dist/starter.img"));
  }
  return new Uint8Array(starter);
};
const traces = new Map();
/**
 * COMMAND on the starter card, logged on LOGGED, B: unless given, so that A:
 * coalesces: its cycles
 * from the CR to the prompt, its card writes by block, each with the BDOS
 * function it was made in, and its BDOS 21 calls' cycles. The card's
 * programs must be the pinned ones, since the figures they are held to were
 * measured on them.
 */
function onStarter(command, { logged = "B" } = {}) {
  PINS.forEach(check);
  const key = `${logged} ${command}`;
  if (traces.has(key)) return traces.get(key);
  const image = starterCard();
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  if (logged !== "A") {
    m.mark = m.output.length;
    m.enqueueInput(`${logged}:\r`, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && m.ready() && PROMPT.test(m.text(m.mark))), 400_000_000, `${logged}:`);
  }
  const [entry, back, sdw, lba] = [m.sym("BENTRY"), m.sym("RETWORD") + 6, m.sym("SDWRITE"), m.sym("SDLBA")];
  const t = { writes: [], fn: [], w21: [] };
  let on = false;
  let call = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    if (on) {
      if (pc === entry && !call) call = { fn: m.cpu.cpu.c, t0: m.cycles };
      else if (pc === back && call) [call.fn === 21 && t.w21.push(m.cycles - call.t0), (call = null)];
      if (pc === sdw) {
        t.writes.push(word(m, lba) + word(m, lba + 2) * 0x10000);
        t.fn.push(call?.fn ?? -1);
      }
    }
    return step();
  };
  const mark = m.output.length;
  const t0 = m.cycles;
  on = true;
  m.enqueueInput(`${command}\r`, "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && m.ready() && PROMPT.test(m.text(mark))), 4_000_000_000, command);
  on = false;
  const out = { ...t, cycles: m.cycles - t0, text: m.text(mark), dir: dirBlocks(image) };
  traces.set(key, out);
  return out;
}

test("AC3 bounce writes", { skip: CARD_SKIP, timeout: 900_000 }, () => {
  const b = onStarter("baza a:bounce");
  assert.match(b.text, /COM written\r\n/);
  assert.ok(b.writes.length <= 48, `${b.writes.length} card writes`);
  // BAZA closes its output, writes one more record into the same block and
  // closes again: that block is written at each close, and every other data
  // block once.
  const data = b.writes.map((x, i) => [x, b.fn[i]]).filter(([x]) => !b.dir.has(x));
  const times = data.reduce((n, [x]) => n.set(x, (n.get(x) ?? 0) + 1), new Map());
  const twice = [...times].filter(([, n]) => n > 1);
  assert.deepEqual(twice.map(([, n]) => n), [2], "one data block written twice, every other once");
  assert.deepEqual(data.filter(([x]) => x === twice[0][0]).map(([, fn]) => fn), [16, 16], "the block written twice, once at each close");
  console.log(`BAZA BOUNCE: ${b.writes.length} card writes, ${data.length} of data blocks, ${times.size} blocks`);
});

test("AC3 save", { skip: CARD_SKIP, timeout: 300_000 }, () => {
  const s = onStarter("save 16 a:x.com");
  assert.ok(s.writes.length <= 10, `${s.writes.length} card writes`);
  console.log(`SAVE 16 X.COM: ${s.writes.length} card writes, ${s.cycles} cycles`);
});

/** Compare the complete physical allocation, including bytes past logical EOF.
 * Existing unwritten records retain the card's nonzero formatting pattern. */
function bdos40New(rom, seed = 0xe5) {
  const image = card(), initial = volume(image, "A");
  initial.data.fill(seed, initial.g.dirBlocks * initial.blockBytes);
  const preboot = Uint8Array.from(image), r = closed8({ rom, image }), fs = volume(image, "A"), start = [...dirBlocks(image)][0];
  assert.equal(fs.blockBytes, 2048); assert.deepEqual(fs.read("F.DAT"), knownRecords(8));
  const before = Uint8Array.from(image), originalFile = fs.find("F.DAT"), used = fs.usedBlocks();
  assert.equal(originalFile.entries.length, 1);
  const oldBlock = word(r.m, FCB + 16), oldAt = (start + oldBlock * 4) * 512;
  const oldRaw = before.slice(oldAt, oldAt + 2048);
  assert.deepEqual(oldRaw.slice(0, 1024), knownRecords(8));
  assert.deepEqual(oldRaw.slice(1024), preboot.slice(oldAt + 1024, oldAt + 2048));
  assert.ok(oldRaw.slice(1024).every(v => v === seed));
  const rawWant = new Uint8Array(2048); rawWant.set(pat(40), 1024); rawWant.set(pat(41), 1152);
  const fileWant = new Uint8Array(42 * 128); fileWant.set(oldRaw); fileWant.set(rawWant.slice(0, 1280), 32 * 128);
  const w0 = r.t.writes.length, mark = r.m.output.length;
  r.put(40); r.setR(40); const a = r.bdos(40).a; assert.equal(a, 0);
  const first = r.t.writes.length - w0, block = word(r.m, FCB + 20);
  assert.ok(block >= fs.g.dirBlocks && block <= fs.d.dsm && !used.has(block));
  assert.equal(word(r.m, FCB + 16), oldBlock); assert.equal(word(r.m, FCB + 18), 0);
  const absolute = (start + block * 4) * 512;
  assert.deepEqual(before.slice(absolute, absolute + 2048), preboot.slice(absolute, absolute + 2048));
  assert.ok(before.slice(absolute, absolute + 2048).every(v => v === seed));
  r.put(41); r.setR(41); assert.equal(r.bdos(40).a, 0); assert.equal(word(r.m, FCB + 20), block);
  const second = r.t.writes.length - w0 - first;
  const index = originalFile.entries[0].index, directory = start + Math.floor(index * 32 / 512);
  const dirWant = before.slice(directory * 512, (directory + 1) * 512);
  dirWant.set(Array.from({ length: 20 }, (_, i) => r.m.read(FCB + 12 + i)), index * 32 % 512 + 12);
  const close = r.bdos(16).a; assert.ok(close <= 3);
  const atClose = r.t.writes.length - w0 - first - second, file = fs.read("F.DAT"), raw = image.slice(absolute, absolute + 2048);
  assert.deepEqual(file, fileWant); assert.deepEqual(raw, rawWant);
  const expectedImage = Uint8Array.from(before); expectedImage.set(rawWant, absolute); expectedImage.set(dirWant, directory * 512);
  assert.deepEqual(image, expectedImage, "all old allocation, directory neighbours and other card bytes are preserved");
  assert.deepEqual(fs.verify(), []); assert.equal(r.m.text(mark), "");
  const beforeReset = sha(image); r.reset();
  assert.deepEqual(volume(image, "A").read("F.DAT"), fileWant);
  assert.deepEqual(image.slice(absolute, absolute + 2048), rawWant); assert.equal(sha(image), beforeReset);
  return { a, first, second, close, atClose, records: file.length / 128,
    written: same(file.slice(40 * 128, 41 * 128), pat(40)) && same(file.slice(41 * 128), pat(41)),
    zeros: raw.slice(1280).every(v => v === 0), verify: volume(image, "A").verify() };
}

test("AC3 bdos 40", () => {
  for (const seed of [0xe5, 0x6b]) assert.deepEqual(bdos40New(undefined, seed), { a: 0, first: 4, second: 1, close: 0, atClose: 2, records: 42, written: true, zeros: true, verify: [] });
});
test("AC3 mutant: BWGET without CPMOVE makes no card write at BDOS 40 before the close", () => {
  assert.equal(bdos40New(MUTANTS.cpmove()).first, 0);
});

// --- The directory at every cut ---------------------------------------------

/**
 * On A: with its free blocks filled with 6Bh: F.DAT of 40 records by BDOS
 * 21 and closed, records 1, 20 and 39 rewritten in place by BDOS 34, record
 * 60 at a new block by BDOS 40, and the close. At each card write the image
 * verifies and no entry names a record not yet written. Records 40 to 47 lie
 * in a block the file had but never wrote there, as on any CP/M disk, and
 * are not checked.
 */
function cuts(rom) {
  const image = card();
  const v = volume(image, "A");
  v.data.fill(0x6b, v.g.dirBlocks * v.blockBytes);
  const allowed = new Map();
  const allow = (k, p) => (allowed.get(k) ?? allowed.set(k, []).get(k)).push(p);
  const zero = new Uint8Array(128);
  let n = 0;
  const problems = [];
  const check = (img) => {
    n += 1;
    const a = volume(img, "A");
    problems.push(...a.verify().map((p) => `cut ${n}: ${p}`));
    const f = a.find("F.DAT");
    if (!f) return;
    const d = a.read("F.DAT");
    for (let k = 0; k < f.records; k += 1) {
      if (allowed.has(k) && !allowed.get(k).some((p) => same(d.subarray(k * 128, k * 128 + 128), p))) problems.push(`cut ${n}: record ${k} named, not written`);
    }
  };
  const r = rig({ rom, image });
  r.m.sd.onWrite = check;
  const step = (fn, k, salt = 0) => {
    allow(k, pat(k, salt));
    r.put(k, salt);
    fn();
  };
  r.name("F       DAT");
  r.bdos(22);
  r.bdos(26, DMA);
  for (let k = 0; k < 40; k += 1) step(() => r.bdos(21), k);
  r.bdos(16);
  r.name("F       DAT");
  r.bdos(15);
  for (const k of [1, 20, 39]) step(() => (r.setR(k), r.bdos(34)), k, 50);
  for (let k = 48; k < 64; k += 1) allow(k, zero);
  step(() => (r.setR(60), r.bdos(40)), 60);
  r.bdos(16);
  return { cuts: n, problems };
}

test("AC4 directory last at every cut", () => {
  const c = cuts();
  assert.deepEqual(c.problems, []);
  assert.equal(c.cuts, 50, "every one of the 50 accepted card writes is checked");
});
test("AC4 directory prerequisites and later input repair the CPMOVE omission", { timeout: 300_000 }, () => {
  assert.deepEqual(cuts(MUTANTS.cpmove()).problems, [], "the close's flush-first write keeps the directory last even so");
  assert.equal(atKeyWait(MUTANTS.cpmove()), "CCCCC", "the later input has repaired the omitted private boundary, not demonstrated the old loss fault");
});
test("AC4 mutants: FNCLSE and READDIR without their calls still keep the directory last, every directory write passing CPMOVE", () => {
  for (const m of [MUTANTS.fnclse(), MUTANTS.readdir()]) assert.deepEqual(cuts(m).problems, []);
});

/** A real private next-block request is refused before its data is accepted.
 * This failure path never reaches CWRBH and leaves the original FCB untouched. */
function refusedPrivateMove(rom) {
  const r = three({ open: true, rom });
  const block = lbaOf(r, 0), line = r.pending() - 1;
  assert.ok(line >= 0 && line < r.m.sym("NLINES"));
  const want = new Uint8Array(512);
  for (let k = 0; k < 3; k++) want.set(pat(k), k * 128);
  const old = Uint8Array.from(want); old.fill(0, 256);
  const before = pendingFrame(r, block, line);
  assert.deepEqual([before.block, before.pending, before.depth, before.busy], [block, line + 1, 0, 0]);
  assert.deepEqual(before.queue, [line]);
  assert.equal(before.dirty.filter(Boolean).length, 1);
  assert.equal(before.dirty[line], 1);
  assert.deepEqual(before.payload, want); assert.deepEqual(before.card, old);
  const original = Uint8Array.from(r.image), fcb = Array.from({ length: 36 }, (_, i) => r.m.read(FCB + i));
  const start = [...dirBlocks(r.image)][0], target = block + 1;
  const record = (target - start) * 4;
  const putWord = (name, value) => { r.m.write(r.m.sym(name), value & 255); r.m.write(r.m.sym(name) + 1, value >> 8); };
  r.put(4); r.m.write(r.m.sym("DSKCUR"), 0);
  putWord("DSKTRK", Math.floor(record / 64)); putWord("DSKSEC", record % 64); putWord("DSKDMA", DMA);
  r.refuse();
  const attempts = [], commit = r.m.sd.commitWrite.bind(r.m.sd);
  r.m.sd.commitWrite = () => {
    const { start, buffer } = r.m.sd.writeState;
    assert.equal(start / 512, block);
    assert.deepEqual(Uint8Array.from(buffer), want);
    attempts.push(block);
    commit();
    assert.equal(r.m.sd.pendingResponse[0], 0x0d);
  };
  const step = r.m.step.bind(r.m);
  let mapped = 0;
  r.m.step = () => {
    assert.notEqual(r.m.pc, r.m.sym("HKENTER"));
    assert.notEqual(r.m.pc, r.m.sym("CWRBH"), "a refused pending prerequisite cannot accept the new record");
    if (r.m.pc === r.m.sym("BWGET")) {
      mapped++;
      assert.deepEqual([r.m.read(r.m.sym("DSKCUR")), word(r.m, r.m.sym("BLKOFF")), r.m.read(r.m.sym("BLKSLOT")), word(r.m, r.m.sym("SDLBA")) + word(r.m, r.m.sym("SDLBA") + 2) * 65536], [0, target - start, 0, target]);
    }
    return step();
  };
  const entry = r.m.sym("BWRITE");
  const result = r.stub([0x0e, 0, 0xcd, entry & 255, entry >> 8]);
  r.m.step = step;
  assert.equal(result.a, 1);
  assert.equal(r.m.cpu.cpu.sp, 0x3000);
  assert.equal(mapped, 1); assert.deepEqual(attempts, [block]);
  assert.deepEqual(r.image, original);
  assert.deepEqual(Array.from({ length: 36 }, (_, i) => r.m.read(FCB + i)), fcb);
  const after = pendingFrame(r, block, line);
  assert.deepEqual([after.block, after.depth, after.busy], [block, 0, 0]);
  assert.deepEqual(after.queue, [line]);
  assert.equal(after.dirty.filter(Boolean).length, 1); assert.equal(after.dirty[line], 1);
  assert.deepEqual(after.payload, want); assert.deepEqual(after.card, old);
  return { r, line, after };
}

/** Acknowledged data must retain cache ownership after refused maintenance.
 * The functional result is checked independently, including the deliberately
 * empty queue seen by function48 in the discard mutation. */
function refusedPending(what, call, expectedReturn, rom) {
  const r = three({ open: true, rom });
  const block = lbaOf(r, 0), line = r.pending() - 1;
  assert.ok(line >= 0 && line < r.m.sym("NLINES"));
  const want = new Uint8Array(512);
  for (let k = 0; k < 3; k++) want.set(pat(k), k * 128);
  const old = Uint8Array.from(want); old.fill(0, 256);
  const before = pendingFrame(r, block, line);
  assert.deepEqual([before.block, before.pending, before.depth, before.busy], [block, line + 1, 0, 0]);
  assert.deepEqual(before.queue, [line]);
  assert.equal(before.dirty.filter(Boolean).length, 1); assert.equal(before.dirty[line], 1);
  assert.deepEqual(before.payload, want); assert.deepEqual(before.card, old);
  const original = Uint8Array.from(r.image), fault = r.refuse(), attempts = [];
  const commit = r.m.sd.commitWrite.bind(r.m.sd);
  r.m.sd.commitWrite = () => {
    const { start, buffer } = r.m.sd.writeState;
    assert.equal(start / 512, block);
    assert.deepEqual(Uint8Array.from(buffer), want);
    attempts.push(block);
    commit();
    assert.equal(r.m.sd.pendingResponse[0], 0x0d);
  };
  const result = call(r);
  r.m.sd.commitWrite = commit;
  assert.equal(result.a, expectedReturn, `${what}: its actual functional result`);
  assert.ok(attempts.length > 0, "real backend refusals were reached");
  assert.deepEqual(r.image, original);
  const after = pendingFrame(r, block, line);
  assert.deepEqual([after.depth, after.busy], [0, 0]);
  assert.deepEqual(after.card, old);
  return { what, r, fault, line, block, want, old, before, after };
}

function checkRetainedPending(c) {
  assert.deepEqual(c.after.queue, [c.line], `${c.what}: acknowledged data retains cache ownership`);
  assert.equal(c.after.pending, c.line + 1);
  assert.equal(c.after.block, c.block);
  assert.equal(c.after.dirty.filter(Boolean).length, 1); assert.equal(c.after.dirty[c.line], 1);
  assert.deepEqual(c.after.payload, c.want);
}

// --- Failures and a card changed ---------------------------------------------

// Each machine here may run at most this many cycles, so that a hang fails.
const BOUND = 1_500_000_000;
const named = (r) => volume(r.image, "A").find("P.DAT")?.records ?? -1;

function movesOn(rom) {
  const r = three({ rom, budget: BOUND });
  const f = r.refuse();
  r.put(3);
  assert.equal(r.bdos(21).a, 0, "record 3, in the pending block: 0");
  assert.equal(r.m.read(FCB + 32), 4);
  r.put(4);
  const fail = r.bdos(21);
  assert.deepEqual([fail.a, fail.h], [0xff, 1], "record 4, the next block: FFh, H = 1");
  assert.equal(r.m.read(FCB + 32), 4, "the FCB on record 4");
  f.on = false;
  assert.equal(r.bdos(21).a, 0, "the retry once the card takes writes");
  assert.equal(r.bdos(16).a, 0);
  assert.equal(r.state(5), "CCCCC", "every record on the card after the close");
}

test("AC5 failed flush as writing moves on", { timeout: 300_000 }, () => movesOn());
test("AC5 mutant: early CPEND clear loses the marker of a refused private prerequisite", { timeout: 300_000 }, () => {
  const checkMarker = c => assert.equal(c.after.pending, c.line + 1, "a refused private write retains its pending marker");
  checkMarker(refusedPrivateMove());
  const c = refusedPrivateMove(MUTANTS.cpendearly());
  assert.equal(c.after.pending, 0, "the independent dirty queue still retains data, but its pending marker was cleared");
  assert.throws(() => checkMarker(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], "a refused private write retains its pending marker");
    assert.equal(error.actual, 0); assert.equal(error.expected, c.line + 1);
    return true;
  });
});

function keepsBlock(rom) {
  const drvtab = (r) => Array.from({ length: 32 }, (_, i) => r.m.read(r.m.sym("DRVTAB") + i));
  for (const [what, call, a] of [
    ["BDOS 48", (r) => r.bdos(48, 0), 0xff],
    ["MOUNT C: ARCHIVE", (r) => r.svc(9, 2, 2), ABI.TNEBAD],
    ["unmount B:", (r) => r.svc(10, 1, 0), ABI.TNEBAD],
  ]) {
    const r = three({ rom, budget: BOUND });
    const drives = drvtab(r);
    const f = r.refuse();
    assert.equal(call(r).a, a, `${what}: refused`);
    assert.deepEqual(drvtab(r), drives, `${what}: the drives as they were`);
    const c = r.bdos(16);
    assert.deepEqual([c.a, c.h], [0xff, 1], `${what}: the close fails while the card refuses`);
    assert.equal(named(r), 0, `${what}: the card's directory names no record`);
    f.on = false;
    assert.equal(r.bdos(16).a, 0, `${what}: the close once the card takes writes`);
    assert.equal(named(r), 3, `${what}: three records named`);
    assert.equal(r.state(), "CCC", `${what}: all three on the card`);
  }
}

test("AC5 function 48, mount and unmount keep the block", { timeout: 300_000 }, () => keepsBlock());
test("AC5 CFLALL alias retains failures; actual discard fault loses acknowledged ownership", { timeout: 300_000 }, () => {
  keepsBlock(MUTANTS.cflall());
  checkRetainedPending(refusedPending("BDOS 48", r => r.bdos(48, 0), 0xff));
  const c = refusedPending("BDOS 48", r => r.bdos(48, 0), 0, MUTANTS.dropFailed());
  assert.deepEqual(c.after.queue, []);
  assert.equal(c.after.pending, 0); assert.ok(c.after.dirty.every(v => !v));
  assert.equal(c.after.block, 0xffffffff, "the tag was invalidated, not its physical payload erased");
  assert.deepEqual(c.after.payload, c.want);
  assert.throws(() => checkRetainedPending(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], "BDOS 48: acknowledged data retains cache ownership");
    assert.deepEqual(error.actual, []); assert.deepEqual(error.expected, [c.line]);
    return true;
  });
});

test("AC5 console read keeps the block", { timeout: 300_000 }, () => {
  for (const [what, read, a] of [
    ["BDOS 1", (r) => (r.m.enqueueInput("x"), r.bdos(1, 0, true)), 0x78],
    ["the BIOS's CONIN", (r) => (r.m.enqueueInput("x"), r.bios(0x09, true)), 0x78],
    ["BDOS 11", (r) => r.bdos(11, 0), 0],
  ]) {
    const c = refusedPending(what, read, a);
    checkRetainedPending(c);
    c.fault.on = false;
    const closed = c.r.bdos(16);
    assert.ok(closed.a >= 0 && closed.a <= 3, `${what}: the healthy close succeeds`);
    assert.deepEqual(volume(c.r.image, "A").read("P.DAT"), c.want.slice(0, 384));
    assert.deepEqual(volume(c.r.image, "A").verify(), []);
    assert.equal(c.r.pending(), 0);
  }
});

test("AC5 card changed retains pending ownership until explicit reset", { timeout: 300_000 }, () => {
  for (const [what, other] of [["another card", () => card()], ["the same card", img => img]]) {
    const r = three({ budget: BOUND }), block = lbaOf(r, 0), line = r.pending() - 1;
    assert.ok(line >= 0 && line < r.m.sym("NLINES"));
    const want = new Uint8Array(512);
    for (let k = 0; k < 3; k++) want.set(pat(k), k * 128);
    const before = pendingFrame(r, block, line);
    assert.deepEqual(before.payload, want);
    assert.deepEqual(before.queue, [line]);
    assert.equal(before.block, block); assert.equal(before.dirty[line], 1);
    assert.equal(before.dirty.filter(Boolean).length, 1);
    let initializations = 0, accepted = 0;
    const dispatch = { warm: 0, diskReset: 0 };
    const step = r.m.step.bind(r.m);
    r.m.step = () => {
      if (r.m.pc === r.m.sym("SDINIT")) initializations++;
      if (r.m.pc === r.m.sym("WBOOTR")) dispatch.warm++;
      if (r.m.pc === r.m.sym("FNRESET")) dispatch.diskReset++;
      return step();
    };
    r.m.sd = null;
    assert.equal(r.bdos(11, 0).a, 0, `${what}: status still returns with the card absent`);
    const img = other(r.image), copy = Uint8Array.from(img);
    r.m.swapCard(img);
    assert.equal(r.m.sd.ready, false, "insertion does not initialize the controller");
    const commit = r.m.sd.commitWrite.bind(r.m.sd);
    r.m.sd.commitWrite = () => {
      commit();
      if (r.m.sd.pendingResponse[0] === 0x05) accepted++;
    };
    r.m.enqueueInput("x");
    assert.equal(r.bdos(1, 0, true).a, 0x78, `${what}: input returns its owned key`);
    for (let n = 0; n < 2; n++) {
      const closed = r.bdos(16);
      assert.deepEqual([closed.a, closed.h], [0xff, 1]);
    }
    const output = r.warm();
    assert.match(output, /Write pending/);
    assert.match(output, /Disk reset failed\r\nEnter retries/);
    assert.doesNotMatch(output, /Write lost/);
    assert.ok(recoveryInput(r.m), "this is the actual retry console, not normal command dispatch");
    const retained = pendingFrame(r, block, line);
    assert.deepEqual([retained.depth, retained.busy, retained.pending], [1, 0, line + 1]);
    assert.deepEqual(retained.queue, before.queue); assert.deepEqual(retained.dirty, before.dirty);
    assert.equal(retained.block, block); assert.deepEqual(retained.payload, want);
    assert.equal(initializations, 0); assert.equal(accepted, 0);
    assert.deepEqual(img, copy, "no cached payload is replayed onto the inserted card");
    const attempts = r.t.writes.length, idleDispatch = { ...dispatch }, until = r.m.cycles + 1_000_000;
    r.m.runUntil(() => r.m.cycles >= until, 1_100_000, "passive recovery wait without an acknowledgement");
    r.m.runUntil(() => recoveryInput(r.m), 1_000_000, "the same recovery input owner");
    assert.equal(r.t.writes.length, attempts, "waiting does not automatically retry");
    assert.deepEqual(dispatch, idleDispatch, "waiting does not dispatch another warm boot or disk reset");
    assert.equal(initializations, 0); assert.equal(accepted, 0);
    const idle = pendingFrame(r, block, line);
    assert.deepEqual([idle.pending, idle.block, idle.queue, idle.dirty, idle.payload], [retained.pending, retained.block, retained.queue, retained.dirty, retained.payload]);
    assert.deepEqual(img, copy);
    r.reset();
    assert.ok(initializations > 0, "the explicit reset now initializes the card");
    const cold = pendingFrame(r, block, line);
    assert.deepEqual(cold.queue, []); assert.ok(cold.dirty.every(v => !v));
    assert.deepEqual([cold.pending, cold.depth, cold.busy], [0, 1, 0]);
    assert.equal(r.m.lineBuf, r.m.sym("CMDBUF"));
    assert.deepEqual(img, copy, "the reset boot reads without replaying discarded ownership");
    assert.deepEqual(volume(img, "A").verify(), []);
  }
});

// --- Reset with a block pending -----------------------------------------------

/** Record 1 of a closed eight-record file rewritten by FN (34 or 40), BDOS 11 then if FLUSH, then reset: old or new on the card. */
function inPlace(fn, flush, rom) {
  const r = closed8({ rom });
  r.put(1, 99);
  r.setR(1);
  assert.equal(r.bdos(fn).a, 0);
  if (flush) r.bdos(11, 0);
  r.reset();
  const rec = volume(r.image, "A").read("F.DAT").subarray(128, 256);
  return same(rec, pat(1, 99)) ? "new" : same(rec, pat(1)) ? "old" : "other";
}

test("AC6 reset discards the latest pending update and unclosed metadata", () => {
  assert.equal(inPlace(34, false), "old", "BDOS 34 in place, then reset");
  const r = three(), block = lbaOf(r, 0), line = r.pending() - 1;
  assert.ok(line >= 0 && line < r.m.sym("NLINES"));
  const expected = new Uint8Array(512);
  for (let k = 0; k < 2; k++) expected.set(pat(k), k * 128);
  const before = pendingFrame(r, block, line);
  const pending = Uint8Array.from(expected); pending.set(pat(2), 256);
  assert.deepEqual(before.card, expected); assert.deepEqual(before.payload, pending);
  assert.deepEqual(before.queue, [line]); assert.equal(before.dirty[line], 1);
  r.reset();
  const after = pendingFrame(r, block, line);
  assert.deepEqual(after.card, expected, "use the captured absolute block, never the reset FCB map");
  assert.deepEqual(after.queue, []); assert.ok(after.dirty.every(v => !v));
  assert.equal(after.pending, 0);
  assert.equal(named(r), 0, "the unclosed new extent still names no records");
  assert.deepEqual(volume(r.image, "A").verify(), []);
});

test("AC6 reset after a console read", () => {
  assert.equal(inPlace(34, true), "new");
});
test("AC6 omitted FNSTAT drain leaves seven acknowledged blocks exposed to reset", () => {
  const c = fullDrainCall(CONSOLE[3], MUTANTS.fnstat());
  checkMissingDrain(c);
  const beforeReset = Uint8Array.from(c.r.image);
  c.r.reset();
  assert.deepEqual(c.r.image, beforeReset, "reset does not flush the discarded dirty queue");
  for (const [block, expected] of c.r.expected) assert.deepEqual(c.r.image.slice(block * 512, (block + 1) * 512), block === c.entry.block ? expected : c.r.original.slice(block * 512, (block + 1) * 512), "only the real entry-committed block survived");
  const after = c.r.cacheState();
  assert.deepEqual(after.queue, []); assert.ok(after.dirty.every(v => !v));
  assert.equal(after.pending, 0);
  assert.equal(named(c.r), 0, "raw record durability does not publish the unclosed file");
  assert.deepEqual(volume(c.r.image, "A").verify(), []);
});

test("AC6 bdos 40", () => {
  assert.equal(inPlace(40, false), "old", "BDOS 40 in place, then reset");
  assert.equal(inPlace(40, true), "new", "with BDOS 11 before the reset");
  const r = closed8();
  r.put(40);
  r.setR(40);
  r.bdos(40);
  r.reset();
  assert.equal(volume(r.image, "A").find("F.DAT").records, 8, "a new block, then reset: the file's eight records");
  assert.deepEqual(volume(r.image, "A").verify(), []);
});

// --- Speed --------------------------------------------------------------------

// BAZA BOUNCE on this starter card under the shell's landing ROM, written
// through: its cycles from the CR to the prompt, measured with the same trace.
const BOUNCE_BASE = 103_285_677;

test("AC7 bounce speed", { skip: CARD_SKIP, timeout: 900_000 }, () => {
  const b = onStarter("baza a:bounce");
  const seconds = b.cycles / 4e6;
  const mean = b.w21.reduce((s, x) => s + x, 0) / b.w21.length;
  assert.ok(seconds <= 19.5, `${seconds.toFixed(2)} s at 4 MHz`);
  assert.ok(b.cycles <= 0.76 * BOUNCE_BASE, `${((100 * b.cycles) / BOUNCE_BASE).toFixed(1)} % of the shell's landing on this card`);
  assert.ok(mean <= 80_000, `BDOS 21: ${Math.round(mean)} T each, of ${b.w21.length}`);
  console.log(`BAZA BOUNCE: ${b.cycles} T, ${seconds.toFixed(2)} s, ${((100 * b.cycles) / BOUNCE_BASE).toFixed(1)} % of the landing's; ${b.w21.length} BDOS 21 calls, ${Math.round(mean)} T each`);
});

// The starter card's own case: at A:SYSTEM>, A: written behind. Each command
// writes its blocks once and closes, so it costs what it does coalesced.
test("S2-11 starter workloads logged on A:", { skip: CARD_SKIP, timeout: 900_000 }, (t) => {
  const b = onStarter("baza bounce", { logged: "A" });
  assert.match(b.text, /COM written\r\n/);
  const seconds = b.cycles / 4e6;
  assert.ok(seconds <= 19.5, `BAZA BOUNCE: ${seconds.toFixed(2)} s at 4 MHz`);
  assert.ok(b.writes.length <= 48, `BAZA BOUNCE: ${b.writes.length} card writes`);
  const s = onStarter("save 16 x.com", { logged: "A" });
  assert.ok(s.writes.length <= 10, `SAVE 16 X.COM: ${s.writes.length} card writes`);
  t.diagnostic(JSON.stringify({ bounce: { seconds: +seconds.toFixed(2), writes: b.writes.length }, save16: { seconds: +(s.cycles / 4e6).toFixed(2), writes: s.writes.length } }));
});

test("AC7 file speed", () => {
  const f = checkFile16();
  assert.ok(f.cycles <= COST.file16, `${f.cycles} T`);
  console.log(`16 KiB file: ${f.cycles} T, ${f.writes.length} card writes`);
});

function consoleCost(rom, logged = "B") {
  const r = rig({ rom, logged }), before = sha(r.image), mark = r.m.output.length;
  const result = r.bdos(11, 0);
  assert.equal(result.a, 0); assert.equal(r.m.cpu.cpu.sp, 0x3000);
  assert.deepEqual(r.t.writes, []); assert.deepEqual(r.t.reads, []);
  assert.equal(sha(r.image), before); assert.equal(r.m.text(mark), "");
  return result.cycles;
}

function checkConsoleCost(t) {
  assert.ok(t - QUALIFIED_COST.bdos11 <= COST.emptyIncrease, `empty status cost: ${t} T exceeds qualified + ${COST.emptyIncrease} T`);
}

test("AC7 console cost", () => {
  for (const logged of ["B", "A"]) {
    const t = consoleCost(undefined, logged); checkConsoleCost(t);
    console.log(`BDOS 11 with nothing pending, logged ${logged}: ${t} T (+${t - QUALIFIED_COST.bdos11})`);
  }
});
for (const [name, build] of [["CPOUT without its fast CPEND test", MUTANTS.nofast], ["CKEY without its CANY test", MUTANTS.mnc]]) {
  test(`AC7 mutant: ${name} exceeds the empty status ceiling`, () => {
    const rom = build();
    for (const logged of ["B", "A"]) {
      checkConsoleCost(consoleCost(undefined, logged));
      const t = consoleCost(rom, logged);
      assert.throws(() => checkConsoleCost(t), error => error.code === "ERR_ASSERTION" && error.message.startsWith("empty status cost:"));
    }
  });
}

/** Time only each write/status pair; closing and verifying happen afterwards. */
function worstCase(logged, rom) {
  const r = rig({ rom, logged }), observed = acknowledgedWrites(r), mark = r.m.output.length;
  r.name("S11     DAT"); assert.ok(r.bdos(22).a <= 3); r.bdos(26, DMA);
  const w0 = r.t.writes.length;
  let t = 0;
  for (let k = 0; k < 32; k++) {
    r.put(k); const write = r.bdos(21); assert.equal(write.a, 0);
    assert.equal(r.m.read(FCB + 32), k + 1); observed.acknowledge(k);
    const poll = r.bdos(11, 0); assert.equal(poll.a, 0);
    t += write.cycles + poll.cycles;
    for (let i = 0; i <= k; i++) assert.ok(r.onCard(i), "every acknowledged record reaches the card by the poll");
    assert.equal(r.pending(), 0);
  }
  const timedWrites = r.t.writes.length - w0;
  assert.equal(volume(r.image, "A").find("S11.DAT").records, 0, "polling commits data without publishing an unclosed file");
  observed.close(); assert.ok(r.bdos(16).a <= 3);
  assert.deepEqual(volume(r.image, "A").read("S11.DAT"), knownRecords(32));
  assert.deepEqual(volume(r.image, "A").verify(), []);
  assert.deepEqual(r.t.writes, observed.commits); assert.equal(r.m.text(mark), "");
  assert.equal(timedWrites, 32);
  return t;
}

function checkWorst(t, base, bound) {
  const over = (t / base - 1) * 100;
  assert.ok(over <= bound, `write/status cost: ${t} T, ${over.toFixed(5)} % over qualified ${base}`);
}

test("AC7 worst case", () => checkWorst(worstCase("B"), QUALIFIED_COST.worstOnB, 1));
test("AC7 mutant: CKEY without CANY exceeds the write/status B ceiling", () => {
  checkWorst(worstCase("B"), QUALIFIED_COST.worstOnB, 1);
  const t = worstCase("B", MUTANTS.mnc());
  assert.throws(() => checkWorst(t, QUALIFIED_COST.worstOnB, 1), error => error.code === "ERR_ASSERTION" && error.message.startsWith("write/status cost:"));
});
test("AC7 worst case logged", () => checkWorst(worstCase("A"), QUALIFIED_COST.worstOnA, 5));

/** A refused full input pass must attempt each initial eligible line once. */
function refusedInputPass(rom) {
  const r = backlog({ rom }), before = r.cacheState(), start = r.attempts.length, mark = r.m.output.length;
  const next = before.round.slice(before.position).find(line => line !== 255) ?? before.queue[0];
  const entry = before.entries.find(e => e.line === next); assert.ok(entry);
  const functional = [], passes = [], step = r.m.step.bind(r.m);
  r.m.step = () => {
    if (r.m.pc === r.m.sym("FNSTAT")) {
      assert.deepEqual([r.m.read(r.m.sym("HKDEP")), r.m.read(r.m.sym("HKBUSY"))], [1, 0]);
      functional.push(r.attempts.length - start);
    }
    if (r.m.pc === r.m.sym("CFLUSH")) {
      assert.deepEqual([r.m.read(r.m.sym("HKDEP")), r.m.read(r.m.sym("HKBUSY")), r.m.cpu.cpu.a], [1, 0, r.m.sym("NLINES")]);
      passes.push(r.attempts.length - start);
    }
    return step();
  };
  assert.equal(r.bdos(11, 0).a, 0); r.m.step = step;
  assert.equal(r.m.cpu.cpu.sp, 0x3000); assert.equal(r.m.text(mark), "");
  assert.deepEqual(functional, [1]);
  const after = r.cacheState(), made = r.attempts.slice(start);
  assert.deepEqual([after.depth, after.busy, after.any, after.pending], [0, 0, 1, 0]);
  for (const key of ["queue", "dirty", "entries"]) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(r.image, r.original); assert.ok(made.every(a => !a.accepted));
  return { before, entry, made, passes };
}

function oneInputPass(c) {
  assert.equal(c.passes.length, 1, "one required input boundary makes one frozen pass");
  assert.deepEqual(c.passes, [1]);
  assert.deepEqual(c.made.map(a => a.block), [c.entry.block, ...c.before.entries.map(e => e.block)]);
}

test("AC7 mutant: duplicated required input pass retries a refused round twice", () => {
  oneInputPass(refusedInputPass());
  const c = refusedInputPass(MUTANTS.mtw());
  assert.deepEqual(c.passes, [1, 1 + c.before.entries.length]);
  assert.deepEqual(c.made.map(a => a.block), [c.entry.block, ...c.before.entries.map(e => e.block), ...c.before.entries.map(e => e.block)]);
  assert.throws(() => oneInputPass(c), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], "one required input boundary makes one frozen pass");
    assert.equal(error.actual, 2); assert.equal(error.expected, 1); return true;
  });
});

// --- What stays ---------------------------------------------------------------

/** Ordinary entries progress logged-drive data; close publishes its directory. */
function writtenBehind(rom) {
  const r = rig({ rom }), observed = acknowledgedWrites(r, "B"), mark = r.m.output.length;
  r.name("W       DAT", FCB, 2); assert.ok(r.bdos(22).a <= 3); r.bdos(26, DMA);
  const w0 = r.t.writes.length;
  for (let k = 0; k < 8; k++) {
    r.put(k); assert.equal(r.bdos(21).a, 0);
    assert.equal(r.m.read(FCB + 32), k + 1); observed.acknowledge(k);
    assert.equal(r.pending(), 0, `B: record ${k}: nothing pending`);
  }
  const beforeClose = r.t.writes.length - w0;
  assert.equal(volume(r.image, "B").find("W.DAT").records, 0, "ordinary progress does not publish the unclosed directory");
  observed.close(); assert.ok(r.bdos(16).a <= 3);
  const made = r.t.writes.slice(w0), fs = volume(r.image, "B"), dir = dirBlocks(r.image, "B");
  assert.deepEqual(fs.read("W.DAT"), knownRecords(8)); assert.deepEqual(fs.verify(), []);
  assert.deepEqual(r.t.writes, observed.commits);
  assert.ok(made.slice(0, -1).every(block => !dir.has(block)) && dir.has(made.at(-1)), "the directory is last");
  assert.equal(r.m.text(mark), "");
  assert.equal(beforeClose, 7, "seven earlier records progress at the next ordinary entry");
  assert.equal(made.length, 9, "eight data versions then directory after make");
}

test("AC8 the logged drive written behind", { timeout: 300_000 }, () => {
  writtenBehind();
  // COPY, TYPE and DIR under the shell with data on A: and a copy on B:.
  const image = withShell(card());
  const data = Uint8Array.from({ length: 6000 }, (_, i) => (i * 7 + 1) & 0xff);
  const text = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\r\n") + "\r\n";
  volume(image, "A").write("DATA.BIN", data);
  volume(image, "A").write("T.TXT", Buffer.from(text + "\x1a", "latin1"));
  const m = boot(image);
  const cmd = (l) => m.command(l, { prompt: PROMPT, maxCycles: 2_000_000_000 });
  cmd("COPY DATA.BIN B:DATA.CPY");
  assert.ok(cmd("TYPE T.TXT").includes(text), "TYPE gives the file's text");
  assert.match(cmd("DIR B:"), /DATA\s*\.?\s*CPY/, "DIR lists the copy");
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.ready() && PROMPT.test(m.text(m.mark)), 400_000_000, "warm boot");
  assert.ok(same(volume(image, "B").read("DATA.CPY").subarray(0, data.length), data), "COPY's bytes on the card after warm boot");
  assert.ok(same(volume(image, "A").read("DATA.BIN").subarray(0, data.length), data));
});
test("AC8 mutant: BWGET marking the logged drive's writes to coalesce leaves B:'s block pending", () => {
  assert.throws(() => writtenBehind(MUTANTS.wbcoalesce()), /nothing pending/);
});

// --- The program's stack at CONIN ---------------------------------------------

/** The flush workload's runs: every stack within its reservation, the BDOS no deeper than at the shell's landing, the census's rule kept, and the program's stack at CONIN. */
function checkFlushStacks(runs) {
  const { rom, symbols } = romFor();
  const lim = rom[symbols.get("SVCLIM") - 0xc000];
  for (const [mode, run] of Object.entries(runs)) {
    for (const k of ["bdos", "ccp", "bios"]) assert.ok(run[k].deepest <= run[k].reserved, `${mode}: ${k} ${run[k].deepest} of ${run[k].reserved}`);
    assert.ok(run.bdos.deepest <= LANDING.bdosDeepest, `${mode}: the BDOS's deepest ${run.bdos.deepest}, at the shell's landing ${LANDING.bdosDeepest}`);
    assert.ok((run.bdos.deepest + lim) * 4 <= run.bdos.reserved * 3, `${mode}: the BDOS's ${run.bdos.deepest} and the services' limit ${lim} take more than three quarters of ${run.bdos.reserved}`);
    const below = run.programStack["BIOS CONIN"] - 2;
    assert.ok(below <= 20, `${mode}: CONIN with a block pending takes ${below} bytes below the return address`);
  }
}

// Refused work on logged A: keeps CONIN's required CFLUSH path active:
// 20 bytes below the return address, the published CONIN caller bound.
// Healthy entry service can commit the pending line before that path.
test("AC10 conin stack", { timeout: 300_000 }, () => {
  const runs = {
    writing: flushRun("writing"),
    refusing: flushRun("refusing"),
    "writing, logged on A:": flushRun("writing", undefined, { logged: "A" }),
    "refusing, logged on A:": flushRun("refusing", undefined, { logged: "A" }),
  };
  checkFlushStacks(runs);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { bdos: r.bdos.deepest, conin: r.programStack["BIOS CONIN"] - 2 }]))));
});
test("AC10 mutant: extra CPOUT pushes exceed CONIN's caller allowance under refusal", { timeout: 300_000 }, () => {
  const mut = MUTANTS.push3();
  // A refusal keeps the private flush active after ordinary entry service.
  const runs = { refusing: flushRun("refusing", mut) };
  assert.throws(() => checkFlushStacks(runs), /CONIN with a block pending takes 24 bytes/);
  assert.equal(runs.refusing.programStack["BIOS CONIN"] - 2, 24);
  console.log(JSON.stringify({ mutatedRefusal: { bdos: runs.refusing.bdos.deepest, conin: runs.refusing.programStack["BIOS CONIN"] - 2 } }));
});

// --- Docs ---------------------------------------------------------------------

test("AC11 docs", () => {
  const recovery = readText("docs/recovery.md");
  for (const s of [
    "each admitted outer BDOS, hardware service or returning BIOS call attempts one eligible dirty block before its normal work",
    "updates already received merge into that block without duplicating its entry or moving its first-dirty position",
    "a directory write first tries all other dirty data in a bounded pass, then writes the directory block only if those prerequisites succeeded",
    "prerequisite or metadata failure rejects and drops that unpublished directory image",
    "later retries must not publish rejected metadata",
    "failed acknowledged data remains dirty and queued, including across warm boot",
    "`Write pending`",
    "`Cache clear`",
    "`Write error`",
    "Enter does not initialise a newly inserted card",
    "completed browser persistence are separate stages",
  ]) assert.ok(recovery.replace(/\s+/g, " ").toLowerCase().includes(s.toLowerCase()), `docs/recovery.md: ${s}`);
  assert.doesNotMatch(recovery, /returns success only after the\s+line has gone to the card/, "no write on A: returns only when the card has the block");
  assert.doesNotMatch(recovery, /the others drop it/, "no flush but warm boot drops a failed line");
  assert.doesNotMatch(recovery, /one whose write fails is dropped/, "nor a flush during a cut");
  const compat = readText("docs/compatibility.md");
  for (const s of ["`CONST`", "reader", "`CONIN`", "type 0"]) assert.ok(compat.includes(s), `docs/compatibility.md names ${s}`);
  assert.doesNotMatch(compat, /that line then dropped/, "function 48 keeps a failed line");
  assert.ok(readText("docs/memory-map.md").includes("`CPEND`"), "docs/memory-map.md names CPEND");
});
