// The GLCD console as a resident below (0006h): over the stack census's
// workload and CONOUT.COM, the ST7920's graphics RAM equals what b025dbb's
// driver in EXPAND 1 drew (test/glcd-screens.json); (0006h) is three pages
// lower than it was with the driver; a program on the CCP stack can call
// the BIOS's CONOUT directly in the 28 bytes it has; and UNLOAD gives the
// console and the pages back. Emulator evidence.
// The screens that show SAVE to a read-only volume were retaken: it came to say R/O.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, fcbType, program, romFor, standardCard, volume, withDisplay } from "./lib/fixtures.mjs";

const REF = JSON.parse(readFileSync(resolve(ROOT, "test/glcd-screens.json"), "utf8"));
const PROGRAMS = ["probe", "term", "insdel", "region", "flip", "vidmode", "conout", "fill"];
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

async function card() {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  const a = volume(image, "A");
  for (const n of PROGRAMS) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("DATA.BIN", new Uint8Array(20000).map((_, i) => i & 0xff));
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1}\r\n`).join("") + "\x1a", "latin1"));
  return withDisplay(image, { matrix: true });
}

/** A GLCD board at its first prompt, the GLCD console loaded; or, with
 *  matrix false, a serial board on the same card, which never loads it. */
async function board({ matrix = true } = {}) {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: await card(), clock: TEST_CLOCK, matrix });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}

/** Type a line and run to the prompt, answering [more] or an error's key. */
function run(m, line) {
  m.mark = m.output.length;
  m.type(line);
  const prompt = /\r\n[A-P]>$/;
  let seen = -1;
  for (let i = 0; i < 400; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(m.mark))), 30_000_000, line);
    const t = m.text(m.mark);
    if (prompt.test(t) && m.waitingForInput()) return;
    if (m.output.length === seen && m.waitingForInput()) m.type(/\[more\]$/.test(t) ? " " : "\r");
    seen = m.output.length;
  }
  throw new Error(`no prompt after ${JSON.stringify(line)}`);
}

/**
 * The deepest BIOS CONOUT call made by a program (its return address in the
 * TPA): the caller's SP before the CALL less the lowest SP during it, so the
 * return address counts. And the lowest address written in the BDOS stack.
 */
function watch(m) {
  const entry = m.sym("BCONOUT");
  const [base, top] = [m.sym("STKBASE"), m.sym("STKTOP")];
  let program = 0;
  let bdosLow = top;
  let active = null;
  const step = m.step.bind(m);
  m.step = () => {
    const r = step();
    const sp = m.cpu.cpu.sp & 0xffff;
    if (!active && m.pc === entry && word(m, sp) < 0x8000) active = { sp0: sp, ret: word(m, sp), min: sp };
    else if (active) {
      active.min = Math.min(active.min, sp);
      if (m.pc === active.ret && sp === active.sp0 + 2) [(program = Math.max(program, active.sp0 + 2 - active.min)), (active = null)];
    }
    return r;
  };
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir && addr >= base && addr < top) bdosLow = Math.min(bdosLow, addr);
    write(addr, value);
  };
  return () => ({ program, bdos: { reserved: top - base, deepest: top - bdosLow } });
}

const workload = (async () => {
  const m = await board();
  const depths = watch(m);
  const bdosVector = word(m, 6);
  const screens = REF.screens.map(({ line }) => {
    run(m, line);
    const gdram = createHash("sha256").update(Uint8Array.from(m.tec1g.state.display.glcdCtrl.glcd)).digest("hex").slice(0, 16);
    return { line, gdram };
  });
  return { m, bdosVector, screens, depths: depths() };
})();

test("the resident GLCD draws every screen of the workload as the driver did, byte for byte", { timeout: 1_800_000 }, async () => {
  const { m, screens } = await workload;
  assert.deepEqual(screens, REF.screens, `the ST7920's graphics RAM against ${REF.from}'s driver`);
  assert.deepEqual(m.violations, []);
});

test("on a GLCD board (0006h) is three pages lower than with the driver, and no more", { timeout: 1_800_000 }, async () => {
  const { bdosVector } = await workload;
  assert.equal(bdosVector, REF.bdosVector - 0x306);
});

test("a program on the CCP stack calls CONOUT directly in its 28 bytes, and the BDOS stack keeps a quarter free", { timeout: 1_800_000 }, async () => {
  const { m, depths } = await workload;
  const free = m.sym("CSTKTOP") - 2 - m.sym("CSTKBAS");
  assert.equal(free, 28);
  assert.ok(depths.program > 0 && depths.program <= free, `CONOUT took ${depths.program} bytes of a program's ${free}`);
  const { reserved, deepest } = depths.bdos;
  assert.ok((reserved - deepest) * 4 >= reserved, `the BDOS stack used ${deepest} of ${reserved}`);
});

test("UNLOAD gives the console back to serial and the pages to the TPA, and output then reaches serial", async () => {
  const before = word(await board({ matrix: false }), 6); // the same card with no GLCD
  const m = await board();
  const loaded = word(m, 6);
  run(m, "CONOUT\r");
  m.mark = m.output.length;
  m.type("UNLOAD\r");
  m.runUntil(() => m.waitingForInput() && m.read(m.sym("CONMOD")) === 0 && /[A-P]>$/.test(m.text(m.mark)), 50_000_000, "the prompt after UNLOAD");
  assert.equal(word(m, 6), before);
  assert.equal(loaded, (before & 0xff00) - 0x300);
  const s0 = m.serialText().length;
  m.type("FILL\r"); // HALT over the freed pages, then a line through the BDOS
  m.runUntil(() => m.serialText().slice(s0).includes("FILLED") && m.waitingForInput(), 60_000_000, "FILL's line on serial");
  assert.deepEqual(m.violations, []);
});

test("a second GLCD.SVC is refused whole, and the first keeps the console", async () => {
  const m = await board();
  const table = word(m, m.sym("GLVEC"));
  const first = word(m, 6);
  const from = m.output.length;
  run(m, "GLCD.SVC\r");
  assert.match(m.text(from), /GLCD\.SVC\?/);
  assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
  assert.deepEqual([word(m, 6), word(m, m.sym("GLVEC")), m.read(3) & 3], [first, table, 3]);
  m.mark = m.output.length;
  m.type("UNLOAD\r");
  m.runUntil(() => m.waitingForInput() && m.read(m.sym("CONMOD")) === 0 && /[A-P]>$/.test(m.text(m.mark)), 50_000_000, "the prompt after UNLOAD");
  assert.equal(word(m, m.sym("GLVEC")), 0, "the first gave it back");
  assert.deepEqual(m.violations, []);
});

test("the GLCD hook takes a table and returns LINEBUF, refuses a second, and with 0 gives the console back", async () => {
  const m = await board({ matrix: false });
  const STUB = 0x0080;
  const TABLE = 0x3000;
  const callHook = (hl) => {
    [0x06, 3, 0x21, hl & 0xff, hl >> 8, 0x0e, 12, 0xcd, m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
    m.cpu.cpu.sp = 0x0100;
    m.cpu.cpu.pc = STUB;
    m.runUntil(() => m.pc === STUB + 10, 1_000_000, "TNDRVR");
    const c = m.cpu.cpu;
    return { hl: (c.h << 8) | c.l, carry: c.flags.C };
  };
  assert.equal(word(m, m.sym("GLVEC")), 0, "no table on a serial board");
  assert.equal(callHook(TABLE).carry, 1, "and no keyboard, no table");
  m.write(m.sym("CONDEV"), m.read(m.sym("CONDEV")) | 1);
  assert.deepEqual(callHook(TABLE), { hl: m.sym("LINEBUF"), carry: 0 });
  assert.equal(word(m, m.sym("GLVEC")), TABLE);
  assert.deepEqual(callHook(TABLE + 0x100), { hl: TABLE + 0x100, carry: 1 }, "a second table refused, HL as given");
  assert.equal(word(m, m.sym("GLVEC")), TABLE, "and the first kept");
  m.write(m.sym("CONMOD"), 3);
  callHook(0);
  assert.deepEqual([word(m, m.sym("GLVEC")), m.read(m.sym("CONMOD"))], [0, 0], "the table dropped, the console serial, the vector the TMS9918's");
  assert.deepEqual(callHook(TABLE + 0x100), { hl: m.sym("LINEBUF"), carry: 0 }, "and a table taken again");
  assert.deepEqual(m.violations, []);
});
