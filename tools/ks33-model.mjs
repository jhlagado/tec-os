#!/usr/bin/env node
// KS33's model: the file type .SVC, measured on the prototype against the
// brief's baseline. Every figure "Gates to register" needs: the ROM census
// and its net cost; the memory figures; the four choices, each option built
// as a variant of the prototype's tree; the rename's counts against the list,
// with book/ excluded from both trees, since it left the product (KD-156);
// the .DRV mutant against each listed refusal test; old binaries; the card
// and the page; the contract account against abi.inc, the BDOS and the
// census; the docs' keep list and the findings' rows; media identity;
// TAS.COM; capture; and the shared font priced on each configuration.
//
//   node tools/ks33-model.mjs [--landed REV] [--reference REV] [--mutants]
//                             [--old-sets] [--sets-only] [--set NAME]
//                             [--old-set NAME] [--against FIGURES.json] [--out FILE]
//
// --landed is the tree measured, HEAD by default; --reference the baseline,
// 62d47ed. The trees are git archives in build/model-ks33/, each built with
// its release set, which needs the pinned EDIT.COM and TAS.COM (EDIT_COM,
// TAS_COM). --mutants runs every set on the landed tree; --old-sets reruns
// KS30 to KS32's sets at their own commits. --sets-only runs those two alone,
// and its figures are merged into the rest; --set and --old-set take one set
// at a time, so that a long run can yield the machine. A short account goes to stderr.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./lib/model.mjs";
import { CCP_OLD_TYPE, MUTANTS_FIXES, MUTANTS_KS30, MUTANTS_KS31, MUTANTS_KS32, MUTANTS_KS33, mutate } from "./lib/mutants.mjs";
import { against } from "./lib/against.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const WORK = resolve(M.ROOT, "build/model-ks33");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const CCP = "src/cpm/ccp.asm";
const HEADERS = ["drivers/pico.asm", "drivers/glcd.asm", "test/programs/svcdemo.asm", "test/programs/res.asm"];

// ---- The choices' variants ---------------------------------------------------

/** Each source's header bytes, magic and version, and the loader's word. */
function magic(dir, word, letter, version) {
  M.patch(dir, "src/svc.asm", "DMAGIC\tEQU\t$0344", `DMAGIC\tEQU\t${word}`);
  for (const f of HEADERS) M.patch(dir, f, "DB\t'D',3,", `DB\t'${letter}',${version},`);
  M.patch(dir, "tools/lib/svc-format.mjs", "FORMAT = 3", `FORMAT = ${version}`);
}

const MAGIC = {
  letterS: (dir) => magic(dir, "$0353", "S", 3),
  newVersion: (dir) => magic(dir, "$0444", "D", 4),
};

const LISTING = {
  MODULES: (dir) => M.patch(dir, "src/data3.asm", '"SERVICES",0', '"MODULES",0'),
  DRIVERS: (dir) => M.patch(dir, "src/data3.asm", '"SERVICES",0', '"DRIVERS",0'),
};

const TRANSITION = {
  /** The CCP installing .SVC and .DRV. */
  bothTypes(dir) {
    M.patch(
      dir,
      CCP,
      "        SBC     HL,DE\n        JR      NZ,CMDCOM\n        LD      A,(CMDFCB+11)\n        CP      'C'\n        JR      NZ,CMDCOM\n        CALL    SVCGO\n",
      "        SBC     HL,DE\n        LD      A,(CMDFCB+11)\n        JR      NZ,OLDTYP\n        CP      'C'\n        JR      Z,ISSVC\nOLDTYP: LD      HL,(CMDFCB+9)\n        LD      DE,'R'*256+'D'\n        OR      A\n        SBC     HL,DE\n        JR      NZ,CMDCOM\n        CP      'V'\n        JR      NZ,CMDCOM\nISSVC:  CALL    SVCGO\n",
    );
  },
};

/** The font in the ROM, last in the code, and each display driver reading it at the address FONTAT. */
function sharedFont(dir, fontAt) {
  cpSync(resolve(dir, "drivers/font.asm"), resolve(dir, "src/font.asm"));
  M.patch(dir, "src/rom.asm", '%INCLUDE "end.asm"', '%INCLUDE "font.asm"\n%INCLUDE "end.asm"');
  for (const f of ["drivers/pico.asm", "drivers/glcd.asm"]) M.patch(dir, f, '%INCLUDE "font.asm"\n', "");
  for (const f of ["drivers/pico.asm", "drivers/glcd.asm"]) M.patch(dir, f, "        ORG     $0100\n", `FONT    EQU     ${fontAt}\n        ORG     $0100\n`);
}

/** A copy of DIR changed by EDIT and built: its directory, or the build's refusal. */
async function variant(dir, name, edit, profiles = ["debug80"]) {
  const copy = M.copyTree(dir, WORK, `variant-${name}`);
  edit(copy);
  try {
    await M.build(copy, profiles);
    return { dir: copy, romUsed: M.rom(copy).census.rom.used };
  } catch (e) {
    return { refused: (/placement check failed:.*|error.*$/im.exec(e.message)?.[0] ?? "it failed").trim() };
  }
}

// ---- In a worker -----------------------------------------------------------

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

/** The card with its display files under the old type, STARTUP.CMD with them, as a card made before the rename. */
function oldCard(t, startup, version = 3) {
  const image = t.shipped();
  const a = t.fx.volume(image, "A");
  for (const n of ["PICO", "PICO40", "PICO32", "GLCD"]) {
    const f = a.read(`${n}.SVC`);
    a.erase(`${n}.SVC`);
    if (n === "PICO") f[1] = version;
    a.write(`${n}.DRV`, f);
  }
  a.write("STARTUP.CMD", t.fx.startupFile(...startup));
  return image;
}

/** What the rejected option does: the card's display files and lines renamed. */
function renameCard(t, image) {
  const a = t.fx.volume(image, "A");
  const display = /^(PICO(40|32)?|GLCD)\.DRV$/;
  for (const f of a.list().filter((x) => display.test(x.name))) {
    const b = a.read(f.name);
    a.erase(f.name);
    a.write(f.name.replace(".DRV", ".SVC"), b);
  }
  const text = Buffer.from(a.read("STARTUP.CMD")).toString("latin1").split("\x1a")[0];
  a.write("STARTUP.CMD", Buffer.from(`${text.split(/\r?\n/).map((l) => (display.test(l.trim()) ? l.replace(".DRV", ".SVC") : l)).join("\r\n")}\x1a`, "latin1"));
}

const OLD_CARDS = {
  aStarterOfFormat3: { startup: ["PICO.DRV", "GLCD.DRV"] },
  aStarterOfFormat2: { startup: ["PICO.DRV", "GLCD.DRV"], version: 2 },
  ownersOwnLine: { startup: ["PICO.DRV", "GLCD.DRV", "MY.DRV!DIR"] },
};

function oldCards(t) {
  const out = {};
  for (const [name, c] of Object.entries(OLD_CARDS)) {
    const run = (image) => {
      const m = t.machine(image, { tms: true, matrix: true, glcd: false });
      t.prompt(m, 0);
      return { console: m.read(m.sym("CONMOD")) !== 0 ? "the display" : "serial", head: m.read(m.sym("SVCHEAD")) !== 0, row3: t.row3(m), text: m.text(0).replace(/\r/g, "").split("\n").filter((l) => /\?$/.test(l)) };
    };
    const refused = oldCard(t, c.startup, c.version);
    const prep = t.card.prepareCard(refused, "tms", 80);
    const renamed = oldCard(t, c.startup, c.version);
    renameCard(t, renamed);
    out[name] = { refuse: { problem: prep.problem, changed: prep.changed, boot: run(refused) }, rename: { boot: run(renamed) } };
  }
  return out;
}

async function runTask(job) {
  const t = await M.inTree(job.dir);
  const { fx } = t;
  if (job.task === "rename") {
    const res = await fx.service("res");
    const image = t.shipped();
    const a = fx.volume(image, "A");
    a.write("RES.SVC", res);
    a.write("RES.DRV", res);
    const m = t.machine(image);
    t.prompt(m, 0);
    const drv = m.command("RES.DRV");
    const nothing = m.read(m.sym("SVCHEAD")) === 0;
    const svc = m.command("RES.SVC");
    const listed = m.command("SERVICES");
    const both = t.shipped();
    const n = t.machine(both, t.BOARDS?.both ?? { tms: true, matrix: true });
    t.prompt(n, 0);
    n.command("CON UC1");
    return {
      drvEcho: /RES\.DRV\?/.test(drv),
      drvLoadsNothing: nothing,
      svcInstalls: !/RES\.SVC\?/.test(svc) && m.read(m.sym("SVCHEAD")) !== 0,
      servicesLists: /RES \d/.test(listed),
      conUc1LoadsGlcdSvc: n.read(n.sym("CONMOD")) !== 0 && /UC1/.test(n.command("CON")),
    };
  }
  if (job.task === "card") {
    const stock = { pico: t.cold("pico80").out, glcd: t.cold("glcd").out };
    const chained = t.shipped();
    fx.volume(chained, "A").write("STARTUP.CMD", fx.startupFile("GLCD.SVC!PICO.SVC!VOLS", "DIR"));
    const prep = t.card.prepareCard(chained, "tms", 80);
    const line = Buffer.from(fx.volume(chained, "A").read("STARTUP.CMD")).toString("latin1").split("\x1a")[0];
    return { stock, chained: { prep, line }, oldCards: oldCards(t) };
  }
  if (job.task === "magic") {
    // A file from the kept format, renamed .SVC, on this option's ROM, and the page's reading of it.
    const image = t.shipped();
    fx.volume(image, "A").write("OLD.SVC", Uint8Array.from(job.old));
    const m = t.machine(image);
    t.prompt(m, 0);
    const text = m.command("OLD.SVC");
    const page = t.shipped();
    fx.volume(page, "A").write("PICO.SVC", Uint8Array.from(job.oldPico));
    return { oldFileLoads: !/OLD\.SVC\?/.test(text), pageSays: t.card.cardProblem(page, "tms", 80) };
  }
  if (job.task === "res") return [...(await fx.service("res"))];
  if (job.task === "both") {
    const image = t.shipped();
    fx.volume(image, "A").write("RES.DRV", await fx.service("res"));
    const m = t.machine(image);
    t.prompt(m, 0);
    m.command("RES.DRV");
    return { drvInstalls: m.read(m.sym("SVCHEAD")) !== 0 };
  }
  return null;
}

if (process.argv[2] === "--worker") {
  const job = JSON.parse(process.argv[3]);
  if (["rename", "card", "magic", "res", "both"].includes(job.task)) console.log(JSON.stringify(await runTask(job)));
  else await M.runWorker(job);
  process.exit(0);
}

// ---- The rename's counts -------------------------------------------------------

const walk = (dir, root = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", "build", "dist", "gen"].includes(e.name) || (e.name === "dist" && dir !== root)) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p, root) : [relative(root, p)];
  });
const HISTORICAL = (f) => /^test\/model\//.test(f) || /^test\/fixtures\/rom-/.test(f) || /^tools\/ks3[012]-model\.mjs$/.test(f);
const OWN = (f) => f === "tools/ks33-model.mjs" || f.startsWith("test/model/ks33/");
const text = (dir, f) => {
  const b = readFileSync(resolve(dir, f));
  return b.includes(0) ? "" : b.toString("utf8");
};

/** Tokens holding "drv" in DIR, book/ and this stage's own tool and record left out: { token: count }, and historical apart. */
function census(dir) {
  const live = {};
  const old = {};
  for (const f of walk(dir)) {
    if (f.startsWith("book/") || OWN(f)) continue;
    const into = HISTORICAL(f) ? old : live;
    for (const m of text(dir, f).matchAll(/[A-Za-z0-9_]*drv[A-Za-z0-9_]*/gi)) into[m[0]] = (into[m[0]] ?? 0) + 1;
  }
  return { live, old };
}

// In tools/lib alone, for old trees (D5): the old names and the alias drvlim. DRV is the kept .DRV of the keep list.
const EXPECTED = "DRV DRVLIM drvlim DRVBSY DRVCALL DRVHEAD DRVRC DRVSVC DRVSHUT DRVUNL drv".split(" ");
const STAY = "DRVTAB DRVIDX drvidx DRVSLOT DRVESZ DRVENT DRVDESC DRVMASK MAXDRV MNTDRV CURDRV DEFDRV BOOTDRV SELDRV BUFDRV RSDRV VRDRV drv2 ABIDRV".split(" ");

function names(landed, reference) {
  const l = census(landed);
  const r = census(reference);
  const stays = Object.fromEntries(STAY.map((k) => [k, [r.live[k] ?? 0, l.live[k] ?? 0]]));
  const moved = Object.entries(stays).filter(([, [a, b]]) => a !== b).map(([k, v]) => `${k}: ${v[0]} to ${v[1]}`);
  const left = Object.fromEntries(Object.entries(l.live).filter(([k]) => !STAY.includes(k) && !EXPECTED.includes(k)));
  return {
    bookExcluded: "book/ left the product (KD-156), so it is out of both trees' counts; the list's totals with it stand at the reference",
    stays,
    staysThatMoved: moved,
    historicalEqual: JSON.stringify(Object.entries(l.old).sort()) === JSON.stringify(Object.entries(r.old).sort()),
    historicalTokens: Object.values(l.old).reduce((a, n) => a + n, 0),
    unexpectedTokens: left,
    bootdrvNote: "BOOTDRV's one more is docs/services.md's sentence on a 127-character line, which the findings table asks for",
    renamedAtReference: Object.entries(r.live).filter(([k]) => !STAY.includes(k)).reduce((a, [, n]) => a + n, 0),
  };
}

const CLASSES = ["service", "record", "hardware service", "ROM table", "BDOS function"];

function serviceLines(landed) {
  const rows = readFileSync(resolve(landed, "test/model/ks33/service-lines.tsv"), "utf8").trim().split("\n").filter((l) => !l.startsWith("#")).map((l) => l.split("\t"));
  const by = Object.fromEntries(CLASSES.map((c) => [c, rows.filter((r) => r[1] === c).length]));
  return { lines: rows.length, byClass: by, everyLineClassed: rows.every((r) => CLASSES.includes(r[1])) };
}

// ---- The docs and the account ---------------------------------------------------

const KEEPS = [
  [/^test\/pico\.test\.mjs$/, "old-card tests"],
  [/^test\/svc\.test\.mjs$/, "the .DRV name's refusal"],
  [/^test\/clients\.test\.mjs$/, "the fixture's own name, 2d5ce25/PICO.DRV"],
  [/^test\/fixtures\//, "test/fixtures/"],
  [/^test\/model\/ks2/, "historical"],
  [/^tools\/ks3[01]-model\.mjs$/, "carried keys"],
  [/^tools\/lib\/(model|mutants)\.mjs$/, "carried keys and old trees' names"],
  [/^docs\/services\.md$/, "the format's history"],
  [/^docs\/board-run\.md$/, "T16's record"],
  [/^docs\/compatibility\.md$/, "what a .DRV name does"],
  [/^host\/card\.mjs$/, "the old-card refusal"],
  [/^tools\/media\.mjs$/, "README.TXT's update note"],
];

function docs(landed) {
  const hits = {};
  for (const f of walk(landed)) {
    if (OWN(f)) continue;
    const n = (text(landed, f).match(/\.DRV\b/g) ?? []).length;
    if (n) hits[f] = n;
  }
  const outside = Object.keys(hits).filter((f) => !KEEPS.some(([re]) => re.test(f)));
  const has = (f, re) => re.test(text(landed, f));
  const rows = {
    "bios.asm header": !has("src/bios.asm", /warm boot\n; copies it/),
    "development ids": !has("src/bios.asm", /KS18/) && !has("src/svc.asm", /KE-127/) && !has("test/lib/warmboot.mjs", /KS18/) && !has("test/warmboot.test.mjs", /KS18/),
    "data.asm header": has("src/data.asm", /only that copy runs/),
    "BCONOUT": has("src/console.asm", /serial port or the video terminal/),
    "reader and punch": has("src/console.asm", /BREADER waits for a byte/),
    "the scan's reason": !has("src/console.asm", /start bit is never/),
    "error 28h": !has("src/vol.asm", /duplicate ids/),
    "SHOWVOL": has("src/vol.asm", /drives: letter and label\./),
    "the NMI frame": has("src/layout.asm", /No NMI frame/),
    "say.asm": !has("test/programs/say.asm", /must relocate/),
    "container-format RAM cost": has("docs/container-format.md", /`DPHTAB` is a fixed 64 bytes/),
    "console.md 7Fh to FFh": has("docs/console.md", /drops output bytes 7Fh to\s+FFh/),
    "board-run T26 and step 3": !has("docs/board-run.md", /answers an NMI with RETN/) && !has("docs/board-run.md", /A reset with TEC-OS in RAM keeps/),
    "T01's timing": has("diag/boot.asm", /about 6\.8 s/) && has("docs/diagnostics.md", /about every 6\.8 s/),
    "diagnostics' first person": !has("docs/diagnostics.md", /\bI (wrote|checked)\b/),
    "CFLALL": has("docs/recovery.md", /A flush stops at the\s+first line/),
    "^S": has("docs/compatibility.md", /\*\*`\^S`\.\*\*/),
    "[more]": has("docs/compatibility.md", /AND DFh/),
    "function 50's AF'": has("docs/compatibility.md", /destroys AF'/),
    "the missing keys": has("docs/console.md", /gives no `\]`/),
    "startup's $": has("docs/services.md", /a `\$` in it ends the echo/),
    "a gap list from 0": has("docs/services.md", /first gap is 0/),
    "a 127-character line": has("docs/services.md", /lands on\s+`BOOTDRV`/),
  };
  return { hits, keeps: KEEPS.map(([, why]) => why), outsideKeeps: outside, findings: rows, findingsDone: Object.values(rows).every(Boolean) };
}

/** The rows of rom-services.md's table against each source file's span, and the census. */
function romTable(landed) {
  const { census: c, symbols } = M.rom(landed);
  const rows = text(landed, "docs/rom-services.md").match(/^\| [^|]+ \| [\d,]+ \| [\d, ]+ \| [^|]+ \|$/gm) ?? [];
  const bytes = rows.map((r) => Number(r.split("|")[2].replace(/[ ,]/g, "")));
  const sum = bytes.reduce((a, n) => a + n, 0);
  const d8 = JSON.parse(readFileSync(resolve(landed, "build/debug80/tecos.d8.json"), "utf8"));
  const first = new Map();
  for (const s of d8.symbols) if (s.kind === "label" && s.address >= 0xc000 && !(first.get(s.file) <= s.address)) first.set(s.file, s.address);
  const spans = [...first.entries()].sort((a, b) => a[1] - b[1]);
  const end = symbols.get("CODEEND");
  const span = Object.fromEntries(spans.map(([f, at], i) => [f, (spans[i + 1]?.[1] ?? end) - at]));
  const expected = [span["reset.asm"] + span["abi.asm"], c.rom.regions.find((g) => g.label === "data").bytes, span["boot.asm"], span["bios.asm"], span["console.asm"], span["term.asm"], span["video.asm"], span["tms.asm"], span["lcd.asm"], span["sd.asm"], span["vol.asm"], span["diag.asm"], span["cpm/ccp.asm"], span["cpm/bdos.asm"], span["hwsvc.asm"], span["xmove.asm"], span["glcd.asm"], span["cache.asm"], span["history.asm"], span["prl.asm"], span["svc.asm"]];
  return { rows: bytes.length, sum, used: c.rom.used, sumsToCensus: sum === c.rom.used, eachRowItsSpan: JSON.stringify(bytes) === JSON.stringify(expected) };
}

function contracts(landed) {
  const abi = Object.fromEntries([...text(landed, "src/abi.inc").matchAll(/^(\w+)\s+EQU\s+(\$?\w+)/gm)].map((m) => [m[1], m[2]]));
  const account = text(landed, "docs/compatibility.md");
  const table = [...account.matchAll(/^\| `(C0[0-9A-F]{2})h` \| `(\w+)` \|/gm)].map((m) => [m[2], m[1]]);
  const tableAgrees = table.length === 9 && table.every(([n, at]) => abi[n] === `$${at}`);
  const { symbols, census: c } = M.rom(landed);
  const bdos = text(landed, "src/cpm/bdos.asm");
  const functions = /Functions 0 to 40, 47, 50 and 108/.test(account) && /CP\s+108/.test(bdos) && /CP\s+41\n\s+JR\s+NC,RETZERO/.test(bdos) && /CP\s+47/.test(bdos) && /CP\s+50/.test(bdos);
  const format = /DMAGIC\s+EQU\s+\$0344/.test(text(landed, "src/svc.asm")) && /Format 3, the magic 0344h/.test(account);
  const tpa = account.includes(c.ram.tpa.bytes.toLocaleString("en-US"));
  return { tableEntries: table.length, tableAgrees, hardwareServices: [abi.HWBASE, abi.HWCOUNT], functions, format, tpa, tableEnd: symbols.get("ABIEND").toString(16), aliasInAbiInc: abi.ABIDRV === "ABISVC", romTable: romTable(landed) };
}

// ---- The .DRV mutant against each listed refusal test -----------------------------

const REFUSALS = [
  ["test/clients.test.mjs", "a 2d5ce25 PICO.SVC is refused in INIT"],
  ["test/svc.test.mjs", "NAME.SVC installs, from a drive too"],
  ["test/glcd.test.mjs", "a second GLCD.SVC is refused whole"],
  ["test/pico.test.mjs", "a board with both displays keeps the PICO9918"],
  ["test/pico.test.mjs", "STDONE returns carry through LCDROW"],
  ["test/pico.test.mjs", "a board whose PICO.SVC fails takes the GLCD"],
  ["test/pico.test.mjs", "PICO.SVC is refused with no PICO9918"],
  ["test/pico.test.mjs", "a refused record under a claim"],
  ["test/pico.test.mjs", "row 3: a failed load by hand"],
  ["test/startup.test.mjs", "a machine with .* refuses GLCD.SVC"],
];

async function drvMutant(landed) {
  const copy = M.copyTree(landed, WORK, "mutant-drv");
  for (const e of CCP_OLD_TYPE) M.patch(copy, e.file, e.from, e.to);
  await M.build(copy);
  const out = {};
  for (const [file, title] of REFUSALS) {
    const passes = await M.node(copy, ["--test", `--test-name-pattern=${title}`, file]).then(
      () => true,
      () => false,
    );
    out[title] = passes ? "passed: not caught" : "failed";
  }
  return { tests: out, everyOneFails: Object.values(out).every((v) => v === "failed") };
}

// ---- The fonts ---------------------------------------------------------------

async function fonts(landed, tpa, cold) {
  // Two builds: the first gives the font's address, which the drivers' source then names.
  const first = await variant(landed, "font", (d) => sharedFont(d, 1));
  if (first.refused) return { refused: first.refused };
  const at = M.rom(first.dir).symbols.get("FONT");
  M.patch(first.dir, "drivers/pico.asm", "FONT    EQU     1\n", `FONT    EQU     ${at}\n`);
  M.patch(first.dir, "drivers/glcd.asm", "FONT    EQU     1\n", `FONT    EQU     ${at}\n`);
  await M.build(first.dir);
  await M.media(first.dir);
  const [tpaF, coldF] = await Promise.all([M.tpaTable(SCRIPT, first.dir), M.bootTable(SCRIPT, first.dir, "cold", ["serial", "pico80", "glcd", "bothDisplays"])]);
  const r = M.rom(first.dir).census.rom;
  const files = (d) => Object.fromEntries(["PICO.SVC", "GLCD.SVC"].map((n) => [n, statSync(resolve(d, "dist/files", n)).size]));
  const pick = (b) => ({ seconds: b.seconds, sdReads: b.sdReads, warmBoot: b.warmBoot?.seconds });
  const row = (t, c) => ({ tpa: t, cold: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, pick(v)])) });
  return {
    note: "Measured, not moved (C6, KD-136). ABI entry's 2 bytes and the new format version are added by hand: the variant reads the font at a fixed address.",
    present: { rom: M.rom(landed).census.rom.used, files: files(landed), ...row(tpa, cold) },
    shared: { rom: r.used, romWithAbiEntry: r.used + 2, free: r.free - 2, files: files(first.dir), ...row(tpaF, coldF) },
  };
}

// ---- The rest ------------------------------------------------------------------

/** A test file in DIR under STRICT: its pass and fail counts. */
async function suiteFile(dir, files) {
  const out = await M.node(dir, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], { env: { STRICT: "1" } }).catch((e) => e.message);
  const n = (k) => Number(new RegExp(`^# ${k} (\\d+)`, "m").exec(out)?.[1]);
  return { pass: n("pass"), fail: n("fail"), skipped: n("skipped") };
}

function media(landed, reference, recipeName = "dist/starter.recipe.json") {
  const diag = (d) => {
    execFileSync(process.execPath, ["tools/diag.mjs"], { cwd: d, stdio: "pipe" });
    return sha256(readFileSync(resolve(d, "build/diag/diag.rom")));
  };
  const recipe = JSON.parse(readFileSync(resolve(landed, recipeName), "utf8"));
  const syms = (d) => {
    const s = M.rom(d).symbols;
    return { BENTRY: s.get("BENTRY").toString(16), STUBAD: s.get("STUBAD").toString(16) };
  };
  return {
    diagnostics: { landed: diag(landed), reference: diag(reference) },
    starterImage: sha256(readFileSync(resolve(landed, "dist/starter.img"))),
    recipe: sha256(readFileSync(resolve(landed, recipeName))),
    revision: recipe.revision,
    files: Object.fromEntries(recipe.components.flatMap((c) => c.files.map((f) => [f.name, f.sha256]))),
    filesSvcOnly: !readdirSync(resolve(landed, "dist/files")).some((f) => /\.DRV$/.test(f)),
    resetIdentity: { rule: "the same test: page zero's jumps and the stub at STUBAD jumping to BENTRY", landed: syms(landed), reference: syms(reference) },
  };
}

function capture(dir) {
  const out = execFileSync(process.execPath, ["tools/capture.mjs", "TYPE STARTUP.CMD"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return { bookGone: !existsSync(resolve(dir, "book")), runs: /PICO\.SVC/.test(out) };
}

const LANDED = M.arg("--landed", "HEAD");
const REFERENCE = M.arg("--reference", "62d47ed");
const OLD_SETS = [
  [MUTANTS_KS30, "ks30", M.arg("--ks30", "dbdce5c")],
  [MUTANTS_KS31, "ks31", M.arg("--ks31", "98c6416")],
  [MUTANTS_KS32, "ks32", M.arg("--ks32", "08da4d6")],
];

async function choices(landed) {
  const measured = async (table, prototype) => {
    const base = M.rom(landed).census.rom.used;
    const out = { [prototype]: { romUsed: base, romOverPrototype: 0 } };
    for (const [name, edit] of Object.entries(table)) {
      const v = await variant(landed, name, edit);
      out[name] = v.refused ? { refused: v.refused } : { dir: v.dir, romUsed: v.romUsed, romOverPrototype: v.romUsed - base };
    }
    return out;
  };
  const oldPico = [...readFileSync(resolve(landed, "dist/files/PICO.SVC"))];
  const old = await M.worker(SCRIPT, { task: "res", dir: landed });
  const mag = await measured(MAGIC, "kept0344h");
  mag.kept0344h.onThisRom = await M.worker(SCRIPT, { task: "magic", dir: landed, old, oldPico });
  for (const k of Object.keys(MAGIC)) {
    if (!mag[k].dir) continue;
    await M.build(mag[k].dir);
    await M.media(mag[k].dir);
    mag[k].onThisRom = await M.worker(SCRIPT, { task: "magic", dir: mag[k].dir, old, oldPico });
  }
  const listing = await measured(LISTING, "SERVICES");
  const transition = await measured(TRANSITION, "svcAlone");
  await M.build(transition.bothTypes.dir);
  await M.media(transition.bothTypes.dir);
  transition.bothTypes.run = await M.worker(SCRIPT, { task: "both", dir: transition.bothTypes.dir });
  const strip = (o) => Object.fromEntries(Object.entries(o).map(([k, { dir, ...v }]) => [k, v]));
  const card = await M.worker(SCRIPT, { task: "card", dir: landed });
  const cardSrc = text(landed, "host/card.mjs");
  return {
    magic: { options: strip(mag), settled: "0344h kept: no ROM byte in any option, and only it lets an old format 3 file renamed .SVC load, as KD-144 keeps the layout. 0353h passes the page's byte 1 check and is then refused by the ROM; a new version is refused by both" },
    listing: { options: strip(listing), settled: "SERVICES: the rule's name under design 3, 1 ROM byte over MODULES; DRIVERS would be a stated exception" },
    oldCards: { refuse: { sourceLines: cardSrc.split("\n").filter((l) => /OLD_DISPLAY|if \(old\)/.test(l)).length }, rename: { sourceLines: renameCard.toString().split("\n").length }, cards: card.oldCards, settled: "refused through cardProblem: 3 source lines, the card left as its owner made it. Renaming takes 11 lines, works only for format 3, and leaves an owner's own .DRV line printing its name" },
    transition: { options: strip(transition), settled: `.SVC alone: bothTypes costs ${transition.bothTypes.romOverPrototype} bytes and KD-144 says the rename lands once` },
    card,
  };
}

function account(f) {
  const p = [];
  p.push(`KS33 model: prototype ${f.prototype.slice(0, 7)} against ${f.baseline}`);
  p.push(`ROM ${f.rom.used} used, ${f.rom.free} free (reference ${f.rom.reference.used}/${f.rom.reference.free}), net ${-f.rom.saving}, reconciled ${f.rom.reconciled}, contiguous ${f.rom.contiguous}, one image ${f.rom.oneImage}, ${f.rom.sha256.slice(0, 16)}`);
  p.push(`TPA ${f.tpa.prototype.starter.serial} (${f.tpa.reference.starter.serial}); stacks ${JSON.stringify(f.stacks.prototype)} (${JSON.stringify(f.stacks.reference)})`);
  for (const k of ["magic", "listing", "transition"]) p.push(`choice ${k}: ${JSON.stringify(f.choices[k].options).slice(0, 300)}`);
  p.push(`names: stays moved ${JSON.stringify(f.names.staysThatMoved)}, unexpected ${JSON.stringify(f.names.unexpectedTokens)}, historical equal ${f.names.historicalEqual}`);
  p.push(`service lines ${f.serviceLines.lines}, ${JSON.stringify(f.serviceLines.byClass)}`);
  p.push(`.DRV outside keeps ${JSON.stringify(f.docs.outsideKeeps)}; findings done ${f.docs.findingsDone}; ${JSON.stringify(Object.entries(f.docs.findings).filter(([, v]) => !v))}`);
  p.push(`contracts ${JSON.stringify(f.contracts)}`);
  p.push(`.DRV mutant every one fails ${f.drvMutant.everyOneFails} ${JSON.stringify(f.drvMutant.tests)}`);
  p.push(`rename ${JSON.stringify(f.rename)}`);
  p.push(`media ${JSON.stringify({ ...f.media, files: undefined })}`);
  p.push(`book ${JSON.stringify(f.book)}; reproducible ${f.reproducible.equal}`);
  p.push(`tests ${JSON.stringify(f.tests)}`);
  p.push(`fonts ${JSON.stringify(f.fonts).slice(0, 600)}`);
  if (f.mutantScore) p.push(`mutants ${f.mutantScore.caught} of ${f.mutantScore.total} caught`);
  return p.join("\n") + "\n";
}

/** The mutant sets: every set on the landed tree, and KS30 to KS32's on their own commits. */
async function sets(landed) {
  const out = {};
  if (process.argv.includes("--mutants")) {
    const all = { ks30: MUTANTS_KS30, ks31: MUTANTS_KS31, ks32: MUTANTS_KS32, fixes: MUTANTS_FIXES, ks33: MUTANTS_KS33 };
    const only = M.arg("--set");
    Object.assign(out, await mutate(landed, WORK, only ? all[only] : Object.values(all).flat()));
  }
  if (process.argv.includes("--old-sets")) {
    out.oldSets = {};
    for (const [set, name, rev] of OLD_SETS.filter(([, n]) => [undefined, n].includes(M.arg("--old-set")))) {
      const dir = await M.prepared(WORK, name, rev).catch((e) => ({ refused: e.message.slice(0, 300) }));
      out.oldSets[name] = typeof dir === "string" ? { rev, ...(await mutate(dir, WORK, set)).mutantScore } : { rev, ...dir };
    }
  }
  return out;
}

async function main() {
  const t0 = Date.now();
  if (process.argv.includes("--sets-only")) {
    const got = await sets(await M.prepared(WORK, "landed", LANDED));
    writeFileSync(M.arg("--out"), JSON.stringify({ prototype: M.commit(LANDED), ...got }, null, 2) + "\n");
    M.log(`${got.mutantScore ? `mutants ${got.mutantScore.caught} of ${got.mutantScore.total} caught; ` : ""}${JSON.stringify(got.oldSets)}; done in ${Math.round((Date.now() - t0) / 1000)} s`);
    return;
  }
  const [landed, reference] = await Promise.all([M.prepared(WORK, "landed", LANDED), M.prepared(WORK, "reference", REFERENCE)]);
  M.log("measuring");
  const [tpaL, tpaR, coldL, coldR, censusL, censusR, watch, rename] = await Promise.all([
    M.tpaTable(SCRIPT, landed),
    M.tpaTable(SCRIPT, reference),
    M.bootTable(SCRIPT, landed, "cold", ["serial", "pico80", "glcd", "bothDisplays"]),
    M.bootTable(SCRIPT, reference, "cold", ["serial"]),
    M.stackCensus(landed),
    M.stackCensus(reference),
    M.worker(SCRIPT, { task: "watch", dir: landed }),
    M.worker(SCRIPT, { task: "rename", dir: landed }),
  ]);
  const figures = {
    ...M.heading(REFERENCE, landed, LANDED),
    recommended: { magic: "kept0344h", listing: "SERVICES", oldCards: "refuse", transition: "svcAlone" },
    rom: M.romSection(landed, reference),
    tpa: { prototype: tpaL, reference: tpaR },
    resident: M.residentSection(landed, reference, watch),
    stacks: M.stackFigures(censusL, censusR, landed, M.svclim(landed)),
    rename,
    names: names(landed, reference),
    serviceLines: serviceLines(landed),
    docs: docs(landed),
    contracts: contracts(landed),
    choices: await choices(landed),
    drvMutant: await drvMutant(landed),
    media: media(landed, reference),
    book: capture(landed),
    tests: {
      oldBinaries: await suiteFile(landed, ["test/clients.test.mjs"]),
      tas: await suiteFile(landed, ["test/tas.test.mjs", "test/walk.test.mjs"]),
    },
    fonts: await fonts(landed, tpaL, coldL),
    reproducible: await M.reproducible(landed),
  };
  Object.assign(figures, await sets(landed));
  const out = JSON.stringify(figures, null, 2) + "\n";
  const path = M.arg("--out");
  if (path) writeFileSync(path, out);
  else process.stdout.write(out);
  process.stderr.write(account(figures));
  const recorded = M.arg("--against");
  if (recorded) against(JSON.parse(readFileSync(recorded, "utf8")), figures, { carried: ["choices"], mutants: process.argv.includes("--mutants") });
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
