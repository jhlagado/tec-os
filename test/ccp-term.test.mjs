// The CCP's terminal primitives at the bare prompt, with no shell: the volume
// in the prompt, CLS, the pager for TYPE and DIR, and the history for ^W, ^N,
// Up and Down. SHELL.SVC uses the same ones (shell.test.mjs). Emulator
// evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PUT_COM, boot, romFor, standardCard, volume } from "./lib/fixtures.mjs";

const LONG = Buffer.from(Array.from({ length: 40 }, (_, i) => `line ${i}\r\n`).join("") + "\x1a", "latin1");
const PROMPT = /\r\n[A-P]:\S*>$/;

/** The line BDOS 10 holds at the bare prompt, read from its buffer. */
function held(m) {
  m.runUntil(() => m.waitingForInput(), 50_000_000, "line input");
  const p = m.read(m.sym("PARAM")) | (m.read(m.sym("PARAM") + 1) << 8);
  return String.fromCharCode(...Array.from({ length: m.read(m.sym("LINCNT")) }, (_, i) => m.read(p + 2 + i)));
}

test("the bare prompt shows the drive and its volume, as the shell's does", () => {
  const m = boot(standardCard());
  m.runUntil(() => m.ready(), 200_000_000, "the prompt");
  assert.match(m.text(0), /\r\nA:SYSTEM>$/, "A:SYSTEM>, not A>");
  assert.match(m.command("B:"), /\r\nB:\S*>$/, "B: with its volume");
  assert.deepEqual(m.violations, []);
});

test("CLS at the bare prompt clears the screen and puts the prompt on its top row", () => {
  const m = boot(standardCard());
  m.runUntil(() => m.ready(), 200_000_000, "the prompt");
  const out = m.command("CLS");
  assert.match(out, /\x1b\[H\x1b\[2JA:SYSTEM>$/, "ESC [H ESC [2J, then the prompt with no blank line");
  assert.deepEqual(m.violations, []);
});

for (const [name, setup, run] of [
  ["TYPE", (a) => a.write("L.TXT", LONG), "TYPE L.TXT"],
  ["DIR", (a) => { for (let i = 0; i < 60; i += 1) a.write(`F${String(i).padStart(2, "0")}.DAT`, new Uint8Array(0)); }, "DIR"],
]) {
  test(`${name} at the bare prompt waits at [more] one row short of a full screen; a key goes on, and Q stops`, () => {
    const image = standardCard();
    setup(volume(image, "A"));
    const m = boot(image, { matrix: true, tms: true, width: 40 });
    m.runUntil(() => m.ready(), 200_000_000, "the prompt");
    m.mark = m.output.length;
    m.type(`${run}\r`);
    const first = m.expect(/\[more\]$/, { maxCycles: 900_000_000 });
    assert.equal((first.match(/\r\n/g) ?? []).length, 23, "23 rows, then [more] on the 24th");
    m.type(" ");
    m.expect(/\[more\]$|>$/, { maxCycles: 900_000_000 });
    if (/\[more\]$/.test(m.text(0))) {
      m.type("Q");
      m.expect(PROMPT, { maxCycles: 900_000_000 });
    }
    assert.equal(m.read(m.sym("PRGCODE")) | (m.read(m.sym("PRGCODE") + 1) << 8), 0, "Q is an answer, not a failure");
    assert.deepEqual(m.violations, []);
  });
}

test("the bare prompt's history: ^W and Up recall the lines typed, ^N and Down come back, a repeat is kept once", () => {
  const m = boot(standardCard());
  m.runUntil(() => m.ready(), 200_000_000, "the prompt");
  m.command("FIRST");
  m.command("SECOND");
  m.command("SECOND");
  m.type("\x17");
  assert.equal(held(m), "SECOND", "^W: the newest");
  m.type("\x17");
  assert.equal(held(m), "FIRST", "^W again: the one before; the repeat was kept once");
  m.type("\x17");
  assert.equal(held(m), "FIRST", "no older line: unchanged");
  m.type("\x0e");
  assert.equal(held(m), "SECOND", "^N: the newer one");
  m.type("\x1b[A");
  assert.equal(held(m), "FIRST", "Up is ^W");
  m.type("\x1b[B");
  assert.equal(held(m), "SECOND", "Down is ^N");
  m.type("\r");
  m.expect(PROMPT);
  assert.deepEqual(m.violations, []);
});

test("the history ring wraps within its 96 bytes, keeping the newest lines whole", () => {
  const m = boot(standardCard());
  m.runUntil(() => m.ready(), 200_000_000, "the prompt");
  const lines = Array.from({ length: 12 }, (_, i) => `LINE${String(i).padStart(2, "0")}X`);
  for (const l of lines) m.command(l);
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    m.type("\x17");
    const h = held(m);
    if (seen.at(-1) === h) break;
    seen.push(h);
  }
  assert.ok(seen.length >= 8 && seen.length < 12, `${seen.length} of 12 nine-byte lines kept in 96 bytes`);
  assert.deepEqual(seen, lines.slice().reverse().slice(0, seen.length), "the newest, in order, each whole");
  const ring = m.sym("HISTRING");
  assert.equal(ring >> 8, (ring + 95) >> 8, "the ring within one page");
  assert.deepEqual(m.violations, []);
});

test("ABI 5.6 adds TNPAGE and TNPRMPT", () => {
  const { rom, symbols } = romFor();
  assert.equal(rom[symbols.get("ABIMIN") - 0xc000], 6);
  assert.deepEqual([symbols.get("TNPAGE"), symbols.get("TNPRMPT"), symbols.get("TNCOUNT")], [19, 20, 21]);
});
