// Node wrapper around the shared machine: symbol maps come from files.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after } from "node:test";
import { resolve } from "node:path";
import { EXPAND1_WRITES, Machine, symbolsFromD8 } from "../../host/machine.mjs";
import { fontBytes } from "../../tools/lib/font.mjs";

Machine.font = fontBytes(resolve(import.meta.dirname, "../.."));

export { EXPAND1_WRITES, Machine, bootMachine } from "../../host/machine.mjs";

// Every test file that runs a machine: EXPAND 1 at 8000h-BCFFh is the block
// cache's, BE00h-BEFFh is free, and after cold boot's clear nothing but the
// cache writes the first or anything the second.
after(() => assert.deepEqual(EXPAND1_WRITES, [], "a write to EXPAND 1 below BD00h, not by the cache, or to BE00h-BEFFh, after cold boot's clear"));

export function loadSymbols(path) {
  return symbolsFromD8(JSON.parse(readFileSync(path, "utf8")));
}
