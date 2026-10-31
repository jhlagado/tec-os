// The PICO9918 console as a driver: its widths, the take, a board with both
// displays, a claim in each state, UNLOAD, and nothing calling a vector while no
// table is in. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardProblem } from "../host/card.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCard } from "../host/card.mjs";
import { PICO_WIDTHS, makeDrv } from "../tools/lib/drv.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { Machine } from "./lib/machine.mjs";
import { screens } from "./lib/pico-workload.mjs";
import { ABI, GLCD_DRV, PICO_DRV, ROOT, TEST_CLOCK, boot, driver, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const m0 = (m) => m.sym("CONMOD");
const lcdRow = (m, row) => String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(row * 20, row * 20 + 20)).trimEnd();
const CRT = 1;
const UC1 = 3;

/** A machine at its usable prompt, with zero trapped: pc at 0 from reset on is a vector call. */
function start(files, { key = false, ...opts } = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\n\x1a", "latin1"));
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, ...opts });
  if (key) m.tec1g.applyKeySilent(0x01, true); // held through reset: the skip
  m.traps = 0;
  let booting = true;
  const step = m.step.bind(m);
  m.step = () => {
    // A null word lands at 0: only reset may be there, before the first cycle.
    if (m.pc === 0 && booting && m.cycles > 0) m.traps += 1;
    if (m.pc < 8 && m.pc !== 0 && m.pc !== 5 && m.pc !== 6 && m.pc !== 3) m.traps += 1;
    return step();
  };
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "a usable prompt");
  booting = false;
  return m;
}
const both = (lines = ["PICO.DRV", "GLCD.DRV"], more = {}) => ({ "PICO.DRV": PICO_DRV["PICO.DRV"], "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile(...lines), ...more });
const say = (m, line) => {
  m.mark = m.output.length;
  if (m.videoConsole()) m.typeMatrix(`${line.toLowerCase()}\r`);
  else m.type(`${line}\r`);
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 400_000_000, line);
  return m.text(m.mark);
};
/** Call ADDR from a stub, with these registers. */
const callAt = (m, addr, regs) => {
  const STUB = 0x0060;
  [0xcd, addr & 0xff, addr >> 8, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  const cpu = m.cpu.cpu;
  const saved = Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "sp", "pc"].map((r) => [r, cpu[r]]));
  const flags = { ...cpu.flags };
  Object.assign(cpu, regs, { sp: 0x0100, pc: STUB });
  m.runUntil(() => m.pc === STUB + 3, 80_000_000, "the call");
  const after = { a: cpu.a, b: cpu.b, h: cpu.h, l: cpu.l, flags: { ...cpu.flags } };
  Object.assign(cpu, saved, { flags }); // back in the input loop, which the stub interrupted
  return after;
};
const VIDEO = ABI.HWVIDEO;
const { PICOREG, PICOFIL, PICOWR, PICORD, HWBWRD, HWINFO } = ABI;
const hw = (m, c, b, a = 0) => callAt(m, m.sym("ABIHW"), { a, b, c }).a;

/** The "PICO" record's table at the least version, or null. */
const picoTable = (m, least = 2) => {
  [..."PICO    "].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
  const c = callAt(m, m.sym("ABIDRV"), { b: least, c: 0, d: 0x20, e: 0 });
  return c.flags.C ? null : (c.h << 8) | c.l;
};
/** A graphics entry, by its offset in the table. */
const gfx = (m, off, regs) => callAt(m, word(m, picoTable(m) + off), regs);

for (const [name, cols] of [["PICO.DRV", 80], ["PICO40.DRV", 40], ["PICO32.DRV", 32]]) {
  test(`${name} is the console at ${cols} columns, and scrolls`, () => {
    const m = start({ [name]: PICO_DRV[name], "STARTUP.CMD": startupFile(name) });
    assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], [CRT, CRT, cols, 24]);
    for (let i = 0; i < 26; i += 1) say(m, "DIR HELLO.TXT");
    assert.ok(m.screen(cols).some((l) => l.startsWith("HELLO.TXT")));
    assert.deepEqual(m.violations, []);
  });
}

test("a board with both displays keeps the PICO9918; GLCD.DRV's line gives way, and CON UC1 installs it", () => {
  const m = start(both());
  assert.match(m.text(0), /GLCD\.DRV\?/);
  const one = word(m, 6);
  assert.equal(m.read(3) & 3, CRT);
  say(m, "CON UC1");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), word(m, 6)], [UC1, UC1, one - 0x600]);
  say(m, "CON CRT");
  assert.equal(m.read(m.sym("CONMOD")), CRT);
  say(m, "CON UC1");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), word(m, 6)], [CRT, CRT, one], "the GLCD's UNLOAD goes back to CRT:");
});

test("the GLCD's UNLOAD clears its INFO bit", () => {
  const m = start(both(["PICO.DRV"]));
  say(m, "CON UC1");
  assert.equal(m.read(m.sym("CONDEV")) & 4, 4);
  say(m, "UNLOAD");
  assert.equal(m.read(m.sym("CONDEV")) & 4, 0);
});

test("CON UC1, CON TTY, UNLOAD stays on serial: only UC1: moves to CRT:", () => {
  const m = start(both(["PICO.DRV"]));
  say(m, "CON UC1");
  say(m, "CON TTY");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [0, 0]);
});

test("a driver loading with GLCD.DRV in installs, and says nothing", async () => {
  const m = start({ "GLCD.DRV": GLCD_DRV, "RES.DRV": await driver("res"), "STARTUP.CMD": startupFile("GLCD.DRV") }, { tms: false });
  assert.doesNotMatch(say(m, "RES.DRV"), /RES\.DRV\?/);
});

test("PICO32.DRV writes the colours and an empty sprite table", () => {
  const m = start({ "PICO32.DRV": PICO_DRV["PICO32.DRV"], "STARTUP.CMD": startupFile("PICO32.DRV") });
  const v = m.tec1g.state.display.tms9918.stateSnapshot().vram;
  assert.deepEqual([...new Set(v.slice(0x2000, 0x2000 + 32))], [0xf1]);
  assert.equal(v[0x1b00], 0xd0);
});

test("TPA after boot: one display, and both", () => {
  const top = (m) => word(m, 6) - 0x100;
  assert.equal(top(start(both(["PICO.DRV"]), { glcd: false })), 45318);
  assert.equal(top(start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("GLCD.DRV") }, { tms: false })), 45318);
  const m = start(both());
  assert.equal(top(m), 45318, "a board with both, at boot");
  say(m, "CON UC1");
  assert.equal(top(m), 43782);
});

const REF = JSON.parse(readFileSync(resolve(ROOT, "test/pico-screens.json"), "utf8"));
for (const [profile, cols] of [["debug80", 80], ["debug80t40", 40], ["debug80g32", 32]]) {
  test(`at ${cols} columns the screens equal the ROM console's, step by step`, () => {
    const m = boot(standardCard(), { profile, tms: true, matrix: true });
    assert.deepEqual(screens(m, cols), REF[cols]);
  });
}

test("a scroll, then ESC[2@ keeps the row it opens", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  const shots = screens(m, 80);
  assert.equal(shots.find((s) => s.name === "insert characters").screen.some((l) => l === "  abcdef"), true);
});

test("the starter card boots the PICO9918 alone on a board with both, and the GLCD on a board with one", async () => {
  const files = await displayFiles(ROOT);
  assert.deepEqual(files.map((f) => f.name), ["PICO.DRV", "PICO40.DRV", "PICO32.DRV", "GLCD.DRV", "STARTUP.CMD"]);
  const set = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
  const pico = start(set);
  assert.deepEqual([pico.read(m0(pico)), word(pico, 6) - 0x100], [CRT, 45318]);
  assert.equal(start(set, { tms: false }).read(3) & 3, UC1);
});

test("a dead card shows CARD? on the LCD, for a board with no terminal", () => {
  const m = new Machine({ ...romFor(), clock: TEST_CLOCK, tms: true, matrix: true });
  m.expect(/R retry, H header> $/, { from: 0, maxCycles: 200_000_000 });
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd(), "CARD?");
});

test("a good retry clears CARD?, and a failed one shows it again", () => {
  const image = standardCard();
  image[0] ^= 0xff; // a card that starts, with no container to mount
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, matrix: true });
  m.expect(/R retry, H header> $/, { from: 0, maxCycles: 200_000_000 });
  assert.equal(lcdRow(m, 3), "CARD?");
  m.mark = m.output.length;
  m.type("R");
  m.expect(/R retry, H header> $/, { maxCycles: 200_000_000 });
  assert.equal(lcdRow(m, 3), "CARD?");
  image[0] ^= 0xff;
  m.mark = m.output.length;
  m.type("R");
  m.expect(/A>$/, { maxCycles: 400_000_000 });
  assert.equal(lcdRow(m, 3), "");
  assert.match(lcdRow(m, 0), /^TEC-OS/);
  assert.match(lcdRow(m, 1), /^A: /);
});

const BAD = new Uint8Array(200).fill(0x55);
for (const [name, files, opts] of [
  ["a missing PICO.DRV", { "STARTUP.CMD": startupFile("PICO.DRV") }, {}],
  ["a bad PICO.DRV", { "PICO.DRV": BAD, "STARTUP.CMD": startupFile("PICO.DRV") }, {}],
  ["no STARTUP.CMD", {}, {}],
  ["a file with no display line", { "STARTUP.CMD": startupFile("USER 0") }, {}],
  ["a skip past a good PICO.DRV", { ...PICO_DRV, "STARTUP.CMD": startupFile("PICO.DRV") }, { key: true }],
]) {
  test(`a PICO9918 board with ${name} says PICO? on the LCD, once`, () => {
    const m = start(files, opts);
    assert.equal(word(m, m.sym("PIVEC")), 0, "no driver in");
    assert.equal(lcdRow(m, 3), "PICO?");
    m.tec1g.state.lcdCtrl.lcd.fill(0x20, 60, 80);
    m.command("USER 0");
    assert.equal(lcdRow(m, 3), "", "the next prompt leaves the row alone");
  });
}

test("STDONE returns carry through LCDROW: the file's last line runs once", () => {
  const m = start({ "STARTUP.CMD": startupFile("PICO.DRV") });
  assert.equal(lcdRow(m, 3), "PICO?");
  assert.equal((m.text(0).match(/PICO\.DRV\?/g) ?? []).length, 1);
});

test("GLCLD returns carry through LCDROW when GLCD.DRV won't load", () => {
  const m = start({}, { tms: false });
  const top = m.sym("CSTKTOP") - 2;
  m.write(top, 0x00);
  m.write(top + 1, 0x01); // back to 0100h, where the run stops
  m.cpu.cpu.sp = top;
  m.cpu.cpu.pc = m.sym("GLCLD");
  m.runUntil(() => m.pc === 0x100, 50_000_000, "GLCLD returning");
  assert.equal(m.cpu.cpu.flags.C, 1);
  assert.equal(lcdRow(m, 3), "GLCD?");
});

test("a line left without an end, and a record full to its last byte, say PICO? after they run", () => {
  const raw = (text) => Buffer.from(text, "latin1");
  for (const file of [raw("PICO.DRV\x1a"), raw("USER 1\r\n".repeat(15) + "\r".repeat(6) + "\r\n")]) {
    assert.equal(lcdRow(start({ "STARTUP.CMD": file }), 3), "PICO?");
  }
});

test("a good PICO.DRV shows nothing on the LCD", () => {
  const m = start({ ...PICO_DRV, "STARTUP.CMD": startupFile("PICO.DRV") });
  assert.equal(m.read(m.sym("CONMOD")), CRT);
  assert.equal(lcdRow(m, 3), "");
});

test("a display driver in, then CON TTY in the file: the LCD stays silent", () => {
  for (const name of ["PICO.DRV", "GLCD.DRV"]) {
    const m = start({ ...PICO_DRV, "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile(name, "CON TTY") });
    assert.equal(m.read(m.sym("CONMOD")), 0, name);
    assert.equal(lcdRow(m, 3), "", name);
  }
});

test("the LCD stays silent with no PICO9918, and with no matrix keyboard", () => {
  for (const opts of [{ tms: false }, { matrix: false }]) {
    const m = start({ ...PICO_DRV, "STARTUP.CMD": startupFile("PICO.DRV") }, opts);
    assert.equal(lcdRow(m, 3), "", JSON.stringify(opts));
  }
});

test("a display driver installed by hand clears PICO?", () => {
  const typed = start({ "PICOX.DRV": PICO_DRV["PICO.DRV"] });
  const info = () => callAt(typed, typed.sym("ABIHW"), { c: HWINFO }).b;
  assert.equal(lcdRow(typed, 3), "PICO?");
  assert.equal(info() & HWBWRD, HWBWRD, "INFO reports the word");
  say(typed, "PICOX.DRV");
  assert.equal(typed.read(m0(typed)), CRT);
  assert.equal(lcdRow(typed, 3), "");
  assert.equal(info() & HWBWRD, 0, "and its going");
  const uc1 = start({ "GLCD.DRV": GLCD_DRV });
  assert.equal(lcdRow(uc1, 3), "PICO?");
  say(uc1, "CON UC1");
  assert.equal(uc1.read(m0(uc1)), UC1);
  assert.equal(lcdRow(uc1, 3), "");
});

test("a board whose PICO.DRV fails takes the GLCD from the next line, and the LCD says nothing", () => {
  const m = start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("PICO.DRV", "GLCD.DRV") });
  assert.match(m.text(0), /PICO\.DRV\?/);
  assert.equal(m.read(m.sym("CONMOD")), UC1);
  assert.equal(lcdRow(m, 3), "");
});

test("the GLCD's UNLOAD with CRT: as the console leaves it there", () => {
  const m = start(both(["PICO.DRV"]));
  say(m, "CON UC1");
  say(m, "CON CRT");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [CRT, CRT]);
  assert.equal(m.read(m.sym("GLVEC") + 1), 0);
});

test("REMOVE refuses while PICO.DRV is the console, and UNLOAD changes nothing; from serial it goes", () => {
  const m = start(both(["PICO.DRV"]));
  const top = word(m, 6);
  assert.match(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.equal(word(m, 6), top);
  say(m, "CON TTY");
  say(m, "UNLOAD");
  assert.deepEqual([word(m, 6), word(m, m.sym("PIVEC"))], [top + 0x600, 0]);
  m.traps = 0;
  m.cpu.cpu.pc = 0; // a warm boot with no table
  m.mark = m.output.length;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  assert.equal(m.traps, 0);
  assert.match(say(m, "CON CRT"), /serial terminal/, "CON CRT has no load, and falls back");
  assert.match(say(m, "DIR HELLO.TXT"), /HELLO\.TXT/);
});

test("no driver: reset to a prompt on serial with no file, a bad file and no vector call", () => {
  for (const files of [{}, { "PICO.DRV": new Uint8Array(200).fill(0x55), "STARTUP.CMD": startupFile("PICO.DRV") }]) {
    const m = start(files);
    assert.equal(m.traps, 0);
    assert.deepEqual([m.read(m.sym("CONMOD")), word(m, m.sym("PIVEC"))], [0, 0]);
    assert.match(m.command("DIR HELLO.TXT"), /HELLO\.TXT/);
  }
});

test("on UC1: with no PICO driver, boot and a warm boot make no vector call", () => {
  const m = start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("GLCD.DRV") }, { tms: false });
  assert.equal(m.read(m.sym("CONMOD")), UC1);
  m.cpu.cpu.pc = 0;
  m.mark = m.output.length;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  assert.equal(m.traps, 0);
});

test("PICO.DRV is refused with no PICO9918, and with no matrix keyboard", () => {
  for (const opts of [{ tms: false }, { matrix: false }]) {
    const m = start({ "PICO.DRV": PICO_DRV["PICO.DRV"], "STARTUP.CMD": startupFile("PICO.DRV") }, opts);
    assert.match(m.text(0), /PICO\.DRV\?/);
    assert.deepEqual([m.read(m.sym("DRVHEAD")), m.read(m.sym("CONMOD"))], [0, 0]);
  }
});

test("a claimed VDP takes no row-move call: the driver isn't entered while a program owns it", () => {
  const m = start(both(["PICO.DRV"]));
  hw(m, VIDEO, 1);
  const base = m.read(m.sym("DRVHEAD")) << 8;
  let entered = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc >= base && m.pc < base + 0x600) entered += 1;
    return step();
  };
  const STUB = 0x0060;
  [0xcd, m.sym("BCONST") & 0xff, m.sym("BCONST") >> 8, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  Object.assign(m.cpu.cpu, { sp: 0x0100, pc: STUB });
  m.runUntil(() => m.pc === STUB + 3, 20_000_000, "BCONST");
  assert.equal(entered, 0);
});

test("the take runs only for a driver with its table in its own page", async () => {
  const m = start(both(["PICO.DRV"], { "RES.DRV": await driver("res") }));
  say(m, "CON TTY");
  say(m, "RES.DRV");
  assert.equal(m.read(m.sym("CONMOD")), 0, "any other driver leaves the console");
});

const VREG1 = (m) => m.tec1g.state.display.tms9918.stateSnapshot().registers[1];

test("a claim with PICO.DRV in, on CRT:: nothing drawn, and release restores it", () => {
  const m = start(both(["PICO.DRV"]));
  assert.equal(hw(m, VIDEO, 1), 0);
  gfx(m, PICOREG, { a: 0xc0, b: 1 });
  assert.equal(VREG1(m), 0xc0, "the program's mode");
  assert.equal(hw(m, VIDEO, 0), 0);
  assert.equal(VREG1(m), 0x50, "text mode back");
});

test("a claim with PICO.DRV in, on UC1:: release restores the VDP, and the GLCD stays the console", () => {
  const m = start(both(["PICO.DRV"]));
  say(m, "CON UC1");
  hw(m, VIDEO, 1);
  gfx(m, PICOREG, { a: 0xc0, b: 1 });
  assert.equal(hw(m, VIDEO, 0), 0);
  assert.equal(VREG1(m), 0x50);
  assert.equal(m.read(m.sym("CONMOD")), UC1);
});

test("a claim with no driver, and after UNLOAD: refused by nothing, and nothing is restored", () => {
  for (const unload of [false, true]) {
    const m = start(unload ? both(["PICO.DRV"]) : {});
    if (unload) {
      say(m, "CON TTY");
      say(m, "UNLOAD");
    }
    const before = VREG1(m);
    const bdos = word(m, 6);
    let wild = 0;
    const step = m.step.bind(m);
    m.step = () => {
      if (m.pc === bdos) wild += 1; // through word 0's sixth byte
      return step();
    };
    assert.equal(hw(m, VIDEO, 1), 0);
    assert.equal(hw(m, VIDEO, 0), 0);
    assert.equal(VREG1(m), before);
    assert.deepEqual([m.traps, wild], [0, 0]);
  }
});

test("a program reading VRAM on the driver sees the names and patterns it saw", () => {
  const m = start(both(["PICO.DRV"]));
  const v = m.tec1g.state.display.tms9918.stateSnapshot().vram;
  assert.deepEqual([...v.slice(0x41 * 8, 0x41 * 8 + 8)], [...Machine.font.subarray(0x21 * 8, 0x22 * 8)]);
  assert.ok([...v.slice(0x1000, 0x1000 + 80 * 24)].includes(0x41), "the screen's A> in the name table");
});

/** What fn writes to the VDP's control port. */
function ports(m, fn) {
  const seen = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (port, value) => {
    if ((port & 0xff) === 0xbf) seen.push(value & 0xff);
    io(port, value);
  };
  try {
    return [fn(), seen];
  } finally {
    m.cpu.hardware.ioWrite = io;
  }
}

const WIDTHS = [["PICO.DRV", 80, 0x50], ["PICO40.DRV", 40, 0xd0], ["PICO32.DRV", 32, 0xc0]];
const vram = (m) => m.tec1g.state.display.tms9918.stateSnapshot().vram;
const cold = (m, off) => hw(m, VIDEO, off);
const ramAt = (m, a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));

for (const [name, cols, r1] of WIDTHS) {
  test(`${name}: each graphics entry against VRAM under a claim, then release and warm boot give the text back`, () => {
    const m = start({ [name]: PICO_DRV[name], "STARTUP.CMD": startupFile(name) });
    assert.notEqual(picoTable(m, 2), null, "the record's version 2");
    assert.equal(picoTable(m, 3), null, "and no higher");
    const page = m.read(m.sym("DRVHEAD"));
    assert.equal(picoTable(m) >> 8, page, "the table is in the driver's page");
    assert.equal(cold(m, 1), 0);
    gfx(m, PICOREG, { a: 0x1c, b: 7 });
    assert.equal(m.tec1g.state.display.tms9918.stateSnapshot().registers[7], 0x1c);
    gfx(m, PICOFIL, { a: 0x5a, d: 1, e: 0x2c, h: 0x30, l: 0 });
    const filled = vram(m);
    assert.ok(filled.slice(0x3000, 0x3000 + 300).every((b) => b === 0x5a));
    assert.equal(filled[0x3000 + 300], 0, "the fill stops at its count");
    gfx(m, PICOFIL, { a: 0xa5, d: 0, e: 0, h: 0x30, l: 0 });
    assert.equal(vram(m)[0x3000], 0x5a, "a count of zero fills nothing");
    const data = Array.from({ length: 300 }, (_, i) => (i * 3) & 0xff);
    data.forEach((v, i) => m.write(0x2100 + i, v));
    const [, wrote] = ports(m, () => gfx(m, PICOWR, { b: 1, c: 0x2c, d: 0x21, e: 0, h: 0x32, l: 0 }));
    assert.deepEqual(wrote.slice(0, 2), [0x00, 0x72], "the VDP is told a write");
    assert.deepEqual([...vram(m).slice(0x3200, 0x3200 + 300)], data);
    const [, read] = ports(m, () => gfx(m, PICORD, { b: 1, c: 0x2c, d: 0x28, e: 0, h: 0x32, l: 0 }));
    assert.deepEqual(read.slice(0, 2), [0x00, 0x32], "the VDP is told a read");
    assert.deepEqual(ramAt(m, 0x2800, 300), data, "VRAM read back");
    m.write(0x2100, data[0] ^ 0xff);
    gfx(m, PICOWR, { b: 0, c: 0, d: 0x21, e: 0, h: 0x32, l: 0 });
    assert.equal(vram(m)[0x3200], data[0], "a count of zero writes nothing");
    m.write(0x2900, 0x77);
    gfx(m, PICORD, { b: 0, c: 0, d: 0x29, e: 0, h: 0x32, l: 0 });
    assert.equal(m.read(0x2900), 0x77, "a count of zero reads nothing");
    assert.equal(cold(m, 0), 0);
    assert.equal(VREG1(m), r1, "release: text mode");
    assert.equal(m.tec1g.state.display.tms9918.stateSnapshot().registers[7], cols === 32 ? 0xf1 : 0xf4);
    cold(m, 1);
    gfx(m, PICOREG, { a: 0xe2, b: 1 });
    m.cpu.cpu.pc = 0;
    m.mark = m.output.length;
    m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
    assert.equal(m.read(m.sym("VCLAIM")), 0, "program exit releases");
    assert.equal(VREG1(m), r1, "warm boot: text mode");
    assert.deepEqual(m.violations, []);
  });

  test(`${name}: the whole pattern table after the take, CONSWV, a release and a warm boot`, () => {
    const m = start({ [name]: PICO_DRV[name], "STARTUP.CMD": startupFile(name) });
    const want = Array.from({ length: 256 }, (_, code) => {
      const c = code & 0x7f;
      const glyph = [...Machine.font.subarray(c < 0x20 ? 0 : (c - 0x20) * 8, c < 0x20 ? 8 : (c - 0x20) * 8 + 8)];
      return code & 0x80 ? glyph.map((v) => ~v & 0xff) : glyph;
    }).flat();
    const patterns = (label) => assert.deepEqual([...vram(m).slice(0, 0x800)], want, label);
    const wreck = () => vram(m).fill(0, 0, 0x800);
    patterns("after the take");
    wreck();
    say(m, "CON TTY");
    say(m, "CON CRT");
    assert.equal(m.read(m.sym("CONMOD")), CRT);
    patterns("after CONSWV");
    cold(m, 1);
    wreck();
    cold(m, 0);
    patterns("after a release");
    wreck();
    m.cpu.cpu.pc = 0;
    m.mark = m.output.length;
    m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
    patterns("after a warm boot");
  });
}

test("a claim held at UNLOAD after CON TTY: refused, the service still found, and allowed after the release", () => {
  const m = start(both(["PICO.DRV"]));
  say(m, "CON TTY");
  const top = word(m, 6);
  const table = picoTable(m);
  assert.notEqual(table, null);
  assert.equal(cold(m, 1), 0);
  assert.match(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.equal(word(m, 6), top, "nothing moved");
  assert.equal(picoTable(m), table, "the service is found while claimed");
  gfx(m, PICOREG, { a: 0xf4, b: 7 });
  assert.equal(cold(m, 0), 0);
  assert.equal(picoTable(m), table, "and after the release");
  assert.doesNotMatch(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.deepEqual([word(m, 6), word(m, m.sym("PIVEC")), picoTable(m)], [top + 0x600, 0, null]);
});

test("a refused record under a claim: REMOVE refuses, so the pages stay with the table hooked, and a warm boot is safe", async () => {
  const text = readFileSync(resolve(ROOT, "drivers/pico.asm"), "utf8").replace('"../src/abi.inc"', '"../../src/abi.inc"').replace('"font.asm"', '"../../drivers/font.asm"');
  const a = "        LD      HL,REC\n";
  assert.ok(text.includes(a));
  const dir = resolve(ROOT, "build/variants");
  mkdirSync(dir, { recursive: true });
  const src = resolve(dir, "picobad.asm");
  writeFileSync(src, text.replace(a, `        LD      B,1\n        LD      C,HWVIDEO\n        CALL    ABIHW\n        LD      HL,ABITAB\n`));
  const { file } = await makeDrv(src, { defs: PICO_WIDTHS["PICO.DRV"], work: resolve(ROOT, "build/drv") });
  const m = start({ "PICOB.DRV": file, "STARTUP.CMD": startupFile("PICOB.DRV") });
  assert.match(m.text(0), /PICOB\.DRV\?/);
  const page = m.read(m.sym("DRVHEAD"));
  assert.ok(page >= 0x80, "the pages are kept");
  assert.equal(word(m, 6), (page << 8) + 6);
  assert.equal(m.read(m.sym("PIVEC") + 1), page, "the table stays hooked");
  assert.equal(picoTable(m, 1), null, "no record");
  assert.equal(m.read(m.sym("CONMOD")), 0, "no take");
  m.cpu.cpu.pc = 0;
  m.mark = m.output.length;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  assert.equal(m.read(m.sym("VCLAIM")), 0, "warm boot gave the claim back, through the kept pages");
  assert.deepEqual(m.violations, []);
});

test("INIT failing leaves no record and the old ceiling", () => {
  for (const [name, opts, files] of [["PICO.DRV", { matrix: false }, PICO_DRV], ["PICO.DRV", { tms: false }, PICO_DRV], ["GLCD.DRV", { tms: false, glcd: false }, { "GLCD.DRV": GLCD_DRV }]]) {
    const plain = word(start({}, opts), 6);
    const m = start({ ...files, "STARTUP.CMD": startupFile(name) }, opts);
    assert.deepEqual([word(m, 6), m.read(m.sym("DRVHEAD")), word(m, m.sym("REGHEAD")), word(m, m.sym("PIVEC")), word(m, m.sym("GLVEC"))], [plain, 0, 0, 0, 0], `${name} ${JSON.stringify(opts)}`);
  }
});

test("KE-115: a take leaves a program's row 3 alone, and clears PICO? only when it is up", () => {
  const row = "A program's row 3...";
  const write = (m) => {
    [...row].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
    assert.equal(callAt(m, m.sym("ABIHW"), { b: 3, c: 2, h: 0x20, l: 0 }).a, 0);
    assert.equal(lcdRow(m, 3), row);
  };
  const g = start({ "GLCD.DRV": GLCD_DRV }, { tms: false });
  write(g);
  say(g, "CON UC1");
  assert.equal(g.read(m0(g)), UC1);
  assert.equal(lcdRow(g, 3), row, "the first display's take");
  const p = start({ "PICOX.DRV": PICO_DRV["PICO.DRV"], "GLCD.DRV": GLCD_DRV });
  assert.equal(lcdRow(p, 3), "PICO?");
  say(p, "PICOX.DRV");
  assert.equal(lcdRow(p, 3), "", "the word goes with the take");
  write(p);
  say(p, "CON UC1");
  assert.equal(p.read(m0(p)), UC1);
  assert.equal(lcdRow(p, 3), row, "a later take: the word has gone, so the row is the program's");
  const again = start({ "GLCD.DRV": GLCD_DRV });
  assert.equal(lcdRow(again, 3), "PICO?");
  say(again, "GLCD.DRV");
  assert.equal(lcdRow(again, 3), "", "the first take clears the word");
  write(again);
  say(again, "CON TTY");
  say(again, "UNLOAD");
  say(again, "GLCD.DRV");
  assert.equal(again.read(m0(again)), UC1);
  assert.equal(lcdRow(again, 3), row, "the second take finds the flag down");
});

test("the probe needs both patterns: a VDP that answers one way is not present", () => {
  const m = new Machine({ ...romFor(), sdImage: standardCard(), clock: TEST_CLOCK, tms: true, matrix: true });
  const read = m.cpu.hardware.ioRead;
  m.cpu.hardware.ioRead = (port) => ((port & 0xff) === 0xbe ? 0x5a : read(port));
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  assert.equal(m.read(m.sym("CONDEV")) & 2, 0);
});

test("the web host: a stored card with old drivers says so and offers a new starter", () => {
  const image = standardCard();
  const a = volume(image, "A");
  const old = Uint8Array.from(PICO_DRV["PICO.DRV"]);
  old[1] = 2;
  a.write("PICO.DRV", old);
  assert.match(cardProblem(image, "tms", "80"), /PICO\.DRV is format 2.*A new starter card/);
  assert.deepEqual(prepareCard(image, "tms", "80").changed, false);
  a.write("PICO.DRV", PICO_DRV["PICO.DRV"]);
  assert.equal(cardProblem(image, "tms", "80"), null);
});

test("the web host: power-on applies the width, says what a card lacks, and a card with no drive A doesn't stop it", () => {
  const image = standardCard();
  assert.match(cardProblem(image, "tms", "80"), /no PICO\.DRV/);
  assert.match(prepareCard(new Uint8Array(4096), "tms", "80").problem, /no drive A/);
  const a = volume(image, "A");
  a.write("PICO.DRV", PICO_DRV["PICO.DRV"]);
  a.write("PICO40.DRV", PICO_DRV["PICO40.DRV"]);
  assert.equal(cardProblem(image, "tms", "80"), null);
  a.write("STARTUP.CMD", startupFile("PICO.DRV", "GLCD.DRV", "DIR"));
  assert.deepEqual(prepareCard(image, "tms", "40"), { problem: null, changed: true });
  assert.equal(Buffer.from(volume(image, "A").read("STARTUP.CMD")).toString("latin1").split("\x1a")[0], "PICO40.DRV\r\nGLCD.DRV\r\nDIR\r\n");
  assert.equal(prepareCard(image, "tms", "40").changed, false);
  assert.match(cardProblem(image, "tms", "32"), /no PICO32\.DRV: it boots as its STARTUP\.CMD says/);
});
