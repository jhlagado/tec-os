// Shared test fixtures: the built ROMs, ATOM-assembled test programs and
// container images.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assembleProgram } from "../../tools/lib/assemble.mjs";
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

/** Boot a machine to the first CCP prompt. Its clock starts at TEST_CLOCK. */
export function boot(sdImage, { profile = "debug80", ramFill = 0, highCapacity = true, tms = false, matrix = false, paged = false, lowPages = 2 } = {}) {
  const { rom, symbols } = romFor(profile);
  const m = new Machine({ rom, symbols, sdImage, ramFill, highCapacity, tms, matrix, paged, lowPages, clock: TEST_CLOCK });
  m.bootText = m.expect(/A>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the first input request");
  return m;
}
