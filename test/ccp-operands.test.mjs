// The CCP's operands: one command line for each branch of the built-ins'
// argument, parser and end checks, in order, since files persist. Console
// output and the BDOS calls of each line are held against a fixture taken
// from the prior ROM, so the fixture proves the behaviour is kept; CON UC1
// was retaken when modules left, again when GLCD.SVC took its font, six
// records longer, and again when the type in its FCBs became SVC, those two
// hashes alone. SHELLC and SHELLE left with the nested levels. A
// function 9 call is compared by its text, not its address, since the ROM's
// data moves when the table grows. The CCP's peak is read per command against
// that ROM's: nothing may add to it. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContainer } from "../tools/lib/container.mjs";
import { GLCD_SVC, ROOT, boot, volume } from "./lib/fixtures.mjs";

const FIXTURE = JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/ccp-operands.json"), "utf8"));
const PROFILE = "debug80";

const fill = (v, size, name) => {
  try {
    for (let i = 0; i < 4096; i += 1) v.write(name(i), new Uint8Array(size).fill(i));
  } catch {
    // Full, as intended.
  }
};

/** A card with the files the lines read, B: out of blocks and D: out of directory entries. */
async function card({ glcd = false } = {}) {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G1M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
    { geometry: "G1M", label: "NAMES", mount: "D" },
  ]);
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\n\x1a", "latin1"));
  a.write("KEEP.TXT", Buffer.from("keep\r\n\x1a", "latin1"));
  a.write("BIG.BIN", new Uint8Array(30000).fill(0x55));
  // Two files of the sizes of programs that have gone, so that DIR's rows hold.
  a.write("SHELLC.PRL", new Uint8Array(512));
  a.write("SHELLE.PRL", new Uint8Array(512));
  if (glcd) a.write("GLCD.SVC", GLCD_SVC);
  const b = volume(image, "B");
  fill(b, 65536, (i) => `FILL${i}.BIN`);
  fill(b, 4096, (i) => `TOP${i}.BIN`);
  fill(volume(image, "D"), 1, (i) => `N${i}.TXT`);
  return image;
}

/** Note the deepest non-LDIR write to the CCP's stack, and each BDOS call. */
function watch(m) {
  const [base, top] = [m.sym("CSTKBAS"), m.sym("CSTKTOP")];
  const seen = { low: top, calls: [] };
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir && addr >= base && addr < top && addr < seen.low) seen.low = addr;
    write(addr, value);
  };
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 5) {
      const { c, d, e } = m.cpu.cpu;
      const de = (d << 8) | e;
      // A byte argument leaves a stale D, so only an address is compared whole.
      const named = c >= 15 && c <= 23;
      const fcb = named ? [...Array(36).keys()].map((i) => m.read(de + i)) : null;
      if (c === 9) {
        let text = "";
        for (let a = de; m.read(a) !== 0x24; a += 1) text += String.fromCharCode(m.read(a));
        seen.calls.push({ c, text, fcb });
      } else seen.calls.push({ c, ...([10, 26].includes(c) || named ? { de } : { e }), fcb });
    }
    return step();
  };
  return {
    start() {
      seen.low = top;
      seen.calls = [];
    },
    peak: () => top - seen.low,
    calls: () => seen.calls,
  };
}

/** Type a line and run to the prompt, answering a [more] or an error's key. */
function run(m, line) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  const prompt = /\r\n[A-P]>$/;
  let seen = -1;
  for (let i = 0; i < 200; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(m.mark))), 30_000_000, line);
    const t = m.text(m.mark);
    if (prompt.test(t) && m.waitingForInput()) return t;
    if (m.output.length === seen && m.waitingForInput()) m.type(/\[more\]$/.test(t) ? " " : "\r");
    seen = m.output.length;
  }
  throw new Error(`no prompt after ${JSON.stringify(line)}: ${m.text(m.mark)}`);
}

/** Run each row's line, reading what the fixture holds for it. */
function reading(m, fixture) {
  const log = watch(m);
  const rows = fixture.map(({ input }) => {
    log.start();
    const output = run(m, input);
    const calls = createHash("sha256").update(JSON.stringify(log.calls())).digest("hex");
    return { input, output, calls, peak: log.peak() };
  });
  assert.deepEqual(m.violations, []);
  const changed = rows.filter((r, i) => r.output !== fixture[i].output || r.calls !== fixture[i].calls);
  assert.deepEqual(changed.map((r) => r.input), []);
  return rows;
}

test("the built-ins' operands keep their output, BDOS calls and stack", { timeout: 300_000 }, async () => {
  assert.equal(FIXTURE.profile, PROFILE);
  assert.equal(FIXTURE.inputs.length, 78);
  const m = boot(await card(), { profile: PROFILE });
  const rows = reading(m, FIXTURE.inputs);
  const deep = rows.filter((r, i) => r.peak > FIXTURE.inputs[i].peak);
  assert.deepEqual(deep.map((r) => `${r.input}: ${r.peak}`), []);
});

test("CON UC1 on a PICO9918 and matrix board keeps its stack peak", { timeout: 300_000 }, async () => {
  assert.equal(FIXTURE.picoMatrix.length, 1);
  const m = boot(await card({ glcd: true }), { profile: PROFILE, tms: true, matrix: true });
  const [row] = reading(m, FIXTURE.picoMatrix);
  assert.equal(row.peak, FIXTURE.picoMatrix[0].peak);
});
