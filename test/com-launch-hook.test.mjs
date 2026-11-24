// COMVEC, the armed COM launch (abi.inc): a resident service sets it to a
// callback in its own pages; CMDRUN calls it for a COM entered at 0100h with
// HL=0100h, DE=the image's end, BC=the closed loader FCB and A=the loading
// user, and a return leaves the launch to the CCP. A service's own entry does
// not take it, the arm survives a warm boot while its pages are resident,
// and warm boot clears a vector into freed pages.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { makeSvc } from "../tools/lib/svc.mjs";
import { ABI, ROOT } from "./lib/fixtures.mjs";
import { card, machine, runTo, word } from "./lib/mon3.mjs";

/** A warm boot through 0000h, as a COM's exit takes it, to the prompt. */
function warm(m) {
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.ready(), 45_000_000, "the prompt after a warm boot");
}

test("an armed COMVEC callback sees the prepared COM, the CCP still launches it, and the vector is dropped with its pages", async () => {
  const probe = await makeSvc(resolve(ROOT, "test/programs/comhook.asm"), { work: resolve(ROOT, "build/svc") });
  const m = machine(card({ "ARM.SVC": probe.file, "STEP.COM": Uint8Array.of(0xc9) }));
  assert.equal(ABI.COMVEC, m.sym("CVSLOT"), "abi.inc's COMVEC is the workspace's word");
  assert.equal(word(m, ABI.COMVEC), 0, "no launch armed at cold boot");
  m.command("ARM.SVC");
  const page = m.read(m.sym("SVCHEAD"));
  assert.ok(page, "service installed");
  const hook = word(m, ABI.COMVEC);
  assert.equal(hook >> 8, page, "installing entered it: COMVEC is its callback, in its pages");
  warm(m);
  assert.equal(word(m, ABI.COMVEC), hook, "the arm survives a warm boot while its pages are resident");
  for (const a of [0x120, 0x121]) m.write(a, 0xaa);
  m.command("ARM");
  assert.equal(word(m, 0x120), 0xaaaa, "the service's own entry does not call the callback");
  assert.equal(word(m, ABI.COMVEC), hook, "and leaves the arm in place");
  m.type("STEP X\r");
  runTo(m, 0x100);
  assert.equal(word(m, 0x120), 0x100, "HL: the entry");
  assert.equal(word(m, 0x122), 0x180, "DE: the image's end");
  assert.equal(m.read(0x124), "X".charCodeAt(0), "page zero's tail is prepared");
  assert.equal(word(m, 0x126), m.sym("CMDFCB"), "BC: the loader FCB");
  assert.equal(m.read(word(m, 0x126) + 1), "S".charCodeAt(0), "the FCB names the COM");
  assert.equal(m.read(0x128), 0, "A: the user it was loaded from");
  assert.equal(word(m, ABI.COMVEC), 0, "the callback took its one-shot arm");
  assert.equal(m.cpu.cpu.a, 0, "the normal launch flag");
  assert.equal(word(m, m.cpu.cpu.sp), 0, "the normal warm-boot return frame");
  m.runUntil(() => m.ready(), 45_000_000, "CCP after the COM");
  for (const a of [0x120, 0x121]) m.write(a, 0xaa);
  m.type("STEP Y\r");
  runTo(m, 0x100);
  assert.notEqual(word(m, 0x120), 0x100, "unarmed, the launch is unchanged");
  m.runUntil(() => m.ready(), 45_000_000, "CCP after the second COM");
  m.command("ARM");
  assert.equal(word(m, ABI.COMVEC), hook, "armed again");
  m.command("UNLOAD");
  assert.equal(m.read(m.sym("SVCHEAD")), 0, "service removed");
  assert.equal(word(m, ABI.COMVEC), 0, "REMOVE cleared its vector");
  m.write(ABI.COMVEC, hook & 0xff);
  m.write(ABI.COMVEC + 1, hook >> 8);
  warm(m);
  assert.equal(word(m, ABI.COMVEC), 0, "warm boot clears a vector into freed pages");
});
