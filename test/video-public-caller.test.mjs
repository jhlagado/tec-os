// First actual counted-input return on bare video consoles, with owned keys
// released and the next public BIOS call retaining its defined contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import {
  standardCard,
  withDisplay,
  TEST_CLOCK,
  romFor,
} from "./lib/fixtures.mjs";
import { publicContext } from "./lib/public-caller.mjs";
import {
  finishBareVideoPrompt,
  matrixInputState,
} from "./lib/video-public-caller.mjs";

for (const mode of ["PICO", "GLCD"])
  for (const controlEnter of [false, true]) {
    test(`RIG5 ${mode} first input return with ${controlEnter ? "Ctrl-M" : "Enter"} preserves the next public call`, () => {
      const opts =
        mode === "PICO"
          ? { tms: true, matrix: true, glcd: false, width: 40 }
          : { tms: false, matrix: true, glcd: true, width: 80 };
      const image = standardCard();
      withDisplay(image, opts);
      const m = new Machine({
        ...romFor(),
        sdImage: image,
        clock: TEST_CLOCK,
        ...opts,
      });
      m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
      m.runUntil(() => m.ready(), 200_000_000, "first bare video input");
      assert.equal(m.read(m.sym("CONMOD")), mode === "PICO" ? 1 : 3);
      const rejectedBefore = {
        pc: m.pc,
        sp: m.cpu.cpu.sp,
        cycles: m.cycles,
        input: matrixInputState(m),
      };
      m.tec1g.applyMatrixKey(1, 7, true);
      const held = matrixInputState(m);
      assert.throws(
        () => finishBareVideoPrompt(m, { controlEnter }),
        /pre-held or pending matrix keys/,
      );
      assert.deepEqual(
        matrixInputState(m),
        held,
        "unowned key is not released by helper rejection",
      );
      assert.deepEqual(
        { pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles },
        {
          pc: rejectedBefore.pc,
          sp: rejectedBefore.sp,
          cycles: rejectedBefore.cycles,
        },
      );
      m.tec1g.applyMatrixKey(1, 7, false);
      const returned = finishBareVideoPrompt(m, { controlEnter });
      assert.equal(returned.firstReturns, 1);
      assert.equal(m.pc, m.sym("MLGOT"));
      publicContext(m);
      assert.ok(returned.after.input.pending.every((v) => v === 255));
      if (controlEnter)
        assert.equal(
          returned.combo.row * 8 + returned.combo.col,
          0x30,
          "actual Ctrl-M letter key, with modifier",
        );
      const top = 0x5000,
        back = 0x3000;
      m.write(top - 2, back & 255);
      m.write(top - 1, back >> 8);
      const c = m.cpu.cpu,
        regs = {
          a: 0xa5,
          b: 0x12,
          c: 0x34,
          d: 0x56,
          e: 0x78,
          h: 0x9a,
          l: 0xbc,
          ix: 0x1357,
          iy: 0x2468,
        };
      const flags = { S: 1, Z: 0, Y: 1, H: 1, X: 0, P: 1, N: 0, C: 1 };
      Object.assign(c, regs, { sp: top - 2, pc: m.sym("RAMBIOS") + 30 });
      c.flags = { ...flags };
      m.runUntil(
        () => m.pc === back,
        50_000_000,
        "root BIOS SETTRK after first video return",
      );
      assert.deepEqual(
        Object.fromEntries(Object.keys(regs).map((n) => [n, c[n]])),
        regs,
      );
      assert.deepEqual(c.flags, flags);
      assert.equal(
        m.read(m.sym("DSKTRK")) | (m.read(m.sym("DSKTRK") + 1) << 8),
        0x1234,
      );
      assert.equal(c.sp, top);
      publicContext(m);
      const afterCall = {
        pc: m.pc,
        sp: c.sp,
        cycles: m.cycles,
        input: matrixInputState(m),
      };
      const mark = m.output.length;
      c.pc = 0;
      m.runUntil(
        () => m.ready() && /\r\nA>$/.test(m.text(mark)),
        200_000_000,
        "explicit warm transition back to video prompt",
      );
      m.typeMatrix("USER 3\r");
      m.runUntil(
        () => m.ready() && /\r\n3A>$/.test(m.text(mark)),
        200_000_000,
        "subsequent legitimate matrix command",
      );
      assert.equal(m.read(m.sym("USERNO")), 3);
      const secondReturn = finishBareVideoPrompt(m, { controlEnter });
      assert.equal(secondReturn.firstReturns, 1);
      publicContext(m);
      assert.ok(secondReturn.after.input.pending.every((v) => v === 255));
      assert.deepEqual(m.violations, []);
    });
  }
