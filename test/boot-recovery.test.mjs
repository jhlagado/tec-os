// Bootstrap errors keep incomplete disk state out of normal command dispatch.
// Exercise real FCB/SPI failure and recovery, saved-drive startup, user escape
// and missing A, including actual minimal-RETN synthetic NMI stack checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rig, card, dirBlocks, DMA, FCB } from "./lib/coalesce.mjs";
import { Machine } from "./lib/machine.mjs";
import { romFor, volume, TEST_CLOCK } from "./lib/fixtures.mjs";
import { createContainer } from "../tools/lib/container.mjs";
import { watch } from "./lib/census.mjs";
import { finishBarePrompt, publicContext } from "./lib/public-caller.mjs";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const classic = (m, at) => {
  assert.ok(at >= 0x8000 && at < 0xc000);
  return m.cpu.hardware.memory[at];
};
const word = (m, at) => classic(m, at) | (classic(m, at + 1) << 8);
const state = (m) =>
  Object.fromEntries(
    [
      "HKDEP",
      "HKBUSY",
      "HKCNT",
      "HKERR",
      "CPEND",
      "CANY",
      "ERRMODE",
      "CURDRV",
      "DEFDRV",
      "LOGINV",
      "WARMV",
      "DPBPTR",
      "ALVPTR",
      "DEFDPB",
      "DEFALV",
    ].map((name) => [
      name,
      /PTR$|^DEFDPB$|^DEFALV$|^LOGINV$|^WARMV$/.test(name)
        ? word(m, m.sym(name))
        : classic(m, m.sym(name)),
    ]),
  );
const cache = (m) => {
  assert.ok(
    m.classicBankIn && !classic(m, m.sym("HKBUSY")),
    "coherent classic/worker boundary",
  );
  const bank = m.banks[0];
  return Array.from({ length: classic(m, m.sym("HKCNT")) }, (_, i) => {
    const line = classic(m, m.sym("HKQ") + i);
    assert.ok(line < 30);
    return {
      line,
      tag: Array.from(
        bank.slice(
          m.sym("CTAB") - 0x8000 + line * 4,
          m.sym("CTAB") - 0x8000 + line * 4 + 4,
        ),
      ),
      dirty: bank[m.sym("CDIRTY") - 0x8000 + line],
      payload: Buffer.from(bank.slice(line * 512, (line + 1) * 512)).toString(
        "base64",
      ),
    };
  });
};

function pendingFailure(kind) {
  const r = rig();
  assert.equal(
    r.m.expand,
    undefined,
    "this probe uses the default base-memory/expansion-window model",
  );
  if (r.m.ready()) finishBarePrompt(r.m);
  publicContext(r.m);
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  r.bdos(45, 0xff);
  r.name("P       DAT");
  assert.notEqual(r.bdos(22, FCB).a, 0xff);
  r.bdos(26, DMA);
  for (let record = 0; record < 3; record++) {
    r.put(record);
    assert.equal(r.bdos(21, FCB).a, 0);
  }
  let sdInitializations = 0;
  const originalStep = r.m.step.bind(r.m);
  r.m.step = () => {
    if (r.m.pc === r.m.sym("SDINIT")) sdInitializations++;
    return originalStep();
  };
  r.m.sd = null;
  assert.equal(r.bdos(11, 0).a, 0);
  const image = kind === "same" ? r.image : card();
  const imageBefore = sha(image);
  r.m.swapCard(image);
  assert.equal(r.m.sd.ready, false, "inserted card was not reinitialised");
  r.m.enqueueInput("x");
  assert.equal(r.bdos(1, 0, true).a, 0x78);
  for (let n = 0; n < 2; n++) {
    const error = r.bdos(16, FCB);
    assert.deepEqual([error.a, error.h], [0xff, 1]);
  }
  const before = state(r.m);
  for (const name of ["HKDEP", "HKBUSY", "HKCNT", "CPEND"]) {
    assert.equal(
      before[name],
      r.m.read(r.m.sym(name)),
      "physical and mapped classic reads agree before warm",
    );
  }
  const cacheBefore = cache(r.m);
  assert.equal(
    before.HKDEP,
    0,
    "normally returning root calls balance context",
  );
  assert.ok(before.HKCNT > 0);
  const labels = [
    "WBOOTR",
    "CCPENT",
    "FNRESET",
    "READDIR",
    "CPOUT",
    "BADSECT",
    "BDERR",
    "SDREAD",
    "SDWRITE",
    "SDINIT",
    "FNCIN",
    "STBOOT",
    "SHLINE",
    "MLTAKE",
  ];
  const at = new Map(labels.map((name) => [r.m.sym(name), name]));
  const counts = Object.fromEntries(labels.map((name) => [name, 0]));
  const events = [];
  const step = r.m.step.bind(r.m);
  let ackSent = true,
    acknowledgements = 0;
  r.m.step = () => {
    const name = at.get(r.m.pc);
    if (name) {
      counts[name]++;
      if (events.length < 80)
        events.push({
          name,
          cycles: r.m.cycles,
          latch: r.m.sysCtrl,
          classic: r.m.classicBankIn,
          ...state(r.m),
          dphDirtyA: classic(r.m, r.m.sym("DPHTAB") + 4),
        });
      if (name === "BDERR") ackSent = classic(r.m, r.m.sym("ERRMODE")) >= 0xfe;
    }
    return step();
  };
  const mark = r.m.output.length,
    start = r.m.cycles;
  const prompt = () => r.m.ready() && /\r\n[A-P](:\S*)?>$/.test(r.m.text(mark));
  const recovery = () =>
    counts.FNCIN > 0 &&
    word(r.m, r.m.sym("OLDSP")) === r.m.sym("CSTKTOP") - 4 &&
    word(r.m, word(r.m, r.m.sym("OLDSP"))) === r.m.sym("CCPRKEY") + 5 &&
    classic(r.m, r.m.sym("ERRMODE")) === 0xff &&
    classic(r.m, r.m.sym("HKDEP")) === 1 &&
    !classic(r.m, r.m.sym("HKBUSY")) &&
    r.m.classicBankIn &&
    r.m.waitingForInput();
  const run = (done, why) =>
    r.m.runUntil(() => (r.m.pumpInput(), done()), 20_000_000, why);
  r.m.cpu.cpu.pc = 0;
  run(recovery, "the distinct bootstrap recovery console");
  assert.ok(!prompt(), "no normal CCP prompt on incomplete disk state");
  assert.match(r.m.text(mark), /Disk reset failed\r\nEnter retries/);
  assert.deepEqual(
    [
      counts.WBOOTR,
      counts.CCPENT,
      counts.FNRESET,
      counts.STBOOT,
      counts.SHLINE,
      counts.MLTAKE,
    ],
    [1, 1, 1, 0, 0, 0],
  );
  const recoverySP = r.m.cpu.cpu.sp;
  const retries = [];
  for (const key of ["x", "\n", "\r", "\r", "\r"]) {
    const resetBefore = counts.FNRESET,
      inputBefore = counts.FNCIN;
    r.m.type(key);
    run(
      () => counts.FNCIN > inputBefore && recovery(),
      "input returned to recovery without normal dispatch",
    );
    assert.equal(
      counts.FNRESET - resetBefore,
      key === "\r" ? 1 : 0,
      "only CR retries disk reset",
    );
    assert.equal(
      counts.WBOOTR,
      1,
      "failed retries do not recursively warm boot",
    );
    assert.deepEqual(
      [counts.STBOOT, counts.SHLINE, counts.MLTAKE],
      [0, 0, 0],
      "no startup or normal dispatch during any failed retry",
    );
    assert.equal(
      r.m.cpu.cpu.sp,
      recoverySP,
      "retry does not grow the recovery input stack",
    );
    assert.deepEqual(
      cache(r.m),
      cacheBefore,
      "every refused retry retains all acknowledged bytes",
    );
    retries.push({
      key,
      counts: { ...counts },
      sp: r.m.cpu.cpu.sp,
      state: state(r.m),
    });
  }
  const after = state(r.m);
  const coherent = recovery();
  const cacheAfter = coherent ? cache(r.m) : null;
  assert.equal(counts.SDINIT, 0);
  assert.equal(
    sdInitializations,
    0,
    "no reinitialization since before removal/reinsertion",
  );
  assert.equal(
    sha(image),
    imageBefore,
    "no byte replay onto the inserted card",
  );
  if (coherent)
    assert.deepEqual(
      cacheAfter,
      cacheBefore,
      "same acknowledged queue order/tags/dirty bytes/payload retained",
    );
  assert.ok(coherent, "failure state is at a coherent recovery input");
}

function outputEscape(kind) {
  const r = rig();
  assert.equal(
    r.m.expand,
    undefined,
    "this probe uses the default base-memory/expansion-window model",
  );
  if (r.m.ready()) finishBarePrompt(r.m);
  publicContext(r.m);
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  r.bdos(45, 0xff);
  r.name("P       DAT");
  assert.notEqual(r.bdos(22, FCB).a, 0xff);
  r.bdos(26, DMA);
  for (let record = 0; record < 3; record++) {
    r.put(record);
    assert.equal(r.bdos(21, FCB).a, 0);
  }
  let sdInitializations = 0;
  const originalStep = r.m.step.bind(r.m);
  r.m.step = () => {
    if (r.m.pc === r.m.sym("SDINIT")) sdInitializations++;
    return originalStep();
  };
  r.m.sd = null;
  assert.equal(r.bdos(11, 0).a, 0);
  const image = kind === "same" ? r.image : card();
  const imageBefore = sha(image);
  r.m.swapCard(image);
  assert.equal(r.m.sd.ready, false, "inserted card was not reinitialised");
  r.m.enqueueInput("x");
  assert.equal(r.bdos(1, 0, true).a, 0x78);
  for (let n = 0; n < 2; n++) {
    const error = r.bdos(16, FCB);
    assert.deepEqual([error.a, error.h], [0xff, 1]);
  }
  const before = state(r.m);
  for (const name of ["HKDEP", "HKBUSY", "HKCNT", "CPEND"]) {
    assert.equal(
      before[name],
      r.m.read(r.m.sym(name)),
      "physical and mapped classic reads agree before warm",
    );
  }
  const cacheBefore = cache(r.m);
  assert.equal(
    before.HKDEP,
    0,
    "normally returning root calls balance context",
  );
  assert.ok(before.HKCNT > 0);
  const labels = [
    "WBOOTR",
    "CCPENT",
    "FNRESET",
    "READDIR",
    "CPOUT",
    "BADSECT",
    "BDERR",
    "SDREAD",
    "SDWRITE",
    "SDINIT",
    "FNCIN",
    "STBOOT",
    "SHLINE",
    "MLTAKE",
    "CHDROP",
  ];
  const at = new Map(labels.map((name) => [r.m.sym(name), name]));
  const counts = Object.fromEntries(labels.map((name) => [name, 0]));
  const events = [];
  const step = r.m.step.bind(r.m);
  let ackSent = true,
    acknowledgements = 0;
  r.m.step = () => {
    const name = at.get(r.m.pc);
    if (name) {
      counts[name]++;
      if (events.length < 80)
        events.push({
          name,
          cycles: r.m.cycles,
          latch: r.m.sysCtrl,
          classic: r.m.classicBankIn,
          ...state(r.m),
          dphDirtyA: classic(r.m, r.m.sym("DPHTAB") + 4),
        });
      if (name === "BDERR") ackSent = classic(r.m, r.m.sym("ERRMODE")) >= 0xfe;
    }
    return step();
  };
  const mark = r.m.output.length,
    start = r.m.cycles;
  const prompt = () => r.m.ready() && /\r\n[A-P](:\S*)?>$/.test(r.m.text(mark));
  const recovery = () =>
    counts.FNCIN > 0 &&
    word(r.m, r.m.sym("OLDSP")) === r.m.sym("CSTKTOP") - 4 &&
    word(r.m, word(r.m, r.m.sym("OLDSP"))) === r.m.sym("CCPRKEY") + 5 &&
    classic(r.m, r.m.sym("ERRMODE")) === 0xff &&
    classic(r.m, r.m.sym("HKDEP")) === 1 &&
    !classic(r.m, r.m.sym("HKBUSY")) &&
    r.m.classicBankIn &&
    r.m.waitingForInput();
  const run = (done, why) =>
    r.m.runUntil(() => (r.m.pumpInput(), done()), 20_000_000, why);
  r.m.cpu.cpu.pc = 0;
  run(
    () => r.m.pc === r.m.sym("CCPRERR"),
    "failed reset reaches recovery before its output",
  );
  assert.equal(counts.WBOOTR, 1);
  r.m.enqueueInput("\x13\x03");
  run(
    recovery,
    "deliberate pause/Ctrl-C escape re-enters the recovery console",
  );
  assert.equal(
    counts.CHDROP,
    1,
    "output pause plus Ctrl-C takes the explicit user escape",
  );
  assert.ok(!prompt(), "no normal CCP prompt on incomplete disk state");
  assert.match(r.m.text(mark), /Disk reset failed\r\nEnter retries/);
  assert.deepEqual(
    [
      counts.WBOOTR,
      counts.CCPENT,
      counts.FNRESET,
      counts.STBOOT,
      counts.SHLINE,
      counts.MLTAKE,
    ],
    [2, 2, 2, 0, 0, 0],
  );
  const recoverySP = r.m.cpu.cpu.sp;
  const retries = [];
  for (const key of ["\x03", "x", "\n", "\r"]) {
    const resetBefore = counts.FNRESET,
      inputBefore = counts.FNCIN;
    r.m.type(key);
    run(
      () => counts.FNCIN > inputBefore && recovery(),
      "input returned to recovery without normal dispatch",
    );
    assert.equal(
      counts.FNRESET - resetBefore,
      key === "\r" ? 1 : 0,
      "only CR retries disk reset",
    );
    assert.equal(
      counts.WBOOTR,
      2,
      "only the deliberate user escape warm boots; failed retries do not",
    );
    assert.equal(
      counts.CHDROP,
      1,
      "Ctrl-C returned by ordinary input is ignored",
    );
    assert.deepEqual(
      [counts.STBOOT, counts.SHLINE, counts.MLTAKE],
      [0, 0, 0],
      "no startup or normal dispatch during any failed retry",
    );
    assert.equal(
      r.m.cpu.cpu.sp,
      recoverySP,
      "retry does not grow the recovery input stack",
    );
    assert.deepEqual(
      cache(r.m),
      cacheBefore,
      "every refused retry retains all acknowledged bytes",
    );
    retries.push({
      key,
      counts: { ...counts },
      sp: r.m.cpu.cpu.sp,
      state: state(r.m),
    });
  }
  const after = state(r.m);
  const coherent = recovery();
  const cacheAfter = coherent ? cache(r.m) : null;
  assert.equal(counts.SDINIT, 0);
  assert.equal(
    sdInitializations,
    0,
    "no reinitialization since before removal/reinsertion",
  );
  assert.equal(
    sha(image),
    imageBefore,
    "no byte replay onto the inserted card",
  );
  if (coherent)
    assert.deepEqual(
      cacheAfter,
      cacheBefore,
      "same acknowledged queue order/tags/dirty bytes/payload retained",
    );
  assert.ok(coherent, "failure state is at a coherent recovery input");
}

function backendRecovery(user) {
  const r = rig();
  assert.equal(
    r.m.expand,
    undefined,
    "this probe uses the default base-memory/expansion-window model",
  );
  if (user) {
    r.m.command("USER " + user);
    r.m.runUntil(() => r.m.ready(), 20_000_000, "user prompt");
  }
  if (r.m.ready()) finishBarePrompt(r.m);
  publicContext(r.m);
  assert.equal(r.m.read(r.m.sym("HKDEP")), 0);
  r.bdos(45, 0xff);
  r.name("P       DAT");
  assert.notEqual(r.bdos(22, FCB).a, 0xff);
  r.bdos(26, DMA);
  const refusal = r.refuse();
  for (let record = 0; record < 3; record++) {
    r.put(record);
    assert.equal(r.bdos(21, FCB).a, 0);
  }
  let sdInitializations = 0;
  const originalStep = r.m.step.bind(r.m);
  r.m.step = () => {
    if (r.m.pc === r.m.sym("SDINIT")) sdInitializations++;
    return originalStep();
  };
  assert.equal(r.bdos(11, 0).a, 0);
  const image = r.image;
  const imageBefore = sha(image);
  assert.equal(
    r.m.sd.ready,
    true,
    "original initialised backend stays present",
  );
  r.m.enqueueInput("x");
  assert.equal(r.bdos(1, 0, true).a, 0x78);
  for (let n = 0; n < 2; n++) {
    const error = r.bdos(16, FCB);
    assert.deepEqual([error.a, error.h], [0xff, 1]);
  }
  const before = state(r.m);
  for (const name of ["HKDEP", "HKBUSY", "HKCNT", "CPEND"]) {
    assert.equal(
      before[name],
      r.m.read(r.m.sym(name)),
      "physical and mapped classic reads agree before warm",
    );
  }
  const cacheBefore = cache(r.m);
  assert.equal(
    before.HKDEP,
    0,
    "normally returning root calls balance context",
  );
  assert.ok(before.HKCNT > 0);
  const labels = [
    "WBOOTR",
    "CCPENT",
    "FNRESET",
    "READDIR",
    "CPOUT",
    "BADSECT",
    "BDERR",
    "SDREAD",
    "SDWRITE",
    "SDINIT",
    "FNCIN",
    "STBOOT",
    "SHLINE",
    "MLTAKE",
  ];
  const at = new Map(labels.map((name) => [r.m.sym(name), name]));
  const counts = Object.fromEntries(labels.map((name) => [name, 0]));
  const events = [];
  const step = r.m.step.bind(r.m);
  let ackSent = true,
    acknowledgements = 0;
  r.m.step = () => {
    const name = at.get(r.m.pc);
    if (name) {
      counts[name]++;
      if (events.length < 80)
        events.push({
          name,
          cycles: r.m.cycles,
          latch: r.m.sysCtrl,
          classic: r.m.classicBankIn,
          ...state(r.m),
          dphDirtyA: classic(r.m, r.m.sym("DPHTAB") + 4),
        });
      if (name === "BDERR") ackSent = classic(r.m, r.m.sym("ERRMODE")) >= 0xfe;
    }
    return step();
  };
  const mark = r.m.output.length,
    start = r.m.cycles;
  const prompt = () =>
    r.m.ready() && /\r\n\d*[A-P](:\S*)?>$/.test(r.m.text(mark));
  const recovery = () =>
    counts.FNCIN > 0 &&
    word(r.m, r.m.sym("OLDSP")) === r.m.sym("CSTKTOP") - 4 &&
    word(r.m, word(r.m, r.m.sym("OLDSP"))) === r.m.sym("CCPRKEY") + 5 &&
    classic(r.m, r.m.sym("ERRMODE")) === 0xff &&
    classic(r.m, r.m.sym("HKDEP")) === 1 &&
    !classic(r.m, r.m.sym("HKBUSY")) &&
    r.m.classicBankIn &&
    r.m.waitingForInput();
  const run = (done, why) =>
    r.m.runUntil(() => (r.m.pumpInput(), done()), 20_000_000, why);
  r.m.cpu.cpu.pc = 0;
  run(recovery, "the distinct bootstrap recovery console");
  assert.ok(!prompt(), "no normal CCP prompt on incomplete disk state");
  assert.match(r.m.text(mark), /Disk reset failed\r\nEnter retries/);
  assert.deepEqual(
    [
      counts.WBOOTR,
      counts.CCPENT,
      counts.FNRESET,
      counts.STBOOT,
      counts.SHLINE,
      counts.MLTAKE,
    ],
    [1, 1, 1, 0, 0, 0],
  );
  const recoverySP = r.m.cpu.cpu.sp;
  const retries = [];
  for (const key of ["x", "\n", "\r"]) {
    const resetBefore = counts.FNRESET,
      inputBefore = counts.FNCIN;
    r.m.type(key);
    run(
      () => counts.FNCIN > inputBefore && recovery(),
      "input returned to recovery without normal dispatch",
    );
    assert.equal(
      counts.FNRESET - resetBefore,
      key === "\r" ? 1 : 0,
      "only CR retries disk reset",
    );
    assert.equal(
      counts.WBOOTR,
      1,
      "failed retries do not recursively warm boot",
    );
    assert.deepEqual(
      [counts.STBOOT, counts.SHLINE, counts.MLTAKE],
      [0, 0, 0],
      "no startup or normal dispatch during any failed retry",
    );
    assert.equal(
      r.m.cpu.cpu.sp,
      recoverySP,
      "retry does not grow the recovery input stack",
    );
    assert.deepEqual(
      cache(r.m),
      cacheBefore,
      "every refused retry retains all acknowledged bytes",
    );
    retries.push({
      key,
      counts: { ...counts },
      sp: r.m.cpu.cpu.sp,
      state: state(r.m),
    });
  }
  const after = state(r.m);
  const coherent = recovery();
  const cacheAfter = coherent ? cache(r.m) : null;
  assert.equal(counts.SDINIT, 0);
  assert.equal(sdInitializations, 0, "no reinitialization during refusal");
  assert.equal(
    sha(image),
    imageBefore,
    "refused writes did not change the original card",
  );
  if (coherent)
    assert.deepEqual(
      cacheAfter,
      cacheBefore,
      "same acknowledged queue order/tags/dirty bytes/payload retained",
    );
  const failedText = r.m.text(mark),
    failedCycles = r.m.cycles - start;
  const resetBeforeSuccess = counts.FNRESET;
  refusal.on = false;
  r.m.type("\r");
  run(
    prompt,
    "normal prompt after explicit retry with original backend recovered",
  );
  assert.equal(counts.FNRESET, resetBeforeSuccess + 1);
  assert.equal(counts.WBOOTR, 1);
  assert.equal(classic(r.m, r.m.sym("ERRMODE")), 0);
  assert.equal(classic(r.m, r.m.sym("USERNO")), user);
  assert.equal(classic(r.m, r.m.sym("DEFDRV")), 1, "saved B restored");
  const restoredDPH = r.m.sym("DPHTAB") + 16;
  assert.equal(classic(r.m, r.m.sym("CURDRV")), 1);
  assert.equal(word(r.m, r.m.sym("DPHPTR")), restoredDPH);
  assert.equal(word(r.m, r.m.sym("DPBPTR")), word(r.m, restoredDPH + 10));
  assert.equal(word(r.m, r.m.sym("ALVPTR")), word(r.m, restoredDPH + 14));
  assert.equal(word(r.m, r.m.sym("DEFDPB")), word(r.m, restoredDPH + 10));
  assert.equal(word(r.m, r.m.sym("DEFALV")), word(r.m, restoredDPH + 14));
  assert.ok(word(r.m, r.m.sym("LOGINV")) & 2, "restored B login is complete");
  assert.equal(
    word(r.m, r.m.sym("WARMV")) & 2,
    0,
    "no incomplete B rebuild is exposed",
  );
  assert.equal(classic(r.m, r.m.sym("HKCNT")), 0);
  assert.equal(counts.SDINIT, 0);
  assert.equal(sdInitializations, 0);
  for (const entry of cacheBefore) {
    const block = entry.tag.reduce(
      (sum, byte, index) => sum + byte * 2 ** (8 * index),
      0,
    );
    assert.deepEqual(
      Buffer.from(image.subarray(block * 512, (block + 1) * 512)),
      Buffer.from(entry.payload, "base64"),
      "all acknowledged coalesced bytes reach original card",
    );
  }
  const successful = {
    state: state(r.m),
    counts: { ...counts },
    text: r.m.text(mark),
    imageSHA256: sha(image),
    cycles: r.m.cycles - start,
  };
  assert.match(successful.text, new RegExp("\\r\\n" + (user || "") + "B>$"));
  const returnReceipt = finishBarePrompt(r.m);
  assert.equal(classic(r.m, r.m.sym("HKDEP")), 0);
  assert.ok(coherent, "failure state is at a coherent recovery input");
}

function delayedStartup(syntheticNMI) {
  const image = card();
  volume(image, "A").write("STARTUP.CMD", Buffer.from("USER 7\r\n"), {
    text: true,
    user: 3,
  });
  const imageBefore = sha(image);
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
  const byte = (at) => m.cpu.hardware.memory[at];
  const word = (at) => byte(at) | (byte(at + 1) << 8);
  const named = (name) => byte(m.sym(name));
  const run = (done, why) =>
    m.runUntil(() => (m.pumpInput(), done()), 30_000_000, why);
  run(
    () => m.pc === m.sym("CCPENT"),
    "cold bootstrap entry before CCP executes",
  );
  assert.equal(named("STPOS"), 0);
  assert.equal(m.sd.ready, true);
  assert.equal(m.expand, undefined);
  // Exercise the documented CCP entry register contract at a genuine cold
  // bootstrap boundary; user3/B is intentional input, not a normal cold default.
  m.cpu.cpu.c = 0x31;
  if (syntheticNMI) {
    m.write(0x66, 0xed);
    m.write(0x67, 0x45); // Test-only minimal RETN, no OS handler guarantee.
  } else assert.ok(m.read(0x66) !== 0xed || m.read(0x67) !== 0x45);
  const census = watch(m);
  const refusedBlocks = dirBlocks(image, "B");
  let refuse = true,
    refusedReads = 0;
  const handle = m.sd.handleCommand.bind(m.sd);
  m.sd.handleCommand = (command) => {
    if (
      refuse &&
      command.cmd === 17 &&
      refusedBlocks.has(m.sd.resolveAddress(command.arg) / 512)
    ) {
      refusedReads++;
      m.sd.pendingResponse = [0x04];
      m.sd.delayBytes = 1;
      return;
    }
    return handle(command);
  };
  const labels = [
    "CCPENT",
    "WBOOTR",
    "FNRESET",
    "FNSEL",
    "STBOOT",
    "STBDMA",
    "STLINE",
    "SHLINE",
    "MLTAKE",
    "FNCIN",
    "SDINIT",
  ];
  const counts = Object.fromEntries(labels.map((n) => [n, 0]));
  counts.NMI = 0;
  const at = new Map(labels.map((n) => [m.sym(n), n]));
  at.set(0x66, "NMI");
  const step = m.step.bind(m);
  m.step = () => {
    const n = at.get(m.pc);
    if (n) counts[n]++;
    return step();
  };
  const recovery = () =>
    counts.FNCIN > 0 &&
    m.classicBankIn &&
    named("ERRMODE") === 0xff &&
    named("HKDEP") === 1 &&
    named("HKBUSY") === 0 &&
    word(m.sym("OLDSP")) === m.sym("CSTKTOP") - 4 &&
    word(word(m.sym("OLDSP"))) === m.sym("CCPRKEY") + 5 &&
    m.waitingForInput();
  const start = m.cycles,
    mark = m.output.length;
  run(
    recovery,
    "saved B selection failure enters recovery after buffering startup",
  );
  assert.equal(named("USERNO"), 3);
  assert.equal(named("STPOS"), 1, "startup is buffered, pending, not executed");
  const load = Array.from({ length: 128 }, (_, i) =>
    byte(m.sym("LOADBUF") + i),
  );
  assert.equal(Buffer.from(load).subarray(0, 8).toString(), "USER 7\r\n");
  assert.deepEqual(
    [
      counts.FNRESET,
      counts.FNSEL,
      counts.STBOOT,
      counts.STBDMA,
      counts.STLINE,
      counts.MLTAKE,
      counts.SHLINE,
    ],
    [1, 1, 1, 1, 0, 0, 0],
  );
  assert.equal(
    refusedReads,
    1,
    "first failure really reaches B-directory SPI read",
  );
  const recoverySP = m.cpu.cpu.sp;
  const retries = [];
  for (const key of ["\r", "\n", "\r"]) {
    const previous = counts.FNCIN,
      resets = counts.FNRESET,
      selects = counts.FNSEL,
      refusedBefore = refusedReads;
    m.type(key);
    run(
      () => counts.FNCIN > previous && recovery(),
      "failed selection retry retains pending startup",
    );
    assert.equal(
      counts.FNRESET - resets,
      key === "\r" ? 1 : 0,
      "CRLF retries only once",
    );
    assert.equal(
      counts.FNSEL - selects,
      key === "\r" ? 1 : 0,
      "each reset succeeds and reaches saved-B selection",
    );
    assert.equal(
      refusedReads - refusedBefore,
      key === "\r" ? 1 : 0,
      "each failed selection reaches one refused SPI B-directory read",
    );
    assert.equal(m.cpu.cpu.sp, recoverySP);
    assert.equal(named("USERNO"), 3);
    assert.equal(named("STPOS"), 1);
    assert.deepEqual(
      Array.from({ length: 128 }, (_, i) => byte(m.sym("LOADBUF") + i)),
      load,
    );
    assert.deepEqual(
      [
        counts.STBDMA,
        counts.STLINE,
        counts.MLTAKE,
        counts.SHLINE,
        counts.WBOOTR,
      ],
      [1, 0, 0, 0, 0],
    );
    retries.push({ key, counts: { ...counts }, sp: m.cpu.cpu.sp });
  }
  refuse = false;
  m.type("\r");
  run(
    () => m.ready() && /\r\n7B>$/.test(m.text(mark)),
    "buffered startup executes after valid saved-drive restoration",
  );
  assert.equal(named("ERRMODE"), 0);
  assert.equal(named("USERNO"), 7, "delayed USER7 startup executed");
  assert.equal(named("DEFDRV"), 1);
  const dph = m.sym("DPHTAB") + 16;
  assert.equal(word(m.sym("DEFDPB")), word(dph + 10));
  assert.equal(word(m.sym("DEFALV")), word(dph + 14));
  assert.ok(word(m.sym("LOGINV")) & 2);
  assert.equal(word(m.sym("WARMV")) & 2, 0);
  assert.deepEqual(
    [counts.STBDMA, counts.MLTAKE, counts.SHLINE, counts.WBOOTR, counts.SDINIT],
    [1, 1, 0, 0, 0],
  );
  assert.equal(
    sha(image),
    imageBefore,
    "read-only bootstrap/startup does not alter card bytes",
  );
  const stacks = census();
  for (const [name, s] of Object.entries(stacks))
    assert.ok(
      s.deepest <= Math.floor((s.reserved * 3) / 4),
      name + " quarter-stack reserve",
    );
  if (syntheticNMI)
    assert.ok(counts.NMI > 0, "minimal test NMI actually entered");
  else assert.equal(counts.NMI, 0);
  const successful = {
    counts: { ...counts },
    stacks,
    cycles: m.cycles - start,
    text: m.text(mark),
    user: named("USERNO"),
    drive: named("DEFDRV"),
    sp: m.cpu.cpu.sp,
  };
  const normalization = finishBarePrompt(m);
  if (!syntheticNMI) {
    const allowances = { bdos: 8, bios: 12, ccp: 6, worker: 12 };
    for (const [name, s] of Object.entries(stacks))
      assert.ok(
        s.deepest + allowances[name] + 2 <= Math.floor((s.reserved * 3) / 4),
        name + " base plus service/NMI allowance",
      );
  }
}

function selectionRefusal() {
  const image = createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
    ],
    { drives: 3 },
  );
  const imageBefore = sha(image);
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
  const byte = (a) => m.cpu.hardware.memory[a],
    word = (a) => byte(a) | (byte(a + 1) << 8),
    named = (n) => byte(m.sym(n));
  const run = (done, why) =>
    m.runUntil(() => (m.pumpInput(), done()), 20_000_000, why);
  run(
    () => m.pc === m.sym("CCPENT"),
    "legitimate cold bootstrap before installing a selection-refusal hook",
  );
  assert.equal(m.sd.ready, true);
  assert.equal(named("DRVIDX"), 1);
  assert.equal(m.expand, undefined);
  // A normal container must assign A. Deliberately install a normal-return
  // BIOS SELDSK hook which refuses selection, to test error4 robustness after
  // a legitimate mount; this does not claim a supported no-A cold card.
  const hook = 0x5000;
  [0x21, 0, 0, 0xc9].forEach((v, i) => m.write(hook + i, v));
  [0xc3, hook & 255, hook >> 8].forEach((v, i) =>
    m.write(m.sym("BIOSEL") + i, v),
  );
  const counts = Object.fromEntries(
    [
      "CCPENT",
      "WBOOTR",
      "FNRESET",
      "FNCIN",
      "STBOOT",
      "SHLINE",
      "MLTAKE",
      "SDINIT",
      "SDWRITE",
    ].map((n) => [n, 0]),
  );
  const at = new Map(Object.keys(counts).map((n) => [m.sym(n), n]));
  const returns = [];
  let hookCalls = 0;
  const step = m.step.bind(m);
  m.step = () => {
    const n = at.get(m.pc);
    if (n) counts[n]++;
    if (m.pc === hook) hookCalls++;
    if (m.pc === m.sym("CCPRST") + 5)
      returns.push({ a: m.cpu.cpu.a, h: m.cpu.cpu.h });
    return step();
  };
  const recovery = () =>
    counts.FNCIN > 0 &&
    m.classicBankIn &&
    named("ERRMODE") === 255 &&
    named("HKDEP") === 1 &&
    named("HKBUSY") === 0 &&
    word(m.sym("OLDSP")) === m.sym("CSTKTOP") - 4 &&
    word(word(m.sym("OLDSP"))) === m.sym("CCPRKEY") + 5 &&
    m.waitingForInput();
  const mark = m.output.length,
    start = m.cycles;
  run(recovery, "selection error4 returns to distinct recovery input");
  const sp = m.cpu.cpu.sp;
  const retries = [];
  for (const key of ["x", "\r", "\n", "\r"]) {
    const resets = counts.FNRESET,
      inputs = counts.FNCIN;
    m.type(key);
    run(
      () => counts.FNCIN > inputs && recovery(),
      "unavailable A retry remains bounded",
    );
    assert.equal(counts.FNRESET - resets, key === "\r" ? 1 : 0);
    assert.equal(m.cpu.cpu.sp, sp);
    assert.equal(named("HKCNT"), 0);
    assert.equal(named("CPEND"), 0);
    assert.equal(word(m.sym("LOGINV")), 0);
    assert.equal(word(m.sym("WARMV")), 0);
    assert.equal(word(m.sym("DEFDPB")), 0);
    assert.equal(word(m.sym("DEFALV")), 0);
    assert.deepEqual(
      [
        counts.STBOOT,
        counts.SHLINE,
        counts.MLTAKE,
        counts.WBOOTR,
        counts.SDINIT,
        counts.SDWRITE,
      ],
      [0, 0, 0, 0, 0, 0],
    );
    retries.push({ key, counts: { ...counts }, sp: m.cpu.cpu.sp });
  }
  assert.deepEqual(returns, [
    { a: 255, h: 4 },
    { a: 255, h: 4 },
    { a: 255, h: 4 },
  ]);
  assert.equal(
    hookCalls,
    3,
    "each reset failure really takes the injected BIOS selection hook",
  );
  assert.equal(counts.CCPENT, 1);
  assert.equal(sha(image), imageBefore);
  assert.match(m.text(mark), /Disk reset failed\r\nEnter retries/);
  assert.deepEqual(m.violations, []);
}

for (const kind of ["same", "other"]) {
  test(`RIG4/5 bootstrap preserves dirty data on ${kind} uninitialised-card retries`, () =>
    pendingFailure(kind));
  test(`RIG4/5 recovery output escape preserves dirty data on ${kind} card`, () =>
    outputEscape(kind));
}
for (const user of [0, 3])
  test(`RIG4/5 explicit bootstrap retry commits retained data and restores user ${user} on B`, () =>
    backendRecovery(user));
for (const nmi of [false, true])
  test(`RIG4/5 saved-drive failure delays startup with ${nmi ? "minimal RETN NMI" : "base"} stack reserve`, () =>
    delayedStartup(nmi));
test(
  "RIG4/5 injected BIOS selection refusal returns error4 in bounded recovery",
  selectionRefusal,
);
