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
import { TIMES_COM, check, pinned } from "./lib/inputs.mjs";
import { EXPAND1_WRITES } from "./lib/machine.mjs";
import { MON3, MON3_CEILING, PROMPT, bin, bytesAt, card, code, execFile, figures, ks53Census, line, machine, mon3Svc, mon3Text, mon3Variant as libVariant, romMutant, runFor, runTo, services, warmTarget, word } from "./lib/mon3.mjs";

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
/** The build's pages, (0006h), entry and TPA on the starter card. */
const FIG = figures(await mon3Build());


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

// The ROM's size, hash and ABI against the baseline.

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

// The switch, the identity rule and the entry contract.

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
  assert.deepEqual(services(m), [FIG.line, FIG.line]);
  refusedUnread(m, "MON3.SVC /E");
  assert.deepEqual(services(m), [FIG.line, FIG.line]);
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
  assert.deepEqual(services(m), [FIG.line]);
  assert.doesNotMatch(r.out, /MON3>/, "and never enters");
  r = typed(m, "MON3.SVC X /E");
  assert.deepEqual([r.mon3, r.code], [false, 0], "trailing text after an operand is ignored: installs, no entry");
  assert.deepEqual(services(m), [FIG.line, FIG.line]);
  m.command("UNLOAD");
  m.command("UNLOAD");
  assert.deepEqual(services(m), []);
  r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3, "/E with nothing installed installs and enters");
  assert.deepEqual(r.opens, ["MON3.SVC"]);
  leave(m, r);
  assert.deepEqual(services(m), [FIG.line]);
  m.command("ERA MON3.SVC");
  r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3, "re-entry with the file erased");
  assert.deepEqual(r.opens, [], "re-entry opens no file");
  leave(m, r);
  assert.deepEqual(services(m), [FIG.line], "one copy still");
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
  assert.equal(enteredAt(m, "M2.SVC /E", [p3, p3 - FIG.pages]), p3 - FIG.pages, "M2.SVC /E installs and enters the new copy");
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 400_000_000, "MON3>");
  leave(m, { mon3: true });
  assert.deepEqual(services(m), [FIG.line, FIG.line]);
  assert.equal(enteredAt(m, "MON3.SVC /E", [p3, p3 - FIG.pages]), p3, "MON3.SVC /E enters the one named MON3");
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
  assert.equal(enteredAt(m, "MON3.SVC /E", [p2, p2 - FIG.pages]), p2 - FIG.pages, "a new copy, named MON3");
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
    assert.deepEqual(services(m), [FIG.line], "installed once, and kept");
    assert.equal(word(m, 6), (top & 0xff00) - (FIG.pages << 8), "(0006h) lower by its pages");
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
  assert.deepEqual(services(m), [FIG.line, FIG.line]);
});

// ROM mutants: each is the build's ROM with one test of the /E path
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

// MON3.SVC's session: what it takes in page zero, what each way out gives
// back, the warm-boot hook an exit can leave, and a second entry.

/**
 * MON3.SVC built from drivers/mon3.asm with EDITS ([old, new], each found
 * once) applied to its source: a mutant or a variant, built beside the build.
 */
const mon3Variant = memo(async (edits) => libVariant(edits));

// Steps of drivers/mon3.asm that the IM and IOBYTE mutants name: the hook's IM 1,
// and the IOBYTE's copy in the hook and in EXIT's restore.
const HOOK_IM1 = "  im 1           ; TEC-OS's mode\n";
const HOOK_IO = "  call RESETD    ; vectors rebuilt\n  ld hl,SAVE0\n  ld de,IOBYTE   ; and the drive\n";
const REST_IO = "REST:\n  ld hl,SAVE0\n  ld de,IOBYTE   ; and the drive\n";

const SLOTS = [0x08, 0x10, 0x18, 0x20, 0x28, 0x30];
const DEFAULT_SLOT = [0, 0, 0, 0, 0, 0, 0, 0xc9];
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

/** The page of the installed service named NAME, the newest first. */
const pageOf = (m, name = "MON3") => pages(m).find((p) => String.fromCharCode(...bytesAt(m, (p << 8) + 17, 8)).trimEnd() === name);

/** SVC's bytes from file offset AT, N of them, as loaded at PAGE: the page added where it relocates. */
const asLoaded = (svc, page, at, n) => Array.from({ length: n }, (_, i) => (svc.file[at + i] + (svc.fixups.includes(at + i - 25) ? page : 0)) & 0xff);

/** Restart slots and the NMI entry whose JP, or session form, targets [LO, HI). */
function vectorsInto(m, lo, hi) {
  const out = [];
  for (const s of [...SLOTS, 0x38, 0x66]) {
    const b = bytesAt(m, s, 4);
    const t = b[0] === 0xc3 ? b[1] | (b[2] << 8) : b[0] === 0xe5 && b[1] === 0x21 ? b[2] | (b[3] << 8) : -1;
    if (t >= lo && t < hi) out.push(s.toString(16));
  }
  return out;
}

/** Run M to the CCP's prompt, answering a BDOS error's key. */
function toPrompt(m, from = m.mark) {
  for (let i = 0; i < 20; i += 1) {
    const n = m.output.length;
    const end = m.cycles + 40_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && PROMPT.test(m.text(from))), 60_000_000, "the CCP's prompt");
    if (m.waitingForInput() && PROMPT.test(m.text(from))) return m.text(from);
    if (m.waitingForInput() && m.output.length === n) m.type("\r");
  }
  throw new Error(`no prompt: ${m.text(from)}`);
}

/** IM 2 and a new IOBYTE, its CON: field kept: the state each exit must put back. Ten bytes. */
const UNSETTLE = [0xed, 0x5e, 0x3a, 0x03, 0x00, 0xee, 0x54, 0x32, 0x03, 0x00]; // IM 2; LD A,(0003h); XOR 54h; LD (0003h),A
/** The test programs a session runs. ENTRY is MON3.SVC's execution entry, for REC.BIN. */
const PROGRAMS = (entry = 0) => ({
  "SET.BIN": bin(UNSETTLE, 0xc9), // and RET
  "RST0.BIN": bin(UNSETTLE, 0xc7), // and RST 00h
  "JP0.BIN": bin(UNSETTLE, 0xc3, 0, 0), // and JP 0000h
  "XP.BIN": bin(0x3a, 0x40, 0x00, 0xf6, 0x04, 0xd3, 0xff, 0xc3, 0x00, 0x00), // EXPAND on, JP 0000h
  "REC.BIN": bin(0xcd, entry & 0xff, entry >> 8, 0xc9), // CALL the entry; RET
  "X.COM": bin(0xc9),
});
/** A program that leaves JP TARGET in SLOT, in the form warm boot keeps: the JP, then five zeros. */
const setJp = (slot, target) => bin(0x21, slot, 0x00, 0x36, 0xc3, 0x23, 0x36, target & 0xff, 0x23, 0x36, target >> 8, 0x21, slot + 7, 0x00, 0x36, 0x00, 0xc9);

/** A machine with MON3.SVC (FILE, or the build's) installed, the programs on A:. */
async function installed(file, extra = {}) {
  const m = boot({ "MON3.SVC": file ?? (await mon3File()), ...PROGRAMS(FIG.entry), ...extra });
  m.command("MON3.SVC");
  return m;
}

/** MON3.SVC /E refused at its entry: the message, FF00h, and page zero and the service's pages as at the entry. */
function refusedAtEntry(m, message) {
  const p = pageOf(m);
  const entry = (p << 8) + 41;
  const service = () => bytesAt(m, p << 8, 0x800);
  m.mark = m.output.length;
  m.type("MON3.SVC /E\r");
  m.runUntil(() => m.pc === entry, 100_000_000, "the entry");
  const [pz, svc] = [bytesAt(m, 0, 0x100), service()];
  const out = toPrompt(m);
  assert.ok(out.includes(message), `${message} in ${JSON.stringify(out)}`);
  assert.equal(code(m), 0xff00, "FF00h");
  const moved = (now, was, base) => now.flatMap((v, i) => (v === was[i] ? [] : [`${(base + i).toString(16)}: ${was[i].toString(16)} to ${v.toString(16)}`]));
  assert.deepEqual(moved(bytesAt(m, 0, 0x100), pz, 0), [], "0000h-00FFh as at the entry");
  assert.deepEqual(moved(service(), svc, p << 8), [], "the service as at the entry");
}

/** CLAIMnn.SVC: a test service claiming slot nn and writing its JP there. */
const claimFiles = async (slots) => Object.fromEntries(await Promise.all(slots.map(async (s) => [`CLAIM${hex2(s)}.SVC`, (await demoSvc({ V_VEC: 1, VECAT: s, FLAGS: 1 | (1 << (s >> 3)) })).file])));

test("KG61 held slot refused", async () => {
  const sets = Object.fromEntries(SLOTS.map((s) => [`SET${hex2(s)}.COM`, setJp(s, 0xc003)]));
  const m = await installed(undefined, { ...sets, ...(await claimFiles(SLOTS)) });
  for (const s of SLOTS) {
    // A JP into ROM that a finished program left, which warm boot keeps.
    m.command(`SET${hex2(s)}`);
    assert.deepEqual(bytesAt(m, s, 3), [0xc3, 0x03, 0xc0]);
    refusedAtEntry(m, `RST ${hex2(s)} held: UNLOAD or reset\r\n`);
    bytesAt(m, s, 8).forEach((_, i) => m.write(s + i, DEFAULT_SLOT[i]));
    // A claiming service's JP.
    assert.equal(typed(m, `CLAIM${hex2(s)}.SVC`).code, 0, `CLAIM${hex2(s)}.SVC claims it`);
    assert.equal(m.read(s), 0xc3);
    m.command("X"); // a warm boot puts the slot in the form it keeps
    refusedAtEntry(m, `RST ${hex2(s)} held: UNLOAD or reset\r\n`);
    m.command("UNLOAD");
    assert.deepEqual(bytesAt(m, s, 8), DEFAULT_SLOT);
  }
});

test("KG61 0038h held", async () => {
  const m = await installed(undefined, await claimFiles([0x38]));
  const claim = (await demoSvc({ V_VEC: 1, VECAT: 0x38, FLAGS: 1 | 0x80 })).file;
  assert.ok(claim);
  assert.equal(typed(m, "CLAIM38.SVC").code, 0);
  m.command("X");
  const held = bytesAt(m, 0x38, 8);
  assert.equal(held[0], 0xc3, "0038h holds the claim's JP");
  const r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3, "the session starts");
  assert.match(r.out, /RST 38 held: no interrupts\r\n(?:(?!MON3>)[^])*MON3>$/, "the message before the first MON3>");
  assert.deepEqual(bytesAt(m, 0x38, 8), held, "0038h as it was in the session");
  leave(m, r);
  assert.deepEqual(bytesAt(m, 0x38, 8), held, "and after EXIT");
});

/** The session's page zero for MON3.SVC (SVC) at PAGE: { slots, stub, nmi, target }. */
function sessionForm(svc, page) {
  const at = (name) => (page << 8) + svc.symbols[name];
  const form = (h) => [0xe5, 0x21, h & 0xff, h >> 8, 0xc3, 0x41, 0x00, 0x00];
  const slots = Object.fromEntries([...SLOTS, 0x38].map((s) => [s, form(at(`R${hex2(s)}`))]));
  return { slots, stub: asLoaded(svc, page, svc.symbols.PZCODE, 15), nmi: asLoaded(svc, page, svc.symbols.NMIC, 6), target: at("HOOK") };
}

test("KG61 session page zero", async () => {
  const svc = await mon3Build();
  const m = await installed();
  const p = pageOf(m);
  assert.ok(line(m, "MON3.SVC /E").mon3);
  const want = sessionForm(svc, p);
  for (const [s, form] of Object.entries(want.slots)) assert.deepEqual(bytesAt(m, Number(s), 8), form, `slot ${Number(s).toString(16)}h: E5 21 lo hi C3 41 00`);
  assert.deepEqual(bytesAt(m, 0x41, 15), want.stub, "0041h-004Fh: the stub, GO's return and the RETN");
  assert.deepEqual(bytesAt(m, 0x41, 15).slice(13), [0xed, 0x45], "004Eh: RETN");
  assert.deepEqual(bytesAt(m, 0x66, 6), want.nmi, "0066h: MON-3's NMI entry");
  assert.deepEqual(bytesAt(m, 0x66, 6), [0xe5, 0x2a, 0x94, 0x08, 0xe3, 0xc9]);
  assert.equal(warmTarget(m), want.target, "the warm-boot target is the hook");
  leave(m, { mon3: true });
});

/** Assert that M runs IM 2 and IOBYTE IO's new value: UNSETTLE's work. */
function unsettled(m, how, io) {
  assert.equal(m.cpu.cpu.imode, 2, `${how}: the program set IM 2`);
  assert.equal(m.read(3), io ^ 0x54, `${how}: and a new IOBYTE`);
}

/** Leave a session by HOW, from MON3> on M: the text to the CCP's prompt. With SETTLE, IM 2 and a new IOBYTE first. */
function exitBy(m, how, settle = false) {
  const io = m.read(3);
  const program = how.endsWith(".BIN");
  if (settle && !program) {
    assert.match(line(m, "LOAD SET.BIN").out, /MON3>$/);
    assert.match(line(m, "GO").out, /MON3>$/);
    unsettled(m, how, io);
  }
  m.mark = m.output.length;
  if (how === "EXIT") m.type("EXIT\r");
  else if (how === "^C") m.type("\x03");
  else if (how === "LOAD error") m.type("LOAD E:NONE.BIN\r");
  else {
    assert.match(line(m, `LOAD ${how}`).out, /MON3>$/);
    m.mark = m.output.length;
    m.type("GO\r");
    if (settle) {
      runTo(m, 0x4000 + UNSETTLE.length);
      unsettled(m, how, io);
    }
  }
  return toPrompt(m);
}

const EXITS = ["EXIT", "^C", "RST0.BIN", "JP0.BIN", "LOAD error", "XP.BIN"];

async function sixExits(svc, exits = EXITS) {
  svc ??= await mon3Build();
  const m = await installed(svc.file);
  const p = pageOf(m);
  for (const how of exits) {
    const before = bytesAt(m, 0, 0x100);
    assert.ok(line(m, "MON3.SVC /E").mon3, how);
    const out = exitBy(m, how, how !== "XP.BIN");
    if (how === "LOAD error") assert.match(out, /E:/, "the BDOS's error on E:");
    const expand = how === "XP.BIN";
    assert.deepEqual(vectorsInto(m, p << 8, (p + 8) << 8), [], `${how}: no vector into MON3.SVC`);
    assert.deepEqual(bytesAt(m, 0x08, 0x38), before.slice(0x08, 0x40), `${how}: 0008h-003Fh as before /E`);
    if (!expand) assert.deepEqual(bytesAt(m, 3, 2), before.slice(3, 5), `${how}: 0003h-0004h as before`);
    if (!expand) assert.equal(m.cpu.cpu.imode, 1, `${how}: IM 1`);
  }
}
test("KG61 six exits", () => sixExits());

async function staleInactive(svc) {
  svc ??= await mon3Build();
  const m = await installed(svc.file);
  // 0066h lies in the default FCB, which the CCP writes for each command:
  // this tail's type puts "YZ" there, which a hook that acted would put back.
  assert.ok(line(m, "MON3.SVC /E A.XYZ").mon3);
  exitBy(m, "XP.BIN");
  assert.equal(warmTarget(m), (pageOf(m) << 8) + svc.symbols.HOOK, "the EXPAND 1 exit passed the hook");
  m.command("CON BAT");
  const io = m.read(3);
  m.command("X");
  assert.equal(m.read(3), io, "IOBYTE as CON set it");
  assert.deepEqual(bytesAt(m, 0x66, 6), [0x20, 0x20, 0, 0, 0, 0], "0066h as the CCP wrote it for X, not put back");
  assert.equal(warmTarget(m), m.sym("WBOOTR"), "the hook is gone");
  m.command("CON TTY");
}
test("KG61 stale hook inactive", () => staleInactive());

async function staleThenEntry(svc) {
  svc ??= await mon3Build();
  const m = await installed(svc.file);
  assert.ok(line(m, "MON3.SVC /E").mon3);
  exitBy(m, "XP.BIN");
  assert.ok(line(m, "MON3.SVC /E").mon3, "entry with a stale hook");
  assert.ok(!line(m, "EXIT", { maxCycles: 100_000_000 }).mon3);
  assert.match(line(m, "X", { maxCycles: 100_000_000 }).out, /A>$/, "a .COM's exit reaches the prompt");
  assert.equal(warmTarget(m), m.sym("WBOOTR"));
}
test("KG61 stale hook then entry", () => staleThenEntry());

async function recursion(svc) {
  svc ??= await mon3Build();
  const m = await installed(svc.file);
  const entry = (pageOf(m) << 8) + 41;
  assert.equal(entry, FIG.entry, `REC.BIN calls the entry at ${FIG.entry.toString(16)}h`);
  assert.ok(line(m, "MON3.SVC /E").mon3);
  assert.match(line(m, "LOAD REC.BIN").out, /MON3>$/);
  const pz = bytesAt(m, 0, 0x100);
  let back = false;
  m.mark = m.output.length;
  m.type("GO\r");
  m.runUntil(() => {
    if (m.pc === 0x4003) back = true; // the program's RET, after the call
    return m.waitingForInput() && MON3.test(m.text(m.mark));
  }, 100_000_000, "MON3> after the program");
  const out = m.text(m.mark);
  assert.match(out, /MON3 active\r\n/);
  assert.ok(back, "the call returned to the program");
  assert.deepEqual(bytesAt(m, 0, 0x100), pz, "the session's page zero");
  leave(m, { mon3: true });
}
test("KG61 recursion", () => recursion());

const BAZA = pinned("BAZA.COM");
const RTL = pinned("BAZA.RTL");

test("KG61 baza and 0038h after", { skip: BAZA.skip || RTL.skip, timeout: 900_000 }, async () => {
  check(BAZA);
  check(RTL);
  const image = card({ "MON3.SVC": await mon3File(), "BAZA.COM": readFileSync(BAZA.path), "BAZA.RTL": readFileSync(RTL.path), ...(await claimFiles([0x38])) });
  volume(image, "A").write("TIMES.BAS", readFileSync(resolve(ROOT, "programs/TIMES.BAS")), { text: true });
  const m = countOpens(machine(image));
  const r = typed(m, "MON3.SVC /E");
  assert.ok(r.mon3);
  leave(m, r);
  assert.match(line(m, "BAZA TIMES", { maxCycles: 2_000_000_000 }).out, /COM written\r\n/, "BAZA compiles TIMES after a session");
  assert.equal(sha(volume(image, "A").read("TIMES.COM")), TIMES_COM, "TIMES.COM's bytes");
  const ask = (text, want) => {
    m.mark = m.output.length;
    m.type(text);
    return m.expect(want, { maxCycles: 400_000_000 });
  };
  ask("TIMES\r", /WHAT IS YOUR NAME\? $/);
  ask("TEC\r", /PICK A NUMBER, 1 TO 12\? $/);
  ask("13\r", /PLEASE PICK 1 TO 12\.\r\nPICK A NUMBER, 1 TO 12\? $/);
  const out = ask("7\r", /\r\nA>$/);
  assert.match(out, / 7  X 7  = 49 [^]*THEY ADD UP TO 546 [^]*GOODBYE, TEC!/, "TIMES runs");
  // 0038h is the default after the session, so a claim on it loads.
  assert.equal(typed(m, "CLAIM38.SVC").code, 0, "a claim on 0038h loads");
  assert.equal(m.read(0x38), 0xc3);
  assert.deepEqual(m.violations, []);
});

// Service mutants of the session: each is MON3.SVC built with one step changed, and
// each must fail the figure named.

test("KG61 mutant: a session form starting with C3h is kept by the sweep after the EXPAND 1 exit", async () => {
  const svc = await mon3Variant([
    ["  ld a,$E5       ; PUSH HL\n  ld (de),a\n  inc de\n  ld a,$21       ; LD HL,nn\n  ld (de),a\n  inc de\n", "  ld a,$C3\n  ld (de),a\n  inc de\n"],
    ["  ld (de),a      ; the eighth byte\n  inc de\n", "  ld (de),a\n  inc de\n  ld (de),a\n  inc de\n"],
  ]);
  await assert.rejects(sixExits(svc, ["XP.BIN"]), /XP\.BIN: no vector into MON3\.SVC/);
});

test("KG61 mutant: a hook without IM 1 leaves IM 2 after RST 00h", async () => {
  const svc = await mon3Variant([[HOOK_IM1, ""]]);
  await assert.rejects(sixExits(svc, ["RST0.BIN"]), /RST0\.BIN: IM 1/);
});

test("KG61 mutant: an EXIT without IM 1 leaves IM 2", async () => {
  const svc = await mon3Variant([["  im 1\n  call RESETD    ; the drives reset\n", "  call RESETD    ; the drives reset\n"]]);
  await assert.rejects(sixExits(svc, ["EXIT"]), /EXIT: IM 1/);
});

test("KG61 mutant: a hook that skips the IOBYTE's copy leaves the program's after JP 0000h", async () => {
  const svc = await mon3Variant([[HOOK_IO, HOOK_IO.replace("ld de,IOBYTE  ", "ld de,LBUF    ")]]);
  await assert.rejects(sixExits(svc, ["JP0.BIN"]), /JP0\.BIN: 0003h-0004h as before/);
});

test("KG61 mutant: an EXIT that skips the IOBYTE's copy leaves the program's", async () => {
  const svc = await mon3Variant([[REST_IO, REST_IO.replace("ld de,IOBYTE  ", "ld de,LBUF    ")]]);
  await assert.rejects(sixExits(svc, ["EXIT"]), /EXIT: 0003h-0004h as before/);
});

test("KG61 mutant: a hook that acts without the session form puts IOBYTE back after CON BAT", async () => {
  const svc = await mon3Variant([["  ld a,($0010)\n  cp $E5         ; a form?\n  jr nz,HOOK1    ; no session\n  ld hl,($0012)\n  ld a,l\n  cp LOW(R10)    ; to our RST 10h?\n  jr nz,HOOK1\n  ld a,h\n  cp HIGH(R10)   ; and ours?\n  jr nz,HOOK1\n", ""]]);
  await assert.rejects(staleInactive(svc), /IOBYTE as CON set it/);
});

test("KG61 mutant: an entry that leaves a stale hook warm boots for ever", async () => {
  const svc = await mon3Variant([["  call UNHOOK    ; a stale hook out\n", ""]]);
  await assert.rejects(staleThenEntry(svc), /within 100000000 cycles/);
});

test("KG61 mutant: without the recursion test a second session starts and the program's stack is lost", async () => {
  const svc = await mon3Variant([["  call ACTIVE    ; Z: in a session\n  ld de,MBUSY    ; MON3 active\n  jr z,REFUSE    ; so refuse it\n", ""]]);
  await assert.rejects(recursion(svc));
});

// LOAD and GO, what a program's return gives back, and the disk.

const pattern = (records, seed = 0) => Uint8Array.from({ length: records * 128 }, (_, i) => (i * 7 + (i >> 7) + seed) & 0xff);
const tpaDigest = (m) => sha(Uint8Array.from(bytesAt(m, 0x100, (word(m, 6) & 0xff00) - 0x100)));
const runnable = (m, svc) => m.read((pageOf(m) << 8) + svc.symbols.RUNOK);

/** A session on a card with FILES and the programs, MON3.SVC installed and entered. */
async function inSession(files = {}, opts) {
  const svc = opts?.svc ?? (await mon3Build());
  const m = boot({ "MON3.SVC": svc.file, ...PROGRAMS(FIG.entry), ...files }, opts?.machine);
  m.command("MON3.SVC");
  const pz = bytesAt(m, 0, 0x100);
  assert.ok(line(m, "MON3.SVC /E").mon3);
  return { m, svc, pz };
}
const refused = (r) => /\r\n\?\r\n\r\nMON3>$/.test(r.out);
const ok = (r) => r.mon3 && !/\r\n\?\r\n/.test(r.out);

test("KG62 bin loads", async () => {
  const top = FIG.top; // (0006h) with MON3.SVC alone on the starter card
  const full = pattern((top - 0x4000) / 128);
  const low = pattern((0x800 - 0x100) / 128, 1);
  const one = pattern(1, 2);
  const { m, svc } = await inSession({ "FULL.BIN": full, "LOW.BIN": low, "ONE.BIN": one });
  assert.equal(word(m, 6), top);
  for (const [cmd, at, bytes] of [["LOAD FULL.BIN", 0x4000, full], ["LOAD LOW.BIN 100", 0x100, low], ["LOAD ONE.BIN 900", 0x900, one]]) {
    const r = line(m, cmd);
    assert.ok(ok(r), `${cmd}: ${JSON.stringify(r.out)}`);
    assert.deepEqual(bytesAt(m, at, bytes.length), [...bytes], `${cmd}: whole records at ${at.toString(16)}h`);
    assert.equal(runnable(m, svc), 1, `${cmd}: runnable`);
  }
  leave(m, { mon3: true });
});

async function refusedLoads(variant) {
  const top = FIG.top;
  const { m, svc } = await inSession({ "OVER.BIN": pattern((top - 0x4000) / 128 + 1), "THREE.BIN": pattern(3), "FIFTEEN.BIN": pattern(15), "EMPTY.BIN": new Uint8Array(0), "ONE.BIN": pattern(1) }, { svc: variant });
  for (const cmd of [
    "LOAD OVER.BIN", // one record past the top
    "LOAD ONE.BIN 0", // page zero
    "LOAD ONE.BIN 80",
    "LOAD ONE.BIN FF80", // wraps past FFFFh into page zero
    "LOAD THREE.BIN 700", // ends inside 08xxh
    "LOAD ONE.BIN 800", // starts in it
    "LOAD ONE.BIN 8F0",
    "LOAD FIFTEEN.BIN 100", // 0100h-087Fh
    "LOAD EMPTY.BIN",
    "LOAD NONE.BIN", // not found
  ]) {
    assert.ok(ok(line(m, "LOAD ONE.BIN 5000")), "a good load first");
    const before = tpaDigest(m);
    const r = line(m, cmd);
    assert.ok(refused(r), `${cmd}: ? (${JSON.stringify(r.out)})`);
    assert.equal(tpaDigest(m), before, `${cmd}: nothing written in the TPA`);
    assert.equal(runnable(m, svc), 0, `${cmd}: nothing runnable`);
  }
  leave(m, { mon3: true });
}
test("KG62 refused loads", () => refusedLoads());

test("KG62 disk error", async () => {
  const { m, svc } = await inSession({ "BIG.BIN": pattern(200) });
  m.mark = m.output.length;
  m.type("LOAD BIG.BIN\r");
  const at40 = pattern(41).subarray(40 * 128, 40 * 128 + 2);
  m.runUntil(() => m.read(0x4000 + 40 * 128) === at40[0] && m.read(0x4001 + 40 * 128) === at40[1], 200_000_000, "40 records read");
  const sd = m.sd;
  m.sd = null; // the card taken out
  const from = m.mark;
  m.runUntil(() => m.waitingForInput() && /Bad Sector$/.test(m.text(from)), 200_000_000, "the BDOS's error");
  m.sd = sd; // and put back before the key
  m.type("\r");
  const out = toPrompt(m, from);
  assert.match(out, /Bdos Err On A: Bad Sector\r\nA>$/, "warm boot to A>");
  assert.equal(warmTarget(m), m.sym("WBOOTR"), "the session ended");
  assert.ok(line(m, "MON3.SVC /E").mon3);
  assert.equal(runnable(m, svc), 0);
  assert.ok(refused(line(m, "GO")), "nothing runnable at re-entry");
  leave(m, { mon3: true });
});

test("KG62 go", async () => {
  const { m } = await inSession({ "RET.BIN": bin(0xc9) });
  assert.ok(refused(line(m, "GO")), "GO before any good load");
  assert.ok(ok(line(m, "LOAD RET.BIN")));
  assert.ok(refused(line(m, "LOAD NONE.BIN")));
  assert.ok(refused(line(m, "GO")), "GO after a refused load");
  assert.ok(ok(line(m, "LOAD RET.BIN 5000")));
  m.mark = m.output.length;
  m.type("GO 5000\r");
  runToPc(m, 0x5000);
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 50_000_000, "MON3>");
  leave(m, { mon3: true });
});
test("KG62 operands", async () => {
  const { m, svc } = await inSession({ "ONE.BIN": pattern(1) });
  for (const cmd of ["LOAD ONE.BIN 14000", "LOAD ONE.BIN 04000", "LOAD ONE.BIN 4000X", "LOAD 1:ONE.BIN", "LOAD Q:ONE.BIN", "LOAD @:ONE.BIN", "GO 14000", "GO 4000X"]) {
    assert.ok(ok(line(m, "LOAD ONE.BIN 5000")), "a good load first");
    const before = tpaDigest(m);
    const r = line(m, cmd);
    assert.ok(refused(r), `${cmd}: ? (${JSON.stringify(r.out)})`);
    assert.equal(tpaDigest(m), before, `${cmd}: nothing written in the TPA`);
    if (cmd.startsWith("LOAD")) assert.equal(runnable(m, svc), 0, `${cmd}: nothing runnable`);
  }
  assert.ok(ok(line(m, "LOAD A:ONE.BIN 4000")), "A: and four digits load");
  leave(m, { mon3: true });
});
const runToPc = (m, pc) => m.runUntil(() => m.pc === pc, 50_000_000, `pc ${pc.toString(16)}`);

test("KG62 restoration", async () => {
  // IM 1 with USER_INT on EI; RETI at 4020h, PROT_MODE written, then the
  // latch with PROTECT and CAPS, and RET.
  const prog = new Uint8Array(0x80);
  prog.set([0x21, 0x20, 0x40, 0x22, 0x92, 0x08, 0xed, 0x56, 0xfb, 0x3e, 0x01, 0x32, 0x9e, 0x08, 0x3a, 0x40, 0x00, 0xf6, 0x82, 0xd3, 0xff, 0xc9]);
  prog.set([0xfb, 0xed, 0x4d], 0x20);
  const { m, pz } = await inSession({ "REST.BIN": prog });
  let port1 = -1;
  const write = m.tec1g.ioHandlers.write;
  m.tec1g.ioHandlers.write = (port, value) => {
    if ((port & 0xff) === 0x01) port1 = value;
    return write(port, value);
  };
  assert.ok(ok(line(m, "LOAD REST.BIN")));
  m.mark = m.output.length;
  m.type("GO\r");
  runToPc(m, 0x4015); // the program's RET, with its latch written
  assert.equal(m.sysCtrl & 0x82, 0x82, "the program set PROTECT and CAPS");
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 50_000_000, "MON3>");
  assert.equal(m.cpu.cpu.iff1 ? 1 : 0, 0, "interrupts off at MON3>");
  assert.equal(m.sysCtrl, m.read(0x40), "the latch equals LATCHV");
  assert.equal(m.sysCtrl & 0x02, 0, "PROTECT clear");
  assert.equal(m.sysCtrl & 0x80, 0, "CAPS as LATCHV holds it: clear");
  assert.equal(port1 & 0x40, 0x40, "port 01h's bit 6 high: TX idle");
  leave(m, { mon3: true });
  assert.equal(m.cpu.cpu.imode, 1, "IM 1 after EXIT");
  assert.equal(m.sysCtrl, m.sym("LATCLAS"), "the latch LATCLAS");
  assert.deepEqual(bytesAt(m, 0x41, 15), pz.slice(0x41, 0x50), "0041h-004Fh as before the session");
});

/**
 * A program that sets SYS_MODE (089Dh) to EXPAND, to the overlay on, and to
 * every bank bit, each followed by a second GO: GO writes PROTECT and CAPS
 * from it, but never EXPAND, the bank or the overlay, so the second program
 * starts and returns with the latch and LATCHV equal, B still SYS_MODE.
 */
async function sysModeAtGo(svc) {
  // LD A,(4010h); LD (089Dh),A; RET, with the value at 4010h.
  const prog = new Uint8Array(0x80);
  prog.set([0x3a, 0x10, 0x40, 0x32, 0x9d, 0x08, 0xc9]);
  const { m } = await inSession({ "SM.BIN": prog }, { svc });
  assert.ok(ok(line(m, "LOAD SM.BIN")));
  for (const mode of [0x05, 0x00, 0x79]) {
    const what = `SYS_MODE ${hex2(mode)}h`;
    m.write(0x4010, mode);
    assert.ok(ok(line(m, "GO")), `${what}: the first GO comes back`);
    assert.equal(m.read(0x089d), mode, `${what}: set by the program`);
    m.mark = m.output.length;
    m.type("GO\r");
    m.runUntil(() => m.pc === 0x4000, 5_000_000, `${what}: the second GO reaches 4000h`);
    assert.equal(m.cpu.cpu.b, mode, `${what}: B is SYS_MODE`);
    assert.equal(m.sysCtrl & 0x7d, 0x01, `${what}: the overlay off, EXPAND 0 and bank 0 at 4000h`);
    assert.equal(m.read(0x40), m.sysCtrl, `${what}: LATCHV equals the latch at 4000h`);
    m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), 5_000_000, `${what}: MON3> after the second GO`);
    assert.equal(m.sysCtrl, m.read(0x40), `${what}: the latch equals LATCHV at MON3>`);
    assert.equal(m.sysCtrl & 0x7d, 0x01, `${what}: and holds no EXPAND, bank or overlay`);
  }
  leave(m, { mon3: true });
}
test("KG62 sys_mode at go", () => sysModeAtGo());

test("KG62 stack", async () => {
  // PUSH HL n times, POP them, RET: 63 words fill 0800h-087Dh under GO's
  // return word, and 80 run on into 07xxh.
  const pushes = (n) => bin(0x06, n, 0xe5, 0x10, 0xfd, 0x06, n, 0xe1, 0x10, 0xfd, 0xc9);
  const { m } = await inSession({ "S63.BIN": pushes(63), "S80.BIN": pushes(80) });
  const p = pageOf(m);
  const svc = await mon3Build();
  // The service's code, constants and its saved page zero: all but the sum
  // GO takes, its line buffer, FCB and stack, which the monitor itself
  // uses between commands.
  const kept = () => [...bytesAt(m, p << 8, svc.symbols.SUMEND)];
  for (const [file, low] of [["S63.BIN", 0x800], ["S80.BIN", 0x7de]]) {
    assert.ok(ok(line(m, `LOAD ${file}`)));
    const svcBefore = kept();
    m.mark = m.output.length;
    m.type("GO\r");
    let sp = 0xffff;
    m.runUntil(() => {
      if (m.pc >= 0x4000 && m.pc < 0x4010) sp = Math.min(sp, m.cpu.cpu.sp & 0xffff);
      return m.waitingForInput() && MON3.test(m.text(m.mark));
    }, 50_000_000, "MON3>");
    assert.equal(sp, low, `${file}: the program's deepest SP`);
    const now = kept();
    assert.deepEqual(now.flatMap((v, i) => (v === svcBefore[i] ? [] : [i])), [], `${file}: the service byte-equal, by offset`);
  }
  assert.equal(String.fromCharCode(...bytesAt(m, 0x800, 7)) === "MON3.1G", false, "ROMSIG overwritten by the program");
  leave(m, { mon3: true });
});

/** Drive A's allocation vector in M: { at, bytes } (the DPH's word at 14, DSM / 8 + 1 bytes). */
function vectorA(m) {
  const dph = m.sym("DPHTAB");
  const at = word(m, dph + 14);
  const dsm = word(m, word(m, dph + 10) + 5);
  return { at, bytes: bytesAt(m, at, (dsm >> 3) + 1) };
}

/** A program that exchanges a used and a free byte of A's vector, then returns by RET or, with JP0, ends the session by JP 0000h. */
async function vectorExchange(svc, jp0 = false) {
  const data = { "DATA1.DAT": pattern(128, 3), "DATA2.DAT": pattern(64, 4) };
  const tail = jp0 ? [0xc3, 0x00, 0x00] : [0xc9];
  const exch = bin(0x3a, 0, 0, 0x47, 0x3a, 0, 0, 0x32, 0, 0, 0x78, 0x32, 0, 0, ...tail); // A=(x); B=A; A=(y); (x)=A; (y)=B
  const { m } = await inSession({ ...data, "EXCH.BIN": exch }, { svc });
  assert.ok(ok(line(m, "LOAD EXCH.BIN")));
  const v = vectorA(m);
  const free = v.bytes.findIndex((b) => b !== 0xff); // the byte holding the first free block
  assert.ok(free >= 2, "a fully used byte below the first free block");
  const x = v.at + 1;
  const y = v.at + free + 2;
  assert.deepEqual([m.read(x), m.read(y)], [0xff, 0x00]);
  for (const [o, a] of [[1, x], [5, y], [8, x], [12, y]]) [m.write(0x4000 + o, a & 0xff), m.write(0x4001 + o, a >> 8)];
  const sum = v.bytes.reduce((a, b) => a + b, 0);
  if (jp0) {
    let swapped = false;
    m.mark = m.output.length;
    m.type("GO\r");
    m.runUntil(() => {
      if (m.pc === 0x400e) swapped = m.read(x) === 0x00 && m.read(y) === 0xff && vectorA(m).bytes.reduce((a, b) => a + b, 0) === sum;
      return m.pc === 0x400e;
    }, 50_000_000, "the program's JP 0000h");
    assert.ok(swapped, "the program exchanged the two bytes, the vector's sum unchanged");
    assert.match(toPrompt(m), /A>$/, "JP 0000h ends the session");
    assert.equal(warmTarget(m), m.sym("WBOOTR"), "the hook is out");
  } else {
    assert.ok(ok(line(m, "GO")));
    assert.deepEqual([m.read(x), m.read(y)], [0x00, 0xff], "the program exchanged the two bytes");
    assert.equal(vectorA(m).bytes.reduce((a, b) => a + b, 0), sum, "the vector's sum unchanged");
    leave(m, { mon3: true });
  }
  const saved = {};
  for (const [n, seed] of [["N1.COM", 5], ["N2.COM", 6], ["N3.COM", 7]]) {
    const bytes = pattern(16, seed);
    bytes.forEach((b, i) => m.write(0x100 + i, b));
    assert.doesNotMatch(m.command(`SAVE 8 ${n}`), /\?/);
    saved[n] = bytes;
  }
  const a = volume(m.sdImage, "A");
  assert.deepEqual(a.verify(), [], "the card's directory holds no cross-link");
  for (const [n, bytes] of Object.entries({ ...data, ...saved })) assert.deepEqual([...a.read(n)], [...bytes], `${n} intact`);
}
test("KG62 vector exchange", () => vectorExchange());
test("KG62 vector exchange, then JP 0000h", () => vectorExchange(undefined, true));

/** A program at 4000h that opens B:NAME, writes its record 0 in place from 4100h, closes it if CLOSE, and returns. */
function writer(name, close) {
  const call = (fn, de) => [0x11, de & 0xff, de >> 8, 0x0e, fn, 0xcd, 0x05, 0x00];
  const code = [...call(15, 0x4080), ...call(26, 0x4100), ...call(21, 0x4080), ...(close ? call(16, 0x4080) : []), 0xc9];
  const p = new Uint8Array(0x180);
  p.set(code);
  const [base, type] = name.split(".");
  p.set([2, ...Buffer.from(base.padEnd(8) + type.padEnd(3), "latin1")], 0x80);
  for (let i = 0; i < 128; i += 1) p[0x100 + i] = 0xa0 + (i & 15);
  return p;
}

async function hangAndReset(svc) {
  svc ??= await mon3Build();
  const { createContainer } = await import("../tools/lib/container.mjs");
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true }]);
  const a = volume(image, "A");
  for (const [n, b] of Object.entries({ "MON3.SVC": svc.file, "WC.BIN": writer("F.DAT", true), "WU.BIN": writer("G.DAT", false), "LOOP.BIN": bin(0x18, 0xfe) })) a.write(n, b);
  volume(image, "B").write("F.DAT", new Uint8Array(512).fill(0x11));
  volume(image, "B").write("G.DAT", new Uint8Array(512).fill(0x22));
  const m = machine(image);
  const written = writer("X.X", false).subarray(0x100);
  const onCard = (n) => [...volume(image, "B").read(n).subarray(0, 128)];
  assert.ok(line(m, "MON3.SVC /E").mon3);
  for (const f of ["WC.BIN", "WU.BIN"]) {
    assert.ok(ok(line(m, `LOAD ${f}`)));
    assert.ok(ok(line(m, "GO")));
  }
  assert.deepEqual(onCard("F.DAT"), [...written], "the closed file is on the card at its close");
  assert.ok(ok(line(m, "LOAD LOOP.BIN")));
  m.type("GO\r");
  runFor(m, 5_000_000);
  assert.equal(m.pc, 0x4000, "the program loops");
  assert.deepEqual(onCard("F.DAT"), [...written], "the closed file, while the program hangs");
  assert.deepEqual(onCard("G.DAT"), [...written], "the unclosed write, flushed by GO");
  m.reset();
  m.expect(/A>$/, { from: m.output.length, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt after the reset");
  assert.deepEqual(onCard("F.DAT"), [...written], "and after the reset");
  assert.deepEqual(onCard("G.DAT"), [...written]);
  assert.deepEqual(volume(image, "B").verify(), []);
}
test("KG62 hang and reset", () => hangAndReset());

async function expandInView(svc) {
  // EXPAND on through port FFh, then RST 10h call 33 (timeDelay), and RET.
  const prog = bin(0x3a, 0x40, 0x00, 0xf6, 0x04, 0xd3, 0xff, 0x21, 0x0a, 0x00, 0x0e, 0x21, 0xd7, 0xc9);
  const { m } = await inSession({ "XV.BIN": prog }, { svc });
  const fetches = [];
  const step = m.step.bind(m);
  m.step = () => {
    if (m.sysCtrl & 0x04 && m.pc >= 0x8000 && m.pc < 0xc000 && fetches.length < 8) fetches.push(m.pc.toString(16));
    return step();
  };
  assert.ok(ok(line(m, "LOAD XV.BIN")));
  let expanded = false;
  m.mark = m.output.length;
  m.type("GO\r");
  let back = true;
  try {
    m.runUntil(() => {
      expanded ||= m.pc === 0x4007 && (m.sysCtrl & 0x04) !== 0;
      return m.waitingForInput() && MON3.test(m.text(m.mark));
    }, 50_000_000, "MON3>");
  } catch {
    back = false;
  }
  assert.ok(expanded, "the program set EXPAND");
  assert.deepEqual(fetches, [], "no fetch from 8000h-BFFFh while the latch holds EXPAND");
  assert.ok(back, "back at MON3>");
  leave(m, { mon3: true });
}
test("KG62 expand in view", () => expandInView());

// Service mutants of LOAD, GO and the return.

test("KG62 mutant: without BDOS 37 at the program's return and at EXIT, a new file takes a used block", async () => {
  const svc = await mon3Variant([
    ["  call FORMS     ; page zero again\n  call RESETD    ; and the vectors\n", "  call FORMS     ; page zero again\n"],
    ["  im 1\n  call RESETD    ; the drives reset\n", "  im 1\n"],
  ]);
  await assert.rejects(vectorExchange(svc), /intact|cross-link/);
});

test("KG62 mutant: forms that jump straight to the handler fetch from 8000h-BFFFh under EXPAND", async () => {
  const svc = await mon3Variant([["  ld a,$C3       ; JP 0041h\n  ld (de),a\n  inc de\n  ld a,LOW(STUB)\n", "  ld a,$E9\n  ld (de),a\n  inc de\n  xor a\n"]]);
  const n = EXPAND1_WRITES.length;
  await assert.rejects(expandInView(svc), /no fetch from 8000h-BFFFh/);
  // What the mutant ran in EXPAND 1 wrote there too: the fetch is its failure.
  EXPAND1_WRITES.splice(n);
});

test("KG62 mutant: GO writing SYS_MODE to the latch unmasked leaves EXPAND on for the next program", async () => {
  const svc = await mon3Variant([["  and GOKEEP     ; no EXPAND or bank\n  or LATSHD      ; and the overlay off\n", ""]]);
  const n = EXPAND1_WRITES.length;
  await assert.rejects(sysModeAtGo(svc), /SYS_MODE 05h: /);
  // What the mutant ran in EXPAND 1 wrote there too: the latch is its failure.
  EXPAND1_WRITES.splice(n);
});

test("KG62 mutant: GO clearing only EXPAND from SYS_MODE lets the overlay over page zero", async () => {
  const svc = await mon3Variant([["  and GOKEEP     ; no EXPAND or bank\n  or LATSHD      ; and the overlay off\n", "  and $FB\n"]]);
  const n = EXPAND1_WRITES.length;
  await assert.rejects(sysModeAtGo(svc), /SYS_MODE 00h: /);
  EXPAND1_WRITES.splice(n);
});

test("KG62 mutant: a hook without BDOS 37 has a new file take a used block after JP 0000h", async () => {
  const svc = await mon3Variant([["  call RESETD    ; vectors rebuilt\n", ""]]);
  await assert.rejects(vectorExchange(svc, true), /intact|cross-link/);
});

test("KG62 mutant: without GO's BDOS 48 the hung program's reset loses the unclosed write", async () => {
  const svc = await mon3Variant([["  push hl\n  ld c,48        ; flush\n  call BDOS\n", "  push hl\n"]]);
  await assert.rejects(hangAndReset(svc), /flushed by GO/);
});

test("KG62 mutant: without the 0800h-08FFh test a load into MON-3's stack is taken", async () => {
  const svc = await mon3Variant([
    ["RNG1:\n  ld a,d\n  cp $08\n  jr z,RNGX      ; starts in 08xxh\n  ret nc         ; starts above it\n  ld a,h\n  cp $08\n  ccf\n  ret nc         ; ends below it\n  jr nz,RNGX     ; runs through it\n  ld a,l\n  cp 1\n  ccf            ; ends inside it\n  ret\n", "RNG1:\n  or a\n  ret\n"],
  ]);
  await assert.rejects(refusedLoads(svc), /LOAD THREE\.BIN 700: \?/);
});

// MON3.SVC's size, its life over warm boot, reset and UNLOAD, and
// TEC-OS with it installed and no session.

test("KG63 size and tpa", async () => {
  const C = MON3_CEILING;
  const svc = await mon3Build();
  assert.ok(svc.image <= C.bytes, `the header and image, ${svc.image} bytes, within ${C.bytes.toLocaleString("en")}`);
  assert.deepEqual([...svc.file.subarray(12, 15)], [0, 0, 0], "stack use declared: BDOS 0, BIOS 0, CCP 0");
  const { tasAssembler, romBackend } = await import("../tools/lib/tas-rom.mjs");
  if (romBackend() === "tas") {
    const { assembleMon3 } = await import("../tools/lib/tas-distribution.mjs");
    assert.deepEqual([...(await assembleMon3(ROOT, await tasAssembler()))], [...svc.file], "TAS's MON3.SVC equals ATOM's");
  }
  const m = boot({ "MON3.SVC": svc.file });
  m.command("MON3.SVC");
  const [line_] = services(m);
  const pages = Number(line_.split(" ")[1]);
  assert.deepEqual(services(m), [`MON3 ${pages}`], "one service");
  assert.ok(pages <= C.pages, `${pages} pages, at most ${C.pages}`);
  assert.ok(word(m, 6) >= C.top, `(0006h) ${word(m, 6).toString(16)}h, at least ${C.top.toString(16)}h on the starter card`);
  assert.ok(word(m, 6) - 0x100 >= C.tpa, `TPA ${word(m, 6) - 0x100}, at least ${C.tpa}`);
  console.log(`MON3.SVC: file ${svc.file.length} bytes, header and image ${svc.image}, ${pages} pages, TPA ${word(m, 6) - 0x100}`);
  // The fail input: buffers added to the ceiling and one byte more.
  const big = await mon3Variant([["  DS 80\nMSTK:\n", `  DS 80+${C.bytes + 1 - svc.image}\nMSTK:\n`]]);
  assert.equal(big.image, C.bytes + 1, "the larger build is one byte over the ceiling");
  const b = boot({ "MON3.SVC": big.file });
  b.command("MON3.SVC");
  assert.deepEqual(services(b), [`MON3 ${C.pages + 1}`], "and takes a page more than the ceiling");
});

test("KG63 warm boot and reset", async () => {
  const m = await installed();
  m.mark = m.output.length;
  m.type("\x03");
  m.expect(/\r\nA>$/);
  m.command("X");
  assert.deepEqual(services(m), [FIG.line], "warm boot keeps it");
  assert.ok(line(m, "MON3.SVC /E").mon3, "and it enters");
  leave(m, { mon3: true });
  m.reset();
  m.expect(/A>$/, { from: m.output.length, maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 400_000_000, "the prompt after a reset");
  assert.deepEqual(services(m), [], "a reset removes it");
  assert.equal(word(m, 6), 0xb9a4);
});

async function unloads(svc) {
  svc ??= await mon3Build();
  for (const how of ["EXIT", "XP.BIN"]) {
    const m = await installed(svc.file);
    assert.ok(line(m, "MON3.SVC /E").mon3);
    exitBy(m, how);
    m.command("UNLOAD");
    assert.deepEqual(services(m), [], `after ${how}: UNLOAD takes the pages`);
    assert.equal(word(m, 6), 0xb9a4, `after ${how}: (0006h) back at B9A4h`);
    assert.equal(warmTarget(m), m.sym("WBOOTR"), `after ${how}: the hook is out`);
    assert.match(line(m, "X", { maxCycles: 100_000_000 }).out, /A>$/, `after ${how}: a .COM exits to the prompt`);
  }
}
test("KG63 unload", () => unloads());

test("KG63 mutant: a REMOVE that leaves the hook has UNLOAD leave the target in freed pages", async () => {
  const svc = await mon3Variant([["  ld (EXRDY),a   ; not ready first\n  jp UNHOOK\n", "  ld (EXRDY),a   ; not ready first\n  ret\n"]]);
  await assert.rejects(unloads(svc), /XP\.BIN: the hook is out/);
});

// The existing tests' bodies, run unchanged in a child process whose every
// machine installs MON3.SVC from its card's startup file first
// (test/lib/machine.mjs).
const INACTIVE = {
  "test/system.test.mjs": ["BDOS file functions pass the probe", "warm boot clears the restart vectors except jumps into ROM, and a stale RST returns"],
  "test/tas.test.mjs": ["TAS assembles a program on TEC-OS and the program runs"],
  "test/svc.test.mjs": ["a jump into a service is kept over warm boot, and RST 38h reaches a kept 0038h"],
  "test/times.test.mjs": ["with GLCD.SVC loaded and a JP held in RST 1, BAZA takes RST 1 while it compiles and gives the JP back, TIMES runs, and the GLCD is still the console"],
  "test/ted-baza.test.mjs": [
    "TED on TIMES.BAS: ^T B builds with BAZA and comes back clean, ^T D says No debugger, ^T R runs TIMES, and a syntax error brings TED back on its line",
    "a project on B: builds with A:'s BAZA, which finds BAZA.RTL on its load drive",
  ],
};

test("KG63 inactive", { timeout: 3_600_000 }, async () => {
  const dir = resolve(ROOT, "build/ks53");
  mkdirSync(dir, { recursive: true });
  const svcPath = resolve(dir, "MON3.SVC");
  const log = resolve(dir, "inactive.log");
  writeFileSync(svcPath, await mon3File());
  writeFileSync(log, "");
  const escape = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = Object.values(INACTIVE).flat();
  // The child is a test run of its own, reporting TAP, not a child of this one.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", `--test-name-pattern=^(${names.map(escape).join("|")})$`, ...Object.keys(INACTIVE)], {
    cwd: ROOT,
    env: { ...env, TECOS_TEST_RESIDENT: svcPath, TECOS_TEST_RESIDENT_LOG: log },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = r.stdout;
  const passed = [...out.matchAll(/^ok \d+ - (.*)$/gm)].map((x) => x[1].replace(/ # SKIP.*$/, ""));
  const failed = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((x) => x[1]);
  assert.deepEqual(failed, [], out.slice(-4000));
  assert.doesNotMatch(out, /# SKIP/, "none skipped");
  assert.deepEqual([...passed].sort(), [...names].sort(), "each named test ran and passed");
  const entries = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(entries.length >= names.length, `${entries.length} machines with MON3.SVC installed`);
  for (const e of entries) assert.ok(e.entry <= FIG.top, `${e.file}: MON3.SVC installed, (0006h) ${e.entry.toString(16)}h`);
  assert.equal(r.status, 0);
});

// What the docs say about /E and MON3.SVC, read against the build.

test("KG68 docs agree", async () => {
  const doc = (n) => readFileSync(resolve(ROOT, "docs", n), "utf8").replace(/\s+/g, " ");
  const services_ = doc("services.md");
  const { EXENTRY, hasExecRecord } = await import("../tools/lib/svc.mjs");
  const { symbols } = romFor();
  // The record's layout and the reserved prefix.
  assert.equal(symbols.get("DHLEN"), 25);
  assert.match(services_, /Sixteen bytes at the start of the image, file offset 25/);
  assert.match(services_, new RegExp(`\\| ${EXENTRY} \\| 2 \\| The entry, from the header's start, as \`INIT\` and \`REMOVE\` are \\|`));
  assert.ok(hasExecRecord(Uint8Array.from([...new Array(25).fill(0), 0x45, 0x58, 0x01])), "45h 58h 01h is the record's prefix");
  assert.match(services_, /must not start its image with 45h 58h 01h/);
  // The symbols the contract names are the build's.
  for (const n of ["CSTKTOP", "LATCLAS", "PZLDRV", "SVCRC", "TNENODV"]) {
    assert.ok(services_.includes(`\`${n}\``), `services.md names ${n}`);
    assert.ok(symbols.has(n), `${n} is a build symbol`);
  }
  for (const f of FORMS.map((x) => x.slice("MON3.SVC ".length))) assert.ok(services_.includes(`\`${f}\``), `services.md names ${f}`);
  for (const s of ["BC points at the eight-byte name", "The entry is bounded at install", "never becomes ready", "skips that step", "HL is the entry address. A, BC, DE, IX and IY are undefined", "`NAME.SVC X /E` only installs"])
    assert.ok(services_.includes(s), `services.md: ${s}`);
  // 0041h-004Fh, in the map and the compatibility notes.
  assert.match(doc("memory-map.md"), /A `MON3\.SVC` session holds 0041h–004Fh while it runs/);
  assert.match(doc("compatibility.md"), /A `MON3\.SVC` session holds `0041h` to `004Fh`/);
  assert.match(doc("compatibility.md"), /entered with HL 0100h and DE 0000h/);
  // docs/mon3.md's figures.
  const mon3 = doc("mon3.md");
  const svc = await mon3Build();
  // The figures as the build gives them.
  const fig = figures(svc);
  const h4 = (v) => `${v.toString(16).toUpperCase().padStart(4, "0")}h`;
  assert.ok(mon3.includes(`${svc.image.toLocaleString("en")} bytes of header and image in **${fig.pages} pages**`), "the size");
  assert.ok(mon3.includes(`from \`B9A4h\` to \`${h4(fig.top)}\`, and the TPA from 47,268 bytes to **${fig.tpa.toLocaleString("en")}**`), "(0006h) and the TPA");
  const src = mon3Text();
  const equ = (n) => Number(new RegExp(`^${n} EQU \\$([0-9A-F]+)`, "m").exec(src)[1].replace(/^/, "0x"));
  assert.ok(mon3.includes(`| SP | ${h4(equ("MSTK3") - 2)}, holding the return address ${h4(equ("GORET"))} |`), "GO's SP and return");
  for (const [n, name] of [["UINT", "USER_INT"], ["UNMI", "USER_NMI"], ["SYSMD", "SYS_MODE"], ["PROTM", "PROT_MODE"]])
    assert.ok(mon3.includes(`\`${name}\` (${h4(equ(n))})`), `mon3.md: ${name} at ${h4(equ(n))}`);
  // The calls the doc lists as built are those the service's table does not send to the error display.
  const table = src.slice(src.indexOf("\nAPI:")).split("\n\n")[0];
  const words = [...table.matchAll(/^\s+DW (.*)$/gm)].flatMap((x) => x[1].replace(/;.*$/, "").split(",").map((w) => w.trim()));
  assert.equal(words.length, 63, "MON-3's 63 calls");
  // RTCAPI answers every function with carry, as MON-3 a missing one. The
  // translated calls run on TEC-OS's resources: the session and the latch.
  const TRANSLATED = { 2: "PREIN", 41: "SETCAP", 43: "SETPRT", 48: "TOGCAP" };
  for (const [n, w] of Object.entries(TRANSLATED)) assert.equal(words[n], w, `call ${n} is ${w} in the table`);
  const built = words.flatMap((w, i) => ((w === "DERR" && i !== 11) || w === "RTCAPI" ? [] : [i]));
  const listedIn = (head) => [...mon3.slice(mon3.indexOf(head)).split(". ")[0].matchAll(/(\d+) `/g)].map((x) => Number(x[1]));
  assert.deepEqual(listedIn("calls implemented, 42 of them:"), built.filter((i) => !(i in TRANSLATED)), "the implemented calls");
  assert.deepEqual(listedIn("Translated, on TEC-OS's resources, 4 of them:"), Object.keys(TRANSLATED).map(Number), "the translated calls");
  assert.match(mon3, /accepted disk hazard\.\*\* A MON-3 program that writes B9A4h–BFFFh/);
  // The refused calls the doc lists are those the table sends to the error display, and RTCAPI.
  const refusedCalls = words.flatMap((w, i) => ((w === "DERR" && i !== 11) || w === "RTCAPI" ? [i] : []));
  const notBuilt = mon3.slice(mon3.indexOf("Not built, and refused:")).split(". Each")[0];
  assert.deepEqual([...notBuilt.matchAll(/(\d+) `/g)].map((x) => Number(x[1])).sort((a, b) => a - b), refusedCalls, "the refused calls");
  for (const n of ["DISFROM", "C_FILENO", "0600h–07FFh", "Z and C set, as a key press gives", "Tables damaged: EXIT and reset"]) assert.ok(mon3.includes(n), `mon3.md: ${n}`);
  assert.match(mon3, /Not yet shipped:\*\* `RST 18h`'s graphics/);
});
