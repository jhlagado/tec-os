// The command processor works in user area 0 only. USER is no built-in, the
// prompt carries no user number, and every return to the prompt is in area 0,
// so a program that changes the area and exits cannot leave the prompt in
// one. BDOS function 32 and the user byte of a directory entry are as they
// were: inside a program the areas are still kept apart. A file a program
// leaves in another area is out of the prompt's reach.
//
// Each case is also run on a ROM kept from before USER left
// (test/fixtures/rom-qualified-shell2.json), which has USER and keeps the area
// a program leaves: there the case's check fails, or, for the BDOS, gives the
// same answer. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import { AREA_COM, ROOT, TEST_CLOCK, boot, standardCard, volume, withShell } from "./lib/fixtures.mjs";

const SAY3 = Uint8Array.from([0x1e, 0x33, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints 3
const HELLO = Buffer.from("hello\r\n\x1a", "latin1");
const code = (m) => m.read(m.sym("PRGCODE")) | (m.read(m.sym("PRGCODE") + 1) << 8);
const names = (m, user) => volume(m.sdImage, "A").list({ user }).map((f) => f.name).sort();

/** A card with AREA.COM and HELLO.TXT in area 0 of A:, and ONLY3.COM in area 3; with SHELL, the shell too. */
function card({ shell = false } = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("AREA.COM", AREA_COM);
  a.write("HELLO.TXT", HELLO);
  a.write("ONLY3.COM", SAY3, { user: 3 });
  return shell ? withShell(image) : image;
}

/** A machine at its prompt on the ROM from before USER left. */
function before(image) {
  const f = JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/rom-qualified-shell2.json"), "utf8"));
  const symbols = new Map(Object.entries(f.symbols).map(([k, v]) => [k.toUpperCase(), v]));
  const m = new Machine({ rom: Buffer.from(f.rom, "base64"), symbols, sdImage: image, clock: TEST_CLOCK });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the first prompt");
  return m;
}

test("USER is no built-in: USER 3 gets the answer any unknown command gets, at the ROM's prompt and at the shell's", () => {
  for (const shell of [false, true]) {
    const m = boot(card({ shell }));
    const where = shell ? "the shell" : "the ROM";
    assert.equal(m.command("USER 3"), m.command("NOSUCH 3").replaceAll("NOSUCH", "USER"), where);
    assert.match(m.command("USER 3"), /^USER 3\r\r\nUSER\?\r\n/, where);
    assert.equal(code(m), 0xff00, "a failed command");
    assert.equal(m.read(4), 0, "drive A:, user nibble zero");
    assert.deepEqual(m.violations, []);
  }
  assert.match(before(card()).command("USER 3"), /\r\n3A>$/, "a ROM with USER takes it: the check above fails there");
});

test("a program that sets area 3 and exits leaves the prompt in area 0, with no number", () => {
  for (const shell of [false, true]) {
    const m = boot(card({ shell }));
    const where = shell ? "the shell" : "the ROM";
    assert.match(m.command("AREA 3"), shell ? /\r\nA:SYSTEM>$/ : /\r\nA>$/, `${where}: no number before the prompt`);
    assert.equal(m.read(4), 0, "0004h: drive A:, user nibble zero");
    assert.match(m.command("AREA"), /\r\nAREA 0\r\n/, `${where}: function 32's query returns 0`);
    assert.match(m.command("TYPE HELLO.TXT"), /\r\nhello\r\n/, `${where}: the next command runs in area 0`);
    assert.match(m.command("ONLY3"), /\r\nONLY3\?\r\n/, `${where}: and not in area 3`);
    assert.deepEqual(m.violations, []);
  }
  const was = before(card());
  assert.match(was.command("AREA 3"), /\r\n3A>$/, "a ROM that keeps the area across the return: its prompt shows it");
  assert.match(was.command("AREA"), /\r\nAREA 3\r\n/, "and function 32 returns it, so the checks above fail there");
});

test("inside a program function 32 sets and returns the area, and a file made in area 3 is found there and not in area 0, as before", () => {
  for (const [which, m] of [["this ROM", boot(card())], ["the ROM from before", before(card())]]) {
    assert.match(m.command("AREA 3 APART.DAT"), /\r\nKEPT APART\r\n/, which);
    assert.deepEqual(names(m, 3), ["APART.DAT", "ONLY3.COM"], `${which}: the card has it in area 3`);
    assert.deepEqual(names(m, 0), ["AREA.COM", "HELLO.TXT"], `${which}: and not in area 0`);
    assert.deepEqual(m.violations, []);
  }
  assert.match(boot(card()).command("AREA 0 SAME.DAT"), /\r\nMIXED\r\n/, "the program's own check fails when the two areas are one");
});

test("a file a program leaves in area 3 is not listed, typed, erased or run from the prompt", () => {
  const m = boot(card());
  m.command("AREA 3 LEFT.DAT");
  assert.doesNotMatch(m.command("DIR"), /LEFT/, "DIR lists area 0");
  for (const line of ["DIR LEFT.DAT", "TYPE LEFT.DAT", "ERA LEFT.DAT"]) assert.match(m.command(line), /\r\nNO FILE\r\n/, line);
  assert.match(m.command("ONLY3"), /\r\nONLY3\?\r\n/, "a program in area 3 is not found");
  assert.deepEqual(names(m, 3), ["LEFT.DAT", "ONLY3.COM"], "both are still on the card, in area 3");
  assert.deepEqual(m.violations, []);
  const compat = readFileSync(resolve(ROOT, "docs/compatibility.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(compat.includes("cannot be listed, erased or run from the prompt"), "docs/compatibility.md says so");
  const was = before(card());
  was.command("AREA 3 LEFT.DAT");
  assert.match(was.command("DIR"), /LEFT\.DAT/, "a ROM that keeps the area lists it: the check above fails there");
});
