// KG-CCP1's current implementation budget. Historical exact merge accounting
// remains in ks38b.test; these ceilings allow further measured compaction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT, rom } from "../tools/lib/model.mjs";

test("CCP fits the compacted ROM budget without moving work into RAM or reducing TPA", () => {
  const r = rom(ROOT);
  const code = r.symbols.get("BDOSBAS") - r.symbols.get("CCPBAS");
  assert.ok(code <= 2452, `CCP code ${code} exceeds 2452 bytes`);
  assert.ok(r.census.rom.used <= 14577, "whole ROM retains the measured saving");
  assert.equal(r.census.rom.used - code, 12125, "outside-CCP ROM account is unchanged");
  assert.equal(r.census.ram.regions.find((x) => x.label === "CCP state and stack").bytes, 396);
  assert.equal(r.symbols.get("CSTKTOP") - r.symbols.get("CSTKBAS"), 30);
  assert.equal(r.census.ram.tpa.bytes, 46869);
});
