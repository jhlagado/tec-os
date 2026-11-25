// Snake9 under MON3.SVC: the published game loaded at 4000h and run from the
// MON3> line, its title menus stepped with the GO key, and play started with
// keypad 6. MON3.SVC is the only resident service. Emulator evidence: the
// keypad here is the emulator's, not the board's or the Viewer's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ROOT } from "./lib/fixtures.mjs";
import { MON3, MON3_BIN, MON3_SVC_SHA, bytesAt, card, lcdRows, line, machine, mon3Svc, runFor, services } from "./lib/mon3.mjs";
import { assembleProgram } from "../tools/lib/assemble.mjs";

const skip = MON3_BIN.skip;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const SNAKE9_SHA = "c1fa08cc2e19f13a56b41a484a56d9c9d1876ffa2d9ec4a82cdb780b962c3c5d";

// The keypad's GO and 6, as the runtime takes them: the function bit set.
const KEYGO = 0x12 ^ 0x20;
const KEY6 = 0x06 ^ 0x20;

// The 8x8 display's ports: row select, red, green and blue.
const RGB = new Set([0x05, 0x06, 0xf8, 0xf9]);

test("Snake9: LOAD, GO, the menus and play under MON3.SVC", { skip }, async () => {
  const svc = await mon3Svc();
  assert.equal(sha(svc.file), MON3_SVC_SHA, "the pinned MON3.SVC");
  const snake = Buffer.from((await assembleProgram(resolve(ROOT, "programs/SNAKE9.ASM"), { base: 0x4000 })).bytes);
  assert.equal(sha(snake), SNAKE9_SHA, "the published Snake9 binary");
  assert.equal(snake.length, 6204);

  const m = machine(card({ "MON3.SVC": svc.file, "SNAKE9.BIN": snake }));
  let rgb = 0;
  const write = m.tec1g.ioHandlers.write;
  m.tec1g.ioHandlers.write = (port, value) => {
    if (RGB.has(port & 0xff)) rgb += 1;
    return write(port, value);
  };
  const lcd = () => lcdRows(m).map((r) => r.trimEnd()).join(" | ");
  const tap = (code) => {
    m.tec1g.applyKey(code, true);
    runFor(m, 400_000);
    m.tec1g.applyKey(code, false);
    runFor(m, 400_000);
  };
  // The 8x8 picture: the rows lit across 200,000 cycles, OR-ed together, as
  // the display is multiplexed a row at a time.
  const d = m.tec1g.state.display;
  const picture = () => {
    const acc = [0, 1, 2].map(() => new Array(8).fill(0));
    for (let t = 0; t < 100; t++) {
      runFor(m, 2_000);
      [d.ledMatrixRedRows, d.ledMatrixGreenRows, d.ledMatrixBlueRows].forEach((rows, c) => rows.forEach((v, r) => { acc[c][r] |= v; }));
    }
    return acc.map((rows) => rows.join(",")).join("/");
  };
  const pictures = (n) => {
    const seen = new Set();
    for (let i = 0; i < n; i++) { runFor(m, 800_000); seen.add(picture()); }
    return seen.size;
  };

  assert.ok(line(m, "MON3.SVC").mon3, "MON3> at entry");
  assert.ok(line(m, "LOAD SNAKE9.BIN").mon3, "MON3> after the load");
  assert.ok(Buffer.from(bytesAt(m, 0x4000, snake.length)).equals(snake), "all 6,204 bytes at 4000h");
  assert.deepEqual(services(m), ["MON3 19"], "MON3.SVC the only resident service");

  const from = m.output.length;
  m.type("GO\r");
  runFor(m, 8_000_000);
  assert.ok(rgb > 4096, `the game drives the 8x8 display: ${rgb} writes`);
  assert.match(lcd(), /Tutankhamen's Snake/, "the title screen");

  let screens = 1;
  let last = lcd();
  for (let i = 0; i < 12 && !/PAUSED: move to go/.test(last); i++) {
    tap(KEYGO);
    runFor(m, 4_000_000);
    if (lcd() !== last) screens += 1;
    last = lcd();
  }
  assert.match(last, /PAUSED: move to go/, "the GO key steps the menus to the first level");
  assert.ok(screens >= 5, `the menus' screens: ${screens}`);

  assert.equal(pictures(10), 1, "paused: the picture holds still");
  tap(KEY6);
  assert.ok(pictures(30) > 1, "keypad 6 starts play: the snake moves");
  assert.ok(!MON3.test(m.text(from)), "the game still running, not back at MON3>");
});
