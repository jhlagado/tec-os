// DEMO.ASM, the card's demo source: TAS DEMO on TEC-OS builds it from
// the card into the pinned DEMO.COM, byte for byte, with no include file,
// since TAS reads only the current drive. Emulator evidence. TAS.COM is a
// pinned input (test/inputs.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABI, ROOT, boot, program, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TAS = pinned("TAS.COM");
const SOURCE = readFileSync(resolve(ROOT, "programs/DEMO.ASM"), "utf8");
// The pinned DEMO.COM: 1,191 bytes.
const SHIPPED = "7514c21df1dfabe11ddfa5ba94df9a40871f197e3e9b9d2e239c2b4988a9482d";
const sha = (b) => createHash("sha256").update(b).digest("hex");

test("DEMO.ASM stands alone, with abi.inc's names at abi.inc's values, and fits the editor", () => {
  const equs = [...SOURCE.matchAll(/^(\w+) +EQU +(\$[0-9A-F]+|\d+)/gm)].filter(([, n]) => n in ABI);
  assert.ok(equs.length >= 11);
  for (const [, name, v] of equs) assert.equal(Number(v.replace("$", "0x")), ABI[name], name);
  assert.doesNotMatch(SOURCE, /%include/i, "no include: TAS on the card can't follow a path");
  // The assembly style's file limit, which keeps a source editable in TED's
  // text room on the smallest system; TED has 33,466 bytes on the starter card.
  assert.ok(Buffer.byteLength(SOURCE) <= 24_576, "the style's 24,576-byte limit");
  assert.ok(SOURCE.split("\n").every((line) => line.length <= 40), "fits 40 columns");
  assert.ok(!SOURCE.includes("\t"), "spacing is independent of tab stops");
});

test("TAS DEMO on TEC-OS builds the pinned DEMO.COM", { skip: TAS.skip, timeout: 900_000 }, async () => {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("DEMO.ASM", Buffer.from(SOURCE), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const screen = () => m.screen().map((l) => l.trimEnd());
  m.typeMatrix("tas demo\r");
  m.runUntilChecked(() => m.ready() && screen().some((l) => /^DEMO\.COM written/.test(l)), 3_000_000_000, "TAS's build");
  const atom = (await program("demo")).bytes;
  assert.equal(sha(atom), SHIPPED, "ATOM's build of the same source");
  const built = Buffer.from(volume(image, "A").read("DEMO.COM")).subarray(0, atom.length);
  assert.equal(sha(built), SHIPPED, "TAS's DEMO.COM on the card");
  assert.ok(volume(image, "A").read("DEMO.COM").subarray(atom.length).every((b) => b === 0 || b === 0x1a), "nothing after the program but the record's padding");
  assert.deepEqual(m.violations, []);
});
