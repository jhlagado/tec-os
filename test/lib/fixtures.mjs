// Shared test fixtures: the built ROMs, ATOM-assembled test programs and
// container images.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assembleProgram } from "../../tools/lib/assemble.mjs";
import { PICO_WIDTHS, makeSvc } from "../../tools/lib/svc.mjs";
import { Machine, loadSymbols } from "./machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "../../tools/lib/container.mjs";
import { CpmVolume } from "../../tools/lib/cpmfs.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** src/abi.inc's plain numbers by name: hardware services, status codes, bits and offsets. */
export const ABI = Object.fromEntries(
  [...readFileSync(resolve(ROOT, "src/abi.inc"), "utf8").matchAll(/^(\w+)\s+EQU\s+(\$[0-9A-F]+|\d+)\b/gm)].map((m) => [m[1], Number(m[2].replace("$", "0x"))]),
);

/** The one ROM. A test's profile name chooses only the PICO9918 driver's width (picoFor). */
export function romFor() {
  const dir = resolve(ROOT, "build", "tecos");
  const romPath = resolve(dir, "tecos.rom");
  if (!existsSync(romPath)) throw new Error(`${romPath} missing: run npm run build first`);
  return { rom: readFileSync(romPath), symbols: loadSymbols(resolve(dir, "tecos.d8.json")) };
}

/** A digest of a source and of everything it includes, nested. */
export function sourceDigest(path, seen = new Set()) {
  if (seen.has(path)) return "";
  seen.add(path);
  const text = readFileSync(path);
  const includes = [...text.toString("latin1").matchAll(/^%INCLUDE\s+"([^"]+)"/gim)].map((m) => resolve(dirname(path), m[1]));
  const hash = createHash("sha256").update(text);
  for (const inc of includes) hash.update(sourceDigest(inc, seen));
  return hash.digest("hex").slice(0, 16);
}


/** Assemble test/programs/NAME.asm with ATOM, cached by the same digest. */
export async function program(name, { base = 0x100 } = {}) {
  const src = resolve(ROOT, "test/programs", `${name}.asm`);
  const digest = sourceDigest(src);
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

/** test/programs/NAME.asm as a .SVC file. */
export const service = async (name) => (await makeSvc(resolve(ROOT, "test/programs", `${name}.asm`), { work: resolve(ROOT, "build/svc") })).file;

/** GLCD.SVC, the GLCD console driver, built from drivers/glcd.asm. */
export const GLCD_SVC = (await makeSvc(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/svc") })).file;

/** PICO.SVC, PICO40.SVC and PICO32.SVC, by file name. */
export const PICO_SVC = Object.fromEntries(
  await Promise.all(Object.entries(PICO_WIDTHS).map(async ([name, defs]) => [name, (await makeSvc(resolve(ROOT, "drivers/pico.asm"), { defs, work: resolve(ROOT, "build/svc") })).file])),
);

/** The PICO driver's file for a profile's name, which stays as the width. */
export const picoFor = (profile = "debug80") => ({ debug80t40: "PICO40.SVC", debug80g32: "PICO32.SVC" })[profile] ?? "PICO.SVC";

/**
 * The three type bytes in the CCP's FCB after M's last command. A name the
 * loader took leaves SVC there. The COM path overwrites them with COM, so
 * a refused load is told from a name that never reached the loader, which
 * prints the same NAME.TYP?.
 */
export const fcbType = (m) => String.fromCharCode(...[9, 10, 11].map((i) => m.read(m.sym("CMDFCB") + i)));

/** A STARTUP.CMD of these lines. */
export const startupFile = (...lines) => Buffer.from(lines.map((l) => `${l}\r\n`).join("") + "\x1a", "latin1");

/**
 * Put a board's display driver and a STARTUP.CMD naming it on drive A of IMAGE:
 * PICO.SVC, by the profile's width, with the matrix keyboard and a PICO9918, and
 * GLCD.SVC with the keyboard alone. A card that has a STARTUP.CMD keeps it.
 */
export function withDisplay(image, { tms = false, matrix = false, profile } = {}) {
  if (!matrix) return image;
  const name = tms ? picoFor(profile) : "GLCD.SVC";
  const a = volume(image, "A");
  if (a.list().some((f) => f.name === name)) return image;
  a.write(name, tms ? PICO_SVC[name] : GLCD_SVC);
  if (!a.list().some((f) => f.name === "STARTUP.CMD")) a.write("STARTUP.CMD", startupFile(name));
  return image;
}

/** Boot a machine to the first CCP prompt. Its clock starts at TEST_CLOCK. */
export function boot(sdImage, { profile = "debug80", ramFill = 0, highCapacity = true, tms = false, matrix = false, glcd = true, ram96 = false, mains = 2, expands = 2 } = {}) {
  const { rom, symbols } = romFor(profile);
  if (sdImage) withDisplay(sdImage, { tms, matrix, profile });
  const m = new Machine({ rom, symbols, sdImage, ramFill, highCapacity, tms, matrix, glcd, ram96, mains, expands, clock: TEST_CLOCK });
  m.bootText = m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}
