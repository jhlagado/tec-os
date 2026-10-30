// Shared test fixtures: the built ROMs, ATOM-assembled test programs and
// container images.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assembleProgram } from "../../tools/lib/assemble.mjs";
import { makeDrv } from "../../tools/lib/drv.mjs";
import { Machine, loadSymbols } from "./machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "../../tools/lib/container.mjs";
import { CpmVolume } from "../../tools/lib/cpmfs.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function romFor(profile = "debug80") {
  const dir = resolve(ROOT, "build", profile);
  const romPath = resolve(dir, "tecos.rom");
  if (!existsSync(romPath)) throw new Error(`${romPath} missing: run npm run build first`);
  return { rom: readFileSync(romPath), symbols: loadSymbols(resolve(dir, "tecos.d8.json")) };
}

/**
 * test/programs/NAME.asm assembled at ORIGIN: its "ORG $0100" line rewritten,
 * cached by source digest and origin.
 */
export async function programAt(name, origin) {
  if (origin === 0x100) return (await program(name)).bytes;
  const text = readFileSync(resolve(ROOT, "test/programs", `${name}.asm`), "utf8");
  const org = /^(\s+ORG\s+)\$0100\s*$/m;
  if (!org.test(text)) throw new Error(`${name}.asm has no "ORG $0100" line`);
  const hex = origin.toString(16).toUpperCase().padStart(4, "0");
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const cacheDir = resolve(ROOT, "build/test-programs");
  const src = resolve(cacheDir, `${name}-${digest}-at${hex}.asm`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(src, text.replace(org, (_, lead) => `${lead}$${hex}`));
  return (await assembleProgram(src, { base: origin })).bytes;
}

/**
 * NAME as a PRL, made as Digital Research made them: assembled at 0000h and
 * 0100h, with a bitmap bit for each byte that differs (each must differ by
 * exactly 1). A 256-byte header gives the code length; then the code for
 * 0100h and the bitmap.
 */
export async function prl(name) {
  const at0 = await programAt(name, 0);
  const at1 = await programAt(name, 0x100);
  const n = at0.length;
  const bitmap = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i += 1) {
    if (at0[i] === at1[i]) continue;
    if (((at0[i] + 1) & 0xff) !== at1[i]) throw new Error(`${name}: byte ${i} is not relocatable`);
    bitmap[i >> 3] |= 0x80 >> (i & 7);
  }
  const file = new Uint8Array(256 + n + bitmap.length);
  file.set([0, n & 0xff, n >> 8]);
  file.set(at1, 256);
  file.set(bitmap, 256 + n);
  return file;
}

/** Assemble test/programs/NAME.asm with ATOM, cached by source digest. */
export async function program(name, { base = 0x100 } = {}) {
  const src = resolve(ROOT, "test/programs", `${name}.asm`);
  const text = readFileSync(src);
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const cacheDir = resolve(ROOT, "build/test-programs");
  const out = resolve(cacheDir, `${name}-${digest}-${base.toString(16)}.bin`);
  if (existsSync(out)) {
    return { bytes: readFileSync(out), symbols: JSON.parse(readFileSync(`${out}.json`, "utf8")) };
  }
  const { bytes, symbols } = await assembleProgram(src, { base });
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(out, bytes);
  writeFileSync(`${out}.json`, JSON.stringify(symbols));
  return { bytes, symbols };
}

/** A two-volume container: A is G1M SYSTEM, B is G8M WORK, plus extras. */
export function standardCard(extra = []) {
  return createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    ...extra,
  ]);
}

export function volume(image, drive) {
  const info = parseContainer(image);
  const v = findVolume(info, drive);
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
}

/** The DS1302's time when a test machine starts: 1 January 2026, 12:00:00. */
export const TEST_CLOCK = new Date(2026, 0, 1, 12, 0, 0);

/** test/programs/NAME.asm as a .DRV file. */
export const driver = async (name) => (await makeDrv(resolve(ROOT, "test/programs", `${name}.asm`), { work: resolve(ROOT, "build/drv") })).file;

/** GLCD.DRV, the GLCD console driver, built from drivers/glcd.asm. */
export const GLCD_DRV = (await makeDrv(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/drv") })).file;

/** A STARTUP.CMD of these lines. */
export const startupFile = (...lines) => Buffer.from(lines.map((l) => `${l}\r\n`).join("") + "\x1a", "latin1");

/**
 * Put GLCD.DRV on drive A of IMAGE when the machine has the matrix keyboard and
 * no PICO9918, as a GLCD board's card has it, so the CCP's first entry makes the
 * GLCD the console.
 */
export function withGlcd(image, { tms = false, matrix = false } = {}) {
  if (!matrix || tms) return image;
  const a = volume(image, "A");
  if (!a.list().some((f) => f.name === "GLCD.DRV")) a.write("GLCD.DRV", GLCD_DRV);
  return image;
}

/** Boot a machine to the first CCP prompt. Its clock starts at TEST_CLOCK. */
export function boot(sdImage, { profile = "debug80", ramFill = 0, highCapacity = true, tms = false, matrix = false, glcd = true, ram96 = false, mains = 2, expands = 2 } = {}) {
  const { rom, symbols } = romFor(profile);
  if (sdImage) withGlcd(sdImage, { tms, matrix });
  const m = new Machine({ rom, symbols, sdImage, ramFill, highCapacity, tms, matrix, glcd, ram96, mains, expands, clock: TEST_CLOCK });
  m.bootText = m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}
