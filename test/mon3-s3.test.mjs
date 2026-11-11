// MON3.SVC's graphics: MON-3's RST 18h graphics calls against MON-3's own
// ROM, the graphics workspace at entry, the GLCD console after a program
// returns, the five GLCD programs of the pinned repository, and the size.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { GLCD_PROGRAMS, PROGRAMS, RULES, fromInputs, realBuild, realProgram } from "./lib/mon3src.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, program, volume } from "./lib/fixtures.mjs";
import { MON3_CEILING, bytesAt, line, mon3Sources, mon3Variant, services, word } from "./lib/mon3.mjs";
import { boot, goTo, inSession, mon3Build, sha, toMon3 } from "./lib/mon3s2.mjs";
import { referenceSide, sessionSide } from "./lib/kg65.mjs";
import { CALL_ROWS, GORET, glcdOf, MON3_SOFTBOOT, REFUSAL_TOP, callSides, compareCalls, compareRefusals, drive3d, ldarOf, programReference, programSession, regsOf, runToPc, snap } from "./lib/kg67.mjs";

// The five GLCD programs, converted with the four rules more and their
// includes found as pinned inputs, give their pinned binaries; the rules
// leave the first five programs' binaries as they were.

test("KG67 program binaries", async () => {
  for (const [name, p] of Object.entries(GLCD_PROGRAMS)) {
    const b = await realProgram(name);
    assert.equal(b.length, p.bytes, `${name}: ${p.bytes} bytes at 4000h`);
    assert.equal(sha(b), p.sha256, `${name}: its pinned hash`);
  }
  for (const [name, p] of Object.entries(PROGRAMS)) {
    assert.equal(sha(await realProgram(name, { rules: RULES })), p.sha256, `${name}: its pinned hash under the four rules too`);
  }
  assert.throws(() => fromInputs("lib/other.z80"), /no pinned input/, "an include outside the pinned files fails");
});

// Each rule is needed: without it a program that uses it does not assemble.
for (const [rule, name, why] of [
  ["r7", "glcd-3d", /undefined symbol Q004/],
  ["r8", "glcd-maze", /expected a comma/],
  ["r9", "glcd-demo", /expected an operand/],
  ["r10", "glcd-demo", /forward reference/],
]) {
  test(`KG67 mutant: the conversion without ${rule.toUpperCase()}, ${name} does not assemble`, async () => {
    await assert.rejects(realProgram(name, { rules: { [rule]: false } }), why);
  });
}

for (const [name, why] of [["glcd-3d", /undefined symbol Q033/], ["glcd-demo", /undefined symbol INITLCD/]]) {
  test(`KG67 mutant: the conversion without .include, ${name} does not assemble`, async () => {
    await assert.rejects(realProgram(name, { include: false }), why);
  });
}

// RST 18h's refusals: a selector of 21 to 33, 34 or FFh shows displayError
// as MON-3's call 11 does, waits for the key and returns as a key press
// does, and changes nothing else: the latch, 0800h-3DFFh outside DISP_BUFF
// and the key variables, and the ST7920, which takes no write. MON-3 also
// refuses 34 and FFh by RST 18h, and those rows are compared with it too.

let refusalSides;
const theRefusalSides = async () => (refusalSides ??= { ref: await referenceSide(), ses: await sessionSide() });

test("KG67 rst 18h refusals", async () => {
  const { ref, ses } = await theRefusalSides();
  const { bad, lowSP } = compareRefusals(ref, ses);
  assert.deepEqual(bad, []);
  assert.ok(lowSP > REFUSAL_TOP, `displayError's stack reaches ${lowSP.toString(16)}h, above the compared bytes`);
  console.log(`RST 18h refusals: 15 selectors, 34 rows; the lowest SP ${lowSP.toString(16)}h`);
});

// The size: at most 18 pages, 4,608 bytes of header and image; (0006h) at
// least A700h on the starter card, so a TPA of at least 42,496, and 41,728
// with GLCD.SVC; TAS's file equal to ATOM's; each source file within the
// style's 24,576 bytes, and passing its checker.

async function sizeAndTpa(svc) {
  const C = MON3_CEILING;
  assert.ok(svc.image <= C.bytes, `the header and image, ${svc.image} bytes, within ${C.bytes}`);
  const m = boot({ "MON3.SVC": svc.file });
  m.command("MON3.SVC");
  const pages = Number(services(m)[0].split(" ")[1]);
  assert.ok(pages <= C.pages, `${pages} pages, at most ${C.pages}`);
  const top = word(m, 6);
  assert.ok(top >= C.top && top - 0x100 >= C.tpa, `(0006h) ${top.toString(16)}h, TPA ${top - 0x100}, at least ${C.tpa}`);
  const g = boot({ "MON3.SVC": svc.file }, { matrix: true });
  assert.deepEqual(services(g).map((l) => l.split(" ")[0]), ["GLCD"], "GLCD.SVC installed");
  g.command("MON3.SVC");
  const both = word(g, 6) - 0x100;
  assert.ok(both >= C.tpaGlcd, `TPA with GLCD.SVC ${both}, at least ${C.tpaGlcd}`);
  return { pages, top, tpa: top - 0x100, both };
}

test("KG67 size and tpa", async () => {
  const svc = await mon3Build();
  const f = await sizeAndTpa(svc);
  console.log(`MON3.SVC: file ${svc.file.length} bytes, header and image ${svc.image}, ${f.pages} pages, ${f.pages * 256 - svc.image} bytes left, (0006h) ${f.top.toString(16)}h, TPA ${f.tpa}, ${f.both} with GLCD.SVC`);
  const { tasAssembler, romBackend } = await import("../tools/lib/tas-rom.mjs");
  if (romBackend() === "tas") {
    const { assembleMon3 } = await import("../tools/lib/tas-distribution.mjs");
    assert.deepEqual([...(await assembleMon3(ROOT, await tasAssembler()))], [...svc.file], "TAS's MON3.SVC equals ATOM's");
  }
  const { checkCompactSource } = await import("../tools/lib/style-compact.mjs");
  const routines = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-routines.json"), "utf8"));
  const exceptions = JSON.parse(readFileSync(resolve(ROOT, "tools/compact-exceptions.json"), "utf8"));
  const files = mon3Sources();
  assert.deepEqual(Object.keys(files), ["mon3.asm", "mon3api.asm", "mon3io.asm", "mon3hex.asm", "mon3gfx.asm"], "the five source files");
  for (const [n, text] of Object.entries(files)) {
    const r = checkCompactSource(text, n, routines[`drivers/${n}`], exceptions[`drivers/${n}`]);
    assert.ok(r.bytes <= 24576, `${n}: ${r.bytes} bytes`);
    assert.deepEqual(r.faults, [], `${n} passes the style checker`);
  }
});

test("KG67 mutant: the build with buffers added to 4,609 bytes takes 19 pages", async () => {
  const svc = await mon3Build();
  const big = await mon3Variant([["  DS 80\nMSTK:\n", `  DS 80+${4609 - svc.image}\nMSTK:\n`]]);
  assert.equal(big.image, 4609);
  await assert.rejects(sizeAndTpa(big), /within 4608/);
  const m = boot({ "MON3.SVC": big.file });
  m.command("MON3.SVC");
  assert.deepEqual(services(m), ["MON3 19"], "19 pages");
});

// The graphics workspace at entry: 0A00h-0E19h zero but VPORT, 0A00h, at the
// first MON3>, (a) when MON3.SVC /E installs and enters, (b) at re-entry
// after EXIT, with a transient's FFh over the region. A GO, its return and
// a second GO leave what a program wrote there.

const REGION = [0x0a00, 0x41a];
const VPORT_AT = 0x0e13 - 0x0a00;
/** The bytes of 0A00h-0E19h that differ from the entry's: their addresses. */
function workspaceDiffers(m) {
  return bytesAt(m, ...REGION).flatMap((b, i) => (b === (i === VPORT_AT + 1 ? 0x0a : 0) ? [] : [(0x0a00 + i).toString(16)]));
}

async function workspace(svc) {
  svc ??= await mon3Build();
  // A program that writes 55h at 0A00h and returns.
  const m = boot({ "MON3.SVC": svc.file, "PROG.BIN": Uint8Array.from([0x3e, 0x55, 0x32, 0x00, 0x0a, 0xc9]) });
  assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E installs and enters");
  assert.deepEqual(workspaceDiffers(m).slice(0, 8), [], "install and enter: 0A00h-0E19h zero, VPORT 0A00h");
  assert.ok(!line(m, "EXIT").mon3);
  for (let i = 0; i < REGION[1]; i += 1) m.write(REGION[0] + i, 0xff);
  assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E enters again");
  assert.deepEqual(workspaceDiffers(m).slice(0, 8), [], "re-entry over FFh: 0A00h-0E19h zero, VPORT 0A00h");
  assert.ok(line(m, "LOAD PROG.BIN").mon3);
  goTo(m, "GO", 0x4000);
  m.mark = m.output.length;
  toMon3(m);
  goTo(m, "GO", 0x4000);
  assert.equal(m.read(0x0a00), 0x55, "a second GO keeps the program's byte at 0A00h");
  assert.deepEqual(workspaceDiffers(m), ["a00"], "and the rest of the region as at entry");
}

test("KG67 graphics workspace", () => workspace());

const STEP = "  ld (RUNOK),a   ; nothing to run\n  call GWS       ; and a clear GBUF\n";
for (const [name, edits, why] of [
  ["the workspace step removed", [[STEP, "  ld (RUNOK),a   ; nothing to run\n"]], /install and enter/],
  ["the workspace step clearing 0E00h-0E19h only", [["  ld hl,GBUF\n  ld de,GBUF+1\n  ld bc,GVEND-GBUF-1\n", "  ld hl,$0E00\n  ld de,$0E01\n  ld bc,GVEND-$0E01\n"]], /0A00h-0E19h zero/],
  ["VPORT left unset", [["  ld hl,GBUF\n  ld (VPORT),hl  ; drawing into GBUF\n", ""]], /VPORT 0A00h/],
  ["the workspace step moved to INIT", [[STEP, "  ld (RUNOK),a   ; nothing to run\n"], ["  ld hl,EXRDY\n  ld (hl),1      ; ready\n", "  xor a\n  call GWS       ; at install\n  ld hl,EXRDY\n  ld (hl),1      ; ready\n"]], /re-entry over FFh/],
]) {
  test(`KG67 mutant: ${name}`, async () => {
    const svc = await mon3Variant(edits);
    await assert.rejects(workspace(svc), why);
    // Without the step glcd-demo meets the TPA's CLRBUF, which clears its
    // buffer after the plot.
    if (name === "the workspace step removed") await assert.rejects(glcdDemo(svc), /in the session too|GBUF/);
  });
}

// The calls: each row of the table file's inputs for selectors 0 to 20, with
// F 00h and FFh, gives on MON-3 and in the session equal A, F, BC, DE (not
// after call 14, which leaves DE in MON-3's ROM), HL, IY and SP; equal bytes
// in 0800h-3EF1h but 0892h-0895h; equal graphics RAM, DDRAM, RE, G and
// display bit; and equal writes to ports 07h and 87h with equal cycles
// between them. Each row is exactly 78 T longer in the session: the restart
// path and the range test, against MON-3's jump and its own test.

const K = 78;
/** The selectors built: MON-3's routines, relocated. */
const BUILT = Array.from({ length: 21 }, (_, i) => i);
let callSidesMade;
const theCallSides = async () => (callSidesMade ??= await callSides());

/** The rows of SELS, or all of them. */
const rowsOf = (sels = BUILT) => CALL_ROWS.filter(([s]) => sels.includes(s) && BUILT.includes(s));

/** What fails for the rows of SELS on SIDES: the rows that differ, and the cycles that are not reference + K. */
function callFailures(sides, sels) {
  const r = compareCalls(sides, rowsOf(sels));
  const out = [...r.bad];
  for (const [sel, set] of Object.entries(r.extra)) if (set.size !== 1 || !set.has(K)) out.push(`call ${sel}: ${[...set].join(", ")} T more, not ${K}`);
  return { out, r };
}

test("KG67 rst 18h calls", { timeout: 600_000 }, async () => {
  const { out, r } = callFailures(await theCallSides());
  assert.deepEqual(out, []);
  assert.equal(r.rows, 2 * rowsOf().length);
  assert.ok(r.lowSP > 0x3ef1, `the lowest SP ${r.lowSP.toString(16)}h, above the compared bytes`);
  console.log(`RST 18h calls: ${r.rows} rows equal, each ${K} T longer; the lowest SP ${r.lowSP.toString(16)}h`);
});

// From the RST's fetch to the routine's first instruction: 253 T in the
// session, 175 T under MON-3, for every row.

test("KG67 rst 18h timing", async () => {
  const r = compareCalls(await theCallSides(), rowsOf());
  for (const [sel, set] of Object.entries(r.entry)) assert.deepEqual([...set], ["253/175"], `call ${sel}: the session's T to the routine / MON-3's`);
  for (const [sel, set] of Object.entries(r.extra)) assert.deepEqual([...set], [K], `call ${sel}: ${K} T longer`);
});

// Each selector's mutant, a patch inside its routine, is caught by its rows.

const MUTANTS = [
  [0, "INIT_BASIC's 0Ch written 08h", [["GINITB: DB $30,$0C,$06,$01", "GINITB: DB $30,$08,$06,$01"]]],
  [1, "clearGBUF's count 03FFh written 03FEh", [["  ld bc,$03FF\n  ldir           ; and the other 1,023\n", "  ld bc,$03FE\n  ldir           ; and the other 1,023\n"]]],
  [2, "clearGrLCD's CP 20H written CP 1FH", [["  cp $20         ; 32 pairs\n", "  cp $1F         ; 32 pairs\n"]]],
  [3, "clearTxtLCD's count 40h written 3Fh", [["  ld b,$40       ; 64 characters\n", "  ld b,$3F       ; 64 characters\n"]]],
  [4, "setGrMode's 36h written 34h", [["  ld a,$36       ; and graphics on\n", "  ld a,$34       ; and graphics on\n"]]],
  [5, "setTxtMode's 30h written 34h", [["  ld a,$30       ; the basic set\n", "  ld a,$34       ; the basic set\n"]]],
  [6, "drawBox's right-hand loop removed", [["\nGBOX4:\n  call GPIX\n  ld a,e         ; Y1\n  inc c          ; the next Y\n  cp c\n  jr nc,GBOX4    ; up to Y1\n", "\n"]]],
  [7, "drawLine's ENDPT taken from BC, not DE", [["  ld (ENDPT),de  ; where the line ends\n", "  ld (ENDPT),bc  ; where the line ends\n"]]],
  [8, "drawCircle's first-quadrant CALL drawPixel removed", [["  call GPIX      ; quadrant I\n", ""]]],
  [9, "drawPixel's OR (HL) removed", [["  or (hl)        ; the bit set\n", ""]]],
  [10, "fillBox's outer loop run once", [["  jr nc,GFBOX    ; up to X1\n", ""]]],
  [11, "fillCircle stopping at radius E-1", [["  jr nc,GFCIR1   ; up to E\n", "  jr nz,GFCIR1   ; up to E\n"]]],
  [12, "plotToLCD's CLRBUF test inverted", [["  jr z,GPLOT4    ; no: kept\n", "  jr nz,GPLOT4   ; no: kept\n"]]],
  [13, "printString's ROWS index one higher", [["  ld hl,GROWS\n", "  ld hl,GROWS+1\n"]]],
  [14, "printChars' ADD A,B removed", [["  add a,b        ; and the column\n", ""]]],
  [15, "V_DELAY_US 000Bh", [["VDLY EQU $000A", "VDLY EQU $000B"]]],
  [16, "delayMS's loop with a NOP", [["  dec de         ; one count\n", "  dec de         ; one count\n  nop\n"]]],
  [17, "setBufClear's JP clearGBUF written RET", [["  jp GCLRB       ; and the buffer\n", "  ret\n"]]],
  [18, "setBufNoClear writing 01h", [["GBKEEP:\n  xor a          ; zero\n", "GBKEEP:\n  ld a,1\n"]]],
  [19, "clearPixel's CPL removed", [["  cpl\n  and (hl)       ; the bit cleared\n", "  and (hl)       ; the bit cleared\n"]]],
  [20, "flipPixel's XOR (HL) written OR (HL)", [["  xor (hl)       ; the bit flipped\n", "  or (hl)        ; the bit flipped\n"]]],
];

/** Sides with SVC in the session and MON-3 as the reference. */
const mutantSides = async (svc) => ({ ref: (await theCallSides()).ref, ses: (await callSides({ svc })).ses });

for (const [sel, name, edits] of MUTANTS.filter(([s]) => BUILT.includes(s))) {
  test(`KG67 mutant: call ${sel}, ${name}`, async () => {
    const { out } = callFailures(await mutantSides(await mon3Variant(edits)), [sel]);
    assert.ok(out.length, `call ${sel}'s rows catch it`);
  });
}

// The dispatch's mutants.

test("KG67 mutant: the range test 20, selector 20 refused", async () => {
  const sides = await mutantSides(await mon3Variant([["  cp 21          ; calls 0 to 20\n", "  cp 20          ; calls 0 to 20\n"]]));
  assert.throws(() => callFailures(sides, [20]), /call 20 .* on session/, "call 20 waits on the error display");
});

test("KG67 mutant: the range test 22, selector 21 runs the word after the table", async () => {
  const svc = await mon3Variant([["  cp 21          ; calls 0 to 20\n", "  cp 22          ; calls 0 to 20\n"]]);
  const { ref } = await theRefusalSides();
  const ses = await sessionSide({ svc });
  // A refused RST 18h runs in page zero only at its slot and the latch
  // stub. The word after the table jumps elsewhere: the run stops there.
  const step = ses.m.step.bind(ses.m);
  ses.m.step = () => {
    const pc = ses.m.pc;
    if (pc < 0x100 && !(pc >= 0x18 && pc < 0x20) && !(pc >= 0x41 && pc < 0x49)) throw new Error(`the refusal ran at ${pc.toString(16)}h`);
    return step();
  };
  assert.throws(() => compareRefusals(ref, ses, [21]), /the refusal ran at 21h/, "the refusal row for A 21");
});

test("KG67 mutant: one more instruction in the dispatch, 82 T", async () => {
  const sides = await mutantSides(await mon3Variant([["  jp nc,DERR     ; the rest refused\n", "  jp nc,DERR     ; the rest refused\n  nop\n"]]));
  const r = compareCalls(sides, rowsOf([1]));
  assert.deepEqual([...r.extra[1]], [82], "82 T longer, not 78");
  await assert.rejects(glcdText(sides.ses.svc), /418,666/, "and glcd-text's DONE 6 x 4 T later");
});

test("KG67 mutant: a routine reading GBUF where MON-3 reads (VPORT)", async () => {
  const sides = await mutantSides(await mon3Variant([["  ld de,(VPORT)\n  dec de\n", "  ld de,GBUF\n  dec de\n"]]));
  const bad = compareCalls(sides, CALL_ROWS.filter(([s, i]) => s === 9)).bad;
  assert.ok(bad.length && bad.every((b) => b.includes("vport 1000")), bad.join("\n"));
});

// The programs, each loaded by LOAD PROG.BIN and run by GO on the serial
// console, against the same binary under MON-3's GO. A program's return is
// the fetch at its RET's target: 0049h in a session, MON-3's softBoot. The
// session's cycles are the reference's and 78 T for each RST 18h.

/** NAME on both sides to END ("return", or a symbol), R pinned for glcd-maze: { R, S, ref, ses }. */
async function bothRuns(name, { svc, window } = {}) {
  const { bytes, symbols } = await realBuild(name);
  const ldar = name === "glcd-maze" ? ldarOf([...bytes]) : [];
  const ref = programReference(bytes, { ldar });
  const ses = await programSession(bytes, { svc, ldar });
  const end = (run, back) => {
    const at = window ? window.at(bytes, symbols) : back;
    const cycles = runToPc(run, at, window?.cycles ?? 2_000_000_000, `${name} to ${at.toString(16)}h`);
    return { cycles, rst18: run.count[0x18], rst10: run.count[0x10], end: snap(run.m), regs: regsOf(run.m.cpu.cpu) };
  };
  return { R: end(ref, MON3_SOFTBOOT), S: end(ses, GORET), ref, ses, bytes, symbols };
}

/** The readings compared at a program's end: GBUF, 0E00h-0E19h, graphics RAM, DDRAM and the mode. */
const panelOf = ({ end }) => ({ gbuf: end.gbuf, vars: end.vars, gdram: end.gdram, ddram: end.ddram, re: end.mode.re, graphics: end.mode.graphics });

async function returning(name, cycles, rsts, opts) {
  const run = await bothRuns(name, opts);
  const { R, S } = run;
  assert.equal(R.rst18, rsts, `${name}: ${rsts} RST 18h under MON-3`);
  assert.equal(S.rst18, rsts, `${name}: ${rsts} RST 18h in the session`);
  assert.equal(R.cycles, cycles, `${name}: ${cycles} cycles under MON-3`);
  assert.equal(S.cycles, cycles + K * rsts, `${name}: ${cycles + K * rsts} cycles in the session`);
  assert.deepEqual(panelOf(S), panelOf(R), `${name}: the panel and the workspace at the return`);
  assert.deepEqual(S.regs, R.regs, `${name}: A, BC, DE, HL, IY and SP at the return`);
  return run;
}

test("KG67 glcd-mad", { timeout: 600_000 }, async () => {
  const { R, S } = await returning("glcd-mad", 161_974_159, 783);
  console.log(`glcd-mad: ${R.cycles} cycles under MON-3, ${S.cycles} in the session, ${S.rst18} RST 18h`);
});

test("KG67 glcd-maze", { timeout: 600_000 }, async () => {
  const { R, S } = await returning("glcd-maze", 264_483_566, 21_005);
  console.log(`glcd-maze: ${R.cycles} cycles under MON-3, ${S.cycles} in the session, ${S.rst18} RST 18h`);
});

/** glcd-text to DONE in a window of 1,000,000 cycles. */
async function glcdText(svc) {
  const run = await bothRuns("glcd-text", { svc, window: { at: (b, s) => s.DONE, cycles: 1_000_000 } });
  const { R, S } = run;
  assert.equal(R.cycles, 418_198, "DONE at 418,198 cycles under MON-3");
  assert.equal(R.rst18, 6, "after 6 RST 18h");
  assert.equal(S.rst18, 6, "6 RST 18h in the session");
  assert.equal(S.cycles, 418_198 + 6 * K, "DONE at 418,666 in the session");
  assert.deepEqual({ ...panelOf(S), gdram: 0 }, { ...panelOf(R), gdram: 0 }, "DDRAM, the mode, GBUF and 0E00h-0E19h at DONE");
  assert.equal(S.end.mode.re || S.end.mode.graphics, false, "text mode: RE and G clear");
  return run;
}

test("KG67 glcd-text", async () => {
  await glcdText();
});

/** glcd-demo to HALT_LOOP, 4022h, in a window of 2,000,000 cycles. */
async function glcdDemo(svc) {
  const loop = (b) => 0x4000 + b.findIndex((x, i) => x === 0x18 && b[i + 1] === 0xfe);
  const run = await bothRuns("glcd-demo", { svc, window: { at: loop, cycles: 2_000_000 } });
  const { R, S, bytes } = run;
  assert.equal(loop(bytes), 0x4022, "HALT_LOOP at 4022h");
  assert.equal(R.rst18 + R.rst10 + S.rst18 + S.rst10, 0, "no RST on either side");
  assert.equal(R.cycles, 1_034_874, "HALT_LOOP at 1,034,874 cycles under MON-3");
  assert.equal(S.cycles, 1_034_874, "HALT_LOOP at 1,034,874 cycles in the session too");
  assert.equal(R.end.pixels, 442, "442 pixels set under MON-3");
  assert.deepEqual([S.end.gdram, S.end.gbuf, S.end.vars], [R.end.gdram, R.end.gbuf, R.end.vars], "graphics RAM, GBUF and 0E00h-0E19h at HALT_LOOP");
  return run;
}

test("KG67 glcd-demo", async () => {
  await glcdDemo();
});

// glcd-3d by its key script: the nine stops and the return equal, and at the
// return graphics mode with text in DDRAM, the state GRT stands in for on
// the GLCD console. 792 RST 18h and 16 RST 10h on each side.

test("KG67 glcd-3d", { timeout: 600_000 }, async () => {
  const { bytes, symbols } = await realBuild("glcd-3d");
  const ref = programReference(bytes);
  const R = drive3d(ref, symbols, MON3_SOFTBOOT);
  const ses = await programSession(bytes);
  const S = drive3d(ses, symbols, GORET);
  assert.equal(R.length, 10, "nine stops and the return");
  assert.deepEqual(S.map((s) => s.at), R.map((s) => s.at));
  R.forEach((r, i) => assert.deepEqual(S[i], r, `stop ${i} (${r.at}${r.key === undefined ? "" : `, key ${r.key.toString(16)}h`})`));
  const back = S.at(-1);
  assert.ok(back.mode.re && back.mode.graphics && back.ddram.trim() !== "", "at the return: graphics mode, with text in DDRAM");
  for (const [side, c] of [["MON-3", ref.count], ["the session", ses.count]]) assert.deepEqual([c[0x18], c[0x10]], [792, 16], `${side}: 792 RST 18h and 16 RST 10h`);
});

// After glcd-text and glcd-demo, which never return, a reset: the card's
// files as before GO, no service, and (0006h) B9A4h.

test("KG67 reset after", async () => {
  // Each program runs here, to the end its own test reaches.
  const runs = { "glcd-text": await glcdText(), "glcd-demo": await glcdDemo() };
  for (const [name, { ses }] of Object.entries(runs)) {
    const { m, before } = ses;
    m.reset();
    m.expect(/A>$/, { from: m.output.length, maxCycles: 400_000_000 });
    m.runUntil(() => m.ready(), 400_000_000, `the prompt after ${name}'s reset`);
    const a = volume(m.image, "A");
    assert.deepEqual(Object.fromEntries(a.list().map((f) => [f.name, sha(a.read(f.name))])), before, `${name}: the card's files as before GO`);
    assert.deepEqual(services(m), [], `${name}: no service after the reset`);
    assert.equal(word(m, 6), 0xb9a4, `${name}: (0006h) B9A4h`);
  }
});

test("KG67 mutant: the dispatch jumping with BC still pushed", async () => {
  const svc = await mon3Variant([["  pop hl\n  pop bc         ; HL and BC back\n  jp (ix)\n", "  pop hl\n  jp (ix)\n"]]);
  await assert.rejects(glcdText(svc), /glcd-text to|DDRAM/);
});

test("KG67 mutant: plotToLCD returning at once", { timeout: 600_000 }, async () => {
  const svc = await mon3Variant([["GPLOT:\n  ld hl,(VPORT)  ; the buffer\n", "GPLOT:\n  ret\n  ld hl,(VPORT)  ; the buffer\n"]]);
  const { R, S } = await bothRuns("glcd-mad", { svc });
  assert.notEqual(S.end.gdram, R.end.gdram, "glcd-mad's graphics RAM differs");
});

test("KG67 mutant: glcd-maze without the R pin", { timeout: 600_000 }, async () => {
  const { bytes } = await realBuild("glcd-maze");
  const [ref, ses] = [programReference(bytes), await programSession(bytes)];
  runToPc(ref, MON3_SOFTBOOT, 2_000_000_000, "glcd-maze under MON-3");
  runToPc(ses, GORET, 2_000_000_000, "glcd-maze in the session");
  assert.notEqual(snap(ses.m).gbuf, snap(ref.m).gbuf, "the two sides' GBUF differ");
});

// The console after a program returns. GLCDRET's TXT leaves text mode with
// text in DDRAM, as glcd-text ends; GRT graphics mode with text left in
// DDRAM, as glcd-3d returns from its menu.

const GLCDRET_SHA = "a64282737d20d85ab9c2b72ecd1136ce35f5a20b9481aaf5a7e303a0185e7ae8";
async function glcdret() {
  const { bytes, symbols } = await program("glcdret", { base: 0x4000 });
  assert.equal(bytes.length, 59, "GLCDRET.BIN: 59 bytes");
  assert.equal(sha(Uint8Array.from(bytes)), GLCDRET_SHA, "GLCDRET.BIN: its hash");
  assert.deepEqual([symbols.TXT, symbols.GRT], [0x4000, 0x4016], "TXT at 4000h, GRT at 4016h");
  return { bytes: Uint8Array.from(bytes), symbols };
}

/**
 * Whether the panel on M can be read at PROMPT: glcdScreen's last row that
 * is not empty is the prompt; RE and G set, display on, no line reversed
 * and no scroll; DDRAM 64 spaces, since the ST7920 shows its text over the
 * graphics. Returns what fails.
 */
function unreadable(m, prompt) {
  const g = glcdOf(m);
  const rows = m.glcdScreen().filter((l) => l.trim() !== "");
  const out = [];
  if (!rows.length || !rows.at(-1).trimEnd().endsWith(prompt)) out.push(`the last row ${JSON.stringify(rows.at(-1))}`);
  if (!(g.re && g.graphics && g.on)) out.push(`the mode ${JSON.stringify({ re: g.re, graphics: g.graphics, on: g.on })}`);
  if (g.reverse || g.scroll) out.push("a line reversed or scrolled");
  if (g.ddram !== " ".repeat(64)) out.push(`DDRAM ${JSON.stringify(g.ddram.trim())}`);
  return out;
}

/** BYTES run by GO AT on the GLCD-console board with SVC, to MON3>: the machine and the console's text from GO. */
async function glcdGo(svc, bytes, at = 0x4000, matrix = true) {
  const { m } = await inSession({ "PROG.BIN": bytes }, { svc, machine: { matrix } });
  assert.ok(line(m, "LOAD PROG.BIN").mon3);
  goTo(m, `GO ${at.toString(16)}`, at, 20_000_000);
  m.mark = m.output.length;
  const out = toMon3(m, 2_000_000_000);
  return { m, out };
}

const BRK = Uint8Array.from([0xf7, 0xc9]); // RST 30h; RET
// LD HL,(0001h); LD DE,000Ch; ADD HL,DE; INC (HL); RET: the RAM BIOS
// table's LIST entry changed.
const DAMAGE = Uint8Array.from([0x2a, 0x01, 0x00, 0x11, 0x0c, 0x00, 0x19, 0x34, 0xc9]);
const WARN = "Tables damaged: EXIT and reset";

async function consoleAfterGo(svc) {
  svc ??= await mon3Build();
  // The session's mode bytes are GLCD.SVC's GLCMOD.
  const glcmod = /^GLCMOD: DB (.*)$/m.exec(readFileSync(resolve(ROOT, "drivers/glcd.asm"), "utf8"))[1].split(",").map((x) => parseInt(x.trim().replace("$", ""), 16));
  assert.deepEqual([...svc.file.subarray(svc.symbols.GMODE, svc.symbols.GMODE + 5)], glcmod, "the restore's bytes are GLCD.SVC's GLCMOD");
  const { bytes: ret, symbols } = await glcdret();
  for (const [name, bytes, at] of [["glcd-mad", await realProgram("glcd-mad"), 0x4000], ["TXT", ret, symbols.TXT], ["GRT", ret, symbols.GRT]]) {
    const { m } = await glcdGo(svc, bytes, at);
    assert.deepEqual(unreadable(m, "MON3>"), [], `${name}: the panel at MON3>`);
    assert.ok(!line(m, "EXIT").mon3);
    assert.deepEqual(unreadable(m, "A>"), [], `${name}: the panel at A> after EXIT`);
  }
  // Call 2's return runs the restore too: TXT's drawing, then LD C,2 and
  // RST 10h in place of its RET. On the serial console the panel keeps
  // the program's text mode and text.
  const pre = Uint8Array.from([...ret.subarray(0, 0x15), 0x0e, 0x02, 0xd7]);
  assert.equal(ret[0x15], 0xc9, "TXT ends in RET at 4015h");
  const g2 = await glcdGo(svc, pre, 0x4000, true);
  assert.deepEqual(unreadable(g2.m, "MON3>"), [], "call 2: the panel at MON3>");
  const s2 = await glcdGo(svc, pre, 0x4000, false);
  const k = glcdOf(s2.m);
  assert.ok(!k.re && !k.graphics && k.ddram.includes("TEXT LEFT"), `call 2, serial console: the panel as the program left it (${JSON.stringify(k.ddram.trim())})`);
  // The messages follow the restore and the form feed, so they stay on the panel.
  for (const [name, bytes, text] of [["RST 30h", BRK, "BRK 4001"], ["damaged", DAMAGE, WARN]]) {
    for (const matrix of [true, false]) {
      const { m, out } = await glcdGo(svc, bytes, 0x4000, matrix);
      const ff = out.indexOf("\f");
      assert.ok(ff >= 0 && out.indexOf(text) > ff && out.lastIndexOf("MON3>") > out.indexOf(text), `${name}, ${matrix ? "GLCD" : "serial"} console: the form feed, ${text}, then MON3> (${JSON.stringify(out)})`);
      if (matrix) {
        const rows = m.glcdScreen().filter((l) => l.trim() !== "");
        assert.ok(rows.map((r) => r.trim()).join(" ").includes(text), `${name}: ${text} on the panel (${JSON.stringify(rows)})`);
        assert.ok(rows.at(-1).trimEnd().endsWith("MON3>"), `${name}: MON3> below it`);
      }
    }
  }
}

test("KG67 console after go", { timeout: 600_000 }, () => consoleAfterGo());

// The serial console keeps the panel, as MON-3's softBoot does: TXT's text
// mode and DDRAM text stay at MON3>, and glcd-mad's graphics RAM.

async function serialKeeps(svc) {
  const { bytes: ret, symbols } = await glcdret();
  const t = await glcdGo(svc, ret, symbols.TXT, false);
  const g = glcdOf(t.m);
  assert.ok(!g.re && !g.graphics, "TXT: text mode at MON3>");
  assert.ok(g.ddram.includes("TEXT LEFT"), `TXT: TEXT LEFT in DDRAM at MON3> (${JSON.stringify(g.ddram.trim())})`);
  const mad = await programSession(await realProgram("glcd-mad"), { svc });
  runToPc(mad, GORET, 2_000_000_000, "glcd-mad's return");
  const atReturn = snap(mad.m).gdram;
  mad.m.mark = mad.m.output.length;
  toMon3(mad.m);
  assert.equal(snap(mad.m).gdram, atReturn, "glcd-mad: the graphics RAM at MON3> as at its return");
}

test("KG67 serial console keeps the panel", { timeout: 600_000 }, () => serialKeeps());

const RESTORE = "  call GRST      ; the GLCD's modes\n";
for (const [name, edits, run, why] of [
  ["the restore removed", [[RESTORE, ""]], consoleAfterGo, /TXT: the panel at MON3>/],
  ["the restore without its 01h", [["GMODE: DB $30,$0C,$01,$34,$36", "GMODE: DB $30,$0C,$0C,$34,$36"]], async (svc) => {
    const { bytes, symbols } = await glcdret();
    const { m } = await glcdGo(svc, bytes, symbols.GRT);
    assert.deepEqual(unreadable(m, "MON3>"), [], "GRT: the panel at MON3>");
  }, /DDRAM "MENU TEXT"/],
  ["a mode byte that differs from GLCD.SVC's GLCMOD", [["GMODE: DB $30,$0C,$01,$34,$36", "GMODE: DB $30,$0C,$01,$34,$37"]], consoleAfterGo, /GLCD.SVC's GLCMOD/],
  ["the restore made unconditional", [["  cp 3           ; CON: on UC1:?\n  ret nz         ; no: left alone\n", "  cp 3           ; CON: on UC1:?\n"]], serialKeeps, /TXT: text mode at MON3>|TEXT LEFT/],
  ["the messages printed before the restore and the form feed", [[`${RESTORE}  ld de,MFF\n  call PRINT     ; a form feed\n  ld hl,DMG\n`, "  ld hl,DMG\n"], ["  or a           ; from RST 30h?\n  jp z,PROMPT    ; no\n", "  or a           ; from RST 30h?\n  jr z,MRET4     ; no\n"], ["  ld de,MCRLF\n  call PRINT\n  jp PROMPT\n", `  ld de,MCRLF\n  call PRINT\n\nMRET4:\n${RESTORE}  ld de,MFF\n  call PRINT     ; a form feed\n  jp PROMPT\n`]], consoleAfterGo, /the form feed, BRK 4001, then MON3>/],
]) {
  test(`KG67 mutant: ${name}`, { timeout: 600_000 }, async () => {
    await assert.rejects(run(await mon3Variant(edits)), why);
  });
}
