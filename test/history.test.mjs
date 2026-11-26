// Command-line history at the prompt, the ROM's again from ABI 5.6: the
// 96-byte HistRing in its workspace, ^W and ^N, kept under the shell as at
// the bare prompt. Emulator evidence, on the serial console.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, standardCard, volume, withShell } from "./lib/fixtures.mjs";

const W = "\x17";
const N = "\x0e";

/** The line in function 10's buffer, once the editor waits for a key. */
function held(m) {
  const a = m.sym("CINLP");
  const b = m.sym("CINWE");
  m.runUntil(() => m.pc >= a && m.pc < b, 50_000_000, "the line editor's next key");
  const p = m.read(m.sym("PARAM")) | (m.read(m.sym("PARAM") + 1) << 8);
  const n = m.read(m.sym("LINCNT"));
  return String.fromCharCode(...Array.from({ length: n }, (_, i) => m.read(p + 2 + i)));
}

/** The ring's size, and the longest line it keeps: the line and its zero leave a byte. */
const SIZE = 96, LONGEST = SIZE - 2;

/** The ring's lines from the newest back, read from the ROM's HistRing. */
function lines(m) {
  const at = m.sym("HISTRING"), w = (i) => ((i % SIZE) + SIZE) % SIZE;
  const ring = Uint8Array.from({ length: SIZE }, (_, i) => m.read(at + i));
  const head = w(m.read(m.sym("HISTHEAD")) - (at & 0xff));
  const out = [];
  let p = w(head - 1);
  while (ring[w(p - 1)] !== 0 && out.length < SIZE) {
    let q = w(p - 1);
    while (ring[w(q - 1)] !== 0) q = w(q - 1);
    let t = "";
    for (let i = q; i !== p; i = w(i + 1)) t += String.fromCharCode(ring[i]);
    out.push(t);
    p = w(q - 1);
  }
  return out;
}

function session(lines_) {
  const m = boot(withShell(standardCard()), { ram96: true });
  for (const l of lines_) m.command(l);
  return m;
}

test("SH11 ^W recalls the lines typed at the prompt, newest first, and ^N steps forward", () => {
  const m = session(["dir", "con", "era x.y", "stat"]);
  m.mark = m.output.length;
  m.type(W);
  assert.equal(held(m), "stat");
  m.type(W);
  assert.equal(held(m), "era x.y");
  m.type(W + W + W + W);
  assert.equal(held(m), "dir", "at the oldest, ^W stays");
  m.type(N);
  assert.equal(held(m), "con");
  m.type(N + N + N);
  assert.equal(held(m), "", "past the newest, an empty line");
  m.type(N);
  assert.equal(held(m), "");
  m.type(W + "\x08" + "u");
  assert.equal(held(m), "stau", "a recalled line can be edited");
  m.type("\r");
  m.expect(/\r\nA(:\S*)?>$/);
  assert.deepEqual(lines(m).slice(0, 2), ["stau", "stat"]);
  assert.equal(m.sysCtrl & 0x04, 0, "EXPAND 0 back in view");
  assert.deepEqual(m.violations, []);
});

test("SH11 a recalled line is erased in place and cut at the buffer's maximum", () => {
  const m = session(["type " + "a".repeat(40), "dir"]);
  m.mark = m.output.length;
  m.type(W + W);
  held(m);
  assert.equal(m.text(m.mark), "dir" + "\b \b".repeat(3) + "type " + "a".repeat(40));
  m.type("\x18");
  held(m);
  m.write(m.sym("LINMAX"), 20);
  m.type(N + W); // from the oldest, forward, then back to it
  assert.equal(held(m), "type " + "a".repeat(15));
  assert.equal(m.read(m.sym("LINCNT")), 20);
});

test("SH11 over many lines the ring wraps and every recall is a whole line", () => {
  let x = 12345;
  const rnd = (n) => ((x = (x * 1103515245 + 12345) & 0x7fffffff), x % n);
  const typed = [];
  for (let i = 0; i < 40; i += 1) {
    const len = i % 7 === 3 ? 70 + rnd(30) : 1 + rnd(25);
    let t = "z";
    while (t.length < len) t += "abcdefghijklmnopqrstuvwxyz0123456789"[rnd(36)];
    typed.push(t);
  }
  const m = boot(withShell(standardCard()), { ram96: true });
  const stored = [];
  for (const t of typed) {
    m.command(t);
    if (t.length <= LONGEST && stored[stored.length - 1] !== t) stored.push(t);
    const want = [];
    let used = 1;
    for (let i = stored.length - 1; i >= 0 && (used += stored[i].length + 1) <= SIZE; i -= 1) want.push(stored[i]);
    assert.deepEqual(lines(m), want, `after ${JSON.stringify(t)}`);
  }
});

test("SH11 a line of 94 fills the ring with its zero and is kept; one of 95 is not", () => {
  const long = "z" + "y".repeat(LONGEST - 1);
  const m = session(["dir", long]);
  assert.deepEqual(lines(m), [long], "94 and its zero: the whole ring, dir overwritten");
  m.command("stat");
  m.command("z" + "x".repeat(LONGEST));
  assert.deepEqual(lines(m), ["stat"], "95 not kept, and the ring stays whole");
});

test("SH11 a line repeated, a line holding a 0 and an empty line are not stored", () => {
  const m = session(["dir", "dir", "stat", "dir", ""]);
  // The serial port drops NUL, but a console driver need not: a "~" stands
  // for one, made 0 as CONIN returns it.
  m.mark = m.output.length;
  m.type("ab");
  const ret = m.sym("CINRX") + 4;
  m.runUntil(() => m.waitingForInput(), 50_000_000, "the editor");
  m.tec1g.queueSerial([0x7e]);
  m.runUntil(() => m.pc === ret && m.cpu.cpu.a === 0x7e, 50_000_000, "the ~");
  m.cpu.cpu.a = 0;
  m.type("cd\r");
  m.expect(/\r\nA(:\S*)?>$/);
  assert.deepEqual(lines(m), ["dir", "stat", "dir"]);
});

test("SH11 a program's function 10 takes ^W as a character and its line is not stored", () => {
  const image = standardCard();
  // LD DE,0180h; LD C,10; CALL 5; RET, with a 20-byte buffer at 0180h.
  const com = new Uint8Array(0x81);
  com.set([0x11, 0x80, 0x01, 0x0e, 0x0a, 0xcd, 0x05, 0x00, 0xc9]);
  com[0x80] = 20;
  volume(image, "A").write("ASK.COM", com);
  const m = boot(withShell(image), { ram96: true });
  m.command("dir");
  m.mark = m.output.length;
  m.type("ask\r");
  held(m);
  m.type(W + "x\r");
  m.expect(/\r\nA(:\S*)?>$/);
  assert.equal(m.read(0x181), 2);
  assert.deepEqual([m.read(0x182), m.read(0x183)], [0x17, 0x78]);
  assert.deepEqual(lines(m), ["ask", "dir"]);
});

test("SH11 the ring is kept by warm boot and emptied by cold boot", () => {
  const m = session(["dir", "type nested.txt", "exit"]);
  m.mark = m.output.length;
  m.type(W + W);
  assert.equal(held(m), "type nested.txt");
  m.type("\x18\x03");
  m.expect(/\r\nA(:\S*)?>$/);
  m.type(W);
  assert.equal(held(m), "exit", "kept across ^C");
  m.reset();
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the shell's prompt");
  m.type(W);
  assert.equal(held(m), "", "cold boot empties it: the shell is installed afresh");
});
