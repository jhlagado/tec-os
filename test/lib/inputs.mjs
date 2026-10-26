// Application inputs that live outside this repository, pinned by SHA-256 in
// test/inputs.json. Each comes from its environment variable or its default
// path beside this repository. A file is pinned by its own hash; a directory
// by the hash of "sha256  path" lines for every file under its listed
// folders, sorted by path. A hash mismatch fails the test. A missing input
// skips it, or fails it when STRICT=1.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ROOT } from "./fixtures.mjs";

const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs;
export const STRICT = process.env.STRICT === "1";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** The hash a manifest entry pins for the file or directory at path. */
export function digest(entry, path) {
  if (!entry.tree) return sha256(readFileSync(path));
  const lines = entry.tree
    .flatMap((sub) => files(join(path, sub)))
    .map((f) => relative(path, f).split("\\").join("/"))
    .sort()
    .map((rel) => `${sha256(readFileSync(join(path, rel)))}  ${rel}\n`);
  return sha256(lines.join(""));
}

/**
 * The pinned input `name`: { path, skip, problem }. Pass `skip` to test()
 * and call check() first thing in the test body.
 */
export function pinned(name) {
  const entry = MANIFEST[name];
  if (!entry) throw new Error(`test/inputs.json has no input ${name}`);
  const path = process.env[entry.env] ?? resolve(ROOT, entry.default);
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
