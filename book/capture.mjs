#!/usr/bin/env node
// Runs TEC-OS on the host model and prints what the console showed, for the
// book's examples. It uses the same machine as the tests and the web page.
//
//   node book/capture.mjs [options] [--] LINE...
//
// Each LINE is typed at the prompt followed by Return, and the run waits for
// the next prompt. A LINE of ^ and a letter, such as ^C, is that control key
// alone. "@key X" types X without Return and waits for the next prompt, for a
// program that stops on any key. "@start LINE" types LINE and Return and runs
// on for 50 million T-states without waiting for a prompt, for a program that
// runs until a key. "@run N" runs N million T-states. "@reset" presses the
// reset button, which keeps RAM and the card, and waits for the prompt.
//
// A listing that fills the screen stops at [more] and waits for a key; the
// run stops there too, and the next LINE is "@key X" for the next screen or
// ^C to end the listing. The wait for a prompt ends at output ending in a
// drive letter and >, so a program that prints such text without a prompt
// ends the wait early.
//
// Options:
//   --board serial   a serial terminal only: no PICO9918, GLCD or matrix
//                    keyboard (the default)
//   --board pico     a PICO9918, the GLCD and the matrix keyboard, as the web
//                    page has
//   --board glcd     the GLCD and the matrix keyboard, no PICO9918
//   --card PATH      the card image; dist/starter.img by default
//   --card none      no card in the socket
//   --rom PATH       the ROM; dist/tecos-debug80.rom by default
//   --lcd            print the 20 x 4 LCD's rows at the end
//   --screen         print the PICO9918's or the GLCD's text at the end
//   --serial         print what left the serial port, not the console
//
// Run `npm run build && npm run media` first, with Node.js 20.10 or later.
// The DS1302 starts at 1 November 2026, 12:00, so a run gives the same
// output on any host. The starter card holds EDIT.COM only when
// `npm run media` found a build of Edit (see tools/media.mjs), and DIR's
// figures change with it, so the script prints the card's SHA-256 and the
// Edit build's on stderr.

import { createHash } from "node:crypto";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Machine, symbolsFromD8 } from "../host/machine.mjs";
import { fontBytes } from "../tools/lib/font.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
Machine.font = fontBytes(ROOT);

const args = process.argv.slice(2);
const opt = { board: "serial", card: resolve(ROOT, "dist/starter.img"), rom: resolve(ROOT, "dist/tecos-debug80.rom") };
const lines = [];
while (args.length) {
  const a = args.shift();
  if (a === "--") lines.push(...args.splice(0));
  else if (a === "--board" || a === "--card" || a === "--rom") opt[a.slice(2)] = args.shift();
  else if (a === "--lcd" || a === "--screen" || a === "--serial") opt[a.slice(2)] = true;
  else lines.push(a);
}

const boards = { serial: { glcd: false }, pico: { tms: true, matrix: true }, glcd: { matrix: true } };
if (!boards[opt.board]) throw new Error(`--board ${opt.board}: serial, pico or glcd`);
const rom = readFileSync(opt.rom);
const symbols = symbolsFromD8(JSON.parse(readFileSync(opt.rom.replace(/\.rom$/, ".d8.json"), "utf8")));
const sdImage = opt.card === "none" ? undefined : new Uint8Array(readFileSync(opt.card));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sdImage) {
  process.stderr.write(`card ${opt.card}: SHA-256 ${sha(sdImage)}\n`);
  const edit = resolve(ROOT, "dist/files/EDIT.COM");
  if (opt.card === resolve(ROOT, "dist/starter.img")) {
    process.stderr.write(existsSync(edit) ? `starter EDIT.COM: SHA-256 ${sha(readFileSync(edit))}\n` : "starter card made without EDIT.COM\n");
  }
}
const m = new Machine({ rom, symbols, sdImage, clock: new Date(2026, 10, 1, 12, 0, 0), ...boards[opt.board] });

const LIMIT = 800_000_000;
const atPrompt = (from) => () => {
  m.pumpInput();
  if (m.pending?.length) return false;
  if (m.waitingForInput() && /\[more\]$/.test(m.text(from))) return true;
  return m.ready() && /[A-P]>$/.test(m.text(from));
};
// A card that won't mount stops at the diagnostic prompt instead.
const atDiag = () => {
  m.pumpInput();
  return m.waitingForInput() && /header> $/.test(m.text(0)) && !(m.pending?.length);
};
const settled = () => (sdImage ? atPrompt(0)() : false) || atDiag();
m.runUntil(settled, LIMIT, "the first prompt");

for (const line of lines) {
  const from = m.output.length;
  const via = m.videoConsole() ? "matrix" : "serial";
  const diag = atDiag();
  const wait = () => m.runUntil(diag ? () => m.output.length > from && atDiag() || atPrompt(from)() : atPrompt(from), LIMIT, `the prompt after ${line}`);
  if (line === "@reset") {
    m.reset();
    const at = m.output.length;
    m.runUntil(() => (atPrompt(at)() || atDiag()), LIMIT, "the prompt after reset");
  } else if (line.startsWith("@run ")) {
    const end = m.cycles + Number(line.slice(5)) * 1_000_000;
    m.runUntil(() => m.cycles >= end, LIMIT, line);
  } else if (line.startsWith("@start ")) {
    m.enqueueInput(`${line.slice(7)}\r`, via);
    m.runUntil(() => (m.pumpInput(), !m.pending?.length), LIMIT, line);
    const end = m.cycles + 50_000_000;
    m.runUntil(() => m.cycles >= end, LIMIT, line);
  } else if (line.startsWith("@key ")) {
    m.enqueueInput(line.slice(5), via);
    wait();
  } else if (/^\^[A-Z]$/.test(line)) {
    m.enqueueInput(String.fromCharCode(line.charCodeAt(1) - 64), via);
    wait();
  } else if (diag) {
    m.enqueueInput(line, via);
    wait();
  } else {
    m.enqueueInput(`${line}\r`, via);
    wait();
  }
}

const text = opt.serial ? m.serialText(0) : m.text(0);
// A lone CR returns to the start of the line, as on a terminal: what follows
// it overwrites what was there, so [more] and its erasure leave nothing.
const shown = text
  .split("\r\n")
  .join("\n")
  .split("\n")
  .map((line) =>
    line.split("\r").reduce((cells, part) => {
      const out = cells.split("");
      for (let i = 0; i < part.length; i += 1) out[i] = part[i];
      return out.join("");
    }, ""),
  )
  .join("\n");
process.stdout.write(shown.replace(/^\n/, ""));
process.stdout.write("\n");
if (opt.lcd) {
  const lcd = m.tec1g.state.lcdCtrl.lcd;
  console.log("--- LCD");
  for (let r = 0; r < 4; r += 1) console.log(String.fromCharCode(...lcd.slice(r * 20, r * 20 + 20)).trimEnd());
}
if (opt.screen) {
  console.log("--- screen");
  const rows = m.read(m.sym("CONMOD")) === 3 ? m.glcdScreen() : m.screen(m.read(0x48) || 80);
  console.log(rows.map((r) => r.trimEnd()).join("\n").replace(/\n+$/, ""));
}
