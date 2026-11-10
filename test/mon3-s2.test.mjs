// MON3.SVC's second stage: HEX loading, file names, the matrix keyboard and
// the size (KG64); the MON-3 API against MON-3 itself, the latch, the
// checksum and the fixes carried from the first stage (KG65); the real
// programs (KG66). Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MON3, PROMPT, bin, bytesAt, digitsOf, figures, hello3, line, mon3Variant, runFor, word } from "./lib/mon3.mjs";
import { compareRows, fixedImage, matrixDown, matrixUp, referenceSide, sessionSide } from "./lib/kg65.mjs";
import { BIG16K, END, HASHES, dataRecords, goTo, hexFile, inSession, lines, mon3Build, ok, pageOf, record, refused, runnable, sha, toMon3, toPrompt, tpaBytes, tpaDigest } from "./lib/mon3s2.mjs";

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
  const text = {
    "HELLO3.HEX": hexFile([[0x4000, h]]),
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
    ["LOWER.HEX", [[0x4000, h]]],
    ["BINARY.HEX", [[0x4000, h]]],
    ["BIG16K.HEX", [[0x4000, BIG16K]]],
    ...Object.entries(edges(P)),
  ]) {
    loadsAs(m, svc, file, blocks);
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
