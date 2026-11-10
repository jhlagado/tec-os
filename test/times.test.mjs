// TIMES.BAS (KD-262), the starter's first BASIC program: PRINT, INPUT, a FOR
// loop and a little arithmetic, in the dialect BAZA compiles: numbered lines
// in ascending order, upper case, 40 columns. BAZA builds it on TEC-OS and
// TIMES runs on the PICO9918 at 40 columns, turns away a number outside 1 to
// 12 and returns to the prompt. With GLCD.SVC loaded and a JP held in RST 1,
// BAZA takes RST 1 while it compiles and gives the held JP back, TIMES runs,
// and the GLCD is still the console. A failed compile's return code stops a
// chained line. Emulator evidence. BAZA.COM and BAZA.RTL are pinned inputs
// (test/inputs.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");
const SOURCE = readFileSync(resolve(ROOT, "programs/TIMES.BAS"), "utf8");
const LIMIT = 400_000_000;
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

/** A card with BAZA, its library and TIMES.BAS on A:. */
function card() {
  check(BAZA);
  check(RTL);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("BAZA.COM", new Uint8Array(readFileSync(BAZA.path)));
  a.write("BAZA.RTL", new Uint8Array(readFileSync(RTL.path)));
  a.write("TIMES.BAS", Buffer.from(SOURCE), { text: true });
  return image;
}

/** Keys for M, each when it waits for one, then until it waits with nothing queued and DONE holds. */
function keys(m, s, what, done) {
  m.enqueueInput(s, "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
}

/** BAZA TIMES, then TIMES answered TEC, 13 and 7: the console's output from the run. DURING runs at each step of the build. */
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

test("TIMES.BAS has ascending line numbers, is upper case and fits 40 columns", () => {
  const lines = SOURCE.split("\n");
  assert.equal(lines.pop(), "", "ends with a newline");
  const numbers = lines.map((l) => Number(/^(\d+) \S/.exec(l)?.[1]));
  assert.ok(numbers.every((n, i) => n > 0 && (i === 0 || n > numbers[i - 1])), "numbered, ascending");
  assert.ok(lines.every((l) => l.length <= 40), "fits 40 columns");
  assert.equal(SOURCE, SOURCE.toUpperCase(), "upper case");
  assert.ok(!SOURCE.includes("\t"), "spacing is independent of tab stops");
  for (const word of ["PRINT", "INPUT", "FOR", "NEXT"]) assert.match(SOURCE, new RegExp(`^\\d+ ${word} `, "m"), word);
});

test("BAZA builds TIMES on TEC-OS, and TIMES runs at 40 columns and returns to the prompt", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const image = card();
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  const run = buildAndRun(m);
  assert.ok(run.includes(RUN.join("\r\n") + "\r\n"), run);
  const screen = m.screen().map((l) => l.trimEnd());
  while (!screen.at(-1)) screen.pop();
  assert.deepEqual(screen.slice(-RUN.length - 2), [...RUN.map((l) => l.trimEnd()), "", "A>"], "the screen, no line wrapped");
  assert.ok(volume(image, "A").list().some((f) => f.name === "TIMES.COM"), "TIMES.COM on A:");
  assert.deepEqual(m.violations, []);
});

test("with GLCD.SVC loaded and a JP held in RST 1, BAZA takes RST 1 while it compiles and gives the JP back, TIMES runs, and the GLCD is still the console", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const m = boot(card(), { matrix: true });
  assert.ok(m.videoConsole(), "the GLCD is the console");
  assert.match(m.command("SERVICES"), /GLCD/, "GLCD.SVC loaded");
  // JP ABICALL is above PZTOP, so a warm boot's sweep keeps it
  // (test/svc.test.mjs): once BAZA has taken RST 1, only BAZA's own restore
  // puts the JP back.
  const abicall = m.sym("ABICALL");
  const held = [0xc3, abicall & 0xff, abicall >> 8];
  held.forEach((b, i) => m.write(0x08 + i, b));
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

// KD-262 item 3: a failed compile sets the return code, so a chained line
// stops. A : piece runs unless the code is FF00h to FFFEh (test/chain.test.mjs),
// as TAS sets FF00h; BAZA b6ecccf ends a failed compile with code 1
// (src/errors.asm, ERRDONE), so the line goes on. Marked todo until BAZA
// sets a failure code.
test("a failed compile's return code stops a chained line: BAZA BAD!:TIMES runs no TIMES, and BAZA TIMES!:TIMES does", { skip: BAZA.skip || RTL.skip, todo: "BAZA b6ecccf returns 1, not FF00h, on a failed compile", timeout: 900_000 }, () => {
  const image = card();
  volume(image, "A").write("BAD.BAS", Buffer.from("10 PRINT (\n"), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  let mark = m.output.length;
  keys(m, "baza times!:times\r", "the good chain", () => /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  assert.match(m.text(mark), /COM written\r\n[^]*HELLO FROM BASIC ON TEC-OS\./, "TIMES ran after a good compile");
  keys(m, "TEC\r7\r", "the prompt", () => m.ready());
  mark = m.output.length;
  keys(m, "baza bad!:times\r", "the failed chain", () => (m.ready() && /A>$/.test(m.text(mark))) || /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  const out = m.text(mark);
  assert.match(out, /\?SYNTAX ERROR IN 10/, "BAZA's error");
  assert.doesNotMatch(out, /HELLO FROM BASIC|WHAT IS YOUR NAME/, `no TIMES after the failure:\n${out}`);
  assert.ok(!volume(image, "A").list().some((f) => f.name === "BAD.COM"), "no BAD.COM");
  assert.deepEqual(m.violations, []);
});
