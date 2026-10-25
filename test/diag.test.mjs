// The diagnostics ROM on the Debug80 TEC-1G model. Emulator evidence only:
// these runs prove the ROM's own logic and its arithmetic, not the board.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Machine, loadSymbols } from "./lib/machine.mjs";
import { ROOT, standardCard } from "./lib/fixtures.mjs";
import { buildDiag, STOPWATCH_T } from "../tools/diag.mjs";

const SLOW = { timeout: 600_000 };
let rom;
let symbols;

before(async () => {
  await buildDiag();
  rom = readFileSync(resolve(ROOT, "build/diag/diag.rom"));
  symbols = loadSymbols(resolve(ROOT, "build/diag/diag.d8.json"));
});

/** A machine running the diagnostics ROM, with helpers that talk to it over
 *  the serial port as a terminal user would. */
function diag(options = {}) {
  const m = new Machine({ rom, symbols, sdImage: standardCard(), tms: true, matrix: true, ramFill: 0x76, ...options });
  let mark = 0;
  m.wait = (pattern, maxCycles = 900_000_000) => {
    let seen = -1;
    m.runUntil(
      () => {
        if (m.serial.length === seen) return false;
        seen = m.serial.length;
        return pattern.test(m.serialText(mark));
      },
      maxCycles,
      `serial output ${pattern}`,
    );
    const text = m.serialText(mark);
    mark = m.serial.length;
    return text;
  };
  m.idle = (cycles) => {
    const end = m.cycles + cycles;
    m.runUntil(() => m.cycles >= end, cycles + 1_000_000);
  };
  // One byte at a time, each given time to arrive (a byte is 9,200 T-states).
  m.send = (text) => {
    for (const ch of text) {
      m.tec1g.queueSerial([ch.charCodeAt(0)]);
      m.idle(200_000);
    }
  };
  // Answer Y to every question until the one that matches.
  m.yesUntil = (pattern) => {
    for (;;) {
      const text = m.wait(/\(Y\/N\) $/);
      if (pattern.test(text)) return;
      m.send("Y");
    }
  };
  return m;
}

/** Result lines of the final report, by test number. */
function report(text) {
  const start = text.lastIndexOf("==== TEC-1G DIAGNOSTICS REPORT ====");
  assert.ok(start >= 0, "report printed");
  const lines = new Map();
  for (const line of text.slice(start).split("\r\n")) {
    const m = /^T(\d\d) (.{7}) (PASS|FAIL|INFO|SKIP|LOOK|NONE)  (.*)$/.exec(line);
    if (m) lines.set(Number(m[1]), { name: m[2].trim(), result: m[3], detail: m[4] });
  }
  return lines;
}

/** Only the two deliberate writes: one to ROM, one under the boot overlay.
 *  The recorded PC is part-way through the writing instruction. */
function deliberateWrites(m) {
  assert.deepEqual(
    m.violations.map((v) => v.kind),
    ["rom-write", "overlay-write"],
  );
  for (const [v, name] of [[m.violations[0], "ROMWTW"], [m.violations[1], "OVLWT"]]) {
    assert.ok(v.pc >= m.sym(name) && v.pc <= m.sym(name) + 3, `${v.kind} from ${name}`);
  }
}

test("the automatic tests pass on the Debug80 model and the report lists them", SLOW, () => {
  const m = diag();
  m.wait(/==== END ====\r\n/);
  const r = report(m.serialText());
  const expected = {
    PASS: [1, 2, 3, 4, 5, 6, 7, 9, 13, 15, 19, 20, 26],
    INFO: [8, 10, 11, 12, 18],
    LOOK: [14, 16, 17, 22, 23, 24, 25],
    NONE: [21],
  };
  for (const [result, ids] of Object.entries(expected)) {
    for (const id of ids) assert.equal(r.get(id)?.result, result, `T${id} ${JSON.stringify(r.get(id))}`);
  }
  assert.equal(r.size, 26);
  // The model's answers to the open items.
  assert.match(r.get(8).detail, /^reaches the RAM underneath/, "O3 in Debug80");
  assert.match(r.get(12).detail, /^field 0-F: 0122446688AACCEE .* 9 banks \+ base$/, "O1 in Debug80");
  // The model's PAL frame is 80,000 T-states; polling costs at most 33 of them.
  const frame = Number(/^frame (\d+) T; CPU at 50 Hz/.exec(r.get(18).detail)[1]);
  assert.ok(Math.abs(frame - 80_000) <= 5, `frame ${frame}`);
  assert.match(r.get(17).detail, /^tags 11 22 33 44 .* 16 T\/byte 0, at 104 T\/byte 0 /);
  assert.match(r.get(19).detail, /^v2 SDHC\/XC, CMD0 x1, R7 00 00 01 AA, .* OCR C0 00 00 00/);
  // The PICO9918 shows the 80-column test screen.
  const screen = m.screen(80, 24);
  assert.match(screen[0], /^TEC-1G DIAGNOSTICS: PICO9918 80 x 24 text/);
  assert.equal(screen[1], "1234567890".repeat(8));
  assert.equal(screen[23], "1234567890".repeat(8));
  assert.equal(m.read(m.sym("NMICNT")), 0);
  deliberateWrites(m);
});

test("a bad bit in the variables page is reported without a stack, and nothing more runs", SLOW, () => {
  const m = diag();
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => write(addr, (addr & 0xffff) === 0x7e81 ? value | 0x10 : value);
  const text = m.wait(/7E00-7FFF at .*\r\n.*7E00-7FFF at .*\r\n/s, 60_000_000);
  // Pass 1 writes FFh there, which a stuck-high bit cannot spoil; pass 2
  // writes its complement.
  assert.match(text, /^\r\nT01 HOME    FAIL  RAM 7E00-7FFF at 7E81 wrote 00 read 10\r\n/);
  assert.doesNotMatch(m.serialText(), /diagnostics/);
  assert.equal(m.cpu.cpu.sp, 0x8000, "nothing was pushed");
});

test("without RAM in the window the ROM reports it and carries on", SLOW, () => {
  const m = diag({ windowRam: false, tms: false });
  m.wait(/==== END ====\r\n/);
  const r = report(m.serialText());
  assert.equal(r.get(2).result, "PASS");
  assert.equal(r.get(3).result, "FAIL");
  assert.match(r.get(3).detail, /^at 8000 wrote 80 read FF bad bits 7F$/);
  assert.equal(r.get(4).result, "SKIP");
  assert.match(r.get(12).detail, /^field 0-F: -{16} /);
  assert.equal(r.get(13).result, "NONE");
  assert.equal(r.get(17).result, "NONE");
  assert.equal(r.get(18).result, "NONE");
});

test("the interactive tests run from the serial terminal, keypad, matrix and joystick", SLOW, () => {
  const m = diag();
  m.wait(/within 5 s/);
  m.send("I");

  m.yesUntil(/T27 /);
  m.send("Y");
  m.wait(/nothing typed\.\r\n/);
  m.send("Az\x1b");
  assert.match(m.wait(/\(Y\/N\) $/), /41 'A'\r\n7A 'z'\r\n/);
  m.send("Y");

  m.yesUntil(/T28 /);
  m.send("Y");
  m.wait(/ends\.\r\n/);
  for (let i = 0; i < 8; i += 1) {
    m.idle(100_000);
    m.send("U");
  }

  m.yesUntil(/T29 /);
  m.send("Y");
  m.wait(/no key\.\r\n/);
  for (const key of [...Array(20).keys(), 0x13]) {
    m.tec1g.applyKey(key | 0x20, true); // bit 5 high: Shift up
    m.idle(400_000);
    m.tec1g.applyKey(key | 0x20, false);
    m.idle(1_500_000);
  }

  m.yesUntil(/T31 /);
  m.send("Y");
  m.wait(/ends\.\r\n/);
  for (const [row, col] of [[7, 4], [1, 2], [0, 0]]) {
    m.tec1g.applyMatrixKey(row, col, true);
    m.idle(400_000);
    m.tec1g.applyMatrixKey(row, col, false);
    m.idle(400_000);
  }
  m.send("x");

  m.yesUntil(/T32 /);
  m.send("Y");
  m.wait(/ends\.\r\n/);
  for (const mask of [0x01, 0x02, 0x40, 0x00]) {
    m.tec1g.setJoystickState(mask);
    m.idle(400_000);
  }
  m.send("x");

  // The stopwatch interval: first speaker edge of each beep.
  m.yesUntil(/T33 /);
  m.send("Y");
  m.wait(/ GO\r\n/);
  const audio = m.tec1g.state.audio;
  const starts = [];
  let level = audio.speaker;
  let lastEdge = -Infinity;
  const ask = m.sym("ASKSW");
  m.runUntil(
    () => {
      if (audio.speaker !== level) {
        level = audio.speaker;
        if (m.cycles - lastEdge > 100_000) starts.push(m.cycles);
        lastEdge = m.cycles;
      }
      return m.pc === ask;
    },
    400_000_000,
    "the STOP beep",
  );
  assert.equal(starts.length, 2);
  // Edges are seen after the OUT that makes them: both by the same amount.
  assert.equal(starts[1] - starts[0], STOPWATCH_T, "STOPWATCH_T in tools/diag.mjs");
  m.wait(/GO: $/);
  m.send("601\r");

  m.yesUntil(/T34 /);
  m.send("Y");
  m.wait(/GO: $/, 2_000_000_000);
  m.send("250\r");
  m.wait(/==== END ====\r\n/);

  const r = report(m.serialText());
  assert.equal(r.get(27).result, "PASS");
  assert.equal(r.get(27).detail, "2 bytes received");
  assert.equal(r.get(28).result, "PASS");
  const bit = Number(/^terminal bit (\d+) T over 8 U/.exec(r.get(28).detail)[1]);
  assert.ok(Math.abs(bit - 4_000_000 / 4800) <= 4, `bit time ${bit}`);
  assert.equal(r.get(29).result, "PASS");
  assert.equal(r.get(29).detail, "20/20 keys seen, 21 presses");
  assert.equal(r.get(31).detail, "3 keys seen; rows 0-7 01 04 00 00 00 00 00 10");
  assert.match(r.get(32).detail, /^bits seen 43 /);
  assert.match(r.get(33).detail, /^60\.1 s for 240400396 T: CPU 400000\d Hz$/);
  assert.match(r.get(34).detail, /^errors 0, token polls 0, stopwatch 25\.0 s: 5242 bytes\/s$/);
  for (const [id, line] of r) assert.notEqual(line.result, "FAIL", `T${id} ${line.detail}`);
  deliberateWrites(m);
});
