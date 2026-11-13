// A:STARTUP.CMD at cold boot: the ROM's one line from the first record, the
// rest of the file run by SHELL.SVC when that line loads it, the keypad's
// skip, and a card with GLCD.SVC on boards with and without a GLCD. The
// ROM's own one-line startup is tested at the end. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { makeSvc } from "../tools/lib/svc.mjs";
import { Machine } from "./lib/machine.mjs";
import { ABI, GLCD_SVC, ROOT, SHELL_SVC, TEST_CLOCK, program, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

/** A machine at reset with FILES on A:; with SHELL, SHELL.SVC there and first in STARTUP.CMD. */
function start(files, { key = false, shell = false, rom, ...opts } = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("HELLO.TXT", Buffer.from("hello\r\n\x1a", "latin1"));
  for (const [name, bytes] of Object.entries(files)) a.write(name, bytes);
  if (shell) {
    a.write("SHELL.SVC", SHELL_SVC);
    a.write("STARTUP.CMD", Buffer.concat([Buffer.from("SHELL.SVC\r\n", "latin1"), Buffer.from(files["STARTUP.CMD"] ?? "\x1a")]));
  }
  if (rom) {
    const m = new Machine({ ...rom, sdImage: image, clock: TEST_CLOCK, ...opts });
    if (key) m.tec1g.applyKeySilent(0x01, true);
    return m;
  }
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK, ...opts });
  if (key) m.tec1g.applyKeySilent(0x01, true);
  return m;
}
const prompt = (m, max = 400_000_000) => m.runUntil(() => m.ready() && /[A-P](:\S*)?>$/.test(m.text(0)), max, "a usable prompt");
const user = (m) => m.read(4) >> 4;

test("each line runs, echoed, and a failing one prints its message; a warm boot doesn't run the file", () => {
  const m = start({ "STARTUP.CMD": startupFile("NOSUCH", "", "USER 3", "TYPE HELLO.TXT") }, { shell: true });
  prompt(m);
  const text = m.text(0);
  assert.match(text, /A(:\S*)?>NOSUCH\r\r\nNOSUCH\?/);
  assert.match(text, /A(:\S*)?>TYPE HELLO.TXT\r\r\n/);
  assert.equal(user(m), 3);
  const mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.waitingForInput() && /[A-P](:\S*)?>$/.test(m.text(mark)), 200_000_000, "warm boot");
  assert.doesNotMatch(m.text(mark), /USER/);
});

test("a file with no lines, and no file, reach the prompt; a file over one record ends at it", () => {
  prompt(start({ "STARTUP.CMD": new Uint8Array(0) }));
  prompt(start({}));
  const m = start({ "STARTUP.CMD": Buffer.from("USER 1\r\n".repeat(60) + "USER 2\r\n\x1a", "latin1") });
  prompt(m);
  assert.equal((m.text(0).match(/USER 1/g) ?? []).length, 1, "with no shell, the first line alone");
  assert.equal(user(m), 1);
});

test("a key held through reset skips the file: a hanging INIT reaches a prompt, and with no key it hangs", async () => {
  const defs = { VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"HANG    "', RECNAME: '"HANG    "', RECVER: 1 };
  for (const v of ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO"]) defs[v] = 0;
  defs.V_HANG = 1;
  const { file } = await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc") });
  const files = { "HANG.SVC": file, "STARTUP.CMD": startupFile("HANG.SVC") };
  const held = start(files, { key: true });
  prompt(held);
  assert.equal(held.read(held.sym("SVCHEAD")), 0);
  const free = start(files);
  assert.throws(() => prompt(free, 60_000_000));
  assert.ok(free.pc < 0xc000, "in the service");
});

for (const [name, opts, said] of [["no GLCD", { matrix: true, glcd: false }, false], ["no matrix keyboard", {}, true]]) {
  test(`a machine with ${name} refuses GLCD.SVC from the file, ${said ? "saying so" : "quietly, the device absent (KD-173)"}, and the prompt follows`, () => {
    const m = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, opts);
    prompt(m);
    assert.equal(/GLCD\.SVC\?/.test(m.text(0)), said);
    assert.equal(m.read(m.sym("SVCRC")), 1, "INIT ran and refused");
    assert.equal(m.read(m.sym("SVCHEAD")), 0);
    assert.equal(m.read(3) & 3, 0, "TTY:");
  });
}

test("a quiet line for an absent device is followed by an & piece that runs, and the same line typed says NAME? (KD-173)", () => {
  const m = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC &USER 3") }, { matrix: true, glcd: false, shell: true });
  prompt(m);
  assert.doesNotMatch(m.text(0), /GLCD\.SVC\?/);
  assert.equal(user(m), 3, "the & piece ran: the code stayed 0");
  assert.match(m.command("GLCD.SVC"), /GLCD\.SVC\?/, "typed: said");
  m.command("USER 0");
  assert.match(m.command("GLCD.SVC &USER 5"), /GLCD\.SVC\?/);
  assert.equal(user(m), 0, "typed: a failure, so its & piece goes");
});

test("on a serial board, with no PICO9918 console, a width from the file is quiet and its & piece runs; typed, it says the width? (KE-191)", () => {
  const m = start({ "STARTUP.CMD": startupFile("CON PICO 32 &USER 3", "CON CRT 40") }, { shell: true });
  prompt(m);
  assert.doesNotMatch(m.text(0), /\d\d\?/, "nothing said at boot");
  assert.equal(user(m), 3, "the & piece ran: the code stayed 0");
  assert.equal(m.read(3) & 3, 0, "TTY: kept");
  assert.match(m.command("CON PICO 32"), /\r\n32\?\r\n/, "typed: refused");
  m.command("USER 0");
  assert.match(m.command("CON CRT 40 &USER 5"), /\r\n40\?\r\n/);
  assert.equal(user(m), 0, "typed: a failure, so its & piece goes");
});

test("a line from the file whose service fails for another cause, or has no file, still says so, and its & piece goes", async () => {
  const defs = { VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"FAIL    "', RECNAME: '"FAIL    "', RECVER: 1 };
  for (const v of ["V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"]) defs[v] = 0;
  defs.V_FAIL = 1;
  const { file } = await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc") });
  for (const line of ["FAIL.SVC", "NONE.SVC"]) {
    const m = start({ "FAIL.SVC": file, "STARTUP.CMD": startupFile(`${line} &USER 3`) }, { shell: true });
    prompt(m);
    assert.match(m.text(0), new RegExp(`${line.replace(".", "\\.")}\\?`), line);
    assert.equal(user(m), 0, `${line}: the & piece went`);
  }
});

test("a line from the file whose INIT succeeds with A = TNENODV and whose record is refused says so, and its & piece goes (KE-192)", async () => {
  const defs = { VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"WILD    "', RECNAME: '"WILD    "', RECVER: 1 };
  for (const v of ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"]) defs[v] = 0;
  defs.V_WILD = 1;
  const { file } = await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc") });
  const m = start({ "WILD.SVC": file, "STARTUP.CMD": startupFile("WILD.SVC &USER 3") }, { shell: true });
  prompt(m);
  assert.equal(m.read(m.sym("SVCRC")), 1, "the record refused, REMOVE ran: nothing left");
  assert.notEqual(m.read(m.sym("SVCRA")), ABI.TNENODV, "no INIT failure to report");
  assert.match(m.text(0), /WILD\.SVC\?/);
  assert.equal(user(m), 0, "the & piece went");
});

const SAY = (await program("say")).bytes;
const raw = (text) => Buffer.from(text, "latin1");

test("a file of exactly 128 bytes runs its last byte, and reads no further", () => {
  const m = start({ "STARTUP.CMD": raw("\r".repeat(121) + "USER 13") });
  prompt(m);
  assert.equal(user(m), 13);
});

test("^Z and a zero each end the file", () => {
  for (const end of ["\x1a", "\0"]) {
    const m = start({ "STARTUP.CMD": raw(`\r\n${end}USER 4\r\n`) });
    prompt(m);
    assert.equal(user(m), 0, `${JSON.stringify(end)} before any line: none runs`);
    const s = start({ "STARTUP.CMD": raw(`USER 3\r\n${end}\r\nUSER 4\r\n`) }, { shell: true });
    prompt(s);
    assert.equal(user(s), 3, `${JSON.stringify(end)}: the shell reads no further`);
  }
});

test("the DMA address is the default's after the read, with a file and without", () => {
  for (const files of [{}, { "STARTUP.CMD": raw("\x1a") }]) {
    const m = start(files);
    prompt(m);
    assert.equal(m.read(m.sym("CURDMA")) | (m.read(m.sym("CURDMA") + 1) << 8), 0x80);
  }
});

test("a read that returns an error starts nothing, whatever the record holds", () => {
  const m = start({ "STARTUP.CMD": new Uint8Array(0) });
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("STBOOT")) [..."USER 5\r\n"].forEach((c, i) => m.write(m.sym("LOADBUF") + i, c.charCodeAt(0)));
    return step();
  };
  prompt(m);
  assert.equal(user(m), 0);
});

test("NAME.SVX is no service: the type must be SVC in full", () => {
  const m = start({ "SAY.COM": SAY });
  prompt(m);
  assert.doesNotMatch(m.command("SAY.SVX"), /SAY\.SVX\?/);
});

test("a reset clears the position, so the file runs again", () => {
  const m = start({ "STARTUP.CMD": startupFile("USER 3") });
  prompt(m);
  m.reset();
  const from = m.output.length;
  m.runUntil(() => m.ready() && /[A-P](:\S*)?>$/.test(m.text(from)), 400_000_000, "the prompt after reset");
  assert.match(m.text(from), /A(:\S*)?>USER 3/);
});

/** Each line's output and BDOS calls from MLSKIP, where the CCP takes it, to the next MLREAD. */
function trace(m) {
  const rows = [];
  let row = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    if (pc === m.sym("MLSKIP")) {
      row = { from: m.output.length, calls: [] };
      rows.push(row);
    }
    if (pc === m.sym("MLREAD") && row) {
      row.output = m.text(row.from);
      delete row.from;
      row = null;
    }
    if (pc === 5 && row) {
      const c = m.cpu.cpu;
      const de = (c.d << 8) | c.e;
      if (c.c === 9) {
        let s = "";
        for (let a = de; m.read(a) !== 0x24; a += 1) s += String.fromCharCode(m.read(a));
        row.calls.push([9, s]);
      } else row.calls.push([c.c, [10, 26].includes(c.c) || (c.c >= 15 && c.c <= 23) ? de : c.e]);
    }
    return step();
  };
  return rows;
}

for (const [name, lines] of [
  ["a built-in then a line", ["TYPE HELLO.TXT", "DIR"]],
  ["a program's warm boot then a line", ["SAY", "DIR"]],
  ["a failing line then a line", ["NOSUCH", "DIR"]],
  ["USER 3 then a line", ["USER 3", "DIR"]],
]) {
  test(`lines from the file equal the same lines typed: ${name}`, () => {
    const f = start({ "SAY.COM": SAY, "STARTUP.CMD": startupFile(...lines) }, { shell: true });
    const fromFile = trace(f);
    prompt(f);
    fromFile.shift(); // SHELL.SVC's own line
    const t = start({ "SAY.COM": SAY, "STARTUP.CMD": raw("\x1a") }, { shell: true });
    prompt(t);
    const byHand = trace(t);
    for (const line of lines) t.command(line);
    const upper = (rows) => rows.map((r) => ({ ...r, output: r.output.toUpperCase() }));
    assert.deepEqual(upper(fromFile), upper(byHand));
  });
}

test("an unreadable file reaches a prompt, and what it held doesn't run", () => {
  const m = start({ "STARTUP.CMD": startupFile("NEVERRUN") });
  const lba = Math.floor(Buffer.from(m.sdImage.buffer, m.sdImage.byteOffset, m.sdImage.length).indexOf("NEVERRUN") / 512);
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("SDREAD")) {
      const a = m.sym("SDLBA");
      if ((m.read(a) | (m.read(a + 1) << 8) | (m.read(a + 2) << 16)) === lba) m.cpu.cpu.pc = m.sym("SDRCMD");
    }
    return step();
  };
  for (let i = 0; i < 12 && !(m.ready() && /[A-P](:\S*)?>$/.test(m.text(0))); i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.ready() && /[A-P](:\S*)?>$/.test(m.text(0))), 40_000_000, "the error's key");
    if (m.waitingForInput() && !/[A-P](:\S*)?>$/.test(m.text(0))) m.type("\r");
  }
  assert.ok(m.ready() && /[A-P](:\S*)?>$/.test(m.text(0)));
  assert.match(m.text(0), /Bad Sector/);
  assert.doesNotMatch(m.text(0), /NEVERRUN/);
  assert.match(m.command("DIR HELLO.TXT"), /HELLO\.TXT/);
});

// LD HL,(0001h) / DEC HL x3 / JP (HL): BIOS function 0, cold boot, by the warm boot vector.
const COLDBOOT = Uint8Array.from([0x2a, 0x01, 0x00, 0x2b, 0x2b, 0x2b, 0xe9]);

test("a file that cold boots the machine runs for ever, and the skip breaks it", () => {
  const files = { "RESET.COM": COLDBOOT, "STARTUP.CMD": startupFile("RESET") };
  const m = start(files);
  let resets = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("COLD")) resets += 1;
    return step();
  };
  m.runUntil(() => resets >= 4, 400_000_000, "four resets");
  const held = start(files, { key: true });
  prompt(held);
  assert.match(held.command("DIR HELLO.TXT"), /HELLO\.TXT/);
});

test("a startup file whose program jumps to C000h warm boots once, as a program's run into the ROM does (B1), and the prompt comes back", () => {
  const m = start({ "JUMP.COM": Uint8Array.from([0xc3, 0x00, 0xc0]), "STARTUP.CMD": startupFile("JUMP") });
  let colds = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("COLD")) colds += 1;
    return step();
  };
  prompt(m);
  assert.equal(colds, 1, "the first cold boot only");
  assert.equal((m.text(0).match(/TEC-OS /g) ?? []).length, 1, "one banner");
  assert.match(m.text(0), /A(:\S*)?>JUMP\r\r\n\r\nA(:\S*)?>$/);
});

// --- The one startup line --------------------------------------------------

test("SH4 first line", () => {
  const m = start({ "STARTUP.CMD": startupFile("USER 3", "USER 5") });
  prompt(m);
  assert.equal(user(m), 3, "the first line runs, and only it");
  assert.match(m.text(0), /A(:\S*)?>USER 3\r/);
  assert.doesNotMatch(m.text(0), /USER 5/);
});

test("SH4 blank and comment", () => {
  const m = start({ "STARTUP.CMD": startupFile("; the boot file", "", "USER 4", "USER 6") });
  prompt(m);
  assert.equal(user(m), 4, "empty and ; lines are passed over");
  assert.doesNotMatch(m.text(0), /the boot file/, "and not echoed");
  const c = start({ "STARTUP.CMD": raw("; a comment, and nothing after it\r\n\x1a") });
  prompt(c);
  assert.doesNotMatch(c.text(0), /\?/, "a last line that is a comment runs nothing");
});

test("SH4 127", () => {
  const line = `TYPE ${"X".repeat(122)}YY`; // 129 characters
  const m = start({ "STARTUP.CMD": raw(`${line}\r\nUSER 2\r\n`) });
  prompt(m);
  assert.match(m.text(0), new RegExp(`A(:\\S*)?>${line.slice(0, 127)}\\r`), "the first 127 characters");
  assert.equal(user(m), 0);
  const r = start({ "STARTUP.CMD": raw(`${"\r\n".repeat(60)}USER 7`) });
  prompt(r);
  assert.equal(user(r), 7, "the record's end ends an unended line");
});

test("RIG5 a 127-character startup echo borrows APIRTPC only outside an outer return owner", () => {
  const line = 'HOLD' + ' '.repeat(123);
  const m = start({ 'STARTUP.CMD': raw(line + '\r\n'), 'HOLD.COM': Uint8Array.of(0x18, 0xfe) });
  m.runUntil(() => m.pc === m.sym('STLINE'), 400_000_000, 'startup line entry');
  assert.equal(m.read(m.sym('HKDEP')), 0);
  assert.equal(m.read(m.sym('HKBUSY')), 0);
  m.write(m.sym('APIRTPC'), 0x5a);
  m.write(m.sym('APIRTPC') + 1, 0xa5);
  const bootDrive = m.read(m.sym('BOOTDRV'));
  m.runUntil(() => m.pc === m.sym('BENTRY') && m.cpu.cpu.c === 9 &&
    (m.cpu.cpu.d << 8 | m.cpu.cpu.e) === m.sym('CMDTXT'), 20_000_000, 'startup echo entry');
  assert.equal(m.read(m.sym('CMDLEN')), 127);
  assert.equal(m.read(m.sym('CMDTXT') + 127), 13);
  assert.equal(m.read(m.sym('APIRTPC')), 0x24, 'dollar terminator uses low return-slot scratch');
  assert.equal(m.read(m.sym('APIRTPC') + 1), 0xa5);
  assert.equal(m.read(m.sym('BOOTDRV')), bootDrive);
  m.runUntil(() => m.pc === 0x100, 400_000_000, 'startup transient entered');
  assert.ok(m.text(0).includes(line + '\r'), 'all 127 characters echoed');
  assert.equal(m.read(m.sym('HKDEP')), 0, 'echo has released its BDOS context');
  const call = (at, target, regs) => {
    [0xcd, target & 255, target >> 8, 0x18, 0xfe].forEach((b, i) => m.write(at + i, b));
    Object.assign(m.cpu.cpu, { pc: at, sp: 0x6000 }, regs);
    m.runUntil(() => m.pc === at + 3, 20_000_000, 'later root API return');
    assert.equal(m.cpu.cpu.sp, 0x6000);
    assert.equal(m.read(m.sym('APIRTPC')) | m.read(m.sym('APIRTPC') + 1) << 8, at + 3);
    assert.equal(m.read(m.sym('HKDEP')), 0);
    assert.equal(m.read(m.sym('HKBUSY')), 0);
  };
  call(0x3000, m.sym('ABICALL'), { c: ABI.TNINFO });
  call(0x3100, m.sym('RAMBIOS') + 30, { b: 0, c: 3 });
  assert.equal(m.read(m.sym('BOOTDRV')), bootDrive);
  assert.deepEqual(m.violations, []);
});

test("SH4 skip", () => {
  const m = start({ "STARTUP.CMD": startupFile("USER 3") }, { key: true });
  prompt(m);
  assert.equal(user(m), 0, "a key held through reset skips the line");
});

test("SH4 warm boot", () => {
  const m = start({ "STARTUP.CMD": startupFile("USER 3") });
  prompt(m);
  m.command("USER 0");
  const mark = m.output.length;
  m.cpu.cpu.pc = 0;
  m.runUntil(() => m.ready() && /[A-P](:\S*)?>$/.test(m.text(mark)), 200_000_000, "warm boot");
  assert.equal(user(m), 0, "never at a warm boot");
});

test("SH4 quiet paths", () => {
  const m = start({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { matrix: true, glcd: false });
  prompt(m);
  assert.doesNotMatch(m.text(0), /GLCD\.SVC\?/, "the line keeps the quiet paths");
  const p = start({ "STARTUP.CMD": startupFile("CON PICO 32") });
  prompt(p);
  assert.doesNotMatch(p.text(0), /32\?/);
});

test("SH4 mutant: STLINE without the comment skip refuses a first ; line at boot", () => {
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom);
  const at = symbols.get("STLINE") - 0xc000;
  let n = 0;
  for (let i = at; i < at + 96; i += 1) if (bytes[i] === 0xfe && bytes[i + 1] === 0x3b) [(bytes[i + 1] = 0xff), (n += 1)]; // CP ';'
  assert.equal(n, 2);
  const m = start({ "STARTUP.CMD": startupFile("; the boot file", "USER 4") }, { rom: { rom: bytes, symbols } });
  prompt(m);
  assert.match(m.text(0), /;\?/);
  assert.equal(user(m), 0);
});
