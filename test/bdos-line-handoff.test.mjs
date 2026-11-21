// Control and negative control for the proposed resident keyboard handoff.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeSvc } from "../tools/lib/svc.mjs";
import { ROOT, program, romFor } from "./lib/fixtures.mjs";
import { card, machine, runFor, runTo, word } from "./lib/mon3.mjs";

const fixture = await program("bdosline");
const { BEFORE, AFTER, RETURNS, LOWGUARD, LINEBUF, HIGHGRD, DONE } = fixture.symbols;

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

function readLine({ leak = false, probe, tbg } = {}) {
  const files = { "BDOSLINE.COM": fixture.bytes };
  if (probe) files["KEYPROBE.SVC"] = probe.file;
  if (tbg) files["TBG.SVC"] = tbg;
  const m = machine(card(files), { tms: true, matrix: true });
  if (probe) m.command("KEYPROBE.SVC");
  function lcd() {
    return String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(0, 20));
  }
  if (tbg) {
    m.type("TBG.SVC BDOSLINE\r");
    m.runUntil(() => lcd().startsWith("PC: 0100"), 45_000_000, "TBG entry stop");
    runFor(m, 150_000);
    press(m, 0x35);
  } else {
    m.type("BDOSLINE\r");
  }
  m.runUntil(() => m.lineBuf === LINEBUF && m.waitingForInput(),
    45_000_000, "fixture's matrix input wait");
  press(m, 0x24, true); // A
  press(m, 0x25, true); // B
  assert.match(m.text(), /AB$/);
  assert.equal(m.read(RETURNS), 0, "BDOS is still reading the line");
  if (probe || tbg) {
    const count = (m.read(m.sym("SVCHEAD")) << 8) + (probe?.symbols.COUNT ?? 0);
    setKey(m, 1, true); // Ctrl
    setKey(m, 0x3b, true); // X
    runFor(m, 100_000);
    if (probe) assert.equal(m.read(count), 1, "the resident callback owns the keyboard");
    if (tbg) assert.match(lcd(), /^TBG: INPUT PAUSED/);
    runFor(m, 100_000);
    setKey(m, 0x3b, false);
    setKey(m, 1, false);
    press(m, 0x35); // R resumes when released.
    if (probe) assert.equal(m.read(count), 1, "the held chord dispatched once");
    assert.equal(m.read(RETURNS), 0, "the original line is still pending");
  }
  if (leak) press(m, 0x3b, true); // X, an intentionally leaked debugger key
  press(m, 0x26, true); // C
  press(m, 0x0a); // Return
  runTo(m, DONE);
  assert.equal(word(m, BEFORE), word(m, AFTER), "the read restores SP");
  assert.equal(m.read(RETURNS), 1);
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

test("KEYBREAK resumes a pending BDOS line without leaking debugger keys",
  { skip: !romFor().symbols.has("KEYBREAK") }, async () => {
    const probe = await makeSvc(resolve(ROOT, "test/programs/keyprobe.asm"), { work: resolve(ROOT, "build/svc") });
    assert.equal(readLine({ probe }), "ABC");
  });

test("TBG returns keyboard ownership to its target's pending BDOS read",
  { skip: !process.env.TBG_SVC || !romFor().symbols.has("KEYBREAK") }, () => {
    assert.equal(readLine({ tbg: readFileSync(process.env.TBG_SVC) }), "ABC");
  });
