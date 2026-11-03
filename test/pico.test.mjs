// The PICO9918 console as a driver: its widths, the take, a board with both
// displays, a claim in each state, UNLOAD, and nothing calling a vector while no
// table is in. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cardProblem } from "../host/card.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCard, widthDrivers } from "../host/card.mjs";
import { PICO_WIDTHS, makeSvc } from "../tools/lib/svc.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { Machine } from "./lib/machine.mjs";
import { screens } from "./lib/pico-workload.mjs";
import { ABI, GLCD_SVC, PICO_SVC, ROOT, TEST_CLOCK, boot, fcbType, service, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

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
const both = (lines = ["PICO.SVC", "GLCD.SVC"], more = {}) => ({ "PICO.SVC": PICO_SVC["PICO.SVC"], "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile(...lines), ...more });
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
const VIDEO = ABI.TNVIDEO;
const { PICOREG, PICOFIL, PICOWR, PICORD, HWBWRD, TNINFO: HWINFO } = ABI;
const hw = (m, c, b, a = 0) => callAt(m, m.sym("ABICALL"), { a, b, c }).a;

/** The "PICO" record's table at the least version, or null. */
const picoTable = (m, least = 2) => {
  [..."PICO    "].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
  const c = callAt(m, m.sym("ABICALL"), { b: least, c: ABI.TNFIND, d: 0x20, e: 0 });
  return c.flags.C ? null : (c.h << 8) | c.l;
};
/** A graphics entry, by its offset in the table. */
const gfx = (m, off, regs) => callAt(m, word(m, picoTable(m) + off), regs);

for (const [name, cols] of [["PICO.SVC", 80], ["PICO40.SVC", 40], ["PICO32.SVC", 32]]) {
  test(`${name} is the console at ${cols} columns, and scrolls`, () => {
    const m = start({ [name]: PICO_SVC[name], "STARTUP.CMD": startupFile(name) });
    assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], [CRT, CRT, cols, 24]);
    for (let i = 0; i < 26; i += 1) say(m, "DIR HELLO.TXT");
    assert.ok(m.screen(cols).some((l) => l.startsWith("HELLO.TXT")));
    assert.deepEqual(m.violations, []);
  });
}

test("a board with both displays keeps the PICO9918; GLCD.SVC's line gives way, and CON UC1 installs it", () => {
  const m = start(both());
  assert.match(m.text(0), /GLCD\.SVC\?/);
  assert.equal(m.read(m.sym("SVCRC")), 1, "GLCD's INIT ran and gave way");
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
  const m = start(both(["PICO.SVC"]));
  say(m, "CON UC1");
  assert.equal(m.read(m.sym("CONDEV")) & 4, 4);
  say(m, "UNLOAD");
  assert.equal(m.read(m.sym("CONDEV")) & 4, 0);
});

test("CON UC1, CON TTY, UNLOAD stays on serial: only UC1: moves to CRT:", () => {
  const m = start(both(["PICO.SVC"]));
  say(m, "CON UC1");
  say(m, "CON TTY");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [0, 0]);
});

test("a service loading with GLCD.SVC in installs, and says nothing", async () => {
  const m = start({ "GLCD.SVC": GLCD_SVC, "RES.SVC": await service("res"), "STARTUP.CMD": startupFile("GLCD.SVC") }, { tms: false });
  assert.doesNotMatch(say(m, "RES.SVC"), /RES\.SVC\?/);
});

test("PICO32.SVC writes the colours and an empty sprite table", () => {
  const m = start({ "PICO32.SVC": PICO_SVC["PICO32.SVC"], "STARTUP.CMD": startupFile("PICO32.SVC") });
  const v = m.tec1g.state.display.tms9918.stateSnapshot().vram;
  assert.deepEqual([...new Set(v.slice(0x2000, 0x2000 + 32))], [0xf1]);
  assert.equal(v[0x1b00], 0xd0);
});

test("TPA after boot: one display, and both", () => {
  const top = (m) => word(m, 6) - 0x100;
  assert.equal(top(start(both(["PICO.SVC"]), { glcd: false })), 45312);
  assert.equal(top(start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { tms: false })), 45312);
  const m = start(both());
  assert.equal(top(m), 45312, "a board with both, at boot");
  say(m, "CON UC1");
  assert.equal(top(m), 43776);
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
  assert.deepEqual(files.map((f) => f.name), ["PICO.SVC", "GLCD.SVC", "STARTUP.CMD"]);
  const set = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
  const pico = start(set);
  assert.deepEqual([pico.read(m0(pico)), word(pico, 6) - 0x100], [CRT, 45312]);
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
  ["a missing PICO.SVC", { "STARTUP.CMD": startupFile("PICO.SVC") }, {}],
  ["a bad PICO.SVC", { "PICO.SVC": BAD, "STARTUP.CMD": startupFile("PICO.SVC") }, {}],
  ["no STARTUP.CMD", {}, {}],
  ["a file with no display line", { "STARTUP.CMD": startupFile("USER 0") }, {}],
  ["a skip past a good PICO.SVC", { ...PICO_SVC, "STARTUP.CMD": startupFile("PICO.SVC") }, { key: true }],
]) {
  test(`a PICO9918 board with ${name} says PICO? on the LCD, once`, () => {
    const m = start(files, opts);
    assert.equal(word(m, m.sym("PIVEC")), 0, "no driver in");
    if (name.includes("missing") || name.includes("bad")) assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
    assert.equal(lcdRow(m, 3), "PICO?");
    m.tec1g.state.lcdCtrl.lcd.fill(0x20, 60, 80);
    m.command("USER 0");
    assert.equal(lcdRow(m, 3), "", "the next prompt leaves the row alone");
  });
}

test("STDONE returns carry through LCDROW: the file's last line runs once", () => {
  const m = start({ "STARTUP.CMD": startupFile("PICO.SVC") });
  assert.equal(lcdRow(m, 3), "PICO?");
  assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
  assert.equal((m.text(0).match(/PICO\.SVC\?/g) ?? []).length, 1);
});

test("GLCLD returns carry through LCDROW when GLCD.SVC won't load", () => {
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
  for (const file of [raw("PICO.SVC\x1a"), raw("USER 1\r\n".repeat(15) + "\r".repeat(6) + "\r\n")]) {
    assert.equal(lcdRow(start({ "STARTUP.CMD": file }), 3), "PICO?");
  }
});

test("a good PICO.SVC shows nothing on the LCD", () => {
  const m = start({ ...PICO_SVC, "STARTUP.CMD": startupFile("PICO.SVC") });
  assert.equal(m.read(m.sym("CONMOD")), CRT);
  assert.equal(lcdRow(m, 3), "");
});

test("a display driver in, then CON TTY in the file: the LCD stays silent", () => {
  for (const name of ["PICO.SVC", "GLCD.SVC"]) {
    const m = start({ ...PICO_SVC, "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile(name, "CON TTY") });
    assert.equal(m.read(m.sym("CONMOD")), 0, name);
    assert.equal(lcdRow(m, 3), "", name);
  }
});

test("the LCD stays silent with no PICO9918, and with no matrix keyboard", () => {
  for (const opts of [{ tms: false }, { matrix: false }]) {
    const m = start({ ...PICO_SVC, "STARTUP.CMD": startupFile("PICO.SVC") }, opts);
    assert.equal(lcdRow(m, 3), "", JSON.stringify(opts));
  }
});

test("a display driver installed by hand clears PICO?", () => {
  const typed = start({ "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  const info = () => callAt(typed, typed.sym("ABICALL"), { c: HWINFO }).b;
  assert.equal(lcdRow(typed, 3), "PICO?");
  assert.equal(info() & HWBWRD, HWBWRD, "INFO reports the word");
  say(typed, "PICOX.SVC");
  assert.equal(typed.read(m0(typed)), CRT);
  assert.equal(lcdRow(typed, 3), "");
  assert.equal(info() & HWBWRD, 0, "and its going");
  const uc1 = start({ "GLCD.SVC": GLCD_SVC });
  assert.equal(lcdRow(uc1, 3), "PICO?");
  say(uc1, "CON UC1");
  assert.equal(uc1.read(m0(uc1)), UC1);
  assert.equal(lcdRow(uc1, 3), "");
});

test("a board whose PICO.SVC fails takes the GLCD from the next line, and the LCD says nothing", () => {
  const m = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("PICO.SVC", "GLCD.SVC") });
  assert.match(m.text(0), /PICO\.SVC\?/);
  assert.equal(m.read(m.sym("CONMOD")), UC1);
  assert.equal(lcdRow(m, 3), "");
});

test("the GLCD's UNLOAD with CRT: as the console leaves it there", () => {
  const m = start(both(["PICO.SVC"]));
  say(m, "CON UC1");
  say(m, "CON CRT");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [CRT, CRT]);
  assert.equal(m.read(m.sym("GLVEC") + 1), 0);
});

test("REMOVE refuses while PICO.SVC is the console, and UNLOAD changes nothing; from serial it goes", () => {
  const m = start(both(["PICO.SVC"]));
  const top = word(m, 6);
  assert.match(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.equal(word(m, 6), top);
  say(m, "CON TTY");
  say(m, "UNLOAD");
  assert.deepEqual([word(m, 6), word(m, m.sym("PIVEC"))], [word(m, m.sym("STUBAD")), 0]);
  m.traps = 0;
  m.cpu.cpu.pc = 0; // a warm boot with no table
  m.mark = m.output.length;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  assert.equal(m.traps, 0);
  assert.match(say(m, "CON CRT"), /serial terminal/, "CON CRT has no load, and falls back");
  assert.match(say(m, "DIR HELLO.TXT"), /HELLO\.TXT/);
});

test("no driver: reset to a prompt on serial with no file, a bad file and no vector call", () => {
  for (const files of [{}, { "PICO.SVC": new Uint8Array(200).fill(0x55), "STARTUP.CMD": startupFile("PICO.SVC") }]) {
    const m = start(files);
    assert.equal(m.traps, 0);
    assert.deepEqual([m.read(m.sym("CONMOD")), word(m, m.sym("PIVEC"))], [0, 0]);
    if (files["PICO.SVC"]) assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
    assert.match(m.command("DIR HELLO.TXT"), /HELLO\.TXT/);
  }
});

test("on UC1: with no PICO driver, boot and a warm boot make no vector call", () => {
  const m = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { tms: false });
  assert.equal(m.read(m.sym("CONMOD")), UC1);
  m.cpu.cpu.pc = 0;
  m.mark = m.output.length;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  assert.equal(m.traps, 0);
});

test("PICO.SVC is refused with no PICO9918, and with no matrix keyboard", () => {
  for (const opts of [{ tms: false }, { matrix: false }]) {
    const m = start({ "PICO.SVC": PICO_SVC["PICO.SVC"], "STARTUP.CMD": startupFile("PICO.SVC") }, opts);
    assert.match(m.text(0), /PICO\.SVC\?/);
    assert.deepEqual([m.read(m.sym("SVCRC")), m.read(m.sym("SVCHEAD")), m.read(m.sym("CONMOD"))], [1, 0, 0]);
  }
});

test("a claimed VDP takes no row-move call: the driver isn't entered while a program owns it", () => {
  const m = start(both(["PICO.SVC"]));
  hw(m, VIDEO, 1);
  const base = m.read(m.sym("SVCHEAD")) << 8;
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

test("the take runs only for a service with its table in its own page", async () => {
  const m = start(both(["PICO.SVC"], { "RES.SVC": await service("res") }));
  say(m, "CON TTY");
  say(m, "RES.SVC");
  assert.equal(m.read(m.sym("CONMOD")), 0, "any other service leaves the console");
});

const VREG1 = (m) => m.tec1g.state.display.tms9918.stateSnapshot().registers[1];

test("a claim with PICO.SVC in, on CRT:: nothing drawn, and release restores it", () => {
  const m = start(both(["PICO.SVC"]));
  assert.equal(hw(m, VIDEO, 1), 0);
  gfx(m, PICOREG, { a: 0xc0, b: 1 });
  assert.equal(VREG1(m), 0xc0, "the program's mode");
  assert.equal(hw(m, VIDEO, 0), 0);
  assert.equal(VREG1(m), 0x50, "text mode back");
});

test("a claim with PICO.SVC in, on UC1:: release restores the VDP, and the GLCD stays the console", () => {
  const m = start(both(["PICO.SVC"]));
  say(m, "CON UC1");
  hw(m, VIDEO, 1);
  gfx(m, PICOREG, { a: 0xc0, b: 1 });
  assert.equal(hw(m, VIDEO, 0), 0);
  assert.equal(VREG1(m), 0x50);
  assert.equal(m.read(m.sym("CONMOD")), UC1);
});

test("a claim with no driver, and after UNLOAD: refused by nothing, and nothing is restored", () => {
  for (const unload of [false, true]) {
    const m = start(unload ? both(["PICO.SVC"]) : {});
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
  const m = start(both(["PICO.SVC"]));
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

const WIDTHS = [["PICO.SVC", 80, 0x50], ["PICO40.SVC", 40, 0xd0], ["PICO32.SVC", 32, 0xc0]];
const vram = (m) => m.tec1g.state.display.tms9918.stateSnapshot().vram;
const cold = (m, off) => hw(m, VIDEO, off);
const ramAt = (m, a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));

for (const [name, cols, r1] of WIDTHS) {
  test(`${name}: each graphics entry against VRAM under a claim, then release and warm boot give the text back`, () => {
    const m = start({ [name]: PICO_SVC[name], "STARTUP.CMD": startupFile(name) });
    assert.notEqual(picoTable(m, 2), null, "the record's version 2");
    assert.equal(picoTable(m, 3), null, "and no higher");
    const page = m.read(m.sym("SVCHEAD"));
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
    const m = start({ [name]: PICO_SVC[name], "STARTUP.CMD": startupFile(name) });
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

test("a claim held at UNLOAD after CON TTY: refused, the record still found, and allowed after the release", () => {
  const m = start(both(["PICO.SVC"]));
  say(m, "CON TTY");
  const top = word(m, 6);
  const table = picoTable(m);
  assert.notEqual(table, null);
  assert.equal(cold(m, 1), 0);
  assert.match(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.equal(word(m, 6), top, "nothing moved");
  assert.equal(picoTable(m), table, "the record is found while claimed");
  gfx(m, PICOREG, { a: 0xf4, b: 7 });
  assert.equal(cold(m, 0), 0);
  assert.equal(picoTable(m), table, "and after the release");
  assert.doesNotMatch(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.deepEqual([word(m, 6), word(m, m.sym("PIVEC")), picoTable(m)], [word(m, m.sym("STUBAD")), 0, null]);
});

test("a refused record under a claim: REMOVE refuses, so the pages stay with the table hooked, and a warm boot is safe", async () => {
  const text = readFileSync(resolve(ROOT, "drivers/pico.asm"), "utf8").replace('"../src/abi.inc"', '"../../src/abi.inc"').replace('"font.asm"', '"../../drivers/font.asm"');
  const a = "        LD      HL,REC\n";
  assert.ok(text.includes(a));
  const dir = resolve(ROOT, "build/variants");
  mkdirSync(dir, { recursive: true });
  const src = resolve(dir, "picobad.asm");
  writeFileSync(src, text.replace(a, `        LD      B,1\n        LD      C,TNVIDEO\n        CALL    ABICALL\n        LD      HL,ABITAB\n`));
  const { file } = await makeSvc(src, { defs: PICO_WIDTHS["PICO.SVC"], work: resolve(ROOT, "build/svc") });
  const m = start({ "PICOB.SVC": file, "STARTUP.CMD": startupFile("PICOB.SVC") });
  assert.match(m.text(0), /PICOB\.SVC\?/);
  const page = m.read(m.sym("SVCHEAD"));
  assert.ok(page >= 0x80, "the pages are kept");
  assert.equal(word(m, 6), page << 8);
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
  for (const [name, opts, files] of [["PICO.SVC", { matrix: false }, PICO_SVC], ["PICO.SVC", { tms: false }, PICO_SVC], ["GLCD.SVC", { tms: false, glcd: false }, { "GLCD.SVC": GLCD_SVC }]]) {
    const plain = word(start({}, opts), 6);
    const m = start({ ...files, "STARTUP.CMD": startupFile(name) }, opts);
    assert.equal(m.read(m.sym("SVCRC")), 1, `${name}'s INIT ran and failed`);
    assert.deepEqual([word(m, 6), m.read(m.sym("SVCHEAD")), word(m, m.sym("REGHEAD")), word(m, m.sym("PIVEC")), word(m, m.sym("GLVEC"))], [plain, 0, 0, 0, 0], `${name} ${JSON.stringify(opts)}`);
  }
});

const ROW = "A program's row 3...";
const writeRow3 = (m) => {
  [...ROW].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
  assert.equal(callAt(m, m.sym("ABICALL"), { b: 3, c: ABI.TNLCD, h: 0x20, l: 0 }).a, 0);
  assert.equal(lcdRow(m, 3), ROW);
};

test("row 3: a take leaves a program's row alone, with nothing up", () => {
  const m = start({ "GLCD.SVC": GLCD_SVC }, { tms: false });
  writeRow3(m);
  say(m, "CON UC1");
  assert.equal(m.read(m0(m)), UC1);
  assert.equal(lcdRow(m, 3), ROW);
});

test("row 3: a program's write over PICO? survives the take that follows", () => {
  const m = start({ "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  assert.equal(lcdRow(m, 3), "PICO?");
  writeRow3(m);
  say(m, "PICOX.SVC");
  assert.equal(m.read(m0(m)), CRT);
  assert.equal(lcdRow(m, 3), ROW);
});

test("row 3: a program's write over GLCD? survives the take that follows", () => {
  const m = start({ "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  say(m, "CON UC1");
  assert.equal(lcdRow(m, 3), "GLCD?");
  writeRow3(m);
  say(m, "PICOX.SVC");
  assert.equal(lcdRow(m, 3), ROW);
});

test("row 3: each word is cleared by a take, and the flag doesn't stay for the next", () => {
  const p = start({ "GLCD.SVC": GLCD_SVC });
  assert.equal(lcdRow(p, 3), "PICO?");
  say(p, "GLCD.SVC");
  assert.equal(lcdRow(p, 3), "", "PICO?");
  writeRow3(p);
  say(p, "CON TTY");
  say(p, "UNLOAD");
  say(p, "GLCD.SVC");
  assert.equal(p.read(m0(p)), UC1);
  assert.equal(lcdRow(p, 3), ROW, "the second take finds the flag down");
  const g = start({ "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  say(g, "CON UC1");
  assert.equal(lcdRow(g, 3), "GLCD?");
  say(g, "PICOX.SVC");
  assert.equal(g.read(m0(g)), CRT);
  assert.equal(lcdRow(g, 3), "", "GLCD?");
});

test("row 3: GLCD? stays while PICO.SVC keeps the console, and a CON UC1 that loads clears it", () => {
  const m = start({ "PICO.SVC": PICO_SVC["PICO.SVC"], "GLCDX.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("PICO.SVC") });
  say(m, "CON UC1");
  assert.equal(lcdRow(m, 3), "GLCD?");
  const top = word(m, 6);
  assert.match(say(m, "GLCDX.SVC"), /GLCDX\.SVC\?/);
  assert.equal(word(m, 6), top, "only CON UC1 installs it beside the PICO9918");
  assert.equal(lcdRow(m, 3), "GLCD?");
  say(m, "REN GLCD.SVC=GLCDX.SVC");
  say(m, "CON UC1");
  assert.equal(word(m, 6), top - 0x600, "it loaded");
  assert.equal(lcdRow(m, 3), "");
});

test("row 3: a program's write to rows 0 to 2 leaves the word for a take to clear", () => {
  const m = start({ "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  assert.equal(lcdRow(m, 3), "PICO?");
  [..."Not row three.......".slice(0, 20)].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
  for (const b of [0, 1, 2]) callAt(m, m.sym("ABICALL"), { b, c: ABI.TNLCD, h: 0x20, l: 0 });
  assert.equal(lcdRow(m, 3), "PICO?");
  say(m, "PICOX.SVC");
  assert.equal(lcdRow(m, 3), "");
});

test("row 3: a failed load by hand leaves the word", () => {
  const m = start({ "BAD.SVC": BAD });
  assert.equal(lcdRow(m, 3), "PICO?");
  assert.match(say(m, "BAD.SVC"), /BAD\.SVC\?/);
  assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
  assert.equal(lcdRow(m, 3), "PICO?");
  assert.equal(m.read(m.sym("CONDEV")) & HWBWRD, HWBWRD, "still marked");
});

test("row 3: a service with no video table leaves the word", async () => {
  const m = start({ "RES.SVC": await service("res") });
  assert.equal(lcdRow(m, 3), "PICO?");
  const top = word(m, 6);
  assert.doesNotMatch(say(m, "RES.SVC"), /RES\.SVC\?/);
  assert.equal(word(m, 6), (top & 0xff00) - 0x100, "it loaded");
  assert.equal(lcdRow(m, 3), "PICO?");
});

test("row 3: the word lasts through a program's warm boot, for a take to clear", () => {
  const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C and returns
  const m = start({ "SAY.COM": SAY, "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  assert.equal(lcdRow(m, 3), "PICO?");
  assert.match(say(m, "SAY"), /C\r\n/);
  say(m, "PICOX.SVC");
  assert.equal(m.read(m0(m)), CRT);
  assert.equal(lcdRow(m, 3), "");
});

test("row 3: PICO? still shows on the black screen after a failed CON UC1", () => {
  const m = start({ "STARTUP.CMD": startupFile("CON UC1") });
  assert.equal(m.read(m.sym("CONDEV")) & ABI.HWBWRD, ABI.HWBWRD);
  assert.equal(lcdRow(m, 3), "PICO?");
});

test("INFO's HWBWRD follows the word: up, overwritten and cleared", () => {
  const m = start({ "PICOX.SVC": PICO_SVC["PICO.SVC"] });
  const info = () => callAt(m, m.sym("ABICALL"), { c: HWINFO }).b & HWBWRD;
  assert.equal(info(), HWBWRD);
  writeRow3(m);
  assert.equal(info(), 0);
  say(m, "CON UC1");
  assert.equal(info(), HWBWRD);
  say(m, "PICOX.SVC");
  assert.equal(info(), 0);
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
  const old = Uint8Array.from(PICO_SVC["PICO.SVC"]);
  old[1] = 2;
  a.write("PICO.SVC", old);
  assert.match(cardProblem(image, "tms"), /PICO\.SVC is format 2.*A new starter card/);
  assert.deepEqual(prepareCard(image, "tms", "80").changed, false);
  a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
  assert.equal(cardProblem(image, "tms"), null);
});

const DRIVERS = { 80: PICO_SVC["PICO.SVC"], 40: PICO_SVC["PICO40.SVC"], 32: PICO_SVC["PICO32.SVC"] };

test("the web host: power-on writes PICO.SVC at the width, says what a card lacks, and a card with no drive A doesn't stop it", () => {
  const image = standardCard();
  assert.match(cardProblem(image, "tms"), /no PICO\.SVC: it boots as its STARTUP\.CMD says/);
  assert.match(prepareCard(new Uint8Array(4096), "tms", "80", DRIVERS).problem, /no drive A/);
  const a = volume(image, "A");
  a.write("STARTUP.CMD", startupFile("PICO.SVC", "GLCD.SVC", "DIR"));
  const pico = (n) => [...volume(image, "A").read("PICO.SVC").subarray(0, PICO_SVC[n].length)];
  assert.deepEqual(prepareCard(image, "tms", "40", DRIVERS), { problem: null, note: null, changed: true }, "a card with none gets the width's");
  assert.deepEqual(pico("PICO40.SVC"), [...PICO_SVC["PICO40.SVC"]]);
  assert.equal(startupText(image), "PICO.SVC\r\nDIR\r\n");
  assert.equal(prepareCard(image, "tms", "40", DRIVERS).changed, false);
  assert.deepEqual(prepareCard(image, "tms", "32", DRIVERS), { problem: null, note: null, changed: true }, "a width change");
  assert.deepEqual(pico("PICO32.SVC"), [...PICO_SVC["PICO32.SVC"]]);
  assert.deepEqual(prepareCard(image, "tms", "80", DRIVERS), { problem: null, note: null, changed: true }, "and back");
  assert.deepEqual(pico("PICO.SVC"), [...PICO_SVC["PICO.SVC"]]);
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  assert.deepEqual(prepareCard(image, "glcd", "40", DRIVERS), { problem: null, note: null, changed: true }, "the GLCD's line first");
  assert.equal(startupText(image), "GLCD.SVC\r\nDIR\r\n");
  assert.deepEqual(pico("PICO.SVC"), [...PICO_SVC["PICO.SVC"]], "and PICO.SVC left");
});

test("the web host: a PICO.SVC of the card's owner is kept at any width", () => {
  const image = standardCard();
  const a = volume(image, "A");
  const own = Uint8Array.from(PICO_SVC["PICO40.SVC"]);
  own[own.length - 1] ^= 0xff; // a build of their own: any byte not a starter build's
  a.write("PICO.SVC", own);
  a.write("STARTUP.CMD", startupFile("PICO.SVC")); // the page's line already
  const before = [...volume(image, "A").read("PICO.SVC")];
  const got = prepareCard(image, "tms", "80", DRIVERS);
  assert.deepEqual([got.problem, got.changed], [null, false]);
  assert.match(got.note, /own PICO\.SVC is kept/);
  assert.deepEqual([...volume(image, "A").read("PICO.SVC")], before);
  const longer = new Uint8Array(PICO_SVC["PICO.SVC"].length + 200);
  longer.set(PICO_SVC["PICO.SVC"]); // a starter build with more after it is the owner's too
  a.write("PICO.SVC", longer);
  assert.match(prepareCard(image, "tms", "40", DRIVERS).note, /own PICO\.SVC is kept/);
});

test("the web host: a PICO.SVC of an older format is replaced by the width's, and without drivers it is only named", () => {
  const image = standardCard();
  const a = volume(image, "A");
  const old = Uint8Array.from(PICO_SVC["PICO.SVC"]);
  old[1] = 2;
  a.write("PICO.SVC", old);
  assert.match(prepareCard(image, "tms", "40").problem, /PICO\.SVC is format 2/, "no drivers: the card is left");
  assert.deepEqual(prepareCard(image, "tms", "40", DRIVERS), { problem: null, note: null, changed: true });
  assert.deepEqual([...volume(image, "A").read("PICO.SVC").subarray(0, DRIVERS[40].length)], [...DRIVERS[40]]);
});

test("the web host: the width drivers are taken only by their pins, and a failure leaves the card with a word", async () => {
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const recipe = { widths: Object.fromEntries(Object.entries(DRIVERS).map(([w, b]) => [w, { url: `files/${w}`, sha256: sha(b) }])) };
  const served = (over = {}) => async (url) => {
    const w = url.slice(6);
    if (over[w] === "missing") throw new Error(`${url}: HTTP 404`);
    return over[w] ?? DRIVERS[w];
  };
  const ok = await widthDrivers(recipe, served());
  assert.deepEqual(Object.keys(ok.drivers).sort(), ["32", "40", "80"]);
  const bad = Uint8Array.from(DRIVERS[40]);
  bad[9] ^= 1;
  for (const over of [{ 40: bad }, { 32: "missing" }]) {
    const got = await widthDrivers(recipe, served(over));
    assert.equal(got.drivers, undefined);
    assert.match(got.problem, /couldn't be fetched .*(SHA-256|404).*left as it is/);
    const image = standardCard();
    volume(image, "A").write("STARTUP.CMD", startupFile("DIR"));
    const before = image.slice();
    assert.match(prepareCard(image, "tms", "40", got.drivers).problem, /no PICO\.SVC/);
    assert.deepEqual(image, before, "the card as it was");
  }
  assert.match((await widthDrivers({}, served())).problem, /names no drivers/);
});

const startupText = (image) => Buffer.from(volume(image, "A").read("STARTUP.CMD")).toString("latin1").split("\x1a")[0];

test("the web host: a chained startup line loses its display pieces and keeps the rest", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
  a.write("STARTUP.CMD", startupFile("PICO.SVC!GLCD.SVC!DIR", "DIR!:GLCD.SVC!USER 3", "PICO40.SVC"));
  assert.deepEqual(prepareCard(image, "tms"), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "PICO.SVC\r\nDIR\r\nDIR!:USER 3\r\n");
  assert.equal(prepareCard(image, "tms").changed, false);
});

test("the web host: a removed piece's colon passes to the piece after it, and one that hung on a display piece goes", () => {
  const cases = [
    ["X!:PICO.SVC!Y", "X!:Y"],
    ["X!PICO.SVC!:Y", "X!Y"],
    ["X!:PICO.SVC!:Y", "X!:Y"],
    ["X!:PICO.SVC!GLCD.SVC!Y", "X!:Y"],
    ["X!PICO.SVC!:GLCD.SVC!Y", "X!Y"],
    [":X", "X"],
  ];
  for (const [line, want] of cases) {
    const image = standardCard();
    const a = volume(image, "A");
    a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
    a.write("STARTUP.CMD", startupFile(line));
    prepareCard(image, "tms");
    assert.equal(startupText(image), `PICO.SVC\r\n${want}\r\n`, line);
    assert.equal(prepareCard(image, "tms").changed, false, line);
  }
});

test("the web host: a next line's first colon goes with the display piece it hung on, and no colon crosses a line", () => {
  const cases = [
    [["PICO.SVC", ":VOLS"], "VOLS"],
    [["DIR", "PICO.SVC", ":VOLS", ":USER 3"], "DIR\r\nVOLS\r\n:USER 3"],
    [["X!:PICO.SVC", ":Y"], "X\r\n:Y"],
    [["X!:PICO.SVC", "Y"], "X\r\nY"],
    [["X!PICO.SVC", ":Y"], "X\r\nY"],
  ];
  for (const [lines, want] of cases) {
    const image = standardCard();
    const a = volume(image, "A");
    a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
    a.write("STARTUP.CMD", startupFile(...lines));
    prepareCard(image, "tms");
    assert.equal(startupText(image), `PICO.SVC\r\n${want}\r\n`, lines.join("|"));
  }
});

test("the web host: VOLS on the line after PICO.SVC runs, with no GLCD.SVC line to give way", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
  a.write("VOLS.COM", Uint8Array.from([0xc9]));
  a.write("STARTUP.CMD", startupFile("PICO.SVC", ":VOLS"));
  prepareCard(image, "tms");
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, glcd: false });
  m.runUntil(() => m.ready() && /A>$/.test(m.text(0)), 800_000_000, "the prompt after the file");
  assert.match(m.text(0), />PICO\.SVC\r[\s\S]*>VOLS\r/);
  assert.doesNotMatch(m.text(0), /GLCD\.SVC/);
});

test("the web host: the piece after a display piece loses its colon and runs", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
  a.write("VOLS.COM", Uint8Array.from([0xc9]));
  a.write("STARTUP.CMD", startupFile("PICO.SVC!:VOLS", "DIR!GLCD.SVC!PICO.SVC!:USER 3!:USER 0"));
  prepareCard(image, "tms");
  assert.equal(startupText(image), "PICO.SVC\r\nVOLS\r\nDIR!USER 3!:USER 0\r\n");
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, glcd: false });
  m.runUntil(() => m.ready() && /A>$/.test(m.text(0)), 800_000_000, "the prompt after the file");
  assert.match(m.text(0), />PICO\.SVC\r[\s\S]*>VOLS\r/, "VOLS runs after the display's line");
  assert.doesNotMatch(m.text(0), /VOLS\?/);
});

test("the web host: a card with .DRV files is refused in its own words and left alone", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.DRV", PICO_SVC["PICO.SVC"]);
  a.write("GLCD.DRV", GLCD_SVC);
  a.write("STARTUP.CMD", startupFile("PICO.DRV", "GLCD.DRV", "MY.DRV"));
  const before = image.slice();
  const { problem, changed } = prepareCard(image, "tms");
  assert.match(problem, /older TEC-OS: this ROM doesn't load PICO\.DRV.*A new starter card has PICO\.SVC/);
  assert.equal(changed, false);
  assert.deepEqual(image, before);
});

test("the web host: an old card's words name the display asked for, or else what it has", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("GLCD.DRV", GLCD_SVC);
  a.write("PICO.DRV", PICO_SVC["PICO.SVC"]);
  assert.match(cardProblem(image, "tms"), /doesn't load PICO\.DRV/);
  assert.match(cardProblem(image, "glcd"), /doesn't load GLCD\.DRV/);
  assert.match(cardProblem(image, "tms"), /doesn't load PICO\.DRV.*has PICO\.SVC/);
  const before = image.slice();
  assert.equal(prepareCard(image, "tms", PICO_SVC["PICO40.SVC"]).changed, false, "an older card isn't given a driver");
  assert.deepEqual(image, before);
});

test("the web host: a card whose files were renamed by hand has its .DRV display lines taken out", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.SVC", PICO_SVC["PICO.SVC"]);
  a.write("STARTUP.CMD", startupFile("PICO.DRV", "GLCD.DRV", "MY.DRV"));
  assert.deepEqual(prepareCard(image, "tms"), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "PICO.SVC\r\nMY.DRV\r\n");
});

test("a failed CON UC1 leaves the console as it was, and a later one takes the GLCD", () => {
  const m = start({ "PICO.SVC": PICO_SVC["PICO.SVC"], "GLCD.XXX": GLCD_SVC, "STARTUP.CMD": startupFile("PICO.SVC") });
  assert.equal(m.read(m0(m)), CRT);
  say(m, "CON UC1");
  assert.equal(m.read(m0(m)), CRT, "the console is still the PICO9918");
  assert.equal(m.read(3) & 3, CRT, "and so is the IOBYTE's CON: field");
  say(m, "REN GLCD.SVC=GLCD.XXX");
  say(m, "CON UC1");
  assert.equal(m.read(m0(m)), UC1);
  assert.equal(m.read(3) & 3, UC1);
});

test("the web host: the page's card boots on the board with both displays with no line refused (KE-150)", async () => {
  const image = standardCard();
  const a = volume(image, "A");
  for (const f of await displayFiles(ROOT)) a.write(f.name, f.bytes);
  assert.equal(startupText(image), "PICO.SVC\r\nGLCD.SVC\r\n", "the starter's own two lines, for a real board");
  assert.deepEqual(prepareCard(image, "tms", "80", DRIVERS), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "PICO.SVC\r\n", "the page writes the chosen display's line alone");
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, glcd: true });
  m.runUntil(() => m.ready() && m.screen().some((l) => /^A>$/.test(l.trim())), 800_000_000, "the prompt");
  assert.doesNotMatch(m.screen().join("\n"), /\?/, "no line refused on the screen");
  assert.doesNotMatch(m.text(0), /GLCD\.SVC\?/);
  assert.deepEqual(m.violations, []);
});
