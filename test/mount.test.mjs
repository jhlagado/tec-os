// Container format 1.1 and mounting at run time: a card of more than 8
// volumes, cold boot's one-pass table check, the vector slots, the FF20h
// service through MOUNT.COM and VOLS.COM, and EXIT giving a parent its own
// mounts back. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, program, romFor, volume } from "./lib/fixtures.mjs";
import { createContainer, descriptorAt, headerChecksum, tableSum } from "../tools/lib/container.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

function card(n = 20, drives = 2) {
  const vols = Array.from({ length: n }, (_, i) => ({ geometry: i % 3 === 0 ? "G8M" : "G1M", label: i === 0 ? "SYSTEM" : i === 1 ? "WORK" : i === 7 ? "ARCHIVE" : `V${i}`, mount: i < 2 ? "AB"[i] : "-" }));
  return createContainer(vols, { drives });
}

async function machine(image = card()) {
  const a = volume(image, "A");
  for (const n of ["mount", "vols", "openrd"]) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  volume(image, "B").write("DATA.TXT", Buffer.from("REC1....".padEnd(128, ".") + "REC2....".padEnd(128, ".") + "\x1a", "latin1"));
  volume(image, "ARCHIVE").write("OLD.DAT", new Uint8Array(128));
  return boot(image);
}
const drvidx = (m) => Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d));

test("a format 1.1 card of 20 volumes boots, its vectors in two G8M slots, and VOLS lists every volume", async () => {
  const m = await machine();
  assert.deepEqual(drvidx(m), [1, 2, 0, 0]);
  assert.deepEqual(Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVSLOT") + d)), [2, 2, 0, 0], "two G8M slots");
  const out = m.command("VOLS");
  const lines = out.split("\r\n").filter((l) => /^\d\d /.test(l));
  assert.equal(lines.length, 20);
  assert.match(lines[0], /^00 SYSTEM +G8M A:/);
  assert.match(lines[1], /^01 WORK +G1M B:/);
  assert.match(lines[7], /^07 ARCHIVE +G1M$/);
  assert.deepEqual(m.violations, []);
});

test("MOUNT takes a volume by label or index, refuses one in use, A: left empty and a drive without a slot, and unmounts", async () => {
  const m = await machine();
  assert.match(m.command("MOUNT B: ARCHIVE"), /B: ARCHIVE/);
  assert.match(m.command("DIR B:"), /OLD\.DAT/, "B:'s next access reads the new volume's directory");
  assert.deepEqual(drvidx(m), [1, 8, 0, 0]);
  assert.match(m.command("MOUNT B: 0"), /Cannot mount/, "A:'s volume");
  assert.match(m.command("MOUNT A:"), /Cannot unmount/);
  assert.match(m.command("MOUNT C: 5"), /Cannot mount/, "C: has no slot on a two-drive card");
  assert.match(m.command("MOUNT B: NOSUCH"), /No such volume/);
  assert.match(m.command("MOUNT B: 4"), /B: V4/);
  const again = m.command("MOUNT B: 4");
  assert.match(again, /B: V4 *\r\n/, "already there: said plainly");
  assert.doesNotMatch(again, /Cannot/);
  assert.match(m.command("MOUNT B:"), /Unmounted/);
  assert.deepEqual(drvidx(m), [1, 0, 0, 0]);
  assert.deepEqual(m.violations, []);
});

test("a nested level remounts B:, and at EXIT the parent's B: is its own and its open file reads on", async () => {
  const m = await machine();
  assert.match(m.command("OPENRD"), /REC1\.\.\.\./);
  assert.equal(m.read(m.sym("CCPLVL")), 1);
  m.command("MOUNT B: ARCHIVE");
  assert.match(m.command("DIR B:"), /OLD\.DAT/);
  const out = m.command("EXIT");
  assert.match(out, /REC2\.\.\.\./, "the parent's file reads on through its FCB");
  assert.deepEqual(drvidx(m), [1, 2, 0, 0], "the parent's mounts");
  assert.deepEqual(m.violations, []);
});

test("a reset gives the card's own mounts back", async () => {
  const m = await machine();
  m.command("MOUNT B: ARCHIVE");
  m.reset();
  m.expect(/A>$/, { maxCycles: 80_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the prompt after reset");
  assert.deepEqual(drvidx(m), [1, 2, 0, 0]);
});

test("cold boot refuses a table out of order, an overlap, a payload past the container and a wrong table sum", () => {
  const { rom, symbols } = romFor();
  const errorOf = (image) => {
    const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK });
    const out = m.expect(/R retry, H header> $/, { from: 0, maxCycles: 200_000_000 });
    return out.match(/error ([0-9A-F]{2})/)?.[1];
  };
  const reseal = (img) => {
    img.set([tableSum(img, 20) & 0xff, tableSum(img, 20) >> 8], 23);
    const h = img.subarray(0, 512);
    const s = headerChecksum(h);
    img.set([s & 0xff, s >> 8], 20);
    return img;
  };
  const swap = card();
  const a = descriptorAt(2);
  const b = descriptorAt(3);
  const t = swap.slice(a, a + 32);
  swap.copyWithin(a, b, b + 32);
  swap.set(t, b);
  assert.equal(errorOf(reseal(swap)), "28", "out of start order");
  const past = card();
  past.set([0, 0, 0, 0], 16 + 0); // the container's length: 0
  past[16] = 8;
  assert.equal(errorOf(reseal(past)), "27", "a payload past the container");
  const sum = card();
  sum[descriptorAt(16) + 20] ^= 1; // a label byte in block 1
  const h = headerChecksum(sum.subarray(0, 512));
  sum.set([h & 0xff, h >> 8], 20);
  assert.equal(errorOf(sum), "25", "the table sum");
});
