// Emulator evidence: pinned TAS on TEC-OS, then relocated MON3.
// Host parsing is an independent oracle, never a HEX producer or loader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createContainer } from "../tools/lib/container.mjs";
import { standardCard, volume, withShell } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";
import { card, machine, line, word, bytesAt } from "./lib/mon3.mjs";
import { goTo, mon3Build, ok, toMon3 } from "./lib/mon3s2.mjs";

const TAS = pinned("TAS.COM");
const sha = b => createHash("sha256").update(b).digest("hex");
const LONG = { maxCycles: 4_000_000_000 };
const PIC = "ORG $2000\nLD A,$5A\nJR FINISH\nORG $2010\nFINISH: RET\n";

function parse(raw) {
  const end = Buffer.from(":00000001FF\r\n", "ascii");
  const at = raw.indexOf(end);
  assert.ok(at >= 0, "actual Intel HEX EOF, not renamed binary");
  const bytes = raw.subarray(0, at + end.length);
  assert.ok([...raw.subarray(bytes.length)].every(b => b === 0 || b === 0x1a), "CP/M padding only");
  const rows = bytes.toString("ascii").slice(0, -2).split("\r\n"), map = new Map();
  for (const [i, row] of rows.entries()) {
    assert.match(row, /^:[0-9A-F]+$/);
    assert.equal(row.length % 2, 1);
    const b = Buffer.from(row.slice(1), "hex");
    assert.equal(b.length, b[0] + 5, "byte count");
    assert.equal([...b].reduce((sum, value) => sum + value, 0) & 255, 0, "checksum");
    const address = b.readUInt16BE(1);
    if (b[3] === 1) {
      assert.deepEqual([...b], [0, 0, 0, 1, 255]);
      assert.equal(i, rows.length - 1, "one EOF at the end");
    } else {
      assert.equal(b[3], 0, "TAS emits data00 and EOF01, no invented entry record");
      assert.ok(b[0] > 0 && b[0] <= 16 && address + b[0] <= 0x10000);
      for (let j = 0; j < b[0]; j++) {
        assert.equal(map.has(address + j), false, "no repeated native output address");
        map.set(address + j, b[j + 4]);
      }
    }
  }
  return { bytes, map };
}

async function target(source, stem, constrained, initialFiles = {}) {
  check(TAS);
  const svc = await mon3Build();
  let image = constrained ? createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    { geometry: "G1M", label: "PROJECTS", mount: "C" },
    { geometry: "G1M", label: "GAMES" }, { geometry: "G1M", label: "SPARE" },
  ], { drives: 4 }) : standardCard();
  card({ "TAS.COM": readFileSync(TAS.path), "MON3.SVC": svc.file }, image);
  for (const [name, bytes] of Object.entries(initialFiles)) volume(image, "A").write(name, bytes);
  volume(image, "A").write(`${stem}.ASM`, Buffer.from(source, "ascii"), { text: true });
  if (constrained) image = withShell(image, "GLCD.SVC");
  const m = machine(image, { matrix: constrained });
  if (constrained) {
    assert.ok(line(m, "MON3.SVC").mon3);
    assert.equal(line(m, "EXIT").mon3, false);
    assert.equal(word(m, 6), 0x8e00, "shell, GLCD and MON3 remain resident");
  }
  return { m, image, svc };
}

// The native compiler reserves400 bytes below its actual TPA top. Sample
// its user stack and real BDOS entries only during this command. OS private
// stacks lie above that top and retain their own existing qualification.
function compile(m, command) {
  const top = word(m, 6), original = m.step.bind(m), entry = m.sym("BENTRY");
  let low = top, samples = 0, bdos = 0;
  m.step = () => {
    const sp = m.cpu.cpu.sp & 0xffff;
    if (sp >= 0x100 && sp <= top) {
      low = Math.min(low, sp); samples++;
      if (m.pc === entry) bdos++;
    }
    return original();
  };
  try {
    const out = m.command(command, LONG);
    const result = { top, depth: top - low, samples, bdos, out };
    console.log(JSON.stringify({ command, ...result }));
    assert.ok(samples > 0 && bdos > 0, "compiler calls actual TEC-OS BDOS with its user stack");
    assert.ok(result.depth <= 400, `TAS user stack ${result.depth}/400`);
    return out;
  } finally { m.step = original; }
}

function loadOnly(m, command, base) {
  const original = m.step.bind(m);
  let programSteps = 0, result;
  m.step = () => {
    if (m.pc >= base && m.pc <= base + 0x10) programSteps++;
    return original();
  };
  try { result = line(m, command); } finally { m.step = original; }
  assert.equal(programSteps, 0, "LOAD does not execute the loaded program");
  return result;
}

for (const constrained of [false, true]) test(`pinned TAS HEX runs in MON3 at original and overridden bases${constrained ? " with shell and GLCD resident" : ""}`, { skip: TAS.skip, timeout: 900_000 }, async () => {
  const { m, image } = await target(PIC, "PIC", constrained);
  assert.match(compile(m, "TAS PIC PIC.HEX"), /PIC\.HEX written/);
  const raw = Buffer.from(volume(image, "A").read("PIC.HEX")), hex = parse(raw);
  assert.deepEqual([...hex.map], [[0x2000, 0x3e], [0x2001, 0x5a], [0x2002, 0x18], [0x2003, 0x0c], [0x2010, 0xc9]]);
  assert.equal(sha(hex.bytes), "668d2bc3634cd2822249c4e9eeebc1a0d39193ab832b2516b1e575ff3b634376");
  assert.ok(line(m, "MON3.SVC").mon3);
  for (const base of [0x2000, 0x5000]) {
    m.write(base + 4, 0xa5); // A gap canary, not a loader or program patch.
    assert.ok(ok(loadOnly(m, `LOAD PIC.HEX${base === 0x2000 ? "" : " 5000"}`, base)));
    assert.deepEqual([...bytesAt(m, base, 4)], [0x3e, 0x5a, 0x18, 0x0c]);
    assert.equal(m.read(base + 4), 0xa5);
    goTo(m, "GO", base);
    m.runUntil(() => m.pc === base + 0x10, 5_000_000, "position-independent relative branch to RET");
    assert.equal(m.cpu.cpu.a, 0x5a);
    toMon3(m);
  }
  assert.deepEqual(m.violations, []);
});

const holes = n => `ORG $2000\nDS 1\nDB 3\n${Array.from({ length: n - 1 }, (_, k) => {
  const i = k + 1;
  return `ORG $${(0x2001 + 2 * i).toString(16)}\nDB ${(17 * i + 3) & 255}\n`;
}).join("")}`;

test("pinned TAS HEX preserves1024 gaps on the real OS with resident services", { skip: TAS.skip, timeout: 900_000 }, async () => {
  const { m, image } = await target(holes(1024), "MANY", true);
  assert.match(compile(m, "TAS MANY MANY.HEX"), /MANY\.HEX written/);
  const hex = parse(Buffer.from(volume(image, "A").read("MANY.HEX")));
  assert.deepEqual([...hex.map], Array.from({ length: 1024 }, (_, i) => [0x2001 + 2 * i, (17 * i + 3) & 255]));
  assert.ok(line(m, "MON3.SVC").mon3);
  m.write(0x4fff, 0xa5); // The leading DS1 hole lies before the lowest data.
  for (let i = 0; i < 2047; i++) m.write(0x5000 + i, 0xa5);
  assert.ok(ok(line(m, "LOAD MANY.HEX 5000")));
  assert.equal(m.read(0x4fff), 0xa5, "the leading reserved byte is untouched");
  for (let i = 0; i < 2047; i++) assert.equal(m.read(0x5000 + i), i % 2 ? 0xa5 : (17 * (i / 2) + 3) & 255);
  assert.deepEqual(m.violations, []);
});

test("pinned TAS HEX arena refusal on the real OS keeps old output/debug and removes work files", { skip: TAS.skip, timeout: 900_000 }, async () => {
  const { m, image } = await target(holes(8192), "HUGE", true, {
    "HUGE.HEX": Buffer.from(":00000001FF\r\n"), "HUGE.DBG": Buffer.from("previous debug"),
  });
  const a = volume(image, "A");
  const before = [Buffer.from(a.read("HUGE.HEX")), Buffer.from(a.read("HUGE.DBG"))];
  assert.match(compile(m, "TAS HUGE HUGE.HEX"), /out of memory/);
  assert.equal(word(m, m.sym("PRGCODE")), 0xff00);
  assert.deepEqual(Buffer.from(volume(image, "A").read("HUGE.HEX")), before[0]);
  assert.deepEqual(Buffer.from(volume(image, "A").read("HUGE.DBG")), before[1]);
  assert.ok(volume(image, "A").list().every(f => !/\.\$\$[H$D]$/.test(f.name)), "no assembler work file remains");
  assert.deepEqual(m.violations, []);
});
