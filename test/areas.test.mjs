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
import { AREA_COM, ROOT, TEST_CLOCK, boot, romFor, service, standardCard, volume, withShell } from "./lib/fixtures.mjs";

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

/** A machine at its prompt on ROM, with SYMBOLS. */
function bootOn({ rom, symbols }, image) {
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the first prompt");
  return m;
}

/** A machine at its prompt on the ROM from before USER left. */
function before(image) {
  const f = JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/rom-qualified-shell2.json"), "utf8"));
  const symbols = new Map(Object.entries(f.symbols).map(([k, v]) => [k.toUpperCase(), v]));
  return bootOn({ rom: Buffer.from(f.rom, "base64"), symbols }, image);
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
    assert.match(m.command("AREA 3"), /\r\nA:SYSTEM>$/, `${where}: no number before the prompt, the same with the shell and without`);
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

// AREA3.SVC's INIT and REMOVE each set area 3 and return to the prompt with
// no warm boot. The prompt puts the BDOS back in area 0 itself, where it
// reads the drive (SAVEDRV). The fail input is this ROM with those two
// instructions, XOR A and LD (USERNO),A, made NOPs.
test("a service whose INIT or REMOVE sets area 3 leaves the prompt in area 0: the area-3 program is not found, bare and under the shell", async () => {
  const svc = await service("area3");
  const withSvc = (shell) => {
    const image = card({ shell });
    volume(image, "A").write("AREA3.SVC", svc);
    return image;
  };
  for (const shell of [false, true]) {
    const m = boot(withSvc(shell));
    const where = shell ? "the shell" : "the ROM";
    for (const [line, by] of [["AREA3.SVC", "INIT"], ["UNLOAD", "REMOVE"]]) {
      assert.doesNotMatch(m.command(line), /\?\r\n/, `${where}: ${line}`);
      assert.match(m.command("AREA"), /\r\nAREA 0\r\n/, `${where}: after ${by}, the next program starts in area 0`);
      assert.match(m.command("ONLY3"), /\r\nONLY3\?\r\n/, `${where}: and the area-3 program is not found`);
    }
    assert.deepEqual(m.violations, []);
  }
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom), at = symbols.get("SAVEDRV") - 0xc000;
  assert.deepEqual([...bytes.subarray(at, at + 2)], [0xaf, 0x32], "XOR A, LD (nn),A");
  bytes.fill(0, at, at + 4);
  // ONLY3's exit is a warm boot, which clears the area, so REMOVE's is seen alone.
  for (const shell of [false, true]) {
    const m = bootOn({ rom: bytes, symbols }, withSvc(shell));
    for (const [line, by] of [["AREA3.SVC", "INIT"], ["UNLOAD", "REMOVE"]]) {
      m.command(line);
      assert.match(m.command("ONLY3"), /\r\n3/, `without them, after ${by}, the area-3 program runs: the checks above fail there`);
    }
  }
});

// The SAVE-removed build's ROM and command path's T-states, and main's TPA
// rows, each measured as below.
const WAS = {
  used: 15856,
  path: { bare: { warm: 84569, program: 112340 }, shell: { warm: 184379, program: 117644 } },
};
// The owner approved 6 ms at 4 MHz for
// this shell launch path only.
const BARE_SEARCH_PRICE = { rom: 64, shell: 256, launch: 24_000 };
// The owner approved COMVEC's test on every COM launch, bare and under the
// shell (34 T-states measured), on 24 November 2026.
const COMVEC_PRICE = { launch: 34 };
const MAIN = { tpa: { twoVolume: 47237, starter: 46533 }, shelled: 42752 };
// The owner raised the ROM's cap for EXRMV and the CCP's primitives on 26
// November 2026: the pager, the history, CLS and the prompt's volume, with
// back-tab, 416 bytes of ROM and 144 of fixed RAM; the bare prompt prints its
// volume's label, 7 more characters, some 96,000 T-states on the serial line.
const CCP_PRICE = { rom: 416, tpa: 144, warm: 97_000, program: 1_000 }; // program: the typed line kept in the history, some 800 T-states

test("USER-removal savings remain after the approved bare-search ROM and RAM costs", () => {
  const census = JSON.parse(readFileSync(resolve(ROOT, "build/tecos/census.json"), "utf8"));
  assert.ok(census.rom.used - BARE_SEARCH_PRICE.rom - CCP_PRICE.rom < WAS.used, `${census.rom.used} bytes used including ${BARE_SEARCH_PRICE.rom} approved lookup bytes and the CCP's ${CCP_PRICE.rom}`);
  for (const row of ["twoVolume", "starter"]) assert.ok(census.ram.cards[row].tpa + CCP_PRICE.tpa >= MAIN.tpa[row], `${row}: TPA ${census.ram.cards[row].tpa}, the CCP's ${CCP_PRICE.tpa} approved`);
  const top = (m) => m.read(6) | (m.read(7) << 8);
  const bare = top(boot(card())), shelled = top(boot(card({ shell: true })));
  const pages = (bare >> 8) - (shelled >> 8);
  assert.ok(pages <= 18, `SHELL.SVC takes ${pages} pages from the TPA, no more than 18`);
  assert.ok(shelled - 0x100 + BARE_SEARCH_PRICE.shell >= MAIN.shelled, `the TPA under the shell on the two-volume card: ${shelled - 0x100}`);
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

test("the ordinary command path retains warm-prompt bounds and the approved shell launch allowance", (t) => {
  const now = {}, kept = {};
  for (const shell of [false, true]) {
    const image = () => {
      const made = standardCard();
      volume(made, "A").write("X.COM", Uint8Array.from([0xc9]));
      return shell ? withShell(made) : made;
    };
    now[shell ? "shell" : "bare"] = path(boot(image()));
    kept[shell ? "shell" : "bare"] = path(before(image()));
  }
  t.diagnostic(JSON.stringify({ now, was: WAS.path, kept }));
  for (const k of ["bare", "shell"]) {
    const label = k === "bare" ? CCP_PRICE.warm : 0; // the shell's prompt showed the volume already
    assert.ok(now[k].warm <= WAS.path[k].warm + label, `${k}: ${now[k].warm} T-states from a warm boot to the prompt, ${WAS.path[k].warm} before, plus ${label} approved`);
    const allowance = (k === "shell" ? BARE_SEARCH_PRICE.launch : 0) + CCP_PRICE.program + COMVEC_PRICE.launch; // the ROM keeps the shell's lines too
    assert.ok(now[k].program <= WAS.path[k].program + allowance, `${k}: ${now[k].program} T-states from a typed command to the program, ${WAS.path[k].program} before plus ${allowance} approved`);
  }
  // The ROM kept from before, which sets the area at each entry, is over the bare figure to the prompt.
  // It is before ABI 5.4, so it refuses the shell and comes up bare with the file on the card.
  assert.ok(kept.bare.warm > WAS.path.bare.warm, `the ROM kept from before is over that figure to the prompt: ${kept.bare.warm}`);
  assert.ok(Math.abs(kept.shell.warm - kept.bare.warm) < 100, `the ROM kept from before refuses the shell: ${kept.shell.warm}`);
});
