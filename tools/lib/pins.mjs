// Where a pinned input from test/inputs.json is looked for: its environment
// variable, then its default path beside this repository, then .inputs/, where
// `npm run inputs` fetches what a fresh clone lacks. A machine with the sibling
// checkouts never reaches .inputs/; a cloud session with none finds it there.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** The folder `npm run inputs` fetches into, under the repository at ROOT. */
export const inputsDir = (root) => resolve(root, ".inputs");

/** The paths to try for ENTRY, named NAME, in order: env, default, .inputs/NAME. */
export function candidates(root, name, entry) {
  const env = process.env[entry.env];
  if (env) return [resolve(env)];
  return [resolve(root, entry.default), resolve(inputsDir(root), name)];
}

/** The first of the candidates that exists, or the first if none does, for the message. */
export function located(root, name, entry) {
  const paths = candidates(root, name, entry);
  return paths.find((p) => existsSync(p)) ?? paths[0];
}
