// Control and negative control for the proposed resident keyboard handoff.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeSvc } from "../tools/lib/svc.mjs";
import { ROOT, program, romFor, volume } from "./lib/fixtures.mjs";
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

function readLine({ leak = false, probe, tbg, park = false } = {}) {
  const files = { "BDOSLINE.COM": fixture.bytes };
  if (probe) files["KEYPROBE.SVC"] = probe.file;
  if (tbg) files["TBG.SVC"] = tbg;
  const m = machine(card(files), { tms: true, matrix: true });
  if (probe) m.command("KEYPROBE.SVC");
  function lcd(row = 0) {
    return String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(row * 20, row * 20 + 20));
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
  if (probe || tbg) {
    const count = (m.read(m.sym("SVCHEAD")) << 8) + (probe?.symbols.COUNT ?? 0);
    setKey(m, 1, true); // Ctrl
    setKey(m, 0x3b, true); // X
    if (park) runTo(m, (m.read(m.sym("SVCHEAD")) << 8) + probe.symbols.WAITR);
    runFor(m, 100_000);
    if (probe) assert.equal(m.read(count), 1, "the resident callback owns the keyboard");
    if (park) {
      const snapshot = volume(m.sdImage, "A").read("PARKTEST.BIN");
      assert.equal(snapshot.length, 128);
      assert.equal(snapshot[0], 0x5a);
      assert.deepEqual(readState(), pending, "the parked disk write restores the input context");
    }
    if (tbg) assert.match(lcd(), /^TBG: INPUT PAUSED/);
    runFor(m, 100_000);
    setKey(m, 0x3b, false);
    setKey(m, 1, false);
    if (tbg && m.symbols.has("LINEPARK")) {
      press(m, 0x3a); // W saves the parked call's register snapshot.
      m.runUntil(() => lcd(3).startsWith("Saved TBGSTATE.BIN") && word(m, m.sym("OLDSP")) === pending.callerStack,
        45_000_000, "parked snapshot saved");
      const snapshot = Buffer.from(volume(m.sdImage, "A").read("TBGSTATE.BIN"));
      assert.equal(snapshot.length, 128);
      assert.equal(snapshot.readUInt16LE(4), LINEBUF);
      assert.equal(snapshot.readUInt16LE(12), word(m, BEFORE));
      assert.equal(snapshot.readUInt16LE(14), word(m, pending.callerStack));
      assert.deepEqual(readState(), pending, "saving preserves the pending input");
    }
    press(m, 0x35); // R resumes when released.
    if (probe) assert.equal(m.read(count), 1, "the held chord dispatched once");
    assert.equal(m.read(RETURNS), 0, "the original line is still pending");
    assert.deepEqual(readState(), pending, "resume preserves the pending BDOS context");
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

test("KEYBREAK resumes a pending BDOS line without leaking debugger keys",
  { skip: !romFor().symbols.has("KEYBREAK") }, async () => {
    const probe = await makeSvc(resolve(ROOT, "test/programs/keyprobe.asm"), { defs: { PARK: 0 }, work: resolve(ROOT, "build/svc") });
    assert.equal(readLine({ probe }), "ABC");
  });

test("TBG returns keyboard ownership to its target's pending BDOS read",
  { skip: !process.env.TBG_SVC || !romFor().symbols.has("KEYBREAK") }, () => {
    assert.equal(readLine({ tbg: readFileSync(process.env.TBG_SVC) }), "ABC");
  });

test("a parked BDOS read permits a disk write and resumes the same line",
  { skip: !romFor().symbols.has("LINEPARK") }, async () => {
    const probe = await makeSvc(resolve(ROOT, "test/programs/keyprobe.asm"), {
      defs: { PARK: 1 }, work: resolve(ROOT, "build/svc"),
    });
    assert.equal(readLine({ probe, park: true }), "ABC");
  });
