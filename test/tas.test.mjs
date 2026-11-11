// TAS.COM, the assembler the starter card carries, on TEC-OS: a program
// assembled on the TEC and run; the card's copy, by its pinned hash, with a
// missing or wrong file refused by the media tool; and drivers/ and svcdemo.asm
// assembling under TAS on TEC-OS to their pinned flat images under a .COM
// type; a .SVC that loads; a failed build's FF00h stopping a chained line; and a
// read-only output refused. Emulator evidence. TAS.COM is a pinned input
// (test/inputs.json). And the ROM's map refusing a source line that holds
// several statements, which it cannot place.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DHLEN, makeSvc } from "../tools/lib/svc.mjs";
import { scanSource } from "../tools/lib/tas-d8.mjs";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const TAS = pinned("TAS.COM");
const HELLO = 'ORG $100\nLD DE,MESSAGE\nLD C,9\nCALL 5\nRET\nMESSAGE: DB "HELLO FROM TAS",13,10,"$"\n';
const LONG = { maxCycles: 4_000_000_000 };
const text = (p) => Buffer.from(readFileSync(resolve(ROOT, p)));

test("TAS assembles a program on TEC-OS and the program runs", { skip: TAS.skip, timeout: 900_000 }, () => {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("HELLO.ASM", Buffer.from(HELLO), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  m.command("TAS HELLO", LONG);
  const names = volume(image, "A").list().map((f) => f.name);
  assert.ok(names.includes("HELLO.COM") && names.includes("HELLO.DBG"), names.join(" "));
  assert.match(m.command("HELLO"), /HELLO FROM TAS/);
  assert.deepEqual(m.violations, []);
});

test("the starter card holds TAS.COM by its hash", { skip: TAS.skip }, () => {
  check(TAS);
  const pin = JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs["TAS.COM"];
  const bytes = volume(new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img"))), "A").read("TAS.COM").subarray(0, pin.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
  const recipe = JSON.parse(readFileSync(resolve(ROOT, "dist/starter.recipe.json"), "utf8"));
  assert.equal(recipe.components.find((c) => c.name === "TAS.COM").files[0].sha256, pin.sha256);
});

test("the media tool refuses a TAS.COM missing or not as pinned", () => {
  const media = (path) => spawnSync(process.execPath, ["tools/media.mjs"], { cwd: ROOT, env: { ...process.env, TAS_COM: path }, encoding: "utf8" });
  const missing = media(resolve(ROOT, "build/no-such-TAS.COM"));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /no TAS\.COM at/);
  const wrong = media(resolve(ROOT, "README.md"));
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /TAS\.COM at .* has sha256 [0-9a-f]+, pinned e648a1d0/);
});

test("TAS X X.SVC makes a service that loads", { skip: TAS.skip, timeout: 900_000 }, () => {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("RES.ASM", text("test/programs/res.asm"), { text: true });
  const m = boot(image);
  assert.match(m.command("TAS RES RES.SVC", LONG), /RES\.SVC written/);
  assert.doesNotMatch(m.command("RES.SVC"), /RES\.SVC\?/);
  assert.match(m.command("SERVICES"), /RES\s+1/);
  assert.deepEqual(m.violations, []);
});

test("a failed build stops TAS BAD!:X through FF00h, with a stale X.COM there", { skip: TAS.skip, timeout: 900_000 }, () => {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("BAD.ASM", Buffer.from(HELLO.replace("CALL 5", "CALL NOWHERE")), { text: true });
  a.write("X.COM", Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9])); // prints C
  const m = boot(image);
  const said = m.command("TAS BAD!:X", LONG);
  assert.match(said, /undefined symbol NOWHERE/);
  assert.doesNotMatch(said, /\r\nC\r\n|X\?/);
  assert.equal(m.read(m.sym("PRGCODE")) | (m.read(m.sym("PRGCODE") + 1) << 8), 0xff00);
  assert.deepEqual(m.violations, []);
});

test("TAS refuses a read-only output and leaves it as it was", { skip: TAS.skip, timeout: 900_000 }, () => {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  a.write("HELLO.ASM", Buffer.from(HELLO), { text: true });
  a.write("HELLO.COM", Uint8Array.from([0xc9]), { readOnly: true });
  const m = boot(image);
  assert.match(m.command("TAS HELLO!:USER 3", LONG), /read-only/);
  assert.equal(m.read(4) >> 4, 0, "the line stopped");
  assert.equal(volume(image, "A").read("HELLO.COM")[0], 0xc9);
  assert.deepEqual(m.violations, []);
});

/**
 * ROOT.COM under TAS on a card holding FILES and ROOT.ASM, which sets EQUS and
 * includes MAIN: the image, its CP/M records' padding cut to LENGTH.
 */
function underTas(equs, main, files, length) {
  check(TAS);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("TAS.COM", new Uint8Array(readFileSync(TAS.path)));
  for (const [n, b] of Object.entries(files)) a.write(n, b, { text: true });
  const root = `${Object.entries(equs).map(([k, v]) => `${k.padEnd(8)} EQU ${v}\n`).join("")}%INCLUDE "${main}"\n`;
  a.write("ROOT.ASM", Buffer.from(root), { text: true });
  const m = boot(image, { tms: true, matrix: true });
  const said = m.command("TAS ROOT", LONG);
  const written = volume(image, "A").list().some((f) => f.name === "ROOT.COM");
  assert.ok(written, said);
  assert.deepEqual(m.violations, []);
  return volume(image, "A").read("ROOT.COM").subarray(0, length);
}

// The flat images TAS builds from GLCD.SVC's source and from the svcdemo
// service, by length and SHA-256: a change to either source, or to TAS,
// shows here. Each body, after the header the .SVC writer fills in, is also
// compared with the same assembly by TAS on the host, so a source edit fails
// only on the pin.
const GLCD_FLAT = { bytes: 767, sha256: "aab1ec7be10d3f27fb9eb8c80adb3200e8059468892bbcf92229cb8a23d17278" };
const SVCDEMO_FLAT = { bytes: 56, sha256: "f95a1d5d3b7e6e25f6c201f055e769977ae94f756f52145205f3a32135c9bf4e" };
const sha = (b) => createHash("sha256").update(b).digest("hex");

const COMMON = { "ABI.INC": text("src/abi.inc") };

/** The body of makeSvc's image at 0100h, by TAS on the host: its file's body with each fixup's byte one more. */
async function onHost(source, opt) {
  const made = await makeSvc(resolve(ROOT, source), { work: resolve(ROOT, "build/svc"), ...opt });
  const body = Buffer.from(made.file.subarray(DHLEN, made.image));
  for (const f of made.fixups) body[f] += 1;
  return body;
}

test("GLCD.SVC's source assembles under TAS to its pinned image", { skip: TAS.skip, timeout: 900_000 }, async () => {
  const tas = underTas({}, "GLCD.ASM", { ...COMMON, "GLCD.ASM": text("drivers/glcd.asm") }, GLCD_FLAT.bytes);
  assert.deepEqual([...tas.subarray(DHLEN)], [...(await onHost("drivers/glcd.asm", {}))], "TAS on TEC-OS gives the host's body");
  assert.equal(sha(tas), GLCD_FLAT.sha256);
});

test("svcdemo.asm assembles under TAS to its pinned image", { skip: TAS.skip, timeout: 900_000 }, async () => {
  const flags = [...new Set(readFileSync(resolve(ROOT, "test/programs/svcdemo.asm"), "latin1").match(/\bV_[A-Z]+\b/g))];
  const numbers = { ...Object.fromEntries(flags.map((v) => [v, 0])), VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, RECVER: 2 };
  const name = '"DEMO    "';
  const source = readFileSync(resolve(ROOT, "test/programs/svcdemo.asm"), "latin1").replaceAll("HDRNAME", name).replaceAll("RECNAME", name);
  const tas = underTas(numbers, "SVCDEMO.ASM", { ...COMMON, "SVCDEMO.ASM": Buffer.from(source, "latin1") }, SVCDEMO_FLAT.bytes);
  const host = await onHost("test/programs/svcdemo.asm", { defs: { ...numbers, HDRNAME: name, RECNAME: name } });
  assert.deepEqual([...tas.subarray(DHLEN)], [...host], "TAS on TEC-OS gives the host's body");
  assert.equal(sha(tas), SVCDEMO_FLAT.sha256);
});

// The ROM's map gives each source line one statement. TAS takes several on a
// line, a \ between them, so the map refuses such a line; a \ in quotes or in
// a comment is not one.
test("the ROM's map refuses a line of several statements, and not a \\ in quotes or a comment", () => {
  const scan = (text) => () => scanSource(new Map([["rom.asm", Buffer.from(text, "latin1")]]), "rom.asm");
  assert.throws(scan("  nop\r\n  ld a,1 \\ inc b\r\n"), /rom\.asm:2: several statements on a line/);
  assert.throws(scan("START:  ret \\ nop ; two\n"), /rom\.asm:1: several statements on a line/);
  assert.throws(scan("  ex af,af' \\ nop\n"), /rom\.asm:1: several statements on a line/);
  assert.doesNotThrow(scan("  ld a,'\\\\'   ; a \\ in a comment\n  ex af,af'  ; \\\n  db \"a\\\"\\\\\"\n"));
});
