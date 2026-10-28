#!/usr/bin/env node
// Compare a diagnostics report from a board with the Debug80 model's run of
// the same image.
//
//   node tools/diag-check.mjs LOG [ROM]
//
// LOG is the terminal's session log; the last report in it is the one
// compared. ROM defaults to build/diag/diag.rom, whose image ID must match
// the report's. The model runs the automatic tests with a PICO9918, the
// matrix keyboard and a TEC-OS card, and no DS1302, and its report is kept
// in build/diag beside the image. Each line that differs is printed with
// the TEC-OS behaviour docs/board-run.md says it affects. The exit status
// is 0 with no differences, 1 with some and 2 when nothing can be compared.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Machine, symbolsFromD8 } from "../host/machine.mjs";
import { createContainer } from "./lib/container.mjs";
import { imageId } from "./diag.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const START = "==== TEC-1G DIAGNOSTICS REPORT ====";
const END = "==== END ====";
const LINE = /^T(\d\d) (.{7}) (PASS|FAIL|INFO|SKIP|LOOK|NONE)  (.*)$/;

/** The last report in a log: its image ID and its lines by test number. */
export function parseReport(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  const start = lines.lastIndexOf(START);
  if (start < 0) return null;
  let end = lines.indexOf(END, start);
  if (end < 0) end = lines.length;
  const id = /\bimage ([0-9A-F]{16})\b/.exec(lines[start + 1] ?? "")?.[1] ?? null;
  const tests = new Map();
  for (const line of lines.slice(start + 1, end)) {
    const m = LINE.exec(line);
    if (m) tests.set(Number(m[1]), { name: m[2].trim(), result: m[3], detail: m[4] });
  }
  return { id, tests, complete: end < lines.length };
}

/** What docs/board-run.md says each test's line affects, by test number. */
export function affects(markdown = readFileSync(resolve(ROOT, "docs/board-run.md"), "utf8")) {
  const table = new Map();
  for (const line of markdown.split("\n")) {
    const m = /^\| T(\d\d) \S+ \| .*? \| (.*?) \|$/.exec(line);
    if (m) table.set(Number(m[1]), m[2]);
  }
  return table;
}

/**
 * Compare a board's report with the model's. Returns the differences and
 * the tests the model's automatic run does not have, one line each. A visual
 * check the operator confirmed (PASS) matches the model's LOOK.
 */
export function compare(board, model, table = affects()) {
  const differences = [];
  const notCompared = [];
  const show = (t) => (t ? `${t.result} ${t.detail}` : "missing");
  const ids = [...new Set([...model.tests.keys(), ...board.tests.keys()])].sort((a, b) => a - b);
  for (const id of ids) {
    const b = board.tests.get(id);
    const m = model.tests.get(id);
    const tag = `T${String(id).padStart(2, "0")} ${(b ?? m).name}`;
    if (!m) {
      notCompared.push(`${tag}: ${show(b)}`);
      continue;
    }
    if (b && b.detail === m.detail && (b.result === m.result || (m.result === "LOOK" && b.result === "PASS"))) continue;
    differences.push(`${tag}: board ${show(b)} | model ${show(m)} | affects: ${table.get(id) ?? "not in docs/board-run.md"}`);
  }
  return { differences, notCompared };
}

/** The model's report for this image, run once and kept beside it. */
export function modelReport(romPath) {
  const rom = readFileSync(romPath);
  const id = Buffer.from(imageId(rom)).toString("hex").toUpperCase();
  const kept = resolve(dirname(romPath), `model-report-${id}.txt`);
  if (existsSync(kept)) return parseReport(readFileSync(kept, "utf8"));
  const symbols = symbolsFromD8(JSON.parse(readFileSync(romPath.replace(/\.rom$/, ".d8.json"), "utf8")));
  const card = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G8M", label: "WORK", mount: "B" },
  ]);
  const m = new Machine({ rom, symbols, sdImage: card, tms: true, matrix: true, ramFill: 0x76, rtc: false });
  let seen = -1;
  m.runUntil(
    () => {
      if (m.serial.length === seen) return false;
      seen = m.serial.length;
      return m.serialText().endsWith(`${END}\r\n`);
    },
    1_000_000_000,
    "the model's report",
  );
  const text = m.serialText();
  writeFileSync(kept, text);
  return parseReport(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [logPath, romArg] = process.argv.slice(2);
  if (!logPath) {
    console.error("usage: node tools/diag-check.mjs LOG [ROM]");
    process.exit(2);
  }
  const romPath = resolve(romArg ?? resolve(ROOT, "build/diag/diag.rom"));
  const board = parseReport(readFileSync(logPath, "latin1"));
  if (!board) {
    console.error(`${logPath}: no report (no "${START}" line)`);
    process.exit(2);
  }
  const id = Buffer.from(imageId(readFileSync(romPath))).toString("hex").toUpperCase();
  if (board.id !== id) {
    console.error(`image: the report's is ${board.id ?? "not given"}, ${romPath}'s is ${id}; build the image that ran`);
    process.exit(2);
  }
  const { differences, notCompared } = compare(board, modelReport(romPath));
  console.log(`image ${id}: ${board.tests.size} lines, ${differences.length} differences from the model`);
  if (!board.complete) console.log(`the report has no "${END}" line: it was cut short`);
  for (const line of differences) console.log(line);
  for (const line of notCompared) console.log(`not compared, no model run: ${line}`);
  process.exit(differences.length ? 1 : 0);
}
