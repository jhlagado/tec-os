// Sized DIR's observable contract, bounded workspace and failure paths.
// Expected values come from explicit directory records and an independent
// public BDOS caller. These are emulator tests, not board measurements.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContainer } from "../tools/lib/container.mjs";
import { GLCD_SVC, volume } from "./lib/fixtures.mjs";
import { SHELL, GUARDS, shellCard, shellMachine, shellVariant, pageOf, at, code, word } from "./lib/shell.mjs";

const PROMPT = /\r\n\d*[A-P](:\S*)?>$/;
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

/**
 * A four-drive card with SYSTEM on A: and WORK, of GEOMETRY, on B:, whose
 * directory starts with ENTRIES as raw entries and then holds BFILES. FILES
 * go on A: with the shell, SVC's file; VARIANT says SVC is an altered shell.
 * The machine at its first prompt, the image and B:'s volume.
 */
function fresh({ geometry = "G8M", entries = [], files = {}, bFiles = {}, svc = SHELL, variant = false, startup = ["SHELL.SVC"], opts = {} } = {}) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry, label: "WORK", mount: "B" },
  ], { drives: 4 });
  const b = volume(image, "B");
  entries.forEach((entry, i) => rawEntry(b, i, entry));
  for (const [name, bytes] of Object.entries(bFiles)) b.write(name, bytes);
  shellCard(files, { image, shell: svc.file, startup });
  if (!variant) assert.deepEqual(Buffer.from(svc.file), readFileSync(new URL("../dist/files/SHELL.SVC", import.meta.url)), "the card's shell is the one media builds");
  const m = shellMachine(image, { ...opts, noWait: true });
  m.runUntil(() => {
    if (!m.classicBankIn || !m.ready()) return false;
    const p = pageOf(m), s = svc.symbols;
    return p && !word(m, p + s.LPOS) && !m.read(p + s.SOPEN) && !m.read(p + s.STSKIP) && PROMPT.test(m.text(0));
  }, 2_000_000_000, "the completed startup prompt");
  assert.deepEqual(m.violations, []);
  return { m, image, b };
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

/**
 * Type LINE and answer each [more] with a space, to the prompt: the text,
 * the BDOS 17, 18 and 35 calls, the cycles and the return code. HOOK runs
 * before each instruction. The card must come out as it went in.
 */
function list(m, line = "DIR B:", { via = "serial", hook } = {}) {
  const before = Buffer.from(m.sdImage), counters = { searchFirst: 0, searchNext: 0, size: 0 };
  const start = m.cycles, step = m.step.bind(m);
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
    assert.deepEqual(Buffer.from(m.sdImage), before, "read-only DIR preserves the complete card");
    assert.deepEqual(m.violations, []);
    return { text: m.text(m.mark), counters, cycles: m.cycles - start, result: code(m) };
  } finally {
    m.step = step;
  }
}

function tableGuard(m) {
  const end = word(m, 6);
  assert.ok(m.classicBankIn && end >= 0x2240);
  for (let a = 0x100; a < end; a++) m.write(a, 0xa5);
  const body = Buffer.from(Array.from({ length: end - 0x2240 }, (_, i) => m.read(0x2240 + i)));
  return () => {
    assert.deepEqual(Buffer.from(Array.from({ length: end - 0x2240 }, (_, i) => m.read(0x2240 + i))), body, "table never reaches the rest of the TPA");
    assert.ok([0x100, 0x101, ...Array.from({ length: 0x2b }, (_, i) => 0x115 + i)].every(a => m.read(a) === 0xa5), "unused header bytes remain untouched");
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
  // A blank inside a name or a type is part of it: only the padding at the right is dropped.
  const want = [["SHELL.SVC", 128], ["ABCDEFGH.XYZ", 256], ["README", 384], ["A B.C D", 512]];
  const { m } = fresh({ entries: want.map(([name, bytes]) => ({ name, rc: bytes / 128 })) });
  const r = list(m);
  assert.deepEqual(pairs(r.text), want);
  assert.deepEqual(rows(r.text).map(row => row[2]), want.map(([name, bytes]) => name.padEnd(12) + String(bytes).padStart(8)));
  assert.match(r.text, /4 files, 1280 bytes/);
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

// The prompt is in user area 0: the two files listed are there, and the larger
// SAME.DAT in area 3 must stay out of the listing and out of their sizes.
test("DIR table: users attributes and explicit-drive EXM stay separate", () => {
  const { m } = fresh({ entries: [
    { name: "SAME.DAT", user: 3, ex: 30, s2: 10, rc: 128 },
    { name: "SAME.DAT", user: 0, rc: 1, attributes: [0, 8] },
    { name: "EXM.DAT", user: 0, ex: 1, rc: 7 },
  ] });
  const r = list(m);
  assert.deepEqual(new Map(pairs(r.text)), new Map([["SAME.DAT", 128], ["EXM.DAT", 17280]]));
  assert.equal(m.read(4), 0, "explicit B does not change logical A or the user area");
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
  assert.equal(word(m, 0x102), 0x250, "one name in the table");
});

test("DIR table: all 512 colliding keys stay within the reservation", { timeout: 900_000 }, t => {
  const names = colliding(512), entries = names.map((name, i) => ({ name, ex: 1, rc: i & 127 }));
  const { m } = fresh({ entries }), check = tableGuard(m), r = list(m);
  check();
  assert.deepEqual(pairs(r.text), names.map((name, i) => [name, (128 + (i & 127)) * 128]));
  assert.equal(word(m, 0x102), 0x2240, "512 names: the table full");
  t.diagnostic(JSON.stringify({ scope: "functional maximal-chain observation", files: 512, cycles: r.cycles, counters: r.counters }));
  assert.equal(r.counters.searchFirst, 3);
  assert.equal(r.counters.size, 0);
});

// The table keeps each name's greatest end record, whatever the order of its
// entries. LATER.DAT's greatest comes after its first entry and EARLY.DAT's
// before it, so a shell that keeps the first it meets gets LATER.DAT wrong
// and one that keeps the last gets EARLY.DAT wrong.
test("DIR table mutant: without the maximum, a file is sized by its first entry or its last", async () => {
  const entries = [
    { name: "LATER.DAT", rc: 128 }, { name: "EARLY.DAT", ex: 2, rc: 9 },
    { name: "LATER.DAT", ex: 2, rc: 9 }, { name: "EARLY.DAT", rc: 128 },
  ];
  const right = [["LATER.DAT", 33920], ["EARLY.DAT", 33920]];
  const normal = list(fresh({ geometry: "G1M", entries }).m);
  assert.deepEqual(pairs(normal.text), right);
  assert.equal(normal.counters.size, 0, "from the table, not BDOS 35");
  const first = await shellVariant([["  jr nc,DAGMAX   ; coalesce same key", "  ret nc"]]);
  const kept = list(fresh({ geometry: "G1M", entries, svc: first, variant: true }).m);
  assert.deepEqual(pairs(kept.text), [["LATER.DAT", 16384], ["EARLY.DAT", 33920]], "the first entry met");
  assert.equal(kept.counters.size, 0);
  const last = await shellVariant([["  ret c          ; candidate was smaller\n", ""]]);
  const taken = list(fresh({ geometry: "G1M", entries, svc: last, variant: true }).m);
  assert.deepEqual(pairs(taken.text), [["LATER.DAT", 33920], ["EARLY.DAT", 16384]], "the last entry met");
  assert.equal(taken.counters.size, 0);
});

// The maximum compares three bytes with a borrow from the low byte up, and
// an entry's end record carries from RC into the middle and high bytes.
// Each file's entries are in an order that a comparison of one byte alone,
// or a lost borrow or carry, would get wrong.
test("DIR table: the maximum's borrow and the end record's carry cross all three bytes", () => {
  const end = ({ ex = 0, s2 = 0, rc = 0 }) => ((s2 & 63) * 32 + (ex & 31)) * 128 + rc;
  const files = {
    // 000101h then 00007Fh: the later low byte is greater, the value less.
    "LOWKEEP.DAT": [{ ex: 2, rc: 1 }, { rc: 127 }],
    // 00007Fh then 000101h: the later low byte is less, the value greater.
    "LOWTAKE.DAT": [{ rc: 127 }, { ex: 2, rc: 1 }],
    // 010000h then 00FFFFh, and the other way about: the borrow reaches the high byte.
    "MIDKEEP.DAT": [{ s2: 16 }, { ex: 31, s2: 15, rc: 127 }, { rc: 1 }],
    "MIDTAKE.DAT": [{ rc: 1 }, { ex: 31, s2: 15, rc: 127 }, { s2: 16 }],
    // 020001h and 01FFFFh: the high bytes differ.
    "TOPKEEP.DAT": [{ s2: 32, rc: 1 }, { ex: 31, s2: 31, rc: 127 }, { rc: 1 }],
    "TOPTAKE.DAT": [{ rc: 1 }, { ex: 31, s2: 31, rc: 127 }, { s2: 32, rc: 1 }],
    // 000100h twice, by two routes, then 0000FFh: equal values, then a lesser one.
    "EQUAL.DAT": [{ rc: 1 }, { ex: 1, rc: 128 }, { ex: 2 }, { ex: 1, rc: 127 }],
    // RC 128 on 00FF80h: a carry through the middle byte into the high.
    "CARRY.DAT": [{ rc: 1 }, { ex: 31, s2: 15, rc: 128 }],
  };
  const names = Object.keys(files), entries = [];
  for (let i = 0; i < 4; i++) for (const name of names) if (files[name][i]) entries.push({ name, ...files[name][i] });
  const want = new Map(names.map(name => [name, (Math.max(...files[name].map(end)) * 128) & 0xffffff]));
  assert.deepEqual([want.get("MIDKEEP.DAT"), want.get("TOPKEEP.DAT"), want.get("EQUAL.DAT"), want.get("CARRY.DAT")], [8388608, 128, 32768, 8388608]);
  const { m } = fresh({ geometry: "G1M", entries }), r = list(m);
  assert.equal(pairs(r.text).length, names.length);
  assert.deepEqual(new Map(pairs(r.text)), want);
  assert.equal(r.counters.size, 0);
});

test("DIR table: no name and 511 names stay within the reservation", { timeout: 900_000 }, () => {
  {
    const { m } = fresh(), check = tableGuard(m), r = list(m);
    check();
    assert.deepEqual(pairs(r.text), []);
    assert.match(r.text, /NO FILE/);
    assert.equal(r.result, 0xff00);
    assert.equal(word(m, 0x102), 0x240, "no name in the table");
  }
  const names = Array.from({ length: 511 }, (_, i) => `N${String(i).padStart(4, "0")}.DAT`);
  const { m } = fresh({ entries: names.map((name, i) => ({ name, ex: 1, rc: i & 127 })) }), check = tableGuard(m), r = list(m);
  check();
  assert.deepEqual(pairs(r.text), names.map((name, i) => [name, (128 + (i & 127)) * 128]));
  assert.equal(word(m, 0x102), 0x2230, "511 names: one node's room left");
  assert.equal(r.counters.searchFirst, 3);
  assert.equal(r.counters.size, 0);
});

// A row is twenty columns: within the GLCD's 21 and the PICO9918's 40. On
// each, every row shown when [more] waits is one whole line of the screen.
test("DIR table: rows and [more] on the GLCD and the PICO9918", () => {
  const small = Array.from({ length: 30 }, (_, i) => [`F${String(i).padStart(2, "0")}.DAT`, (i + 1) * 128]);
  small.push(["README", 384]);
  // A full 8.3 name with an eight-digit size: the two fields touch.
  const big = ["ABCDEFGH.XYZ", 12345600];
  const entries = small.map(([name, bytes]) => ({ name, rc: bytes / 128 }));
  entries.push({ name: big[0], rc: 1 }, { name: big[0], ex: 17, s2: 23, rc: 66 });
  // The big file's mark puts it, and any name sharing that mark, in the second group.
  const marked = ([name]) => hash(name) === hash(big[0]);
  const want = [...small.filter(f => !marked(f)), ...small.filter(marked), big];
  const whole = new Set(want.map(([name, bytes]) => name.padEnd(12) + String(bytes).padStart(8)));
  for (const [label, opts, screen, startup, files, console] of [
    ["GLCD", { matrix: true, glcd: true }, m => m.glcdScreen(), ["SHELL.SVC", "GLCD.SVC"], { "GLCD.SVC": GLCD_SVC }, 3],
    ["PICO9918", { tms: true, matrix: true }, m => m.screen(), ["SHELL.SVC"], {}, null],
  ]) {
    const { m } = fresh({ geometry: "G1M", entries, files, startup, opts });
    if (console !== null) assert.equal(m.read(m.sym("CONMOD")), console, `${label} is the console`);
    const pages = [];
    m.mark = m.output.length;
    m.typeMatrix("DIR B:\r");
    for (;;) {
      const more = () => /\[more\]$/.test(m.text(m.mark));
      m.runUntil(() => (m.waitingForInput() && more()) || (m.ready() && PROMPT.test(m.text(m.mark))), 20_000_000_000, `DIR B: on the ${label}`);
      if (!more()) break;
      pages.push(screen(m).map(l => l.trimEnd()).filter(Boolean));
      const n = m.output.length;
      m.typeMatrix(" ");
      m.runUntil(() => m.output.length > n + 12, 400_000_000, "the pager reply");
    }
    const text = m.text(m.mark);
    assert.deepEqual(pairs(text), want, label);
    assert.match(text, /32 files, 12405504 bytes/, label);
    assert.equal(code(m), 0);
    assert.ok(pages.length > 0, `${label}: [more] waited`);
    for (const page of pages) {
      assert.equal(page.at(-1), "[more]", `${label}: ${JSON.stringify(page)}`);
      const shown = page.filter(l => whole.has(l));
      assert.ok(shown.length >= 2, `${label}: rows above [more]: ${JSON.stringify(page)}`);
      // A row broken across lines would leave a line that starts as a row does, or one of digits alone.
      for (const l of page.slice(0, -1)) assert.ok(whole.has(l) || (!want.some(([name]) => l.startsWith(name)) && !/^\d+$/.test(l.trim())), `${label}: ${JSON.stringify(l)}`);
    }
    assert.deepEqual(m.violations, []);
  }
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
