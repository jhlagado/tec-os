// Bare-ROM directory selection and recovery, using real command input and
// card state rather than the text of the typed command as the oracle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContainer } from "../tools/lib/container.mjs";
import { boot, romFor, SHELL_SVC, startupFile, volume } from "./lib/fixtures.mjs";
import { at, code, pageOf, word } from "./lib/shell.mjs";

const card = () => createContainer([
  { geometry: "G1M", label: "SYSTEM", mount: "A" },
  { geometry: "G8M", label: "WORK", mount: "B" },
  { geometry: "G1M", label: "PROJECTS", mount: "C" },
  { geometry: "G1M", label: "GAMES" },
  { geometry: "G1M", label: "SPARE" },
], { drives: 4 });
const selections = (m) => Array.from({ length: 4 }, (_, i) => m.read(m.sym("DRVIDX") + i));
function command(m, line, body, result = 0) {
  const text = at(m, line);
  const output = text.slice(text.indexOf("\r") + 1);
  assert.match(output, body, `output after the echo of ${line}`);
  assert.equal(code(m), result, `${line}: return code`);
  assert.deepEqual(m.violations, []);
  return output;
}

test("RIG3 bare CD lists and queries the selected directories", () => {
  const m = boot(card());
  command(m, "CD ?", /SYSTEM +A:\r\nWORK +B:\r\nPROJECTS +C:\r\nGAMES *\r\nSPARE/);
  command(m, "CD", /\r\nA:SYSTEM\r\nA>$/);
  command(m, "CD C:", /\r\nC:PROJECTS\r\nA>$/);
  command(m, "CD D:", /\r\nD:\r\nA>$/);
  assert.deepEqual(selections(m), [1, 2, 3, 0]);
});

test("RIG3 bare CD changes the presented directory while retaining drive and user", () => {
  const m = boot(card());
  command(m, "B:", /B>$/);
  command(m, "USER 3", /3B>$/);
  command(m, "cd games", /\r\nB:GAMES\r\n3B>$/);
  assert.deepEqual(selections(m), [1, 4, 3, 0]);
  command(m, "CD D:SPARE", /\r\nD:SPARE\r\n3B>$/);
  assert.deepEqual(selections(m), [1, 4, 3, 5]);
  assert.equal(m.read(4), 0x31);
});

test("RIG3 bare CD of its existing selection does not reset the disk", () => {
  const m = boot(card()), original = m.step.bind(m);
  let resets = 0;
  m.step = () => {
    if (m.pc === m.sym("BENTRY") && m.cpu.cpu.c === 37) resets += 1;
    return original();
  };
  command(m, "CD SYSTEM", /\r\nA:SYSTEM\r\n/);
  assert.equal(resets, 0);
  command(m, "CD D:GAMES", /\r\nD:GAMES\r\n/);
  assert.equal(resets, 1);
  command(m, "CD D:GAMES", /\r\nD:GAMES\r\n/);
  assert.equal(resets, 1);
});

for (const [line, body] of [
  ["CD NOPE", /NOPE\?/],
  ["CD ABCDEFGHIJKL", /CD\?/],
  ["CD E:GAMES", /CD\?/],
  ["CD GAMES X", /CD\?/],
  ["CD ? X", /CD\?/],
  ["CD D:WORK", /WORK is on B:/],
]) test(`RIG3 bare ${line} refuses without changing selections`, () => {
  const m = boot(card());
  command(m, line, body, 0xff00);
  assert.deepEqual(selections(m), [1, 2, 3, 0]);
  assert.equal(m.read(4), 0);
});

test("RIG3 bare CD respects an old card's smaller drive slot", () => {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G1M", label: "PROJECTS", mount: "C" },
    { geometry: "G8M", label: "WORK" },
  ]);
  const m = boot(image), before = selections(m);
  command(m, "CD C:WORK", /\r\nCD FAILED\r\n/, 0xff00);
  assert.deepEqual(selections(m), before);
  command(m, "CD C:", /\r\nC:PROJECTS\r\n/);
});

test("RIG3 bare CD retains its selection when a data-prerequisite flush fails", () => {
  const image = card(), a = volume(image, "A");
  const main = romFor().symbols.get("MAINLOOP");
  a.write("WR.COM", Uint8Array.from([
    0x11, 0x5c, 0x00, 0x0e, 22, 0xcd, 0x05, 0x00, 0x06, 32,
    0xc5, 0x11, 0x5c, 0x00, 0x0e, 21, 0xcd, 0x05, 0x00, 0xc1, 0x10, 0xf4,
    0xc3, main & 0xff, main >> 8,
  ]));
  // Boot after installing WR so the guest's directory cache sees the file.
  const guest = boot(image), sd = guest.sd, commit = sd.commitWrite.bind(sd);
  let refuse = false;
  sd.commitWrite = () => {
    if (!refuse) return commit();
    sd.writeState = null;
    sd.pendingResponse = [0x0d, 0xff];
    sd.delayBytes = 1;
  };
  guest.mark = guest.output.length;
  guest.type("WR W.DAT\r");
  guest.runUntil(() => guest.pc === main, 400_000_000, "WR's direct return before input");
  refuse = true;
  guest.runUntil(() => guest.ready() && /\r\nA>$/.test(guest.text(guest.mark)), 400_000_000, "input with failed pending writes");
  const before = selections(guest);
  command(guest, "CD D:SPARE", /\r\nCD FAILED\r\n/, 0xff00);
  assert.deepEqual(selections(guest), before);
  refuse = false;
  command(guest, "CD D:SPARE", /\r\nD:SPARE\r\n/);
  assert.equal(selections(guest)[3], 5);
});

for (const user of [0, 3]) test(user ? "RIG3 reset recovery from user 3 has no hidden user-zero search" : "RIG3 reset recovery restores SYSTEM and loads SHELL", () => {
  const image = card(), a = volume(image, "A");
  a.write("SHELL.SVC", SHELL_SVC);
  a.write("STARTUP.CMD", startupFile("SHELL.SVC"));
  const m = boot(image);
  assert.ok(pageOf(m));
  command(m, "CD A:GAMES", /A:GAMES>$/);
  const mark = m.output.length;
  m.reset();
  m.runUntil(() => m.ready() && /\r\nA>$/.test(m.text(mark)), 900_000_000, "bare CCP after reset");
  assert.equal(pageOf(m), 0);
  assert.equal(selections(m)[0], 4);
  command(m, "CD ?", /SYSTEM/);
  if (user) command(m, `USER ${user}`, /3A>$/);
  command(m, "CD A:SYSTEM", /\r\nA:SYSTEM\r\n/);
  assert.equal(m.read(4) >> 4, user);
  assert.equal(selections(m)[0], 1);
  if (user) {
    command(m, "SHELL.SVC", /SHELL.SVC\?/, 0xff00);
    assert.equal(pageOf(m), 0, "no hidden user-zero search");
    command(m, "USER 0", /A>$/);
  }
  command(m, "SHELL.SVC", /A:SYSTEM>$/);
  assert.ok(pageOf(m));
  assert.equal(word(m, 6) - 256, 42496);
  const powered = boot(image);
  assert.equal(selections(powered)[0], 1, "power cycle uses the card defaults");
  assert.ok(pageOf(powered));
});
