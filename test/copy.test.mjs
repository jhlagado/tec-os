// The CCP's COPY: to a drive alone, never onto itself, and as COPY.COM in
// every other case (KS23, KG26 and KG12). Each run starts from a fresh card:
// SYSTEM on A:, WORK on B: written behind as on the starter card, ARCHIVE on
// C:, read-only. The TPA is filled with a pattern before the command and must
// hold it; then ^C warm boots, so B:'s lines reach the card, before the card
// is read. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createContainer } from "../tools/lib/container.mjs";
import { boot, program, volume } from "./lib/fixtures.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const pattern = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed * 31 + (i >> 7)) & 0xff);
const TPA = [0x0100, 0xb406];
const tpaByte = (a) => (a * 13 + (a >> 8) * 7 + 0x5a) & 0xff;
const SIZES = [0, 1, 128, 157, 300];
const copyCom = (await program("copy")).bytes;

function card() {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true },
    { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
  ]);
  const a = volume(image, "A");
  const b = volume(image, "B");
  a.write("X.COM", pattern(3000, 1));
  a.write("X.DAT", pattern(1500, 2));
  a.write("S.DAT", pattern(900, 7), { system: true });
  a.write("R.DAT", pattern(700, 8), { readOnly: true });
  a.write("X.DAT", pattern(1100, 9), { user: 1 });
  b.write("X.COM", pattern(2600, 3));
  b.write("X.DAT", pattern(1300, 4));
  for (const d of ["A", "B"]) for (const n of SIZES) volume(image, d).write(`S${n}.DAT`, pattern(n * 128, n + d.charCodeAt(0)));
  b.write("E157.DAT", pattern(300 * 128, 99));
  a.write("XCOPY.COM", copyCom);
  return image;
}

/** LINE's output: the lines after its own, without the next prompt. */
function run(m, line) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  const prompt = /\r\n\d*[A-P]>$/;
  m.runUntil(() => m.waitingForInput(), 4_000_000_000, line);
  if (!prompt.test(m.text(m.mark))) {
    m.type("\r"); // a BDOS error waits for a key before its warm boot
    m.runUntil(() => m.waitingForInput() && prompt.test(m.text(m.mark)), 400_000_000, `${line} after the error`);
  }
  const lines = m.text(m.mark).replace(/\r\n\d*[A-P]>$/, "").split(/\r*\n/);
  const at = lines.findIndex((l) => l.endsWith(line.replace(/\x03/g, "")));
  return lines.slice(at + 1).join("\n").trim();
}

/** On a fresh card: the SETUP lines, then LINE with the TPA watched, then ^C. */
function trial(line, setup = []) {
  const image = card();
  const m = boot(image);
  for (const s of setup) run(m, s);
  const before = sha(image);
  for (let a = TPA[0]; a < TPA[1]; a += 1) m.write(a, tpaByte(a));
  const text = run(m, line);
  let tpaChanged = 0;
  for (let a = TPA[0]; a < TPA[1]; a += 1) if (m.read(a) !== tpaByte(a)) tpaChanged += 1;
  run(m, "\x03");
  assert.deepEqual(m.violations, []);
  return { image, text, tpaChanged, unchanged: sha(image) === before };
}

const read = (image, d, n, user = 0) => Buffer.from(volume(image, d).read(n, { user }));

for (const [line, from, to, full] of [
  ["COPY X.COM B:", ["A", "X.COM"], ["B", "X.COM"], "COPY X.COM B:X.COM"],
  ["COPY B:X.COM A:", ["B", "X.COM"], ["A", "X.COM"], "COPY B:X.COM A:X.COM"],
  ["COPY X.COM B:.TXT", ["A", "X.COM"], ["B", "X.COM"], "COPY X.COM B:X.COM"],
  ["COPY X.COM B:.*", ["A", "X.COM"], ["B", "X.COM"], "COPY X.COM B:X.COM"],
])
  test(`${line} copies under the source's name, as ${full} does`, () => {
    const t = trial(line);
    const ref = trial(full);
    assert.match(t.text, /^COPIED [0-9A-F]{4}$/);
    assert.equal(t.text, ref.text);
    assert.deepEqual(read(t.image, ...to), read(card(), ...from), "byte for byte");
    assert.equal(sha(t.image), sha(ref.image), "the card as the full name leaves it");
    assert.equal(t.tpaChanged, 0, "the TPA kept");
  });

for (const [name, line, setup] of [
  ["onto itself", "COPY X.DAT X.DAT"],
  ["onto itself, the destination's drive named", "COPY X.DAT A:X.DAT"],
  ["onto itself, the source's drive named", "COPY A:X.DAT X.DAT"],
  ["onto its own drive alone", "COPY X.DAT A:"],
  ["with no destination", "COPY X.DAT"],
  ["onto itself, marked SYS", "COPY S.DAT S.DAT"],
  ["onto itself, marked R/O", "COPY R.DAT R.DAT"],
  ["onto itself on B:, written behind", "COPY B:X.DAT X.DAT", ["B:"]],
  ["onto itself in user 1", "COPY X.DAT A:X.DAT", ["USER 1"]],
  ["with text after the destination (KE-179)", "COPY X.DAT B:X.DAT JUNK"],
  ["with a third name after the destination (KE-179)", "COPY X.DAT B:Y.DAT Z.DAT"],
])
  test(`COPY ${name} is a bad command and leaves the card as it was`, () => {
    const t = trial(line, setup);
    assert.equal(t.text, "COPY?");
    assert.ok(t.unchanged, "the card byte for byte, after ^C");
    assert.equal(t.tpaChanged, 0, "the TPA kept");
  });

for (const [line, setup, from, to] of [
  ["COPY X.DAT B:X.DAT", [], ["A", "X.DAT"], ["B", "X.DAT"]],
  ["COPY A:X.DAT X.DAT", ["B:"], ["A", "X.DAT"], ["B", "X.DAT"]],
])
  test(`${line}${setup.length ? " on B:" : " on A:"} still copies`, () => {
    const t = trial(line, setup);
    assert.equal(t.text, "COPIED 000C");
    assert.deepEqual(read(t.image, ...to), read(t.image, ...from));
    assert.equal(t.tpaChanged, 0, "the TPA kept");
  });

test("after B: and A:, a plain name is on A: again: a copy works, and one onto itself is refused", () => {
  const t = trial("COPY X.DAT Y.DAT", ["B:", "A:"]);
  assert.equal(t.text, "COPIED 000C");
  assert.deepEqual(read(t.image, "A", "Y.DAT"), read(t.image, "A", "X.DAT"), "A:Y.DAT made from A:X.DAT");
  assert.throws(() => volume(t.image, "B").read("Y.DAT"), /not found/, "nothing made on B:");
  const u = trial("COPY X.DAT X.DAT", ["B:", "A:"]);
  assert.equal(u.text, "COPY?");
  assert.ok(u.unchanged, "the card byte for byte");
});

for (const [line, to] of [
  ["COPY X.DAT X.DAQ", "X.DAQ"], // only the type's last byte differs
  ["COPY X.DAT Y.DAT", "Y.DAT"], // only the name's first byte
])
  test(`${line} copies: the names differ in one byte`, () => {
    const t = trial(line);
    assert.equal(t.text, "COPIED 000C");
    assert.deepEqual(read(t.image, "A", to), read(t.image, "A", "X.DAT"));
  });

test("every other case leaves the card and prints as COPY.COM does, with the TPA kept", () => {
  const cases = [];
  for (const n of SIZES) cases.push(`S${n}.DAT D${n}.DAT`, `S${n}.DAT B:D${n}.DAT`, `B:S${n}.DAT A:D${n}.DAT`);
  cases.push("S157.DAT B:E157.DAT", "NONE.DAT D.DAT", "S1.DAT C:D1.DAT");
  assert.equal(cases.length, 18);
  for (const args of cases) {
    const b = trial(`COPY ${args}`);
    const c = trial(`XCOPY ${args}`);
    assert.equal(b.text, c.text, `COPY ${args}: the text`);
    assert.equal(sha(b.image), sha(c.image), `COPY ${args}: the card`);
    assert.equal(b.tpaChanged, 0, `COPY ${args}: the TPA kept`);
  }
});

test("on a write error COPY closes the destination: the records that fit are in it, their blocks in its entry (KE-179)", () => {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G1M", label: "DATA", mount: "C" },
  ]);
  const c = volume(image, "C");
  c.write("FILL.DAT", pattern(c.freeBytes() - 4096, 5));
  const room = c.freeBytes();
  volume(image, "A").write("BIG.DAT", pattern(room + 4096, 6));
  const m = boot(image);
  assert.equal(run(m, "COPY BIG.DAT C:DST.DAT"), "WRITE ERROR");
  run(m, "\x03");
  assert.deepEqual(m.violations, []);
  assert.deepEqual(read(image, "C", "DST.DAT"), read(image, "A", "BIG.DAT").subarray(0, room), "the records written, closed");
  assert.equal(volume(image, "C").freeBytes(), 0, "every block in a directory entry");
});
