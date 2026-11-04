// The assembly style's checker (tools/lib/style.mjs): a source that keeps
// every rule has no fault, and one that breaks a single rule has that rule's
// faults and no other.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSource, LIMITS, toTabs } from "../tools/lib/style.mjs";

/** TEXT followed by tabs to COL (1-based), with tab stops every 8. */
function tabTo(text, col) {
  let at = 1;
  for (const ch of text) at = ch === "\t" ? Math.floor((at - 1) / 8) * 8 + 9 : at + 1;
  let out = text;
  while (at < col) {
    out += "\t";
    at = Math.floor((at - 1) / 8) * 8 + 9;
  }
  return out;
}

/** LINE with its tabs written as the spaces they stand for. */
function spaced(line) {
  let out = "";
  for (const ch of line) out += ch === "\t" ? " ".repeat(8 - (out.length % 8)) : ch;
  return out;
}

/** A source line in the style: the label, then the mnemonic at 9, the operand at 17, the comment at 33. */
function line(label, mnemonic, operand = "", comment = "") {
  let s = tabTo(label, 9) + mnemonic;
  if (operand) s = tabTo(s, 17) + operand;
  if (comment) s = tabTo(s, 33) + `; ${comment}`;
  return s;
}

/** A routine of N code lines, each commented when COMMENTED says so for its index. */
function routine(name, n, commented = () => true) {
  const out = [`; ${name}: adds one to the count ${n} times. Destroys A.`];
  for (let i = 0; i < n; i += 1) out.push(line(i === 0 ? `${name}:` : "", "INC", "A", commented(i) ? "one more" : ""));
  out.push(line("", "RET"));
  return out;
}

const GOOD = [
  "; A source that keeps the style.",
  "",
  ...routine("ADDS", 4),
  "",
  line("COUNT:", "DB", "0", "the count, data"),
  "",
].join("\n");

// The routine's second line, a whole line, and GOOD with it replaced by WITH.
const INC = line("", "INC", "A", "one more");
const swap = (WITH) => GOOD.replace(`\n${INC}\n`, `\n${WITH}\n`);

const rules = (r) => [...new Set(r.faults.map((f) => f.rule))].sort();

test("a source that keeps every rule has no fault, and its figures are counted", () => {
  const r = checkSource(GOOD, "GOOD.ASM");
  assert.deepEqual(r.faults, []);
  assert.deepEqual([r.codeLines, r.commented, r.routines, r.headless, r.longestRun], [5, 4, 1, 0, 1]);
});

const BAD = {
  tabs: [swap(spaced(INC)), "BAD.ASM"],
  column: [swap(`${line("", "INC", "A")}\t; one more`), "BAD.ASM"],
  end: [swap(line("", "INC", "A", "one more, ".repeat(6))), "BAD.ASM"],
  header: [GOOD.replace("; ADDS: adds one to the count 4 times. Destroys A.\n", ""), "BAD.ASM"],
  density: [["", ...routine("FEW", 4, () => false).flatMap((l, i) => (i === 3 ? [l, line("", "", "", "") + "; a step"] : [l]))].join("\n").replace(/\t+; a step/, "\t\t\t\t; a step"), "BAD.ASM"],
  run: [["", ...routine("LONG", 12, (i) => i < 1 || i > 5)].join("\n"), "BAD.ASM"],
  size: [`${GOOD}\n${"; a comment line to make the file long, and no more than that\n".repeat(400)}`, "BAD.ASM"],
  name: [GOOD, "TOOLONGNAME.ASM"],
};

for (const [rule, [text, name]] of Object.entries(BAD)) {
  test(`a source breaking only the ${rule} rule has ${rule} faults and no other`, () => {
    assert.deepEqual(rules(checkSource(text, name)), [rule]);
  });
}

test("a name with a hyphen, or a type that isn't three letters, is no 8.3 name", () => {
  for (const name of ["STY-LE.ASM", "STYLE.AS", "STYLE.ASMX"]) assert.deepEqual(rules(checkSource(GOOD, name)), ["name"], name);
  for (const name of ["STYLE.ASM", "ABI.INC", "X.ASM"]) assert.deepEqual(rules(checkSource(GOOD, name)), [], name);
});

test("SET with a bit and a register is an instruction, the directive is not", () => {
  const counted = (text) => checkSource(text, "X.ASM").codeLines;
  assert.equal(counted(`; A header.\n${line("X:", "SET", "7,(HL)", "the flag")}\n${line("", "RET")}`), 2);
  assert.equal(counted(`${line("Y", "SET", "5")}\n`), 0);
});

test("the limits are the style's", () => {
  assert.deepEqual(LIMITS, { share: 0.4, run: 4, bytes: 24_576, column: 33, end: 80 });
});

test("toTabs lays a spaced source out by tabs, a long label on its own line and every token kept", () => {
  assert.equal(toTabs(GOOD.split("\n").map(spaced).join("\n")), GOOD);
  assert.equal(toTabs("LONGLABEL: LD A,'X' ; a 'quoted' X"), `LONGLABEL:\n${line("", "LD", "A,'X'", "a 'quoted' X")}`);
  assert.equal(toTabs("LONGNAME EQU 5 ; five"), "LONGNAME\tEQU\t5\t; five");
  assert.equal(toTabs("   ; indented"), "\t\t\t\t; indented");
  assert.deepEqual(rules(checkSource(toTabs("; A header.\nX: LD  A,B ; one\n RET\n"), "X.ASM")), []);
});
