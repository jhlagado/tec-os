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

// The figures of the build before USER left, with SAVE already gone: its ROM,
// its TPA rows and the command path's T-states, each measured as below.
const WAS = {
  used: 15856,
  tpa: { twoVolume: 47240, starter: 46536 },
  path: { bare: { warm: 84569, program: 112340 }, shell: { warm: 184379, program: 117644 } },
};

test("without USER the ROM is smaller, SHELL.SVC is 17 pages and no TPA row is smaller", () => {
  const census = JSON.parse(readFileSync(resolve(ROOT, "build/tecos/census.json"), "utf8"));
  assert.ok(census.rom.used < WAS.used, `${census.rom.used} bytes used, fewer than ${WAS.used}`);
  // KD-435's stage adds 67 ROM bytes and takes SHELL.SVC to 10 pages: the
  // rows held 15,713 used, 671 free, 17 pages and 42,752 under the shell.
  assert.deepEqual([census.rom.used, census.rom.free], [15780, 604], "the ROM's bytes used and free");
  for (const row of ["twoVolume", "starter"]) assert.ok(census.ram.cards[row].tpa >= WAS.tpa[row], `${row}: TPA ${census.ram.cards[row].tpa}`);
  const top = (m) => m.read(6) | (m.read(7) << 8);
  const bare = top(boot(card())), shelled = top(boot(card({ shell: true })));
  const pages = (bare >> 8) - (shelled >> 8);
  assert.equal(pages, 10, "the pages SHELL.SVC takes from the TPA");
  assert.ok(pages <= 10, "no more than 10");
  assert.equal(shelled - 0x100, 44544, "the TPA under the shell on the two-volume card");
});

/** T-states from a warm boot's first instruction to the prompt, and from a typed command to its program's first instruction. */
function path(m) {
  const prompt = () => m.ready() && /\r\n[A-P](:\S*)?>$/.test(m.text(m.mark));
  m.command("X"); // once, so that the directory and the file are in the cache
  m.runUntil(() => m.ready(), 50_000_000, "the prompt");
  m.mark = m.output.length;
  let from = m.cycles;
  m.cpu.cpu.pc = 0;
  m.runUntil(prompt, 400_000_000, "the prompt after a warm boot");
  const warm = m.cycles - from;
  m.mark = m.output.length;
  from = m.cycles;
  m.type("X\r");
  m.runUntil(() => m.pc === 0x100, 400_000_000, "the program's first instruction");
  return { warm, program: m.cycles - from };
}

test("the ordinary command path is no slower without USER: to the prompt after a warm boot, and from a typed command to the program", (t) => {
  const now = {}, kept = {};
  // KD-435's shell needs TNRING, which the kept ROM has not: under it the
  // shell is 4d7795e's, pinned.
  const BEFORE = Buffer.from(JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/shell-before-slim.json"), "utf8")).file, "base64");
  for (const shell of [false, true]) {
    const image = (old) => {
      const made = standardCard();
      volume(made, "A").write("X.COM", Uint8Array.from([0xc9]));
      if (!shell) return made;
      withShell(made);
      if (old) volume(made, "A").write("SHELL.SVC", BEFORE);
      return made;
    };
    now[shell ? "shell" : "bare"] = path(boot(image(false)));
    kept[shell ? "shell" : "bare"] = path(before(image(true)));
  }
  t.diagnostic(JSON.stringify({ now, was: WAS.path, kept }));
  for (const k of ["bare", "shell"]) {
    assert.ok(now[k].warm <= WAS.path[k].warm, `${k}: ${now[k].warm} T-states from a warm boot to the prompt, ${WAS.path[k].warm} before`);
    // KD-435: a typed line under the shell pays HSTORE's ring through RINGIO
    // and its NMI-safe SP, 1,231 T-states for X; the allowance is 1,500. The
    // row below keeps KD-430's own bound with the shell of its landing.
    const allowance = k === "shell" ? 1500 : 0;
    assert.ok(now[k].program <= WAS.path[k].program + allowance, `${k}: ${now[k].program} T-states from a typed command to the program, ${WAS.path[k].program} before`);
    assert.ok(kept[k].warm > WAS.path[k].warm, `${k}: the ROM kept from before, which sets the area at each entry, is over that figure to the prompt: ${kept[k].warm}`);
  }
});

// KD-430's claim kept apart from KD-435's ring: with b4310a1's shell, which
// keeps its history in its own RAM, this ROM takes a typed command to its
// program, and a warm boot to the prompt, no slower than the ROM before USER
// left. The ring's own price under this stage's shell is shell-slim's SL9.
test("KD-430 with the shell of its landing: the ROM's command path is no slower without USER", () => {
  const BEFORE = Buffer.from(JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/shell-before-slim.json"), "utf8")).file, "base64");
  const made = standardCard();
  const a = volume(made, "A");
  a.write("X.COM", Uint8Array.from([0xc9]));
  a.write("SHELL.SVC", BEFORE);
  a.write("STARTUP.CMD", Buffer.from("SHELL.SVC\r\n\x1a", "latin1"));
  const now = path(boot(made));
  assert.ok(now.warm <= WAS.path.shell.warm, `${now.warm} T-states from a warm boot to the prompt, ${WAS.path.shell.warm} before`);
  assert.ok(now.program <= WAS.path.shell.program, `${now.program} T-states from a typed command to the program, ${WAS.path.shell.program} before`);
});
