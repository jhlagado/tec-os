// KG-CCP1 stage qualifier; deliberately not part of the generic test suite.
// Run only while qualifying this gate. Later stages set their own budgets.
import assert from "node:assert/strict";
import { ROOT, rom } from "./lib/model.mjs";

{
  const r = rom(ROOT);
  const code = r.symbols.get("BDOSBAS") - r.symbols.get("CCPBAS");
  assert.ok(code <= 2452, `CCP code ${code} exceeds 2452 bytes`);
  assert.ok(r.census.rom.used <= 14577, "whole ROM retains the measured saving");
  assert.equal(r.census.rom.used - code, 12125, "outside-CCP ROM account is unchanged");
  assert.equal(r.census.ram.regions.find((x) => x.label === "CCP state and stack").bytes, 396);
  assert.equal(r.symbols.get("CSTKTOP") - r.symbols.get("CSTKBAS"), 30);
  assert.equal(r.census.ram.tpa.bytes, 46869);
}
console.log("KG-CCP1 ROM, RAM and TPA budget passes");
