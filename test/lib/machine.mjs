// A TEC-1G running a TEC-OS ROM in the Debug80 runtime.
//
// The Debug80 TEC-1G runtime supplies the CPU, latch decoding, overlay,
// expansion banks, keypad and serial timing. The SD card is a Debug80 SdSpi
// instance attached here so the test owns the card image in memory. Every
// memory write is checked: a write to ROM, or to 0000h-07FFh while the boot
// overlay is on, is recorded as a violation.

import { readFileSync } from "node:fs";
import { createTec1gRuntime, normalizeTec1gConfig } from "@jhlagado/debug80-runtime/platforms/tec1g/runtime";
import { createTec1gMemoryHooks } from "@jhlagado/debug80-runtime/platforms/tec1g/tec1g-memory";
import { SdSpi } from "@jhlagado/debug80-runtime/platforms/tec1g/sd-spi";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";

const SD_PORT = 0xfd;

export function loadSymbols(path) {
  const d8 = JSON.parse(readFileSync(path, "utf8"));
  const map = new Map();
  for (const s of d8.symbols) map.set(s.name.toUpperCase(), s.address ?? s.value);
  return map;
}

export class Machine {
  constructor({ rom, symbols, sdImage, highCapacity = true, ramFill = 0x00 }) {
    this.symbols = symbols;
    this.output = [];
    this.violations = [];
    this.cycles = 0;
    this.sdImage = sdImage;
    this.sd = sdImage ? new SdSpi({ image: sdImage, highCapacity }) : null;
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
    });
    this.tec1g = createTec1gRuntime(
      config,
      () => {},
      (byte) => this.output.push(byte),
    );
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
    this.cpu.hardware.memRead = hooks.memRead;
    this.cpu.hardware.forceMemWrite = hooks.forceMemWrite;
    this.cpu.hardware.isMemoryWritable = hooks.isMemoryWritable;
    this.cpu.hardware.memWrite = (addr, value) => {
      const a = addr & 0xffff;
      if (a >= 0xc000) this.violations.push({ kind: "rom-write", addr: a, pc: this.cpu.cpu.pc });
      else if (a < 0x0800 && system.shadowEnabled) {
        this.violations.push({ kind: "overlay-write", addr: a, pc: this.cpu.cpu.pc });
      }
      hooks.memWrite(a, value);
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
    const start = this.sym("CINWT");
    return pc >= start && pc < start + 6;
  }

  /** Type text one character at a time, as a terminal user would. */
  type(text, maxCycles = 100_000_000) {
    for (const ch of text) {
      this.runUntil(() => this.waitingForInput(), maxCycles, `input request for ${JSON.stringify(ch)}`);
      this.tec1g.queueSerial([ch.charCodeAt(0)]);
      this.runUntil(() => !this.waitingForInput(), maxCycles, `reception of ${JSON.stringify(ch)}`);
    }
  }

  /** Type a command line and wait for the next CCP prompt. */
  command(line, { prompt = /\r\n[A-P]>$/, maxCycles = 400_000_000 } = {}) {
    this.mark = this.output.length;
    this.type(`${line}\r`);
    return this.expect(prompt, { maxCycles });
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
