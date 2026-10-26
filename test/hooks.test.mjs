// The BDOS calls the BIOS through the RAM BIOS table, so a program that
// replaces an entry there sees everything that passes through it: the
// BDOS's own console output and input, and its warm boots after ^C and a
// disk error. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, program, standardCard, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const record = (m, from, ptr) => Buffer.from(Array.from({ length: word(m, ptr) - from }, (_, i) => m.read(from + i))).toString("latin1");

async function machine() {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  volume(image, "A").write("HOOK.COM", (await program("hook")).bytes);
  return boot(image);
}

test("replaced CONOUT, CONIN and CONST see the BDOS's console traffic, and ^C reaches the replaced WBOOT", async () => {
  const m = await machine();
  m.mark = m.output.length;
  m.type("HOOK\r");
  m.expect(/ABCD$/); // the hooks are in before a key is typed
  m.type("x");
  m.type("y");
  m.type("hi\r");
  m.type("\x03");
  m.expect(/\r\nA>$/);
  const out = record(m, 0x4100, 0x4004);
  const inp = record(m, 0x4200, 0x4006);
  assert.ok(out.startsWith("ABCD"), `functions 2, 6 and 9 reach CONOUT: ${JSON.stringify(out)}`);
  assert.match(out, /^ABCDx.*hi/s, "the echoes of functions 1 and 10 reach CONOUT");
  assert.equal(inp, "xyhi\r\x03", "functions 1, 6 and 10 read through CONIN");
  assert.ok(word(m, 0x4002) > 0, "the BDOS polls through CONST");
  assert.equal(m.read(0x4000), 1, "^C at a line read warm boots through the replaced WBOOT");
  assert.deepEqual(m.violations, []);
});

test("a BDOS disk error reaches the replaced WBOOT, and its message the replaced CONOUT", async () => {
  const m = await machine();
  m.mark = m.output.length;
  m.type("HOOK E\r");
  m.runUntil(() => m.waitingForInput(), 400_000_000, "the BDOS error's key");
  m.type("\r");
  m.expect(/\r\nA>$/);
  assert.match(record(m, 0x4100, 0x4004), /Bdos Err On C:/, "the error message passes through CONOUT");
  assert.equal(m.read(0x4000), 1, "the error's warm boot passes through WBOOT");
  assert.deepEqual(m.violations, []);
});
