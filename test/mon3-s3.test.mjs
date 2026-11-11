// MON3.SVC's third stage: MON-3's RST 18h graphics calls against MON-3's own
// ROM, the graphics workspace at entry, the GLCD console after a program
// returns, the five GLCD programs of the pinned repository, and the size.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_PROGRAMS, PROGRAMS, RULES, fromInputs, realProgram } from "./lib/mon3src.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib/fixtures.mjs";
import { MON3_CEILING, mon3Sources, mon3Variant, services, word } from "./lib/mon3.mjs";
import { boot, mon3Build, sha } from "./lib/mon3s2.mjs";
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

// The size: at most 18 pages, 4,608 bytes of header and image; (0006h) at
// least A700h on the starter card, so a TPA of at least 42,496, and 41,728
// with GLCD.SVC; TAS's file equal to ATOM's; each source file within the
// style's 24,576 bytes, and passing its checker.

async function sizeAndTpa(svc) {
  const C = MON3_CEILING;
  assert.ok(svc.image <= C.bytes, `the header and image, ${svc.image} bytes, within ${C.bytes}`);
  const m = boot({ "MON3.SVC": svc.file });
  m.command("MON3.SVC");
  const pages = Number(services(m)[0].split(" ")[1]);
  assert.ok(pages <= C.pages, `${pages} pages, at most ${C.pages}`);
  const top = word(m, 6);
  assert.ok(top >= C.top && top - 0x100 >= C.tpa, `(0006h) ${top.toString(16)}h, TPA ${top - 0x100}, at least ${C.tpa}`);
  const g = boot({ "MON3.SVC": svc.file }, { matrix: true });
  assert.deepEqual(services(g).map((l) => l.split(" ")[0]), ["GLCD"], "GLCD.SVC installed");
  g.command("MON3.SVC");
  const both = word(g, 6) - 0x100;
  assert.ok(both >= C.tpaGlcd, `TPA with GLCD.SVC ${both}, at least ${C.tpaGlcd}`);
  return { pages, top, tpa: top - 0x100, both };
}

test("KG67 size and tpa", async () => {
  const svc = await mon3Build();
  const f = await sizeAndTpa(svc);
  console.log(`MON3.SVC: file ${svc.file.length} bytes, header and image ${svc.image}, ${f.pages} pages, ${f.pages * 256 - svc.image} bytes left, (0006h) ${f.top.toString(16)}h, TPA ${f.tpa}, ${f.both} with GLCD.SVC`);
  const { tasAssembler, romBackend } = await import("../tools/lib/tas-rom.mjs");
  if (romBackend() === "tas") {
    const { assembleMon3 } = await import("../tools/lib/tas-distribution.mjs");
    assert.deepEqual([...(await assembleMon3(ROOT, await tasAssembler()))], [...svc.file], "TAS's MON3.SVC equals ATOM's");
  }
  const { checkCompactSource } = await import("../tools/lib/style-compact.mjs");
  const routines = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-routines.json"), "utf8"));
  const exceptions = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-exceptions.json"), "utf8"));
  const files = mon3Sources();
  assert.deepEqual(Object.keys(files), ["mon3.asm", "mon3api.asm", "mon3io.asm", "mon3hex.asm", "mon3gfx.asm"], "the five source files");
  for (const [n, text] of Object.entries(files)) {
    const r = checkCompactSource(text, n, routines[`drivers/${n}`], exceptions[`drivers/${n}`]);
    assert.ok(r.bytes <= 24576, `${n}: ${r.bytes} bytes`);
    assert.deepEqual(r.faults, [], `${n} passes the style checker`);
  }
});

test("KG67 mutant: the build with buffers added to 4,609 bytes takes 19 pages", async () => {
  const svc = await mon3Build();
  const big = await mon3Variant([["  DS 80\nMSTK:\n", `  DS 80+${4609 - svc.image}\nMSTK:\n`]]);
  assert.equal(big.image, 4609);
  await assert.rejects(sizeAndTpa(big), /within 4608/);
  const m = boot({ "MON3.SVC": big.file });
  m.command("MON3.SVC");
  assert.deepEqual(services(m), ["MON3 19"], "19 pages");
});
