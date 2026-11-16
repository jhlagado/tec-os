// A 40 x 4 character LCD as every HD44780-type module of that size is built:
// two controllers, each driving two rows of 40 from its own 80 bytes of
// display memory, with one enable line each. The first serves rows 0 and 1,
// the second rows 2 and 3. The Debug80 runtime models the TEC-1G's 20 x 4
// panel on one controller; this model is TEC-OS's own, for its tests, until a
// board and the runtime have such a panel.
//
// Each controller keeps a real HD44780's address counter: 00h-27h is its
// first line and 40h-67h its second, and the counter steps from 27h to 40h
// and from 67h to 00h. A read of the data port returns the cell and steps
// the counter, as a write does. Busy lasts 37 microseconds after a command
// or a data byte and 1.6 ms after clear and home, at 4 MHz.

const LINE = 40;
const BUSY = 148; // 37 microseconds at 4 MHz
const BUSY_CLEAR = 6400; // 1.6 ms

class Hd44780 {
  constructor(now) {
    this.now = now;
    this.ram = new Uint8Array(0x80).fill(0x20);
    this.addr = 0;
    this.busyUntil = 0;
    this.display = false;
    this.cursor = false;
    this.increment = true;
    this.commands = 0;
  }

  busy(cycles) {
    this.busyUntil = Math.max(this.busyUntil, this.now() + cycles);
  }

  step() {
    const a = this.addr + (this.increment ? 1 : -1);
    if (a === 0x28) this.addr = 0x40;
    else if (a === 0x68) this.addr = 0x00;
    else if (a === 0x3f) this.addr = 0x27;
    else if (a < 0) this.addr = 0x67;
    else this.addr = a & 0x7f;
  }

  readStatus() {
    return (this.now() < this.busyUntil ? 0x80 : 0) | this.addr;
  }

  readData() {
    const v = this.ram[this.addr];
    this.step();
    this.busy(BUSY);
    return v;
  }

  writeData(v) {
    this.ram[this.addr] = v & 0xff;
    this.step();
    this.busy(BUSY);
  }

  writeCommand(c) {
    this.commands += 1;
    if (c === 0x01) {
      this.ram.fill(0x20);
      this.addr = 0;
      this.busy(BUSY_CLEAR);
      return;
    }
    if ((c & 0xfe) === 0x02) {
      this.addr = 0;
      this.busy(BUSY_CLEAR);
      return;
    }
    if (c & 0x80) this.addr = c & 0x7f;
    else if ((c & 0xf8) === 0x08) {
      this.display = (c & 0x04) !== 0;
      this.cursor = (c & 0x02) !== 0;
    } else if ((c & 0xfc) === 0x04) this.increment = (c & 0x02) !== 0;
    this.busy(BUSY);
  }

  /** Line 0 or 1 as 40 bytes. */
  line(n) {
    return this.ram.subarray(n * 0x40, n * 0x40 + LINE);
  }
}

/**
 * The TEC-1G's 20 x 4 panel on one controller with a real address counter:
 * rows 0 and 2 are the first line's cells 00h-13h and 14h-27h, rows 1 and 3
 * the second line's 40h-53h and 54h-67h, so a write past row 0's end lands on
 * row 2. The runtime's panel steps to row 1 there. A console that never
 * passes a row's end shows the same text on both.
 */
export class Lcd20x4 {
  constructor(now, ports = { cmd: 0x04, dat: 0x84 }) {
    this.ports = ports;
    this.controller = new Hd44780(now);
  }

  read(port) {
    if (port === this.ports.cmd) return this.controller.readStatus();
    if (port === this.ports.dat) return this.controller.readData();
    return undefined;
  }

  write(port, value) {
    if (port === this.ports.cmd) this.controller.writeCommand(value);
    else if (port === this.ports.dat) this.controller.writeData(value);
    else return false;
    return true;
  }

  screen() {
    const r = this.controller.ram;
    const text = (from) => String.fromCharCode(...r.subarray(from, from + 20));
    return [text(0x00), text(0x40), text(0x14), text(0x54)];
  }
}

/** The panel: ports is { cmd1, dat1, cmd2, dat2 }. */
export class Lcd40x4 {
  constructor(now, ports = { cmd1: 0x04, dat1: 0x84, cmd2: 0x0c, dat2: 0x8c }) {
    this.ports = ports;
    this.controllers = [new Hd44780(now), new Hd44780(now)];
  }

  /** The value read at PORT, or undefined when the port is not the panel's. */
  read(port) {
    const { cmd1, dat1, cmd2, dat2 } = this.ports;
    if (port === cmd1) return this.controllers[0].readStatus();
    if (port === dat1) return this.controllers[0].readData();
    if (port === cmd2) return this.controllers[1].readStatus();
    if (port === dat2) return this.controllers[1].readData();
    return undefined;
  }

  /** True when PORT was the panel's and took the write. */
  write(port, value) {
    const { cmd1, dat1, cmd2, dat2 } = this.ports;
    if (port === cmd1) this.controllers[0].writeCommand(value);
    else if (port === dat1) this.controllers[0].writeData(value);
    else if (port === cmd2) this.controllers[1].writeCommand(value);
    else if (port === dat2) this.controllers[1].writeData(value);
    else return false;
    return true;
  }

  /** The four rows as text. */
  screen() {
    const text = (b) => String.fromCharCode(...b);
    const [a, b] = this.controllers;
    return [text(a.line(0)), text(a.line(1)), text(b.line(0)), text(b.line(1))];
  }

  /** Where the hardware cursor shows: { row, col }, or null with it off. */
  cursor() {
    for (const [i, c] of this.controllers.entries()) {
      if (!c.cursor) continue;
      const line = c.addr >= 0x40 ? 1 : 0;
      return { row: i * 2 + line, col: c.addr - line * 0x40 };
    }
    return null;
  }
}
