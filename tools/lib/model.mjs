// What the stage models (tools/ks30-model.mjs, tools/ks31-model.mjs) share:
// a tree of this repository at a commit, built and with its release set; the
// census and the image; the stack census by the tree's own test; and boot,
// reset and warm boot timed in a worker that imports the tree's own host and
// test library, as its tests use them. A worker runs its cases and prints one
// line of JSON; node:test's report from the test library goes to stderr.
//
// Times are T-states at 4 MHz, the board's clock. A usable prompt is the
// CCP's, at A> with startup's file finished (Machine.ready()). SD reads are
// the blocks the card was asked for, counted at the host's card.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, cpSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const HZ = 4_000_000;
export const PROFILES = ["debug80", "debug80t40", "debug80g32", "board"];
export const log = (...a) => console.error(...a);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const seconds = (cycles, places = 3) => Math.round((cycles / HZ) * 10 ** places) / 10 ** places;

/** The commit REV names, in full. */
export const commit = (rev) => execFileSync("git", ["-C", ROOT, "rev-parse", "--verify", `${rev}^{commit}`], { encoding: "utf8" }).trim();

/** A fresh tree of REV at WORK/NAME, from git archive, with this checkout's node_modules. */
export function tree(work, name, rev) {
  const dir = resolve(work, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync("sh", ["-c", `git -C "${ROOT}" archive "${commit(rev)}" | tar -x -C "${dir}"`]);
  symlinkSync(resolve(ROOT, "node_modules"), resolve(dir, "node_modules"));
  return dir;
}

/** A copy of tree FROM at WORK/NAME, its sources only, to be patched. */
export function copyTree(from, work, name) {
  const dir = resolve(work, name);
  rmSync(dir, { recursive: true, force: true });
  cpSync(from, dir, { recursive: true, filter: (p) => !/\/(build|dist|node_modules)$/.test(p) });
  symlinkSync(resolve(ROOT, "node_modules"), resolve(dir, "node_modules"));
  return dir;
}

// Node processes at once, across every caller: one a core.
const LANES = Math.max(1, Number(process.env.MODEL_JOBS) || availableParallelism());
let running = 0;
const waiting = [];
async function lane(fn) {
  while (running >= LANES) await new Promise((go) => waiting.push(go));
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** Run a node script in DIR; resolves with its stdout, or rejects with its output. */
export function node(dir, args, opts) {
  return lane(() => run(dir, args, opts));
}

function run(dir, args, { env = {}, quiet = true } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { cwd: dir, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => (code === 0 ? ok(out) : fail(new Error(`node ${args.join(" ")} in ${dir} exited ${code}\n${out}${quiet ? err.slice(-4000) : err}`))));
  });
}

/** Build DIR's ROM: every profile, or those named. */
export const build = (dir, profiles = []) => node(dir, ["tools/build.mjs", ...profiles]);

/** The loaded file type of tree DIR, by its source: src/svc.asm means .SVC, and every new name; its absence .DRV, and every old one. */
export const fileType = (dir) => (existsSync(resolve(dir, "src/svc.asm")) ? "SVC" : "DRV");

/** The pinned EDIT.COM, which the shipped card holds: from EDIT_COM, else beside this repository. */
export function editCom() {
  const entry = JSON.parse(readFileSync(resolve(ROOT, "test/inputs.json"), "utf8")).inputs["EDIT.COM"];
  const path = resolve(process.env[entry.env] ?? resolve(ROOT, entry.default));
  if (!existsSync(path)) throw new Error(`no EDIT.COM at ${path}: the shipped card holds it, so set ${entry.env}`);
  const got = sha256(readFileSync(path));
  if (got !== entry.sha256) throw new Error(`EDIT.COM at ${path} has sha256 ${got}, pinned ${entry.sha256}`);
  return path;
}

/** DIR's release set, dist/ and the starter card, by its own tools/media.mjs. */
export const media = (dir) => node(dir, ["tools/media.mjs"], { env: { EDIT_COM: editCom() } });

/** DIR's ROM for PROFILE: image, census and symbols. */
export function rom(dir, profile = "debug80") {
  const at = (f) => resolve(dir, "build", profile, f);
  const d8 = JSON.parse(readFileSync(at("tecos.d8.json"), "utf8"));
  const symbols = new Map(d8.symbols.map((s) => [s.name.toUpperCase(), s.address ?? s.value]));
  return { image: readFileSync(at("tecos.rom")), census: JSON.parse(readFileSync(at("census.json"), "utf8")), symbols };
}

/** The ROM census as the figures give it: used, free, regions, and their checks. */
export function romFigures(dir) {
  const r = rom(dir);
  const { used, free } = r.census.rom;
  const regions = Object.fromEntries(r.census.rom.regions.map((g) => [g.label, g.bytes]));
  const reconciled = Object.values(regions).reduce((a, n) => a + n, 0);
  const frees = r.census.rom.regions.filter((g) => g.label === "free");
  const last = r.census.rom.regions.at(-1);
  const contiguous = frees.length === 1 && last.label === "free" && last.end === 0x10000 && last.bytes === free;
  const oneImage = PROFILES.every((p) => Buffer.compare(rom(dir, p).image, r.image) === 0);
  const tableEnd = r.census.rom.regions.find((g) => g.label === "table").end;
  return { used, free, regions, reconciled, equals16384: reconciled === 16384, contiguous, oneImage, sha256: sha256(r.image), tableEnd };
}

/** The resident figures from DIR's census: the fixed workspace, the state above the RAM BIOS table, the cards. */
export function resident(dir) {
  const { ram } = rom(dir).census;
  const state = ram.regions.find((g) => g.label === "SD, keyboard and GLCD state");
  return {
    fixedBase: ram.fixedBase,
    workspaceBytes: ram.ramBios - ram.fixedBase,
    stateAboveTheTable: state.bytes,
    entry: ram.bdosVector,
    cards: ram.cards,
  };
}

/** Three builds of DIR, each image's SHA-256. */
export async function reproducible(dir) {
  const out = {};
  for (const n of ["first", "second", "third"]) {
    await build(dir);
    out[n] = sha256(rom(dir).image);
  }
  out.equal = out.first === out.second && out.second === out.third;
  return out;
}

// One process at a time in a tree that imports its test library: each import
// assembles the drivers again into the tree's build/svc, the same files.
const trees = new Map();
function inOrder(dir, fn) {
  const before = trees.get(dir) ?? Promise.resolve();
  const done = before.then(fn, fn);
  trees.set(dir, done.catch(() => {}));
  return done;
}

/** DIR's stack census, by its own test/stacks.test.mjs. */
export function stackCensus(dir) {
  return inOrder(dir, async () => {
    await node(dir, ["--test", "test/stacks.test.mjs"]);
    return JSON.parse(readFileSync(resolve(dir, "build/stack-census.json"), "utf8"));
  });
}

/** A census's deepest figure per stack, BDOS, CCP, BIOS, for the figures. */
export const depths = (c) => ({ bdos: c.bdos.deepest, ccp: c.ccp.deepest, bios: c.bios.deepest });

/** The three stack bytes of a .SVC file's header, BDOS, BIOS, CCP, as its writer declared them. */
export const declaredStacks = (file) => [...file.subarray(12, 15)];

/** Run TASKS (functions returning promises) N at a time, in order of the results. */
export async function pool(tasks, n = 3) {
  const out = new Array(tasks.length);
  let next = 0;
  const lane = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, lane));
  return out;
}

/** Measurements in a worker, in the tree JOB.dir names: SCRIPT --worker JOB, its JSON. */
export function worker(script, job) {
  return inOrder(job.dir, async () => {
    const out = await node(ROOT, ["--test-reporter=tap", "--test-reporter-destination=stderr", script, "--worker", JSON.stringify(job)]);
    return JSON.parse(out.trim().split("\n").at(-1));
  });
}

/** The value after NAME in the command line, or FALLBACK. */
export function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
}

/** A tree of REV at WORK/NAME, built, with its release set. */
export async function prepared(work, name, rev) {
  const dir = tree(work, name, rev);
  log(`${name}: ${commit(rev).slice(0, 7)}, building`);
  await build(dir);
  await media(dir);
  return dir;
}

/** Replace FROM by TO in FILE of tree DIR, which must hold FROM once. */
export function patch(dir, file, from, to) {
  const path = resolve(dir, file);
  const text = readFileSync(path, "utf8");
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${file}: ${JSON.stringify(from)} found ${n} times`);
  writeFileSync(path, text.replace(from, to));
}

/** Build a copy of DIR at WORK changed by EDIT (a function of the copy's path); its ROM used. */
export async function variant(work, dir, name, edit) {
  const copy = copyTree(dir, work, `variant-${name}`);
  edit(copy);
  await build(copy, ["debug80"]);
  return rom(copy).census.rom.used;
}

/** Each case's measurement by TASK ("cold" or "recognised") in DIR, by name. */
export async function bootTable(script, dir, task, names = Object.keys(CASES)) {
  const got = await worker(script, { task: "batch", dir, jobs: names.map((name) => ({ task, name })) });
  return Object.fromEntries(names.map((n, i) => [n, got[i]]));
}

export const TPA_DISPLAYS = ["serial", "pico80", "pico40", "pico32", "glcd", "both"];

/** TPA after boot on the starter card and on four G8M, for each display. */
export async function tpaTable(script, dir) {
  const jobs = [];
  for (const card of ["starter", "fourG8M"]) for (const display of TPA_DISPLAYS) jobs.push({ card, display });
  const got = await worker(script, { task: "batch", dir, jobs: jobs.map((j) => ({ task: "tpa", ...j })) });
  const out = { starter: {}, fourG8M: {} };
  jobs.forEach((j, i) => (out[j.card][j.display] = got[i]));
  return out;
}

/** A stack census's runs as deepest figures. */
export const stackRuns = (c) => Object.fromEntries(Object.entries(c.runs).map(([k, r]) => [k, depths(r)]));

/** The stack figures common to both models, from the landed and reference censuses. */
export function stackFigures(censusL, censusR, landedDir, limit) {
  const runsL = stackRuns(censusL);
  const runsR = stackRuns(censusR);
  const gone = Object.keys(runsR).filter((k) => !(k in runsL));
  const file = (stem) => readFileSync(resolve(landedDir, "dist/files", `${stem}.${fileType(landedDir)}`));
  return {
    reference: depths(censusR),
    prototype: depths(censusL),
    reserved: { bdos: censusL.bdos.reserved, ccp: censusL.ccp.reserved, bios: censusL.bios.reserved },
    pathsGone: gone,
    goneReadings: Object.fromEntries(gone.map((k) => [k, runsR[k]])),
    runs: runsL,
    deepestCcpRun: Object.entries(runsL).reduce((a, b) => (b[1].ccp > a[1].ccp ? b : a))[0],
    proved: {
      // What each driver adds to the stacks, as proved before this stage and
      // stated in KG33: carried. Each header's declaration is read here.
      // The keys are KG34 to KG36's, kept as recorded.
      "PICO.DRV": { declared: declaredStacks(file("PICO")), peakOverReference: [0, 0, 0] },
      "GLCD.DRV": { declared: declaredStacks(file("GLCD")), overBase: [2, 0, 6] },
    },
    limit,
    everyQuarterFree: ["bdos", "ccp", "bios"].every((k) => (censusL[k].reserved - censusL[k].deepest) * 4 >= censusL[k].reserved),
  };
}

/** SVCLIM, each stack's room for services (BDOS, BIOS, CCP), from DIR's image. */
export function svclim(dir) {
  const r = rom(dir);
  const at = r.symbols.get(fileType(dir) === "SVC" ? "SVCLIM" : "DRVLIM") - 0xc000;
  return [...r.image.subarray(at, at + 3)];
}

/** The old models' name for svclim. */
export const drvlim = svclim;

/** The figures' first three keys. */
export const heading = (reference, landedDir, landed) => ({
  baseline: reference,
  assembler: `ATOM ${JSON.parse(readFileSync(resolve(landedDir, "package.json"), "utf8")).devDependencies["atom-z80"]}`,
  prototype: commit(landed),
});

/** The ROM figures, against the reference's. */
export function romSection(landedDir, referenceDir) {
  const l = romFigures(landedDir);
  const r = romFigures(referenceDir);
  const { used, free, ...rest } = l;
  return { reference: { used: r.used, free: r.free }, used, free, saving: r.used - used, ...rest };
}

/** The resident figures, against the reference's. */
export function residentSection(landedDir, referenceDir, watch) {
  const l = resident(landedDir);
  const r = resident(referenceDir);
  return {
    reference: r,
    prototype: l,
    workspaceReleased: r.stateAboveTheTable - l.stateAboveTheTable,
    expand1: watch.free ? "BE00h to BEFFh free, 256 bytes, watched by the host" : `not watched: ${JSON.stringify(watch)}`,
  };
}

/** A worker's job, in the tree it names; prints its JSON. */
export async function runWorker(job) {
  const t = await inTree(job.dir);
  const one = (j) =>
    ({
      cold: () => t.cold(j.name).out,
      recognised: () => t.recognised(j.name).out,
      tpa: () => t.tpaOn(j.card, j.display),
      watch: () => t.watchFreedPage(),
      selection: () => t.selection(j.selected),
    })[j.task]();
  console.log(JSON.stringify(job.task === "batch" ? job.jobs.map(one) : one(job)));
}

// ---- In a worker: the tree's own host and test library ----------------------

/**
 * The boards. pico has a PICO9918 and the matrix keyboard and no GLCD; both
 * has the GLCD too; glcd has the GLCD and the keyboard; serial has neither
 * display, its console the serial port.
 */
export const BOARDS = {
  serial: {},
  pico: { tms: true, matrix: true, glcd: false },
  glcd: { matrix: true },
  both: { tms: true, matrix: true },
};

/**
 * The cases, each on the shipped card (the tree's dist/starter.img) as the
 * web host prepares it for the display chosen. missingDrivers: PICO.SVC and
 * GLCD.SVC, the two its startup file names, erased. badDriver: PICO.SVC's
 * bytes all 55h, its length kept. keypadSkip: a key held through reset.
 * noCard: no card. badCard: its first byte inverted, so the card starts with
 * no container to mount. retry: the bad card put right at DIAG and R typed.
 */
export const CASES = {
  serial: { board: "serial" },
  pico80: { board: "pico", display: ["tms", 80] },
  pico40: { board: "pico", display: ["tms", 40], profile: "debug80t40" },
  pico32: { board: "pico", display: ["tms", 32], profile: "debug80g32" },
  glcd: { board: "glcd", display: ["glcd", 80] },
  bothDisplays: { board: "both", display: ["tms", 80] },
  missingDrivers: { board: "pico", card: "missing" },
  badDriver: { board: "pico", card: "badDriver" },
  keypadSkip: { board: "pico", key: true },
  noCard: { board: "pico", card: "none" },
  badCard: { board: "pico", card: "badCard" },
  retry: { board: "pico", card: "badCard", retry: true },
};

export async function inTree(dir) {
  const url = (p) => pathToFileURL(resolve(dir, p)).href;
  const { Machine, EXPAND1_WRITES } = await import(url("test/lib/machine.mjs"));
  const fx = await import(url("test/lib/fixtures.mjs"));
  const card = await import(url("host/card.mjs"));
  const container = await import(url("tools/lib/container.mjs"));
  const shipped = () => new Uint8Array(readFileSync(resolve(dir, "dist/starter.img")));
  const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
  const t = {
    Machine,
    fx,
    card,
    container,
    shipped,
    tpa: (m) => word(m, 6) - 0x100,
    row3: (m) => String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(60, 80)).trimEnd(),
    drives: (m) => Array.from({ length: 4 }, (_, d) => m.read(m.sym("DRVIDX") + d)),
    /** A machine of PROFILE's ROM on BOARD with IMAGE in the socket. */
    machine: (image, board = {}, profile = "debug80") => new Machine({ ...fx.romFor(profile), sdImage: image, clock: fx.TEST_CLOCK, ...board }),
    /** Count the blocks M's card is asked for, from now: the count is .n. */
    reads(m) {
      const r = { n: 0 };
      if (!m.sd) return r;
      const read = m.sd.readBlock.bind(m.sd);
      m.sd.readBlock = (arg) => ((r.n += 1), read(arg));
      return r;
    },
    prompt: (m, from) => m.runUntil(() => m.ready() && /[A-P]>$/.test(m.text(from)), 400_000_000, "a usable prompt"),
    diag(m, from) {
      m.runUntil(() => /R retry, H header> $/.test(m.text(from)), 200_000_000, "DIAG's prompt");
      m.runUntil(() => m.waitingForInput(), 200_000_000, "DIAG waiting for a key");
    },
    /** JP 0000h at the prompt: T-states and reads to the next. */
    warm(m) {
      const r = t.reads(m);
      const from = m.output.length;
      const t0 = m.cycles;
      m.cpu.cpu.pc = 0;
      m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(from)), 200_000_000, "the prompt after a warm boot");
      const cycles = m.cycles - t0;
      return { seconds: seconds(cycles, 4), cycles, sdReads: r.n };
    },
    /** The card a case starts with, or undefined for none. */
    cardFor(c) {
      if (c.card === "none") return undefined;
      const image = shipped();
      if (c.display) card.prepareCard(image, ...c.display);
      const type = fileType(dir);
      if (c.card === "missing") for (const n of ["PICO", "GLCD"]) fx.volume(image, "A").erase(`${n}.${type}`);
      if (c.card === "badDriver") {
        const a = fx.volume(image, "A");
        a.write(`PICO.${type}`, new Uint8Array(a.read(`PICO.${type}`).length).fill(0x55));
      }
      if (c.card === "badCard") image[0] ^= 0xff;
      return image;
    },
    /** Put the bad card right and type R at DIAG: the retry's time from the key's wait, reads, row 3, TPA. */
    retry(m, image) {
      image[0] ^= 0xff;
      const r = t.reads(m);
      const t0 = m.cycles;
      m.mark = m.output.length;
      m.type("R");
      t.prompt(m, m.mark);
      return { seconds: seconds(m.cycles - t0), sdReads: r.n, row3: t.row3(m), tpa: t.tpa(m) };
    },
    /**
     * A case from power on: to a usable prompt, its reads, TPA, row 3 and a
     * warm boot there; or to DIAG waiting for a key; or, for retry, from that
     * wait to the prompt. { m, image, out }.
     */
    cold(name) {
      const c = CASES[name];
      const image = t.cardFor(c);
      const m = t.machine(image, BOARDS[c.board], c.profile);
      if (c.key) m.tec1g.applyKeySilent(0x01, true);
      const r = t.reads(m);
      if (c.card === "none" || c.card === "badCard") {
        t.diag(m, 0);
        const out = { seconds: seconds(m.cycles), sdReads: r.n, row3: t.row3(m) };
        return { m, image, out: c.retry ? t.retry(m, image) : out };
      }
      t.prompt(m, 0);
      const out = { seconds: seconds(m.cycles), cycles: m.cycles, sdReads: r.n, tpa: t.tpa(m), row3: t.row3(m) };
      out.warmBoot = t.warm(m);
      return { m, image, out };
    },
    /**
     * A case through a recognised reset: the shipped card booted on the case's
     * board, then the reset button, with the key held again for the skip, and
     * the case's card swapped in first for noCard, badCard and retry. Timed
     * from the reset as cold() is from power on, with the drives' indices.
     */
    recognised(name) {
      const c = CASES[name];
      const swap = c.card === "none" || c.card === "badCard";
      const first = swap ? t.cardFor({ ...c, card: undefined }) : t.cardFor(c);
      const m = t.machine(first, BOARDS[c.board], c.profile);
      if (c.key) m.tec1g.applyKeySilent(0x01, true);
      t.prompt(m, 0);
      const image = swap ? t.cardFor(c) : first;
      if (swap) m.swapCard(image);
      const r = t.reads(m);
      const from = m.output.length;
      const t0 = m.cycles;
      m.reset();
      if (c.key) m.tec1g.applyKeySilent(0x01, true);
      if (swap) {
        t.diag(m, from);
        const out = { seconds: seconds(m.cycles - t0), sdReads: r.n, row3: t.row3(m) };
        return { m, image, out: c.retry ? t.retry(m, image) : out };
      }
      t.prompt(m, from);
      return { m, image, out: { seconds: seconds(m.cycles - t0), sdReads: r.n, row3: t.row3(m), tpa: t.tpa(m), drives: t.drives(m) } };
    },
    /** The TPA after boot on CARD ("starter" or "fourG8M") and DISPLAY; both is CON UC1 on a board with both. */
    tpaOn(cardName, display) {
      const [board, prep, profile] = {
        serial: ["serial"],
        pico80: ["pico", ["tms", 80]],
        pico40: ["pico", ["tms", 40], "debug80t40"],
        pico32: ["pico", ["tms", 32], "debug80g32"],
        glcd: ["glcd", ["glcd", 80]],
        both: ["both", ["tms", 80]],
      }[display];
      let image = shipped();
      if (prep) card.prepareCard(image, ...prep);
      if (cardName === "fourG8M") image = t.fourG8M(image);
      const m = t.machine(image, BOARDS[board], profile);
      t.prompt(m, 0);
      if (display === "both") m.command("CON UC1");
      return t.tpa(m);
    },
    /**
     * The freed page: a write to BE00h and to BEFFh in EXPAND 1, from the TPA,
     * is in the host's watch, and BDFFh and BF00h are not.
     */
    watchFreedPage() {
      const m = t.machine(shipped());
      t.prompt(m, 0);
      const latch = m.sysCtrl;
      m.cpu.hardware.ioWrite(0xff, (latch | 0x04) & 0xff);
      const pc = m.cpu.cpu.pc;
      m.cpu.cpu.pc = 0x0100;
      const seen = {};
      for (const a of [0xbdff, 0xbe00, 0xbeff, 0xbf00]) {
        const n = m.expand1Writes.length;
        const old = m.read(a);
        m.cpu.hardware.memWrite(a, old ^ 0xff);
        m.cpu.hardware.memWrite(a, old);
        seen[a.toString(16)] = m.expand1Writes.length > n;
      }
      m.cpu.cpu.pc = pc;
      m.cpu.hardware.ioWrite(0xff, latch);
      EXPAND1_WRITES.splice(0); // these writes were the check's own
      return { free: !seen.bdff && seen.be00 && seen.beff && !seen.bf00, seen };
    },
    /**
     * The 20-volume card of test/reset.test.mjs, G1M volumes V0 to V19 with
     * V0 on A: and V1 on B:, on the serial board: a recognised reset, after
     * the mount service has put index 17 on A: when SELECTED.
     */
    selection(selected) {
      const vols = Array.from({ length: 20 }, (_, i) => ({ geometry: "G1M", label: `V${i}`, mount: i < 2 ? "AB"[i] : "-" }));
      const m = t.machine(container.createContainer(vols));
      t.prompt(m, 0);
      if (selected) {
        const at = m.sym("ABIVOL");
        [0xcd, at & 0xff, at >> 8, 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
        const cpu = m.cpu.cpu;
        const saved = Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "sp", "pc"].map((r) => [r, cpu[r]]));
        const flags = { ...cpu.flags };
        Object.assign(cpu, { a: 0, c: 0, e: 17, sp: 0x0100, pc: 0x60 });
        m.runUntil(() => m.pc === 0x63, 80_000_000, "the mount");
        if (cpu.a !== 0) throw new Error(`the mount service gave ${cpu.a}`);
        Object.assign(cpu, saved, { flags });
        t.warm(m); // the program's exit, as after any program's call
      }
      const r = t.reads(m);
      const from = m.output.length;
      const t0 = m.cycles;
      m.reset();
      t.prompt(m, from);
      return { seconds: seconds(m.cycles - t0), sdReads: r.n, row3: t.row3(m), tpa: t.tpa(m), drives: t.drives(m) };
    },
    /** Four 8 MiB volumes on A: to D:, A: holding the files of IMAGE's A:. */
    fourG8M(image) {
      const out = container.createContainer(["SYSTEM", "WORK", "MORE", "LAST"].map((label, i) => ({ geometry: "G8M", label, mount: "ABCD"[i] })));
      const from = fx.volume(image, "A");
      const to = fx.volume(out, "A");
      for (const f of from.list()) to.write(f.name, from.read(f.name));
      return out;
    },
  };
  return t;
}
