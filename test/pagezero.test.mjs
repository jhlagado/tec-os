// Page zero's 0041h-004Fh are the program's (KS36c): the ROM reads and writes
// nothing there from cold boot, through the console, a display, the keyboard,
// the disk and a warm boot. Only LATCHV, at 0040h, stays. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Machine } from "./lib/machine.mjs";
import { GLCD_SVC, PICO_SVC, TEST_CLOCK, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

/** Every access to 0041h-004Fh while the CPU runs ROM code, from the first
 *  instruction: all but cold boot's clear of page zero, COLDZ's LDIR, which
 *  leaves the bytes zero for the program, as CP/M 2.2's cold boot does. */
function watch(m) {
  const seen = [];
  const hw = m.cpu.hardware;
  const [clear, after] = [m.sym("COLDZ"), m.sym("COLDZ") + 16];
  const rom = () => (m.cpu.cpu.pc >= 0xc000 || m.cpu.cpu.pc < 0x0800) && !(m.cpu.cpu.pc >= clear && m.cpu.cpu.pc < after);
  const read = hw.memRead;
  const write = hw.memWrite;
  hw.memRead = (addr) => {
    if (addr >= 0x41 && addr <= 0x4f && rom()) seen.push(["read", addr, m.cpu.cpu.pc]);
    return read(addr);
  };
  hw.memWrite = (addr, value) => {
    if (addr >= 0x41 && addr <= 0x4f && rom()) seen.push(["write", addr, m.cpu.cpu.pc]);
    return write(addr, value);
  };
  return seen;
}

for (const [name, opts, files] of [
  ["serial and the matrix keyboard", { matrix: true }, {}],
  ["the PICO9918 and the GLCD", { tms: true, matrix: true }, { "PICO.SVC": PICO_SVC["PICO.SVC"], "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("PICO.SVC", "GLCD.SVC") }],
]) {
  test(`the ROM leaves 0041h-004Fh alone on ${name}: cold boot, commands, a scroll, escapes, CON, the keyboard and a warm boot`, () => {
    const image = standardCard();
    const a = volume(image, "A");
    for (const [n, bytes] of Object.entries(files)) a.write(n, bytes);
    const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, ...opts });
    const seen = watch(m);
    m.expect(/A>$/, { from: 0, maxCycles: 400_000_000 });
    m.runUntil(() => m.ready(), 400_000_000, "a usable prompt, after STARTUP.CMD");
    // A line on the console's own keyboard: the matrix's on a display, serial's otherwise.
    const say = (line) => {
      m.mark = m.output.length;
      if (m.read(3) & 1) m.typeMatrix(`${line}\r`);
      else m.type(`${line}\r`);
      m.runUntil(() => m.waitingForInput() && /\d*[A-P]>$/.test(m.text(m.mark)), 400_000_000, line);
    };
    for (const line of ["DIR", "TYPE HELLO.TXT", "USER 3", "USER 0", "CON"]) say(line);
    for (let i = 0; i < 30; i += 1) say("DIR HELLO.TXT");
    for (const line of ["CON UC1", "DIR", "CON CRT", "DIR", "CON TTY", "DIR"]) say(line);
    m.cpu.cpu.pc = 0;
    m.runUntil(() => m.waitingForInput(), 400_000_000, "warm boot");
    assert.ok(m.output.length > 0);
    assert.deepEqual(seen.slice(0, 5).map(([k, at, pc]) => `${k} ${at.toString(16)} at ${pc.toString(16)}`), []);
  });
}
