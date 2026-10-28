// Node wrapper around the shared machine: symbol maps come from files.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after } from "node:test";
import { EXPAND1_WRITES, symbolsFromD8 } from "../../host/machine.mjs";

export { EXPAND1_WRITES, Machine, bootMachine } from "../../host/machine.mjs";

// Every test file that runs a machine: EXPAND 1 at 8000h-BCFFh is the
// block cache's, and nothing but the cache writes it after cold boot's clear.
after(() => assert.deepEqual(EXPAND1_WRITES, [], "a write to EXPAND 1 below BD00h, not by the cache, after cold boot's clear"));

export function loadSymbols(path) {
  return symbolsFromD8(JSON.parse(readFileSync(path, "utf8")));
}
