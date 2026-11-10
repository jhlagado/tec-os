// TIMES.BAS, the starter's first BASIC program: print, input, a for loop
// and a little arithmetic, in the dialect BAZA compiles: numbered lines in
// ascending order, in lower case outside its strings, spaced out within 80
// columns. BAZA builds it on TEC-OS and TIMES runs on the PICO9918 at 40
// columns, turns away a number outside 1 to 12 and returns to the prompt.
// With GLCD.SVC loaded and a JP held in RST 1, BAZA takes RST 1 while it
// compiles and gives the held JP back, TIMES runs, and the GLCD is still the
// console. A failed compile's return code stops a chained line, and a
// compile onto a read-only drive fails through BAZA's own exit. Emulator
// evidence. BAZA.COM and BAZA.RTL are pinned inputs (test/inputs.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { createContainer } from "../tools/lib/container.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");
const SOURCE = readFileSync(resolve(ROOT, "programs/TIMES.BAS"), "utf8");
const LIMIT = 400_000_000;
// TIMES.COM as the pinned BAZA compiles TIMES.BAS: 8,960 bytes. It moves
// with BAZA.COM and BAZA.RTL, whose runtime it carries.
const TIMES_COM = "cfd128210690ec47858d57c6b61ade7312f5c949fe2606eaf42a299a341def09";
// A number prints with a space each side, as in Microsoft BASIC, and TAB(4)
// and TAB(9) line up the X and the = whatever the numbers' widths.
const TABLE = Array.from({ length: 12 }, (_, i) => `${` ${i + 1} `.padEnd(4)}X 7 `.padEnd(9) + `= ${(i + 1) * 7} `);
const RUN = [
  "HELLO FROM BASIC ON TEC-OS.",
  "WHAT IS YOUR NAME? TEC",
  "HI, TEC.",
  "PICK A NUMBER, 1 TO 12? 13",
  "PLEASE PICK 1 TO 12.",
  "PICK A NUMBER, 1 TO 12? 7",
  "THE 7 TIMES TABLE:",
  ...TABLE,
  "THEY ADD UP TO 546 ",
  "THAT IS 45.5 ON AVERAGE.",
  "GOODBYE, TEC!",
];

/** A card with BAZA, its library and TIMES.BAS on A:, or on IMAGE's A:. */
function card(image = standardCard()) {
  check(BAZA);
  check(RTL);
  const a = volume(image, "A");
  a.write("BAZA.COM", new Uint8Array(readFileSync(BAZA.path)));
  a.write("BAZA.RTL", new Uint8Array(readFileSync(RTL.path)));
  a.write("TIMES.BAS", Buffer.from(SOURCE), { text: true });
  return image;
}

/** The BDOS 108 return code (test/chain.test.mjs). */
const code = (m) => m.read(m.sym("PRGCODE")) | (m.read(m.sym("PRGCODE") + 1) << 8);

/**
 * Plant JP ABICALL in RST 1, which a warm boot's sweep keeps
 * (test/svc.test.mjs): the three bytes.
 */
function holdRst1(m) {
  const abicall = m.sym("ABICALL");
  const held = [0xc3, abicall & 0xff, abicall >> 8];
  held.forEach((b, i) => m.write(0x08 + i, b));
  return held;
}

/** Keys for M, each when it waits for one, then until it waits with nothing queued and DONE holds. */
function keys(m, s, what, done) {
  m.enqueueInput(s, "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
}

/**
 * BAZA TIMES, then TIMES answered TEC, 13 and 7: the console's output from
 * the run. DURING runs at each step of the build.
 */
function buildAndRun(m, during = () => {}) {
  let mark = m.output.length;
  m.enqueueInput("baza times\r", "matrix");
  m.runUntilChecked(() => (m.pumpInput(), during(), !m.pending?.length && m.waitingForInput() && /COM written\r\n/.test(m.text(mark)) && m.ready()), LIMIT, "BAZA's build");
  mark = m.output.length;
  keys(m, "times\r", "the first question", () => /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  keys(m, "TEC\r", "the second question", () => /PICK A NUMBER, 1 TO 12\? $/.test(m.text(mark)));
  keys(m, "13\r", "the question again", () => /PLEASE PICK 1 TO 12\.\r\nPICK A NUMBER, 1 TO 12\? $/.test(m.text(mark)));
  keys(m, "7\r", "the table and the prompt", () => m.ready());
  return m.text(mark);
}

test("TIMES.BAS has ascending line numbers, is lower case outside its strings and fits 80 columns", () => {
  const lines = SOURCE.split("\n");
  assert.equal(lines.pop(), "", "ends with a newline");
  const numbers = lines.map((l) => Number(/^(\d+) \S/.exec(l)?.[1]));
  assert.ok(numbers.every((n, i) => n > 0 && (i === 0 || n > numbers[i - 1])), "numbered, ascending");
  assert.ok(lines.every((l) => l.length <= 80), "fits 80 columns");
  const outside = SOURCE.replace(/"[^"\n]*"/g, '""');
  assert.equal(outside, outside.toLowerCase(), "lower case outside the strings");
  assert.ok(!SOURCE.includes("\t"), "spacing is independent of tab stops");
  for (const word of ["rem", "print", "input", "for", "next"]) assert.match(SOURCE, new RegExp(`^\\d+ ${word} `, "m"), word);
});

test("BAZA builds TIMES on TEC-OS, and TIMES runs at 40 columns and returns to the prompt", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const image = card();
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  const run = buildAndRun(m);
  assert.ok(run.includes(RUN.join("\r\n") + "\r\n"), run);
  const screen = m.screen().map((l) => l.trimEnd());
  while (!screen.at(-1)) screen.pop();
  assert.deepEqual(screen.slice(-RUN.length - 2), [...RUN.map((l) => l.trimEnd()), "", "A>"], "the screen, no line wrapped");
  const com = Buffer.from(volume(image, "A").read("TIMES.COM"));
  // BAZA's output for this source: a restyle that changes the program's code
  // changes it.
  assert.equal(createHash("sha256").update(com).digest("hex"), TIMES_COM, "TIMES.COM's bytes");
  assert.deepEqual(m.violations, []);
});

test("with GLCD.SVC loaded and a JP held in RST 1, BAZA takes RST 1 while it compiles and gives the JP back, TIMES runs, and the GLCD is still the console", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const m = boot(card(), { matrix: true });
  assert.ok(m.videoConsole(), "the GLCD is the console");
  assert.match(m.command("SERVICES"), /GLCD/, "GLCD.SVC loaded");
  // Once BAZA has taken RST 1, only BAZA's own restore puts the held JP back.
  const held = holdRst1(m);
  const rst1 = () => [0, 1, 2].map((i) => m.read(0x08 + i));
  const rest = () => Array.from({ length: 0x28 }, (_, i) => m.read(0x10 + i)); // RST 2 to RST 6, 10h-37h
  const others = rest();
  let taken;
  const run = buildAndRun(m, () => {
    if (!taken && rst1().some((b, i) => b !== held[i])) taken = rst1();
  });
  assert.ok(taken, "BAZA took RST 1 while it compiled");
  assert.deepEqual(rst1(), held, "the held JP after BAZA and TIMES");
  assert.deepEqual(rest(), others, "RST 2 to RST 6 after BAZA and TIMES");
  assert.ok(run.includes(RUN.join("\r\n") + "\r\n"), run);
  assert.ok(m.videoConsole(), "the GLCD is still the console");
  keys(m, "dir times.*\r", "DIR", () => m.ready());
  const g = m.glcdScreen();
  assert.ok(g.includes("TIMES.BAS") && g.includes("TIMES.COM"), g.join("\n"));
  assert.equal(g.filter((l) => l.trim()).at(-1), "A>", "the GLCD's prompt");
  assert.deepEqual(m.violations, []);
});

// KD-262 item 3: a failed compile sets the return code FF00h, as TAS does, so
// a chained line's : piece is skipped (test/chain.test.mjs).
test("a failed compile's return code stops a chained line: BAZA BAD!:TIMES runs no TIMES, and BAZA TIMES!:TIMES does", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const image = card();
  volume(image, "A").write("BAD.BAS", Buffer.from("10 print (\n"), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  let mark = m.output.length;
  keys(m, "baza times!:times\r", "the good chain", () => /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  assert.match(m.text(mark), /COM written\r\n[^]*HELLO FROM BASIC ON TEC-OS\./, "TIMES ran after a good compile");
  keys(m, "TEC\r7\r", "the prompt", () => m.ready());
  mark = m.output.length;
  keys(m, "baza bad!:times\r", "the failed chain", () => (m.ready() && /A>$/.test(m.text(mark))) || /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  const out = m.text(mark);
  assert.match(out, /\?SYNTAX ERROR IN 10/, "BAZA's error");
  assert.equal(code(m), 0xff00, "the return code");
  assert.doesNotMatch(out, /HELLO FROM BASIC|WHAT IS YOUR NAME/, `no TIMES after the failure:\n${out}`);
  assert.ok(!volume(image, "A").list().some((f) => f.name === "BAD.COM"), "no BAD.COM");
  assert.deepEqual(m.violations, []);
});

// BAZA sets CP/M 3's error mode FEh (BDOS function 45), so a disk error
// returns to it and it leaves through its own exit.
test("a compile onto a read-only drive fails with return code FF00h, gives back RST 1's held JP and ends at A>", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const image = card(createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
  ]));
  const c = volume(image, "C");
  c.write("TIMES.BAS", Buffer.from(SOURCE), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const held = holdRst1(m);
  const rst1 = () => [0, 1, 2].map((i) => m.read(0x08 + i));
  let taken = false;
  const mark = m.output.length;
  m.enqueueInput("baza c:times!:type c:times.bas\r", "matrix");
  m.runUntilChecked(() => {
    m.pumpInput();
    taken ||= rst1().some((b, i) => b !== held[i]);
    return !m.pending?.length && m.waitingForInput() && m.ready() && /A>$/.test(m.text(mark));
  }, LIMIT, "the failed compile and the prompt");
  const out = m.text(mark);
  assert.match(out, /Bdos Err On C: R\/O/, "the BDOS's message, which returns");
  assert.match(out, /File I\/O failed\r\n\r\nA>:type c:times\.bas\r\nA>$/, `BAZA's failure, then the : piece skipped at A>:\n${out}`);
  assert.doesNotMatch(out, /10 rem/, "TYPE didn't run");
  assert.ok(taken, "BAZA took RST 1 while it compiled");
  assert.deepEqual(rst1(), held, "the held JP after the failure");
  assert.equal(code(m), 0xff00, "the return code, which the skipped piece leaves");
  // A guard only: the emulated read-only volume keeps C: as it was whatever BAZA does.
  assert.deepEqual(volume(image, "C").list().map((f) => f.name), ["TIMES.BAS"], "C: unchanged");
  assert.equal(m.read(4) & 15, 0, "A: still current");
  assert.deepEqual(m.violations, []);
});

// A program that claims the PICO9918 through CALL and then stops on an
// error: BAZA's runtime gives the display back before it prints, so the
// message shows on the console.
test("a program that claims the display and then fails shows its error on the console", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const image = card();
  const program = [
    "10 rem claim the display, then fail",
    "20 def call vi = rom 3",
    "30 call vi, b = 1",
    "40 print 1 / 0",
    "",
  ].join("\n");
  volume(image, "A").write("CLAIM.BAS", Buffer.from(program), { text: true });
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  let mark = m.output.length;
  keys(m, "baza claim\r", "BAZA's build", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /COM written\r\n/);
  mark = m.output.length;
  keys(m, "claim\r", "the failed run", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /\?DIVISION BY ZERO ERROR IN 40/, "the error, printed");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.ok(m.screen().some((l) => /^\?DIVISION BY ZERO ERROR IN 40/.test(l)), `on the screen:\n${m.screen().join("\n")}`);
  assert.deepEqual(m.violations, []);
});

// BAZA renames the old TIMES.COM to BZnnnnnn.$$B while the new one goes in. A
// backup of that name left by an interrupted build must not stop the next.
test("a leftover BZ000000.$$B doesn't stop BAZA TIMES replacing TIMES.COM", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const image = card();
  const a = volume(image, "A");
  const stale = new Uint8Array(128).fill(0xc9);
  const leftover = new Uint8Array(128).fill(0x55);
  a.write("TIMES.COM", stale);
  a.write("BZ000000.$$B", leftover);
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  const mark = m.output.length;
  keys(m, "baza times\r", "BAZA's build", () => m.ready() && /A>$/.test(m.text(mark)));
  assert.match(m.text(mark), /COM written\r\n/);
  assert.equal(code(m), 0, "no failure");
  const after = volume(image, "A");
  assert.equal(createHash("sha256").update(Buffer.from(after.read("TIMES.COM"))).digest("hex"), TIMES_COM, "the new TIMES.COM");
  assert.deepEqual(Array.from(after.read("BZ000000.$$B").subarray(0, 128)), Array.from(leftover), "the leftover, as it was");
  assert.deepEqual(after.list().map((f) => f.name).filter((n) => /\$\$/.test(n)), ["BZ000000.$$B"], "no other temporary file");
  assert.deepEqual(m.violations, []);
});
