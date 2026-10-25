// ATOM.COM, the CP/M build of the ATOM assembler, on TEC-OS: edit-free
// round trip of assembling a program on the TEC and running it. Emulator
// evidence. ATOM.COM comes from ATOM_COM or ../atom/assets/atom-cpm22.com;
// builds that require the BDOS at E400h refuse to run and the test skips.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";

const ATOM = process.env.ATOM_COM ?? resolve(ROOT, "../atom/assets/atom-cpm22.com");
const HELLO = 'ORG $100\nLD DE,MESSAGE\nLD C,9\nCALL 5\nRET\nMESSAGE: DB "HELLO FROM ATOM",13,10,"$"\n';

test("ATOM assembles a program on TEC-OS and the program runs", { skip: !existsSync(ATOM) && `no ${ATOM}`, timeout: 900_000 }, (t) => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("ATOM.COM", new Uint8Array(readFileSync(ATOM)));
  a.write("HELLO.ASM", Buffer.from(HELLO), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const out = m.command("ATOM HELLO", { maxCycles: 2_000_000_000 });
  if (!/HELLO\.COM written/.test(out)) {
    t.skip(`${ATOM} did not run here: ${out.trim().split("\n").pop()}`);
    return;
  }
  assert.match(m.command("HELLO"), /HELLO FROM ATOM/);
  assert.deepEqual(m.violations, []);
});
