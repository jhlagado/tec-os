// The PRL loader: programs and residents from PRL files made as
// Digital Research made them, the CCP's NAME.COM before NAME.PRL, removal
// last in, first out, and BDOS function 108. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, prl, program, programAt, standardCard, volume } from "./lib/fixtures.mjs";

const STUB = 0x0080;
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const bytes = (m, a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));

async function machine(files, opts = {}) {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  for (const [name, data] of Object.entries(files)) volume(image, "A").write(name, data);
  return boot(image, opts);
}

/** Run code from 0080h to its final JR $; A, HL and carry back. */
function run(m, code) {
  [...code, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.pc === STUB + code.length, 20_000_000, "the stub");
  const c = m.cpu.cpu;
  return { a: c.a, hl: (c.h << 8) | c.l, carry: c.flags.C };
}
const removeAt = (m, base) => run(m, [0x21, base & 0xff, base >> 8, 0xcd, m.sym("PRLREM") & 0xff, m.sym("PRLREM") >> 8]);
const back = (m) => {
  m.mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /\r\nA>$/.test(m.text(m.mark)), 200_000_000, "the prompt");
};

test("a program PRL loads at 0100h as its .COM and runs the same", async () => {
  for (const name of ["probe", "hook"]) {
    const com = (await program(name)).bytes;
    const m = await machine({ [`${name.toUpperCase()}.PRL`]: await prl(name) });
    const at = m.sym("PRLP2");
    let image;
    m.mark = m.output.length;
    m.type(name === "probe" ? "PROBE\r" : "HOOK\r");
    m.runUntil(() => m.pc === at, 400_000_000, "the loaded program");
    image = bytes(m, 0x100, com.length);
    assert.deepEqual(image, Array.from(com), `${name}.PRL at 0100h equals ${name}.COM`);
    if (name === "probe") {
      const results = m.expect(/\r\nA>$/, { maxCycles: 2_000_000_000 }).match(/T\d\d (ok|FAIL)/g);
      assert.equal(results.length, 16);
      assert.deepEqual(results.filter((r) => r.endsWith("FAIL")), []);
    }
    assert.deepEqual(m.violations, []);
  }
});

test("the CCP runs NAME.PRL only when there is no NAME.COM", async () => {
  const com = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C
  const say = await prl("say");
  let m = await machine({ "SAY.PRL": say });
  assert.match(m.command("SAY"), /PRL/, "the .PRL alone");
  m = await machine({ "SAY.COM": com });
  assert.match(m.command("SAY"), /C\r\n/, "the .COM alone");
  m = await machine({ "SAY.COM": com, "SAY.PRL": say });
  const out = m.command("SAY");
  assert.match(out, /C\r\n/, "with both, the .COM");
  assert.doesNotMatch(out, /PRL/);
  m = await machine({});
  assert.match(m.command("SAY"), /SAY\?/, "neither");
  assert.deepEqual(m.violations, []);
});

test("a resident goes below (0006h), chains its BDOS jump, and warm boot keeps it", async () => {
  const m = await machine({ "RES.PRL": await prl("res"), "HOOK.COM": (await program("hook")).bytes });
  const stub = word(m, 6);
  const p1 = (stub >> 8) - 1; // one page below the stub's
  m.command("RES");
  assert.equal(word(m, 6), (p1 << 8) + 6, "(0006h) is the resident's base + 6");
  assert.equal(word(m, m.sym("PZTOP")), (p1 << 8) + 6);
  const at = await programAt("res", p1 << 8);
  const want = Array.from(at);
  want[7] = stub & 0xff;
  want[8] = stub >> 8;
  const data = 4; // OLDCO and COUNT, which INIT and the hook write
  assert.deepEqual(bytes(m, p1 << 8, at.length - data), want.slice(0, -data), "the resident equals its source assembled at its page, its JP to the old top");
  assert.equal(word(m, m.sym("RAMBIOS") + 13) >> 8, p1, "its INIT hooked CONOUT");
  m.command("RES");
  const low = ((p1 - 1) << 8) + 6;
  assert.equal(word(m, 6), low, "a second resident below the first");
  assert.equal(word(m, low + 1), (p1 << 8) + 6, "its JP chains to the first");
  // Warm boots by ^C, JP 0000h and BDOS function 0, and a disk error.
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  assert.equal(word(m, 6), low, "after ^C");
  back(m);
  assert.equal(word(m, 6), low, "after JP 0000h");
  m.mark = m.output.length;
  [0x0e, 0x00, 0xcd, 0x05, 0x00].forEach((v, i) => m.write(STUB + i, v));
  m.cpu.cpu.sp = 0x0100;
  m.cpu.cpu.pc = STUB;
  m.runUntil(() => m.waitingForInput() && /\r\nA>$/.test(m.text(m.mark)), 200_000_000, "BDOS 0");
  assert.equal(word(m, 6), low, "after BDOS function 0");
  m.mark = m.output.length;
  m.type("SAVE 1 C:X.COM\r");
  m.runUntil(() => m.waitingForInput(), 400_000_000, "the disk error");
  m.type("\r");
  m.expect(/\r\nA>$/);
  assert.equal(word(m, 6), low, "after a disk error");
  const pages = (low >> 8) - 1; // SAVE counts pages from 0100h
  assert.match(m.command(`SAVE ${pages + 1} Y.COM`), /\r\n\d+\?\r\n/, "SAVE stops below the resident");
  assert.doesNotMatch(m.command(`SAVE ${pages} Y.COM`), /\?/, "and reaches up to it");
  assert.deepEqual(m.violations, []);
});

test("residents are removed last in, first out, each REMOVE undoing its INIT", async () => {
  const m = await machine({ "RES.PRL": await prl("res") });
  const conout = () => word(m, m.sym("RAMBIOS") + 13); // CONOUT's JP target
  const rom = conout();
  const stub = word(m, 6);
  const [up, lo] = [(stub & 0xff00) - 0x100, (stub & 0xff00) - 0x200];
  m.command("RES");
  const first = conout();
  m.command("RES");
  assert.notEqual(conout(), first);
  assert.equal(removeAt(m, up).carry, 1, "the upper resident is not the lowest");
  assert.equal(word(m, 6), lo + 6);
  assert.equal(removeAt(m, lo).carry, 0);
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP")), conout()], [up + 6, up + 6, first]);
  assert.equal(removeAt(m, up).carry, 0);
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP")), conout()], [stub, stub, rom]);
  assert.equal(removeAt(m, stub & 0xff00).carry, 1, "the stub is no resident");
  back(m);
  assert.equal(word(m, 6), stub);
  assert.deepEqual(m.violations, []);
});

test("a cold boot clears every resident", async () => {
  const m = await machine({ "RES.PRL": await prl("res") });
  const stub = word(m, 6);
  m.command("RES");
  assert.equal(word(m, 6), stub - 0x100);
  m.reset();
  m.expect(/A>$/, { maxCycles: 80_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the prompt after reset");
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP"))], [stub, stub]);
});

test("a kind-2 module, the retired driver kind, is refused and changes nothing", async () => {
  const m = await machine({ "DRV.PRL": await prl("drv") }, { ram96: true });
  const stub = word(m, 6);
  const expand1 = m.expand[1].slice();
  const level = m.read(m.sym("CCPLVL"));
  assert.match(m.command("DRV"), /DRV\?/, "refused as a command that will not load");
  assert.deepEqual([word(m, 6), word(m, m.sym("PZTOP")), m.read(m.sym("CCPLVL"))], [stub, stub, level]);
  const ring = m.sym("HRING") - 0x8000;
  const changed = Array.from(m.expand[1]).flatMap((v, i) => (v === expand1[i] || i < ring + 0x100 ? [] : [i + 0x8000]));
  assert.deepEqual(changed, [], "EXPAND 1 unchanged but for the block cache, which read DRV.PRL, and the history ring, which took the line typed");
  assert.deepEqual(m.violations, []);
});

test("BDOS function 108 gets and sets the program return code, kept across a warm boot", async () => {
  const m = await machine({});
  const get = () => run(m, [0x11, 0xff, 0xff, 0x0e, 108, 0xcd, 0x05, 0x00]).hl;
  assert.equal(get(), 0, "0 after cold boot");
  run(m, [0x11, 0x34, 0x12, 0x0e, 108, 0xcd, 0x05, 0x00]);
  assert.equal(get(), 0x1234);
  back(m);
  assert.equal(get(), 0x1234, "after a warm boot, for the parent");
  assert.deepEqual(m.violations, []);
});

/** A PRL file from CODE, made for 0100h, with the code offsets in MARKS. */
function handPrl(code, marks) {
  const n = code.length;
  const bitmap = new Uint8Array(Math.ceil(n / 8));
  for (const i of marks) bitmap[i >> 3] |= 0x80 >> (i & 7);
  const file = new Uint8Array(256 + n + bitmap.length);
  file.set([0, n & 0xff, n >> 8]);
  file.set(code, 256);
  file.set(bitmap, 256 + n);
  return file;
}

// Made by hand in Digital Research's convention: code for 0100h, each marked
// byte the high byte of an address in it. Neither length is a multiple of 8.
const DRPROG = handPrl(
  [
    0x11, 0x09, 0x01, // LD DE,MSG
    0x0e, 0x09, // LD C,9
    0xcd, 0x05, 0x00, // CALL 0005h, not marked
    0xc9, // RET
    0x44, 0x52, 0x21, 0x24, // MSG: "DR!$"
  ],
  [2],
);
const DRRES = handPrl(
  [
    0x54, 0x4e, 0x4d, 0x01, 0x01, 0x00, // "TNM", version 1, kind 1
    0xc3, 0x00, 0x00, // 6: JP to the old top
    0x15, 0x01, // 9: INIT, 0115h
    0x1d, 0x01, // 11: REMOVE, 011Dh
    ...Array.from("DRRES   ", (c) => c.charCodeAt(0)),
    0x21, 0x1e, 0x01, // 21: INIT: LD HL,FLAG
    0x34, // INC (HL)
    0xc3, 0x1c, 0x01, // JP DONE
    0xc9, // 28: DONE: RET
    0xc9, // 29: REMOVE: RET
    0x00, // 30: FLAG
  ],
  [10, 12, 23, 27],
);

test("a PRL made by hand for 0100h runs as a program, nothing relocated", async () => {
  assert.notEqual(DRPROG[1] % 8, 0);
  const m = await machine({ "DRPROG.PRL": DRPROG });
  assert.match(m.command("DRPROG"), /DR!\r\n/);
  assert.deepEqual(bytes(m, 0x100, 13), Array.from(DRPROG.slice(256, 256 + 13)), "at 0100h as in the file");
  assert.deepEqual(m.violations, []);
});

test("a PRL made by hand for 0100h installs as a resident at two BDOS tops, its marked bytes gaining page less 1", async () => {
  const n = 31;
  assert.equal(DRRES[1], n);
  assert.notEqual(n % 8, 0);
  const m = await machine({ "DRRES.PRL": DRRES });
  const stub = word(m, 6);
  let top = stub;
  for (const p of [(stub >> 8) - 1, (stub >> 8) - 2]) {
    m.command("DRRES");
    const base = p << 8;
    assert.equal(word(m, 6), base + 6, `(0006h) is the resident at ${p.toString(16)}00h + 6`);
    const want = Array.from(DRRES.slice(256, 256 + n));
    for (const i of [10, 12, 23, 27]) want[i] = (want[i] + p - 1) & 0xff;
    want[7] = top & 0xff;
    want[8] = top >> 8;
    want[30] = 1; // FLAG, which INIT counted, at its relocated address
    assert.deepEqual(bytes(m, base, n), want, `the resident at page ${p.toString(16)}h`);
    assert.deepEqual([word(m, base + 9), word(m, base + 11)], [base + 0x15, base + 0x1d], "INIT and REMOVE relocated");
    top = base + 6;
  }
  const lo = ((stub >> 8) - 2) << 8;
  assert.equal(removeAt(m, lo).carry, 0, "its REMOVE, at its relocated address, returns");
  assert.equal(word(m, 6), lo + 0x106);
  back(m);
  assert.equal(word(m, 6), lo + 0x106, "warm boot keeps the one left");
  assert.deepEqual(m.violations, []);
});
