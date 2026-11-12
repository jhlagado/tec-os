// The board diagnostics (diag/, docs/diagnostics.md) on the Debug80 TEC-1G
// model. There is no MON3 image, so test/programs/mon3stub.asm stands in for
// it at C000h with the calls the program uses; keys come from a script.
// Emulator evidence only: these runs prove the program's own logic, its
// arithmetic and the SD8 safety rule, not the board.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import { assembleProgram } from "../tools/lib/assemble.mjs";
import { buildDiag, LOAD } from "../tools/diag.mjs";
import { createContainer, descriptorAt, headerChecksum } from "../tools/lib/container.mjs";
import { SdSpi } from "@jhlagado/debug80-runtime/platforms/tec1g/sd-spi";

const ROOT = resolve(import.meta.dirname, "..");
const SLOW = { timeout: 300_000 };
const GO = 0x12;
const AD = 0x13;
const KEY8 = 0x08;
const KEYQ = 0x30; // the stub's scripted key port
const BLOCK = 512;
const WRITE = [KEY8, GO]; // SD8's answer that writes the card
let diag;
let stub;
let rom;

before(async () => {
  diag = await buildDiag();
  stub = await assembleProgram(resolve(ROOT, "test/programs/mon3stub.asm"), { base: 0xc000 });
  rom = new Uint8Array(0x4000).fill(0xff);
  rom.set(stub.bytes.subarray(0, 0x4000));
});

/** A CSD for a card of `blocks` blocks: v2 (a multiple of 1024 blocks), or
 *  for SDSC v1 with 512-byte blocks and C_SIZE_MULT 7 (a multiple of 512).
 *  The model's own CSD is fixed at 16 MiB whatever the image. */
function csdFor(blocks, highCapacity = true) {
  const csd = new Array(16).fill(0);
  csd[1] = 0x0e;
  if (highCapacity) {
    const size = blocks / 1024 - 1;
    csd[0] = 0x40;
    csd[5] = 0x5a;
    csd[7] = (size >> 16) & 0x3f;
    csd[8] = (size >> 8) & 0xff;
    csd[9] = size & 0xff;
  } else {
    const size = blocks / 512 - 1;
    csd[5] = 0x59; // READ_BL_LEN 9
    csd[6] = (size >> 10) & 3;
    csd[7] = (size >> 2) & 0xff;
    csd[8] = (size & 3) << 6;
    csd[9] = 3; // C_SIZE_MULT 7: 3 here,
    csd[10] = 0x80; // and 1 here
  }
  return csd;
}

/** The two volumes the starter card began with (SYSTEM G1M on A, WORK G8M on
 *  B), then `free` blocks of C3h: 245,760 blocks in all, a card sold as
 *  128 MB. */
function starterCard(free = 225280) {
  const container = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
  ]);
  const image = new Uint8Array(container.length + free * BLOCK).fill(0xc3);
  image.set(container);
  return { image, containerBlocks: container.length / BLOCK };
}

/** Put a valid header checksum back after editing the header in IMAGE. */
function resum(image) {
  const sum = headerChecksum(image.subarray(0, BLOCK));
  image[20] = sum & 0xff;
  image[21] = sum >> 8;
}

/**
 * A card image of `bytes` too large to hold: the container at its start,
 * other blocks C3h until written. With `wrap`, offsets past it land on
 * offset % wrap, as on a fake card that ignores its high address bits;
 * `map` can send any other block somewhere else.
 */
function sparseCard(container, bytes, wrap, map = (b) => b) {
  const pages = new Map();
  const at = (i) => {
    i = wrap ? i % wrap : i;
    return map(Math.floor(i / BLOCK)) * BLOCK + (i % BLOCK);
  };
  const get = (i) => {
    i = at(i);
    if (i < container.length) return container[i];
    return pages.get(i >> 9)?.[i & 511] ?? 0xc3;
  };
  const set = (i, v) => {
    i = at(i);
    if (i < container.length) return void (container[i] = v);
    let p = pages.get(i >> 9);
    if (!p) pages.set(i >> 9, (p = new Uint8Array(BLOCK).fill(0xc3)));
    p[i & 511] = v;
  };
  const image = new Proxy({}, {
    get: (_, k) => (k === "length" ? bytes : typeof k === "string" && /^\d+$/.test(k) ? get(Number(k)) : undefined),
    set: (_, k, v) => (set(Number(k), v), true),
  });
  const untouched = () => [...pages.values()].every((p) => p.every((b) => b === 0xc3));
  // The block a write to logical block B lands on.
  const physical = (b) => Math.floor(at(b * BLOCK) / BLOCK);
  return { image, untouched, physical };
}

/**
 * An SdSpi card on IMAGE whose CSD gives BLOCKS. It records the block each
 * CMD24 addresses (log.writes) and the block each accepted one lands on
 * (log.landed, through `physical`), and the block of each CMD17; byte
 * addresses are divided down on SDSC. `faults` can refuse the Nth CMD24
 * (`failWrite(n)`, from 0), refuse a read (`failRead(block)`) and corrupt a
 * read (`corrupt(block)`). `csdV1` gives a v1 CSD whatever the addressing.
 */
function card(image, blocks, log, { highCapacity = true, faults = {}, physical = (b) => b, csdV1 = !highCapacity } = {}) {
  const sd = new SdSpi({ image, highCapacity });
  sd.makeCsd = () => csdFor(blocks, !csdV1);
  const block = (arg) => (highCapacity ? arg : arg / BLOCK);
  const handle = sd.handleCommand.bind(sd);
  sd.handleCommand = (c) => {
    if (c.cmd === 24) {
      const n = log.writes.length;
      log.writes.push(block(c.arg));
      if (faults.failWrite?.(n)) {
        sd.pendingResponse = [0x40]; // a parameter error: no data phase
        sd.delayBytes = 1;
        return;
      }
      log.landed.push(physical(block(c.arg)));
    }
    if (c.cmd === 17) {
      log.reads.push(block(c.arg));
      if (faults.failRead?.(block(c.arg))) {
        sd.pendingResponse = [0x40];
        sd.delayBytes = 1;
        return;
      }
    }
    handle(c);
  };
  const read = sd.readBlock.bind(sd);
  sd.readBlock = (arg) => {
    const payload = read(arg);
    if (faults.corrupt?.(block(arg))) payload[7] ^= 0x40;
    return payload;
  };
  return sd;
}

/**
 * Run the program to its RST 00h. `cardOf(log, m)` makes a card (or null for
 * none); `answers` maps a prompt's words to the keys that answer it, each a
 * code or { key, before(m) }. KEYS is ended with AD; any other prompt not
 * listed is answered GO.
 */
function run({ cardOf = () => null, answers = {}, rtc = true, quick = true } = {}) {
  const log = { writes: [], landed: [], reads: [] };
  const m = new Machine({ rom, symbols: new Map(), tms: true, matrix: true, rtc, clock: new Date(2026, 0, 1, 12, 0, 0) });
  m.newCard = () => (m.sd = cardOf(log, m));
  m.newCard();
  for (let i = 0; i < diag.image.length; i += 1) m.write(LOAD + i, diag.image[i]);
  if (quick) m.write(diag.symbols.get("QUICK"), 1);
  // The program asks on the LCD before it sends anything, then with "# " lines.
  const prompts = /^# (Fit the card|SD8 press 8|SD9 pull|SD9 put|KEYS press|Done)/;
  let answered = 0;
  let seen = -1;
  let asked = [];
  const pending = [];
  const base = m.tec1g.ioHandlers.read;
  m.tec1g.ioHandlers.read = (port) => {
    if ((port & 0xff) !== KEYQ) return base(port);
    if (!pending.length) {
      if (m.serial.length !== seen) {
        // Only when more has been sent: polls come thousands of times.
        seen = m.serial.length;
        asked = ["(capture)", ...m.serialText().split("\r\n").filter((l) => prompts.test(l))];
      }
      if (asked.length <= answered) return 0xff;
      const prompt = asked[answered++];
      const all = { "KEYS press": [AD], ...answers };
      const word = Object.keys(all).find((w) => prompt.includes(w));
      pending.push(...(word ? all[word] : [GO]));
    }
    let k = pending.shift();
    if (typeof k === "object") {
      k.before?.(m);
      k = k.key;
    }
    return k;
  };
  m.runUntil(() => m.pc === stub.symbols.MONRST, 2_000_000_000, "the program's RST 00h");
  const text = m.serialText();
  const lines = new Map();
  for (const line of text.split("\r\n")) {
    const r = /^([A-Z0-9]+) (PASS|WARN|FAIL|SKIP)(?: (.*))?$/.exec(line);
    if (r) lines.set(r[1], { status: r[2], detail: r[3] ?? "" });
  }
  return { m, text, lines, log };
}

/** Fields of a result line as an object; a word with no "=" maps to true. */
const fields = (detail) => Object.fromEntries(detail.split(" ").map((f) => (f.includes("=") ? f.split(/=(.*)/s).slice(0, 2) : [f, true])));

/** SD8's rule: every write addressed a block from the container's end to
 *  the one before the card's last (BLOCKS - 2), never blocks 0-7; none landed
 *  outside that range either, but on the blocks `landedOk` lists; and blocks
 *  0-7 and every volume block are byte-identical to BEFORE. */
function assertSafe(log, image, before, containerBlocks, blocks, landedOk = []) {
  const top = blocks - 2;
  for (const b of log.writes) assert.ok(b >= 8 && b >= containerBlocks && b <= top, `block ${b} addressed`);
  for (const b of log.landed) assert.ok((b >= containerBlocks && b <= top) || landedOk.includes(b), `a write landed on block ${b}`);
  const n = containerBlocks * BLOCK;
  for (let i = 0; i < n; i += 1) if (image[i] !== before[i]) assert.fail(`byte ${i} of the container changed`);
}

const NOTE0 = /# SD8 a free block holds a copy of block 0: either the card wraps, or the free area holds an old copy\. Nothing was written\r\n/;

const SD_PULL = [{ key: GO, before: (m) => (m.sd = null) }];
const SD_BACK = [{ key: GO, before: (m) => m.newCard() }];
const SD9 = { "SD9 pull": SD_PULL, "SD9 put": SD_BACK };

test("the build keeps code below 8000h, and variables and the stack in 1000h-3FFFh", () => {
  const at = (n) => diag.symbols.get(n);
  assert.equal(at("START"), 0x4000);
  assert.ok(at("PROGEND") < 0x7fff, "code and tables below 7FFFh, with a spare byte for PROT");
  assert.ok(at("VARS") >= 0x1000 && at("VARSEND") <= 0x4000);
  assert.equal(at("STKTOP"), at("VARSEND"), "the stack ends the variables, so the RAM check spares it");
  assert.equal(at("STKTOP") - at("STACK"), 256);
  assert.equal(diag.bytes, at("PROGEND") - 0x4000);
  assert.match(diag.id, /^[0-9A-F]{16}$/);
});

test("a starter card passes every check, and SD8 leaves the card as it was", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  const blocks = image.length / BLOCK;
  const press = (row, col, down) => ({ key: 0xff, before: (m) => m.tec1g.applyMatrixKey(row, col, down) });
  const { m, text, lines, log } = run({
    cardOf: (log) => card(image, blocks, log),
    answers: { "SD8 press 8": WRITE, ...SD9, "KEYS press": [0x05, press(3, 4, true), 0xff, press(3, 4, false), 0xff, AD] },
  });
  assert.match(text, new RegExp(`^TEC1G-DIAG 1\\.0 image=${diag.id} bytes=${diag.bytes} sp=087E\r\n`));
  const expect = {
    PASS: ["SHAD", "SD1", "SD2", "SD3", "SD4", "SD5", "SD6", "SD7", "SD8", "SD9", "RAM", "PROT", "CLK", "VDP", "LCD", "GLCD", "RTC", "KEYS"],
    // Debug80 delivers the PICO9918's frame interrupt as an NMI.
    SKIP: ["INT"],
  };
  for (const [status, ids] of Object.entries(expect)) for (const id of ids) assert.equal(lines.get(id)?.status, status, `${id} ${JSON.stringify(lines.get(id))}`);
  assert.match(text, /\r\nSUMMARY pass=18 warn=0 fail=0 skip=1\r\n/);
  // SHAD runs first, before any SD access.
  assert.ok(text.indexOf("SHAD PASS") < text.indexOf("SD1 "));
  assert.match(lines.get("SHAD").detail, /^convention=tecos bit0=0:rom\(0\) bit0=1:ram\(\d+\) mon3on:rom\(0\)$/);
  // The answers the model gives, and the margins against TEC-OS's bounds.
  assert.match(lines.get("SD2").detail, /^err=0 cmd0=1\/10 cmd8=01 r7=000001AA acmd41=2\/256 ocr=C0000000 type=SDHC counted=0$/);
  assert.match(lines.get("SD3").detail, /^r1max=\d+\/16 tokmax=\d+\/65536 acmd41=2\/256 cmd0=1\/10 reads=64 err=0$/);
  assert.equal(fields(lines.get("SD4").detail).blocks, String(blocks));
  assert.equal(fields(lines.get("SD4").detail).class, "128MB");
  assert.equal(fields(lines.get("SD7").detail).free_from, String(containerBlocks));
  assert.equal(fields(lines.get("SD9").detail).out_read, "5", "a read with no card is SDECMD");
  assert.equal(fields(lines.get("SD9").detail).out_init, "1", "and SDINIT's CMD0 goes unanswered");
  assert.match(lines.get("CLK").detail, /^mhz=4\.00 /);
  assert.match(lines.get("VDP").detail, /^probe=ok frame=799\d\d hz=50\.0\d$/);
  assert.match(lines.get("RAM").detail, /exp0=ok exp1=ok distinct=yes$/);
  assert.match(lines.get("PROT").detail, / on=kept off=written$/);
  assert.match(text, /# KEY pad=05\r\n/);
  assert.match(text, /# KEY matrix row=3 bit=4 code=28\r\n/);
  assert.equal(lines.get("KEYS").detail, "pad=1 matrix=1");
  // SD8: the read-only probe read each power of two before any write, and
  // the writes came in order: the first free block, the powers of two, the
  // middle, the run of 32, the last.
  const free0 = containerBlocks;
  const freeL = blocks - 2;
  const pow = [32768, 65536, 131072];
  const middle = free0 + Math.floor((freeL - free0) / 2);
  const order = [free0, ...pow, middle, ...Array.from({ length: 32 }, (_, i) => free0 + i), freeL];
  assert.deepEqual(log.writes.filter((_, i) => i % 2 === 0), order);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)), "the card is unchanged");
  assertSafe(log, image, before, containerBlocks, blocks);
  for (const b of log.writes) assert.ok(b < blocks - 1, `block ${b} is before the last`);
  // MON3's state is back: the latch, its user vectors, and no unknown call.
  assert.equal(m.read(0x0880), 0x01, "the stub's latch copy");
  assert.equal(m.sysCtrl, 0x01, "the latch itself");
  assert.equal(m.read(0x0892) | m.read(0x0893) | m.read(0x0894) | m.read(0x0895), 0);
  assert.equal(m.read(0x0886), 0, "no MON3 call the stub lacks");
  assert.deepEqual(m.violations, []);
});

test("an SDSC card, byte-addressed, passes SD8 inside TEC-OS's range", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  const blocks = image.length / BLOCK;
  const { lines, log } = run({ cardOf: (log) => card(image, blocks, log, { highCapacity: false }), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.match(lines.get("SD2").detail, / ocr=80000000 type=SDSC /);
  assert.equal(lines.get("SD4").status, "PASS", JSON.stringify(lines.get("SD4")));
  assert.match(lines.get("SD4").detail, / csd=v1 /);
  assert.match(lines.get("SD5").detail, / sdsc_limit=8388608 refused=0$/);
  assert.equal(lines.get("SD8").status, "PASS", JSON.stringify(lines.get("SD8")));
  assert.ok(log.writes.length > 0);
  assertSafe(log, image, before, containerBlocks, blocks);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)));
});

test("SDHC block numbers above 400000h work on a 4 GB card", SLOW, () => {
  const { image: container, containerBlocks } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 7580 * 1024; // 3,974 MB: a card sold as 4 GB
  const sparse = sparseCard(container, blocks * BLOCK);
  const { lines, log } = run({ cardOf: (log) => card(sparse.image, blocks, log, { physical: sparse.physical }), answers: { "SD8 press 8": WRITE, ...SD9 } });
  for (const id of ["SD4", "SD5", "SD7", "SD8", "SD9"]) assert.equal(lines.get(id)?.status, "PASS", `${id} ${JSON.stringify(lines.get(id))}`);
  assert.match(lines.get("SD4").detail, /^blocks=7761920 mib=3790 class=4GB /);
  assert.equal(fields(lines.get("SD5").detail).last, String(blocks - 1));
  assert.ok(log.reads.includes(blocks - 1), "the last block read");
  assert.ok(log.reads.includes(1 << 22), "the probe read block 400000h");
  assert.ok(log.writes.some((b) => b > 0x400000), "a block past 2 GiB written");
  assert.ok(log.writes.includes(blocks - 2), "the last free block written");
  assertSafe(log, container, before, containerBlocks, blocks);
  assert.ok(sparse.untouched(), "every free block is as it was");
});

test("a fake card twice its flash is caught by the read-only probe before any write", SLOW, () => {
  // It claims 2^23 blocks and wraps at 2^22. Under the old order the middle
  // block, written before any probe, would have landed in the WORK volume.
  const { image: container, containerBlocks } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 1 << 23;
  const middle = containerBlocks + Math.floor((blocks - 2 - containerBlocks) / 2);
  assert.ok(middle % (1 << 22) >= 4096 && middle % (1 << 22) < containerBlocks, "the middle wraps into WORK");
  const sparse = sparseCard(container, blocks * BLOCK, (1 << 22) * BLOCK);
  const { lines, text, log } = run({ cardOf: (log) => card(sparse.image, blocks, log, { physical: sparse.physical }), answers: SD9 });
  assert.equal(lines.get("SD8").status, "FAIL");
  assert.match(lines.get("SD8").detail, /^alias at=4194304 probe=read-only blocks=0 fail=0$/);
  assert.match(text, NOTE0);
  assert.doesNotMatch(text, /SD8 press 8/, "the owner is not asked");
  assert.deepEqual(log.writes, []);
  assertSafe(log, container, before, containerBlocks, blocks);
});

test("a card that wraps at 1 GiB is caught by the probe as well", SLOW, () => {
  const { image: container, containerBlocks } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 7580 * 1024;
  const sparse = sparseCard(container, blocks * BLOCK, 1 << 30);
  const { lines, log } = run({ cardOf: (log) => card(sparse.image, blocks, log, { physical: sparse.physical }), answers: SD9 });
  assert.match(lines.get("SD8").detail, /^alias at=2097152 probe=read-only /);
  assert.deepEqual(log.writes, []);
  assertSafe(log, container, before, containerBlocks, blocks);
  assert.equal(lines.get("SD9").status, "PASS");
});

test("a pattern write that reaches block 3 fails SD8 as an alias, and the block's restore puts it back", SLOW, () => {
  // A card whose controller sends the first free block to block 3. The probe
  // of the powers of two cannot see it, so the pattern write and its restore
  // both land on block 3, though SD8 addresses only the free block. The 0-7
  // reads after the pattern write must catch it, and the restore puts it back.
  const { image: container, containerBlocks } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 240 * 1024;
  const sparse = sparseCard(container, blocks * BLOCK, 0, (b) => (b === containerBlocks ? 3 : b));
  const { lines, text, log } = run({ cardOf: (log) => card(sparse.image, blocks, log, { physical: sparse.physical }), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.deepEqual(log.landed, [3, 3], "the pattern and its restore both landed on block 3");
  assert.match(text, new RegExp(`# SD8 block ${containerBlocks} pattern=ok restore=ok tries=1 busy=\\d+ alias=3\r\n`));
  assert.match(lines.get("SD8").detail, new RegExp(`^alias at=${containerBlocks} low=3 blocks=1 fail=1 `));
  assert.match(text, /# SD8 the card may be changed: restore it from your backup before using it\r\n/);
  assert.equal(log.writes.length, 2, "the pattern and its restore, then a stop");
  assertSafe(log, container, before, containerBlocks, blocks, [3]);
});

test("a card that wraps below the container's end is caught by a probe from block 8", SLOW, () => {
  // The starter container (20,480 blocks) on a card that claims 22,528 and
  // wraps at 16,384: no power of two lies in the free range, so a probe from
  // free_from would read nothing, and every write would land in a volume.
  const { image: container, containerBlocks } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 22528;
  const sparse = sparseCard(container, blocks * BLOCK, 16384 * BLOCK);
  const { lines, text, log } = run({ cardOf: (log) => card(sparse.image, blocks, log, { physical: sparse.physical }), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.match(lines.get("SD8").detail, /^alias at=16384 probe=read-only blocks=0 fail=0$/);
  assert.match(text, NOTE0);
  assert.deepEqual(log.writes, []);
  assertSafe(log, container, before, containerBlocks, blocks);
});

// Each SD7 rejection leaves SD8 skipped with nothing written.
const REJECTS = {
  "a bad version": [(img) => ((img[8] = 2), resum(img)), "22h", "version"],
  "a bad volume count": [(img) => ((img[14] = 0), resum(img)), "24h", "count"],
  "a bad header checksum": [(img) => (img[30] = 1), "25h", "checksum"],
  "unknown descriptor flags": [(img) => ((img[descriptorAt(0) + 13] = 2), resum(img)), "26h", "descriptor"],
  "a 1.1 drives field above 4": [(img) => ((img[9] = 1), (img[22] = 5), resum(img)), "23h", "size"],
  "a drive assigned twice": [(img) => ((img[descriptorAt(1) + 14] = 0), resum(img)), "29h", "drive"],
  "overlapping volumes": [
    (img) => {
      const o = descriptorAt(1) + 4; // WORK's start into SYSTEM
      img[o] = 0x08;
      img[o + 1] = 0x08;
      resum(img);
    },
    "28h",
    "overlap",
  ],
};
for (const [name, [edit, code, reason]] of Object.entries(REJECTS)) {
  test(`SD7 rejects ${name} and SD8 writes nothing`, SLOW, () => {
    const { image, containerBlocks } = starterCard();
    edit(image);
    const before = Uint8Array.from(image);
    const { lines, log } = run({ cardOf: (log) => card(image, image.length / BLOCK, log), answers: { "SD8 press 8": WRITE, ...SD9 } });
    assert.equal(lines.get("SD7").detail.split(" idx=")[0], `code=${code} reason=${reason}`);
    assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=sd7" });
    assert.deepEqual(log.writes, []);
    assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
  });
}

test("SD7 rejects a volume past the card's end and SD8 writes nothing", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  const { lines, log } = run({ cardOf: (log) => card(image, 16384, log), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.equal(lines.get("SD7").detail, "code=2Bh reason=card idx=1");
  assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=sd7" });
  assert.deepEqual(log.writes, []);
  assertSafe(log, image, before, containerBlocks, 16384);
});

test("a card without a container fails SD7, and SD8 writes nothing", SLOW, () => {
  const image = new Uint8Array(32768 * BLOCK);
  const { lines, log } = run({ cardOf: (log) => card(image, 32768, log), answers: SD9 });
  assert.equal(lines.get("SD7").detail, "code=21h reason=magic");
  assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=sd7" });
  assert.deepEqual(log.writes, []);
  assert.ok(image.every((b) => b === 0));
});

test("a failed pattern write is reported, the block restored, and nothing low written", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  const faults = { failWrite: (n) => n === 0 };
  const { lines, text, log } = run({ cardOf: (log) => card(image, image.length / BLOCK, log, { faults }), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.match(text, new RegExp(`# SD8 block ${containerBlocks} pattern=write:05 restore=ok tries=1 `));
  assert.equal(lines.get("SD8").status, "FAIL");
  assert.match(lines.get("SD8").detail, /^blocks=\d+ fail=1 /);
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)), "the restore put the block back");
});

test("a restore that fails three times stops SD8 and says to restore the card", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  const faults = { failWrite: (n) => n >= 1 && n <= 3 };
  const { lines, text, log } = run({ cardOf: (log) => card(image, image.length / BLOCK, log, { faults }), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.match(text, new RegExp(`# SD8 block ${containerBlocks} pattern=ok restore=write:05 tries=3 `));
  assert.match(lines.get("SD8").detail, new RegExp(`^restore-failed at=${containerBlocks} blocks=1 fail=1 `));
  assert.match(text, /# SD8 the card may be changed: restore it from your backup before using it\r\n/);
  assert.equal(log.writes.length, 4, "the pattern and three restores, then a stop");
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
});

test("a corrupted read of block 0 before SD8 writes stops it with nothing written", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  let m;
  const faults = { corrupt: (b) => b === 0 && /\r\nSD7 PASS/.test(m.serialText()) && !/SD8 /.test(m.serialText()) };
  const { lines, log } = run({
    cardOf: (log, mm) => ((m = mm), card(image, image.length / BLOCK, log, { faults })),
    answers: { "SD8 press 8": WRITE, ...SD9 },
  });
  assert.deepEqual(lines.get("SD8"), { status: "FAIL", detail: "blk0=unstable blocks=0 fail=0" });
  assert.deepEqual(log.writes, []);
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
});

test("AD between blocks stops SD8 cleanly, each block put back first", SLOW, () => {
  const { image, containerBlocks } = starterCard();
  const before = Uint8Array.from(image);
  const { lines, log } = run({ cardOf: (log) => card(image, image.length / BLOCK, log), answers: { "SD8 press 8": [...WRITE, 0xff, 0xff, AD], ...SD9 } });
  assert.equal(lines.get("SD8").status, "SKIP");
  assert.match(lines.get("SD8").detail, /^reason=user-abort blocks=3 fail=0 /);
  assert.equal(log.writes.length, 6, "three blocks, each written and put back");
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)));
});

/** Run a starter card with OPTIONS for card() and answer SD8 with 8 then GO;
 *  the card, its copy from before and the run. */
function starterRun(options = () => ({}), edit = () => {}, onMachine = () => {}) {
  const { image, containerBlocks } = starterCard();
  edit(image);
  const before = Uint8Array.from(image);
  const r = run({ cardOf: (log, m) => (onMachine(m), card(image, image.length / BLOCK, log, options(log, m))), answers: { "SD8 press 8": WRITE, ...SD9 } });
  return { image, before, containerBlocks, ...r };
}

// SD8's gates: each skip writes nothing.
const GATES = {
  "a failed SD3 read": [(log) => ({ faults: { failRead: (b) => b === 10 } }), "SD3", "FAIL", "sd3"],
  "a failed SD5 read": [(log) => ({ faults: { failRead: (b) => b === 122880 } }), "SD5", "FAIL", "sd5"],
  "an OCR whose CCS disagrees with the CSD": [() => ({ csdV1: true }), "SD4", "WARN", "sd4"],
};
for (const [name, [options, id, status, reason]] of Object.entries(GATES)) {
  test(`SD8 skips after ${name}, writing nothing`, SLOW, () => {
    const { image, before, containerBlocks, lines, log } = starterRun(options);
    assert.equal(lines.get(id).status, status, JSON.stringify(lines.get(id)));
    if (id === "SD4") assert.match(lines.get("SD4").detail, / ccs=mismatch$/);
    assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: `reason=${reason}` });
    assert.deepEqual(log.writes, []);
    assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
  });
}

test("SD8 stops with nothing written when a target reads two ways", SLOW, () => {
  let once = true;
  const { image, before, containerBlocks, lines, text, log } = starterRun(() => ({
    faults: { corrupt: (b) => b === 20480 && once && !(once = false) },
  }));
  assert.match(text, /# SD8 block 20480 pattern=unstable\r\n/);
  assert.match(lines.get("SD8").detail, /^unstable at=20480 blocks=0 fail=1 /);
  assert.deepEqual(log.writes, []);
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
});

test("a copy of block 0 in free space stops SD8 with nothing written, at the probe or at the target", SLOW, () => {
  for (const [at, detail] of [
    [65536, /^alias at=65536 probe=read-only blocks=0 fail=0$/],
    [20480, /^alias at=20480 blocks=0 fail=1 /],
  ]) {
    const { image, before, containerBlocks, lines, text, log } = starterRun(() => ({}), (img) => img.copyWithin(at * BLOCK, 0, BLOCK));
    assert.match(lines.get("SD8").detail, detail);
    assert.match(text, NOTE0);
    assert.deepEqual(log.writes, []);
    assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
  }
});

test("a copy of block 0 mid-run stops SD8, says nothing was written to that block, and gives the backup note", SLOW, () => {
  // Review 03's E3: the probe passes, four blocks are written and put back,
  // then the middle block reads as block 0.
  const { image, before, containerBlocks, lines, text, log } = starterRun(() => ({}), (img) => img.copyWithin(133119 * BLOCK, 0, BLOCK));
  assert.match(lines.get("SD8").detail, /^alias at=133119 blocks=4 fail=1 /);
  assert.match(text, /# SD8 a free block holds a copy of block 0: either the card wraps, or the free area holds an old copy\. Nothing was written to this block\r\n# SD8 the card may be changed: restore it from your backup before using it\r\n/);
  assert.deepEqual(log.writes, [20480, 20480, 32768, 32768, 65536, 65536, 131072, 131072]);
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
});

test("one corrupted probe read cannot hide a wrap below the container's end", SLOW, () => {
  // Review 03's E4: the DG-11 card, with the probe's first read of block
  // 16384 corrupted. Its second read still shows block 0.
  const { image: container, containerBlocks } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 22528;
  const sparse = sparseCard(container, blocks * BLOCK, 16384 * BLOCK);
  let m;
  let once = true;
  const faults = { corrupt: (b) => b === 16384 && once && /\r\nSD7 PASS/.test(m.serialText()) && !(once = false) };
  const { lines, log } = run({ cardOf: (log, mm) => ((m = mm), card(sparse.image, blocks, log, { physical: sparse.physical, faults })), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.equal(once, false, "the probe's read was corrupted");
  assert.match(lines.get("SD8").detail, /^alias at=16384 probe=read-only blocks=0 fail=0$/);
  assert.deepEqual(log.writes, []);
  assertSafe(log, container, before, containerBlocks, blocks);
});

test("two probe reads that differ stop SD8 as probe-unstable, with nothing written", SLOW, () => {
  let m;
  let once = true;
  const { image, before, containerBlocks, lines, log } = starterRun((log, mm) => ({
    faults: { corrupt: (b) => b === 32768 && once && /\r\nSD7 PASS/.test(m.serialText()) && !(once = false) },
  }), () => {}, (mm) => (m = mm));
  assert.equal(lines.get("SD8").detail, "probe-unstable at=32768 blocks=0 fail=0");
  assert.deepEqual(log.writes, []);
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
});

test("a low block that does not read after a pattern write stops SD8, counted as a failure", SLOW, () => {
  let log0;
  const { image, before, containerBlocks, lines, text, log } = starterRun((log) => ((log0 = log), { faults: { failRead: (b) => b === 5 && log0.writes.length > 0 } }));
  assert.match(text, /# SD8 block 20480 pattern=ok restore=ok tries=1 busy=\d+ lowread=5\r\n/);
  assert.match(lines.get("SD8").detail, /^lowread at=20480 low=5 blocks=1 fail=1 /);
  assert.equal(log.writes.length, 2, "the block was put back first");
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)));
});

test("a probe read that fails stops SD8 with nothing written", SLOW, () => {
  const { image, before, containerBlocks, lines, log } = starterRun(() => ({ faults: { failRead: (b) => b === 32768 } }));
  assert.equal(lines.get("SD8").detail, "probe-read at=32768 code=05 blocks=0 fail=0");
  assert.deepEqual(log.writes, []);
  assertSafe(log, image, before, containerBlocks, image.length / BLOCK);
});

test("a card the container fills skips SD8 with nofree", SLOW, () => {
  const { image, containerBlocks } = starterCard(0);
  const { lines, log } = run({ cardOf: (log) => card(image, containerBlocks, log), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.equal(lines.get("SD7").status, "PASS");
  assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=nofree" });
  assert.deepEqual(log.writes, []);
});

test("a 1.1 card of 20 volumes, with a table block, passes SD7 and SD8 stays outside it", SLOW, () => {
  const container = createContainer(Array.from({ length: 20 }, (_, i) => ({ geometry: "G1M", label: `VOL${i}`, mount: i === 0 ? "A" : "-" })));
  const containerBlocks = container.length / BLOCK;
  const blocks = Math.ceil((containerBlocks + 2048) / 1024) * 1024;
  const image = new Uint8Array(blocks * BLOCK).fill(0xc3);
  image.set(container);
  const before = Uint8Array.from(image);
  const { lines, log } = run({ cardOf: (log) => card(image, blocks, log), answers: { "SD8 press 8": WRITE, ...SD9 } });
  assert.match(lines.get("SD7").detail, /^ver=1\.1 vols=20 /);
  assert.ok(log.reads.includes(1), "the table block was read");
  assert.equal(lines.get("SD8").status, "PASS", JSON.stringify(lines.get("SD8")));
  assert.ok(log.writes.length > 0);
  assertSafe(log, image, before, containerBlocks, blocks);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)));
});

test("with no card SD2 fails with TEC-OS's SDENOCD and the other SD checks skip", SLOW, () => {
  const { lines } = run();
  assert.equal(lines.get("SD1").status, "PASS", "MISO idles high");
  assert.equal(lines.get("SD2").status, "FAIL");
  assert.match(lines.get("SD2").detail, /^err=1 cmd0=10\/10 /);
  for (const id of ["SD3", "SD4", "SD5", "SD6", "SD7", "SD8", "SD9"]) assert.deepEqual(lines.get(id), { status: "SKIP", detail: "reason=sd2" });
  assert.equal(lines.get("RAM").status, "PASS", "the other checks run");
});

test("any answer but 8 then GO at SD8's question writes nothing", SLOW, () => {
  for (const answer of [[AD], [GO], [KEY8, AD]]) {
    const { image } = starterCard();
    const before = Uint8Array.from(image);
    const { lines, log } = run({ cardOf: (log) => card(image, image.length / BLOCK, log), answers: { "SD8 press 8": answer, "SD9 pull": [AD] } });
    assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=user" }, JSON.stringify(answer));
    assert.deepEqual(log.writes, []);
    assert.ok(Buffer.from(image).equals(Buffer.from(before)));
  }
});

test("without an RTC SD6 reads between two beeps and CLK skips", SLOW, () => {
  const { image } = starterCard();
  const { m, lines } = run({ rtc: false, cardOf: (log) => card(image, image.length / BLOCK, log), answers: { "SD8 press 8": [AD], "SD9 pull": [AD] } });
  assert.equal(lines.get("SD6").detail, "blocks=8 bytes=4096 timer=stopwatch");
  assert.equal(m.read(0x0885), 2, "two beeps");
  assert.deepEqual(lines.get("CLK"), { status: "SKIP", detail: "reason=nortc" });
  assert.deepEqual(lines.get("RTC"), { status: "SKIP", detail: "reason=absent" });
  assert.match(lines.get("VDP").detail, / at=4mhz$/);
});
