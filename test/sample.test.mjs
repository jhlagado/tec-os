// SAMPLE.ASM (KD-177), the starter's first program: TAS builds it on TEC-OS
// at ABI 5, and it runs on the PICO9918 board: hello through the BDOS, the
// screen's size from INFO, a line on the LCD, the digits and a beep, then the
// prompt. Its table names are abi.inc's, at abi.inc's values. Emulator
// evidence. TAS.COM is a pinned input (test/inputs.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TAS = pinned("TAS.COM");
const SOURCE = readFileSync(resolve(ROOT, "programs/SAMPLE.ASM"), "utf8");

test("SAMPLE.ASM's table names are abi.inc's, at abi.inc's values, and it fits the style's limits", () => {
  const equs = [...SOURCE.matchAll(/^(\w+)\tEQU\t(\$[0-9A-F]+|\d+)/gm)].filter(([, n]) => n !== "BDOS");
  assert.ok(equs.length >= 7);
  for (const [, name, v] of equs) assert.equal(Number(v.replace("$", "0x")), ABI[name], name);
  assert.ok(SOURCE.split("\n").length <= 150, "under about 150 lines");
  assert.ok(Buffer.byteLength(SOURCE) <= 24_576);
  const code = SOURCE.split("\n").map((l) => l.replace(/"[^"]*"/g, '""'));
  assert.ok(code.every((l) => !/ {2}/.test(l)), "tabs, not runs of spaces, outside strings");
});

test("TAS builds SAMPLE on TEC-OS, and SAMPLE runs on the PICO9918 board and returns to the prompt", { skip: TAS.skip, timeout: 900_000 }, () => {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("SAMPLE.ASM", Buffer.from(SOURCE), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const screen = () => m.screen().map((l) => l.trimEnd());
  m.typeMatrix("tas sample\r");
  m.runUntilChecked(() => m.ready() && screen().some((l) => /^SAMPLE\.COM written/.test(l)), 1_500_000_000, "TAS's build");
  const ports = [];
  const io = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (p, v) => {
    ports.push(p & 0xff);
    io(p, v);
  };
  m.typeMatrix("sample\r");
  m.runUntilChecked(() => m.ready() && screen().some((l) => l === "Back to the prompt."), 400_000_000, "SAMPLE's run");
  m.cpu.hardware.ioWrite = io;
  const text = screen().join("\n");
  assert.match(text, /Hello from TEC-OS\.\nScreen: 80 by 24\nBack to the prompt\.\n\nA>/);
  assert.equal(String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(20, 40)), "Hello from SAMPLE   ", "the LCD's second row");
  assert.ok(ports.filter((p) => p === 0x02).length >= 6 * 200, "the digits, 200 passes");
  assert.ok(ports.filter((p) => p === 0x01).length >= 800, "the beep and the digits' select");
  assert.deepEqual(m.violations, []);
});
