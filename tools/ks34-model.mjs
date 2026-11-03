#!/usr/bin/env node
// KS34's model: kept vectors, masked video pairs, the resident header. Every
// figure "Gates to register" needs, measured on the prototype against the
// brief's baseline: the ROM census, its net cost and the ceiling that keeps
// the font above KG2's floor; the TPA on each card, the workspace and the
// stacks; the four choices, each option built as a variant of the prototype's
// tree; jumps from CALL 5 to BENTRY; the driver's pages at each width; the
// sweep of xx06h and LD L,6 from everything not historical; the contract
// account against the code; and the tests' files. --mutants runs KS34's set
// on the landed tree.
//
//   node tools/ks34-model.mjs [--landed REV] [--reference REV] [--mutants]
//                             [--sets-only] [--match NAMES] [--list]
//                             [--slice FROM:TO] [--out FILE]
//
// --landed is the tree measured, HEAD by default; --reference the baseline,
// ea9c1c0. --match takes the older sets' mutants whose names it finds, on the
// landed tree, one set of names at a time. The trees are git archives in build/model-ks34/, each built with
// its release set, which needs the pinned EDIT.COM and TAS.COM. A short
// account goes to stderr.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./lib/model.mjs";
import { MUTANTS_FIXES, MUTANTS_KS30, MUTANTS_KS31, MUTANTS_KS32, MUTANTS_KS33, MUTANTS_KS34, mutate } from "./lib/mutants.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const WORK = resolve(M.ROOT, "build/model-ks34");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const BOOT = "src/boot.asm";
const SVC = "src/svc.asm";
const FONT = 770; // KD-159's move into the ROM
const FLOOR = 256; // KG2

// ---- The choices' variants ---------------------------------------------------

/** The service's offset 0 jumping on to the top before it, a chain. */
const LINK = (dir) => M.patch(dir, SVC, "LD      HL,BENTRY       ; the page's offset 0 enters the BDOS", "LD      HL,(PZTOP)      ; the chain");

const LEFT = (dir) => M.patch(dir, BOOT, "        XOR     A\n        LD      (RST7+7),A      ; zeros after EI; RETI, as a clean boot has\n", "        OR      A\n");

/** The workspace's page out of the bound: a jump there takes the default. */
const NO_WORKSPACE = (dir) =>
  M.patch(dir, BOOT, "        JR      NC,RSTZERO\n        INC     HL              ; keep JP nn, then five zeros\n",
    `        JR      NC,RSTZERO
        INC     HL
        INC     HL
        LD      A,(HL)
        DEC     HL
        DEC     HL
        CP      $C0
        JR      NC,RSTKP
        LD      E,A
        LD      A,(STUBAD+1)
        DEC     A
        CP      E
        JR      C,RSTZERO
RSTKP:
        INC     HL              ; keep JP nn, then five zeros
`);

/** The two-read form at each of the five sites, and no routine. */
function inline(dir) {
  const site = (file, at, label) =>
    M.patch(dir, file, at, `        LD      A,I\n        JP      PE,${label}\n        LD      A,I\n${label}:\n`);
  M.patch(dir, "src/cache.asm", "IFFGET: LD      A,I\n        RET     PE\n        LD      A,I\n        RET\n", "");
  M.patch(dir, "src/cache.asm", "CDI:    CALL    IFFGET\n", "CDI:\n        LD      A,I\n        JP      PE,CDI1\n        LD      A,I\nCDI1:\n");
  site("src/xmove.asm", "        CALL    IFFGET\n", "MVI1");
  M.patch(dir, "src/history.asm", "HACC:   CALL    IFFGET\n", "HACC:\n        LD      A,I\n        JP      PE,HACC0\n        LD      A,I\nHACC0:\n");
  M.patch(dir, "src/console.asm", "RXBITS: CALL    IFFGET          ; interrupts off for the byte: 65 or 52\n", "RXBITS:\n        LD      A,I\n        JP      PE,RXI1\n        LD      A,I\nRXI1:\n");
  M.patch(dir, "src/console.asm", "        CALL    IFFGET          ; interrupts off for the byte\n", "        LD      A,I\n        JP      PE,TXI1\n        LD      A,I\nTXI1:\n");
}

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

// ---- In a worker ---------------------------------------------------------------

/** The transfers from CALL 5 to BENTRY with 0, 1 and 2 services in. */
async function entry(job) {
  const t = await M.inTree(job.dir);
  const { fx } = t;
  const res = await fx.service("res");
  const image = fx.standardCard();
  fx.volume(image, "A").write("RES.SVC", res);
  fx.volume(image, "A").write("ASK.COM", Uint8Array.from([0x0e, 12, 0xcd, 5, 0, 0xc9])); // function 12, CALL 5, RET
  const m = fx.boot(image);
  const bentry = m.sym("BENTRY");
  let counting = false;
  let seen = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x0102) [counting, seen] = [true, 0];
    else if (m.pc === bentry) counting = false;
    else if (counting && m.pc !== 0x0102 && m.read(m.pc) === 0xc3) seen += 1;
    return step();
  };
  const count = () => {
    m.command("ASK");
    return seen;
  };
  const jumps = [count()];
  m.command("RES.SVC");
  jumps.push(count());
  m.command("RES.SVC");
  jumps.push(count());
  return jumps;
}

/** 0000h-005Bh after a clean boot. */
async function pageZero(job) {
  const { fx } = await M.inTree(job.dir);
  const m = fx.boot(fx.standardCard());
  return Array.from({ length: 0x5c }, (_, i) => m.read(i));
}

if (process.argv[2] === "--worker") {
  const job = JSON.parse(process.argv[3]);
  if (job.task === "entry") console.log(JSON.stringify(await entry(job)));
  else if (job.task === "pagezero") console.log(JSON.stringify(await pageZero(job)));
  else await M.runWorker(job);
  process.exit(0);
}

// ---- The code and the account ----------------------------------------------------

const walk = (dir, root = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", "build", "dist", "gen"].includes(e.name)) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p, root) : [relative(root, p)];
  });
const HISTORICAL = (f) => /^test\/model\//.test(f) || /^test\/fixtures\/rom-/.test(f) || /^tools\/ks\d+-model\.mjs$/.test(f);
const text = (dir, f) => {
  const b = readFileSync(resolve(dir, f));
  return b.includes(0) ? "" : b.toString("utf8");
};

/** Each live file holding xx06h, or an LD L,6, and the mutants' words apart. */
function noOffset(dir) {
  const hits = walk(dir).filter((f) => !HISTORICAL(f) && f !== "tools/lib/mutants.mjs" && /xx06h|LD\s+L,6\b/i.test(text(dir, f)));
  return { hits, clean: hits.length === 0 };
}

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

/** The memory figures the docs give, against the build, and no old one left. */
function figuresAgree(landed, c) {
  const n = (x) => x.toLocaleString("en-US");
  const page = (w) => w & 0xff00;
  const { starter, fourG8M } = c.ram.cards;
  const want = {
    "docs/compatibility.md": [starter.tpa, fourG8M.tpa, page(starter.entry) - 0x700, page(fourG8M.entry) - 0x700, page(starter.entry) - 0xd00, page(fourG8M.entry) - 0xd00, page(starter.entry) - 0x100],
    "README.md": [starter.tpa, fourG8M.tpa, page(starter.entry) - 0x700, page(fourG8M.entry) - 0x700],
    "docs/services.md": [page(starter.entry) - 0xd00],
  };
  const missing = Object.entries(want).flatMap(([f, v]) => v.filter((x) => !text(landed, f).includes(n(x))).map((x) => `${f}: ${n(x)}`));
  const old = /\b(46,854|46,592|46,086|45,318|44,550|43,782|43,014|1,536 bytes|B80[56]h|xx06h)\b/;
  const stale = walk(landed).filter((f) => /\.md$/.test(f) && !HISTORICAL(f)).flatMap((f) => text(landed, f).split("\n").filter((l) => old.test(l) && !/^\| TPA \|/.test(l)).map((l) => `${f}: ${l.slice(0, 60)}`));
  return { missing, stale, agree: !missing.length && !stale.length };
}

function contracts(landed) {
  const account = text(landed, "docs/compatibility.md");
  const services = text(landed, "docs/services.md");
  const { census: c, symbols } = M.rom(landed);
  return {
    tpa: account.includes(c.ram.tpa.bytes.toLocaleString("en-US")),
    figures: figuresAgree(landed, c),
    stub: account.includes(`${c.ram.bdosVector.toString(16).toUpperCase()}h`) && services.includes(`${c.ram.bdosVector.toString(16).toUpperCase()}h`),
    flags: /bits 1 to 7 claim `RST 1` to `RST 7`/.test(services) && /LD\s+A,\(DF\+DFLG\)/.test(text(landed, SVC)),
    jumpAtZero: /`JP BENTRY`, 3 bytes/.test(services) && /LD\s+\(DF\),A/.test(text(landed, SVC)),
    ownerAtEight: /DOWN\s+EQU\s+8/.test(text(landed, SVC)) && /Low byte: the owner before it/.test(services),
    noOwnsAnInterrupt: !/No service owns an interrupt/.test(services),
    sweepToThe40h: /CP\s+\$40/.test(text(landed, BOOT)),
    romTable: romTable(landed),
    rxhalf: symbols.get("RXHALF") ?? null,
  };
}

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

/** Each driver's bytes and pages, at each width, and GLCD.SVC's. */
function drivers(dir) {
  return Object.fromEntries(readdirSync(resolve(dir, "dist/files")).filter((f) => /\.SVC$/.test(f)).map((f) => {
    const b = readFileSync(resolve(dir, "dist/files", f));
    const image = b[6] | (b[7] << 8);
    const extra = b[8] | (b[9] << 8);
    return [f, { file: b.length, image, extra, pages: Math.ceil((image + extra) / 256), room: Math.ceil((image + extra) / 256) * 256 - image - extra, stacks: [...b.subarray(12, 15)] }];
  }));
}

async function choices(landed, used) {
  const over = async (name, edit) => {
    const v = await variant(landed, name, edit);
    return v.refused ? v : { romUsed: v.romUsed, romOverPrototype: v.romUsed - used, dir: v.dir };
  };
  const link = await over("link", LINK);
  const linkJumps = link.dir ? await M.worker(SCRIPT, { task: "entry", dir: link.dir }) : null;
  const strip = ({ dir, ...r }) => r;
  return {
    entry: { jpBentry: { romUsed: used }, link: { ...strip(link), jumpsWithNoneOneTwo: linkJumps }, settled: "JP BENTRY: the design rule, whatever a link saves" },
    rest003B: { zeroed: { romUsed: used }, leftAlone: strip(await over("left", LEFT)), settled: "zeroed, so a clean boot's bytes don't change" },
    bound: { atOrAboveTop: { romUsed: used }, noWorkspace: strip(await over("noworkspace", NO_WORKSPACE)), settled: "at or above PZTOP's page" },
    safeRead: { routine: { romUsed: used }, inline: strip(await over("inline", inline)), settled: "the routine" },
  };
}

function account(f) {
  const p = [];
  p.push(`KS34 model: prototype ${f.prototype.slice(0, 7)} against ${f.baseline}`);
  p.push(`ROM ${f.rom.used} used, ${f.rom.free} free (reference ${f.rom.reference.used}/${f.rom.reference.free}), net ${-f.rom.saving}, reconciled ${f.rom.reconciled}, contiguous ${f.rom.contiguous}, one image ${f.rom.oneImage}, ${f.rom.sha256.slice(0, 16)}`);
  p.push(`ceiling ${f.ceiling.used}: font ${f.ceiling.font} above the floor ${f.ceiling.floor}, under by ${f.ceiling.margin}`);
  p.push(`TPA ${JSON.stringify(f.tpa.prototype)}`);
  p.push(`cards ${JSON.stringify(f.cards)}`);
  p.push(`stacks ${JSON.stringify(f.stacks.prototype)} (${JSON.stringify(f.stacks.reference)})`);
  p.push(`jumps ${JSON.stringify(f.entry)}`);
  p.push(`drivers ${JSON.stringify(f.drivers)}`);
  for (const [k, v] of Object.entries(f.choices)) p.push(`choice ${k}: ${JSON.stringify(v)}`);
  p.push(`no offset ${JSON.stringify(f.noOffset)}`);
  p.push(`contracts ${JSON.stringify(f.contracts)}`);
  p.push(`media ${JSON.stringify({ ...f.media, files: undefined })}`);
  p.push(`reproducible ${f.reproducible.same ?? JSON.stringify(f.reproducible).slice(0, 60)}`);
  return p.join("\n") + "\n";
}

const LANDED = M.arg("--landed", "HEAD");
const REFERENCE = M.arg("--reference", "ea9c1c0");
const slice = (set) => set.slice(...(M.arg("--slice") ?? "0:9999").split(":").map(Number));
/** With --match, the mutants of every set whose names it finds; otherwise KS34's. */
const chosen = () => {
  const match = M.arg("--match");
  if (!match) return MUTANTS_KS34;
  const seen = new Set();
  return [...MUTANTS_KS30, ...MUTANTS_KS31, ...MUTANTS_KS32, ...MUTANTS_FIXES, ...MUTANTS_KS33, ...MUTANTS_KS34].filter((m) => new RegExp(match, "i").test(m.name) && !seen.has(m.name) && seen.add(m.name));
};

async function main() {
  const t0 = Date.now();
  if (process.argv.includes("--sets-only")) {
    if (process.argv.includes("--list")) {
      console.log(chosen().map((m) => m.name).join("\n"));
      return;
    }
    const got = await mutate(await M.prepared(WORK, "landed", LANDED), WORK, slice(chosen()));
    writeFileSync(M.arg("--out"), JSON.stringify({ prototype: M.commit(LANDED), ...got }, null, 2) + "\n");
    M.log(`mutants ${got.mutantScore.caught} of ${got.mutantScore.total} caught; done in ${Math.round((Date.now() - t0) / 1000)} s`);
    return;
  }
  const [landed, reference] = await Promise.all([M.prepared(WORK, "landed", LANDED), M.prepared(WORK, "reference", REFERENCE)]);
  M.log("measuring");
  const tpaL = await M.tpaTable(SCRIPT, landed);
  const tpaR = await M.tpaTable(SCRIPT, reference);
  const censusL = await M.stackCensus(landed);
  const censusR = await M.stackCensus(reference);
  const rom = M.romSection(landed, reference);
  const [zeroL, zeroR] = [await M.worker(SCRIPT, { task: "pagezero", dir: landed }), await M.worker(SCRIPT, { task: "pagezero", dir: reference })];
  const cards = (d) => M.rom(d).census.ram.cards;
  const figures = {
    ...M.heading(REFERENCE, landed, LANDED),
    recommended: { entry: "jpBentry", rest003B: "zeroed", bound: "atOrAboveTop", safeRead: "routine" },
    rom,
    ceiling: { used: 16384 - FLOOR - FONT, font: FONT, floor: FLOOR, margin: 16384 - FLOOR - FONT - rom.used },
    tpa: { prototype: tpaL, reference: tpaR },
    cards: { prototype: cards(landed), reference: cards(reference) },
    resident: { prototype: M.resident(landed), reference: M.resident(reference) },
    stacks: M.stackFigures(censusL, censusR, landed, M.svclim(landed)),
    entry: { jumpsWithNoneOneTwo: await M.worker(SCRIPT, { task: "entry", dir: landed }) },
    drivers: { prototype: drivers(landed), reference: drivers(reference) },
    pageZero: { differs: zeroL.flatMap((b, i) => (b === zeroR[i] ? [] : [i.toString(16).padStart(4, "0")])), rule: "a clean boot's 0000h-005Bh: only the word at 0006h" },
    noOffset: noOffset(landed),
    contracts: contracts(landed),
    choices: await choices(landed, rom.used),
    media: media(landed, reference),
    tests: { masking: await suiteFile(landed, ["test/masking.test.mjs"]) },
    reproducible: await M.reproducible(landed),
  };
  if (process.argv.includes("--mutants")) Object.assign(figures, await mutate(landed, WORK, slice(MUTANTS_KS34)));
  writeFileSync(M.arg("--out"), JSON.stringify(figures, null, 2) + "\n");
  process.stderr.write(account(figures));
  M.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
