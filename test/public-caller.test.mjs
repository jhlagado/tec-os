// Actual returned-input ownership and phase snapshots for synthetic callers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rig, DMA, FCB } from "./lib/coalesce.mjs";
import { rig as fileRig } from "./lib/warmboot.mjs";
import { finishBarePrompt, publicContext, recoveryInput } from "./lib/public-caller.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const snapshot = r => ({
  pc: r.m.pc, sp: r.m.cpu.cpu.sp, cycles: r.m.cycles,
  output: r.m.text(0), image: sha(r.image),
  writes: [...r.t.writes], reads: [...r.t.reads],
  depth: r.m.read(r.m.sym("HKDEP")), busy: r.m.read(r.m.sym("HKBUSY")),
  queue: r.m.read(r.m.sym("HKCNT")),
});

function rejectedActiveInput(r) {
  const before = snapshot(r);
  assert.equal(before.depth, 1);
  assert.throws(() => r.bdos(12), /HKDEP: no inherited or busy API context/);
  assert.deepEqual(snapshot(r), before, "rejecting a suspended-input caller consumes no input or guest work");
  return before;
}

test("RIG4 root fixture commits a real write on the next light call and preserves explicit input phases", () => {
  const r = rig();
  assert.equal(r.m.pc, r.m.sym("MLGOT"));
  assert.ok(r.normalization.cycles > 0);
  publicContext(r.m);
  r.name("ROOT    DAT");
  assert.notEqual(r.bdos(22, FCB).a, 0xff);
  r.bdos(26, DMA);
  r.put(0);
  const beforeWrite = r.t.writes.length;
  assert.equal(r.bdos(21, FCB).a, 0);
  assert.equal(r.t.writes.length, beforeWrite, "first accepted data record remains cached");
  assert.equal(r.m.read(r.m.sym("HKCNT")), 1);
  assert.equal(r.onCard(0), false);
  assert.equal(r.bdos(12).a, 0x22);
  assert.equal(r.t.writes.length, beforeWrite + 1, "the next root light call supplies exactly one actual SD write");
  assert.equal(r.m.read(r.m.sym("HKCNT")), 0);
  assert.equal(r.onCard(0), true, "the acknowledged record reaches its actual card block");
  publicContext(r.m);

  const commandEntry = r.warm();
  assert.match(commandEntry, /\r\nB>$/);
  assert.equal(recoveryInput(r.m), false);
  r.m.command("USER 3");
  r.m.runUntil(() => r.m.ready(), 20_000_000, "user command prompt");
  const command = rejectedActiveInput(r);
  const completedCommand = finishBarePrompt(r.m);
  assert.equal(completedCommand.before.cycles, command.cycles);
  assert.equal(r.bdos(32, 0xff).a, 3);

  const warmText = r.warm();
  assert.equal(recoveryInput(r.m), false);
  const warm = rejectedActiveInput(r);
  assert.ok(warm.output.endsWith(warmText));
  const completedWarm = finishBarePrompt(r.m);
  assert.equal(completedWarm.before.cycles, warm.cycles);
  assert.equal(r.bdos(12).a, 0x22);

  r.reset();
  const reset = rejectedActiveInput(r);
  const completedReset = finishBarePrompt(r.m);
  assert.equal(completedReset.before.cycles, reset.cycles);
  assert.equal(r.bdos(12).a, 0x22);
});

test("RIG4 failed warm fixture stops once at recovery without automatic retry or hidden input completion", () => {
  const r = rig({ budget: 20_000_000 });
  r.name("PENDING DAT");
  assert.notEqual(r.bdos(22, FCB).a, 0xff);
  r.bdos(26, DMA);
  r.refuse();
  r.put(0);
  assert.equal(r.bdos(21, FCB).a, 0);
  assert.equal(r.onCard(0), false);
  assert.equal(r.m.read(r.m.sym("HKCNT")), 1);
  let resets = 0;
  const step = r.m.step.bind(r.m);
  r.m.step = () => { if (r.m.pc === r.m.sym("FNRESET")) resets++; return step(); };
  const beforeCard = sha(r.image);
  const text = r.warm();
  assert.match(text, /Disk reset failed\r\nEnter retries/);
  assert.equal(recoveryInput(r.m), true);
  assert.equal(resets, 1, "the helper did not turn a quiet recovery input into repeated Enter retries");
  assert.equal(sha(r.image), beforeCard);
  assert.equal(r.m.read(r.m.sym("HKCNT")), 1);
  rejectedActiveInput(r);
  const before = snapshot(r);
  assert.throws(() => finishBarePrompt(r.m), /normalization requires an actual waiting prompt|ordinary CCP BDOS 10 owns the input/);
  assert.deepEqual(snapshot(r), before, "normal-prompt completion never acts on bootstrap recovery input");
});

test("RIG4 shared file caller preserves root results and explicit command-to-call input ownership", () => {
  const r = fileRig();
  const { m } = r;
  assert.ok(r.normalization.cycles > 0);
  assert.equal(r.reads, 0, "initial completion precedes the read observer");
  publicContext(m);
  const parked = { pc: m.pc, sp: m.cpu.cpu.sp };
  assert.equal(r.bdos(12), 0x22);
  assert.equal(m.cpu.cpu.l, 0x22, "the returned HL remains available to callers");
  assert.deepEqual({ pc: m.pc, sp: m.cpu.cpu.sp }, parked);
  const warm = r.warm();
  assert.equal(warm.outcome, "normal");
  assert.equal(warm.text, m.text(m.mark));
  m.command("USER 3");
  m.runUntil(() => m.ready(), 20_000_000, "the command's input request");
  const stopped = { pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles, output: m.text(0), reads: r.reads, image: sha(r.image) };
  assert.throws(() => r.bdos(12), /HKDEP: no inherited or busy API context/);
  assert.deepEqual({ pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles, output: m.text(0), reads: r.reads, image: sha(r.image) }, stopped);
  const completion = finishBarePrompt(m);
  assert.equal(completion.before.cycles, stopped.cycles);
  assert.equal(r.bdos(32, 0xff), 3);
  publicContext(m);
});

test("RIG4 shared warm result exposes retained bootstrap recovery without acknowledging it", () => {
  const r = fileRig();
  const { m } = r;
  m.command("B:");
  m.runUntil(() => m.ready(), 20_000_000, "the selected drive's input request");
  const selection = finishBarePrompt(m);
  assert.ok(selection.cycles > 0);
  r.fcb(1, "PENDING DAT");
  assert.notEqual(r.bdos(22), 0xff);
  r.bdos(26, DMA);
  let attempts = 0;
  m.sd.commitWrite = () => {
    attempts++;
    m.sd.writeState = null;
    m.sd.pendingResponse = [0x0d, 0xff];
    m.sd.delayBytes = 1;
  };
  for (let k = 0; k < 128; k++) m.write(DMA + k, k ^ 0xa5);
  assert.equal(r.bdos(21), 0);
  assert.equal(m.read(m.sym("HKCNT")), 1);
  assert.notEqual(m.read(m.sym("CPEND")), 0, "A's pending write can refuse its default-drive rebuild");
  let resets = 0;
  const step = m.step.bind(m);
  m.step = () => { if (m.pc === m.sym("FNRESET")) resets++; return step(); };
  const before = { cycles: m.cycles, image: sha(r.image), writes: attempts };
  const result = r.warm();
  assert.equal(result.outcome, "recovery");
  assert.match(result.text, /Disk reset failed\r\nEnter retries/);
  assert.equal(result.text, m.text(m.mark));
  assert.equal(result.t, m.cycles - before.cycles);
  assert.equal(result.reads, r.reads);
  assert.equal(recoveryInput(m), true);
  assert.equal(resets, 1);
  assert.ok(attempts > before.writes, "the actual backend refused pending work");
  assert.equal(m.read(m.sym("HKCNT")), 1);
  assert.equal(sha(r.image), before.image);
  const stopped = { pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles, attempts, output: m.text(0) };
  assert.throws(() => r.bdos(12), /HKDEP: no inherited or busy API context/);
  assert.deepEqual({ pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles, attempts, output: m.text(0) }, stopped);
});
