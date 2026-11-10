// TIMES.BAS (KD-262), the starter's first BASIC program: PRINT, INPUT, a FOR
// loop and a little arithmetic, in the dialect BAZA compiles: numbered lines
// in ascending order, upper case, 40 columns. BAZA builds it on TEC-OS and
// TIMES runs on the PICO9918 at 40 columns and returns to the prompt; with
// GLCD.SVC loaded, BAZA, which claims RST 1 to RST 6 while it runs, and TIMES
// both run, the restart vectors are as they were at the next prompt (a warm
// boot's sweep would also mend them) and the GLCD is still the console. Emulator evidence. BAZA.COM and BAZA.RTL are pinned inputs
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
// A number prints with a space each side, as in Microsoft BASIC.
const TABLE = Array.from({ length: 12 }, (_, i) => ` ${i + 1} X 7 = ${(i + 1) * 7} `);
const RUN = [
  "HELLO FROM BASIC ON TEC-OS.",
  "WHAT IS YOUR NAME? TEC",
  "HI, TEC.",
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

/** BAZA TIMES, then TIMES answered TEC and 7: the console's output from the run. */
function buildAndRun(m) {
  let mark = m.output.length;
  keys(m, "baza times\r", "BAZA's build", () => /COM written\r\n/.test(m.text(mark)) && m.ready());
  mark = m.output.length;
  keys(m, "times\r", "the first question", () => /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  keys(m, "TEC\r", "the second question", () => /PICK A NUMBER, 1 TO 12\? $/.test(m.text(mark)));
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

test("with GLCD.SVC loaded, BAZA builds TIMES and TIMES runs, the restart vectors are as they were, and the GLCD is still the console", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, () => {
  const m = boot(card(), { matrix: true });
  const vectors = () => Array.from({ length: 0x30 }, (_, i) => m.read(0x08 + i)); // RST 1 to RST 6, 08h-37h
  assert.ok(m.videoConsole(), "the GLCD is the console");
  assert.match(m.command("SERVICES"), /GLCD/, "GLCD.SVC loaded");
  const before = vectors();
  const run = buildAndRun(m);
  assert.ok(run.includes(RUN.join("\r\n") + "\r\n"), run);
  assert.deepEqual(vectors(), before, "RST 1 to RST 6 after BAZA and TIMES");
  assert.ok(m.videoConsole(), "the GLCD is still the console");
  keys(m, "dir times.*\r", "DIR", () => m.ready());
  const g = m.glcdScreen();
  assert.ok(g.includes("TIMES.BAS") && g.includes("TIMES.COM"), g.join("\n"));
  assert.equal(g.filter((l) => l.trim()).at(-1), "A>", "the GLCD's prompt");
  assert.deepEqual(m.violations, []);
});
