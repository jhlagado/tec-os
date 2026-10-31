import { test } from "node:test";
import assert from "node:assert/strict";
import { ABI, boot, standardCard } from "./lib/fixtures.mjs";

const profiles = ["debug80", "debug80t40", "debug80g32", "glcd"];
const depths = {};
function start(profile) {
  return boot(standardCard(), { profile: profile === "glcd" ? "debug80" : profile, tms: profile !== "glcd", matrix: true });
}
function call(m, label, args = {}) {
  const cpu = m.cpu.cpu;
  const preserved = { ix: 0x1234, iy: 0x5678, a_prime: 0x19, b_prime: 0x28, c_prime: 0x37, d_prime: 0x46, e_prime: 0x55, h_prime: 0x64, l_prime: 0x73 };
  const alternateFlags = { ...cpu.flags_prime };
  m.write(0xffe, 0); m.write(0xfff, 0x0f);
  Object.assign(cpu, preserved, { pc: m.sym(label), sp: 0xffe }, args);
  let low = 0xffe;
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (a, v) => {
    if (a >= 0xf00 && a < low) low = a;
    write(a, v);
  };
  try { m.runUntil(() => m.pc === 0xf00, 30_000_000, label); }
  finally { m.cpu.hardware.memWrite = write; }
  assert.equal(cpu.sp, 0x1000, "return address consumed and stack balanced");
  for (const [r, v] of Object.entries(preserved)) assert.equal(cpu[r], v, r);
  assert.deepEqual(cpu.flags_prime, alternateFlags, "alternate flags");
  if (label === "CONSEL") for (const r of ["b", "c", "d", "e"]) assert.equal(cpu[r], args[r], r);
  const key = label === "ABIHW" ? `${label}/${args.c}/${args.b ?? 0}` : label;
  depths[key] = Math.max(depths[key] ?? 0, 0xffe - low);
  return { a: cpu.a, carry: cpu.flags.C, z: cpu.flags.Z };
}
/** A program writing the VDP's register R, as DEMO does. */
function vreg(m, r, v) { m.cpu.hardware.ioWrite(0xbf, v); m.cpu.hardware.ioWrite(0xbf, 0x80 | r); }
function out(m, s) { for (const c of s) call(m, "BCONOUT", { c: c.charCodeAt(0) }); }
function screen(m, profile) { return profile === "glcd" ? m.glcdScreen() : m.screen(); }
function ok(r) { assert.deepEqual(r, { a: 0, carry: 0, z: 1 }); }
function watch(m, fn) {
  const seen = [];
  const write = m.cpu.hardware.ioWrite;
  m.cpu.hardware.ioWrite = (p, v) => { seen.push([p & 255, v]); write(p, v); };
  try { fn(); } finally { m.cpu.hardware.ioWrite = write; }
  return seen;
}

for (const profile of profiles) {
  test(`${profile}: erase at pending wrap preserves following row`, () => {
    const m = start(profile), width = m.read(m.sym("VWID"));
    out(m, "\x0c\x1b[2;1H" + "Y".repeat(width) + "\x1b[1;1H" + "X".repeat(width));
    const writes = watch(m, () => out(m, "\x1b[K"));
    assert.equal(screen(m, profile)[1], "Y".repeat(width));
    assert.equal(screen(m, profile)[0], "X".repeat(width));
    if (profile !== "glcd") assert.equal(writes.filter(([p]) => p === 0xbe).length, 0);
    out(m, "\r\x1b[K");
    assert.equal(screen(m, profile)[0], "");
    assert.equal(screen(m, profile)[1], "Y".repeat(width));
    assert.deepEqual(m.violations, []);
  });
  test(`${profile}: zero PUTAT does not read input or touch display`, () => {
    const m = start(profile);
    out(m, "\x0cABC");
    const before = screen(m, profile);
    const reads = [];
    const read = m.cpu.hardware.memRead;
    m.cpu.hardware.memRead = (a) => { if (a >= 0x2000 && a < 0x2100) reads.push(a); return read(a); };
    m.write(0x2000, 90);
    let r;
    const writes = watch(m, () => { r = call(m, "ABIHW", { c: ABI.HWPUTAT, b: 0, d: 0, e: 0, h: 0x20, l: 0 }); });
    m.cpu.hardware.memRead = read;
    ok(r);
    assert.deepEqual(reads, [], "zero count must not read the source");
    assert.deepEqual(screen(m, profile), before);
    assert.equal(writes.length, 0);
    ok(call(m, "ABIHW", { c: ABI.HWPUTAT, b: 1, d: 0, e: 0, h: 0x20, l: 0 }));
    assert.equal(screen(m, profile)[0], "ZBC");
    assert.equal(m.read(m.sym("VCOL")), 3);
    assert.deepEqual(m.violations, []);
  });
  for (const direction of ["B", "C"]) test(`${profile}: relative cursor ${direction} clamps before and after carry`, () => {
    const m = start(profile), width = m.read(m.sym("VWID")), height = m.read(m.sym("VHGT"));
    for (const n of [1, 2, width - 1, width, 254, 255]) {
      out(m, `\x0c\x1b[2;2H\x1b[${n}${direction}`);
      const row = direction === "B";
      assert.equal(m.read(m.sym(row ? "VROW" : "VCOL")), Math.min(1 + n, (row ? height : width) - 1), `move ${n}`);
    }
    assert.deepEqual(m.violations, []);
  });
  if (profile === "glcd") continue;
  test(`${profile}: switching to a claimed display preserves registers and VRAM until release`, () => {
    const m = start(profile);
    const defaultRegisters = [...m.tec1g.state.display.tms9918.stateSnapshot().registers];
    ok(call(m, "ABIHW", { c: ABI.HWVIDEO, b: 1 }));
    vreg(m, 7, 0x12);
    const before = m.tec1g.state.display.tms9918.stateSnapshot();
    const writes = watch(m, () => {
      m.write(3, 0); out(m, "A");
      m.write(3, 1);
      call(m, "CONSEL", { b: 0x12, c: 0x34, d: 0x56, e: 0x78 });
      out(m, "B");
      call(m, "BCONST");
    });
    assert.equal(writes.filter(([p]) => p === 0xbe || p === 0xbf).length, 0);
    assert.deepEqual(m.tec1g.state.display.tms9918.stateSnapshot(), before);
    assert.notEqual(m.read(m.sym("VCLAIM")), 0);
    assert.deepEqual(call(m, "ABIHW", { c: ABI.HWPUTAT, b: 0, h: 0x20, l: 0 }), { a: 2, carry: 1, z: 0 });
    ok(call(m, "ABIHW", { c: ABI.HWVIDEO, b: 0 }));
    assert.equal(m.read(m.sym("VCLAIM")), 0);
    assert.deepEqual([...m.tec1g.state.display.tms9918.stateSnapshot().registers], defaultRegisters);
    assert.ok(m.screen().every((row) => row === ""));
    ok(call(m, "ABIHW", { c: ABI.HWVIDEO, b: 1 }));
    vreg(m, 7, 0x12);
    m.cpu.cpu.pc = m.sym("WBOOTR");
    m.mark = m.output.length;
    m.expect(/A>$/, { from: m.mark, maxCycles: 80_000_000 });
    assert.equal(m.read(m.sym("VCLAIM")), 0, "warm boot releases ownership");
    assert.deepEqual([...m.tec1g.state.display.tms9918.stateSnapshot().registers], defaultRegisters);
    assert.deepEqual(m.violations, []);
  });
}
test("console boundary stack high-water marks", (t) => { t.diagnostic(JSON.stringify(depths)); });
