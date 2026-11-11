// HELLO3 under MON3.SVC against MON-3 itself: the vertical slice. A MON-3
// program is loaded and run from the MON3> line, its registers at entry, its
// LCD, digits, beeps and keys compared with the same program under MON-3's
// own ROM, and TEC-OS checked afterwards. On the serial console and on a
// board whose console is the GLCD. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, program, volume } from "./lib/fixtures.mjs";
import { KEY5, KEYAD, MON3, MON3_BIN, bytesAt, card, digitsOf, find, hello3, lcdRows, line, machine, mon3Svc, reference, runFor, runTo, svcMutant, warmTarget } from "./lib/mon3.mjs";

const RECORDED = JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/mon3/hello3-reference.json"), "utf8"));
const ROWS = ["MON-3 ON TEC-OS     ", "LCD BY RST 10H      ", "DIGITS BY RST 20H   ", "KEY BEEPS, AD QUITS "];
const TEXT = Buffer.from("ONE\r\nTWO\r\nTHREE\r\n\x1a", "latin1");
const BIG = Uint8Array.from({ length: 300 * 128 }, (_, i) => (i * 7 + (i >> 8)) & 0xff);
const skip = MON3_BIN.skip;
/** The matrix's row and column for the keypad's 5 and AD: 5, and Esc. */
const MATRIX_KEY = { [KEY5]: [3, 0], [KEYAD]: [1, 4] };

let ref;
const theReference = async () => (ref ??= reference(await hello3()));

/** The slice on CONSOLE ("serial" or "glcd") with service file SVC: what each step showed. */
async function slice(consoleKind, file) {
  const xcopy = (await program("copy")).bytes;
  const image = card({ "MON3.SVC": file, "HELLO3.BIN": await hello3() });
  const b = volume(image, "B");
  b.write("T.TXT", TEXT);
  b.write("BIG.DAT", BIG);
  b.write("XCOPY.COM", xcopy);
  const m = machine(image, consoleKind === "glcd" ? { matrix: true } : {});
  const out = { m, image, kind: consoleKind };
  out.pageZero = bytesAt(m, 0, 0x50);
  out.entered = line(m, "MON3.SVC /E").mon3;
  out.top = bytesAt(m, 6, 2);
  line(m, "LOAD HELLO3.BIN");
  const e0 = m.edges;
  m.mark = m.output.length;
  m.type("GO\r");
  runTo(m, 0x4000, 20_000_000);
  const c = m.cpu.cpu;
  out.at4000 = {
    a: c.a,
    b: c.b,
    c: c.c,
    de: (c.d << 8) | c.e,
    hl: (c.h << 8) | c.l,
    sp: c.sp & 0xffff,
    iff1: c.iff1 ? 1 : 0,
    flags: Object.fromEntries(Object.entries(c.flags).map(([k, v]) => [k, v ? 1 : 0])),
    edges: m.edges - e0,
    row4: lcdRows(m)[3],
  };
  runFor(m, 3_000_000);
  out.after = { rows: lcdRows(m), edges: m.edges - e0, digits: digitsOf(m) };
  // With the matrix fitted, as the GLCD console needs, MON-3's scanKeys
  // reads the matrix and not the keypad: 5 and Esc, which it takes as AD.
  const glcd = consoleKind === "glcd";
  const key = (code, down) => (glcd ? m.tec1g.applyMatrixKey(...MATRIX_KEY[code], down) : m.tec1g.applyKey(code, down));
  const e1 = m.edges;
  key(KEY5, true);
  runFor(m, 400_000);
  key(KEY5, false);
  runFor(m, 400_000);
  out.key = { edges: m.edges - e1, digits: digitsOf(m) };
  key(KEYAD, true);
  const from = m.output.length;
  try {
    // On the GLCD console the return waits for the keys to go up before
    // MON3>; the serial console reads no key, and doesn't wait. AD is held
    // on past the return, then let go.
    m.runUntil(() => m.pc === 0x0049, 10_000_000, "the return after AD");
    runFor(m, 2_000_000);
    out.heldPrompt = MON3.test(m.text(from));
    key(KEYAD, false);
    m.runUntil(() => MON3.test(m.text(from)), 10_000_000, "MON3> after AD");
    out.back = true;
  } catch {
    out.back = false;
    return out;
  }
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the MON3> line's read");
  out.exit = !line(m, "EXIT").mon3;
  out.pageZeroAfter = bytesAt(m, 0, 0x50);
  out.target = warmTarget(m);
  return out;
}

const slices = new Map();
const theSlice = async (kind) => {
  if (!slices.has(kind)) slices.set(kind, await slice(kind, (await mon3Svc()).file));
  return slices.get(kind);
};

/** The registers and the screen at 4000h against MON-3's: DE alone differs, by design. */
function checkAt4000(s, r) {
  assert.deepEqual({ ...s.at4000, de: 0 }, { ...r.at4000, de: 0 }, "A, B, C, HL, SP, the interrupt state, the flags, GO's beep and row 4 at 4000h");
  assert.equal(s.at4000.de, 0x0049, "DE is GO's return entry, 0049h");
  assert.deepEqual(
    { a: s.at4000.a, b: s.at4000.b, c: s.at4000.c, hl: s.at4000.hl, sp: s.at4000.sp, iff1: s.at4000.iff1, edges: s.at4000.edges, row4: s.at4000.row4 },
    { a: 0xff, b: 0x01, c: 0x00, hl: 0x4000, sp: 0x087e, iff1: 0, edges: 64, row4: "  Running at: 4000  " },
  );
  assert.ok(Object.values(s.at4000.flags).every((f) => f === 0), "every flag clear");
}

/** The LCD, the edges and the digits against MON-3's: text, edges and key digits exact, the count within two steps. */
function checkDisplay(s, r) {
  assert.deepEqual(s.after.rows, ROWS);
  assert.deepEqual(s.after.rows, r.after.rows, "the four rows as under MON-3");
  assert.equal(s.after.edges, 128, "GO's beep and the program's");
  assert.equal(s.after.edges, r.after.edges);
  assert.equal(s.after.digits.key, 0x00, "no key yet");
  assert.ok(Math.abs(s.after.digits.count - r.after.digits.count) <= 2, `the count ${s.after.digits.count} within two steps of ${r.after.digits.count}`);
}
function checkKey(s, r) {
  assert.equal(s.key.edges, 64, "one beep for key 5");
  assert.equal(s.key.edges, r.key.edges);
  assert.equal(s.key.digits.key, 0x05, "key 5 on the right two digits");
  assert.equal(s.key.digits.key, r.key.digits.key);
  assert.ok(Math.abs(s.key.digits.count - r.key.digits.count) <= 2, `the count ${s.key.digits.count} within two steps of ${r.key.digits.count}`);
  if (s.kind === "glcd") assert.equal(s.heldPrompt, false, "no MON3> while AD is held on the matrix");
  else assert.equal(s.heldPrompt, true, "on the serial console, MON3> while AD is still held");
  assert.ok(s.back, "AD returns to MON3> within 10,000,000 cycles of its release");
}
function checkExit(s) {
  assert.ok(s.exit, "EXIT reaches the CCP's prompt");
  const differ = s.pageZero.flatMap((v, i) => (v === s.pageZeroAfter[i] ? [] : [i]));
  // The word at 0006h is lower by the service's pages: its high byte always, its low byte unless a service was in already.
  assert.ok(differ.includes(7) && differ.every((i) => i === 6 || i === 7), `page zero 0000h-004Fh as before /E, but the BDOS entry's word: ${differ}`);
  assert.equal(s.target, s.m.sym("WBOOTR"), "the warm-boot entry's target is WBOOTR again");
}

test("the reference run of HELLO3 under MON-3 equals its recorded output", { skip }, async () => {
  assert.deepEqual(await theReference(), RECORDED);
});

for (const kind of ["serial", "glcd"]) {
  const on = kind === "serial" ? "serial" : "GLCD console";

  test(`KG60 hello3 at 4000h, ${on}`, { skip }, async () => {
    const s = await theSlice(kind);
    assert.ok(s.entered, "MON3.SVC /E gives MON3>");
    checkAt4000(s, await theReference());
  });

  test(`KG60 hello3 display and keys, ${on}`, { skip }, async () => {
    const [s, r] = [await theSlice(kind), await theReference()];
    checkDisplay(s, r);
    checkKey(s, r);
  });

  test(`KG60 exit and page zero, ${on}`, { skip }, async () => {
    checkExit(await theSlice(kind));
  });

  test(`KG60 re-entry without the file, ${on}`, { skip }, async () => {
    const { m, image } = await theSlice(kind);
    m.command("ERA MON3.SVC");
    assert.ok(!volume(image, "A").list().some((f) => f.name === "MON3.SVC"), "MON3.SVC is off the card");
    assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E enters with no file");
    assert.match(line(m, "GO").out, /\?\r\n\r\nMON3>$/, "GO with no load is refused");
    assert.ok(!line(m, "EXIT").mon3);
  });

  test(`KG60 tec-os afterwards, ${on}`, { skip }, async () => {
    const { m, image } = await theSlice(kind);
    const memory = bytesAt(m, 0x100, 0x200);
    m.command("SAVE 2 T.TMP");
    const a = () => volume(image, "A");
    assert.deepEqual([...a().read("T.TMP")], memory, "SAVE 2 wrote 0100h-02FFh, four records");
    const dir = m.command("DIR");
    assert.match(dir, /T\.TMP/);
    assert.match(dir, /HELLO3\.BIN/);
    // Counted from the card, which holds MON3.SVC unless the re-entry test
    // erased it first, and on the GLCD board its driver and startup file too.
    const names = [...new Set(a().list().map((f) => f.name))];
    for (const n of names) assert.ok(dir.includes(n), `DIR lists ${n}`);
    assert.match(dir, new RegExp(`\\b${names.length} files`));
    assert.match(m.command("TYPE B:T.TXT"), /ONE\r\nTWO\r\nTHREE\r\n/);
    m.command("ERA T.TMP");
    assert.ok(!a().list().some((f) => f.name === "T.TMP"), "ERA took the directory entry");
    assert.match(m.command("B:XCOPY B:BIG.DAT B:OUT.DAT"), /COPIED 012C/);
    m.command("DIR B:");
    assert.deepEqual([...volume(image, "B").read("OUT.DAT")], [...BIG], "a 300-record file written by a program reads back equal");
  });
}

// Mutants: each is the service with one routine's bytes changed, and each
// must fail the figure named.

test("KG60 mutant: RST 20h returning the digit scan's flags loses key 5's beep", { skip }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("R20"), [0xe1, 0xcd, null, null, 0xcd, null, null, 0x18], 16);
    const scan = [b[i + 2], b[i + 3]];
    [b[i + 2], b[i + 3]] = [b[i + 5], b[i + 6]];
    [b[i + 5], b[i + 6]] = scan;
  });
  const s = await slice("serial", file);
  assert.throws(() => checkKey(s, RECORDED));
});

test("KG60 mutant: GO without its beep has no edges at 4000h", { skip }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("CGO"), [0x3a, 0x8d, 0x08, 0xb7, 0xcc], 128);
    b[i + 4] = 0xc4; // CALL NZ: never, with the beep on
  });
  const s = await slice("serial", file);
  assert.equal(s.at4000.edges, 0);
  assert.throws(() => checkAt4000(s, RECORDED));
});

test("KG60 mutant: scanKeys without carry on a new press gives no key beep", { skip }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("SKEYS"), [0xbf, 0x37, 0x32, 0x89, 0x08, 0xc9], 64);
    b[i + 1] = 0x00;
  });
  const s = await slice("serial", file);
  assert.throws(() => checkKey(s, RECORDED));
});

// The record in KBLAST still keeps the held Esc off the line; what the wait
// alone adds is MON3> held back until the keys are up.
test("KG60 mutant: the return without its key-up wait gives MON3> while Esc is held, GLCD console", { skip }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("KEYUP"), [0x3a, 0x8a, 0x08, 0xb7, 0x20], 16);
    b[i + 4] = 0x18; // JR: up, whatever the keys
  });
  const s = await slice("glcd", file);
  assert.throws(() => checkKey(s, RECORDED), /no MON3> while AD is held on the matrix/);
});

test("KG60 mutant: EXIT's restore skipping 0041h-004Fh leaves page zero changed", { skip }, async () => {
  const svc = await mon3Svc();
  const file = svcMutant(svc, (b, at) => {
    const i = find(b, at("REST"), [0x11, 0x41, 0x00, 0x01, 0x0f, 0x00, 0xed, 0xb0], 48);
    b[i + 6] = 0x09; // ADD HL,BC: past the saved bytes, none copied
    b[i + 7] = 0x00;
  });
  const s = await slice("serial", file);
  assert.throws(() => checkExit(s));
});
