// What is left of the CCP's own commands once nested levels went: CCP and EXIT
// are names like any other, UNLOAD is last in, first out, the freed pages of
// EXPAND 1 stay free, DEL is ERA by another name under the shell, and a
// program's and a warm boot's route to the prompt. The minimal ROM CCP's
// own tests are at the end. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContainer } from "../tools/lib/container.mjs";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, boot, service, romFor, standardCard, startupFile, volume, withShell } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C

/** A machine with RES.SVC and FILES on A:; with SHELL, booted with SHELL.SVC holding the prompt. */
async function machine(files = {}, { shell = false, ...opts } = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("RES.SVC", await service("res"));
  for (const [n, b] of Object.entries(files)) a.write(n, b);
  if (shell) withShell(image);
  return boot(image, opts);
}

for (const name of ["CCP", "EXIT"]) {
  test(`${name} says so with no file, and runs a file of that name`, async () => {
    const none = await machine();
    assert.match(none.command(name), new RegExp(`${name}\\?`));
    const m = await machine({ [`${name}.COM`]: SAY });
    assert.match(m.command(name), /C\r\n/);
    assert.deepEqual([m.violations, m.read(4)], [[], 0], "no level, and the same drive");
  });
}

test("UNLOAD is refused with no resident, and removes residents last in, first out", async () => {
  const m = await machine();
  assert.match(m.command("UNLOAD"), /UNLOAD\?/);
  const stub = word(m, 6);
  m.command("RES.SVC");
  m.command("RES.SVC");
  assert.equal(word(m, 6), (stub & 0xff00) - 0x200);
  m.command("UNLOAD");
  assert.equal(word(m, 6), (stub & 0xff00) - 0x100);
  m.command("UNLOAD");
  assert.equal(word(m, 6), stub);
  assert.match(m.command("UNLOAD"), /UNLOAD\?/);
  assert.deepEqual(m.violations, []);
});

test("nothing is kept for a level: the table ends at ABICALL's jump and the page at BE00h is free", async () => {
  const m = await machine({}, { ram96: true });
  assert.equal(m.symbols.get("HRING"), undefined, "no history ring in EXPAND 1: it is the shell's");
  assert.equal(m.sym("ABIEND"), m.sym("ABICALL") + 3);
  assert.deepEqual(m.violations, []);
});

test("SH11 a write to BD00h-BFFFh in EXPAND 1 fails the host's watch: the history's page is free", async () => {
  const m = await machine();
  const poke = (a) => {
    // EXPAND 1 in view, one byte written, EXPAND 0 back, from a stub in page zero.
    [0x3e, 0x05, 0xd3, 0xff, 0x3e, 0xa5, 0x32, a & 0xff, a >> 8, 0x3e, 0x01, 0xd3, 0xff, 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
    const { pc, sp } = m.cpu.cpu;
    Object.assign(m.cpu.cpu, { pc: 0x60, sp: 0x100 });
    m.runUntil(() => m.pc === 0x6d, 1_000_000, "the stub");
    Object.assign(m.cpu.cpu, { pc, sp });
  };
  for (const a of [0xbd00, 0xbdff, 0xbe00, 0xbeff, 0xbf00, 0xbfff]) poke(a);
  assert.deepEqual(m.expand1Writes.map((w) => w.addr), [0xbd00, 0xbdff, 0xbe00, 0xbeff, 0xbf00, 0xbfff]);
  for (const w of m.expand1Writes) EXPAND1_WRITES.splice(EXPAND1_WRITES.indexOf(w), 1); // these were asked for
});

test("startup lines go on after ^C at a program", async () => {
  const WAIT = Uint8Array.from([0x0e, 0x01, 0xcd, 0x05, 0x00, 0xc9]); // reads a key
  const image = standardCard();
  const a = volume(image, "A");
  a.write("WAIT.COM", WAIT);
  withShell(image, "WAIT", "USER 3"); // the shell runs the lines after its own
  const m = new Machine({ ...romFor(), sdImage: image, clock: TEST_CLOCK });
  m.expect(/WAIT\r/, { from: 0, maxCycles: 200_000_000 });
  m.type("\x03");
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  assert.equal(m.read(4) >> 4, 3, "the next line ran");
});

test("ERA frees each directory entry's blocks once", async () => {
  const m = await machine({ "ONE.DAT": Buffer.alloc(128) });
  let frees = 0;
  const free = m.sym("FREEENT");
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === free) frees += 1;
    return step();
  };
  m.command("ERA ONE.DAT");
  assert.equal(frees, 1);
});

test("NAME.DRV runs NAME.COM if there is one, and says NAME.DRV? only with no program of the name", async () => {
  const m = await machine({ "ONE.COM": SAY });
  assert.match(m.command("ONE.DRV"), /C\r\n/);
  assert.match(m.command("TWO.DRV"), /TWO\.DRV\?/);
});

test("REN takes one drive from either name, and a name on another drive is refused", async () => {
  const m = await machine({ "SAME.DAT": SAY });
  m.command("SAVE 1 B:OLD.COM");
  m.command("SAVE 1 B:X.COM");
  assert.match(m.command("REN X.COM=B:OLD.COM"), /FILE EXISTS/);
  assert.match(m.command("DIR B:"), /OLD\.COM[\s\S]*2 files/);
  m.command("REN Y.COM=B:OLD.COM");
  assert.match(m.command("DIR B:Y.COM"), /Y\.COM/);
  m.command("REN B:Z.COM=X.COM");
  assert.match(m.command("DIR B:Z.COM"), /Z\.COM/);
  assert.match(m.command("DIR B:X.COM"), /NO FILE/);
  assert.match(m.command("REN B:SAME.DAT=A:SAME.DAT"), /B:SAME\.DAT=A:SAME\.DAT\?/);
  assert.match(m.command("DIR SAME.DAT"), /SAME\.DAT/);
  m.command("B:");
  m.command("REN T.COM=Y.COM");
  assert.match(m.command("DIR T.COM"), /T\.COM/);
});

test("ERA *.* answered with - erases nothing, and the Return after it ends the answer (KE-149)", async () => {
  const m = await machine();
  m.command("SAVE 1 B:KEEP.COM");
  const from = m.output.length;
  m.type("ERA B:*.*\r");
  m.expect(/ALL \(Y\/N\)\?/, { from, maxCycles: 100_000_000 });
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the answer");
  m.type("-\r"); // 2Dh folds to 0Dh: once it was taken for Return, and the real one reached the prompt
  m.expect(/A>$/, { from, maxCycles: 50_000_000 });
  const end = m.cycles + 20_000_000; // time for a stray Return to reach the prompt
  m.runUntil(() => m.cycles >= end, 30_000_000, "a pause");
  assert.equal((m.text(from).match(/A>/g) ?? []).length, 1, `one prompt after the answer: ${JSON.stringify(m.text(from))}`);
  assert.match(m.command("DIR B:"), /KEEP\.COM/);
});

test("ERA *.* answered with Return alone erases nothing and takes no second Return", async () => {
  const m = await machine();
  m.command("SAVE 1 B:KEEP.COM");
  const from = m.output.length;
  m.type("ERA B:*.*\r");
  m.expect(/ALL \(Y\/N\)\?/, { from, maxCycles: 100_000_000 });
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the answer");
  m.type("\r");
  m.expect(/A>$/, { from, maxCycles: 50_000_000 });
  assert.match(m.command("DIR B:"), /KEEP\.COM/);
  const again = m.output.length;
  m.type("ERA B:*.*\r");
  m.expect(/ALL \(Y\/N\)\?/, { from: again, maxCycles: 100_000_000 });
  m.runUntil(() => m.waitingForInput(), 100_000_000, "the answer");
  m.type("y\r");
  m.expect(/A>$/, { from: again, maxCycles: 50_000_000 });
  assert.match(m.command("DIR B:"), /NO FILE/);
});

const code = (m) => word(m, m.sym("PRGCODE"));

test("SH11 DEL is ERA by another name: it erases a file, and a file pattern, as ERA does", async () => {
  const m = await machine({}, { shell: true });
  for (const n of ["ONE.COM", "TWO.COM", "KEEP.DAT"]) m.command(`SAVE 1 B:${n}`);
  assert.equal(m.command("DEL B:ONE.COM"), "DEL B:ONE.COM\r\r\nA>");
  assert.equal(m.command("ERA B:TWO.COM"), "ERA B:TWO.COM\r\r\nA>");
  assert.match(m.command("DIR B:"), /^DIR B:\r\r\nKEEP\.DAT *\r\n1 file,/);
  for (const n of ["ONE.COM", "TWO.COM"]) m.command(`SAVE 1 B:${n}`);
  m.command("DEL B:*.COM"); // a pattern short of *.* asks nothing
  assert.match(m.command("DIR B:"), /^DIR B:\r\r\nKEEP\.DAT *\r\n1 file,/);
  assert.equal(m.command("DEL B:NONE.COM"), m.command("ERA B:NONE.COM").replace("ERA", "DEL"), "a missing file, the same answer");
  assert.deepEqual(m.violations, []);
});

test("SH11 DEL *.* asks ALL (Y/N)? as ERA *.* does: N keeps the files, Y erases them", async () => {
  const m = await machine({}, { shell: true });
  m.command("SAVE 1 B:KEEP.COM");
  const ask = (line, answer) => {
    const from = m.output.length;
    m.type(`${line}\r`);
    m.expect(/ALL \(Y\/N\)\?/, { from, maxCycles: 100_000_000 });
    m.runUntil(() => m.waitingForInput(), 100_000_000, "the answer");
    m.type(`${answer}\r`);
    m.expect(/A>$/, { from, maxCycles: 50_000_000 });
    return m.text(from);
  };
  const del = ask("DEL B:*.*", "n");
  assert.equal(del, ask("ERA B:*.*", "n").replace("ERA", "DEL"), "the same question and answer");
  assert.equal(code(m), 0, "N is an answer, not a failure");
  assert.match(m.command("DIR B:"), /KEEP\.COM/);
  ask("DEL B:*.*", "y");
  assert.match(m.command("DIR B:"), /NO FILE/);
});

test("SH11 DEL with no name says ? and fails as ERA with none does", async () => {
  const m = await machine({}, { shell: true });
  const era = m.command("ERA");
  const eraCode = code(m);
  assert.equal(m.command("DEL"), era.replace("ERA", "DEL"));
  assert.equal(code(m), eraCode);
  assert.equal(eraCode, 0xff00, "a failed built-in");
});

test("SH11 the built-in DEL comes before a DEL.COM, as ERA before ERA.COM; A:DEL and DEL.COM still run the file", async () => {
  const m = await machine({ "DEL.COM": SAY, "ERA.COM": SAY, "DELETE.COM": SAY }, { shell: true });
  assert.match(m.command("DELETE"), /C\r\n/, "DELETE: a longer word is a file's name, not DEL");
  for (const name of ["DEL", "ERA"]) {
    assert.match(m.command(name), new RegExp(`^${name}\\r\\r\\n\\?\\r\\n`), `${name}: the built-in`);
    assert.match(m.command(`A:${name}`), /C\r\n/, `A:${name}: the file`);
    assert.match(m.command(`${name}.COM`), /C\r\n/, `${name}.COM: the file`);
  }
});

test("the CCP's printer keeps OUTCHAR's column count and ^P echo", async () => {
  const m = await machine({ "ONE.DAT": Buffer.alloc(128) });
  assert.equal(m.read(m.sym("COLUMN")), 2, "A> counted by OUTCHAR: the CCP prints through BDOS function 2");
  let listed = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === m.sym("BLIST")) listed += 1;
    return step();
  };
  m.command("\x10DIR"); // ^P on, then DIR
  assert.ok(listed > 10, `DIR's listing echoed to the list device: ${listed} characters`);
  m.step = step;
});

test("FNPRINT ends at $", async () => {
  // LD DE,MSG / LD C,9 / CALL 5 / RET / MSG: "AB$CD$"
  const m = await machine({ "P9.COM": Uint8Array.from([0x11, 0x09, 0x01, 0x0e, 0x09, 0xcd, 0x05, 0x00, 0xc9, ...Buffer.from("AB$CD$", "latin1")]) });
  const out = m.command("P9");
  assert.match(out, /P9\r\r?\nAB\r?\n?A>/);
  assert.doesNotMatch(out, /CD/);
});

test("SAVE refuses a count past 255 as any bad count, whichever doubling carries (KE-174)", async () => {
  const m = await machine();
  for (const n of [320, 640, 256, 999]) {
    assert.match(m.command(`SAVE ${n} B:BIG.COM`), new RegExp(`\\r\\n${n}\\?\\r\\n`), `SAVE ${n} refused`);
    assert.match(m.command("DIR B:"), /NO FILE/, `SAVE ${n} wrote nothing`);
  }
});

test("SAVE on a full disk closes the file before NO SPACE: the records written stay in the directory, as COPY's do (KE-201)", () => {
  const image = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G1M", label: "DATA", mount: "C" },
  ]);
  const c = volume(image, "C");
  c.write("FILL.DAT", new Uint8Array(c.freeBytes() - 4096));
  const room = c.freeBytes();
  const m = boot(image);
  for (let a = 0x100; a < 0x100 + 32 * 256; a += 1) m.write(a, (a * 7 + (a >> 8)) & 0xff);
  const tpa = Uint8Array.from({ length: room }, (_, i) => m.read(0x100 + i));
  assert.match(m.command("SAVE 32 C:X.COM"), /NO SPACE/);
  m.command("C:");
  assert.deepEqual(volume(m.sdImage, "C").read("X.COM"), tpa, "the records written, from 0100h");
  assert.deepEqual(m.violations, []);
});

// --- The minimal ROM CCP ---------------------------------------------------

const ABI_BASE = "56f3923c5a8c2542b221939173fefa0891ec6d75cf2416877f2857c5760fb61b"; // abi.inc before the shell hook
const sha = (b) => createHash("sha256").update(b).digest("hex");
const readText = (n) => readFileSync(resolve(ROOT, n), "utf8");

test("SH1 rom figure", () => {
  const census = () => JSON.parse(readText("build/tecos/census.json"));
  const first = { ...census(), hash: sha(readFileSync(resolve(ROOT, "build/tecos/tecos.rom"))) };
  execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { cwd: ROOT, stdio: "pipe" });
  const second = { ...census(), hash: sha(readFileSync(resolve(ROOT, "build/tecos/tecos.rom"))) };
  assert.equal(second.hash, first.hash, "two builds, one image");
  const { used, free, regions } = first.rom;
  // The shell's ceiling, and the 120 bytes A:'s coalescing may add to it.
  assert.ok(used <= 14782 + 120, `${used} used, the ceiling 14,902`);
  assert.ok(free >= 1602 - 120, `${free} free, at least 1,482`);
  const gaps = regions.filter((r) => r.label === "free");
  assert.deepEqual(gaps.map((g) => g.end), [0x10000], "one contiguous free tail");
  assert.ok(first.ram.tpa.bytes >= 47268, `TPA ${first.ram.tpa.bytes} with nothing loaded`);
  // abi.inc differs from before the hook by TNSHELL's block and TNCOUNT alone.
  const abi = readText("src/abi.inc");
  const block = abi.match(/; SHELL: [\s\S]*?\nTNSHELL EQU 16\n\n/)[0];
  assert.equal(sha(Buffer.from(abi.replace(block, "").replace("TNCOUNT EQU 17", "TNCOUNT EQU 16"), "utf8")), ABI_BASE, "abi.inc changed only by TNSHELL and TNCOUNT");
  console.log(`ROM ${used} used, ${free} free, TPA ${first.ram.tpa.bytes}, ${first.hash.slice(0, 16)}`);
});

test("SH1 keytab", () => {
  const { rom, symbols } = romFor();
  const names = [];
  for (let i = symbols.get("KEYTAB") - 0xc000; rom[i]; i += 3) {
    let n = "";
    for (; rom[i]; i += 1) n += String.fromCharCode(rom[i]);
    names.push(n);
  }
  assert.deepEqual(names, ["DIR", "TYPE", "ERA", "REN", "SAVE", "USER", "CON", "UNLOAD"], "KEYTAB holds the minimal CCP's built-ins and nothing else");
});

const LONG = Buffer.from(Array.from({ length: 40 }, (_, i) => `line ${i}\r\n`).join("") + "\x1a", "latin1");

test("SH2 no pause", async () => {
  const m = await machine({ "L.TXT": LONG }, { matrix: true, tms: true, width: 40 });
  const t = m.command("TYPE L.TXT", { maxCycles: 900_000_000 });
  assert.doesNotMatch(t, /\[more\]/, "TYPE lists without pausing");
  assert.equal((t.match(/line \d+/g) ?? []).length, 40);
  for (let i = 0; i < 30; i += 1) m.command(`SAVE 0 F${i}.COM`);
  assert.doesNotMatch(m.command("DIR", { maxCycles: 900_000_000 }), /\[more\]/, "DIR too");
  assert.equal(m.read(m.sym("VWID")), 40);
});

const CHAINP = (text) => { const t = Buffer.from(`${text}\0`, "latin1"); return Uint8Array.from([0x21, 0x11, 0x01, 0x11, 0x80, 0x00, 0x01, t.length, 0x00, 0xed, 0xb0, 0x0e, 47, 0xcd, 0x05, 0x00, 0xc9, ...t]); };
const HELLO = Buffer.from("hello\r\n\x1a", "latin1");
const bareFiles = { "X.COM": SAY, "H.TXT": HELLO, "CH.COM": CHAINP("TYPE H.TXT"), "CH2.COM": CHAINP("TYPE H.TXT!TYPE H.TXT") };

test("SH3 moved names", async () => {
  const m = await machine();
  for (const n of ["COPY H.TXT Y.TXT", "DEL H.TXT", "SERVICES"]) {
    const word0 = n.split(" ")[0];
    assert.match(m.command(n), new RegExp(`\\r\\n${word0}\\?\\r\\n`), `${word0}: a name like any other`);
    assert.equal(code(m), 0xff00);
  }
  const c = await machine({ "COPY.COM": SAY, "DEL.COM": SAY, "SERVICES.COM": SAY });
  for (const n of ["COPY", "DEL", "SERVICES"]) assert.match(c.command(n), /C\r\n/, `${n}.COM runs`);
});

test("SH3 separators ordinary", async () => {
  const m = await machine(bareFiles);
  assert.match(m.command("DIR!TYPE H.TXT"), /DIR!TYPE\?/, "! is an ordinary character");
  assert.match(m.command("X&TYPE"), /X&TYPE\?/, "and & is");
  m.command("X !TYPE H.TXT");
  assert.doesNotMatch(m.text(m.mark ?? 0), /hello/);
});

test("SH3 cmd runs com", async () => {
  const m = await machine(bareFiles);
  assert.match(m.command("X.CMD"), /C\r\n/, "X.CMD runs X.COM");
  assert.match(m.command("Y.CMD"), /Y\.CMD\?/);
  assert.equal(code(m), 0xff00);
});

/** Type LINE and run until the bare prompt reads a line again. */
function bareAt(m, line) {
  const from = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => m.ready() && /\r\n\d*[A-P]>$/.test(m.text(from)), 400_000_000, line);
  return m.text(from);
}

test("SH3 47 runs whole", async () => {
  const m = await machine(bareFiles);
  assert.match(bareAt(m, "CH"), /A>TYPE H\.TXT\r\nhello/, "echoed after the prompt and run");
  const t = bareAt(m, "CH2");
  assert.match(t, /A>TYPE H\.TXT!TYPE H\.TXT\r/, "echoed whole");
  assert.doesNotMatch(t, /hello/, "one command: TYPE with the tail H.TXT!TYPE H.TXT");
});

/** The build's ROM with EDIT(bytes, at) applied. */
function romWith(edit) {
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom);
  edit(bytes, (n) => symbols.get(n) - 0xc000, symbols);
  return { rom: bytes, symbols };
}
const findIn = (b, from, pat, span = 64) => { for (let i = from; i < from + span; i += 1) if (pat.every((x, j) => x === null || b[i + j] === x)) return i; throw new Error("no pattern"); };
async function mutantMachine(mut, files) {
  const image = standardCard();
  const a = volume(image, "A");
  for (const [n, b] of Object.entries(files)) a.write(n, b);
  const m = new Machine({ ...mut, sdImage: image, clock: TEST_CLOCK });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  return m;
}

/** DIR on a 40-column PICO9918 with no shell, under ROM (the build's when not given): its first three names' row. */
function dirAt40(mut) {
  const image = standardCard();
  for (const f of ["COPY.COM", "TERM.COM", "PROBE.COM", "MANUAL.TXT", "README.TXT", "X"]) volume(image, "A").write(f, new Uint8Array(300));
  const m = new Machine({ ...(mut ?? romFor()), sdImage: image, tms: true, matrix: true, clock: TEST_CLOCK });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt");
  return m.command("DIR");
}

test("SH2 mutant: DIR with its own width removed lays out 80 columns on 40", () => {
  assert.match(dirAt40(), /\r\nCOPY\.COM {5}TERM\.COM {5}PROBE\.COM\r\n/, "three columns at 40, the build's");
  // DIRREADY's LD A,(VWID) made LD A,80 and a NOP: columns for the serial terminal.
  const mut = romWith((b, at, symbols) => {
    const v = symbols.get("VWID");
    const i = findIn(b, at("DIRREADY"), [0x3a, v & 0xff, v >> 8], 32);
    b[i] = 0x3e; b[i + 1] = 80; b[i + 2] = 0x00;
  });
  assert.doesNotMatch(dirAt40(mut), /\r\nCOPY\.COM {5}TERM\.COM {5}PROBE\.COM\r\n/);
});

test("SH3 mutant: revision 0's .CMD refusal stops NAME.COM", async () => {
  // NOTDRIVE's type test made CMD's: a .CMD goes to the loader, which can't install it.
  const mut = romWith((b, at) => {
    const i = findIn(b, at("NOTDRIVE"), [0x11, 0x53, 0x56], 128); // LD DE,'V'*256+'S'
    b[i + 1] = 0x43; b[i + 2] = 0x4d; // 'M'*256+'C'
    const j = findIn(b, i, [0xfe, 0x43], 16); // CP 'C'
    b[j + 1] = 0x44; // 'D'
  });
  const m = await mutantMachine(mut, bareFiles);
  assert.doesNotMatch(m.command("X.CMD"), /C\r\n/);
});

test("SH3 mutant: revision 0's function 47 guard refuses the line", async () => {
  const mut = romWith((b, at) => {
    const i = at("FNCHAIN"); // LD HL,(CURDMA) -> JP FNCHNO
    const t = at("FNCHNO") + 0xc000;
    b[i] = 0xc3; b[i + 1] = t & 0xff; b[i + 2] = t >> 8;
  });
  const m = await mutantMachine(mut, bareFiles);
  assert.doesNotMatch(bareAt(m, "CH"), /hello/);
});

test("SH3 mutant: the bare chained line split at !", async () => {
  // MLTK1's first test made "a zero or a !" by a jump to the ROM's free tail.
  const mut = romWith((b, at) => {
    const i = at("MLTK1"); // LD A,(HL); OR A; JR Z,MLTK3
    const target = i + 4 + ((b[i + 3] << 24) >> 24); // MLTK3
    const free = at("CODEEND");
    const patch = [0x7e, 0xfe, 0x21, 0x20, 0x02, 0xaf, 0x77, 0xb7, 0xca, (target + 0xc000) & 0xff, (target + 0xc000) >> 8, 0xc3, (i + 4 + 0xc000) & 0xff, (i + 4 + 0xc000) >> 8];
    patch.forEach((v, k) => (b[free + k] = v)); // LD A,(HL); CP '!'; JR NZ,+2; XOR A; LD (HL),A; OR A; JP Z,MLTK3; JP MLTK1+4
    b[i] = 0xc3; b[i + 1] = (free + 0xc000) & 0xff; b[i + 2] = (free + 0xc000) >> 8; b[i + 3] = 0;
  });
  const m = await mutantMachine(mut, bareFiles);
  assert.match(bareAt(m, "CH2"), /hello/);
});
