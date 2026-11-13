// A prompt is still inside BDOS 10. Synthetic public callers must finish
// that input before replacing PC/SP. This helper supports the ordinary
// empty bare serial prompt only; it does not change Machine.ready().
import assert from "node:assert/strict";

const word = (m, address) => m.read(address) | m.read(address + 1) << 8;

/** A bootstrap retry's actual BDOS 1 wait, not an ordinary command prompt. */
export function recoveryInput(m) {
  const key = m.symbols.get("CCPRKEY");
  if (key === undefined || !m.classicBankIn || !m.waitingForInput()) return false;
  if (m.read(m.sym("ERRMODE")) !== 0xff || m.read(m.sym("HKDEP")) !== 1 || m.read(m.sym("HKBUSY"))) return false;
  const saved = word(m, m.sym("OLDSP"));
  return saved === m.sym("CSTKTOP") - 4 && word(m, saved) === key + 5;
}

/** Check an ordinary caller's context, without changing guest state. */
export function publicContext(m) {
  assert.ok(m.classicBankIn, "public caller requires the classic bank");
  for (const name of ["HKDEP", "HKBUSY"]) {
    const at = m.symbols.get(name);
    if (at !== undefined) assert.equal(m.read(at), 0, `${name}: no inherited or busy API context`);
  }
}

/**
 * Complete one real empty input line and stop at MLGOT before it executes.
 * Call before initial counters/timing/budgets. After warm/reset, first
 * capture that operation's result/card/queue/traffic; this separate input
 * can retry writes and emit notices. The returned receipt never discards
 * that output. Never call this automatically at an arbitrary CPU stop.
 * Supported callers own their input: ordinary boot or completed type()
 * handshakes, with no outstanding direct queueSerial() input. The runtime's
 * native serial queue/in-flight state is private, so the checks below do
 * not claim to measure that state. Older maps without SHOWN are unsupported;
 * their command-only controls do not use this helper.
 */
export function finishBarePrompt(m) {
  assert.ok(m.ready(), "normalization requires an actual waiting prompt");
  assert.ok(m.classicBankIn, "prompt must be in the classic bank");
  const shown = m.symbols.get("SHOWN");
  assert.notEqual(shown, undefined, "this helper does not support older maps without SHOWN");
  assert.equal(word(m, shown), 0, "bare prompt only; no shell input");
  assert.equal(m.read(m.sym("CONMOD")), 0, "serial prompt only");
  const saved = word(m, m.sym("OLDSP"));
  assert.equal(saved, m.sym("CSTKTOP") - 2, "ordinary CCP BDOS 10 owns the input");
  const back = word(m, saved);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => m.read(back - 5 + i)), [0x0e, 10, 0xcd, 5, 0], "actual counted-input call site");
  assert.equal(m.lineBuf, m.sym("CMDBUF"), "ordinary CCP counted input");
  assert.equal(m.read(m.sym("CMDLEN")), 0, "no partial counted line");
  assert.equal(m.read(m.sym("LINCNT")), 0, "no partial active input");
  assert.deepEqual(m.pending ?? [], [], "no queued host test key to consume");
  assert.equal(m.read(m.sym("RXFULL")), 0, "no guest serial lookahead byte");
  assert.equal(m.read(m.sym("PENDING")), 0, "no BDOS buffered key");
  const depth = m.symbols.get("HKDEP");
  const busy = m.symbols.get("HKBUSY");
  if (depth !== undefined) assert.equal(m.read(depth), 1, "only prompt BDOS 10 owns the context");
  if (busy !== undefined) assert.equal(m.read(busy), 0, "not in a worker callback");
  const mark = m.output.length;
  const before = { pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles };
  m.type("\r");
  m.runUntil(() => m.pc === m.sym("MLGOT"), 400_000_000, "empty prompt input returned before another API");
  assert.equal(m.read(m.sym("CMDLEN")), 0, "the completed line is empty");
  publicContext(m);
  return {
    before,
    after: { pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles },
    cycles: m.cycles - before.cycles,
    output: m.text(mark),
  };
}
