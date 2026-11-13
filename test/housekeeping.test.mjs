// Cooperative housekeeping: real SPI writes/refusals against seeded cache
// blocks, API context, notices and guest stops. Direct cache setup establishes
// private starting state; final bytes come from the emulated card backend.
// Synthetic RETN NMI probes cover admitted classic-bank points only.
// Guest-stop files already have directory metadata: those tests establish
// record-data persistence, not durability of an unclosed newly created file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { GLCD_SVC, TEST_CLOCK, program, romFor, volume } from "./lib/fixtures.mjs";
import { createContainer, parseContainer, findVolume } from "../tools/lib/container.mjs";
// Copies run privately under the BIOS exclusion contract. The following
// outer BDOS calls perform real SPI commits and establish their order.
function checkQueuedRewrite(r, zeroFill, refusedEntry = false) {
  if (refusedEntry) {
    const games = findVolume(parseContainer(r.image), "GAMES");
    const mounted = r.call(r.m.sym("ABICALL"), { c: 9, b: 3, d: 0, e: games.index });
    assert.equal(mounted.a, 0);
    assert.equal(mounted.flags.C, 0);
  }
  r.seed(5, r.base, 65);
  r.seed(2, r.base + 1, 66);
  r.call(r.m.sym("HKRESET"));
  const round = () => Array.from({ length: r.m.read(r.m.sym("HKRLEN")) }, (_, i) => r.m.read(r.m.sym("HKROUND") + i));
  assert.deepEqual(round(), [5, 2]);
  for (let i = 0; i < 4; i++) r.m.write(r.m.sym("SDLBA") + i, Math.floor(r.base / 256 ** i) & 255);
  r.m.write(r.m.sym("BLKSLOT"), 2);
  r.m.write(r.m.sym("DSKDMA"), 0);
  r.m.write(r.m.sym("DSKDMA") + 1, 34);
  r.m.write(r.m.sym("CWTYPE"), zeroFill ? 2 : 0);
  for (let i = 0; i < 128; i++) r.m.write(8704 + i, 99);
  const oldCard = Uint8Array.from(r.bytes(r.base));
  if (refusedEntry) {
    // Root BIOS entry attempts the old head and receives an actual SD
    // refusal before its functional write merges another received record.
    r.failed.add(r.base);
    r.m.write(r.m.sym("DSKCUR"), 3);
    r.m.write(r.m.sym("DSKTRK"), 1);
    r.m.write(r.m.sym("DSKTRK") + 1, 0);
    r.m.write(r.m.sym("DSKSEC"), 2);
    r.m.write(r.m.sym("DSKSEC") + 1, 0);
    const result = r.call(r.m.sym("RAMBIOS") + 42, { c: zeroFill ? 2 : 0 });
    assert.equal(result.a, 0, "the requested record is accepted despite the earlier maintenance refusal");
  } else {
    r.call(r.m.sym("CDI"));
    const result = r.call(r.m.sym("CWRBH"), { c: zeroFill ? 1 : 0 });
    r.call(r.m.sym("CEI"));
    assert.equal(result.flags.Z, 1);
  }
  assert.deepEqual(r.queue(), [5, 2], "one entry, in its original position");
  assert.deepEqual(round(), [5, 2], "the already eligible rewrite retains its turn");
  assert.equal(r.m.read(r.m.sym("HKRPOS")), refusedEntry ? 1 : 0);
  assert.deepEqual(r.attempts, refusedEntry ? [r.base] : []);
  const expected = new Uint8Array(512).fill(zeroFill ? 0 : 65);
  expected.fill(99, 256, 384);
  assert.deepEqual(r.m.expand[1].slice(5 * 512, 6 * 512), expected);
  const nextBefore = Uint8Array.from(r.bytes(r.base + 1));
  if (refusedEntry) {
    assert.deepEqual(r.bytes(r.base), oldCard, "backend refusal did not commit the old payload");
    r.failed.clear();
    r.api(12);
    assert.deepEqual(r.attempts, [r.base, r.base + 1], "frozen round lets the other eligible line progress");
    assert.deepEqual(r.queue(), [5]);
    assert.deepEqual(r.bytes(r.base), oldCard);
    r.api(12);
    assert.deepEqual(r.attempts, [r.base, r.base + 1, r.base]);
    assert.deepEqual(r.commits.map(({ success }) => success), [false, true, true]);
    assert.deepEqual(r.bytes(r.base), expected, "recovery commits the merged current payload");
    assert.ok(r.bytes(r.base + 1).every(b => b === 66));
    assert.deepEqual(r.queue(), []);
    return;
  }
  assert.equal(r.api(12).a, 34);
  assert.deepEqual(r.attempts, [r.base]);
  assert.deepEqual(r.queue(), [2]);
  assert.deepEqual(r.bytes(r.base), expected, "one SD write contains the combined current block");
  assert.deepEqual(r.bytes(r.base + 1), nextBefore);
  r.api(12);
  assert.deepEqual(r.attempts, [r.base, r.base + 1]);
  assert.deepEqual(r.queue(), []);
  assert.ok(r.bytes(r.base + 1).every((b) => b === 66));
}
for (const zeroFill of [false, true]) {
  test(`RIG4 queued ${zeroFill ? "new-allocation zero-fill" : "ordinary"} rewrite preserves first-dirty and frozen order`, () => {
    checkQueuedRewrite(fixture(), zeroFill);
  });
  test(`RIG4 public ${zeroFill ? "new-allocation zero-fill" : "ordinary"} rewrite retains a backend-refused old head`, () => {
    checkQueuedRewrite(fixture(), zeroFill, true);
  });
}

test("RIG4 unconditional zero-fill retag mutant loses first-dirty position", () => {
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom);
  const tag = symbols.get("CSET");
  const start = symbols.get("CWB1") - 0xc000;
  const end = symbols.get("CWBF") - 0xc000;
  const sites = [];
  for (let i = start; i < end - 2; i++) {
    if (bytes[i] === 0xcc && bytes[i + 1] === (tag & 255) && bytes[i + 2] === tag >> 8) sites.push(i);
  }
  assert.equal(sites.length, 1, "one conditional CALL Z,CSET in the zero-fill path");
  bytes[sites[0]] = 0xcd;
  assert.throws(() => checkQueuedRewrite(fixture({ rom: bytes }), true), error => {
    assert.equal(error.code, "ERR_ASSERTION");
    assert.equal(error.message.split("\n")[0], "one entry, in its original position");
    assert.deepEqual(error.actual, [2, 5]);
    assert.deepEqual(error.expected, [5, 2]);
    return true;
  });
});

for (const mode of [0, 1]) {
  test(`RIG4 actual guest write then halt with ${mode} intervening light call`, async () => {
    const assembled = await program("hkstop");
    const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }]);
    const fs = volume(image, "A");
    const code = Uint8Array.from(assembled.bytes);
    code[assembled.symbols.MODE - 256] = mode;
    fs.write("HKSTOP.COM", code);
    fs.write("TARGET.DAT", new Uint8Array(512).fill(119));
    const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
    m.runUntil(() => m.ready(), 4e8, "bare prompt");
    m.type("HKSTOP\r");
    m.runUntil(() => m.pc === assembled.symbols.STOP, 4e8, "deliberate guest stop");
    assert.equal(m.read(assembled.symbols.STATUS), 0);
    const expected = new Uint8Array(512).fill(119);
    if (mode) expected.fill(90, 0, 128);
    assert.deepEqual(fs.read("TARGET.DAT"), expected, "card inspected before close/input/warm cleanup");
    assert.equal(m.read(m.sym("HKCNT")), mode ? 0 : 1);
    assert.deepEqual(m.violations, []);
  });
}
const word = (m, a) => m.read(a) | m.read(a + 1) << 8, lba = (m) => [0, 1, 2, 3].reduce((n, i) => n + m.read(m.sym("SDLBA") + i) * 256 ** i, 0);
function fixture(opts = {}) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "SOURCE", mount: "C" },
    { geometry: "G1M", label: "DEMOS", mount: "D" },
    { geometry: "G1M", label: "GAMES" }
  ], { drives: 4 });
  const { rom, symbols } = romFor(), fs = volume(image, "A");
  if (opts.matrix && !opts.tms) fs.write("GLCD.SVC", GLCD_SVC);
  if (opts.matrix && !opts.tms) fs.write("STARTUP.CMD", Buffer.from("GLCD.SVC\r\n"));
  fs.write("HOLD.COM", Uint8Array.of(24, 254));
  const m = new Machine({ rom, symbols, sdImage: image, ram96: true, glcd: false, ...opts, clock: TEST_CLOCK });
  m.runUntil(() => m.ready(), 8e8, "bare prompt");
  if (opts.matrix) {
    m.type("HOLD");
    m.enqueueInput("\r", "matrix");
    m.runUntil(() => {
      m.pumpInput();
      return m.pc === 256;
    }, 8e8, "real transient entry");
    assert.ok(m.pending.length === 0 || m.pending[0].up, "matrix Return released");
    m.pending = [];
  } else {
    m.type("HOLD\r");
    m.runUntil(() => m.pc === 256, 8e8, "real transient entry");
  }
  assert.equal(m.read(m.sym("HKDEP")), 0, "prompt input returned before transient entry");
  const base = findVolume(parseContainer(image), "GAMES").start + 16;
  const failed = /* @__PURE__ */ new Set(), commits = [], attempts = [], stack = { deepest: 0, callerDeepest: 0 }, stats = { workerEntries: 0, maxDepth: 0, nmiRequests: 0, nmiEntries: 0 };
  const commit = m.sd.commitWrite.bind(m.sd);
  m.sd.commitWrite = () => {
    const block = m.sd.writeState.start / 512;
    const success = !failed.has(block);
    commits.push({ block, success });
    if (success) return commit();
    m.sd.writeState = null;
    m.sd.pendingResponse = [13, 255];
    m.sd.delayBytes = 1;
  };
  let irqLow = m.sym("HKSTKT");
  if (opts.nmi) {
    m.write(102, 237);
    m.write(103, 69);
  }
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 102) stats.nmiEntries++;
    if (m.pc === m.sym("HKWORK")) {
      assert.equal(m.read(m.sym("HKBUSY")), 0, "worker never recursively enters");
      stats.workerEntries++;
    }
    if (m.classicBankIn) stats.maxDepth = Math.max(stats.maxDepth, m.read(m.sym("HKDEP")));
    if (m.pc === m.sym("SDWRITE")) attempts.push(lba(m));
    const sp = m.cpu.cpu.sp & 65535;
    if (sp >= 24320 && sp <= 24576) stack.callerDeepest = Math.max(stack.callerDeepest, 24576 - sp);
    if (sp >= m.sym("HKSTKB") && sp <= m.sym("HKSTKT")) stack.deepest = Math.max(stack.deepest, m.sym("HKSTKT") - sp);
    const result = step();
    const after = m.cpu.cpu.sp & 65535;
    if (opts.nmi && m.classicBankIn && m.pc !== 102 && m.pc !== 103 && after >= m.sym("HKSTKB") && after < irqLow) {
      irqLow = after;
      m.tec1g.applyKey(0);
      stats.nmiRequests++;
    }
    return result;
  };
  m.write(m.sym("HKGRD"), 211);
  m.write(m.sym("HKGRD") + 1, 108);
  const call = (address, regs = {}) => {
    const c = m.cpu.cpu;
    [205, address & 255, address >> 8, 24, 254].forEach((b, i) => m.write(12288 + i, b));
    Object.assign(c, { pc: 12288, sp: 24576 }, regs);
    const start = m.cycles;
    m.runUntil(() => {
      m.pumpInput();
      return m.pc === 12291;
    }, 4e8, "probe return");
    assert.equal(c.sp & 65535, 24576, "balanced caller stack");
    assert.equal(m.read(m.sym("HKGRD")), 211);
    assert.equal(m.read(m.sym("HKGRD") + 1), 108);
    assert.deepEqual(m.violations, []);
    return { cycles: m.cycles - start, a: c.a, flags: { ...c.flags } };
  };
  const queue = () => Array.from({ length: m.read(m.sym("HKCNT")) }, (_, i) => m.read(m.sym("HKQ") + i));
  const seed = (line, block, value) => {
    assert.ok(!queue().includes(line), "clean slot for a new block");
    const e = m.expand[1];
    e.fill(value, line * 512, (line + 1) * 512);
    for (let i = 0; i < 4; i++) e[m.sym("CTAB") - 32768 + line * 4 + i] = Math.floor(block / 256 ** i) & 255;
    call(m.sym("CDSET"), { a: line, d: 97, e: 114 });
    assert.deepEqual([m.cpu.cpu.d, m.cpu.cpu.e], [97, 114]);
  };
  const api = (fn = 25) => call(5, { c: fn });
  const bytes = (block) => image.slice(block * 512, (block + 1) * 512);
  return { m, image, base, failed, commits, attempts, stack, stats, call, queue, seed, api, bytes };
}
test("RIG4/5 mandatory pass uses first-dirty order", () => {
  const r = fixture();
  for (const [line, n] of [[5, 0], [2, 1], [17, 2]]) r.seed(line, r.base + n, 30 + n);
  r.call(r.m.sym("CDI"));
  const result = r.call(r.m.sym("CFLUSH"), { a: 30 });
  r.call(r.m.sym("CEI"));
  assert.equal(result.flags.Z, 1);
  assert.deepEqual(r.attempts, [r.base, r.base + 1, r.base + 2]);
  assert.equal(r.queue().length, 0);
});
for (const iff of [0, 1]) {
  test("RIG4/5 " + ("failure notice preserves refused API and IFF " + iff), () => {
    const r = fixture();
    r.seed(0, r.base, 73);
    r.failed.add(r.base);
    const mark = r.m.output.length, c = r.m.cpu.cpu;
    const regs = { c: 255, b: 71, d: 97, e: 114, h: 35, l: 69, ix: 4951, iy: 9320 };
    c.iff1 = c.iff2 = iff;
    const result = r.call(r.m.sym("ABICALL"), regs);
    assert.equal(result.a, 1);
    assert.equal(result.flags.C, 1);
    assert.deepEqual(Object.fromEntries(Object.keys(regs).map((n) => [n, c[n]])), regs);
    assert.equal(c.iff1, iff);
    assert.equal(r.m.read(r.m.sym("HKERR")), 2);
    assert.equal(r.m.text(mark).match(/Write pending/g)?.length, 1);
    assert.deepEqual(r.queue(), [0]);
    assert.equal(r.api(12).a, 34);
    assert.equal(r.m.text(mark).match(/Write pending/g)?.length, 1);
    r.failed.clear();
    assert.equal(r.api(12).a, 34);
    assert.equal(r.queue().length, 0);
    assert.equal(r.m.read(r.m.sym("HKERR")), 0);
    assert.equal(r.m.text(mark).match(/Cache clear/g)?.length, 1);
    assert.ok(r.bytes(r.base).every((b) => b === 73));
  });
}
test("RIG4/5 warm boot retains failed bytes and later API retries them", () => {
  const r = fixture();
  r.seed(5, r.base, 77);
  r.seed(2, r.base + 1, 88);
  r.failed.add(r.base);
  r.m.write(r.m.sym("CANY"), 1);
  const mark = r.m.output.length;
  r.m.cpu.cpu.pc = 0;
  r.m.runUntil(() => r.m.ready() && /\r\nA>$/.test(r.m.text(mark)), 8e8, "warm prompt with retained failure");
  assert.deepEqual(r.queue(), [5]);
  assert.ok(r.m.expand[1].slice(5 * 512, 6 * 512).every((b) => b === 77));
  assert.ok(r.bytes(r.base).some((b) => b !== 77));
  assert.ok(r.bytes(r.base + 1).every((b) => b === 88));
  assert.equal(r.m.text(mark).match(/Write pending/g)?.length, 1);
  assert.doesNotMatch(r.m.text(mark), /Write lost/);
  r.failed.clear();
  r.m.type("HOLD\r");
  r.m.runUntil(() => r.m.pc === 256, 8e8, "transient after recovery");
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  assert.equal(r.queue().length, 0);
  assert.ok(r.bytes(r.base).every((b) => b === 77));
  assert.equal(r.m.text(mark).match(/Cache clear/g)?.length, 1);
});
test("RIG4/5 failed directory prerequisites abandon unpublished metadata and retain data", () => {
  const r = fixture();
  r.seed(5, r.base, 77);
  r.seed(17, r.base + 1, 66);
  r.seed(2, r.base + 2, 88);
  const before = Uint8Array.from(r.bytes(r.base + 1));
  r.failed.add(r.base);
  r.call(r.m.sym("CDI"));
  const result = r.call(r.m.sym("CWB3"), { c: 17 });
  r.call(r.m.sym("CEI"));
  assert.equal(result.flags.Z, 0);
  assert.deepEqual(r.attempts, [r.base, r.base + 2]);
  assert.deepEqual(r.queue(), [5]);
  assert.deepEqual(r.bytes(r.base + 1), before);
  assert.ok(r.m.expand[1].slice(r.m.sym("CTAB") - 32768 + 17 * 4, r.m.sym("CTAB") - 32768 + 18 * 4).every((b) => b === 255));
  r.failed.clear();
  r.api(12);
  assert.equal(r.queue().length, 0);
  assert.deepEqual(r.bytes(r.base + 1), before);
  assert.ok(!r.attempts.includes(r.base + 1));
});
test("RIG4/5 refused metadata remains unpublished and is reported as an error", () => {
  const r = fixture();
  r.seed(5, r.base, 77);
  r.seed(17, r.base + 1, 66);
  const before = Uint8Array.from(r.bytes(r.base + 1));
  r.failed.add(r.base + 1);
  const mark = r.m.output.length;
  r.call(r.m.sym("CDI"));
  const result = r.call(r.m.sym("CWB3"), { c: 17 });
  r.call(r.m.sym("CEI"));
  assert.equal(result.flags.Z, 0);
  assert.deepEqual(r.attempts, [r.base, r.base + 1]);
  assert.equal(r.queue().length, 0);
  assert.ok(r.bytes(r.base).every((b) => b === 77));
  assert.deepEqual(r.bytes(r.base + 1), before);
  assert.equal(r.m.read(r.m.sym("HKERR")), 1);
  assert.equal(r.api(12).a, 34);
  assert.match(r.m.text(mark), /Write error/);
  assert.doesNotMatch(r.m.text(mark), /Cache clear/);
  assert.deepEqual(r.bytes(r.base + 1), before);
  assert.equal(r.attempts.length, 2);
});
test("RIG4/5 silent returned-error mode defers notice without clearing pending state", () => {
  const r = fixture();
  r.call(5, { c: 45, d: 0, e: 255 });
  r.seed(0, r.base, 73);
  r.failed.add(r.base);
  const mark = r.m.output.length;
  assert.equal(r.api(12).a, 34);
  assert.equal(r.m.text(mark), "");
  assert.equal(r.m.read(r.m.sym("HKERR")), 1);
  r.call(5, { c: 45, d: 0, e: 0 });
  assert.equal(r.m.text(mark), "");
  r.api(12);
  assert.match(r.m.text(mark), /Write pending/);
});
test("RIG4/5 explicit output safe point supplements entry service without recursive work", () => {
  const r = fixture();
  for (let i = 0; i < 3; i++) r.seed(i, r.base + i, 40 + i);
  const mark = r.m.output.length;
  r.call(5, { c: 2, d: 0, e: 88 });
  assert.match(r.m.text(mark), /X/);
  assert.equal(r.queue().length, 1);
  assert.equal(r.stats.workerEntries, 2);
  assert.equal(r.stats.maxDepth, 1);
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
});
for (const allFail of [false, true]) {
  test("RIG4/5 " + ("all-dirty pressure makes bounded first-dirty pass " + (allFail ? "all refused" : "partial recovery")), () => {
    const r = fixture(), order = Array.from({ length: 30 }, (_, i) => i * 7 % 30);
    for (const [n, line] of order.entries()) r.seed(line, r.base + n, 50 + n);
    const expected = order.map((_, n) => r.base + n);
    r.failed.add(r.base);
    if (allFail) for (const b of expected) r.failed.add(b);
    r.call(r.m.sym("CDI"));
    const result = r.call(r.m.sym("CTAKE"));
    r.call(r.m.sym("CEI"));
    assert.deepEqual(r.attempts, expected);
    assert.equal(result.flags.Z, allFail ? 0 : 1);
    assert.equal(r.queue().length, allFail ? 30 : 1);
    if (!allFail) {
      assert.deepEqual(r.queue(), [0]);
      assert.equal(r.m.expand[1][r.m.sym("CDIRTY") - 32768 + result.a], 0);
    }
    assert.equal(r.m.read(r.m.sym("HKERR")), 1);
  });
}
for (const [name, opts, mode] of [["GLCD", { matrix: true, glcd: true }, 3], ["PICO", { matrix: true, tms: true }, 1]]) {
  test("RIG4/5 " + (name + " failure/recovery notice on private worker stack"), () => {
    const r = fixture(opts);
    assert.equal(r.m.read(r.m.sym("CONMOD")), mode);
    r.seed(0, r.base, 73);
    r.failed.add(r.base);
    const mark = r.m.output.length;
    assert.equal(r.api(12).a, 34);
    assert.equal(r.m.text(mark).match(/Write pending/g)?.length, 1);
    r.failed.clear();
    assert.equal(r.api(12).a, 34);
    assert.equal(r.m.text(mark).match(/Cache clear/g)?.length, 1);
    assert.equal(r.queue().length, 0);
    assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  });
}
for (const iff of [0, 1]) {
  test("RIG4/5 " + ("direct failing worker keeps registers flags IFF1/IFF2 " + iff), () => {
    const r = fixture();
    r.seed(0, r.base, 73);
    r.failed.add(r.base);
    const c = r.m.cpu.cpu, names = ["a", "b", "c", "d", "e", "h", "l", "ix", "iy", "i", "a_prime", "b_prime", "c_prime", "d_prime", "e_prime", "h_prime", "l_prime"];
    const regs = Object.fromEntries(names.map((n, i) => [n, n === "ix" ? 4951 : n === "iy" ? 9320 : 49 + i & 255]));
    Object.assign(c, regs);
    c.flags = { S: 1, Z: 0, Y: 1, H: 1, X: 0, P: 1, N: 0, C: 1 };
    c.flags_prime = { S: 0, Z: 1, Y: 0, H: 0, X: 1, P: 0, N: 1, C: 0 };
    c.iff1 = c.iff2 = iff;
    const flags = { ...c.flags }, alt = { ...c.flags_prime };
    r.call(r.m.sym("HKSERV"));
    assert.deepEqual(Object.fromEntries(names.map((n) => [n, c[n]])), regs);
    assert.deepEqual(c.flags, flags);
    assert.deepEqual(c.flags_prime, alt);
    assert.equal(c.iff1, iff);
    assert.equal(c.iff2, iff);
    assert.equal(r.m.read(r.m.sym("HKBUSY")), 0);
  });
}
for (const [name, opts, mode] of [["GLCD", { matrix: true, glcd: true, nmi: true }, 3], ["PICO", { matrix: true, tms: true, nmi: true }, 1]]) {
  test("RIG4/5 " + (name + " notice with synthetic RETN NMI and hook allowance"), () => {
    const r = fixture(opts);
    assert.equal(r.m.read(r.m.sym("CONMOD")), mode);
    r.seed(0, r.base, 73);
    r.failed.add(r.base);
    const mark = r.m.output.length;
    assert.equal(r.api(12).a, 34);
    assert.match(r.m.text(mark), /Write pending/);
    r.failed.clear();
    assert.equal(r.api(12).a, 34);
    assert.match(r.m.text(mark), /Cache clear/);
    assert.ok(r.stats.nmiEntries > 0);
    assert.ok((r.stack.deepest + 12) * 4 <= 56 * 3, "sampled NMI depth plus existing BIOS-hook allowance");
  });
}
for (const pending of [false, true]) {
  test("RIG4/5 " + ("direct BIOS outer trampoline preserves inputs and result " + (pending ? "with work" : "empty")), () => {
    const r = fixture();
    if (pending) r.seed(4, r.base, 44);
    const c = r.m.cpu.cpu, regs = { a: 159, b: 0, c: 3, d: 97, e: 114, h: 35, l: 69, ix: 4951, iy: 9320 };
    Object.assign(c, regs);
    c.flags = { S: 1, Z: 0, Y: 1, H: 1, X: 0, P: 1, N: 0, C: 1 };
    const flags = { ...c.flags };
    r.call(r.m.sym("RAMBIOS") + 30);
    assert.deepEqual(Object.fromEntries(Object.keys(regs).map((n) => [n, c[n]])), regs);
    assert.deepEqual(c.flags, flags);
    assert.equal(word(r.m, r.m.sym("DSKTRK")), 3);
    assert.equal(r.queue().length, 0);
    assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
    assert.equal(r.stats.workerEntries, pending ? 1 : 0);
  });
}
test("RIG4/5 nested BIOS tail path preserves RAM BIOS hook call-through", () => {
  const r = fixture();
  for (let i = 0; i < 3; i++) r.seed(i, r.base + i, 40 + i);
  const target = r.m.sym("HKBI4"), vector = r.m.sym("RAMBIOS") + 12, counter = 8448;
  [245, 229, 33, counter & 255, counter >> 8, 52, 225, 241, 195, target & 255, target >> 8].forEach((b, i) => r.m.write(8192 + i, b));
  [195, 0, 32].forEach((b, i) => r.m.write(vector + i, b));
  r.m.write(counter, 0);
  const mark = r.m.output.length;
  r.call(5, { c: 2, d: 0, e: 88 });
  assert.match(r.m.text(mark), /X/);
  assert.equal(r.m.read(counter), 1);
  assert.equal(r.stats.maxDepth, 1);
  assert.equal(r.stats.workerEntries, 2);
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  assert.equal(r.queue().length, 1);
});
test("RIG4/5 failed head retries under one-for-one arrivals and recovers", () => {
  const r = fixture();
  r.seed(0, r.base, 77);
  r.seed(1, r.base + 1, 88);
  r.failed.add(r.base);
  let calls = 0;
  const retryAt = [];
  let seen = 0;
  for (let n = 2; n < 66; n++) {
    const clean = Array.from({ length: 30 }, (_, i) => i).find((i) => !r.queue().includes(i));
    assert.notEqual(clean, void 0);
    r.seed(clean, r.base + n, n);
    r.api();
    calls++;
    for (const b of r.attempts.slice(seen)) if (b === r.base) retryAt.push(calls);
    seen = r.attempts.length;
    assert.equal(r.queue()[0], 0);
    assert.equal(r.m.expand[1][r.m.sym("CDIRTY") - 32768], 1);
  }
  assert.ok(retryAt.length > 3);
  assert.ok(retryAt.slice(1).every((n, i) => n - retryAt[i] <= 30));
  for (let n = 0; n < 30 && r.queue().length > 1; n++) r.api();
  assert.deepEqual(r.queue(), [0]);
  assert.ok(r.bytes(r.base).some((b) => b !== 77), "failed data not committed");
  assert.ok(r.m.expand[1].slice(0, 512).every((b) => b === 77));
  r.failed.clear();
  r.api();
  assert.equal(r.queue().length, 0);
  assert.ok(r.bytes(r.base).every((b) => b === 77));
});
test("RIG4/5 required input flush is one bounded pass despite a refused head", () => {
  const r = fixture();
  for (const [i, line] of [5, 2, 17].entries()) r.seed(line, r.base + i, 60 + i);
  r.failed.add(r.base);
  r.m.write(r.m.sym("CANY"), 1);
  const mark = r.m.output.length, result = r.call(r.m.sym("CKEY"), { d: 97, e: 114 });
  assert.deepEqual(r.attempts, [r.base, r.base + 1, r.base + 2], "one required CKEY pass attempts each entry once");
  assert.equal(result.a, 1);
  assert.equal(result.flags.Z, 0);
  assert.deepEqual([r.m.cpu.cpu.d, r.m.cpu.cpu.e], [97, 114]);
  assert.deepEqual(r.queue(), [5]);
  assert.equal(r.m.text(mark).match(/Write pending/g)?.length, 1);
});
for (const coalesced of [false, true]) {
  test("RIG4/5 " + ("root BIOS CONIN preserves published bound " + (coalesced ? "coalesced" : "logged dirty")), () => {
    const r = fixture();
    const n = coalesced ? 1 : 3;
    for (let i = 0; i < n; i++) r.seed(i, r.base + i, 70 + i);
    r.failed.add(r.base);
    r.m.write(r.m.sym("CANY"), coalesced ? 0 : 1);
    r.m.write(r.m.sym("CPEND"), coalesced ? 1 : 0);
    r.m.enqueueInput("x");
    const result = r.call(r.m.sym("RAMBIOS") + 9);
    assert.equal(result.a, 120);
    assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
    assert.equal(r.queue().length, 1);
    const belowReturn = r.stack.callerDeepest - 2;
    assert.ok(belowReturn <= 20, "published root BIOS CONIN caller stack bound");
    assert.equal(word(r.m, r.m.sym("APIRTPC")), 12291);
  });
}
for (const [name, fn, bound] of [["INFO", 0, 6], ["JOY", 5, 4], ["FONT", 15, 4]]) {
  test("RIG4/5 " + ("root " + name + " hardware preserves published small stack bound"), () => {
    const r = fixture(), result = r.call(r.m.sym("ABICALL"), { c: fn });
    assert.equal(result.a, 0);
    assert.equal(result.flags.C, 0);
    const belowReturn = r.stack.callerDeepest - 2;
    assert.ok(belowReturn <= bound, "published " + name + " stack bound");
    assert.equal(word(r.m, r.m.sym("APIRTPC")), 12291);
    assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  });
}
for (const [name, opts] of [["GLCD", { matrix: true, glcd: true }], ["PICO", { matrix: true, tms: true }]]) {
  test("RIG4/5 " + ("root " + name + " PUTAT preserves published stack bound and pixels"), () => {
    const r = fixture(opts);
    [...Buffer.from("HELLO")].forEach((v, i) => r.m.write(8192 + i, v));
    const result = r.call(r.m.sym("ABICALL"), { c: 7, b: 5, d: 0, e: 0, h: 32, l: 0 });
    assert.equal(result.a, 0);
    assert.equal(result.flags.C, 0);
    const belowReturn = r.stack.callerDeepest - 2;
    assert.ok(belowReturn <= 22, "published PUTAT stack bound");
    assert.ok((name === "GLCD" ? r.m.glcdScreen() : r.m.screen())[0].startsWith("HELLO"));
    assert.equal(word(r.m, r.m.sym("APIRTPC")), 12291);
    assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  });
}
test("RIG4/5 root hardware selection retains return ownership through nested BDOS", () => {
  const r = fixture();
  for (let i = 0; i < 3; i++) r.seed(i, r.base + i, 40 + i);
  const games = findVolume(parseContainer(r.image), "GAMES");
  const result = r.call(r.m.sym("ABICALL"), { c: 9, b: 3, d: 0, e: games.index });
  assert.equal(result.a, 0);
  assert.equal(result.flags.C, 0);
  assert.equal(r.m.read(r.m.sym("DRVIDX") + 3), games.index + 1);
  assert.equal(r.m.read(4) & 15, 0);
  assert.equal(r.queue().length, 0);
  assert.equal(r.stats.workerEntries, 1);
  assert.equal(r.stats.maxDepth, 2);
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  assert.equal(word(r.m, r.m.sym("APIRTPC")), 12291);
  assert.deepEqual(r.attempts, [r.base, r.base + 1, r.base + 2]);
});
