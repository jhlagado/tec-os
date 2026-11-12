// A: coalesces: a data write on a volume not written behind goes into its
// block's cache line, and the one pending block reaches the card at the
// file's close, any directory request, a write to another block, a warm
// boot, a console read, function 48, MOUNT and unmount. The ROM's figures,
// the flush rule, one card write a block, the directory at every cut,
// failures and a card changed, a reset with a block pending, the speed, the
// volume written behind, the program's stack at CONIN, the docs and the
// version fields. Emulator evidence; each mutant is the build's ROM patched,
// run here one at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, ROOT, SHELL_SVC, boot, romFor, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { pinned } from "./lib/inputs.mjs";
import { BUF, DMA, FCB, FCB2, FCB3, MUTANTS, card, closed8, dirBlocks, flushRun, pat, rig, same, three } from "./lib/coalesce.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const readText = (n) => readFileSync(resolve(ROOT, n), "utf8");
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

// The shell's landing, measured on its own build: the ROM, the TPA, abi.inc,
// the census's BDOS deepest, BDOS 11 with nothing waiting and BDOS 11 after
// each of 32 records, in cycles from the stub.
const LANDING = { used: 14769, tpa: 47273, abi: "1a020a1b076c3b7b4282c64ceeb82dad471c3ecbbe883c5d3448a859e0a07413", bdosDeepest: 32, bdos11: 3814, worst: 7_523_831 };

// --- Every landing keeps the version fields --------------------------------

test("AC12 version fields", () => {
  const inc = readText("src/abi.inc");
  assert.equal(sha(Buffer.from(inc, "utf8")), LANDING.abi, "abi.inc as at the shell's landing");
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
  assert.ok(used - LANDING.used <= 120, `${used} used, ${used - LANDING.used} over the shell's landing, the ceiling 120`);
  const gaps = regions.filter((r) => r.label === "free");
  assert.deepEqual(gaps.map((g) => g.end), [0x10000], "one contiguous free tail");
  const { symbols } = romFor();
  const at = symbols.get("CPEND");
  assert.ok(at >= symbols.get("RAMBIOS") + 51 && at < 0xc000, `CPEND at ${at.toString(16)}, above the RAM BIOS table`);
  assert.equal(census.ram.tpa.bytes, LANDING.tpa, "the TPA as at the shell's landing");
  const m = boot(standardCard());
  assert.equal(word(m, 6) - 0x100, LANDING.tpa, "(0006h) on the card");
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

test("AC2 no flush", () => flushRows(NO_FLUSH, "---"));
test("AC2 console reads flush", () => flushRows(CONSOLE, "CCC"));
test("AC2 bios conin flushes", () => flushRows(CONIN, "CCC"));
test("AC2 directory requests flush", () => flushRows(DIRECTORY, "CCC"));
test("AC2 close flushes", () => flushRows(CLOSE, "CCC"));
test("AC2 next block flushes", () => flushRows(NEXT_BLOCK, "CCC"));
test("AC2 another drive flushes", () => flushRows(OTHER_DRIVE, "CCC"));
test("AC2 function 48, mount and unmount", () => flushRows(VOLUMES, "CCC"));

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

test("AC2 mutant: FNSTAT without its call leaves the block pending at BDOS 11", () => {
  assert.throws(() => flushRows(CONSOLE, "CCC", MUTANTS.fnstat()), /BDOS 11: the three records/);
});
test("AC2 mutant: READDIR without its call leaves the block pending at BDOS 15, 17 and 35", () => {
  const mut = MUTANTS.readdir();
  for (const row of DIRECTORY) assert.throws(() => flushRows([row], "CCC", mut), new RegExp(`${row[0]}: the three records`));
});
test("AC2 mutant: FNCLSE without its call leaves the block pending at the unmodified close", () => {
  assert.throws(() => flushRows(CLOSE.slice(1), "CCC", MUTANTS.fnclse()), /unmodified FCB: the three records/);
});
test("AC2 mutant: BCONIN without its call leaves the block pending at the BIOS's CONIN", () => {
  assert.throws(() => flushRows(CONIN, "CCC", MUTANTS.bconin()), /CONIN: the three records/);
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
test("AC3 mutant: BWGET without CPMOVE makes 4 card writes and the file isn't whole", () => {
  const f = file16(MUTANTS.cpmove());
  assert.equal(f.writes.length, 4);
  assert.equal(f.fromCard, false);
});

// The starter card's commands, as the Viewer runs them: the PICO9918 at 40
// columns and the matrix keyboard.
const PINS = ["BAZA.COM", "BAZA.RTL", "BOUNCE.BAS", "TAS.COM", "TED.COM"].map(pinned);
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
/** COMMAND on the starter card: its cycles from the CR to the prompt, its card writes by block, and its BDOS 21 calls' cycles. */
function onStarter(command) {
  if (traces.has(command)) return traces.get(command);
  const image = starterCard();
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  const [entry, back, sdw, lba] = [m.sym("BENTRY"), m.sym("RETWORD") + 6, m.sym("SDWRITE"), m.sym("SDLBA")];
  const t = { writes: [], w21: [] };
  let on = false;
  let call = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    if (on) {
      if (pc === entry && !call) call = { fn: m.cpu.cpu.c, t0: m.cycles };
      else if (pc === back && call) [call.fn === 21 && t.w21.push(m.cycles - call.t0), (call = null)];
      if (pc === sdw) t.writes.push(word(m, lba) + word(m, lba + 2) * 0x10000);
    }
    return step();
  };
  const mark = m.output.length;
  const t0 = m.cycles;
  on = true;
  m.enqueueInput(`${command}\r`, "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && m.ready() && /A>$/.test(m.text(mark))), 4_000_000_000, command);
  on = false;
  const out = { ...t, cycles: m.cycles - t0, text: m.text(mark), dir: dirBlocks(image) };
  traces.set(command, out);
  return out;
}

test("AC3 bounce writes", { skip: CARD_SKIP, timeout: 900_000 }, () => {
  const b = onStarter("baza bounce");
  assert.match(b.text, /COM written\r\n/);
  assert.ok(b.writes.length <= 45, `${b.writes.length} card writes`);
  const data = b.writes.filter((x) => !b.dir.has(x));
  assert.equal(new Set(data).size, data.length, "each data block once");
  console.log(`BAZA BOUNCE: ${b.writes.length} card writes, ${data.length} data blocks`);
});

test("AC3 save", { skip: CARD_SKIP, timeout: 300_000 }, () => {
  const s = onStarter("save 16 x.com");
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
test("AC4 mutant: BWGET without CPMOVE names records not on the card", () => {
  assert.ok(cuts(MUTANTS.cpmove()).problems.length > 0);
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
  assert.throws(() => movesOn(MUTANTS.cpendearly()), /every record on the card|the cycle bound/);
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

test("AC7 bounce speed", { skip: CARD_SKIP, timeout: 900_000 }, () => {
  const b = onStarter("baza bounce");
  const seconds = b.cycles / 4e6;
  const mean = b.w21.reduce((s, x) => s + x, 0) / b.w21.length;
  assert.ok(seconds <= 18.6, `${seconds.toFixed(2)} s at 4 MHz`);
  assert.ok(mean <= 80_000, `BDOS 21: ${Math.round(mean)} T each, of ${b.w21.length}`);
  console.log(`BAZA BOUNCE: ${b.cycles} T, ${seconds.toFixed(2)} s; ${b.w21.length} BDOS 21 calls, ${Math.round(mean)} T each`);
});

test("AC7 file speed", () => {
  const f = checkFile16();
  assert.ok(f.cycles <= 9_700_000, `${f.cycles} T`);
  console.log(`16 KiB file: ${f.cycles} T, ${f.writes.length} card writes`);
});

test("AC7 console cost", () => {
  const r = rig();
  const t = r.bdos(11, 0).cycles;
  assert.ok(t - LANDING.bdos11 <= 60, `BDOS 11: ${t} T, ${t - LANDING.bdos11} over the shell's landing`);
  console.log(`BDOS 11 with nothing pending: ${t} T (+${t - LANDING.bdos11})`);
});

test("AC7 worst case", () => {
  const r = rig();
  r.name("S11     DAT");
  r.bdos(22);
  r.bdos(26, DMA);
  let t = 0;
  for (let k = 0; k < 32; k += 1) {
    r.put(k);
    t += r.bdos(21).cycles + r.bdos(11, 0).cycles;
  }
  const over = (t / LANDING.worst - 1) * 100;
  assert.ok(over <= 1, `${t} T, ${over.toFixed(2)} % over the shell's landing`);
  console.log(`BDOS 11 after each of 32 records: ${t} T (+${over.toFixed(2)} %)`);
});

// --- What stays ---------------------------------------------------------------

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

test("AC8 written behind unchanged", { timeout: 300_000 }, () => {
  writtenBehind();
  // COPY, TYPE and DIR under the shell, with B: written behind.
  const image = withShell(card());
  const data = Uint8Array.from({ length: 6000 }, (_, i) => (i * 7 + 1) & 0xff);
  const text = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\r\n") + "\r\n";
  volume(image, "A").write("DATA.BIN", data);
  volume(image, "A").write("T.TXT", Buffer.from(text + "\x1a", "latin1"));
  const m = boot(image);
  const cmd = (l) => m.command(l, { prompt: /\r\n[A-P]>$/, maxCycles: 2_000_000_000 });
  cmd("COPY DATA.BIN B:DATA.CPY");
  assert.ok(cmd("TYPE T.TXT").includes(text), "TYPE gives the file's text");
  assert.match(cmd("DIR B:"), /DATA\s*\.?\s*CPY/, "DIR lists the copy");
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.ready() && /\r\n[A-P]>$/.test(m.text(m.mark)), 400_000_000, "warm boot");
  assert.ok(same(volume(image, "B").read("DATA.CPY").subarray(0, data.length), data), "COPY's bytes on the card after warm boot");
  assert.ok(same(volume(image, "A").read("DATA.BIN").subarray(0, data.length), data));
});
test("AC8 mutant: BWGET marking a write-behind volume's writes to coalesce leaves B:'s block pending", () => {
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
    assert.ok(below <= 18, `${mode}: CONIN with a block pending takes ${below} bytes below the return address`);
  }
}

test("AC10 conin stack", { timeout: 300_000 }, () => {
  const runs = { writing: flushRun("writing"), refusing: flushRun("refusing") };
  checkFlushStacks(runs);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { bdos: r.bdos.deepest, conin: r.programStack["BIOS CONIN"] - 2 }]))));
});
test("AC10 mutant: CPOUT with three more pushes passes the BDOS's room and takes 24 bytes at CONIN", { timeout: 300_000 }, () => {
  const mut = MUTANTS.push3();
  const runs = { writing: flushRun("writing", mut) };
  assert.throws(() => checkFlushStacks(runs), /the BDOS's deepest/);
  assert.equal(runs.writing.programStack["BIOS CONIN"] - 2, 24);
});

// --- Docs ---------------------------------------------------------------------

test("AC11 docs", () => {
  const recovery = readText("docs/recovery.md");
  for (const s of [
    "A: coalesces",
    "at most one block, four records, 512 bytes",
    "the directory never names it until the card has it",
    "while a kept A: or B: line keeps failing, B: directory writes and `MOUNT` refuse until warm boot",
    "reported at the next flush point",
    "Function 48, `MOUNT` and unmount keep",
  ]) assert.ok(recovery.replace(/\s+/g, " ").toLowerCase().includes(s.toLowerCase()), `docs/recovery.md: ${s}`);
  assert.doesNotMatch(recovery, /returns success only after the\s+line has gone to the card/, "no write on A: returns only when the card has the block");
  assert.doesNotMatch(recovery, /the others drop it/, "no flush but warm boot drops a failed line");
  const compat = readText("docs/compatibility.md");
  for (const s of ["`CONST`", "reader", "`CONIN`", "type 0"]) assert.ok(compat.includes(s), `docs/compatibility.md names ${s}`);
  assert.doesNotMatch(compat, /that line then dropped/, "function 48 keeps a failed line");
  assert.ok(readText("docs/memory-map.md").includes("`CPEND`"), "docs/memory-map.md names CPEND");
});
