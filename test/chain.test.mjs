// KS32's chained command line: a line, typed, from STARTUP.CMD or from BDOS
// function 47, split at !, its rest kept over each program's warm boot and
// run before any startup line; a piece starting : run only after a command
// that succeeded; ^C, a BDOS error's exit and a reset dropping the rest; and
// KE-127's fix. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createContainer } from "../tools/lib/container.mjs";
import { Machine } from "./lib/machine.mjs";
import { TEST_CLOCK, boot, program, prl, romFor, standardCard, startupFile, volume } from "./lib/fixtures.mjs";

const SAY = (await program("say")).bytes; // prints PRL
const RC = (await program("rc")).bytes;
const LINE = (await program("line")).bytes;
const CHAIN = (await program("chain")).bytes;
const raw = (text) => Buffer.from(text, "latin1");

/** CHAIN.COM with BYTES at its DMA address, STR. */
export const chainWith = (bytes) => Uint8Array.from([...CHAIN, ...bytes]);
/** CHAIN.COM chaining TEXT, ended by a 0. */
export const chainTo = (text) => chainWith([...raw(text), 0]);

/** A card with the test's programs on A:, and FILES. */
function card(files = {}, image = standardCard()) {
  const a = volume(image, "A");
  for (const [n, b] of Object.entries({ "SAY.COM": SAY, "RC.COM": RC, "LINE.COM": LINE, ...files })) a.write(n, b);
  return image;
}

const chpos = (m) => m.read(m.sym("CHPOS"));
const code = (m) => m.read(m.sym("PRGCODE")) | (m.read(m.sym("PRGCODE") + 1) << 8);
const user = (m) => m.read(4) >> 4;
/** The prompt with nothing left of a chained line and startup finished. */
const idle = (m, from) => m.ready() && chpos(m) === 0 && /[A-P]>$/.test(m.text(from));

/** Type LINE and run to the prompt that follows its last piece: the text since. */
function run(m, line, max = 600_000_000) {
  const from = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => idle(m, from), max, `the prompt after ${JSON.stringify(line)}`);
  return m.text(from);
}

const count = (text, re) => (text.match(re) ?? []).length;

test("a line of two, three and four pieces runs each in turn, each echoed after its prompt", () => {
  const m = boot(card());
  assert.equal(run(m, "say!say"), "say!say\r\r\nPRL\r\nA>say\r\nPRL\r\nA>");
  assert.equal(count(run(m, "SAY!SAY!SAY"), /PRL/g), 3);
  assert.equal(run(m, "SAY!USER 3!USER 0!SAY"), "SAY!USER 3!USER 0!SAY\r\r\nPRL\r\nA>USER 3\r\nA>USER 0\r\nA>SAY\r\nPRL\r\nA>");
  run(m, "USER 3");
  assert.equal(user(m), 3);
});

test("an empty piece, spaces and a trailing ! are passed over; a line of only them is an empty line", () => {
  const m = boot(card());
  assert.equal(run(m, "SAY!! ! !SAY!"), "SAY!! ! !SAY!\r\r\nPRL\r\nA>SAY\r\nPRL\r\nA>");
  assert.equal(run(m, "!!"), "!!\r\r\nA>");
  assert.equal(run(m, "  "), "  \r\r\nA>");
});

test("a line of 127 characters runs whole: 32 pieces", () => {
  const m = boot(card());
  const line = `${"SAY!".repeat(31)}SAY`;
  assert.equal(line.length, 127);
  assert.equal(count(run(m, line, 2_000_000_000), /PRL/g), 32);
});

test("a piece may be a built-in, a drive change or a .PRL, and keeps the drive and user it sets", async () => {
  const m = boot(card({ "HI.PRL": await prl("say") }));
  volume(m.sdImage, "B").write("SAY.COM", SAY);
  const out = run(m, "USER 0!B:!SAY!A:!HI!DIR HI.PRL");
  assert.match(out, /A>B:\r\nB>SAY\r\nPRL\r\nB>A:\r\nA>HI\r\nPRL\r\nA>DIR HI.PRL\r\nHI\.PRL\s+\r\n1 file/);
  assert.equal(m.read(4) & 15, 0);
});

test("a startup line holding ! runs all its pieces before the next startup line", () => {
  const m = boot(card({ "STARTUP.CMD": startupFile("SAY!USER 2!USER 0", "SAY!USER 5") }));
  m.runUntil(() => idle(m, 0), 600_000_000, "the prompt");
  assert.match(m.text(0), /A>SAY!USER 2!USER 0\r\r\nPRL\r\nA>USER 2\r\nA>USER 0\r\nA>SAY!USER 5\r\r\nPRL\r\nA>USER 5\r\nA>$/);
  assert.equal(user(m), 5);
});

test("history gives the chained line back whole, as typed, and it runs again", () => {
  const m = boot(card());
  run(m, "say!say!user 2");
  run(m, "USER 0");
  const from = m.output.length;
  m.type("\x17\x17"); // ^W twice: the line before the last
  m.runUntil(() => m.waitingForInput() && /say!say!user 2$/.test(m.text(from)), 50_000_000, "the recall");
  m.type("\r");
  m.runUntil(() => idle(m, from), 600_000_000, "the prompt");
  assert.equal(count(m.text(from), /PRL/g), 2);
  assert.equal(user(m), 2);
});

test(": runs a piece after a success, and not after a program's FF00h, FFFEh or NAME?", () => {
  const m = boot(card());
  assert.equal(count(run(m, "SAY!:SAY"), /PRL/g), 2);
  assert.equal(count(run(m, "RC 0001!:SAY"), /PRL/g), 1, "1 is no failure");
  assert.equal(count(run(m, "RC FEFF!:SAY"), /PRL/g), 1, "FEFFh is no failure");
  assert.equal(count(run(m, "RC FF00!:SAY"), /PRL/g), 0);
  assert.equal(count(run(m, "RC FFFE!:SAY"), /PRL/g), 0);
  const missing = run(m, "NOSUCH!:SAY");
  assert.match(missing, /NOSUCH\?\r\n\r\nA>:SAY\r\nA>$/);
  assert.equal(code(m), 0xff00, "a command not found sets FF00h");
  assert.equal(count(run(m, ":SAY"), /PRL/g), 0, "a : that starts a line tests the last command");
  // FFFFh, which function 108 can't set, since it reads the code: no failure.
  m.write(m.sym("PRGCODE"), 0xff);
  m.write(m.sym("PRGCODE") + 1, 0xff);
  assert.equal(count(run(m, ":SAY"), /PRL/g), 1, "FFFFh is no failure");
});

test("after a failed : piece the rest of the line goes, and the prompt comes back", () => {
  const m = boot(card());
  const out = run(m, "RC FF00!:SAY!SAY!USER 6");
  assert.equal(count(out, /PRL/g), 0);
  assert.match(out, /A>:SAY\r\nA>$/);
  assert.equal(user(m), 0);
  assert.equal(code(m), 0xff00);
});

test("the code is cleared as each piece is taken, before the command is looked for", () => {
  const m = boot(card());
  let entry = null;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100 && entry === null) entry = code(m);
    return step();
  };
  assert.equal(count(run(m, "RC FF00!SAY!:SAY"), /PRL/g), 2, "SAY's take cleared RC's code");
  run(m, "RC FF00");
  entry = null;
  run(m, "SAY");
  assert.equal(entry, 0, "the program starts with the code 0");
  run(m, "RC FF00");
  assert.equal(count(run(m, "NOSUCH!:SAY"), /PRL/g), 0, "NAME? sets FF00h, whatever came before");
  run(m, "RC FF00");
  assert.equal(count(run(m, "USER 0!:SAY"), /PRL/g), 1, "a built-in that succeeds clears it");
});

test("a built-in's error sets FF00h: ERA with no file, a bad REN, TYPE with no file", () => {
  const m = boot(card({ "X.COM": Uint8Array.from([0xc9]) }));
  assert.equal(count(run(m, "ERA X.COM!:SAY"), /PRL/g), 1, "a file erased");
  for (const bad of ["ERA X.COM", "REN NEW.COM=NONE.COM", "REN SAY.COM=RC.COM", "TYPE NONE.TXT", "USER 99"]) {
    assert.equal(count(run(m, `${bad}!:SAY`), /PRL/g), 0, bad);
    assert.equal(code(m), 0xff00, bad);
  }
  assert.equal(count(run(m, "ERA X.COM!SAY"), /PRL/g), 1, "the walk's leading ERA stops nothing after it");
  assert.equal(count(run(m, "COPY SAY.COM B:!:SAY"), /PRL/g), 1, "COPY's success");
  assert.equal(count(run(m, "COPY NONE.COM B:!:SAY"), /PRL/g), 0, "COPY's failure");
});

/** The page-zero state, stack and DMA a program starts with, at 0100h. */
function entryState(m) {
  const got = [];
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100 && m.read(0x100) === SAY[0] && m.read(0x101) === SAY[1]) {
      const sp = m.cpu.cpu.sp;
      got.push({
        page: Array.from({ length: 0xa4 }, (_, i) => m.read(0x5c + i)),
        sp,
        ret: m.read(sp) | (m.read(sp + 1) << 8),
        dma: m.read(m.sym("CURDMA")) | (m.read(m.sym("CURDMA") + 1) << 8),
      });
    }
    return step();
  };
  return got;
}

test("function 47's command starts with the default FCBs, tail, DMA and stack of the same command typed", () => {
  const typed = boot(card());
  const t = entryState(typed);
  run(typed, "SAY B:ONE.TXT TWO.DAT and the rest");
  const chained = boot(card({ "CHAIN.COM": chainTo("SAY B:ONE.TXT TWO.DAT and the rest") }));
  const c = entryState(chained);
  run(chained, "CHAIN");
  const piece = boot(card());
  const p = entryState(piece);
  run(piece, "USER 0!SAY B:ONE.TXT TWO.DAT and the rest");
  assert.equal(t.length, 1);
  assert.deepEqual(c, t);
  assert.deepEqual(p, t);
});

test("function 47 copies the command before anything loads: a target that loads over the caller's DMA", () => {
  // BIG.COM: SAY and 1 KiB after it, over CHAIN's string at its end.
  const fixed = Uint8Array.from([...SAY, ...new Uint8Array(1024)]);
  const m = boot(card({ "BIG.COM": fixed, "CHAIN.COM": chainTo("BIG!SAY") }));
  const out = run(m, "CHAIN");
  assert.equal(count(out, /PRL/g), 2);
  assert.match(out, /A>BIG\r\nPRL\r\nA>SAY\r\nPRL\r\nA>$/);
});

test("function 47 refuses 128 bytes with no 0, a CR and an LF with A = FFh, and the program goes on", () => {
  for (const [why, bytes] of [
    ["no 0", [...raw("SAY".padEnd(128, "Y")), 0]],
    ["CR", [...raw("SAY\rSAY"), 0]],
    ["LF", [...raw("SAY\nSAY"), 0]],
  ]) {
    const m = boot(card({ "CHAIN.COM": chainWith(bytes) }));
    const out = run(m, "CHAIN!:SAY");
    assert.match(out, /REFUSED\r\n\r\nA>:SAY\r\nPRL\r\nA>$/, why);
  }
});

test("function 47 takes 127 characters, the line's rest replaced, and an empty command ends at the prompt", () => {
  const long = `${"SAY!".repeat(31)}SAY`;
  const m = boot(card({ "CHAIN.COM": chainTo(long), "EMPTY.COM": chainTo("") }));
  assert.equal(count(run(m, "CHAIN!USER 7", 2_000_000_000), /PRL/g), 32);
  assert.equal(user(m), 0, "the rest of the line was replaced");
  const out = run(m, "EMPTY!USER 7");
  assert.equal(out, "EMPTY!USER 7\r\r\n\r\nA>");
  assert.equal(user(m), 0);
});

test("a chained command missing, unreadable or too large reaches NAME? and the prompt", () => {
  const huge = new Uint8Array(0xc000).fill(0xc9);
  const m = boot(card({ "CHAIN.COM": chainTo("NOSUCH"), "C2.COM": chainTo("HUGE"), "C3.COM": chainTo("SAY"), "HUGE.COM": huge }));
  assert.match(run(m, "CHAIN"), /A>NOSUCH\r\nNOSUCH\?\r\n\r\nA>$/);
  assert.match(run(m, "C2"), /A>HUGE\r\nHUGE\?\r\n\r\nA>$/);
  // A read that returns an error: LOADCOM's end with A = 2.
  let armed = false;
  const step = m.step.bind(m);
  m.step = () => {
    if (armed && m.pc === m.sym("LOADEND")) [(m.cpu.cpu.a = 2), (armed = false)];
    return step();
  };
  const from = m.output.length;
  m.type("C3\r");
  m.runUntil(() => m.pc === 0x100, 200_000_000, "C3");
  armed = true;
  m.runUntil(() => idle(m, from), 400_000_000, "the prompt");
  assert.match(m.text(from), /A>SAY\r\nSAY\?\r\n\r\nA>$/);
  assert.equal(code(m), 0xff00);
});

test("a chain from a startup line runs before the next startup line, and may hold ! and :", () => {
  const m = boot(card({ "CHAIN.COM": chainTo("USER 0!RC FF00!:SAY!SAY"), "C2.COM": chainTo("say!:user 4"), "STARTUP.CMD": startupFile("CHAIN", "C2", "USER 3") }));
  m.runUntil(() => idle(m, 0), 800_000_000, "the prompt");
  const t = m.text(0);
  assert.match(t, /A>CHAIN\r\r\n\r\nA>USER 0\r\nA>RC FF00\r\n\r\nA>:SAY\r\nA>C2\r\r\n\r\nA>say\r\nPRL\r\nA>:user 4\r\nA>USER 3\r\r\nA>$/);
  assert.equal(user(m), 3);
});

test("^C at a program's line input drops the rest of the line", () => {
  const m = boot(card());
  const from = m.output.length;
  m.type("LINE!SAY!USER 2\r");
  m.runUntil(() => m.waitingForInput() && m.read(m.sym("HFLAG")) === 0 && m.text(from).endsWith("USER 2\r\r\n"), 200_000_000, "LINE's input");
  m.type("\x03");
  m.runUntil(() => idle(m, from), 400_000_000, "the prompt");
  assert.match(m.text(from), /\^C\r\nA>$/);
  assert.equal(count(m.text(from), /PRL/g), 0);
  assert.equal(user(m), 0);
});

test("a BDOS error's exit drops the rest of the line", () => {
  const image = card(
    {},
    createContainer([
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G1M", label: "WORK", mount: "B" },
      { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
    ]),
  );
  const m = boot(image);
  const from = m.output.length;
  m.type("SAVE 1 C:X.COM!SAY!USER 2\r");
  m.runUntil(() => m.waitingForInput() && /Bdos Err/.test(m.text(from)), 200_000_000, "the error");
  m.type("\r");
  m.runUntil(() => idle(m, from), 400_000_000, "the prompt");
  assert.equal(count(m.text(from), /PRL/g), 0);
  assert.equal(user(m), 0);
});

/** Type LINE, answer the BDOS error it meets with a key, and run to the prompt: the text since. */
function runError(m, line, err) {
  const from = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => m.waitingForInput() && err.test(m.text(from)), 200_000_000, `the error in ${JSON.stringify(line)}`);
  m.type("\r");
  m.runUntil(() => idle(m, from), 400_000_000, "the prompt");
  return m.text(from);
}

// ROX.COM: function 28 makes the current drive read-only, then function 22 makes the file in 5Ch.
const ROX = Uint8Array.from([0x0e, 28, 0xcd, 5, 0, 0x11, 0x5c, 0, 0x0e, 22, 0xcd, 5, 0, 0xc9]);
// SEL16.COM: function 14 with E = 16, a drive past P:.
const SEL16 = Uint8Array.from([0x1e, 16, 0x0e, 14, 0xcd, 5, 0, 0xc9]);

test("a read-only drive's exit drops the rest of the line", () => {
  const m = boot(card({ "ROX.COM": ROX }));
  const out = runError(m, "ROX NEW.DAT!SAY!USER 2", /Bdos Err On A: R\/O/);
  assert.equal(count(out, /PRL/g), 0);
  assert.equal(user(m), 0);
  assert.equal(volume(m.sdImage, "A").find("NEW.DAT"), undefined, "nothing made");
});

test("a failed select's exit drops the rest of the line", () => {
  const m = boot(card({ "SEL16.COM": SEL16 }));
  const out = runError(m, "SEL16!SAY!USER 2", /Bdos Err On .: Select/);
  assert.equal(count(out, /PRL/g), 0);
  assert.equal(user(m), 0);
});

test("a directory read that fails drops the rest of the line", () => {
  const m = boot(card());
  // The OR A after READDIR's BIORDS, before its JP NZ,RDFAIL: A made nonzero once.
  const at = m.sym("RDFAIL");
  let check = -1;
  for (let a = 0xc000; a < 0xfffd && check < 0; a += 1) if (m.read(a) === 0xb7 && m.read(a + 1) === 0xc2 && m.read(a + 2) === (at & 255) && m.read(a + 3) === at >> 8) check = a;
  assert.ok(check > 0, "READDIR's test");
  let armed = false;
  let failed = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (armed && m.pc === check) [(m.cpu.cpu.a = 1), (armed = false), (failed += 1)];
    return step();
  };
  const from = m.output.length;
  armed = true;
  m.type("DIR!SAY!USER 2\r");
  m.runUntil(() => idle(m, from), 400_000_000, "the prompt");
  assert.equal(failed, 1);
  assert.equal(count(m.text(from), /PRL/g), 0);
  assert.equal(user(m), 0);
});

test("ERA's read-only file drops the rest of the line", () => {
  const image = card();
  volume(image, "A").write("R.DAT", new Uint8Array(128), { readOnly: true });
  const m = boot(image);
  const out = runError(m, "ERA R.DAT!SAY!USER 2", /Bdos Err On A: File R\/O/);
  assert.equal(count(out, /PRL/g), 0);
  assert.equal(user(m), 0);
  assert.ok(volume(m.sdImage, "A").find("R.DAT"), "the file kept");
});

test("SAVE's NO SPACE sets FF00h: a full directory and a full disk", () => {
  const full = createContainer([
    { geometry: "G1M", label: "SYSTEM", mount: "A" },
    { geometry: "G1M", label: "DIRS", mount: "B" },
    { geometry: "G1M", label: "DATA", mount: "C" },
  ]);
  const b = volume(full, "B");
  for (let i = 0; i < 256; i += 1) b.write(`F${i}.DAT`, new Uint8Array(1));
  const c = volume(full, "C");
  c.write("BIG.DAT", new Uint8Array(c.freeBytes()));
  const m = boot(card({}, full));
  for (const drive of ["B", "C"]) {
    const out = run(m, `SAVE 1 ${drive}:X.COM!:SAY!USER 2`);
    assert.match(out, /NO SPACE/, drive);
    assert.equal(count(out, /PRL/g), 0, drive);
    assert.equal(code(m), 0xff00, drive);
    assert.equal(user(m), 0, drive);
  }
});

test("a write lost at warm boot drops the rest of the line", () => {
  const m = boot(card());
  // As the first program starts, a dirty line's write failed: CWBOOT says so at its warm boot.
  let armed = true;
  const step = m.step.bind(m);
  m.step = () => {
    if (armed && m.pc === 0x100) [m.write(m.sym("CFAIL"), 1), (armed = false)];
    return step();
  };
  const out = run(m, "SAY!:SAY!USER 3");
  assert.match(out, /^SAY!:SAY!USER 3\r\r\nPRL\r\nWrite lost\r\nA>$/);
  assert.equal(count(out, /PRL/g), 1);
  assert.equal(user(m), 0);
  assert.equal(m.read(m.sym("CFAIL")), 0);
});

test("a reset clears the rest of the line", () => {
  const m = boot(card());
  const from = m.output.length;
  m.type("LINE!SAY\r");
  m.runUntil(() => m.waitingForInput() && m.text(from).endsWith("LINE!SAY\r\r\n"), 200_000_000, "LINE's input");
  assert.notEqual(chpos(m), 0);
  m.reset();
  m.runUntil(() => idle(m, from), 400_000_000, "the prompt after the reset");
  assert.equal(count(m.text(from), /PRL/g), 0);
  assert.equal(chpos(m), 0);
});

/** What X.COM, 128 bytes of RET, finds at 0100h and in the tail when it starts. */
function atEntry(m) {
  const got = [];
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100) got.push({ b100: m.read(0x100), tail: m.read(0x80), last: m.read(0xff) });
    return step();
  };
  return got;
}
const X128 = new Uint8Array(128).fill(0xc9);

test("KE-127: a startup line of 128 characters runs its first 127, and leaves 0100h as loaded", () => {
  const line = `X ${"A".repeat(126)}`;
  assert.equal(line.length, 128);
  const m = new Machine({ ...romFor(), sdImage: card({ "X.COM": X128, "STARTUP.CMD": raw(line) }), clock: TEST_CLOCK });
  const got = atEntry(m);
  m.runUntil(() => idle(m, 0), 400_000_000, "the prompt");
  assert.deepEqual(got, [{ b100: 0xc9, tail: 126, last: 0 }]);
  assert.match(m.text(0), new RegExp(`A>X ${"A".repeat(125)}\\r`));
});

test("KE-127: the longest tail typed, chained and from function 47, 126, 124 and 126 characters, leaves 0100h as loaded", () => {
  const line = `X ${"B".repeat(125)}`;
  assert.equal(line.length, 127);
  // A piece after a ! can't carry 126 characters in a 127-character line: the chained
  // case is the longest a piece after a program can have, 124, its 0 the line's.
  const chained = `X!X ${"B".repeat(123)}`;
  assert.equal(chained.length, 127);
  const m = boot(card({ "X.COM": X128, "CHAIN.COM": chainTo(line) }));
  const got = atEntry(m);
  run(m, line);
  assert.deepEqual(got, [{ b100: 0xc9, tail: 126, last: 0 }], "typed");
  got.length = 0;
  run(m, chained);
  assert.deepEqual(got, [{ b100: 0xc9, tail: 0, last: 0 }, { b100: 0xc9, tail: 124, last: 0 }], "chained");
  assert.equal(m.read(0x80 + 1 + 124), 0, "the chained tail's 0");
  assert.deepEqual([...Array.from({ length: 124 }, (_, i) => m.read(0x81 + i))], [...raw(` ${"B".repeat(123)}`)], "the chained tail");
  got.length = 0;
  run(m, "CHAIN");
  assert.deepEqual(got.at(-1), { b100: 0xc9, tail: 126, last: 0 }, "from function 47");
});
