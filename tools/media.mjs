#!/usr/bin/env node
// Produce the release set in dist/: ROM images and maps for every profile,
// the starter programs, a recipe that lists them with their digests, the
// starter card built from that recipe, and the memory map document.
//
// Run after npm run build.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleProgram } from "./lib/assemble.mjs";
import { makeDrv } from "./lib/drv.mjs";
import { buildRecipe, fileFetcher, saveImage } from "./tecvol.mjs";
import { PROFILES } from "./build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const FILES = resolve(DIST, "files");
const hex = (v, w = 4) => v.toString(16).toUpperCase().padStart(w, "0") + "h";
const sha = (b) => createHash("sha256").update(b).digest("hex");

const PROGRAMS = [
  { name: "TERM.COM", source: "test/programs/term.asm", description: "draws with the video terminal's ANSI subset" },
  { name: "PROBE.COM", source: "test/programs/probe.asm", description: "BDOS file-function probe" },
  { name: "DEMO.COM", source: "test/programs/demo.asm", description: "hardware services demonstration: LCD, digits, LEDs, PICO9918" },
  { name: "MOUNT.COM", source: "test/programs/mount.asm", description: "mounts a volume on a drive: MOUNT B: NAME, MOUNT B: INDEX, MOUNT B: to unmount" },
  { name: "VOLS.COM", source: "test/programs/vols.asm", description: "lists the card's volumes and the drives they are on" },
];

const README = `TEC-OS starter disk

COPY SOURCE DEST   copy a file (built in), for example COPY TERM.COM B:TERM.COM
TERM               draw on the video console; TERM S also scrolls
PROBE              exercise the BDOS file functions
DEMO               the LCD, digits, 8x8 LEDs and PICO9918; any key stops
EDIT NAME.TXT      full-screen editor, if present: ^S save, ^Q quit
VOLS               list the card's volumes
MOUNT B: NAME      put a volume on a drive; MOUNT B: takes it off

B: is an empty work disk, written behind: its changes reach the card when a
file is closed, at ^C and at MOUNT. Press ^C at A> before reset or power off.
`;

/** TEC-OS's fixed state in page zero, 0040h-004Fh, from the EQUs in src/layout.asm. */
function pageZeroState() {
  const src = readFileSync(resolve(ROOT, "src/layout.asm"), "utf8");
  return [...src.matchAll(/^(\w+)\s+EQU\s+\$(004[0-9A-F])\s*;\s*(.*)$/gm)]
    .map((m) => ({ at: parseInt(m[2], 16), name: m[1], what: m[3] }))
    .sort((x, y) => x.at - y.at)
    .map((r) => `| ${hex(r.at)} | \`${r.name}\` | ${r.what} |`)
    .join("\n");
}

/**
 * The ROM figures in docs/rom-services.md, from the debug80 build: each
 * "<!-- media: name -->...<!-- end -->" span is rewritten, so the figures
 * follow the ROM. The free space is one gap, from the end of the code to the
 * end of the ROM.
 */
function romServicesFigures(census) {
  const n = (v) => v.toLocaleString("en-US");
  const spans = {
    "rom-space": `It holds ${n(census.rom.used)} bytes (\`${census.profile}\`) and has ${n(census.rom.free)} free,\nin one gap after the code at the end of the ROM.`,
    "rom-free": n(census.rom.free),
  };
  const path = resolve(ROOT, "docs/rom-services.md");
  let text = readFileSync(path, "utf8");
  for (const [name, value] of Object.entries(spans)) {
    const re = new RegExp(`(<!-- media: ${name} -->)[\\s\\S]*?(<!-- end -->)`);
    if (!re.test(text)) throw new Error(`docs/rom-services.md has no ${name} span`);
    text = text.replace(re, (_, open, close) => `${open}${value}${close}`);
  }
  writeFileSync(path, text);
}

function memoryMap(census) {
  const rows = (list) => list.map((r) => `| ${hex(r.start)}–${hex(r.end - 1)} | ${r.bytes} | ${r.label} |`).join("\n");
  const s = census.ram.stacks;
  const symbols = JSON.parse(readFileSync(resolve(ROOT, `build/${census.profile}/tecos.d8.json`), "utf8")).symbols;
  const at = (name) => {
    const x = symbols.find((y) => y.name === name);
    return x.address ?? x.value;
  };
  const lines = at("NLINES");
  const span = (a, n, what) => `| ${hex(a)}–${hex(a + n - 1)} | ${n} | ${what} |`;
  const expand1 = [
    span(0x8000, lines * 512, `the block cache's ${lines} lines, 512 bytes each`),
    span(at("CTAB"), lines * 4, "each line's card block, 4 bytes, FFFFFFFFh while empty"),
    span(at("CDIRTY"), lines, "each line's dirty byte, nonzero while the card lacks its changes"),
    span(at("HRING"), 256, "command history"),
    span(at("LVBASE"), 256, "the CCP's levels"),
    span(0xbf00, 256, "reserved"),
  ].join("\n");
  const cacheState = [
    ["SDXB", "LATEXP while a card block goes to or from a cache line"],
    ["CNEXT", "the next line in turn"],
    ["CFAIL", "1 once a line's write has failed since the last warm boot"],
    ["CSKIP", "the line a flush leaves, the directory's"],
    ["CWTYPE", "BIOS WRITE's type, C"],
    ["CIFF", "2 bytes: the flags a BIOS entry found, its interrupt state in P/V"],
  ]
    .map(([n, what]) => `| ${hex(at(n))} | \`${n}\` | ${what} |`)
    .join("\n");
  return `# Memory map

Generated by \`tools/media.mjs\` from the \`${census.profile}\` build
(ROM SHA-256 \`${census.sha256}\`). Other profiles differ only where noted
in their build settings.

## CPU address space

| Addresses | Contents |
| --- | --- |
| 0000h–07FFh at reset | Boot overlay: ROM C000h–C7FFh |
| 0000h–00FFh | CP/M page zero; 0040h–004Fh TEC-OS fixed state |
| 0100h–${hex(census.ram.tpa.end - 1)} | Classic TPA, ${census.ram.tpa.bytes} bytes |
| ${hex(census.ram.bdosVector)}–BFFFh | BDOS entry jump and resident workspace in EXPAND 0 |
| 8000h–BFFFh | EXPAND 0 (classic workspace and TPA) or EXPAND 1 |
| C000h–FFFFh | TEC-OS ROM |

The word at 0006h is ${hex(census.ram.bdosVector)} on the starter card; cold boot sets it
for the volumes mounted, below their allocation vectors (four 8 MiB volumes
give ${hex(census.ram.cards.fourG8M.entry)}). The word at 0001h points into the RAM BIOS table at
${hex(census.ram.ramBios)}.

## ROM (${census.rom.used} of ${census.rom.bytes} bytes used, ${census.rom.free} free)

| Addresses | Bytes | Region |
| --- | ---: | --- |
${rows(census.rom.regions)}

## Page zero, 0040h–004Fh

CP/M leaves these bytes to the BIOS. TEC-OS keeps here the state that must
stay in view whatever EXPAND shows.

| Address | Name | Contents |
| --- | --- | --- |
${pageZeroState()}

## Classic resident RAM, starter card

| Addresses | Bytes | Region |
| --- | ---: | --- |
${rows(census.ram.regions)}

The block cache's state, in the SD, keyboard and GLCD state above:

| Address | Name | Contents |
| --- | --- | --- |
${cacheState}

## EXPAND 1

Cold boot clears it. Programs reach none of it: \`XMOVE\` and \`MOVE\` refuse
every byte of bank 1.

| Addresses | Bytes | Contents |
| --- | ---: | --- |
${expand1}

## Stacks

| Stack | Range | Bytes |
| --- | --- | ---: |
| Cold boot | below 8000h | — |
| BIOS (warm boot, diagnostics) | ${hex(s.bios.base)}–${hex(s.bios.top - 1)} | ${s.bios.bytes} |
| CCP | ${hex(s.ccp.base)}–${hex(s.ccp.top - 1)} | ${s.ccp.bytes} |
| BDOS | ${hex(s.bdos.base)}–${hex(s.bdos.top - 1)} | ${s.bdos.bytes} |

## Serial timing

Bit time ${census.serial.bitCycles.toFixed(1)} T-states at 4 MHz; transmit
loop ${census.serial.txBitCycles}, receive loop ${census.serial.rxBitCycles}.
`;
}

async function main() {
  mkdirSync(FILES, { recursive: true });
  const censuses = {};
  for (const profile of Object.keys(PROFILES)) {
    const dir = resolve(ROOT, "build", profile);
    copyFileSync(resolve(dir, "tecos.rom"), resolve(DIST, `tecos-${profile}.rom`));
    copyFileSync(resolve(dir, "tecos.d8.json"), resolve(DIST, `tecos-${profile}.d8.json`));
    copyFileSync(resolve(dir, "census.json"), resolve(DIST, `tecos-${profile}.census.json`));
    censuses[profile] = JSON.parse(readFileSync(resolve(dir, "census.json"), "utf8"));
  }
  const files = [];
  for (const p of PROGRAMS) {
    const { bytes } = await assembleProgram(resolve(ROOT, p.source), { base: p.base ?? 0x100 });
    writeFileSync(resolve(FILES, p.name), bytes);
    files.push({ ...p, bytes });
  }
  // The GLCD console's driver, and the startup file that loads it before the
  // first prompt. A board with no GLCD refuses it, and the prompt follows.
  const glcd = (await makeDrv(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/drv") })).file;
  writeFileSync(resolve(FILES, "GLCD.DRV"), glcd);
  files.push({ name: "GLCD.DRV", description: "the GLCD console, a driver", bytes: glcd });
  // Edit joins the card when a build that sizes itself to the TPA and the
  // display is available (configuration tag "ECFG" at 0103h).
  const editPath = process.env.EDIT_COM ?? resolve(ROOT, "../edit/dist/EDIT.COM");
  if (existsSync(editPath)) {
    const bytes = new Uint8Array(readFileSync(editPath));
    if (Buffer.from(bytes.subarray(3, 7)).toString("latin1") === "ECFG") {
      writeFileSync(resolve(FILES, "EDIT.COM"), bytes);
      files.push({ name: "EDIT.COM", description: "Edit, the full-screen editor: EDIT NAME.TXT, ^S save, ^Q quit", bytes });
    } else {
      console.log(`media: ${editPath} predates the screen configuration; Edit left off the card`);
    }
  }
  copyFileSync(resolve(ROOT, "src/abi.inc"), resolve(DIST, "abi.inc"));
  const readme = Buffer.from(README.replace(/\n/g, "\r\n") + "\x1a");
  writeFileSync(resolve(FILES, "README.TXT"), readme);
  files.push({ name: "README.TXT", description: "what is on this disk", bytes: readme });

  const recipe = {
    schema: "tecos-file-recipe-v1",
    id: "starter",
    revision: "2",
    name: "TEC-OS starter",
    instruction: "At A>, type DIR, then TERM or DEMO. B: is an empty work disk, written behind: press ^C at A> before reset or power off.",
    profile: "debug80",
    volumes: [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true },
    ],
    components: files.map((f) => ({
      id: f.name.toLowerCase().replace(/\W/g, "-"),
      name: f.name,
      description: f.description,
      files: [{ name: f.name, url: `files/${f.name}`, drive: "A", bytes: f.bytes.length, sha256: sha(f.bytes) }],
    })),
  };
  writeFileSync(resolve(DIST, "starter.recipe.json"), JSON.stringify(recipe, null, 2) + "\n");
  saveImage(resolve(DIST, "starter.img"), await buildRecipe(recipe, fileFetcher(DIST)));
  writeFileSync(resolve(ROOT, "docs/memory-map.md"), memoryMap(censuses.debug80));
  romServicesFigures(censuses.debug80);
  const manifest = Object.fromEntries(
    Object.entries(censuses).map(([k, c]) => [k, { sha256: c.sha256, romUsed: c.rom.used, tpaBytes: c.ram.tpa.bytes, nbanks: c.nbanks }]),
  );
  writeFileSync(resolve(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`dist: ${Object.keys(censuses).length} ROM profiles, ${files.length} starter files, starter.img`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
