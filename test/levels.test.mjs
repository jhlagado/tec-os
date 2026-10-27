// The CCP's levels: a program shelling out through FF1Ah and getting its
// stack, code, drive and user back at EXIT; one command line through FF1Dh;
// nesting to six levels; a parent's warm-boot hook set aside; EXIT, CCP and
// UNLOAD as built-ins. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, prl, program, standardCard, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C

async function machine(opts = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  for (const n of ["shell", "setrc"]) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("SAY.COM", SAY);
  a.write("RES.PRL", await prl("res"));
  volume(image, "B").write("SAY.COM", SAY);
  return boot(image, opts);
}
const level = (m) => m.read(m.sym("CCPLVL"));
const cmd = (m, line, prompt = /\r\n[A-P]>$/) => m.command(line, { prompt });

test("a program shells out, its child level changes drive and user, and at EXIT it has its stack, code, drive and user back", async () => {
  const m = await machine();
  assert.equal(level(m), 0);
  cmd(m, "SHELL");
  assert.equal(level(m), 1, "a nested CCP");
  cmd(m, "SETRC 7");
  cmd(m, "B:", /\r\nB>$/);
  assert.match(cmd(m, "SAY", /\r\nB>$/), /C\r\n/, "a program run at the child level, over SHELL at 0100h");
  cmd(m, "USER 5", /\r\nB>$/);
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nB>$/);
  assert.equal(level(m), 1, "^C stays at the child level");
  const out = cmd(m, "EXIT", /\r\nA>$/);
  assert.match(out, /SHELL OK 0007/, "stack, code, drive, user and the return code");
  assert.equal(level(m), 0);
  assert.equal(m.read(m.sym("XMARK")), 0xbd, "the image's pages freed");
  assert.deepEqual(m.violations, []);
});

test("one command line through FF1Dh runs with no prompt and returns its code", async () => {
  const m = await machine();
  const out = cmd(m, "SHELL C");
  assert.match(out, /SHELL OK 0009/);
  assert.doesNotMatch(out.slice(out.indexOf("SHELL C") + 7, out.indexOf("SHELL OK")), /[A-P]>/, "no prompt for the child level");
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

test("cold boot gives ABI 2.4 and takes the records' page first, then the history's", async () => {
  const m = await machine({ ram96: true });
  assert.ok(m.read(0xff03) === 2 && m.read(0xff04) >= 4, "ABI 2.4 or later");
  assert.equal(m.read(m.sym("XMARK")), m.sym("HRING") >> 8, "the records' page and the ring's are the first allocations");
  assert.equal(m.sym("HRING"), m.sym("LVBASE") - 0x100, "the ring just below the records");
  cmd(m, "CCP");
  assert.equal(m.expand[1][(m.sym("LVBASE") - 0x8000) + 3], 0, "level 1's record holds drive and user");
  cmd(m, "EXIT");
  assert.deepEqual(m.violations, []);
});
