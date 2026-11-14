// A: coalesces: a data write on a volume not on the logged drive goes into
// its block's cache line, and the one pending block reaches the card at the
// file's close, any directory request, a write to another block, a warm
// boot, a console read, function 48, MOUNT and unmount. The rows that test
// A:'s coalescing run logged on B:, whose volume is the one written behind.
// The ROM's figures, the flush rule, one card write a block, the directory
// at every cut, failures and a card changed, a reset with a block pending,
// the speed, the logged drive written behind, the program's stack at CONIN,
// the docs and the version fields. Emulator evidence; each mutant is the
// build's ROM patched, run here one at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, ROOT, SHELL_SVC, abiDeclarations, boot, romFor, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";
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

// The console read's costs before write-behind followed the logged drive,
// measured with these stubs on the ROM that landed A: coalescing and TED's
// & stop: BDOS 11 with nothing waiting, and BDOS 11 after each of 32
// records to A:, logged on B: and logged on A:.
const COALESCED = { bdos11: 3859, worstOnB: 7_554_875, worstOnA: 7_549_907 };

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

/**
 * After three records, each row's call: whether the three are on the card
 * after it (CCC, or --- if not) and the card writes it made. AFTER is what
 * each row must give.
 */
function flushRows(rows, after, rom) {
  for (const [what, call, writes] of rows) {
    const r = three({ open: true, rom });
    assert.equal(r.state(), "---", `${what}: not on the card before`);
    const w0 = r.t.writes.length;
    call(r);
    const made = r.t.writes.slice(w0);
    assert.equal(r.state(), after, `${what}: the three records ${after === "CCC" ? "on" : "not on"} the card`);
    assert.equal(made.length, writes ?? (after === "CCC" ? 1 : 0), `${what}: card writes`);
    if (after === "CCC") assert.equal(made[0], lbaOf(r, 0), `${what}: the block written first`);
  }
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
const NEXT_BLOCK = [["records 3 and 4", (r) => (r.put(3), r.bdos(21), r.put(4), r.bdos(21))]];
const OTHER_DRIVE = [["a write to B:", (r) => (r.put(9), r.bdos(21, FCB3))]];
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

test("AC2 healthy ordinary and selected opportunities", () => healthyProgress(NO_FLUSH));
test("AC2 console reads flush", () => fullDrainRows(CONSOLE));
test("AC2 bios conin flushes", () => fullDrainRows(CONIN));
test("AC2 directory requests preserve the pending-block prerequisite", () => {
  for (const row of DIRECTORY) checkPendingBoundary(pendingBoundary(row, "READDIR"));
});
test("AC2 close preserves publication and the unmodified pending-block prerequisite", () => {
  const r = three({ open: true }), w0 = r.t.writes.length;
  const result = r.bdos(16);
  assert.ok(result.a >= 0 && result.a <= 3);
  const made = r.t.writes.slice(w0);
  assert.equal(made.length, 2);
  assert.equal(made[0], lbaOf(r, 0));
  assert.ok(dirBlocks(r.image).has(made[1]));
  assert.equal(r.pending(), 0);
  assert.equal(volume(r.image, "A").find("P.DAT").records, 3);
  assert.deepEqual(volume(r.image, "A").read("P.DAT"), Uint8Array.from([0, 1, 2].flatMap(k => [...pat(k)])));
  assert.deepEqual(volume(r.image, "A").verify(), []);
  checkPendingBoundary(pendingBoundary(CLOSE[1], "FNCLSE"));
});
test("AC2 next block flushes", () => flushRows(NEXT_BLOCK, "CCC"));
test("AC2 another drive flushes", () => flushRows(OTHER_DRIVE, "CCC"));
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
test("AC2 mutant: BWGET without CPMOVE leaves the block pending at the next block and at the B: write", () => {
  const mut = MUTANTS.cpmove();
  assert.throws(() => flushRows(NEXT_BLOCK, "CCC", mut), /records 3 and 4: the three records/);
  assert.throws(() => flushRows(OTHER_DRIVE, "CCC", mut), /B:: the three records/);
});
test("AC2 mutant: the coalescing mark on type 1 too makes the close one card write, its directory block pending", () => {
  assert.throws(() => flushRows(CLOSE.slice(0, 1), "CCC", MUTANTS.type1()), /BDOS 16: card writes/);
});

// --- One write a block -----------------------------------------------------

/** The 16 KiB file: 128 BDOS 21 calls and the close, after the make. Its card writes, reads and readings. */
function file16(rom) {
  const r = rig({ rom });
  r.name("S16     DAT");
  r.bdos(22);
  r.bdos(26, DMA);
  const [w0, rd0] = [r.t.writes.length, r.t.reads.length];
  let cycles = 0;
  for (let k = 0; k < 128; k += 1) {
    r.put(k);
    cycles += r.bdos(21).cycles;
  }
  cycles += r.bdos(16).cycles;
  const writes = r.t.writes.slice(w0);
  const reads = r.t.reads.slice(rd0);
  const data = new Set(Array.from({ length: 32 }, (_, b) => lbaOf(r, b * 4)));
  const want = Uint8Array.from(Array.from({ length: 128 }, (_, k) => [...pat(k)]).flat());
  // Back through the cache: the file read through FCB2.
  r.name("S16     DAT", FCB2);
  r.bdos(15, FCB2);
  const back = [];
  for (let k = 0; k < 128; k += 1) {
    r.bdos(20, FCB2);
    for (let i = 0; i < 128; i += 1) back.push(r.m.read(DMA + i));
  }
  r.reset();
  return {
    cycles,
    writes,
    dataReads: reads.filter((b) => data.has(b)).length,
    data,
    fromCache: same(back, want),
    fromCard: same(volume(r.image, "A").read("S16.DAT"), want),
    dir: dirBlocks(r.image),
  };
}

function checkFile16(rom) {
  const f = file16(rom);
  assert.equal(f.writes.length, 33, "33 card writes after the make");
  assert.deepEqual(new Set(f.writes.slice(0, 32)), f.data, "the 32 data blocks, each once");
  assert.ok(f.dir.has(f.writes[32]), "then the directory");
  assert.equal(f.dataReads, 0, "no data block read");
  assert.ok(f.fromCache, "the file back whole through the cache");
  assert.ok(f.fromCard, "and from the card after a reset");
  return f;
}

test("AC3 16 KiB file", () => checkFile16());
test("AC3 mutant: CPMOVE keeping the pending block by the line a write would take, not its tag, writes a block more than once", () => {
  assert.throws(() => checkFile16(MUTANTS.byline()), /33 card writes|each once/);
});
/**
 * Logged on B:, records 0 to 4 written to A:, the card refusing the write
 * that moves on to the next block, then the retry once it takes writes, and
 * BDOS 11: whether each record is on the card at that key wait. Every
 * directory write writes the other changed lines first, so a close repairs
 * what a mutant here leaves out; the key wait, before any directory
 * request, shows it.
 */
function atKeyWait(rom) {
  const r = three({ rom, budget: BOUND });
  const f = r.refuse();
  r.put(3);
  r.bdos(21);
  r.put(4);
  r.bdos(21); // the build refuses it: FFh
  f.on = false;
  r.bdos(21); // the retry, or a rewrite
  r.bdos(11, 0);
  return r.state(5);
}

test("AC3 mutant: BWGET without CPMOVE leaves records 0 to 3 off the card at the key wait after the next block", { timeout: 300_000 }, () => {
  assert.equal(atKeyWait(), "CCCCC", "the build: every record on the card at the key wait");
  assert.equal(atKeyWait(MUTANTS.cpmove()), "----C", "the mutant: records 0 to 3 left in a line no flush point names");
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

/** BDOS 40 at a new block, records 40 and 41 of a closed eight-record file, then the close. */
function bdos40New(rom) {
  const r = closed8({ rom });
  const w0 = r.t.writes.length;
  r.put(40);
  r.setR(40);
  const a = r.bdos(40).a;
  const first = r.t.writes.length - w0;
  r.put(41);
  r.setR(41);
  r.bdos(40);
  const second = r.t.writes.length - w0 - first;
  const close = r.bdos(16).a;
  const f = volume(r.image, "A").read("F.DAT");
  return {
    a, first, second, close, atClose: r.t.writes.length - w0 - first - second,
    records: f.length / 128,
    written: same(f.subarray(40 * 128, 41 * 128), pat(40)) && same(f.subarray(41 * 128, 42 * 128), pat(41)),
    zeros: f.subarray(42 * 128, 48 * 128).every((v) => v === 0),
    verify: volume(r.image, "A").verify(),
  };
}

test("AC3 bdos 40", () => {
  assert.deepEqual(bdos40New(), { a: 0, first: 4, second: 0, close: 0, atClose: 2, records: 42, written: true, zeros: true, verify: [] });
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
  assert.equal(c.cuts, 20, "20 card writes");
});
test("AC4 mutant: BWGET without CPMOVE keeps the directory last but leaves records 0 to 3 off the card at the key wait", { timeout: 300_000 }, () => {
  assert.deepEqual(cuts(MUTANTS.cpmove()).problems, [], "the close's flush-first write keeps the directory last even so");
  assert.equal(atKeyWait(MUTANTS.cpmove()), "----C", "but records 0 to 3 are not on the card at the key wait");
});
test("AC4 mutants: FNCLSE and READDIR without their calls still keep the directory last, every directory write passing CPMOVE", () => {
  for (const m of [MUTANTS.fnclse(), MUTANTS.readdir()]) assert.deepEqual(cuts(m).problems, []);
});

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
test("AC5 mutant: CPFLSH clearing CPEND before the write loses records 0 to 3", { timeout: 300_000 }, () => {
  assert.equal(atKeyWait(), "CCCCC");
  assert.equal(atKeyWait(MUTANTS.cpendearly()), "----C", "records 0 to 3 not on the card at the key wait after the retry");
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
test("AC5 mutant: VFLUSH through CFLALL drops the block, and the close names records not on the card", { timeout: 300_000 }, () => {
  assert.throws(() => keepsBlock(MUTANTS.cflall()), /all three on the card/);
});

test("AC5 console read keeps the block", { timeout: 300_000 }, () => {
  for (const [what, read, a] of [
    ["BDOS 1", (r) => (r.m.enqueueInput("x"), r.bdos(1, 0, true)), 0x78],
    ["the BIOS's CONIN", (r) => (r.m.enqueueInput("x"), r.bios(0x09, true)), 0x78],
    ["BDOS 11", (r) => r.bdos(11, 0), 0],
  ]) {
    const r = three({ budget: BOUND });
    const f = r.refuse();
    assert.equal(read(r).a, a, `${what}: its result`);
    assert.notEqual(r.pending(), 0, `${what}: the block still pending`);
    assert.equal(r.state(), "---", `${what}: nothing on the card`);
    f.on = false;
    assert.equal(r.bdos(16).a, 0, `${what}: the close once the card takes writes`);
    assert.equal(r.state(), "CCC", `${what}: all three on the card`);
  }
});

test("AC5 card changed", { timeout: 300_000 }, () => {
  for (const [what, other] of [["another card", () => card()], ["the same card", (img) => img]]) {
    const r = three({ budget: BOUND });
    r.m.sd = null;
    assert.equal(r.bdos(11, 0).a, 0, `${what}: BDOS 11 with the card out`);
    const img = other(r.image);
    const copy = Uint8Array.from(img);
    r.m.swapCard(img);
    r.m.enqueueInput("x");
    assert.equal(r.bdos(1, 0, true).a, 0x78, `${what}: BDOS 1 returns its key`);
    for (const k of ["the close", "the close again"]) {
      const c = r.bdos(16);
      assert.deepEqual([c.a, c.h], [0xff, 1], `${what}: ${k} fails`);
    }
    assert.match(r.warm(), /Write lost/, `${what}: warm boot says Write lost`);
    assert.doesNotMatch(r.warm(), /Write lost/, `${what}: the next warm boot nothing`);
    assert.ok(same(img, copy), `${what}: the card put in unchanged before a reset`);
    r.reset();
    assert.ok(same(img, copy), `${what}: and after the reset's boot`);
    assert.deepEqual(volume(img, "A").verify(), [], `${what}: the card verifies`);
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

test("AC6 reset loses the pending block", () => {
  assert.equal(inPlace(34, false), "old", "BDOS 34 in place, then reset");
  const r = three();
  r.reset();
  assert.ok(named(r) <= 0, "the new file's records not named");
  assert.equal(Buffer.from(r.image).indexOf(Buffer.from(pat(0))), -1, "no file data on the card");
  assert.deepEqual(volume(r.image, "A").verify(), []);
});

test("AC6 reset after a console read", () => {
  assert.equal(inPlace(34, true), "new");
});
test("AC6 mutant: FNSTAT without its call gives the old record after BDOS 11", () => {
  assert.equal(inPlace(34, true, MUTANTS.fnstat()), "old");
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
  assert.ok(f.cycles <= 9_700_000, `${f.cycles} T`);
  console.log(`16 KiB file: ${f.cycles} T, ${f.writes.length} card writes`);
});

function consoleCost(rom) {
  const r = rig({ rom });
  const t = r.bdos(11, 0).cycles;
  assert.ok(t - COALESCED.bdos11 <= 60, `BDOS 11: ${t} T, ${t - COALESCED.bdos11} over A: coalescing's`);
  return t;
}

test("AC7 console cost", () => {
  const t = consoleCost();
  console.log(`BDOS 11 with nothing pending, logged on B:: ${t} T (+${t - COALESCED.bdos11})`);
});
test("AC7 mutant: CPOUT without its fast test of CPEND costs BDOS 11 more than 60 T", () => {
  assert.throws(() => consoleCost(MUTANTS.nofast()), /over A: coalescing's/);
});
test("AC7 mutant: CKEY that never tests CANY costs BDOS 11 more than 60 T", () => {
  assert.throws(() => consoleCost(MUTANTS.mnc()), /over A: coalescing's/);
});

/** BDOS 11 after each of 32 records to A:, logged on LOGGED: the cycles and the percentage over BASE, which must be at most BOUND. */
function worstCase(logged, base, bound, rom) {
  const r = rig({ rom, logged });
  r.name("S11     DAT");
  r.bdos(22);
  r.bdos(26, DMA);
  let t = 0;
  for (let k = 0; k < 32; k += 1) {
    r.put(k);
    t += r.bdos(21).cycles + r.bdos(11, 0).cycles;
  }
  const over = (t / base - 1) * 100;
  assert.ok(over <= bound, `${t} T, ${over.toFixed(2)} % over A: coalescing's ${base}`);
  return { t, over };
}

test("AC7 worst case", () => {
  const { t, over } = worstCase("B", COALESCED.worstOnB, 1);
  console.log(`BDOS 11 after each of 32 records, logged on B:: ${t} T (+${over.toFixed(2)} %)`);
});
test("AC7 mutant: CKEY that never tests CANY takes the worst case logged on B: past 1 %", () => {
  assert.throws(() => worstCase("B", COALESCED.worstOnB, 1, MUTANTS.mnc()), /% over/);
});

// Logged on A:, A: is written behind: each BDOS 11 after a held write scans
// the lines and writes the record's block. That is the cost of every line
// being on the card at a key wait.
test("AC7 worst case logged", () => {
  const { t, over } = worstCase("A", COALESCED.worstOnA, 5);
  console.log(`BDOS 11 after each of 32 records, logged on A:: ${t} T (+${over.toFixed(2)} %)`);
});
test("AC7 mutant: CKEY scanning twice takes the worst case logged on A: past 5 %", () => {
  assert.throws(() => worstCase("A", COALESCED.worstOnA, 5, MUTANTS.mtw()), /% over/);
});

// --- What stays ---------------------------------------------------------------

/** Logged on B:, eight records to B: wait in the cache, held behind, until the close writes them and then its entry. */
function writtenBehind(rom) {
  const r = rig({ rom });
  r.name("W       DAT", FCB, 2);
  r.bdos(22);
  r.bdos(26, DMA);
  const w0 = r.t.writes.length;
  for (let k = 0; k < 8; k += 1) {
    r.put(k);
    r.bdos(21);
    assert.equal(r.pending(), 0, `B: record ${k}: nothing pending`);
  }
  // Eight records are two card blocks.
  assert.equal(r.t.writes.length, w0, "no card write before the close");
  assert.equal(r.bdos(16).a, 0);
  const made = r.t.writes.slice(w0);
  const b = volume(r.image, "B");
  const dir = dirBlocks(r.image, "B");
  assert.equal(made.length, 3, "the close: two data blocks, then the directory");
  assert.ok(made.slice(0, 2).every((x) => !dir.has(x)) && dir.has(made[2]), "the directory last");
  assert.ok(same(b.read("W.DAT"), Uint8Array.from(Array.from({ length: 8 }, (_, k) => [...pat(k)]).flat())));
}

test("AC8 the logged drive written behind", { timeout: 300_000 }, () => {
  writtenBehind();
  // COPY, TYPE and DIR under the shell, logged on A:, which is written
  // behind, with the copy on B:, which coalesces.
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
