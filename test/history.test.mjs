// Command-line history at the CCP prompt: the ring at BD00h in EXPAND 1,
// ^W and ^N. Emulator evidence, on the serial console.

import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, standardCard, volume } from "./lib/fixtures.mjs";

const W = "\x17";
const N = "\x0e";
const RING = 0x3d00; // BD00h, in EXPAND 1's 16K

/** The line in function 10's buffer, once the editor waits for a key. */
function held(m) {
  const a = m.sym("CINLP");
  const b = m.sym("CINWE");
  m.runUntil(() => m.pc >= a && m.pc < b, 50_000_000, "the line editor's next key");
  const p = m.read(m.sym("PARAM")) | (m.read(m.sym("PARAM") + 1) << 8);
  const n = m.read(m.sym("LINCNT"));
  return String.fromCharCode(...Array.from({ length: n }, (_, i) => m.read(p + 2 + i)));
}

/** The ring's lines from the newest back, read from EXPAND 1. */
function lines(m) {
  const ring = m.expand[1].subarray(RING, RING + 256);
  const head = m.read(m.sym("HHEAD"));
  const out = [];
  let p = (head - 1) & 0xff;
  while (ring[(p - 1) & 0xff] !== 0 && out.length < 256) {
    let q = (p - 1) & 0xff;
    while (ring[(q - 1) & 0xff] !== 0) q = (q - 1) & 0xff;
    let t = "";
    for (let i = q; i !== p; i = (i + 1) & 0xff) t += String.fromCharCode(ring[i]);
    out.push(t);
    p = (q - 1) & 0xff;
  }
  return out;
}

function session(lines_) {
  const m = boot(standardCard(), { ram96: true });
  for (const l of lines_) m.command(l);
  return m;
}

test("^W recalls the lines typed at the prompt, newest first, and ^N steps forward", () => {
  const m = session(["dir", "user 0", "era x.y", "stat"]);
  m.mark = m.output.length;
  m.type(W);
  assert.equal(held(m), "stat");
  m.type(W);
  assert.equal(held(m), "era x.y");
  m.type(W + W + W + W);
  assert.equal(held(m), "dir", "at the oldest, ^W stays");
  m.type(N);
  assert.equal(held(m), "user 0");
  m.type(N + N + N);
  assert.equal(held(m), "", "past the newest, an empty line");
  m.type(N);
  assert.equal(held(m), "");
  m.type(W + "\x08" + "u");
  assert.equal(held(m), "stau", "a recalled line can be edited");
  m.type("\r");
  m.expect(/\r\nA>$/);
  assert.deepEqual(lines(m).slice(0, 2), ["stau", "stat"]);
  assert.equal(m.sysCtrl & 0x04, 0, "EXPAND 0 back in view");
  assert.deepEqual(m.violations, []);
});

test("a recalled line is erased in place and cut at the buffer's maximum", () => {
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

test("over many lines the ring wraps and every recall is a whole line", () => {
  let x = 12345;
  const rnd = (n) => ((x = (x * 1103515245 + 12345) & 0x7fffffff), x % n);
  const typed = [];
  for (let i = 0; i < 40; i += 1) {
    const len = i % 7 === 3 ? 90 + rnd(37) : 1 + rnd(30);
    let t = "z";
    while (t.length < len) t += "abcdefghijklmnopqrstuvwxyz0123456789"[rnd(36)];
    typed.push(t);
  }
  const m = boot(standardCard(), { ram96: true });
  const stored = [];
  for (const t of typed) {
    m.command(t);
    if (stored[stored.length - 1] !== t) stored.push(t);
    const want = [];
    let used = 1;
    for (let i = stored.length - 1; i >= 0 && (used += stored[i].length + 1) <= 256; i -= 1) want.push(stored[i]);
    assert.deepEqual(lines(m), want, `after ${JSON.stringify(t)}`);
  }
});

test("a line repeated, a line holding a 0 and an empty line are not stored", () => {
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
  m.expect(/\r\nA>$/);
  assert.deepEqual(lines(m), ["dir", "stat", "dir"]);
});

test("a program's function 10 takes ^W as a character and its line is not stored", () => {
  const image = standardCard();
  // LD DE,0180h; LD C,10; CALL 5; RET, with a 20-byte buffer at 0180h.
  const com = new Uint8Array(0x81);
  com.set([0x11, 0x80, 0x01, 0x0e, 0x0a, 0xcd, 0x05, 0x00, 0xc9]);
  com[0x80] = 20;
  volume(image, "A").write("ASK.COM", com);
  const m = boot(image, { ram96: true });
  m.command("dir");
  m.mark = m.output.length;
  m.type("ask\r");
  held(m);
  m.type(W + "x\r");
  m.expect(/\r\nA>$/);
  assert.equal(m.read(0x181), 2);
  assert.deepEqual([m.read(0x182), m.read(0x183)], [0x17, 0x78]);
  assert.deepEqual(lines(m), ["ask", "dir"]);
});

test("the ring is shared by CCP levels, kept by warm boot and emptied by cold boot", () => {
  const m = session(["dir", "ccp", "type nested.txt", "exit"]);
  m.mark = m.output.length;
  m.type(W + W);
  assert.equal(held(m), "type nested.txt");
  m.type("\x18\x03");
  m.expect(/\r\nA>$/);
  m.type(W);
  assert.equal(held(m), "exit", "kept across ^C");
  m.reset();
  m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.type(W);
  assert.equal(held(m), "", "cold boot empties it");
  assert.equal(m.read(m.sym("XMARK")), 0x80, "the ring and the levels are fixed pages; MOVE has no range in EXPAND 1");
});
