// The three paths: a recognised reset keeps the selected volumes, an unrecognised
// one takes the card's defaults, and an ordinary exit is warm boot. Recognition by
// each field, selection by each way a card can differ, the state a reset rebuilds,
// startup from the selected A:, and old RAM. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { Machine } from "./lib/machine.mjs";
import { ABI, ROOT, TEST_CLOCK, service, romFor, startupFile, volume } from "./lib/fixtures.mjs";
import { makeSvc } from "../tools/lib/svc.mjs";
import { createContainer, descriptorAt, headerChecksum, tableSum } from "../tools/lib/container.mjs";
import { format } from "../tools/lib/format.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const idx = (m) => Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d));
const lcdRow = (m, row) => String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(row * 20, row * 20 + 20)).trimEnd();
const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C and returns
const DEFAULTS = [1, 2, 0, 0];
const VOLUMES = [
  { geometry: "G1M", label: "SYSTEM", mount: "A" },
  { geometry: "G1M", label: "WORK", mount: "B" },
  { geometry: "G1M", label: "ALT", mount: "-" },
  { geometry: "G1M", label: "SPARE", mount: "-" },
];
const card = (vols = VOLUMES, opts) => createContainer(vols, opts);

const put16 = (b, at, v) => { b[at] = v & 0xff; b[at + 1] = v >> 8; };

/** OUT's table sum, if it has one, and header checksum made good for its N descriptors. */
function resum(out, n) {
  const h = format.header.fields;
  if (out[h.minor.offset]) put16(out, h.tableSum.offset, tableSum(out, n));
  put16(out, h.checksum.offset, headerChecksum(out.subarray(0, 512)));
  return out;
}
const count = (image) => image[format.header.fields.volumeCount.offset] | (image[format.header.fields.volumeCount.offset + 1] << 8);

/** IMAGE with descriptor I taken out, its neighbours' extents as they were. */
function without(image, i) {
  const out = Uint8Array.from(image);
  const n = count(out);
  for (let j = i; j < n - 1; j += 1) out.copyWithin(descriptorAt(j), descriptorAt(j + 1), descriptorAt(j + 1) + format.descriptor.bytes);
  out.fill(0, descriptorAt(n - 1), descriptorAt(n - 1) + format.descriptor.bytes);
  put16(out, format.header.fields.volumeCount.offset, n - 1);
  return resum(out, n - 1);
}

/** IMAGE with descriptor I's default drive MOUNT, which createContainer would refuse when it leaves no A:. */
function remount(image, i, mount) {
  const out = Uint8Array.from(image);
  out[descriptorAt(i) + format.descriptor.fields.mount.offset] = mount;
  return resum(out, count(out));
}

const warm = (m) => {
  const from = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(from)), 200_000_000, "warm boot");
};

/** Call ADDR from a stub in page zero, putting the machine back in its input loop. */
function callAt(m, addr, regs) {
  [0xcd, addr & 0xff, addr >> 8, 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
  const cpu = m.cpu.cpu;
  const saved = Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "sp", "pc"].map((r) => [r, cpu[r]]));
  const flags = { ...cpu.flags };
  Object.assign(cpu, regs, { sp: 0x0100, pc: 0x60 });
  m.runUntil(() => m.pc === 0x63, 80_000_000, "the call");
  const a = cpu.a;
  Object.assign(cpu, saved, { flags });
  return a;
}
/** The mount entry, as a program calls it: its BDOS call needs the program's exit after it. */
const volSvc = (m, a, c, e = 0) => {
  const r = callAt(m, m.sym("ABIVOL"), { a, c, e });
  warm(m);
  return r;
};
const mountOn = (m, drive, index) => volSvc(m, 0, drive, index);

function machine(image = card(), opts = {}) {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, ...opts });
  m.expect(/A>$/, { from: 0, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the first prompt");
  return m;
}
function reset(m) {
  const from = m.output.length;
  m.reset();
  m.expect(/A>$/, { from, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt after the reset");
  return m.text(from);
}
/** SYSTEM on A:, ALT on A: instead, and the default still on B:. */
function remapped(image = card(), opts) {
  const m = machine(image, opts);
  assert.equal(mountOn(m, 0, 2), 0);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
  return m;
}

test("a recognised reset keeps a remapped A:, the boot list and the LCD say so, and the TPA doesn't vary", () => {
  const m = remapped();
  const top = word(m, 6);
  const text = reset(m);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
  assert.match(text, /A: ALT/);
  assert.match(text, /B: WORK/);
  assert.doesNotMatch(text, /SYSTEM/);
  assert.match(lcdRow(m, 1), /^A: ALT/);
  assert.equal(word(m, 6), top);
  assert.match(m.command("DIR"), /NO FILE/, "ALT is read");
  assert.deepEqual(m.violations, []);
});

test("all four drives are kept: a remapped D:", () => {
  const vols = [VOLUMES[0], VOLUMES[1], { geometry: "G1M", label: "CEE", mount: "C" }, { geometry: "G1M", label: "DEE", mount: "D" }, { geometry: "G1M", label: "ALT", mount: "-" }];
  const m = machine(card(vols));
  assert.equal(mountOn(m, 3, 4), 0);
  reset(m);
  assert.deepEqual(idx(m), [1, 2, 3, 5]);
});

test("a selected volume of another geometry than the drive's default gets its own DPH", () => {
  const vols = [{ geometry: "G8M", label: "SYSTEM", mount: "A" }, VOLUMES[1], VOLUMES[2]];
  const image = card(vols);
  for (const v of ["SYSTEM", "ALT"]) volume(image, v).write("HELLO.TXT", new Uint8Array(128));
  const m = machine(image);
  const big = m.command("DIR");
  assert.equal(mountOn(m, 0, 2), 0);
  reset(m);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
  const small = m.command("DIR");
  assert.ok(Number(/(\d+)K free/.exec(small)[1]) < Number(/(\d+)K free/.exec(big)[1]) / 4, `${small} against ${big}`);
  assert.doesNotMatch(small, /Bad Sector/);
});

test("a drive other than A: selected with another geometry than its default's gets its own DPH", () => {
  const vols = [VOLUMES[0], { geometry: "G8M", label: "WORK", mount: "B" }, VOLUMES[2]];
  const image = card(vols);
  for (const v of ["WORK", "ALT"]) volume(image, v).write("HELLO.TXT", new Uint8Array(128));
  const m = machine(image);
  const big = m.command("DIR B:");
  assert.equal(mountOn(m, 1, 2), 0);
  reset(m);
  assert.deepEqual(idx(m), [1, 3, 0, 0]);
  const small = m.command("DIR B:");
  assert.match(small, /HELLO/);
  assert.ok(Number(/(\d+)K free/.exec(small)[1]) < Number(/(\d+)K free/.exec(big)[1]) / 4, `${small} against ${big}`);
  assert.doesNotMatch(small, /Bad Sector/);
});

test("a warm boot keeps the selection", () => {
  const m = remapped();
  warm(m);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
});

test("a drive unmounted before a reset stays so, and can be mounted after it", () => {
  const m = machine();
  assert.equal(volSvc(m, 1, 1), 0);
  assert.deepEqual(idx(m), [1, 0, 0, 0]);
  const top = word(m, 6);
  reset(m);
  assert.deepEqual(idx(m), [1, 0, 0, 0]);
  assert.equal(word(m, 6), top, "the slot is the card's");
  assert.equal(mountOn(m, 1, 1), 0);
  assert.match(m.command("DIR B:"), /NO FILE/);
});

// Each field of recognition wrong, by what it must refuse.
const S = (m) => word(m, m.sym("STUBAD"));
const FIELDS = {
  "(0000h)": (m) => m.write(0, 0xc9),
  "(0001h) low": (m) => m.write(1, m.read(1) ^ 1),
  "(0002h) high": (m) => m.write(2, m.read(2) ^ 1),
  "(0005h)": (m) => m.write(5, 0xc9),
  "the stub's JP": (m) => m.write(S(m), 0xc9),
  "the stub's target, low": (m) => m.write(S(m) + 1, m.read(S(m) + 1) ^ 1),
  "the stub's target, high": (m) => m.write(S(m) + 2, m.read(S(m) + 2) ^ 1),
  "W's low byte": (m) => m.write(6, 7),
  "W below 8000h": (m) => m.write(7, 0x7f),
  "W above S": (m) => {
    m.write(6, 0);
    m.write(7, (S(m) >> 8) + 1);
  },
};
for (const [name, spoil] of Object.entries(FIELDS)) {
  test(`recognition refuses ${name}`, () => {
    const m = remapped();
    spoil(m);
    reset(m);
    assert.deepEqual(idx(m), DEFAULTS);
  });
}

test("W at exactly 8000h and at S is recognised", () => {
  const m = remapped();
  m.write(6, 0);
  m.write(7, 0x80);
  reset(m);
  assert.deepEqual(idx(m), [3, 2, 0, 0], "8000h");
  m.write(7, S(m) >> 8);
  reset(m);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
});

test("a real service loaded is recognised, and is gone after the reset", async () => {
  const image = card();
  volume(image, "SYSTEM").write("RES.SVC", await service("res"));
  volume(image, "ALT").write("RES.SVC", await service("res"));
  const m = remapped(image);
  const top = word(m, 6);
  m.command("RES.SVC");
  assert.equal(word(m, 6), (top & 0xff00) - 0x100);
  reset(m);
  assert.deepEqual([idx(m), word(m, 6), m.read(m.sym("SVCHEAD")), word(m, m.sym("REGHEAD"))], [[3, 2, 0, 0], top, 0, 0]);
});

test("a hung INIT is recognised, W below PZTOP, and the reset recovers from it", async () => {
  const defs = { FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"HANG    "', RECNAME: '"HANG    "', RECVER: 1 };
  for (const v of ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO"]) defs[v] = 0;
  defs.V_HANG = 1;
  const { file } = await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc") });
  const image = card();
  volume(image, "ALT").write("HANG.SVC", file);
  const m = remapped(image);
  m.type("HANG.SVC\r");
  const end = m.cycles + 8_000_000;
  m.runUntil(() => m.cycles > end, 9_000_000, "the hang");
  assert.ok(word(m, 6) < word(m, m.sym("PZTOP")), "W is below PZTOP");
  assert.notEqual(m.read(m.sym("SVCBSY")), 0, "in INIT");
  reset(m);
  assert.deepEqual([idx(m), m.read(m.sym("SVCBSY"))], [[3, 2, 0, 0], 0]);
});

test("a card MOUNT refuses reaches DIAG, a retry uses the selection, and a reset at DIAG doesn't", () => {
  const good = card();
  const dead = Uint8Array.from(good);
  dead[0] ^= 0xff;
  const m = remapped(good);
  m.swapCard(dead);
  let from = m.output.length;
  m.reset();
  m.expect(/R retry, H header> $/, { from, maxCycles: 400_000_000 });
  m.swapCard(good);
  from = m.output.length;
  m.type("R");
  m.expect(/A>$/, { from, maxCycles: 400_000_000 });
  assert.deepEqual(idx(m), [3, 2, 0, 0], "the retry");

  const n = remapped(good);
  n.swapCard(dead);
  from = n.output.length;
  n.reset();
  n.expect(/R retry, H header> $/, { from, maxCycles: 400_000_000 });
  from = n.output.length;
  n.reset();
  n.expect(/R retry, H header> $/, { from, maxCycles: 400_000_000 });
  n.swapCard(good);
  from = n.output.length;
  n.type("R");
  n.expect(/A>$/, { from, maxCycles: 400_000_000 });
  assert.deepEqual(idx(n), DEFAULTS, "RAM with no PZINIT behind it is unrecognised");
});

const DIAGP = /R retry, H header> $/;
/** M, its selection made on GOOD, reset with BAD in, to DIAG's prompt. */
function toDiag(m, bad) {
  m.swapCard(bad);
  const from = m.output.length;
  m.reset();
  return m.expect(DIAGP, { from, maxCycles: 400_000_000 });
}
/** Type KEY at DIAG and wait for its prompt, or for A> with UNTIL. */
function atDiag(m, key, until = DIAGP) {
  const from = m.output.length;
  m.type(key);
  return m.expect(until, { from, maxCycles: 400_000_000 });
}

test("DIAG's retry uses the selection after the header dump and after a second failure", () => {
  const good = card();
  const dead = Uint8Array.from(good);
  dead[0] ^= 0xff;
  const m = remapped(good);
  toDiag(m, dead);
  const dump = atDiag(m, "H");
  assert.match(dump, /^H\r\n((?:[0-9A-F]{2} ){16}\r\n){4}R retry/, "the header dump");
  m.swapCard(good);
  atDiag(m, "R", /A>$/);
  assert.deepEqual(idx(m), [3, 2, 0, 0], "a retry after the header dump");

  const n = remapped(good);
  toDiag(n, dead);
  assert.match(atDiag(n, "R"), /error 21\r\nR retry/, "a second failure");
  n.swapCard(good);
  atDiag(n, "R", /A>$/);
  assert.deepEqual(idx(n), [3, 2, 0, 0], "a retry after a second failure");
});

test("a card with no default A: under a valid retained A: reaches DIAG, and a retry uses the selection", () => {
  // Two drives slotted, so that A: has a slot on either card and only MOUNT's refusal stands in the way.
  const good = card(VOLUMES, { drives: 2 });
  const noA = remount(good, 0, format.descriptor.unmounted);
  const m = remapped(good);
  m.swapCard(noA);
  const from = m.output.length;
  m.reset();
  const text = m.expect(new RegExp(`${DIAGP.source}|A>$`), { from, maxCycles: 400_000_000 });
  assert.match(text, /error 2A\r\nR retry, H header> $/, "MENOA, at DIAG");
  m.swapCard(good);
  atDiag(m, "R", /A>$/);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
});

test("an index moved by new volumes at lower starts is kept, and regenerated", () => {
  const big = card([VOLUMES[0], { geometry: "G1M", label: "NEW", mount: "-" }, ...VOLUMES.slice(1)]);
  const small = without(big, 1);
  const m = remapped(small);
  m.swapCard(big);
  reset(m);
  assert.deepEqual(idx(m), [4, 3, 0, 0]);
});

const SELECT = {
  "moved": (i) => without(card([VOLUMES[0], VOLUMES[1], { geometry: "G1M", label: "GAP", mount: "-" }, ...VOLUMES.slice(2)]), 2),
  "changed flags": () => card(VOLUMES.map((v) => (v.label === "ALT" ? { ...v, readOnly: true } : v))),
  "removed": () => without(card(), 2),
};
for (const [name, other] of Object.entries(SELECT)) {
  test(`a retained volume ${name} on the card gives the defaults whole`, () => {
    const m = remapped();
    const top = word(m, 6);
    m.swapCard(other());
    reset(m);
    assert.deepEqual(idx(m), DEFAULTS);
    assert.equal(word(m, 6), top);
    assert.match(m.command("DIR A:"), /NO FILE/);
  });
}

const entry = (m, d) => m.sym("DRVTAB") + d * 8;
const RETAINED = {
  "resized": (m) => m.write(entry(m, 0) + 4, m.read(entry(m, 0) + 4) ^ 0x10),
  "of another start": (m) => m.write(entry(m, 0) + 1, m.read(entry(m, 0) + 1) ^ 1),
  "of changed geometry": (m) => m.write(entry(m, 0) + 6, m.read(entry(m, 0) + 6) === 1 ? 2 : 1),
  "of changed flags": (m) => m.write(entry(m, 0) + 7, m.read(entry(m, 0) + 7) ^ 1),
  "duplicated in RSLBUF": (m) => { for (let i = 0; i < 8; i += 1) m.write(entry(m, 1) + i, m.read(entry(m, 0) + i)); },
  "absent from A:": (m) => m.write(entry(m, 0) + 6, 0),
  "on a drive with no slot": (m) => { for (let i = 0; i < 8; i += 1) m.write(entry(m, 2) + i, m.read(entry(m, 1) + i)); },
};
for (const [name, spoil] of Object.entries(RETAINED)) {
  test(`a retained drive ${name} gives the defaults whole`, () => {
    const m = remapped();
    spoil(m);
    reset(m);
    assert.deepEqual(idx(m), DEFAULTS);
    assert.deepEqual([0, 1].map((d) => m.read(entry(m, d) + 6) !== 0), [true, true]);
    assert.match(m.command("DIR B:"), /NO FILE/);
  });
}

test("a retained drive of geometry 0 is not retained, whatever its other bytes, and no volume is on two drives", () => {
  // B: as A: but for its geometry: what VCLEAR and UNMOUNT never leave, but a damaged DRVTAB that passes recognition can.
  const m = machine();
  for (let i = 0; i < 8; i += 1) m.write(entry(m, 1) + i, i === 6 ? 0 : m.read(entry(m, 0) + i));
  const text = reset(m);
  assert.deepEqual(idx(m), [1, 0, 0, 0]);
  assert.equal(m.read(entry(m, 1) + 6), 0, "B: empty");
  assert.equal(lineCount(text, "SYSTEM"), 1, text);
  assert.doesNotMatch(text, /B: /);
  assert.notEqual(mountOn(m, 1, 0), 0, "SYSTEM is on A: already");
  assert.equal(mountOn(m, 1, 1), 0);
  assert.match(m.command("DIR B:"), /NO FILE/);
});

test("a retained drive left with no slot on a card of identical extents gives the defaults whole", () => {
  // ALT a default on C: of the first card and not of the second, so that C: has a slot only on the first.
  const m = machine(card(VOLUMES.map((v) => (v.label === "ALT" ? { ...v, mount: "C" } : v))));
  assert.deepEqual(idx(m), [1, 2, 3, 0]);
  m.swapCard(card());
  reset(m);
  assert.equal(m.read(m.sym("DRVSLOT") + 2), 0, "C: has no slot");
  assert.deepEqual(idx(m), DEFAULTS);
  assert.match(m.command("DIR B:"), /NO FILE/);
});

test("a G8M volume kept on a drive whose slot is G1M's gives the defaults, and one that fits doesn't", () => {
  const vols = (b) => [VOLUMES[0], { geometry: b, label: "WORK", mount: "B" }, { geometry: "G8M", label: "BIGV", mount: "-" }];
  const keep = (m) => {
    // What VMNT would refuse on this card: BIGV's entry written to B: by hand.
    const a = descriptorAt(2);
    const f = format.descriptor.fields;
    const entryOf = [...m.sdImage.subarray(a + f.startBlock.offset, a + f.startBlock.offset + 4), ...m.sdImage.subarray(a + f.lengthBlocks.offset, a + f.lengthBlocks.offset + 2), m.sdImage[a + f.geometry.offset], 0];
    entryOf.forEach((v, i) => m.write(entry(m, 1) + i, v));
    m.write(m.sym("DRVIDX") + 1, 3);
  };
  const small = machine(card(vols("G1M")));
  keep(small);
  reset(small);
  assert.deepEqual(idx(small), DEFAULTS, "a G1M slot");
  const large = machine(card(vols("G8M")));
  keep(large);
  reset(large);
  assert.deepEqual(idx(large), [1, 3, 0, 0], "a G8M slot");
});

test("a failed read in step 1 leaves the defaults whole", () => {
  const vols = Array.from({ length: 20 }, (_, i) => ({ geometry: "G1M", label: `V${i}`, mount: i < 2 ? "AB"[i] : "-" }));
  const m = machine(card(vols));
  assert.equal(mountOn(m, 0, 17), 0);
  const step = m.step.bind(m);
  let armed = false;
  let failed = 0;
  m.step = () => {
    if (m.pc === m.sym("RESEL")) armed = true;
    if (armed && m.pc === m.sym("SDREAD")) {
      failed += 1;
      armed = false;
      m.cpu.cpu.a = 5;
      m.cpu.cpu.pc = m.sym("SDFAIL");
    }
    return step();
  };
  reset(m);
  assert.equal(failed, 1);
  assert.deepEqual(idx(m), DEFAULTS);
});

test("a card of 1.1 with drives keeps its selection, and each index past the first block", () => {
  const vols = Array.from({ length: 20 }, (_, i) => ({ geometry: "G1M", label: `V${i}`, mount: i < 2 ? "AB"[i] : "-" }));
  const m = machine(card(vols));
  assert.equal(mountOn(m, 0, 17), 0);
  reset(m);
  assert.deepEqual(idx(m), [18, 2, 0, 0]);
});

test("a written-behind volume keeps its flag through a reset", () => {
  const image = card([VOLUMES[0], { ...VOLUMES[1], writeBehind: true }, ...VOLUMES.slice(2)]);
  const m = machine(image);
  const flags = m.read(entry(m, 1) + 7);
  assert.notEqual(flags, 0);
  assert.equal(mountOn(m, 0, 2), 0);
  reset(m);
  assert.deepEqual(idx(m), [3, 2, 0, 0]);
  assert.equal(m.read(entry(m, 1) + 7), flags);
});

test("from user 5, a drive and a video console, a reset reaches A:, user 0, on serial", () => {
  const image = card();
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true });
  m.expect(/A>$/, { from: 0, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  m.command("USER 5");
  m.command("B:", { prompt: /\r\nB>$/ });
  m.write(3, 1);
  m.cpu.hardware.ioWrite(0xbf, 0xc0);
  m.cpu.hardware.ioWrite(0xbf, 0x81);
  const serial = m.serial.length;
  reset(m);
  assert.deepEqual([m.read(3), m.read(4), m.read(m.sym("CONMOD"))], [0, 0, 0], "IOBYTE, drive and user, console");
  assert.ok(m.serial.length > serial, "on serial");
  assert.match(m.serialText(serial), /A>$/);
});

test("a default drive beyond MNTDRV is refused with MEMOUNT", () => {
  const image = card(VOLUMES, { drives: 2 }); // tecvol refuses B: on a one-drive card; the header says 1 here
  image[format.header.fields.drives.offset] = 1;
  resum(image, VOLUMES.length);
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK });
  m.expect(/R retry, H header> $/, { from: 0, maxCycles: 400_000_000 });
  assert.match(m.text(0), /error 29/);
});

test("a default drive within MNTDRV boots", () => {
  assert.deepEqual(idx(machine(card(VOLUMES, { drives: 2 }))), DEFAULTS);
});

// Startup from the selected A:.
function startupCard(lines, more = {}) {
  const image = card();
  volume(image, "SYSTEM").write("STARTUP.CMD", startupFile("USER 9"));
  const a = volume(image, "ALT");
  a.write("STARTUP.CMD", startupFile(...lines));
  for (const [n, b] of Object.entries(more)) a.write(n, b);
  return image;
}
const lineCount = (text, line) => (text.match(new RegExp(line, "g")) ?? []).length;

test("startup runs once per reset from the selected A:, at user 0", () => {
  const m = remapped(startupCard(["USER 3"]));
  assert.equal(m.read(4) >> 4, 9, "the default A:'s file, at first");
  const text = reset(m);
  assert.equal(lineCount(text, "USER 3"), 1);
  assert.doesNotMatch(text, /USER 9/);
  assert.equal(m.read(4) >> 4, 3);
});

test("startup isn't reopened by a program's exit, ^C or a warm boot, and pending lines go on across an exit", () => {
  const m = remapped(startupCard(["SAY", "USER 3"], { "SAY.COM": SAY }));
  const text = reset(m);
  assert.equal(lineCount(text, "USER 3"), 1, "the line after the program's exit");
  m.command("SAY");
  warm(m);
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  assert.equal(lineCount(m.text(0), "USER 3"), 1 + 0);
  assert.equal(m.read(m.sym("STPOS")) >= 0x80, true);
});

test("startup is marked before it opens", () => {
  const m = remapped(startupCard(["USER 3"]));
  const step = m.step.bind(m);
  let seen = null;
  m.step = () => {
    if (seen === null && m.pc === m.sym("BDOS") && m.cpu.cpu.c === 15 && m.read(m.sym("STPOS")) !== 0) seen = m.read(m.sym("STPOS"));
    return step();
  };
  reset(m);
  assert.ok(typeof seen === "number" && seen >= 0x80, `STPOS at the open was ${seen}`);
});

test("a selected A: with no STARTUP.CMD reaches a serial prompt", () => {
  const image = card();
  volume(image, "SYSTEM").write("STARTUP.CMD", startupFile("USER 9"));
  const m = remapped(image);
  reset(m);
  assert.equal(m.read(4), 0);
  assert.match(m.command("DIR"), /NO FILE/);
});

test("an unreadable STARTUP.CMD on the selected A: leaves a prompt", () => {
  const image = startupCard(["USER 3"]);
  const m = remapped(image);
  const lba = Math.floor(Buffer.from(image.buffer, image.byteOffset, image.length).indexOf("USER 3\r\n\x1a") / 512);
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("SDREAD")) {
      const a = m.sym("SDLBA");
      if ((m.read(a) | (m.read(a + 1) << 8) | (m.read(a + 2) << 16)) === lba) m.cpu.cpu.pc = m.sym("SDRCMD");
    }
    return step();
  };
  const from = m.output.length;
  m.reset();
  for (let i = 0; i < 12 && !(m.ready() && /[A-P]>$/.test(m.text(from))); i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.ready() && /[A-P]>$/.test(m.text(from))), 40_000_000, "the error's key");
    if (m.waitingForInput() && !/[A-P]>$/.test(m.text(from))) m.type("\r");
  }
  assert.ok(m.ready() && /[A-P]>$/.test(m.text(from)));
  assert.match(m.text(from), /Bad Sector/);
  assert.doesNotMatch(m.text(from), /USER 3/);
  assert.equal(m.read(4), 0);
});

test("a held key skips startup on the selected A:", () => {
  const m = remapped(startupCard(["USER 3"]));
  const from = m.output.length;
  m.reset();
  m.tec1g.applyKeySilent(0x01, true);
  m.expect(/A>$/, { from, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt after the reset");
  const text = m.text(from);
  assert.doesNotMatch(text, /USER 3/);
  assert.equal(m.read(4) >> 4, 0);
  assert.deepEqual(idx(m), [3, 2, 0, 0], "the skip keeps the selection");
});

test("a dirty line with CFAIL set is not written to a card of identical extents after a reset", () => {
  const image = card([VOLUMES[0], { ...VOLUMES[1], writeBehind: true }, ...VOLUMES.slice(2)]);
  const m = machine(image);
  // A file written and not closed: what a program holds when the button goes.
  const fcb = 0x2000;
  [2, ...Buffer.from("Q       DAT"), ...new Array(24).fill(0)].forEach((v, i) => m.write(fcb + i, v));
  const bdos = (c, de) => callAt(m, 5, { c, d: de >> 8, e: de & 0xff });
  bdos(22, fcb);
  for (let i = 0; i < 128; i += 1) m.write(0x2100 + i, 0xc3);
  bdos(26, 0x2100);
  for (let r = 0; r < 4; r += 1) bdos(21, fcb);
  const lines = Array.from({ length: 30 }, (_, i) => i);
  m.cpu.hardware.ioWrite(0xff, 0x05);
  assert.ok(lines.some((i) => m.read(m.sym("CDIRTY") + i)), "a dirty line");
  m.cpu.hardware.ioWrite(0xff, 0x01);
  m.write(m.sym("CFAIL"), 1);
  const other = Uint8Array.from(image);
  const writes = [];
  m.swapCard(other, { onSdWrite: (lba) => writes.push(lba) });
  const copy = Uint8Array.from(other);
  reset(m);
  assert.deepEqual(writes, []);
  assert.deepEqual([...other].every((v, i) => v === copy[i]), true, "the card byte for byte");
  assert.doesNotMatch(m.text(0), /Write lost[\s\S]*Write lost[\s\S]*A>$/);
});

// RAM left by other ROMs. Each file is a real run's RAM with RES.SVC in, pinned by
// hash, gzipped: page zero, the workspace and everything else that ROM left.
const OLD_RAM = {
  "4b6877b": "5dc1bc2f5834d84b9411951baf445037a6828b0f6c4fc34af9aed89262357791",
  "dbdce5c": "9bf86c560ddba3314f7e1d16d721e0bdcea2d3db7ccde87268f3ed966c26bcfa",
};
for (const [name, sha] of Object.entries(OLD_RAM)) {
  test(`RAM from ${name}, a resident in, is unrecognised and nothing old runs`, () => {
    const image = gunzipSync(readFileSync(resolve(ROOT, `test/fixtures/ram/${name}.bin.gz`)));
    assert.equal(createHash("sha256").update(image).digest("hex"), sha, "the pinned image");
    const m = remapped();
    m.loadRam(image);
    const trace = m.traceToDecision(["RSLYES", "RSLNO"]);
    let verdict = null;
    const step = m.step.bind(m);
    m.step = () => {
      if (m.pc === m.sym("RSLNO")) verdict ??= "no";
      if (m.pc === m.sym("RSLYES")) verdict ??= "yes";
      return step();
    };
    reset(m);
    assert.equal(verdict, "no");
    assert.deepEqual(trace.writes, []);
    assert.ok(trace.lowPc >= 0xc000, `pc ${trace.lowPc.toString(16)}`);
    assert.deepEqual(idx(m), DEFAULTS);
    assert.equal(m.read(m.sym("SVCHEAD")), 0);
  });
}

/** A seeded generator, so that a failure comes back. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) & 0xff;
};

test("random RAM, 200 seeded runs: unrecognised, and each stops at the decision with nothing written", () => {
  const next = rng(0x4b53);
  const m = machine();
  const decide = [m.sym("RSLYES"), m.sym("RSLNO")];
  for (let run = 0; run < 200; run += 1) {
    const bytes = new Uint8Array(0x10000);
    for (let i = 0; i < 0xc000; i += 1) bytes[i] = next();
    m.loadRam(bytes);
    m.reset();
    m.runUntil(() => decide.includes(m.pc), 100_000, "the decision");
    assert.equal(m.pc, m.sym("RSLNO"), `run ${run}`);
  }
});

test("random RAM all the way to a prompt, 4 seeded runs, gives the defaults", () => {
  const next = rng(0x31);
  for (let run = 0; run < 4; run += 1) {
    const m = machine();
    const bytes = new Uint8Array(0x10000);
    for (let i = 0; i < 0xc000; i += 1) bytes[i] = next();
    m.loadRam(bytes);
    reset(m);
    assert.deepEqual(idx(m), DEFAULTS);
    assert.deepEqual(m.violations, []);
  }
});

test("a recognised image with a random DRVTAB, 24 seeded runs, boots with the defaults", () => {
  const next = rng(0x5a);
  const m = machine();
  for (let run = 0; run < 24; run += 1) {
    for (let i = 0; i < 32; i += 1) m.write(m.sym("DRVTAB") + i, next());
    reset(m);
    assert.deepEqual(idx(m), DEFAULTS, `run ${run}`);
  }
  assert.deepEqual(m.violations, []);
});

for (const [name, latch] of [["MAIN 1", 0x09], ["EXPAND 1", 0x05], ["both", 0x0d]]) {
  test(`BIOS function 0 with ${name} selected on the 96K option is recognised`, () => {
    const m = remapped(card(), { ram96: true });
    const from = m.output.length;
    m.cpu.hardware.ioWrite(0xff, latch);
    m.cpu.cpu.pc = m.sym("COLD");
    m.expect(/A>$/, { from, maxCycles: 400_000_000 });
    m.runUntil(() => m.ready(), 400_000_000, "the prompt");
    assert.deepEqual(idx(m), [3, 2, 0, 0]);
  });
}

for (const [name, spoil] of [["recognised", () => {}], ["unrecognised", (m) => m.write(0, 0)]]) {
  test(`${name}: only the ROM runs from COLD to MEMINIT, and nothing is written outside the boot stack before the decision`, () => {
    const m = remapped();
    spoil(m);
    const trace = m.traceToDecision(["RSLYES", "RSLNO"]);
    reset(m);
    assert.equal(trace.decided, true);
    assert.deepEqual(trace.writes, []);
    assert.ok(trace.lowPc >= 0xc000, `pc ${trace.lowPc.toString(16)}`);
  });
}

test("abi.inc is not moved: the hardware services and the table still read as ABI 4", () => {
  assert.equal(ABI.HWBASE, 19);
});
