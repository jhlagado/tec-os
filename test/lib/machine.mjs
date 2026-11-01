// Node wrapper around the shared machine: symbol maps come from files.

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { after, afterEach, beforeEach } from "node:test";
import { resolve } from "node:path";
import { EXPAND1_WRITES, Machine, symbolsFromD8 } from "../../host/machine.mjs";
import { fontBytes } from "../../tools/lib/font.mjs";

Machine.font = fontBytes(resolve(import.meta.dirname, "../.."));

export { EXPAND1_WRITES, Machine, bootMachine } from "../../host/machine.mjs";

// Every test file that runs a machine: EXPAND 1 at 8000h-BCFFh is the block
// cache's, BE00h-BEFFh is free, and after cold boot's clear nothing but the
// cache writes the first or anything the second.
after(() => assert.deepEqual(EXPAND1_WRITES, [], "a write to EXPAND 1 below BD00h, not by the cache, or to BE00h-BEFFh, after cold boot's clear"));

// Each such write is marked with the test it was made in. With TEST_TRACE set
// to a file, each test's start and end are appended to it, and each test that
// made such a write, one JSON line each, so that the mutant runner
// (tools/lib/mutants.mjs) can name the test in which a file was killed, or
// that the check above fails for.
const TRACE = process.env.TEST_TRACE;
const trace = (what, t) => TRACE && appendFileSync(TRACE, `${JSON.stringify({ what, file: process.argv[1], test: t.name })}\n`);
let writes = 0;
beforeEach((t) => {
  writes = EXPAND1_WRITES.length;
  trace("start", t);
});
afterEach((t) => {
  for (const w of EXPAND1_WRITES.slice(writes)) w.test = t.name;
  if (EXPAND1_WRITES.length > writes) trace("expand1", t);
  trace("end", t);
});

export function loadSymbols(path) {
  return symbolsFromD8(JSON.parse(readFileSync(path, "utf8")));
}
