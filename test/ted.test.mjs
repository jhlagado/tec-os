// TED, the editor of the other study's tools, on TEC-OS: it edits, saves and
// reopens a file at every console's size, opens at a line, and runs the round
// of F9, ^T D and F5 with TAS. Emulator evidence. TED.COM and TAS.COM are
// pinned inputs (test/inputs.json). CURSOR and TEXCAP are TED's own words,
// from the listing of TED's build (build/ted/ted.sym); the workspace at 2400h
// holds them, and the pin's hash holds the build.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT, boot, fnPress, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { createContainer } from "../tools/lib/container.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TED = pinned("TED.COM");
const TAS = pinned("TAS.COM");
const CURSOR = 0x24ca; // the cursor's offset in the text
const TEXCAP = 0x2551; // the room for edits in RAM (TED 444cf3e's build/ted/ted.sym)
const NOTES = "hello\nsecond line\n";
const EDITED = "hello\nYsecond line\n";
// Line 2 fails: 256 doesn't fit A. A ';' typed at the error's column makes it a comment.
const BAD = ' ORG 100H\n LD A,256\n LD DE,MSG\n LD C,9\n CALL 5\n RET\nMSG: DB "HI",13,10,"$"\n';
const FIXED = BAD.replace(" LD A,256", " ;LD A,256");
const LIMIT = 100_000_000; // each step's cycles: a stall fails in seconds, naming the step

const tedBytes = () => new Uint8Array(readFileSync(TED.path));
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const text = (image, drive, name) => Buffer.from(volume(image, drive).read(name, { text: true })).toString();

/** Keys for M, each when it waits for one, then until it waits with nothing queued and DONE holds. */
function keys(m, s, what, done = () => true) {
  m.enqueueInput(s, m.videoConsole() ? "matrix" : "serial");
  try {
    m.runUntil(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
  } catch (e) {
    const screen = m.videoConsole() ? m.screen().filter((l) => l.trim()).join("\n") : m.text(0).slice(-600);
    throw new Error(`${what}: no within ${LIMIT} cycles, ${m.pending?.length ?? 0} keys unread, pc ${m.pc.toString(16)}\n${screen}`);
  }
}

/** Function key F<D> as the console sends it: Fn with the digit on the matrix, the xterm sequence on serial; then as keys. */
function fkey(m, d, what, done = () => true) {
  if (!m.videoConsole()) return keys(m, d === 9 ? "\x1b[20~" : d === 5 ? "\x1b[15~" : "\x1bOR", what, done);
  fnPress(m, d);
  keys(m, "", what, done);
}

function editOnTecOs({ tms, cols = 80 }) {
  check(TED);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TED.COM", tedBytes());
  a.write("NOTES.TXT", Buffer.from(NOTES), { text: true });
  let m = boot(image, { tms, width: cols, matrix: true });
  const screen = () => (tms ? m.screen() : m.glcdScreen());
  m.typeMatrix("ted notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[0] === "hello", 400_000_000, "the editor's first screen");
  const rows = tms ? 24 : 8;
  assert.equal(screen().length, rows);
  assert.deepEqual([m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], tms ? [cols, 24] : [21, 8], "the console's geometry");
  assert.match(screen()[rows - 1], /NOTES/, "status row on the last line");
  m.typeMatrix("\x04Y"); // down arrow, then Y
  m.typeMatrix("\x13"); // ^S save
  m.runUntilChecked(() => m.waitingForInput() && text(image, "A", "NOTES.TXT") === EDITED, 400_000_000, "the saved file on the card");
  m.typeMatrix("\x11"); // ^Q quit
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => /^A(:\S*)?>/.test(l)), 400_000_000, "the prompt");
  assert.deepEqual(m.violations, []);

  // Power cycle and open it again.
  m = boot(image, { tms, width: cols, matrix: true, ramFill: 0x76 });
  m.typeMatrix("ted notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[1] === "Ysecond line", 400_000_000, "the saved text");
  m.typeMatrix("\x11");
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => /^A(:\S*)?>/.test(l)), 400_000_000, "the prompt");
}

for (const cols of [80, 40, 32]) {
  test(`TED edits, saves and reopens a file on TEC-OS with the PICO9918 (${cols} x 24)`, { skip: TED.skip, timeout: 900_000 }, () => {
    editOnTecOs({ tms: true, cols });
  });
}

test("TED does the same on the GLCD (21 x 8)", { skip: TED.skip, timeout: 900_000 }, () => {
  editOnTecOs({ tms: false });
});

test("the line argument: TED NOTES.TXT 2 opens at line 2", { skip: TED.skip, timeout: 900_000 }, () => {
  check(TED);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TED.COM", tedBytes());
  a.write("NOTES.TXT", Buffer.from(NOTES), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  keys(m, "ted notes.txt 2\r", "TED at line 2", () => m.screen()[0] === "hello" && /L2 C1/.test(m.screen()[23]));
  keys(m, "Y\x13", "the save", () => text(image, "A", "NOTES.TXT") === EDITED);
  keys(m, "\x11", "the prompt", () => m.screen().some((l) => /^A(:\S*)?>/.test(l)));
});

test("a text file padded with 00h to its record's end, with no ^Z, opens in TED with no error", { skip: TED.skip, timeout: 900_000 }, () => {
  check(TED);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TED.COM", tedBytes());
  // As an older copy onto the card made it: CR LF lines, then 00h to 128 bytes.
  const body = Buffer.from(NOTES.replace(/\n/g, "\r\n"), "latin1");
  a.write("NOTES.TXT", Buffer.concat([body, Buffer.alloc(128 - body.length)]));
  const m = boot(image, { tms: true, matrix: true });
  keys(m, "ted notes.txt\r", "TED", () => m.screen()[0] === "hello" && /NOTES/.test(m.screen()[23]));
  assert.deepEqual(m.screen().slice(0, 3).map((l) => l.trimEnd()), ["hello", "second line", ""], "the text, and nothing after it");
  assert.doesNotMatch(m.screen().join("\n"), /error/i);
  keys(m, "\x11", "the prompt", () => m.screen().some((l) => /^A(:\S*)?>/.test(l)));
  assert.deepEqual(m.violations, []);
});

test("a byte TED refuses stops it with EDIT error 03 and the byte's line and column", { skip: TED.skip, timeout: 900_000 }, () => {
  check(TED);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TED.COM", tedBytes());
  // 01h, a control TED refuses, at line 3, column 5.
  a.write("BAD.TXT", Buffer.from("one\ntwo\nthre\x01e\n", "latin1"), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const mark = m.output.length;
  keys(m, "ted bad.txt\r", "the refusal", () => m.ready() && /A(:\S*)?>$/.test(m.text(mark)));
  assert.match(m.text(mark), /EDIT error 03 L3 C5/);
  assert.deepEqual(m.violations, []);
});

/**
 * The round on DRIVE: F9 fails and opens at the error; the fix, F9 again, F5 runs
 * the program, and a key brings TED back at the same place. TED and TAS are on
 * DRIVE: the CCP looks for a command on the current drive only.
 */
function round({ drive = "A", tms = true }) {
  check(TED);
  check(TAS);
  const image = standardCard();
  const d = volume(image, drive);
  d.write("TED.COM", tedBytes());
  d.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  d.write("HELLO.ASM", Buffer.from(BAD), { text: true });
  withShell(image); // TED's chained lines come back to it under the shell
  const m = boot(image, tms ? { tms: true, matrix: true } : {});
  let mark = m.output.length;
  const since = () => m.text(mark);
  const status = () => (tms ? m.screen()[23] : since().split("\x1b[24;1H").at(-1));
  if (drive !== "A") keys(m, `${drive}:\r`, "the drive", () => new RegExp(`${drive}(:\\S*)?>$`).test(since()));
  keys(m, "ted hello.asm\r", "TED", () => /TED +HELLO\.ASM/.test(status()));

  mark = m.output.length;
  fkey(m, 9, "the failed build's return", () => /TED\r\n/.test(since()) && /operands are not valid/.test(status()));
  assert.equal(word(m, CURSOR), 12, "at line 2, column 2: the error's place");
  assert.equal(volume(image, drive).list().some((f) => f.name === "HELLO.COM"), false, "a failed build leaves no HELLO.COM");

  keys(m, ";", "the fix", () => /L2 C3/.test(status()));
  mark = m.output.length;
  fkey(m, 9, "the good build's return", () => /TED\r\n/.test(since()) && /TED\.PRJ: HELLO\.ASM/.test(status()));
  assert.match(since(), /HELLO\.COM written/);
  assert.equal(text(image, drive, "HELLO.ASM"), FIXED, "F9 saves first");
  assert.equal(word(m, CURSOR), 13);

  mark = m.output.length;
  fkey(m, 5, "the program and the wait", () => /Press a key/.test(since()));
  assert.match(since(), new RegExp(`${drive}(:\\S*)?>HELLO\\r\\nHI\\r\\n`), "HELLO ran");
  keys(m, " ", "TED again", () => /L2 C3/.test(status()));
  assert.equal(word(m, CURSOR), 13, "the same place as before F5");
  keys(m, "\x11", "the prompt", () => new RegExp(`${drive}(:\\S*)?>$`).test(since()));
  assert.deepEqual(m.violations, []);
  const names = volume(image, drive).list().map((f) => f.name);
  for (const n of ["HELLO.COM", "HELLO.TBG", "TED.PRJ", "TED.SES"]) assert.ok(names.includes(n), `${n} on ${drive}:`);
}

test("the round on A: with the PICO9918: F9 at the error, the fix, F5", { skip: TED.skip || TAS.skip, timeout: 1_800_000 }, () => {
  round({ drive: "A" });
});

test("the round on B:, written behind, with the PICO9918", { skip: TED.skip || TAS.skip, timeout: 1_800_000 }, () => {
  round({ drive: "B" });
});

test("the round on A: with a serial terminal", { skip: TED.skip || TAS.skip, timeout: 1_800_000 }, () => {
  round({ drive: "A", tms: false });
});

test("TED B:HELLO.ASM from A: opens B:'s file, and F9 builds it on B: with A:'s TAS", { skip: TED.skip || TAS.skip, timeout: 600_000 }, () => {
  check(TED);
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TED.COM", tedBytes());
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  volume(image, "B").write("HELLO.ASM", Buffer.from(BAD), { text: true });
  const m = boot(withShell(image), { tms: true, matrix: true });
  const status = () => m.screen()[23];
  keys(m, "ted b:hello.asm\r", "TED on B:'s file", () => /TED .*HELLO\.ASM/.test(status()));
  let mark = m.output.length;
  fkey(m, 9, "the failed build's return", () => /TED\r\n/.test(m.text(mark)) && /operands are not valid/.test(status()));
  assert.equal(word(m, CURSOR), 12, "at the error's line and column");
  keys(m, ";", "the fix", () => /L2 C3/.test(status()));
  mark = m.output.length;
  fkey(m, 9, "the good build's return", () => /TED\r\n/.test(m.text(mark)) && /HELLO\.COM written/.test(m.text(mark)));
  keys(m, "\x11", "the prompt", () => /A(:\S*)?>$/.test(m.text(mark)));
  assert.equal(text(image, "B", "HELLO.ASM"), FIXED, "saved on B:");
  const onB = volume(image, "B").list().map((f) => f.name);
  assert.ok(onB.includes("HELLO.COM"), `HELLO.COM on B:: ${onB.join(" ")}`);
  assert.equal(m.read(4) & 15, 0, "the current drive still A:");
  assert.deepEqual(m.violations, []);
});

// TED keeps its document on the card and only its edits in RAM, so a file
// is not bounded by the TPA: up to 65,535 bytes, its offsets being 16-bit.
// TEXCAP is the room left for the edits.
const LENGTH = CURSOR - 2; // the document's length
const bigFile = (bytes) => {
  const line = Buffer.from("x".repeat(62) + "\r\n", "latin1");
  return Buffer.concat(Array.from({ length: bytes / 64 }, () => line));
};

test("TED opens a 64,000-byte file whole and refuses a 65,664-byte one, with at least 23,110 bytes for edits on the starter's files, SHELL.SVC among them, with no display and on a board with both displays as it boots", { skip: TED.skip, timeout: 900_000 }, async () => {
  check(TED);
  // The starter's display files: on a board with both, GLCD.SVC loads and gives
  // way to the ROM's PICO9918 console, so one driver is loaded (the figures).
  // The starter card's four drives, as its recipe asks for them.
  for (const board of [{ glcd: false }, { tms: true, matrix: true, glcd: true }]) {
    const image = createContainer(
      [
        { geometry: "G1M", label: "SYSTEM", mount: "A" },
        { geometry: "G8M", label: "WORK", mount: "B" },
        { geometry: "G1M", label: "PROJECTS", mount: "C" },
        { geometry: "G1M", label: "GAMES" },
        { geometry: "G1M", label: "SPARE" },
      ],
      { drives: 4 },
    );
    const a = volume(image, "A");
    for (const f of await displayFiles(ROOT)) a.write(f.name, f.bytes);
    a.write("TED.COM", tedBytes());
    a.write("BIG.TXT", bigFile(64_000));
    a.write("HUGE.TXT", bigFile(65_664));
    const m = boot(image, board);
    const where = board.tms ? "on a board with both" : "with no display";
    keys(m, "ted big.txt\r", "TED on the 64,000-byte file", () => /TED +BIG\.TXT/.test(m.text(0)));
    assert.equal(word(m, LENGTH), 64_000, `the whole file ${where}`);
    assert.ok(word(m, TEXCAP) >= 23_110, `${word(m, TEXCAP)} bytes for edits ${where}, at least 23,110`);
    let mark = m.output.length;
    keys(m, "\x11", "the prompt", () => /A(:\S*)?>$/.test(m.text(mark)));
    mark = m.output.length;
    keys(m, "ted huge.txt\r", "TED on the 65,664-byte file", () => /EDIT error 04/.test(m.text(mark)) || m.screen().some((l) => /EDIT error 04/.test(l)));
    assert.deepEqual(m.violations, []);
  }
});

// The smallest system the starter card teaches: the shell, MON3.SVC
// installed and left by EXIT, then TED, whose edits then have less room.
test("TED's edits have at least 18,502 bytes on the starter card with MON3.SVC resident under the shell, on serial, and 17,734 with GLCD.SVC too", { skip: TED.skip, timeout: 900_000 }, () => {
  check(TED);
  const P = /\r\n\d*[A-P](:\S*)?>$/;
  for (const [board, via, floor] of [[{ glcd: false }, "serial", 18_502], [{ matrix: true, glcd: true }, "matrix", 17_734]]) {
    const m = boot(new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img"))), board);
    const type = (line, done, what) => {
      const mark = m.output.length;
      m.enqueueInput(line, via);
      m.runUntil(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done(m.text(mark))), 2_000_000_000, what);
    };
    m.runUntil(() => (m.pumpInput(), m.waitingForInput() && m.ready() && P.test(m.text(0))), 2_000_000_000, "the prompt");
    type("MON3.SVC\r", (t) => /MON3>\s*$/.test(t), "MON3>");
    type("EXIT\r", (t) => P.test(t), "EXIT");
    type("ted x.asm\r", (t) => /TED +X\.ASM/.test(t), "TED");
    assert.ok(word(m, TEXCAP) >= floor, `${word(m, TEXCAP)} bytes on ${via}, at least ${floor}`);
  }
});

test("C:TED from B: edits B:'s file, and F9 runs C:'s TAS and comes back to C:'s TED, item E's load drive", { skip: TED.skip || TAS.skip, timeout: 600_000 }, () => {
  check(TED);
  check(TAS);
  const image = standardCard([{ geometry: "G1M", label: "TOOLS", mount: "C" }]);
  const c = volume(image, "C");
  c.write("TED.COM", tedBytes());
  c.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  volume(image, "B").write("HELLO.ASM", Buffer.from(BAD), { text: true });
  const m = boot(withShell(image), { tms: true, matrix: true });
  const status = () => m.screen()[23];
  let mark = m.output.length;
  keys(m, "b:\r", "the drive", () => /B(:\S*)?>$/.test(m.text(mark)));
  keys(m, "c:ted hello.asm\r", "C:'s TED on B:'s file", () => /TED .*HELLO\.ASM/.test(status()));
  mark = m.output.length;
  fkey(m, 9, "the failed build's return", () => /TED\r\n/.test(m.text(mark)) && /operands are not valid/.test(status()));
  assert.doesNotMatch(m.text(mark), /TAS\?|TED\?/, "both found on C:");
  assert.equal(word(m, CURSOR), 12, "at the error's line and column");
  keys(m, ";", "the fix", () => /L2 C3/.test(status()));
  mark = m.output.length;
  fkey(m, 9, "the good build's return", () => /TED\r\n/.test(m.text(mark)) && /HELLO\.COM written/.test(m.text(mark)));
  keys(m, "\x11", "the prompt", () => /B(:\S*)?>$/.test(m.text(mark)));
  assert.equal(text(image, "B", "HELLO.ASM"), FIXED, "saved on B:");
  assert.ok(volume(image, "B").list().some((f) => f.name === "HELLO.COM"), "HELLO.COM on B:");
  assert.equal(m.read(4) & 15, 1, "the current drive still B:");
  assert.deepEqual(m.violations, []);
});

// A program that prints its command tail between brackets, so the tail's blanks show.
const ECHO = ` ORG 100H
 LD HL,80H
 LD B,(HL)
 LD E,'['
 CALL PUT
 INC B
 JR NEXT
LOOP: INC HL
 LD E,(HL)
 CALL PUT
NEXT: DJNZ LOOP
 LD E,']'
PUT: PUSH HL
 PUSH BC
 LD C,2
 CALL 5
 POP BC
 POP HL
 RET
`;

// TED.PRJ's ARGS goes on F5's run line. The shell splits a line at an &
// after a blank, so TED stops ARGS there; an & inside a word is text.
for (const [args, tail, what] of [
  ["X &HELLO Z", " X", "stops at the & after a blank: the program runs once with X"],
  ["/M:&HE000 Q&R", " /M:&HE000 Q&R", "keeps an & inside a word"],
]) {
  test(`under the shell, F5 with ARGS ${args} ${what}`, { skip: TED.skip || TAS.skip, timeout: 900_000 }, () => {
    check(TED);
    check(TAS);
    const image = standardCard();
    const a = volume(image, "A");
    a.write("TED.COM", tedBytes());
    a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
    a.write("HELLO.ASM", Buffer.from(ECHO), { text: true });
    a.write("TED.PRJ", Buffer.from(`MAIN   HELLO.ASM\nARGS   ${args}\n`), { text: true });
    const m = boot(withShell(image), { tms: true, matrix: true });
    const status = () => m.screen()[23];
    keys(m, "ted hello.asm\r", "TED", () => /TED +HELLO\.ASM/.test(status()));
    const mark = m.output.length;
    fkey(m, 5, "the program and the wait", () => /Press a key/.test(m.text(mark)));
    const out = m.text(mark);
    keys(m, " ", "TED again", () => /TED +HELLO\.ASM/.test(status()));
    const shown = tail.replace(/[/.]/g, "\\$&");
    assert.match(out, new RegExp(`A(:\\S*)?>HELLO${shown}\\r\\n\\[${shown}\\]\\r\\n`), "the program's line and its tail");
    assert.equal(out.match(/A(:\S*)?>HELLO/g)?.length, 1, "the program runs once");
    assert.deepEqual(m.violations, []);
  });
}
