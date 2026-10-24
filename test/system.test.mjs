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
  assert.equal(bdosVector & 0xff, 0x06);
  assert.equal(bdosVector, m.sym("BDOSSTB"));
  assert.equal(m.read(0), 0xc3);
  assert.equal((m.read(1) | (m.read(2) << 8)) - 3, m.sym("RAMBIOS"));
  assert.equal(m.read(0x66), 0xed);
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
  assert.match(m.command("DIR"), /U3\s+COM/);
  m.command("USER 0");
  assert.match(m.command("DIR"), /NO FILE/);
  noViolations(m);
});

test("without a card the diagnostic console reports and retries", () => {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols });
  assert.match(m.expect(/R retry, H header> $/, { from: 0, maxCycles: 80_000_000 }), /error 01/);
  m.type("R");
  assert.match(m.expect(/R retry, H header> $/), /error 01/);
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
    const text = m.expect(/R retry, H header> $/, { from: 0, maxCycles: 80_000_000 });
    assert.match(text, new RegExp(`error ${code}`), name);
  }
});

test("a standard-capacity card (byte addressing) works", () => {
  const m = boot(standardCard(), { highCapacity: false });
  m.command("SAVE 3 SC.COM");
  assert.match(m.command("DIR"), /SC\s+COM/);
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
  assert.match(dir, /NOTES\s+OLD/);
  assert.doesNotMatch(dir, /COPY\s+COM/);
  assert.match(m.command("TYPE NOTES.OLD"), /Second line/);

  const b = volume(image, "B");
  assert.deepEqual(b.read("PATTERN.CPY").subarray(0, binary.length), binary);
  assert.deepEqual(volume(image, "A").read("MEM.BIN"), ram);
  assert.equal(Buffer.from(volume(image, "A").read("NOTES.OLD", { text: true })).toString(), "First line\nSecond line\n");
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
