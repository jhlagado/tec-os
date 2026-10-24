// Node wrapper around the shared machine: symbol maps come from files.

import { readFileSync } from "node:fs";
import { symbolsFromD8 } from "../../host/machine.mjs";

export { Machine, bootMachine } from "../../host/machine.mjs";

export function loadSymbols(path) {
  return symbolsFromD8(JSON.parse(readFileSync(path, "utf8")));
}
