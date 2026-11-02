// KS32's walk: EDIT X.ASM!TAS X!:X typed once, with the shipped Edit and TAS,
// on the PICO9918 and matrix keyboard. Edit opens X.ASM and ^Q leaves it; TAS
// assembles it. A source that fails leaves TAS's message on the screen, and its
// FF00h stops the line before the stale X.COM can run; one that assembles runs
// X. Emulator evidence. TAS.COM and EDIT.COM are pinned inputs
// (test/inputs.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { editForAbi4 } from "../tools/lib/edit.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TAS = pinned("TAS.COM");
const EDIT = pinned("EDIT.COM");
export const LINE = "edit x.asm!tas x!:x";
export const GOOD = 'ORG $100\nLD DE,MSG\nLD C,9\nCALL 5\nRET\nMSG: DB "X RAN",13,10,"$"\n';
export const BAD = GOOD.replace("CALL 5", "CALL NOWHERE");

/** The walk on a card whose X.ASM is SOURCE and whose X.COM is a stale RET: the screen at the prompt after it. */
export function walk(source) {
  check(TAS);
  check(EDIT);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("EDIT.COM", editForAbi4(new Uint8Array(readFileSync(EDIT.path)), ROOT));
  a.write("X.ASM", Buffer.from(source), { text: true });
  a.write("X.COM", Uint8Array.from([0xc9]));
  const m = boot(image, { tms: true, matrix: true });
  const from = m.output.length;
  m.typeMatrix(`${LINE}\r`);
  m.runUntilChecked(() => m.waitingForInput() && m.screen()[0] === "ORG $100", 800_000_000, "Edit's first screen");
  m.typeMatrix("\x11"); // ^Q
  m.runUntilChecked(() => m.ready() && m.read(m.sym("CHPOS")) === 0, 3_000_000_000, "the prompt after the line", 200_000);
  assert.deepEqual(m.violations, []);
  const names = volume(image, "A").list().map((f) => f.name);
  return { screen: m.screen().filter((l) => l), text: m.text(from), xCom: names.includes("X.COM"), xDbg: names.includes("X.DBG") };
}

test("the walk with a source that fails: the prompt comes back with TAS's message, and :x doesn't run", { skip: TAS.skip || EDIT.skip, timeout: 1_800_000 }, () => {
  const w = walk(BAD);
  assert.deepEqual(w.screen, ["A>tas x", "X.ASM:4:6: undefined symbol NOWHERE", "A>:x", "A>"]);
  assert.equal(w.xCom, true, "the stale X.COM stays, and nothing ran it");
  assert.equal(w.xDbg, false, "a failed build leaves no debug file");
});

test("the walk with a source that assembles: X runs", { skip: TAS.skip || EDIT.skip, timeout: 1_800_000 }, () => {
  const w = walk(GOOD);
  assert.deepEqual(w.screen, ["A>tas x", "X.COM written", "A>:x", "X RAN", "A>"]);
  assert.equal(w.xCom, true);
  assert.equal(w.xDbg, true, "TAS's debug file beside it");
});
