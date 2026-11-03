// What is left of the CCP's own commands once nested levels went: CCP and EXIT
// are names like any other, UNLOAD is last in, first out, the freed page of
// EXPAND 1 stays free, and a program's and a warm boot's route to the prompt.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
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
