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
import { createContainer } from "../tools/lib/container.mjs";
import { SdSpi } from "@jhlagado/debug80-runtime/platforms/tec1g/sd-spi";

const ROOT = resolve(import.meta.dirname, "..");
const SLOW = { timeout: 300_000 };
const GO = 0x12;
const AD = 0x13;
const KEYQ = 0x30; // the stub's scripted key port
const BLOCK = 512;
let diag;
let stub;
let rom;

before(async () => {
  diag = await buildDiag();
  stub = await assembleProgram(resolve(ROOT, "test/programs/mon3stub.asm"), { base: 0xc000 });
  rom = new Uint8Array(0x4000).fill(0xff);
  rom.set(stub.bytes.subarray(0, 0x4000));
});

/** A v2 CSD for a card of `blocks` blocks (a multiple of 1024). The model's
 *  own CSD is fixed at 16 MiB whatever the image. */
function csdFor(blocks) {
  const csd = new Array(16).fill(0);
  const size = blocks / 1024 - 1;
  csd[0] = 0x40;
  csd[1] = 0x0e;
  csd[5] = 0x5a;
  csd[7] = (size >> 16) & 0x3f;
  csd[8] = (size >> 8) & 0xff;
  csd[9] = size & 0xff;
  return csd;
}

/** The starter card's layout (tools/media.mjs: SYSTEM G1M on A, WORK G8M on B,
 *  written behind), then `free` blocks of C3h: 245,760 blocks in all, a card sold as 128 MB. */
function starterCard(free = 225280) {
  const container = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true },
  ]);
  const image = new Uint8Array(container.length + free * BLOCK).fill(0xc3);
  image.set(container);
  return { image, containerBlocks: container.length / BLOCK };
}

/**
 * A card image of `bytes` too large to hold: the container at its start,
 * other blocks C3h until written. With `wrap`, offsets past it land on
 * offset % wrap, as a fake card that ignores its high address bits.
 */
function sparseCard(container, bytes, wrap) {
  const pages = new Map();
  const at = (i) => (wrap ? i % wrap : i);
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
  return { image, untouched };
}

/** An SdSpi card on IMAGE whose CSD gives BLOCKS, recording each block written
 *  and read. */
function card(image, blocks, log) {
  const sd = new SdSpi({ image });
  sd.makeCsd = () => csdFor(blocks);
  const handle = sd.handleCommand.bind(sd);
  sd.handleCommand = (c) => {
    if (c.cmd === 24) log.writes.push(c.arg);
    if (c.cmd === 17) log.reads.push(c.arg);
    handle(c);
  };
  return sd;
}

/**
 * Run the program to its RST 00h. `cardOf()` makes a card (or null for none);
 * `answers` maps a prompt's words to the keys that answer it, each a code or
 * { key, before(m) }. KEYS is ended with AD; any other prompt not listed is
 * answered GO.
 */
function run({ cardOf = () => null, answers = {}, rtc = true, quick = true } = {}) {
  const log = { writes: [], reads: [] };
  const m = new Machine({ rom, symbols: new Map(), tms: true, matrix: true, rtc, clock: new Date(2026, 0, 1, 12, 0, 0) });
  m.newCard = () => (m.sd = cardOf(log));
  m.newCard();
  for (let i = 0; i < diag.image.length; i += 1) m.write(LOAD + i, diag.image[i]);
  if (quick) m.write(diag.symbols.get("QUICK"), 1);
  // The program asks on the LCD before it sends anything, then with "# " lines.
  const prompts = /^# (Fit the card|SD8 GO writes|SD9 pull|SD9 put|KEYS press|Done)/;
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

const SD_PULL = [{ key: GO, before: (m) => (m.sd = null) }];
const SD_BACK = [{ key: GO, before: (m) => m.newCard() }];

test("the build keeps code below 8000h and variables in 1000h-3FFFh", () => {
  const at = (n) => diag.symbols.get(n);
  assert.equal(at("START"), 0x4000);
  assert.ok(at("PROGEND") < 0x7fff, "code and tables below 7FFFh, with a spare byte for PROT");
  assert.ok(at("VARS") >= 0x1000 && at("VARSEND") <= 0x4000);
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
    answers: {
      "SD9 pull": SD_PULL,
      "SD9 put": SD_BACK,
      "KEYS press": [0x05, press(3, 4, true), 0xff, press(3, 4, false), 0xff, AD],
    },
  });
  assert.match(text, new RegExp(`^TEC1G-DIAG 1\\.0 image=${diag.id} bytes=${diag.bytes}\r\n`));
  const expect = {
    PASS: ["SD1", "SD2", "SD3", "SD4", "SD5", "SD6", "SD7", "SD8", "SD9", "RAM", "PROT", "SHAD", "CLK", "VDP", "LCD", "GLCD", "RTC", "KEYS"],
    // Debug80 delivers the PICO9918's frame interrupt as an NMI.
    SKIP: ["INT"],
  };
  for (const [status, ids] of Object.entries(expect)) for (const id of ids) assert.equal(lines.get(id)?.status, status, `${id} ${JSON.stringify(lines.get(id))}`);
  assert.match(text, /\r\nSUMMARY pass=18 warn=0 fail=0 skip=1\r\n/);
  // The answers the model gives, and the margins against TEC-OS's bounds.
  assert.match(lines.get("SD2").detail, /^err=0 cmd0=1\/10 cmd8=01 r7=000001AA acmd41=2\/256 ocr=C0000000 type=SDHC counted=0$/);
  assert.match(lines.get("SD3").detail, /^r1max=\d+\/16 tokmax=\d+\/65536 acmd41=2\/256 cmd0=1\/10 reads=64 err=0$/);
  assert.equal(fields(lines.get("SD4").detail).blocks, String(blocks));
  assert.equal(fields(lines.get("SD7").detail).free_from, String(containerBlocks));
  assert.equal(fields(lines.get("SD9").detail).out_read, "5", "a read with no card is SDECMD");
  assert.equal(fields(lines.get("SD9").detail).out_init, "1", "and SDINIT's CMD0 goes unanswered");
  assert.match(lines.get("CLK").detail, /^mhz=4\.00 /);
  assert.match(lines.get("VDP").detail, /^probe=ok frame=799\d\d hz=50\.0\d$/);
  assert.match(lines.get("RAM").detail, /exp0=ok exp1=ok distinct=yes$/);
  assert.match(lines.get("PROT").detail, / on=kept off=written$/);
  assert.equal(lines.get("SHAD").detail, "bit0=0:rom(0) bit0=1:ram(" + lines.get("SHAD").detail.match(/ram\((\d+)\)/)[1] + ") mon3on:rom(0)");
  assert.match(text, /# KEY pad=05\r\n/);
  assert.match(text, /# KEY matrix row=3 bit=4 code=28\r\n/);
  assert.equal(lines.get("KEYS").detail, "pad=1 matrix=1");
  // SD8: the card is byte-identical, and every write was after the container
  // and before the card's last block, never in blocks 0-7.
  assert.ok(Buffer.from(image).equals(Buffer.from(before)), "the card is unchanged");
  assert.equal(log.writes.length, 2 * Number(fields(lines.get("SD8").detail).blocks));
  for (const b of log.writes) assert.ok(b >= containerBlocks && b >= 8 && b < blocks - 1, `block ${b} written`);
  // MON3's state is back: the latch, its user vectors, and no unknown call.
  assert.equal(m.read(0x0880), 0x01, "the stub's latch copy");
  assert.equal(m.sysCtrl, 0x01, "the latch itself");
  assert.equal(m.read(0x0892) | m.read(0x0893) | m.read(0x0894) | m.read(0x0895), 0);
  assert.equal(m.read(0x0886), 0, "no MON3 call the stub lacks");
  assert.deepEqual(m.violations, []);
});

test("SDHC block numbers above 400000h work on a 4 GB card", SLOW, () => {
  const { image: container } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 7580 * 1024; // 3,974 MB: a card sold as 4 GB
  const sparse = sparseCard(container, blocks * BLOCK);
  const { lines, log } = run({ cardOf: (log) => card(sparse.image, blocks, log), answers: { "SD9 pull": SD_PULL, "SD9 put": SD_BACK } });
  for (const id of ["SD4", "SD5", "SD7", "SD8", "SD9"]) assert.equal(lines.get(id)?.status, "PASS", `${id} ${JSON.stringify(lines.get(id))}`);
  assert.match(lines.get("SD4").detail, /^blocks=7761920 mib=3790 class=4GB /);
  assert.equal(fields(lines.get("SD5").detail).last, String(blocks - 1));
  assert.ok(log.reads.includes(blocks - 1), "the last block read");
  assert.ok(log.writes.some((b) => b > 0x400000), "a block past 2 GiB written");
  assert.ok(log.writes.includes(blocks - 2), "the last free block written");
  assert.ok(sparse.untouched() && Buffer.from(container).equals(Buffer.from(before)), "the card is unchanged");
});

test("a card that wraps its high blocks onto block 0 fails SD8 as an alias, and block 0 is put back", SLOW, () => {
  const { image: container } = starterCard(0);
  const before = Uint8Array.from(container);
  const blocks = 7580 * 1024;
  const sparse = sparseCard(container, blocks * BLOCK, 1 << 30); // 1 GiB of real flash
  const { lines, text } = run({ cardOf: (log) => card(sparse.image, blocks, log), answers: { "SD9 pull": SD_PULL, "SD9 put": SD_BACK } });
  assert.equal(lines.get("SD8").status, "FAIL");
  assert.match(lines.get("SD8").detail, /^alias at=2097152 low=0 unrestored=none /);
  assert.match(text, /# SD8 block 2097152 pattern=ok restore=ok tries=1 busy=\d+ alias=0\r\n/);
  assert.ok(Buffer.from(container).equals(Buffer.from(before)), "blocks 0-7 and the container are as they were");
  assert.equal(lines.get("SD9").status, "PASS", "block 0 reads as before");
});

test("a card without a container fails SD7, and SD8 writes nothing", SLOW, () => {
  const image = new Uint8Array(32768 * BLOCK);
  const { lines, log } = run({ cardOf: (log) => card(image, 32768, log), answers: { "SD9 pull": SD_PULL, "SD9 put": SD_BACK } });
  assert.equal(lines.get("SD7").status, "FAIL");
  assert.equal(lines.get("SD7").detail, "code=21h reason=magic");
  assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=sd7" });
  assert.deepEqual(log.writes, []);
  assert.ok(image.every((b) => b === 0));
});

test("with no card SD2 fails with TEC-OS's SDENOCD and the other SD checks skip", SLOW, () => {
  const { lines } = run();
  assert.equal(lines.get("SD1").status, "PASS", "MISO idles high");
  assert.equal(lines.get("SD2").status, "FAIL");
  assert.match(lines.get("SD2").detail, /^err=1 cmd0=10\/10 /);
  for (const id of ["SD3", "SD4", "SD5", "SD6", "SD7", "SD8", "SD9"]) assert.deepEqual(lines.get(id), { status: "SKIP", detail: "reason=sd2" });
  assert.equal(lines.get("RAM").status, "PASS", "the other checks run");
});

test("AD at SD8's question writes nothing", SLOW, () => {
  const { image } = starterCard();
  const before = Uint8Array.from(image);
  const { lines, log } = run({ cardOf: (log) => card(image, image.length / BLOCK, log), answers: { "SD8 GO writes": [AD], "SD9 pull": [AD] } });
  assert.deepEqual(lines.get("SD8"), { status: "SKIP", detail: "reason=user" });
  assert.deepEqual(lines.get("SD9"), { status: "SKIP", detail: "reason=user" });
  assert.deepEqual(log.writes, []);
  assert.ok(Buffer.from(image).equals(Buffer.from(before)));
});

test("without an RTC SD6 reads between two beeps and CLK skips", SLOW, () => {
  const { image } = starterCard();
  const { m, lines } = run({ rtc: false, cardOf: (log) => card(image, image.length / BLOCK, log), answers: { "SD8 GO writes": [AD], "SD9 pull": [AD] } });
  assert.equal(lines.get("SD6").detail, "blocks=8 bytes=4096 timer=stopwatch");
  assert.equal(m.read(0x0885), 2, "two beeps");
  assert.deepEqual(lines.get("CLK"), { status: "SKIP", detail: "reason=nortc" });
  assert.deepEqual(lines.get("RTC"), { status: "SKIP", detail: "reason=absent" });
  assert.match(lines.get("VDP").detail, / at=4mhz$/);
});
