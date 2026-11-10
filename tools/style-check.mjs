#!/usr/bin/env node
// Compact assembly checks (tools/lib/style-compact.mjs) on the ROM sources, the
// drivers and the diagnostics: src/ and its subfolders, drivers/, diag/ (the
// gen/ folders excluded), SAMPLE.ASM, DEMO.ASM and the diagnostics' MON3 stub. Prints
// each file's figures and, with --faults, each fault.
//
//   node tools/style-check.mjs [--json FILE] [--faults] [--strict] [FILE...]
//
// --strict exits 1 when any file breaks a rule; without it the run reports.
// Current rules and protected legacy profiles: docs/assembly-style.md.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCompactSource } from "./lib/style-compact.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const value = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

/** The sources the style covers, as paths from ROOT. */
export function sources(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(resolve(root, dir)).sort()) {
      const path = `${dir}/${name}`;
      if (path === "src/gen" || path === "diag/gen") continue;
      if (statSync(resolve(root, path)).isDirectory()) walk(path);
      else if (/\.(asm|inc)$/i.test(name)) out.push(path);
    }
  };
  walk("src");
  walk("drivers");
  walk("diag");
  out.push("programs/SAMPLE.ASM", "programs/DEMO.ASM", "test/programs/mon3stub.asm");
  return out;
}

const given = args.filter((a, i) => !a.startsWith("--") && !["--json"].includes(args[i - 1]));
const files = given.length ? given.map((f) => relative(ROOT, resolve(f))) : sources();
const entries = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-routines.json"), "utf8"));
const exceptions = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-exceptions.json"), "utf8"));
const results = files.map((f) => ({ file: f, ...checkCompactSource(readFileSync(resolve(ROOT, f), "latin1"), basename(f), entries[f], exceptions[f]) }));

const pad = (s, n) => String(s).padStart(n);
console.log(`${"file".padEnd(22)} ${pad("lines", 5)} ${pad("code", 5)} ${pad("comm%", 5)} ${pad("routines", 8)} ${pad("no hdr", 6)} ${pad("run", 4)} ${pad("bytes", 6)}  faults`);
for (const r of results) {
  const kinds = [...new Set(r.faults.map((f) => f.rule))].join(",");
  console.log(`${r.file.padEnd(22)} ${pad(r.lines, 5)} ${pad(r.codeLines, 5)} ${pad(Math.round(r.share * 100), 5)} ${pad(r.routines, 8)} ${pad(r.headless, 6)} ${pad(r.longestRun, 4)} ${pad(r.bytes, 6)}  ${kinds}`);
  if (flag("--faults")) for (const f of r.faults) console.log(`  ${r.file}:${f.line}: ${f.rule}: ${f.what}`);
}
const json = value("--json");
if (json) writeFileSync(json, JSON.stringify(results, null, 2) + "\n");
if (flag("--strict") && results.some((r) => r.faults.length)) process.exit(1);
