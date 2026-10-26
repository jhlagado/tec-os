// ATOM.COM, the CP/M build of the ATOM assembler, on TEC-OS: edit-free
// round trip of assembling a program on the TEC and running it. Emulator
// evidence. ATOM.COM is a pinned input (test/inputs.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const ATOM = pinned("ATOM.COM");
const HELLO = 'ORG $100\nLD DE,MESSAGE\nLD C,9\nCALL 5\nRET\nMESSAGE: DB "HELLO FROM ATOM",13,10,"$"\n';

test("ATOM assembles a program on TEC-OS and the program runs", { skip: ATOM.skip, timeout: 900_000 }, () => {
  check(ATOM);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("ATOM.COM", new Uint8Array(readFileSync(ATOM.path)));
  a.write("HELLO.ASM", Buffer.from(HELLO), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  assert.match(m.command("ATOM HELLO", { maxCycles: 2_000_000_000 }), /HELLO\.COM written/);
  assert.match(m.command("HELLO"), /HELLO FROM ATOM/);
  assert.deepEqual(m.violations, []);
});
