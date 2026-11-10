// TED and BAZA on the starter card's files (KD-262): TED opens TIMES.BAS and
// ^T B builds it with BAZA and comes back clean, ^T D says No debugger and
// chains nothing, ^T R runs TIMES and comes back after a key, and a line with
// a syntax error brings TED back on that line from BAZA's THOR.ERR, with the
// last TIMES.COM kept byte for byte; a project on B: builds with A:'s BAZA,
// which finds BAZA.RTL on the drive it was loaded from. Emulator evidence. TED.COM,
// BAZA.COM and BAZA.RTL are pinned inputs (test/inputs.json), the starter
// card's bytes (test/starter.test.mjs).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TED = pinned("TED.COM");
const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");
const SKIP = TED.skip || BAZA.skip || RTL.skip;
const SOURCE = readFileSync(resolve(ROOT, "programs/TIMES.BAS"), "utf8");
const CURSOR = 0x24ca; // the cursor's offset in TED's text (test/ted.test.mjs)
const LIMIT = 100_000_000; // each step's cycles: a stall fails in seconds, naming the step
const BAD = "95 print (";
// TED's text holds CR LF: line 10 starts after nine lines and their ends.
const LINE10 = SOURCE.split("\n").slice(0, 9).reduce((n, l) => n + l.length + 2, 0);

const sha = (image, drive, name) => createHash("sha256").update(volume(image, drive).read(name)).digest("hex");
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const bytes = (input) => new Uint8Array(readFileSync(input.path));
const names = (image, drive) => volume(image, drive).list().map((f) => f.name);
const text = (image, drive, name) => Buffer.from(volume(image, drive).read(name, { text: true })).toString();

/** Keys for M, each when it waits for one, then until it waits with nothing queued and DONE holds. */
function keys(m, s, what, done) {
  m.enqueueInput(s, "matrix");
  try {
    m.runUntil(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
  } catch (e) {
    throw new Error(`${what}: not within ${LIMIT} cycles, pc ${m.pc.toString(16)}\n${m.screen().filter((l) => l.trim()).join("\n")}`);
  }
}

/** A card with the starter's TED, BAZA and BAZA.RTL on A:, and TIMES.BAS on DRIVE. */
function card(drive) {
  check(TED);
  check(BAZA);
  check(RTL);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TED.COM", bytes(TED));
  a.write("BAZA.COM", bytes(BAZA));
  a.write("BAZA.RTL", bytes(RTL));
  volume(image, drive).write("TIMES.BAS", Buffer.from(SOURCE), { text: true });
  return image;
}

test("TED on TIMES.BAS: ^T B builds with BAZA and comes back clean, ^T D says No debugger, ^T R runs TIMES, and a syntax error brings TED back on its line", { skip: SKIP, timeout: 1_800_000 }, () => {
  const image = card("A");
  const m = boot(image, { tms: true, matrix: true });
  let mark = m.output.length;
  const since = () => m.text(mark);
  const status = () => m.screen()[23];
  keys(m, "ted times.bas\r", "TED", () => /TED +TIMES\.BAS/.test(status()));

  mark = m.output.length;
  keys(m, "\x14b", "the good build's return", () => /TED\r\n/.test(since()) && /THOR\.PRJ: TIMES\.BAS/.test(status()));
  assert.match(since(), /A>A:BAZA TIMES\.BAS\r\nCOM written\r\n/, "A:'s BAZA, the drive TED was loaded from");
  assert.ok(names(image, "A").includes("TIMES.COM"), "TIMES.COM on A:");
  assert.ok(!names(image, "A").includes("THOR.ERR"), "no THOR.ERR");
  assert.equal(word(m, CURSOR), 0, "back at the start");

  const files = names(image, "A");
  mark = m.output.length;
  keys(m, "\x14d", "^T D", () => /No debugger/.test(status()));
  assert.doesNotMatch(since(), /A>/, "nothing chained: no prompt");
  assert.deepEqual(names(image, "A"), files, "nothing written");
  assert.equal(word(m, CURSOR), 0, "the same place");

  mark = m.output.length;
  keys(m, "\x14r", "TIMES's first question", () => /WHAT IS YOUR NAME\? $/.test(since()));
  keys(m, "TEC\r7\r", "the table and the wait", () => /Press a key/.test(since()));
  assert.match(since(), /A>A:BAZA TIMES\.BAS\r\nCOM written\r\n[^]*A>TIMES\r\nHELLO FROM BASIC ON TEC-OS\.\r\n[^]* 12 X 7  = 84 \r\n[^]*GOODBYE, TEC!\r\n/, "built again, then TIMES ran");
  keys(m, " ", "TED again", () => /L1 C1/.test(status()));
  assert.equal(word(m, CURSOR), 0, "the same place as before ^T R");
  const good = sha(image, "A", "TIMES.COM");
  const before = names(image, "A");

  // Line 10 becomes "95 print (": in order, but its expression is unfinished.
  keys(m, "\x04".repeat(9), "line 10", () => /L10 C1/.test(status()));
  keys(m, `${BAD}\r`, "the bad line", () => /L11 C1/.test(status()));
  mark = m.output.length;
  keys(m, "\x14b", "the failed build's return", () => /TED\r\n/.test(since()) && /\?SYNTAX ERROR IN 95/.test(status()));
  // The console names BASIC line 95; TED's place, the file's line 10, comes
  // from BAZA's THOR.ERR record, TIMES.BAS:10:1:, which TED takes.
  assert.match(since(), /A>A:BAZA TIMES\.BAS\r\n\?SYNTAX ERROR IN 95\r\n/, "BAZA's message");
  assert.equal(word(m, CURSOR), LINE10, "at the error's line");
  assert.equal(text(image, "A", "TIMES.BAS").split("\n")[9], BAD, "^T B saved first");
  assert.equal(sha(image, "A", "TIMES.COM"), good, "the failed compile leaves the last TIMES.COM as it was");
  assert.deepEqual(names(image, "A"), before, "no temporary file left, and no THOR.ERR once TED has it");
  keys(m, "\x11", "the prompt", () => since().endsWith("A>"));
  assert.deepEqual(m.violations, []);
});

test("a project on B: builds with A:'s BAZA, which finds BAZA.RTL on its load drive", { skip: SKIP, timeout: 900_000 }, () => {
  const image = card("B");
  const m = boot(image, { tms: true, matrix: true });
  let mark = m.output.length;
  const since = () => m.text(mark);
  const status = () => m.screen()[23];
  keys(m, "b:\r", "B:", () => since().endsWith("B>"));
  keys(m, "ted times.bas\r", "A:'s TED on B:'s file", () => /TED +TIMES\.BAS/.test(status()));
  mark = m.output.length;
  keys(m, "\x14b", "the build's return", () => /TED\r\n/.test(since()) && /THOR\.PRJ: TIMES\.BAS/.test(status()));
  assert.match(since(), /A:BAZA TIMES\.BAS\r\nCOM written\r\n/, "A:'s BAZA");
  keys(m, "\x11", "the prompt", () => since().endsWith("B>"));
  const onB = names(image, "B");
  assert.ok(onB.includes("TIMES.COM"), `TIMES.COM on B:: ${onB.join(" ")}`);
  assert.ok(!onB.includes("BAZA.RTL") && !onB.includes("THOR.ERR"), onB.join(" "));
  assert.ok(!names(image, "A").includes("TIMES.COM"), "nothing written on A:");
  keys(m, "times\r", "TIMES on B:", () => /WHAT IS YOUR NAME\? $/.test(since()));
  assert.deepEqual(m.violations, []);
});
