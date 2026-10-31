// A:STARTUP.CMD at cold boot: its one record, its lines run from MLREAD, the
// keypad's skip, and a card with GLCD.DRV on boards with and
// without a GLCD. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { makeDrv } from "../tools/lib/drv.mjs";
import { Machine } from "./lib/machine.mjs";
import { GLCD_DRV, ROOT, TEST_CLOCK, program, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

function start(files, { key = false, ...opts } = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\n\x1a", "latin1"));
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, ...opts });
  if (key) m.tec1g.applyKeySilent(0x01, true);
  return m;
}
const prompt = (m, max = 400_000_000) => m.runUntil(() => m.ready() && /[A-P]>$/.test(m.text(0)), max, "a usable prompt");
const user = (m) => m.read(4) >> 4;

test("each line runs, echoed, and a failing one prints its message; a warm boot doesn't run the file", () => {
  const m = start({ "STARTUP.CMD": startupFile("NOSUCH", "", "USER 3", "TYPE HELLO.TXT") });
  prompt(m);
  const text = m.text(0);
  assert.match(text, /A>NOSUCH\r\r\nNOSUCH\?/);
  assert.match(text, /A>TYPE HELLO.TXT\r\r\n/);
  assert.equal(user(m), 3);
  const mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(mark)), 200_000_000, "warm boot");
  assert.doesNotMatch(m.text(mark), /USER/);
});

test("a file with no lines, and no file, reach the prompt; a file over one record ends at it", () => {
  prompt(start({ "STARTUP.CMD": new Uint8Array(0) }));
  prompt(start({}));
  const m = start({ "STARTUP.CMD": Buffer.from("USER 1\r\n".repeat(60) + "USER 2\r\n\x1a", "latin1") });
  prompt(m);
  assert.equal((m.text(0).match(/USER 1/g) ?? []).length, 16, "the lines whole in the record");
  assert.equal(user(m), 1);
});

test("a key held through reset skips the file: a hanging INIT reaches a prompt, and with no key it hangs", async () => {
  const defs = { FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, DRVNAME: '"HANG    "', SVCNAME: '"HANG    "', SVCVER: 1 };
  for (const v of ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFAIL", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO"]) defs[v] = 0;
  defs.V_HANG = 1;
  const { file } = await makeDrv(resolve(ROOT, "test/programs/drvdemo.asm"), { defs, work: resolve(ROOT, "build/drv") });
  const files = { "HANG.DRV": file, "STARTUP.CMD": startupFile("HANG.DRV") };
  const held = start(files, { key: true });
  prompt(held);
  assert.equal(held.read(held.sym("DRVHEAD")), 0);
  const free = start(files);
  assert.throws(() => prompt(free, 60_000_000));
  assert.ok(free.pc < 0xc000, "in the driver");
});

for (const [name, opts] of [["no GLCD", { matrix: true, glcd: false }], ["no matrix keyboard", {}]]) {
  test(`a machine with ${name} refuses GLCD.DRV from the file and the prompt follows`, () => {
    const m = start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("GLCD.DRV") }, opts);
    prompt(m);
    assert.match(m.text(0), /GLCD\.DRV\?/);
    assert.equal(m.read(m.sym("DRVHEAD")), 0);
    assert.equal(m.read(3) & 3, 0, "TTY:");
  });
}

const SAY = (await program("say")).bytes;
const raw = (text) => Buffer.from(text, "latin1");

test("a file of exactly 128 bytes runs its last byte, and reads no further", () => {
  const m = start({ "STARTUP.CMD": raw("\r".repeat(121) + "USER 13") });
  m.write(m.sym("STREC") + 128, 0x5a); // past the record: a byte that would spoil the line
  prompt(m);
  assert.equal(user(m), 13);
});

test("^Z and a zero each end the file", () => {
  for (const end of ["\x1a", "\0"]) {
    const m = start({ "STARTUP.CMD": raw(`USER 3\r\n${end}\r\nUSER 4\r\n`) });
    prompt(m);
    assert.equal(user(m), 3, JSON.stringify(end));
  }
});

test("the DMA address is the default's after the read, with a file and without", () => {
  for (const files of [{}, { "STARTUP.CMD": raw("\x1a") }]) {
    const m = start(files);
    prompt(m);
    assert.equal(m.read(m.sym("CURDMA")) | (m.read(m.sym("CURDMA") + 1) << 8), 0x80);
  }
});

test("a read that returns an error starts nothing, whatever the record holds", () => {
  const m = start({ "STARTUP.CMD": new Uint8Array(0) });
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("STBOOT")) [..."USER 5\r\n"].forEach((c, i) => m.write(m.sym("STREC") + i, c.charCodeAt(0)));
    return step();
  };
  prompt(m);
  assert.equal(user(m), 0);
});

test("NAME.DRX is no driver: the type must be DRV in full", () => {
  const m = start({ "SAY.COM": SAY });
  prompt(m);
  assert.doesNotMatch(m.command("SAY.DRX"), /SAY\.DRX\?/);
});

test("a reset clears the position, so the file runs again", () => {
  const m = start({ "STARTUP.CMD": startupFile("USER 3") });
  prompt(m);
  m.reset();
  const from = m.output.length;
  m.runUntil(() => m.ready() && /[A-P]>$/.test(m.text(from)), 400_000_000, "the prompt after reset");
  assert.match(m.text(from), /A>USER 3/);
});

/** Each line's output and BDOS calls from MLGOT to the next MLREAD. */
function trace(m) {
  const rows = [];
  let row = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    if (pc === m.sym("MLGOT")) {
      row = { from: m.output.length, calls: [] };
      rows.push(row);
    }
    if (pc === m.sym("MLREAD") && row) {
      row.output = m.text(row.from);
      delete row.from;
      row = null;
    }
    if (pc === 5 && row) {
      const c = m.cpu.cpu;
      const de = (c.d << 8) | c.e;
      if (c.c === 9) {
        let s = "";
        for (let a = de; m.read(a) !== 0x24; a += 1) s += String.fromCharCode(m.read(a));
        row.calls.push([9, s]);
      } else row.calls.push([c.c, [10, 26].includes(c.c) || (c.c >= 15 && c.c <= 23) ? de : c.e]);
    }
    return step();
  };
  return rows;
}

for (const [name, lines] of [
  ["a built-in then a line", ["TYPE HELLO.TXT", "DIR"]],
  ["a program's warm boot then a line", ["SAY", "DIR"]],
  ["a failing line then a line", ["NOSUCH", "DIR"]],
  ["USER 3 then a line", ["USER 3", "DIR"]],
]) {
  test(`lines from the file equal the same lines typed: ${name}`, () => {
    const f = start({ "SAY.COM": SAY, "STARTUP.CMD": startupFile(...lines) });
    const fromFile = trace(f);
    prompt(f);
    const t = start({ "SAY.COM": SAY, "STARTUP.CMD": raw("\x1a") });
    prompt(t);
    const byHand = trace(t);
    for (const line of lines) t.command(line);
    const upper = (rows) => rows.map((r) => ({ ...r, output: r.output.toUpperCase() }));
    assert.deepEqual(upper(fromFile), upper(byHand));
  });
}

test("an unreadable file reaches a prompt, and what it held doesn't run", () => {
  const m = start({ "STARTUP.CMD": startupFile("NEVERRUN") });
  const lba = Math.floor(Buffer.from(m.sdImage.buffer, m.sdImage.byteOffset, m.sdImage.length).indexOf("NEVERRUN") / 512);
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("SDREAD")) {
      const a = m.sym("SDLBA");
      if ((m.read(a) | (m.read(a + 1) << 8) | (m.read(a + 2) << 16)) === lba) m.cpu.cpu.pc = m.sym("SDRCMD");
    }
    return step();
  };
  for (let i = 0; i < 12 && !(m.ready() && /[A-P]>$/.test(m.text(0))); i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.ready() && /[A-P]>$/.test(m.text(0))), 40_000_000, "the error's key");
    if (m.waitingForInput() && !/[A-P]>$/.test(m.text(0))) m.type("\r");
  }
  assert.ok(m.ready() && /[A-P]>$/.test(m.text(0)));
  assert.match(m.text(0), /Bad Sector/);
  assert.doesNotMatch(m.text(0), /NEVERRUN/);
  assert.match(m.command("DIR HELLO.TXT"), /HELLO\.TXT/);
});

test("a file that resets the machine runs for ever, and the skip breaks it", () => {
  const files = { "RESET.COM": Uint8Array.from([0xc3, 0x00, 0xc0]), "STARTUP.CMD": startupFile("RESET") };
  const m = start(files);
  let resets = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("COLD")) resets += 1;
    return step();
  };
  m.runUntil(() => resets >= 4, 400_000_000, "four resets");
  const held = start(files, { key: true });
  prompt(held);
  assert.match(held.command("DIR HELLO.TXT"), /HELLO\.TXT/);
});
