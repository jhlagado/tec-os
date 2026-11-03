// KS38's checkers, each shown to pass where it should and to fail on a
// deliberate difference: the image byte for byte, label by label with
// relocation masked when two files trade places, and the old names in src/.
// Each variant is this tree copied, edited and built, one at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "../tools/lib/model.mjs";
import { built, compareLabels, sameImage, searchNames } from "../tools/lib/ks38-check.mjs";
import { ROOT } from "./lib/fixtures.mjs";

const WORK = resolve(ROOT, "build/ks38-test");
const base = built(ROOT);
const at = (side, name) => side.labels.find((l) => l.name === name).address;

/** This tree copied as NAME, changed by EDITS ([file, from, to] each), and built. */
async function variant(name, edits) {
  const dir = resolve(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const e of readdirSync(ROOT)) if (!/^(build|dist|node_modules|web|\..*)$/.test(e)) cpSync(resolve(ROOT, e), resolve(dir, e), { recursive: true });
  symlinkSync(resolve(ROOT, "node_modules"), resolve(dir, "node_modules"));
  for (const [file, from, to] of edits) M.patch(dir, file, from, to);
  await M.build(dir);
  return built(dir);
}

const SWAP = ["src/rom.asm", '%INCLUDE "tms.asm"\n%INCLUDE "lcd.asm"', '%INCLUDE "lcd.asm"\n%INCLUDE "tms.asm"'];

test("the image check passes on the same image and finds one byte changed", () => {
  assert.equal(sameImage(base.image, base.image).same, true);
  const changed = Buffer.from(base.image);
  const where = at(base, "RSTENT") - 0xc000 + 3;
  changed[where] ^= 1;
  const r = sameImage(base.image, changed);
  assert.equal(r.count, 1);
  assert.equal(r.first[0].address, 0xc000 + where);
});

test("a label renamed: the image is the same, and the label check passes given the rename and fails without it", async () => {
  const renamed = await variant("rename", [
    ["src/reset.asm", "RESET:  JP      RSTENT", "RESET:  JP      RESETIN"],
    ["src/boot.asm", "RSTENT:\tLD\tA,($0002)", "RESETIN:LD\tA,($0002)"],
    ["src/boot.asm", "CP\tHIGH(RSTENT)", "CP\tHIGH(RESETIN)"],
  ]);
  assert.equal(sameImage(base.image, renamed.image).same, true);
  assert.equal(compareLabels(base, renamed, { renames: { RSTENT: "RESETIN" } }).same, true);
  const kinds = compareLabels(base, renamed).differences.map((d) => `${d.kind} ${d.label}`);
  assert.deepEqual(kinds.sort(), ["extra RESETIN", "missing RSTENT"]);
});

test("two files trade places: the image check fails, the label check passes with addresses taken by their labels", async () => {
  const swapped = await variant("swap", [SWAP]);
  assert.equal(sameImage(base.image, swapped.image).same, false, "the image reordered");
  assert.notEqual(at(base, "LCDINIT"), at(swapped, "LCDINIT"));
  const r = compareLabels(base, swapped);
  assert.deepEqual(r.differences, []);
  assert.ok(r.masked > 10, `${r.masked} addresses masked`);
});

test("with the files traded, the label check finds an operand changed and a jump retargeted", async () => {
  const operand = await variant("swap-operand", [SWAP, ["src/boot.asm", "CP\tHIGH(RSTENT)", "CP\tHIGH(RSTENT)+1"]]);
  const named = (r) => r.differences.map((d) => [d.kind, d.label.split("/").includes("RSTENT")]);
  assert.deepEqual(named(compareLabels(base, operand)), [["bytes", true]], "RSTENT's group");
  const retarget = await variant("swap-jump", [SWAP, ["src/boot.asm", "JP\tNZ,WBOOTR", "JP\tNZ,COLD"]]);
  assert.deepEqual(named(compareLabels(base, retarget)), [["bytes", true]], "RSTENT's group");
  rmSync(WORK, { recursive: true, force: true });
});

test("the names search finds old names as whole words in src/, and nothing in history or generated files", () => {
  assert.ok(searchNames(ROOT, ["GLHOOK"]).some((h) => h.file.startsWith("src/")), "GLHOOK is in src/ today");
  assert.ok(searchNames(ROOT, ["glcd.asm"]).some((h) => h.file === "src/rom.asm"), "a file name, without regard to case");
  assert.deepEqual(searchNames(ROOT, ["NOSUCHLABEL"]), []);
  const dir = mkdtempSync(resolve(ROOT, "build/ks38-names-"));
  mkdirSync(resolve(dir, "src/gen"), { recursive: true });
  writeFileSync(resolve(dir, "src/a.asm"), "\tCALL\tGLHOOKS\n\tCALL\tGLHOOK\t; the hook\n");
  writeFileSync(resolve(dir, "src/PROVENANCE.md"), "GLHOOK was its name\n");
  writeFileSync(resolve(dir, "src/gen/x.asm"), "GLHOOK\tEQU\t1\n");
  assert.deepEqual(searchNames(dir, ["GLHOOK"]), [{ file: "src/a.asm", line: 2, name: "GLHOOK" }]);
  rmSync(dir, { recursive: true });
});
