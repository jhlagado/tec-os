// Container format 1.1 and mounting at run time: a card of more than 8
// volumes, cold boot's one-pass table check, the vector slots, the volume services
// entry through MOUNT.COM, whose bare MOUNT lists the volumes, and a reset giving the card's own
// mounts back. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
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
  a.write("MOUNT.COM", (await program("mount")).bytes);
  volume(image, "B").write("DATA.TXT", Buffer.from("REC1....".padEnd(128, ".") + "REC2....".padEnd(128, ".") + "\x1a", "latin1"));
  volume(image, "ARCHIVE").write("OLD.DAT", new Uint8Array(128));
  return boot(image);
}
const drvidx = (m) => Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d));

test("a format 1.1 card of 20 volumes boots, its vectors in two G8M slots, and MOUNT lists every volume", async () => {
  const m = await machine();
  assert.deepEqual(drvidx(m), [1, 2, 0, 0]);
  assert.deepEqual(Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVSLOT") + d)), [2, 2, 0, 0], "two G8M slots");
  const out = m.command("MOUNT");
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

test("a reset keeps the selected volume", async () => {
  const m = await machine();
  m.command("MOUNT B: ARCHIVE");
  const from = m.output.length;
  m.reset();
  m.expect(/A>$/, { from, maxCycles: 80_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the prompt after reset");
  assert.deepEqual(drvidx(m), [1, 8, 0, 0], "KD-139: the selection, where this read the card's own at KD-47");
  assert.match(m.text(from), /B: ARCHIVE/, "the boot list names the drive, not the card's letter");
});

test("cold boot refuses a table out of order, an overlap, a payload past the container and a wrong table sum", () => {
  const { rom, symbols } = romFor();
  const errorOf = (image) => {
    const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK });
    const out = m.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
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

test("on a card of more than 15 volumes, the boot lists and the LCD show each drive's own volume", async () => {
  const m = await machine();
  assert.match(m.bootText, /A: SYSTEM *\r\nB: WORK *\r\n/, "the console's list, in drive order");
  const lcd = serializeTec1gUpdateFromRuntimeState(m.tec1g.state).lcd;
  const row = (r) => String.fromCharCode(...lcd.slice(r * 20, r * 20 + 20)).trimEnd();
  assert.deepEqual([row(1), row(2)], ["A: SYSTEM", "B: WORK"]);
});


test("unmounting the current drive leaves the prompt on A:, and the next command runs", async () => {
  const m = await machine();
  assert.match(m.command("B:"), /\r\nB>$/);
  const out = m.command("A:MOUNT B:", { maxCycles: 60_000_000 });
  assert.match(out, /Unmounted/);
  assert.doesNotMatch(out, /Select/);
  assert.match(out, /\r\nA>$/, "the CCP takes A:");
  assert.equal(m.read(4), 0x00, "0004h: drive A");
  const dir = m.command("DIR", { maxCycles: 60_000_000 });
  assert.doesNotMatch(dir, /Bdos Err/);
  assert.match(dir, /\r\nA>$/);
  assert.match(m.command("MOUNT B: WORK", { maxCycles: 60_000_000 }), /B: WORK/);
  assert.match(m.command("B:"), /\r\nB>$/, "B: again once it has a volume");
});

test("a warm boot with 0004h on a drive past D: or one with no volume comes back on A:, in the same user", async () => {
  const m = await machine();
  for (const at of [0x35, 0x32]) {
    m.write(4, at);
    m.mark = m.output.length;
    m.cpu.cpu.pc = 0;
    m.expect(/\r\n3?A>$/, { maxCycles: 60_000_000 });
    m.runUntil(() => m.ready(), 20_000_000, "the prompt's input");
    assert.doesNotMatch(m.text(m.mark), /Bdos Err/);
    assert.equal(m.read(4), 0x30, `from ${at.toString(16)}h: user 3, drive A`);
  }
});

test("a mount onto the default drive gives functions 31 and 27 the new volume's DPB and allocation vector at once, with no function 14 (KE-AR9)", async () => {
  const { rig } = await import("./lib/warmboot.mjs");
  const image = createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
      { geometry: "G1M", label: "SMALL", mount: "-" },
    ],
    { drives: 3 },
  );
  volume(image, "SMALL").write("OLD.DAT", new Uint8Array(128).fill(0x44));
  const r = rig(image);
  const { m } = r;
  const hl = () => (m.cpu.cpu.h << 8) | m.cpu.cpu.l;
  r.call(5, { c: 14, de: 1 }); // B:, the G8M volume, the default
  r.call(5, { c: 31 });
  const before = hl();
  assert.equal(word(m, before + 5), 2047, "B:'s DPB is G8M's");
  assert.equal(r.call(m.sym("ABICALL"), { c: 9, bc: 0x0109, de: 2 }), 0, "TNMOUNT B: <- SMALL");
  const dph = m.sym("DPHTAB") + 16;
  r.call(5, { c: 31 });
  assert.equal(hl(), word(m, dph + 10), "function 31: the DPB in B:'s DPH now");
  assert.notEqual(hl(), before);
  assert.equal(word(m, hl() + 5), 511, "G1M's DSM");
  r.call(5, { c: 27 });
  assert.equal(hl(), word(m, dph + 14), "function 27: the allocation vector in B:'s DPH now");
  assert.equal(r.call(5, { c: 25 }), 1, "B: still the default");
  r.fcb(0, "OLD     DAT");
  assert.notEqual(r.bdos(15), 0xff, "SMALL's file opened on the default drive");
});
