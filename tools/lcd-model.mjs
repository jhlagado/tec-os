#!/usr/bin/env node
// Price the LCD console's placements: for each patch in test/model/lcd/, a
// copy of this tree with the patch applied is assembled and its ROM figures
// printed beside this tree's own. A patch is against this tree's src/. The
// ROM's figures come from each build's census; the service's from makeSvc.
//
//   node tools/lcd-model.mjs            every patch
//   node tools/lcd-model.mjs rom-40     the named ones

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSvc } from "./lib/svc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = join(ROOT, "test/model/lcd");
const MAIN = 15717; // the ROM this branch is built on, without SAVE and USER: every figure is a difference from it

function figures(patch) {
  const dir = mkdtempSync(join(tmpdir(), "lcd-model-"));
  try {
    for (const part of ["src", "tools", "format", "drivers", "test/inputs.json", "test/programs", "package.json"]) cpSync(join(ROOT, part), join(dir, part), { recursive: true });
    cpSync(join(ROOT, ".inputs/TAS.COM"), join(dir, ".inputs/TAS.COM"));
    if (patch) execFileSync("git", ["apply", "-p1", patch], { cwd: dir });
    execFileSync(process.execPath, ["tools/build.mjs"], { cwd: dir, stdio: "pipe", env: { ...process.env, TECOS_TAS_HOST: process.env.TECOS_TAS_HOST ?? join(ROOT, ".inputs/tas-host") } });
    const { rom, ram } = JSON.parse(readFileSync(join(dir, "build/tecos/census.json"), "utf8"));
    return { used: rom.used, free: rom.free, tpa: ram.tpa.bytes };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const names = process.argv.slice(2);
const patches = readdirSync(MODEL).filter((f) => f.endsWith(".patch") && (names.length === 0 || names.includes(basename(f, ".patch")))).sort();
const row = (name, f) => console.log(`${name.padEnd(18)} ROM ${f.used} used, ${f.free} free, ${f.used - MAIN >= 0 ? "+" : ""}${f.used - MAIN} on main; TPA ${f.tpa}`);
row("this tree", figures(null));
for (const p of patches) row(basename(p, ".patch"), figures(join(MODEL, p)));
const svc = await makeSvc(join(ROOT, "drivers/lcd.asm"), { work: join(ROOT, "build/svc") });
console.log(`${"LCD.SVC".padEnd(18)} file ${svc.file.length} bytes, image ${svc.image}, ${Math.ceil(svc.image / 256)} pages`);
