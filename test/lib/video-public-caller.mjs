// Complete owned empty matrix input at its first real return. Physical key
// release and the guest's later release scan are separate observations.
import assert from "node:assert/strict";
import { getMatrixCombosForAscii } from "@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap";
import { publicContext } from "./public-caller.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const modifiers = { shift: 0, ctrl: 1, fn: 2 };

export function matrixInputState(m) {
  const input = m.tec1g.state.input;
  return {
    active: Array.from(input.matrixKeyStates),
    pending: Array.from(input.matrixPendingKeyStates),
    pendingDirty: input.matrixPendingDirty,
    lastReadRow: input.matrixLastReadRow,
    guestLastKey: m.read(m.sym("KBLAST")),
  };
}

/** Owned ordinary bare video boot/completed-type phases only. Custom BIOS
 * input/status hooks, shell lines and pre-held/queued keys are unsupported.
 * CONTROLENTER selects a real Ctrl-M combination to exercise modifier cleanup.
 */
export function finishBareVideoPrompt(m, { controlEnter = false } = {}) {
  assert.ok(
    m.ready() && m.classicBankIn,
    "waiting classic video prompt required",
  );
  assert.equal(word(m, m.sym("SHOWN")), 0, "bare prompt only");
  assert.equal(m.read(m.sym("CONMOD")) & 1, 1, "video/matrix console required");
  assert.equal(m.lineBuf, m.sym("CMDBUF"));
  assert.equal(m.read(m.sym("CMDLEN")), 0);
  assert.equal(m.read(m.sym("LINCNT")), 0);
  assert.equal(m.read(m.sym("RXFULL")), 0);
  assert.equal(m.read(m.sym("PENDING")), 0);
  assert.deepEqual(m.pending ?? [], [], "no queued host input");
  assert.equal(m.read(m.sym("HKDEP")), 1);
  assert.equal(m.read(m.sym("HKBUSY")), 0);
  const saved = word(m, m.sym("OLDSP"));
  assert.equal(
    saved,
    m.sym("CSTKTOP") - 2,
    "actual ordinary counted-input owner",
  );
  const back = word(m, saved);
  assert.deepEqual(
    Array.from({ length: 5 }, (_, i) => m.read(back - 5 + i)),
    [0x0e, 10, 0xcd, 5, 0],
  );
  for (const [offset, name] of [
    [6, "HKBI2"],
    [9, "HKBI3"],
  ]) {
    const at = m.sym("RAMBIOS") + offset;
    assert.equal(m.read(at), 0xc3);
    assert.equal(
      word(m, at + 1),
      m.sym(name),
      "default returning BIOS console hook required",
    );
  }
  const input = m.tec1g.state.input;
  assert.equal(input.matrixModeEnabled, true);
  assert.equal(
    input.joystickState,
    0,
    "no joystick bits masquerading as matrix keys",
  );
  const beforeInput = matrixInputState(m);
  for (const rows of [beforeInput.active, beforeInput.pending])
    assert.ok(
      rows.every((v) => v === 0xff),
      "no pre-held or pending matrix keys",
    );
  assert.equal(
    beforeInput.guestLastKey,
    0xff,
    "ordinary released guest key state",
  );
  const combo = getMatrixCombosForAscii(13).find(
    (c) =>
      !c.capsLock &&
      (controlEnter
        ? c.modifier === "ctrl" && c.row * 8 + c.col >= 0x24
        : c.modifier === undefined),
  );
  assert.ok(combo, "requested real Enter combination is available");
  const owned = [
    ...(combo.modifier ? [{ row: 0, col: modifiers[combo.modifier] }] : []),
    { row: combo.row, col: combo.col },
  ];
  const before = {
    pc: m.pc,
    sp: m.cpu.cpu.sp,
    cycles: m.cycles,
    input: beforeInput,
  };
  const mark = m.output.length;
  const originalStep = m.step;
  let firstReturns = 0,
    released = false;
  const release = () => {
    if (!released)
      for (const key of owned) m.tec1g.applyMatrixKey(key.row, key.col, false);
    released = true;
  };
  m.step = () => {
    const result = originalStep.call(m);
    if (m.pc === m.sym("MLGOT")) firstReturns++;
    return result;
  };
  try {
    for (const key of owned) m.tec1g.applyMatrixKey(key.row, key.col, true);
    m.runUntil(
      () => m.read(m.sym("KBLAST")) === combo.row * 8 + combo.col,
      50_000_000,
      "owned matrix Enter is accepted",
    );
    assert.equal(firstReturns, 0, "the counted line has not already returned");
    release();
    m.runUntil(
      () => m.pc === m.sym("MLGOT"),
      50_000_000,
      "first counted-line return after owned physical release",
    );
    assert.equal(firstReturns, 1);
    assert.equal(m.read(m.sym("CMDLEN")), 0, "one empty line returned");
    publicContext(m);
    assert.ok(
      matrixInputState(m).pending.every((v) => v === 0xff),
      "all owned keys/modifiers physically released",
    );
    // Do not run another scan merely to make active rows or KBLAST agree:
    // that would cross this API return and may open another input call.
    return {
      before,
      after: {
        pc: m.pc,
        sp: m.cpu.cpu.sp,
        cycles: m.cycles,
        input: matrixInputState(m),
      },
      output: m.text(mark),
      cycles: m.cycles - before.cycles,
      combo,
      owned,
      firstReturns,
    };
  } finally {
    release();
    m.step = originalStep;
  }
}
