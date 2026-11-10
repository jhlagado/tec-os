// NAME.SVC /E and MON3.SVC: the switch, the identity of an installed
// service, the execution entry's contract, MON3.SVC's session and its exits,
// its loads and what it gives back, its size and its life when no session
// is active. HELLO3 against MON-3 itself is test/ks53-hello.test.mjs.
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeSvc, packSvc } from "../tools/lib/svc.mjs";
import { GLCD_SVC, ROOT, romFor, startupFile, volume } from "./lib/fixtures.mjs";
import { MON3, PROMPT, bin, bytesAt, card, code, execFile, ks53Census, line, machine, mon3Svc, romMutant, services, svcMutant, warmTarget, word } from "./lib/mon3.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const memo = (f) => {
  const made = new Map();
  return (arg = {}) => {
    const k = JSON.stringify(arg);
    if (!made.has(k)) made.set(k, f(arg));
    return made.get(k);
  };
};

/** MON3.SVC's build: { file, symbols, image, fixups }. */
const mon3Build = memo(() => mon3Svc());
const mon3File = async () => (await mon3Build()).file;


/** test/programs/svcdemo.asm, no record, with OVER: claims a slot with V_VEC and FLAGS. */
const demoSvc = memo(async (over) => {
  const zero = ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"];
  const defs = { ...Object.fromEntries(zero.map((v) => [v, 0])), VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"DEMO    "', RECNAME: '"DEMO    "', RECVER: 2, ...over };
  return makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc") });
});

/** MON3.SVC with its record's entry word given a fixup, as a label would: REL.SVC. makeSvc refuses to write it. */
async function relFile() {
  const s = await mon3Build();
  const at0 = s.file.subarray(0, s.image);
  const symbols = { INIT: s.symbols.INIT + 0x100, REMOVE: s.symbols.REMOVE + 0x100 };
  return packSvc(at0, symbols, [...s.fixups, 5].sort((a, b) => a - b), { relocatedEntry: true }).file;
}

/** FILE with its execution record's version, or its entry offset, changed. */
const patched = (file, edit) => {
  const b = Uint8Array.from(file);
  edit(b);
  return b;
};

/** Every BDOS 15 that M makes, by the name in its FCB: m.opens. */
function countOpens(m) {
  m.opens = [];
  const bentry = m.sym("BENTRY");
  const step = m.step.bind(m);
  m.step = () => {
    const c = m.cpu.cpu;
    if (m.pc === bentry && c.c === 15) {
      const de = (c.d << 8) | c.e;
      const f = String.fromCharCode(...bytesAt(m, de + 1, 11));
      m.opens.push(`${f.slice(0, 8).trimEnd()}.${f.slice(8).trimEnd()}`);
    }
    return step();
  };
  return m;
}
const opensSince = (m, n) => m.opens.slice(n);

/** A machine on a card with FILES on A:, counting opens. OPTS as lib/mon3's machine. */
const boot = (files, opts) => countOpens(machine(card(files), opts));

const snapshot = (m) => Uint8Array.from({ length: 0xc000 }, (_, i) => m.read(i));

/**
 * What a typed command changes and a refusal may: the CCP's line, its FCB and
 * scratch, the CCP's stack, the line's history, the serial byte and the
 * return code. With LOADED, also what a file's read and a staged load change.
 */
function exclusions(m, { loaded = false } = {}) {
  const s = (n) => m.sym(n);
  const r = {
    "the CCP's line, FCB and scratch": [s("CCPRAM"), s("BDOSRME")],
    "the CCP's stack": [s("CSTKBAS"), s("CSTKTOP")],
    "the history": [s("HPOS"), s("HPOS") + 1],
    HHEAD: [s("HHEAD"), s("HHEAD") + 1],
    RXCHAR: [s("RXCHAR"), s("RXCHAR") + 1],
    PRGCODE: [s("PRGCODE"), s("PRGCODE") + 2],
  };
  if (loaded) {
    Object.assign(r, {
      "the TPA, where the file is staged": [0x100, word(m, 6) & 0xff00],
      "the BIOS stack": [s("BSTKB"), s("BSTK")],
      "the BIOS's block state": [s("DSKCUR"), s("DRVTAB")],
      DIRBUF: [s("DIRBUF"), s("DIRBUF") + 128],
      LOGINV: [s("LOGINV"), s("LOGINV") + 2],
      "the SD and cache state": [s("SDBYTE"), s("KBMASK")],
      "the keyboard's scan": [s("KBMASK"), s("GLVEC")],
      "the BDOS's stack": [s("STKBASE"), s("STKTOP")],
      LOADTOP: [s("LOADTOP"), s("LOADTOP") + 2],
      "SVCRC and SVCRA": [s("SVCRC"), s("SVCRA") + 1],
      "the loader's line state": [s("SLN"), s("SLDL") + 1],
      LOADBUF: [s("LOADBUF"), s("LOADBUF") + 128],
      "the copy state": [s("XMDST"), s("MVREST") + 2],
    });
  }
  return r;
}

/** Addresses, by hex, that differ between BEFORE and AFTER outside the exclusions. */
function differs(m, before, after, opts) {
  const out = Object.values(exclusions(m, opts));
  const bad = [];
  for (let i = 0; i < 0xc000; i += 1) if (before[i] !== after[i] && !out.some(([a, b]) => i >= a && i < b)) bad.push(i.toString(16));
  return bad;
}

/** The loader's state a refusal must leave: SVCHEAD, the ceiling and the services listed. */
const loaderState = (m) => ({ head: m.read(m.sym("SVCHEAD")), top: word(m, 6), pztop: word(m, m.sym("PZTOP")), services: services(m) });

/** TEXT typed: what it printed, its return code, whether MON3> or the CCP came back, and the opens it made. */
function typed(m, text) {
  const n = m.opens.length;
  const r = line(m, text);
  return { ...r, code: code(m), opens: opensSince(m, n) };
}

/** Leave a MON3> session if TEXT entered one. */
const leave = (m, r) => {
  if (r.mon3) assert.ok(!line(m, "EXIT").mon3, "EXIT gives the CCP's prompt");
};

// KG58: the ROM's figure.

const BASELINE = { used: 16077, cap: 171, tpa: 47268, abi: "1c687c87d5c4e25d091b9c532a630037b5ce22290e8d6e49f795e071be67a677" };

test("KG58 rom cap", () => {
  const census = () => JSON.parse(readFileSync(resolve(ROOT, "build/tecos/census.json"), "utf8"));
  const first = { ...census(), hash: sha(readFileSync(resolve(ROOT, "build/tecos/tecos.rom"))) };
  execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { cwd: ROOT, stdio: "pipe" });
  const second = { ...census(), hash: sha(readFileSync(resolve(ROOT, "build/tecos/tecos.rom"))) };
  assert.equal(second.hash, first.hash, "two builds, one image");
  assert.equal(first.sha256, first.hash);
  const { used, free, regions } = first.rom;
  assert.ok(used - BASELINE.used <= BASELINE.cap, `${used} used: ${used - BASELINE.used} over ${BASELINE.used}, the cap ${BASELINE.cap}`);
  assert.equal(free, 16384 - used);
  assert.ok(free >= 136, `${free} free`);
  const gaps = regions.filter((r) => r.label === "free");
  assert.equal(gaps.length, 1, "one free region");
  assert.equal(gaps[0].end, 0x10000, "the free space is the ROM's tail");
  const abi = readFileSync(resolve(ROOT, "src/abi.inc"));
  assert.equal(sha(abi), BASELINE.abi, "abi.inc as it was");
  assert.match(abi.toString("latin1"), /^SVCFMT EQU 4\b/m, "SVCFMT 4");
  const { rom, symbols } = romFor();
  assert.deepEqual([rom[symbols.get("ABIMAJ") - 0xc000], rom[symbols.get("ABIMIN") - 0xc000]], [5, 1], "ABI 5.1");
  const m = machine(card());
  assert.equal(word(m, 6) - 0x100, BASELINE.tpa, "TPA 47,268 with nothing loaded");
  console.log(`ROM ${used} used, ${free} free, ${used - BASELINE.used} over the baseline, ${first.hash}`);
});

// KG59: the switch, the identity rule and the entry contract.

const FORMS = ["MON3.SVC /X", "MON3.SVC /", "MON3.SVC //E", "MON3.SVC /EX", "MON3.SVC /E5"];

/** A refusal before any file is read: the message, FF00h, no open and RAM as it was but for the line's state. */
function refusedUnread(m, text, name = "MON3.SVC") {
  const before = snapshot(m);
  const r = typed(m, text);
  assert.ok(!r.mon3, `${text}: no session`);
  assert.match(r.out, new RegExp(`\\r\\n${name.replace(".", "\\.")}\\?\\r\\n`), `${text}: ${name}?`);
  assert.equal(r.code, 0xff00, `${text}: FF00h`);
  assert.deepEqual(r.opens, [], `${text}: no file opened`);
  assert.deepEqual(differs(m, before, snapshot(m)), [], `${text}: RAM as before but the line's state`);
}

test("KG59 switch forms", async () => {
  const m = boot({ "MON3.SVC": await mon3File() });
  for (const f of FORMS) refusedUnread(m, f);
  // Joined to the name the switch is part of it, and the CCP refuses the name as today.
  const before = snapshot(m);
  const r = typed(m, "MON3.SVC/E");
  assert.match(r.out, /\r\nMON3\.SVC\/E\?\r\n/);
  assert.deepEqual([r.code, r.opens, r.mon3], [0xff00, [], false]);
  assert.deepEqual(differs(m, before, snapshot(m)), []);
  // Two copies of one install name: which to enter is not guessed.
  m.command("MON3.SVC");
  m.command("MON3.SVC");
  assert.deepEqual(services(m), ["MON3 8", "MON3 8"]);
  refusedUnread(m, "MON3.SVC /E");
  assert.deepEqual(services(m), ["MON3 8", "MON3 8"]);
  // The same forms as STARTUP.CMD lines.
  const s = boot({ "MON3.SVC": await mon3File(), "STARTUP.CMD": startupFile(...FORMS) });
  assert.equal((s.text().match(/\r\nMON3\.SVC\?\r\n/g) ?? []).length, FORMS.length, "each startup line refused");
  assert.deepEqual(s.opens.filter((n) => n.startsWith("MON3")), [], "no startup line opened the file");
  assert.equal(code(s), 0xff00);
  assert.deepEqual(services(s), []);
});

test("KG59 refusal end states", async () => {
  const exec = await execFile();
  const m = boot({
    "GLCD.SVC": GLCD_SVC,
    "V2.SVC": await execFile({ RECVER: 2 }),
    "ENT.SVC": patched(exec, (b) => (b[30] = 0x40)), // the entry 4029h: past the image
    "NRDY.SVC": await execFile({ V_NRDY: 1 }),
    "KEEP.SVC": await execFile({ V_NRDY: 1, V_KEEP: 1 }),
    "FIXED.SVC": await execFile({ V_NRDY: 1, FLAGS: 0 }),
  });
  const staged = (text, name, { rc } = {}) => {
    const before = snapshot(m);
    const state = loaderState(m);
    const r = typed(m, text);
    assert.ok(!r.mon3, `${text}: no session`);
    assert.match(r.out, new RegExp(`\\r\\n${name.replace(".", "\\.")}\\?\\r\\n`));
    assert.equal(r.code, 0xff00, `${text}: FF00h`);
    assert.deepEqual(r.opens, [name], `${text}: the file opened once`);
    assert.deepEqual(loaderState(m), state, `${text}: nothing installed`);
    assert.deepEqual(differs(m, before, snapshot(m), { loaded: true }), [], `${text}: nothing else changed`);
    if (rc !== undefined) assert.equal(m.read(m.sym("SVCRC")), rc, `${text}: SVCRC ${rc}`);
  };
  staged("GLCD.SVC /E", "GLCD.SVC"); // no record
  staged("V2.SVC /E", "V2.SVC"); // a version-2 record
  staged("ENT.SVC /E", "ENT.SVC"); // an entry outside the image
  staged("ENT.SVC", "ENT.SVC", { rc: 0 }); // the plain load is bounded the same way
  // Installed, never ready, removed by the loader's unload: twice.
  const top = word(m, 6);
  for (let i = 0; i < 2; i += 1) {
    const r = typed(m, "NRDY.SVC /E");
    assert.match(r.out, /\r\nNRDY\.SVC\?\r\n/);
    assert.deepEqual([r.code, r.mon3, r.opens], [0xff00, false, ["NRDY.SVC"]]);
  }
  assert.deepEqual(services(m), [], "no service listed");
  assert.equal(word(m, 6), top, "(0006h) as before");
  // The stated exception: never ready, and not removed, because REMOVE refuses
  // or the service is not removable. Each /E installs one more copy.
  for (const name of ["KEEP", "FIXED"]) {
    for (let i = 1; i <= 2; i += 1) {
      const t = word(m, 6);
      const r = typed(m, `${name}.SVC /E`);
      assert.match(r.out, new RegExp(`\\r\\n${name}\\.SVC\\?\\r\\n`));
      assert.deepEqual([r.code, r.mon3], [0xff00, false]);
      assert.equal(services(m).length, i, `${name}: ${i} listed`);
      assert.equal(word(m, 6), (t & 0xff00) - 0x100, `${name}: (0006h) one page lower`);
    }
    if (name === "KEEP") {
      // Its REMOVE refuses, so UNLOAD can't take it: reset to go on.
      m.reset();
      m.expect(/A>$/, { from: m.output.length, maxCycles: 400_000_000 });
      m.runUntil(() => m.ready(), 400_000_000, "the prompt after a reset");
    }
  }
});

test("KG59 install and re-entry", async () => {
  const m = boot({ "MON3.SVC": await mon3File() });
  let r = typed(m, "MON3.SVC");
  assert.deepEqual([r.mon3, r.code, r.opens], [false, 0, ["MON3.SVC"]], "plain MON3.SVC installs");
  assert.deepEqual(services(m), ["MON3 8"]);
  assert.doesNotMatch(r.out, /MON3>/, "and never enters");
  r = typed(m, "MON3.SVC X /E");
  assert.deepEqual([r.mon3, r.code], [false, 0], "trailing text after an operand is ignored: installs, no entry");
  assert.deepEqual(services(m), ["MON3 8", "MON3 8"]);
  m.command("UNLOAD");
  m.command("UNLOAD");
  assert.deepEqual(services(m), []);
  r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3, "/E with nothing installed installs and enters");
  assert.deepEqual(r.opens, ["MON3.SVC"]);
  leave(m, r);
  assert.deepEqual(services(m), ["MON3 8"]);
  m.command("ERA MON3.SVC");
  r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3, "re-entry with the file erased");
  assert.deepEqual(r.opens, [], "re-entry opens no file");
  leave(m, r);
  assert.deepEqual(services(m), ["MON3 8"], "one copy still");
});

/** The page whose image starts at PAGE+25 and the entry it was given, read at the entry: { page, hl }. */
function enteredAt(m, text, pages) {
  const entries = pages.map((p) => (p << 8) + 41);
  m.mark = m.output.length;
  m.type(`${text}\r`);
  m.runUntil(() => entries.includes(m.pc) || (m.waitingForInput() && PROMPT.test(m.text(m.mark))), 400_000_000, text);
  return entries.includes(m.pc) ? m.pc >> 8 : null;
}

/** The pages of the services installed, newest first. */
function pages(m) {
  const out = [];
  for (let p = m.read(m.sym("SVCHEAD")); p; p = m.read((p << 8) + 8)) out.push(p);
  return out;
}

test("KG59 name rule", async () => {
  const mon3 = await mon3File();
  const m = boot({ "MON3.SVC": mon3, "M2.SVC": mon3, "X.SVC": await execFile(), "GLCD.SVC": GLCD_SVC });
  m.command("MON3.SVC");
  const [p3] = pages(m);
  // Another name's record: X installs and its own entry runs.
  let r = typed(m, "X.SVC /E");
  assert.match(r.out, /EXEC X {7}/, "X.SVC /E enters X");
  assert.ok(!r.mon3, "not MON3");
  assert.deepEqual(r.opens, ["X.SVC"]);
  m.command("UNLOAD");
  // A file without a record is refused, and MON3 is not entered.
  r = typed(m, "GLCD.SVC /E");
  assert.deepEqual([r.mon3, r.code], [false, 0xff00]);
  assert.match(r.out, /\r\nGLCD\.SVC\?\r\n/);
  // A renamed copy is its own service.
  assert.equal(enteredAt(m, "M2.SVC /E", [p3, p3 - 8]), p3 - 8, "M2.SVC /E installs and enters the new copy");
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 400_000_000, "MON3>");
  leave(m, { mon3: true });
  assert.deepEqual(services(m), ["MON3 8", "MON3 8"]);
  assert.equal(enteredAt(m, "MON3.SVC /E", [p3, p3 - 8]), p3, "MON3.SVC /E enters the one named MON3");
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 400_000_000, "MON3>");
  leave(m, { mon3: true });
  // With only M2 installed, MON3.SVC /E installs its own copy.
  m.reset();
  m.expect(/A>$/, { from: m.output.length, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt after a reset");
  r = typed(m, "M2.SVC /E");
  assert.ok(r.mon3);
  leave(m, r);
  const [p2] = pages(m);
  const n = m.opens.length;
  assert.equal(enteredAt(m, "MON3.SVC /E", [p2, p2 - 8]), p2 - 8, "a new copy, named MON3");
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 400_000_000, "MON3>");
  assert.deepEqual(opensSince(m, n), ["MON3.SVC"]);
  leave(m, { mon3: true });
  // INIT's BC names the file only for a record: GLCD.SVC's bytes at file
  // offsets 25 to 40 are its file's, with the page added where it relocates.
  const glcd = await makeSvc(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/svc") });
  const asLoaded = (page) => Array.from({ length: 16 }, (_, i) => (GLCD_SVC[25 + i] + (glcd.fixups.includes(i) ? page : 0)) & 0xff);
  const g = boot({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { matrix: true });
  const [pg] = pages(g);
  assert.deepEqual(bytesAt(g, (pg << 8) + 25, 16), asLoaded(pg), "GLCD.SVC by its startup line");
  const p = boot({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { matrix: true, tms: true });
  assert.deepEqual(services(p), [], "on CRT:, the startup line gives way");
  p.command("CON UC1");
  const [pp] = pages(p);
  assert.deepEqual(bytesAt(p, (pp << 8) + 25, 16), asLoaded(pp), "GLCD.SVC by CON UC1");
});

test("KG59 drive and user", async () => {
  const m = boot({ "MON3.SVC": await mon3File() });
  m.command("MON3.SVC");
  let r = typed(m, "B:MON3.SVC /E");
  assert.ok(r.mon3, "B:MON3.SVC /E enters A:'s installed copy");
  assert.deepEqual(r.opens, []);
  leave(m, r);
  m.command("USER 1");
  r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3, "so does MON3.SVC /E in user 1");
  assert.deepEqual(r.opens, []);
  leave(m, r);
  m.command("USER 0");
  m.command("UNLOAD");
  const state = loaderState(m);
  r = typed(m, "B:MON3.SVC /E");
  assert.deepEqual([r.mon3, r.code], [false, 0xff00], "nothing installed and no file on B:");
  assert.match(r.out, /\r\nB:MON3\.SVC\?\r\n/);
  assert.equal(r.opens.length, 1, "B: alone is read: no fallback to A:");
  assert.deepEqual(loaderState(m), state);
});

test("KG59 relocated entry", async () => {
  await assert.rejects(
    async () => {
      const s = await mon3Build();
      packSvc(s.file.subarray(0, s.image), { INIT: s.symbols.INIT + 0x100, REMOVE: s.symbols.REMOVE + 0x100 }, [...s.fixups, 5].sort((a, b) => a - b));
    },
    /entry is relocated/,
    "makeSvc's writer refuses an entry word with a fixup",
  );
  const m = boot({ "REL.SVC": await relFile() });
  const top = word(m, 6);
  for (let i = 0; i < 2; i += 1) {
    const r = typed(m, "REL.SVC /E");
    assert.deepEqual([r.mon3, r.code], [false, 0xff00], "refused at entry");
    assert.match(r.out, /\r\nREL\.SVC\?\r\n/);
    assert.deepEqual(services(m), ["MON3 8"], "installed once, and kept");
    assert.equal(word(m, 6), (top & 0xff00) - 0x800, "(0006h) lower by its eight pages");
  }
  m.command("UNLOAD");
  assert.deepEqual(services(m), []);
  assert.equal(word(m, 6), top);
});

test("KG59 startup quiet path", async () => {
  const nodev = await execFile({ V_NODEV: 1 });
  const s = boot({ "NODEV.SVC": nodev, "STARTUP.CMD": startupFile("NODEV.SVC /E") });
  assert.doesNotMatch(s.text(), /NODEV\.SVC\?|EXEC/, "no message, no entry");
  assert.equal(code(s), 0, "code 0");
  assert.deepEqual(services(s), [], "nothing installed");
  const m = boot({ "NODEV.SVC": nodev });
  const r = typed(m, "NODEV.SVC /E");
  assert.match(r.out, /\r\nNODEV\.SVC\?\r\n/, "typed, the message");
  assert.equal(r.code, 0xff00);
  assert.deepEqual(services(m), []);
});

test("KG59 entry contract", async () => {
  const x = await execFile();
  const image = card({ "X.SVC": x });
  volume(image, "B").write("X.SVC", x);
  const m = countOpens(machine(image));
  m.command("X.SVC");
  const [px] = pages(m);
  const entry = (px << 8) + 41;
  m.mark = m.output.length;
  m.type("B:X.SVC /E P ONE TWO\r");
  m.runUntil(() => m.pc === entry, 100_000_000, "the entry");
  const c = m.cpu.cpu;
  const sp = c.sp & 0xffff;
  assert.equal((c.h << 8) | c.l, entry, "HL is the entry");
  assert.equal(sp, m.sym("CSTKTOP") - 2, "SP is CSTKTOP with a word pushed");
  assert.equal(word(m, sp), 0, "the word is 0000h");
  const tail = String.fromCharCode(...bytesAt(m, 0x81, m.read(0x80)));
  assert.equal(tail, " P ONE TWO", "the tail after /E at 0080h");
  assert.equal(String.fromCharCode(...bytesAt(m, 0x5d, 11)), "P          ", "005Ch's FCB");
  assert.equal(String.fromCharCode(...bytesAt(m, 0x6d, 11)), "ONE        ", "006Ch's FCB");
  assert.equal(m.read(m.sym("PZLDRV")), 2, "PZLDRV: the command's drive, B:");
  assert.equal(c.iff1 ? 1 : 0, 0, "interrupts off");
  assert.equal(m.sysCtrl, m.sym("LATCLAS"), "the latch is LATCLAS");
  // P pushes fifteen words on the CCP's stack and returns.
  m.runUntil(() => m.waitingForInput() && PROMPT.test(m.text(m.mark)), 100_000_000, "the return");
  const guard = bytesAt(m, m.sym("STKGUARD"), m.sym("STKGUEND") - m.sym("STKGUARD"));
  assert.ok(guard.every((b) => b === 0xa5), "STKGUARD intact");
  // Each return is a warm boot that keeps the service.
  for (const [tail, how] of [["", "RET"], [" J", "JP 0000h"], [" B", "BDOS 0"]]) {
    const r = typed(m, `X.SVC /E${tail}`);
    assert.match(r.out, /EXEC X/, how);
    assert.ok(PROMPT.test(r.out), `${how}: the CCP's prompt`);
    assert.equal(r.code, 0, `${how}: code 0`);
    assert.deepEqual(services(m), ["X 1"], `${how}: still installed`);
  }
  // The result is the BDOS 108 code: FF00h skips the : piece.
  let r = typed(m, "X.SVC /E F!:DIR");
  assert.equal(r.code, 0xff00);
  assert.doesNotMatch(r.out, /X\.SVC +\r\n1 file/, "DIR skipped: its piece echoed, no listing");
  r = typed(m, "X.SVC /E!:DIR");
  assert.match(r.out, /:DIR\r\nX\.SVC +\r\n1 file/, "with code 0 DIR runs");
});

test("KG59 stack census", async () => {
  const d = await ks53Census();
  const { rom, symbols } = romFor();
  const ccpLimit = rom[symbols.get("SVCLIM") - 0xc000 + 2];
  assert.ok(d.ccp.deepest <= 18, `the CCP's stack ${d.ccp.deepest} deep, within its bare 18`);
  assert.ok(18 + ccpLimit <= 24, `the base and the services' limit ${ccpLimit} within 24 of 32`);
  assert.ok(d.ccp.deepest <= 24 && d.ccp.reserved === 32);
  console.log(JSON.stringify(d));
});

test("KG59 duplicates unchanged", async () => {
  // GLCD.SVC typed when it is already in: refused.
  const g = boot({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": startupFile("GLCD.SVC") }, { matrix: true });
  assert.equal(services(g).length, 1, "its startup line installed it");
  let r = typed(g, "GLCD.SVC");
  assert.match(r.out, /GLCD\.SVC\?/);
  assert.equal(services(g).length, 1);
  // Twice in startup lines: quiet on CRT:, refused off it.
  const two = startupFile("GLCD.SVC", "GLCD.SVC");
  const p = boot({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": two }, { matrix: true, tms: true });
  assert.doesNotMatch(p.text(), /GLCD\.SVC\?/, "CON: on CRT:: quiet");
  assert.equal(code(p), 0);
  const q = boot({ "GLCD.SVC": GLCD_SVC, "STARTUP.CMD": two }, { matrix: true });
  assert.match(q.text(), /GLCD\.SVC\?/, "CON: off CRT:: GLCD.SVC?");
  assert.equal(services(q).length, 1);
  // A service claiming a slot, twice: the slot holds its JP, so refused.
  const claim = (await demoSvc({ V_VEC: 1, VECAT: 0x10, FLAGS: 0x05 })).file;
  const c = boot({ "CLAIM.SVC": claim });
  assert.deepEqual(typed(c, "CLAIM.SVC").code, 0);
  r = typed(c, "CLAIM.SVC");
  assert.match(r.out, /CLAIM\.SVC\?/);
  assert.equal(c.read(c.sym("SVCRC")), 0, "SVCRC 0: refused");
  assert.equal(services(c).length, 1);
  // A plain MON3.SVC twice: two copies.
  const m = boot({ "MON3.SVC": await mon3File() });
  m.command("MON3.SVC");
  m.command("MON3.SVC");
  assert.deepEqual(services(m), ["MON3 8", "MON3 8"]);
});

// KG59's ROM mutants: each is the build's ROM with one test of the /E path
// taken out, and each must fail the case named.

/** A machine with ROM mutant MUT on a card with FILES. */
const mutantBoot = (mut, files) => countOpens(machine(card(files), mut));
const at = (b, from, pattern, span = 64) => {
  const hits = [];
  for (let i = from; i < from + span; i += 1) if (pattern.every((p, k) => p === null || b[i + k] === p)) hits.push(i);
  assert.equal(hits.length, 1, `pattern ${pattern.map((p) => (p === null ? "??" : p.toString(16))).join(" ")} found ${hits.length} times`);
  return hits[0];
};

test("KG59 mutant: without the test for text joined to /E, /EX enters", async () => {
  const mut = romMutant((b, sym) => {
    const i = at(b, sym("SVCEX"), [0xfe, 0x21, 0x30, null]); // CP SPACE+1; JR NC,SVBAD
    b[i + 2] = b[i + 3] = 0;
  });
  const m = mutantBoot(mut, { "MON3.SVC": await mon3File() });
  assert.ok(line(m, "MON3.SVC /EX").mon3);
});

test("KG59 mutant: without EXFIND's count, one of two copies enters", async () => {
  const mut = romMutant((b, sym) => {
    const i = at(b, sym("SVCEX"), [0x3d, 0x28, null, 0x3c, 0x20, null]); // DEC A; JR Z,SVCENT; INC A; JR NZ,SVBAD
    const target = i + 3 + b[i + 2];
    b[i + 5] = (target - (i + 6)) & 0xff; // JR NZ,SVCENT
  });
  const m = mutantBoot(mut, { "MON3.SVC": await mon3File() });
  m.command("MON3.SVC");
  m.command("MON3.SVC");
  assert.ok(line(m, "MON3.SVC /E").mon3);
});

test("KG59 mutant: without EXREC's ready test, NRDY.SVC /E enters", async () => {
  const mut = romMutant((b, sym) => {
    const i = at(b, sym("EXREC"), [0xf6, 0xfe, 0x3c], 16); // OR FEh; INC A
    b[i] = 0x3e; // LD A,FFh: always ready
    b[i + 1] = 0xff;
  });
  const m = mutantBoot(mut, { "NRDY.SVC": await execFile({ V_NRDY: 1 }) });
  assert.match(line(m, "NRDY.SVC /E").out, /EXEC X/);
});

test("KG59 mutant: without EXFIND's name compare, GLCD.SVC /E and X.SVC /E enter MON3", async () => {
  const mut = romMutant((b, sym) => {
    const i = at(b, sym("EXF2"), [0x1a, 0xbe, 0x20, null], 8); // LD A,(DE); CP (HL); JR NZ,EXF3
    b[i + 2] = b[i + 3] = 0;
  });
  const m = mutantBoot(mut, { "MON3.SVC": await mon3File(), "GLCD.SVC": GLCD_SVC, "X.SVC": await execFile() });
  m.command("MON3.SVC");
  let r = line(m, "GLCD.SVC /E");
  assert.ok(r.mon3, "GLCD.SVC /E enters MON3");
  leave(m, r);
  r = line(m, "X.SVC /E");
  assert.ok(r.mon3, "X.SVC /E enters MON3, not X");
  leave(m, r);
});

test("KG59 mutant: without SVCLOAD's entry bound, a plain ENT.SVC installs", async () => {
  const mut = romMutant((b, sym) => {
    const svcin = sym("SVCIN") + 0xc000;
    const entry = sym("DF") + 0xc000 + sym("DHLEN") + 0xc000 + 4; // the staged record's entry word
    const i = at(b, sym("SVCLOAD"), [0x2a, entry & 0xff, entry >> 8, 0xcd, svcin & 0xff, svcin >> 8, 0xd8], 96); // LD HL,(entry); CALL SVCIN; RET C
    b[i + 6] = 0;
  });
  const m = mutantBoot(mut, { "ENT.SVC": patched(await execFile(), (b) => (b[30] = 0x40)) });
  const r = typed(m, "ENT.SVC");
  assert.equal(r.code, 0);
  assert.deepEqual(services(m), ["X 1"]);
});

test("KG59 mutant: without SVCENT's carry test, REL.SVC /E jumps outside the service", async () => {
  const mut = romMutant((b, sym) => {
    const i = at(b, sym("SVCENT"), [0x84, 0x38, null], 16); // ADD A,H; JR C,SVBAD
    b[i + 1] = b[i + 2] = 0;
  });
  const m = mutantBoot(mut, { "REL.SVC": await relFile() });
  m.command("REL.SVC");
  const [p] = pages(m);
  m.type("REL.SVC /E\r");
  const cmdrn1 = m.sym("CMDRN1");
  m.runUntil(() => m.pc === cmdrn1, 100_000_000, "the entry's jump");
  const hl = (m.cpu.cpu.h << 8) | m.cpu.cpu.l;
  assert.ok(hl < p << 8 || hl >= (p + 8) << 8, `the entry ${hl.toString(16)} is outside the service's pages`);
});
