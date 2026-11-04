// TEC-OS on the Debug80 TEC-1G model: boot, reset, diagnostics, the CCP,
// BDOS file functions and exchange with the PC tools. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { boot, program, romFor, standardCard, volume } from "./lib/fixtures.mjs";
import { createContainer, headerChecksum } from "../tools/lib/container.mjs";
import { format } from "../tools/lib/format.mjs";

const SLOW = { timeout: 900_000 };

function noViolations(m) {
  assert.deepEqual(m.violations, [], "no writes to ROM or under the boot overlay");
}

test("cold boot leaves the overlay off, the classic bank selected and the CCP prompting", () => {
  const m = boot(standardCard(), { ramFill: 0x76 });
  assert.match(m.bootText, /TEC-OS \d+\.\d+ for TEC-1G\r\nA: SYSTEM\s+\r\nB: WORK\s+\r\n\r\nA>$/);
  assert.equal(m.sysCtrl, 0x01);
  assert.equal(m.physicalBank, -1);
  const bdosVector = m.read(6) | (m.read(7) << 8);
  assert.equal(bdosVector, m.read(m.sym("STUBAD")) | (m.read(m.sym("STUBAD") + 1) << 8));
  assert.equal(bdosVector, 0xba03, "the starter card's BDOS entry");
  assert.equal(m.read(0), 0xc3);
  assert.equal((m.read(1) | (m.read(2) << 8)) - 3, m.sym("RAMBIOS"));
  assert.equal(m.sym("RAMBIOS"), 0xbf00, "the RAM BIOS table is in the top page");
  noViolations(m);
});

test("reset from a non-default bank and a dirty latch boots cleanly, repeatedly", () => {
  const m = boot(standardCard());
  for (const latch of [0x0d, 0x45, 0x7f, 0x83]) {
    m.tec1g.ioHandlers.write(0xff, latch);
    m.reset();
    assert.match(m.expect(/A>$/, { maxCycles: 80_000_000 }), /TEC-OS/);
    assert.equal(m.sysCtrl, 0x01);
  }
  noViolations(m);
});

test("warm boot by ^C keeps the drive and user number", () => {
  const m = boot(standardCard());
  m.command("B:");
  m.command("USER 3");
  m.command("SAVE 1 U3.COM");
  m.type("\x03");
  m.expect(/B>$/);
  assert.match(m.command("DIR"), /U3\.COM/);
  m.command("USER 0");
  assert.match(m.command("DIR"), /NO FILE/);
  noViolations(m);
});

test("warm boot clears the restart vectors except jumps into ROM, and a stale RST returns", () => {
  // SETV leaves 0008h jumping into the TPA, 0010h jumping into ROM (the
  // hardware services' entry in the table)
  const HW = romFor().symbols.get("ABICALL");
  // and stray bytes in the tail of 0018h, then ends with JP 0000h.
  const set = { 0x08: [0xc3, 0x08, 0x40], 0x10: [0xc3, HW & 0xff, HW >> 8], 0x1b: [0xc3, 0x00, 0x40] };
  const code = Object.entries(set).flatMap(([at, bytes]) =>
    bytes.flatMap((b, i) => [0x3e, b, 0x32, (Number(at) + i) & 0xff, 0x00]),
  );
  const image = standardCard();
  const a = volume(image, "A");
  a.write("SETV.COM", new Uint8Array([...code, 0xc3, 0x00, 0x00]));
  for (const v of [0x08, 0x10, 0x18]) a.write(`RST${v.toString(16).padStart(2, "0")}.COM`, new Uint8Array([0xc7 | v, 0xc9]));
  const m = boot(image);
  m.command("SETV");
  const want = new Array(0x30).fill(0);
  for (let v = 0x08; v < 0x38; v += 8) want[v - 0x08 + 7] = 0xc9;
  want.splice(0x10 - 0x08, 8, 0xc3, HW & 0xff, HW >> 8, 0, 0, 0, 0, 0);
  assert.deepEqual(Array.from({ length: 0x30 }, (_, i) => m.read(0x08 + i)), want, "0008h-0037h after the warm boot");
  for (const v of [0x08, 0x18]) {
    m.type(`RST${v.toString(16).padStart(2, "0")}\r`);
    m.runUntil(() => m.pc === 0x0101 || m.pc === 0x4000 + v || m.pc === 0x4000, 50_000_000, `RST ${v.toString(16)}h`);
    assert.equal(m.pc, 0x0101, `RST ${v.toString(16)}h returns to its caller`);
    m.expect(/\r\nA>$/);
  }
  m.type("RST10\r");
  m.runUntil(() => m.pc === HW || m.pc === 0x0101, 50_000_000, "RST 10h");
  assert.equal(m.pc, HW, "the kept jump into ROM is taken");
  noViolations(m);
});

test("a clean boot's restart vectors are the defaults, and 0038h is EI; RETI", () => {
  const m = boot(standardCard());
  const want = new Array(0x30).fill(0);
  for (let v = 0; v < 0x30; v += 8) want[v + 7] = 0xc9;
  want.push(0xfb, 0xed, 0x4d, 0, 0, 0, 0, 0);
  assert.deepEqual(Array.from({ length: 0x38 }, (_, i) => m.read(0x08 + i)), want);
});

test("without a card the diagnostic console reports and retries", () => {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols });
  assert.match(m.expect(/R retry> $/, { from: 0, maxCycles: 80_000_000 }), /error 01/);
  m.type("R");
  assert.match(m.expect(/R retry> $/), /error 01/);
});

test("without RAM at 8000h-BFFFh the boot says so on the serial console and stops", () => {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: standardCard(), windowRam: false });
  m.runUntil(() => m.pc === m.sym("RAMSTOP"), 20_000_000, "RAMSTOP");
  const stop = m.cycles + 2_000_000;
  m.runUntil(() => m.cycles >= stop);
  assert.equal(m.serialText(), "\r\nTEC-OS needs 64K RAM\r\n");
  assert.equal(m.pc, m.sym("RAMSTOP"));
});

test("the ROM rejects an invalid container before mounting anything", () => {
  const cases = [
    ["checksum", (b) => (b[200] ^= 1), "25"],
    ["magic", (b) => (b[0] = 0x58), "21"],
    [
      "overlap",
      (b) => {
        const d1 = format.header.descriptorsOffset + format.descriptor.bytes;
        b.set(b.subarray(format.header.descriptorsOffset + 4, format.header.descriptorsOffset + 8), d1 + 4);
        b[d1 + 12] = 2;
        b[d1 + 8] = 0;
        b[d1 + 9] = 8;
        const sum = headerChecksum(b);
        b[20] = sum & 0xff;
        b[21] = sum >> 8;
      },
      "28",
    ],
  ];
  for (const [name, corrupt, code] of cases) {
    const image = createContainer([
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G1M", label: "WORK", mount: "B" },
    ]);
    corrupt(image);
    const { rom, symbols } = romFor();
    const m = new Machine({ rom, symbols, sdImage: image });
    const text = m.expect(/R retry> $/, { from: 0, maxCycles: 80_000_000 });
    assert.match(text, new RegExp(`error ${code}`), name);
  }
});

test("a standard-capacity card (byte addressing) works", () => {
  const m = boot(standardCard(), { highCapacity: false });
  m.command("SAVE 3 SC.COM");
  assert.match(m.command("DIR"), /SC\.COM/);
  noViolations(m);
});

test("BDOS file functions pass the probe", SLOW, async () => {
  const image = standardCard();
  volume(image, "A").write("PROBE.COM", (await program("probe")).bytes);
  const m = boot(image);
  const out = m.command("PROBE", { maxCycles: 2_000_000_000 });
  assert.match(out, /DONE/);
  const results = out.match(/T\d\d (ok|FAIL)/g);
  assert.equal(results.length, 16);
  assert.deepEqual(results.filter((r) => r.endsWith("FAIL")), []);
  assert.deepEqual(volume(image, "A").verify(), []);
  assert.deepEqual(volume(image, "B").verify(), []);
  noViolations(m);
});

const G1M = (mount, label) => ({ geometry: "G1M", label, mount });
const G8M = (mount, label) => ({ geometry: "G8M", label, mount });
const CARDS = [
  { name: "the starter card", volumes: [G1M("A", "SYSTEM"), G8M("B", "WORK")], entry: 0xba03 },
  { name: "the starter card with C:", volumes: [G1M("A", "SYSTEM"), G8M("B", "WORK"), G1M("C", "MORE")], entry: 0xb9c3 },
  { name: "four 8 MiB volumes", volumes: ["A", "B", "C", "D"].map((d) => G8M(d, `VOL${d}`)), entry: 0xb743 },
];
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

test("cold boot packs each drive's allocation vector, DSM / 8 + 1 bytes, below the workspace and puts the BDOS entry below them", () => {
  for (const card of CARDS) {
    const m = boot(createContainer(card.volumes));
    const entry = word(m, 6);
    assert.equal(entry, card.entry, card.name);
    assert.equal(m.read(entry), 0xc3, `${card.name}: JP at the entry`);
    assert.equal(word(m, entry + 1), m.sym("BENTRY"));
    let end = m.sym("WSBASE");
    card.volumes.forEach((_, d) => {
      const dph = m.sym("DPHTAB") + 16 * d;
      const dsm = word(m, word(m, dph + 10) + 5);
      const alv = word(m, dph + 14);
      assert.equal(alv, end - ((dsm >> 3) + 1), `${card.name}: drive ${d}'s vector ends where the one above starts`);
      end = alv;
    });
    assert.ok(entry + 3 <= end, `${card.name}: the entry jump is below every vector`);
    assert.ok(entry - 6 >= 0x100, `${card.name}: the six bytes below the entry are in the TPA`);
    const page = entry >> 8;
    m.write(0x0100, 0xc9); // TOP.COM returns at once: the rest is whatever cold boot left
    assert.doesNotMatch(m.command(`SAVE ${page - 1} TOP.COM`), /\?/, `${card.name}: SAVE up to the entry's page`);
    assert.match(m.command(`SAVE ${page} OVER.COM`), /\r\n\d+\?\r\n/, `${card.name}: SAVE of the entry's page refused`);
    m.command("TOP");
    noViolations(m);
  }
});

test("on a card of four 8 MiB volumes the BDOS probe passes", SLOW, async () => {
  const image = createContainer(CARDS[2].volumes);
  volume(image, "A").write("PROBE.COM", (await program("probe")).bytes);
  const m = boot(image);
  const out = m.command("PROBE", { maxCycles: 2_000_000_000 });
  const results = out.match(/T\d\d (ok|FAIL)/g);
  assert.equal(results.length, 16);
  assert.deepEqual(results.filter((r) => r.endsWith("FAIL")), []);
  m.command("D:", { prompt: /\r\nD>$/ });
  m.command("SAVE 2 X.COM", { prompt: /\r\nD>$/ });
  assert.match(m.command("DIR", { prompt: /\r\nD>$/ }), /X\.COM/);
  for (const d of ["A", "B", "C", "D"]) assert.deepEqual(volume(image, d).verify(), []);
  noViolations(m);
});

test("DIR with only a drive lists that drive, and SAVE writes to a drive named", () => {
  const image = standardCard();
  volume(image, "B").write("PC.DAT", new Uint8Array(128));
  const m = boot(image);
  assert.match(m.command("DIR B:"), /PC\.DAT/, "a file the PC put on B:");
  m.command("SAVE 2 B:X.COM");
  assert.match(m.command("DIR B:"), /PC\.DAT\s+X\.COM/);
  assert.match(m.command("DIR B:*.COM"), /X\.COM/);
  assert.match(m.command("DIR"), /NO FILE/, "A: is untouched");
  assert.equal(volume(image, "B").read("X.COM").length, 512);
  noViolations(m);
});

test("text and binary files cross between the PC and TEC-OS, and survive power loss", SLOW, async () => {
  const image = standardCard();
  const a = volume(image, "A");
  const binary = new Uint8Array(5000).map((_, i) => (i * 37 + 11) & 0xff);
  a.write("COPY.COM", (await program("copy")).bytes);
  a.write("NOTES.TXT", Buffer.from("First line\nSecond line\n"), { text: true });
  a.write("PATTERN.BIN", binary);
  let m = boot(image);
  assert.match(m.command("TYPE NOTES.TXT"), /First line\r\nSecond line\r\n/);
  assert.match(m.command("COPY PATTERN.BIN B:PATTERN.CPY", { maxCycles: 400_000_000 }), /COPIED 0028/);
  m.command("SAVE 2 MEM.BIN");
  const ram = Uint8Array.from({ length: 512 }, (_, i) => m.read(0x100 + i));
  m.command("REN NOTES.OLD=NOTES.TXT");
  m.command("ERA COPY.COM");
  noViolations(m);

  // Power cycle: new RAM full of HALT opcodes, same card.
  m = boot(image, { ramFill: 0x76 });
  const dir = m.command("DIR");
  assert.match(dir, /NOTES\.OLD/);
  assert.doesNotMatch(dir, /COPY\.COM/);
  assert.match(m.command("TYPE NOTES.OLD"), /Second line/);

  const b = volume(image, "B");
  assert.deepEqual(b.read("PATTERN.CPY").subarray(0, binary.length), binary);
  assert.deepEqual(volume(image, "A").read("MEM.BIN"), ram);
  assert.equal(Buffer.from(volume(image, "A").read("NOTES.OLD", { text: true })).toString(), "First line\nSecond line\n");
  noViolations(m);
});

test("files over 16 KiB cross between TEC-OS and the PC on a volume whose entries hold two extents", SLOW, async () => {
  // B: is G8M: 4 KiB blocks, extent mask 1, so one directory entry holds 32 KiB.
  const data = new Uint8Array(40064).map((_, i) => (i * 7 + (i >> 7)) & 0xff);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("COPY.COM", (await program("copy")).bytes);
  a.write("DATA.BIN", data);
  volume(image, "B").write("PC.BIN", data);
  const m = boot(image);
  assert.match(m.command("COPY DATA.BIN B:TEC.BIN", { maxCycles: 4_000_000_000 }), /COPIED 0139/);
  assert.match(m.command("COPY B:PC.BIN A:BACK.BIN", { maxCycles: 4_000_000_000 }), /COPIED 0139/);
  assert.ok(Buffer.from(volume(image, "B").read("TEC.BIN")).equals(Buffer.from(data)), "TEC-OS's file on B: read on the PC");
  assert.ok(Buffer.from(volume(image, "A").read("BACK.BIN")).equals(Buffer.from(data)), "the PC's file on B: read by TEC-OS");
  for (const d of ["A", "B"]) assert.deepEqual(volume(image, d).verify(), [], `${d}: verifies`);
  noViolations(m);
});

/** Call BDOS function c from the prompt with DE, returning A; the FCB is at 1000h, the DMA record at 2000h. */
function bdosCall(m, c, de = 0) {
  const cpu = m.cpu.cpu;
  const saved = { pc: cpu.pc, sp: cpu.sp };
  m.write(0x0efe, 0x00);
  m.write(0x0eff, 0x0f);
  Object.assign(cpu, { c, d: de >> 8, e: de & 0xff, sp: 0x0efe, pc: 0x0005 });
  m.runUntil(() => m.pc === 0x0f00, 400_000_000, `BDOS ${c}`);
  const a = cpu.a;
  Object.assign(cpu, saved);
  return a;
}

test("sparse files and a block written after a reopen survive on both volumes", SLOW, () => {
  // Record r carries r in its first two bytes, so a record read from the
  // wrong place shows. A: has an extent mask of 0, B: of 1.
  const rec = (r) => Uint8Array.from({ length: 128 }, (_, k) => (k < 2 ? (r >> (8 * k)) & 0xff : (r * 131 + k * 7) & 0xff));
  const FCB = 0x1000;
  const DMA = 0x2000;
  const image = standardCard();
  const m = boot(image);
  const fcb = (drive, name) => {
    [drive, ...Buffer.from(name.padEnd(11))].forEach((b, i) => m.write(FCB + i, b));
    for (let i = 12; i < 36; i += 1) m.write(FCB + i, 0);
  };
  const setR = (r) => [r & 0xff, r >> 8, 0].forEach((b, i) => m.write(FCB + 33 + i, b));
  const fill = (r) => rec(r).forEach((b, k) => m.write(DMA + k, b));
  const holds = (r) => rec(r).every((b, k) => m.read(DMA + k) === b);
  bdosCall(m, 26, DMA);
  for (const [drive, d] of [[1, "A"], [2, "B"]]) {
    // Sparse: random writes in no order, with holes.
    const sparse = [300, 10, 200, 140, 70];
    fcb(drive, "SPARSE  DAT");
    bdosCall(m, 22, FCB);
    for (const r of sparse) {
      setR(r);
      fill(r);
      assert.equal(bdosCall(m, 34, FCB), 0, `${d}: write record ${r}`);
    }
    bdosCall(m, 16, FCB);
    // KE-36: a block written through a reopened FCB, then a sequential read
    // across the extent boundary before the close.
    fcb(drive, "REOPEN  DAT");
    bdosCall(m, 22, FCB);
    for (const r of [127, 200]) {
      setR(r);
      fill(r);
      bdosCall(m, 34, FCB);
    }
    bdosCall(m, 16, FCB);
    fcb(drive, "REOPEN  DAT");
    bdosCall(m, 15, FCB);
    setR(40);
    fill(40);
    bdosCall(m, 34, FCB);
    setR(126);
    bdosCall(m, 33, FCB);
    for (let i = 0; i < 3; i += 1) bdosCall(m, 20, FCB);
    bdosCall(m, 16, FCB);
    // Exactly 16 KiB and 32 KiB, sequentially.
    for (const [name, n] of [["K16     DAT", 128], ["K32     DAT", 256]]) {
      fcb(drive, name);
      bdosCall(m, 22, FCB);
      for (let r = 0; r < n; r += 1) {
        fill(r);
        bdosCall(m, 21, FCB);
      }
      bdosCall(m, 16, FCB);
    }
    // Read back on TEC-OS.
    for (const [name, records] of [["SPARSE  DAT", sparse], ["REOPEN  DAT", [40, 127, 200]]]) {
      fcb(drive, name);
      bdosCall(m, 15, FCB);
      for (const r of records) {
        setR(r);
        assert.equal(bdosCall(m, 33, FCB), 0, `${d}:${name.trim()} record ${r} on TEC-OS`);
        assert.ok(holds(r), `${d}:${name.trim()} record ${r} on TEC-OS`);
      }
    }
    // And on the PC.
    const v = volume(image, d);
    assert.deepEqual(v.verify(), [], `${d}: verifies`);
    for (const [name, records] of [["SPARSE.DAT", sparse], ["REOPEN.DAT", [40, 127, 200]], ["K16.DAT", [...Array(128).keys()]], ["K32.DAT", [...Array(256).keys()]]]) {
      const bytes = v.read(name);
      for (const r of records) assert.ok(Buffer.from(bytes.subarray(r * 128, r * 128 + 128)).equals(Buffer.from(rec(r))), `${d}:${name} record ${r} on the PC`);
    }
    assert.equal(v.read("K16.DAT").length, 16384);
    assert.equal(v.read("K32.DAT").length, 32768);
  }
  noViolations(m);
});

test("a read-only volume refuses writes without changing it", () => {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  const before = Buffer.from(image);
  const m = boot(image);
  assert.match(m.bootText, /C: ARCHIVE\s+\(read-only\)/);
  m.mark = m.output.length;
  m.type("SAVE 1 C:X.COM\r");
  assert.match(m.expect(/Bdos Err On C:.*$/), /Bdos Err On C/);
  assert.ok(Buffer.from(image).equals(before), "card unchanged");
});
