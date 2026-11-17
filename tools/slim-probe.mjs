#!/usr/bin/env node
// The shell-slimming figures on the starter card that tools/media.mjs
// builds: SHELL.SVC's size and pages, the word at 0006h and the TPA with the
// shell loaded, and the time from a line's Enter to the next prompt for DIR,
// DIR /W, ECHO, TYPE, CD and the history keys, on the serial console and on
// the PICO9918. Prints one JSON object and asserts nothing.
//
//   node tools/slim-probe.mjs [--card dist/starter.img] [--add NAME=FILE] [--json FILE]
//
// --add writes FILE onto A: as NAME first: the base's card with a file of
// DIR.COM's size lists the same rows as the prototype's.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Machine, symbolsFromD8 } from "../host/machine.mjs";
import { fontBytes } from "./lib/font.mjs";
import { findVolume, parseContainer, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const args = process.argv.slice(2);
const value = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
Machine.font = fontBytes(ROOT);

const rom = readFileSync(resolve(ROOT, "build/tecos/tecos.rom"));
const symbols = symbolsFromD8(JSON.parse(readFileSync(resolve(ROOT, "build/tecos/tecos.d8.json"), "utf8")));
function card() {
  const image = new Uint8Array(readFileSync(resolve(ROOT, value("--card", "dist/starter.img"))));
  const add = value("--add");
  if (add) {
    const [name, path] = add.split("=");
    const v = findVolume(parseContainer(image), "A");
    new CpmVolume(volumePayload(image, v), v.g, { readOnly: false }).write(name, readFileSync(resolve(path)));
  }
  return image;
}
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const MS = 4000;

function owners(m) {
  const out = [];
  for (let p = m.read(m.sym("SVCHEAD")); p; p = m.read((p << 8) + 8)) {
    const name = String.fromCharCode(...Array.from({ length: 8 }, (_, i) => m.read((p << 8) + 17 + i))).trim();
    const next = m.read((p << 8) + 8) || m.read(m.sym("STUBAD") + 1);
    out.push({ name, page: p, pages: next - p });
  }
  return out;
}

function machine(board) {
  const opts = board === "pico" ? { tms: true, matrix: true } : {};
  const m = new Machine({ rom, symbols, sdImage: card(), clock: new Date(2026, 0, 1, 12, 0, 0), ...opts });
  m.runUntil(() => m.ready() && /A:SYSTEM>$/.test(m.text(0)), 2_000_000_000, "the startup prompt");
  return m;
}

/** Type LINE, then time its Enter to the next prompt. Pager pauses are answered with a space. */
function timed(m, line, { re = /[A-P]:\S*>$/ } = {}) {
  m.type(line);
  m.mark = m.output.length;
  const start = m.cycles;
  m.type("\r");
  let pauses = 0;
  for (;;) {
    const more = () => /\[more\]$/.test(m.text(m.mark));
    m.runUntil(() => (m.waitingForInput() && more()) || (m.ready() && re.test(m.text(m.mark))), 4_000_000_000, line);
    if (!more()) break;
    pauses += 1;
    m.type(" ");
  }
  return { ms: +((m.cycles - start) / MS).toFixed(2), pauses, text: m.text(m.mark) };
}

/** Time one history key: from its delivery until the line it recalls is shown and a key is awaited. */
function key(m, ch, shown) {
  m.mark = m.output.length;
  const start = m.cycles;
  m.type(ch);
  m.runUntil(() => m.waitingForInput() && m.text(m.mark).endsWith(shown), 400_000_000, `${shown} shown`);
  return +((m.cycles - start) / MS).toFixed(2);
}

function board(name) {
  const m = machine(name);
  const res = owners(m);
  const out = { board: name, entry: word(m, 6).toString(16).toUpperCase() + "h", tpa: word(m, 6) - 0x100, residents: res };
  // Each command twice: the second is the figure, with the card's blocks
  // in the cache as at any later use.
  for (const [k, line] of [["dir", "DIR"], ["dirw", "DIR /W"], ["echo", "ECHO HI"], ["type", "TYPE STARTUP.CMD"], ["cdq", "CD ?"], ["cd", "CD"], ["cdb", "CD B:WORK"], ["dirb", "DIR B:"], ["nofile", "DIR X.Y"]]) {
    timed(m, line);
    const r = timed(m, line);
    out[k] = r.ms;
    if (k === "dir" || k === "dirw" || k === "cdq" || k === "nofile") out[`${k}Text`] = r.text;
  }
  timed(m, "ECHO ONE");
  timed(m, "ECHO TWO");
  out.ctrlW = [key(m, "\x17", "ECHO TWO"), key(m, "\x17", "ECHO ONE")];
  out.ctrlN = key(m, "\x0e", "ECHO TWO");
  m.type("\x15");
  m.runUntil(() => m.waitingForInput(), 400_000_000, "a key wait");
  return out;
}

const result = { rom: { used: null }, boards: [board("serial"), board("pico")] };
const census = JSON.parse(readFileSync(resolve(ROOT, "build/tecos/census.json"), "utf8"));
result.rom = { used: census.rom.used, free: census.rom.free, sha256: census.sha256 };
const shell = readFileSync(resolve(ROOT, "dist/files/SHELL.SVC"));
result.shellFile = shell.length;
try { result.dirCom = readFileSync(resolve(ROOT, "dist/files/DIR.COM")).length; } catch { result.dirCom = null; }
const json = value("--json");
if (json) writeFileSync(json, JSON.stringify(result, null, 2) + "\n");
const brief = (b) => Object.fromEntries(Object.entries(b).filter(([k]) => !k.endsWith("Text")));
console.log(JSON.stringify({ ...result, boards: result.boards.map(brief) }, null, 1));
