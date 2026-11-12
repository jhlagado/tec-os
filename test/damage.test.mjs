// A card with damage on it, and a card that goes away: what a directory with a
// block past the volume's end does, a directory read that fails, a read-only
// volume, and a card taken out and put back. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, romFor, standardCard, volume } from "./lib/fixtures.mjs";

const SECTOR = 512;

/** Where the volume on DRIVE starts in IMAGE, by finding NAME's directory entry. */
function entryOf(image, name) {
  const want = Buffer.from(name.padEnd(11), "latin1");
  for (let at = 0; at + 32 <= image.length; at += 32) {
    if (image[at] === 0 && Buffer.from(image.subarray(at + 1, at + 12)).equals(want)) return at;
  }
  throw new Error(`${name} isn't in the image`);
}

/** A standard card with a block past the end of A: in BAD.TXT's first entry. */
function damaged() {
  const image = standardCard();
  volume(image, "A").write("BAD.TXT", Buffer.alloc(128, 0x41));
  const at = entryOf(image, "BAD     TXT");
  image[at + 16] = 0xff;
  image[at + 17] = 0x7f;
  return image;
}

/** A machine started on IMAGE that doesn't wait for a prompt. */
function start(image) {
  return new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
}

test("a block past the end of A:'s directory leaves the prompt reachable", () => {
  const m = start(damaged());
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 300_000_000 });
  assert.doesNotMatch(m.text(0), /Bad Sector/);
});

test("the file with that block says Bad Sector when it's read, and ERA takes it", () => {
  const m = start(damaged());
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 300_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  assert.match(m.command("DIR BAD.TXT"), /BAD\.TXT/);
  const from = m.output.length;
  m.type("TYPE BAD.TXT\r");
  m.expect(/Bad Sector/, { from, maxCycles: 100_000_000 });
  m.type("\r");
  m.expect(/A(:\S*)?>$/, { from, maxCycles: 100_000_000 });
  m.runUntil(() => m.ready(), 100_000_000, "the prompt");
  m.command("ERA BAD.TXT");
  assert.doesNotMatch(m.command("DIR BAD.TXT"), /BAD\.TXT\r\n.*BAD\.TXT/s);
  assert.match(m.command("DIR BAD.TXT"), /No file|NOT FOUND|0 files/i);
});

test("a write to a read-only volume says R/O, and the card is unchanged", () => {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  const before = Buffer.from(image);
  const m = boot(image);
  const from = m.output.length;
  m.type("SAVE 1 C:NEW.COM\r");
  m.expect(/Bdos Err On C: R\/O/, { from, maxCycles: 100_000_000 });
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the error's key");
  assert.doesNotMatch(m.text(from), /Bad Sector/);
  m.type("\r");
  m.expect(/A(:\S*)?>$/, { from, maxCycles: 100_000_000 });
  assert.ok(before.equals(m.sd.image ?? image));
});

test("function 29 lists a read-only volume once its drive is selected", () => {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  // select C:, ask for the vector, keep it at 0080h, back to A:, warm boot
  const prog = [0x0e, 14, 0x1e, 2, 0xcd, 5, 0, 0x0e, 29, 0xcd, 5, 0, 0x22, 0x80, 0, 0x0e, 14, 0x1e, 0, 0xcd, 5, 0, 0xc3, 0, 0];
  const a = volume(image, "A");
  a.write("ASK.COM", Uint8Array.from(prog));
  const m = boot(image);
  m.command("ASK");
  assert.equal(m.read(0x80) | (m.read(0x81) << 8), 4, "drive C's bit");
});
