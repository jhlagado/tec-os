// The web page's script, bundled as web/build.mjs bundles it, must not refer to
// Node's globals: a browser has no Buffer, process or require.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROOT } from "./lib/fixtures.mjs";

const NODE_GLOBALS = ["Buffer", "process", "global", "require", "module", "__dirname", "__filename", "setImmediate", "clearImmediate"];

test("the web page's bundle uses no Node globals", async () => {
  const out = await build({
    entryPoints: [resolve(ROOT, "web/src/main.mjs")],
    bundle: true,
    format: "esm",
    target: "es2022",
    outfile: resolve(ROOT, "web/dist/app.js"),
    alias: { fs: resolve(ROOT, "web/stub/fs.mjs") },
    minify: true,
    write: false,
    logLevel: "silent",
  });
  const js = out.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const found = NODE_GLOBALS.filter((name) => new RegExp(`(?<![.\\w$])${name}(?![\\w$])`).test(js));
  assert.deepEqual(found, [], `the bundle refers to ${found.join(", ")}`);
});
