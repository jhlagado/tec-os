// MON3.SVC's second stage: HEX loading, file names, the matrix keyboard and
// the size (KG64); the MON-3 API against MON-3 itself, the latch, the
// checksum and the fixes carried from the first stage (KG65); the real
// programs (KG66). Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, volume } from "./lib/fixtures.mjs";
import { PROGRAMS, realBuild, realProgram } from "./lib/mon3src.mjs";
import { MON3, MON3_CEILING, PROMPT, bin, bytesAt, digitsOf, figures, hello3, line, mon3Sources, mon3Variant, runFor, services, word } from "./lib/mon3.mjs";
import { compareRows, fixedImage, keyDown, keyUp, matrixDown, matrixUp, mon3Go, referenceHexLoad, referenceSide, routineOf, sessionSide } from "./lib/kg65.mjs";
import { BIG16K, END, HASHES, boot, dataRecords, goTo, hexFile, inSession, lines, mon3Build, ok, pageOf, record, refused, runnable, sha, toMon3, toPrompt, tpaBytes, tpaDigest } from "./lib/mon3s2.mjs";

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// GO carries PROTECT and CAPS into the latch: SYS_MODE 81h and PROT_MODE
// 02h written at MON3> give 83h at the program, and 81h back at MON3>.

async function goCarries(svc) {
  const { m } = await inSession({ "RET.BIN": bin(0xc9) }, { svc });
  assert.ok(ok(line(m, "LOAD RET.BIN")));
  m.write(0x089d, 0x81);
  m.write(0x089e, 0x02);
  goTo(m, "GO", 0x4000, 5_000_000);
  assert.equal(m.sysCtrl, 0x83, `the latch at 4000h: ${hex2(m.sysCtrl)}h`);
  assert.equal(m.read(0x40), m.sysCtrl, "LATCHV equals the latch at 4000h");
  toMon3(m, 5_000_000);
  assert.equal(m.sysCtrl, 0x81, `the latch at MON3>: ${hex2(m.sysCtrl)}h`);
  assert.equal(m.read(0x40), m.sysCtrl, "LATCHV equals the latch at MON3>");
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG65 go carries protect and caps", () => goCarries());

test("KG65 mutant: GOKEEP EQU $00 drops PROTECT and CAPS at GO", async () => {
  const svc = await mon3Variant([["GOKEEP EQU $82\n", "GOKEEP EQU $00\n"]]);
  await assert.rejects(goCarries(svc), /the latch at 4000h/);
});

// A program that clears 0005h-0007h: every BDOS call the service makes goes
// through its header's JP, so each way out still works.

const CLEAR5 = [0xaf, 0x32, 0x05, 0x00, 0x32, 0x06, 0x00, 0x32, 0x07, 0x00]; // XOR A; LD (0005h),A; (0006h); (0007h)

/** The installed service's image, as relocated in memory. */
const loadedImage = (m, svc) => bytesAt(m, pageOf(m) << 8, svc.image);

/** The static check: no CALL 0005h and no JP 0005h in the image as loaded. */
async function noCall5(svc) {
  const { m, svc: s } = await inSession({}, { svc });
  const image = loadedImage(m, s);
  for (const op of [0xcd, 0xc3]) {
    const at = image.findIndex((b, i) => b === op && image[i + 1] === 0x05 && image[i + 2] === 0x00);
    assert.equal(at, -1, `no ${hex2(op)} 05 00 in the relocated image (at ${at})`);
  }
}

/** The three exits with 0005h-0007h cleared. */
async function bdosDamaged(svc) {
  const files = { "R0.BIN": bin(CLEAR5, 0xc7), "J0.BIN": bin(CLEAR5, 0xc3, 0, 0), "RET.BIN": bin(CLEAR5, 0xc9), "ONE.BIN": bin(0xc9) };
  const { m } = await inSession(files, { svc });
  for (const name of ["R0.BIN", "J0.BIN"]) {
    assert.ok(ok(line(m, `LOAD ${name}`)), name);
    m.mark = m.output.length;
    m.type("GO\r");
    const from = m.mark;
    m.runUntil(() => m.waitingForInput() && PROMPT.test(m.text(from)), 60_000_000, `A> after ${name}`);
    const dir = m.command("DIR");
    for (const f of ["MON3.SVC", ...Object.keys(files)]) assert.match(dir, new RegExp(`\\b${f.split(".")[0]}\\s+${f.split(".")[1]}\\b|\\b${f.replace(".", "\\.")}\\b`), `${name}: DIR lists ${f}`);
    assert.ok(line(m, "MON3.SVC /E").mon3, `${name}: and the session enters again`);
  }
  assert.ok(ok(line(m, "LOAD RET.BIN")));
  m.mark = m.output.length;
  m.type("GO\r");
  toMon3(m, 10_000_000);
  assert.equal(m.read(7), 0, "0007h holds 0");
  assert.ok(refused(line(m, "LOAD ONE.BIN")), "LOAD refused while 0007h holds 0");
  m.mark = m.output.length;
  m.type("EXIT\r");
  assert.match(toPrompt(m), /A>$/, "EXIT reaches A>");
}

test("KG65 bdos page damaged", async () => {
  await noCall5();
  await bdosDamaged();
});

test("KG65 mutant: the hook's BDOS 37 through 0005h hangs after RST 00h", async () => {
  const svc = await mon3Variant([["RESETD:\n  ld de,0-1\n  ld c,37\n  jp BDOS\n", "RESETD:\n  ld de,0-1\n  ld c,37\n  jp $0005\n"]]);
  await assert.rejects(bdosDamaged(svc), /A> after R0\.BIN/);
});

test("KG65 mutant: LOAD's BDOS 15 through 0005h fails the static check", async () => {
  const svc = await mon3Variant([["  ld c,15        ; open\n  call BDOS\n", "  ld c,15        ; open\n  call $0005\n"]]);
  await assert.rejects(noCall5(svc), /no CD 05 00/);
});

// File names: a wildcard, a name over eight characters or a type over
// three is refused before BDOS 15, for .BIN and .HEX alike.

const NAMES = (t) => [`LOAD HELLO?.${t}`, `LOAD H*.${t}`, `LOAD HELLO3.${t[0]}?${t[2]}`, `LOAD ABCDEFGHI.${t}`, `LOAD HELLO3.${t}X`];

async function fileNames(svc) {
  const h = await hello3();
  const files = { "HELLO3.BIN": h, "ABCDEFGH.BIN": h, "HELLO3.HEX": hexFile([[0x4000, h]]), "ABCDEFGH.HEX": hexFile([[0x4000, h]]), "ONE.BIN": bin(0xc9) };
  const { m, svc: s } = await inSession(files, { svc });
  for (const cmd of [...NAMES("BIN"), ...NAMES("HEX")]) {
    assert.ok(ok(line(m, "LOAD ONE.BIN 5000")), "a good load first");
    const [before, opens] = [tpaDigest(m), m.opens.length];
    const r = line(m, cmd);
    assert.ok(refused(r), `${cmd}: ? (${JSON.stringify(r.out)})`);
    assert.deepEqual(m.opens.slice(opens), [], `${cmd}: BDOS 15 never called`);
    assert.equal(tpaDigest(m), before, `${cmd}: nothing written`);
    assert.equal(runnable(m, s), 0, `${cmd}: nothing runnable`);
  }
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG64 file names", () => fileNames());

test("KG64 mutant: the wildcard test removed loads HELLO?.BIN", async () => {
  const svc = await mon3Variant([["  cp '?'\n  scf\n  ret z          ; a wildcard\n  cp '*'\n  scf\n  ret z          ; and the other\n", ""]]);
  await assert.rejects(fileNames(svc), /LOAD HELLO\?\.BIN: \?/);
});

test("KG64 mutant: the name-length test removed loads ABCDEFGH.BIN for ABCDEFGHI.BIN", async () => {
  const svc = await mon3Variant([["  ret c          ; a wildcard\n  bit 7,b        ; B below 0: too long\n  scf\n  ret nz\n", "  ret c          ; a wildcard\n"]]);
  await assert.rejects(fileNames(svc), /LOAD ABCDEFGHI\.BIN: \?/);
});

test("KG64 mutant: the type-length test removed loads HELLO3.BIN for HELLO3.BINX", async () => {
  const svc = await mon3Variant([["  ret c          ; a wildcard\n  bit 7,b        ; too long\n  scf\n  ret nz\n", "  ret c          ; a wildcard\n"]]);
  await assert.rejects(fileNames(svc), /LOAD HELLO3\.BINX: \?/);
});

// HEX loading. Each good file writes its records' bytes and nothing else in
// the TPA, and leaves a program runnable at 4000h; each bad one is refused
// with nothing written and nothing runnable, also after a good load.

/** The TPA's bytes that differ from BEFORE, outside the [address, bytes] blocks; and the blocks' bytes as loaded. */
function written(m, before, blocks) {
  const now = tpaBytes(m);
  const inside = (a) => blocks.some(([at, b]) => a >= at && a < at + b.length);
  const stray = [];
  for (let i = 0; i < now.length; i += 1) if (now[i] !== before[i] && !inside(i + 0x100)) stray.push((i + 0x100).toString(16));
  return { stray, blocks: blocks.map(([at, b]) => [at, [...bytesAt(m, at, b.length)]]) };
}

/** Load FILE in M, checking the blocks, the rest of the TPA, and RUNOK. */
function loadsAs(m, svc, file, blocks) {
  const before = tpaBytes(m);
  const r = line(m, `LOAD ${file}`);
  assert.ok(ok(r), `LOAD ${file}: ${JSON.stringify(r.out)}`);
  const w = written(m, before, blocks);
  assert.deepEqual(w.stray, [], `${file}: nothing written outside its records`);
  assert.deepEqual(w.blocks, blocks.map(([at, b]) => [at, [...b]]), `${file}: its records' bytes`);
  assert.equal(runnable(m, svc), 1, `${file}: runnable`);
}

/** One-record files at the edges of what may load: P is the page of (0006h). */
const edges = (P) => ({
  "TOP.HEX": [[P - 16, Uint8Array.from({ length: 16 }, (_, i) => i + 1)]],
  "LOW.HEX": [[0x0100, Uint8Array.from({ length: 16 }, (_, i) => 0x30 + i)]],
  "B07FF.HEX": [[0x07f0, Uint8Array.from({ length: 16 }, (_, i) => 0x50 + i)]],
  "A0900.HEX": [[0x0900, Uint8Array.from({ length: 16 }, (_, i) => 0x70 + i)]],
});

async function hexLoads(svc) {
  svc ??= await mon3Build();
  const h = await hello3();
  const P = figures(svc).top;
  const mz = await realProgram("matrixz80");
  const mzBlocks = [[0x4000, mz.subarray(0, 0x38)], [0x4100, mz.subarray(0x100, 0x118)]];
  const text = {
    "HELLO3.HEX": hexFile([[0x4000, h]]),
    "MZ80.HEX": hexFile(mzBlocks),
    "LOWER.HEX": Buffer.from(hexFile([[0x4000, h]]).toString("latin1").toLowerCase(), "latin1"),
    "BIG16K.HEX": hexFile([[0x4000, BIG16K]]),
    ...Object.fromEntries(Object.entries(edges(P)).map(([n, b]) => [n, hexFile(b)])),
  };
  assert.equal(sha(text["HELLO3.HEX"]), HASHES["HELLO3.HEX"], "HELLO3.HEX by the rule");
  assert.equal(sha(text["BIG16K.HEX"]), HASHES["BIG16K.HEX"], "BIG16K.HEX by the rule");
  assert.equal(sha(BIG16K), HASHES["BIG16K.BIN"], "BIG16K.BIN by the rule");
  const { m } = await inSession({ "BINARY.HEX": hexFile([[0x4000, h]]) }, { svc, text });
  for (const [file, blocks] of [
    ["HELLO3.HEX", [[0x4000, h]]],
    ["MZ80.HEX", mzBlocks],
    ["LOWER.HEX", [[0x4000, h]]],
    ["BINARY.HEX", [[0x4000, h]]],
    ["BIG16K.HEX", [[0x4000, BIG16K]]],
    ...Object.entries(edges(P)),
  ]) {
    loadsAs(m, svc, file, blocks);
  }
  // HELLO3.HEX and MZ80.HEX load under MON-3's own intelHexLoad too, to the same bytes.
  assert.equal(sha(text["MZ80.HEX"]), HASHES["MZ80.HEX"], "MZ80.HEX by the rule");
  for (const [file, blocks] of [["HELLO3.HEX", [[0x4000, h]]], ["MZ80.HEX", mzBlocks]]) {
    const read = await referenceHexLoad(text[file]);
    for (const [at, b] of blocks) assert.deepEqual(Array.from(b, (_, i) => read(at + i)), [...b], `${file} under MON-3's call 24`);
  }
  // GO with no address runs at 4000h, with KG60's registers.
  assert.ok(ok(line(m, "LOAD HELLO3.HEX")));
  goTo(m, "GO", 0x4000, 20_000_000);
  const c = m.cpu.cpu;
  assert.deepEqual([c.a, c.b, c.c, (c.d << 8) | c.e, (c.h << 8) | c.l, c.sp & 0xffff, c.iff1 ? 1 : 0], [0xff, 0x01, 0x00, 0x0049, 0x4000, 0x087e, 0], "KG60's registers at 4000h");
  return m;
}

test("KG64 hex loads", () => hexLoads());

/** The cycles LOAD FILE takes in M, from the CR's reception to MON3>. */
function loadCycles(m, file) {
  m.mark = m.output.length;
  m.type(`LOAD ${file}\r`);
  const from = m.cycles;
  toMon3(m, 200_000_000);
  return m.cycles - from;
}

const HEX_CEILING = 70_000_000;

async function hexTime(svc) {
  const { m, svc: s } = await inSession({}, { svc, text: { "BIG16K.HEX": hexFile([[0x4000, BIG16K]]) } });
  const t = loadCycles(m, "BIG16K.HEX");
  assert.ok(ok({ out: m.text(m.mark), mon3: true }), "BIG16K.HEX loads");
  assert.equal(runnable(m, s), 1);
  console.log(`LOAD BIG16K.HEX: ${t.toLocaleString("en")} cycles, the ceiling ${HEX_CEILING.toLocaleString("en")}`);
  assert.ok(t <= HEX_CEILING, `${t.toLocaleString("en")} cycles, at most ${HEX_CEILING.toLocaleString("en")}`);
}

test("KG64 hex time", () => hexTime());

/** HELLO3's data records, and the file with RECORDS in place of the last ones. */
const helloRecords = async () => dataRecords([[0x4000, await hello3()]]);

/** The bad HEX files by name: [bytes, written as text]. P is the page of (0006h). */
async function badFiles(P) {
  const recs = await helloRecords();
  const last = recs.at(-1);
  const badSum = last.slice(0, -2) + ((parseInt(last.slice(-2), 16) + 1) & 0xff).toString(16).toUpperCase().padStart(2, "0");
  const sixteen = (b) => Array.from({ length: 16 }, (_, i) => b + i);
  const one = (at, data = sixteen(1)) => record(at, 0, data);
  const files = {
    "BADSUM.HEX": [...recs.slice(0, -1), badSum, END],
    "BADDIG.HEX": [...recs.slice(0, -1), last.slice(0, 11) + "G" + last.slice(12), END],
    "EMPTYREC.HEX": [record(0x4000, 0, []), END],
    ...Object.fromEntries([2, 3, 4, 5, 6].map((t) => [`TYPE${t}.HEX`, [record(0x4000, t, [0, 0x40]), END]])),
    "WRAP.HEX": [one(0xfff8), END],
    "OVERTOP.HEX": [one(P - 15), END],
    "UNDER.HEX": [one(0x00f0), END],
    "INTO800.HEX": [one(0x07f1), END],
    "AT8FF.HEX": [one(0x08ff), END],
    "AFTEROOR.HEX": [one(0x0800), one(0x4000), END],
    "NOEND.HEX": recs,
    "AFTEREND.HEX": [...recs, END, one(0x5000)],
    "ENDLEN.HEX": [...recs, record(0, 1, [0])],
    "ENDSUM.HEX": [...recs, ":00000001FE"],
  };
  const out = Object.fromEntries(Object.entries(files).map(([n, ls]) => [n, [lines(ls), true]]));
  // Text other than CR and LF between records, and 00h before the end record.
  const joined = (sep) => Buffer.from(`${recs[0]}\r\n${sep}${recs.slice(1).join("\r\n")}\r\n${END}\r\n`, "latin1");
  out["SPACE.HEX"] = [joined(" "), true];
  out["NUL.HEX"] = [joined("\0"), true];
  out["ENDNUL.HEX"] = [Buffer.concat([lines([...recs, END]), Buffer.from("\0", "latin1"), lines([one(0x5000)])]), true];
  out["EMPTY.HEX"] = [new Uint8Array(0), false];
  out["SUB.HEX"] = [new Uint8Array(0), true];
  return out;
}

async function hexRefused(svc) {
  svc ??= await mon3Build();
  const P = figures(svc).top;
  const bad = await badFiles(P);
  // At 5000h, so that a bad file's good records would change the TPA.
  const text = { "GOOD.HEX": hexFile([[0x5000, await hello3()]]) };
  const files = {};
  for (const [n, [b, t]] of Object.entries(bad)) (t ? text : files)[n] = b;
  const { m } = await inSession(files, { svc, text });
  for (const cmd of [...Object.keys(bad).map((n) => `LOAD ${n}`), "LOAD GOOD.HEX 5000"]) {
    assert.ok(ok(line(m, "LOAD GOOD.HEX")), "a good load first");
    const before = tpaDigest(m);
    const r = line(m, cmd);
    assert.ok(refused(r), `${cmd}: ? (${JSON.stringify(r.out)})`);
    assert.equal(tpaDigest(m), before, `${cmd}: nothing written`);
    assert.equal(runnable(m, svc), 0, `${cmd}: nothing runnable`);
  }
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG64 hex refused", () => hexRefused());

/** A disk error in the pass WRITING (0 or 1): the session ends at A>, and nothing is runnable at re-entry. */
async function hexDiskError(writing) {
  const svc = await mon3Build();
  const { m } = await inSession({}, { svc, text: { "BIG16K.HEX": hexFile([[0x4000, BIG16K]]) } });
  const p = pageOf(m) << 8;
  const fcb = p + svc.symbols.FCB;
  m.mark = m.output.length;
  m.type("LOAD BIG16K.HEX\r");
  m.runUntil(() => m.read(p + svc.symbols.HWRT) === writing && m.read(fcb + 12) === 1, 200_000_000, `the ${writing ? "second" : "first"} pass's second extent`);
  const sd = m.sd;
  m.sd = null; // the card taken out
  const from = m.mark;
  m.runUntil(() => m.waitingForInput() && /Bad Sector$/.test(m.text(from)), 200_000_000, "the BDOS's error");
  m.sd = sd;
  m.type("\r");
  assert.match(toPrompt(m, from), /Bdos Err On A: Bad Sector\r\nA>$/, "warm boot to A>");
  assert.equal(word(m, word(m, 1) + 1), m.sym("WBOOTR"), "the session ended");
  assert.ok(line(m, "MON3.SVC /E").mon3);
  assert.equal(runnable(m, svc), 0, "nothing runnable");
  assert.ok(refused(line(m, "GO")), "GO refused at re-entry");
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG64 hex disk error", async () => {
  await hexDiskError(0);
  await hexDiskError(1);
});

// The loader's mutants, each caught by its row.

const hexMutant = (name, edits, run, pattern) =>
  test(`KG64 mutant: ${name}`, async () => {
    const svc = await mon3Variant(edits);
    await assert.rejects(run(svc), pattern);
  });

hexMutant("single-pass loading leaves the bad-checksum file's good records written", [["  xor a          ; the checking pass\n", "  ld a,1\n"]], hexRefused, /LOAD BADSUM\.HEX: nothing written/);
hexMutant("the checksum test removed loads BADSUM.HEX", [["  ld a,c\n  or a           ; Z: the sum is 0\n  jr z,HP1       ; good: the next\n  scf\n  ret\n", "  jr HP1\n"]], hexRefused, /LOAD BADSUM\.HEX: \?/);
hexMutant("the type test removed loads type 02h as data", [["  inc a          ; 00h: data\n  scf\n  ret nz         ; not data\n", ""]], hexRefused, /LOAD TYPE2\.HEX: \?/);
hexMutant("the per-record range test removed loads into 0800h-08FFh", [["  call RANGE     ; as a .BIN load is\n  pop de\n  ret c          ; out of bounds\n", "  pop de\n"]], hexRefused, /LOAD (WRAP|OVERTOP|UNDER|INTO800|AT8FF)\.HEX: \?/);
hexMutant("the end-record requirement removed loads NOEND.HEX", [["  jr z,HP1       ; LF\n  scf            ; anything else\n", "  jr z,HP1       ; LF\n  cp $1A\n  ret z\n  scf\n"]], hexRefused, /LOAD NOEND\.HEX: \?/);
hexMutant("the after-the-end test removed loads AFTEREND.HEX", [["  jr z,HE1       ; LF\n  scf            ; anything else\n  ret\n", "  jr z,HE1       ; LF\n  jr HE1\n"]], hexRefused, /LOAD AFTEREND\.HEX: \?/);
hexMutant("the lower-case path removed refuses the lower-case HELLO3.HEX", [["  cp 'a'\n  jr c,HEXD1     ; not lower case\n  sub $20        ; a to A\n", ""]], hexLoads, /LOAD LOWER\.HEX/);
hexMutant("the 00h acceptance after the end record removed refuses the binary-written HELLO3.HEX", [["  ret z          ; the text's end, NC\n  or a\n  jr z,HE1       ; 00h\n", "  ret z          ; the text's end, NC\n"]], hexLoads, /LOAD BINARY\.HEX/);
hexMutant("the loader reading the file three times misses the time", [["  cp 2\n  jr c,CHEX1     ; then the writing pass\n", "  cp 3\n  jr c,CHEX1     ; then the writing pass\n"]], hexTime, /at most 70,000,000/);

// The matrix keyboard, read at port FEh, against MON-3 with the matrix
// fitted on both sides: calls 16, 17, 18, 53 and 54, RST 08h and RST 20h.

const MK = { A: 0x24, S: 0x36, D0: 0x13, D1: 0x14, D5: 0x18, ENTER: 0x0a, ESC: 0x0c, SHIFT: 0x00, CTRL: 0x01, FN: 0x02, CAPS: 0x07 };
const MATRIX_LIST = [
  ["no key", []],
  ["A", [MK.A]],
  ["0", [MK.D0]],
  ["Enter", [MK.ENTER]],
  ["Esc", [MK.ESC]],
  ["Fn with 1", [MK.FN, MK.D1]],
  ["Shift with A", [MK.SHIFT, MK.A]],
  ["Ctrl with A", [MK.CTRL, MK.A]],
  ["A and S", [MK.A, MK.S]],
];
const RST = { 0x08: 0xcf, 0x10: 0xd7, 0x18: 0xdf, 0x20: 0xe7, 0x28: 0xef, 0x30: 0xf7, 0x38: 0xff };
const call = (sel, more = {}) => ({ ...more, regs: { bc: 0x1200 | sel, ...more.regs } });
const holding = (keys, more = {}) => ({ release: (side) => matrixUp(...keys)(side), ...more, atRestart: (side) => matrixDown(...keys)(side) });

/**
 * The rows of the matrix list for a call or restart. WAITS, for a call that
 * waits for a press: the keys go down after 200,000 cycles, 5 for "no key".
 */
function matrixRows(name, base, waits = false) {
  return MATRIX_LIST.map(([what, keys]) => {
    if (!waits) return holding(keys, { ...base, name: `${name}, ${what}` });
    const press = keys.length ? keys : [MK.D5];
    const events = [{ at: 200_000, fire: matrixDown(...press) }];
    // Two letters are no key to MON-3, which waits on: S goes up later.
    if (what === "A and S") events.push({ at: 400_000, fire: matrixUp(MK.S) });
    return { ...base, name: `${name}, ${what}`, events, release: matrixUp(...press) };
  });
}

let matrixSides;
const theMatrixSides = async () => (matrixSides ??= { ref: await referenceSide({ matrix: true }), ses: await sessionSide({ matrix: true }) });

async function matrixKeys(sides) {
  const { ref, ses } = sides ?? (await theMatrixSides());
  const digits = [0x0900, [0xeb, 0x28, 0xcd, 0xad, 0x2e, 0xa7]];
  const rows = [
    ...matrixRows("call 16", call(16)),
    ...matrixRows("call 17", call(17), true),
    ...matrixRows("call 18", call(18)),
    ...matrixRows("RST 08h", { op: RST[0x08] }, true),
    ...matrixRows("RST 20h", { op: RST[0x20], regs: { de: 0x0900 }, mem: digits, tx6: true }),
  ];
  const bad = compareRows(ref, ses, rows);
  // Calls 53 and 54 take DE and Z from call 18, with CAPS_LOCK 0 and 80h.
  const image = fixedImage();
  const keyRows = [];
  for (const [what, keys] of [...MATRIX_LIST, ["Caps", [MK.CAPS]]]) {
    const r18 = ref.run(holding(keys, { ...call(18), name: "call 18 for DE" }), image);
    const de = (r18.regs.d << 8) | r18.regs.e;
    for (const caps of [0x00, 0x80]) {
      const mem = [0x089c, [caps]];
      keyRows.push(holding(keys, { ...call(53, { regs: { de } }), mem, name: `call 53, ${what}, CAPS_LOCK ${caps}`, skip: ["h", "l"] }));
      keyRows.push(holding(keys, { ...call(54, { regs: { de, f: r18.regs.f } }), flags: [r18.regs.f], mem, name: `call 54, ${what}, CAPS_LOCK ${caps}`, skip: ["h", "l"] }));
    }
  }
  // 54's repeat: KEY_BUFF the held key and KEY_REPEAT 01h, one call.
  const rA = ref.run(holding([MK.A], { ...call(18), name: "call 18 for A" }), image);
  keyRows.push(holding([MK.A], { ...call(54, { regs: { de: (rA.regs.d << 8) | rA.regs.e, f: rA.regs.f } }), flags: [rA.regs.f], mem: [0x0889, [rA.regs.e, 0x20, 0x01]], name: "call 54, A repeated", skip: ["h", "l"] }));
  bad.push(...compareRows(ref, ses, keyRows));
  return bad;
}

/** HELLO3 on a session with the matrix fitted: 5 gives KG60's key-5 result, and Esc returns to MON3>. */
async function hello3Matrix(svc) {
  const { m } = await inSession({ "HELLO3.BIN": await hello3() }, { svc, machine: { matrix: true } });
  assert.ok(ok(line(m, "LOAD HELLO3.BIN")));
  goTo(m, "GO", 0x4000, 20_000_000);
  runFor(m, 3_000_000);
  const e0 = m.edges;
  m.tec1g.applyMatrixKey(MK.D5 >> 3, MK.D5 & 7, true);
  runFor(m, 400_000);
  m.tec1g.applyMatrixKey(MK.D5 >> 3, MK.D5 & 7, false);
  runFor(m, 400_000);
  assert.equal(m.edges - e0, 64, "one beep for 5");
  assert.equal(digitsOf(m).key, 0x05, "5 on the right two digits");
  m.tec1g.applyMatrixKey(MK.ESC >> 3, MK.ESC & 7, true);
  const from = m.output.length;
  m.runUntil(() => m.pc === 0x0049, 10_000_000, "the return after Esc");
  m.tec1g.applyMatrixKey(MK.ESC >> 3, MK.ESC & 7, false);
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(from)), 10_000_000, "MON3> after Esc");
  assert.ok(!line(m, "EXIT").mon3, "EXIT");
}

test("KG64 matrix keys", async () => {
  const sides = await theMatrixSides();
  assert.deepEqual(await matrixKeys(sides), []);
  // Caps through call 54 sets CAPS in the latch, with LATCHV equal.
  const { ses } = sides;
  const image = fixedImage();
  const r18 = ses.run(holding([MK.CAPS], { ...call(18), name: "Caps by 18" }), image);
  const S = ses.run(holding([MK.CAPS], { ...call(54, { regs: { de: (r18.regs.d << 8) | r18.regs.e, f: r18.regs.f } }), name: "Caps by 54" }), image);
  assert.equal(S.latch & 0x80, 0x80, "CAPS in the latch");
  assert.equal(S.latchv, S.latch, "LATCHV equal");
  assert.equal(S.mem[0x9c], 0x80, "CAPS_LOCK 80h");
  await hello3Matrix();
});

test("KG64 mutant: scanKeys without its matrix branch sees no matrix key", async () => {
  const svc = await mon3Variant([["  rrca\n  jr c,KBSCAN    ; bit 0: the matrix\n", "  rrca\n"]]);
  // Call 16's rows differ first; the waiting calls then never see a key.
  const ses = await sessionSide({ svc, matrix: true });
  const bad = compareRows(await referenceSide({ matrix: true }), ses, matrixRows("call 16", call(16)));
  assert.ok(bad.some((b) => b.startsWith("call 16, A")), bad.join("\n"));
});

// KG65: every implemented and translated RST 10h call, and the restarts,
// against MON-3 on its fixed inputs (stages/ks53-api-table.md).

const KEY = (k) => k ^ 0x20; // the runtime's keypad code for MON-3's key K
const K5 = KEY(0x05);
const KC = KEY(0x0c);
const KAD = KEY(0x13);
const press = (code, at = 0) => ({ at, fire: keyDown(code) });
const lift = (code, at = 0) => ({ at, fire: keyUp(code) });
const keys = (...codes) => (side) => codes.forEach((c) => keyUp(c)(side));
const bytes16 = (n, seed) => Array.from({ length: n }, (_, i) => (i * 37 + seed) & 0xff);
const hexes = (v) => v.toString(16).padStart(2, "0");

/** The keypad rows of a call or restart: no key, 5 new, 5 held, AD. WAITS: each key goes down after 200,000 cycles. */
function keypadRows(name, base, waits = false) {
  if (!waits)
    return [
      { ...base, name: `${name}, no key` },
      { ...base, name: `${name}, key 5 new`, atRestart: keyDown(K5), release: keys(K5) },
      { ...base, name: `${name}, key 5 held`, mem: [0x0889, [0x05, 0x00]], atRestart: keyDown(K5), release: keys(K5) },
      { ...base, name: `${name}, key AD`, atRestart: keyDown(KAD), release: keys(KAD) },
    ];
  return [
    { ...base, name: `${name}, no key`, events: [press(K5, 200_000)], release: keys(K5) },
    { ...base, name: `${name}, key 5 new`, events: [press(K5, 200_000)], release: keys(K5) },
    { ...base, name: `${name}, key 5 held`, mem: [0x0889, [0x05, 0x00]], atRestart: keyDown(K5), events: [lift(K5, 200_000), press(K5, 400_000)], release: keys(K5) },
    { ...base, name: `${name}, key AD`, events: [press(KAD, 200_000)], release: keys(KAD) },
  ];
}

/** Rows for SEL with each value of A in AS, and MORE. */
const withA = (sel, as, more = {}) => as.map((a) => call(sel, { ...more, name: `call ${sel}, A ${hexes(a)}`, regs: { ...more.regs, a } }));

/** The RX rows: BYTES queued at the restart. */
const rx = (bytes) => (side) => {
  side.m.tec1g.queueSerial(bytes);
  side.m.tec1g.ioHandlers.read(0x00);
};

const PATTERN = bytes16(128, 5);
const SETTERS = { 41: "setCaps", 43: "setProtect" };
const GETTERS = [37, 38, 39, 40];

function apiRows() {
  const rows = [];
  const add = (...r) => rows.push(...r);
  add(call(0, { name: "call 0", skip: ["h", "l"], strAtHL: 8 }));
  add(call(1, { name: "call 1", skip: ["h", "l"], strAtHL: 8 }));
  add(call(3, { name: "call 3", tx6: true }));
  add(...withA(4, [0x00, 0x5a, 0xa5, 0xff], { regs: { de: 0x0900 }, skip: ["b", "c"] }));
  add(...withA(5, [0x00, 0x2c, 0x9f, 0xff]));
  add(...withA(6, [0x00, 0x1f, 0x20, 0x41, 0x7e, 0x7f, 0x80, 0xff]));
  for (const b of [1, 4, 0]) {
    const n = b || 256;
    const s1 = bytes16(n, 9);
    for (const differ of [false, true]) {
      const s2 = [...s1];
      if (differ) s2[n - 1] ^= 0x55;
      const mem = Array(0x200).fill(0);
      mem.splice(0, n, ...s1);
      mem.splice(0x100, n, ...s2);
      add(call(7, { name: `call 7, B ${b}, ${differ ? "differing at the last byte" : "equal"}`, regs: { bc: (b << 8) | 7, hl: 0x0900, de: 0x0a00 }, mem: [0x0900, mem] }));
    }
  }
  for (const hl of [0x0000, 0x4a2f, 0xffff]) add(call(8, { name: `call 8, HL ${hl.toString(16)}`, regs: { hl, de: 0x0900 } }));
  add(...withA(9, [0x00, 0x5c, 0xff], { regs: { de: 0x0900 } }));
  add(call(10, { name: "call 10", regs: { de: 0x0900 }, mem: [0x0900, [0xeb, 0x28, 0xcd, 0xad, 0x2e, 0xa7]], tx6: true }));
  add(call(11, { name: "call 11", events: [press(K5, 200_000)], release: keys(K5), skip: ["h", "l"], tx6: true, waits: true }));
  // The LCD's address counter, which a status read returns, set alike.
  add(call(12, { name: "call 12", reads: [0x04], setup: (side) => side.m.tec1g.ioHandlers.write(0x04, 0x80) }));
  add(call(13, { name: "call 13", regs: { hl: 0x0900 }, mem: [0x0900, [0x41, 0x42, 0x00]] }));
  add(call(14, { name: "call 14", regs: { a: 0x41 } }));
  for (const b of [0x01, 0x80]) add({ name: `call 15, B ${hexes(b)}`, regs: { bc: (b << 8) | 15 } });
  add(...keypadRows("call 16", call(16)));
  add(...keypadRows("call 17", call(17), true));
  for (const [what, mask] of [["none", 0], ["up", 0x01], ["fire 1", 0x40], ["up and right", 0x09]])
    add(call(19, { name: `call 19, ${what}`, atRestart: (side) => side.m.tec1g.setJoystickState(mask), release: (side) => side.m.tec1g.setJoystickState(0) }));
  add(call(20, { name: "call 20" }));
  add(call(21, { name: "call 21" }));
  add(...withA(22, [0x00, 0x55, 0xff]));
  for (const b of [0x00, 0x55, 0xff]) add(call(23, { name: `call 23, ${hexes(b)} queued`, atRestart: rx([b]), max: 200_000 }));
  for (const de of [1, 16, 17]) {
    add(call(25, { name: `call 25, DE ${de}`, regs: { hl: 0x0980, de }, mem: [0x0980, PATTERN] }));
    add(call(28, { name: `call 28, DE ${de}`, regs: { hl: 0x0980, de }, mem: [0x0980, PATTERN] }));
  }
  add(call(26, { name: "call 26", regs: { hl: 0x0900, de: 3 }, atRestart: rx([1, 2, 3]) }));
  for (const b of [1, 8]) add(call(29, { name: `call 29, B ${b}`, regs: { bc: (b << 8) | 29, hl: 0x0900, de: 0x0980 }, mem: [0x0900, bytes16(16, 3)] }));
  for (const [st, en] of [[0x4000, 0x40ff], [0x4000, 0x4000], [0x4001, 0x4000]])
    add(call(30, { name: `call 30, ${st.toString(16)} to ${en.toString(16)}`, regs: { hl: 0x0900 }, mem: [0x0900, [st & 0xff, st >> 8, en & 0xff, en >> 8]] }));
  for (const hl of [0, 1, 0x1000]) add(call(33, { name: `call 33, HL ${hl.toString(16)}`, regs: { hl } }));
  for (const [hl, b] of [[0x19, 0x8c], [0x7f, 0x01]]) add({ name: `call 34, HL ${hl.toString(16)}, B ${hexes(b)}`, regs: { bc: (b << 8) | 34, hl }, tx6: true });
  add(call(35, { name: "call 35", regs: { de: 0x0900 }, mem: [0x0900, [0x06, 0x00, 0x0a, 0x1f]], tx6: true }));
  for (const [sel, name] of Object.entries(SETTERS))
    for (const a of [0x00, 0x80, 0x02, 0xff]) {
      add(call(Number(sel), { name: `call ${sel} ${name}, A ${hexes(a)}`, regs: { a } }));
      for (const g of GETTERS) add(call(Number(sel), { name: `call ${sel}, A ${hexes(a)}, then call ${g}`, regs: { a }, regs2: { bc: 0x1200 | g } }));
    }
  add(call(48, { name: "call 48" }));
  for (const g of GETTERS) add(call(48, { name: `call 48, then call ${g}`, regs2: { bc: 0x1200 | g } }));
  for (const g of [...GETTERS, 56]) add(call(g, { name: `call ${g}` }));
  add(call(45, { name: "call 45", regs: { hl: 0x0900 }, mem: [0x0900, [0x4f, 0x4b, 0x00]] }));
  for (const seed of [0x00, 0x01, 0x80, 0xff]) add(call(49, { name: `call 49, RNG_SEED ${hexes(seed)}`, mem: [0x08b0, [seed]], skip: ["a", "f"] }));
  add(call(55, { name: "call 55, key C", events: [press(KC, 200_000)], release: keys(KC), skip: ["h", "l"] }));
  add(call(55, { name: "call 55, key 5", events: [press(K5, 200_000)], release: keys(K5), skip: ["h", "l"] }));
  add(call(62, { name: "call 62", regs: { iy: 0x0900 }, mem: [0x0900, bytes16(24, 11)] }));
  for (const b of [19, 0xff]) add(call(46, { name: `call 46, B ${b}`, regs: { bc: (b << 8) | 46 } }));
  return rows;
}

function restartRows() {
  const digits = [0x0900, [0xeb, 0x28, 0xcd, 0xad, 0x2e, 0xa7]];
  return [
    ...keypadRows("RST 08h", { op: RST[0x08] }, true),
    ...keypadRows("RST 20h", { op: RST[0x20], regs: { de: 0x0900 }, mem: digits, tx6: true }),
    { name: "RST 28h", op: RST[0x28] },
    { name: "RST 38h", op: RST[0x38], memFrom: "INTH" },
  ];
}

/** Rows that need the driver's own addresses: USER_INT at its handler. */
const placed = (rows, sym) => rows.map((r) => (r.memFrom ? { ...r, mem: [0x0892, [sym[r.memFrom] & 0xff, sym[r.memFrom] >> 8]] } : r));

let keypadSides;
const theKeypadSides = async () => (keypadSides ??= { ref: await referenceSide(), ses: await sessionSide() });

test("KG65 rst 10h calls", { timeout: 900_000 }, async () => {
  const { ref, ses } = await theKeypadSides();
  const bad = compareRows(ref, ses, apiRows());
  bad.push(...(await matrixKeys(await theMatrixSides())));
  assert.deepEqual(bad, []);
  // Call 2 is judged on the session's side alone.
  await preInit();
});

test("KG65 restarts", async () => {
  const { ref, ses } = await theKeypadSides();
  assert.deepEqual(compareRows(ref, ses, placed(restartRows(), ref.sym)), []);
});

// Refusals: each deferred or unsupported selector, 63 and FFh show
// displayError as call 11 does, and change nothing else. RTCAPI answers
// with carry and A = B. RST 18h stays refused.

const DEFERRED = [24, 27, 31, 32, 36, 47, 50, 51, 52, 57];
const UNSUPPORTED = [42, 44, 58, 59, 60, 61];
const REFUSED = [...DEFERRED, ...UNSUPPORTED, 63, 0xff];

/** A refusal row for selector SEL (or restart OP), compared with MON-3's call 11 on the same key. */
const refusalRow = (sel, op) => ({
  name: op ? "RST 18h" : `call ${sel}`,
  ...(op ? { op } : call(sel, { regs: { a: 0xff } })),
  ref: { op: RST[0x10], regs: { bc: 0x1200 | 11, a: 0xff } },
  events: [press(K5, 200_000)],
  release: keys(K5),
  skip: ["h", "l"],
  tx6: true,
  waits: true,
});

/** 0800h-0DFFh as the fixed image, outside DISP_BUFF and the key variables: the addresses that differ. */
function changedOutside(mem) {
  const img = fixedImage();
  const out = [];
  for (let i = 0; i < 0x600; i += 1) {
    const a = 0x800 + i;
    if ((a >= 0x880 && a < 0x886) || (a >= 0x889 && a < 0x88c) || a === 0x88e || (a >= 0x892 && a < 0x896)) continue;
    if (mem[i] !== img[i]) out.push(a.toString(16));
  }
  return out;
}

async function refusals(sides) {
  const { ref, ses } = sides ?? (await theKeypadSides());
  const rows = [...REFUSED.map((s) => refusalRow(s)), refusalRow(0, RST[0x18])];
  for (const r of rows)
    r.check = (R, S) => {
      assert.deepEqual(changedOutside(S.mem), [], `${r.name}: nothing else in 0800h-0DFFh changed`);
      assert.equal(S.latch, 0x01, `${r.name}: the latch unchanged`);
    };
  const bad = compareRows(ref, ses, rows);
  // RTCAPI: carry and A = B for every B, and no port.
  const image = fixedImage();
  for (const b of [0, 2, 18, 19, 0xff]) {
    const S = ses.run(call(46, { name: `call 46, B ${b}`, regs: { bc: (b << 8) | 46 } }), image);
    if (S.regs.a !== b || !(S.regs.f & 1) || S.writes.length) bad.push(`call 46, B ${b}: A ${hexes(S.regs.a)}, F ${hexes(S.regs.f)}, ${S.writes.length} port writes`);
  }
  return bad;
}

test("KG65 refusals", async () => {
  assert.deepEqual(await refusals(), []);
});

test("KG65 mutant: a deferred selector's word pointed at TDLY returns as a success", async () => {
  const svc = await mon3Variant([["  DW DERR        ; 24 intelHexLoad\n", "  DW TDLY        ; 24 intelHexLoad\n"]]);
  const bad = compareRows((await theKeypadSides()).ref, await sessionSide({ svc }), [refusalRow(24)]);
  assert.ok(bad.length, "call 24 caught");
});

// The latch: calls 43 with 02h and 41 with 80h, then a return, reach MON3>
// with PROTECT clear and CAPS set, LATCHV equal.

async function latchCalls(svc) {
  const prog = bin(0x3e, 0x02, 0x0e, 43, 0xd7, 0x3e, 0x80, 0x0e, 41, 0xd7, 0xc9); // LD A,2; LD C,43; RST 10h; LD A,80h; LD C,41; RST 10h; RET
  const { m } = await inSession({ "LATCH.BIN": prog }, { svc });
  assert.ok(ok(line(m, "LOAD LATCH.BIN")));
  goTo(m, "GO", 0x400a, 5_000_000);
  assert.equal(m.sysCtrl & 0x82, 0x82, "PROTECT and CAPS in the latch at the program's RET");
  assert.equal(m.read(0x40), m.sysCtrl, "LATCHV equal at the RET");
  toMon3(m, 5_000_000);
  assert.equal(m.sysCtrl & 0x02, 0, "PROTECT clear at MON3>");
  assert.equal(m.sysCtrl & 0x80, 0x80, "CAPS set at MON3>");
  assert.equal(m.read(0x40), m.sysCtrl, "LATCHV equal at MON3>");
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG65 latch calls", async () => {
  await latchCalls();
  // 42 and 44 change nothing: the refusal rows, here with A FFh, keep the latch and SYS_MODE.
  const { ses } = await theKeypadSides();
  for (const sel of [42, 44]) {
    const S = ses.run(refusalRow(sel), fixedImage());
    assert.equal(S.latch, 0x01, `call ${sel}: the latch`);
    assert.equal(S.latchv, 0x01, `call ${sel}: LATCHV`);
    assert.deepEqual([S.mem[0x9d], S.mem[0x9e], S.mem[0x9f]], [0x01, 0, 0], `call ${sel}: SYS_MODE, PROT_MODE, XPND_MODE`);
  }
});

test("KG65 mutant: setCaps writing the latch without LATCHV", async () => {
  const svc = await mon3Variant([["  or LATSHD      ; the overlay off\n  ld (LATCH),a\n  out (SYSLAT),a\n  pop af\n", "  or LATSHD      ; the overlay off\n  out (SYSLAT),a\n  pop af\n"]]);
  await assert.rejects(latchCalls(svc), /LATCHV equal/);
});

// Call 2, preInit, on the session's side alone: the workspace set up again
// and the return path run, MON3> with nothing runnable and no warning.

async function preInit(svc) {
  const ses = await sessionSide({ svc });
  const { m } = ses;
  const garbage = Array.from({ length: 0xb0 }, (_, i) => (i * 13 + 7) & 0xff);
  m.mark = m.output.length;
  ses.run(call(2, { name: "call 2", mem: [0x0800, garbage], stopAt: ses.at("PROMPT"), max: 20_000_000 }), fixedImage());
  const out = toMon3(m, 10_000_000);
  assert.deepEqual(bytesAt(m, 0x800, 16), [...Buffer.from("MON3.1G\u00002025.16\u0000", "latin1")], "ROMSIG set again");
  assert.deepEqual(bytesAt(m, 0x886, 0x0c), [...fixedImage().subarray(0x86, 0x92)], "MON-3's defaults from 0886h");
  assert.deepEqual([m.read(0x8b1), m.read(0x8b2)], [0x1b, 0x00], "BAUD 001Bh");
  assert.equal(m.read(ses.at("RUNOK")), 0, "nothing runnable");
  assert.doesNotMatch(out, /Tables damaged/, "no warning");
  assert.ok(refused(line(m, "GO")), "GO refused");
  assert.ok(!line(m, "EXIT").mon3);
}


// Timing, on the same runtime: timeDelay equal; scanSegments 5,604 T to
// MON-3's 5,495; equal tone periods; txByte's writes at equal intervals,
// 833 T a data bit; each restart 101 T to the handler's first instruction
// after POP HL; the interrupt 103 T; the NMI equal to MON-3's.

/** A row that marks the cycle its routine starts at, and its RET's arrival back at the driver's NEXT. */
const timed = (side, row, sel) => ({ ...row, watch: { entry: routineOf(side, sel), back: side.sym.NEXT } });
const routineT = (R) => R.marks.back - R.marks.entry;
/**
 * The speaker's half periods in each tone: the cycle gaps between port 01h
 * writes that change bit 7, a tone ending at a gap of over 50,000 T. The
 * last write of each tone ends it and is not a period: there the session
 * loads TXI where MON-3 clears A, 3 T more.
 */
function tones(x) {
  const out = [];
  let tone = [];
  let level = null;
  let last = null;
  for (const w of x.writes.filter((v) => v.port === 0x01)) {
    if (last !== null && w.cycle - last > 50_000) {
      out.push(tone);
      tone = [];
      last = null;
      level = null;
    }
    const b = w.value & 0x80;
    if (level === null || b !== level) {
      if (last !== null) tone.push(w.cycle - last);
      last = w.cycle;
    }
    level = b;
  }
  out.push(tone);
  return out.map((t) => t.slice(0, -1));
}
const gaps = (x, port) => {
  const c = x.writes.filter((v) => v.port === port).map((v) => v.cycle);
  return c.slice(1).map((v, i) => v - c[i]);
};

/** The restart handlers' first instruction after POP HL, in the session. */
const HANDLERS = { 0x08: "R08", 0x10: "R10", 0x18: "R18", 0x20: "R20", 0x28: "R28", 0x30: "R30", 0x38: "R38" };

async function timing(sides) {
  const { ref, ses } = sides ?? (await theKeypadSides());
  const image = fixedImage();
  const both = (row) => [ref.run(row, image), ses.run(row, image)];
  const out = {};
  for (const hl of [0, 1, 0x1000]) {
    const row = (side) => timed(side, call(33, { name: `call 33, HL ${hl}`, regs: { hl } }), 33);
    const [R, S] = [ref.run(row(ref), image), ses.run(row(ses), image)];
    assert.equal(routineT(S), routineT(R), `timeDelay, HL ${hl}: ${routineT(S)} T to MON-3's ${routineT(R)}`);
  }
  const scan = (side) => timed(side, call(10, { name: "call 10", regs: { de: 0x0900 } }), 10);
  const [R10, S10] = [ref.run(scan(ref), image), ses.run(scan(ses), image)];
  out.scan = { ref: routineT(R10), ses: routineT(S10) };
  assert.equal(routineT(R10), 5495, "MON-3's scanSegments");
  assert.equal(routineT(S10), 5604, "the session's scanSegments");
  for (const row of [call(3, { name: "call 3" }), { name: "call 34", regs: { bc: 0x8c00 | 34, hl: 0x19 } }, { name: "call 34, HL 7Fh", regs: { bc: 0x0100 | 34, hl: 0x7f } }, call(35, { name: "call 35", regs: { de: 0x0900 }, mem: [0x0900, [0x06, 0x00, 0x0a, 0x1f]] })]) {
    const [R, S] = both(row);
    assert.ok(tones(R).every((t) => t.length > 8), `${row.name}: tones`);
    assert.deepEqual(tones(S), tones(R), `${row.name}: equal tone periods`);
  }
  for (const a of [0x00, 0x55, 0xff]) {
    const [R, S] = both(call(22, { name: `call 22, A ${a}`, regs: { a } }));
    assert.deepEqual(gaps(S, 0x01), gaps(R, 0x01), `txByte ${a}: its port 01h writes at equal intervals`);
    assert.deepEqual(gaps(S, 0x01).slice(1, 8), Array(7).fill(833), `txByte ${a}: 833 T a data bit`);
  }
  // The restarts, by RST, then the interrupt and the NMI.
  out.rst = {};
  for (const [n, h] of Object.entries(HANDLERS)) {
    const S = ses.run({ name: `RST ${n}`, op: RST[n], regs: { bc: 0x1200 | 3 }, stopAt: ses.at(h) + 1 }, image);
    out.rst[n] = S.end - S.atRestart;
  }
  for (const [n, t] of Object.entries(out.rst)) assert.equal(t, 101, `RST ${Number(n).toString(16)}h: ${t} T to the handler after POP HL`);
  const irq = (nmi, stop) => ({ name: nmi ? "the NMI" : "the interrupt", op: 0xfb, next: "WAIT", events: [{ at: 200, fire: (side) => side.interrupt(nmi) }], mem: [nmi ? 0x0894 : 0x0892, [ref.sym.INTH & 0xff, ref.sym.INTH >> 8]], stopAt: stop });
  const SI = ses.run(irq(false, ses.at("R38") + 1), image);
  out.irq = SI.end - SI.irqAt;
  assert.equal(out.irq, 103, `the interrupt: ${out.irq} T from its acknowledge`);
  const [RN, SN] = [ref.run(irq(true, ref.sym.INTH), image), ses.run(irq(true, ref.sym.INTH), image)];
  out.nmi = { ref: RN.end - RN.irqAt, ses: SN.end - SN.irqAt };
  assert.equal(out.nmi.ses, out.nmi.ref, `the NMI: ${out.nmi.ses} T to MON-3's ${out.nmi.ref}`);
  return out;
}

test("KG65 timing", async () => {
  const t = await timing();
  console.log(`scanSegments ${t.scan.ses} T (MON-3 ${t.scan.ref}); restarts ${Object.values(t.rst).join(", ")} T; interrupt ${t.irq} T; NMI ${t.nmi.ses} T (MON-3 ${t.nmi.ref})`);
});

const timingMutant = (name, edits, pattern) =>
  test(`KG65 mutant: ${name}`, async () => {
    const svc = await mon3Variant(edits);
    await assert.rejects(timing({ ref: (await theKeypadSides()).ref, ses: await sessionSide({ svc }) }), pattern);
  });

timingMutant("scanSegments's on-delay 41h takes 5,682 T", [["  ld b,$40\n  djnz $         ; on for a while\n", "  ld b,$41\n  djnz $         ; on for a while\n"]], /the session's scanSegments/);
timingMutant("txByte reading BAUD plus one", [["  ld hl,(BAUD)   ; the bit's delay\n", "  ld hl,(BAUD)   ; the bit's delay\n  inc hl\n"]], /txByte 0: its port 01h writes/);
timingMutant("one more instruction in the latch stub takes 105 T", [
  ["GORET EQU $0049", "GORET EQU $004A"],
  ["NRETN EQU $004E", "NRETN EQU $004F"],
  ["  pop af\n  jp (hl)        ; to the handler\n", "  pop af\n  nop\n  jp (hl)        ; to the handler\n"],
  ["  DB $18,$F3     ; JR 0041h\n", "  DB $18,$F2     ; JR 0041h\n"],
], /RST 8h: 105 T/);
timingMutant("the 0066h stub with one more instruction", [
  ["  ret            ; and run\n\n; MON-3's variables", "  nop\n  ret            ; and run\n\n; MON-3's variables"],
  ["  ld de,NMIV     ; MON-3's NMI code\n  ld c,6\n", "  ld de,NMIV     ; MON-3's NMI code\n  ld c,7\n"],
], /the NMI/);

// KG65's mutants, one for each implemented or translated selector
// (stages/ks53-api-table.md, "KG65's mutants"). A shim takes the call's
// table word and runs the routine with the change; a change inside a
// routine is a patch of its source.

const apiText = () => readFileSync(resolve(ROOT, "drivers/mon3api.asm"), "utf8");
/** The edits that point selector SEL's table word at a shim of LINES. */
function shim(sel, lines) {
  const word = new RegExp(`^  DW \\S+ +; ${sel} \\S+\\n`, "m").exec(apiText())[0];
  return [
    [word, `  DW SHIMX       ; ${sel} shim\n`],
    ["\nAPI:\n", `\nSHIMX:\n${lines.map((l) => `  ${l}\n`).join("")}\nAPI:\n`],
  ];
}
const flipBits = (bits) => ["push af", "ex (sp),hl", "ld a,l", `xor ${bits}`, "ld l,a", "ex (sp),hl", "pop af", "ret"];
const firstAtDE = (routine) => ["push de", `call ${routine}`, "ex (sp),hl", "inc (hl)", "pop hl", "ret"];
const latchFlip = (routine, bit) => [`call ${routine}`, "push af", "ld a,(LATCH)", `xor ${bit}`, "ld (LATCH),a", "out (SYSLAT),a", "pop af", "ret"];
const after = (routine, ...ops) => [`call ${routine}`, ...ops, "ret"];
const before = (routine, ...ops) => [...ops, `jp ${routine}`];

const API_MUTANTS = [
  [0, "HL + 1 on return", shim(0, after("SWID", "inc hl"))],
  [1, "BC + 1", shim(1, after("VERID", "inc bc"))],
  [2, "WSINIT skipped", [["  call WSINIT    ; the workspace anew\n", ""]]],
  [3, "the first port 01h write's value + 1", [["  ld c,$40       ; half cycles\n  ld a,TXI\n", "  ld c,$40       ; half cycles\n  ld a,TXI+1\n"]]],
  [4, "the first byte written at DE + 1", shim(4, firstAtDE("TOSEG"))],
  [5, "H + 1", shim(5, after("ATOAS", "inc h"))],
  [6, "A + 1", shim(6, after("A2S", "inc a"))],
  [7, "Z flipped", shim(7, [`call SCMP`, ...flipBits("$40")])],
  [8, "the first byte written at DE + 1", shim(8, firstAtDE("HLSTR"))],
  [9, "the first byte written at DE + 1", shim(9, firstAtDE("HEXA"))],
  [10, "the first port 02h write's value + 1", [["SCN1:\n  ld a,(de)      ; its segments\n  out (SSEG),a\n", "SCN1:\n  ld a,(de)      ; its segments\n  inc a\n  out (SSEG),a\n"]]],
  [11, "the first byte of DISP_BUFF + 1", shim(11, after("DERR", "push hl", "ld hl,DISPB", "inc (hl)", "pop hl"))],
  [12, "returns without reading port 04h", shim(12, ["ret"])],
  [13, "the first LCD data write's value + 1", [["  out (LCDD),a   ; the character\n  jr LCDSTR\n", "  inc a\n  out (LCDD),a   ; the character\n  dec a\n  jr LCDSTR\n"]]],
  [14, "the LCD data write's value + 1", shim(14, before("LCDCHR", "inc a"))],
  [15, "the LCD command write's value + 1", shim(15, ["inc b", "call LCDCO", "dec b", "ret"])],
  [16, "A + 1", shim(16, after("SKEYS", "inc a"))],
  [17, "A + 1", shim(17, after("KWAIT", "inc a"))],
  [18, "E + 1", shim(18, after("MSCAN", "inc e"))],
  [19, "A + 1", shim(19, after("JOYS", "inc a"))],
  [20, "the port 01h write's value + 1", [["SERON:\n  ld a,TXI\n", "SERON:\n  ld a,TXI+1\n"]]],
  [21, "the port 01h write's value + 1", [["SEROFF:\n  xor a          ; all low\n", "SEROFF:\n  ld a,1\n"]]],
  [22, "the byte sent + 1", shim(22, before("TXB", "inc a"))],
  [23, "A + 1", shim(23, after("RXB", "inc a"))],
  [25, "the first byte sent + 1", shim(25, before("SNDS", "inc (hl)"))],
  [26, "the first byte stored + 1", shim(26, ["push hl", "call RCVS", "ex (sp),hl", "inc (hl)", "pop hl", "ret"])],
  [28, "the first character sent + 1", [["  jr z,SHEX4     ; the text's end\n  call TXB\n", "  jr z,SHEX4     ; the text's end\n  inc a\n  call TXB\n"]]],
  [29, "the first byte written at DE + 1", shim(29, firstAtDE("GDUMP"))],
  [30, "C flipped", shim(30, after("CHKSE", "ccf"))],
  [33, "HL + 1 before the routine", shim(33, before("TDLY", "inc hl"))],
  [34, "HL + 1 before the routine", shim(34, before("PNOTE", "inc hl"))],
  [35, "DE + 1 before the routine", shim(35, before("PTUNE", "inc de"))],
  [37, "A + 1", shim(37, after("GETCAP", "inc a"))],
  [38, "A + 1", shim(38, after("GETSHD", "inc a"))],
  [39, "A + 1", shim(39, after("GETPRT", "inc a"))],
  [40, "A + 1", shim(40, after("GETEXP", "inc a"))],
  [41, "the latch value with bit 7 flipped", shim(41, latchFlip("SETCAP", "$80"))],
  [43, "the latch value with bit 1 flipped", shim(43, latchFlip("SETPRT", "$02"))],
  [45, "the first byte sent + 1", shim(45, before("STRSER", "inc (hl)"))],
  [48, "the latch value with bit 7 flipped", shim(48, latchFlip("TOGCAP", "$80"))],
  [49, "B + 1", shim(49, after("RAND", "inc b"))],
  [53, "A + 1", shim(53, after("MSASC", "inc a"))],
  [54, "A + 1", shim(54, after("PMSCN", "inc a"))],
  [55, "Z flipped", shim(55, [`call LCDCF`, ...flipBits("$40")])],
  [56, "A + 1", shim(56, after("GETGT", "inc a"))],
  [62, "the first port 06h write's value + 1", [["  ld a,(iy+0)\n  out (SRED),a   ; the row's red\n", "  ld a,(iy+0)\n  inc a\n  out (SRED),a   ; the row's red\n"]]],
];

const MATRIX_SELS = [18, 53, 54];
for (const [sel, what, edits] of API_MUTANTS) {
  test(`KG65 mutant: call ${sel}, ${what}`, { timeout: 300_000 }, async () => {
    const svc = await mon3Variant(edits);
    if (sel === 2) return assert.rejects(preInit(svc), /ROMSIG set again/);
    const mine = (r) => new RegExp(`^call ${sel}([ ,]|$)`).test(r.name);
    let bad;
    if (MATRIX_SELS.includes(sel)) {
      bad = (await matrixKeys({ ref: (await theMatrixSides()).ref, ses: await sessionSide({ svc, matrix: true }) })).filter((b) => mine({ name: b }));
    } else {
      bad = compareRows((await theKeypadSides()).ref, await sessionSide({ svc }), apiRows().filter(mine));
    }
    assert.ok(bad.length, `call ${sel}'s rows catch it`);
  });
}

// The checksum of the service and the RAM BIOS table, taken at GO and
// checked at the program's return.

const WARN = "Tables damaged: EXIT and reset";
/** CHG.BIN: flips bit 0 of the byte at its operand, then returns. */
const CHG = bin(0x21, 0x00, 0x00, 0x7e, 0xee, 0x01, 0x77, 0xc9); // LD HL,nn; LD A,(HL); XOR 1; LD (HL),A; RET

/** GO with CHG.BIN's operand at TARGET: the text to MON3>. */
function goChange(m, target) {
  m.write(0x4001, target & 0xff);
  m.write(0x4002, target >> 8);
  m.mark = m.output.length;
  m.type("GO\r");
  return toMon3(m, 20_000_000);
}

/** A session where a program's change at TARGET (from the page P and the table T) must warn. */
async function damaged(svc, where) {
  const { m, svc: s } = await inSession({ "CHG.BIN": CHG, "ONE.BIN": bin(0xc9) }, { svc });
  const p = pageOf(m) << 8;
  const table = word(m, 1) - 3;
  const target = { LISTST: table + 15 * 3 + 1, BRK: p + s.symbols.MBRK, OLDWB: p + s.symbols.OLDWB }[where];
  assert.ok(ok(line(m, "LOAD CHG.BIN")));
  const out = goChange(m, target);
  assert.ok(out.includes(WARN), `${where}: the warning (${JSON.stringify(out)})`);
  for (let i = 0; i < 2; i += 1) {
    const n = m.opens.length;
    const r = line(m, "LOAD ONE.BIN");
    assert.ok(r.out.includes(WARN) && refused(r), `${where}: LOAD warns and is refused (${JSON.stringify(r.out)})`);
    assert.deepEqual(m.opens.slice(n), [], `${where}: BDOS 15 never called`);
  }
  // GO still runs, and puts the byte back; EXIT still runs.
  assert.ok(goChange(m, target).includes("MON3>"), `${where}: GO runs`);
  assert.ok(!line(m, "EXIT").mon3, `${where}: EXIT runs`);
  // Re-entry: the warning before the first MON3>, and LOAD refused.
  const again = line(m, "MON3.SVC /E");
  assert.ok(again.mon3 && again.out.includes(WARN), `${where}: the warning at re-entry (${JSON.stringify(again.out)})`);
  assert.ok(refused(line(m, "LOAD ONE.BIN")), `${where}: LOAD refused after re-entry`);
  assert.ok(!line(m, "EXIT").mon3);
}

/** No warning: a program that changes nothing, one that changes the line buffer, and RST 30h twice. */
async function clean(svc) {
  const { m, svc: s } = await inSession({ "CHG.BIN": CHG, "RET.BIN": bin(0xc9), "BRK.BIN": bin(0xf7) }, { svc });
  const p = pageOf(m) << 8;
  assert.ok(ok(line(m, "LOAD RET.BIN")));
  m.mark = m.output.length;
  m.type("GO\r");
  assert.doesNotMatch(toMon3(m), /Tables damaged/, "RET: no warning");
  assert.ok(ok(line(m, "LOAD CHG.BIN")));
  assert.doesNotMatch(goChange(m, p + s.symbols.LBUF + 10), /Tables damaged/, "the line buffer: no warning");
  assert.ok(ok(line(m, "LOAD BRK.BIN")));
  for (let i = 0; i < 2; i += 1) {
    m.mark = m.output.length;
    m.type("GO\r");
    const out = toMon3(m);
    assert.match(out, /BRK 4001\r\n/, `RST 30h ${i + 1}: BRK 4001`);
    assert.doesNotMatch(out, /Tables damaged/, `RST 30h ${i + 1}: no warning`);
  }
  assert.ok(ok(line(m, "LOAD RET.BIN")), "LOAD still runs");
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG65 checksum", async () => {
  for (const where of ["LISTST", "BRK", "OLDWB"]) await damaged(undefined, where);
  await clean();
});

const sumMutant = (name, edits, run, pattern) =>
  test(`KG65 mutant: ${name}`, async () => {
    const svc = await mon3Variant(edits);
    await assert.rejects(run(svc), pattern);
  });

sumMutant("the checksum's compare removed gives no warning", [["  sbc hl,de      ; Z: as at GO\n  ret z\n", "  sbc hl,de      ; Z: as at GO\n  ret\n"]], (svc) => damaged(svc, "LISTST"), /LISTST: the warning/);
sumMutant("the sum's range cut to the header's 25 bytes misses the BRK text", [["SUMLEN EQU SUMEND-HDR\n", "SUMLEN EQU 25\n"]], (svc) => damaged(svc, "BRK"), /BRK: the warning/);
sumMutant("the range ending before HOOKAT misses OLDWB", [["SUMLEN EQU SUMEND-HDR\n", "SUMLEN EQU HOOKAT-HDR\n"]], (svc) => damaged(svc, "OLDWB"), /OLDWB: the warning/);
sumMutant("RST 30h's digits written into its text warn on a clean RST 30h", [["  ld de,HEXT\n  call HLSTR     ; its digits\n", "  ld de,MBRK\n  call HLSTR     ; its digits\n"]], clean, /RST 30h 1/);
sumMutant("the flag cleared at entry gives no warning at re-entry", [["  ld a,(DMG)\n  or a           ; damaged before?\n", "  xor a\n  ld (DMG),a\n  ld a,(DMG)\n  or a           ; damaged before?\n"]], (svc) => damaged(svc, "LISTST"), /the warning at re-entry/);
sumMutant("call 2's checksum checked after WSINIT warns", [["  call CHECK     ; before RUNOK goes\n  call WSINIT    ; the workspace anew\n", "  call WSINIT    ; the workspace anew\n  call CHECK     ; before RUNOK goes\n"]], preInit, /no warning/);

// KG66: the real programs at the pin, converted, loaded by LOAD, run by GO
// and compared with the same binary under MON-3's GO. A reset ends each.

const LCD_ROWS = (m) => [0, 1, 2, 3].map((r) => String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(r * 20, r * 20 + 20)));
const MATRIX_PORTS = new Set([0x05, 0x06, 0xf8, 0xf9]);

/** NAME's file (BIN, or HEX of its two blocks when HEX) loaded and run by GO in a session, to 4000h: { m, files }. */
async function programSession(name, bytes, { hex = false, svc } = {}) {
  const file = hex ? "PROG.HEX" : "PROG.BIN";
  const text = hex ? { [file]: mz80Hex(bytes) } : {};
  const files = hex ? {} : { [file]: bytes };
  const { m } = await inSession(files, { svc, text });
  assert.ok(ok(line(m, `LOAD ${file}`)), `${name}: LOAD ${file}`);
  const a = volume(m.image, "A");
  const before = Object.fromEntries(a.list().map((f) => [f.name, sha(a.read(f.name))]));
  goTo(m, "GO", 0x4000, 20_000_000);
  return { m, before };
}

/** MZ80.HEX: matrixz80's two ORG blocks, 4000h-4037h and 4100h-4117h, by the record rule. */
const mz80Hex = (bytes) => hexFile([[0x4000, bytes.subarray(0, 0x38)], [0x4100, bytes.subarray(0x100, 0x118)]]);

/** The first N writes to the 8x8 ports, from now, as [port, value]. */
function matrixWrites(side, n = 4096, max = 100_000_000) {
  const io = side.m.tec1g.ioHandlers;
  const write = io.write;
  const got = [];
  io.write = (port, value) => {
    if (MATRIX_PORTS.has(port & 0xff) && got.length < n) got.push([port & 0xff, value & 0xff]);
    return write(port, value);
  };
  side.m.runUntil(() => got.length >= n, max, `${n} 8x8 writes`);
  io.write = write;
  return got;
}

const ran = {};

test("KG66 program binaries", async () => {
  for (const [name, p] of Object.entries(PROGRAMS)) {
    const b = await realProgram(name);
    assert.equal(b.length, p.bytes, `${name}: ${p.bytes} bytes at 4000h`);
    assert.equal(sha(b), p.sha256, `${name}: its pinned hash`);
  }
  assert.equal(sha(mz80Hex(await realProgram("matrixz80"))), HASHES["MZ80.HEX"], "MZ80.HEX by the record rule");
});

async function lcdTest(svc) {
  const { bytes, symbols } = await realBuild("lcd-test");
  const run = await programSession("lcd-test", bytes, { svc });
  run.m.runUntil(() => run.m.pc === symbols.DONE, 5_000_000, "lcd-test's DONE");
  const ref = mon3Go(bytes);
  ref.m.runUntil(() => ref.m.pc === symbols.DONE, 10_000_000, "lcd-test's DONE under MON-3");
  assert.deepEqual(LCD_ROWS(run.m), LCD_ROWS(ref.m), "the LCD as under MON-3");
  return run;
}

test("KG66 lcd-test", async () => {
  ran["lcd-test"] = await lcdTest();
});

test("KG66 serial", async () => {
  const bytes = await realProgram("serial");
  const run = await programSession("serial", bytes);
  const ref = mon3Go(bytes);
  ref.m.runUntil(() => ref.m.pc === 0x4000, 5_000_000, "serial at 4000h under MON-3");
  const outs = [run.m, ref.m].map((m) => {
    const from = m.serial.length;
    const step = (input) => {
      if (input) {
        m.tec1g.queueSerial([...Buffer.from(input, "latin1")]);
        m.tec1g.ioHandlers.read(0x00);
      }
      runFor(m, 5_000_000);
      return Buffer.from(m.serial.slice(from)).toString("latin1");
    };
    return [step(), step("AB\r"), step("CD\r")];
  });
  const [s, r] = outs;
  assert.equal(s[0], "TEC-1G MON-3 SERIAL OK\r\n", "the first line");
  assert.equal(s[1], `${s[0]}B\u0000\r\n`, "after AB CR: 42h 00h 0Dh 0Ah");
  assert.equal(s[2], `${s[1]}CD\r\n`, "after CD CR");
  assert.deepEqual(s, r, "as under MON-3");
  ran.serial = run;
});

async function matrixProgram(name, { hex = false, svc } = {}) {
  const bytes = await realProgram(name);
  const run = await programSession(name, bytes, { hex, svc });
  const ref = mon3Go(bytes);
  ref.m.runUntil(() => ref.m.pc === 0x4000, 5_000_000, `${name} at 4000h under MON-3`);
  assert.deepEqual(matrixWrites({ m: run.m }), matrixWrites(ref), `${name}${hex ? " from MZ80.HEX" : ""}: the first 4,096 8x8 writes as under MON-3`);
  return run;
}

test("KG66 matrix programs", async () => {
  for (const name of ["matrix-demo", "matrix-demo-rgb", "matrixz80"]) ran[name] = await matrixProgram(name);
  ran["matrixz80 hex"] = await matrixProgram("matrixz80", { hex: true });
});

test("KG66 reset after", async () => {
  assert.equal(Object.keys(ran).length, 6, "each program ran");
  for (const [name, { m, before }] of Object.entries(ran)) {
    m.reset();
    m.expect(/A>$/, { from: m.output.length, maxCycles: 400_000_000 });
    m.runUntil(() => m.ready(), 400_000_000, `the prompt after ${name}'s reset`);
    const a = volume(m.image, "A");
    assert.deepEqual(Object.fromEntries(a.list().map((f) => [f.name, sha(a.read(f.name))])), before, `${name}: the card's files as before GO`);
    assert.deepEqual(services(m), [], `${name}: no service after the reset`);
    assert.equal(word(m, 6), 0xb9a4, `${name}: (0006h) B9A4h`);
  }
});

test("KG66 mutant: the HEX loader's second pass writing each record one byte high", async () => {
  const svc = await mon3Variant([["  ld ix,(HADR)   ; where it goes\n", "  ld ix,(HADR)   ; where it goes\n  inc ix\n"]]);
  await assert.rejects(matrixProgram("matrixz80", { hex: true, svc }), /from MZ80\.HEX: the first 4,096/);
});

test("KG66 mutant: LOAD's BIN read starting one record late", async () => {
  const svc = await mon3Variant([["  jr c,LFAIL     ; it would not fit\n  ld hl,(LDAT)\n", "  jr c,LFAIL     ; it would not fit\n  ld hl,(LDAT)\n  ld de,128\n  add hl,de\n"]]);
  await assert.rejects(lcdTest(svc), /lcd-test's DONE|the LCD as under MON-3/);
});

test("KG66 mutant: a conversion that leaves ORG blocks in source order", async () => {
  await assert.rejects(realProgram("matrixz80", { keepOrder: true }), /IMAGE records descend or overlap/);
});

test("KG66 mutant: RST 20h without its flags, HELLO3 never quits", async () => {
  // RST 20h's flags taken from the digit scan, as KG60's mutant does.
  const svc = await mon3Variant([["  call SCANS     ; the digits\n  call SKEYS     ; the keys\n", "  call SKEYS     ; the keys\n  call SCANS     ; the digits\n"]]);
  const { m } = await inSession({ "HELLO3.BIN": await hello3() }, { svc });
  assert.ok(ok(line(m, "LOAD HELLO3.BIN")));
  goTo(m, "GO", 0x4000, 20_000_000);
  runFor(m, 1_000_000);
  m.tec1g.applyKey(KAD, true);
  const from = m.output.length;
  assert.throws(() => m.runUntil(() => MON3.test(m.text(from)), 10_000_000, "MON3> after AD"), /no MON3> after AD/);
});

// S2's size: at most 15 pages, 3,840 bytes; (0006h) at least AA00h on the
// starter card, TPA 43,264, and 42,496 with GLCD.SVC; TAS's file equal to
// ATOM's; each source file within the style's size, and passing it.

async function sizeAndTpa(svc) {
  const C = MON3_CEILING;
  svc ??= await mon3Build();
  assert.ok(svc.image <= C.bytes, `the header and image, ${svc.image} bytes, within ${C.bytes}`);
  const m = boot({ "MON3.SVC": svc.file });
  m.command("MON3.SVC");
  const pages = Number(services(m)[0].split(" ")[1]);
  assert.ok(pages <= C.pages, `${pages} pages, at most ${C.pages}`);
  const top = word(m, 6);
  assert.ok(top >= C.top && top - 0x100 >= C.tpa, `(0006h) ${top.toString(16)}h, TPA ${top - 0x100}, at least ${C.tpa}`);
  // The GLCD console's board, whose startup file installs GLCD.SVC.
  const g = boot({ "MON3.SVC": svc.file }, { matrix: true });
  assert.deepEqual(services(g).map((l) => l.split(" ")[0]), ["GLCD"], "GLCD.SVC installed");
  g.command("MON3.SVC");
  const both = word(g, 6) - 0x100;
  assert.ok(both >= C.tpaGlcd, `TPA with GLCD.SVC ${both}, at least ${C.tpaGlcd}`);
  return { pages, tpa: top - 0x100, top, both };
}

test("KG64 size and tpa", async () => {
  const svc = await mon3Build();
  const f = await sizeAndTpa(svc);
  console.log(`MON3.SVC S2: file ${svc.file.length} bytes, header and image ${svc.image}, ${f.pages} pages, (0006h) ${f.top.toString(16)}h, TPA ${f.tpa}, ${f.both} with GLCD.SVC`);
  const { tasAssembler, romBackend } = await import("../tools/lib/tas-rom.mjs");
  if (romBackend() === "tas") {
    const { assembleMon3 } = await import("../tools/lib/tas-distribution.mjs");
    assert.deepEqual([...(await assembleMon3(ROOT, await tasAssembler()))], [...svc.file], "TAS's MON3.SVC equals ATOM's");
  }
  const { checkCompactSource } = await import("../tools/lib/style-compact.mjs");
  const routines = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-routines.json"), "utf8"));
  const exceptions = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-exceptions.json"), "utf8"));
  for (const [n, text] of Object.entries(mon3Sources())) {
    const r = checkCompactSource(text, n, routines[`drivers/${n}`], exceptions[`drivers/${n}`]);
    assert.ok(r.bytes <= 24576, `${n}: ${r.bytes} bytes`);
    assert.deepEqual(r.faults, [], `${n} passes the style checker`);
  }
});

test("KG64 mutant: the build with buffers added to 3,841 bytes takes 16 pages", async () => {
  const svc = await mon3Build();
  const big = await mon3Variant([["  DS 80\nMSTK:\n", `  DS 80+${MON3_CEILING.bytes + 1 - svc.image}\nMSTK:\n`]]);
  assert.equal(big.image, 3841);
  await assert.rejects(sizeAndTpa(big), /within 3840/);
  const m = boot({ "MON3.SVC": big.file });
  m.command("MON3.SVC");
  assert.deepEqual(services(m), ["MON3 16"], "16 pages");
});
