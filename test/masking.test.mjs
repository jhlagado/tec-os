// Interrupts off for each thing a stray interrupt could split: the VDP's
// control pairs of the ROM's PICO9918 console at every width, serial's two timed bytes, and each
// state put back as it was found. An NMOS Z80 can clear P/V if an interrupt
// comes during LD A,I, so each read that keeps the state is tried with P/V
// cleared after its first read. No interrupt is raised: iff1 is read at the
// port. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const STUB = 0x0060;
const VDPCTL = 0xbf;
const DIGPORT = 0x01;

/** Call ADDR from a stub with interrupts as ON says; each step passes through ON_STEP. */
function call(m, addr, regs, on, onStep) {
  [0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  const cpu = m.cpu.cpu;
  const saved = Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "sp", "pc"].map((r) => [r, cpu[r]]));
  const flags = { ...cpu.flags };
  const [iff1, iff2] = [cpu.iff1, cpu.iff2];
  cpu.iff1 = cpu.iff2 = on ? 1 : 0;
  const sp = 0x0100;
  m.write(sp - 2, STUB & 0xff);
  m.write(sp - 1, STUB >> 8);
  Object.assign(cpu, regs, { sp: sp - 2, pc: addr });
  for (let n = 0; m.pc !== STUB; n += 1) {
    assert.ok(n < 2_000_000, `no return from ${addr.toString(16)}`);
    onStep?.();
    m.step();
  }
  const after = !!cpu.iff1;
  Object.assign(cpu, saved, { flags });
  cpu.iff1 = iff1;
  cpu.iff2 = iff2;
  return after;
}

/** Fn with the writes to PORT counted, each with iff1. */
function watching(m, port, fn) {
  const seen = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (p, v) => {
    if ((p & 0xff) === port) seen.push(m.cpu.cpu.iff1 ? 1 : 0);
    io(p, v);
  };
  try {
    return [fn(), seen];
  } finally {
    m.cpu.hardware.ioWrite = io;
  }
}

/** A PICO9918 board on the ROM's console at COLS columns, its routines by their ROM labels. */
async function board(cols) {
  const image = standardCard();
  if (cols !== 80) volume(image, "A").write("STARTUP.CMD", startupFile(`CON PICO ${cols}`));
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "a usable prompt");
  assert.equal(m.read(m.sym("PIWID")), cols);
  return { m, at: (label) => m.sym(label) };
}

for (const name of [80, 40, 32]) {
  for (const [label, regs, least] of [
    ["TMSR2", {}, 2],
    ["TMSSET", {}, 16],
    ["GFXREG", { a: 0xf4, b: 7 }, 2],
    ["TMSWA", { h: 0x12, l: 0x34 }, 2],
    ["TMSRA", { h: 0x12, l: 0x34 }, 2],
  ]) {
    test(`${name} columns: ${label}'s pairs run with interrupts off, and the state comes back`, async () => {
      const { m, at } = await board(name);
      for (const on of [true, false]) {
        const [after, seen] = watching(m, VDPCTL, () => call(m, at(label), regs, on));
        assert.ok(seen.length >= least, `${seen.length} writes`);
        assert.deepEqual([...new Set(seen)], [0]);
        assert.equal(after, on);
      }
    });
  }
}

test("TXBYTE's port writes run with interrupts off, and the state comes back", () => {
  const m = boot(standardCard());
  for (const on of [true, false]) {
    const [after, seen] = watching(m, DIGPORT, () => call(m, m.sym("TXBYTE"), { a: 0x55 }, on));
    assert.ok(seen.length >= 10, `${seen.length} writes`);
    assert.deepEqual([...new Set(seen)], [0]);
    assert.equal(after, on);
  }
});

test("RXBITS's eight samples run with interrupts off, and the state comes back", () => {
  const m = boot(standardCard());
  const rxb = m.sym("RXB");
  for (const on of [true, false]) {
    const seen = [];
    const after = call(m, m.sym("RXBITS"), {}, on, () => {
      if (m.pc === rxb) seen.push(m.cpu.cpu.iff1 ? 1 : 0);
    });
    assert.equal(seen.length, 8);
    assert.deepEqual([...new Set(seen)], [0]);
    assert.equal(after, on);
  }
});

test("RXBITS samples bit 0 at its middle, with interrupts on and off", () => {
  const m = boot(standardCard());
  const rxb = m.sym("RXB");
  const bit = 4_000_000 / 4800;
  for (const on of [true, false]) {
    let start = -1;
    let first = -1;
    call(m, m.sym("RXBITS"), {}, on, () => {
      if (start < 0) start = m.cycles - 17; // the CALL
      if (first < 0 && m.pc === rxb) first = m.cycles;
    });
    // A poll sees the edge 19 T-states late on average, and the IN reads 11 after RXB.
    assert.ok(Math.abs(first + 11 - start + 19 - 1.5 * bit) <= 24, `the sample ${first + 11 - start + 19} T-states after the edge, on ${on}`);
  }
});

/** Call ADDR with interrupts on, clearing P/V once just after the first LD A,I at READ. */
function erratum(m, addr, regs, read, then = () => {}) {
  const cpu = m.cpu.cpu;
  let hit = 0;
  const after = call(m, addr, regs, true, () => {
    if (m.pc === read + 2 && !hit) {
      hit = 1;
      cpu.flags.P = 0;
    }
  });
  then();
  assert.equal(hit, 1, "the first read was reached");
  return after;
}

test("the erratum: CDI, HACC and MVCOPY keep interrupts on when P/V is false", () => {
  const m = boot(standardCard());
  const read = m.sym("IFFGET");
  const cdi = (() => {
    [0xcd, m.sym("CDI") & 0xff, m.sym("CDI") >> 8, 0xc3, m.sym("CEI") & 0xff, m.sym("CEI") >> 8].forEach((v, i) => m.write(0x0070 + i, v));
    return 0x0070;
  })();
  assert.equal(erratum(m, cdi, {}, read), true, "CDI and CEI");
  assert.equal(erratum(m, m.sym("HGET"), { b: 0, l: 0, h: 0xbd }, read), true, "HACC");
  m.write(m.sym("XMDST"), 0);
  m.write(m.sym("XMSRC"), 0);
  assert.equal(erratum(m, m.sym("MVCOPY"), { h: 0x40, l: 0, d: 0x41, e: 0, b: 0, c: 1 }, read), true, "MVCOPY");
});

test("the erratum: VPAIR keeps interrupts on when P/V is false, through IFFGET's second read", async () => {
  const { m, at } = await board(80);
  assert.equal(erratum(m, at("VPAIR"), { h: 0x82, l: 0 }, at("IFFGET")), true);
});
