// Application inputs that live outside this repository, pinned by SHA-256 in
// test/inputs.json. Each comes from its environment variable, its default
// path beside this repository, or .inputs/, where `npm run inputs` fetches it
// from the repository and commit its entry names. A file is pinned by its own hash; a directory
// by the hash of "sha256  path" lines for every file under its listed
// folders, sorted by path. A hash mismatch fails the test. A missing input
// skips it, or fails it when STRICT=1.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./fixtures.mjs";
import { located } from "../../tools/lib/pins.mjs";
import { digest } from "./digest.mjs";

const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs;
export const STRICT = process.env.STRICT === "1";

export { digest };

/**
 * The pinned input `name`: { path, skip, problem }. Pass `skip` to test()
 * and call check() first thing in the test body.
 */
export function pinned(name) {
  const entry = MANIFEST[name];
  if (!entry) throw new Error(`test/inputs.json has no input ${name}`);
  const path = located(ROOT, name, entry);
  const found = existsSync(path) && (entry.tree ? statSync(path).isDirectory() : statSync(path).isFile());
  if (!found) {
    const why = `no ${name} at ${path} (set ${entry.env}, or STRICT=1 to fail)`;
    return STRICT ? { path, skip: false, problem: why } : { path, skip: why };
  }
  const got = digest(entry, path);
  const problem = got === entry.sha256 ? undefined : `${name} at ${path} has sha256 ${got}, pinned ${entry.sha256}`;
  return { path, skip: false, problem };
}

/** Fail the test when the input is missing under STRICT=1 or does not match its pin. */
export function check(input) {
  if (input.problem) throw new Error(input.problem);
}
