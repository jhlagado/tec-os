#!/usr/bin/env node
// Fetch the pinned inputs a fresh clone lacks. For each entry in
// test/inputs.json whose environment variable is unset and whose default path
// beside this repository is missing, it fetches that one commit of the entry's
// repository, shallowly, into a work clone under .inputs/.git-NAME, takes the
// file with git show into .inputs/NAME, and checks its SHA-256 as the tests
// do. A mismatch is refused: the file is removed and the run fails. Nothing is
// substituted. An entry already in .inputs/ with the right hash is kept.
//
// Each entry is one file in its repository at its commit; a directory entry,
// as older trees pinned for Triptych, is refused, since it would need a build.
//
//   npm run inputs [-- NAME ...]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { candidates, inputsDir } from "./lib/pins.mjs";
import { digest } from "../test/lib/digest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = inputsDir(ROOT);
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const inputs = JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs;

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "latin1", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });

/** A shallow work clone of REPO holding COMMIT, under .inputs/. */
function fetched(name, entry) {
  const work = resolve(OUT, `.git-${name.replace(/\W/g, "-")}`);
  if (!existsSync(resolve(work, ".git"))) {
    mkdirSync(work, { recursive: true });
    git(work, "init", "-q");
    git(work, "remote", "add", "origin", `https://github.com/${entry.repo}.git`);
  }
  git(work, "fetch", "-q", "--depth", "1", "origin", entry.commit);
  return work;
}

let failed = 0;
for (const [name, entry] of Object.entries(inputs)) {
  if (only.length && !only.includes(name)) continue;
  const [first, ...rest] = candidates(ROOT, name, entry);
  if (process.env[entry.env] || existsSync(first)) {
    console.log(`${name}: ${first}, not fetched`);
    continue;
  }
  const target = rest.at(-1);
  if (existsSync(target) && digest(entry, target) === entry.sha256) {
    console.log(`${name}: ${target}, as pinned`);
    continue;
  }
  if (!entry.repo || !entry.commit || !entry.path) throw new Error(`${name}: test/inputs.json gives no repo, commit and path`);
  if (entry.tree) throw new Error(`${name}: a directory input, which this tool doesn't build`);
  try {
    const work = fetched(name, entry);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(target, execFileSync("git", ["show", `${entry.commit}:${entry.path}`], { cwd: work, maxBuffer: 1 << 26 }));
    const got = digest(entry, target);
    if (got !== entry.sha256) {
      rmSync(target, { recursive: true, force: true });
      throw new Error(`sha256 ${got}, pinned ${entry.sha256}: refused, nothing kept`);
    }
    console.log(`${name}: fetched from ${entry.repo} ${entry.commit.slice(0, 7)} ${entry.path}, as pinned`);
  } catch (e) {
    failed += 1;
    console.error(`${name}: ${e.message.trim().split("\n")[0]}`);
  }
}
process.exit(failed ? 1 : 0);
