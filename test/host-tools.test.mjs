// Host container and CP/M filesystem tools. Pure host evidence: no Z80.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
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
  const run = (...args) => execFileSync(process.execPath, [tool, ...args], { timeout: 5000, encoding: "latin1" });
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

test("tecvol --user takes an integer 0 to 15 only, and a refused one leaves the image byte for byte (KE-152)", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-user-"));
  const img = resolve(dir, "card.img");
  const tool = resolve(ROOT, "tools/tecvol.mjs");
  const run = (...args) => execFileSync(process.execPath, [tool, ...args], { timeout: 5000, encoding: "latin1", stdio: ["ignore", "pipe", "pipe"] });
  run("create", img, "--volume", "G1M:SYSTEM:A", "--volume", "G1M:WORK:B");
  const payload = resolve(dir, "data.bin");
  writeFileSync(payload, Buffer.from("data"));
  run("put", img, "B", payload, "KEEP.BIN");
  const before = readFileSync(img);
  for (const user of ["oops", "1.5", "16", "-1", "", "0x2"]) {
    assert.throws(() => run("put", img, "B", payload, "X.BIN", "--user", user), /user/, `--user ${JSON.stringify(user)} refused`);
    assert.deepEqual(readFileSync(img), before, `--user ${JSON.stringify(user)}: the image unchanged`);
  }
  for (const [option, bad] of [["--align", ["oops", "1.5", "0", "-8", ""]], ["--drives", ["oops", "2.5", "0", "5", "-1"]]]) {
    for (const v of bad) {
      const fresh = resolve(dir, `new-${option.slice(2)}.img`);
      assert.throws(() => run("create", fresh, "--volume", "G1M:SYSTEM:A", option, v), new RegExp(option), `${option} ${JSON.stringify(v)} refused (D4)`);
      assert.throws(() => readFileSync(fresh), /ENOENT/, `${option} ${JSON.stringify(v)}: no image made`);
    }
  }
  run("put", img, "B", payload, "Y.BIN", "--user", "15");
  assert.match(run("dir", img, "B", "--user", "15"), /15 Y\.BIN/);
});

test("a read-only file is neither written over nor erased without force, by CpmVolume or tecvol, and nothing changes (KE-AR10)", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("RO.TXT", Buffer.from("hello"), { readOnly: true });
  const before = Uint8Array.from(image);
  assert.throws(() => a.write("RO.TXT", Buffer.from("bye")), /read-only/, "write over it refused");
  assert.throws(() => a.erase("RO.TXT"), /read-only/, "erase refused");
  assert.deepEqual(image, before, "the card unchanged");
  assert.equal(Buffer.from(a.read("RO.TXT")).subarray(0, 5).toString(), "hello");
  assert.equal(a.write("RO.TXT", Buffer.from("bye"), { force: true }).records, 1, "forced: written");
  assert.equal(a.find("RO.TXT").readOnly, false, "as a fresh file, without the attribute");
  a.write("RO.TXT", Buffer.from("again"), { readOnly: true });
  assert.equal(a.erase("RO.TXT", 0, { force: true }), 1, "forced: erased");
  assert.equal(a.erase("NONE.TXT"), 0, "a missing file still 0");

  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-ro-"));
  const img = resolve(dir, "card.img");
  const run = (...args) => execFileSync(process.execPath, [resolve(ROOT, "tools/tecvol.mjs"), ...args], { timeout: 5000, encoding: "latin1", stdio: ["ignore", "pipe", "pipe"] });
  run("create", img, "--volume", "G1M:SYSTEM:A");
  const payload = resolve(dir, "data.bin");
  writeFileSync(payload, Buffer.from("data"));
  run("put", img, "A", payload, "KEEP.BIN", "--ro");
  const card = readFileSync(img);
  assert.throws(() => run("put", img, "A", payload, "KEEP.BIN"), /read-only/, "tecvol put refused");
  assert.throws(() => run("era", img, "A", "KEEP.BIN"), /read-only/, "tecvol era refused");
  assert.deepEqual(readFileSync(img), card, "the image unchanged");
  run("put", img, "A", payload, "KEEP.BIN", "--ro", "--force");
  run("era", img, "A", "KEEP.BIN", "--force");
  assert.doesNotMatch(run("dir", img, "A"), /KEEP/, "forced: written over, then erased");
});

test("a file whose entry names a block past DSM is not read, by CpmVolume or tecvol get: the error names the entry (KE-AR11)", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-dsm-"));
  const img = resolve(dir, "card.img");
  const run = (...args) => execFileSync(process.execPath, [resolve(ROOT, "tools/tecvol.mjs"), ...args], { timeout: 5000, encoding: "latin1", stdio: ["ignore", "pipe", "pipe"] });
  run("create", img, "--volume", "G1M:SYSTEM:A");
  const payload = resolve(dir, "data.bin");
  writeFileSync(payload, new Uint8Array(128).fill(0x41));
  run("put", img, "A", payload, "BAD.DAT");
  run("put", img, "A", payload, "GOOD.DAT");
  const image = readFileSync(img);
  const a = volume(image, "A");
  const e = a.scan().find((x) => x.name === "BAD.DAT");
  const raw = a.entry(e.index);
  raw[15] = 0x80; // 128 records, so the second slot is read
  raw[18] = 0xff; // and it names block 32767, past G1M's DSM of 511
  raw[19] = 0x7f;
  writeFileSync(img, image);
  assert.match(a.verify().join("\n"), /block 32767 beyond DSM/);
  assert.throws(() => a.read("BAD.DAT"), /BAD\.DAT.*extent 0.*block 32767/, "CpmVolume.read refuses");
  assert.equal(a.read("GOOD.DAT")[0], 0x41, "another file reads");
  const out = resolve(dir, "out.bin");
  assert.throws(() => run("get", img, "A", "BAD.DAT", out), /BAD\.DAT.*block 32767/, "tecvol get refuses");
  assert.throws(() => readFileSync(out), /ENOENT/, "and writes no file");
});

test("damaged-volume reports and terminal CLI errors finish under normal and guarded Node settings (KE-AR12, KE-202)", { timeout: 110_000 }, () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-terminal-"));
  const tool = resolve(ROOT, "tools/tecvol.mjs");
  function run(args, options = "") {
    const { NODE_OPTIONS, NODE_TEST_CONTEXT, ...env } = process.env;
    const result = spawnSync(process.execPath, [tool, ...args], {
      encoding: "utf8", timeout: 5000, killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"], env: { ...env, NODE_OPTIONS: options },
    });
    assert.equal(result.error, undefined, `CLI failed or timed out: ${result.error}; ${result.stderr}`);
    assert.equal(result.signal, null, `CLI was signalled: ${result.signal}`);
    return result;
  }
  const must = (...args) => {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    const cards = [];
    for (const block of [null, 600]) {
      const img = resolve(dir, `card-${block ?? "twice"}.img`);
      const payload = resolve(dir, "payload.bin");
      must("create", img, "--volume", "G1M:SYSTEM:A", "--volume", "G8M:WORK:B");
      writeFileSync(payload, new Uint8Array(3000).fill(0x55));
      must("put", img, "A", payload, "MOUNT.COM");
      writeFileSync(payload, Buffer.from("hello"));
      must("put", img, "A", payload, "HELLO.TXT");
      const image = readFileSync(img);
      const a = volume(image, "A");
      const hello = a.entry(a.scan().find(e => e.name === "HELLO.TXT").index);
      const use = block ?? a.scan().find(e => e.name === "MOUNT.COM").blocks[0];
      hello[16] = use & 255;
      hello[17] = use >> 8;
      writeFileSync(img, image);
      cards.push({ img, block });
    }
    for (const options of ["", "--max-old-space-size=450"]) {
      console.log(JSON.stringify({ cliNode: process.version, NODE_OPTIONS: options }));
      for (let repeat = 0; repeat < 4; repeat++) {
        for (const { img, block } of cards) {
          for (const cmd of ["info", "verify"]) {
            const r = run([cmd, img], options);
            assert.equal(r.status, cmd === "verify" ? 1 : 0, r.stderr);
            assert.equal(r.stderr, "");
            assert.match(r.stdout, /^ {2}A: SYSTEM .* 2 file\(s\), free unknown$/m);
            assert.match(r.stdout, block === null ? /problem: HELLO\.TXT: block \d+ allocated twice/ : /problem: HELLO\.TXT: block 600 beyond DSM/);
            assert.match(r.stdout, /^ {2}B: WORK .* 0 file\(s\), \d+ bytes free$/m);
          }
        }
        const fatal = run(["verify", resolve(dir, "missing.img")], options);
        assert.equal(fatal.status, 1);
        assert.match(fatal.stderr, /^tecvol: .*ENOENT/m);
        const usage = run(["unknown-command"], options);
        assert.equal(usage.status, 2, "usage remains an abort, not a graceful continuation");
        assert.match(usage.stderr, /usage: tecvol/);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  execFileSync("node", [resolve(ROOT, "tools/tecvol.mjs"), "create", img, ...vols, "--drives", "3"], { timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
  const info = execFileSync("node", [resolve(ROOT, "tools/tecvol.mjs"), "verify", img], { timeout: 5000, encoding: "utf8" });
  assert.match(info, /format 1\.1, .* 12 volume\(s\), 3 drive\(s\) wanted/);
  const parsed = parseContainer(readFileSync(img));
  assert.deepEqual([parsed.minor, parsed.drives, parsed.volumes.length, parsed.volumes[11].label], [1, 3, 12, "V11"]);
  assert.throws(() => createContainer([{ geometry: "G1M", label: "SAME", mount: "A" }, { geometry: "G1M", label: "SAME" }]), ContainerError, "duplicate labels");
  assert.throws(() => createContainer(Array.from({ length: 128 }, (_, i) => ({ geometry: "G1M", label: `V${i}`, mount: i ? "-" : "A" }))), ContainerError, "128 volumes");
  assert.equal(parseContainer(standardCard()).minor, 0, "a card of 8 or fewer with no drives field stays 1.0");
});

// Byte 15 of a descriptor is reserved: write-behind follows the logged drive,
// so a card marks no volume, and the tools refuse a caller that still does.

test("S2-5 writeBehind refused", () => {
  for (const wb of [true, false]) {
    assert.throws(() => createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B", writeBehind: wb }]), /writeBehind/, `writeBehind: ${wb}`);
  }
  const recipe = { schema: "tecos-file-recipe-v1", volumes: [{ geometry: "G1M", label: "SYSTEM", mount: "A", writeBehind: true }], components: [] };
  return assert.rejects(buildRecipe(recipe, () => null), /writeBehind/, "a recipe that names it");
});

test("S2-5 :wb refused", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-wb-"));
  const img = resolve(dir, "wb.img");
  const r = spawnSync("node", [resolve(ROOT, "tools/tecvol.mjs"), "create", img, "--volume", "G1M:SYSTEM:A", "--volume", "G8M:WORK:B:wb"], { timeout: 5000, encoding: "utf8" });
  assert.notEqual(r.status, 0, "refused");
  assert.match(r.stderr + r.stdout, /unknown volume flag :wb/);
  assert.equal(existsSync(img), false, "no image made");
});

test("S2-5 tecvol writes 15 zero", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "tecvol-15-"));
  const tecvol = (...args) => execFileSync("node", [resolve(ROOT, "tools/tecvol.mjs"), ...args], { timeout: 5000, encoding: "utf8" });
  const img = resolve(dir, "c.img");
  tecvol("create", img, "--volume", "G1M:SYSTEM:A", "--volume", "G8M:WORK:B", "--volume", "G1M:LOCKED:C:ro");
  const image = new Uint8Array(readFileSync(img));
  for (let i = 0; i < 3; i += 1) assert.equal(image[desc(i) + 15], 0, `volume ${i}'s byte 15`);
  assert.equal(D.reserved0.offset, 15, "the format names byte 15 reserved");
  assert.equal(D.cache, undefined, "and no cache field");
  assert.doesNotMatch(tecvol("info", img), / wb /, "info names no write-behind volume");
  const lib = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G1M", label: "LOCKED", readOnly: true }]);
  assert.deepEqual([lib[desc(0) + 15], lib[desc(1) + 15]], [0, 0], "createContainer writes it zero");
});

test("npm run build leaves dist/'s ROM, map and census equal to build/'s when dist/ is there (KE-188)", () => {
  const dist = resolve(ROOT, "dist");
  const names = [["tecos.rom", "tecos.rom"], ["tecos.d8.json", "tecos.d8.json"], ["census.json", "tecos.census.json"]];
  const touched = [...names.map(([, to]) => to), "manifest.json"].map((n) => resolve(dist, n)); // all the build writes in dist/
  const kept = new Map();
  const there = existsSync(dist);
  mkdirSync(dist, { recursive: true });
  for (const path of touched) if (existsSync(path)) kept.set(path, readFileSync(path));
  for (const [, to] of names) writeFileSync(resolve(dist, to), "stale"); // as an older build's media left them
  try {
    writeFileSync(resolve(dist, "manifest.json"), JSON.stringify({ tecos: { tpaBytes: 47273 } }));
    execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { timeout: 120000, encoding: "utf8" });
    for (const [from, to] of names) assert.ok(readFileSync(resolve(dist, to)).equals(readFileSync(resolve(ROOT, "build/tecos", from))), `dist/${to} is build/tecos/${from}`);
    const census = JSON.parse(readFileSync(resolve(ROOT, "build/tecos/census.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(resolve(dist, "manifest.json"), "utf8"));
    assert.equal(manifest.tecos.tpaBytes, census.ram.cards.starter.tpa);
    assert.equal(manifest.tecos.tpaBytes, 46533, "build keeps the four-drive starter's bare TPA");
  } finally {
    // dist/ as it was found: each file the build may write put back, or removed if it wasn't there
    if (!there) rmSync(dist, { recursive: true });
    else for (const path of touched) kept.has(path) ? writeFileSync(path, kept.get(path)) : rmSync(path, { force: true });
  }
});
