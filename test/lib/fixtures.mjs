// Shared test fixtures: the built ROMs, ATOM-assembled test programs and
// container images.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assembleProgram } from "../../tools/lib/assemble.mjs";
import { makeSvc } from "../../tools/lib/svc.mjs";
import { Machine, loadSymbols } from "./machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "../../tools/lib/container.mjs";
import { CpmVolume } from "../../tools/lib/cpmfs.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** src/abi.inc's plain numbers by name: hardware services, status codes, bits and offsets. */
export const ABI = Object.fromEntries(
  [...readFileSync(resolve(ROOT, "src/abi.inc"), "utf8").matchAll(/^(\w+)\s+EQU\s+(\$[0-9A-F]+|\d+)\b/gm)].map((m) => [m[1], Number(m[2].replace("$", "0x"))]),
);

/** The one ROM, for every board and every width: the ROM's console's width is a CON PICO line on the card (withDisplay). */
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
 * Put a board's display on drive A of IMAGE: with the matrix keyboard and a
 * PICO9918 the console is the ROM's, so only a width other than 80 needs a
 * line, CON PICO WIDTH; with the keyboard alone, GLCD.SVC and a STARTUP.CMD
 * naming it. A card that has a STARTUP.CMD keeps it.
 */
export function withDisplay(image, { tms = false, matrix = false, width = 80 } = {}) {
  if (!matrix) return image;
  const a = volume(image, "A");
  const has = (n) => a.list().some((f) => f.name === n);
  if (tms) {
    if (width !== 80 && !has("STARTUP.CMD")) a.write("STARTUP.CMD", startupFile(`CON PICO ${width}`));
    return image;
  }
  if (has("GLCD.SVC")) return image;
  a.write("GLCD.SVC", GLCD_SVC);
  if (!has("STARTUP.CMD")) a.write("STARTUP.CMD", startupFile("GLCD.SVC"));
  return image;
}

/** Boot a machine to the first CCP prompt. Its clock starts at TEST_CLOCK. */
export function boot(sdImage, { width = 80, ramFill = 0, highCapacity = true, tms = false, matrix = false, glcd = true, ram96 = false, mains = 2, expands = 2 } = {}) {
  const { rom, symbols } = romFor();
  if (sdImage) withDisplay(sdImage, { tms, matrix, width });
  const m = new Machine({ rom, symbols, sdImage, ramFill, highCapacity, tms, matrix, glcd, ram96, mains, expands, clock: TEST_CLOCK });
  m.bootText = m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}
