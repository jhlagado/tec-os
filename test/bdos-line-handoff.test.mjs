// A BDOS line read under a resident: the uninterrupted matrix control, its
// negative control (an extra keystroke shows), and, with TBUG_SVC set to a
// TBUG.SVC, TBUG resident leaving a pending read alone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { program } from "./lib/fixtures.mjs";
import { card, machine, runFor, runTo, word } from "./lib/mon3.mjs";

const fixture = await program("bdosline");
const { BEFORE, AFTER, RETURNS, LOWGUARD, LINEBUF, HIGHGRD, DONE, DMABUF } = fixture.symbols;

function setKey(m, key, down) {
  m.tec1g.applyMatrixKey(key >> 3, key & 7, down);
}

function press(m, key, shifted = false) {
  if (shifted) setKey(m, 0, true);
  setKey(m, key, true);
  runFor(m, 100_000);
  setKey(m, key, false);
  if (shifted) setKey(m, 0, false);
  runFor(m, 100_000);
}

function readLine({ leak = false, tbg } = {}) {
  const files = { "BDOSLINE.COM": fixture.bytes };
  if (tbg) files["TBUG.SVC"] = tbg;
  const m = machine(card(files), { tms: true, matrix: true });
  function lcd(row = 0) {
    return String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(row * 20, row * 20 + 20));
  }
  if (tbg) {
    m.type("tbug bdosline\r");
    m.runUntil(() => [0, 1, 2, 3].some((r) => /^>→0100 /.test(lcd(r).replace("\x7e", "→"))), 45_000_000, "TBUG entry stop, in Code");
    runFor(m, 150_000);
    setKey(m, 2, true); press(m, 24); setKey(m, 2, false); runFor(m, 100_000); // F5: Fn+5.
  } else {
    m.type("BDOSLINE\r");
  }
  m.runUntil(() => m.lineBuf === LINEBUF && m.waitingForInput(),
    45_000_000, "fixture's matrix input wait");
  press(m, 0x24, true); // A
  press(m, 0x25, true); // B
  assert.match(m.text(), /AB$/);
  const readState = () => ({
    callerStack: word(m, m.sym("OLDSP")),
    parameter: word(m, m.sym("PARAM")),
    dma: word(m, m.sym("CURDMA")),
    cursor: word(m, m.sym("LINPTR")),
    count: m.read(m.sym("LINCNT")),
    bytes: [m.read(LINEBUF + 2), m.read(LINEBUF + 3)],
    depth: m.read(m.sym("HKDEP")),
  });
  const pending = readState();
  assert.equal(pending.dma, DMABUF);
  assert.equal(pending.parameter, LINEBUF);
  assert.equal(pending.count, 2);
  assert.deepEqual(pending.bytes, [0x41, 0x42]);
  assert.equal(m.read(RETURNS), 0, "BDOS is still reading the line");
  if (tbg) {
    const screen = [0, 1, 2, 3].map(lcd).join("");
    setKey(m, 1, true); // Ctrl
    setKey(m, 12, true); // Esc: TBUG's break waits for a BDOS call, not a read in progress.
    runFor(m, 400_000);
    setKey(m, 12, false);
    setKey(m, 1, false);
    runFor(m, 100_000);
    assert.equal(m.read(RETURNS), 0, "the line is still being read");
    assert.equal([0, 1, 2, 3].map(lcd).join(""), screen, "TBUG did not stop: the read is the OS's");
  }
  if (leak) press(m, 0x3b, true); // X, an intentionally leaked debugger key
  press(m, 0x26, true); // C
  press(m, 0x0a); // Return
  runTo(m, DONE);
  assert.equal(word(m, BEFORE), word(m, AFTER), "the read restores SP");
  assert.equal(m.read(RETURNS), 1);
  assert.equal(word(m, m.sym("CURDMA")), DMABUF, "the caller's DMA survives");
  assert.equal(m.read(m.sym("HKDEP")), 0, "the original call leaves BDOS once");
  assert.equal(m.read(LOWGUARD), 0xa5);
  assert.equal(m.read(HIGHGRD), 0x5a);
  const length = m.read(LINEBUF + 1);
  return String.fromCharCode(...Array.from({ length }, (_, i) => m.read(LINEBUF + 2 + i)));
}

test("the uninterrupted matrix input control returns ABC once", () => {
  assert.equal(readLine(), "ABC");
});

test("the line comparison detects an extra matrix keystroke", () => {
  assert.equal(readLine({ leak: true }), "ABXC");
});

// TBUG.SVC is TBUG's, not a Tecos input: the case exists only when TBUG_SVC
// names one, so a strict round without it registers no skip. TBUG runs it.
if (process.env.TBUG_SVC) test("TBUG resident leaves a pending BDOS read alone, Ctrl+Esc included", () => {
    // The line editor takes the Esc typed during the read like any key.
    assert.match(readLine({ tbg: readFileSync(process.env.TBUG_SVC) }), /^AB.?C$/);
  });
