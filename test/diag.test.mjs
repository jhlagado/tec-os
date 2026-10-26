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
  // No DS1302 by default: the model keeps host time, which a short emulated
  // run does not see advance.
  const m = new Machine({ rom, symbols, sdImage: standardCard(), tms: true, matrix: true, ramFill: 0x76, rtc: false, ...options });
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
  const card = standardCard();
  const block7 = card.slice(7 * 512, 8 * 512);
  const written = [];
  const m = diag({ sdImage: card, onSdWrite: () => written.push(m.cycles) });
  // T35: while R2 is 0Bh the harness decodes the page at 2000h.
  m.wait(/-- T35 /);
  const vdp = m.tec1g.state.display.tms9918;
  m.runUntil(() => vdp.stateSnapshot().registers[2] === 0x0b, 50_000_000, "R2 = 0Bh");
  assert.equal(m.tmsLayout().base, 0x2000);
  assert.equal(m.screen(80, 24)[0], "PAGE 2: NAMES AT 2000h, R2 = 0Bh " + "2".repeat(47));
  m.runUntil(() => vdp.stateSnapshot().registers[2] === 0x07, 50_000_000, "R2 = 07h");
  assert.equal(m.tmsLayout().base, 0x1000);
  m.wait(/==== END ====\r\n/);
  const r = report(m.serialText());
  const expected = {
    PASS: [1, 2, 3, 4, 5, 6, 7, 9, 13, 15, 19, 20, 26, 37],
    INFO: [8, 10, 11, 12, 18, 36],
    LOOK: [14, 16, 17, 22, 23, 24, 25, 35],
    NONE: [21],
  };
  for (const [result, ids] of Object.entries(expected)) {
    for (const id of ids) assert.equal(r.get(id)?.result, result, `T${id} ${JSON.stringify(r.get(id))}`);
  }
  assert.equal(r.size, 29);
  // The model is a plain TMS9918: the unlock and VR15 writes land in R1 and
  // R7, and the probe puts registers 0-7 back.
  assert.match(r.get(36).detail, /^not F18A-compatible: SR1 read [0-9A-F]{2} \(F18A E0h-EFh\)/);
  assert.deepEqual([...vdp.stateSnapshot().registers.slice(0, 8)], [0x04, 0x50, 0x07, 0x00, 0x00, 0x00, 0x00, 0xf4]);
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
  // T37 wrote block 7 twice, the pattern then what it held, and nothing else.
  assert.match(r.get(37).detail, /^pattern read back, block restored; busy polls \d+$/);
  assert.equal(written.length, 2);
  assert.deepEqual([...card.slice(7 * 512, 8 * 512)], [...block7], "the card's own array, written in place");
  deliberateWrites(m);
});

/**
 * Give the model's TMS9918 the F18A register behaviour of the PICO9918
 * firmware (vrEmuTms9918.c): registers 0-63 once 1Ch has been written to
 * register 57 twice in a row, status registers selected by VR15 (SR1 = E8h,
 * SR14 = 1Ah), VR50 bit 7 resetting and locking. Unlocked, R2 is decoded
 * with mask 0Fh. Returns the extended registers and a log of writes.
 */
function f18a(m) {
  const vdp = m.tec1g.state.display.tms9918;
  const { writeControl, readStatus } = vdp;
  const ext = new Uint8Array(64);
  const log = [];
  const state = { unlocked: false, count: 0, latch: null, ext, log };
  vdp.writeControl = (value) => {
    if (state.latch === null) {
      state.latch = value;
      return;
    }
    const first = state.latch;
    state.latch = null;
    if ((value & 0x80) === 0) {
      writeControl(first);
      writeControl(value);
      return;
    }
    if (value === 0xb9 && (first & 0xfc) === 0x1c) {
      if (++state.count === 2) {
        state.count = 0;
        state.unlocked = true;
      }
      return;
    }
    state.count = 0;
    const reg = value & (state.unlocked ? 0x3f : 0x07);
    if (!state.unlocked && (value & 0x78) !== 0) return;
    log.push([reg, first]);
    if (reg < 8) {
      writeControl(first);
      writeControl(0x80 | reg);
      return;
    }
    ext[reg] = first;
    if (reg === 50 && first & 0x80) {
      ext.fill(0);
      state.unlocked = false;
    }
  };
  vdp.readStatus = () => {
    state.latch = null;
    const sr = state.unlocked ? ext[15] & 0x0f : 0;
    if (sr === 1) return 0xe8;
    if (sr === 14) return 0x1a;
    return readStatus();
  };
  return state;
}

test("on an F18A-compatible VDP the probe reads the identity, scrolls one row and locks again", SLOW, () => {
  const m = diag();
  const f = f18a(m);
  m.wait(/-- T36 /);
  m.runUntil(() => f.ext[28] === 8, 50_000_000, "VR28 = 8");
  assert.equal(f.unlocked, true);
  assert.equal(m.tec1g.state.display.tms9918.stateSnapshot().registers[2], 0x04, "names at 1000h under mask 0Fh");
  const text = m.wait(/T36 F18A .*\r\n/);
  assert.match(text, /T36 F18A    LOOK  SR1 E8 \(E0h F18A, \+08h PICO9918\), SR14 version 1A, locked SR1 read [0-9A-F]{2}, after VR50 reset [0-9A-F]{2}\r\n/);
  assert.doesNotMatch(text, /STILL UNLOCKED/);
  assert.equal(f.unlocked, false);
  const writes = f.log.filter(([reg]) => reg >= 8);
  assert.deepEqual(writes, [[15, 1], [15, 0], [15, 14], [15, 0], [28, 8], [28, 0], [50, 0x80]]);
  assert.deepEqual(
    [...m.tec1g.state.display.tms9918.stateSnapshot().registers.slice(0, 8)],
    [0x04, 0x50, 0x07, 0x00, 0x00, 0x00, 0x00, 0xf4],
  );
});

/**
 * Keep the model's DS1302 counting after a write. Runtime 0.2.0 freezes its
 * time registers once one is written; the chip counts on from the time
 * written. The clock runs at 4 MHz cycles, from `start`.
 */
function countingRtc(m, start) {
  const rtc = m.rtc;
  const bcd = (v) => (v >> 4) * 10 + (v & 15);
  let base = start.getTime();
  let at = 0;
  rtc.refreshTimeRegisters = function () {
    const now = new Date(base + Math.floor(((m.cycles - at) * 1000) / 4_000_000));
    const day = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
    [now.getUTCSeconds(), now.getUTCMinutes(), now.getUTCHours(), now.getUTCDate(), now.getUTCMonth() + 1, day, now.getUTCFullYear() % 100].forEach(
      (v, i) => (this.registers[i] = this.toBcd(v)),
    );
  };
  const write = rtc.writeRegister;
  rtc.writeRegister = function (addr, value) {
    write.call(this, addr, value);
    if (addr > 6) return;
    this.timeFrozen = false;
    const r = this.registers;
    base = Date.UTC(2000 + bcd(r[6]), bcd(r[4]) - 1, bcd(r[3]), bcd(r[2] & 0x3f), bcd(r[1]), bcd(r[0] & 0x7f));
    at = m.cycles;
  };
}

test("T21 sets the DS1302, sees it roll over and puts the time back", SLOW, () => {
  const m = diag({ rtc: true });
  const start = Date.UTC(2026, 9, 26, 9, 30, 15);
  countingRtc(m, new Date(start));
  const text = m.wait(/T21 RTC .*\r\n/);
  assert.match(text, /T21 RTC     INFO  2026-10-26 09:3\d:\d\d; 1 s = 31\d\d x 1282 T = (3999|4000)\d{3} Hz; set 2099-12-31 23:59:58: read back, rolled over, restored\r\n/);
  // Afterwards the clock reads what it would have read untouched: the set
  // cost only its own seconds, which were added back.
  m.rtc.refreshTimeRegisters();
  const r = m.rtc.registers;
  const bcd = (v) => (v >> 4) * 10 + (v & 15);
  const read = Date.UTC(2000 + bcd(r[6]), bcd(r[4]) - 1, bcd(r[3]), bcd(r[2]), bcd(r[1]), bcd(r[0]));
  const untouched = start + Math.floor((m.cycles * 1000) / 4_000_000);
  assert.ok(Math.abs(read - untouched) <= 2000, `clock off by ${(read - untouched) / 1000} s`);
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
  assert.equal(r.get(30).detail, "21 NMIs for 21 presses: one per press", "the 74C923 strobes once for every press");
  assert.equal(r.get(31).detail, "3 keys seen; rows 0-7 01 04 00 00 00 00 00 10");
  assert.match(r.get(32).detail, /^bits seen 43 /);
  assert.match(r.get(33).detail, /^60\.1 s for 240400396 T: CPU 400000\d Hz$/);
  assert.match(r.get(34).detail, /^errors 0, token polls 0, stopwatch 25\.0 s: 5242 bytes\/s$/);
  for (const [id, line] of r) assert.notEqual(line.result, "FAIL", `T${id} ${line.detail}`);
  deliberateWrites(m);
});
