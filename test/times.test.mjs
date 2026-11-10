// TIMES.BAS (KD-262), the starter's first BASIC program: PRINT, INPUT, a FOR
// loop and a little arithmetic, in the dialect BAZA compiles: numbered lines
// in ascending order, upper case, 40 columns. BAZA builds it on TEC-OS and
// TIMES runs on the PICO9918 at 40 columns and returns to the prompt.
// Emulator evidence. BAZA.COM and BAZA.RTL are pinned inputs
// (test/inputs.json); until they are pinned the build is skipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const PINS = Object.keys(JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs);
const input = (name) => (PINS.includes(name) ? pinned(name) : { skip: `${name} isn't pinned in test/inputs.json yet` });
const BAZA = input("BAZA.COM");
const RTL = input("BAZA.RTL");
const SOURCE = readFileSync(resolve(ROOT, "programs/TIMES.BAS"), "utf8");
const LIMIT = 400_000_000;

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
  check(BAZA);
  check(RTL);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("BAZA.COM", new Uint8Array(readFileSync(BAZA.path)));
  a.write("BAZA.RTL", new Uint8Array(readFileSync(RTL.path)));
  a.write("TIMES.BAS", Buffer.from(SOURCE), { text: true });
  const m = boot(image, { tms: true, matrix: true, width: 40 });
  const screen = () => {
    const lines = m.screen().map((l) => l.trimEnd());
    while (lines.length && !lines.at(-1)) lines.pop();
    return lines;
  };
  const keys = (s, what, done) => {
    m.enqueueInput(s, "matrix");
    m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
  };
  keys("baza times\r", "BAZA's build", () => screen().some((l) => l === "COM written") && screen().at(-1) === "A>");
  keys("times\r", "the first question", () => screen().some((l) => l.startsWith("WHAT IS YOUR NAME?")));
  keys("TEC\r", "the second question", () => screen().some((l) => l.startsWith("PICK A NUMBER, 1 TO 12?")));
  keys("7\r", "the table and the prompt", () => screen().at(-1) === "A>");
  const text = screen().join("\n");
  const table = Array.from({ length: 12 }, (_, i) => ` ${i + 1} X 7 = ${(i + 1) * 7}`).join("\n");
  assert.ok(text.endsWith([
    "HELLO FROM BASIC ON TEC-OS.",
    "WHAT IS YOUR NAME? TEC",
    "HI, TEC.",
    "PICK A NUMBER, 1 TO 12? 7",
    "THE 7 TIMES TABLE:",
    table,
    "THEY ADD UP TO 546",
    "THAT IS 45.5 ON AVERAGE.",
    "GOODBYE, TEC!",
    "",
    "A>",
  ].join("\n")), text);
  assert.ok(volume(image, "A").list().some((f) => f.name === "TIMES.COM"), "TIMES.COM on A:");
  assert.deepEqual(m.violations, []);
});
