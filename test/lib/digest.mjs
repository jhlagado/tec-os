// The hash a pinned input in test/inputs.json is checked by: a file by its own
// SHA-256; a directory by the SHA-256 of "sha256  path" lines for every file
// under its listed folders, sorted by path. tools/inputs.mjs and the tests
// share it, so a fetched input is checked as the tests check it.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

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

