// Shared test fixtures: the built ROMs, test programs assembled by TAS and
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

/**
 * TEXT, an abi.inc, without its comment lines: what the pins on abi.inc
 * hold, so that its comments may be reworded with no declaration changed.
 */
export const abiDeclarations = (text) => text.split("\n").filter((l) => !/^\s*;/.test(l)).join("\n");

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


/** The pinned TAS.COM's SHA-256, its first 16 digits: a cached program is TAS's at that pin. */
const TAS_KEY = JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs["TAS.COM"].sha256.slice(0, 16);

/**
 * Assemble test/programs/NAME.asm, or the shipped programs/DEMO.ASM for demo,
 * with TAS, cached by the same digest and by TAS.COM's pin, so a cache from
 * another assembler or another TAS is not read.
 */
export async function program(name, { base = 0x100 } = {}) {
  const src = name === "demo" ? resolve(ROOT, "programs/DEMO.ASM") : resolve(ROOT, "test/programs", `${name}.asm`);
  const digest = sourceDigest(src);
  const cacheDir = resolve(ROOT, "build/test-programs");
  const out = resolve(cacheDir, `${name}-${digest}-${TAS_KEY}-${base.toString(16)}.bin`);
  if (existsSync(out)) {
    return { bytes: readFileSync(out), symbols: JSON.parse(readFileSync(`${out}.json`, "utf8")) };
  }
  const { bytes, symbols } = await assembleProgram(src, { base });
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(out, bytes);
  writeFileSync(`${out}.json`, JSON.stringify(symbols));
  return { bytes, symbols };
}

/**
 * PUT.COM, from test/programs/put.asm: PUT n NAME [v] writes NAME as n
 * 256-byte pages through the BDOS, for a test that needs a file of a known
 * size on the machine.
 */
export const PUT_COM = (await program("put")).bytes;

/**
 * AREA.COM, from test/programs/area.asm: AREA [n [NAME]] reads or sets the
 * user area through BDOS function 32. The command processor stays in area 0,
 * so a test of the BDOS's areas reaches another through this program.
 */
export const AREA_COM = (await program("area")).bytes;

/**
 * IMAGE with a marker file on A: for each of NS: the file named N holds the
 * line #N, so the built-in TYPE N prints it. A test that needs a built-in it
 * can tell ran, and which ran last, runs TYPE N and reads marked().
 */
export function withMarks(image, ...ns) {
  const a = volume(image, "A");
  for (const n of ns) a.write(String(n), MARKS[n]);
  return image;
}

/** The marker files 0 to 15 by name, for a card's file list. */
export const MARKS = Object.fromEntries(Array.from({ length: 16 }, (_, n) => [String(n), Buffer.from(`#${n}\r\n\x1a`, "latin1")]));

/** The number of the last marker M's console has printed since FROM: 0 if none. */
export const marked = (m, from = 0) => Number((m.text(from).match(/^#(\d+)\r$/gm) ?? ["#0"]).at(-1).slice(1));

/** What PUT n NAME writes: byte k of record r is r+k; with V, what PUT n NAME V writes: every byte V. */
export const putBytes = (pages, v) => Uint8Array.from({ length: pages * 256 }, (_, i) => (v ?? (i >> 7) + (i & 127)) & 0xff);

/** A two-volume container: A is G1M SYSTEM, B is G8M WORK, plus extras. */
export function standardCard(extra = []) {
  return createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
    ...extra,
  ]);
}

/**
 * The starter card (or IMAGE) with LABEL's volume on A: in SYSTEM's place,
 * as CD A:LABEL leaves it, but as the card's own mounts: what a test of a
 * themed volume's files boots. Every volume keeps its files.
 */
export function starterOn(label, image = new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img")))) {
  const info = parseContainer(image);
  if (!info.volumes.some((v) => v.label === label)) throw new Error(`the card has no volume ${label}`);
  const out = createContainer(info.volumes.map((v) => ({
    geometry: v.g.name, label: v.label, readOnly: v.readOnly,
    mount: v.label === label ? "A" : v.drive === "A" ? "-" : (v.drive ?? "-"),
  })), { drives: info.drives });
  const target = parseContainer(out);
  info.volumes.forEach((v, i) => volumePayload(out, target.volumes[i]).set(volumePayload(image, v)));
  return out;
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

/** SHELL.SVC, the resident shell, built from drivers/shell.asm. */
export const SHELL_SVC = (await makeSvc(resolve(ROOT, "drivers/shell.asm"), { work: resolve(ROOT, "build/svc") })).file;

/**
 * IMAGE with SHELL.SVC on A: and a STARTUP.CMD of SHELL.SVC, then LINES, so
 * that it boots with the shell holding the prompt: the shell runs the lines
 * after its own, which the ROM alone would not.
 */
export function withShell(image, ...lines) {
  const a = volume(image, "A");
  a.write("SHELL.SVC", SHELL_SVC);
  a.write("STARTUP.CMD", startupFile("SHELL.SVC", ...lines));
  return image;
}


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
 * PICO9918 the console is the ROM's, so only a width other than 40 needs a
 * line, CON PICO WIDTH; with the keyboard alone, GLCD.SVC and a STARTUP.CMD
 * naming it. A card that has a STARTUP.CMD keeps it.
 */
export function withDisplay(image, { tms = false, matrix = false, width = 80 } = {}) {
  if (!matrix) return image;
  const a = volume(image, "A");
  const has = (n) => a.list().some((f) => f.name === n);
  if (tms) {
    if (width !== 40 && !has("STARTUP.CMD")) a.write("STARTUP.CMD", startupFile(`CON PICO ${width}`));
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
  m.bootText = m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}
