// The CCP's levels: a resident shelling out through FF1Ah and getting its
// stack, drive and user back at EXIT; one command line through FF1Dh;
// nesting to six levels, with each level's drive, user and mounts given
// back; a program's image refused; a parent's warm-boot hook set aside;
// EXIT, CCP and UNLOAD as built-ins. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, prl, program, standardCard, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C

/** SHELL.PRL with its MODE byte (code offset 21) set: FF1Dh, not FF1Ah. */
async function shellc() {
  const f = Uint8Array.from(await prl("shell"));
  f[256 + 21] = 1;
  return f;
}

async function machine(opts = {}) {
  const image = standardCard(Array.from({ length: 6 }, (_, i) => ({ geometry: "G1M", label: `V${i + 1}` })));
  const a = volume(image, "A");
  for (const n of ["setrc", "mount", "refuse"]) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("SHELL.PRL", await prl("shell"));
  a.write("SHELLC.PRL", await shellc());
  a.write("SAY.COM", SAY);
  a.write("RES.PRL", await prl("res"));
  volume(image, "B").write("SAY.COM", SAY);
  return boot(image, opts);
}
const level = (m) => m.read(m.sym("CCPLVL"));
const drvidx = (m) => Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d));
const cmd = (m, line, prompt = /\r\n[A-P]>$/) => m.command(line, { prompt });

test("a resident shells out, its child level changes drive and user, and at EXIT it has its stack, drive and user back", async () => {
  const m = await machine();
  assert.equal(level(m), 0);
  const stub = word(m, 6);
  cmd(m, "SHELL");
  assert.equal(level(m), 1, "a nested CCP");
  cmd(m, "SETRC 7");
  cmd(m, "B:", /\r\nB>$/);
  assert.match(cmd(m, "SAY", /\r\nB>$/), /C\r\n/, "a program run at the child level");
  cmd(m, "USER 5", /\r\nB>$/);
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nB>$/);
  assert.equal(level(m), 1, "^C stays at the child level");
  const out = cmd(m, "EXIT", /\r\nA>$/);
  assert.match(out, /SHELL OK 0007/, "stack, drive, user and the return code");
  assert.equal(level(m), 0);
  assert.equal(word(m, 6), stub - 0x100, "SHELL stays installed");
  assert.deepEqual(m.violations, []);
});

test("one command line through FF1Dh runs with no prompt and returns its code", async () => {
  const m = await machine();
  const out = cmd(m, "SHELLC");
  assert.match(out, /SHELL OK 0009/);
  assert.doesNotMatch(out.slice(out.indexOf("SHELLC") + 6, out.indexOf("SHELL OK")), /[A-P]>/, "no prompt for the child level");
  assert.equal(level(m), 0);
  assert.deepEqual(m.violations, []);
});

test("CCP nests six levels, a seventh is refused, and each EXIT gives the parent its drive and user back", async () => {
  const m = await machine();
  const drives = ["A", "B", "A", "B", "A", "B"];
  for (let n = 1; n <= 6; n += 1) {
    cmd(m, "CCP", new RegExp(`\\r\\n${drives[n - 2] ?? "A"}>$`));
    cmd(m, `${drives[n - 1]}:`, new RegExp(`\\r\\n${drives[n - 1]}>$`));
    cmd(m, `USER ${n}`, new RegExp(`\\r\\n${drives[n - 1]}>$`));
    assert.equal(level(m), n);
  }
  assert.match(cmd(m, "CCP", /\r\nB>$/), /CCP\?/, "a seventh level is refused");
  assert.equal(level(m), 6);
  for (let n = 6; n >= 1; n -= 1) {
    const parent = n === 1 ? "A" : drives[n - 2];
    cmd(m, "EXIT", new RegExp(`\\r\\n${parent}>$`));
    assert.equal(level(m), n - 1);
    assert.equal(m.read(4), n === 1 ? 0 : ((n - 1) << 4) | (parent === "B" ? 1 : 0), `level ${n - 1}'s drive and user`);
  }
  assert.deepEqual(m.violations, []);
});

test("a parent's warm-boot hook is set aside for the child level and back after EXIT", async () => {
  const m = await machine();
  const at = m.sym("RAMBIOS") + 4;
  const rom = word(m, at);
  [0x21, 0x00, 0x30, 0x34, 0xc3, rom & 0xff, rom >> 8].forEach((v, i) => m.write(0x3000 + i + 0x10, v)); // INC (3000h), then on
  m.write(0x3000, 0);
  m.write(at, 0x10);
  m.write(at + 1, 0x30);
  cmd(m, "CCP");
  assert.equal(word(m, at), rom, "the child level's warm boot is the ROM's");
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  assert.equal(m.read(0x3000), 0, "the child's ^C did not reach the hook");
  cmd(m, "EXIT");
  assert.equal(word(m, at), 0x3010, "the hook is back");
  assert.deepEqual(m.violations, []);
});

test("EXIT at level 0 and UNLOAD with no resident are refused; UNLOAD removes residents last in, first out", async () => {
  const m = await machine();
  assert.match(cmd(m, "EXIT"), /EXIT\?/);
  assert.match(cmd(m, "UNLOAD"), /UNLOAD\?/);
  const stub = word(m, 6);
  cmd(m, "RES");
  cmd(m, "RES");
  assert.equal(word(m, 6), stub - 0x200);
  cmd(m, "UNLOAD");
  assert.equal(word(m, 6), stub - 0x100);
  cmd(m, "UNLOAD");
  assert.equal(word(m, 6), stub);
  assert.match(cmd(m, "UNLOAD"), /UNLOAD\?/);
  assert.deepEqual(m.violations, []);
});

test("the level records and the history have fixed pages, and a record keeps no image", async () => {
  const m = await machine({ ram96: true });
  assert.ok(m.read(0xff03) === 2 && m.read(0xff04) >= 7, "ABI 2.7 or later");
  assert.equal(m.read(m.sym("XMARK")), 0x80, "no range for MOVE in EXPAND 1");
  assert.equal(m.sym("HRING"), m.sym("LVBASE") - 0x100, "the ring just below the records");
  assert.equal(m.sym("LVBASE"), 0xbe00);
  cmd(m, "B:", /\r\nB>$/);
  cmd(m, "CCP", /\r\nB>$/);
  const rec = m.sym("LVBASE") - 0x8000;
  assert.equal(m.expand[1][rec + 3], 1, "level 1's record holds drive and user");
  assert.equal(m.expand[1][rec + 38], 0, "and ends at its 38th byte");
  cmd(m, "EXIT", /\r\nB>$/);
  assert.deepEqual(m.violations, []);
});

test("CCP, and a resident through FF1Ah and FF1Dh with 0100h, nest to six levels and each EXIT gives back drive, user and mounts", async () => {
  const m = await machine();
  const kept = [];
  for (let n = 1; n <= 6; n += 1) {
    cmd(m, "A:");
    cmd(m, "USER 0");
    assert.match(cmd(m, "SHELLC"), /SHELL OK 0009/, `one command line from level ${n - 1}`);
    assert.equal(level(m), n - 1);
    cmd(m, `MOUNT B: V${n}`);
    const shell = n % 2 === 1; // SHELL sets drive A, user 0 itself
    if (!shell) [cmd(m, "B:"), cmd(m, `USER ${n}`)];
    kept.push({ du: m.read(4), mounts: drvidx(m) });
    cmd(m, shell ? "SHELL" : "CCP");
    assert.equal(level(m), n);
  }
  cmd(m, "A:");
  cmd(m, "USER 0");
  cmd(m, "MOUNT B: WORK");
  cmd(m, "USER 9");
  assert.match(cmd(m, "CCP"), /CCP\?/, "a seventh level is refused");
  cmd(m, "USER 0");
  assert.match(cmd(m, "SHELL"), /SHELL REFUSED/, "and so is a resident's");
  for (let n = 6; n >= 1; n -= 1) {
    const out = cmd(m, "EXIT");
    if (n % 2) assert.match(out, /SHELL OK [0-9A-F]{4}/, `level ${n}'s resident gets its stack, drive and user back`);
    assert.equal(level(m), n - 1);
    assert.deepEqual({ du: m.read(4), mounts: drvidx(m) }, kept[n - 1], `level ${n - 1}'s drive, user and mounts`);
  }
  assert.deepEqual(m.violations, []);
});

test("UNLOAD is refused in a nested level, so the resident a level returns into stays", async () => {
  const m = await machine();
  const stub = word(m, 6);
  cmd(m, "SHELL");
  assert.equal(level(m), 1);
  assert.match(cmd(m, "UNLOAD"), /UNLOAD\?/);
  assert.equal(word(m, 6), stub - 0x100, "SHELL still installed");
  assert.match(cmd(m, "EXIT"), /SHELL OK [0-9A-F]{4}/, "EXIT returns into it");
  cmd(m, "UNLOAD");
  assert.equal(word(m, 6), stub, "and at level 0 it unloads");
  assert.deepEqual(m.violations, []);
});

test("a program asking FF1Ah or FF1Dh to keep its image is refused, and nothing changes", async () => {
  const m = await machine({ ram96: true });
  const stub = word(m, 6);
  const ring = [m.sym("HRING") - 0x8000, m.sym("HRING") - 0x8000 + 0x100];
  const before = m.expand[1].slice();
  assert.match(cmd(m, "REFUSE"), /REFUSED/);
  assert.deepEqual([level(m), word(m, 6)], [0, stub]);
  const changed = Array.from(m.expand[1]).flatMap((v, i) => (v === before[i] || (i >= ring[0] && i < ring[1]) ? [] : [i + 0x8000]));
  assert.deepEqual(changed, [], "EXPAND 1 unchanged but for the history ring, which took the line typed");
  assert.deepEqual(m.violations, []);
});
