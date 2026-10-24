// Native ABI 1 on the Debug80 TEC-1G model. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, program, standardCard, volume } from "./lib/fixtures.mjs";

const TNX_BASE = 0x0800 - 128;

test("a native program uses distinct banks, nested calls and copies, and exits cleanly", { timeout: 600_000 }, async () => {
  const image = standardCard();
  volume(image, "A").write("NATDEMO.TNX", (await program("natdemo", { base: TNX_BASE })).bytes);
  const m = boot(image);
  const out = m.command("NATDEMO", { maxCycles: 1_500_000_000 });
  const results = out.match(/N\d\d (ok|FAIL)/g) ?? [];
  assert.equal(results.length, 13, out);
  assert.deepEqual(results.filter((r) => r.endsWith("FAIL")), [], out);
  assert.match(out, /NATIVE DONE\r\n\r\nA>$/);

  // After exit: classic profile, classic bank, banks released.
  assert.equal(m.sysCtrl, 0x01);
  assert.equal(m.read(m.sym("OSMODE")), 0);
  assert.equal(m.read(m.sym("NOWNED")) | m.read(m.sym("NOWNED") + 1), 0);
  // Physical banks 0 and 1 (logical 1 and 2) hold what the program put there.
  const [b1, b2] = m.banks;
  assert.equal(b1[0x10], 0x00, "bank 1 overlapping copy result");
  assert.equal(b1[0x0f], 0x0f);
  assert.equal(b2[0x00], 0x00);
  assert.equal(b2[0xff], 0xff);
  assert.equal(b1[0x1000], 0x3a, "bank 1 holds CALLB1 (LD A,(nn)) at 9000h");
  assert.equal(b2[0x1000], 0x3a, "bank 2 holds RDBYTE at 9000h");
  const native = volume(image, "A").read("NATIVE.DAT");
  assert.ok(native.length === 128 && native.every((b) => b === 0x4e));
  assert.deepEqual(m.violations, []);
});

test("a damaged native stack guard is reported and the system recovers", { timeout: 300_000 }, async () => {
  const image = standardCard();
  volume(image, "A").write("NATGUARD.TNX", (await program("natguard", { base: TNX_BASE })).bytes);
  const m = boot(image);
  assert.match(m.command("NATGUARD", { maxCycles: 200_000_000 }), /Native stack guard damaged/);
  assert.equal(m.sysCtrl, 0x01);
  assert.match(m.command("DIR"), /NATGUARD TNX/);
});

test("a missing or invalid native program is an unknown command", { timeout: 300_000 }, async () => {
  const image = standardCard();
  const bad = Buffer.alloc(256);
  bad.write("TNX2", 0);
  volume(image, "A").write("BADHDR.TNX", bad);
  const m = boot(image);
  assert.match(m.command("BADHDR"), /BADHDR\?/);
  assert.match(m.command("NOSUCH"), /NOSUCH\?/);
});
