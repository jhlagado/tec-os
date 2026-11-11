// KG45, KS39's gate: the PICO9918's console in the ROM. It starts with no file
// on a board with the VDP and the matrix keyboard, is the registry's tail, keeps
// TNDRVR's CRT: for itself, refuses an old card's PICO.SVC, switches width and
// keeps it over warm boot, and lays out the state a debugger reads where abi.inc
// says. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import { displayFiles } from "../tools/lib/starter.mjs";
import { ABI, GLCD_SVC, ROOT, TEST_CLOCK, boot, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const CRT = 1;

/** A PICO9918 and matrix board on IMAGE, at its usable prompt. */
function start(image, opts = {}) {
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, tms: true, matrix: true, ...opts });
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "a usable prompt");
  return m;
}

/** A line typed on the console's own keyboard, to the next prompt. */
function say(m, line) {
  m.mark = m.output.length;
  if (m.read(3) & 1) m.typeMatrix(`${line}\r`);
  else m.type(`${line}\r`);
  m.runUntil(() => m.waitingForInput() && /\d*[A-P]>$/.test(m.text(m.mark)), 400_000_000, line);
  return m.text(m.mark);
}

/** ABICALL with C = the service, B and DE as given, from a stub at 0060h: carry, A, HL. */
function abi(m, c, { b = 0, de = 0, hl = 0 } = {}) {
  const cpu = m.cpu.cpu;
  const saved = Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "sp", "pc"].map((r) => [r, cpu[r]]));
  const flags = { ...cpu.flags };
  [0xcd, ...[m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8], 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
  Object.assign(cpu, { b, c, d: de >> 8, e: de & 0xff, h: hl >> 8, l: hl & 0xff, sp: 0x100, pc: 0x60 });
  m.runUntil(() => m.pc === 0x63, 80_000_000, `service ${c}`);
  const out = { carry: cpu.flags.C, a: cpu.a, hl: (cpu.h << 8) | cpu.l };
  Object.assign(cpu, saved, { flags });
  return out;
}

/** TNFIND "PICO" at version LEAST: carry and HL. */
function find(m, least) {
  [..."PICO    "].forEach((ch, i) => m.write(0x2000 + i, ch.charCodeAt(0)));
  return abi(m, ABI.TNFIND, { b: least, de: 0x2000 });
}

test("on a PICO9918 board with no PICO.SVC the banner, volumes and prompt are on the screen; with no matrix keyboard the console is serial", () => {
  const m = start(standardCard());
  const screen = m.screen();
  assert.deepEqual(screen.slice(1, 4), ["TEC-OS 0.1 for TEC-1G", "A: SYSTEM", "B: WORK"]);
  assert.ok(screen.includes("A>"));
  assert.deepEqual([m.read(3) & 3, m.read(m.sym("CONMOD")), m.serialText()], [CRT, CRT, ""]);
  const serial = start(standardCard(), { matrix: false });
  assert.deepEqual([serial.read(3) & 3, serial.read(m.sym("CONMOD")), word(serial, m.sym("PIVEC"))], [0, 0, 0], "serial, and no table");
  assert.match(serial.serialText(), /TEC-OS 0\.1 for TEC-1G\r\nA: SYSTEM/);
});

test("TNFIND finds PICO at version 3, its table PIBLK, and TNLIST returns its record last", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  const m = start(image, { glcd: true });
  say(m, "GLCD.SVC");
  const found = find(m, ABI.PICOVER);
  assert.deepEqual([found.carry, found.hl], [0, m.sym("PIBLK")]);
  assert.equal(find(m, ABI.PICOVER + 1).carry, 1, "and no higher");
  const records = [];
  for (let b = 0; b < 16; b += 1) {
    const r = abi(m, ABI.TNLIST, { b });
    if (r.carry) break;
    records.push(r.hl);
  }
  assert.equal(records.at(-1), m.sym("PIREC"), "the ROM's record is the tail");
});

test("GLCD.SVC loaded and unloaded leaves REGHEAD at the ROM's record", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  const m = start(image, { glcd: true });
  assert.equal(word(m, m.sym("REGHEAD")), m.sym("PIREC"));
  say(m, "CON TTY");
  say(m, "GLCD.SVC");
  assert.notEqual(m.read(m.sym("SVCHEAD")), 0, "loaded");
  say(m, "CON TTY");
  assert.doesNotMatch(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.deepEqual([m.read(m.sym("SVCHEAD")), word(m, m.sym("REGHEAD"))], [0, m.sym("PIREC")]);
});

test("UNLOAD of a GLCD.SVC that gave way to CRT: leaves the PICO9918's screen as it was (KE-190)", () => {
  const image = standardCard();
  volume(image, "A").write("GLCD.SVC", GLCD_SVC);
  const m = start(image, { glcd: true });
  say(m, "GLCD.SVC");
  assert.deepEqual([m.read(m.sym("CONMOD")), m.read(3) & 3], [CRT, CRT], "it gave way");
  assert.doesNotMatch(say(m, "UNLOAD"), /UNLOAD\?/);
  assert.equal(m.read(m.sym("SVCHEAD")), 0, "unloaded");
  const screen = m.screen();
  assert.equal(screen[1], "TEC-OS 0.1 for TEC-1G", "the banner still there: no clear");
  assert.ok(screen.some((row) => row.startsWith("A>GLCD.SVC")), "and the line that loaded it");
  assert.ok(screen.some((row) => row.startsWith("A>UNLOAD")), "and the UNLOAD");
  assert.deepEqual([m.read(m.sym("CONMOD")), m.read(3) & 3, word(m, m.sym("GLVEC"))], [CRT, CRT, 0]);
});

test("TNDRVR refuses B = 1, with a table or HL = 0, and the console is unchanged", () => {
  const m = start(standardCard());
  const before = [m.read(m.sym("CONMOD")), m.read(m.sym("VWID")), word(m, m.sym("PIVEC"))];
  for (const hl of [0, 0x3000]) {
    const r = abi(m, ABI.TNDRVR, { b: 1, hl });
    assert.deepEqual([r.carry, r.a], [1, ABI.TNEBAD], `HL = ${hl.toString(16)}`);
  }
  assert.deepEqual([m.read(m.sym("CONMOD")), m.read(m.sym("VWID")), word(m, m.sym("PIVEC"))], before);
  assert.match(say(m, "DIR"), /^DIR\r\r\nNO FILE\r\nA>$/, "the console works");
});

const OLD_PICO = "ff5b2c35ec7d648c81ca129532e133103cbc095fa1ce0756c3c6b1b39b1bf287";

test("an old card's PICO.SVC line, KS36c's driver, is refused, saying so, with nothing left", () => {
  const bytes = readFileSync(resolve(ROOT, "test/fixtures/e5154ad/PICO.SVC"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), OLD_PICO, "the pinned binary");
  const image = standardCard();
  const a = volume(image, "A");
  a.write("PICO.SVC", bytes);
  a.write("STARTUP.CMD", startupFile("PICO.SVC"));
  const m = start(image);
  assert.match(m.screen().join("\n"), /PICO\.SVC\?/);
  assert.deepEqual([m.read(m.sym("SVCRC")), m.read(m.sym("SVCRA")), m.read(m.sym("SVCHEAD"))], [1, ABI.TNEBAD, 0], "its INIT refused by TNDRVR");
  assert.deepEqual([word(m, m.sym("PIVEC")), word(m, m.sym("REGHEAD")), m.read(m.sym("CONMOD"))], [m.sym("PIBLK"), m.sym("PIREC"), CRT], "the ROM's console as it was");
});

test("CON PICO 40 and CON CRT 32 switch the width, kept over warm boot, and 80 after reset", () => {
  const m = start(standardCard());
  for (const [line, cols] of [["CON PICO 40", 40], ["CON CRT 32", 32]]) {
    assert.doesNotMatch(say(m, line), /\?\r\n/);
    assert.deepEqual([m.read(m.sym("PIWID")), m.read(m.sym("VWID"))], [cols, cols], line);
  }
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /A>$/.test(m.text(m.mark)), 400_000_000, "warm boot");
  assert.deepEqual([m.read(m.sym("PIWID")), m.read(m.sym("VWID"))], [32, 32], "kept over warm boot");
  m.reset();
  m.runUntil(() => m.ready(), 400_000_000, "the prompt after reset");
  assert.deepEqual([m.read(m.sym("PIWID")), m.read(m.sym("VWID"))], [40, 40], "cold width after reset (historical test name retained)");
});

test("a debugger reads TPSHOW, TPDRAW and the version through abi.inc's offsets from the table TNFIND gives", () => {
  const m = start(standardCard());
  const table = find(m, ABI.PICOVER).hl;
  assert.deepEqual([table + ABI.PICOTPS, table + ABI.PICOTPD], [m.sym("PITPS"), m.sym("PITPD")]);
  assert.equal(m.read(table + ABI.PICOVRB), ABI.PICOVER);
  for (let i = 0; i < 30; i += 1) say(m, "DIR");
  assert.equal(m.read(table + ABI.PICOTPS), m.read(m.sym("PITPS")), "the page shown, as the console flips");
  assert.ok([0, m.read(m.sym("PITPG"))].includes(m.read(table + ABI.PICOTPS)));
});

test("a PICO9918 board booting the starter's display files has the shell's figure's TPA: the shell alone loaded", async () => {
  const image = standardCard();
  for (const f of await displayFiles(ROOT)) volume(image, "A").write(f.name, f.bytes);
  const pico = start(image, { glcd: false });
  const head = pico.read(pico.sym("SVCHEAD"));
  assert.equal(String.fromCharCode(...Array.from({ length: 5 }, (_, i) => pico.read((head << 8) + 17 + i))), "SHELL", "the shell loaded");
  assert.equal(pico.read((head << 8) + 8), 0, "and nothing above it: GLCD.SVC gave way");
  const serial = boot(standardCard());
  assert.equal(word(serial, 6), word(serial, serial.sym("STUBAD")), "nothing loaded on the serial board");
  assert.equal(word(pico, 6), (word(serial, 6) & 0xff00) - 0xa00, "the shell's 10 pages below the stub's page");
});
