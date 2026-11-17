// The shell made smaller (KD-435): sized DIR as A:DIR.COM, a transient the
// shell runs for DIR; the history ring in EXPAND 1's history page, reached
// through the ROM's RINGIO; the CCP's name parser as TNPARSE; CD handed to
// the ROM's, the shell keeping the labels in its prompt. Emulator evidence,
// on the serial console unless a row says otherwise. The gates are in
// Origo's studies/p3-tec-os/stages/shell-slim-gates.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, ROOT, program, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";
import { CODES, DIRCOM, HELLO, SAY, SHELL, at, code, owners, shellCard, shellMachine, word } from "./lib/shell.mjs";

const RINGFIL = (await program("ringfil")).bytes;
const W = "\x17";
const N = "\x0e";

/** A shell card whose B:WORK holds files of each kind a row shows. */
function rowsCard(files = {}, opts = {}) {
  const image = shellCard(files, opts);
  const b = volume(image, "B");
  const put = (n, len, fill = 1, o) => b.write(n, new Uint8Array(len).fill(fill), o);
  put("ONE.DAT", 128); put("TWO.DAT", 256); put("BIG.DAT", 102400, 2); put("L0001.DAT", 40960, 3);
  put("NOTYPE", 384); put("HIDDEN.SYS", 1024, 4, { system: true }); put("ABCDEFGH.XYZ", 640);
  put("ZERO.TXT", 0); put("F0001.DAT", 128); put("F0002.DAT", 128); put("X.COM", 12800);
  return image;
}

// What SHELL.SVC's resident DIR printed on rowsCard, taken at TEC-OS
// 4d7795e (remove-save, before this stage), each line typed in turn from
// A:SYSTEM>. B:'s rows do not depend on the sizes of the shell or of
// DIR.COM, which are on A:.
const RESIDENT = [
  ["DIR B:", "DIR B:\r\r\n\r\nONE.DAT          128\r\nTWO.DAT          256\r\nNOTYPE           384\r\nABCDEFGH.XYZ     640\r\nZERO.TXT           0\r\nF0001.DAT        128\r\nF0002.DAT        128\r\nX.COM          12800\r\nBIG.DAT       102400\r\nL0001.DAT      40960\r\n10 files, 157824 bytes\r\n8183808 free on B:WORK\r\nA:SYSTEM>"],
  ["DIR B:*.DAT", "DIR B:*.DAT\r\r\n\r\nONE.DAT          128\r\nTWO.DAT          256\r\nF0001.DAT        128\r\nF0002.DAT        128\r\nBIG.DAT       102400\r\nL0001.DAT      40960\r\n6 files, 144000 bytes\r\n8183808 free on B:WORK\r\nA:SYSTEM>"],
  ["DIR B:F????.DAT", "DIR B:F????.DAT\r\r\n\r\nF0001.DAT        128\r\nF0002.DAT        128\r\n2 files, 256 bytes\r\n8183808 free on B:WORK\r\nA:SYSTEM>"],
  ["DIR B:NOPE", "DIR B:NOPE\r\r\nNO FILE\r\n\r\nA:SYSTEM>"],
  ["DIR B:<>", "DIR B:<>\r\r\nDIR?\r\n\r\nA:SYSTEM>"],
  ["DIR B:ONE.DAT X", "DIR B:ONE.DAT X\r\r\nDIR?\r\n\r\nA:SYSTEM>"],
  ["DIR /W B:", "DIR /W B:\r\r\nONE.DAT      TWO.DAT      BIG.DAT      L0001.DAT    NOTYPE       ABCDEFGH.XYZ\r\nZERO.TXT     F0001.DAT    F0002.DAT    X.COM       \r\n10 files, 7992K free\r\nA:SYSTEM>"],
  ["B:", "B:\r\r\nB:WORK>"],
  ["DIR", "DIR\r\r\n\r\nONE.DAT          128\r\nTWO.DAT          256\r\nNOTYPE           384\r\nABCDEFGH.XYZ     640\r\nZERO.TXT           0\r\nF0001.DAT        128\r\nF0002.DAT        128\r\nX.COM          12800\r\nBIG.DAT       102400\r\nL0001.DAT      40960\r\n10 files, 157824 bytes\r\n8183808 free on B:WORK\r\nB:WORK>"],
  ["DIR *.SYS", "DIR *.SYS\r\r\nNO FILE\r\n\r\nB:WORK>"],
  ["A:", "A:\r\r\nA:SYSTEM>"],
];

test("SL1 DIR runs A:DIR.COM with the tail, and DIR /W the ROM's listing", () => {
  const m = shellMachine(rowsCard());
  const shown = word(m, m.sym("SHOWN"));
  let entered = 0, tail = "";
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100) {
      entered += 1;
      tail = String.fromCharCode(...Array.from({ length: m.read(0x80) }, (_, i) => m.read(0x81 + i)));
    }
    return step();
  };
  at(m, "DIR B:*.DAT");
  assert.equal(entered, 1, "one transient run");
  assert.equal(tail, " B:*.DAT", "with the same tail");
  at(m, "DIR /W B:");
  assert.equal(entered, 1, "DIR /W is the ROM's");
  m.step = step;
  assert.equal(word(m, m.sym("SHOWN")), shown, "the hook back on the shell's table");
  assert.deepEqual(m.violations, []);
});

test("SL2 DIR lists the rows the resident DIR listed, on the same card", () => {
  const m = shellMachine(rowsCard());
  for (const [line, want] of RESIDENT) assert.equal(at(m, line), want, line);
  assert.equal(code(m), 0);
});

test("SL2 DIR's codes and chains: NO FILE and DIR? fail an & piece, and ! runs on", () => {
  const m = shellMachine(rowsCard());
  for (const [line, ran] of [["DIR B:NOPE & SAY", false], ["DIR B:<> & SAY", false], ["DIR B:ONE.DAT & SAY", true], ["DIR B:NOPE ! SAY", true]]) {
    assert.equal(/SAY\r\n/.test(at(m, line)), ran, line);
  }
});

test("SL3 with no A:DIR.COM, DIR is A:DIR? with FF00h, and DIR /W still lists", () => {
  const m = shellMachine(rowsCard({ "DIR.COM": null }));
  assert.match(at(m, "DIR"), /\r\nA:DIR\?\r\n/);
  assert.equal(code(m), 0xff00);
  assert.match(at(m, "DIR /W B:"), /10 files, 7992K free/);
  assert.equal(code(m), 0);
});

test("SL4 DIR on another drive, and after CD A: to a volume without DIR.COM", () => {
  const m = shellMachine(shellCard({}, { image: standardCard([{ geometry: "G1M", label: "GAMES" }]) }));
  at(m, "B:");
  assert.match(at(m, "DIR"), /\r\nNO FILE\r\n/, "B:, empty, from A:DIR.COM");
  at(m, "A:");
  at(m, "CD A:GAMES");
  assert.match(at(m, "DIR"), /\r\nA:DIR\?\r\n/);
  assert.equal(code(m), 0xff00);
  at(m, "CD A:SYSTEM");
  assert.match(at(m, "DIR SAY.COM"), /SAY\.COM +128\r\n1 file, 128 bytes\r\n/);
});

// A:'s volume is at index 0, so a label walk that starts past it finds
// B:'s and C:'s and never A:'s: this row is the one that sees it.
test("SL4 DIR on A: names A:'s volume in its last row", () => {
  const m = shellMachine(shellCard());
  assert.match(at(m, "DIR SAY.COM"), /\r\nSAY\.COM +128\r\n1 file, 128 bytes\r\n\d+ free on A:SYSTEM\r\nA:SYSTEM>$/);
});

test("SL5 DIR's [more]: ^C drops the rest of the line, Esc stops the listing only", () => {
  const files = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`F${String(i).padStart(4, "0")}.DAT`, new Uint8Array(128)]));
  const image = shellCard();
  const b = volume(image, "B");
  for (const [n, d] of Object.entries(files)) b.write(n, d);
  const m = shellMachine(image);
  for (const [key, ran] of [["\x03", false], ["\x1b", true]]) {
    m.mark = m.output.length;
    m.type("DIR B: ! SAY\r");
    m.runUntil(() => m.waitingForInput() && /\[more\]$/.test(m.text(m.mark)), 900_000_000, "[more]");
    m.type(key);
    m.runUntil(() => m.ready() && /\r\nA:SYSTEM>$/.test(m.text(m.mark)), 900_000_000, "the prompt");
    const t = m.text(m.mark);
    assert.equal(/F0029\.DAT/.test(t), false, "the listing stopped");
    assert.equal(/SAY\r\n/.test(t), ran, JSON.stringify(key));
  }
});

/** The ring's 256 bytes, in EXPAND 1's history page. */
const ring = (m) => Array.from({ length: 256 }, (_, i) => (m.expand ? m.expand[1] : m.banks[0])[m.sym("HRING") - 0x8000 + i]);

/** The line in function 10's buffer once the editor waits for a key. */
function held(m) {
  m.runUntil(() => m.pc >= m.sym("CINLP") && m.pc < m.sym("CINWE"), 50_000_000, "the editor's next key");
  const p = word(m, m.sym("PARAM"));
  return String.fromCharCode(...Array.from({ length: m.read(m.sym("LINCNT")) }, (_, i) => m.read(p + 2 + i)));
}

test("SL6 the ring is EXPAND 1's history page, and nothing of it in the shell's pages", () => {
  const m = shellMachine(shellCard());
  at(m, "ECHO ONE");
  at(m, "ECHO TWO");
  assert.equal(String.fromCharCode(...ring(m).slice(0, 18)), "ECHO ONE\0ECHO TWO\0");
  assert.equal(SHELL.symbols.RING, undefined);
  m.type(W);
  assert.equal(held(m), "ECHO TWO");
  m.type("\x15\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  assert.equal(m.sysCtrl & 0x04, 0, "EXPAND 0 in view");
});

test("SL6 the ring is kept across a program that puts EXPAND 1 in view and back", () => {
  const m = shellMachine(shellCard({ "RINGFIL.COM": RINGFIL }));
  at(m, "ECHO ONE");
  at(m, "ECHO TWO");
  const before = ring(m);
  assert.match(at(m, "RINGFIL"), /OK/);
  assert.deepEqual(ring(m).slice(0, 18), before.slice(0, 18));
  m.type(W);
  assert.equal(held(m), "RINGFIL");
  m.type(W);
  assert.equal(held(m), "ECHO TWO");
  m.type(W);
  assert.equal(held(m), "ECHO ONE");
  m.type("\x15\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
});

// The documented limit: the first line typed after such a program clears
// the whole page and is not kept itself; the page is then as at install.
test("SL6 a program that overwrites the page: ^W and ^N stay bounded, the next line clears it", () => {
  const m = shellMachine(shellCard({ "RINGFIL.COM": RINGFIL }));
  at(m, "ECHO ONE");
  assert.match(at(m, "RINGFIL R"), /OK/);
  assert.ok(ring(m).every((b) => b === 0x52), "the page all R");
  for (const key of [W, W, N, N, N]) {
    m.type(key);
    const shown = held(m);
    assert.ok(shown.length <= 127 && /^R*$/.test(shown), `${JSON.stringify(key)}: ${shown.length} bytes`);
  }
  m.type("\x15");
  held(m);
  // One ^W, then ^N: on a page of R the line shown is not the newest, so ^N
  // looks ahead for a zero there is none of, and its bound must end it.
  m.type(W);
  held(m);
  m.type(N);
  assert.ok(/^R*$/.test(held(m)), "^N after one ^W returns");
  m.type("\x15");
  held(m);
  m.mark = m.output.length;
  m.type("ECHO NEW\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  assert.ok(ring(m).every((b) => b === 0), "the page cleared");
  m.type(W);
  assert.equal(held(m), "", "that line is not kept");
  m.type("\x15");
  held(m);
  at(m, "ECHO NEXT");
  m.type(W);
  assert.equal(held(m), "ECHO NEXT", "the next is recalled whole");
  m.type("\x15\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
});

test("SL7 ABI 5.2: TNRING 18 and TNPARSE 19, 17 the packed font's, and TNCOUNT 20", () => {
  const { rom, symbols } = romFor();
  assert.deepEqual([...rom.subarray(3, 8)], [0x54, 0x4e, 0x41, 5, 2]);
  assert.deepEqual([ABI.TNRING, ABI.TNPARSE, ABI.TNCOUNT], [18, 19, 20]);
  assert.equal(symbols.get("HRING"), 0xbd00);
  const entry = (n) => rom[symbols.get("SVTAB") - 0xc000 + 2 * n] | (rom[symbols.get("SVTAB") - 0xc000 + 2 * n + 1] << 8);
  assert.equal(entry(ABI.TNRING), symbols.get("HWSRING"));
  assert.equal(entry(ABI.TNPARSE), symbols.get("SVPARS"));
});

/**
 * A program that calls TNPARSE directly, as a third party would: NAME at
 * 0180h into the FCB at 0200h, then A to 01F0h, HL to 01F2h and the flags
 * to 01F4h.
 */
function parser(name) {
  const bytes = new Uint8Array(0x81 + name.length);
  bytes.set([0x21, 0x80, 0x01, 0x11, 0x00, 0x02, 0x0e, ABI.TNPARSE, 0xcd, 0x08, 0xc0,
    0x32, 0xf0, 0x01, 0x22, 0xf2, 0x01, 0xf5, 0xe1, 0x22, 0xf4, 0x01, 0xc9]);
  bytes.set(Buffer.from(name, "latin1"), 0x80);
  return bytes;
}

test("SL7 TNPARSE called directly: carry and TNEBAD for a bad name, the FCB for a good one", () => {
  const cases = [["B:X.DAT", false], ["X*.?", false], ["<>", true], ["Q:X", true], ["NINEBYTES.X", true], ["A.TOOLONG", true]];
  const files = Object.fromEntries(cases.map(([name], i) => [`P${i}.COM`, parser(name)]));
  const m = shellMachine(shellCard(files));
  cases.forEach(([name, bad], i) => {
    at(m, `P${i}`);
    const a = m.read(0x1f0), carry = m.read(0x1f4) & 1, hl = word(m, 0x1f2);
    assert.equal(carry, bad ? 1 : 0, `${name}: carry`);
    assert.equal(a, bad ? ABI.TNEBAD : 0, `${name}: A`);
    if (!bad) {
      assert.equal(hl, 0x180 + name.length, `${name}: HL at the delimiter`);
      const fcb = String.fromCharCode(...Array.from({ length: 11 }, (_, k) => m.read(0x201 + k)));
      assert.equal(fcb, name === "B:X.DAT" ? "X       DAT" : "X????????  ", name);
      assert.equal(m.read(0x200), name === "B:X.DAT" ? 2 : 0, `${name}: drive`);
    }
  });
});

test("SL7 the shell's names through TNPARSE: COPY, DEL, a .CMD script and SERVICES as before", () => {
  const m = shellMachine(shellCard({ "RUN.CMD": Buffer.from("SAY\r\n\x1a", "latin1") }));
  assert.match(at(m, "COPY SAY.COM B:"), /COPIED 0001/);
  assert.match(at(m, "COPY SAY.COM B:S?.COM"), /\r\nCOPY\?\r\n/);
  assert.match(at(m, "COPY <> B:"), /\r\nCOPY\?\r\n/);
  assert.match(at(m, "COPY B:SAY.COM B:"), /\r\nCOPY\?\r\n/, "the same name twice");
  assert.match(at(m, "DEL B:SAY.COM"), /A:SYSTEM>$/);
  assert.match(at(m, "DIR B:"), /NO FILE/);
  assert.match(at(m, "RUN.CMD"), /SAY\r\n/);
  assert.match(at(m, "SERVICES"), /\r\nSHELL 10\r\n/);
});

test("SL8 SHELL.SVC is 10 pages; the TPA with it is 43,776 on the starter card", () => {
  assert.equal(Math.ceil(SHELL.symbols.XEND / 256), 10);
  const card = new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img")));
  const m = shellMachine(card);
  assert.deepEqual(owners(m).map((o) => o.name), ["SHELL"]);
  assert.equal(word(m, 6), 0xac00);
  assert.equal(word(m, 6) - 0x100, 43776);
  assert.ok(DIRCOM.bytes.length < 0x800 - 0x100, "DIR.COM's image under its table");
});

// What SHELL.SVC's own CD printed at 4d7795e, each line typed in turn on a
// card of SYSTEM on A:, WORK on B: and GAMES on none: the ROM's CD now does
// the work, and the shell keeps the labels.
const CDS = [
  ["CD ?", "CD ?\r\r\n\r\nSYSTEM      A:\r\nWORK        B:\r\nGAMES      \r\nA:SYSTEM>"],
  ["CD B:GAMES", "CD B:GAMES\r\r\nB:GAMES\r\nA:SYSTEM>"],
  ["CD A:WORK", "CD A:WORK\r\r\nCD FAILED\r\n\r\nA:SYSTEM>"],
  ["CD GAMES", "CD GAMES\r\r\nGAMES is on B:\r\n\r\nA:SYSTEM>"],
  ["B:", "B:\r\r\nB:GAMES>"],
  ["CD", "CD\r\r\nB:GAMES\r\nB:GAMES>"],
  ["A:", "A:\r\r\nA:SYSTEM>"],
  ["CD A:SYSTEM", "CD A:SYSTEM\r\r\nA:SYSTEM\r\nA:SYSTEM>"],
  ["CD NOPE", "CD NOPE\r\r\nNOPE?\r\n\r\nA:SYSTEM>"],
  ["CD ?", "CD ?\r\r\n\r\nSYSTEM      A:\r\nWORK       \r\nGAMES       B:\r\nA:SYSTEM>"],
];

test("SL10 CD is the ROM's and prints what the shell's printed, the labels in the prompt kept", () => {
  const m = shellMachine(shellCard({}, { image: standardCard([{ geometry: "G1M", label: "GAMES" }]) }));
  for (const [line, want] of CDS) assert.equal(at(m, line), want, line);
});

test("SL10 from a script, CD NAME on the script's own drive is CD? and the script goes on", () => {
  const script = Buffer.from("CD GAMES\r\nCD A:GAMES\r\nCD ?\r\nCD B:GAMES\r\nSAY\r\n\x1a", "latin1");
  const m = shellMachine(shellCard({ "S.CMD": script }, { image: standardCard([{ geometry: "G1M", label: "GAMES" }]) }));
  // What the shell's own CD printed at 4d7795e for the same script.
  assert.equal(at(m, "S.CMD"), "S.CMD\r\r\n\r\nA:SYSTEM>CD GAMES\r\r\nCD?\r\n\r\nA:SYSTEM>CD A:GAMES\r\r\nCD?\r\n\r\nA:SYSTEM>CD ?\r\r\n\r\nSYSTEM      A:\r\nWORK        B:\r\nGAMES      \r\nA:SYSTEM>CD B:GAMES\r\r\nB:GAMES\r\nA:SYSTEM>SAY\r\r\nSAY\r\nA:SYSTEM>");
  assert.match(at(m, "B:"), /B:GAMES>$/, "the prompt's label read again");
});

/** The paths card: the same files in the same order in either build, only SHELL.SVC differing. */
function pathsCard() {
  const image = standardCard();
  const a = volume(image, "A");
  const script = Buffer.from(Array.from({ length: 10 }, () => "TYPE HELLO.TXT\r\n").join("") + "\x1a", "latin1");
  for (const [n, b] of Object.entries({ "SHELL.SVC": SHELL.file, "DIR.COM": DIRCOM.bytes, ...CODES, "SAY.COM": SAY, "HELLO.TXT": HELLO, "RUN.CMD": script })) a.write(n, b);
  a.write("STARTUP.CMD", startupFile("SHELL.SVC"));
  return image;
}

// T-states from Enter to the prompt at b4310a1 on pathsCard, with a
// DIR.COM of 1,440 bytes on it, each line typed twice and the second timed,
// and the allowance over each. A typed line pays HSTORE's ring through
// RINGIO, about 720 T-states a character (ECHO HI measured 5,009 more); a
// script's lines about 335 each (RUN.CMD 8,361, its own typed line
// included); CD ? and DIR /W the ring for their typed line and what the
// card's layout moves, measured 3,787 and 4,413 more.
const BASE = [["ECHO HI", 250985, 6000], ["RUN.CMD", 7379213, 10000], ["TYPE HELLO.TXT!TYPE HELLO.TXT!TYPE HELLO.TXT!TYPE HELLO.TXT", 2546723, 50000], ["SAY", 351744, 3600], ["CD ?", 1140085, 5000], ["DIR /W", 2622584, 6000]];

test("SL9 the ordinary path: a typed line pays the ring's bytes, its pieces and a script's lines nothing more", () => {
  const m = shellMachine(pathsCard());
  for (const [line, base, allowance] of BASE) {
    at(m, line);
    m.type(line);
    const t0 = m.cycles;
    m.mark = m.output.length;
    m.type("\r");
    m.runUntil(() => m.ready() && /\r\n[A-P]:\S*>$/.test(m.text(m.mark)), 2e9, line);
    const took = m.cycles - t0;
    assert.ok(took <= base + allowance, `${line}: ${took} T-states against ${base} and ${allowance} more`);
  }
});

// While RINGIO has EXPAND 1 in view, SP is NMISP: an NMI's two-byte frame
// would land in the BDOS stack's unused foot, and in EXPAND 1's free page,
// where the caller's own stack would be a cache line. The window, from the
// OUT that maps the bank to the OUT that unmaps it, is bounded.
test("SL11 RINGIO: SP is NMISP whenever EXPAND 1 is in view, and the window is bounded", (t) => {
  const m = shellMachine(shellCard());
  const lo = m.sym("RINGIO"), hi = m.sym("SVPARS"), safe = m.sym("NMISP");
  assert.equal(safe, m.sym("STKBASE") + 4);
  let calls = 0, wrong = 0, start = -1, widest = 0;
  const step = m.step.bind(m);
  m.step = () => {
    const mapped = (m.sysCtrl & 0x04) !== 0, inside = m.pc >= lo && m.pc < hi;
    if (m.pc === lo) calls += 1;
    if (mapped && inside && (m.cpu.cpu.sp & 0xffff) !== safe) wrong += 1;
    if (mapped && start < 0 && inside) start = m.cycles;
    if (!mapped && start >= 0) { widest = Math.max(widest, m.cycles - start); start = -1; }
    return step();
  };
  at(m, "ECHO ONE");
  at(m, "ECHO TWO");
  m.type(W);
  held(m);
  m.type(N);
  held(m);
  m.type("\x15\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  m.step = step;
  t.diagnostic(JSON.stringify({ calls, widest }));
  assert.ok(calls > 40, `${calls} calls`);
  assert.equal(wrong, 0, "SP is NMISP in every mapped instruction");
  assert.ok(widest <= 60, `the mapped window ${widest} T-states`);
});

/** The starter card media builds, booted on BOARD; each LINE typed TIMES times on a fresh machine, ms from Enter to the prompt. */
function starterTimes(board, line, times) {
  const m = shellMachine(new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img"))), board === "pico" ? { tms: true, matrix: true } : {});
  const out = [];
  for (let i = 0; i < times; i++) {
    m.type(line);
    const t0 = m.cycles;
    m.mark = m.output.length;
    m.type("\r");
    m.runUntil(() => m.ready() && /[A-P]:\S*>$/.test(m.text(m.mark)), 4e9, line);
    out.push((m.cycles - t0) / 4000);
  }
  return out;
}

// SS-12's caps, ms at 4 MHz on the starter card, each from a fresh boot.
// DIR B: is a G8M: its first listing logs it in and turns the 30-line cache
// over, so the second reads DIR.COM from the card again; later ones read
// nothing. The measured figures are in the model.
test("SL12 time on the starter card: DIR, DIR of B: and C:, CD and ^W within their caps", { timeout: 600_000 }, (t) => {
  const times = {
    dir: starterTimes("serial", "DIR", 2), pico: starterTimes("pico", "DIR", 2),
    b: starterTimes("serial", "DIR B:", 4), c: starterTimes("serial", "DIR C:", 3), cd: starterTimes("serial", "CD", 2),
  };
  t.diagnostic(JSON.stringify(times));
  const caps = [["DIR, serial", times.dir[1], 1800], ["DIR, PICO9918", times.pico[1], 1200],
    ["DIR B:, after its login", times.b[1], 400], ["DIR B:, later", times.b[3], 160],
    ["DIR C:, after its login", times.c[1], 230], ["DIR C:, later", times.c[2], 160], ["CD", times.cd[1], 700]];
  for (const [what, ms, cap] of caps) assert.ok(ms <= cap, `${what}: ${ms.toFixed(1)} ms, over ${cap}`);
  const m = shellMachine(new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img"))));
  at(m, "ECHO ONE");
  at(m, "ECHO TWO");
  const t0 = m.cycles;
  m.mark = m.output.length;
  m.type(W);
  m.runUntil(() => m.waitingForInput() && m.text(m.mark).endsWith("ECHO TWO"), 400_000_000, "^W");
  const ms = (m.cycles - t0) / 4000;
  assert.ok(ms <= 33, `^W ${ms.toFixed(2)} ms, over 33`);
});

// SS-14, with service eviction. Written now and run at the build: a ROM with
// no EVICT keyword skips them.
const EVICTS = romFor().symbols.has("CMDEVI");

test("SL14 EVICT A:DIR lists plainly and the shell comes back; EVICT DIR is the ROM's", { skip: !EVICTS }, () => {
  const image = shellCard();
  const b = volume(image, "B");
  for (let i = 0; i < 30; i++) b.write(`F${String(i).padStart(4, "0")}.DAT`, new Uint8Array(128));
  const m = shellMachine(image);
  const t = at(m, "EVICT A:DIR B:");
  assert.doesNotMatch(t, /\[more\]/, "no shell: no pager");
  assert.match(t, /F0029\.DAT +128\r\n30 files, 3840 bytes\r\n/);
  assert.ok(owners(m).some((o) => o.name === "SHELL"), "the shell is back");
  assert.match(at(m, "EVICT DIR /W B:"), /30 files, \d+K free/);
});

test("SL14 after an eviction ^W shows nothing; after a refused one it recalls the line before", { skip: !EVICTS }, () => {
  const m = shellMachine(shellCard());
  at(m, "ECHO ONE");
  at(m, "EVICT SAY");
  m.type(W);
  assert.equal(held(m), "", "the restored shell's INIT cleared the page");
  m.type("\x15\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  at(m, "ECHO TWO");
  at(m, "ERA SHELL.SVC");
  assert.match(at(m, "EVICT SAY"), /SHELL in the way/);
  m.type(W);
  assert.equal(held(m), "EVICT SAY");
  m.type(W);
  assert.equal(held(m), "ERA SHELL.SVC");
  m.type("\x15\r");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
});

test("SL14 the eviction record and the ring are each written by their own writer only", { skip: !EVICTS }, () => {
  const m = shellMachine(shellCard());
  at(m, "ECHO ONE");
  at(m, "EVICT SAY");
  at(m, "ECHO TWO");
  assert.deepEqual(m.expand1Writes, [], "no write to EXPAND 1's free pages but the record's and the ring's");
});
