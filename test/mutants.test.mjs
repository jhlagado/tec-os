// The mutant harness credits a mutant's catch only to a test that passes on the
// tree unmutated (KE-162), and finds a mutant's text in the one source that
// holds it when its file has gone (KS38's moves). A tree of two files stands
// in for TEC-OS: a build that does nothing, and a test file with one test that
// always fails and one that only the mutant breaks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { mutate, text } from "../tools/lib/mutants.mjs";
import { ROOT } from "./lib/fixtures.mjs";

test("a test failing on the unmutated tree catches nothing, is named as not credited, and alone is an error (KE-162)", async () => {
  const dir = mkdtempSync(resolve(ROOT, "build/mutants-"));
  const tree = resolve(dir, "tree");
  for (const d of ["tools", "src", "test"]) mkdirSync(resolve(tree, d), { recursive: true });
  writeFileSync(resolve(tree, "tools/build.mjs"), "");
  writeFileSync(resolve(tree, "src/value.asm"), "GOOD\n");
  writeFileSync(
    resolve(tree, "test/x.test.mjs"),
    [
      'import { test } from "node:test";',
      'import { readFileSync } from "node:fs";',
      'test("always fails", () => { throw new Error("stale"); });',
      'test("reads GOOD", () => { if (!readFileSync(new URL("../src/value.asm", import.meta.url), "utf8").startsWith("GOOD")) throw new Error("changed"); });',
      "",
    ].join("\n"),
  );
  const got = await mutate(tree, resolve(dir, "work"), [
    { name: "the value changed", edits: [text("src/value.asm", "GOOD", "BAD")], tests: ["test/x.test.mjs"] },
    { name: "moved", edits: [text("src/old.asm", "GOOD", "BAD")], tests: ["test/x.test.mjs"] },
  ]);
  assert.deepEqual(got.mutants["the value changed"], { caught: true, by: ["reads GOOD"], notCredited: ["always fails"] });
  assert.equal(got.mutants.moved.caught, true, "a file gone since the set was written: the text found where it moved (KS38)");
  assert.deepEqual(got.mutantScore, { caught: 2, total: 2 });
  // A mutant whose only failures fail unmutated too is an error, named, not a quiet survivor.
  await assert.rejects(
    mutate(tree, resolve(dir, "work"), [{ name: "nothing changed", edits: [text("src/value.asm", "GOOD", "GOOD ")], tests: ["test/x.test.mjs"] }]),
    /mutant nothing changed: its tests \(test\/x\.test\.mjs\) fail on the unmutated tree, always fails/,
  );
  // And so is one whose tests all fail unmutated, whatever the mutant does.
  writeFileSync(resolve(tree, "test/y.test.mjs"), 'import { test } from "node:test";\ntest("stale", () => { throw new Error("stale"); });\n');
  await assert.rejects(mutate(tree, resolve(dir, "work"), [{ name: "no judge", edits: [text("src/value.asm", "GOOD", "BAD")], tests: ["test/y.test.mjs"] }]), /mutant no judge: no test of test\/y\.test\.mjs passes/);
  rmSync(dir, { recursive: true });
});
