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

const MODIFIER_KEY = { shift: 0, ctrl: 1, fn: 2 };

const SD_PORT = 0xfd;

/** Symbol map (name to address) from a Debug80 D8 debug map object. */
export function symbolsFromD8(d8) {
  const map = new Map();
  for (const s of d8.symbols) map.set(s.name.toUpperCase(), s.address ?? s.value);
  return map;
}

export class Machine {
  constructor({ rom, symbols, sdImage, highCapacity = true, ramFill = 0x00, tms = false, matrix = false, windowRam = true, onSdWrite }) {
    this.symbols = symbols;
    this.output = [];
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
    });
    this.tec1g = createTec1gRuntime(
      config,
      () => {},
      (byte) => this.output.push(byte),
    );
    if (tms) this.tec1g.setTms9918Active(true);
    const base = this.tec1g.ioHandlers;
    const io = {
      read: (port) => ((port & 0xff) === SD_PORT ? (this.sd ? this.sd.read() : 0xff) : base.read(port)),
      write: (port, value) => {
        if ((port & 0xff) === SD_PORT) {
          if (this.sd) this.sd.write(value);
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
    this.cpu.hardware.memRead = (addr) => (empty(addr & 0xffff) ? 0xff : hooks.memRead(addr));
    this.cpu.hardware.forceMemWrite = hooks.forceMemWrite;
    this.cpu.hardware.isMemoryWritable = hooks.isMemoryWritable;
    this.cpu.hardware.memWrite = (addr, value) => {
      const a = addr & 0xffff;
      if (a >= 0xc000) this.violations.push({ kind: "rom-write", addr: a, pc: this.cpu.cpu.pc });
      else if (a < 0x0800 && system.shadowEnabled) {
        this.violations.push({ kind: "overlay-write", addr: a, pc: this.cpu.cpu.pc });
      }
      if (!empty(a)) hooks.memWrite(a, value);
    };
    this.read = (addr) => hooks.memRead(addr & 0xffff);
    this.write = (addr, value) => hooks.memWrite(addr & 0xffff, value & 0xff);
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
      this.runUntil(() => this.cycles >= next, every * 2, what);
      if (this.cycles > limit) {
        throw new Error(`no ${what} within ${maxCycles} cycles; pc=${this.pc.toString(16)}`);
      }
    }
  }

  text(from = 0) {
    return Buffer.from(this.output.slice(from)).toString("latin1");
  }

  /** Run until the console output since `from` matches pattern. */
  expect(pattern, { from = this.mark ?? 0, maxCycles = 100_000_000 } = {}) {
    this.runUntil(() => pattern.test(this.text(from)), maxCycles, `output ${pattern}`);
    const out = this.text(from);
    this.mark = this.output.length;
    return out;
  }

  /** True while the console input routine is waiting for a start bit. */
  waitingForInput() {
    const pc = this.pc;
    return (pc >= this.sym("CINLP") && pc < this.sym("CINWE")) || (pc >= this.sym("CSTPOLL") && pc < this.sym("CSTGOT"));
  }

  /** Type text one character at a time, as a terminal user would: each byte
   *  is sent only when TEC-OS is waiting and the next waits until it has been
   *  received. */
  type(text, maxCycles = 100_000_000) {
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
  command(line, { prompt = /\r\n[A-P]>$/, maxCycles = 400_000_000 } = {}) {
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
   * is matched against the ROM font. Reverse cells read as their character;
   * unknown patterns read as "?".
   */
  glcdScreen(cols = 21, rows = 8) {
    const gdram = this.tec1g.state.display.glcdCtrl.glcd;
    const font = this.sym("FONT");
    const pixel = (x, y) => (gdram[y * 16 + (x >> 3)] >> (7 - (x & 7))) & 1;
    this.glyphCache ??= new Map();
    const glyphs = this.glyphCache;
    for (let code = glyphs.size ? 0x80 : 0x20; code < 0x80; code += 1) {
      let key = "";
      let rev = "";
      for (let r = 0; r < 8; r += 1) {
        const bits = this.read(font + (code - 0x20) * 8 + r);
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
