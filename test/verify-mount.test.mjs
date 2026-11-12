// tecvol verify against the ROM's MOUNT: a card tecvol passes must mount,
// and a card the ROM refuses tecvol must refuse too. Each check of the
// container is broken in turn, on a 1.0 card and a 1.1 card, and a volume is
// put on each drive with every value of the drives field. The ROM's verdict
// is a cold boot: the prompt, or the error code at the diagnostic prompt.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, romFor } from "./lib/fixtures.mjs";
import { createContainer, descriptorAt, headerChecksum, tableSum } from "../tools/lib/container.mjs";
import { format } from "../tools/lib/format.mjs";

const H = format.header.fields;
const D = format.descriptor.fields;
const put16 = (b, o, v) => b.set([v & 0xff, (v >> 8) & 0xff], o);
const put32 = (b, o, v) => b.set([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff], o);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** The header's table sum (1.1) and checksum made good again after an edit. */
function reseal(img, { sum = true, check = true } = {}) {
  const count = img[H.volumeCount.offset] | (img[H.volumeCount.offset + 1] << 8);
  if (sum && img[H.minor.offset] && count >= 1 && count <= format.header.maxVolumes) put16(img, H.tableSum.offset, tableSum(img, count));
  if (check) put16(img, H.checksum.offset, headerChecksum(img.subarray(0, 512)));
  return img;
}

/** N G1M volumes, the first on A and the rest unmounted, as format 1.MINOR with DRIVES in the drives byte. */
function card(minor, drives, n = 3) {
  const img = createContainer(Array.from({ length: n }, (_, i) => ({ geometry: "G1M", label: `V${i}`, mount: i ? "-" : "A" })));
  img[H.minor.offset] = minor;
  img[H.drives.offset] = drives;
  return reseal(img);
}
const desc = (i, f) => descriptorAt(i) + D[f].offset;

const { rom, symbols } = romFor();
function romVerdict(image) {
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK });
  const out = m.expect(/\r\nA>$|R retry> $/, { from: 0, maxCycles: 200_000_000 });
  return out.endsWith("A>") ? "mounts" : `error ${out.match(/error ([0-9A-F]{2})/)?.[1]}`;
}

const dir = mkdtempSync(resolve(tmpdir(), "verify-mount-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
function tecvolVerdict(image) {
  const path = resolve(dir, "card.img");
  writeFileSync(path, image);
  const r = spawnSync(process.execPath, [resolve(ROOT, "tools/tecvol.mjs"), "verify", path], { encoding: "utf8" });
  return r.status === 0 ? "passes" : `refuses: ${r.stderr.trim()}`;
}

/** Each check: how to break it on a card, and the ROM's error code, or null where only tecvol refuses. */
const CHECKS = [
  ["magic", (img) => (img[0] ^= 1), "21"],
  ["major version", (img) => (img[H.major.offset] = 2), "22"],
  ["header size", (img) => put16(img, H.headerBytes.offset, 256), "23"],
  ["descriptor size", (img) => put16(img, H.descriptorBytes.offset, 16), "23"],
  ["volume count 0", (img) => put16(img, H.volumeCount.offset, 0), "24"],
  ["volume count 128", (img) => put16(img, H.volumeCount.offset, 128), "24"],
  ["header checksum", (img) => (img[H.checksum.offset] ^= 1), "25", { check: false }],
  ["zero id", (img) => put32(img, desc(1, "volumeId"), 0), "26"],
  ["unknown flag", (img) => (img[desc(1, "flags")] = 2), "26"],
  ["unknown geometry", (img) => (img[desc(1, "geometry")] = 99), "26"],
  ["length not the geometry's", (img) => put32(img, desc(1, "lengthBlocks"), u32(img, desc(1, "lengthBlocks")) + 8), "26"],
  ["start not aligned", (img) => put32(img, desc(1, "startBlock"), u32(img, desc(1, "startBlock")) + 1), "26"],
  ["start 0", (img) => put32(img, desc(1, "startBlock"), 0), "26"],
  ["payload past the container", (img) => put32(img, H.containerBlocks.offset, u32(img, desc(2, "startBlock"))), "27"],
  [
    "descriptors out of start order",
    (img) => {
      const a = descriptorAt(1);
      const t = img.slice(a, a + 32);
      img.copyWithin(a, descriptorAt(2), descriptorAt(2) + 32);
      img.set(t, descriptorAt(2));
    },
    "28",
  ],
  ["overlapping payloads", (img) => put32(img, desc(2, "startBlock"), u32(img, desc(1, "startBlock")) + 8), "28"],
  ["drive past D", (img) => (img[desc(1, "mount")] = 4), "29"],
  ["drive assigned twice", (img) => (img[desc(1, "mount")] = 0), "29"],
  ["no volume on A", (img) => (img[desc(0, "mount")] = 0xff), "2A"],
  ["duplicate id", (img) => put32(img, desc(2, "volumeId"), u32(img, desc(1, "volumeId"))), null],
];

function judge(image, rom) {
  const got = { rom: romVerdict(image), tecvol: tecvolVerdict(image) };
  if (got.tecvol === "passes") assert.equal(got.rom, "mounts", "tecvol passes a card the ROM refuses");
  if (got.rom !== "mounts") assert.notEqual(got.tecvol, "passes");
  assert.equal(got.rom, rom ? `error ${rom}` : "mounts", `the ROM's verdict; tecvol ${got.tecvol}`);
  return got;
}

for (const minor of [0, 1]) {
  test(`tecvol verify refuses every 1.${minor} card the ROM's MOUNT refuses, check by check`, () => {
    judge(card(minor, 0), null);
    for (const [name, breakIt, code, seal] of CHECKS) {
      const img = card(minor, 0);
      breakIt(img);
      reseal(img, seal);
      const got = judge(img, code);
      if (!code) assert.notEqual(got.tecvol, "passes", `${name}: tecvol's own check`);
      else assert.notEqual(got.tecvol, "passes", name);
    }
    // Labels: unique in 1.1, where tecvol checks them; the ROM never does.
    const labels = card(minor, 0);
    labels.copyWithin(desc(2, "label"), desc(1, "label"), desc(1, "label") + 11);
    const got = judge(reseal(labels), null);
    assert.equal(got.tecvol === "passes", minor === 0, "duplicate labels");
    // More than 8 volumes: a 1.0 card's count is refused, by the ROM with 24h and by tecvol (KE-184).
    const nine = card(minor, 0, 9);
    assert.equal(judge(nine, minor ? null : "24").tecvol === "passes", minor === 1, "nine volumes");
    assert.equal(judge(card(minor, 0, 8), null).tecvol, "passes", "eight volumes");
  });
}

test("tecvol verify refuses a wrong 1.1 table sum, as the ROM does; a 1.0 card has none, and of 17 volumes both refuse its count", () => {
  for (const minor of [0, 1]) {
    const img = card(minor, 0, 17);
    img[desc(16, "label")] ^= 1; // a label byte in block 1
    reseal(img, { sum: false });
    const got = judge(img, minor ? "25" : "24"); // 17 volumes on a 1.0 card: its count (KE-184)
    assert.notEqual(got.tecvol, "passes", minor ? "the table sum" : "17 volumes on a 1.0 card");
  }
});

test("tecvol verify and the ROM agree on a volume on each drive with every drives value, at both minor versions", () => {
  for (const minor of [0, 1]) {
    for (let drives = 0; drives <= 5; drives += 1) {
      for (let drive = 1; drive < 4; drive += 1) {
        const img = card(minor, drives);
        img[desc(1, "mount")] = drive;
        reseal(img);
        // A 1.0 card has no drives field; on a 1.1 card past 4 it is wrong, and N drives leave none past the Nth.
        const code = minor === 0 ? null : drives > 4 ? "23" : drives && drive >= drives ? "29" : null;
        judge(img, code);
      }
    }
  }
});

test("tecvol create refuses a volume on a drive past the drives it gives", () => {
  const vols = (mount) => [{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G1M", label: "WORK", mount }];
  assert.throws(() => createContainer(vols("C"), { drives: 2 }), /drive C is past the card's 2 drive/);
  assert.equal(romVerdict(createContainer(vols("B"), { drives: 2 })), "mounts");
});
