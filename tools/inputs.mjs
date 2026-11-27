#!/usr/bin/env node
// Prepare missing pinned application files. Selected overrides and local files
// must validate. A stale legacy sibling is replaced only by a verified local pin.
// With --refresh, a local file in .inputs/ that isn't the pinned one, such as
// one left from an earlier pin, is moved aside as NAME.unpinned-HASH and the
// pinned file is fetched in its place. A link there, and an override in an
// environment variable, are still refused.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inputExists, inputsDir } from "./lib/pins.mjs";
import { digest } from "../test/lib/digest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = inputsDir(ROOT);
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const refresh = args.includes("--refresh");
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
  let temporary;
  try {
    const override = process.env[entry.env];
    const target = resolve(OUT, name);
    let local = inputExists(target);
    const pinned = (path) => existsSync(path) && digest(entry, path) === entry.sha256 && readFileSync(path).length === entry.bytes;
    if (refresh && override === undefined && local && lstatSync(target).isFile() && !pinned(target)) {
      const aside = `${target}.unpinned-${digest(entry, target).slice(0, 8)}`;
      renameSync(target, aside);
      console.log(`${name}: ${target} isn't the pinned file; moved aside as ${aside}`);
      local = false;
    }
    if (override !== undefined && !override) throw new Error(`${entry.env} is empty: unset it or select the pinned ${name}`);
    const selected = override !== undefined ? resolve(override) : local ? target : resolve(ROOT, entry.default);
    if (override !== undefined || local) {
      if (!existsSync(selected) || digest(entry, selected) !== entry.sha256 || readFileSync(selected).length !== entry.bytes) {
        throw new Error(`selected ${name} at ${selected} is missing or not pinned; no fallback${override === undefined ? " (npm run inputs -- --refresh replaces a file in .inputs/ left from another pin)" : ""}`);
      }
      console.log(`${name}: ${selected}, as pinned`);
      continue;
    }
    if (existsSync(selected) && digest(entry, selected) === entry.sha256 && readFileSync(selected).length === entry.bytes) {
      console.log(`${name}: ${selected}, as pinned`);
      continue;
    }
    if (!entry.repo || !entry.commit || !entry.path) throw new Error(`${name}: test/inputs.json gives no repo, commit and path`);
    if (entry.tree) throw new Error(`${name}: a directory input, which this tool doesn't build`);
    const work = fetched(name, entry);
    mkdirSync(OUT, { recursive: true });
    temporary = mkdtempSync(resolve(OUT, ".download-"));
    const download = resolve(temporary, name);
    writeFileSync(download, execFileSync("git", ["show", `${entry.commit}:${entry.path}`], { cwd: work, maxBuffer: 1 << 26 }));
    const got = digest(entry, download);
    if (got !== entry.sha256 || readFileSync(download).length !== entry.bytes) {
      throw new Error(`sha256 ${got}, pinned ${entry.sha256}: refused, nothing kept`);
    }
    renameSync(download, target);
    console.log(`${name}: fetched from ${entry.repo} ${entry.commit.slice(0, 7)} ${entry.path}, as pinned`);
  } catch (e) {
    failed += 1;
    console.error(`${name}: ${e.message.trim().split("\n")[0]}`);
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
