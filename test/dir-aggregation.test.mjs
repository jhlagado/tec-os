// Sized DIR's observable contract, bounded workspace and failure paths.
// Expected values come from explicit directory records and an independent
// public BDOS caller. These are emulator tests, not board measurements.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createContainer } from "../tools/lib/container.mjs";
import { GLCD_SVC, volume } from "./lib/fixtures.mjs";
import { SHELL, GUARDS, shellCard, shellMachine, shellVariant, pageOf, at, code, word } from "./lib/shell.mjs";

const PROMPT = /\r\n\d*[A-P](:\S*)?>$/;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const evidence = process.env.DIR_EVIDENCE;
let serial = 0;
let fixtureSerial = 0;
GUARDS.on = true;
after(() => {
  for (const guard of GUARDS.machines) assert.ok(guard.read() <= 36, `private shell stack used ${guard.read()} of 48`);
});

function rawEntry(v, i, { name, ex = 0, s1 = 0, s2 = 0, rc = 0, user = 0, system = false, attributes = [] }) {
  const [base, ext = ""] = name.split(".");
  assert.ok(base.length <= 8 && ext.length <= 3);
  const entry = v.entry(i);
  entry.fill(0);
  entry[0] = user;
  entry.set(Buffer.from(base.padEnd(8) + ext.padEnd(3), "latin1"), 1);
  entry[12] = ex; entry[13] = s1; entry[14] = s2; entry[15] = rc;
  if (system) entry[10] |= 0x80;
  for (const n of attributes) entry[1 + n] |= 0x80;
}

function fresh({ geometry = "G8M", entries = [], files = {}, bFiles = {}, svc = SHELL, variant = null, startup = ["SHELL.SVC"], opts = {} } = {}) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry, label: "WORK", mount: "B" },
  ], { drives: 4 });
  const b = volume(image, "B");
  entries.forEach((entry, i) => rawEntry(b, i, entry));
  for (const [name, bytes] of Object.entries(bFiles)) b.write(name, bytes);
  shellCard(files, { image, shell: svc.file, startup });
  const svcIdentity = { kind: variant ? "variant" : "normal", rawBytes: svc.file.length, rawSha256: digest(svc.file), imageBytes: svc.image,
    variant: variant ? { ...variant, editsSha256: digest(Buffer.from(JSON.stringify(variant.edits))) } : null };
  let stem = null, m = null, failure = null, bootComplete = false;
  const inputSha256 = digest(image);
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    stem = resolve(evidence, `fixture-${String(++fixtureSerial).padStart(3, "0")}`);
    writeFileSync(`${stem}.input.img.gz`, gzipSync(image));
    writeFileSync(`${stem}.shell.svc`, svc.file);
    writeFileSync(`${stem}.json`, JSON.stringify({ phase: "prepared-before-machine", inputBytes: image.length, inputSha256, svc: svcIdentity }) + "\n");
  }
  try {
    // Evidence already owns the actual card and SVC if this identity fails.
    if (!variant) assert.deepEqual(Buffer.from(svc.file), readFileSync(new URL("../dist/files/SHELL.SVC", import.meta.url)), "normal fixture uses the exact media shell");
    m = shellMachine(image, { ...opts, noWait: true });
    m.shellSymbols = svc.symbols;
    m.testSvc = svcIdentity;
    m.runUntil(() => {
      if (!m.classicBankIn || !m.ready()) return false;
      const p = pageOf(m), s = svc.symbols;
      return p && !word(m, p + s.LPOS) && !m.read(p + s.SOPEN) && !m.read(p + s.STSKIP) && PROMPT.test(m.text(0));
    }, 2_000_000_000, "the completed startup prompt");
    assert.deepEqual(m.violations, []);
    bootComplete = true;
    return { m, image, b };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (stem) {
      try {
        writeFileSync(`${stem}.boot.console.bin`, Buffer.from(m ? m.text(0) : "", "latin1"));
        writeFileSync(`${stem}.json`, JSON.stringify({ phase: "boot-ended", bootComplete, machineConstructed: m !== null, inputBytes: image.length, inputSha256,
          finalSha256: digest(image), svc: svcIdentity, pc: m?.pc ?? null, sp: m?.cpu.cpu.sp ?? null,
          error: failure ? { name: failure.name, message: failure.message } : null }, null, 2) + "\n");
        if (digest(image) !== inputSha256) writeFileSync(`${stem}.boot.final.img.gz`, gzipSync(image));
      } catch (captureError) {
        if (!failure) throw captureError;
        console.error(JSON.stringify({ scope: "fixture evidence-write failure", primary: { name: failure.name, message: failure.message },
          captureError: { name: captureError.name, message: captureError.message } }));
      }
    }
  }
}

function rows(text) {
  const found = [];
  for (const line of text.replaceAll("[more]\r      \r", "").split(/\r\n|\r/)) {
    // Classify before checking width: an extra malformed row must fail,
    // rather than disappearing from the expected complete row set.
    const spaced = /^[^:>\x00-\x1f]*\S[^:>\x00-\x1f]* +\d+$/.test(line);
    const touching = /^[^ .:>\x00-\x1f]{1,8}\.[^ .:>\x00-\x1f]{3}\d+$/.test(line);
    if (!spaced && !touching) continue;
    assert.equal(line.length, 20, `filename row width: ${JSON.stringify(line)}`);
    assert.match(line.slice(12), /^ *\d{1,8}$/, "eight-character numeric field");
    assert.ok(line.slice(0, 12).trimEnd().length, "nonempty filename field");
    found.push([line.slice(0, 12).trimEnd(), Number(line.slice(12)), line]);
  }
  return found;
}
const pairs = text => rows(text).map(([name, bytes]) => [name, bytes]);

function list(m, line = "DIR B:", { via = "serial", hook } = {}) {
  const before = Buffer.from(m.sdImage), counters = { searchFirst: 0, searchNext: 0, size: 0 };
  const start = m.cycles, step = m.step.bind(m);
  let error = null, complete = false;
  m.mark = m.output.length;
  m.step = () => {
    if (m.pc === m.sym("BENTRY")) {
      if (m.cpu.cpu.c === 17) counters.searchFirst++;
      if (m.cpu.cpu.c === 18) counters.searchNext++;
      if (m.cpu.cpu.c === 35) counters.size++;
    }
    hook?.(m);
    return step();
  };
  const type = text => via === "matrix" ? m.typeMatrix(text) : m.type(text);
  try {
    type(`${line}\r`);
    for (;;) {
      const more = () => /\[more\]$/.test(m.text(m.mark));
      m.runUntil(() => (m.waitingForInput() && more()) || (m.ready() && PROMPT.test(m.text(m.mark))), 20_000_000_000, line);
      if (!more()) break;
      const n = m.output.length;
      type(" ");
      m.runUntil(() => m.output.length > n + 12, 400_000_000, "the pager reply");
    }
    complete = true;
    assert.deepEqual(Buffer.from(m.sdImage), before, "read-only DIR preserves the complete card");
    assert.deepEqual(m.violations, []);
    return { text: m.text(m.mark), counters, cycles: m.cycles - start, result: code(m) };
  } catch (failure) {
    error = { name: failure.name, message: failure.message };
    throw failure;
  } finally {
    m.step = step;
    if (evidence) {
      const stem = resolve(evidence, `dir-${String(++serial).padStart(3, "0")}`);
      const captureErrors = [];
      let parsedRows = null, rowParseFailure = null;
      const retain = (part, action) => {
        try { action(); }
        catch (failure) { captureErrors.push({ part, name: failure.name, message: failure.message }); }
      };
      retain("directory", () => mkdirSync(evidence, { recursive: true }));
      retain("input", () => writeFileSync(`${stem}.input.img.gz`, gzipSync(before)));
      retain("raw console", () => writeFileSync(`${stem}.console.bin`, Buffer.from(m.text(m.mark), "latin1")));
      try { parsedRows = pairs(m.text(m.mark)); }
      catch (failure) { rowParseFailure = failure; }
      retain("metadata", () => writeFileSync(`${stem}.json`, JSON.stringify({ line, via,
        complete: complete && !error && !rowParseFailure && !captureErrors.length, error,
        rowParseError: rowParseFailure ? { name: rowParseFailure.name, message: rowParseFailure.message } : null,
        captureErrors, counters, cycles: m.cycles - start, result: code(m), pc: m.pc, sp: m.cpu.cpu.sp,
        svc: m.testSvc, inputBytes: before.length, inputSha256: digest(before), finalSha256: digest(m.sdImage), rows: parsedRows }, null, 2) + "\n"));
      if (captureErrors.length || rowParseFailure) {
        console.error(JSON.stringify({ scope: "DIR evidence finalization", primary: error,
          rowParseError: rowParseFailure ? { name: rowParseFailure.name, message: rowParseFailure.message } : null, captureErrors }));
        if (!error) {
          if (rowParseFailure) throw rowParseFailure;
          throw new Error(`DIR evidence capture failed: ${JSON.stringify(captureErrors)}`);
        }
      }
    }
  }
}

function tableGuard(m) {
  const end = word(m, 6);
  assert.ok(m.classicBankIn && end >= 0x2240);
  for (let a = 0x100; a < end; a++) m.write(a, 0xa5);
  const body = Buffer.from(Array.from({ length: end - 0x2240 }, (_, i) => m.read(0x2240 + i)));
  return () => {
    assert.deepEqual(Buffer.from(Array.from({ length: end - 0x2240 }, (_, i) => m.read(0x2240 + i))), body, "table never reaches the rest of the TPA");
    assert.ok(Array.from({ length: 0x2a }, (_, i) => m.read(0x116 + i)).every(value => value === 0xa5), "unused header bytes remain untouched");
  };
}

function hash(name) {
  const [base, ext = ""] = name.split(".");
  let h = 0;
  for (const c of Buffer.from(base.padEnd(8) + ext.padEnd(3), "latin1")) h = (((h << 1) | (h >> 7)) ^ (c & 127)) & 255;
  return h & 127;
}
function colliding(n) {
  const target = hash("F0000000.DAT"), names = [];
  for (let i = 0; i < 2_000_000 && names.length < n; i++) {
    const name = `F${i.toString(16).toUpperCase().padStart(7, "0")}.DAT`;
    if (hash(name) === target) names.push(name);
  }
  assert.equal(names.length, n);
  return names;
}

test("DIR table: filename and size fields remain twenty columns", () => {
  const want = [["SHELL.SVC", 128], ["ABCDEFGH.XYZ", 256], ["README", 384]];
  const { m } = fresh({ entries: want.map(([name, bytes]) => ({ name, rc: bytes / 128 })) });
  const r = list(m);
  assert.deepEqual(pairs(r.text), want);
  assert.deepEqual(rows(r.text).map(row => row[2]), want.map(([name, bytes]) => name.padEnd(12) + String(bytes).padStart(8)));
  assert.match(r.text, /3 files, 768 bytes/);
  assert.equal(r.result, 0);
  assert.throws(() => rows(`${r.text}\r\nEXTRA.DAT 1\r\n`), /filename row width/, "malformed extra rows cannot be filtered out");
});

test("DIR table: unsigned end records and byte totals preserve wrapping", () => {
  for (const geometry of ["G1M", "G8M"]) {
    const { m } = fresh({ geometry, entries: [
      { name: "MAX.DAT", rc: 1 }, { name: "MAX.DAT", ex: 31, s2: 63, s1: 255, rc: 255 },
    ] });
    assert.deepEqual(pairs(list(m).text), [["MAX.DAT", 16256]], "RC carry above the extent and 24-bit byte wrap");
    const { m: n } = fresh({ geometry, entries: [
      { name: "WRAP.DAT", rc: 1 }, { name: "ONE.DAT", rc: 1 }, { name: "WRAP.DAT", ex: 31, s2: 63, rc: 127 },
    ] });
    const r = list(n);
    assert.deepEqual(new Map(pairs(r.text)), new Map([["WRAP.DAT", 16777088], ["ONE.DAT", 128]]));
    assert.match(r.text, /2 files, 0 bytes/);
  }
});

test("DIR table: users attributes and explicit-drive EXM stay separate", () => {
  const { m } = fresh({ entries: [
    { name: "SAME.DAT", user: 0, ex: 30, s2: 10, rc: 128 },
    { name: "SAME.DAT", user: 3, rc: 1, attributes: [0, 8] },
    { name: "EXM.DAT", user: 3, ex: 1, rc: 7 },
  ] });
  at(m, "USER 3");
  const r = list(m);
  assert.deepEqual(new Map(pairs(r.text)), new Map([["SAME.DAT", 128], ["EXM.DAT", 17280]]));
  assert.equal(m.read(4), 0x30, "explicit B does not change logical A or current user");
});

test("DIR table: hash collisions keep exact keys and legacy partition", () => {
  const [a, b] = colliding(2);
  let c = "OTHER.DAT";
  if (hash(c) === hash(a)) c = "UNMARK.DAT";
  assert.notEqual(hash(c), hash(a));
  const { m } = fresh({ geometry: "G1M", entries: [
    { name: a, rc: 1 }, { name: b, rc: 64 }, { name: c, rc: 3 }, { name: a, s2: 1, rc: 2 },
  ] });
  assert.deepEqual(pairs(list(m).text), [[c, 384], [a, 524544], [b, 8192]]);
});

test("DIR table: duplicate anchors and orphan extents keep their meanings", () => {
  const { m } = fresh({ geometry: "G1M", entries: [
    { name: "DUP.DAT", rc: 1 }, { name: "DUP.DAT", rc: 7 }, { name: "ORPHAN.DAT", ex: 3, rc: 128 },
  ] });
  assert.deepEqual(pairs(list(m, "DIR B:DUP.DAT").text), [["DUP.DAT", 128], ["DUP.DAT", 896]]);
  const { m: n } = fresh({ geometry: "G1M", entries: [
    { name: "DUP.DAT", rc: 1 }, { name: "DUP.DAT", rc: 7 }, { name: "DUP.DAT", ex: 1, rc: 2, system: true },
    { name: "ORPHAN.DAT", ex: 3, rc: 128 },
  ] });
  assert.deepEqual(pairs(list(n).text), [["DUP.DAT", 16640], ["DUP.DAT", 16640]], "hidden extents contribute; no orphan row");
});

test("DIR table: literal question-mark anchors retain size wildcards", () => {
  const { m } = fresh({ geometry: "G1M", entries: [
    { name: "A?.DAT", rc: 1 }, { name: "A?.DAT", ex: 1, rc: 1 },
    { name: "AZ.DAT", rc: 3 }, { name: "AZ.DAT", ex: 2, rc: 1 },
  ] });
  assert.deepEqual(pairs(list(m).text), [["A?.DAT", 32896], ["AZ.DAT", 32896]]);
});

test("DIR table: no visible match retains NO FILE and its failure code", () => {
  const { m } = fresh({ entries: [{ name: "HID.SYS", rc: 4, system: true }] });
  const r = list(m);
  assert.deepEqual(pairs(r.text), []);
  assert.match(r.text, /NO FILE/);
  assert.equal(r.result, 0xff00);
  assert.match(at(m, "ECHO alive"), /alive/);
});

test("DIR table: fast path starts three searches and never BDOS 35", () => {
  const { m } = fresh({ entries: [{ name: "BIG.DAT", ex: 1, rc: 128 }, { name: "BIG.DAT", ex: 2, rc: 64 }] });
  const check = tableGuard(m), r = list(m);
  check();
  assert.deepEqual(pairs(r.text), [["BIG.DAT", 40960]]);
  assert.equal(r.counters.searchFirst, 3);
  assert.equal(r.counters.size, 0);
  assert.equal(word(m, 0x100), 1);
  assert.equal(word(m, 0x102), 0x250);
});

test("DIR table: refused workspace uses legacy without TPA writes", async () => {
  const edits = [["  ld hl,($0006)\n", "  ld hl,$223F\n"]];
  const svc = await shellVariant(edits);
  const { m } = fresh({ svc, variant: { label: "forced-low-workspace", edits }, geometry: "G1M", entries: [{ name: "X.DAT", rc: 1 }, { name: "X.DAT", ex: 1, rc: 2 }] });
  const check = tableGuard(m), r = list(m);
  check();
  assert.deepEqual(pairs(r.text), [["X.DAT", 16640]]);
  assert.ok(Array.from({ length: 0x2140 }, (_, i) => m.read(0x100 + i)).every(value => value === 0xa5));
  assert.ok(r.counters.size > 0);
});

test("DIR table: capacity fallback restarts before printing rows", async () => {
  const edits = [["DLIMIT EQU $2240", "DLIMIT EQU $0250"]];
  const svc = await shellVariant(edits);
  const { m } = fresh({ svc, variant: { label: "forced-one-node-capacity", edits }, entries: [{ name: "A.DAT", rc: 1 }, { name: "B.DAT", rc: 2 }, { name: "C.DAT", rc: 3 }] });
  const check = tableGuard(m), r = list(m);
  check();
  assert.deepEqual(pairs(r.text), [["A.DAT", 128], ["B.DAT", 256], ["C.DAT", 384]]);
  assert.match(r.text, /3 files, 768 bytes/);
  assert.ok(Array.from({ length: 0x1ff0 }, (_, i) => m.read(0x250 + i)).every(value => value === 0xa5));
  assert.equal(m.read(pageOf(m) + svc.symbols.DFAST), 0);
});

test("DIR table: invalid links and cycles fail without hanging", () => {
  for (const kind of ["below", "misaligned", "unallocated", "cycle"]) {
    const { m } = fresh({ entries: [{ name: "A.DAT", rc: 1 }, { name: "B.DAT", rc: 2 }, { name: "C.DAT", rc: 3 }] });
    let injected = false;
    const p = pageOf(m);
    const r = list(m, "DIR B:", { hook: n => {
      if (injected || n.pc !== p + SHELL.symbols.DAF1 || word(n, 0x100) !== 1) return;
      assert.notDeepEqual(Array.from({ length: 11 }, (_, i) => n.read(0x104 + i)), Array.from({ length: 11 }, (_, i) => n.read(0x240 + i)));
      const head = n.cpu.cpu.h << 8 | n.cpu.cpu.l;
      assert.ok(head >= 0x140 && head < 0x240 && !(head & 1));
      const pointer = kind === "below" ? 0x100 : kind === "misaligned" ? 0x241 : kind === "unallocated" ? word(n, 0x102) : 0x240;
      n.write(head, pointer & 255); n.write(head + 1, pointer >> 8);
      if (kind === "cycle") { n.write(0x24e, 0x40); n.write(0x24f, 2); }
      injected = true;
    } });
    assert.ok(injected, kind);
    assert.match(r.text, /DIR STATE/);
    assert.equal(r.result, 0xff00);
    assert.deepEqual(pairs(r.text), []);
    assert.match(at(m, "ECHO alive"), /alive/);
    assert.deepEqual(pairs(list(m).text), [["A.DAT", 128], ["B.DAT", 256], ["C.DAT", 384]], "next DIR reinitializes private state");
  }
});

test("DIR table: an absent marked key is refused before a zero-size row", () => {
  const { m } = fresh({ geometry: "G1M", entries: [{ name: "A.DAT", rc: 1 }, { name: "A.DAT", ex: 1, rc: 2 }] });
  const p = pageOf(m);
  let injected = false;
  const r = list(m, "DIR B:", { hook: n => {
    if (injected || n.pc !== p + SHELL.symbols.DAGGET) return;
    assert.equal(word(n, p + SHELL.symbols.DNUM), 0, "before the first filename row");
    assert.equal(word(n, 0x100), 1);
    n.write(0x240, n.read(0x240) ^ 1);
    injected = true;
  } });
  assert.ok(injected);
  assert.equal(r.result, 0xff00);
  assert.match(r.text, /DIR STATE/);
  assert.deepEqual(pairs(r.text), []);
  assert.deepEqual(pairs(list(m).text), [["A.DAT", 16640]]);
});

test("DIR table: all 512 colliding keys stay within the reservation", { timeout: 900_000 }, t => {
  const names = colliding(512), entries = names.map((name, i) => ({ name, ex: 1, rc: i & 127 }));
  const { m } = fresh({ entries }), check = tableGuard(m), r = list(m);
  check();
  assert.deepEqual(pairs(r.text), names.map((name, i) => [name, (128 + (i & 127)) * 128]));
  assert.equal(word(m, 0x100), 512);
  assert.equal(word(m, 0x102), 0x2240);
  t.diagnostic(JSON.stringify({ scope: "functional maximal-chain observation", files: 512, cycles: r.cycles, counters: r.counters }));
  assert.equal(r.counters.searchFirst, 3);
  assert.equal(r.counters.size, 0);
});

test("DIR table: valid sparse and large files agree with public BDOS 35", t => {
  const s35 = Uint8Array.from([0x11, 0x5c, 0, 0x0e, 35, 0xcd, 5, 0, 0xc9]);
  const sparse = Uint8Array.from([0x11, 0x5c, 0, 0x0e, 22, 0xcd, 5, 0, 0x21, 0xe8, 3, 0x22, 0x7d, 0, 0xaf, 0x32, 0x7f, 0,
    0x11, 0x5c, 0, 0x0e, 34, 0xcd, 5, 0, 0x11, 0x5c, 0, 0x0e, 16, 0xcd, 5, 0, 0xc9]);
  const { m } = fresh({ files: { "S35.COM": s35, "SP.COM": sparse }, bFiles: {
    "BIG.DAT": new Uint8Array(40 * 1024).fill(0x42), "SMALL.DAT": new Uint8Array(128).fill(0x53),
  } });
  at(m, "SP B:SPARSE.DAT");
  const r = list(m);
  assert.deepEqual(new Map(pairs(r.text)), new Map([["BIG.DAT", 40960], ["SMALL.DAT", 128], ["SPARSE.DAT", 128128]]));
  const observed = [];
  for (const [name, bytes] of pairs(r.text)) {
    at(m, `S35 B:${name}`);
    const records = m.read(0x7d) | m.read(0x7e) << 8 | m.read(0x7f) << 16;
    assert.equal(bytes, records * 128, name);
    observed.push({ name, bytes, records });
  }
  t.diagnostic(JSON.stringify({ scope: "independent public BDOS 35", observed }));
});

test("DIR table: a synthetic NMI return frame fits the private stack", t => {
  const names = colliding(8), entries = names.map((name, i) => ({ name, ex: 1, rc: i }));
  const { m } = fresh({ entries }), p = pageOf(m), s = SHELL.symbols, bottom = p + s.STKBOT, top = p + s.STKTOP;
  const originalStep = m.step.bind(m), read = m.cpu.hardware.memRead, tick = m.cpu.hardware.ioTick;
  const registers = () => Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "ix", "iy"].map(key => [key, m.cpu.cpu[key]]).concat([["flags", { ...m.cpu.cpu.flags }]]));
  let active = false, requested = 0, entered = 0, returned = 0, normalLow = top, low = top, pending = null, current = null;
  const observed = [];
  // 0066h overlaps the default FCB. Override only fetches while the actual
  // synthetic NMI handler executes, preserving every ordinary RAM read.
  m.cpu.hardware.memRead = address => active && (address === 0x66 || address === 0x67) ? (address === 0x66 ? 0xed : 0x45) : read(address);
  m.cpu.hardware.ioTick = () => {
    // The runtime calls this after execute(), before delivering the event.
    // Request at this SAME boundary, not after another instruction can pop.
    const sp = m.cpu.cpu.sp, pc = m.pc;
    if (!active && m.classicBankIn && pc >= p + s.DRNAME && pc < p + s.IMGEND) assert.ok(sp >= bottom && sp <= top, "helper owns its private stack");
    if (!active && m.classicBankIn && sp >= bottom && sp < normalLow && pc !== 0x66 && pc !== 0x67) {
      assert.equal(pending, null);
      pending = { normalSp: sp, resumePc: pc, registers: registers(), vectorBytes: [read(0x66), read(0x67)] };
      normalLow = sp;
      m.tec1g.applyKey(0);
      requested++;
    }
    const event = tick();
    if (pending) assert.equal(event?.interrupt?.nonMaskable, true, "delegated hardware tick supplies the requested NMI");
    return event;
  };
  m.step = () => {
    const r = originalStep();
    if (pending) {
      assert.equal(m.pc, 0x66, "actual CPU vector entry");
      assert.ok(m.classicBankIn);
      assert.equal(m.cpu.cpu.sp, (pending.normalSp - 2) & 65535, "actual two-byte frame at observed deepest boundary");
      assert.equal(word(m, m.cpu.cpu.sp), pending.resumePc, "real stacked return address");
      assert.deepEqual([read(0x66), read(0x67)], pending.vectorBytes, "FCB RAM was not patched");
      current = { ...pending, nmiSp: m.cpu.cpu.sp, stackedReturn: word(m, m.cpu.cpu.sp) };
      pending = null;
      active = true;
      entered++;
      low = Math.min(low, m.cpu.cpu.sp);
      assert.ok(m.cpu.cpu.sp >= bottom);
    } else if (current) {
      assert.equal(m.pc, current.resumePc);
      assert.equal(m.cpu.cpu.sp, current.normalSp);
      assert.deepEqual(registers(), current.registers, "RETN preserves the interrupted calculation and flags");
      assert.deepEqual([read(0x66), read(0x67)], current.vectorBytes);
      observed.push({ ...current, restoredPc: m.pc, restoredSp: m.cpu.cpu.sp });
      current = null;
      active = false;
      returned++;
    }
    return r;
  };
  let r;
  try { r = list(m); }
  finally { m.step = originalStep; m.cpu.hardware.memRead = read; m.cpu.hardware.ioTick = tick; }
  assert.ok(entered > 0);
  assert.equal(requested, entered);
  assert.equal(returned, entered);
  assert.equal(active, false);
  assert.equal(pending, null);
  assert.equal(current, null);
  assert.equal(low, normalLow - 2, "deepest observed normal boundary actually receives its frame");
  t.diagnostic(JSON.stringify({ scope: "synthetic tick-boundary fetch-only RETN frame, not a production handler", requested, entered, returned,
    reserved: 48, used: top - low, normalUsed: top - normalLow, maximum: 36, observed }));
  assert.ok(top - low <= 36, `${top - low} bytes including the synthetic NMI frame`);
  assert.deepEqual(pairs(r.text), names.map((name, i) => [name, (128 + i) * 128]));
  assert.equal(r.result, 0);
});
