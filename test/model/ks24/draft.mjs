// KS24's draft: TEC-OS at BASE with the brief's layout, made in a tree of
// its own under build/model-ks24/<name>/. No source in this repository
// changes. The ROM becomes
//
//   C000h  JP COLD
//   C003h  the table, ABI 3.0 (abi.asm, here)
//          one block of every piece of read-only data (data.asm, made here)
//          one block of code
//          the free space, to FFFFh
//
// Options, for the choices the model settles:
//   table:    "front" (C003h) or "top" (the table at FFDDh, ending at FFFEh: ATOM emits no byte at FFFFh)
//   dispatch: "words" (absolute words, the FCB flag in a bitmap),
//             "offsets" (the table as at BASE, moved into the data block) or
//             "offsets-in-code" (the table left in the BDOS's code)
//   lengths:  "immediate" (WSCLRN, CPMCLRN and GUARDN become operands) or
//             "data" (the three stay as words, moved into the data block)

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adapt } from "./adapt.mjs";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PRODUCT = resolve(HERE, "../../..");
export const BASE = process.env.KS24_BASE ?? "c9e421b";
export const WORK = resolve(PRODUCT, "build/model-ks24");

export const DEFAULTS = { table: "front", dispatch: "words", lengths: "immediate" };

/** BASE extracted into WORK/name, with node_modules linked; its path. */
export function baseTree(name) {
  const dir = resolve(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execSync(`git archive ${BASE} | tar -x -C "${dir}"`, { cwd: PRODUCT });
  symlinkSync(resolve(PRODUCT, "node_modules"), resolve(dir, "node_modules"));
  return dir;
}

/** Build PROFILES in DIR; the error text if the build fails. */
export function build(dir, profiles = []) {
  try {
    execSync(`node tools/build.mjs ${profiles.join(" ")}`, { cwd: dir, stdio: "pipe" });
    return null;
  } catch (e) {
    return `${e.stdout}${e.stderr}`.trim();
  }
}

// ---- Source surgery ---------------------------------------------------------

const lines = (text) => text.split("\n");
const DATA = /^\s*(?:[A-Za-z_]\w*:)?\s*(?:DB|DW)\b/;
const LABEL = /^[A-Za-z_]\w*:\s*(?:;.*)?$/;
const COND = /^%(?:IF|ELSE|ENDIF)\b/;
const COMMENT = /^\s*;/;

class Source {
  constructor(dir, path) {
    this.path = resolve(dir, "src", path);
    this.name = path;
    this.l = lines(readFileSync(this.path, "utf8"));
  }
  find(re, from = 0) {
    const i = this.l.findIndex((x, k) => k >= from && re.test(x));
    if (i < 0) throw new Error(`${this.name}: no line ${re}`);
    return i;
  }
  /** Cut lines [a, b) out; returns them. */
  cut(a, b) {
    return this.l.splice(a, b - a);
  }
  /**
   * The data run that starts at the line matching ANCHOR: it reaches up
   * over the comment lines directly above it and down over data lines,
   * labels that lead to data, and %IF lines. `extra` admits other lines
   * (the BIOS jump table's JPs). Cut out and returned.
   */
  takeRun(anchor, extra) {
    let a = typeof anchor === "number" ? anchor : this.find(anchor);
    let b = a;
    const ok = (x) => x !== undefined && (DATA.test(x) || COND.test(x) || Boolean(extra && extra.test(x)));
    const leadsToData = (k) => {
      while (LABEL.test(this.l[k] ?? "")) k += 1;
      return ok(this.l[k]);
    };
    while (ok(this.l[b]) || (LABEL.test(this.l[b] ?? "") && leadsToData(b))) b += 1;
    if (b === a) throw new Error(`${this.name}: no data at ${anchor}`);
    while (a > 0 && COMMENT.test(this.l[a - 1])) a -= 1;
    const run = this.cut(a, b);
    // Leave one blank line where the run was.
    if (this.l[a - 1]?.trim() === "" && this.l[a]?.trim() === "") this.l.splice(a, 1);
    return run;
  }
  replace(from, to) {
    const text = this.l.join("\n");
    if (!text.includes(from)) throw new Error(`${this.name}: no text ${JSON.stringify(from.slice(0, 60))}`);
    this.l = lines(text.replace(from, to));
  }
  save() {
    writeFileSync(this.path, this.l.join("\n"));
  }
}

/** The BDOS's FCB flags at BASE: function numbers whose word has +$8000. */
function fcbFunctions(bdos) {
  const at = bdos.find(/^FNTAB:/);
  const names = [];
  for (let i = at + 1; DATA.test(bdos.l[i]); i += 1) {
    for (const m of bdos.l[i].matchAll(/(\w+)-BDOSBAS(\+\$8000)?/g)) names.push({ name: m[1], fcb: Boolean(m[2]) });
  }
  return names;
}

/**
 * The draft tree: BASE in WORK/name with the brief's layout. Returns
 * { dir, notes } where notes record each move, for the report.
 */
export function draftTree(name, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const dir = baseTree(name);
  const src = (p) => new Source(dir, p);
  const data = []; // [source file, lines] in assembly order
  const notes = [];
  const take = (s, anchor, extra) => {
    const run = s.takeRun(anchor, extra);
    data.push([s.name, run]);
    return run;
  };

  // boot.asm: RESET's LD SP and DI, the padding, INT38, ROMSIG and ROMVERS
  // go; the reset jump moves to rom.asm. The two messages are data.
  const boot = src("boot.asm");
  boot.cut(0, boot.find(/^; ---- Cold boot/));
  boot.replace("; Entered from RESET (stack in fixed RAM) or BIOS function 0.", "; Entered from RESET, at 0000h at reset, or BIOS function 0.");
  if (opt.lengths === "immediate") {
    boot.replace("LD      BC,(WSCLRN)", "LD      BC,WSEND-WSBASE-1");
    boot.replace("LD      BC,(CPMCLRN)", "LD      BC,BDOSRME-CCPRAM-1");
    boot.replace("LD      A,(GUARDN)", "LD      A,STKGUEND-STKGUARD");
  }

  // The data runs, file by file in rom.asm's order. The BIOS jump table
  // moves as one piece: warm boot copies BIOSLEN bytes of it.
  const bios = src("bios.asm");
  take(bios, /^BIOSBAS:/, /^\s*(?:BIOSBAS:)?\s*JP\s/);
  const console_ = src("console.asm");
  take(console_, /^KBARROW:/);
  const video = src("video.asm");
  take(video, /^TMSVEC:/);
  const tms = src("tms.asm");
  // The TMS tables use TNAME, TCOLOR and TSPRITE: ATOM reads the source
  // once and takes no forward equate with arithmetic, so these three
  // constants go ahead of the data.
  const tmsEqus = [];
  for (const re of [/^TNAME\s+EQU/, /^TCOLOR\s+EQU/, /^TSPRITE\s+EQU/]) tmsEqus.push(...tms.cut(tms.find(re), tms.find(re) + 1));
  take(tms, /^TMSROWT:/);
  const regs = tms.find(/^TMSREGS:/) - 1;
  if (!/^%IF TMS32\s*$/.test(tms.l[regs])) throw new Error("tms.asm: TMSREGS is not under %IF TMS32");
  take(tms, regs);
  const lcd = src("lcd.asm");
  take(lcd, /^LCDSEQ:/);
  take(lcd, /^LCDROWS:/);
  take(lcd, /^LCDBAN:/);
  const vol = src("vol.asm");
  take(vol, /^ROTXT:/);
  const diag = src("diag.asm");
  take(diag, /^DGERR:/);
  boot.save();
  // boot.asm's messages: they sit after RAMBAD's loop.
  const boot2 = src("boot.asm");
  data.splice(0, 0, ["boot.asm", [...boot2.takeRun(/^RAMMSG:/), ...boot2.takeRun(/^BANNER:/)]]);
  boot2.save();

  // The CCP: its messages and keywords are data; its RAM section moves to
  // ram.asm, so the ORG pair goes.
  const ccp = src("cpm/ccp.asm");
  take(ccp, /^CRLFMSG:/);
  const ccpRom = ccp.find(/^; ROM ends here; the CCP writable state/);
  const ccpRam = ccp.cut(ccpRom, ccp.l.length).filter((x) => !/^(?:CCPROM:|\s+ORG\s+CCP(?:RAM|ROM))\s*$/.test(x) && !/^; ROM ends here/.test(x));

  // The BDOS: the six bytes before BENTRY go; the dispatch table, its
  // messages and its RAM section move.
  const bdos = src("cpm/bdos.asm");
  bdos.replace("; CP/M places its public entry six bytes into the resident BDOS extent.\n        DS      6,0\n\n", "");
  const fns = fcbFunctions(bdos);
  if (opt.dispatch === "words") {
    const tab = bdos.find(/^FNTAB:/);
    let end = tab + 1;
    while (DATA.test(bdos.l[end])) end += 1;
    const rows = [];
    for (let i = 0; i < fns.length; i += 6) rows.push(`        DW      ${fns.slice(i, i + 6).map((f) => f.name).join(",")}`);
    const map = [];
    for (let i = 0; i < fns.length; i += 8) {
      let byte = 0;
      fns.slice(i, i + 8).forEach((f, k) => (byte |= f.fcb ? 1 << k : 0));
      map.push(`%${byte.toString(2).padStart(8, "0")}`);
    }
    bdos.l.splice(
      tab,
      end - tab,
      "; Each function's routine. FCBMAP has a bit for each function, bit n of",
      "; byte n/8, set where the FCB's drive is bound first.",
      "FNTAB:",
      ...rows,
      `FCBMAP: DB      ${map.join(",")}`,
    );
    bdos.replace(
      `        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        ; Table words are resident-relative offsets. Bit 15 requests FCB
        ; drive binding; no flag is hidden in an absolute machine address.
        BIT     7,D
        RES     7,D
        LD      HL,BDOSBAS
        ADD     HL,DE
        JR      Z,DISPATCH`,
      `        LD      E,(HL)
        INC     HL
        LD      D,(HL)          ; DE = the routine
        LD      HL,FCBMAP-1     ; its FCB bit: byte C/8, bit C mod 8
        LD      A,C
FCBBYTE:INC     HL
        SUB     8
        JR      NC,FCBBYTE
        LD      B,A             ; (C mod 8) - 8
        LD      A,(HL)
FCBBIT: RLCA                    ; 8 - (C mod 8) turns: the bit in carry
        INC     B
        JR      NZ,FCBBIT
        EX      DE,HL
        JR      NC,DISPATCH`,
    );
    notes.push(`dispatch: absolute words; FCBMAP ${map.join(",")}`);
  }
  if (opt.dispatch !== "offsets-in-code") take(bdos, /^FNTAB:/);
  take(bdos, /^ERRHEAD:/);
  const bdosRom = bdos.find(/^; ROM ends here; the BDOS writable state/);
  const bdosRam = bdos.cut(bdosRom, bdos.l.length).filter((x) => !/^(?:BDOSROM:|\s+ORG\s+BDOS(?:RAM|ROM))\s*$/.test(x) && !/^; ROM ends here/.test(x));
  while (bdosRam.at(-1)?.trim() === "") bdosRam.pop();

  // The rest, in rom.asm's order after the BDOS.
  const hw = src("hwsvc.asm");
  hw.replace("; FF06h, once the native services' entry: no such service.\nNONATSV:LD      A,HWEBAD\n", "");
  take(hw, /^HWTAB:/);
  take(hw, /^HWSEGT:/);
  const glcd = src("glcd.asm");
  take(glcd, /^GLCFCB:/);
  const cache = src("cache.asm");
  take(cache, /^CWMSG:/);

  // ram.asm: the CCP's and the BDOS's RAM sections, at the addresses the
  // ORG pairs gave them (CCPRAM = BIOSRME, BDOSRAM = CCPRME), and WSEND.
  const ram = src("ram.asm");
  ram.replace(
    "CCPRAM  EQU     BIOSRME\n",
    [
      "CCPRAM  EQU     BIOSRME",
      "",
      "; ---- The CCP's state and stack (cpm/ccp.asm) ----------------------------------",
      ...ccpRam.filter((x, i, a) => !(x.trim() === "" && (i === 0 || i === a.length - 1))),
      "",
      "; ---- The BDOS's state and stack (cpm/bdos.asm) --------------------------------",
      "BDOSRAM EQU     CCPRME",
      ...bdosRam,
      "",
    ].join("\n"),
  );
  ram.replace("HIRME:", "HIRME:\nWSEND   EQU     HIRME           ; end of the classic resident workspace");
  const link = src("cpmlink.asm");
  link.replace("; The BDOS workspace follows the CCP workspace in the classic bank.\nBDOSRAM EQU     CCPRME\n", "");

  // end.asm: the three lengths become operands, or stay as data words.
  const end = src("end.asm");
  const lengths = end.l.filter((x) => /^(?:WSCLRN|CPMCLRN|GUARDN):/.test(x));
  end.l = ["; The end of the code. The free space runs from here to the end of the ROM.", "CODEEND:", ""];
  if (opt.lengths === "data") data.push(["end.asm", ["; Lengths the boot code reads.", ...lengths]]);

  for (const s of [bios, console_, video, tms, lcd, vol, diag, ccp, bdos, hw, glcd, cache, ram, link, end]) s.save();

  // The data block: ATOM takes %INCLUDE only in a file's header, so the
  // block is data.asm, the generated font, data2.asm, the generated
  // geometry and data3.asm, in sequence; each part holds its files' runs in
  // assembly order, under the file's name.
  const part = (files, first, last) => {
    const out = [];
    for (const file of files) {
      const runs = data.filter(([f]) => f === file);
      if (!runs.length) continue;
      out.push(`; ---- ${file} ${"-".repeat(Math.max(4, 72 - file.length))}`);
      for (const [, run] of runs) out.push(...run, "");
    }
    return [...first, ...out, ...last].join("\n");
  };
  writeFileSync(
    resolve(dir, "src/data.asm"),
    part(
      ["boot.asm", "bios.asm", "console.asm", "video.asm", "tms.asm"],
      [
        "; The ROM's read-only data: one block after the table, gathered from the",
        "; code's source files in their assembly order. The block runs on through",
        "; gen/font.asm, data2.asm, gen/geom.asm and data3.asm. Nothing in it is",
        "; executed but the BIOS jump table, which cold boot copies to RAMBIOS.",
        "",
        "; The TMS9918 tables' constants (tms.asm).",
        ...tmsEqus,
        "",
        "ROMDATA:",
        "",
      ],
      [],
    ),
  );
  writeFileSync(resolve(dir, "src/data2.asm"), part(["lcd.asm", "vol.asm"], ["; The data block, continued (data.asm).", ""], []));
  writeFileSync(
    resolve(dir, "src/data3.asm"),
    part(["diag.asm", "cpm/ccp.asm", "cpm/bdos.asm", "hwsvc.asm", "glcd.asm", "cache.asm", "end.asm"], ["; The data block, continued (data.asm); the code follows it.", ""], ["ROMCODE:", ""]),
  );
  notes.push(`data runs: ${data.length}, ${data.reduce((n, [, r]) => n + r.filter((x) => DATA.test(x)).length, 0)} DB/DW lines`);

  // abi.asm, the reset jump and rom.asm.
  const abi = readFileSync(resolve(HERE, "abi.asm"), "utf8");
  writeFileSync(resolve(dir, "src/abi.asm"), opt.table === "front" ? abi : abi.replace("\nABITAB:", "\n        ORG     $FFDD\nABITAB:"));
  copyFileSync(resolve(HERE, "abi.inc"), resolve(dir, "src/abi.inc"));
  writeFileSync(
    resolve(dir, "src/reset.asm"),
    [
      "; At reset the latch is 00h, so the first 2 KiB of this image also appear",
      "; at 0000h. The CPU runs this jump there and leaves for COLD, in the ROM",
      "; proper, which turns the overlay off. Interrupts are off until then.",
      "",
      "        ORG     $C000",
      "RESET:  JP      COLD",
      "",
    ].join("\n"),
  );
  const code = lines(readFileSync(resolve(dir, "src/rom.asm"), "utf8"))
    .filter((x) => /^%INCLUDE/.test(x))
    .filter((x) => !/"(?:gen\/config|gen\/format|layout|ram|gen\/font|gen\/geom|end|abi)\.asm"/.test(x));
  const head = [
    "; TEC-OS ROM image, C000h-FFFFh: the reset jump, the table, one block of",
    "; read-only data and one block of code, with the free space at the end.",
    "; Include order is assembly order.",
    '%INCLUDE "gen/config.asm"',
    '%INCLUDE "gen/format.asm"',
    '%INCLUDE "layout.asm"',
    '%INCLUDE "ram.asm"',
    '%INCLUDE "reset.asm"',
  ];
  const block = ['%INCLUDE "data.asm"', '%INCLUDE "gen/font.asm"', '%INCLUDE "data2.asm"', '%INCLUDE "gen/geom.asm"', '%INCLUDE "data3.asm"'];
  const rom = opt.table === "front"
    ? [...head, '%INCLUDE "abi.asm"', ...block, ...code, '%INCLUDE "end.asm"']
    : [...head, ...block, ...code, '%INCLUDE "end.asm"', '%INCLUDE "abi.asm"'];
  writeFileSync(resolve(dir, "src/rom.asm"), rom.join("\n") + "\n");

  patchBuild(dir, opt);
  const adapted = opt.table === "front" ? adapt(dir) : {};
  return { dir, notes, options: opt, adapted };
}

// ---- tools/build.mjs --------------------------------------------------------

/** The draft's build checks and census: the brief's, from the symbol table. */
function patchBuild(dir, opt) {
  const path = resolve(dir, "tools/build.mjs");
  let t = readFileSync(path, "utf8");
  const swap = (a, b) => {
    if (!t.includes(a)) throw new Error(`build.mjs: no ${a.slice(0, 50)}`);
    t = t.replace(a, b);
  };
  const front = opt.table === "front";
  swap(
    `  check(at("INT38") === 0xc038, "INT38 must be at C038h");
  check(at("COLD") < 0xc800, "cold boot entry must be inside the overlay window");
  check(at("CODEEND") <= at("ABITAB"), "code overruns the table at FF00h");
  check(at("ABITAB") === 0xff00, "ABI table must be at FF00h");`,
    front
      ? `  check(at("ABITAB") === 0xc003, "the table must be at C003h");
  check(at("ABIEND") === at("ROMDATA"), "the data block must follow the table");
  check(at("ROMDATA") <= at("ROMCODE") && at("ROMCODE") <= at("CODEEND"), "the table, the data and the code, in that order");
  check(at("CODEEND") <= 0x10000, "the code overruns the ROM");
  checkAbiInc(at);
  checkNoOldAddress();`
      : `  check(at("ROMDATA") === 0xc003, "the data block must follow the reset jump");
  check(at("ROMDATA") <= at("ROMCODE") && at("ROMCODE") <= at("CODEEND"), "the data and the code, in that order");
  check(at("CODEEND") <= at("ABITAB"), "the code overruns the table");`,
  );
  swap(`  check((at("BENTRY") - at("BDOSBAS")) === 6, "BDOS entry is six bytes into the BDOS");\n`, "");
  const romEnd = front ? "0x10000" : `at("ABITAB")`;
  swap(
    /    rom: \{\n      bytes: ROM_SIZE,[\s\S]*?\.map\(\(\[label, start, end\]\) => \(\{ label, start, end, bytes: end - start \}\)\),\n    \},\n/.exec(t)[0],
    `    rom: {
      bytes: ROM_SIZE,
      used: at("CODEEND") - ROM_START + (${front ? "0" : 'at("ABIEND") - at("ABITAB")'}),
      free: ${romEnd} - at("CODEEND")${front ? "" : ' + (0x10000 - at("ABIEND"))'},
      regions: [
        ["reset jump", at("RESET"), at("RESET") + 3],
        ["table", at("ABITAB"), at("ABIEND")],
        ["data", at("ROMDATA"), at("ROMCODE")],
        ["code", at("ROMCODE"), at("CODEEND")],
        ["free", at("CODEEND"), ${romEnd}],
      ].map(([label, start, end]) => ({ label, start, end, bytes: end - start })),
    },
`,
  );
  swap(
    "let currentDefinitions = {};",
    `let currentDefinitions = {};

/** src/abi.inc, written by hand, against the symbol table: each EQU names a
 *  label of abi.asm at the same address, and every label there has one. */
function checkAbiInc(at) {
  const inc = readFileSync(resolve(SRC, "abi.inc"), "utf8");
  const equs = [...inc.matchAll(/^(\\w+)\\s+EQU\\s+\\$([0-9A-F]{4})\\b/gim)].map((m) => [m[1].toUpperCase(), parseInt(m[2], 16)]);
  for (const [name, value] of equs) check(at(name) === value, \`abi.inc: \${name} is \${hex(value)}, the ROM has \${hex(at(name))}\`);
  const labels = [...readFileSync(resolve(SRC, "abi.asm"), "utf8").matchAll(/^(\\w+):/gm)].map((m) => m[1].toUpperCase());
  for (const l of labels) check(equs.some(([n]) => n === l), \`abi.inc has no \${l}\`);
}

/** No .asm file of the product names an address of the old table, $FF00-$FF27. */
function checkNoOldAddress() {
  const dirs = [SRC, resolve(ROOT, "drivers"), resolve(ROOT, "test/programs")];
  for (const d of dirs) {
    for (const f of readdirSync(d).filter((n) => n.endsWith(".asm"))) {
      const text = readFileSync(resolve(d, f), "utf8");
      const m = /\\$FF(?:[01][0-9A-F]|2[0-7])\\b/i.exec(text);
      check(!m, \`\${f} names \${m?.[0]}, an address of the old table\`);
    }
  }
}`,
  );
  swap('import { mkdirSync, writeFileSync, readFileSync } from "node:fs";', 'import { mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";');
  writeFileSync(path, t);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name = "draft", ...kv] = process.argv.slice(2);
  const { dir, notes } = draftTree(name, Object.fromEntries(kv.map((x) => x.split("="))));
  console.log(notes.join("\n"));
  const err = build(dir, ["debug80"]);
  console.log(err ?? "built");
}
