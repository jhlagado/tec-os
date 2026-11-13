// Actual returned-input ownership and phase snapshots for synthetic callers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rig, DMA, FCB } from "./lib/coalesce.mjs";
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
