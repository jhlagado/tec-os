// Shared application input resolution for assembly, media and tests.

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/** The folder `npm run inputs` fetches into, under the repository at ROOT. */
export const inputsDir = (root) => resolve(root, ".inputs");

/** Authoritative override, then prepared local input, then legacy sibling. */
export function candidates(root, name, entry) {
  const env = process.env[entry.env];
  if (env !== undefined) {
    if (!env) throw new Error(`${entry.env} is empty: unset it or select the pinned ${name}`);
    return [resolve(env)];
  }
  return [resolve(inputsDir(root), name), resolve(root, entry.default)];
}

/** The first of the candidates that exists, or the first if none does, for the message. */
export function located(root, name, entry) {
  const paths = candidates(root, name, entry);
  return paths.find((p) => existsSync(p)) ?? paths[0];
}

/** Read the selected application bytes once and require their recorded pin. */
export function pinnedBytes(root, name) {
  const entry = JSON.parse(readFileSync(resolve(root, "test/inputs.json"), "utf8")).inputs[name];
  if (!entry) throw new Error(`no input pin for ${name}`);
  const path = located(root, name, entry);
  if (!existsSync(path)) throw new Error(`no ${name} at ${path}: run npm run inputs or set ${entry.env}`);
  const bytes = readFileSync(path);
  const got = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== entry.bytes || got !== entry.sha256) {
    throw new Error(`${name} at ${path} has sha256 ${got}, pinned ${entry.sha256} (${entry.bytes} bytes)`);
  }
  return bytes;
}
