// The PICO9918's console in the ROM: its widths, a board with both displays, a
// claim in each state, the LCD's word, the web host's card, and nothing calling
// a vector while no table is in. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardProblem } from "../host/card.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCard } from "../host/card.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { makeSvc } from "../tools/lib/svc.mjs";
import { Machine } from "./lib/machine.mjs";
import { screens } from "./lib/pico-workload.mjs";
import { ABI, GLCD_SVC, ROOT, TEST_CLOCK, boot, fcbType, service, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";
import { createContainer } from "../tools/lib/container.mjs";

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
const both = (lines = ["GLCD.SVC"], more = {}) => ({ "GLCD.SVC": GLCD_SVC, ...(lines.length ? { "STARTUP.CMD": startupFile(...lines) } : {}), ...more });
/** A:'s files with the console at COLS columns: a CON PICO line in STARTUP.CMD for 40 and 32, none for 80. */
const at = (cols, files = {}) => (cols === 80 ? files : { "STARTUP.CMD": startupFile(`CON PICO ${cols}`), ...files });
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

for (const cols of [80, 40, 32]) {
  test(`the ROM's console at ${cols} columns, and it scrolls`, () => {
    const m = start(at(cols));
    assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], [CRT, CRT, cols, 24]);
    for (let i = 0; i < 26; i += 1) say(m, "DIR HELLO.TXT");
    assert.ok(m.screen(cols).some((l) => l.startsWith("HELLO.TXT")));
    assert.deepEqual(m.violations, []);
  });
}

test("a board with both displays keeps the PICO9918; GLCD.SVC's line stays out quietly (KE-150, KE-200), and CON UC1 loads it", () => {
  const m = start(both());
  assert.doesNotMatch(m.text(0), /GLCD\.SVC\?/, "no refusal");
  const none = TPA_NONE + 0x100; // the ceiling with nothing loaded
  assert.equal(word(m, 6), none, "GLCD.SVC not in: it would only give way");
  assert.equal(m.read(3) & 3, CRT, "the ROM's console keeps the console");
  const listed = say(m, "SERVICES");
  assert.doesNotMatch(listed, /GLCD/, "GLCD.SVC not in");
  assert.doesNotMatch(listed, /PICO/, "the ROM's console is no service");
  say(m, "CON UC1");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), word(m, 6)], [UC1, UC1, TPA_GLCD + 0x100], "CON UC1 loads it and takes it");
  say(m, "CON CRT");
  assert.equal(m.read(m.sym("CONMOD")), CRT);
  say(m, "CON UC1");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), word(m, 6)], [CRT, CRT, none], "the GLCD's UNLOAD goes back to CRT:");
});

test("on a board with both displays the starter's startup leaves the CCP stack's room, so a service using it loads after (KE-200)", async () => {
  const defs = { VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 2, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"CCPUSE  "', RECNAME: '"CCPUSE  "', RECVER: 1 };
  for (const v of ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"]) defs[v] = 0;
  const { file } = await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc") });
  const set = Object.fromEntries((await displayFiles(ROOT)).map((f) => [f.name, f.bytes]));
  const m = start({ ...set, "CCPUSE.SVC": file });
  assert.doesNotMatch(m.text(0), /GLCD\.SVC\?/, "the startup line quiet");
  assert.equal(m.read(3) & 3, CRT, "the ROM's console the console");
  assert.doesNotMatch(say(m, "CCPUSE.SVC"), /CCPUSE\.SVC\?/, "loaded");
  assert.notEqual(m.read(m.sym("SVCHEAD")), 0);
});

test("the GLCD's UNLOAD clears its INFO bit", () => {
  const m = start(both([]));
  say(m, "CON UC1");
  assert.equal(m.read(m.sym("CONDEV")) & 4, 4);
  say(m, "UNLOAD");
  assert.equal(m.read(m.sym("CONDEV")) & 4, 0);
});

test("CON UC1, CON TTY, UNLOAD stays on serial: only UC1: moves to CRT:", () => {
  const m = start(both([]));
  say(m, "CON UC1");
  say(m, "CON TTY");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [0, 0]);
});

test("a service loading with GLCD.SVC in installs, and says nothing", async () => {
  const m = start({ "GLCD.SVC": GLCD_SVC, "RES.SVC": await service("res"), "STARTUP.CMD": startupFile("GLCD.SVC") }, { tms: false });
  assert.doesNotMatch(say(m, "RES.SVC"), /RES\.SVC\?/);
});

test("the ROM's console at every width: CON PICO 40, CON CRT 32 and CON PICO 80 switch it, each screen cleared and working at its width (KD-174)", () => {
  const m = start({});
  const top = word(m, 6);
  for (const [line, cols] of [["CON PICO 40", 40], ["CON CRT 32", 32], ["CON PICO: 80", 80], ["CON PICO 32", 32]]) {
    assert.doesNotMatch(say(m, line), /\?\r\n/, `${line} accepted`);
    assert.deepEqual([m.read(3) & 3, m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], [CRT, cols, 24], line);
    for (let i = 0; i < 26; i += 1) say(m, "DIR HELLO.TXT");
    const screen = m.screen(cols);
    assert.ok(screen.some((l) => l.startsWith("HELLO.TXT")), `${line}: the screen at ${cols} columns`);
    assert.equal(word(m, 6), top, "nothing loaded");
  }
  const v = m.tec1g.state.display.tms9918.stateSnapshot().vram;
  assert.deepEqual([...new Set(v.slice(0x2000, 0x2000 + 32))], [0xf1], "Graphics I's colours at 32");
  assert.deepEqual(m.violations, []);
});

test("a width is refused, nothing changed, while the PICO9918 is claimed, and for a record at version 2", () => {
  const m = start({});
  hw(m, VIDEO, 1);
  assert.match(say(m, "CON PICO 40"), /\?\r\n/, "claimed");
  hw(m, VIDEO, 0);
  assert.equal(m.read(m.sym("VWID")), 80);
  const table = picoTable(m, ABI.PICOVER);
  m.write(table + ABI.PICOVRB, 2); // as a version 2 driver's record reads
  assert.match(say(m, "CON PICO 40"), /\?\r\n/, "version 2");
  assert.equal(m.read(m.sym("VWID")), 80);
  m.write(table + ABI.PICOVRB, ABI.PICOVER);
  assert.doesNotMatch(say(m, "CON PICO 40"), /\?\r\n/);
  assert.equal(m.read(m.sym("VWID")), 40);
});

test("the console at 32 columns writes the colours and an empty sprite table", () => {
  const m = start(at(32));
  const v = m.tec1g.state.display.tms9918.stateSnapshot().vram;
  assert.deepEqual([...new Set(v.slice(0x2000, 0x2000 + 32))], [0xf1]);
  assert.equal(v[0x1b00], 0xd0);
});

/** TPA on the starter card with nothing loaded, and with GLCD.SVC in: its three pages under the stub's page. */
const TPA_NONE = 47268;
const TPA_GLCD = 46336;

test("TPA after boot: the ROM's console alone, the GLCD's driver, and both", () => {
  const top = (m) => word(m, 6) - 0x100;
  const below = (m) => (((word(m, m.sym("STUBAD")) >> 8) - 3) << 8) - 0x100; // three pages under the stub's
  const pico = start({}, { glcd: false });
  assert.equal(top(pico), TPA_NONE, "the ROM's console loads nothing");
  const g = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { tms: false });
  assert.equal(top(g), below(g));
  assert.equal(top(g), TPA_GLCD);
  const m = start(both());
  assert.equal(top(m), TPA_NONE, "a board with both, at boot: the ROM's console alone, GLCD.SVC's line quiet (KE-200)");
  say(m, "CON UC1");
  assert.equal(top(m), TPA_GLCD, "and CON UC1 loads GLCD.SVC");
});

const REF = JSON.parse(readFileSync(resolve(ROOT, "test/pico-screens.json"), "utf8"));
for (const cols of [80, 40, 32]) {
  test(`at ${cols} columns the screens equal the ROM console's, step by step`, () => {
    const m = boot(standardCard(), { width: cols, tms: true, matrix: true });
    assert.deepEqual(screens(m, cols), REF[cols]);
  });
}

test("a scroll, then ESC[2@ keeps the row it opens", () => {
  const m = boot(standardCard(), { tms: true, matrix: true });
  const shots = screens(m, 80);
  assert.equal(shots.find((s) => s.name === "insert characters").screen.some((l) => l === "  abcdef"), true);
});

test("the starter card boots the ROM's console alone on a board with both, and the GLCD on a board with one", async () => {
  const files = await displayFiles(ROOT);
  assert.deepEqual(files.map((f) => f.name), ["GLCD.SVC", "STARTUP.CMD"]);
  const set = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
  const pico = start(set);
  assert.deepEqual([pico.read(m0(pico)), word(pico, 6) - 0x100], [CRT, TPA_NONE], "GLCD.SVC out, the ROM's console the console (KE-150, KE-200)");
  assert.equal(start(set, { tms: false }).read(3) & 3, UC1);
});

test("a dead card shows CARD? on the LCD, for a board with no terminal", () => {
  const m = new Machine({ ...romFor(), clock: TEST_CLOCK, tms: true, matrix: true });
  m.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd(), "CARD?");
});

test("a good retry clears CARD?, and a failed one shows it again", () => {
  const image = standardCard();
  image[0] ^= 0xff; // a card that starts, with no container to mount
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, matrix: true });
  m.expect(/R retry> $/, { from: 0, maxCycles: 200_000_000 });
  assert.equal(lcdRow(m, 3), "CARD?");
  m.mark = m.output.length;
  m.type("R");
  m.expect(/R retry> $/, { maxCycles: 200_000_000 });
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
  ["no STARTUP.CMD", {}, {}],
  ["a file with no display line", { "STARTUP.CMD": startupFile("USER 0") }, {}],
  ["a missing PICO.SVC", { "STARTUP.CMD": startupFile("PICO.SVC") }, {}],
  ["a bad PICO.SVC", { "PICO.SVC": BAD, "STARTUP.CMD": startupFile("PICO.SVC") }, {}],
  ["a skip past the file", { "STARTUP.CMD": startupFile("CON TTY") }, { key: true }],
]) {
  test(`a PICO9918 board with ${name} has the ROM's console, and the LCD says nothing`, () => {
    const m = start(files, opts);
    assert.deepEqual([m.read(3) & 3, m.read(m0(m)), word(m, m.sym("PIVEC"))], [CRT, CRT, m.sym("PIBLK")], "the console in, with no file");
    if (name.includes("missing") || name.includes("bad")) assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
    assert.equal(lcdRow(m, 3), "");
  });
}

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

test("a line left without an end, and a record full to its last byte, run to a prompt on the ROM's console, the LCD saying nothing", () => {
  const raw = (text) => Buffer.from(text, "latin1");
  for (const [file, ran] of [[raw("PICO.SVC\x1a"), /PICO\.SVC\?/], [raw("USER 1\r\n".repeat(15) + "\r".repeat(6) + "\r\n"), />USER 1\r/]]) {
    const m = start({ "STARTUP.CMD": file });
    assert.match(m.text(0), ran, "the line runs");
    assert.deepEqual([m.read(m0(m)), lcdRow(m, 3)], [CRT, ""]);
  }
});

test("the ROM's console or GLCD.SVC, then CON TTY in the file: the LCD stays silent", () => {
  for (const lines of [["CON TTY"], ["GLCD.SVC", "CON TTY"]]) {
    const m = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile(...lines) });
    assert.equal(m.read(m.sym("CONMOD")), 0, lines[0]);
    assert.equal(lcdRow(m, 3), "", lines[0]);
  }
});

test("the LCD stays silent with no PICO9918, and with no matrix keyboard", () => {
  for (const opts of [{ tms: false }, { matrix: false }]) {
    const m = start({ "STARTUP.CMD": startupFile("USER 0") }, opts);
    assert.equal(lcdRow(m, 3), "", JSON.stringify(opts));
  }
});

test("the GLCD's UNLOAD with CRT: as the console leaves it there", () => {
  const m = start(both([]));
  say(m, "CON UC1");
  say(m, "CON CRT");
  say(m, "UNLOAD");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [CRT, CRT]);
  assert.equal(m.read(m.sym("GLVEC") + 1), 0);
});

test("UNLOAD leaves the ROM's console, on CRT: and from serial, and a warm boot and CON CRT find it", () => {
  const m = start({});
  const top = word(m, 6);
  assert.match(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.deepEqual([word(m, 6), m.read(m0(m))], [top, CRT]);
  say(m, "CON TTY");
  assert.match(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.deepEqual([word(m, 6), word(m, m.sym("PIVEC"))], [top, m.sym("PIBLK")]);
  m.traps = 0;
  m.cpu.cpu.pc = 0; // a warm boot on serial
  m.mark = m.output.length;
  m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  assert.equal(m.traps, 0);
  say(m, "CON CRT");
  assert.deepEqual([m.read(3) & 3, m.read(m0(m))], [CRT, CRT], "CON CRT takes the ROM's console again");
  assert.match(say(m, "DIR HELLO.TXT"), /HELLO\.TXT/);
});

test("no matrix keyboard: reset to a prompt on serial with no file, a bad file and no vector call", () => {
  for (const files of [{}, { "PICO.SVC": BAD, "STARTUP.CMD": startupFile("PICO.SVC") }]) {
    const m = start(files, { matrix: false });
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

test("after CON TTY, GLCD.SVC typed takes the console from the ROM's, and CON CRT takes it back (KE-150)", () => {
  const m = start(both([]));
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [CRT, CRT], "the ROM's console");
  say(m, "CON TTY");
  assert.equal(word(m, 6), TPA_NONE + 0x100, "nothing loaded");
  assert.doesNotMatch(say(m, "GLCD.SVC"), /GLCD\.SVC\?/, "no refusal");
  assert.equal(word(m, 6), TPA_GLCD + 0x100, "it loaded");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [UC1, UC1], "and took the console");
  say(m, "CON CRT");
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD"))], [CRT, CRT], "CON CRT takes it");
});

test("a claimed VDP takes no row-move call: the console's code isn't entered while a program owns it", () => {
  const m = start({});
  hw(m, VIDEO, 1);
  const [base, end] = [m.sym("PITPL"), m.sym("LCDINIT")]; // src/pico.asm, in the ROM
  let entered = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc >= base && m.pc < end) entered += 1;
    return step();
  };
  const STUB = 0x0060;
  [0xcd, m.sym("BCONST") & 0xff, m.sym("BCONST") >> 8, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  Object.assign(m.cpu.cpu, { sp: 0x0100, pc: STUB });
  m.runUntil(() => m.pc === STUB + 3, 20_000_000, "BCONST");
  assert.equal(entered, 0);
});

test("the take runs only for a service with its table in its own page", async () => {
  const m = start(both([], { "RES.SVC": await service("res") }));
  say(m, "CON TTY");
  say(m, "RES.SVC");
  assert.equal(m.read(m.sym("CONMOD")), 0, "any other service leaves the console");
});

const VREG1 = (m) => m.tec1g.state.display.tms9918.stateSnapshot().registers[1];

test("a claim with the ROM's console on CRT:: nothing drawn, and release restores it", () => {
  const m = start({});
  assert.equal(hw(m, VIDEO, 1), 0);
  gfx(m, PICOREG, { a: 0xc0, b: 1 });
  assert.equal(VREG1(m), 0xc0, "the program's mode");
  assert.equal(hw(m, VIDEO, 0), 0);
  assert.equal(VREG1(m), 0xd0, "text mode back");
});

test("a claim with the ROM's console in, on UC1:: release restores the VDP, and the GLCD stays the console", () => {
  const m = start(both([]));
  say(m, "CON UC1");
  hw(m, VIDEO, 1);
  gfx(m, PICOREG, { a: 0xc0, b: 1 });
  assert.equal(hw(m, VIDEO, 0), 0);
  assert.equal(VREG1(m), 0xd0);
  assert.equal(m.read(m.sym("CONMOD")), UC1);
});

test("a claim with no console on the PICO9918, with no matrix keyboard: refused by nothing, and nothing is restored", () => {
  const m = start({}, { matrix: false });
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
});

test("a program reading VRAM on the ROM's console sees the names and patterns it saw", () => {
  const m = start({});
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

const WIDTHS = [[80, 0xd0], [40, 0xd0], [32, 0xc0]];
const vram = (m) => m.tec1g.state.display.tms9918.stateSnapshot().vram;
const cold = (m, off) => hw(m, VIDEO, off);
const ramAt = (m, a, n) => Array.from({ length: n }, (_, i) => m.read(a + i));

for (const [cols, r1] of WIDTHS) {
  test(`at ${cols} columns: each graphics entry against VRAM under a claim, then release and warm boot give the text back`, () => {
    const m = start(at(cols));
    assert.notEqual(picoTable(m, ABI.PICOVER), null, "the record's version 3, with the width");
    assert.equal(picoTable(m, ABI.PICOVER + 1), null, "and no higher");
    assert.equal(picoTable(m), m.sym("PIBLK"), "the table is the ROM's block");
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

  test(`at ${cols} columns: the whole pattern table after the take, CONSWV, a release and a warm boot`, () => {
    const m = start(at(cols));
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

test("INIT failing leaves no record and the old ceiling", () => {
  for (const [name, opts, files] of [["GLCD.SVC", { tms: false, glcd: false }, { "GLCD.SVC": GLCD_SVC }]]) {
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

/** A machine on the ROM's console with GLCD? on row 3, from a CON UC1 with no GLCD.SVC, and the GLCD's driver as GLCDX.SVC. */
const glcdWord = (files = {}) => {
  const m = start({ "GLCDX.SVC": GLCD_SVC, ...files });
  say(m, "CON UC1");
  assert.equal(m.read(m0(m)), CRT, "the ROM's console stays");
  assert.equal(lcdRow(m, 3), "GLCD?");
  return m;
};

test("row 3: a program's write over GLCD? survives the take that follows", () => {
  const m = glcdWord();
  writeRow3(m);
  say(m, "GLCDX.SVC");
  assert.equal(lcdRow(m, 3), ROW);
});

test("row 3: the word is cleared by a take, and the flag doesn't stay for the next", () => {
  const m = glcdWord();
  say(m, "GLCDX.SVC");
  assert.equal(m.read(m0(m)), CRT, "it gave way");
  assert.equal(lcdRow(m, 3), "", "GLCD?");
  writeRow3(m);
  say(m, "CON TTY");
  say(m, "UNLOAD");
  say(m, "GLCDX.SVC");
  assert.equal(m.read(m0(m)), UC1);
  assert.equal(lcdRow(m, 3), ROW, "the second take finds the flag down");
});

test("row 3: GLCD? stays while the ROM's console keeps the console; the GLCD's driver typed loads, gives way and clears it (KE-150)", () => {
  const m = glcdWord();
  assert.equal(word(m, 6), TPA_NONE + 0x100, "nothing loaded");
  assert.doesNotMatch(say(m, "GLCDX.SVC"), /GLCDX\.SVC\?/, "no refusal beside the PICO9918");
  assert.equal(word(m, 6), TPA_GLCD + 0x100, "it loaded");
  assert.equal(m.read(3) & 3, CRT, "and gave way: the ROM's console keeps the console");
  assert.equal(lcdRow(m, 3), "");
});

test("row 3: a program's write to rows 0 to 2 leaves the word for a take to clear", () => {
  const m = glcdWord();
  [..."Not row three.......".slice(0, 20)].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
  for (const b of [0, 1, 2]) callAt(m, m.sym("ABICALL"), { b, c: ABI.TNLCD, h: 0x20, l: 0 });
  assert.equal(lcdRow(m, 3), "GLCD?");
  say(m, "GLCDX.SVC");
  assert.equal(lcdRow(m, 3), "");
});

test("row 3: a failed load by hand leaves the word", () => {
  const m = glcdWord({ "BAD.SVC": BAD });
  assert.match(say(m, "BAD.SVC"), /BAD\.SVC\?/);
  assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
  assert.equal(lcdRow(m, 3), "GLCD?");
  assert.equal(m.read(m.sym("CONDEV")) & HWBWRD, HWBWRD, "still marked");
});

test("row 3: a service with no video table leaves the word", async () => {
  const m = glcdWord({ "RES.SVC": await service("res") });
  const top = word(m, 6);
  assert.doesNotMatch(say(m, "RES.SVC"), /RES\.SVC\?/);
  assert.equal(word(m, 6), (top & 0xff00) - 0x100, "it loaded");
  assert.equal(lcdRow(m, 3), "GLCD?");
});

test("row 3: the word lasts through a program's warm boot, for a take to clear", () => {
  const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C and returns
  const m = glcdWord({ "SAY.COM": SAY });
  assert.match(say(m, "SAY"), /C\r\n/);
  assert.equal(lcdRow(m, 3), "GLCD?");
  say(m, "GLCDX.SVC");
  assert.equal(m.read(m0(m)), CRT);
  assert.equal(lcdRow(m, 3), "");
});

test("row 3: GLCD? shows on the ROM's console after a failed CON UC1 in the file", () => {
  const m = start({ "STARTUP.CMD": startupFile("CON UC1") });
  assert.equal(m.read(m0(m)), CRT);
  assert.equal(m.read(m.sym("CONDEV")) & ABI.HWBWRD, ABI.HWBWRD);
  assert.equal(lcdRow(m, 3), "GLCD?");
});

test("INFO's HWBWRD follows the word: up, overwritten and cleared", () => {
  const m = start({ "GLCDX.SVC": GLCD_SVC });
  const info = () => callAt(m, m.sym("ABICALL"), { c: HWINFO }).b & HWBWRD;
  assert.equal(info(), 0, "no word at boot");
  say(m, "CON UC1");
  assert.equal(info(), HWBWRD);
  writeRow3(m);
  assert.equal(info(), 0);
  say(m, "CON UC1");
  assert.equal(info(), HWBWRD);
  say(m, "GLCDX.SVC");
  assert.equal(info(), 0);
});

test("the probe needs both patterns: a VDP that answers one way is not present", () => {
  const m = new Machine({ ...romFor(), sdImage: standardCard(), clock: TEST_CLOCK, tms: true, matrix: true });
  const read = m.cpu.hardware.ioRead;
  m.cpu.hardware.ioRead = (port) => ((port & 0xff) === 0xbe ? 0x5a : read(port));
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  assert.equal(m.read(m.sym("CONDEV")) & 2, 0);
});

test("the web host: a stored card with an old GLCD.SVC says so and offers a new starter", () => {
  const image = standardCard();
  const a = volume(image, "A");
  const old = Uint8Array.from(GLCD_SVC);
  old[1] = 2;
  a.write("GLCD.SVC", old);
  assert.match(cardProblem(image, "glcd"), /GLCD\.SVC is format 2.*A new starter card/);
  assert.deepEqual(prepareCard(image, "glcd", "80").changed, false);
  assert.equal(cardProblem(image, "tms"), null, "the ROM's console needs no file");
  a.write("GLCD.SVC", GLCD_SVC);
  assert.equal(cardProblem(image, "glcd"), null);
});

test("the web host: power-on writes the width's CON PICO line and no driver, says what a card lacks, and a card with no drive A doesn't stop it", () => {
  const image = standardCard();
  assert.equal(cardProblem(image, "tms"), null);
  assert.match(cardProblem(image, "glcd"), /no GLCD\.SVC: it boots as its STARTUP\.CMD says/);
  assert.match(prepareCard(new Uint8Array(4096), "tms", "80").problem, /no drive A/);
  const a = volume(image, "A");
  a.write("STARTUP.CMD", startupFile("PICO.SVC", "GLCD.SVC", "DIR"));
  const names = () => volume(image, "A").list().map((f) => f.name).sort();
  const had = names();
  assert.deepEqual(prepareCard(image, "tms", "40"), { problem: null, note: null, changed: true }, "the width's line");
  assert.equal(startupText(image), "CON PICO 40\r\nDIR\r\n");
  assert.deepEqual(names(), had, "no driver written");
  assert.equal(prepareCard(image, "tms", "40").changed, false);
  assert.deepEqual(prepareCard(image, "tms", "32"), { problem: null, note: null, changed: true }, "a width change");
  assert.equal(startupText(image), "CON PICO 32\r\nDIR\r\n");
  assert.deepEqual(prepareCard(image, "tms", "80"), { problem: null, note: null, changed: true }, "and back: no line at 80");
  assert.equal(startupText(image), "DIR\r\n");
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  assert.deepEqual(prepareCard(image, "glcd", "40"), { problem: null, note: null, changed: true }, "the GLCD's line first");
  assert.equal(startupText(image), "GLCD.SVC\r\nDIR\r\n");
});

test("the web host: a user's CON CRT width line goes with the page's own, so the selector's width stands", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("STARTUP.CMD", startupFile("CON CRT 32", "DIR!CON CRT: 40!USER 3", "con pico 40"));
  assert.deepEqual(prepareCard(image, "tms", "80"), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "DIR!USER 3\r\n", "no width line at 80");
  a.write("STARTUP.CMD", startupFile("CON CRT 32", "DIR"));
  prepareCard(image, "tms", "40");
  assert.equal(startupText(image), "CON PICO 40\r\nDIR\r\n", "the selector's 40 alone");
  a.write("STARTUP.CMD", startupFile("CON CRT", "CON UC1", "DIR"));
  prepareCard(image, "tms", "80");
  assert.equal(startupText(image), "CON CRT\r\nCON UC1\r\nDIR\r\n", "a CON line with no width stays");
});

const startupText = (image) => Buffer.from(volume(image, "A").read("STARTUP.CMD")).toString("latin1").split("\x1a")[0];

test("the web host: a chained startup line loses its display pieces and keeps the rest", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("STARTUP.CMD", startupFile("PICO.SVC!GLCD.SVC!DIR", "DIR!:GLCD.SVC!USER 3", "PICO40.SVC!CON PICO 32"));
  assert.deepEqual(prepareCard(image, "tms"), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "DIR\r\nDIR!:USER 3\r\n");
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
    a.write("STARTUP.CMD", startupFile(line));
    prepareCard(image, "tms");
    assert.equal(startupText(image), `${want}\r\n`, line);
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
    a.write("STARTUP.CMD", startupFile(...lines));
    prepareCard(image, "tms");
    assert.equal(startupText(image), `${want}\r\n`, lines.join("|"));
  }
});

test("the web host: VOLS on the line after an old PICO.SVC line runs, with no display line left", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("VOLS.COM", Uint8Array.from([0xc9]));
  a.write("STARTUP.CMD", startupFile("PICO.SVC", ":VOLS"));
  prepareCard(image, "tms");
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, glcd: false });
  m.runUntil(() => m.ready() && /A>$/.test(m.text(0)), 800_000_000, "the prompt after the file");
  assert.match(m.text(0), />VOLS\r/);
  assert.doesNotMatch(m.text(0), /PICO\.SVC|GLCD\.SVC|VOLS\?/);
});

test("the web host: the piece after a display piece loses its colon and runs", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("VOLS.COM", Uint8Array.from([0xc9]));
  a.write("STARTUP.CMD", startupFile("PICO.SVC!:VOLS", "DIR!GLCD.SVC!PICO.SVC!:USER 3!:USER 0"));
  prepareCard(image, "tms", "40");
  assert.equal(startupText(image), "CON PICO 40\r\nVOLS\r\nDIR!USER 3!:USER 0\r\n");
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, glcd: false });
  m.runUntil(() => m.ready() && /A>$/.test(m.text(0)), 800_000_000, "the prompt after the file");
  assert.match(m.text(0), />CON PICO 40\r[\s\S]*>VOLS\r/, "VOLS runs after the display's line");
  assert.doesNotMatch(m.text(0), /VOLS\?/);
});

test("the web host: a card with .DRV files is refused in its own words and left alone", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.DRV", BAD);
  a.write("GLCD.DRV", GLCD_SVC);
  a.write("STARTUP.CMD", startupFile("PICO.DRV", "GLCD.DRV", "MY.DRV"));
  const before = image.slice();
  const { problem, changed } = prepareCard(image, "glcd");
  assert.match(problem, /older TEC-OS: this ROM doesn't load GLCD\.DRV.*A new starter card has GLCD\.SVC/);
  assert.equal(changed, false);
  assert.deepEqual(image, before);
});

test("the web host: an old card's words name the display asked for, or else what it has", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.DRV", BAD);
  assert.match(cardProblem(image, "glcd"), /doesn't load PICO\.DRV.*has GLCD\.SVC/, "what it has");
  a.write("GLCD.DRV", GLCD_SVC);
  assert.match(cardProblem(image, "glcd"), /doesn't load GLCD\.DRV/, "the display asked for");
  assert.equal(cardProblem(image, "tms"), null, "the ROM's console asks for no file");
  const before = image.slice();
  assert.equal(prepareCard(image, "glcd", "40").changed, false, "an older card isn't given a driver");
  assert.deepEqual(image, before);
});

test("the web host: a card whose files were renamed by hand has its .DRV display lines taken out", () => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("STARTUP.CMD", startupFile("PICO.DRV", "GLCD.DRV", "MY.DRV"));
  assert.deepEqual(prepareCard(image, "tms"), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "MY.DRV\r\n");
});

test("a failed CON UC1 leaves the console as it was, and a later one takes the GLCD", () => {
  const m = start({ "GLCD.XXX": GLCD_SVC });
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
  assert.equal(startupText(image), "GLCD.SVC\r\n", "the starter's own line, for a real board");
  assert.deepEqual(prepareCard(image, "tms", "80"), { problem: null, note: null, changed: true });
  assert.equal(startupText(image), "", "the page writes the chosen display's line alone, none for the ROM's console at 80");
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, glcd: true });
  m.runUntil(() => m.ready() && m.screen().some((l) => /^A>$/.test(l.trim())), 800_000_000, "the prompt");
  assert.doesNotMatch(m.screen().join("\n"), /\?/, "no line refused on the screen");
  assert.doesNotMatch(m.text(0), /GLCD\.SVC\?/);
  assert.deepEqual(m.violations, []);
});

// KE-154: the page reads user 0 only, leaves a read-only A: and a card it
// can't finish preparing as they are, and the card then boots as it is.
const bootsToPrompt = (image) => {
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true });
  m.runUntil(() => m.ready() && /A>$/.test(m.text(0)), 800_000_000, "the prompt");
  return m;
};

test("the web host: a GLCD.SVC in user 3 isn't A:'s (KE-154)", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC, { user: 3 });
  assert.match(cardProblem(image, "glcd"), /no GLCD\.SVC/, "user 3's file isn't the one the ROM loads");
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  assert.equal(cardProblem(image, "glcd"), null, "user 0's is");
});

test("the web host: a read-only A: is left byte for byte, and the card boots as it is (KE-154)", () => {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A", readOnly: true },
    { geometry: "G8M", label: "WORK", mount: "B" },
  ]);
  volume(image, "A").write("STARTUP.CMD", startupFile("DIR"));
  const before = image.slice();
  const got = prepareCard(image, "tms", "40");
  assert.equal(got.changed, false);
  assert.match(got.problem, /couldn't be prepared .*read-only.*boots as it is/);
  assert.deepEqual(image, before);
  assert.match(bootsToPrompt(image).text(0), />DIR\r/, "its own STARTUP.CMD ran");
});

test("the web host: a full directory leaves the card as it was, and it boots (KE-154)", () => {
  const image = standardCard();
  const a = volume(image, "A"); // no STARTUP.CMD: the width's line needs a new entry
  for (let i = 0; a.list().length < a.entries; i += 1) a.write(`F${i}.DAT`, new Uint8Array());
  const before = image.slice();
  let got;
  assert.doesNotThrow(() => (got = prepareCard(image, "tms", "40")));
  assert.equal(got.changed, false);
  assert.match(got.problem, /couldn't be prepared .*boots as it is/);
  assert.deepEqual(image, before);
  const m = bootsToPrompt(image);
  assert.deepEqual([m.read(m0(m)), m.read(m.sym("VWID"))], [CRT, 80], "the original card boots, at 80 columns");
});
