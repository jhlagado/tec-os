// Thirty complete card blocks cache reads and acknowledged writes. Outer
// API entry attempts pending work; required boundaries drain bounded rounds.
// These tests cover known bytes, metadata publication, failed-write retention,
// card recovery, caller ownership and isolated historical comparisons.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContainer, headerChecksum, parseContainer } from "../tools/lib/container.mjs";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, boot, program, romFor, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { rig } from "./lib/warmboot.mjs";
import { finishBarePrompt, publicContext, recoveryInput } from "./lib/public-caller.mjs";
import { MUTANTS } from "./lib/coalesce.mjs";
import { cacheState, fileBlock, retainedBlocks } from "./lib/cache-pending.mjs";
import { at, shellCard, shellMachine } from "./lib/shell.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const pattern = (n, f) => Uint8Array.from({ length: n }, (_, i) => f(i) & 0xff);
const DATA = pattern(6000, (i) => i * 7 + 1);

/** A ROM kept as a fixture: { rom, symbols }. */
function oldRom(commit) {
  const f = JSON.parse(readFileSync(resolve(ROOT, `test/fixtures/rom-${commit}.json`), "utf8"));
  return { rom: Buffer.from(f.rom, "base64"), symbols: new Map(Object.entries(f.symbols).map(([k, v]) => [k.toUpperCase(), v])) };
}

/** Retire only explicitly verified event objects; preserve foreign errors and order. */
function retireWrites(collector, verified) {
  const own = new Set(verified);
  for (let i = collector.length - 1; i >= 0; i--) if (own.has(collector[i])) collector.splice(i, 1);
}

const CACHED_MIRROR = Object.freeze({ fixture: "f49e380", romSHA256: "d9f8d2b554e39833139c2912af48ee40e75305be65236590aebf105f175a7a03", mapSHA256: "8da862b2b90499ba422724cf8e8c5d11795ad623abde24682d9f336ceee268e2", phases: Object.freeze(["boot", "WBTEST"]) });
const PRECACHE_MIRROR = Object.freeze({ fixture: "4ea57f7", romSHA256: "ba898ef83ab625d705f93895e5a1c9fa55bdb25d17d957b746050387ad57d902", mapSHA256: "1d22c573888539564ff1f5b30a9ca45f5a67142f23c9419bd93a362dceb1e546", phases: Object.freeze(["boot"]) });

/** Verify every intended mirror before retiring only its original event identities. */
function verifyLegacyMirrors(m, selected, observation, definition) {
  assert.ok(definition === CACHED_MIRROR || definition === PRECACHE_MIRROR);
  assert.equal(observation.actualRomSHA256, definition.romSHA256);
  assert.equal(observation.actualSymbolSHA256, definition.mapSHA256);
  const reference = oldRom(definition.fixture), warmPC = reference.symbols.get("WBOOTR"), vector = reference.symbols.get("BIOWBT");
  assert.deepEqual(Uint8Array.from(selected.rom), Uint8Array.from(reference.rom));
  const entries = [...reference.symbols].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  assert.equal(observation.actualSymbolSHA256, createHash("sha256").update(JSON.stringify(entries)).digest("hex"));
  const prefix = [0xf3, 0x3e, 5, 0xd3, 255, 0x3e, 0xc3, 0x32, vector & 255, vector >> 8, 0x21, warmPC & 255, warmPC >> 8, 0x22, (vector + 1) & 255, (vector + 1) >> 8, 0x3e, 1, 0x32, 64, 0, 0xd3, 255];
  assert.deepEqual(Array.from(reference.rom.slice(warmPC - 0xc000, warmPC - 0xc000 + prefix.length)), prefix);
  assert.deepEqual(observation.warm.map(w => w.phase), definition.phases);
  const offsets = [0, 1, 3, 5, 7, 10, 13, 16, 18, 21], lengths = [1, 2, 2, 2, 3, 3, 3, 2, 3, 2];
  for (const warm of observation.warm) {
    assert.equal(warm.entryPC, warmPC); assert.equal(warm.steps.length, 24);
    for (let i = 0; i < offsets.length; i++) {
      const step = warm.steps[i], before = i <= 2 ? 1 : 5, after = i < 2 || i === 9 ? 1 : 5;
      assert.equal(step.pc, warmPC + offsets[i]); assert.equal(step.nextPC, step.pc + lengths[i]);
      assert.deepEqual(step.opcode, Array.from(reference.rom.slice(step.pc - 0xc000, step.pc - 0xc000 + 3)));
      assert.deepEqual([step.sysCtrl, step.afterSysCtrl, step.latch, step.afterLatch], [before, after, 1, 1]);
      assert.deepEqual([step.physicalBank, step.afterPhysicalBank, step.classic, step.afterClassic, step.expansionView], [before === 1 ? -1 : 0, after === 1 ? -1 : 0, before === 1, after === 1, before === 5]);
    }
  }
  const expectedCount = definition.phases.length * 3;
  assert.equal(observation.writes.length, expectedCount); assert.equal(m.expand1Writes.length, expectedCount);
  for (let i = 0; i < expectedCount; i++) {
    const frame = observation.writes[i], event = m.expand1Writes[i], part = i % 3, warm = Math.floor(i / 3);
    const instruction = warmPC + (part === 0 ? 7 : 13), value = part === 0 ? 0xc3 : part === 1 ? warmPC & 255 : warmPC >> 8;
    assert.deepEqual([frame.phase, frame.warm, frame.instructionPC, frame.pc, frame.address, frame.value], [definition.phases[warm], warm, instruction, instruction + 2, vector + part, value]);
    assert.deepEqual(frame.instructionBytes, Array.from(reference.rom.slice(instruction - 0xc000, instruction - 0xc000 + 3)));
    assert.deepEqual([frame.sysCtrl, frame.latch, frame.physicalBank, frame.classic, frame.expansionView], [5, 1, 0, false, true]);
    assert.deepEqual([frame.windowBefore, frame.expand1Before, frame.windowAfter, frame.expand1After], [warm === 0 ? 0 : value, warm === 0 ? 0 : value, value, value]);
    assert.equal(event.addr, frame.address); assert.equal(event.pc, frame.pc);
  }
  retireWrites(EXPAND1_WRITES, m.expand1Writes);
}

/** Bind passive memory observations before the first step without changing the constructor. */
function observedStart(image, { rom, profile }) {
  const selected = rom ?? romFor();
  const identity = createHash("sha256").update(selected.rom).digest("hex");
  const observation = { profile, romSHA256: identity, writes: [], warm: [] };
  const incoming = [...EXPAND1_WRITES];
  let phase = "boot", m;
  const descriptor = Object.getOwnPropertyDescriptor(Machine.prototype, "step"), originalStep = Machine.prototype.step;
  const attached = new Set();
  Object.defineProperty(Machine.prototype, "step", { configurable: true, writable: true, value: function (...args) {
    assert.ok(!attached.has(this)); attached.add(this);
    const machine = this, rawWrite = machine.cpu.hardware.memWrite;
    const actualROM = Uint8Array.from({ length: selected.rom.length }, (_, i) => machine.read(0xc000 + i));
    assert.deepEqual(actualROM, Uint8Array.from(selected.rom), "attached hardware ROM matches the selected profile");
    observation.actualRomSHA256 = createHash("sha256").update(actualROM).digest("hex");
    const sorted = entries => [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const actualSymbols = sorted(machine.symbols), expectedSymbols = sorted(selected.symbols);
    assert.deepEqual(actualSymbols, expectedSymbols, "the attached runtime map is the selected ROM map");
    observation.actualSymbolSHA256 = createHash("sha256").update(JSON.stringify(actualSymbols)).digest("hex");
    observation.symbols = actualSymbols.length;
    assert.equal(machine.expand, undefined, "this profile uses the default physical bank model");
    assert.equal(machine.banks[0].length, 0x4000);
    let warm = null, executing = null;
    assert.equal(machine.expand1Writes.length, 0, "observer attaches before any guest step");
    machine.cpu.hardware.memWrite = (address, value) => {
      const previous = machine.expand1Writes.length;
      const at = address & 65535, candidate = at >= 0x8000 && at < 0xc000 && (machine.sysCtrl & 4);
      const frame = candidate ? { phase, warm: warm?.index ?? null, pc: machine.pc, address: at, value: value & 255, sysCtrl: machine.sysCtrl, latch: machine.read(machine.sym("LATCHV")), classic: machine.classicBankIn, physicalBank: machine.physicalBank, expansionView: machine.tec1g.state.system.expandEnabled, windowBefore: machine.read(at), expand1Before: machine.banks[0][at - 0x8000], callbackBytes: [0, 1, 2].map(i => machine.read(machine.pc + i)), instructionPC: executing?.pc ?? null, instructionBytes: executing?.opcode ?? null } : null;
      rawWrite(address, value);
      for (const event of machine.expand1Writes.slice(previous)) {
        assert.ok(frame); assert.equal(event.addr, frame.address); assert.equal(event.pc, frame.pc);
        frame.windowAfter = machine.read(at); frame.expand1After = machine.banks[0][at - 0x8000];
        observation.writes.push(frame);
      }
    };
    machine.step = (...inner) => {
      if (machine.pc === machine.sym("WBOOTR")) {
        warm = { index: observation.warm.length, phase, entryPC: machine.pc, steps: [] };
        observation.warm.push(warm);
      }
      const frame = warm ? { pc: machine.pc, sp: machine.cpu.cpu.sp, a: machine.cpu.cpu.a, sysCtrl: machine.sysCtrl, latch: machine.read(machine.sym("LATCHV")), physicalBank: machine.physicalBank, classic: machine.classicBankIn, expansionView: machine.tec1g.state.system.expandEnabled, opcode: [0, 1, 2].map(i => machine.read(machine.pc + i)) } : null;
      executing = frame;
      let result;
      try { result = originalStep.apply(machine, inner); } finally { executing = null; }
      if (frame) {
        frame.nextPC = machine.pc; frame.afterSysCtrl = machine.sysCtrl; frame.afterLatch = machine.read(machine.sym("LATCHV")); frame.afterPhysicalBank = machine.physicalBank; frame.afterClassic = machine.classicBankIn;
        warm.steps.push(frame); if (warm.steps.length === 24) warm = null;
      }
      return result;
    };
    return machine.step(...args);
  } });
  try { m = start(image, { rom }); }
  finally { if (descriptor) Object.defineProperty(Machine.prototype, "step", descriptor); else delete Machine.prototype.step; }
  assert.equal(attached.size, 1); assert.ok(attached.has(m));
  const command = line => { phase = line; return cmd(m, line); };
  return { m, selected, observation, incoming, command };
}

// The cards whose machines start() logs on B:, so that WORK is written behind.
const ON_B = new WeakSet();
const loggedOnB = (image) => (ON_B.add(image), image);

/** SYSTEM on A: and WORK on B:; start() logs its machine on B: when wb, so that WORK is written behind. */
const card = (wb = true) => {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
  ]);
  return wb ? loggedOnB(image) : image;
};

/** Type D: at M's prompt and run to the next prompt. */
function logOn(m, d) {
  m.mark = m.output.length;
  m.type(`${d}:\r`);
  m.runUntil(() => m.ready() && new RegExp(`\\r\\n${d}(:\\S*)?>$`).test(m.text(m.mark)), 400_000_000, `${d}:`);
}

async function load(image, names, extra = {}) {
  const a = volume(image, "A");
  for (const n of names) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  for (const [n, data] of Object.entries(extra)) a.write(n, data);
  return image;
}

/** A machine on IMAGE (with ROM if given), at its first prompt: logged on B: if the card asks it. */
function start(image, { rom, ram96 = false, onSdWrite } = {}) {
  let m;
  if (!rom && !onSdWrite) m = boot(image, { ram96 });
  else {
    const r = rom ?? romFor();
    m = new Machine({ ...r, sdImage: image, clock: TEST_CLOCK, ram96, onSdWrite });
    m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
    m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  }
  if (ON_B.has(image)) logOn(m, "B");
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

const cmd = (m, line) => m.command(line, { prompt: /\r\n[A-P](:\S*)?>$/, maxCycles: 2_000_000_000 });
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

test("real commands preserve historical block order without increasing write traffic", async () => {
  const run = async (rom) => {
    const image = await load(standardCard(), ["wbtest", "sum"], { "DATA.BIN": DATA });
    // COPY is the shell's, where the old ROM's was the CCP's. Both cards hold the
    // shell's files, so that their blocks lie where they do for each ROM.
    withShell(image);
    const sourceData = Uint8Array.from(volume(image, "A").read("DATA.BIN"));
    const expectedData = new Uint8Array(Math.ceil(DATA.length / 128) * 128); expectedData.set(DATA);
    assert.deepEqual(sourceData, expectedData, "complete prepared source including record padding");
    const { m, selected, observation, incoming, command } = observedStart(image, { rom, profile: rom ? "f49e380 fixture" : "current" });
    const profile = observation.profile;
    const t = trace(m);
    const snapshot = length => Uint8Array.from({ length }, (_, i) => m.read(0x100 + i));
    const x = snapshot(8 * 256);
    command("SAVE 8 X.COM"); assert.deepEqual(volume(image, "A").read("X.COM"), x);
    command("COPY DATA.BIN B:DATA.CPY");
    assert.deepEqual(volume(image, "A").read("DATA.BIN"), sourceData, "COPY leaves the independent source unchanged");
    assert.deepEqual(volume(image, "B").read("DATA.CPY"), sourceData);
    assert.match(command("WBTEST"), /WB OK/);
    const seq = volume(image, "B").read("SEQ.DAT"), rnd = volume(image, "B").read("RND.DAT");
    assert.equal(seq.length, 64 * 128);
    assert.deepEqual(seq, pattern(64 * 128, i => (i >> 7) * 3 + 1));
    assert.equal(rnd.length, 101 * 128);
    for (const record of [0, 40, 100]) assert.deepEqual(rnd.slice(record * 128, (record + 1) * 128), new Uint8Array(128).fill(record ^ 0x5a));
    command("ERA X.COM"); assert.equal(volume(image, "A").find("X.COM"), undefined);
    const y = snapshot(2 * 256);
    command("SAVE 2 B:Y.COM"); assert.deepEqual(volume(image, "B").read("Y.COM"), y);
    assert.deepEqual(volume(image, "A").verify(), []); assert.deepEqual(volume(image, "B").verify(), []);
    assert.deepEqual(volume(image, "A").read("DATA.BIN"), sourceData, "later commands also preserve the source");
    assert.deepEqual(m.violations, []);
    assert.equal(observation.writes.length, m.expand1Writes.length, "all original flagged events remain attributed without deleting any collector entry");
    if (!rom) assert.deepEqual(m.expand1Writes, [], "current firmware has no unexpected expansion writes");
    else verifyLegacyMirrors(m, selected, observation, CACHED_MIRROR);
    assert.equal(EXPAND1_WRITES.length, incoming.length);
    incoming.forEach((event, i) => assert.equal(EXPAND1_WRITES[i], event, "unrelated errors retain their identity and order"));
    console.log(JSON.stringify({ scope: "guarded historical memory disposition", profile, actualRomSHA256: observation.actualRomSHA256, actualSymbolSHA256: observation.actualSymbolSHA256, warmEntries: observation.warm.length, retainedLocalWrites: m.expand1Writes.length, preservedIncomingGlobalWrites: incoming.length }));
    return t;
  };
  const now = await run();
  const before = await run(oldRom("f49e380"));
  assert.ok(now.bwrites.length > 100, `${now.bwrites.length} BIOS WRITEs`);
  // A run of writes to one block, written once by coalescing, is one entry.
  const runs = (list) => list.filter((b, i) => b !== list[i - 1]);
  const times = (list) => list.reduce((n, b) => n.set(b, (n.get(b) ?? 0) + 1), new Map());
  assert.deepEqual(runs(now.writes), runs(before.writes), "the same blocks in the same order as f49e380");
  const was = times(before.writes);
  for (const [b, n] of times(now.writes)) assert.ok(n <= was.get(b), `block ${b}: ${n} writes, ${was.get(b)} at f49e380`);
  console.log(JSON.stringify({ scope: "historical real-command data and traffic", currentWrites: now.writes.length, historicalWrites: before.writes.length, currentBiosWrites: now.bwrites.length, historicalBiosWrites: before.bwrites.length }));
  assert.ok(now.writes.length <= before.writes.length, `${now.writes.length} card writes, ${before.writes.length} at f49e380`);
});

test("logged WORK preserves SAVE, COPY and programme bytes within the measured write budget", async () => {
  const image = withShell(await load(card(), ["wbtest", "sum"], { "DATA.BIN": DATA })); // COPY is the shell's
  const m = start(image);
  const t = trace(m);
  const tpa = pattern(16 * 256, (i) => i * 3 + 7);
  tpa.forEach((v, i) => m.write(0x100 + i, v));
  const w0 = t.writes.length;
  cmd(m, "SAVE 16 B:S.COM");
  const saveWrites = t.writes.length - w0;
  assert.match(cmd(m, "SUM B:S.COM"), new RegExp(sumOf(tpa)));
  cmd(m, "COPY A:DATA.BIN B:DATA.CPY");
  assert.match(cmd(m, "SUM B:DATA.CPY"), new RegExp(sumOf(DATA)));
  assert.match(cmd(m, "WBTEST"), /WB OK/);
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nB(:\S*)?>$/);
  const b = volume(image, "B");
  assert.deepEqual(b.read("S.COM"), tpa, "S.COM on the card");
  assert.deepEqual(b.read("DATA.CPY").slice(0, DATA.length), DATA, "DATA.CPY on the card");
  const seq = b.read("SEQ.DAT");
  assert.equal(seq.length, 64 * 128);
  for (let r = 0; r < 64; r += 1) assert.ok(seq.slice(r * 128, r * 128 + 128).every((v) => v === ((r * 3 + 1) & 0xff)), `SEQ.DAT record ${r}`);
  const rnd = b.read("RND.DAT");
  assert.equal(rnd.length, 101 * 128);
  for (const r of [0, 40, 100]) assert.ok(rnd.slice(r * 128, r * 128 + 128).every((v) => v === (r ^ 0x5a)), `RND.DAT record ${r}`);
  assert.deepEqual(b.verify(), []); assert.deepEqual(volume(image, "A").verify(), []);
  assert.deepEqual(m.violations, []);
  console.log(JSON.stringify({ scope: "logged G8M B SAVE32 records, full file readback and warm persistence", saveWrites, savedBytes: b.read("S.COM").length, copiedBytes: b.read("DATA.CPY").length, sequentialBytes: seq.length, randomBytes: rnd.length }));
  assert.ok(saveWrites <= 34, `${saveWrites} card writes for 32 records, budget 34`);
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

/** Finish a known normal input before this test takes ownership of PC/SP. */
function prepareCaller(m, reason) {
  m.runUntil(() => m.ready(), 400_000_000, `${reason}: ordinary input`);
  const receipt = finishBarePrompt(m);
  (m.cacheCallerTransitions ??= []).push({ reason, ...receipt });
  return receipt;
}

/** Run code from 3000h to its final JR $ on a returned public caller. */
function stub(m, code) {
  publicContext(m);
  [...code, 0x18, 0xfe].forEach((v, i) => m.write(0x3000 + i, v));
  m.cpu.cpu.sp = 0x3000;
  m.cpu.cpu.pc = 0x3000;
  m.runUntil(() => m.pc === 0x3000 + code.length, 400_000_000, "the stub");
  assert.equal(m.cpu.cpu.sp, 0x3000, "the synthetic caller regains its original stack");
  publicContext(m);
}
/** BDOS function FN with DE from a stub. */
const bdos = (m, fn, de) => stub(m, [0x0e, fn, 0x11, de & 0xff, de >> 8, 0xcd, 0x05, 0x00]);

/** B:Q.DAT made and four records written, not closed: dirty lines. */
function dirty(m) {
  [2, ...Buffer.from("Q       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 22, 0x5c);
  assert.notEqual(m.cpu.cpu.a, 0xff, "make acknowledged");
  for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, 0xc3);
  bdos(m, 26, 0x2000);
  for (let r = 0; r < 4; r += 1) {
    bdos(m, 21, 0x5c);
    assert.equal(m.cpu.cpu.a, 0, `record ${r} acknowledged`);
    assert.equal(m.read(0x5c + 32), r + 1);
  }
}

/** Healthy entries committed earlier versions; only the latest update remains. */
function latestBlock(m, image) {
  dirty(m);
  const block = fileBlock(m, image, 3), payload = new Uint8Array(512).fill(0xc3);
  const state = cacheState(m);
  assert.equal(state.entries.length, 1); assert.equal(state.entries[0].block, block);
  assert.equal(state.entries[0].dirty, 1); assert.deepEqual(state.entries[0].payload, payload);
  assert.deepEqual([state.pending, state.any, state.depth, state.busy], [0, 1, 0, 0]);
  const previous = new Uint8Array(512); previous.fill(0xc3, 0, 384);
  assert.deepEqual(image.slice(block * 512, (block + 1) * 512), previous, "three earlier versions progressed, final record still pending");
  const expectedImage = Uint8Array.from(image); expectedImage.set(payload, block * 512);
  return { block, payload, expectedImage, state };
}

/** Warm boot is a nonreturning operation; stop at normal counted input. */
function normalWarm(m) {
  const mark = m.output.length; m.cpu.cpu.pc = 0;
  const ownedInput = () => {
    if (!m.classicBankIn || !m.ready() || m.read(m.sym("ERRMODE")) !== 0 || m.read(m.sym("HKDEP")) !== 1 || m.read(m.sym("HKBUSY"))) return false;
    const saved = word(m, m.sym("OLDSP")), back = word(m, saved);
    return saved === m.sym("CSTKTOP") - 2 && m.lineBuf === m.sym("CMDBUF") &&
      [0x0e, 10, 0xcd, 5, 0].every((v, i) => m.read(back - 5 + i) === v);
  };
  m.runUntil(() => ownedInput() && /\r\n[A-P](:\S*)?>$/.test(m.text(mark)), 400_000_000, "actual ordinary counted input after warm boot");
  assert.ok(ownedInput());
  return m.text(mark);
}

const durable = state => ({ queue: state.queue, entries: state.entries, dirty: state.dirty });


/** Read-only ordinary counted-input ownership, including its actual call site. */
function ordinaryInput(m) {
  if (!m.classicBankIn || !m.ready() || m.read(m.sym("ERRMODE")) !== 0 || m.read(m.sym("HKDEP")) !== 1 || m.read(m.sym("HKBUSY"))) return false;
  const saved = word(m, m.sym("OLDSP")), back = word(m, saved);
  return saved === m.sym("CSTKTOP") - 2 && m.lineBuf === m.sym("CMDBUF") &&
    [0x0e, 10, 0xcd, 5, 0].every((v, i) => m.read(back - 5 + i) === v);
}

function lifecycleWarm(m) {
  const mark = m.output.length; m.cpu.cpu.pc = 0;
  m.runUntil(() => recoveryInput(m) || (ordinaryInput(m) && /\r\n[A-P](:\S*)?>$/.test(m.text(mark))), 400_000_000, "actual normal or bootstrap owner after card lifecycle warm");
  return { outcome: recoveryInput(m) ? "recovery" : "normal", text: m.text(mark) };
}

/** Observe attempted ROM dispatches without changing card or guest state. */
function lifecycleTrace(m) {
  const events = { initializations: 0, writes: 0 };
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("SDINIT")) events.initializations++;
    if (m.pc === m.sym("SDWRITE")) events.writes++;
    return step();
  };
  return events;
}

test("a removed card retains acknowledged pending data while the normal console remains usable", async () => {
  const image = card(), m = start(image);
  prepareCaller(m, "removed-card caller");
  const pending = latestBlock(m, image), before = Uint8Array.from(image), events = lifecycleTrace(m);
  m.swapCard(null);
  const warm = lifecycleWarm(m);
  assert.equal(warm.outcome, "normal");
  assert.equal(warm.text.match(/Write pending/g)?.length, 1); assert.doesNotMatch(warm.text, /Write lost/);
  assert.deepEqual(durable(cacheState(m)), durable(pending.state)); assert.deepEqual(image, before);
  assert.equal(events.initializations, 0); assert.ok(events.writes > 0);
  const attempted = events.writes, out = cmd(m, "USER 0");
  m.runUntil(() => ordinaryInput(m), 400_000_000, "USER returns to actual ordinary input without a card");
  assert.match(out, /\r\n[A-P](:\S*)?>$/); assert.doesNotMatch(out, /Write pending|Write lost/);
  assert.ok(events.writes > attempted, "normal API activity retries the retained write");
  assert.equal(events.initializations, 0); assert.equal(m.sd, null);
  assert.deepEqual(durable(cacheState(m)), durable(pending.state)); assert.deepEqual(image, before);
  assert.deepEqual(m.violations, []);
});

test("same or different reinserted cards remain uninitialized until explicit cold reset", async () => {
  for (const which of ["same", "different"]) {
    const image = card(), m = start(image);
    prepareCaller(m, `${which}: reinsert caller`);
    const pending = latestBlock(m, image), oldCard = Uint8Array.from(image), events = lifecycleTrace(m);
    m.swapCard(null);
    const removed = lifecycleWarm(m);
    assert.equal(removed.outcome, "normal"); assert.equal(removed.text.match(/Write pending/g)?.length, 1);
    assert.deepEqual(durable(cacheState(m)), durable(pending.state)); assert.deepEqual(image, oldCard);
    const inserted = which === "same" ? image : card();
    if (which === "different") volume(inserted, "B").write("OTHER.DAT", new Uint8Array(512).fill(0x6e));
    const insertedBefore = Uint8Array.from(inserted), commits = [];
    m.swapCard(inserted, { onSdWrite: card => commits.push(createHash("sha256").update(card).digest("hex")) });
    assert.equal(m.sd.ready, false, "a new controller is not initialized by insertion");
    const attempted = events.writes, reinserted = lifecycleWarm(m);
    assert.equal(reinserted.outcome, "normal"); assert.doesNotMatch(reinserted.text, /Write pending|Write lost/);
    assert.ok(events.writes > attempted); assert.equal(events.initializations, 0); assert.equal(m.sd.ready, false);
    assert.deepEqual(commits, []); assert.deepEqual(inserted, insertedBefore); assert.deepEqual(image, oldCard);
    assert.deepEqual(durable(cacheState(m)), durable(pending.state));
    const beforeEmpty = events.writes, out = cmd(m, "");
    m.runUntil(() => ordinaryInput(m), 400_000_000, "explicit empty command returns to actual normal input");
    assert.doesNotMatch(out, /Write pending|Write lost/); assert.ok(events.writes > beforeEmpty);
    assert.equal(events.initializations, 0); assert.equal(m.sd.ready, false); assert.deepEqual(commits, []);
    assert.deepEqual(durable(cacheState(m)), durable(pending.state)); assert.deepEqual(inserted, insertedBefore);
    const mark = m.output.length; m.reset();
    m.runUntil(() => ordinaryInput(m) && /\r\nA(:\S*)?>$/.test(m.text(mark)), 200_000_000, "explicit cold reset initializes the inserted card and reaches actual A input");
    assert.equal(events.initializations, 1); assert.equal(m.sd.ready, true); assert.deepEqual(commits, []);
    const after = cacheState(m); assert.equal(after.queue.length, 0); assert.ok(after.dirty.every(v => !v));
    assert.deepEqual([after.pending, after.any, after.busy], [0, 0, 0]);
    assert.deepEqual(inserted, insertedBefore, "cold reset never replays the old pending block to the inserted card");
    assert.deepEqual(image, oldCard, "earlier physical versions remain, only the final uncommitted record is lost");
    assert.notDeepEqual(image.slice(pending.block * 512, (pending.block + 1) * 512), pending.payload);
    assert.equal(volume(image, "B").read("Q.DAT").length, 0, "unclosed record count was never published");
    if (which === "different") assert.deepEqual(volume(inserted, "B").read("OTHER.DAT"), new Uint8Array(512).fill(0x6e));
    console.log(JSON.stringify({ scope: "card reinsert and explicit cold reset", which, initializations: events.initializations, writeAttempts: events.writes, acceptedWrites: commits.length, physicalBlock: pending.block, beforeCold: reinserted.outcome, queueAfterCold: after.queue.length }));
    assert.deepEqual(m.violations, []);
  }
});

test("the ROM before the cache, 4ea57f7, mounts a :wb volume written through", async () => {
  // WORK marked :wb in byte 15, as cards were made before the mark was
  // retired; this ROM is not logged on B:.
  const image = card(false);
  image[32 + 32 + 15] = 1;
  const sum = headerChecksum(image.subarray(0, 512));
  [image[20], image[21]] = [sum & 0xff, sum >> 8];
  const { m, selected, observation, incoming, command } = observedStart(image, { rom: oldRom("4ea57f7"), profile: "4ea57f7 fixture" });
  const t = trace(m);
  const tpa = pattern(4 * 256, (i) => i ^ 0x3c);
  tpa.forEach((v, i) => m.write(0x100 + i, v));
  command("SAVE 4 B:X.COM");
  assert.ok(t.writes.length >= 8, `${t.writes.length} card writes: one for each of 8 records`);
  assert.deepEqual(volume(image, "B").read("X.COM"), tpa, "on the card before any warm boot");
  assert.deepEqual(m.violations, []);
  assert.equal(observation.writes.length, m.expand1Writes.length);
  verifyLegacyMirrors(m, selected, observation, PRECACHE_MIRROR);
  assert.equal(EXPAND1_WRITES.length, incoming.length);
  incoming.forEach((event, i) => assert.equal(EXPAND1_WRITES[i], event));
  console.log(JSON.stringify({ scope: "passive pre-cache historical memory attribution", ...observation, originalFlaggedEvents: m.expand1Writes, remainingGlobalEvents: EXPAND1_WRITES.length }));
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

/** SYSTEM on A:, WORK on B:, and ARCHIVE, index 2, on no drive; C: has a slot. start() logs on B: when wb. */
const card3 = (wb = true) => {
  const image = createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
      { geometry: "G8M", label: "ARCHIVE", mount: "-" },
    ],
    { drives: 3 },
  );
  return wb ? loggedOnB(image) : image;
};

test("failed data publication retains the block through warm boot and refuses drive reassignment until recovery", async () => {
  const image = card3(); let cuts = 0;
  const problems = [], fill = { "F1.DAT": 0xa1, "F2.DAT": 0xb2 };
  const check = img => {
    cuts++;
    const b = volume(img, "WORK");
    problems.push(...b.verify().map(p => `cut ${cuts}: ${p}`));
    for (const f of b.list()) if (fill[f.name] !== undefined && !b.read(f.name).every(v => v === fill[f.name])) problems.push(`cut ${cuts}: ${f.name} names data not yet durable`);
  };
  const m = start(image, { onSdWrite: check }), fillTpa = value => {
    for (let i = 0; i < 12 * 256; i++) m.write(0x100 + i, value);
  };
  fillTpa(0xa1); cmd(m, "SAVE 12 B:F1.DAT");
  const fs = volume(image, "WORK"), descriptor = parseContainer(image).volumes[1];
  assert.deepEqual(fs.read("F1.DAT"), new Uint8Array(12 * 256).fill(0xa1));
  const allocation = fs.find("F1.DAT").entries[0].slots[0][1];
  const expectedFirst = descriptor.start + allocation * fs.blockBytes / 512;
  cmd(m, "ERA B:F1.DAT"); assert.equal(fs.find("F1.DAT"), undefined);
  let bad = null, blocked = true, refusals = 0;
  failing(m, (block, payload) => {
    if (bad === null && payload.every(v => v === 0xb2)) bad = block;
    if (blocked && block === bad) { refusals++; return "fail"; }
  });
  fillTpa(0xb2); const mark = m.output.length;
  m.type("SAVE 12 B:F2.DAT\r");
  const errorOwner = () => m.classicBankIn && m.waitingForInput() && m.read(m.sym("ERRMODE")) === 0 && m.read(m.sym("HKDEP")) === 1 && !m.read(m.sym("HKBUSY")) && word(m, m.cpu.cpu.sp) === m.sym("BDDEF") + 6;
  m.runUntil(() => errorOwner() && /Bad Sector/.test(m.text(mark)), 2_000_000_000, "actual default BDOS error key after refused close");
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => m.read(m.sym("BDDEF") + 3 + i)), [0xcd, m.sym("GETCHAR") & 255, m.sym("GETCHAR") >> 8]);
  assert.equal(bad, expectedFirst); assert.ok(refusals > 0);
  const beforeWarm = cacheState(m), beforeCard = Uint8Array.from(image), payload = new Uint8Array(512).fill(0xb2);
  assert.equal(beforeWarm.entries.length, 1); assert.equal(beforeWarm.entries[0].block, bad);
  assert.equal(beforeWarm.entries[0].dirty, 1); assert.deepEqual(beforeWarm.entries[0].payload, payload);
  assert.notDeepEqual(image.slice(bad * 512, (bad + 1) * 512), payload);
  assert.equal(fs.find("F2.DAT").records, 0, "failed close published no record count");
  // Deliberately acknowledge the observed default-error key; no retry loop.
  m.type("\x03");
  m.runUntil(() => ordinaryInput(m) && /\r\nB(:\S*)?>$/.test(m.text(mark)), 400_000_000, "error abort reaches actual normal input after warm boot");
  const out = m.text(mark);
  assert.match(out, /Bad Sector/); assert.equal(out.match(/Write pending/g)?.length, 1); assert.doesNotMatch(out, /Write lost/);
  assert.deepEqual(durable(cacheState(m)), durable(beforeWarm)); assert.deepEqual(image, beforeCard);
  prepareCaller(m, "failed close captured before explicit input completion");
  assert.deepEqual(durable(cacheState(m)), durable(beforeWarm)); assert.deepEqual(image, beforeCard);
  const mapping = Array.from({ length: 3 }, (_, i) => m.read(m.sym("DRVIDX") + i));
  assert.equal(mapping[1], 2);
  const mount = index => {
    const at = m.sym("ABICALL"); stub(m, [0x06, 1, 0x0e, 9, 0x1e, index, 0xcd, at & 255, at >> 8]);
    return { a: m.cpu.cpu.a, carry: m.cpu.cpu.flags.C };
  };
  const refusedBefore = refusals;
  assert.deepEqual(mount(2), { a: 1, carry: 1 }, "archive assignment refuses an incomplete flush");
  assert.ok(refusals > refusedBefore);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => m.read(m.sym("DRVIDX") + i)), mapping);
  assert.deepEqual(durable(cacheState(m)), durable(beforeWarm)); assert.deepEqual(image, beforeCard);
  blocked = false; const beforeRecovery = cuts;
  assert.deepEqual(mount(2), { a: 0, carry: 0 }); assert.equal(m.read(m.sym("DRVIDX") + 1), 3);
  assert.equal(cuts - beforeRecovery, 1, "the retained complete block is the only recovered card write");
  const expectedImage = Uint8Array.from(beforeCard); expectedImage.set(payload, bad * 512);
  assert.deepEqual(image, expectedImage); assert.equal(cacheState(m).queue.length, 0);
  assert.deepEqual(mount(1), { a: 0, carry: 0 }); assert.equal(m.read(m.sym("DRVIDX") + 1), 2);
  assert.deepEqual(image, expectedImage); assert.equal(fs.find("F2.DAT").records, 0, "recovered raw data does not finish an aborted close");
  assert.deepEqual(problems, []); assert.deepEqual(m.violations, []);
  console.log(JSON.stringify({ scope: "failed publication and drive assignment", block: bad, refusedAttempts: refusals, acceptedCuts: cuts, recoveryCuts: cuts - beforeRecovery, retainedBeforeWarm: beforeWarm.entries.length, publishedRecords: fs.find("F2.DAT").records, finalBIndex: m.read(m.sym("DRVIDX") + 1) }));
});

/** NPR's run on B:, written behind (logged on B:) or coalesced; G.DAT's records back from the card. */
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
  prepareCaller(m, "SAVE returned before synthetic readback");
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

test("an unclosed file's latest acknowledged block reaches the card at warm boot", async () => {
  const image = card(), m = start(image, { ram96: true });
  prepareCaller(m, "healthy pending warm caller");
  const pending = latestBlock(m, image);
  assert.doesNotMatch(normalWarm(m), /Write pending|Write lost/);
  assert.deepEqual(image, pending.expectedImage, "only the final known data version reaches the card");
  const after = cacheState(m);
  assert.equal(after.queue.length, 0); assert.ok(after.dirty.every(v => !v));
  assert.deepEqual([after.pending, after.any, after.busy], [0, 0, 0]);
  assert.equal(volume(image, "B").read("Q.DAT").length, 0, "physical data persistence does not close an unclosed file");
});

test("MOUNT writes the dirty lines before it changes a drive", async () => {
  const image = card3();
  const m = start(image, { ram96: true });
  prepareCaller(m, "initial synthetic caller");
  dirty(m);
  const table = m.sym("CTAB") - 0x8000;
  const d = m.sym("CDIRTY") - 0x8000;
  const line = Array.from({ length: 30 }, (_, i) => i).find((i) => m.expand[1][d + i]);
  const lba = [0, 1, 2, 3].reduce((a, k) => a + m.expand[1][table + 4 * line + k] * 256 ** k, 0);
  stub(m, [0x06, 1, 0x0e, 9, 0x1e, 2, 0xcd, m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8]); // TNMOUNT B: with index 2, ARCHIVE
  assert.equal(m.cpu.cpu.a, 0, "mounted");
  assert.ok(image.slice(lba * 512, lba * 512 + 512).every((v) => v === 0xc3), "Q.DAT's records on the card before the drive changed");
});

test("a failed raw type1 write rereads the card, while a refused type0 flush retains a genuine dirty cache hit", async () => {
  const image = card(false), m = start(image);
  prepareCaller(m, "raw BIOS caller");
  const t = trace(m), base = word(m, 1) - 3;
  const biosCode = (n, bc) => [0x01, bc & 255, bc >> 8, 0xcd, (base + 3 * n) & 255, (base + 3 * n) >> 8];
  const at = [...biosCode(9, 1), ...biosCode(10, 6), ...biosCode(11, 2), ...biosCode(12, 0x2000)];
  const read = () => {
    for (let i = 0; i < 128; i++) m.write(0x2000 + i, 0);
    stub(m, [...at, ...biosCode(13, 0)]); assert.equal(m.cpu.cpu.a, 0);
    return Uint8Array.from({ length: 128 }, (_, i) => m.read(0x2000 + i));
  };
  const descriptor = parseContainer(image).volumes[1], block = descriptor.start + 6 * 16;
  const original = image.slice(block * 512, (block + 1) * 512), initialImage = Uint8Array.from(image);
  assert.deepEqual(read(), original.slice(256, 384));
  const written77 = original.slice(); written77.fill(0x77, 256, 384);
  const written88 = original.slice(); written88.fill(0x88, 256, 384);
  const attempts = [], sd = m.sd, commit = sd.commitWrite.bind(sd);
  let mode = "commit-error";
  sd.commitWrite = () => {
    const { start, buffer } = sd.writeState, payload = Uint8Array.from(buffer);
    assert.equal(start / 512, block); assert.deepEqual(payload, mode === "commit-error" ? written77 : written88);
    const event = { block, payload, mode, response: mode === "pass" ? 0x05 : 0x0d };
    attempts.push(event);
    if (mode !== "refuse") { commit(); assert.equal(sd.pendingResponse[0], 0x05); assert.deepEqual(image.slice(start, start + 512), payload); }
    if (mode !== "pass") { sd.writeState = null; sd.pendingResponse = [0x0d, 0xff]; sd.delayBytes = 1; }
  };
  for (let i = 0; i < 128; i++) m.write(0x2000 + i, 0x77);
  stub(m, [...at, ...biosCode(14, 1)]);
  assert.notEqual(m.cpu.cpu.a, 0); assert.equal(attempts.length, 1);
  assert.equal(cacheState(m).queue.length, 0);
  const readsBefore = t.reads;
  mode = "refuse";
  assert.deepEqual(read(), new Uint8Array(128).fill(0x77));
  assert.equal(t.reads, readsBefore + 1, "the reported-error type1 line was invalidated, so reread used SD");
  const card77 = Uint8Array.from(initialImage); card77.set(written77, block * 512);
  assert.deepEqual(image, card77);
  for (let i = 0; i < 128; i++) m.write(0x2000 + i, 0x88);
  stub(m, [...at, ...biosCode(14, 0)]); assert.equal(m.cpu.cpu.a, 0);
  const held = cacheState(m); assert.equal(held.entries.length, 1);
  assert.equal(held.entries[0].block, block); assert.deepEqual(held.entries[0].payload, written88);
  assert.equal(held.pending, held.entries[0].line + 1); assert.equal(held.any, 0);
  bdos(m, 11, 0);
  const beforeHit = t.reads, refusedBeforeHit = attempts.length;
  assert.deepEqual(read(), new Uint8Array(128).fill(0x88));
  assert.equal(t.reads, beforeHit, "dirty cache hit made no SDREAD");
  assert.ok(attempts.length > refusedBeforeHit, "root BIOS opportunities really attempted refused work");
  assert.ok(attempts.slice(1).every(a => a.mode === "refuse" && a.response === 0x0d));
  assert.deepEqual(durable(cacheState(m)), durable(held)); assert.deepEqual(image, card77);
  mode = "pass";
  bdos(m, 48, 0); assert.equal(m.cpu.cpu.a, 0);
  assert.equal(attempts.filter(a => a.response === 0x05).length, 1);
  const card88 = Uint8Array.from(initialImage); card88.set(written88, block * 512);
  assert.deepEqual(image, card88); assert.equal(cacheState(m).queue.length, 0);
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

test("descriptor byte 15 reaches no drive flag", async () => {
  for (const [v, flags] of [[0xfe, 0], [0xff, 0], [1, 0]]) {
    const image = card(false);
    image[32 + 32 + 15] = v;
    const sum = headerChecksum(image.subarray(0, 512));
    [image[20], image[21]] = [sum & 0xff, sum >> 8];
    const m = start(image);
    assert.equal(m.read(m.sym("DRVTAB") + 8 + 7), flags, `byte 15 ${v.toString(16)}h`);
  }
});

test("the harness attributes private copy writes without discarding prior or foreign errors", async () => {
  const incoming = [...EXPAND1_WRITES], m = start(card(), { ram96: true });
  cmd(m, "DIR B:");
  assert.deepEqual(m.expand1Writes, [], "the cache's own copies");
  prepareCaller(m, "DIR returned before intentional private copy");
  const source = Uint8Array.from({ length: 16 }, (_, i) => 0x41 + i);
  source.forEach((value, i) => m.write(0x2000 + i, value));
  m.write(m.sym("XMDST"), 1); m.write(m.sym("XMSRC"), 0);
  const mv = m.sym("MVCOPY");
  assert.deepEqual([m.read(mv), m.read(mv + 1), m.read(mv + 2)], [0x78, 0xb1, 0xc8]);
  stub(m, [0x21, 0x00, 0x90, 0x11, 0x00, 0x20, 0x01, 0x10, 0x00, 0xcd, mv & 255, mv >> 8]);
  const own = [...m.expand1Writes]; assert.equal(own.length, 16);
  own.forEach((event, i) => {
    assert.equal(event.addr, 0x9000 + i);
    assert.ok(event.pc >= mv && event.pc < m.sym("MVOK") + 2, "each event belongs to the deliberately called copy span");
  });
  assert.deepEqual(m.expand[1].slice(0x1000, 0x1010), source);
  // Lookalike objects from other calls are not the verified events, even when the collector is full.
  for (const count of [0, 2, 16]) {
    const foreign = Array.from({ length: count }, (_, i) => ({ ...own[i % own.length] }));
    const collector = [...foreign, ...own].slice(0, 16);
    retireWrites(collector, own);
    assert.equal(collector.length, foreign.length);
    foreign.forEach((event, i) => assert.equal(collector[i], event));
    assert.equal(own.length, 16, "local evidence survives collector retirement");
  }
  const foreign = [{ ...own[0] }, { ...own[15] }], interleaved = [own[0], foreign[0], ...own.slice(1, 8), foreign[1], ...own.slice(8)];
  retireWrites(interleaved, own); assert.equal(interleaved.length, 2);
  assert.equal(interleaved[0], foreign[0]); assert.equal(interleaved[1], foreign[1]);
  retireWrites(EXPAND1_WRITES, own);
  assert.equal(EXPAND1_WRITES.length, incoming.length);
  incoming.forEach((event, i) => assert.equal(EXPAND1_WRITES[i], event));
  console.log(JSON.stringify({ scope: "identity-only intended private-copy cleanup", intendedLocalWrites: own.length, preservedIncomingGlobalWrites: incoming.length, saturatedForeignEventsPreserved: 16, interleavedForeignEventsPreserved: foreign.length }));
});

/** Where 128 bytes of V lie in IMAGE, or -1. */
const runOf = (image, v) => Buffer.from(image).indexOf(Buffer.alloc(128, v));

test("function 48 commits healthy data, reports refused full drains, and retains data through warm boot for retry", async () => {
  const image = card(), m = start(image);
  prepareCaller(m, "healthy function 48 caller");
  const healthy = latestBlock(m, image);
  bdos(m, 48, 0); assert.equal(m.cpu.cpu.a, 0);
  assert.deepEqual(image, healthy.expectedImage); assert.equal(cacheState(m).queue.length, 0);

  const failed = card(), n = start(failed);
  prepareCaller(n, "refused full-drain caller");
  const p = retainedBlocks({ m: n, image: failed, call: (fn, de) => bdos(n, fn, de) });
  bdos(n, 48, 0); assert.equal(n.cpu.cpu.a, 0xff, "failed required flush returns FF");
  assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(failed, p.original);
  const firstWarm = normalWarm(n);
  assert.equal(firstWarm.match(/Write pending/g)?.length, 1); assert.doesNotMatch(firstWarm, /Write lost/);
  assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(failed, p.original);
  assert.doesNotMatch(normalWarm(n), /Write pending|Write lost/, "the pending episode is reported once");
  assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(failed, p.original);
  prepareCaller(n, "snapshot complete, finish input while refusal persists");
  assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(failed, p.original);
  let released = 0;
  const step = n.step.bind(n), at = n.sym("FNFLSH"), target = n.sym("VFLUSH");
  assert.deepEqual([n.read(at), n.read(at + 1), n.read(at + 2)], [0xcd, target & 255, target >> 8]);
  const attemptStart = p.attempts.length;
  n.step = () => {
    if (n.pc === at) {
      assert.equal(n.read(n.sym("HKDEP")), 1); assert.equal(n.read(n.sym("HKBUSY")), 0);
      assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(failed, p.original);
      released++; p.backend.accepts = () => true;
    }
    return step();
  };
  bdos(n, 48, 0); n.step = step;
  assert.equal(released, 1); assert.equal(n.cpu.cpu.a, 0);
  const attempts = p.attempts.slice(attemptStart);
  assert.ok(attempts.some(a => !a.accepted), "ordinary entry encountered refusal before functional release");
  assert.deepEqual(attempts.filter(a => a.accepted).map(a => a.block), [...p.expected.keys()], "required flush commits both queued blocks");
  assert.deepEqual(failed, p.expectedImage); assert.equal(p.state().queue.length, 0);
  assert.ok(p.state().dirty.every(v => !v));
  assert.deepEqual([p.state().pending, p.state().any, p.state().depth, p.state().busy], [0, 0, 0, 0]);
});

test("function 45: FFh returns a BDOS error to the program, A = FFh and H the code, FEh says it first, and warm boot puts the default back (KS36b)", async () => {
  const m = start(card());
  prepareCaller(m, "initial synthetic caller");
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

test("function 47 drains genuinely retained blocks before loading the chained program", async () => {
  const image = await load(card(), ["say"]), m = start(image), say = await program("say");
  prepareCaller(m, "nonreturning function 47 caller");
  const p = retainedBlocks({ m, image, call: (fn, de) => bdos(m, fn, de) });
  const mark = m.output.length;
  bdos(m, 45, 0xfe);
  [...Buffer.from("SAY"), 0, ...new Array(124).fill(0)].forEach((v, i) => m.write(0x2100 + i, v));
  bdos(m, 26, 0x2100);
  assert.equal(m.read(m.sym("ERRMODE")), 0xfe);
  assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(image, p.original);
  assert.equal(m.text(mark).match(/Write pending/g)?.length, 1, "the deliberately returned-error episode is reported before chaining");
  const step = m.step.bind(m), chain = m.sym("FNCHAIN"), dma = m.sym("CURDMA");
  assert.deepEqual([m.read(chain), m.read(chain + 1), m.read(chain + 2)], [0x2a, dma & 255, dma >> 8]);
  let released = 0, loads = 0, programs = 0;
  const before = p.attempts.length;
  m.step = () => {
    if (m.pc === chain) {
      assert.equal(m.read(m.sym("HKDEP")), 1); assert.equal(m.read(m.sym("HKBUSY")), 0);
      assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(image, p.original);
      assert.ok(p.attempts.length > before && p.attempts.slice(before).every(a => !a.accepted), "ordinary entry still encountered refusal");
      released++; p.backend.accepts = () => true;
    }
    if (m.pc === m.sym("LOADCOM")) {
      publicContext(m); loads++;
      assert.equal(p.state().queue.length, 0); assert.deepEqual(image, p.expectedImage, "both known blocks are durable before any chained program load");
    }
    if (m.pc === 0x100) {
      publicContext(m); programs++;
      assert.deepEqual(Uint8Array.from({ length: say.bytes.length }, (_, i) => m.read(0x100 + i)), Uint8Array.from(say.bytes));
    }
    return step();
  };
  publicContext(m);
  [0x0e, 47, 0xcd, 0x05, 0x00].forEach((v, i) => m.write(0x3000 + i, v));
  m.cpu.cpu.sp = 0x3100; m.cpu.cpu.pc = 0x3000;
  m.runUntil(() => ordinaryInput(m) && /\nSAY\r\nB(:\S*)?>$/.test(m.text(mark)), 400_000_000, "chained SAY returns naturally to actual normal input");
  m.step = step;
  assert.equal(released, 1); assert.ok(loads >= 1); assert.equal(programs, 1);
  assert.deepEqual(p.attempts.filter(a => a.accepted).map(a => a.block), [...p.expected.keys()]);
  const out = m.text(mark);
  assert.equal(out.match(/Write pending/g)?.length, 1); assert.equal(out.match(/Cache clear/g)?.length, 1); assert.doesNotMatch(out, /Write lost|Write error/);
  assert.deepEqual(image, p.expectedImage); assert.equal(p.state().queue.length, 0);
  assert.equal(volume(image, "B").read("Q.DAT").length, 0);
  assert.deepEqual(m.violations, []);
  console.log(JSON.stringify({ scope: "function47 full drain before chained load", functionalEntries: released, loads, programs, committedBlocks: p.attempts.filter(a => a.accepted).map(a => a.block), pendingNotices: out.match(/Write pending/g)?.length ?? 0, recoveredNotices: out.match(/Cache clear/g)?.length ?? 0 }));
});

test("a warm flush retains a refused first block and commits the next acknowledged block", async () => {
  const image = card(), m = start(image);
  prepareCaller(m, "full-pass fairness caller");
  const p = retainedBlocks({ m, image, call: (fn, de) => bdos(m, fn, de) });
  const [first, second] = [...p.expected.keys()];
  p.backend.accepts = block => block !== first;
  const from = p.attempts.length, out = normalWarm(m), attempts = p.attempts.slice(from);
  assert.equal(out.match(/Write pending/g)?.length, 1); assert.doesNotMatch(out, /Write lost/);
  assert.deepEqual(attempts.filter(a => a.accepted).map(a => a.block), [second]);
  const refusedFirst = attempts.findIndex(a => a.block === first && !a.accepted), acceptedSecond = attempts.findIndex(a => a.block === second && a.accepted);
  assert.ok(refusedFirst >= 0 && acceptedSecond > refusedFirst, "the required pass attempts the failed head before the succeeding next block");
  const expectedPartial = Uint8Array.from(p.original); expectedPartial.set(p.expected.get(second), second * 512);
  assert.deepEqual(image, expectedPartial);
  const state = p.state(); assert.equal(state.entries.length, 1);
  assert.deepEqual(state.entries[0], p.before.entries[0]); assert.equal(state.dirty.filter(Boolean).length, 1);
  prepareCaller(m, "capture fairness result before finishing normal input");
  assert.deepEqual(image, expectedPartial); assert.equal(p.state().entries[0].block, first);
  p.backend.accepts = () => true;
  bdos(m, 48, 0); assert.equal(m.cpu.cpu.a, 0);
  assert.deepEqual(image, p.expectedImage); assert.equal(p.state().queue.length, 0);
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

test("an uncached BIOS type1 directory publication follows every acknowledged data block", async () => {
  const big = pattern(40 * 512, i => i), image = await load(card(), [], { "BIG.DAT": big });
  const cuts = []; let recording = false, cutExpected, directoryBlock, directoryExpected, p, m;
  m = start(image, { onSdWrite: img => {
    if (!recording) return;
    const { start, buffer } = m.sd.writeState, block = start / 512, payload = Uint8Array.from(buffer);
    if (block === directoryBlock) {
      for (const [dataBlock, data] of p.expected) assert.deepEqual(img.slice(dataBlock * 512, (dataBlock + 1) * 512), data, "every acknowledged data block is durable before publication");
      assert.deepEqual(payload, directoryExpected);
    } else {
      assert.ok(p.expected.has(block)); assert.deepEqual(payload, p.expected.get(block));
      assert.equal(volume(img, "B").find("Q.DAT").records, 0, "data commits publish no record count");
    }
    cutExpected.set(block === directoryBlock ? directoryExpected : p.expected.get(block), block * 512);
    assert.deepEqual(img, cutExpected, "every accepted cut changes only the independently predicted complete block");
    assert.deepEqual(volume(img, "B").verify(), []);
    cuts.push({ block, payload, records: volume(img, "B").find("Q.DAT").records });
  } });
  prepareCaller(m, "uncached directory publication caller");
  const commit = m.sd.commitWrite.bind(m.sd);
  p = retainedBlocks({ m, image, call: (fn, de) => bdos(m, fn, de) });
  const b = volume(image, "B"), descriptor = parseContainer(image).volumes[1], entry = b.find("Q.DAT");
  assert.equal(entry.entries.length, 1); assert.equal(entry.entries[0].index, 0); assert.equal(entry.records, 0);
  assert.deepEqual(entry.entries[0].slots, []);
  directoryBlock = descriptor.start;
  const originalDirectory = image.slice(directoryBlock * 512, (directoryBlock + 1) * 512);
  directoryExpected = originalDirectory.slice();
  directoryExpected[15] = 8;
  const allocation = word(m, 0x5c + 16);
  assert.ok(allocation >= b.g.dirBlocks && allocation <= b.d.dsm);
  directoryExpected[16] = allocation & 255; directoryExpected[17] = allocation >> 8;
  assert.equal(fileBlock(m, image, 0), [...p.expected.keys()][0]);
  const selected = bios(m, 9, 1), dpb = word(m, ((selected.h << 8) | selected.l) + 10);
  assert.equal(word(m, dpb), 64); assert.equal(word(m, dpb + 13), 0);
  bios(m, 10, 0); bios(m, 11, 0); bios(m, 12, 0x2400);
  assert.equal(bios(m, 13, 0).a, 0);
  assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x2400 + i)), originalDirectory.slice(0, 128));
  // Independent A reads evict the clean B directory while refusal keeps both B data lines.
  [1, ...Buffer.from("BIG     DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x2100 + i, v));
  bdos(m, 15, 0x2100); assert.notEqual(m.cpu.cpu.a, 0xff);
  bdos(m, 26, 0x2200);
  for (let record = 0; record < 160; record++) {
    bdos(m, 20, 0x2100); assert.equal(m.cpu.cpu.a, 0);
    assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x2200 + i)), big.slice(record * 128, (record + 1) * 128));
  }
  const bank = m.banks[0], tags = Array.from({ length: m.sym("NLINES") }, (_, line) => Array.from(bank.slice(m.sym("CTAB") - 0x8000 + line * 4, m.sym("CTAB") - 0x8000 + (line + 1) * 4)).reduce((n, v, i) => n + v * 256 ** i, 0));
  assert.ok(!tags.includes(directoryBlock), "the directory really misses the cache");
  assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(image, p.original);
  directoryExpected.slice(0, 128).forEach((v, i) => m.write(0x2400 + i, v));
  bios(m, 9, 1); bios(m, 10, 0); bios(m, 11, 0); bios(m, 12, 0x2400);
  const dataCommit = m.sd.commitWrite.bind(m.sd);
  m.sd.commitWrite = () => {
    const { start, buffer } = m.sd.writeState;
    if (start / 512 !== directoryBlock) return dataCommit();
    assert.deepEqual(Uint8Array.from(buffer), directoryExpected);
    for (const [block, payload] of p.expected) assert.deepEqual(image.slice(block * 512, (block + 1) * 512), payload);
    commit(); assert.equal(m.sd.pendingResponse[0], 0x05);
  };
  const step = m.step.bind(m), body = m.sym("BWRITE"); let released = 0;
  assert.deepEqual([m.read(body), m.read(body + 1), m.read(body + 2)], [0xcd, m.sym("CDI") & 255, m.sym("CDI") >> 8]);
  m.step = () => {
    if (m.pc === body) {
      assert.equal(m.cpu.cpu.c, 1); assert.equal(m.read(m.sym("HKDEP")), 1); assert.equal(m.read(m.sym("HKBUSY")), 0);
      assert.equal(word(m, m.sym("APIRTPC")), 0x3006);
      assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(image, p.original);
      const now = Array.from({ length: 30 }, (_, line) => Array.from(bank.slice(m.sym("CTAB") - 0x8000 + line * 4, m.sym("CTAB") - 0x8000 + (line + 1) * 4)).reduce((n, v, i) => n + v * 256 ** i, 0));
      assert.ok(!now.includes(directoryBlock));
      released++; p.backend.accepts = () => true;
    }
    return step();
  };
  cutExpected = Uint8Array.from(p.original); recording = true;
  assert.equal(bios(m, 14, 1).a, 0); m.step = step; recording = false;
  assert.equal(released, 1); assert.equal(cuts.length, 3);
  assert.deepEqual(cuts.map(c => c.block), [...p.expected.keys(), directoryBlock]);
  assert.deepEqual(cuts.map(c => c.records), [0, 0, 8]);
  const expectedImage = Uint8Array.from(p.expectedImage); expectedImage.set(directoryExpected, directoryBlock * 512);
  assert.deepEqual(image, expectedImage); assert.equal(p.state().queue.length, 0);
  assert.deepEqual(b.read("Q.DAT"), Uint8Array.from([...new Uint8Array(512).fill(0xc3), ...new Uint8Array(512).fill(0xd4)]));
  assert.deepEqual(b.verify(), []); assert.deepEqual(m.violations, []);
  console.log(JSON.stringify({ scope: "uncached type1 directory publication", directoryBlock, dataBlocks: [...p.expected.keys()], commits: cuts.map(c => ({ block: c.block, records: c.records, sha256: createHash("sha256").update(c.payload).digest("hex") })) }));
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
  prepareCaller(m, "initial synthetic caller");
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
  prepareCaller(m, "initial synthetic caller");
  [2, ...Buffer.from("W       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(0x5c + i, v));
  bdos(m, 22, 0x5c);
  bdos(m, 26, 0x2000);
  for (let i = 0; i < 128; i += 1) m.write(0x2000 + i, 0xc3);
  for (let r = 0; r < 3; r += 1) bdos(m, 21, 0x5c);
  bdos(m, 45, 0xff);
  failing(m, (block, data) => data.some((v) => v === 0xc3) && "fail");
  // B:, written through, coalesces: record 3 goes into the pending block, and
  // the failure comes at record 4, which moves to the next block.
  bdos(m, 21, 0x5c);
  assert.equal(m.cpu.cpu.a, 0, "record 3, in the pending block");
  const before = fcbAt(m, 0x5c);
  bdos(m, 21, 0x5c);
  assert.deepEqual([m.cpu.cpu.a, m.cpu.cpu.h], [0xff, 1], "a disk error, returned");
  assert.deepEqual(fcbAt(m, 0x5c), before, "the FCB where it was: record 4 next, the record count unraised");
});

test("full dirty-cache pressure retains refused data, frees successful lines, and distinguishes ordinary-entry progress", async () => {
  for (const mode of ["refuse-all", "refuse-head", "functional-success", "entry-success"]) {
    const image = card(), m = start(image, { ram96: true });
    prepareCaller(m, `${mode}: pressure caller`);
    const p = retainedBlocks({ m, image, call: (fn, de) => bdos(m, fn, de), records: 120, pattern: recordOf });
    assert.equal(p.before.queue.length, 30); assert.equal(p.acknowledgements.length, 120);
    const first = p.before.entries[0].block;
    // All setter opportunities still encounter refusal and retain all thirty.
    bios(m, 9, 0); bios(m, 10, 20); bios(m, 11, 0); bios(m, 12, 0x2000);
    assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(image, p.original);
    const requested = parseContainer(image).volumes[0].start + 20 * 16;
    assert.ok(!p.expected.has(requested), "the A read misses every held B data block");
    const expectedRead = image.slice(requested * 512, requested * 512 + 128);
    for (let i = 0; i < 128; i++) m.write(0x2000 + i, 0xa6);
    const iff = mode === "refuse-all" ? 0 : 1;
    m.cpu.cpu.iff1 = m.cpu.cpu.iff2 = iff;
    const latch = m.tec1g.state.system.sysCtrl;
    const from = p.attempts.length, functional = [], takes = [], rounds = [];
    const step = m.step.bind(m), readBody = m.sym("BREAD"), take = m.sym("CTAKE"), pass = m.sym("CTPASS");
    assert.deepEqual([m.read(readBody), m.read(readBody + 1), m.read(readBody + 2)], [0xcd, m.sym("CDI") & 255, m.sym("CDI") >> 8]);
    assert.deepEqual([m.read(take), m.read(take + 1), m.read(take + 2)], [0xcd, m.sym("CTSCAN") & 255, m.sym("CTSCAN") >> 8]);
    if (mode === "entry-success") p.backend.accepts = () => true;
    m.step = () => {
      if (m.pc === readBody) {
        assert.equal(m.read(m.sym("HKDEP")), 1); assert.equal(m.read(m.sym("HKBUSY")), 0);
        assert.equal(word(m, m.sym("APIRTPC")), 0x3003, "the real public BIOS wrapper owns this synthetic return");
        functional.push(p.state());
        assert.equal(functional.at(-1).queue.length, mode === "entry-success" ? 29 : 30);
        if (mode === "functional-success") p.backend.accepts = () => true;
        if (mode === "refuse-head") p.backend.accepts = block => block !== first;
      }
      if (m.pc === take) takes.push(p.state());
      if (m.pc === pass && m.read(m.sym("HKRPOS")) === 0) rounds.push({ state: p.state(), attemptStart: p.attempts.length });
      return step();
    };
    const entry = word(m, 1) - 3 + 3 * 13;
    stub(m, [0xcd, entry & 255, entry >> 8]); m.step = step;
    assert.equal(functional.length, 1); assert.equal(takes.length, 1);
    assert.equal(m.cpu.cpu.iff1, iff); assert.equal(m.cpu.cpu.iff2, iff);
    assert.equal(m.tec1g.state.system.sysCtrl, latch); assert.ok(m.classicBankIn);
    const attempts = p.attempts.slice(from), accepted = attempts.filter(a => a.accepted);
    if (mode === "entry-success") {
      assert.equal(rounds.length, 0, "one ordinary-entry commit supplies a clean victim without a pressure pass");
      assert.equal(accepted.length, 1); assert.equal(p.state().queue.length, 29);
    } else {
      assert.equal(rounds.length, 1);
      assert.deepEqual(rounds[0].state.round, p.before.queue, "one bounded pass freezes every original dirty line");
      assert.equal(rounds[0].state.entries.length, 30);
      const pressureAttempts = p.attempts.slice(rounds[0].attemptStart);
      assert.deepEqual(pressureAttempts.map(a => a.block), [...p.expected.keys()], "each initially eligible block is tried once in first-dirty order");
      assert.equal(accepted.length, mode === "refuse-all" ? 0 : mode === "refuse-head" ? 29 : 30);
    }
    const expectedPartial = Uint8Array.from(p.original);
    for (const a of accepted) expectedPartial.set(p.expected.get(a.block), a.block * 512);
    assert.deepEqual(image, expectedPartial, "only successful complete data versions changed the backing card");
    const state = p.state(), acceptedBlocks = new Set(accepted.map(a => a.block));
    assert.deepEqual(state.entries, p.before.entries.filter(e => !acceptedBlocks.has(e.block)), "every refused or unserviced line retains its tag and full acknowledged payload");
    assert.deepEqual([state.pending, state.any, state.depth, state.busy], [0, state.queue.length ? 1 : 0, 0, 0]);
    if (mode === "refuse-all") {
      assert.notEqual(m.cpu.cpu.a, 0); assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x2000 + i)), new Uint8Array(128).fill(0xa6));
      const beforeWarm = p.attempts.length, mark = m.output.length;
      const ordinary = () => {
        if (!m.classicBankIn || !m.ready() || m.read(m.sym("ERRMODE")) !== 0 || m.read(m.sym("HKDEP")) !== 1 || m.read(m.sym("HKBUSY"))) return false;
        const saved = word(m, m.sym("OLDSP")), back = word(m, saved);
        return saved === m.sym("CSTKTOP") - 2 && m.lineBuf === m.sym("CMDBUF") &&
          [0x0e, 10, 0xcd, 5, 0].every((v, i) => m.read(back - 5 + i) === v);
      };
      m.cpu.cpu.pc = 0;
      m.runUntil(() => recoveryInput(m) || (ordinary() && /\r\n[A-P](:\S*)?>$/.test(m.text(mark))), 400_000_000, "actual normal or bootstrap input after full refused pressure");
      const outcome = recoveryInput(m) ? "recovery" : "normal", out = m.text(mark);
      assert.equal(outcome, "recovery", "a full refusing cache cannot provide a directory victim for warm recovery");
      assert.equal(out.match(/Write pending/g)?.length, 1); assert.doesNotMatch(out, /Write lost/);
      assert.ok(p.attempts.length > beforeWarm);
      assert.deepEqual(durable(p.state()), durable(p.before)); assert.deepEqual(image, p.original);
      console.log(JSON.stringify({ scope: "full refused pressure warm stop", outcome, text: out, depth: m.read(m.sym("HKDEP")), busy: m.read(m.sym("HKBUSY")), oldsp: word(m, m.sym("OLDSP")), errorMode: m.read(m.sym("ERRMODE")), queuedBlocks: p.state().entries.map(e => e.block), refusedWarmAttempts: p.attempts.length - beforeWarm }));
      // A deliberate retry, after capturing recovery ownership and retention.
      p.backend.accepts = () => true;
      const retryMark = m.output.length; m.type("\r");
      m.runUntil(() => ordinary() && /\r\n[A-P](:\S*)?>$/.test(m.text(retryMark)), 400_000_000, "explicit bootstrap CR retry reaches actual ordinary input");
      assert.doesNotMatch(m.text(retryMark), /Write lost/);
      assert.deepEqual(image, p.expectedImage); assert.equal(p.state().queue.length, 0);
      prepareCaller(m, "actual retry result captured before ordinary-input completion");
    } else {
      assert.equal(m.cpu.cpu.a, 0); assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x2000 + i)), expectedRead);
    }
    p.backend.accepts = () => true;
    bdos(m, 48, 0); assert.equal(m.cpu.cpu.a, 0);
    assert.deepEqual(image, p.expectedImage); assert.equal(p.state().queue.length, 0);
    assert.equal(volume(image, "B").read("Q.DAT").length, 0, "physical persistence does not publish the unclosed file's record count");
    assert.deepEqual(m.violations, []);
  }
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
      { geometry, label: "WORK", mount: "B" },
    ]);
    const r = rig(image);
    const m = r.m;
    if (wb) {
      logOn(m, "B");
      r.commandNormalization = finishBarePrompt(m);
    }
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
// fails again until the card takes the data; warm boot retains pending data.
/** WB.DAT made on B: (G8M, written behind, logged) and records 0-7 written, with function 45 in FFh mode; the card refuses B:'s data blocks while refuse() says so. */
function closing(refuse) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
  ]);
  const r = rig(image);
  const m = r.m;
  logOn(m, "B");
  r.commandNormalization = finishBarePrompt(m);
  r.call(5, { c: 45, de: 0xff });
  r.fcb(2, "WB      DAT");
  assert.equal(r.bdos(22), 0, "made");
  for (let rec = 0; rec < 8; rec += 1) {
    recordOf(rec).forEach((v, k) => m.write(0x80 + k, v));
    assert.equal(r.bdos(21), 0, `record ${rec}`);
  }
  const b = parseContainer(image).volumes[1];
  const data = (block) => block >= b.start + 32 && block < b.start + b.length; // past G8M's 32 directory blocks
  const refusals = [];
  failing(m, (block, payload) => {
    if (!refuse() || !data(block)) return;
    refusals.push({ block, payload: Array.from(payload) });
    return "fail";
  });
  return { r, m, image, refusals };
}

function pendingWriteState(m, image) {
  assert.equal(m.expand, undefined, "this observation uses the default physical bank model");
  assert.ok(m.classicBankIn, "observe the returned caller or actual classic input");
  const bank = m.banks[0];
  assert.equal(bank.length, 0x4000);
  const count = m.read(m.sym("HKCNT"));
  assert.ok(count <= m.sym("NLINES"));
  const queue = Array.from({ length: count }, (_, i) => m.read(m.sym("HKQ") + i));
  const dirtyVector = Array.from(bank.subarray(m.sym("CDIRTY") - 0x8000, m.sym("CDIRTY") - 0x8000 + m.sym("NLINES")));
  const entries = queue.map(line => {
    assert.ok(line < m.sym("NLINES"));
    const tag = Array.from(bank.subarray(m.sym("CTAB") - 0x8000 + line * 4, m.sym("CTAB") - 0x8000 + (line + 1) * 4));
    return { line, tag, block: tag.reduce((n, b, i) => n + b * 256 ** i, 0), dirty: dirtyVector[line], payload: Array.from(bank.subarray(line * 512, (line + 1) * 512)) };
  });
  const ephemeral = Object.fromEntries(["HKRPOS", "HKRLEN", "HKDEP", "HKBUSY", "HKERR", "CPEND", "CANY"].map(name => [name, m.read(m.sym(name))]));
  ephemeral.round = Array.from({ length: ephemeral.HKRLEN }, (_, i) => m.read(m.sym("HKROUND") + i));
  return { durable: { queue, dirtyVector, entries }, ephemeral, cardSHA256: createHash("sha256").update(image).digest("hex"), directoryRecords: volume(image, "B").find("WB.DAT")?.records ?? null };
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

test("a refused close retains acknowledged data through warm boot without publishing directory records (KE-AR8)", () => {
  const { r, m, image, refusals } = closing(() => true);
  const beforeClose = pendingWriteState(m, image);
  const disk = volume(image, "B");
  const b = parseContainer(image).volumes[1];
  const allocated = word(m, 0x5c + 16);
  const lastBlock = b.start + allocated * disk.blockBytes / 512 + 1;
  const received = Array.from({ length: 4 }, (_, i) => Array.from(recordOf(i + 4))).flat();
  assert.equal(beforeClose.durable.entries.length, 1, "earlier API calls committed preceding work; the final updated block remains queued");
  assert.equal(beforeClose.durable.entries[0].block, lastBlock, "the queued tag identifies records 4 to 7 in this file");
  assert.deepEqual(beforeClose.durable.entries[0].payload, received, "all acknowledged records in the final block are retained");
  assert.equal(beforeClose.durable.dirtyVector.filter(Boolean).length, 1, "the full dirty vector has no unobserved dirty line");
  assert.equal(beforeClose.durable.entries[0].dirty, 1);
  assert.equal(beforeClose.ephemeral.HKDEP, 0);
  assert.equal(beforeClose.ephemeral.HKBUSY, 0);
  assert.notDeepEqual(Array.from(image.subarray(lastBlock * 512 + 384, (lastBlock + 1) * 512)), Array.from(recordOf(7)), "the final acknowledged record is still off-card");
  assert.equal(r.bdos(16), 0xff, "the close fails");
  const beforeWarm = pendingWriteState(m, image);
  assert.deepEqual(beforeWarm.durable, beforeClose.durable, "failed close preserves queue, tags, all dirty bits and full payload");
  assert.equal(beforeWarm.cardSHA256, beforeClose.cardSHA256);
  assert.equal(beforeWarm.ephemeral.HKDEP, 0);
  assert.equal(beforeWarm.ephemeral.HKBUSY, 0);
  const refusedBeforeWarm = refusals.length;
  assert.ok(refusedBeforeWarm > 0, "the close actually reached the refusing backend");
  const warm = r.warm();
  const afterWarm = pendingWriteState(m, image);
  assert.deepEqual(afterWarm.durable, beforeWarm.durable, "warm boot retains all acknowledged data without dropping a line");
  assert.equal(afterWarm.cardSHA256, beforeWarm.cardSHA256);
  assert.ok(refusals.length > refusedBeforeWarm, "warm boot also encountered actual backend refusal");
  assert.ok(refusals.every(({ block, payload }) => block === lastBlock && Buffer.from(payload).equals(Buffer.from(received))), "every refused write contained the complete queued payload");
  assert.equal(warm.outcome, "normal", "valid default disk state can coexist with retained pending data");
  assert.equal(warm.text, m.text(m.mark));
  assert.match(warm.text, /\r\nB>$/);
  assert.equal(warm.text.match(/Write pending/g)?.length, 1, "one pending notice rather than a loss report");
  assert.doesNotMatch(warm.text, /Write lost/);
  assert.equal(afterWarm.ephemeral.HKDEP, 1, "the new counted input owns the API context");
  assert.equal(afterWarm.ephemeral.HKBUSY, 0);
  const oldsp = word(m, m.sym("OLDSP"));
  assert.equal(oldsp, m.sym("CSTKTOP") - 2);
  const back = word(m, oldsp);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => m.read(back - 5 + i)), [0x0e, 10, 0xcd, 5, 0], "actual CCP counted-input call site");
  const f = volume(image, "B").find("WB.DAT");
  assert.ok(!f || f.records === 0, `the card's entry names ${f?.records} records`);
  console.log(JSON.stringify({ scope: "late-armed backend refusal after eight accepted records", queuedBlocks: afterWarm.durable.entries.map(({ block }) => block), refusals: refusals.length, beforeWarmRefusals: refusedBeforeWarm, warm, cardSHA256: afterWarm.cardSHA256, directoryRecords: f?.records ?? null }));
});

// --- Write-behind follows the logged drive ------------------------------------
//
// The volume on the logged drive, the CCP's BOOTDRV, is written behind; every
// other volume coalesces. Every console read writes every changed line, every
// directory write writes the other lines first, and a drive change writes
// the cache before it selects the drive. These rows run on a four-drive card,
// bare or under SHELL.SVC; each mutant is the build's ROM patched.

const four = () =>
  createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
      { geometry: "G1M", label: "PROJECTS", mount: "C" },
      { geometry: "G1M", label: "GAMES" },
      { geometry: "G1M", label: "SPARE" },
    ],
    { drives: 4 },
  );
// A prompt, bare or under the shell, with or without a volume label.
const ANY_PROMPT = /\r\n\d*[A-P](:\S*)?>$/;
const lo = (v) => v & 0xff;
const hi = (v) => v >> 8;

/**
 * WK: makes the file its FCB at 005Ch names, writes 32 records (eight
 * blocks), waits at BDOS 1, then returns by RET or, with JP, by a jump to
 * the CCP's MAINLOOP, as a program that comes back with no warm boot. PRE is
 * code run first.
 */
const wk = (mainloop, { pre = [], jp = false } = {}) =>
  Uint8Array.from([
    ...pre,
    0x11, 0x5c, 0x00, 0x0e, 22, 0xcd, 0x05, 0x00, 0x06, 32,
    0xc5, 0x11, 0x5c, 0x00, 0x0e, 21, 0xcd, 0x05, 0x00, 0xc1, 0x10, 0xf4,
    0x0e, 1, 0xcd, 0x05, 0x00,
    ...(jp ? [0xc3, lo(mainloop), hi(mainloop)] : [0xc9]),
  ]);
const selectFirst = (d) => [0x1e, d, 0x0e, 14, 0xcd, 0x05, 0x00]; // BDOS 14, E = d
const pageZeroDrive = (d) => [0x3e, d, 0x32, 0x04, 0x00]; // LD A,d; LD (0004h),A

/** The card refusing every block write while the flag's on is true. */
function refusing(m) {
  const sd = m.sd;
  const commit = sd.commitWrite.bind(sd);
  const f = { on: false };
  sd.commitWrite = () => {
    if (!f.on) return commit();
    sd.writeState = null;
    sd.pendingResponse = [0x0d, 0xff];
    sd.delayBytes = 1;
  };
  return f;
}

/** A four-drive card with FILES on A:, booted under ROM (the build's when not given), bare or with SHELL.SVC: the machine, its card writes and a run to the prompt. */
function wbMachine(files, { rom, bare = false, image = four() } = {}) {
  const writes = { n: 0 };
  shellCard(files, { startup: bare ? [] : ["SHELL.SVC"], image });
  const m = shellMachine(image, { ...(rom ?? {}), onSdWrite: () => (writes.n += 1) });
  return { m, writes, image, run: (l) => at(m, l, { re: ANY_PROMPT }) };
}

/** WK run as LINE, logged on LOGGED: card writes before its BDOS 1, and by the time it waits there. */
function keyWait(line, { logged = "A", pre, rom } = {}) {
  const sym = (rom ?? romFor()).symbols;
  const { m, writes, run } = wbMachine({ "WK.COM": wk(sym.get("MAINLOOP"), { pre }) }, { rom });
  if (logged !== "A") run(`${logged}:`);
  const n0 = writes.n;
  m.mark = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => m.pc === sym.get("FNCIN"), 400_000_000, "BDOS 1");
  const before = writes.n - n0;
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the key wait");
  const waiting = writes.n - n0;
  m.type("x");
  m.runUntil(() => m.ready() && ANY_PROMPT.test(m.text(m.mark)), 400_000_000, "the prompt");
  return { before, waiting };
}

const BEHIND = { before: 1, waiting: 9 }; // the make's entry; then eight blocks at the key wait
const THROUGH = { before: 8, waiting: 9 }; // seven blocks and the make as writing moves on; the last at the key wait

test("S2-3 logged A: behind, B: through", () => {
  assert.deepEqual(keyWait("A:WK A:W.DAT"), BEHIND, "logged on A:, A:'s eight blocks wait for the key wait");
  assert.deepEqual(keyWait("A:WK B:W.DAT"), THROUGH, "B: coalesces");
});

test("S2-3 logged B:", () => {
  assert.deepEqual(keyWait("A:WK B:W.DAT", { logged: "B" }), BEHIND, "logged on B:, B:'s blocks wait");
  assert.deepEqual(keyWait("A:WK A:W.DAT", { logged: "B" }), THROUGH, "A: coalesces");
});

/** The rows of a program's own drives, logged on A:: C: by its FCB, C: by BDOS 14, and 0004h set to B: before writing B:. */
function programDrives(rom) {
  return {
    "C: by its FCB": keyWait("A:WK C:W.DAT", { rom }),
    "C: by BDOS 14": keyWait("A:WK W.DAT", { pre: selectFirst(2), rom }),
    "0004h = B:": keyWait("A:WK B:W.DAT", { pre: pageZeroDrive(1), rom }),
  };
}

test("S2-3 a program's drives", () => {
  for (const [what, r] of Object.entries(programDrives())) assert.equal(r.before, 8, `${what}: written through as writing moves on`);
});

/** Logged on LOGGED, a program writes a record into A:T.DAT's first block and waits at BDOS 1: whether the record is in the card image then. */
function recordAtKey(logged, rom) {
  const fncin = (rom ?? romFor()).symbols.get("FNCIN");
  const code = [
    0x11, 0x5c, 0x00, 0x0e, 15, 0xcd, 0x05, 0x00, // open
    0x11, 0x00, 0x02, 0x0e, 26, 0xcd, 0x05, 0x00, // DMA 0200h
    0xaf, 0x32, 0x7d, 0x00, 0x32, 0x7e, 0x00, 0x32, 0x7f, 0x00, // record 0
    0x11, 0x5c, 0x00, 0x0e, 34, 0xcd, 0x05, 0x00, // write it in place
    0x0e, 1, 0xcd, 0x05, 0x00, 0xc9, // wait for a key
  ];
  const rec = Array.from({ length: 128 }, (_, i) => 0x41 + (i % 26));
  const com = new Uint8Array(0x180);
  com.set(code);
  com.set(rec, 0x100);
  const { m, image, run } = wbMachine({ "KW.COM": com, "T.DAT": new Uint8Array(1024).fill(0x30) }, { rom });
  if (logged === "B") run("B:");
  m.mark = m.output.length;
  m.type("A:KW A:T.DAT\r");
  let entered = false;
  m.runUntil(() => ((entered ||= m.pc === fncin), entered && m.waitingForInput()), 400_000_000, "BDOS 1");
  const there = same(volume(image, "A").read("T.DAT").subarray(0, 128), rec);
  m.type("x");
  m.runUntil(() => m.ready() && ANY_PROMPT.test(m.text(m.mark)), 400_000_000, "the prompt");
  return there;
}
const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

test("S2-3 key wait on every drive", () => {
  assert.equal(recordAtKey("A"), true, "logged on A:, A: written behind: the record on the card at BDOS 1");
  assert.equal(recordAtKey("B"), true, "logged on B:, A: coalesced: the record on the card at BDOS 1");
});

test("S2-3 read-only never", () => {
  const image = createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G1M", label: "LOCKED", mount: "C", readOnly: true },
    ],
    { drives: 4 },
  );
  const { m, writes, run } = wbMachine({}, { image });
  run("C:");
  const n0 = writes.n;
  m.mark = m.output.length;
  m.type("SAVE 1 X.COM\r");
  m.runUntil(() => /R\/O/.test(m.text(m.mark)), 200_000_000, "the R/O error");
  assert.match(m.text(m.mark), /Bdos Err On C: R\/O/);
  m.type("\r");
  m.runUntil(() => m.ready() && ANY_PROMPT.test(m.text(m.mark)), 200_000_000, "the prompt");
  assert.equal(writes.n - n0, 0, "the card sees no write");
});

test("S2-3 mutant: MR2, the console read writing the pending block only, leaves the logged drive's lines out at the key wait", () => {
  const rom = MUTANTS.mr2();
  assert.notDeepEqual(keyWait("A:WK A:W.DAT", { rom }), BEHIND);
  assert.notDeepEqual(keyWait("A:WK B:W.DAT", { logged: "B", rom }), BEHIND);
  assert.equal(recordAtKey("A", rom), false, "the record not on the card at BDOS 1");
});

test("S2-3 mutant: MBD, BWGET testing the BDOS's current disk, writes behind the drive a program selects", () => {
  const rom = MUTANTS.mbd();
  assert.notDeepEqual(keyWait("A:WK B:W.DAT", { rom }), THROUGH, "B: written through");
  const rows = programDrives(rom);
  assert.ok(Object.values(rows).some((r) => r.before !== 8), JSON.stringify(rows));
  assert.notEqual(rows["C: by BDOS 14"].before, 8, "C: by BDOS 14 written behind");
});

/**
 * Logged on B:, P1 makes B:X.DAT, writes 32 records and returns by JP
 * MAINLOOP, its FCB kept at 4000h. The card refuses every write from its
 * return, through the drive change to A: and the prompt's console read.
 * Then P2, on A:, closes that FCB; the card takes writes again as P2 starts
 * if RECOVER. The card writes by the close's return, the file's bytes on the
 * card, and the text.
 */
function directoryLast({ bare, recover, rom }) {
  const sym = (rom ?? romFor()).symbols;
  const main = sym.get("MAINLOOP");
  const fcb = [2, ...Buffer.from("X       DAT", "latin1")];
  while (fcb.length < 36) fcb.push(0);
  const p1 = Uint8Array.from([
    0x21, 0x24, 0x01, 0x11, 0x00, 0x40, 0x01, 0x24, 0x00, 0xed, 0xb0, // the FCB to 4000h
    0x11, 0x00, 0x40, 0x0e, 22, 0xcd, 0x05, 0x00, 0x06, 32,
    0xc5, 0x11, 0x00, 0x40, 0x0e, 21, 0xcd, 0x05, 0x00, 0xc1, 0x10, 0xf4,
    0xc3, lo(main), hi(main),
    ...fcb,
  ]);
  const p2 = Uint8Array.from([0x11, 0x00, 0x40, 0x0e, 16, 0xcd, 0x05, 0x00, 0x32, 0x00, 0x41, 0xc3, lo(main), hi(main)]);
  const { m, writes, image, run } = wbMachine({ "P1.COM": p1, "P2.COM": p2 }, { bare, rom });
  run("B:");
  const f = refusing(m);
  m.mark = m.output.length;
  m.type("A:P1\r");
  m.runUntil(() => m.pc === main, 400_000_000, "P1's return");
  f.on = true;
  m.runUntil(() => m.ready() && ANY_PROMPT.test(m.text(m.mark)), 400_000_000, "the prompt");
  run("A:");
  const before = writes.n;
  m.mark = m.output.length;
  m.type("P2\r");
  m.runUntil(() => m.pc === 0x0100, 100_000_000, "P2's start");
  f.on = !recover;
  let byClose = null;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x0108 && byClose === null) byClose = writes.n - before;
    return step();
  };
  m.runUntil(() => m.waitingForInput() && (ANY_PROMPT.test(m.text(m.mark)) || /Bdos|Bad/.test(m.text(m.mark))), 400_000_000, "after the close");
  m.step = step;
  const found = volume(image, "B").find("X.DAT");
  const data = found ? volume(image, "B").read("X.DAT") : null;
  return { byClose, data, closeA: m.read(0x4100), text: m.text(m.mark) };
}

test("S2-4 directory last after a failed drive change", () => {
  for (const bare of [true, false]) {
    const r = directoryLast({ bare, recover: true });
    const how = bare ? "bare" : "under the shell";
    assert.equal(r.byClose, 9, `${how}: the close writes the 8 data blocks, then the entry`);
    assert.equal(r.closeA, 0, `${how}: the close succeeds`);
    assert.equal(r.data?.length, 4096, `${how}: the file's 32 records named`);
    assert.equal(r.data.filter((b) => b === 0xe5).length, 0, `${how}: and every one on the card`);
  }
});

test("S2-4 directory refused while the card refuses", () => {
  for (const bare of [true, false]) {
    const r = directoryLast({ bare, recover: false });
    const how = bare ? "bare" : "under the shell";
    assert.match(r.text, /Bdos|Bad/, `${how}: the close refused`);
    assert.ok(!r.data || r.data.length === 0, `${how}: the card's entry names no block of the file`);
  }
});

test("S2-4 mutant: MDIR, a directory write off the logged drive not flushing first, names blocks the card lacks at the close", () => {
  const r = directoryLast({ bare: true, recover: true, rom: MUTANTS.mdir() });
  assert.equal(r.byClose, 1, "the entry alone by the close's return");
});

/** From a script, WK writes A:K.DAT and waits with the card refusing, then returns with no warm boot; the card takes writes again; the script's next line is B:. Card writes before BDOS 14 selects B:. */
function scriptDriveChange(rom) {
  const sym = (rom ?? romFor()).symbols;
  const script = Buffer.from("WK A:K.DAT\r\nB:\r\nA:\r\n\x1a", "latin1");
  const { m, writes } = wbMachine({ "WK.COM": wk(sym.get("MAINLOOP"), { jp: true }), "S.CMD": script }, { rom });
  const f = refusing(m);
  m.mark = m.output.length;
  m.type("S.CMD\r");
  m.runUntil(() => m.pc === sym.get("FNCIN"), 400_000_000, "BDOS 1");
  f.on = true;
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the key wait");
  let at14 = null;
  const n0 = writes.n;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === sym.get("BENTRY") && m.cpu.cpu.c === 14 && at14 === null) at14 = writes.n - n0;
    return step();
  };
  m.type("x");
  m.runUntil(() => m.pc === sym.get("MAINLOOP"), 100_000_000, "WK's return");
  f.on = false;
  m.runUntil(() => at14 !== null, 400_000_000, "the script's B:");
  m.step = step;
  return at14;
}

test("S2-4 drive change flushes kept lines", () => {
  assert.equal(scriptDriveChange(), 8, "from a script: the eight kept blocks written before BDOS 14");
  // Typed, the line's own key reads write the kept lines before the drive change.
  const sym = romFor().symbols;
  const { m, writes } = wbMachine({ "WK.COM": wk(sym.get("MAINLOOP"), { jp: true }) }, { bare: true });
  const f = refusing(m);
  m.mark = m.output.length;
  m.type("A:WK A:K.DAT\r");
  m.runUntil(() => m.pc === sym.get("FNCIN"), 400_000_000, "BDOS 1");
  f.on = true;
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the key wait");
  m.type("x");
  // WK comes back with no warm boot: the prompt follows its key directly.
  m.runUntil(() => m.ready() && /[A-P](:\S*)?>$/.test(m.text(m.mark)), 400_000_000, "the prompt");
  f.on = false;
  let at14 = null;
  const n0 = writes.n;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === sym.get("BENTRY") && m.cpu.cpu.c === 14 && at14 === null) at14 = writes.n - n0;
    return step();
  };
  at(m, "B:", { re: ANY_PROMPT });
  m.step = step;
  assert.equal(at14, 8, "typed: the kept blocks on the card before the drive is selected");
});

test("S2-4 mutant: M1, no flush at a drive change, leaves a script's kept lines unwritten as it selects the drive", () => {
  assert.equal(scriptDriveChange(MUTANTS.m1()), 0);
});
