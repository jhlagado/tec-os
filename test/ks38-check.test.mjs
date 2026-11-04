// KS38's checkers, each shown to pass where it should and to fail on a
// deliberate difference: the image byte for byte, label by label with
// relocation masked when two files trade places, and the old names in src/.
// Each variant is this tree copied, edited and built, one at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

// lcd.asm and the file included just before it, read from rom.asm, traded,
// whatever spaces or tabs lay the include lines out.
const LCDPAIR = readFileSync(resolve(ROOT, "src/rom.asm"), "latin1").match(/^([ \t]*%INCLUDE[ \t]+"[^"]+")\n([ \t]*%INCLUDE[ \t]+"lcd\.asm")$/m);
const SWAP = ["src/rom.asm", LCDPAIR[0], `${LCDPAIR[2]}\n${LCDPAIR[1]}`];

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
    ["src/reset.asm", "RESET:\n  jp RSTENT", "RESET:\n  jp RESETIN"],
    ["src/boot.asm", "RSTENT:\n  ld a,($0002)", "RESETIN:\n  ld a,($0002)"],
    ["src/boot.asm", "cp HIGH(RSTENT)", "cp HIGH(RESETIN)"],
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
  const operand = await variant("swap-operand", [SWAP, ["src/boot.asm", "cp HIGH(RSTENT)", "cp HIGH(RSTENT)+1"]]);
  const named = (r) => r.differences.map((d) => [d.kind, d.label.split("/").includes("RSTENT")]);
  assert.deepEqual(named(compareLabels(base, operand)), [["bytes", true]], "RSTENT's group");
  const retarget = await variant("swap-jump", [SWAP, ["src/boot.asm", "jp nz,WBOOTR", "jp nz,COLD"]]);
  assert.deepEqual(named(compareLabels(base, retarget)), [["bytes", true]], "RSTENT's group");
  rmSync(WORK, { recursive: true, force: true });
});

test("the names search finds old names as whole words in src/, and nothing in history or generated files", () => {
  assert.ok(searchNames(ROOT, ["PIVEC"]).some((h) => h.file.startsWith("src/")), "PIVEC is in src/");
  assert.ok(searchNames(ROOT, ["BOOT.ASM"]).some((h) => h.file === "src/rom.asm"), "a file name, without regard to case");
  assert.deepEqual(searchNames(ROOT, ["NOSUCHLABEL"]), []);
  const dir = mkdtempSync(resolve(ROOT, "build/ks38-names-"));
  mkdirSync(resolve(dir, "src/gen"), { recursive: true });
  writeFileSync(resolve(dir, "src/a.asm"), "\tCALL\tGLHOOKS\n\tCALL\tGLHOOK\t; the hook\n; built from drivers/glcd.asm\n");
  writeFileSync(resolve(dir, "src/PROVENANCE.md"), "GLHOOK was its name\n");
  writeFileSync(resolve(dir, "src/gen/x.asm"), "GLHOOK\tEQU\t1\n");
  assert.deepEqual(searchNames(dir, ["GLHOOK", "glcd.asm"]), [{ file: "src/a.asm", line: 2, name: "GLHOOK" }], "drivers/glcd.asm allowed");
  rmSync(dir, { recursive: true });
});

test("a byte that is the low or high half of one label's address is taken by its label only in an unchanged LOW( or HIGH( line, and an unrelated byte that happens to equal one is not", () => {
  // A holds LD A,<first> / LD A,HIGH(B) / RET; B and C, 16 bytes each, trade places.
  const side = (b, low, first) => {
    const image = Buffer.alloc(0x40);
    image.set([0x3e, low, 0x3e, 0xc0, 0xc9], 0x10);
    image[b - 0xc000] = 0xc9;
    const c = b === 0xc020 ? 0xc030 : 0xc020;
    const segments = [{ start: 0xc010, end: 0xc012, text: `A:\tLD\tA,${first}\t; its low byte` }, { start: 0xc012, end: 0xc014, text: "\tLD\tA,HIGH(B)" }];
    return { image, labels: [{ name: "A", address: 0xc010 }, { name: "B", address: b }, { name: "C", address: c }], constants: new Map(), segments, end: 0xc040 };
  };
  const base = side(0xc020, 0x20, "LOW(B)");
  assert.deepEqual(compareLabels(base, side(0xc030, 0x30, "LOW(B)")).differences, []);
  assert.equal(compareLabels(base, side(0xc030, 0x30, "LOW(B)")).maskedBytes, 1);
  assert.deepEqual(compareLabels(base, side(0xc030, 0x31, "LOW(B)")).differences.map((d) => [d.kind, d.label, d.offset]), [["bytes", "A", 1]], "another value");
  // An unrelated immediate, 20h, changed to 30h, which is B's moved low half: the line says so.
  const plain = side(0xc020, 0x20, "$20");
  assert.deepEqual(compareLabels(plain, side(0xc030, 0x30, "$30")).differences.map((d) => [d.kind, d.label, d.offset]), [["bytes", "A", 1]], "an unrelated byte");
});

test("a relative jump whose displacement changes but whose target is the same label is taken by it, and one to elsewhere is not", () => {
  // A: JR B; between them a 4-byte D that moves out, and C, moving in after B.
  const side = (moved, disp, op = 0x18, text = "JR\tB") => {
    const image = Buffer.alloc(0x40);
    const labels = moved
      ? [{ name: "A", address: 0xc010 }, { name: "B", address: 0xc012 }, { name: "D", address: 0xc014 }, { name: "C", address: 0xc018 }]
      : [{ name: "A", address: 0xc010 }, { name: "D", address: 0xc012 }, { name: "B", address: 0xc016 }, { name: "C", address: 0xc018 }];
    image.set([op, disp], 0x10);
    return { image, labels, constants: new Map(), segments: [{ start: 0xc010, end: 0xc012, text: `A:\t${text}` }], end: 0xc040 };
  };
  const base = side(false, 4);
  assert.deepEqual(compareLabels(base, side(true, 0)).differences, []);
  assert.equal(compareLabels(base, side(true, 0)).maskedJumps, 1);
  assert.deepEqual(compareLabels(base, side(true, 2)).differences.map((d) => [d.kind, d.label]), [["bytes", "A"]]);
});

test("a JR NZ turned into JR NC is a difference, even where its two bytes read as an address of the same place (KE-169)", () => {
  // A: JR NZ or JR NC back 64 bytes, its bytes 20h C0h (C020h) or 30h C0h (C030h); X and Y, 16 bytes
  // each, trade places, so C020h and C030h are both X's first byte, and only the line says they differ.
  const side = (moved, op, text) => {
    const image = Buffer.alloc(0x40);
    image.set([op, 0xc0], 0x10);
    const labels = [{ name: "A", address: 0xc010 }, { name: "X", address: moved ? 0xc030 : 0xc020 }, { name: "Y", address: moved ? 0xc020 : 0xc030 }];
    return { image, labels, constants: new Map(), segments: [{ start: 0xc010, end: 0xc012, text: `A:\t${text}` }], end: 0xc040 };
  };
  const base = side(false, 0x20, "JR\tNZ,$-62");
  assert.deepEqual(compareLabels(base, side(true, 0x30, "JR\tNC,$-62")).differences.map((d) => [d.kind, d.label, d.offset]), [["bytes", "A", 0]]);
});

test("a marker that shared its address with a label moved away is reported, and left out when named", () => {
  // M marks the block's start; A and B trade places, so M is at B in the moved image.
  const side = (a, b) => ({ image: Buffer.alloc(0x40), labels: [{ name: "M", address: 0xc010 }, { name: "A", address: a }, { name: "B", address: b }], constants: new Map(), end: 0xc030 });
  const base = side(0xc010, 0xc020);
  const moved = side(0xc020, 0xc010);
  assert.ok(compareLabels(base, moved).differences.some((d) => d.kind === "apart"));
  assert.deepEqual(compareLabels(base, moved, { markers: ["M"] }).differences, []);
});
