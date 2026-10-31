// Drivers and the service registry: DRVDEMO and its variants, loaded as the
// shell will load them, by the loader's symbol with the file in the TPA. Each
// failure compares the whole state before and after, by name: page zero,
// every resident page and the workspace, less the buffers listed in ranges().
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { checkInterfaces, DHLEN, encoders, makeDrv } from "../tools/lib/drv.mjs";
import { Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, boot, romFor, standardCard, volume } from "./lib/fixtures.mjs";

const STUB = 0x0060; // JR $, where a call comes back
const VARIANTS = ["V_FAIL", "V_PROBE", "V_CCP", "V_CMD", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFAIL", "V_WB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"];
const made = new Map();

/** DRVDEMO with OVER set; opt as makeDrv's. */
async function drv(over = {}, opt = {}) {
  const key = JSON.stringify([over, opt]);
  if (!made.has(key)) {
    const defs = { ...Object.fromEntries(VARIANTS.map((v) => [v, 0])), FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, DRVNAME: '"DEMO    "', SVCNAME: '"DEMO    "', SVCVER: 2, ...over };
    made.set(key, await makeDrv(resolve(ROOT, "test/programs/drvdemo.asm"), { defs, work: resolve(ROOT, "build/drv"), ...opt }));
  }
  return made.get(key);
}
const client = (over = {}) => drv({ V_DEP: 1, DRVNAME: '"CLIENT  "', SVCNAME: '"CLIENT  "', ...over }, { deps: [{ name: "DEMO", version: 2 }] });

/** The harness around machine M at the prompt. */
function bench(m) {
  m.write(STUB, 0x18);
  m.write(STUB + 1, 0xfe);
  const c = m.cpu.cpu;
  const top = m.sym("CSTKTOP");
  const word = (a) => m.read(a) | (m.read(a + 1) << 8);
  const poke = (a, v) => {
    m.write(a, v & 0xff);
    m.write(a + 1, v >> 8);
  };
  const put = (at, bytes) => bytes.forEach((b, i) => m.write(at + i, b));
  // A call as the CCP makes it, from the top of its stack. It ends at the
  // return, or at warm boot's entry to the CCP.
  const call = (addr, regs = {}) => {
    Object.assign(c, regs);
    poke(top - 2, STUB);
    c.sp = top - 2;
    c.pc = addr;
    m.runUntil(() => m.pc === STUB || m.pc === m.sym("CCPENT"), 60_000_000, `return from ${addr.toString(16)}`);
    return { back: m.pc === STUB, carry: c.flags.C, a: c.a, hl: (c.h << 8) | c.l };
  };
  const entry = () => assert.equal(word(6) & 0xff, 6, "(0006h) stays xx06h");
  const load = (file, end) => {
    put(0x100, [...file]);
    poke(m.sym("LOADTOP"), end ?? 0x100 + Math.ceil(file.length / 128) * 128);
    const r = { ...call(m.sym("DRVLOAD")), rc: m.read(m.sym("DRVRC")) };
    if (r.back) entry();
    return r;
  };
  const unload = () => {
    const text = m.command("UNLOAD");
    entry();
    return text;
  };
  const prompt = () => {
    m.mark = m.output.length;
    c.sp = top;
    c.pc = m.sym("STARTED");
    m.expect(/\r\n[A-P]>$/, { maxCycles: 200_000_000 });
    m.runUntil(() => m.waitingForInput(), 10_000_000, "the prompt");
  };
  const warmBoot = () => {
    m.mark = m.output.length;
    c.pc = 0;
    m.runUntil(() => m.waitingForInput() && /\r\n[A-P]>$/.test(m.text(m.mark)), 200_000_000, "warm boot");
  };
  const find = (name, least = 1) => {
    put(0x300, [...Buffer.from(name.padEnd(8), "latin1")]);
    return call(m.sym("ABIDRV"), { b: least, c: 0, d: 3, e: 0 });
  };
  const nth = (i) => call(m.sym("ABIDRV"), { b: i, c: 1 });
  const head = () => m.read(m.sym("DRVHEAD")) << 8;
  return { m, word, poke, put, call, load, unload, prompt, warmBoot, find, nth, head };
}

async function machine(opts = {}) {
  return bench(boot(standardCard(), opts));
}

const snapshot = (m) => Uint8Array.from({ length: 0xc000 }, (_, i) => m.read(i));

/** What a comparison leaves out, by name. */
function ranges(m) {
  const s = (n) => m.sym(n);
  return {
    load: {
      "the CCP's stack": [s("CSTKBAS"), s("CSTKTOP")],
      LOADTOP: [s("LOADTOP"), s("LOADTOP") + 2],
      PRLN: [s("PRLN"), s("PRLN") + 2],
      PRLDL: [s("PRLDL"), s("PRLDL") + 1],
      DRVRC: [s("DRVRC"), s("DRVRC") + 1],
      LOADBUF: [s("LOADBUF"), s("LOADBUF") + 128],
    },
    // A command typed, or a warm boot: what any disk read and console line change.
    command: {
      "the CCP's and BDOS's state and stacks": [s("CCPRAM"), s("BDOSRME")],
      "the BIOS stack": [s("BSTKB"), s("BSTK")],
      "the BIOS's block state and BLKBUF": [s("DSKCUR"), s("DRVTAB")],
      DIRBUF: [s("DIRBUF"), s("DIRBUF") + 128],
      LOGINV: [s("LOGINV"), s("LOGINV") + 2],
      "the SD and cache state": [s("SDBYTE"), s("KBMASK")],
      "the keyboard's scan": [s("KBMASK"), s("GLVEC")],
      "the terminal's cursor and parser": [0x46, 0x50],
      "RXFULL and RXCHAR": [0x42, 0x44],
      HHEAD: [s("HHEAD"), s("HHEAD") + 1],
      "XMDST to MVREST": [s("XMDST"), s("XMARK")],
      LINEBUF: [s("LINEBUF"), s("LINEBUF") + 80],
      "the mount scratch": [s("MNTCNT"), s("LINEBUF")],
    },
  };
}

/** Addresses that changed outside the TPA below CEILING and the named buffers. */
function changed(m, before, after, ceiling, sets = ["load"], allow = {}) {
  const r = ranges(m);
  const out = Object.values(Object.assign({}, ...sets.map((k) => r[k]), allow));
  const bad = [];
  for (let i = 0; i < 0xc000; i += 1) {
    if (i >= 0x100 && i < ceiling) continue;
    if (before[i] !== after[i] && !out.some(([a, b]) => i >= a && i < b)) bad.push(i.toString(16));
  }
  return bad;
}

/** Load FILE, holding the state before and after. */
function transaction(t, file, end) {
  const before = snapshot(t.m);
  const ceiling = t.word(6) & 0xff00;
  const r = t.load(file, end);
  return { r, ceiling, differs: () => changed(t.m, before, snapshot(t.m), ceiling) };
}

const untouched = (t, x) => assert.deepEqual(x.differs(), []);

for (const profile of ["debug80", "debug80t40", "debug80g32", "board"]) {
  test(`${profile}: a driver installs, is found and enumerated, is called and unloads, leaving everything as it was`, async () => {
  const t = await machine({ profile });
  const d = await drv();
  const before = snapshot(t.m);
  const ceiling = t.word(6) & 0xff00;
  const stub = t.word(6);
  assert.equal(t.load(d.file).carry, 0);
  const base = t.head();
  assert.equal(t.word(6), base + 6, "(0006h) stays xx06h");
  assert.equal(t.word(t.m.sym("PZTOP")), base + 6);
  assert.equal(t.m.read(base + 6), 0xc3);
  assert.equal(t.word(base + 7), stub, "the JP is to the old top");
  const f = t.find("DEMO");
  assert.equal(f.carry, 0);
  assert.equal(t.call(f.hl).a, 1);
  assert.equal(t.call(f.hl).a, 2);
  assert.equal(t.find("DEMO", 3).carry, 1, "below the least version");
  assert.equal(t.nth(0).carry, 0);
  assert.equal(t.nth(1).carry, 1);
  t.prompt();
  t.unload();
  assert.equal(t.word(6), stub);
  assert.equal(t.m.read(t.m.sym("DRVGEN")), 1, "the generation is raised");
  const gen = t.m.sym("DRVGEN");
  assert.deepEqual(changed(t.m, before, snapshot(t.m), ceiling, ["load", "command"], { DRVGEN: [gen, gen + 1] }), []);
  assert.deepEqual(t.m.violations, []);
  });
}

test("a load refused at a level reports refused, whatever the last load left", async () => {
  const t = await machine();
  assert.equal(t.load((await drv({ V_FAIL: 1 })).file).rc, 1);
  t.prompt();
  t.m.command("CCP");
  const r = t.load((await drv()).file);
  assert.deepEqual([r.carry, r.rc], [1, 0]);
});

test("a load refused by the window reports refused", async () => {
  const t = await machine();
  assert.equal(t.load((await drv({ V_FAIL: 1 })).file).rc, 1);
  t.m.write(t.m.sym("CCPLVL"), 0x80);
  const r = t.load((await drv()).file);
  assert.deepEqual([r.carry, r.rc], [1, 0]);
  t.m.write(t.m.sym("CCPLVL"), 0);
});

test("every image byte is its file's, and only the fixups gain the page, across gaps of 255 and more", async () => {
  const t = await machine();
  const d = await drv({ V_LONG: 1 });
  assert.ok(d.data.includes(255), "the data steps over a long gap");
  assert.equal(t.load(d.file).carry, 0);
  const base = t.head();
  const fixups = new Set(d.fixups);
  for (let i = 0; i < d.image - DHLEN; i += 1) {
    const want = (d.file[DHLEN + i] + (fixups.has(i) ? base >> 8 : 0)) & 0xff;
    assert.equal(t.m.read(base + DHLEN + i), want, `image byte ${i}`);
  }
});

test("every dependency is checked, and with all present the relocation data still follows them", async () => {
  const deps = [{ name: "DEMO", version: 2 }, { name: "OTHER", version: 1 }];
  const two = await drv({ V_DEP: 1, DRVNAME: '"CLIENT  "', SVCNAME: '"CLIENT  "' }, { deps });
  const t = await machine();
  t.load((await drv()).file);
  const x = transaction(t, two.file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 0], "the second is absent");
  untouched(t, x);
  t.load((await drv({ DRVNAME: '"OTHER   "', SVCNAME: '"OTHER   "', SVCVER: 1 })).file);
  assert.equal(t.load(two.file).carry, 0);
  assert.equal(t.find("CLIENT").carry, 0);
});

test("the older registry follows a driver's last record, so every service stays found", async () => {
  const t = await machine();
  t.load((await drv({ SVCNAME: '"OLDER   "' })).file);
  t.load((await drv({ V_TWO: 1 })).file);
  for (const name of ["DEMO", "SECOND", "OLDER"]) assert.equal(t.find(name).carry, 0, name);
  assert.deepEqual([0, 1, 2, 3].map((i) => t.nth(i).carry), [0, 0, 0, 1]);
});

test("a record whose end leaves the driver's pages is refused", async () => {
  const t = await machine();
  const page = t.word(6) >> 8;
  t.m.write((page << 8) + 9, page - 1); // past the end: a table's high byte the check would accept
  t.poke(((page - 1) << 8) + 253, 0); // the record's link: the last
  const r = t.load((await drv({ V_END: 1 })).file);
  assert.deepEqual([r.carry, r.rc], [1, 1]);
  assert.equal(t.word(t.m.sym("REGHEAD")), 0);
});

test("enumerate returns the record itself and the generation", async () => {
  const t = await machine();
  t.load((await drv()).file);
  t.prompt();
  t.unload();
  t.load((await drv()).file);
  const n = t.nth(0);
  assert.equal(n.hl, t.word(t.m.sym("REGHEAD")));
  assert.equal(Buffer.from([2, 3, 4, 5].map((i) => t.m.read(n.hl + i))).toString(), "DEMO");
  assert.equal(n.a, 1, "one removal so far");
  assert.equal(t.find("DEMO").a, 1);
});

test("a file ending exactly at LOADTOP is whole", async () => {
  const t = await machine();
  assert.equal(t.load(good.file, 0x100 + good.file.length).carry, 0);
});

for (const [entry, at] of [[0, 0xfffe], [16, 46]]) {
  test(`the scan reaches the table's entry ${entry}`, async () => {
    const t = await machine();
    const r = t.load((await drv({ V_HOOK: 1, V_HOOKFAIL: 1, HOOKAT: at })).file);
    assert.deepEqual([r.carry, r.rc], [1, 2]);
  });
}

test("a chain of 255 records is taken and 256 is refused", async () => {
  const t = await machine();
  const r = t.load((await drv({ V_CHAIN: 1, CHAINB: 255, XTRA: 3400 })).file);
  assert.equal(r.carry, 0);
  assert.equal(t.nth(254).carry, 0);
  assert.equal(t.nth(255).carry, 1);
  const u = await machine();
  const s = u.load((await drv({ V_CHAIN: 1, CHAINB: 0, XTRA: 3400 })).file);
  assert.deepEqual([s.carry, s.rc], [1, 1]);
});

test("INIT returning 0 installs a driver with no services", async () => {
  const t = await machine();
  assert.equal(t.load((await drv({ V_NONE: 1 })).file).carry, 0);
  assert.notEqual(t.head(), 0);
  assert.equal(t.word(t.m.sym("REGHEAD")), 0);
  assert.equal(t.nth(0).carry, 1);
});

test("REMOVE calling ABIXCCP is refused, and UNLOAD goes on", async () => {
  const t = await machine();
  const d = await drv({ V_REMWIN: 1 });
  t.load(d.file);
  const base = t.head();
  t.prompt();
  t.unload();
  assert.equal(t.m.read(base + d.symbols.RESULT), 1, "the call returned carry");
  assert.equal(t.m.read(t.m.sym("CCPLVL")), 0);
  assert.equal(t.m.read(t.m.sym("DRVHEAD")), 0);
});

test("NAME.DRV installs, from a drive too; a file that won't read and a refused load go to BADCMD", async () => {
  const image = standardCard();
  const good2 = (await drv()).file;
  volume(image, "A").write("OK.DRV", good2);
  volume(image, "B").write("OK2.DRV", good2);
  volume(image, "A").write("FAIL.DRV", (await drv({ V_FAIL: 1 })).file);
  const t = bench(boot(image));
  const stub = t.word(6);
  assert.match(t.m.command("NONE.DRV"), /NONE\.DRV\?/);
  assert.match(t.m.command("FAIL.DRV"), /FAIL\.DRV\?/);
  assert.equal(t.word(6), stub);
  t.m.command("CCP");
  assert.match(t.m.command("OK.DRV"), /OK\.DRV\?/, "a level is refused");
  t.m.command("EXIT");
  assert.doesNotMatch(t.m.command("OK.DRV"), /\?/);
  assert.doesNotMatch(t.m.command("B:OK2.DRV"), /\?/);
  assert.equal(t.word(6), stub - 0x200);
});

test("DRIVERS lists each driver and its pages, the newest first, with none and after UNLOAD", async () => {
  const image = standardCard();
  volume(image, "A").write("OK.DRV", (await drv()).file);
  volume(image, "A").write("TWO.DRV", (await drv({ DRVNAME: '"TWO     "', XTRA: 300 })).file);
  const t = bench(boot(image));
  assert.doesNotMatch(t.m.command("DRIVERS"), /\?|DEMO/);
  t.m.command("OK.DRV");
  t.m.command("TWO.DRV");
  assert.match(t.m.command("DRIVERS"), /TWO 2\r\nDEMO 1\r\n/);
  t.m.command("UNLOAD");
  assert.match(t.m.command("DRIVERS"), /DRIVERS\r\r\nDEMO 1\r\n/);
});

test("a demonstration file is 60 bytes: a 25-byte header, 31 of image, 4 of relocation", async () => {
  const d = await drv();
  assert.deepEqual([d.file.length, DHLEN, d.image - DHLEN, d.data.length], [60, 25, 31, 4]);
});

test("a dependency's name over 8 bytes is refused by the writer", async () => {
  await assert.rejects(drv({}, { deps: [{ name: "TOOLONGNAME", version: 1 }] }), /at most 8 bytes/);
});

test("the relocation data decodes to the same fixups by delta, and a long gap takes 255s", () => {
  assert.deepEqual([...encoders.delta([2, 9])], [3, 7]);
  assert.deepEqual([...encoders.delta([600])], [255, 255, 91]);
  assert.deepEqual([...encoders.bitmap([0, 9], 16)], [0x80, 0x40]);
  assert.deepEqual([...encoders.offsets([513])], [1, 2]);
});

test("the table has no removal: function 2 is refused and the driver stays", async () => {
  const t = await machine();
  t.load((await drv()).file);
  assert.equal(t.call(t.m.sym("ABIDRV"), { b: 0, c: 2 }).carry, 1);
  assert.equal(t.find("DEMO").carry, 0);
});

test("warm boot keeps a driver, a nested level finds it and can't load, and a reset empties both", async () => {
  const t = await machine();
  const d = await drv();
  t.load(d.file);
  t.prompt();
  t.warmBoot();
  assert.equal(t.find("DEMO").carry, 0);
  t.prompt();
  t.m.command("CCP");
  assert.equal(t.find("DEMO").carry, 0, "a level sees what its parent sees");
  t.prompt();
  const refused = t.load(d.file);
  assert.deepEqual([refused.carry, refused.rc], [1, 0], "a level-1 load is refused");
  t.prompt();
  t.m.command("EXIT");
  t.m.reset();
  const from = t.m.output.length;
  t.m.expect(/A>$/, { from, maxCycles: 200_000_000 });
  assert.deepEqual([t.word(t.m.sym("REGHEAD")), t.m.read(t.m.sym("DRVHEAD"))], [0, 0]);
});

for (const [name, over] of [
  ["INIT fails cleanly", { V_FAIL: 1 }],
  ["a record outside the image", { V_WILD: 1 }],
  ["a link outside the image", { V_LINK: 1 }],
  ["a cyclic chain", { V_CYCLE: 1 }],
  ["an entry table outside the image", { V_TABLE: 1 }],
]) {
  test(`${name}: failed, and the state is as it was`, async () => {
    const t = await machine();
    const x = transaction(t, (await drv(over)).file);
    assert.deepEqual([x.r.carry, x.r.rc], [1, 1]);
    untouched(t, x);
    const top = t.word(6);
    t.prompt();
    t.warmBoot();
    assert.deepEqual([t.word(6), t.m.read(t.m.sym("CCPLVL"))], [top, 0]);
  });
}

test("INIT fails with a hook left: the pages stay, nothing is registered, UNLOAD refuses", async () => {
  const t = await machine();
  const x = transaction(t, (await drv({ V_HOOK: 1, V_HOOKFAIL: 1 })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 2]);
  const base = t.head();
  assert.notEqual(base, 0);
  assert.deepEqual([t.word(t.m.sym("PZTOP")), t.word(t.m.sym("REGHEAD"))], [base + 6, 0]);
  assert.equal(t.find("DEMO").carry, 1);
  t.prompt();
  assert.match(t.unload(), /UNLOAD\?/);
  t.warmBoot();
  assert.equal(t.word(t.m.sym("PZTOP")), base + 6, "warm boot keeps them");
});

test("INIT lies and REMOVE refuses: installed with no services, and the load says so", async () => {
  const t = await machine();
  const x = transaction(t, (await drv({ V_WILD: 1, V_REFUSE: 1 })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 2]);
  assert.equal(t.find("DEMO").carry, 1);
  assert.equal(t.word(t.m.sym("REGHEAD")), 0);
  assert.notEqual(t.head(), 0);
});

for (const [name, over, raw] of [
  ["ABIXCCP", { V_CCP: 1 }],
  ["ABIXCMD", { V_CMD: 1 }],
  ["a load", { V_LOAD: 1 }, ["RAWLOAD", "DRVLOAD"]],
  ["a removal", { V_UNL: 1 }, ["RAWUNL", "DRVUNL"]],
]) {
  test(`INIT calling ${name} is refused`, async () => {
    const t = await machine();
    t.load((await drv({ DRVNAME: '"FIRST   "', SVCNAME: '"FIRST   "' })).file);
    const d = await drv(over, raw ? { raw: { [raw[0]]: t.m.sym(raw[1]) } } : {});
    assert.equal(t.load(d.file).carry, 0);
    assert.equal(t.m.read(t.head() + d.symbols.RESULT), 1, "the call returned carry");
    assert.equal(t.m.read(t.m.sym("CCPLVL")), 0);
    assert.equal(t.find("FIRST").carry, 0, "the driver below stays");
  });
}

test("no client can see a service while its INIT runs", async () => {
  const t = await machine();
  const d = await drv({ V_PROBE: 1 });
  t.load(d.file);
  assert.equal(t.m.read(t.head() + d.symbols.RESULT), 1, "find returned carry inside INIT");
  assert.equal(t.find("DEMO").carry, 0);
});

test("a warm boot inside INIT rolls the ceiling back", async () => {
  const t = await machine();
  const before = snapshot(t.m);
  const ceiling = t.word(6) & 0xff00;
  const [top, pztop] = [t.word(6), t.word(t.m.sym("PZTOP"))];
  assert.equal(t.load((await drv({ V_WB: 1 })).file).back, false);
  t.m.runUntil(() => t.m.waitingForInput(), 200_000_000, "the prompt");
  assert.deepEqual([t.word(6), t.word(t.m.sym("PZTOP")), t.m.read(t.m.sym("CCPLVL"))], [top, pztop, 0]);
  assert.deepEqual(changed(t.m, before, snapshot(t.m), ceiling, ["load", "command"]), []);
});

test("a warm boot inside INIT after a hook leaves it dangling, which is why hooks go last", async () => {
  const t = await machine();
  const top = t.word(6);
  t.load((await drv({ V_HOOK: 1, V_WB: 1 })).file);
  t.m.runUntil(() => t.m.waitingForInput(), 200_000_000, "the prompt");
  assert.equal(t.word(6), top);
  assert.ok(t.word(t.m.sym("RAMBIOS") + 13) < top, "CONOUT points below the ceiling");
});

test("a dependency absent is refused and nothing changes", async () => {
  const t = await machine();
  const x = transaction(t, (await client()).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 0]);
  untouched(t, x);
});

test("a dependency below the least version is refused", async () => {
  const t = await machine();
  t.load((await drv({ SVCVER: 1 })).file);
  const r = t.load((await client()).file);
  assert.deepEqual([r.carry, r.rc], [1, 0]);
});

test("a dependency present is bound at INIT, and last in is first out", async () => {
  const t = await machine();
  t.load((await drv()).file);
  const c = await client();
  assert.equal(t.load(c.file).carry, 0);
  const bound = t.word(t.head() + c.symbols.DEPTAB);
  t.prompt();
  t.unload();
  assert.equal(t.find("CLIENT").carry, 1);
  assert.equal(t.find("DEMO").hl, bound);
  t.prompt();
  t.unload();
  assert.equal(t.find("DEMO").carry, 1);
});

test("two drivers offering one service: the newest, and removal uncovers the older", async () => {
  const t = await machine();
  t.load((await drv()).file);
  const older = t.find("DEMO").hl;
  t.load((await drv({ SVCVER: 3, DRVNAME: '"NEWER   "' })).file);
  assert.notEqual(t.find("DEMO").hl, older);
  t.prompt();
  t.unload();
  assert.equal(t.find("DEMO").hl, older);
});

for (const [name, over] of [["REMOVE refuses", { V_REFUSE: 1 }], ["not removable", { FLAGS: 0 }]]) {
  test(`${name}: UNLOAD says so and changes nothing`, async () => {
    const t = await machine();
    t.load((await drv(over)).file);
    t.prompt();
    const before = snapshot(t.m);
    const ceiling = t.word(6) & 0xff00;
    assert.match(t.unload(), /UNLOAD\?/);
    assert.deepEqual(changed(t.m, before, snapshot(t.m), ceiling, ["load", "command"]), []);
  });
}

for (const [i, field] of [[0, "STKB"], [1, "STKI"], [2, "STKC"]]) {
  test(`${field}: past its limit refused, at it installed, and a second past the sum refused`, async () => {
    const t = await machine();
    const limit = t.m.read(t.m.sym("DRVLIM") + i);
    const x = transaction(t, (await drv({ [field]: limit + 1 })).file);
    assert.deepEqual([x.r.carry, x.r.rc], [1, 0]);
    untouched(t, x);
    assert.equal(t.load((await drv({ [field]: limit })).file).carry, 0);
    const sum = t.load((await drv({ [field]: 1 })).file);
    assert.deepEqual([sum.carry, sum.rc], [1, 0]);
  });
}

test("the scan can't see a GLVEC-style vector: INIT failed, pages freed, the vector left", async () => {
  const t = await machine({ tms: true, matrix: true });
  const x = transaction(t, (await drv({ V_GLVEC: 1 })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 1]);
  assert.notEqual(t.word(t.m.sym("GLVEC")), 0);
  assert.deepEqual(x.differs(), [t.m.sym("GLVEC").toString(16), (t.m.sym("GLVEC") + 1).toString(16)]);
});

test("a program that makes a link a cycle can't loop find or enumerate", async () => {
  const t = await machine();
  t.load((await drv()).file);
  const rec = t.word(t.m.sym("REGHEAD"));
  t.poke(rec, rec);
  const f = t.find("ABSENT");
  assert.deepEqual([f.back, f.carry], [true, 1]);
  assert.equal(t.nth(255).back, true);
});

test("a resident that keeps a pointer past removal runs into freed pages, and the generation tells it", async () => {
  const t = await machine();
  const late = await drv({ V_LATE: 1, DRVNAME: '"LATE    "', SVCNAME: '"LATE    "' });
  t.load(late.file);
  const table = t.find("LATE").hl;
  const demo = await drv();
  t.load(demo.file);
  t.call(table);
  const kept = t.find("DEMO").hl;
  t.prompt();
  t.unload();
  assert.ok(t.word(6) > kept, "the pages are the TPA's");
  assert.equal(t.call(table + 3).a, 1, "the stale bytes still run");
  assert.equal(t.m.read((kept & 0xff00) + demo.symbols.COUNT), 1, "and write the TPA");
  t.put(kept, [0xc3, 0, 0]);
  assert.equal(t.call(table + 3).back, false, "a program's bytes run: here a warm boot");
  t.prompt();
  assert.equal(t.call(table + 6).carry, 1, "the checked call refuses");
});

test("a source naming a ROM address is refused; abi.inc's names pass", () => {
  assert.throws(() => checkInterfaces("        CALL    $C025\n", "raw.asm"), /ROM address \$C025/);
  assert.throws(() => checkInterfaces("        CALL    0C025h\n", "raw.asm"), /ROM address 0C025h/);
  assert.doesNotThrow(() => checkInterfaces("        CALL    ABIDRV ; not $C025\n", "ok.asm"));
});

// Malformed files, each changing one thing in a good file.
const good = await drv();
const S = good.image;
const edit = (fn) => {
  const f = Uint8Array.from(good.file);
  fn(f, new DataView(f.buffer));
  return f;
};
const u16 = (at, v) => edit((_, d) => d.setUint16(at, v, true));
const top = 0xb8; // (0006h)'s page on the card in standardCard()
const extraFor = (n) => n - S;
const MALFORMED = [
  ["the file shorter than its header", good.file.slice(0, 16), 0x110],
  ["a wrong magic", edit((f) => (f[0] = 0x45))],
  ["format version 2, whose driver reads the font at ABIFONT", edit((f) => (f[1] = 2))],
  ["the image size overflowing the address space", u16(6, 0xff80)],
  ["the image size past the file", u16(6, 0x4000)],
  ["the image size below the header", u16(6, 24)],
  ["image and extra overflowing", u16(8, 0xfff0)],
  ["a dependency list past the file", edit((f) => (f[2] = 200))],
  ["the relocation size past the file", u16(10, 0x1000)],
  ["the relocation size overflowing", u16(10, 0xfff0)],
  ["a fixup past the image", edit((f) => { f[S] = 200; f[S + 1] = 200; })],
  ["a fixup one byte past the image", edit((f) => { f[S] = S - DHLEN + 1; f[10] = 1; })],
  ["INIT before the image", u16(15, 24)],
  ["INIT at the image's end", u16(15, S)],
  ["INIT far outside", u16(15, 0xc000)],
  ["REMOVE before the image", u16(4, 3)],
  ["REMOVE at the image's end", u16(4, S)],
  ["a base below 8000h", u16(8, extraFor(((top - 0x80) << 8) + 1))],
];
test("18 malformed files, each field", () => assert.equal(MALFORMED.length, 18));
for (const [name, file, end] of MALFORMED) {
  test(`refused, nothing changed: ${name}`, async () => {
    const t = await machine();
    assert.equal(t.word(6) >> 8, top);
    const x = transaction(t, file, end);
    assert.deepEqual([x.r.carry, x.r.rc], [1, 0]);
    untouched(t, x);
  });
}

test("accepted at the edge: a base of exactly 8000h", async () => {
  const t = await machine();
  assert.equal(t.load(u16(8, extraFor((top - 0x80) << 8))).carry, 0);
});

// With its other fixups gone INIT's record is wild, so these reach INIT and
// fail there, past every refusal.
test("accepted at the edge: a fixup on the image's last byte", async () => {
  const t = await machine();
  assert.equal(t.load(edit((f) => { f[S] = S - DHLEN; f[10] = 1; })).rc, 1);
});

test("accepted at the edge: INIT on the image's last byte, a RET", async () => {
  const t = await machine();
  const r = t.load(edit((f, d) => { d.setUint16(15, S - 1, true); f[S - 1] = 0xc9; }));
  assert.notEqual(r.rc, 0, "past every refusal, and INIT ran");
});

test("slack past the file's end is tolerated", async () => {
  const t = await machine();
  for (let i = 0; i < 128; i += 1) t.m.write(0x100 + good.file.length + i, 0x1a);
  assert.equal(t.load(good.file).carry, 0);
});

// The stack: a driver as the console, each table routine using nothing, or six
// bytes, of its caller's stack. From a driver's first instruction until control
// is back outside above that SP, the deepest it goes, per stack.
function entries(m, lo, hi) {
  const s = (n) => m.sym(n);
  const stacks = { bdos: [s("STKBASE"), s("STKTOP")], ccp: [s("CSTKBAS"), s("CSTKTOP")], bios: [s("BSTKB"), s("BSTK")] };
  const use = { bdos: 0, ccp: 0, bios: 0, other: 0 };
  let open = null;
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    const sp = m.cpu.cpu.sp & 0xffff;
    const inside = pc >= lo && pc < hi;
    if (!open && inside) {
      const k = Object.keys(stacks).find((n) => sp >= stacks[n][0] && sp <= stacks[n][1]) ?? "other";
      open = { k, sp, low: sp, range: stacks[k] };
    } else if (open) {
      if ((inside || sp <= open.sp) && (!open.range || (sp >= open.range[0] && sp <= open.range[1]))) open.low = Math.min(open.low, sp);
      if (!inside && sp > open.sp) {
        use[open.k] = Math.max(use[open.k], open.sp - open.low);
        open = null;
      }
    }
    return step();
  };
  return use;
}

async function stackRun(depth, declared) {
  const m = new Machine({ ...romFor("debug80"), sdImage: standardCard(), clock: TEST_CLOCK, tms: false, matrix: true });
  m.mark = 0;
  m.expect(/A>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.waitingForInput(), 10_000_000, "the prompt");
  const t = bench(m);
  const d = await drv({ V_STK: 1, DEPTH: depth, STKB: declared, STKI: declared, STKC: declared });
  const ceiling = t.word(6) & 0xff00;
  const use = entries(m, ceiling - Math.ceil(d.image / 256) * 256, ceiling);
  assert.equal(t.load(d.file).carry, 0);
  t.prompt();
  m.write(m.sym("CONDEV"), m.read(m.sym("CONDEV")) | 4); // a GLCD answered
  m.type("CON UC1\r");
  m.runUntil(() => m.read(3) % 4 === 3 && m.waitingForInput(), 200_000_000, "CON UC1");
  m.cpu.cpu.pc = 0; // a warm boot, on the BIOS's stack
  m.runUntil(() => m.waitingForInput(), 200_000_000, "warm boot");
  m.typeMatrix("DIR\r"); // on the BDOS's
  m.runUntil(() => m.waitingForInput(), 200_000_000, "DIR");
  return { bdos: use.bdos, bios: use.bios, ccp: use.ccp };
}

test("each declared stack figure is proved by the watch, and a false one fails it", async () => {
  assert.deepEqual(await stackRun(0, 0), { bdos: 0, bios: 0, ccp: 2 }, "INIT's call to ABIGLCD");
  const used = await stackRun(1, 6);
  assert.deepEqual(used, { bdos: 6, bios: 6, ccp: 6 }, "declared 6 on each");
  assert.deepEqual(await stackRun(1, 2), used, "the ROM can't check what a file declares");
  assert.ok(Object.values(used).some((u) => u > 2), "a declaration of 2 fails");
});
