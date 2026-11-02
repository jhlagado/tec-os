import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assembleAt } from "../tools/lib/prl.mjs";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | m.read(a + 1) << 8;
const putWord = (m, a, n) => { m.write(a, n & 255); m.write(a + 1, n >> 8); };

// Enter the actual loader with a record-rounded extent. Stop before either
// destructive path so an old ROM fails promptly instead of corrupting itself.
async function check({ n, end, extra = 0, top, accept = false }) {
  const m = await boot(standardCard());
  for (let a = 0x100; a < 0x400; a++) m.write(a, 0);
  putWord(m, 0x101, n);
  putWord(m, 0x104, extra);
  m.write(0x200, 0xc9);
  if (top !== undefined) putWord(m, 6, top);
  // The baseline has no retained extent; the same input still reaches its
  // destructive path, which is the discriminator for every rejection case.
  try { putWord(m, m.sym("LOADTOP"), end); } catch {}
  const before = word(m, 6);
  const pztop = word(m, m.sym("PZTOP"));
  const image = Array.from({ length: 0x300 }, (_, i) => m.read(0x100 + i));
  putWord(m, 0x70, 0x80);
  m.cpu.cpu.sp = 0x70;
  m.cpu.cpu.pc = m.sym("PRLGO");
  let minSp = 0x70;
  m.runUntil(() => {
    minSp = Math.min(minSp, m.cpu.cpu.sp);
    return [0x80, m.sym("PRLPROG")].includes(m.pc);
  }, 1_000_000, "validation returns or reaches a destructive path");
  if (accept) assert.equal(m.pc, m.sym("PRLPROG"));
  else {
    assert.equal(m.pc, 0x80, "rejected before move or relocation");
    assert.equal(m.cpu.cpu.flags.C, 1);
    assert.equal(m.cpu.cpu.sp, 0x72, "returned through the original return word");
    assert.equal(minSp, 0x70, "validation uses no additional stack");
    assert.equal(word(m, 6), before);
    assert.equal(word(m, m.sym("PZTOP")), pztop);
    assert.deepEqual(Array.from({ length: 0x300 }, (_, i) => m.read(0x100 + i)), image);
  }
}

for (const [name, input] of Object.entries({
  "short header": { n: 1, end: 0x180 },
  "zero code": { n: 0, end: 0x280 },
  "declared code beyond records": { n: 257, end: 0x300 },
  "missing bitmap record": { n: 128, end: 0x280 },
  "wrapped code end": { n: 65535, end: 0x280 },
  "wrapped bitmap end": { n: 58000, end: 0xb800 },
  "destination above current TPA": { n: 257, end: 0x400, top: 0x206 },
})) test(`PRL rejects ${name} without mutation`, () => check(input));

for (const n of [1, 7, 8, 9, 113, 114, 127, 128, 255, 256, 257]) {
  test(`PRL accepts ${n} code bytes with record padding`, () => check({ n, end: Math.ceil((512 + n + Math.ceil(n / 8)) / 128) * 128, accept: true }));
}

test("CCP retains the actual short file extent and refuses its oversized declaration", async () => {
  const card = standardCard();
  const file = new Uint8Array(257); file[1] = file[2] = 255; file[256] = 0xc9;
  volume(card, "A").write("SHORT.PRL", file);
  const m = await boot(card);
  const before = word(m, 6);
  m.mark = m.output.length; m.type("SHORT\r");
  m.runUntil(() => m.pc === m.sym("PRLGO"), 100_000_000);
  m.runUntil(() => m.pc === m.sym("PRLPROG") || m.pc === m.sym("BADCMD"), 1_000_000);
  assert.equal(m.pc, m.sym("BADCMD"), "short disk file must not start LDIR");
  assert.equal(word(m, m.sym("LOADTOP")), 0x280, "three disk records, including padding");
  m.expect(/SHORT\?\r\n\r\nA>$/);
  assert.equal(word(m, 6), before);
});

test("an unindented ORG after a blank line is refused, and an indented one with CRLF is taken", async () => {
  const dir = mkdtempSync(resolve(ROOT, "build/org-"));
  const at = (text) => {
    const path = resolve(dir, "T.asm");
    writeFileSync(path, text);
    return assembleAt(path, 0x8000, dir);
  };
  await assert.rejects(at("\nORG $0100\n\tRET\n"), /no "ORG \$0100" line/);
  assert.equal((await at("\tORG $0100\r\n\tRET\r\n")).length, 1);
  rmSync(dir, { recursive: true });
});
