// MON3.SVC's third stage: MON-3's RST 18h graphics calls against MON-3's own
// ROM, the graphics workspace at entry, the GLCD console after a program
// returns, the five GLCD programs of the pinned repository, and the size.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_PROGRAMS, PROGRAMS, RULES, fromInputs, realProgram } from "./lib/mon3src.mjs";
import { sha } from "./lib/mon3s2.mjs";
import { referenceSide, sessionSide } from "./lib/kg65.mjs";
import { REFUSAL_TOP, compareRefusals } from "./lib/kg67.mjs";

// The five GLCD programs, converted with the four rules more and their
// includes found as pinned inputs, give their pinned binaries; the rules
// leave the first five programs' binaries as they were.

test("KG67 program binaries", async () => {
  for (const [name, p] of Object.entries(GLCD_PROGRAMS)) {
    const b = await realProgram(name);
    assert.equal(b.length, p.bytes, `${name}: ${p.bytes} bytes at 4000h`);
    assert.equal(sha(b), p.sha256, `${name}: its pinned hash`);
  }
  for (const [name, p] of Object.entries(PROGRAMS)) {
    assert.equal(sha(await realProgram(name, { rules: RULES })), p.sha256, `${name}: its pinned hash under the four rules too`);
  }
  assert.throws(() => fromInputs("lib/other.z80"), /no pinned input/, "an include outside the pinned files fails");
});

// Each rule is needed: without it a program that uses it does not assemble.
for (const [rule, name, why] of [
  ["r7", "glcd-3d", /undefined symbol Q004/],
  ["r8", "glcd-maze", /expected a comma/],
  ["r9", "glcd-demo", /expected an operand/],
  ["r10", "glcd-demo", /forward reference/],
]) {
  test(`KG67 mutant: the conversion without ${rule.toUpperCase()}, ${name} does not assemble`, async () => {
    await assert.rejects(realProgram(name, { rules: { [rule]: false } }), why);
  });
}

for (const [name, why] of [["glcd-3d", /undefined symbol Q033/], ["glcd-demo", /undefined symbol INITLCD/]]) {
  test(`KG67 mutant: the conversion without .include, ${name} does not assemble`, async () => {
    await assert.rejects(realProgram(name, { include: false }), why);
  });
}

// RST 18h's refusals: a selector of 21 to 33, 34 or FFh shows displayError
// as MON-3's call 11 does, waits for the key and returns as a key press
// does, and changes nothing else: the latch, 0800h-3DFFh outside DISP_BUFF
// and the key variables, and the ST7920, which takes no write. MON-3 also
// refuses 34 and FFh by RST 18h, and those rows are compared with it too.

let refusalSides;
const theRefusalSides = async () => (refusalSides ??= { ref: await referenceSide(), ses: await sessionSide() });

test("KG67 rst 18h refusals", async () => {
  const { ref, ses } = await theRefusalSides();
  const { bad, lowSP } = compareRefusals(ref, ses);
  assert.deepEqual(bad, []);
  assert.ok(lowSP > REFUSAL_TOP, `displayError's stack reaches ${lowSP.toString(16)}h, above the compared bytes`);
  console.log(`RST 18h refusals: 15 selectors, 34 rows; the lowest SP ${lowSP.toString(16)}h`);
});
