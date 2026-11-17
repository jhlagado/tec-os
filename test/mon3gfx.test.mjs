// MON3GFX.SVC: MON-3's graphics as a service of its own, which depends on
// MON3.SVC (Origo KD-437). Without it RST 18h is MON-3's error display; it
// loads only with MON3.SVC in, once; UNLOAD takes it first and gives
// MON3.SVC's hooks back; GFX at MON3> chains it in. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SHELL_SVC } from "./lib/fixtures.mjs";
import { MON3, bytesAt, card, line, machine, mon3GfxSvc, mon3Svc, services, word } from "./lib/mon3.mjs";

const mon3 = await mon3Svc();
const gfx = await mon3GfxSvc();
// clearGBUF (A=1), or call 21, by RST 18h; then 55h at 4100h and back.
const prog = (a) => Uint8Array.from([0x3e, a, 0xdf, 0x3e, 0x55, 0x32, 0x00, 0x41, 0xc9]);
const FILES = { "MON3.SVC": mon3.file, "MON3GFX.SVC": gfx.file, "SHELL.SVC": SHELL_SVC, "P1.BIN": prog(1), "P21.BIN": prog(21) };
const ERR = [0xc7, 0x4b, 0x4b, 0xeb, 0x4b, 0x00];
const err = (m) => ERR.every((b, i) => m.read(0x0880 + i) === b);

/** LOAD and GO NAME: whether MON-3's error display came up and waited for a key, and whether the program then ran on. */
function run(m, name) {
  for (let i = 0; i < 6; i += 1) m.write(0x0880 + i, 0);
  m.write(0x4100, 0);
  assert.ok(line(m, `LOAD ${name}`).mon3);
  m.mark = m.output.length;
  m.type("GO\r");
  const back = () => m.waitingForInput() && MON3.test(m.text(m.mark));
  m.runUntil(() => err(m) || back(), 60_000_000, "Err or MON3>");
  const shown = err(m);
  let waited = false;
  if (shown) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end, 30_000_000, "a wait");
    waited = m.read(0x4100) === 0 && !back();
    m.tec1g.applyKey(0x12, true);
    const up = m.cycles + 4_000_000;
    m.runUntil(() => m.cycles >= up, 8_000_000, "the key down");
    m.tec1g.applyKey(0x12, false);
    m.runUntil(back, 60_000_000, "MON3> after the key");
  }
  return { shown, waited, ran: m.read(0x4100) === 0x55 };
}

test("MG-1 sizes: MON3.SVC in 16 pages and MON3GFX.SVC in 4", () => {
  assert.ok(mon3.image <= 16 * 256, `MON3.SVC ${mon3.image} bytes`);
  assert.ok(gfx.image <= 4 * 256, `MON3GFX.SVC ${gfx.image} bytes`);
  assert.equal(gfx.file[2], 1, "one dependency");
  assert.equal(Buffer.from(gfx.file.subarray(gfx.image + 1, gfx.image + 9)).toString("latin1"), "MON3    ", "on MON3, version 1");
  assert.equal(gfx.file[gfx.image], 1);
});

test("MG-2 without MON3GFX.SVC an RST 18h is MON-3's error display, which waits for a key and returns", () => {
  const m = machine(card(FILES));
  assert.ok(line(m, "MON3.SVC").mon3);
  assert.deepEqual(run(m, "P1.BIN"), { shown: true, waited: true, ran: true });
});

test("MG-3 with it loaded after MON3.SVC, call 1 runs and call 21 is the error display", () => {
  const m = machine(card(FILES));
  assert.ok(line(m, "MON3.SVC").mon3);
  assert.ok(!line(m, "EXIT").mon3);
  assert.doesNotMatch(line(m, "MON3GFX.SVC").out, /\?/);
  assert.deepEqual(services(m), ["MON3GFX 4", "MON3 16"]);
  assert.ok(line(m, "MON3.SVC").mon3);
  assert.deepEqual(run(m, "P1.BIN"), { shown: false, waited: false, ran: true });
  assert.deepEqual(run(m, "P21.BIN"), { shown: true, waited: true, ran: true });
});

test("MG-4 MON3GFX.SVC without MON3.SVC is refused with nothing changed", () => {
  const m = machine(card(FILES));
  const top = word(m, 6);
  assert.match(line(m, "MON3GFX.SVC").out, /MON3GFX\.SVC\?/);
  assert.equal(m.read(m.sym("SVCRC")), 0, "SVCRC 0: refused before INIT");
  assert.equal(word(m, 6), top);
  assert.deepEqual(services(m), []);
});

test("MG-5 a second MON3GFX.SVC is refused at INIT, and UNLOAD takes the graphics first and gives MON3.SVC's hooks back", () => {
  const m = machine(card(FILES));
  assert.ok(line(m, "MON3.SVC").mon3);
  line(m, "EXIT");
  const page = m.read(m.sym("SVCHEAD"));
  const hooks = bytesAt(m, (page << 8) + mon3.symbols.R18, 9);
  line(m, "MON3GFX.SVC");
  assert.notDeepEqual(bytesAt(m, (page << 8) + mon3.symbols.R18, 9), hooks, "the hooks taken");
  assert.match(line(m, "MON3GFX.SVC").out, /MON3GFX\.SVC\?/);
  assert.deepEqual([m.read(m.sym("SVCRC")), m.read(m.sym("SVCRA"))], [1, 1], "INIT refused, TNEBAD");
  assert.deepEqual(services(m), ["MON3GFX 4", "MON3 16"]);
  assert.doesNotMatch(line(m, "UNLOAD").out, /\?/);
  assert.deepEqual(services(m), ["MON3 16"]);
  assert.deepEqual(bytesAt(m, (page << 8) + mon3.symbols.R18, 9), hooks, "the hooks as they were");
  assert.ok(line(m, "MON3.SVC").mon3);
  assert.deepEqual(run(m, "P1.BIN"), { shown: true, waited: true, ran: true });
});

test("MG-6 GFX at MON3> chains MON3GFX.SVC and MON3.SVC under the shell, and a second GFX comes back with one copy", () => {
  const image = card({ ...FILES, "STARTUP.CMD": Buffer.from("SHELL.SVC\r\n\x1a", "latin1") });
  const m = machine(image);
  assert.ok(line(m, "MON3.SVC").mon3);
  for (const pass of [1, 2]) {
    m.mark = m.output.length;
    m.type("GFX\r");
    m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 200_000_000, "MON3> after GFX");
    if (pass === 2) assert.match(m.text(m.mark), /MON3GFX\.SVC\?/, "the second copy refused");
    assert.deepEqual(services(m), ["MON3GFX 4", "MON3 16", "SHELL 17"]);
    assert.deepEqual(run(m, "P1.BIN"), { shown: false, waited: false, ran: true });
  }
});
