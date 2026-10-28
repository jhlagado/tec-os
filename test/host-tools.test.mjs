// Host container and CP/M filesystem tools. Pure host evidence: no Z80.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createContainer, parseContainer, headerChecksum, ContainerError } from "../tools/lib/container.mjs";
import { CpmVolume } from "../tools/lib/cpmfs.mjs";
import { format, geometryByName } from "../tools/lib/format.mjs";
import { buildRecipe } from "../tools/lib/recipe.mjs";
import { ROOT, standardCard, volume } from "./lib/fixtures.mjs";

const D = format.descriptor.fields;
const desc = (i) => format.header.descriptorsOffset + i * format.descriptor.bytes;

function reseal(image) {
  const sum = headerChecksum(image);
  image[format.header.fields.checksum.offset] = sum & 0xff;
  image[format.header.fields.checksum.offset + 1] = sum >> 8;
  return image;
}

test("every geometry satisfies the firmware limits", () => {
  for (const g of format.geometries) {
    const info = geometryByName(g.name);
    assert.equal(info.dpb.spt, 64);
    assert.ok(info.alvBytes <= 256);
  }
});

test("a new container validates and describes its volumes", () => {
  const image = standardCard();
  const info = parseContainer(image);
  assert.deepEqual(info.volumes.map((v) => [v.drive, v.label, v.g.name]), [
    ["A", "SYSTEM", "G1M"],
    ["B", "WORK", "G8M"],
  ]);
  assert.equal(image.length, info.containerBlocks * 512);
});

test("corrupt, truncated and inconsistent containers are rejected", () => {
  const cases = {
    magic: (b) => (b[0] ^= 1),
    version: (b) => reseal((b[8] = 2, b)),
    checksum: (b) => (b[100] ^= 1),
    count: (b) => reseal((b[14] = 0, b)),
    zeroId: (b) => reseal((b.fill(0, desc(0), desc(0) + 4), b)),
    flags: (b) => reseal((b[desc(0) + D.flags.offset] = 2, b)),
    geometry: (b) => reseal((b[desc(0) + D.geometry.offset] = 9, b)),
    misaligned: (b) => reseal((b[desc(1) + D.startBlock.offset] += 1, b)),
    overlap: (b) => {
      b.set(b.subarray(desc(0) + 4, desc(0) + 8), desc(1) + 4);
      b[desc(1) + D.geometry.offset] = 2;
      b[desc(1) + D.lengthBlocks.offset] = 0;
      b[desc(1) + D.lengthBlocks.offset + 1] = 8;
      return reseal(b);
    },
    duplicateDrive: (b) => reseal((b[desc(1) + D.mount.offset] = 0, b)),
    beyondEnd: (b) => {
      const o = format.header.fields.containerBlocks.offset;
      b[o] = 0xe8;
      b[o + 1] = 0x03;
      return reseal(b);
    },
    noDriveA: (b) => reseal((b[desc(0) + D.mount.offset] = 255, b)),
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    const image = standardCard();
    corrupt(image);
    assert.throws(() => parseContainer(image), ContainerError, name);
  }
  const image = standardCard();
  assert.throws(() => parseContainer(image.subarray(0, image.length - 512)), /truncated/);
});

test("files round-trip as binary and text across extent boundaries", () => {
  const image = standardCard();
  for (const drive of ["A", "B"]) {
    const fs = volume(image, drive);
    const big = new Uint8Array(70_000).map((_, i) => (i * 7 + (i >> 9)) & 0xff);
    fs.write("BIG.BIN", big);
    const back = fs.read("BIG.BIN");
    assert.equal(back.length, Math.ceil(big.length / 128) * 128);
    assert.deepEqual(back.subarray(0, big.length), big);
    assert.ok(back.subarray(big.length).every((b) => b === 0));
    fs.write("NOTE.TXT", Buffer.from("line one\nline two\n"), { text: true, user: 5 });
    assert.equal(Buffer.from(fs.read("NOTE.TXT", { user: 5, text: true })).toString(), "line one\nline two\n");
    const raw = fs.read("NOTE.TXT", { user: 5 });
    assert.equal(Buffer.from(raw.subarray(0, 21)).toString("latin1"), "line one\r\nline two\r\n\x1a");
    assert.throws(() => fs.read("NOTE.TXT"), /not found/);
    assert.deepEqual(fs.verify(), []);
  }
});

test("full disks and full directories are reported, not corrupted", () => {
  const image = createContainer([{ geometry: "G1M", label: "SMALL", mount: "A" }]);
  const fs = volume(image, "A");
  assert.throws(() => fs.write("HUGE.BIN", new Uint8Array(2 * 1024 * 1024)), /disk full/);
  for (let i = 0; i < 256; i += 1) fs.write(`F${i}.DAT`, new Uint8Array(1));
  assert.throws(() => fs.write("ONEMORE.DAT", new Uint8Array(1)), /directory full/);
  assert.deepEqual(fs.verify(), []);
});

test("tecvol creates, edits and reads a container atomically", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-"));
  const img = resolve(dir, "card.img");
  const tool = resolve(ROOT, "tools/tecvol.mjs");
  const run = (...args) => execFileSync(process.execPath, [tool, ...args], { encoding: "latin1" });
  run("create", img, "--volume", "G1M:SYSTEM:A", "--volume", "G1M:WORK:B", "--volume", "G1M:ARCHIVE:C:ro");
  const payload = resolve(dir, "data.bin");
  writeFileSync(payload, Buffer.from([...Array(1000).keys()].map((i) => i & 0xff)));
  run("put", img, "B", payload, "DATA.BIN", "--user", "2");
  assert.match(run("dir", img, "B"), /2 DATA\.BIN\s+1024/);
  const out = resolve(dir, "out.bin");
  run("get", img, "B", "DATA.BIN", out, "--user", "2");
  assert.deepEqual(readFileSync(out).subarray(0, 1000), readFileSync(payload));
  assert.throws(() => run("put", img, "C", payload, "X.BIN"), /read-only/);
  assert.match(run("verify", img), /C: ARCHIVE .* ro/);
});

test("a recipe builds a verified card and rejects a wrong digest", async () => {
  const files = { "HELLO.TXT": Buffer.from("hello\r\n\x1a") };
  const recipe = {
    schema: "tecos-file-recipe-v1",
    id: "test",
    volumes: [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G1M", label: "WORK", mount: "B" },
    ],
    components: [
      {
        id: "hello",
        files: [
          {
            name: "HELLO.TXT",
            url: "hello.txt",
            drive: "A",
            bytes: files["HELLO.TXT"].length,
            sha256: createHash("sha256").update(files["HELLO.TXT"]).digest("hex"),
          },
        ],
      },
    ],
  };
  const fetcher = async () => files["HELLO.TXT"];
  const image = await buildRecipe(recipe, fetcher);
  assert.equal(Buffer.from(volume(image, "A").read("HELLO.TXT").subarray(0, 7)).toString(), "hello\r\n");
  recipe.components[0].files[0].sha256 = "0".repeat(64);
  await assert.rejects(buildRecipe(recipe, fetcher), /SHA-256/);
});

test("CpmVolume refuses writes to a read-only volume", () => {
  const image = standardCard();
  const v = parseContainer(image).volumes[0];
  const fs = new CpmVolume(image.subarray(v.start * 512, (v.start + v.length) * 512), v.g, { readOnly: true });
  assert.throws(() => fs.write("X.COM", new Uint8Array(1)), /read-only/);
});

test("tecvol makes and reads format 1.1: more than 8 volumes, a drives field, unique labels", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-11-"));
  const img = resolve(dir, "big.img");
  const vols = Array.from({ length: 12 }, (_, i) => ["--volume", `G1M:V${i}:${i < 2 ? "AB"[i] : "-"}`]).flat();
  execFileSync("node", [resolve(ROOT, "tools/tecvol.mjs"), "create", img, ...vols, "--drives", "3"]);
  const info = execFileSync("node", [resolve(ROOT, "tools/tecvol.mjs"), "verify", img], { encoding: "utf8" });
  assert.match(info, /format 1\.1, .* 12 volume\(s\), 3 drive\(s\) wanted/);
  const parsed = parseContainer(readFileSync(img));
  assert.deepEqual([parsed.minor, parsed.drives, parsed.volumes.length, parsed.volumes[11].label], [1, 3, 12, "V11"]);
  assert.throws(() => createContainer([{ geometry: "G1M", label: "SAME", mount: "A" }, { geometry: "G1M", label: "SAME" }]), ContainerError, "duplicate labels");
  assert.throws(() => createContainer(Array.from({ length: 128 }, (_, i) => ({ geometry: "G1M", label: `V${i}`, mount: i ? "-" : "A" }))), ContainerError, "128 volumes");
  assert.equal(parseContainer(standardCard()).minor, 0, "a card of 8 or fewer with no drives field stays 1.0");
});

test("tecvol marks one volume written behind with :wb, and refuses two or one read-only", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-wb-"));
  const tecvol = (...args) => execFileSync("node", [resolve(ROOT, "tools/tecvol.mjs"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const img = resolve(dir, "wb.img");
  tecvol("create", img, "--volume", "G1M:SYSTEM:A", "--volume", "G8M:WORK:B:wb");
  const info = parseContainer(new Uint8Array(readFileSync(img)));
  assert.deepEqual(info.volumes.map((v) => v.writeBehind), [false, true]);
  assert.match(tecvol("info", img), /B: WORK .* rw wb /);
  for (const [name, specs] of [
    ["two.img", ["G1M:SYSTEM:A:wb", "G8M:WORK:B:wb"]],
    ["ro.img", ["G1M:SYSTEM:A", "G8M:WORK:B:ro:wb"]],
  ])
    assert.throws(() => tecvol("create", resolve(dir, name), ...specs.flatMap((v) => ["--volume", v])), name);
  assert.throws(() => createContainer([{ geometry: "G1M", label: "A", mount: "A", writeBehind: true }, { geometry: "G1M", label: "B", writeBehind: true }]), /one volume at most/);
  assert.throws(() => createContainer([{ geometry: "G1M", label: "A", mount: "A", writeBehind: true, readOnly: true }]), /read-only/);
  // A card edited to mark a second volume, or with byte 15's other bits set, is refused.
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A", writeBehind: true }, { geometry: "G1M", label: "WORK" }]);
  const resealed = (at, v) => {
    const b = image.slice();
    b[at] = v;
    const sum = headerChecksum(b.subarray(0, 512));
    [b[20], b[21]] = [sum & 0xff, sum >> 8];
    return b;
  };
  assert.throws(() => parseContainer(resealed(32 + 32 + 15, 1)), /second volume written behind/);
  assert.throws(() => parseContainer(resealed(32 + 15, 3)), /unknown cache flags/);
});
