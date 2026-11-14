// Shell stage 2: SHELL.SVC's CD on four equal drives, the drive and volume
// in the prompt, DIR with each file's size and its cost, CLS, ECHO and
// PAUSE, a script's own drive, the shell's size, stacks and TPA, and the
// console read's cost with write-behind on the logged drive, and the
// starter card of four drives. Emulator evidence; each mutant is built and
// run here, one at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContainer, descriptorAt, headerChecksum, parseContainer } from "../tools/lib/container.mjs";
import { Machine } from "./lib/machine.mjs";
import { GLCD_SVC, TEST_CLOCK, boot, romFor, standardCard, volume, withDisplay } from "./lib/fixtures.mjs";
import { mon3Svc } from "./lib/mon3.mjs";
import { check, pinned } from "./lib/inputs.mjs";
import { MUTANTS } from "./lib/coalesce.mjs";
import { cacheState, fileBlock } from "./lib/cache-pending.mjs";
import { publicContext } from "./lib/public-caller.mjs";
import { SHELL, at, code, owners, pageOf, shellCard, shellMachine, shellVariant, word } from "./lib/shell.mjs";

const P = /\r\n\d*[A-P](:\S*)?>$/;
const sym = SHELL.symbols;
const run = (m, line) => at(m, line, { re: P });

/** The starter card's volumes on four drives: SYSTEM A:, WORK B:, PROJECTS C:, GAMES and SPARE on none. */
const four = ({ drives = 4 } = {}) =>
  createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
      { geometry: "G1M", label: "PROJECTS", mount: "C" },
      { geometry: "G1M", label: "GAMES" },
      { geometry: "G1M", label: "SPARE" },
    ],
    drives ? { drives } : {},
  );
const script = (...lines) => Buffer.from(lines.map((l) => `${l}\r\n`).join("") + "\x1a", "latin1");

/** A four-drive card with the shell, FILES on A:, and STARTUP's lines after SHELL.SVC; SHELL a variant's file. */
function machine({ files = {}, startup = [], shell, image = four(), opts = {} } = {}) {
  shellCard(files, { startup: ["SHELL.SVC", ...startup], image, ...(shell ? { shell } : {}) });
  return shellMachine(image, opts);
}

/** How often M's PC is at PC while F runs, where TEST holds. */
function hits(m, pc, f, test = () => true) {
  let n = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === pc && test()) n += 1;
    return step();
  };
  try {
    f();
  } finally {
    m.step = step;
  }
  return n;
}

/** Whether the line and all it started are done: no piece, script or startup file left. */
function quiet(m, s = sym) {
  const p = pageOf(m);
  return !p || (word(m, p + s.LPOS) === 0 && m.read(p + s.SOPEN) === 0 && m.read(p + s.STSKIP) === 0);
}
/** Type LINE and run until it and every line it started are done. */
function runAll(m, line, s) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => m.ready() && quiet(m, s) && P.test(m.text(m.mark)), 900_000_000, line);
  return m.text(m.mark);
}

/** The card refusing every block write while the flag's on is true. */
function refusing(m) {
  const sd = m.sd;
  const commit = sd.commitWrite.bind(sd);
  const f = { on: false };
  sd.commitWrite = () => {
    if (!f.on) return commit();
    sd.writeState = null;
    sd.pendingResponse = [0x0d, 0xff];
    sd.delayBytes = 1;
  };
  return f;
}

// --- S2-6 CD -----------------------------------------------------------------

test("S2-6 cd name", () => {
  const m = machine();
  assert.match(run(m, "CD GAMES"), /\r\nA:GAMES\r\nA:GAMES>$/, "on the current drive, A: included");
  assert.equal(code(m), 0);
  run(m, "B:");
  assert.match(run(m, "cd spare"), /\r\nB:SPARE\r\nB:SPARE>$/, "folded, on B:");
});

test("S2-6 cd drive name", () => {
  const m = machine();
  assert.match(run(m, "CD D:SPARE"), /\r\nD:SPARE\r\nA:SYSTEM>$/, "D: changed, the logged drive kept");
  assert.equal(code(m), 0);
  assert.match(run(m, "CD ?"), /SPARE +D:/);
});

test("S2-6 cd shows", () => {
  const m = machine();
  assert.match(run(m, "CD"), /\r\nA:SYSTEM\r\nA:SYSTEM>$/, "CD alone");
  assert.match(run(m, "CD C:"), /\r\nC:PROJECTS\r\nA:SYSTEM>$/, "CD C:");
  assert.match(run(m, "CD D:"), /\r\nD:\r\nA:SYSTEM>$/, "a drive with no volume");
  assert.equal(code(m), 0);
});

test("S2-6 cd list", () => {
  const m = machine();
  const t = run(m, "CD ?");
  assert.match(t, /\r\nSYSTEM +A:\r\nWORK +B:\r\nPROJECTS +C:\r\nGAMES *\r\nSPARE *\r\nA:SYSTEM>$/, "each volume in table order, with its drive");
  assert.equal(code(m), 0);
});

test("S2-6 already there", () => {
  const m = machine();
  const bentry = m.sym("BENTRY");
  const resets = (line) => hits(m, bentry, () => run(m, line), () => m.cpu.cpu.c === 37);
  assert.equal(resets("CD SYSTEM"), 0, "the volume already there: no BDOS 37");
  assert.match(m.text(m.mark), /\r\nA:SYSTEM\r\n/);
  assert.equal(code(m), 0);
  assert.equal(resets("CD C:GAMES"), 1, "a mount: one BDOS 37");
});

test("S2-6 on another drive", () => {
  const m = machine();
  run(m, "B:");
  assert.match(run(m, "CD SYSTEM"), /\r\nSYSTEM is on A:\r\n/);
  assert.equal(code(m), 0xff00);
  assert.match(run(m, "CD"), /\r\nB:WORK\r\n/, "B: keeps its volume");
});

test("S2-6 refusals", () => {
  const m = machine();
  for (const [line, want] of [
    ["CD NOSUCH", /\r\nNOSUCH\?\r\n/],
    ["CD TOOLONGNAME1", /\r\nCD\?\r\n/],
    ["CD E:GAMES", /\r\nCD\?\r\n/],
    ["CD GAMES X", /\r\nCD\?\r\n/],
    ["CD ? X", /\r\nCD\?\r\n/],
  ]) {
    assert.match(run(m, line), want, line);
    assert.equal(code(m), 0xff00, `${line}: FF00h`);
  }
  assert.match(run(m, "CD ?"), /SYSTEM +A:\r\nWORK +B:\r\nPROJECTS +C:\r\nGAMES *\r\nSPARE *\r\n/, "nothing moved");
});

test("S2-6 cannot mount", () => {
  // With no drives field, C: has a G1M-sized vector: WORK, a G8M, cannot go there.
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G1M", label: "PROJECTS", mount: "C" },
    { geometry: "G8M", label: "WORK" },
  ]);
  const m = machine({ image });
  assert.match(run(m, "CD C:WORK"), /\r\nCD FAILED\r\n/);
  assert.equal(code(m), 0xff00);
  assert.match(run(m, "CD C:"), /\r\nC:PROJECTS\r\n/, "C: keeps its volume");
});

test("S2-6 mutant: M3, CD without its other-drive refusal, mounts a volume twice and is refused", async () => {
  const v = await shellVariant([["  inc a          ; FFh: on no drive\n  jr nz,CDELSE   ; on another drive", "  inc a\n  nop\n  nop"]]);
  const m = machine({ shell: v.file });
  run(m, "B:");
  const t = run(m, "CD SYSTEM");
  assert.doesNotMatch(t, /SYSTEM is on A:/);
  assert.match(t, /CD FAILED/);
});

test("S2-6 mutant: MR, CD of the volume already there going on to mount it, is refused as on another drive", async () => {
  const v = await shellVariant([["  jr z,CDSHOW    ; already there", "  nop\n  nop"]]);
  const m = machine({ shell: v.file });
  assert.match(run(m, "CD SYSTEM"), /SYSTEM is on A:/);
  assert.equal(code(m), 0xff00);
});

test("S2-6 cd a:", () => {
  const m = machine();
  run(m, "B:");
  assert.match(run(m, "CD A:WORK"), /\r\nWORK is on B:\r\n/);
  run(m, "CD B:GAMES");
  assert.match(run(m, "CD A:WORK"), /\r\nA:WORK\r\n/);
  assert.match(run(m, "SAY"), /\r\nSAY\?\r\n/, "a command on SYSTEM is gone with it");
  run(m, "CD A:SYSTEM");
  assert.doesNotMatch(run(m, "SAY"), /SAY\?/, "and back");
});

test("S2-6 cd a: and reset", () => {
  const image = four();
  const m = machine({ image });
  run(m, "CD A:GAMES");
  m.reset();
  m.runUntil(() => m.ready() && /\r\nA>$/.test(m.text(m.mark)), 900_000_000, "the prompt after the reset");
  assert.equal(pageOf(m), 0, "a recognised reset keeps GAMES on A:, which has no SHELL.SVC");
  assert.match(m.text(m.mark), /\r\nA>$/, "the bare prompt");
  // Power off and on: the card's own drives, and the shell again.
  const { rom, symbols } = romFor();
  const n = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK });
  n.runUntil(() => n.ready() && /\r\nA:SYSTEM>$/.test(n.text(0)), 900_000_000, "the prompt after power on");
  assert.ok(pageOf(n) > 0, "the shell installed");
});

/** CD alone after CD ?, under SHELL (a variant's file): its text. */
function cdAfterList(shell) {
  const m = machine({ shell });
  run(m, "CD ?");
  return run(m, "CD");
}

test("S2-6 cd after cd ?", () => {
  assert.match(cdAfterList(), /^CD\r\r\nA:SYSTEM\r\nA:SYSTEM>$/, "d:NAME alone, no list");
});

test("S2-6 mutant: the prompt's walk keeping CD ?'s list flag lists the card inside CD's output", async () => {
  const v = await shellVariant([["  call z,VWALKQ  ; the labels first", "  call z,VWALK"]]);
  assert.match(cdAfterList(v.file), /WORK +B:/);
});

/**
 * On a card of more than a page of volumes, logged on B:, CD ? stopped by ^C
 * at [more], then a line: the prompts after it, under SHELL (a variant's file).
 */
function listStopped(shell) {
  const vols = [{ geometry: "G1M", label: "SYSTEM", mount: "A" }];
  for (let i = 1; i < 29; i += 1) vols.push({ geometry: "G1M", label: `V${i}` });
  vols.push({ geometry: "G1M", label: "LAST", mount: "B" });
  const m = machine({ image: createContainer(vols, { drives: 4 }), shell });
  run(m, "B:");
  m.mark = m.output.length;
  m.type("CD ?\r");
  m.runUntil(() => /\[more\]$/.test(m.text(m.mark)), 2_000_000_000, "[more]");
  m.type("\x03");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 2_000_000_000, "the prompt");
  return { stopped: m.text(m.mark), next: run(m, "ECHO x") };
}

test("S2-6 cd list stopped", () => {
  const r = listStopped();
  assert.match(r.stopped, /\r\nB:LAST>$/, "the prompt after the stopped list names B:'s volume");
  assert.match(r.next, /\r\nB:LAST>$/);
});

test("S2-6 mutant: a CD ? stopped at [more] leaving its part-read labels valid shows B:>", async () => {
  const v = await shellVariant([["  jr c,VWSTOP    ; stopped", "  ret c"]]);
  assert.match(listStopped(v.file).next, /\r\nB:>$/);
});

// --- S2-4's CD row: a mount whose flush fails --------------------------------

test("S2-4 cd refused on a failed flush", () => {
  const main = romFor().symbols.get("MAINLOOP");
  // WR writes 32 records to A:, logged and so held behind, and returns with
  // no warm boot; the card refuses from its return, so the lines are kept.
  const wr = Uint8Array.from([0x11, 0x5c, 0x00, 0x0e, 22, 0xcd, 0x05, 0x00, 0x06, 32,
    0xc5, 0x11, 0x5c, 0x00, 0x0e, 21, 0xcd, 0x05, 0x00, 0xc1, 0x10, 0xf4, 0xc3, main & 0xff, main >> 8]);
  const m = machine({ files: { "WR.COM": wr } });
  const f = refusing(m);
  m.mark = m.output.length;
  m.type("WR W.DAT\r");
  m.runUntil(() => m.pc === main, 400_000_000, "WR's return");
  f.on = true;
  m.runUntil(() => m.ready() && /[A-P](:\S*)?>$/.test(m.text(m.mark)), 400_000_000, "the prompt");
  assert.match(run(m, "CD D:SPARE"), /\r\nCD FAILED\r\n/);
  assert.equal(code(m), 0xff00);
  f.on = false;
  assert.match(run(m, "CD D:"), /\r\nD:\r\n/, "D: keeps its volume, none");
});

// --- S2-7 CD in scripts, and the script's drive ------------------------------

test("S2-7 cd of the script's drive", () => {
  const m = machine({ files: { "G.CMD": script("CD A:GAMES", "ECHO after", "CD D:GAMES", "ECHO done") } });
  const t = runAll(m, "G.CMD");
  assert.match(t, /CD\?\r\n[\s\S]*after\r\n[\s\S]*D:GAMES\r\n[\s\S]*done\r\n/, "refused, and the script goes on");
  assert.match(run(m, "CD"), /\r\nA:SYSTEM\r\n/);
});

/** A script of more than one record that changes drive: what of it runs, under SHELL (a variant's file and symbols). */
function driveChangeScript(shell) {
  const lines = ["ECHO one", "B:", ...Array.from({ length: 4 }, (_, i) => `; ${"-".repeat(60)} ${i}`), "ECHO two", "A:"];
  const m = machine({ files: { "S.CMD": script(...lines) }, shell: shell?.file });
  return runAll(m, "S.CMD", shell?.symbols);
}

test("S2-7 drive change in a script", () => {
  const t = driveChangeScript();
  assert.match(t, /one\r\n[\s\S]*B:WORK>[\s\S]*two\r\n[\s\S]*A:SYSTEM>$/, "every line from the script's own drive");
});

test("S2-7 mutant: M5, the script's FCB left on drive 0, reads its next record from the new drive", async () => {
  const v = await shellVariant([["  ld a,(SFCB)\n  or a\n  jr nz,CS1      ; a drive named", "  ld a,1\n  or a\n  jr nz,CS1"]]);
  assert.doesNotMatch(driveChangeScript(v), /two\r\n/);
});

test("S2-7 mutant: without the script-drive refusal, CD of the script's own drive is taken", async () => {
  const v = await shellVariant([["  jp z,BADW      ; the script's own", "  nop\n  nop\n  nop"]]);
  const m = machine({ files: { "G.CMD": script("CD A:GAMES", "ECHO after") }, shell: v.file });
  m.mark = m.output.length;
  m.type("G.CMD\r");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 900_000_000, "the script");
  assert.doesNotMatch(m.text(m.mark), /CD\?/);
});

test("S2-7 cd in startup", () => {
  const image = four();
  shellCard({}, { image, startup: ["SHELL.SVC", "CD C:GAMES", "ECHO after"] });
  const m = shellMachine(image, { noWait: true });
  m.runUntil(() => m.ready() && quiet(m) && P.test(m.text(0)), 900_000_000, "the startup file's end");
  assert.match(m.text(0), /C:GAMES\r\n[\s\S]*after\r\n/);
});

// --- S2-8 The prompt -----------------------------------------------------------

test("S2-8 prompt", () => {
  const m = machine();
  assert.match(m.text(0), /\r\nA:SYSTEM>$/, "the first prompt");
  run(m, "B:");
  run(m, "CD GAMES");
  assert.match(m.text(m.mark), /\r\nB:GAMES>$/);
  // A drive with no volume: its label blank in the table.
  for (let i = 0; i < 11; i += 1) m.write(pageOf(m) + sym.LBL + 11 + i, 0x20);
  assert.match(run(m, ""), /\r\nB:>$/, "d:>");
});

test("S2-8 prompt with user", () => {
  const m = machine();
  run(m, "B:");
  assert.match(run(m, "USER 3"), /\r\n3B:WORK>$/);
});

test("S2-8 bare prompt", () => {
  const image = four();
  shellCard({}, { image, startup: [] });
  const m = shellMachine(image);
  assert.match(m.text(0), /\r\nA>$/, "with no shell, the ROM's prompt");
  assert.match(run(m, "B:"), /\r\nB>$/);
});

/** TNDESC's calls through four commands and their prompts, and through CD alone, on SHELL (a variant's file). */
function describes(shell) {
  const m = machine({ shell });
  const at = m.sym("VSDSC");
  const prompts = hits(m, at, () => ["ECHO a", "", "B:", "DIR"].forEach((l) => run(m, l)));
  const cd = hits(m, at, () => run(m, "CD"));
  return { prompts, cd };
}

test("S2-8 labels not read at each prompt", () => {
  assert.deepEqual(describes(), { prompts: 0, cd: 6 }, "none at a prompt; CD alone reads the five and is refused the sixth index");
});

test("S2-8 mutant: MW, DRVLBL walking whatever the table holds, reads the card at every prompt", async () => {
  const v = await shellVariant([["  ld a,(LBL)\n  or a\n  call z,VWALKQ", "  xor a\n  or a\n  call z,VWALKQ"]]);
  assert.ok(describes(v.file).prompts > 0);
});

test("S2-8 mutant: CD NAME not writing the label table leaves the prompt on the old volume", async () => {
  const v = await shellVariant([["  ldir           ; copied in", "  nop\n  nop"]]);
  const m = machine({ shell: v.file });
  assert.doesNotMatch(run(m, "CD GAMES"), /\r\nA:GAMES>$/);
});

// --- S2-9 DIR with sizes ------------------------------------------------------

// SP: makes the FCB's file and writes its record 1000 by BDOS 34, then
// closes it: a sparse file. S35: BDOS 35 on the FCB, its result left at
// 007Dh.
const SP = Uint8Array.from([0x11, 0x5c, 0x00, 0x0e, 22, 0xcd, 0x05, 0x00, 0x21, 0xe8, 0x03, 0x22, 0x7d, 0x00, 0xaf, 0x32, 0x7f, 0x00,
  0x11, 0x5c, 0x00, 0x0e, 34, 0xcd, 0x05, 0x00, 0x11, 0x5c, 0x00, 0x0e, 16, 0xcd, 0x05, 0x00, 0xc9]);
const S35 = Uint8Array.from([0x11, 0x5c, 0x00, 0x0e, 35, 0xcd, 0x05, 0x00, 0xc9]);
const bdos35 = (m, name) => (run(m, `S35 ${name}`), m.read(0x7d) | (m.read(0x7e) << 8) | (m.read(0x7f) << 16));
/** DIR's rows as [name.type, size], past the pager's [more] and its erasing. */
const rows = (t) =>
  t
    .split(/\r\n|\r/)
    .map((l) => /^(\S+) *\.(\S*) +(\d+)$/.exec(l.replace(/^.*\[more\]/, "").trim()))
    .filter(Boolean)
    .map(([, n, ty, s]) => [`${n}.${ty}`, +s]);

/** Type LINE and run to the prompt, answering each [more] with a space. */
function listing(m, line) {
  m.mark = m.output.length;
  m.type(`${line}\r`);
  const more = () => /\[more\]$/.test(m.text(m.mark));
  for (;;) {
    m.runUntil(() => (m.waitingForInput() && more()) || (m.ready() && P.test(m.text(m.mark))), 20_000_000_000, line);
    if (!more()) return m.text(m.mark);
    const len = m.output.length;
    m.type(" ");
    m.runUntil(() => m.output.length > len + 12, 400_000_000, "[more]");
  }
}

/** The starter card's A: files under the shell, a sparse file and BIG.DAT of four G8M entries on B:. */
function sized(shell) {
  const image = four();
  const a = volume(image, "A");
  const starter = new Uint8Array(readFileSync(new URL("../dist/starter.img", import.meta.url)));
  const s = volume(starter, "A");
  for (const f of s.list()) a.write(f.name, s.read(f.name));
  volume(image, "B").write("BIG.DAT", new Uint8Array(100 * 1024).fill(2));
  const m = machine({ image, files: { "SP.COM": SP, "S35.COM": S35 }, shell });
  run(m, "SP X.DAT");
  return m;
}

test("S2-9 sizes are bdos 35's", () => {
  const m = sized();
  const t = listing(m, "DIR");
  const list = rows(t);
  assert.ok(list.length > 15, `${list.length} rows`);
  for (const [name, size] of list) assert.equal(size, bdos35(m, name) * 128, name);
  assert.deepEqual(rows(run(m, "DIR X.DAT")), [["X.DAT", 128128]], "the sparse file");
  assert.equal(bdos35(m, "X.DAT") * 128, 128128);
  assert.deepEqual(rows(run(m, "DIR B:BIG.DAT")), [["BIG.DAT", 102400]], "four G8M entries");
});

test("S2-9 mutant: M4, the size from the entry with no BDOS 35, misses the sparse file's", async () => {
  const v = await shellVariant([["  call DOSSEQ    ; 35: its size\n  DB 35*2+0      ; its size", "  ld hl,0\n  ld (FCBONE+34),hl"]]);
  assert.notDeepEqual(rows(run(sized(v.file), "DIR X.DAT")), [["X.DAT", 128128]]);
});

test("S2-9 mutant: the marks pass left out sizes the sparse file and BIG.DAT from their first entries", async () => {
  const v = await shellVariant([["  or (hl)        ; marked\n  ld (hl),a      ; set", "  or (hl)        ; marked\n  nop"]]);
  const m = sized(v.file);
  assert.notDeepEqual(rows(run(m, "DIR X.DAT")), [["X.DAT", 128128]]);
  assert.notDeepEqual(rows(run(m, "DIR B:BIG.DAT")), [["BIG.DAT", 102400]]);
});

test("S2-9 summary", () => {
  const m = sized();
  const t = listing(m, "DIR");
  const list = rows(t);
  const sum = /\r\n(\d+) files, (\d+) bytes\r\n/.exec(t);
  assert.ok(sum, t.slice(-120));
  assert.deepEqual([+sum[1], +sum[2]], [list.length, list.reduce((s, [, n]) => s + n, 0)], "the count and the rows' sum");
  assert.match(run(m, "DIR X.DAT"), /\r\n1 file, 128128 bytes\r\n/, "singular for one");
});

test("S2-9 free", () => {
  const m = sized();
  const free = /\r\n(\d+) free on A:SYSTEM\r\n/.exec(listing(m, "DIR"));
  assert.ok(free);
  const k = /(\d+)K free/.exec(listing(m, "DIR /W"));
  assert.equal(+free[1], +k[1] * 1024, "BDOS 46's records times 128, DIR /W's K free times 1,024");
  assert.match(run(m, "DIR B:BIG.DAT"), /\r\n\d+ free on B:WORK\r\n/, "the drive's volume");
});

/** WORK on B: with F00.DAT to F29.DAT of 200 bytes, a hidden HID.SYS and BIG.DAT of 100 KiB. */
function onB() {
  const image = four();
  const b = volume(image, "B");
  for (let i = 0; i < 30; i += 1) b.write(`F${String(i).padStart(2, "0")}.DAT`, new Uint8Array(200).fill(1));
  b.write("HID.SYS", new Uint8Array(300), { system: true });
  b.write("BIG.DAT", new Uint8Array(100 * 1024).fill(2));
  return machine({ image });
}

test("S2-9 pattern and drive", () => {
  const m = onB();
  const t = run(m, "DIR b:f1?.dat");
  assert.equal(rows(t).length, 10);
  assert.ok(rows(t).every(([n, s]) => /^F1\d\.DAT$/.test(n) && s === 256), t);
  assert.match(t, /\r\n10 files, 2560 bytes\r\n/);
});

test("S2-9 hidden", () => {
  const m = onB();
  assert.match(run(m, "DIR B:HID.SYS"), /\r\nNO FILE\r\n/, "a SYS file is passed over");
  assert.ok(!rows(listing(m, "DIR B:*.*")).some(([n]) => n === "HID.SYS"));
});

test("S2-9 no file", () => {
  const m = machine();
  assert.match(run(m, "DIR *.ZZZ"), /\r\nNO FILE\r\n/);
  assert.equal(code(m), 0xff00);
  assert.match(run(m, "DIR C:"), /\r\nNO FILE\r\n/, "an empty drive");
});

test("S2-9 dir /w", () => {
  const m = machine();
  const t = run(m, "dir /w");
  assert.match(t, /K free/, "the ROM's wide listing");
  assert.equal(rows(t).length, 0);
  assert.match(run(m, "DIR /X"), /\r\nDIR\?\r\n/, "another switch refused");
});

test("S2-9 more", () => {
  const m = onB();
  m.mark = m.output.length;
  m.type("DIR B:\r");
  m.runUntil(() => /\[more\]$/.test(m.text(m.mark)), 400_000_000, "[more]");
  const before = rows(m.text(m.mark)).length;
  m.type(" ");
  m.runUntil(() => m.ready() && P.test(m.text(m.mark)), 400_000_000, "the end");
  assert.ok(before >= 20 && before < 31, `${before} rows before [more]`);
  assert.match(m.text(m.mark), /\r\n31 files, /);
});

test("S2-9 bare dir", () => {
  const image = four();
  shellCard({}, { image, startup: [] });
  const m = shellMachine(image);
  const t = run(m, "DIR");
  assert.match(t, /K free/, "with no shell, the ROM's DIR");
  assert.equal(rows(t).length, 0);
});

// The timed rows: B:WORK, a G8M, the names differing only in their digits;
// emulator cycles at 4 MHz on the serial console, [more] answered at once.

/** On B:, LARGE files of 40 KiB (two entries each), N of one record and BIG.DAT of 100 KiB: DIR's and DIR /W's milliseconds, and whether every size is right. */
function timed({ n = 0, large = 0, shell } = {}) {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B" }], { drives: 4 });
  const b = volume(image, "B");
  for (let i = 0; i < large; i += 1) b.write(`L${String(i).padStart(4, "0")}.DAT`, new Uint8Array(40 * 1024).fill(3));
  for (let i = 0; i < n; i += 1) b.write(`F${String(i).padStart(4, "0")}.DAT`, new Uint8Array(128).fill(1));
  b.write("BIG.DAT", new Uint8Array(100 * 1024).fill(2));
  const m = machine({ image, shell });
  run(m, "B:");
  listing(m, "DIR /W");
  let c = m.cycles;
  listing(m, "DIR /W");
  const wide = (m.cycles - c) / 4000;
  c = m.cycles;
  const t = listing(m, "DIR");
  const dir = (m.cycles - c) / 4000;
  const want = (name) => (name.startsWith("L") ? 40960 : name.startsWith("F") ? 128 : name === "BIG.DAT" ? 102400 : -1);
  const list = rows(t);
  return { dir, wide, ratio: dir / wide, files: list.length, right: list.length === n + large + 1 && list.every(([nm, s]) => s === want(nm)) };
}

test("S2-9 g8m time", { timeout: 1_800_000 }, (t) => {
  const r = timed({ n: 451 });
  t.diagnostic(JSON.stringify(r));
  assert.ok(r.right, "every size right");
  assert.ok(r.ratio <= 2.5, `DIR ${r.dir.toFixed(0)} ms, ${r.ratio.toFixed(2)} times DIR /W's ${r.wide.toFixed(0)}`);
});

test("S2-9 mutant: the summed hash puts names that differ in their digits on few marks, past 2.5 times DIR /W", { timeout: 1_800_000 }, async (t) => {
  const v = await shellVariant([["  rlca           ; rotated\n  ld c,a\n  ld a,(hl)      ; the name's byte\n  and $7F        ; no attribute\n  xor c", "  ld c,a\n  ld a,(hl)\n  and $7F\n  add a,c"]]);
  const r = timed({ n: 451, shell: v.file });
  t.diagnostic(JSON.stringify(r));
  assert.ok(r.ratio > 2.5, `${r.ratio.toFixed(2)}`);
});

test("S2-9 g8m large files", { timeout: 1_800_000 }, (t) => {
  const r = timed({ n: 251, large: 100 });
  t.diagnostic(JSON.stringify(r));
  assert.ok(r.right, "every size right");
  assert.ok(r.ratio <= 8, `DIR ${r.dir.toFixed(0)} ms, ${r.ratio.toFixed(2)} times DIR /W's ${r.wide.toFixed(0)}`);
});

test("S2-9 g8m all large", { timeout: 1_800_000 }, (t) => {
  const r = timed({ large: 180 });
  t.diagnostic(JSON.stringify(r));
  assert.ok(r.right, "every size right");
  assert.ok(r.ratio <= 18, `DIR ${r.dir.toFixed(0)} ms, ${r.ratio.toFixed(2)} times DIR /W's ${r.wide.toFixed(0)}`);
});

// Pass B beginning the search again twice for each marked file: one more
// walk over the matches taken, each time.
test("S2-9 mutant: pass B restarting twice for each file takes the 180 large files past 18 times DIR /W", { timeout: 3_600_000 }, async (t) => {
  const v = await shellVariant([["  ld a,1\n  ld (DRST),a    ; the search again", "  ld a,1\n  ld (DRST),a\n  call DSRCH\n  ld a,1\n  ld (DRST),a"]]);
  const r = timed({ large: 180, shell: v.file });
  t.diagnostic(JSON.stringify(r));
  assert.ok(r.ratio > 18, `${r.ratio.toFixed(2)}`);
});

// --- S2-10 CLS, ECHO and PAUSE ------------------------------------------------

test("S2-10 cls", () => {
  const image = four();
  const m = machine({ image, opts: { tms: true, matrix: true } });
  run(m, "ECHO one");
  run(m, "ECHO two");
  assert.ok(m.screen(80).filter((l) => l.trim()).length > 3);
  run(m, "CLS");
  const after = m.screen(80).filter((l) => l.trim());
  assert.equal(after.length, 1, JSON.stringify(after));
  assert.match(after[0], /A:SYSTEM>/, "the PICO9918's screen holds the prompt alone");
  const g = four();
  shellCard({ "GLCD.SVC": GLCD_SVC }, { image: g, startup: ["SHELL.SVC", "GLCD.SVC"] });
  const n = shellMachine(g, { matrix: true, glcd: true, noWait: true });
  n.runUntil(() => n.ready() && quiet(n) && n.read(n.sym("CONMOD")) === 3, 900_000_000, "the GLCD console");
  n.typeMatrix("ECHO one\r");
  n.runUntil(() => n.ready(), 400_000_000, "ECHO");
  n.typeMatrix("CLS\r");
  n.runUntil(() => n.ready() && quiet(n), 400_000_000, "CLS");
  const scr = n.glcdScreen().filter((l) => l.trim());
  assert.equal(scr.length, 1, JSON.stringify(scr));
  assert.match(scr[0], /A:SYSTEM>/, "the GLCD's screen holds the prompt alone");
});

/** ECHO's text under SHELL (a variant's file). */
const echo = (shell) => run(machine({ shell }), "ECHO Hello, World");

test("S2-10 echo", () => {
  assert.match(echo(), /\r\nHello, World\r\nA:SYSTEM>$/, "the text as typed");
  assert.equal(code(machine()), 0);
});

test("S2-10 mutant: MF, BUILTIN folding the whole piece, puts ECHO's text in upper case", async () => {
  const v = await shellVariant([["  call FOLDW     ; the word, upper case", "  call FOLD      ; the word, upper case"]]);
  assert.match(echo(v.file), /HELLO, WORLD/);
});

/** P.CMD's PAUSE (TEXT after it if given) then ECHO two, answered with KEY: the text and the code. */
function pause(key, { text = "", shell } = {}) {
  const m = machine({ files: { "P.CMD": script("ECHO one", `PAUSE${text}`, "ECHO two") }, shell });
  m.mark = m.output.length;
  m.type("P.CMD\r");
  const prompt = text ? new RegExp(`${text.trim()}$`) : /\[more\]$/;
  m.runUntil(() => prompt.test(m.text(m.mark)), 400_000_000, "PAUSE");
  m.type(key);
  m.runUntil(() => m.ready() && quiet(m, shell ? undefined : sym) && P.test(m.text(m.mark)), 900_000_000, "after PAUSE");
  return { text: m.text(m.mark), code: code(m) };
}

test("S2-10 pause", () => {
  const r = pause("x");
  assert.match(r.text, /one\r\n[\s\S]*PAUSE[\s\S]*\[more\][\s\S]*two\r\nA:SYSTEM>$/, "[more], then any key goes on");
  assert.equal(r.code, 0);
  assert.match(pause("x", { text: " Change the card" }).text, /\r\nChange the card[\s\S]*two\r\n/, "PAUSE text shows the text");
});

test("S2-10 pause ^C", () => {
  const r = pause("\x03");
  assert.doesNotMatch(r.text, /two/, "the script ends");
  assert.equal(r.code, 0xff00);
});

test("S2-10 mutant: MP, PAUSE ignoring ^C, runs the script's next line", async () => {
  const v = await shellVariant([["  cp 3           ; ^C?\n  jp nz,BDONE    ; any key but ^C", "  cp $FF\n  jp nz,BDONE"]]);
  const m = machine({ files: { "P.CMD": script("PAUSE", "ECHO two") }, shell: v.file });
  m.mark = m.output.length;
  m.type("P.CMD\r");
  m.runUntil(() => /\[more\]$/.test(m.text(m.mark)), 400_000_000, "PAUSE");
  m.type("\x03");
  m.runUntil(() => m.ready() && quiet(m, v.symbols) && P.test(m.text(m.mark)), 900_000_000, "after ^C");
  assert.match(m.text(m.mark), /two\r\n/);
});

test("S2-10 tail upper case", () => {
  // TL copies its tail at 0080h to 4000h.
  const TL = Uint8Array.from([0x21, 0x80, 0x00, 0x11, 0x00, 0x40, 0x01, 0x80, 0x00, 0xed, 0xb0, 0xc9]);
  const m = machine({ files: { "TL.COM": TL } });
  run(m, "tl hello World");
  const tail = String.fromCharCode(...Array.from({ length: m.read(0x4000) }, (_, i) => m.read(0x4001 + i)));
  assert.equal(tail, " HELLO WORLD", "a program's tail as the ROM folds it");
});

// --- S2-11 SHELL.SVC's size, stacks, the TPA and the console read's cost -------

const extra = (svc) => svc.file[8] | (svc.file[9] << 8);
const pages = (svc) => Math.ceil((svc.image + extra(svc)) / 256);

test("S2-11 size", (t) => {
  assert.ok(pages(SHELL) <= 15, `SHELL.SVC in 15 pages: ${SHELL.image} + ${extra(SHELL)}`);
  assert.ok(SHELL.image + extra(SHELL) <= 3840);
  assert.equal(sym.RING % 256, 0, "the ring's page aligned");
  // A reading, not a gate: 14 pages is the aim.
  t.diagnostic(`image ${SHELL.image}, file ${SHELL.file.length}, extra RAM ${extra(SHELL)}, ${pages(SHELL)} pages, ${sym.RING - sym.STKTOP} bytes of room; ${SHELL.image + extra(SHELL) - 14 * 256} bytes over 14 pages`);
});

test("S2-11 declared stacks", () => {
  assert.deepEqual([...SHELL.file.subarray(12, 15)], [6, 0, 0], "BDOS 6, BIOS 0, CCP 0");
});

/** A real thirty-block refused queue drives the shell's cold label walk. */
function deepestWalk(shell = SHELL) {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B" }], { drives: 4 });
  const { symbols } = romFor(), main = symbols.get("MAINLOOP");
  const wk = Uint8Array.from([0x1e, 0xff, 0x0e, 45, 0xcd, 5, 0,
    0x11, 0x5c, 0, 0x0e, 22, 0xcd, 5, 0, 0x06, 120,
    0xc5, 0x11, 0x5c, 0, 0x0e, 21, 0xcd, 5, 0, 0xc1, 0x10, 0xf4,
    0x0e, 1, 0xcd, 5, 0, 0xc3, main & 255, main >> 8]);
  const m = shellMachine(shellCard({ "WK.COM": wk }, { image, shell: shell.file }));
  const s = shell.symbols, page = pageOf(m), top = page + s.STKTOP, bottom = page + s.STKBOT, base = bottom - 16, size = top - bottom;
  assert.ok(page > 0); assert.equal(word(m, m.sym("SHOWN")), page + s.TABLE);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => m.read(page + i)), [0xc3, m.sym("BENTRY") & 255, m.sym("BENTRY") >> 8]);
  assert.deepEqual(volume(image, "A").read("SHELL.SVC").slice(0, shell.file.length), shell.file);
  assert.equal(volume(image, "A").find("K.DAT"), undefined);
  const expected = new Map(), allocations = new Map(), acknowledgements = [], attempts = [];
  let entered = 0, programmeSP, made = false, original, initialUsed, allocationBytes, input, beforeEntry = null, inputSP;
  const snapshot = label => {
    assert.ok(original && input); const state = cacheState(m);
    assert.deepEqual(image, original, `${label}: no accepted data reached the refusing card`);
    assert.equal(volume(image, "A").find("K.DAT").records, 0);
    assert.deepEqual(state.entries.map(e => e.block), [...expected.keys()]);
    for (const e of state.entries) { assert.equal(e.dirty, 1); assert.deepEqual(e.payload, expected.get(e.block)); }
    assert.deepEqual([state.pending, state.any], [0, 1]);
    return state;
  };
  const sd = m.sd, commit = sd.commitWrite.bind(sd);
  sd.commitWrite = () => {
    if (!original) return commit();
    const { start, buffer } = sd.writeState, block = start / 512, payload = Uint8Array.from(buffer);
    assert.ok(expected.has(block)); assert.deepEqual(payload, expected.get(block));
    sd.writeState = null; sd.pendingResponse = [0x0d, 0xff]; sd.delayBytes = 1;
    attempts.push({ block, payload }); assert.deepEqual(image, original);
  };
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100) {
      publicContext(m); assert.equal(++entered, 1); programmeSP = m.cpu.cpu.sp;
      assert.deepEqual(Uint8Array.from({ length: wk.length }, (_, i) => m.read(0x100 + i)), wk);
    }
    if (entered && m.pc === 0x107) { publicContext(m); assert.equal(m.cpu.cpu.sp, programmeSP); assert.equal(m.cpu.cpu.a, 0); assert.equal(m.read(m.sym("ERRMODE")), 0xff); }
    if (entered && m.pc === 0x10f) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, programmeSP); assert.ok(m.cpu.cpu.a <= 3); assert.equal(made, false); made = true;
      assert.equal(m.read(0x7c), 0); assert.equal(m.read(0x6b), 0); assert.equal(volume(image, "A").find("K.DAT").records, 0);
    }
    if (entered && m.pc === m.sym("BENTRY") && m.cpu.cpu.c === 21) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, programmeSP - 4); assert.equal(word(m, m.cpu.cpu.sp), 0x11a);
      assert.equal(m.cpu.cpu.d << 8 | m.cpu.cpu.e, 0x5c); assert.equal(word(m, m.sym("CURDMA")), 0x80);
      if (!original) {
        assert.ok(made); assert.equal(cacheState(m).queue.length, 0); original = Uint8Array.from(image);
        const fs = volume(original, "A"); initialUsed = new Set(fs.usedBlocks()); allocationBytes = fs.blockBytes;
        assert.equal(fs.wide, true); input = Uint8Array.from({ length: 128 }, (_, i) => m.read(0x80 + i)); assert.ok(input.some(Boolean));
      }
      assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x80 + i)), input);
    }
    if (entered && m.pc === 0x11a) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, programmeSP - 2);
      const record = acknowledgements.length; assert.ok(record < 120); assert.equal(m.cpu.cpu.a, 0); assert.equal(m.read(0x7c), record + 1);
      for (const name of ["CURDRV", "DSKCUR", "DEFDRV", "BOOTDRV"]) assert.equal(m.read(m.sym(name)), 0, `${name}: independent A case`);
      assert.equal(word(m, m.sym("DPHPTR")), m.sym("DPHTAB")); assert.equal(word(m, m.sym("DPBPTR")), word(m, m.sym("DPHTAB") + 10)); assert.equal(m.read(0x5c) & 31, 0);
      const slot = Math.floor(record / (allocationBytes / 128)), allocation = word(m, 0x5c + 16 + 2 * slot); assert.ok(slot < 8);
      if (!allocations.has(slot)) { assert.ok(!initialUsed.has(allocation)); assert.ok(![...allocations.values()].includes(allocation)); allocations.set(slot, allocation); }
      for (const [knownSlot, knownAllocation] of allocations) assert.equal(word(m, 0x5c + 16 + knownSlot * 2), knownAllocation);
      const block = fileBlock(m, original, record, 0x5c, "A"); if (!expected.has(block)) expected.set(block, new Uint8Array(512));
      expected.get(block).set(input, (record & 3) * 128); acknowledgements.push({ record, a: m.cpu.cpu.a, cr: m.read(0x7c), block }); snapshot(`ACK ${record}`);
    }
    if (entered && m.pc === m.sym("BENTRY") && m.cpu.cpu.c === 1) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, programmeSP - 2); assert.equal(word(m, m.cpu.cpu.sp), 0x122); inputSP = m.cpu.cpu.sp;
      assert.equal(acknowledgements.length, 120); assert.equal(expected.size, 30); beforeEntry = snapshot("before actual F1 entry"); assert.equal(beforeEntry.queue.length, 30);
    }
    return step();
  };
  const inputOwner = () => {
    assert.ok(m.classicBankIn); assert.equal(m.read(m.sym("HKDEP")), 1); assert.equal(m.read(m.sym("HKBUSY")), 0);
    assert.equal(word(m, m.sym("OLDSP")), inputSP); assert.equal(word(m, inputSP), 0x122);
  };
  m.mark = m.output.length; m.type("WK K.DAT\r");
  m.runUntil(() => m.pc === symbols.get("FNCIN"), 900_000_000, "actual 120-ACK programme F1 body");
  assert.ok(beforeEntry); inputOwner(); assert.equal(m.cpu.cpu.sp, m.sym("STKTOP") - 2); assert.equal(word(m, m.cpu.cpu.sp), m.sym("RETA"));
  assert.equal(snapshot("FNCIN after ordinary entry refusal").queue.length, 30); assert.ok(attempts.length > 0);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => m.read(m.sym("FNCIN") + 3 + i)), [0xcd, m.sym("GETCHAR") & 255, m.sym("GETCHAR") >> 8]);
  m.runUntil(() => m.pc === m.sym("GETCHAR"), 200_000_000, "owned GETCHAR for 120 ACKs"); inputOwner(); assert.equal(word(m, m.cpu.cpu.sp), m.sym("FNCIN") + 6);
  m.runUntil(() => m.pc >= m.sym("CINLP") && m.pc < m.sym("CINWE"), 200_000_000, "owned serial wait for 120 ACKs");
  inputOwner(); assert.equal(m.cpu.cpu.sp, m.sym("STKTOP") - 4); assert.equal(word(m, m.cpu.cpu.sp), m.sym("FNCIN") + 6);
  assert.equal(snapshot("owned input with all thirty retained").queue.length, 30);
  assert.ok(m.cpu.cpu.sp < base || m.cpu.cpu.sp >= top); assert.ok(inputSP < base || inputSP >= top);
  for (let address = base; address < top; address++) m.write(address, 0xa5);
  m.write(page + s.LBL, 0);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => m.read(page + s.LINE + 4 + i)), [0x31, top & 255, top >> 8]);
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => m.read(page + s.VW1 + i)), [0x7b, 0x32, (page + s.VIDX) & 255, (page + s.VIDX) >> 8, 0x21, (page + s.CFCB) & 255, (page + s.CFCB) >> 8, 0x0e, 11, 0xcd, m.sym("ABICALL") & 255, m.sym("ABICALL") >> 8]);
  const workerBottom = m.sym("HKSTKB"), workerTop = m.sym("HKSTKT"), workerGuard = Array.from({ length: 2 }, (_, i) => m.read(m.sym("HKGRD") + i));
  assert.equal(workerBottom - m.sym("HKGRD"), 2); assert.equal(workerTop - workerBottom, 56);
  assert.deepEqual(workerGuard, [0, 0], "cold workspace clear initializes the private guard");
  let shellLowSP = top, shellLowWrite = top, workerLow = workerTop, shellSamples = 0, frame = null, returnedKey = 0, inputCall = null;
  const lows = [], workerLows = [], scratchWrites = [], descriptors = []; let pendingDescriptor = null;
  const write = m.cpu.hardware.memWrite;
  const stackOpcode = bytes => [0xcd, 0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc, 0xc5, 0xd5, 0xe5, 0xf5, 0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff, 0xe3].includes(bytes[0]) || ([0xdd, 0xfd].includes(bytes[0]) && [0xe5, 0xe3].includes(bytes[1]));
  m.cpu.hardware.memWrite = (address, value) => {
    if (frame && m.classicBankIn) {
      const event = { address, value, callbackPC: m.cpu.cpu.pc, ...frame };
      if (address >= base && address < bottom) scratchWrites.push(event);
      if (stackOpcode(frame.bytes)) {
        if (address >= page && address < top && address < shellLowWrite) { shellLowWrite = address; lows.push(event); }
        if (address >= workerBottom && address < workerTop && address < workerLow) { workerLow = address; workerLows.push(event); }
      }
      if (address >= m.sym("HKGRD") && address < m.sym("HKGRD") + 2) assert.fail("private worker touched its guard");
    }
    return write(address, value);
  };
  const observedStep = m.step.bind(m);
  m.step = () => {
    frame = { instructionPC: m.pc, bytes: Array.from({ length: 3 }, (_, i) => m.read(m.pc + i)), sp: m.cpu.cpu.sp, depth: m.read(m.sym("HKDEP")), busy: m.read(m.sym("HKBUSY")) };
    if (m.classicBankIn && frame.sp >= page && frame.sp <= top) { shellSamples++; shellLowSP = Math.min(shellLowSP, frame.sp); }
    if (m.pc === 0x122) { publicContext(m); assert.equal(m.cpu.cpu.sp, programmeSP); assert.equal(m.cpu.cpu.a, 0x78); assert.equal(++returnedKey, 1); }
    if (m.pc === m.sym("ABICALL") && m.cpu.cpu.c === 11) {
      publicContext(m); assert.equal(pendingDescriptor, null); assert.equal(m.cpu.cpu.e, 0); assert.equal(m.cpu.cpu.h << 8 | m.cpu.cpu.l, page + s.CFCB);
      assert.equal(word(m, m.cpu.cpu.sp), page + s.VW1 + 12); assert.equal(snapshot("TNDESC real full-cache pressure").queue.length, 30);
      pendingDescriptor = { sp: m.cpu.cpu.sp, back: word(m, m.cpu.cpu.sp), attempts: attempts.length, allocations: [] };
    }
    if (pendingDescriptor && m.pc === m.sym("CTAKE")) {
      assert.ok(m.classicBankIn); assert.equal(m.read(m.sym("HKDEP")), 1); assert.equal(m.read(m.sym("HKBUSY")), 0);
      assert.deepEqual(Array.from({ length: 3 }, (_, i) => m.read(m.sym("CTAKE") + i)), [0xcd, m.sym("CTSCAN") & 255, m.sym("CTSCAN") >> 8]);
      assert.equal(snapshot("functional CTAKE with every line dirty").queue.length, 30);
      pendingDescriptor.allocations.push({ pc: m.pc, sp: m.cpu.cpu.sp, attemptsStart: attempts.length, passes: [] });
    }
    if (pendingDescriptor && m.pc === m.sym("CTPASS")) {
      assert.ok(m.classicBankIn); assert.equal(m.read(m.sym("HKDEP")), 1); assert.equal(m.read(m.sym("HKBUSY")), 0);
      const allocation = pendingDescriptor.allocations.at(-1); assert.ok(allocation);
      const state = snapshot("functional frozen allocation pass"); assert.equal(state.queue.length, 30); assert.deepEqual(state.round, state.queue);
      assert.equal(state.position, allocation.passes.length); assert.ok(state.position <= 30);
      assert.equal(attempts.length - allocation.attemptsStart, state.position);
      allocation.passes.push({ pc: m.pc, sp: m.cpu.cpu.sp, position: state.position, attempts: attempts.length });
    }
    if (pendingDescriptor && m.pc === pendingDescriptor.back) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, pendingDescriptor.sp + 2); assert.equal(m.cpu.cpu.flags.C, 1);
      assert.ok(pendingDescriptor.allocations.length > 0, "functional full-cache allocation ran beyond the ordinary entry attempt");
      for (const allocation of pendingDescriptor.allocations) assert.deepEqual(allocation.passes.map(p => p.position), Array.from({ length: 31 }, (_, i) => i));
      assert.ok(attempts.length > pendingDescriptor.attempts); descriptors.push({ ...pendingDescriptor, returnedSP: m.cpu.cpu.sp, carry: m.cpu.cpu.flags.C, attemptsMade: attempts.length - pendingDescriptor.attempts }); pendingDescriptor = null;
    }
    if (m.pc === m.sym("BENTRY") && m.cpu.cpu.c === 10) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, top - 2); assert.equal(m.cpu.cpu.d << 8 | m.cpu.cpu.e, page + s.LBUF);
      const back = word(m, m.cpu.cpu.sp); assert.equal(back, page + s.TYPED + 16); assert.deepEqual(Array.from({ length: 5 }, (_, i) => m.read(back - 5 + i)), [0x0e, 10, 0xcd, 5, 0]);
      inputCall = { sp: m.cpu.cpu.sp, back, buffer: page + s.LBUF, entered: false, textAtEntry: m.text(m.mark) };
    }
    if (inputCall && !inputCall.entered && m.pc === m.sym("FNLINE")) { assert.equal(word(m, m.sym("OLDSP")), inputCall.sp); assert.equal(m.cpu.cpu.d << 8 | m.cpu.cpu.e, inputCall.buffer); assert.equal(m.read(m.sym("HKDEP")), 1); inputCall.entered = true; }
    return observedStep();
  };
  try {
    m.type("x");
    m.runUntil(() => inputCall?.entered && m.classicBankIn && m.ready() && quiet(m, s) && m.pc >= m.sym("CINLP") && m.pc < m.sym("CINWE") &&
      m.read(m.sym("HKDEP")) === 1 && m.read(m.sym("HKBUSY")) === 0 && m.read(m.sym("ERRMODE")) === 0xff && word(m, m.sym("OLDSP")) === inputCall.sp &&
      word(m, inputCall.sp) === inputCall.back && m.lineBuf === inputCall.buffer && inputCall.textAtEntry.endsWith(">"), 900_000_000, "actual shell input after full-cache label pressure");
    assert.equal(returnedKey, 1); assert.ok(descriptors.length > 0); assert.equal(pendingDescriptor, null); assert.ok(shellSamples > 0 && lows.length > 0 && workerLows.length > 0);
    assert.equal(snapshot("actual prompt retains thirty known blocks").queue.length, 30); assert.deepEqual(Array.from({ length: 2 }, (_, i) => m.read(m.sym("HKGRD") + i)), workerGuard);
    assert.deepEqual(volume(image, "A").verify(), []); assert.deepEqual(m.violations, []); assert.doesNotMatch(m.text(m.mark), /Bdos Err|Disk reset failed|Write lost/);
    let free = 0; while (free < 16 + size && m.read(base + free) === 0xa5) free++;
    const used = Math.max(top - shellLowSP, top - shellLowWrite), patternUsed = 16 + size - free, below = Math.max(0, used - size);
    assert.ok(patternUsed <= used); assert.ok(workerTop - workerLow <= workerTop - workerBottom);
    console.log(JSON.stringify({ scope: "real thirty-block shell walk and private stack measurement", size, used, below, patternUsed, shellSamples, shellLowSP, shellLowWrite, lows, scratchWrites,
      workerGuardBefore: workerGuard, workerUsed: workerTop - workerLow, workerReserved: workerTop - workerBottom, workerLows, descriptors, inputOwner: { ...inputCall, pc: m.pc }, refusals: attempts.length,
      queue: cacheState(m).queue, blocks: [...expected.keys()], cardSHA256: createHash("sha256").update(image).digest("hex"), acknowledgements, input: Array.from(input),
      initialUsedAllocations: [...initialUsed], newAllocations: [...allocations], service: { image: shell.image, fileBase64: Buffer.from(shell.file).toString("base64"), fileSHA256: createHash("sha256").update(shell.file).digest("hex"), symbols: s }, text: m.text(m.mark) }));
    return { used, below };
  } finally { m.step = step; m.cpu.hardware.memWrite = write; }
}

test("S2-11 own stack", () => {
  assert.equal(sym.STKTOP - sym.STKBOT, 48, "48 bytes");
  const r = deepestWalk();
  assert.ok(r.used <= 36, `the prompt's walk with all 30 lines kept: ${r.used} of 48`);
  assert.equal(r.below, 0);
});

test("S2-11 mutant: MS, a 32-byte stack, is overrun on the walk with all 30 lines kept", async () => {
  const v = await shellVariant([["STKTOP    EQU   STKBOT+48", "STKTOP    EQU   STKBOT+32"]]);
  assert.ok(deepestWalk(v).below > 0);
});

test("S2-11 tpa figures", { timeout: 600_000 }, async () => {
  const MON3 = await mon3Svc();
  const tpa = (startup, typed = []) => {
    const m = shellMachine(shellCard({ "GLCD.SVC": GLCD_SVC, "MON3.SVC": MON3.file }, { startup, image: four() }), { matrix: true, glcd: true, noWait: true });
    if (startup.includes("MON3.SVC") && startup.indexOf("MON3.SVC") < startup.length - 1) {
      m.runUntil(() => m.waitingForInput() && /MON3>$/.test(m.text(0)), 900_000_000, "MON3>");
      m.type("EXIT\r");
    }
    m.runUntil(() => m.waitingForInput() && owners(m).length >= startup.length && /(>)$/.test(m.text()), 1_500_000_000, "the services");
    for (const l of typed) {
      const n = owners(m).length;
      m.typeMatrix(`${l}\r`);
      m.runUntil(() => m.waitingForInput() && owners(m).length === n + 1, 900_000_000, l);
    }
    return { tpa: word(m, 6) - 0x100, glcd: m.read(m.sym("CONMOD")) === 3, n: owners(m).length };
  };
  assert.equal(tpa(["SHELL.SVC"]).tpa, 42496, "with the shell");
  assert.equal(tpa(["SHELL.SVC", "GLCD.SVC"]).tpa, 41728, "and GLCD.SVC");
  assert.equal(tpa(["SHELL.SVC", "MON3.SVC"]).tpa, 37888, "and MON3.SVC");
  // The three together on a GLCD board, in three orders, the GLCD the console.
  for (const [startup, typed] of [[["SHELL.SVC", "GLCD.SVC", "MON3.SVC"], []], [["SHELL.SVC", "MON3.SVC", "GLCD.SVC"], []], [["GLCD.SVC"], ["SHELL.SVC", "MON3.SVC"]]]) {
    const r = tpa(startup, typed);
    assert.deepEqual(r, { tpa: 37120, glcd: true, n: 3 }, startup.concat(typed).join(", "));
  }
});

// BDOS 11's cost under the shell, as before write-behind followed the
// logged drive: measured on the four-drive card of A: coalescing's ROM and
// TED's & stop, with the shell of that landing.
const BASE11 = { nothing: 4928, onB: 8_661_934, onA: 8_859_172 };

const QUALIFIED_POLL = (() => {
  const asset = JSON.parse(readFileSync(new URL("./fixtures/rom-qualified-shell2.json", import.meta.url), "utf8"));
  assert.equal(asset.sourceCommit, "c4ec0f4950446f92b658643ee23b63e2c02bb33b");
  const rom = Buffer.from(asset.rom, "base64"), entries = Object.entries(asset.symbols).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  assert.equal(createHash("sha256").update(rom).digest("hex"), "a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1");
  assert.equal(createHash("sha256").update(JSON.stringify(entries)).digest("hex"), "9d86c0e1825833902eacfeb749612c3d0ef2c9d73f6cc71545f52924a82210e1");
  assert.ok(!Object.hasOwn(asset.symbols, "HKDEP"));
  return Object.freeze({ rom, symbols: new Map(entries) });
})();

/** Exact shell-command intervals and 200-call subtraction, with known data first. */
function bdos11(logged, rom) {
  const N = 200;
  const st = Uint8Array.from([0x06, N, 0xc5, 0x0e, 11, 0xcd, 5, 0, 0xc1, 0x10, 0xf7, 0xc9]);
  const none = Uint8Array.from([0x06, N, 0xc5, 0, 0, 0, 0, 0, 0xc1, 0x10, 0xf7, 0xc9]);
  const wr = Uint8Array.from([0x11, 0x5c, 0, 0x0e, 22, 0xcd, 5, 0, 0x06, 32,
    0xc5, 0x11, 0x5c, 0, 0x0e, 21, 0xcd, 5, 0, 0x0e, 11, 0xcd, 5, 0, 0xc1, 0x10, 0xef, 0xc9]);
  const selected = rom ?? romFor(), image = four(), m = shellMachine(shellCard({ "ST.COM": st, "NO.COM": none, "WK.COM": wr }, { image }), selected);
  const expectedROM = createHash("sha256").update(selected.rom).digest("hex");
  assert.equal(createHash("sha256").update(Uint8Array.from({ length: 0x4000 }, (_, i) => m.read(0xc000 + i))).digest("hex"), expectedROM);
  assert.equal(m.symbols.has("HKDEP"), rom === QUALIFIED_POLL ? false : true);
  const page = pageOf(m), top = page + sym.STKTOP, buffer = page + sym.LBUF, back = page + sym.TYPED + 16;
  assert.equal(word(m, m.sym("SHOWN")), page + sym.TABLE);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => m.read(back - 5 + i)), [0x0e, 10, 0xcd, 5, 0]);
  const owner = () => m.classicBankIn && m.ready() && quiet(m) && m.pc >= m.sym("CINLP") && m.pc < m.sym("CINWE") &&
    m.read(m.sym("ERRMODE")) === 0 && word(m, m.sym("OLDSP")) === top - 2 && word(m, top - 2) === back && m.lineBuf === buffer &&
    (!m.symbols.has("HKDEP") || (m.read(m.sym("HKDEP")) === 1 && m.read(m.sym("HKBUSY")) === 0));
  m.runUntil(owner, 900_000_000, "actual shell input before poll profiles");
  const commandReceipts = [], sd = m.sd, commit = sd.commitWrite.bind(sd), baseStep = m.step.bind(m);
  let phase = null;
  const physical = () => {
    assert.ok(phase?.original); assert.ok(m.classicBankIn);
    const bank = m.expand ? m.expand[1] : m.banks[0], entries = [];
    for (let line = 0; line < m.sym("NLINES"); line++) {
      if (!bank[m.sym("CDIRTY") - 0x8000 + line]) continue;
      const offset = m.sym("CTAB") - 0x8000 + line * 4, tag = bank.slice(offset, offset + 4);
      const block = [...tag].reduce((v, byte, i) => v + byte * 256 ** i, 0), payload = bank.slice(line * 512, (line + 1) * 512);
      assert.ok(phase.expected.has(block)); assert.deepEqual(payload, phase.expected.get(block)); entries.push({ line, block });
    }
    assert.equal(new Set(entries.map(e => e.block)).size, entries.length);
    const missing = [...phase.expected].filter(([block, bytes]) => Buffer.compare(Buffer.from(image.slice(block * 512, (block + 1) * 512)), Buffer.from(bytes))).map(([block]) => block);
    for (const block of missing) assert.ok(entries.some(e => e.block === block), "every off-card ACK has its valid dirty owner");
    if (m.symbols.has("HKDEP")) assert.deepEqual(cacheState(m).entries.map(e => e.block).sort((a, b) => a - b), entries.map(e => e.block).sort((a, b) => a - b));
    assert.deepEqual(image, phase.committed); assert.equal(volume(image, "A").find("A.DAT").records, 0);
    return { entries, missing };
  };
  sd.commitWrite = () => {
    assert.ok(phase && phase.kind === "WK", "read-only timing commands do not write the card");
    if (!phase.original) { commit(); assert.equal(sd.pendingResponse[0], 0x05); phase.makeWrites++; return; }
    const { start, buffer } = sd.writeState, block = start / 512, payload = Uint8Array.from(buffer);
    assert.ok(phase.expected.has(block)); assert.deepEqual(payload, phase.expected.get(block)); commit(); assert.equal(sd.pendingResponse[0], 0x05);
    phase.committed.set(payload, start); assert.deepEqual(image, phase.committed); phase.writes.push({ block, payload });
  };
  m.step = () => {
    if (phase?.code && m.pc === 0x100) {
      publicContext(m); assert.equal(++phase.entered, 1); phase.active = true; phase.sp = m.cpu.cpu.sp;
      assert.equal(phase.sp, m.sym("CSTKTOP") - 2); assert.equal(word(m, phase.sp), 0);
      assert.deepEqual(Uint8Array.from({ length: phase.code.length }, (_, i) => m.read(0x100 + i)), phase.code);
    }
    if (phase?.active && m.pc === m.sym("BENTRY")) {
      publicContext(m);
      if (m.cpu.cpu.c === 21) {
        assert.equal(phase.kind, "WK"); assert.equal(m.cpu.cpu.sp, phase.sp - 4); assert.equal(word(m, m.cpu.cpu.sp), 0x113);
        assert.equal(m.cpu.cpu.d << 8 | m.cpu.cpu.e, 0x5c); assert.equal(word(m, m.sym("CURDMA")), 0x80);
        if (!phase.original) {
          assert.ok(phase.made); phase.original = Uint8Array.from(image); phase.committed = Uint8Array.from(image);
          const fs = volume(phase.original, "A"); phase.used = new Set(fs.usedBlocks()); phase.allocationBytes = fs.blockBytes; assert.equal(fs.wide, true);
          phase.input = Uint8Array.from({ length: 128 }, (_, i) => m.read(0x80 + i)); assert.ok(phase.input.some(Boolean));
        }
        assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x80 + i)), phase.input);
      } else if (m.cpu.cpu.c === 11) {
        assert.ok(["ST", "WK"].includes(phase.kind)); assert.equal(m.cpu.cpu.sp, phase.sp - 4);
        assert.equal(word(m, m.cpu.cpu.sp), phase.kind === "ST" ? 0x108 : 0x118);
      } else { assert.equal(phase.kind, "WK"); assert.equal(m.cpu.cpu.c, 22); assert.equal(m.cpu.cpu.sp, phase.sp - 2); assert.equal(word(m, m.cpu.cpu.sp), 0x108); }
    }
    if (phase?.active && phase.kind === "WK" && m.pc === 0x108) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, phase.sp); assert.ok(m.cpu.cpu.a <= 3); assert.equal(phase.made, false); phase.made = true;
      assert.equal(m.read(0x7c), 0); assert.equal(m.read(0x6b), 0); assert.equal(volume(image, "A").find("A.DAT").records, 0);
    }
    if (phase?.active && phase.kind === "WK" && m.pc === 0x113) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, phase.sp - 2); const record = phase.acks.length;
      assert.ok(record < 32); assert.equal(m.cpu.cpu.a, 0); assert.equal(m.read(0x7c), record + 1);
      assert.equal(m.read(m.sym("CURDRV")), 0); assert.equal(m.read(m.sym("DSKCUR")), 0); assert.equal(m.read(0x5c) & 31, 1);
      assert.equal(m.read(m.sym("BOOTDRV")), logged === "A" ? 0 : 1); assert.equal(m.read(m.sym("DEFDRV")), logged === "A" ? 0 : 1);
      assert.equal(word(m, m.sym("DPHPTR")), m.sym("DPHTAB"));
      const slot = Math.floor(record / (phase.allocationBytes / 128)), allocation = word(m, 0x5c + 16 + slot * 2); assert.ok(slot < 8);
      if (!phase.allocations.has(slot)) { assert.ok(!phase.used.has(allocation)); assert.ok(![...phase.allocations.values()].includes(allocation)); phase.allocations.set(slot, allocation); }
      for (const [knownSlot, value] of phase.allocations) assert.equal(word(m, 0x5c + 16 + knownSlot * 2), value);
      const block = fileBlock(m, phase.original, record, 0x5c, "A"); if (!phase.expected.has(block)) phase.expected.set(block, new Uint8Array(512));
      phase.expected.get(block).set(phase.input, (record & 3) * 128); phase.acks.push({ record, a: m.cpu.cpu.a, cr: m.read(0x7c), block }); physical();
    }
    const pollReturn = phase?.active && ((phase.kind === "ST" && m.pc === 0x108) || (phase.kind === "WK" && m.pc === 0x118));
    if (pollReturn) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, phase.sp - 2); assert.equal(m.cpu.cpu.a, 0); phase.polls++;
      assert.ok(phase.polls <= (phase.kind === "ST" ? N : 32));
      if (phase.kind === "WK") { const cut = physical(); assert.deepEqual(cut.missing, []); assert.deepEqual(cut.entries, []); }
    }
    const ending = phase?.active && m.pc === 0x100 + phase.code.length - 1;
    if (ending) {
      publicContext(m); assert.equal(m.read(m.pc), 0xc9); assert.equal(m.cpu.cpu.sp, phase.sp); assert.equal(word(m, phase.sp), 0);
      assert.equal(phase.polls, phase.kind === "ST" ? N : phase.kind === "WK" ? 32 : 0);
      if (phase.kind === "WK") { assert.equal(phase.acks.length, 32); assert.equal(phase.expected.size, 8); physical(); }
      phase.active = false; phase.returned++;
    }
    const result = baseStep();
    if (ending) { assert.equal(m.pc, 0); assert.equal(m.cpu.cpu.sp, phase.sp + 2); }
    return result;
  };
  const timed = (line, kind, code) => {
    assert.ok(owner()); assert.equal(m.read(m.sym("PENDING")), 0); assert.equal(m.read(m.sym("RXFULL")), 0); assert.deepEqual(m.pending ?? [], []);
    phase = { kind, code, entered: 0, active: false, made: false, makeWrites: 0, returned: 0, polls: 0, acks: [], expected: new Map(), allocations: new Map(), writes: [], before: Uint8Array.from(image) };
    if (kind === "WK") assert.equal(volume(image, "A").find("A.DAT"), undefined);
    const start = m.cycles; m.mark = m.output.length; m.type(`${line}\r`);
    m.runUntil(owner, 900_000_000, "actual next shell input for measured command"); const cycles = m.cycles - start;
    assert.equal(phase.entered, code ? 1 : 0); assert.equal(phase.returned, code ? 1 : 0);
    if (kind !== "WK") assert.deepEqual(image, phase.before);
    else {
      const expectedCard = Uint8Array.from(phase.original); for (const [block, bytes] of phase.expected) expectedCard.set(bytes, block * 512);
      assert.deepEqual(image, expectedCard); physical(); assert.equal(phase.makeWrites, 1);
    }
    assert.deepEqual(volume(image, "A").verify(), []); assert.deepEqual(m.violations, []); assert.doesNotMatch(m.text(m.mark), /Bdos Err|Write pending|Write error|Disk reset failed/);
    const receipt = { line, kind, cycles, entered: phase.entered, returned: phase.returned, polls: phase.polls, makeWrites: phase.makeWrites,
      acknowledgements: phase.acks, initialUsedAllocations: phase.used && [...phase.used], newAllocations: [...phase.allocations], input: phase.input && Array.from(phase.input),
      dataWrites: phase.writes.map(w => w.block), cardSHA256: createHash("sha256").update(image).digest("hex"), owner: { pc: m.pc, sp: word(m, m.sym("OLDSP")), back, buffer }, text: m.text(m.mark) };
    commandReceipts.push(receipt); phase = null; return cycles;
  };
  try {
    if (logged === "B") { timed("B:", null, null); assert.equal(m.read(m.sym("BOOTDRV")), 1); }
    timed("A:NO", "NO", none); const a = timed("A:ST", "ST", st), b = timed("A:NO", "NO", none);
    const worst = timed("A:WK A:A.DAT", "WK", wr), result = { nothing: Math.round((a - b) / N), worst };
    console.log(JSON.stringify({ scope: "real shell 200-call and write-poll measurement", qualified: rom === QUALIFIED_POLL, logged, actualROM_SHA256: expectedROM, shellFileSHA256: createHash("sha256").update(SHELL.file).digest("hex"),
      N, commands: commandReceipts, ...result })); return result;
  } finally { m.step = baseStep; sd.commitWrite = commit; }
}

test("S2-11 bdos 11 cost", { timeout: 600_000 }, (t) => {
  const qualifiedB = bdos11("B", QUALIFIED_POLL), qualifiedA = bdos11("A", QUALIFIED_POLL);
  const b = bdos11("B"), a = bdos11("A");
  t.diagnostic(JSON.stringify({ qualifiedB, qualifiedA, onB: b, onA: a }));
  assert.deepEqual(qualifiedB, { nothing: 4954, worst: 8_735_058 });
  assert.deepEqual(qualifiedA, { nothing: 4955, worst: 9_206_025 });
  for (const [drive, current, qualified] of [["B", b, qualifiedB], ["A", a, qualifiedA]])
    assert.ok(current.nothing - qualified.nothing <= 360, `${drive}: empty poll ${current.nothing} T, ${current.nothing - qualified.nothing} over qualified`);
  assert.ok(b.worst / qualifiedB.worst - 1 <= 0.01, `logged on B:: ${b.worst} T, ${((b.worst / qualifiedB.worst - 1) * 100).toFixed(2)} % over qualified`);
  assert.ok(a.worst / qualifiedA.worst - 1 <= 0.05, `logged on A:: ${a.worst} T, ${((a.worst / qualifiedA.worst - 1) * 100).toFixed(2)} % over qualified`);
});

/** One real guest status call after thirty-two acknowledged, refused records. */
function refusedShellInputPass(rom) {
  const selected = rom ?? romFor(), image = four();
  const wk = Uint8Array.from([0x1e, 0xff, 0x0e, 45, 0xcd, 5, 0,
    0x11, 0x5c, 0, 0x0e, 22, 0xcd, 5, 0, 0x06, 32,
    0xc5, 0x11, 0x5c, 0, 0x0e, 21, 0xcd, 5, 0, 0xc1, 0x10, 0xf4,
    0x0e, 11, 0xcd, 5, 0, 0x1e, 0, 0x0e, 45, 0xcd, 5, 0, 0xc9]);
  const m = shellMachine(shellCard({ "PASS.COM": wk }, { image }), selected), page = pageOf(m), top = page + sym.STKTOP;
  const owner = () => m.classicBankIn && m.ready() && quiet(m) && m.pc >= m.sym("CINLP") && m.pc < m.sym("CINWE") &&
    m.read(m.sym("ERRMODE")) === 0 && word(m, m.sym("OLDSP")) === top - 2 && word(m, top - 2) === page + sym.TYPED + 16 &&
    m.lineBuf === page + sym.LBUF && m.read(m.sym("HKDEP")) === 1 && m.read(m.sym("HKBUSY")) === 0;
  m.runUntil(owner, 900_000_000, "actual shell input before refused status call");
  assert.equal(createHash("sha256").update(Uint8Array.from({ length: 0x4000 }, (_, i) => m.read(0xc000 + i))).digest("hex"), createHash("sha256").update(selected.rom).digest("hex"));
  assert.equal(volume(image, "A").find("P.DAT"), undefined);
  const expected = new Map(), allocations = new Map(), acknowledgements = [], attempts = [], passes = [], functional = [];
  const sd = m.sd, commit = sd.commitWrite.bind(sd), step = m.step.bind(m);
  let entered = 0, sp, made = false, original, committed, used, input, allocationBytes, before, start, cut, returned = 0, released = false;
  const state = () => {
    const s = cacheState(m); assert.equal(volume(image, "A").find("P.DAT").records, 0);
    if (!released) {
      assert.deepEqual(image, original); assert.deepEqual(s.entries.map(e => e.block), [...expected.keys()]);
      for (const entry of s.entries) { assert.equal(entry.dirty, 1); assert.deepEqual(entry.payload, expected.get(entry.block)); }
      assert.deepEqual([s.pending, s.any], [0, 1]);
    } else assert.deepEqual(image, committed);
    return s;
  };
  sd.commitWrite = () => {
    if (!original) return commit();
    const { start, buffer } = sd.writeState, block = start / 512, payload = Uint8Array.from(buffer);
    assert.ok(expected.has(block)); assert.deepEqual(payload, expected.get(block));
    attempts.push({ block, accepted: released });
    if (!released) { sd.writeState = null; sd.pendingResponse = [0x0d, 0xff]; sd.delayBytes = 1; assert.deepEqual(image, original); }
    else { commit(); assert.equal(sd.pendingResponse[0], 0x05); committed.set(payload, start); assert.deepEqual(image, committed); }
  };
  m.step = () => {
    if (m.pc === 0x100) { publicContext(m); assert.equal(++entered, 1); sp = m.cpu.cpu.sp; assert.equal(sp, m.sym("CSTKTOP") - 2); assert.equal(word(m, sp), 0); assert.deepEqual(Uint8Array.from({ length: wk.length }, (_, i) => m.read(0x100 + i)), wk); }
    if (entered && m.pc === 0x107) { publicContext(m); assert.equal(m.cpu.cpu.sp, sp); assert.equal(m.cpu.cpu.a, 0); assert.equal(m.read(m.sym("ERRMODE")), 0xff); }
    if (entered && m.pc === 0x10f) { publicContext(m); assert.equal(m.cpu.cpu.sp, sp); assert.ok(m.cpu.cpu.a <= 3); assert.equal(made, false); made = true; assert.equal(m.read(0x7c), 0); }
    if (entered && m.pc === m.sym("BENTRY") && m.cpu.cpu.c === 21) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, sp - 4); assert.equal(word(m, sp - 4), 0x11a); assert.equal(word(m, m.sym("CURDMA")), 0x80);
      assert.equal(m.cpu.cpu.d << 8 | m.cpu.cpu.e, 0x5c);
      if (!original) { assert.ok(made); assert.equal(cacheState(m).queue.length, 0); original = Uint8Array.from(image); committed = Uint8Array.from(image); const fs = volume(original, "A"); used = new Set(fs.usedBlocks()); allocationBytes = fs.blockBytes; assert.equal(fs.wide, true); input = Uint8Array.from({ length: 128 }, (_, i) => m.read(0x80 + i)); assert.ok(input.some(Boolean)); }
      assert.deepEqual(Uint8Array.from({ length: 128 }, (_, i) => m.read(0x80 + i)), input);
    }
    if (entered && m.pc === 0x11a) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, sp - 2); const record = acknowledgements.length; assert.ok(record < 32); assert.equal(m.cpu.cpu.a, 0); assert.equal(m.read(0x7c), record + 1);
      for (const name of ["CURDRV", "DSKCUR", "BOOTDRV", "DEFDRV"]) assert.equal(m.read(m.sym(name)), 0);
      assert.equal(m.read(0x5c) & 31, 0); assert.equal(word(m, m.sym("DPHPTR")), m.sym("DPHTAB"));
      const slot = Math.floor(record / (allocationBytes / 128)), allocation = word(m, 0x5c + 16 + slot * 2); assert.ok(slot < 8);
      if (!allocations.has(slot)) { assert.ok(!used.has(allocation)); assert.ok(![...allocations.values()].includes(allocation)); allocations.set(slot, allocation); }
      for (const [knownSlot, value] of allocations) assert.equal(word(m, 0x5c + 16 + knownSlot * 2), value);
      const block = fileBlock(m, original, record, 0x5c, "A"); if (!expected.has(block)) expected.set(block, new Uint8Array(512)); expected.get(block).set(input, (record & 3) * 128);
      acknowledgements.push({ record, a: m.cpu.cpu.a, cr: m.read(0x7c), block }); state();
    }
    if (entered && m.pc === m.sym("BENTRY") && m.cpu.cpu.c === 11) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, sp - 2); assert.equal(word(m, sp - 2), 0x122); assert.equal(acknowledgements.length, 32); assert.equal(expected.size, 8); assert.equal(before, undefined); before = state(); assert.equal(before.queue.length, 8); start = attempts.length;
    }
    if (before && !cut && m.pc === m.sym("FNSTAT")) { assert.deepEqual([m.read(m.sym("HKDEP")), m.read(m.sym("HKBUSY"))], [1, 0]); assert.equal(word(m, m.sym("OLDSP")), sp - 2); functional.push(attempts.length - start); }
    if (before && !cut && m.pc === m.sym("CFLUSH")) { assert.deepEqual([m.read(m.sym("HKDEP")), m.read(m.sym("HKBUSY")), m.cpu.cpu.a], [1, 0, m.sym("NLINES")]); passes.push(attempts.length - start); }
    if (entered && m.pc === 0x122) {
      publicContext(m); assert.equal(m.cpu.cpu.sp, sp); assert.equal(m.cpu.cpu.a, 0); assert.ok(before); assert.equal(cut, undefined);
      const after = state(); for (const key of ["queue", "dirty", "entries"]) assert.deepEqual(after[key], before[key]); assert.deepEqual(functional, [1]);
      const next = before.round.slice(before.position).find(line => line !== 255) ?? before.queue[0], entry = before.entries.find(e => e.line === next); assert.ok(entry);
      const pending = attempts.slice(start); assert.ok(pending.every(a => !a.accepted)); assert.ok(passes.length > 0);
      assert.deepEqual(passes, passes.map((_, i) => 1 + i * 8)); assert.deepEqual(pending.map(a => a.block), [entry.block, ...passes.flatMap(() => before.entries.map(e => e.block))]);
      cut = { passes: [...passes], attempts: pending, queueBlocks: before.entries.map(e => e.block), entryBlock: entry.block, cardSHA256: createHash("sha256").update(image).digest("hex") };
      released = true;
    }
    const ending = entered && m.pc === 0x129;
    if (ending) { publicContext(m); assert.ok(cut); assert.equal(m.read(m.sym("ERRMODE")), 0); assert.equal(m.cpu.cpu.sp, sp); assert.equal(word(m, sp), 0); assert.equal(m.read(m.pc), 0xc9); assert.equal(++returned, 1); }
    const result = step(); if (ending) { assert.equal(m.pc, 0); assert.equal(m.cpu.cpu.sp, sp + 2); } return result;
  };
  try {
    m.mark = m.output.length; m.type("PASS P.DAT\r"); m.runUntil(() => returned && owner(), 900_000_000, "natural programme return and recovered shell input");
    const expectedCard = Uint8Array.from(original); for (const [block, payload] of expected) expectedCard.set(payload, block * 512);
    assert.deepEqual(image, expectedCard); assert.deepEqual(cacheState(m).queue, []); assert.deepEqual(volume(image, "A").verify(), []); assert.deepEqual(m.violations, []);
    assert.equal(volume(image, "A").find("P.DAT").records, 0); assert.doesNotMatch(m.text(m.mark), /Bdos Err|Disk reset failed/);
    const result = { scope: "real shell refused status pass", romSHA256: createHash("sha256").update(selected.rom).digest("hex"), acknowledgements, input: [...input], initialUsedAllocations: [...used], newAllocations: [...allocations], cut, returned, finalCardSHA256: createHash("sha256").update(image).digest("hex"), text: m.text(m.mark) };
    console.log(JSON.stringify(result)); return result;
  } finally { m.step = step; sd.commitWrite = commit; }
}

function oneShellInputPass(result) {
  assert.equal(result.cut.passes.length, 1, "one guest status call makes one frozen required input pass");
  assert.deepEqual(result.cut.passes, [1]);
  assert.deepEqual(result.cut.attempts.map(a => a.block), [result.cut.entryBlock, ...result.cut.queueBlocks]);
}

test("S2-11 mutant: MNC and MTW, as the bdos 11 cost sees them", { timeout: 600_000 }, (t) => {
  const nativeB = bdos11("B"), mnc = bdos11("B", MUTANTS.mnc());
  const nativeA = bdos11("A"), mtw = bdos11("A", MUTANTS.mtw());
  const nativePass = refusedShellInputPass(), doubled = refusedShellInputPass(MUTANTS.mtw());
  t.diagnostic(JSON.stringify({ nativeB, mnc, nativeA, mtw, nativePasses: nativePass.cut.passes, mutantPasses: doubled.cut.passes }));
  assert.ok(nativeB.nothing - 4954 <= 360); assert.ok(nativeB.worst / 8_735_058 - 1 <= 0.01);
  assert.ok(mnc.nothing - 4954 > 360, `MNC: ${mnc.nothing} T with nothing changed`);
  assert.ok(mnc.worst / 8_735_058 - 1 > 0.01, `MNC logged on B:: ${mnc.worst}`);
  assert.ok(nativeA.worst / 9_206_025 - 1 <= 0.05); assert.deepEqual(mtw, nativeA, "healthy polling is a recorded MTW timing nonkill");
  oneShellInputPass(nativePass); assert.equal(doubled.cut.passes.length, 2);
  assert.equal(doubled.finalCardSHA256, nativePass.finalCardSHA256);
  assert.throws(() => oneShellInputPass(doubled), error => {
    assert.equal(error.code, "ERR_ASSERTION"); assert.equal(error.message.split("\n")[0], "one guest status call makes one frozen required input pass");
    assert.equal(error.actual, 2); assert.equal(error.expected, 1); return true;
  });
});

// TED's typing, moving and saving before write-behind followed the logged
// drive, in milliseconds at 4 MHz: TED on a 60-line file on A: on the
// PICO9918 at 80 columns, as measured on A: coalescing's ROM.
const TED_BASE = { type100: 14243.6, down40: 3740.2, save: 855.8 };
const TED = pinned("TED.COM");

/** Same editor, card and keys on each ROM; measure only at the editor's read loop. */
function tedCost(selected) {
  check(TED);
  const image = standardCard(), lines = Array.from({ length: 60 }, (_, i) => `line ${i} of the file, some text to show`);
  const initialText = lines.join("\n") + "\n", editedText = "x".repeat(100) + initialText;
  const initialBytes = Buffer.from(initialText.replace(/\n/g, "\r\n")), editedBytes = Buffer.from(editedText.replace(/\n/g, "\r\n"));
  const editor = new Uint8Array(readFileSync(TED.path)), a = volume(image, "A");
  a.write("TED.COM", editor); a.write("NOTES.TXT", Buffer.from(initialText), { text: true });
  withDisplay(image, { tms: true, width: 80, matrix: true });
  const originalFiles = new Map(volume(image, "A").list().filter(f => f.name !== "NOTES.TXT").map(f => [f.name, volume(image, "A").read(f.name)]));
  const m = new Machine({ ...selected, sdImage: image, tms: true, matrix: true, clock: TEST_CLOCK });
  m.bootText = m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  assert.equal(createHash("sha256").update(Uint8Array.from({ length: 0x4000 }, (_, i) => m.read(0xc000 + i))).digest("hex"), createHash("sha256").update(selected.rom).digest("hex"));
  const readLoop = 0x21bf, inputReturn = 0x21c7, wrapperReturn = 0x112, cursor = 0x24ca, length = cursor - 2;
  assert.deepEqual(editor.slice(0xb, 0x17), Uint8Array.from([0xdd, 0xe5, 0xfd, 0xe5, 0xcd, 5, 0, 0xfd, 0xe1, 0xdd, 0xe1, 0xc9]));
  assert.deepEqual(editor.slice(readLoop - 0x100, readLoop - 0x100 + 12), Uint8Array.from([0x11, 0xff, 0, 0x0e, 6, 0xcd, 0x0b, 1, 0xb7, 0x28, 0xf5, 0xc9]));
  const owner = () => {
    if (!m.classicBankIn || !m.waitingForInput() || m.read(m.sym("ERRMODE")) !== 0) return false;
    if (m.symbols.has("HKDEP") && (m.read(m.sym("HKDEP")) !== 1 || m.read(m.sym("HKBUSY")) !== 0)) return false;
    const saved = word(m, m.sym("OLDSP")); return word(m, saved) === wrapperReturn && word(m, saved + 6) === inputReturn;
  };
  const sd = m.sd, commit = sd.commitWrite.bind(sd), step = m.step.bind(m), committed = Uint8Array.from(image), writes = [], keysSeen = [];
  const descriptor = parseContainer(image).volumes.find(v => v.drive === "A"); assert.ok(descriptor);
  let phase = "load", entered = 0;
  sd.commitWrite = () => {
    assert.ok(phase === "load" || phase === "save", "typing and navigation do not write the card");
    const { start, buffer } = sd.writeState, block = start / 512, payload = Uint8Array.from(buffer);
    assert.ok(block >= descriptor.start && block < descriptor.start + descriptor.length);
    commit(); assert.equal(sd.pendingResponse[0], 0x05); committed.set(payload, start); assert.deepEqual(image, committed);
    writes.push({ phase, block, payloadBase64: Buffer.from(payload).toString("base64") });
  };
  m.step = () => {
    if (m.pc === 0x100) { publicContext(m); assert.equal(++entered, 1); assert.deepEqual(Uint8Array.from({ length: editor.length }, (_, i) => m.read(0x100 + i)), editor); }
    return step();
  };
  const key = (s, what) => {
    assert.ok(owner()); assert.deepEqual(m.pending ?? [], []); const start = m.cycles;
    m.enqueueInput(s, "matrix"); m.runUntil(() => (m.pumpInput(), !m.pending?.length && owner()), 2_000_000_000, what);
    const cycles = m.cycles - start;
    keysSeen.push({ key: s.charCodeAt(0), cycles, pc: m.pc, savedSP: word(m, m.sym("OLDSP")), callerReturn: word(m, word(m, m.sym("OLDSP")) + 6), cursor: word(m, cursor), length: word(m, length), status: m.screen()[23] });
    assert.deepEqual(image, committed); assert.deepEqual(m.violations, []); return cycles;
  };
  try {
    m.typeMatrix("ted notes.txt\r");
    m.runUntilChecked(() => owner() && m.screen()[0].startsWith("line 0"), 800_000_000, "the actual editor read-loop input");
    assert.equal(entered, 1); assert.deepEqual([m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], [80, 24]);
    assert.equal(word(m, cursor), 0); assert.equal(word(m, length), initialBytes.length);
    assert.equal(Buffer.from(volume(image, "A").read("NOTES.TXT", { text: true })).toString(), initialText);
    const loadedCard = Uint8Array.from(image); let type100 = 0, down40 = 0; phase = "type";
    for (let i = 0; i < 100; i++) { type100 += key("x", "an inserted character at the editor read loop"); assert.equal(word(m, cursor), i + 1); assert.equal(word(m, length), initialBytes.length + i + 1); }
    assert.deepEqual(image, loadedCard); phase = "down";
    for (let i = 0; i < 40; i++) down40 += key("\x04", "down at the editor read loop");
    const lineStart = 100 + lines.slice(0, 40).reduce((sum, line) => sum + line.length + 2, 0);
    assert.ok(word(m, cursor) >= lineStart && word(m, cursor) <= lineStart + lines[40].length); assert.equal(word(m, length), editedBytes.length);
    assert.match(m.screen()[23], /L41 C/); assert.deepEqual(image, loadedCard);
    phase = "save"; const save = key("\x13", "save completed at the editor read loop");
    const fs = volume(image, "A"), saved = fs.read("NOTES.TXT");
    assert.equal(Buffer.from(fs.read("NOTES.TXT", { text: true })).toString(), editedText);
    assert.deepEqual(saved.slice(0, editedBytes.length), new Uint8Array(editedBytes)); assert.ok(saved.slice(editedBytes.length).length > 0); assert.ok(saved.slice(editedBytes.length).every(byte => byte === 0x1a));
    for (const [name, bytes] of originalFiles) assert.deepEqual(fs.read(name), bytes);
    assert.ok(!fs.list().some(file => /\.(\$\$\$|BAK)$/.test(file.name))); assert.deepEqual(fs.verify(), []);
    assert.equal(word(m, length), editedBytes.length); assert.ok(owner()); assert.deepEqual(image, committed);
    const bank = m.expand ? m.expand[1] : m.banks[0]; assert.ok(Array.from(bank.slice(m.sym("CDIRTY") - 0x8000, m.sym("CDIRTY") - 0x8000 + m.sym("NLINES"))).every(byte => byte === 0));
    if (m.symbols.has("HKDEP")) assert.deepEqual(cacheState(m).queue, []);
    assert.deepEqual(m.violations, []); const ms = { type100: type100 / 4000, down40: down40 / 4000, save: save / 4000 };
    console.log(JSON.stringify({ scope: "paired known-content TED editor cost", qualified: selected === QUALIFIED_POLL, actualROM_SHA256: createHash("sha256").update(selected.rom).digest("hex"), editorSHA256: createHash("sha256").update(editor).digest("hex"), inputText: initialText, expectedText: editedText, keys: keysSeen, writes, finalFiles: fs.list().map(file => ({ name: file.name, records: file.records, sha256: createHash("sha256").update(fs.read(file.name)).digest("hex") })), finalCardSHA256: createHash("sha256").update(image).digest("hex"), ms }));
    return ms;
  } finally { sd.commitWrite = commit; m.step = step; }
}

test("S2-11 ted cost", { skip: TED.skip, timeout: 900_000 }, (t) => {
  const qualified = tedCost(QUALIFIED_POLL), current = tedCost(romFor());
  t.diagnostic(JSON.stringify({ qualified, current }));
  assert.deepEqual(qualified, { type100: 14_245.581, down40: 3742.13325, save: 858.5755 });
  assert.ok(current.type100 / qualified.type100 - 1 <= 0.05, `typing: ${current.type100} ms against qualified ${qualified.type100}`);
  assert.ok(current.down40 <= 4012.4675, `movement: ${current.down40} ms`);
  assert.ok(current.save <= 1682.95425, `save: ${current.save} ms`);
});

// --- S2-12 The starter card ------------------------------------------------------

const starterImage = () => new Uint8Array(readFileSync(new URL("../dist/starter.img", import.meta.url)));
const starterRecipe = () => JSON.parse(readFileSync(new URL("../dist/starter.recipe.json", import.meta.url), "utf8"));

test("S2-12 four drives", () => {
  const card = starterImage();
  const info = parseContainer(card);
  assert.deepEqual([info.minor, info.drives], [1, 4], "container 1.1, the drives field 4");
  assert.equal(card.length, 13_631_488);
  assert.equal(starterRecipe().drives, 4, "the recipe asks for them");
});

test("S2-12 volumes", () => {
  const card = starterImage();
  const info = parseContainer(card);
  assert.deepEqual(info.volumes.map((v) => [v.label, v.g.name, v.drive]), [
    ["SYSTEM", "G1M", "A"],
    ["WORK", "G8M", "B"],
    ["PROJECTS", "G1M", "C"],
    ["GAMES", "G1M", null],
    ["SPARE", "G1M", null],
  ]);
  for (let i = 0; i < 5; i += 1) assert.equal(card[descriptorAt(i) + 15], 0, `volume ${i}'s byte 15`);
  for (const d of ["B", "C"]) assert.deepEqual(volume(card, d).list(), [], `${d}: empty`);
});

test("S2-12 no mount.com", () => {
  const names = volume(starterImage(), "A").list().map((f) => f.name);
  assert.ok(!names.includes("MOUNT.COM"));
  assert.ok(!starterRecipe().components.some((c) => c.name === "MOUNT.COM"));
  for (const n of ["SHELL.SVC", "STARTUP.CMD", "TED.COM", "TAS.COM", "BAZA.COM", "MON3.SVC"]) assert.ok(names.includes(n), `A: still holds ${n}`);
  assert.ok(names.includes("HELLO3.ASM"));
  assert.ok(!names.includes("HELLO3.BIN"));
  assert.equal(names.length, 13);
});

test("S2-12 instruction", () => {
  const t = starterRecipe().instruction;
  for (const s of ["A:SYSTEM>", "CD ?", "CD NAME", "CD D:NAME", "The drive you are on is written behind", "whenever TEC-OS waits for a key everything is on the card", "After CD A:", "at the bare prompt use CD ?, CD A:SYSTEM and SHELL.SVC", "Power cycle"]) assert.ok(t.includes(s), `the instruction says ${s}`);
  assert.doesNotMatch(t, /MOUNT/, "and teaches no MOUNT");
  assert.doesNotMatch(t, /(B:|WORK)[^.]*written behind/, "nor that B: or WORK is written behind");
  assert.doesNotMatch(t, /At A>/);
});

test("S2-12 tpa", () => {
  const card = starterImage();
  volume(card, "A").write("STARTUP.CMD", Buffer.from("\x1a", "latin1"));
  const bare = shellMachine(card);
  assert.equal(word(bare, 6) - 0x100, 46_533, "bare: four drives' vectors");
  const m = shellMachine(starterImage());
  assert.equal(word(m, 6) - 0x100, 42_496, "with the shell, the starter card's STARTUP.CMD");
});

/** A card of the drives field's absence, built from the starter recipe without it: its machine under the shell. */
async function recipeCard(recipe) {
  const { buildRecipe } = await import("../tools/lib/recipe.mjs");
  const dir = new URL("../dist/", import.meta.url);
  return buildRecipe(recipe, (url) => new Uint8Array(readFileSync(new URL(url, dir))));
}

test("S2-12 mutant: the recipe without drives leaves C: a G1M's slot, and CD of WORK onto it is refused", async () => {
  const run2 = async (recipe) => {
    const m = shellMachine(await recipeCard(recipe));
    run(m, "CD B:GAMES");
    return run(m, "CD C:WORK");
  };
  assert.match(await run2(starterRecipe()), /\r\nC:WORK\r\n/, "the card's recipe: WORK goes on C:");
  const { drives, ...without } = starterRecipe();
  assert.match(await run2(without), /\r\nCD FAILED\r\n/);
});

test("S2-12 old card upgraded", async () => {
  const { prepareCard } = await import("../host/card.mjs");
  const starter = starterImage();
  // A card of before the shell: SYSTEM and WORK, WORK's byte 15 set as the old
  // recipe set it, the starter's files but the shell, that time's MON3.SVC.
  const old = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B" }]);
  old[descriptorAt(1) + 15] = 1;
  const sum = headerChecksum(old.subarray(0, 512));
  [old[20], old[21]] = [sum & 0xff, sum >> 8];
  const a = volume(old, "A");
  const s = volume(starter, "A");
  for (const f of s.list()) if (!["SHELL.SVC", "STARTUP.CMD"].includes(f.name)) a.write(f.name, s.read(f.name));
  const OLD_MON3 = JSON.parse(readFileSync(new URL("./fixtures/mon3-55f0171.json", import.meta.url), "utf8"));
  a.write("MON3.SVC", Buffer.from(OLD_MON3.file, "base64"));
  a.write("STARTUP.CMD", Buffer.from("CON PICO 40\r\n\x1a", "latin1"));
  a.write("NOTES.TXT", Buffer.from("my own notes\r\n\x1a", "latin1"));
  const got = prepareCard(old, "tms", "40", starter);
  assert.equal(got.problem, null);
  assert.equal(got.changed, true);
  const m = boot(old, { tms: true, matrix: true, width: 40 });
  const t = m.command("CD ?", { prompt: P });
  assert.match(t, /\r\nSYSTEM +A:\r\nWORK +B:\r\nA:SYSTEM>$/, "this stage's shell, the old card's two volumes");
  assert.equal(m.read(m.sym("DRVTAB") + 8 + 7), 0, "B:'s flags 0");
  assert.ok(Buffer.from(volume(old, "A").read("NOTES.TXT")).toString("latin1").startsWith("my own notes"), "its files kept");
});

// --- S2-13 The docs ----------------------------------------------------------------

test("S2-13 docs", () => {
  const read = (n) => readFileSync(new URL(`../${n}`, import.meta.url), "utf8");
  const flat = (n) => read(n).replace(/\s+/g, " ");
  const recovery = flat("docs/recovery.md");
  for (const s of [
    "Each admitted outer BDOS, hardware service or returning BIOS call attempts one eligible dirty block before its normal work",
    "Updates already received merge into that block without duplicating its entry or moving its first-dirty position",
    "TEC-OS does not delay a ready write to await future updates",
    "A frozen round records the eligible first-dirty order",
    "New arrivals join the next round; continuously arriving writes cannot indefinitely postpone a failed line's next retry",
    "Nested calls inherit that operation instead of starting another maintenance pass",
    "The worker owns a private stack and excludes unsafe bank/SD spans",
    "This is cooperative service, with no timer or wall-clock deadline",
    "The logged drive can keep multiple changed blocks",
    "Other drives retain their existing single pending-block boundary",
    "cross-call write coalescing is no longer promised",
    "A read-only volume continues to refuse writes",
    "A directory write first tries all other dirty data in a bounded pass, then writes the directory block only if those prerequisites succeeded",
    "Either prerequisite or metadata failure rejects and drops that unpublished directory image",
    "Later retries must not publish rejected metadata",
    "Console input through BDOS1,6 input,10 or11 and BIOS CONIN drains pending data before waiting",
    "A complete pass attempts each eligible line once and continues after failure",
    "Failed acknowledged data remains dirty and queued, including across warm boot",
    "A maintenance failure during an unrelated call does not replace that call's functional result",
    "Function45's silent FFh mode defers notices without losing the event",
    "A private worker stack does not make BDOS generally reentrant",
    "Warm-boot flush failure also drops the remaining chained command text while retaining the failed data",
    "A program that hangs without calling the OS can hold data indefinitely",
    "committing record data alone does not finish an unclosed new file's metadata",
    "completed browser persistence are separate stages",
  ]) assert.ok(recovery.includes(s), `recovery.md: ${s}`);
  assert.doesNotMatch(recovery, /Only warm boot drops a flushed line that still fails/, "warm boot retains failed acknowledged data");
  const shell = flat("docs/shell.md");
  for (const s of ["`CD NAME`", "`CD D:NAME`", "`CD ?`", "`B:GAMES>`", "`3B:GAMES>`", "`C:>`", "`CLS`", "`ECHO text`", "`PAUSE`", "`DIR /W` is the fast listing", "a file over 32 KiB on a G8M volume", "leaves the prompt's label stale", "BDOS 14 and comes back with no warm boot", "Power off and on gives the card's own drives"])
    assert.ok(shell.includes(s), `shell.md: ${s}`);
  const container = flat("docs/container-format.md");
  assert.match(container, /\| 15 \| 1 \| Reserved: written zero, never read/);
  assert.doesNotMatch(container, /--volume [^ ]*:wb/, "no :wb taught");
  const compat = flat("docs/compatibility.md");
  for (const s of ["46,533 bytes", "42,496", "41,728"]) assert.ok(compat.includes(s), `compatibility.md: ${s}`);
  assert.doesNotMatch(compat, /46,564|45,568 is the least/, "the old ceiling's figures gone");
  assert.match(flat("docs/mon3.md"), /from `A700h` to `9500h`/);
  // No doc teaches MOUNT.COM or a volume marked written behind.
  for (const n of ["README.md", "docs/shell.md", "docs/recovery.md", "docs/compatibility.md", "docs/container-format.md", "docs/rom-services.md", "docs/wip.md", "docs/mon3.md"]) {
    const t = flat(n);
    assert.doesNotMatch(t, /MOUNT\.COM (is|on) |type MOUNT|`MOUNT B:/, `${n}: no MOUNT.COM taught`);
    assert.doesNotMatch(t, /B: is an empty work disk, written behind|B: written behind|WORK[^.]{0,20}written behind/, `${n}: no B: or WORK written behind`);
    assert.doesNotMatch(t, /`:wb`[^.]*writes|takes `:wb`/, `${n}: no :wb`);
  }
  // The brief's comments: bios.asm's above BWRITE, abi.inc's opening.
  const bios = read("src/bios.asm");
  const at = bios.indexOf("\n\nBWRITE:");
  const bw = bios.slice(bios.lastIndexOf("\n\n", at - 1), at);
  assert.match(bw.replace(/\n; /g, " "), /A directory write's success includes card output/);
  assert.doesNotMatch(bw, /Write-through success/);
  assert.match(read("src/abi.inc").replace(/\n; /g, " "), /An interface may also change in place with the version fields unchanged/);
});
