#!/usr/bin/env node
// Build the web page into web/dist/: bundle the script, copy the page, the ROM
// images with their label maps, and the starter recipe and files from dist/.
// Run after npm run build and npm run media.

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "web");
const OUT = resolve(WEB, "dist");
const PROFILES = ["tecos"]; // one image; the width is a driver on the card

rmSync(OUT, { recursive: true, force: true }); // nothing from an older build reaches the page
mkdirSync(resolve(OUT, "roms"), { recursive: true });
mkdirSync(resolve(OUT, "files"), { recursive: true });

await build({
  entryPoints: [resolve(WEB, "src/main.mjs")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: resolve(OUT, "app.js"),
  alias: { fs: resolve(WEB, "stub/fs.mjs") },
  minify: true,
  sourcemap: true,
  logLevel: "warning",
});

for (const f of ["index.html", "style.css"]) copyFileSync(resolve(WEB, f), resolve(OUT, f));
for (const p of PROFILES) {
  copyFileSync(resolve(ROOT, `dist/${p}.rom`), resolve(OUT, `roms/${p}.rom`));
  const d8 = JSON.parse(readFileSync(resolve(ROOT, `dist/${p}.d8.json`), "utf8"));
  const labels = d8.symbols
    .filter((s) => typeof (s.address ?? s.value) === "number")
    .map((s) => ({ name: s.name, address: s.address ?? s.value }));
  writeFileSync(resolve(OUT, `roms/${p}.symbols.json`), JSON.stringify(labels));
}
// The page's card is the starter with DEMO.COM (KD-170), under the name the page fetches.
copyFileSync(resolve(ROOT, "dist/page.recipe.json"), resolve(OUT, "starter.recipe.json"));
for (const f of readdirSync(resolve(ROOT, "dist/files"))) {
  copyFileSync(resolve(ROOT, "dist/files", f), resolve(OUT, "files", f));
}
console.log(`web/dist: page, ${PROFILES.length} ROMs, starter files`);
