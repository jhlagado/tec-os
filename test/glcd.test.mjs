// The GLCD console as a resident below (0006h): over the stack census's
// workload and CONOUT.COM, the ST7920's graphics RAM equals what b025dbb's
// driver in EXPAND 1 drew (test/glcd-screens.json); (0006h) is three pages
// lower than it was with the driver; a program on the CCP stack can call
// the BIOS's CONOUT within the declared caller-stack space; UNLOAD gives the
// console and the pages back. Emulator evidence.
// The screens that show a write to a read-only volume were retaken: it came to say R/O.
// Every screen was retaken when the shell's prompt came to name the drive's
// volume and its DIR to list sizes; the commands are the same.
// The two screens that show DIR B:'s rows were retaken when DIR came to print
// the name and type together; the other eighteen are as they were.
// When SAVE left the ROM, PUT.COM took its place in the two commands that
// write a file, and the five screens after PUT 4 S.COM, TYPE S.COM, ERA S.COM,
// PUT 1 C:X.COM and DIR E: were retaken; the other fifteen are as they were.
// The three editing screens were retaken when buffered input began ignoring
// navigation. Matrix 05h and 03h mean left and up, not Ctrl-E and Ctrl-C.
// Their old screens included the cursor corruption. The other seventeen stay.
// Up recalls history; Down restores empty input before its pixel capture.
// KS48 keeps this historical oracle on its original-font input. Only the
// historical pixel workload serves the original font's rows at FNTGLY, the
// ROM's one reader of its packed font. So this oracle checks the driver
// against the font contract; hwsvc.test.mjs covers the ROM's unpacker.
// Other GLCD tests and Compact
// alias/rendering tests use the unmodified production ROM.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Machine } from "./lib/machine.mjs";
import {substituteHistoricalFont} from "./lib/historical-font.mjs";
import { callTimes, runLine } from "./lib/call-time.mjs";
import { GLCD_SVC } from "./lib/fixtures.mjs";
import { makeSvc } from "../tools/lib/svc.mjs";
import { ROOT, TEST_CLOCK, fcbType, program, romFor, standardCard, volume, withDisplay, withShell } from "./lib/fixtures.mjs";

const referenceBytes = readFileSync(resolve(ROOT, "test/glcd-screens.json"));
assert.equal(createHash("sha256").update(referenceBytes).digest("hex"),"2ef985ddeb2a183420f1274da0bc338c2669950697141a27ee4d4aedb2191eee","the historical command list and oracle, with the DIR, PUT and navigation screens retaken");
const REF = JSON.parse(referenceBytes);
const PROGRAMS = ["probe", "term", "insdel", "region", "flip", "vidmode", "conout", "fill", "put"];
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

async function card() {
  const image = standardCard([{ geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true }]);
  const a = volume(image, "A");
  for (const n of PROGRAMS) a.write(`${n.toUpperCase()}.COM`, (await program(n)).bytes);
  a.write("DATA.BIN", new Uint8Array(20000).map((_, i) => i & 0xff));
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1}\r\n`).join("") + "\x1a", "latin1"));
  // The shell first, as on the starter card: the workload's COPY and [more] are its.
  return withDisplay(withShell(image, "GLCD.SVC"), { matrix: true });
}

/** A GLCD board at its first prompt, the GLCD console loaded; or, with
 *  matrix false, a serial board on the same card, which never loads it. */
async function board({ matrix = true, historicalFont = false } = {}) {
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: await card(), clock: TEST_CLOCK, matrix });
  if (historicalFont) m.glyphCalls = substituteHistoricalFont(m, readFileSync(resolve(ROOT, "format/font-original.bin")));
  m.historicalFont = historicalFont;
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  return m;
}

/** Settle at character input, after echo and its incidental status polls. */
function heldInput(m) {
  const first = m.sym("CINMX"), last = m.sym("CINME");
  m.runUntil(() => m.pc >= first && m.pc < last, 50_000_000, "buffered character input");
}

/** Navigation changes neither the logical line nor the displayed cursor. */
function ignoredArrow(m, key) {
  heldInput(m);
  const state = () => {
    const count = m.read(m.sym("LINCNT")), buffer = word(m, m.sym("PARAM"));
    return { count, pointer: word(m, m.sym("LINPTR")),
      bytes: Array.from({ length: count }, (_, i) => m.read(buffer + 2 + i)),
      row: m.read(m.sym("VROW")), col: m.read(m.sym("VCOL")) };
  };
  const before = state(), mark = m.output.length;
  m.type(key);
  heldInput(m);
  assert.deepEqual(state(), before, "the GLCD prompt ignores the navigation key");
  assert.equal(m.text(mark), "", "no navigation byte is echoed");
}

/** Type a line and run to the prompt, answering [more] or an error's key. */
function run(m, line) {
  m.glcdWorkloadCommand = line;
  m.mark = m.output.length;
  if (line === "ABC\b\b\x15XYZ\x12\x05Q\r") {
    m.type("ABC\b\b\x15XYZ\x12");
    ignoredArrow(m, "\x05"); // matrix left, after retyping XYZ
    m.type("Q\r");
  } else if (line === "\x03") {
    heldInput(m);
    const position = [m.read(m.sym("VROW")), m.read(m.sym("VCOL"))];
    const lineText = () => {
      const p = word(m, m.sym("PARAM")), n = m.read(m.sym("LINCNT"));
      return String.fromCharCode(...Array.from({ length: n }, (_, i) => m.read(p + 2 + i)));
    };
    m.type(line); heldInput(m);
    assert.equal(lineText(), "XYZQ", "up recalls the preceding command");
    m.type("\x04"); heldInput(m);
    assert.equal(lineText(), "", "down passes the newest history entry");
    assert.deepEqual([m.read(m.sym("VROW")), m.read(m.sym("VCOL"))], position);
    return;
  } else m.type(line);
  const prompt = /\r\n[A-P](:\S*)?>$/;
  let seen = -1;
  for (let i = 0; i < 400; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(m.mark))), 30_000_000, line);
    const t = m.text(m.mark);
    if (prompt.test(t) && m.waitingForInput()) return;
    if (m.output.length === seen && m.waitingForInput()) m.type(/\[more\]$/.test(t) ? " " : "\r");
    seen = m.output.length;
  }
  throw new Error(`no prompt after ${JSON.stringify(line)}`);
}

/**
 * The deepest BIOS CONOUT call made by a program (its return address in the
 * TPA): the caller's SP before the CALL less the lowest SP during it, so the
 * return address counts. And the lowest address written in the BDOS stack.
 */
function watch(m) {
  const entry = word(m, 1) + 9, privateEntry = m.sym("BCONOUT");
  assert.equal(entry, m.sym("RAMBIOS") + 12, "the program's live CONOUT table slot");
  assert.equal(m.read(entry), 0xc3, "the BIOS slot remains an actual jump");
  const [base, top] = [m.sym("STKBASE"), m.sym("STKTOP")];
  const [ccpBase, ccpTop] = [m.sym("CSTKBAS"), m.sym("CSTKTOP")];
  const apiRet = m.symbols.get("HKAPIRET"), nativeWrapper = m.symbols.get("HKBI4");
  if (nativeWrapper !== undefined) {
    const enter = m.sym("HKBENTER");
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => m.read(nativeWrapper + i)), [0xcd, enter & 255, enter >> 8, 0xc3, privateEntry & 255, privateEntry >> 8], "the complete native wrapper is bound to this map");
  }
  let program = 0, bdosLow = top, active = null, legacyActive = null;
  const calls = [], legacy = { entries: 0, completed: 0, program: 0 };
  let entries = 0;
  const step = m.step.bind(m);
  m.step = () => {
    const r = step(), pc = m.pc, sp = m.cpu.cpu.sp & 0xffff;
    // Preserve the former private-body observer as a separately reported
    // control; its zero result cannot stand in for real caller samples.
    if (!legacyActive && pc === privateEntry && word(m, sp) < 0x8000) {
      legacy.entries++;
      legacyActive = { sp0: sp, ret: word(m, sp), min: sp };
    } else if (legacyActive) {
      legacyActive.min = Math.min(legacyActive.min, sp);
      if (pc === legacyActive.ret && sp === legacyActive.sp0 + 2) {
        legacy.completed++; legacy.program = Math.max(legacy.program, legacyActive.sp0 + 2 - legacyActive.min); legacyActive = null;
      }
    }
    if (!active && pc === entry && word(m, sp) >= 0x100 && word(m, sp) < 0x8000) {
      assert.ok(m.classicBankIn);
      const depth = m.symbols.has("HKDEP") ? m.read(m.sym("HKDEP")) : null;
      const busy = m.symbols.has("HKBUSY") ? m.read(m.sym("HKBUSY")) : null;
      const target = word(m, entry + 1);
      active = { command: m.glcdWorkloadCommand, sp0: sp, ret: word(m, sp), min: sp, depth, busy, target, root: target === nativeWrapper && depth === 0 && busy === 0, privateVisits: [], wrapped: false, apiReturned: false, onCcpStack: sp >= ccpBase && sp < ccpTop };
      entries++;
    } else if (active) {
      active.min = Math.min(active.min, sp);
      if (pc === privateEntry && active.root) {
        assert.ok(m.classicBankIn);
        const visit = { sp, returnPC: word(m, sp), savedCaller: word(m, m.sym("APIRTPC")), depth: m.read(m.sym("HKDEP")), busy: m.read(m.sym("HKBUSY")) };
        visit.functional = sp === active.sp0 && visit.returnPC === apiRet;
        active.privateVisits.push(visit);
        if (visit.functional) {
          active.handlerReturn = visit.returnPC; active.savedCaller = visit.savedCaller;
          assert.equal(active.savedCaller, active.ret);
          assert.deepEqual([visit.depth, visit.busy], [1, 0]);
          active.wrapped = true;
        }
      }
      if (pc === apiRet && active.root) {
        assert.ok(m.classicBankIn); assert.equal(sp, active.sp0 + 2);
        assert.equal(word(m, m.sym("APIRTPC")), active.ret); active.apiReturned = true;
      }
      if (pc === active.ret && sp === active.sp0 + 2) {
        assert.ok(m.classicBankIn);
        if (active.root) {
          assert.ok(active.wrapped && active.apiReturned);
          assert.deepEqual([m.read(m.sym("HKDEP")), m.read(m.sym("HKBUSY"))], [0, 0]);
          assert.equal(word(m, active.sp0), active.ret, "the original caller return slot is restored");
        }
        if (active.onCcpStack) assert.ok(active.min >= ccpBase, "the actual caller never descends below its CCP stack allocation");
        active.used = active.sp0 + 2 - active.min;
        program = Math.max(program, active.used); calls.push(active); active = null;
      }
    }
    return r;
  };
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir && addr >= base && addr < top) bdosLow = Math.min(bdosLow, addr);
    write(addr, value);
  };
  return () => ({ program, entries, completed: calls.length, active: active !== null, calls, legacy, bdos: { reserved: top - base, deepest: top - bdosLow } });
}

async function workloadRun({ historicalFont = false } = {}) {
  const m = await board({ historicalFont });
  const depths = watch(m);
  const bdosVector = word(m, 6);
  const screens = REF.screens.map(({ line }) => {
    run(m, line);
    const gdram = createHash("sha256").update(Uint8Array.from(m.tec1g.state.display.glcdCtrl.glcd)).digest("hex").slice(0, 16);
    return { line, gdram };
  });
  return { m, bdosVector, screens, depths: depths() };
}

const workload = workloadRun(); // production input for TPA/CONOUT-stack readings

test("the resident GLCD draws every screen of the workload as the driver did, byte for byte", { timeout: 1_800_000 }, async () => {
  const {rom:selected}=romFor(),before=Buffer.from(selected);
  const original=readFileSync(resolve(ROOT,"format/font-original.bin")),probe={sym:()=>0,cpu:{cpu:{}}};
  assert.throws(()=>substituteHistoricalFont(probe,undefined),/original font required/);
  const wrongOriginal=Buffer.from(original);wrongOriginal[0]^=8;
  assert.throws(()=>substituteHistoricalFont(probe,wrongOriginal),/original font identity/);
  assert.throws(()=>substituteHistoricalFont(probe,original.subarray(0,384)),/original font size/);
  const { m, screens } = await workloadRun({ historicalFont: true });
  assert.equal(m.historicalFont, true);
  assert.ok(m.glyphCalls() > 0, "the GLCD's glyphs came from the original font");
  assert.deepEqual(Buffer.from(romFor().rom), before, "the production ROM unchanged");
  assert.deepEqual(screens, REF.screens, `historical-font input: the ST7920's graphics RAM against ${REF.from}'s driver`);
  assert.deepEqual(m.violations, []);
});

test("on a GLCD board (0006h) is three pages lower than with the driver, and no more", { timeout: 1_800_000 }, async () => {
  const { m, bdosVector } = await workload;
  assert.equal(m.historicalFont, false, "TPA reading uses production font");
  // Three pages below the eighteen-page
  // shell and the stub's page. The old
  // REF.bdosVector - 306h figure predates
  // the stub's 479-byte move and the
  // shell's resident allocation.
  const stub = word(m, m.sym("STUBAD"));
  assert.equal(bdosVector, ((stub >> 8) - 18 - 3) << 8);
});

test("a program on the CCP stack calls CONOUT directly in what the stack leaves it, CCPSTN less the return word, and the BDOS stack keeps a quarter free", { timeout: 1_800_000 }, async (t) => {
  const { m, depths } = await workload;
  assert.equal(m.historicalFont, false, "CONOUT stack reading uses production font");
  const free = m.sym("CSTKTOP") - 2 - m.sym("CSTKBAS");
  assert.equal(free, m.sym("CCPSTN") - 2, "the stack is CCPSTN, less the return word");
  assert.ok(depths.entries > 0); assert.equal(depths.completed, depths.entries); assert.equal(depths.active, false);
  assert.ok(depths.calls.some(c => c.command?.trim().toUpperCase() === "CONOUT" && c.onCcpStack && c.root && c.wrapped && c.apiReturned), "CONOUT.COM makes a real root call on the CCP stack");
  assert.ok(depths.program > 0 && depths.program <= free, `CONOUT took ${depths.program} bytes of a program's ${free}`);
  t.diagnostic(JSON.stringify(depths));
  const { reserved, deepest } = depths.bdos;
  assert.ok((reserved - deepest) * 4 >= reserved, `the BDOS stack used ${deepest} of ${reserved}`);
});

test("UNLOAD gives the console back to serial and the pages to the TPA, and output then reaches serial", async () => {
  const before = word(await board({ matrix: false }), 6); // the same card with no GLCD
  const m = await board();
  const loaded = word(m, 6);
  run(m, "CONOUT\r");
  m.mark = m.output.length;
  m.type("UNLOAD\r");
  m.runUntil(() => m.waitingForInput() && m.read(m.sym("CONMOD")) === 0 && /[A-P](:\S*)?>$/.test(m.text(m.mark)), 50_000_000, "the prompt after UNLOAD");
  assert.equal(word(m, 6), before);
  assert.equal(loaded, (before & 0xff00) - 0x300);
  const s0 = m.serialText().length;
  m.type("FILL\r"); // HALT over the freed pages, then a line through the BDOS
  m.runUntil(() => m.serialText().slice(s0).includes("FILLED") && m.waitingForInput(), 60_000_000, "FILL's line on serial");
  assert.deepEqual(m.violations, []);
});

test("a second GLCD.SVC is refused whole, and the first keeps the console", async () => {
  const m = await board();
  const table = word(m, m.sym("GLVEC"));
  const first = word(m, 6);
  const from = m.output.length;
  run(m, "GLCD.SVC\r");
  assert.match(m.text(from), /GLCD\.SVC\?/);
  assert.equal(fcbType(m), "SVC", "the loader's path, not the COM path's");
  assert.deepEqual([word(m, 6), word(m, m.sym("GLVEC")), m.read(3) & 3], [first, table, 3]);
  m.mark = m.output.length;
  m.type("UNLOAD\r");
  m.runUntil(() => m.waitingForInput() && m.read(m.sym("CONMOD")) === 0 && /[A-P](:\S*)?>$/.test(m.text(m.mark)), 50_000_000, "the prompt after UNLOAD");
  assert.equal(word(m, m.sym("GLVEC")), 0, "the first gave it back");
  assert.deepEqual(m.violations, []);
});

test("the GLCD hook takes a table and returns LINEBUF, refuses a second, and with 0 gives the console back", async () => {
  const m = await board({ matrix: false });
  const STUB = 0x0080;
  const TABLE = 0x3000;
  const callHook = (hl) => {
    [0x06, 3, 0x21, hl & 0xff, hl >> 8, 0x0e, 12, 0xcd, m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8, 0x18, 0xfe].forEach((v, i) => m.write(STUB + i, v));
    m.cpu.cpu.sp = 0x0100;
    m.cpu.cpu.pc = STUB;
    m.runUntil(() => m.pc === STUB + 10, 1_000_000, "TNDRVR");
    const c = m.cpu.cpu;
    return { hl: (c.h << 8) | c.l, carry: c.flags.C };
  };
  assert.equal(word(m, m.sym("GLVEC")), 0, "no table on a serial board");
  assert.equal(callHook(TABLE).carry, 1, "and no keyboard, no table");
  m.write(m.sym("CONDEV"), m.read(m.sym("CONDEV")) | 1);
  assert.deepEqual(callHook(TABLE), { hl: m.sym("LINEBUF"), carry: 0 });
  assert.equal(word(m, m.sym("GLVEC")), TABLE);
  assert.deepEqual(callHook(TABLE + 0x100), { hl: TABLE + 0x100, carry: 1 }, "a second table refused, HL as given");
  assert.equal(word(m, m.sym("GLVEC")), TABLE, "and the first kept");
  m.write(m.sym("CONMOD"), 3);
  callHook(0);
  assert.deepEqual([word(m, m.sym("GLVEC")), m.read(m.sym("CONMOD"))], [0, 0], "the table dropped, the console serial, the vector the TMS9918's");
  assert.deepEqual(callHook(TABLE + 0x100), { hl: m.sym("LINEBUF"), carry: 0 }, "and a table taken again");
  assert.deepEqual(m.violations, []);
});

test("a GLCD that stops coming ready is sent nothing: GLCC and GLCDW drop a byte once the busy flag never clears (KE-198)", async () => {
  const m = await board();
  const hw = m.cpu.hardware;
  const { ioRead, ioWrite } = hw;
  const glcdPort = (port) => (port & 0xff) === 0x07 || (port & 0xff) === 0x87;
  let stuck = false;
  let sent = 0;
  hw.ioRead = (port) => (stuck && glcdPort(port) ? 0xff : ioRead(port));
  hw.ioWrite = (port, value) => {
    if (glcdPort(port)) sent += 1;
    return ioWrite(port, value);
  };
  run(m, "\r");
  assert.ok(sent > 0, "a ready GLCD is sent the prompt");
  stuck = true;
  sent = 0;
  run(m, "\r");
  assert.equal(sent, 0, "a GLCD stuck busy is sent no byte");
  assert.deepEqual(m.violations, []);
});

// FL-11, FL-12 and FL-14 (Origo KD-436): GLCD.SVC draws a word's glyphs at a
// time through TNGLYPH. At 782b007, from the table: a character 34,354 T, a row
// of text 174,161 T, and 767 bytes in 3 pages.
test("GLCD.SVC's time: a character no slower than from the table, a row within 210,000 T, a row of 21 # within 215,000", { timeout: 1_800_000 }, async (t) => {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("LINES.TXT", Buffer.from(Array.from({ length: 30 }, (_, i) => `line ${i + 1} of the text file\r\n`).join("") + "\x1a", "latin1"));
  a.write("HASH.TXT", Buffer.from(Array.from({ length: 12 }, () => `${"#".repeat(21)}\r\n`).join("") + "\x1a", "latin1"));
  withDisplay(image, { matrix: true });
  const { rom, symbols } = romFor();
  const m = new Machine({ rom, symbols, sdImage: image, clock: TEST_CLOCK, matrix: true });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  const svc = await makeSvc(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/svc") });
  const base = m.read(7) << 8;
  const put = callTimes(m, () => base + svc.symbols.GLCPUT);
  const row = callTimes(m, () => base + svc.symbols.GLCROW);
  runLine(m, "TYPE LINES.TXT");
  const mean = put.reduce((x, y) => x + y, 0) / put.length;
  assert.ok(put.length > 700 && mean <= 34_354, `${put.length} characters, mean ${Math.round(mean)} T`);
  assert.ok(row.length > 400 && Math.max(...row) <= 210_000, `${row.length} rows of text, at most ${Math.max(...row)} T`);
  t.diagnostic(`measured: ${row.length} rows of text, at most ${Math.max(...row)} T`);
  row.length = 0;
  runLine(m, "TYPE HASH.TXT");
  t.diagnostic(`measured: rows of 21 #, at most ${Math.max(...row)} T`);
  assert.ok(row.length > 0 && Math.max(...row) <= 215_000, `rows of #, at most ${Math.max(...row)} T`);
  const bytes = GLCD_SVC[6] | (GLCD_SVC[7] << 8);
  t.diagnostic(`measured: ${put.length} characters, mean ${Math.round(mean)} T; GLCD.SVC ${bytes} bytes`);
  assert.equal(bytes, 768, "GLCD.SVC's header and image: exactly its three pages (767 before the glyph service)");
  assert.equal(GLCD_SVC.length, 836, "the file: the image and 68 bytes of relocation data");
  assert.equal(GLCD_SVC[10] | (GLCD_SVC[11] << 8), 68, "the relocation data's length");
});
