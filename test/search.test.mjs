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
  m.command("B:");
  assert.match(m.command("B:HI"), /^B:HI\?\r$/m, "on B:, B:HI looks on B: only");
  assert.equal(m.read(4) & 15, 1);
  assert.deepEqual(m.violations, []);
});

// KD-178: the CCP leaves the drive it loaded a program from at 0050h, as CP/M 3
// does: 0 for the current drive, 1 for A: and so on, and 1 after the search.
// SHOW prints that byte as a digit: LD A,(0050h) / ADD A,'0' / LD E,A / LD C,2 /
// CALL 5 / RET.
const SHOW = Uint8Array.from([0x3a, 0x50, 0x00, 0xc6, 0x30, 0x5f, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]);

test("0050h is the drive a program came from: a typed B:NAME, a plain name, the search and a chained B:NAME (KD-178)", () => {
  const image = standardCard();
  volume(image, "A").write("SHOW.COM", SHOW);
  volume(image, "B").write("SHOWB.COM", SHOW);
  const m = boot(image);
  const shown = (line) => /\r\n(\d)/.exec(m.command(line))?.[1];
  assert.equal(shown("SHOW"), "0", "a plain name: the current drive");
  assert.equal(shown("B:SHOWB"), "2", "B:NAME typed");
  m.command("B:");
  assert.equal(shown("SHOW"), "1", "found on A: by the search");
  assert.equal(shown("SHOWB"), "0", "B:'s own, the current drive");
  m.command("A:");
  const from = m.output.length;
  m.type("USER 0!B:SHOWB!SHOW\r");
  m.runUntil(() => m.ready() && m.read(m.sym("CHPOS")) === 0 && /A>$/.test(m.text(from)), 400_000_000, "the chained line's end");
  assert.match(m.text(from), /B:SHOWB\r\n2[\s\S]*SHOW\r\n0/, "a chained B:NAME piece, and the piece after it");
  assert.deepEqual(m.violations, []);
});

test("under user 3, the search looks in A:'s user 3, then A:'s user 0, and puts the user back (A7)", () => {
  const image = standardCard();
  volume(image, "A").write("ZERO.COM", SAY("A'S USER 0"));
  volume(image, "A").write("BOTH.COM", SAY("A'S USER 0 BOTH"));
  volume(image, "A").write("BOTH.COM", SAY("A'S USER 3 BOTH"), { user: 3 });
  volume(image, "A").write("ONLY3.COM", SAY("A'S USER 3"), { user: 3 });
  const m = boot(image);
  m.command("USER 3");
  m.command("B:");
  assert.match(m.command("ONLY3"), /^A'S USER 3\r$/m, "A:'s user 3 first");
  assert.match(m.command("BOTH"), /^A'S USER 3 BOTH\r$/m, "the current user before user 0");
  assert.match(m.command("ZERO"), /^A'S USER 0\r$/m, "then A:'s user 0");
  assert.match(m.command("NONE"), /^NONE\?\r$/m);
  assert.equal(m.read(4), 0x31, "still user 3 on B:");
  m.command("USER 0");
  assert.match(m.command("ONLY3"), /^ONLY3\?\r$/m, "user 0 doesn't look in user 3");
  assert.deepEqual(m.violations, []);
});

test("the current or named drive looks in user 0 after the current user too: A: under user 3, B:NAME, and B:'s user 0 before A: (A7)", () => {
  const image = standardCard();
  volume(image, "A").write("ZERO.COM", SAY("A'S USER 0"));
  volume(image, "A").write("BOTH.COM", SAY("A'S USER 0 BOTH"));
  volume(image, "A").write("BOTH.COM", SAY("A'S USER 3 BOTH"), { user: 3 });
  volume(image, "A").write("NEAR.COM", SAY("A'S USER 3 NEAR"), { user: 3 });
  volume(image, "B").write("BZERO.COM", SAY("B'S USER 0"));
  volume(image, "B").write("BTWO.COM", SAY("B'S USER 0 BTWO"));
  volume(image, "B").write("BTWO.COM", SAY("B'S USER 3 BTWO"), { user: 3 });
  volume(image, "B").write("NEAR.COM", SAY("B'S USER 0 NEAR"));
  const m = boot(image);
  m.command("USER 3");
  assert.match(m.command("ZERO"), /^A'S USER 0\r$/m, "on A:, A:'s user 0");
  assert.match(m.command("BOTH"), /^A'S USER 3 BOTH\r$/m, "the current user first");
  assert.match(m.command("B:BZERO"), /^B'S USER 0\r$/m, "B:NAME in B:'s user 0");
  assert.match(m.command("B:BTWO"), /^B'S USER 3 BTWO\r$/m, "B:NAME, the current user first");
  assert.match(m.command("B:ZERO"), /^B:ZERO\?\r$/m, "B:NAME looks on B: only");
  m.command("B:");
  assert.match(m.command("BZERO"), /^B'S USER 0\r$/m, "on B:, B:'s user 0");
  assert.match(m.command("NEAR"), /^B'S USER 0 NEAR\r$/m, "the current drive's user 0 before A:'s");
  assert.equal(m.read(4), 0x31, "still user 3 on B:");
  assert.deepEqual(m.violations, []);
});
