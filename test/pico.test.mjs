// The PICO9918 console as a driver: its widths, the take, a board with both
// displays, a claim in each state, UNLOAD, and nothing calling a vector while no
// table is in. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardProblem } from "../host/card.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCard } from "../host/card.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { Machine } from "./lib/machine.mjs";
import { screens } from "./lib/pico-workload.mjs";
import { GLCD_DRV, PICO_DRV, ROOT, TEST_CLOCK, boot, driver, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const m0 = (m) => m.sym("CONMOD");
const lcdRow = (m, row) => String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(row * 20, row * 20 + 20)).trimEnd();
const CRT = 1;
const UC1 = 3;

/** A machine at its usable prompt, with zero trapped: pc at 0 from reset on is a vector call. */
function start(files, opts = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\n\x1a", "latin1"));
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, ...opts });
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
const hw = (m, c, b, a = 0) => {
  const STUB = 0x0060;
  [0xcd, m.sym("ABIHW") & 0xff, m.sym("ABIHW") >> 8, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
  Object.assign(m.cpu.cpu, { a, b, c, sp: 0x0100, pc: STUB });
  m.runUntil(() => m.pc === STUB + 3, 80_000_000, "ABIHW");
  return m.cpu.cpu.a;
};

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
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), word(m, 6)], [UC1, UC1, one - 0x300]);
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
  assert.equal(top(start(both(["PICO.DRV"]), { glcd: false })), 46342);
  assert.equal(top(start({ "GLCD.DRV": GLCD_DRV, "STARTUP.CMD": startupFile("GLCD.DRV") }, { tms: false })), 46086);
  const m = start(both());
  assert.equal(top(m), 46342, "a board with both, at boot");
  say(m, "CON UC1");
  assert.equal(top(m), 45574);
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
  assert.deepEqual([pico.read(m0(pico)), word(pico, 6) - 0x100], [CRT, 46342]);
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

for (const [name, files] of [
  ["a missing PICO.DRV", { "STARTUP.CMD": startupFile("PICO.DRV") }],
  ["a bad PICO.DRV", { "PICO.DRV": new Uint8Array(200).fill(0x55), "STARTUP.CMD": startupFile("PICO.DRV") }],
  ["no STARTUP.CMD", {}],
]) {
  test(`a PICO9918 board with ${name} says PICO? on the LCD, once`, () => {
    const m = start(files);
    assert.equal(m.read(m.sym("CONMOD")), 0);
    assert.equal(lcdRow(m, 3), "PICO?");
    m.tec1g.state.lcdCtrl.lcd.fill(0x20, 60, 80);
    m.command("USER 0");
    assert.equal(lcdRow(m, 3), "", "the next prompt leaves the row alone");
  });
}

test("a line left without an end, and a record full to its last byte, say PICO? after they run", () => {
  const raw = (text) => Buffer.from(text, "latin1");
  for (const file of [raw("PICO.DRV\x1a"), raw("USER 1\r\n".repeat(15) + "\r".repeat(6) + "\r\n")]) {
    assert.equal(lcdRow(start({ "STARTUP.CMD": file }), 3), "PICO?");
  }
});

test("a good PICO.DRV shows nothing on the LCD, and nor does a later CON TTY", () => {
  const m = start({ ...PICO_DRV, "STARTUP.CMD": startupFile("PICO.DRV") });
  assert.equal(m.read(m.sym("CONMOD")), CRT);
  assert.equal(lcdRow(m, 3), "");
  say(m, "CON TTY");
  assert.equal(lcdRow(m, 3), "");
});

test("the LCD stays silent on a board with no PICO9918, whatever the file", () => {
  assert.equal(lcdRow(start({ "STARTUP.CMD": startupFile("PICO.DRV") }, { tms: false }), 3), "");
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
  assert.deepEqual([word(m, 6), word(m, m.sym("PIVEC"))], [top + 0x200, 0]);
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
  hw(m, 5, 1);
  const base = m.read(m.sym("DRVHEAD")) << 8;
  let entered = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc >= base && m.pc < base + 0x200) entered += 1;
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
const VREG = 12;

test("a claim with PICO.DRV in, on CRT:: nothing drawn, and release restores it", () => {
  const m = start(both(["PICO.DRV"]));
  assert.equal(hw(m, 5, 1), 0);
  hw(m, VREG, 1, 0xc0);
  assert.equal(VREG1(m), 0xc0, "the program's mode");
  assert.equal(hw(m, 5, 0), 0);
  assert.equal(VREG1(m), 0x50, "text mode back");
});

test("a claim with PICO.DRV in, on UC1:: release restores the VDP, and the GLCD stays the console", () => {
  const m = start(both(["PICO.DRV"]));
  say(m, "CON UC1");
  hw(m, 5, 1);
  hw(m, VREG, 1, 0xc0);
  assert.equal(hw(m, 5, 0), 0);
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
    assert.equal(hw(m, 5, 1), 0);
    assert.equal(hw(m, 5, 0), 0);
    assert.equal(VREG1(m), before);
    assert.deepEqual([m.traps, wild], [0, 0]);
  }
});

test("a program reading VRAM on the driver sees the names and patterns it saw", () => {
  const m = start(both(["PICO.DRV"]));
  const v = m.tec1g.state.display.tms9918.stateSnapshot().vram;
  const font = m.sym("FONT") + (0x41 - 0x20) * 8;
  assert.deepEqual([...v.slice(0x41 * 8, 0x41 * 8 + 8)], Array.from({ length: 8 }, (_, i) => m.read(font + i)));
  assert.ok([...v.slice(0x1000, 0x1000 + 80 * 24)].includes(0x41), "the screen's A> in the name table");
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
