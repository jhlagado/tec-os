#!/usr/bin/env node
import { fontPackage } from "./lib/font-package.mjs";
// Produce the release set in dist/: the ROM image, its map and census,
// the card's programs, a recipe that lists them with their digests, the
// starter card built from that recipe, and the memory map document. The
// starter card is the one card: the Viewer runs it too.
//
// Run after npm run build.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleProgram } from "./lib/assemble.mjs";
import { displayFiles } from "./lib/starter.mjs";
import { buildRecipe, saveImage } from "./tecvol.mjs";
import { pinnedBytes as readPinnedBytes } from "./lib/pins.mjs";
import { PROFILES } from "./build.mjs";
import { pageZeroDeclarations } from "./lib/media-source.mjs";
import { tasAssembler, traceRom } from "./lib/tas-rom.mjs";
import { bounceSource } from "./lib/bounce-source.mjs";
import { compileBasic } from "./lib/games.mjs";

import { assembleDistributionCom, assembleGlcd, assembleMon3, assembleShell } from "./lib/tas-distribution.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const FILES = resolve(DIST, "files");
const hex = (v, w = 4) => v.toString(16).toUpperCase().padStart(w, "0") + "h";
const sha = (b) => createHash("sha256").update(b).digest("hex");

// Programs assembled from the tree onto the card: none, since SHELL.SVC's
// CD puts a volume on a drive and lists them.
const PROGRAMS = [];

// Every A: volume carries the core set, so the shell, the editor, the
// assembler and the debugger are there whichever volume is on A:, plus the
// files of its theme. B: is the WORK disk and C: a spare drive for any of them.
const CORE = ["STARTUP.CMD", "SHELL.SVC", "GLCD.SVC", "TED.COM", "TBUG.SVC", "TBUG.HLP", "TAS.COM"];
const THEMES = [
  { label: "SYSTEM", files: ["BAZA.COM", "BAZA.RTL", "BAZ.COM", "MON3.SVC", "SAMPLE.ASM", "TIMES.BAS"] },
  { label: "ASM", files: ["SAMPLE.ASM", "DEMO.ASM", "HELLO3.ASM"] },
  { label: "BASIC", files: ["BAZA.COM", "BAZA.RTL", "BAZ.COM", "TIMES.BAS", "BOUNCE.BAS", "CAVERNS.BAS", "CAVERNS.TXT"] },
  { label: "MON3", files: ["MON3.SVC", "SNAKE9.ASM", "SNAKE9.BIN", "HELLO3.ASM"] },
  { label: "GAMES", files: ["CAVERNS.COM", "CAVERNS.TXT", "BOUNCE.COM", "MON3.SVC", "SNAKE9.BIN"] },
];

/** The pinned NAME's bytes, which the card holds: a file missing or not as pinned is refused. */
function pinnedBytes(name) {
  return readPinnedBytes(ROOT, name);
}

/** TEC-OS's fixed state in page zero, 0040h-004Fh, from the EQUs in src/layout.asm. */
function pageZeroState() {
  const src = ["abi.inc", "layout.asm"].map(file => readFileSync(resolve(ROOT, "src", file), "utf8")).join("\n");
  return pageZeroDeclarations(src)
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
  return { path, text };
}

function memoryMap(census, symbols) {
  const rows = (list) => list.map((r) => `| ${hex(r.start)}–${hex(r.end - 1)} | ${r.bytes} | ${r.label} |`).join("\n");
  const s = census.ram.stacks;
  const starter = census.ram.cards.starter;
  const starterRegions = [
    { start: starter.entry, end: starter.entry + 3, bytes: 3, label: "BDOS entry jump, starter card" },
    { start: starter.alvBase, end: census.ram.fixedBase, bytes: census.ram.fixedBase - starter.alvBase, label: "allocation vectors, starter card" },
    ...census.ram.regions.slice(3),
  ].filter((region) => region.bytes);
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
    span(0xbd00, 768, "free, watched by the host so that a stray write fails"),
  ].join("\n");
  const cacheState = [
    ["SDXB", "LATEXP while a card block goes to or from a cache line"],
    ["CNEXT", "the next line in turn"],
    ["CWTYPE", "BIOS WRITE's type, C"],
    ["CIFF", "the flags a BIOS entry found, its interrupt state in P/V"],
    ["CANY", "nonzero when a data line may be held behind on the logged drive"],
    ["CPEND", "the pending block outside the logged drive: its line plus one, 0 for none"],
    ["HKCNT", "number of dirty first-dirty queue entries"],
    ["HKRPOS", "next position in the frozen eligibility round"],
    ["HKRLEN", "number of positions in the frozen round"],
    ["HKDEP", "logical outer/nested API depth"],
    ["HKBUSY", "private worker/report callback guard"],
    ["HKERR", "deferred or reported failed-write episode"],
  ]
    .map(([n, what]) => `| ${hex(at(n))} | \`${n}\` | ${what} |`)
    .join("\n");
  return `# Memory map

Generated by \`tools/media.mjs\` from the \`${census.profile}\` build
(ROM SHA-256 \`${census.sha256}\`), the one image for every board.

## CPU address space

| Addresses | Contents |
| --- | --- |
| 0000h–07FFh at reset | Boot overlay: ROM C000h–C7FFh |
| 0000h–00FFh | CP/M page zero; RST 1–5 (0008h–002Fh) programs', RST 6 (0030h) the debugger's, RST 7 (0038h) the interrupt vector, the only one a service may claim; 0040h the latch's shadow, 0041h–004Fh unused by TEC-OS, held by a MON3.SVC session |
| 0100h–${hex(starter.entry - 1)} | Bare starter TPA, ${starter.tpa} bytes |
| ${hex(starter.entry)}–BFFFh | BDOS entry jump and resident workspace in EXPAND 0 |
| 8000h–BFFFh | EXPAND 0 (classic workspace and TPA) or EXPAND 1 |
| C000h–FFFFh | TEC-OS ROM |

The word at 0006h is ${hex(starter.entry)} on the starter card; cold boot sets it
below three 256-byte allocation-vector slots, including the spare drive C:.
With the startup shell installed it is AE00h, leaving 44,288 bytes.
The two-volume reference card, with no drives field, instead has
${hex(census.ram.cards.twoVolume.entry)} and ${census.ram.cards.twoVolume.tpa} bytes bare. The word at 0001h points into the RAM BIOS table at
${hex(census.ram.ramBios)}.

## ROM (${census.rom.used} of ${census.rom.bytes} bytes used, ${census.rom.free} free)

| Addresses | Bytes | Region |
| --- | ---: | --- |
${rows(census.rom.regions)}

## Restart vectors, 0008h–003Fh

RST 1 to RST 5 are the running program's: it starts after a warm boot, with
them at their defaults, writes the ones it uses and saves nothing, and the
warm boot it ends with sweeps them. RST 6 is kept for the
debugger's breakpoints, and no one else's: \`BAZA.COM\` takes only RST 1 to
RST 5 while it compiles. RST 7 is the interrupt
vector, and the only one a service may claim (Origo KD-434). Every warm boot,
unload and failed \`INIT\` gives RST 1 to RST 6 seven zeros and a RET,
whatever they hold, and 0038h EI, RETI and zeros unless it holds a jump above
the top (\`docs/services.md\`).

## Page zero, 0040h–004Fh

CP/M leaves these bytes to the BIOS. TEC-OS keeps one here, the latch's
shadow, the only byte read while EXPAND 1 is in view; 0041h–004Fh are unused
by TEC-OS, cleared at cold boot, and the console's state is in the workspace.
A \`MON3.SVC\` session holds 0041h–004Fh while it runs, and gives them back at
\`EXIT\` or warm boot: the latch stub its restarts pass through, GO's return
and a \`RETN\` (\`docs/mon3.md\`).

| Address | Name | Contents |
| --- | --- | --- |
${pageZeroState()}

## Classic resident RAM, starter card

| Addresses | Bytes | Region |
| --- | ---: | --- |
${rows(starterRegions)}

The block cache and housekeeping state, in classic RAM above:

| Address | Name | Contents |
| --- | --- | --- |
${cacheState}

Housekeeping uses126 previously reserved bytes: two thirty-byte line-index
queues at \`${hex(at("HKQ"))}\` and \`${hex(at("HKROUND"))}\`, eight context
bytes, a two-byte guard and its56-byte private stack. The outer hardware/BIOS
return PC is the separate two-byte \`APIRTPC\` slot at \`${hex(at("APIRTPC"))}\`;
nested calls inherit that owner. These are internal workspace, not public ABI.

## EXPAND 1

Cold boot clears it. Programs reach none of it: no TEC-OS interface leaves
it in view. A program that puts it in view itself and ends without putting
EXPAND 0 back finds BF03h empty and runs on into the ROM at C000h; the ROM
tells that from a reset, since the overlay is off, and warm boots, so the
cache's lines are attempted as at any exit, retaining failed data for retry.

| Addresses | Bytes | Contents |
| --- | ---: | --- |
${expand1}

## Stacks

| Stack | Range | Bytes |
| --- | --- | ---: |
| Cold boot | below 8000h, then the BDOS's once the workspace is clear (KE-173) | — |
| BIOS (warm boot) | ${hex(s.bios.base)}–${hex(s.bios.top - 1)} | ${s.bios.bytes} |
| CCP | ${hex(s.ccp.base)}–${hex(s.ccp.top - 1)} | ${s.ccp.bytes} |
| BDOS (and cold boot's mount and DIAG) | ${hex(s.bdos.base)}–${hex(s.bdos.top - 1)} | ${s.bdos.bytes} |
| Housekeeping private worker | ${hex(s.worker.base)}–${hex(s.worker.top - 1)} | ${s.worker.bytes} |

The worker temporarily owns the physical stack for maintenance and notices;
logical BDOS nonreentrancy and console-hook restrictions still apply.

## Serial timing

Bit time ${census.serial.bitCycles.toFixed(1)} T-states at 4 MHz; transmit
loop ${census.serial.txBitCycles}, receive loop ${census.serial.rxBitCycles}.
`;
}

async function main() {
  const fontNotices = fontPackage(ROOT).notices;
  const builds = Object.keys(PROFILES).map(profile => {
    const dir = resolve(ROOT, "build", profile);
    const mapBytes = readFileSync(resolve(dir, "tecos.d8.json"));
    const map = JSON.parse(mapBytes);
    if (map.generator?.name !== "tas") throw new Error("main ROM map was not generated with tas; rebuild with npm run build");
    const rom = readFileSync(resolve(dir, "tecos.rom"));
    const censusBytes = readFileSync(resolve(dir, "census.json"));
    const census = JSON.parse(censusBytes);
    const sha256 = sha(rom);
    if (rom.length !== 0x4000 || census.rom.bytes !== rom.length || census.sha256 !== sha256) {
      throw new Error(`main ROM size or SHA-256 differs from the census for ${profile}`);
    }
    return { profile, dir, rom, mapBytes, censusBytes, census, sha256, mapDocument: memoryMap(census, map.symbols) };
  });
  const tas = pinnedBytes("TAS.COM");
  const ted = pinnedBytes("TED.COM");
  const baza = pinnedBytes("BAZA.COM");
  const rtl = pinnedBytes("BAZA.RTL");
  const run = await tasAssembler();
  const program = (name) => assembleDistributionCom(ROOT, run, name);
  const files = [];
  for (const p of PROGRAMS) {
    files.push({ ...p, bytes: await program(p.name) });
  }
  files.push(...await displayFiles(ROOT, { assembleGlcd: () => assembleGlcd(ROOT, run), assembleShell: () => assembleShell(ROOT, run) }));
  files.push({ name: "TED.COM", description: "TED, the editor: TED NAME.ASM or NAME.BAS, ^S save, ^Q quit, ^T B build, ^T R run", bytes: ted });
  // SAMPLE.ASM, a first program for TAS, and TIMES.BAS, a first program for
  // BAZA, as CP/M text files.
  const textAt = (path) => Buffer.from(readFileSync(resolve(ROOT, path), "utf8").replace(/\n/g, "\r\n") + "\x1a", "latin1");
  const text = (name) => textAt(`programs/${name}`);
  files.push({ name: "SAMPLE.ASM", description: "a first program to build: TAS SAMPLE, then SAMPLE", bytes: text("SAMPLE.ASM") });
  files.push({ name: "TIMES.BAS", description: "a first BASIC program: BAZA TIMES, then TIMES", bytes: text("TIMES.BAS") });
  files.push({ name: "TAS.COM", description: "TAS, the assembler: TAS NAME, NAME.ASM to NAME.COM and NAME.DBG", bytes: tas });
  files.push({ name: "BAZA.COM", description: "BAZA, the BASIC compiler: BAZA NAME, NAME.BAS to NAME.COM", bytes: baza });
  files.push({ name: "BAZ.COM", description: "BAZ, the BASIC interpreter, a preview: BAZ NAME.BAS runs it; a statement it doesn't run yet stops with NOT IMPLEMENTED", bytes: pinnedBytes("BAZ.COM") });
  files.push({ name: "BAZA.RTL", description: "BAZA's runtime library, which it copies into each program", bytes: rtl });
  // The pinned example's font access
  // is adapted to the glyph service
  // before conversion to CP/M text.
  const bounce = Buffer.from(bounceSource(ROOT).toString("latin1").replace(/\n/g, "\r\n") + "\x1a", "latin1");
  files.push({ name: "BOUNCE.BAS", description: "a BASIC game with sprites on the PICO9918: BAZA BOUNCE, then BOUNCE; W/A/S/D or the arrow keys steer, Q quits", bytes: bounce });
  files.push({ name: "CAVERNS.BAS", description: "Caverns source for BAZA: BAZA CAVERNS rebuilds the adventure; TED CAVERNS.BAS reads it", bytes: text("CAVERNS.BAS") });
  files.push({ name: "CAVERNS.TXT", description: "Playing Caverns and rebuilding it with BAZA", bytes: text("CAVERNS.TXT") });
  const abi = readFileSync(resolve(ROOT, "src/abi.inc"));
  const demo = await program("DEMO.COM");
  // DEMO.COM is built and checked here, but the card holds only its source:
  // TAS DEMO on the card makes it.
  files.push({ name: "DEMO.ASM", description: "a demonstration of the hardware, LCD, digits, LEDs and PICO9918, as source: TAS DEMO builds DEMO.COM, TED DEMO.ASM reads it", bytes: text("DEMO.ASM") });
  // Keep HELLO3 as source: TAS on the card builds its 4000h image before
  // MON3.SVC loads it. The monitor itself remains ready to enter.
  const mon3 = await assembleMon3(ROOT, run);
  files.push({ name: "MON3.SVC", description: "MON-3 programs on TEC-OS: MON3.SVC gives MON3>, where LOAD, GO and EXIT work", bytes: mon3 });
  files.push({ name: "HELLO3.ASM", description: "HELLO3's source: TAS HELLO3 HELLO3.BIN builds it, TED HELLO3.ASM reads it", bytes: textAt("test/programs/hello3.asm") });

  const snake = await assembleProgram(resolve(ROOT, "programs/SNAKE9.ASM"), { base: 0x4000 });
  files.push({ name: "SNAKE9.ASM", description: "Tutankhamen's Snake source: TAS SNAKE9 SNAKE9.BIN rebuilds the game", bytes: text("SNAKE9.ASM") });
  files.push({ name: "SNAKE9.BIN", description: "Tutankhamen's Snake on the 8×8 RGB matrix: MON3.SVC, LOAD SNAKE9.BIN, GO", bytes: snake.bytes });
  for (const name of ["TBUG.SVC", "TBUG.HLP"]) {
    const description = { "TBUG.SVC": "TBUG, the debugger on the LCD: TBUG.SVC NAME debugs NAME.COM, with labels from the NAME.TBG file TAS writes", "TBUG.HLP": "the help pages H shows in TBUG" }[name];
    files.push({ name, description, bytes: pinnedBytes(name) });
  }

  // The GAMES volume's finished programs, compiled by the pinned BAZA from
  // the sources on the BASIC volume, on this ROM.
  const tecos = builds.find(({ profile }) => profile === "tecos");
  const compiled = (name) => compileBasic({ rom: tecos.rom, map: JSON.parse(tecos.mapBytes), baza, rtl, name, source: files.find((f) => f.name === `${name}.BAS`).bytes });
  files.push({ name: "CAVERNS.COM", description: "Caverns, the adventure: CAVERNS to play; TYPE CAVERNS.TXT for instructions", bytes: compiled("CAVERNS") });
  files.push({ name: "BOUNCE.COM", description: "a game with sprites on the PICO9918: BOUNCE; W/A/S/D or the arrow keys steer, Q quits", bytes: compiled("BOUNCE") });

  // A recipe's revision rises when its set of files changes, not when a
  // pinned file's bytes change. It is above both the starter's and the
  // page's, the two recipes this one replaced.
  const recipe = {
    schema: "tecos-file-recipe-v1",
    id: "starter",
    revision: "23",
    name: "TEC-OS starter",
    instruction: "A: holds SYSTEM, the volume for the first chapters. CD ? lists the volumes; CD NAME puts one on the drive you are on and CD A:NAME on A: (CD A:ASM, CD A:BASIC, CD A:MON3 or CD A:GAMES), and CD A:SYSTEM brings this one back. Every A: volume has the shell, TED, GLCD.SVC and the TBUG debugger. B: (WORK) is your work disk: type B:, copy an example there (COPY A:SAMPLE.ASM B:) and build and run it there; programs come from A:. C: is a spare drive: CD C:NAME puts a volume on it. At A:SYSTEM>, TAS SAMPLE then SAMPLE builds and runs a first program, BAZA TIMES then TIMES one in BASIC, and TED SAMPLE.ASM or TED TIMES.BAS reads one. On GAMES, CAVERNS plays the adventure (TYPE CAVERNS.TXT for instructions), BOUNCE plays a game on the PICO9918 (tap W/A/S/D or the arrow keys, Q to quit), and MON3.SVC, LOAD SNAKE9.BIN, then GO plays Snake9; click the RGB panel for matrix arrow controls. On BASIC, BAZA CAVERNS and BAZA BOUNCE rebuild them. On ASM, TAS DEMO then DEMO shows the hardware (TED DEMO.ASM to read it). On MON3, TAS HELLO3 HELLO3.BIN, then MON3.SVC, LOAD HELLO3.BIN and GO runs a MON-3 program on the LCD; AD (Esc on the matrix) returns to MON3>, and EXIT to the prompt; TAS SNAKE9 SNAKE9.BIN rebuilds Snake9. Pending block writes get priority at OS calls and key waits. Acknowledged data stays in RAM for retry if its card write fails. Follow the program’s normal Save workflow and resolve write errors; browser saving is separate. Power off (Power cycle on the page) gives the card's own drives again.",
    profile: "tecos",
    drives: 3,
    volumes: [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
      ...THEMES.slice(1).map(({ label }) => ({ geometry: "G1M", label })),
    ],
    // One component for each file on each volume, placed by the volume's
    // label: the same bytes, under one URL, on every volume that holds them.
    components: THEMES.flatMap(({ label, files: theme }) => [...CORE, ...theme].map((name) => {
      const f = files.find((file) => file.name === name);
      if (!f) throw new Error(`${label}: no card file ${name}`);
      return {
        id: `${label}-${name}`.toLowerCase().replace(/\W/g, "-"),
        name: f.name,
        description: f.description,
        files: [{ name: f.name, url: `files/${f.name}`, drive: label, bytes: f.bytes.length, sha256: sha(f.bytes) }],
      };
    })),
  };
  const placed = new Set(recipe.components.map((c) => c.name));
  for (const f of files) if (!placed.has(f.name)) throw new Error(`${f.name} is on no volume`);
  const buffers = new Map(files.map(f => [`files/${f.name}`, f.bytes]));
  const starter = await buildRecipe(recipe, ref => buffers.get(ref));
  const figures = romServicesFigures(builds.find(({ profile }) => profile === "tecos").census);
  const manifest = Object.fromEntries(builds.map(({ profile, census: c }) =>
    [profile, { sha256: c.sha256, romUsed: c.rom.used, tpaBytes: c.ram.cards.starter.tpa }]));

  // Every assembly and recipe input has been checked before replacing files.
  rmSync(FILES, { recursive: true, force: true });
  mkdirSync(FILES, { recursive: true });
  for (const { dir, rom, mapBytes, censusBytes, sha256 } of builds) {
    writeFileSync(resolve(DIST, "tecos.rom"), rom);
    writeFileSync(resolve(DIST, "tecos.d8.json"), mapBytes);
    writeFileSync(resolve(DIST, "tecos.census.json"), censusBytes);
    traceRom({ backend: "tas", phase: "media", target: "tecos.rom", root: dir, sha256 });
  }
  for (const [ref, bytes] of buffers) writeFileSync(resolve(DIST, ref), bytes);
  writeFileSync(resolve(DIST, "DEMO.COM"), demo);
  writeFileSync(resolve(DIST, "MON3.SVC"), mon3);
  writeFileSync(resolve(DIST, "abi.inc"), abi);
  writeFileSync(resolve(DIST, "FONT-NOTICES.txt"), fontNotices);
  writeFileSync(resolve(DIST, "starter.recipe.json"), JSON.stringify(recipe, null, 2) + "\n");
  saveImage(resolve(DIST, "starter.img"), starter);
  // The page runs this card: an older build's page recipe goes.
  rmSync(resolve(DIST, "page.recipe.json"), { force: true });
  writeFileSync(resolve(ROOT, "docs/memory-map.md"), builds.find(({ profile }) => profile === "tecos").mapDocument);
  writeFileSync(figures.path, figures.text);
  writeFileSync(resolve(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`dist: ${builds.length} ROM profiles, ${files.length} card files, starter.img`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
