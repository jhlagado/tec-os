// What is left of the CCP's own commands once nested levels went: CCP and EXIT
// are names like any other, UNLOAD is last in, first out, the freed page of
// EXPAND 1 stays free, DEL is ERA by another name, and a program's and a warm
// boot's route to the prompt.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createContainer } from "../tools/lib/container.mjs";
import { EXPAND1_WRITES, Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, service, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);
const SAY = Uint8Array.from([0x1e, 0x43, 0x0e, 0x02, 0xcd, 0x05, 0x00, 0xc9]); // prints C

async function machine(files = {}, opts = {}) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("RES.SVC", await service("res"));
  for (const [n, b] of Object.entries(files)) a.write(n, b);
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
  assert.equal(m.sym("HRING"), 0xbd00);
  assert.equal(m.sym("ABIEND"), m.sym("ABICALL") + 3);
  assert.deepEqual(m.violations, []);
});

test("a write to BE00h-BFFFh in EXPAND 1 fails the host's watch, and one to BDFFh, the history's, does not (A12)", async () => {
  const m = await machine();
  const poke = (a) => {
    // EXPAND 1 in view, one byte written, EXPAND 0 back, from a stub in page zero.
    [0x3e, 0x05, 0xd3, 0xff, 0x3e, 0xa5, 0x32, a & 0xff, a >> 8, 0x3e, 0x01, 0xd3, 0xff, 0x18, 0xfe].forEach((v, i) => m.write(0x60 + i, v));
    const { pc, sp } = m.cpu.cpu;
    Object.assign(m.cpu.cpu, { pc: 0x60, sp: 0x100 });
    m.runUntil(() => m.pc === 0x6d, 1_000_000, "the stub");
    Object.assign(m.cpu.cpu, { pc, sp });
  };
  poke(0xbdff);
  assert.deepEqual(m.expand1Writes, []);
  for (const a of [0xbe00, 0xbeff, 0xbf00, 0xbfff]) poke(a);
  assert.deepEqual(m.expand1Writes.map((w) => w.addr), [0xbe00, 0xbeff, 0xbf00, 0xbfff]);
  for (const w of m.expand1Writes) EXPAND1_WRITES.splice(EXPAND1_WRITES.indexOf(w), 1); // these were asked for
});

test("startup lines go on after ^C at a program", async () => {
  const WAIT = Uint8Array.from([0x0e, 0x01, 0xcd, 0x05, 0x00, 0xc9]); // reads a key
  const image = standardCard();
  const a = volume(image, "A");
  a.write("WAIT.COM", WAIT);
  a.write("STARTUP.CMD", startupFile("WAIT", "USER 3"));
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

test("DEL is ERA by another name: it erases a file, and a file pattern, as ERA does", async () => {
  const m = await machine();
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

test("DEL *.* asks ALL (Y/N)? as ERA *.* does: N keeps the files, Y erases them", async () => {
  const m = await machine();
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

test("DEL with no name says ? and fails as ERA with none does", async () => {
  const m = await machine();
  const era = m.command("ERA");
  const eraCode = code(m);
  assert.equal(m.command("DEL"), era.replace("ERA", "DEL"));
  assert.equal(code(m), eraCode);
  assert.equal(eraCode, 0xff00, "a failed built-in");
});

test("the built-in DEL comes before a DEL.COM, as ERA before ERA.COM; A:DEL and DEL.COM still run the file", async () => {
  const m = await machine({ "DEL.COM": SAY, "ERA.COM": SAY, "DELETE.COM": SAY });
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
