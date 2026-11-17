#!/usr/bin/env node
// Price the LCD console's placements: for each patch in test/model/lcd/, a
// copy of this tree with the patch applied is assembled and its ROM figures
// printed beside this tree's own. A patch is against this tree's src/. The
// ROM's figures come from each build's census; the service's from makeSvc.
//
//   node tools/lcd-model.mjs            every patch
//   node tools/lcd-model.mjs rom-40     the named ones
//   node tools/lcd-model.mjs --diagnostic-lower-origin
// The diagnostic only prices the current source. It neither runs nor saves
// its relocated image. A normal-origin build remains the acceptance gate.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeSvc } from "./lib/svc.mjs";
import { tasAssembler } from "./lib/tas-rom.mjs";
import { decodeImage } from "./lib/tas-d8.mjs";
import { inputsDir, pinnedBytes } from "./lib/pins.mjs";

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

/**
 * Move both workspace and ROM down by 2000h in a private source copy. Page
 * offsets and relative branches retain their distances. This gives the pinned
 * assembler room to report CODEEND when the normal image exceeds FFFFh.
 * The result is a byte census, never a runnable or publishable ROM.
 * Run the normal build first to prepare src/gen, even if that build overflows.
 */
async function diagnosticLowerOrigin() {
  await tasAssembler(); // Verify the pinned assembler, runner and runtime.
  const host = resolve(process.env.TECOS_TAS_HOST ?? join(inputsDir(ROOT), "tas-host"));
  const { assemble } = await import(pathToFileURL(join(host, "tools/tas.mjs")).href);
  const dir = mkdtempSync(join(tmpdir(), "lcd-price-"));
  try {
    const visited = new Map();
    const names = new Set();
    function visit(file) {
      assert.ok(!posix.isAbsolute(file) && !file.startsWith("../"), "source escapes src");
      if (visited.has(file)) return;
      const name = basename(file).toUpperCase();
      assert.match(name, /^[A-Z0-9$_-]{1,8}\.(ASM|INC)$/);
      assert.ok(!names.has(name), "ambiguous source name: " + name);
      names.add(name);
      const original = readFileSync(join(ROOT, "src", file), "latin1");
      visited.set(file, original);
      let text = original.replace(/^(\s*%INCLUDE\s+")([^"\r\n]+)(")/gim, (_, a, name, b) => {
        let child = posix.normalize(posix.join(posix.dirname(file), name));
        try { readFileSync(join(ROOT, "src", child)); } catch { child = name; }
        visit(child);
        return a + basename(child).toUpperCase() + b;
      });
      if (file === "reset.asm") {
        assert.equal((text.match(/ORG \$C000/g) ?? []).length, 1, "normal ROM origin changed");
        text = text.replace("ORG $C000", "ORG $A000");
      }
      if (file === "layout.asm") {
        assert.ok(text.includes("RAMBIOS EQU $BF00"), "normal BIOS placement changed");
        text = text.replace("RAMBIOS EQU $BF00", "RAMBIOS EQU $9F00");
      }
      if (file === "gen/config.asm") {
        assert.equal((text.match(/WSBASE\s+EQU\s+\$[\dA-F]+/g) ?? []).length, 1);
        text = text.replace(/(WSBASE\s+EQU\s+)\$([\dA-F]+)/, (_, a, h) => a + "$" + (parseInt(h, 16) - 0x2000).toString(16).toUpperCase());
      }
      writeFileSync(join(dir, basename(file).toUpperCase()), text, "latin1");
    }
    visit("rom.asm");
    const com = join(dir, "TAS.COM");
    writeFileSync(com, pinnedBytes(ROOT, "TAS.COM"));
    const result = await assemble({ dir, root: "ROM.ASM", out: "PRICE.BIN", com });
    assert.equal(result.code, 0, result.console);
    assert.ok(result.bytes && result.dbg, "diagnostic assembly produced no image");
    const config = readFileSync(join(dir, "CONFIG.ASM"), "latin1");
    const origin = parseInt(config.match(/WSBASE\s+EQU\s+\$([\dA-F]+)/)[1], 16);
    const { globals } = decodeImage(Buffer.from(result.dbg), Buffer.from(result.bytes), origin);
    const start = globals.get("RESET").value;
    const end = globals.get("CODEEND").value;
    assert.equal(start, 0xA000);
    const hash = createHash("sha256");
    for (const [file, source] of [...visited].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(file + "\0").update(source);
    console.log(JSON.stringify({ diagnosticOnly: true, sourceSha256: hash.digest("hex"), romBytes: end - start,
      normalOriginEnd: end + 0x2000, freeAtNormalOrigin: 0x10000 - end - 0x2000, tstates: result.tstates }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const names = process.argv.slice(2);
if (names.includes("--diagnostic-lower-origin")) {
  assert.deepEqual(names, ["--diagnostic-lower-origin"]);
  await diagnosticLowerOrigin();
} else {
  const patches = readdirSync(MODEL).filter((f) => f.endsWith(".patch") && (names.length === 0 || names.includes(basename(f, ".patch")))).sort();
  const row = (name, f) => console.log(`${name.padEnd(18)} ROM ${f.used} used, ${f.free} free, ${f.used - MAIN >= 0 ? "+" : ""}${f.used - MAIN} on main; TPA ${f.tpa}`);
  row("this tree", figures(null));
  for (const p of patches) row(basename(p, ".patch"), figures(join(MODEL, p)));
  const svc = await makeSvc(join(ROOT, "drivers/lcd.asm"), { work: join(ROOT, "build/svc") });
  console.log(`${"LCD.SVC".padEnd(18)} file ${svc.file.length} bytes, image ${svc.image}, ${Math.ceil(svc.image / 256)} pages`);
}
