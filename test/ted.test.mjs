// TED, the editor of the other study's tools, on TEC-OS: it edits, saves and
// reopens a file at every console's size, opens at a line, and runs the round
// of ^T B, ^T D and ^T R with TAS. Emulator evidence. TED.COM and TAS.COM are
// pinned inputs (test/inputs.json). CURSOR and TEXCAP are TED's own words,
// from the listing of TED's build (build/ted/ted.sym); the workspace at 2400h
// holds them, and the pin's hash holds the build.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT, boot, standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TED = pinned("TED.COM");
const TAS = pinned("TAS.COM");
const CURSOR = 0x24ca; // the cursor's offset in the text
const TEXCAP = 0x2551; // the text's room, from the word at 0006h
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
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => l.startsWith("A>")), 400_000_000, "the prompt");
  assert.deepEqual(m.violations, []);

  // Power cycle and open it again.
  m = boot(image, { tms, width: cols, matrix: true, ramFill: 0x76 });
  m.typeMatrix("ted notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[1] === "Ysecond line", 400_000_000, "the saved text");
  m.typeMatrix("\x11");
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => l.startsWith("A>")), 400_000_000, "the prompt");
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
  keys(m, "\x11", "the prompt", () => m.screen().some((l) => l.startsWith("A>")));
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
  keys(m, "\x11", "the prompt", () => m.screen().some((l) => l.startsWith("A>")));
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
  keys(m, "ted bad.txt\r", "the refusal", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /EDIT error 03 L3 C5/);
  assert.deepEqual(m.violations, []);
});

/**
 * The round on DRIVE: ^T B fails and opens at the error, ^T D chains TDB, which
 * isn't there, so TDB? and !TED bring TED back; the fix, ^T B again, ^T R runs
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
  if (drive !== "A") keys(m, `${drive}:\r`, "the drive", () => since().endsWith(`${drive}>`));
  keys(m, "ted hello.asm\r", "TED", () => /TED +HELLO\.ASM/.test(status()));

  mark = m.output.length;
  keys(m, "\x14b", "the failed build's return", () => /TED\r\n/.test(since()) && /operands are not valid/.test(status()));
  assert.equal(word(m, CURSOR), 12, "at line 2, column 2: the error's place");
  assert.equal(volume(image, drive).list().some((f) => f.name === "HELLO.COM"), false, "a failed build leaves no HELLO.COM");

  mark = m.output.length;
  keys(m, "\x14d", "TED after TDB?", () => /TED\r\n/.test(since()) && /L2 C2/.test(status()));
  // Item E: each tool on the line names the load drive, the current one here
  assert.match(since(), new RegExp(`${drive}>${drive}:TDB HELLO\\r\\n${drive}:TDB\\?\\r\\n\\r\\n${drive}>${drive}:TED\\r\\n`), "the chain's line taken, TDB? and !TED");
  assert.equal(word(m, CURSOR), 12, "the same place");

  keys(m, ";", "the fix", () => /L2 C3/.test(status()));
  mark = m.output.length;
  keys(m, "\x14b", "the good build's return", () => /TED\r\n/.test(since()) && /THOR\.PRJ: HELLO\.ASM/.test(status()));
  assert.match(since(), /HELLO\.COM written/);
  assert.equal(text(image, drive, "HELLO.ASM"), FIXED, "^T B saves first");
  assert.equal(word(m, CURSOR), 13);

  mark = m.output.length;
  keys(m, "\x14r", "the program and the wait", () => /Press a key/.test(since()));
  assert.match(since(), new RegExp(`${drive}>HELLO\\r\\nHI\\r\\n`), "HELLO ran");
  keys(m, " ", "TED again", () => /L2 C3/.test(status()));
  assert.equal(word(m, CURSOR), 13, "the same place as before ^T R");
  keys(m, "\x11", "the prompt", () => since().endsWith(`${drive}>`));
  assert.deepEqual(m.violations, []);
  const names = volume(image, drive).list().map((f) => f.name);
  for (const n of ["HELLO.COM", "HELLO.DBG", "THOR.PRJ", "THOR.SES"]) assert.ok(names.includes(n), `${n} on ${drive}:`);
}

test("the round on A: with the PICO9918: ^T B at the error, ^T D's TDB? and back, the fix, ^T R", { skip: TED.skip || TAS.skip, timeout: 1_800_000 }, () => {
  round({ drive: "A" });
});

test("the round on B:, written behind, with the PICO9918", { skip: TED.skip || TAS.skip, timeout: 1_800_000 }, () => {
  round({ drive: "B" });
});

test("the round on A: with a serial terminal", { skip: TED.skip || TAS.skip, timeout: 1_800_000 }, () => {
  round({ drive: "A", tms: false });
});

test("TED B:HELLO.ASM from A: opens B:'s file, and ^T B builds it on B: with A:'s TAS", { skip: TED.skip || TAS.skip, timeout: 600_000 }, () => {
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
  keys(m, "\x14b", "the failed build's return", () => /TED\r\n/.test(m.text(mark)) && /operands are not valid/.test(status()));
  assert.equal(word(m, CURSOR), 12, "at the error's line and column");
  keys(m, ";", "the fix", () => /L2 C3/.test(status()));
  mark = m.output.length;
  keys(m, "\x14b", "the good build's return", () => /TED\r\n/.test(m.text(mark)) && /HELLO\.COM written/.test(m.text(mark)));
  keys(m, "\x11", "the prompt", () => m.text(mark).endsWith("A>"));
  assert.equal(text(image, "B", "HELLO.ASM"), FIXED, "saved on B:");
  const onB = volume(image, "B").list().map((f) => f.name);
  assert.ok(onB.includes("HELLO.COM"), `HELLO.COM on B:: ${onB.join(" ")}`);
  assert.equal(m.read(4) & 15, 0, "the current drive still A:");
  assert.deepEqual(m.violations, []);
});

test("TED's text holds at least 30,742 bytes on the starter's files, SHELL.SVC among them, with no display and on a board with both displays as it boots", { skip: TED.skip, timeout: 900_000 }, async () => {
  check(TED);
  // The starter's display files: on a board with both, GLCD.SVC loads and gives
  // way to the ROM's PICO9918 console, so one driver is loaded (the figures).
  for (const [board, floor] of [[{ glcd: false }, 30_742], [{ tms: true, matrix: true, glcd: true }, 30_742]]) {
    const image = standardCard();
    const a = volume(image, "A");
    for (const f of await displayFiles(ROOT)) a.write(f.name, f.bytes);
    a.write("TED.COM", tedBytes());
    const m = boot(image, board);
    keys(m, "ted x.asm\r", "TED", () => /TED +X\.ASM/.test(m.text(0)));
    assert.ok(word(m, TEXCAP) >= floor, `${word(m, TEXCAP)} bytes ${board.tms ? "on a board with both" : "with no display"}, at least ${floor}`);
  }
});

test("C:TED from B: edits B:'s file, and ^T B runs C:'s TAS and comes back to C:'s TED, item E's load drive", { skip: TED.skip || TAS.skip, timeout: 600_000 }, () => {
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
  keys(m, "b:\r", "the drive", () => m.text(mark).endsWith("B>"));
  keys(m, "c:ted hello.asm\r", "C:'s TED on B:'s file", () => /TED .*HELLO\.ASM/.test(status()));
  mark = m.output.length;
  keys(m, "\x14b", "the failed build's return", () => /TED\r\n/.test(m.text(mark)) && /operands are not valid/.test(status()));
  assert.doesNotMatch(m.text(mark), /TAS\?|TED\?/, "both found on C:");
  assert.equal(word(m, CURSOR), 12, "at the error's line and column");
  keys(m, ";", "the fix", () => /L2 C3/.test(status()));
  mark = m.output.length;
  keys(m, "\x14b", "the good build's return", () => /TED\r\n/.test(m.text(mark)) && /HELLO\.COM written/.test(m.text(mark)));
  keys(m, "\x11", "the prompt", () => m.text(mark).endsWith("B>"));
  assert.equal(text(image, "B", "HELLO.ASM"), FIXED, "saved on B:");
  assert.ok(volume(image, "B").list().some((f) => f.name === "HELLO.COM"), "HELLO.COM on B:");
  assert.equal(m.read(4) & 15, 1, "the current drive still B:");
  assert.deepEqual(m.violations, []);
});
