// A TEC-1G running a TEC-OS ROM in the Debug80 runtime. This module has no
// Node dependencies: the tests and the web page both use it.
//
// The Debug80 TEC-1G runtime supplies the CPU, latch decoding, overlay,
// expansion banks, keypad and serial timing. The SD card is a Debug80 SdSpi
// instance attached here so the test owns the card image in memory. Every
// memory write is checked: a write to ROM, or to 0000h-07FFh while the boot
// overlay is on, is recorded as a violation.

import { createTec1gRuntime, normalizeTec1gConfig } from "@jhlagado/debug80-runtime/platforms/tec1g/runtime";
import { createTec1gMemoryHooks } from "@jhlagado/debug80-runtime/platforms/tec1g/tec1g-memory";
import { SdSpi } from "@jhlagado/debug80-runtime/platforms/tec1g/sd-spi";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";
import { getMatrixCombosForAscii } from "@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap";
import { Ds1302 } from "@jhlagado/debug80-runtime/platforms/tec1g/ds1302";
import { toLatin1 } from "../tools/lib/bytes.mjs";

const MODIFIER_KEY = { shift: 0, ctrl: 1, fn: 2 };

const SD_PORT = 0xfd;
const RTC_PORT = 0xfc;

/** Symbol map (name to address) from a Debug80 D8 debug map object. */
export function symbolsFromD8(d8) {
  const map = new Map();
  for (const s of d8.symbols) map.set(s.name.toUpperCase(), s.address ?? s.value);
  return map;
}

/** Writes to EXPAND 1 at 8000h-BCFFh and BE00h-BFFFh after cold boot's clear, by any machine. */
export const EXPAND1_WRITES = [];

export class Machine {
  /**
   * clock: the DS1302's time. Left out, it is the host's time, as on a board
   * whose clock was set; a Date starts the clock there and advances it with
   * the emulated cycles at 4 MHz, so a run reads the same time on any host.
   */
  /*
   * glcd: false for a machine with no ST7920: its busy flag never clears.
   * ram96: decode the system latch as the TEC-1G documentation's 96K scheme
   * instead of the runtime's bank field (latch bits 3-6): bit 3 (MAIN) picks MAIN 0 or
   * MAIN 1, 32 KiB each, at 0000h-7FFFh, and bit 2 (EXPAND) EXPAND 0 or
   * EXPAND 1, 16 KiB each, at 8000h-BFFFh. mains: 1 when MAIN 1 is not
   * fitted, so bit 3 changes nothing; expands: 1 when EXPAND 1 is not (a
   * 16 KiB U9), so bit 2 changes nothing. ROM, the boot overlay and PROTECT
   * (4000h-7FFFh) behave as before.
   */
  constructor({ rom, symbols, sdImage, highCapacity = true, ramFill = 0x00, tms = false, matrix = false, glcd = true, windowRam = true, rtc = true, clock, ram96 = false, mains = 2, expands = 2, onSdWrite }) {
    this.symbols = symbols;
    // output: every byte the BIOS was asked to put on the console, whichever
    // device is in use. serial: the bytes that left the serial port.
    this.output = [];
    this.outputText = ""; // output decoded, extended as text() is asked for more
    this.serial = [];
    this.violations = [];
    this.cycles = 0;
    this.sdImage = sdImage;
    this.sd = sdImage ? new SdSpi({ image: sdImage, highCapacity, ...(onSdWrite ? { onWrite: onSdWrite } : {}) }) : null;
    const romRanges = [{ start: 0xc000, end: 0xffff }];
    const config = normalizeTec1gConfig({
      regions: [
        { start: 0x0000, end: 0xbfff, kind: "ram" },
        { start: 0xc000, end: 0xffff, kind: "rom" },
      ],
      romRanges,
      appStart: 0xc000,
      entry: 0x0000,
      sdEnabled: false,
      tms9918Active: tms,
      matrixMode: matrix,
      rtcEnabled: false, // the DS1302 is this machine's own, on port FCh below
    });
    this.tec1g = createTec1gRuntime(
      config,
      () => {},
      (byte) => this.serial.push(byte),
    );
    if (tms) this.tec1g.setTms9918Active(true);
    // The runtime sends display updates on a wall-clock schedule and clears
    // the queued LED and digit scans with each one, so what a test reads
    // would depend on how fast the host ran. Nothing here listens for those
    // updates; the harness and the page read the state directly.
    this.tec1g.state.timing.updateMs = Infinity;
    this.rtc = rtc ? new Ds1302() : null;
    const machine = this;
    if (this.rtc && clock) {
      const start = clock.getTime();
      const rtcHz = 4_000_000;
      const emulatedMs = () => start + Math.floor((machine.cycles * 1000) / rtcHz);
      // Until a time is written the clock follows the cycles from `clock`.
      // After that the runtime's DS1302 counts on from the time written, by
      // whole seconds since its tick base; the base and the seconds here are
      // emulated ones too, so a slow or stalled host changes nothing.
      const write = this.rtc.writeRegister;
      this.rtc.writeRegister = function (addr, value) {
        const base = this.tickBaseMs;
        write.call(this, addr, value);
        if (this.tickBaseMs !== base) this.tickBaseMs = emulatedMs();
      };
      this.rtc.advanceWrittenTime = function () {
        const now = emulatedMs();
        if (this.registers[0] & 0x80) {
          this.tickBaseMs = now; // CH set: the registers hold
          return;
        }
        const elapsed = Math.floor((now - this.tickBaseMs) / 1000);
        for (let i = 0; i < elapsed; i += 1) this.tick();
        this.tickBaseMs += elapsed * 1000;
      };
      const counting = this.rtc.refreshTimeRegisters;
      this.rtc.refreshTimeRegisters = function () {
        if (!this.followsHost) return counting.call(this);
        const now = new Date(emulatedMs());
        const day = now.getDay() === 0 ? 7 : now.getDay();
        [now.getSeconds(), now.getMinutes(), now.getHours(), now.getDate(), now.getMonth() + 1, day, now.getFullYear() % 100].forEach(
          (v, i) => (this.registers[i] = this.toBcd(v)),
        );
      };
    }
    const base = this.tec1g.ioHandlers;
    const io = {
      read: (port) => {
        const p = port & 0xff;
        if (p === SD_PORT) return this.sd ? this.sd.read() : 0xff;
        if (p === RTC_PORT) return this.rtc ? this.rtc.read() : 0xff;
        if (!glcd && (p === 0x07 || p === 0x87)) return 0xff;
        return base.read(port);
      },
      write: (port, value) => {
        if ((port & 0xff) === SD_PORT) {
          if (this.sd) this.sd.write(value);
          return;
        }
        if ((port & 0xff) === RTC_PORT) {
          if (this.rtc) this.rtc.write(value & 0xff);
          return;
        }
        base.write(port, value);
      },
      tick: base.tick,
    };
    const memory = new Uint8Array(0x10000).fill(ramFill);
    memory.set(rom, 0xc000);
    this.cpu = createZ80Runtime({ memory, startAddress: 0 }, 0, io, { romRanges });
    const hooks = createTec1gMemoryHooks(this.cpu.hardware.memory, romRanges, this.tec1g.state.system);
    this.banks = hooks.expandBanks;
    for (const bank of this.banks) bank.fill(ramFill);
    const system = this.tec1g.state.system;
    // windowRam false models a board with nothing at 8000h-BFFFh: reads
    // float high and writes go nowhere.
    const empty = (a) => !windowRam && a >= 0x8000 && a < 0xc000;
    let ram = hooks;
    if (ram96) {
      this.main = Array.from({ length: mains }, () => new Uint8Array(0x8000).fill(ramFill));
      this.expand = Array.from({ length: expands }, () => new Uint8Array(0x4000).fill(ramFill));
      const main = () => this.main[system.sysCtrl & 0x08 ? mains - 1 : 0];
      const expand = () => this.expand[system.sysCtrl & 0x04 ? expands - 1 : 0];
      ram = {
        memRead: (addr) => {
          const a = addr & 0xffff;
          if (a >= 0xc000 || (system.shadowEnabled && a < 0x0800)) return hooks.memRead(a);
          return a < 0x8000 ? main()[a] : expand()[a - 0x8000];
        },
        memWrite: (addr, value) => {
          const a = addr & 0xffff;
          if (a >= 0xc000) return hooks.memWrite(a, value);
          if (a < 0x8000) {
            if (!(system.protectEnabled && a >= 0x4000)) main()[a] = value & 0xff;
          } else expand()[a - 0x8000] = value & 0xff;
        },
      };
    }
    this.cpu.hardware.memRead = (addr) => (empty(addr & 0xffff) ? 0xff : ram.memRead(addr));
    this.cpu.hardware.forceMemWrite = ram96 ? ram.memWrite : hooks.forceMemWrite;
    this.cpu.hardware.isMemoryWritable = hooks.isMemoryWritable;
    // After cold boot's clear of EXPAND 1 (MEMINIT's LDIR reaching BFFFh),
    // nothing writes the free pages BE00h-BFFFh, and only the block cache
    // writes its 8000h-BCFFh, below the history ring:
    // its own code, the card's block loops, the copy core when the cache
    // called it (the return address on entry to MVCOPY in CDI-CEND), and
    // cold boot's setting of
    // its table. Any other write there, until the
    // next cold boot (COLD clearing page zero), is kept in expand1Writes and
    // in EXPAND1_WRITES, for the whole process.
    const meminit = symbols.get("MEMINIT");
    const cold = symbols.get("COLD");
    const coldz = symbols.get("COLDZ") ?? cold; // where COLD clears page zero
    let clearEnd = -1;
    if (meminit !== undefined && cold !== undefined)
      for (let a = meminit; a < meminit + 0x40 && clearEnd < 0; a += 1) if (rom[a - 0xc000] === 0xed && rom[a - 0xc000 + 1] === 0xb0) clearEnd = a + 2;
    // A routine runs from its label to the next label not its own (SDRB2 is
    // SDRBLK's).
    const sorted = [...symbols.entries()].filter(([, v]) => v >= 0xc000).sort((x, y) => x[1] - y[1]);
    const after = (n) => sorted.find(([k, v]) => v > symbols.get(n) && !k.startsWith(n.slice(0, 4)))?.[1];
    // The cache's code runs from CTADR, past the BIOS entry's interrupt
    // discipline, which writes no EXPAND 1 and since KS38 is in bios.asm.
    const cache = symbols.has("CTADR") ? "CTADR" : "CDI";
    const writers = [[cache, "CEND"], ["SDRBLK"], ["SDWBLK"], ["MEMINIT"]]
      .filter(([a]) => symbols.has(a))
      .map(([a, b]) => [symbols.get(a), b ? symbols.get(b) : after(a)]);
    const [cdi, cend, mvcopy] = [cache, "CEND", "MVCOPY"].map((n) => symbols.get(n)); // cdi: the cache's start
    const mvEnd = symbols.has("MVOK") ? symbols.get("MVOK") + 2 : undefined; // MVCOPY ends at MVOK's RET
    let mvForCache = false;
    if (mvcopy !== undefined && cdi !== undefined)
      this.mvWatch = (pc) => {
        if (pc !== mvcopy) return;
        const sp = this.cpu.cpu.sp;
        const ret = ram.memRead(sp) | (ram.memRead((sp + 1) & 0xffff) << 8);
        mvForCache = ret >= cdi && ret < cend;
      };
    const cacheWrite = (pc) => writers.some(([a, b]) => pc >= a && pc < b) || (mvForCache && pc >= mvcopy && pc < mvEnd);
    let cleared = false;
    this.expand1Writes = [];
    this.cpu.hardware.memWrite = (addr, value) => {
      const a = addr & 0xffff;
      if (clearEnd > 0) {
        const pc = this.cpu.cpu.pc & 0xffff;
        if (pc >= coldz && pc < coldz + 0x20) cleared = false;
        else if (a >= 0x8000 && a < 0xc000 && expands > 1 && system.sysCtrl & 0x04) {
          if (pc >= meminit && pc <= clearEnd) cleared ||= a === 0xbfff;
          else if (cleared && (a < 0xbd00 ? !cacheWrite(pc) : a >= 0xbe00)) { // BE00h-BFFFh: free since KS36a
            const w = { addr: a, pc };
            this.expand1Writes.push(w);
            if (EXPAND1_WRITES.length < 16) EXPAND1_WRITES.push(w);
          }
        }
      }
      if (a >= 0xc000) this.violations.push({ kind: "rom-write", addr: a, pc: this.cpu.cpu.pc });
      else if (a < 0x0800 && system.shadowEnabled) {
        this.violations.push({ kind: "overlay-write", addr: a, pc: this.cpu.cpu.pc });
      }
      if (!empty(a)) ram.memWrite(a, value);
    };
    this.conout = symbols.get("BCONOUT");
    // The buffer of the BDOS 10 line input in progress, -1 for none: set at
    // FNLINE's entry, cleared at LINDONE and at warm boot's CPMINIT (^C at
    // the start of a line warm boots from inside the input).
    this.lineBuf = -1;
    this.lineAt = symbols.get("FNLINE");
    this.lineEnds = [symbols.get("LINDONE"), symbols.get("CPMINIT")];
    this.read = (addr) => ram.memRead(addr & 0xffff);
    this.write = (addr, value) => ram.memWrite(addr & 0xffff, value & 0xff);
  }

  sym(name) {
    const value = this.symbols.get(name.toUpperCase());
    if (typeof value !== "number") throw new Error(`no symbol ${name}`);
    return value;
  }

  get pc() {
    return this.cpu.cpu.pc & 0xffff;
  }

  get sysCtrl() {
    return this.tec1g.state.system.sysCtrl & 0xff;
  }

  get physicalBank() {
    const s = this.tec1g.state.system;
    return s.expandEnabled ? s.memoryExpansionPhysicalBank : -1;
  }

  step() {
    const pc = this.cpu.cpu.pc;
    if (pc === this.conout) this.output.push(this.cpu.cpu.c);
    else if (pc === this.lineAt) this.lineBuf = (this.cpu.cpu.d << 8) | this.cpu.cpu.e;
    else if (pc === this.lineEnds[0] || pc === this.lineEnds[1]) this.lineBuf = -1;
    this.mvWatch?.(this.cpu.cpu.pc);
    const result = this.cpu.step();
    const cycles = result.cycles ?? 0;
    this.tec1g.recordCycles(cycles);
    this.cycles += cycles;
    return result;
  }

  /** Run until predicate() is true; throws after maxCycles. */
  runUntil(predicate, maxCycles = 50_000_000, what = "condition") {
    const limit = this.cycles + maxCycles;
    while (!predicate()) {
      const r = this.step();
      if (r.halted && !predicate()) throw new Error(`CPU halted at ${this.pc.toString(16)} before ${what}`);
      if (this.cycles > limit) {
        throw new Error(`no ${what} within ${maxCycles} cycles; pc=${this.pc.toString(16)}; output:\n${this.text()}`);
      }
    }
  }

  /** Run until predicate() holds, checking it every `every` cycles. For
   *  predicates too costly to test after each instruction, such as reading a
   *  screen. */
  runUntilChecked(predicate, maxCycles = 400_000_000, what = "condition", every = 20_000) {
    const limit = this.cycles + maxCycles;
    while (!predicate()) {
      const next = this.cycles + every;
      this.runUntil(() => this.cycles >= next, every + 1_000_000, what); // LDIR of a few KiB is one step
      if (this.cycles > limit) {
        throw new Error(`no ${what} within ${maxCycles} cycles; pc=${this.pc.toString(16)}`);
      }
    }
  }

  text(from = 0) {
    const done = this.outputText.length;
    if (done < this.output.length) this.outputText += toLatin1(Uint8Array.from(this.output.slice(done)));
    return this.outputText.slice(from);
  }

  /** Run until the console output since `from` matches pattern. The pattern is
   *  tested again only when the output has grown, not at every instruction. */
  expect(pattern, { from = this.mark ?? 0, maxCycles = 100_000_000 } = {}) {
    let seen = -1;
    this.runUntil(
      () => {
        if (this.output.length === seen) return false;
        seen = this.output.length;
        return pattern.test(this.text(from));
      },
      maxCycles,
      `output ${pattern}`,
    );
    // Output is recorded as the BIOS is asked for it; let the last character
    // reach the screen, normally by running on until the console waits.
    const settle = this.cycles + 2_000_000;
    this.runUntil(() => this.waitingForInput() || this.cycles > settle, 3_000_000, "console output");
    const out = this.text(from);
    this.mark = this.output.length;
    return out;
  }

  /** True while the console is waiting for, or polling for, a key. */
  waitingForInput() {
    const pc = this.pc;
    this.inputRanges ??= [
      ["CINLP", "CINWE"],
      ["CSTPOLL", "CSTGOT"],
      ["CINMX", "CINME"],
      ["CSTMX", "CSTMXE"],
      ["KBPOLL", "KBDELIV"], // scanning the matrix keyboard for a key
    ].map(([a, b]) => [this.sym(a), this.sym(b)]);
    for (const [a, b] of this.inputRanges) if (pc >= a && pc < b) return true;
    return false;
  }

  /**
   * True at a prompt with startup's line taken (its position is 80h or above)
   * and a command line being read: the CCP's own BDOS 10 on CMDBUF with no
   * shell holding the hook, or a shell's first BDOS 10 after its LINE call,
   * while the history gate HFLAG is FFh. A ROM with no shell hook reads only
   * the gate.
   */
  ready() {
    const pos = this.symbols.get("STPOS");
    if (pos === undefined) return this.waitingForInput();
    if (!this.waitingForInput() || this.read(pos) < 0x80) return false;
    const hflag = this.read(this.sym("HFLAG")) === 0xff;
    const shown = this.symbols.get("SHOWN");
    if (shown === undefined) return hflag;
    if (this.lineBuf < 0) return false;
    if (this.lineBuf === this.sym("CMDBUF")) return (this.read(shown) | this.read(shown + 1)) === 0;
    return hflag;
  }

  /** True while a video display and the matrix keyboard are the console. */
  videoConsole() {
    return (this.read(this.sym("CONMOD")) & 1) === 1;
  }

  /** Serial bytes as text. */
  serialText(from = 0) {
    return toLatin1(Uint8Array.from(this.serial.slice(from)));
  }

  /** Type text one character at a time, as a terminal user would: each byte
   *  is sent only when TEC-OS is waiting and the next waits until it has been
   *  received. */
  type(text, maxCycles = 100_000_000) {
    if (this.videoConsole()) return this.typeMatrix(text, maxCycles);
    const cin = this.sym("CINRX");
    const cst = this.sym("CSTRX");
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      this.runUntil(() => this.waitingForInput(), maxCycles, `input request for ${JSON.stringify(ch)}`);
      this.tec1g.queueSerial([code]);
      this.runUntil(
        () => (this.pc === cin || this.pc === cst) && (this.cpu.cpu.a & 0x7f) === (code & 0x7f),
        maxCycles,
        `reception of ${JSON.stringify(ch)}`,
      );
    }
  }

  /** Type a command line and wait for the next CCP prompt. */
  command(line, { prompt = /\r\n\d*[A-P]>$/, maxCycles = 400_000_000 } = {}) {
    this.mark = this.output.length;
    this.type(`${line}\r`);
    return this.expect(prompt, { maxCycles });
  }

  /** Name-table address and width of the PICO9918's current text layout. */
  tmsLayout() {
    const r = this.tec1g.state.display.tms9918.stateSnapshot().registers;
    if (r[0] & 0x04) return { cols: 80, base: (r[2] & 0x0c) << 10 }; // TEXT80, 4 KiB aligned
    if (r[1] & 0x10) return { cols: 40, base: (r[2] & 0x0f) << 10 };
    return { cols: 32, base: (r[2] & 0x0f) << 10 };
  }

  /** The video screen as text rows (reverse-video cells shown plain). */
  screen(cols, rows = 24, base) {
    const layout = this.tmsLayout();
    cols ??= layout.cols;
    base ??= layout.base;
    const vram = this.tec1g.state.display.tms9918.stateSnapshot().vram;
    const lines = [];
    for (let r = 0; r < rows; r += 1) {
      let line = "";
      for (let c = 0; c < cols; c += 1) {
        const v = vram[base + r * cols + c] & 0x7f;
        line += v >= 0x20 && v < 0x7f ? String.fromCharCode(v) : " ";
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }

  /** The raw name-table byte at row r, column c. */
  cell(r, c) {
    const { cols, base } = this.tmsLayout();
    return this.tec1g.state.display.tms9918.stateSnapshot().vram[base + r * cols + c];
  }

  /**
   * The GLCD console as text: each 6 x 8 cell of the 128 x 64 graphics RAM
   * is matched against the font, 768 bytes from 20h: the ROM's own copy, FONT,
   * is generated from format/font5x7.txt, and the test library passes the same
   * glyphs in Machine.font. Reverse cells read as
   * their character; unknown patterns read as "?".
   */
  glcdScreen(cols = 21, rows = 8) {
    const gdram = this.tec1g.state.display.glcdCtrl.glcd;
    const { font } = Machine;
    const pixel = (x, y) => (gdram[y * 16 + (x >> 3)] >> (7 - (x & 7))) & 1;
    this.glyphCache ??= new Map();
    const glyphs = this.glyphCache;
    for (let code = glyphs.size ? 0x80 : 0x20; code < 0x80; code += 1) {
      let key = "";
      let rev = "";
      for (let r = 0; r < 8; r += 1) {
        const bits = font[(code - 0x20) * 8 + r];
        for (let px = 0; px < 6; px += 1) {
          const on = (bits >> (7 - px)) & 1;
          key += on;
          rev += on ^ 1;
        }
      }
      if (!glyphs.has(key)) glyphs.set(key, String.fromCharCode(code));
      if (!glyphs.has(rev)) glyphs.set(rev, String.fromCharCode(code));
    }
    const lines = [];
    for (let row = 0; row < rows; row += 1) {
      let line = "";
      for (let col = 0; col < cols; col += 1) {
        let key = "";
        for (let r = 0; r < 8; r += 1) for (let px = 0; px < 6; px += 1) key += pixel(col * 6 + px, row * 8 + r);
        line += glyphs.get(key) ?? "?";
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }


  /** Type text on the matrix keyboard: each key goes down until TEC-OS takes it. */
  typeMatrix(text, maxCycles = 50_000_000) {
    const kblast = this.sym("KBLAST");
    for (const ch of text) {
      const combo = getMatrixCombosForAscii(ch.charCodeAt(0)).find((c) => !c.capsLock && c.modifier !== "alt");
      if (!combo) throw new Error(`no matrix key for ${JSON.stringify(ch)}`);
      const key = combo.row * 8 + combo.col;
      const mod = combo.modifier === undefined ? undefined : MODIFIER_KEY[combo.modifier];
      if (mod !== undefined) this.tec1g.applyMatrixKey(0, mod, true);
      this.tec1g.applyMatrixKey(combo.row, combo.col, true);
      this.runUntil(() => this.read(kblast) === key, maxCycles, `matrix key ${JSON.stringify(ch)}`);
      this.tec1g.applyMatrixKey(combo.row, combo.col, false);
      if (mod !== undefined) this.tec1g.applyMatrixKey(0, mod, false);
      this.runUntil(() => this.read(kblast) === 0xff, maxCycles, `release of ${JSON.stringify(ch)}`);
    }
  }

  /**
   * Queue keystrokes for delivery without blocking: call pumpInput() between
   * steps. "serial" sends each byte when TEC-OS is waiting for one; "matrix"
   * holds each key down until TEC-OS has seen it, then releases it.
   */
  enqueueInput(text, via = "serial") {
    this.pending ??= [];
    for (const ch of text) this.pending.push({ code: ch.charCodeAt(0) & 0xff, via });
  }

  pumpInput() {
    const p = this.pending;
    if (!p || p.length === 0) return;
    const head = p[0];
    if (head.via === "matrix") {
      const kblast = this.sym("KBLAST");
      if (!head.down) {
        const combo = getMatrixCombosForAscii(head.code).find((c) => !c.capsLock && c.modifier !== "alt");
        if (!combo) {
          head.via = "serial";
          return;
        }
        head.key = combo.row * 8 + combo.col;
        head.combo = combo;
        head.mod = combo.modifier === undefined ? undefined : MODIFIER_KEY[combo.modifier];
        if (head.mod !== undefined) this.tec1g.applyMatrixKey(0, head.mod, true);
        this.tec1g.applyMatrixKey(combo.row, combo.col, true);
        head.down = true;
        return;
      }
      if (!head.up && this.read(kblast) === head.key) {
        this.tec1g.applyMatrixKey(head.combo.row, head.combo.col, false);
        if (head.mod !== undefined) this.tec1g.applyMatrixKey(0, head.mod, false);
        head.up = true;
        return;
      }
      if (head.up && this.read(kblast) === 0xff) p.shift();
      return;
    }
    if (!head.sent) {
      if (this.waitingForInput()) {
        this.tec1g.queueSerial([head.code]);
        head.sent = true;
      }
      return;
    }
    const pc = this.pc;
    if ((pc === this.sym("CINRX") || pc === this.sym("CSTRX")) && (this.cpu.cpu.a & 0x7f) === (head.code & 0x7f)) {
      p.shift();
    }
  }

  /** A card put in at the socket: the next command sees IMAGE, or no card with none. */
  swapCard(image, { highCapacity = true, onSdWrite } = {}) {
    this.sdImage = image;
    this.sd = image ? new SdSpi({ image, highCapacity, ...(onSdWrite ? { onWrite: onSdWrite } : {}) }) : null;
  }

  /** All RAM as one array: 0000h-BFFFh, then EXPAND 1's 16 KiB. */
  ramImage() {
    const out = new Uint8Array(0x10000);
    const latch = this.sysCtrl;
    for (let a = 0; a < 0xc000; a += 1) out[a] = this.read(a);
    this.cpu.hardware.ioWrite(0xff, (latch | 0x04) & 0xff);
    for (let a = 0x8000; a < 0xc000; a += 1) out[a + 0x4000] = this.read(a);
    this.cpu.hardware.ioWrite(0xff, latch);
    return out;
  }

  /** Fill RAM from ramImage()'s array, the bytes another ROM left behind. */
  loadRam(image) {
    const latch = this.sysCtrl;
    for (let a = 0; a < 0xc000; a += 1) this.write(a, image[a]);
    this.cpu.hardware.ioWrite(0xff, (latch | 0x04) & 0xff);
    for (let a = 0x8000; a < 0xc000; a += 1) this.write(a, image[a + 0x4000]);
    this.cpu.hardware.ioWrite(0xff, latch);
  }

  /**
   * From now until the program counter reaches one of DECISIONS (symbol names):
   * every memory write outside BOOTSTK's stack page, and the lowest program
   * counter from COLD to MEMINIT. Returns the record, which fills as the machine runs.
   */
  traceToDecision(decisions, stackFrom = 0x7f00) {
    const stops = decisions.map((n) => this.sym(n));
    const trace = { writes: [], decided: false, lowPc: 0xffff };
    const { memWrite } = this.cpu.hardware;
    const cold = this.sym("COLD");
    const meminit = this.sym("MEMINIT");
    const step = this.step.bind(this);
    let inRom = false;
    this.cpu.hardware.memWrite = (addr, value) => {
      const a = addr & 0xffff;
      if (!trace.decided && !(a >= stackFrom && a < 0x8000)) trace.writes.push(a);
      memWrite(addr, value);
    };
    this.step = () => {
      const pc = this.pc;
      if (pc === cold) inRom = true;
      if (pc === meminit) inRom = false;
      if (inRom && pc < trace.lowPc) trace.lowPc = pc;
      if (stops.includes(pc)) trace.decided = true;
      return step();
    };
    return trace;
  }

  /** The reset button: CPU and latches reset, RAM and the card keep their contents. */
  reset() {
    this.tec1g.resetState();
    const c = this.cpu.cpu;
    c.pc = 0;
    c.iff1 = 0;
    c.iff2 = 0;
    c.imode = 0;
    c.halted = false;
    this.mark = this.output.length;
  }
}

export function bootMachine(options) {
  const machine = new Machine(options);
  machine.mark = 0;
  return machine;
}
