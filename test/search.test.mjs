// KD-169: a .COM not found on the current drive is looked for on A:, so TED
// and TAS run from B:. A drive named in the command looks there only, and a
// copy on the current drive comes first. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, standardCard, volume } from "./lib/fixtures.mjs";

const SAY = (text) => {
  // LD DE,MSG / LD C,9 / CALL 5 / RET / MSG: text$
  const msg = [...Buffer.from(`${text}\r\n$`, "latin1")];
  return Uint8Array.from([0x11, 0x09, 0x01, 0x0e, 0x09, 0xcd, 0x05, 0x00, 0xc9, ...msg]);
};

async function machine() {
  const image = standardCard();
  volume(image, "A").write("HI.COM", SAY("A'S HI"));
  volume(image, "A").write("BOTH.COM", SAY("A'S BOTH"));
  volume(image, "B").write("BOTH.COM", SAY("B'S BOTH"));
  volume(image, "B").write("BONLY.COM", SAY("B'S ONLY"));
  return boot(image);
}

test("on B:, a .COM only on A: runs, and B:'s own copy comes first", async () => {
  const m = await machine();
  m.command("B:");
  assert.match(m.command("HI"), /^A'S HI\r$/m);
  assert.match(m.command("BOTH"), /^B'S BOTH\r$/m);
  assert.match(m.command("NONE"), /^NONE\?\r$/m, "on neither: NAME?");
  assert.match(m.command("DIR"), /BOTH\.COM/, "still on B:");
  assert.equal(m.read(4) & 15, 1, "the current drive B:");
  assert.deepEqual(m.violations, []);
});

test("a drive named in the command looks there only, and A: looks nowhere else", async () => {
  const m = await machine();
  assert.match(m.command("B:HI"), /^B:HI\?\r$/m);
  assert.match(m.command("A:HI"), /^A'S HI\r$/m);
  assert.match(m.command("B:BOTH"), /^B'S BOTH\r$/m);
  assert.match(m.command("BONLY"), /^BONLY\?\r$/m, "on A:, B: isn't searched");
  assert.deepEqual(m.violations, []);
});
