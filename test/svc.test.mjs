// Services and the registry: SVCDEMO and its variants, loaded as the
// shell will load them, by the loader's symbol with the file in the TPA. Each
// failure compares the whole state before and after, by name: page zero,
// every resident page and the workspace, less the buffers listed in ranges().
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { checkInterfaces, DHLEN, encoders, makeSvc, onDisk } from "../tools/lib/svc.mjs";
import { Machine } from "./lib/machine.mjs";
import { ROOT, TEST_CLOCK, boot, fcbType, romFor, standardCard, volume } from "./lib/fixtures.mjs";

const STUB = 0x0060; // JR $, where a call comes back
const VARIANTS = ["V_FAIL", "V_PROBE", "V_LOAD", "V_UNL", "V_GLVEC", "V_HOOK", "V_HOOKFL", "V_VEC", "V_VECX", "V_VECFL", "V_CHI", "V_CHR", "V_CHN", "V_WB", "V_REMWB", "V_STK", "V_DEP", "V_WILD", "V_LINK", "V_CYCLE", "V_TABLE", "V_NONE", "V_REFUSE", "V_LATE", "V_END", "V_CHAIN", "V_REMWIN", "V_LONG", "V_TWO", "V_HANG"];
const made = new Map();

/** SVCDEMO with OVER set; opt as makeSvc's. */
async function svc(over = {}, opt = {}) {
  const key = JSON.stringify([over, opt]);
  if (!made.has(key)) {
    const defs = { ...Object.fromEntries(VARIANTS.map((v) => [v, 0])), VECAT: 8, FLAGS: 1, XTRA: 0, STKB: 0, STKI: 0, STKC: 0, DEPTH: 0, HOOKAT: 10, CHAINB: 1, HDRNAME: '"DEMO    "', RECNAME: '"DEMO    "', RECVER: 2, ...over };
    made.set(key, await makeSvc(resolve(ROOT, "test/programs/svcdemo.asm"), { defs, work: resolve(ROOT, "build/svc"), ...opt }));
  }
  return made.get(key);
}
const client = (over = {}) => svc({ V_DEP: 1, HDRNAME: '"CLIENT  "', RECNAME: '"CLIENT  "', ...over }, { deps: [{ name: "DEMO", version: 2 }] });

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
  const entry = () => assert.ok(word(6) === word(m.sym("STUBAD")) || (word(6) & 0xff) === 0, "(0006h) is the stub or a page's start");
  const load = (file, end) => {
    put(0x100, [...file]);
    poke(m.sym("LOADTOP"), end ?? 0x100 + Math.ceil(file.length / 128) * 128);
    const r = { ...call(m.sym("SVCLOAD")), rc: m.read(m.sym("SVCRC")) };
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
    return call(m.sym("ABICALL"), { b: least, c: 13, d: 3, e: 0 });
  };
  const nth = (i) => call(m.sym("ABICALL"), { b: i, c: 14 });
  const head = () => m.read(m.sym("SVCHEAD")) << 8;
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
      SLN: [s("SLN"), s("SLN") + 2],
      SLDL: [s("SLDL"), s("SLDL") + 1],
      "SVCRC and SVCRA": [s("SVCRC"), s("SVCRA") + 1],
      LOADBUF: [s("LOADBUF"), s("LOADBUF") + 128],
    },
    // A command typed, or a warm boot: what any disk read and console line change.
    command: {
      "the CCP's and BDOS's state and stacks": [s("CCPRAM"), s("BDOSRME")],
      "the BIOS stack": [s("BSTKB"), s("BSTK")],
      "the BIOS's block state": [s("DSKCUR"), s("DRVTAB")],
      DIRBUF: [s("DIRBUF"), s("DIRBUF") + 128],
      LOGINV: [s("LOGINV"), s("LOGINV") + 2],
      "the SD and cache state": [s("SDBYTE"), s("KBMASK")],
      "the keyboard's scan": [s("KBMASK"), s("GLVEC")],
      "the terminal's cursor and parser": [s("VROW"), s("VCURV") + 1],
      "RXFULL and RXCHAR": [s("RXFULL"), s("RXCHAR") + 1],
      HHEAD: [s("HHEAD"), s("HHEAD") + 1],
      "XMDST to MVREST": [s("XMDST"), s("MVREST") + 2],
      LINEBUF: [s("LINEBUF"), s("LINEBUF") + 80],
      "the mount scratch": [s("MNTCNT"), s("LINEBUF")],
      // KS32: cleared as each command is taken, FF00h after an error.
      PRGCODE: [s("PRGCODE"), s("PRGCODE") + 2],
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

for (const width of [80, 40, 32]) {
  test(`${width} columns: a service installs, is found and enumerated, is called and unloads, leaving everything as it was`, async () => {
  const t = await machine({ width });
  const d = await svc();
  const before = snapshot(t.m);
  const ceiling = t.word(6) & 0xff00;
  const stub = t.word(6);
  assert.equal(t.load(d.file).carry, 0);
  const base = t.head();
  assert.equal(t.word(6), base, "(0006h) is the page's start");
  assert.equal(t.word(t.m.sym("PZTOP")), base);
  assert.equal(t.m.read(base), 0xc3);
  assert.equal(t.word(base + 1), t.m.sym("BENTRY"), "the JP is straight into the BDOS");
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
  assert.equal(t.m.read(t.m.sym("SVCGEN")), 1, "the generation is raised");
  const gen = t.m.sym("SVCGEN");
  assert.deepEqual(changed(t.m, before, snapshot(t.m), ceiling, ["load", "command"], { SVCGEN: [gen, gen + 1] }), []);
  assert.deepEqual(t.m.violations, []);
  });
}

test("a load refused by the window reports refused", async () => {
  const t = await machine();
  assert.equal(t.load((await svc({ V_FAIL: 1 })).file).rc, 1);
  t.m.write(t.m.sym("SVCBSY"), 0x80);
  const r = t.load((await svc()).file);
  assert.deepEqual([r.carry, r.rc], [1, 0]);
  t.m.write(t.m.sym("SVCBSY"), 0);
});

test("every image byte is its file's, and only the fixups gain the page, across gaps of 255 and more", async () => {
  const t = await machine();
  const d = await svc({ V_LONG: 1 });
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
  const two = await svc({ V_DEP: 1, HDRNAME: '"CLIENT  "', RECNAME: '"CLIENT  "' }, { deps });
  const t = await machine();
  t.load((await svc()).file);
  const x = transaction(t, two.file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 0], "the second is absent");
  untouched(t, x);
  t.load((await svc({ HDRNAME: '"OTHER   "', RECNAME: '"OTHER   "', RECVER: 1 })).file);
  assert.equal(t.load(two.file).carry, 0);
  assert.equal(t.find("CLIENT").carry, 0);
});

test("the older registry follows a service's last record, so every record stays found", async () => {
  const t = await machine();
  t.load((await svc({ RECNAME: '"OLDER   "' })).file);
  t.load((await svc({ V_TWO: 1 })).file);
  for (const name of ["DEMO", "SECOND", "OLDER"]) assert.equal(t.find(name).carry, 0, name);
  assert.deepEqual([0, 1, 2, 3].map((i) => t.nth(i).carry), [0, 0, 0, 1]);
});

test("a record whose end leaves the service's pages is refused", async () => {
  const t = await machine();
  const page = t.word(6) >> 8;
  t.m.write((page << 8) + 9, page - 1); // past the end: a table's high byte the check would accept
  t.poke(((page - 1) << 8) + 253, 0); // the record's link: the last
  const r = t.load((await svc({ V_END: 1 })).file);
  assert.deepEqual([r.carry, r.rc], [1, 1]);
  assert.equal(t.word(t.m.sym("REGHEAD")), 0);
});

test("enumerate returns the record itself and the generation", async () => {
  const t = await machine();
  t.load((await svc()).file);
  t.prompt();
  t.unload();
  t.load((await svc()).file);
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
    const r = t.load((await svc({ V_HOOK: 1, V_HOOKFL: 1, HOOKAT: at })).file);
    assert.deepEqual([r.carry, r.rc], [1, 2]);
  });
}

test("a chain of 255 records is taken and 256 is refused", async () => {
  const t = await machine();
  const r = t.load((await svc({ V_CHAIN: 1, CHAINB: 255, XTRA: 3400 })).file);
  assert.equal(r.carry, 0);
  assert.equal(t.nth(254).carry, 0);
  assert.equal(t.nth(255).carry, 1);
  const u = await machine();
  const s = u.load((await svc({ V_CHAIN: 1, CHAINB: 0, XTRA: 3400 })).file);
  assert.deepEqual([s.carry, s.rc], [1, 1]);
});

// KE-AR4: the registry, the ROM console's PICO record with the services', holds
// at most 256 records, all that TNFIND walks; a service that would pass that is
// refused. Counted by walking REGHEAD's links, since TNLIST's index is a byte.
const picoBoard = async () => bench(boot(standardCard(), { tms: true, matrix: true }));
function registry(t) {
  const names = [];
  for (let at = t.word(t.m.sym("REGHEAD")); at && names.length < 600; at = t.word(at)) names.push(String.fromCharCode(...Array.from({ length: 8 }, (_, k) => t.m.read(at + 2 + k))).trimEnd());
  return names;
}
const chain = (n) => svc({ V_CHAIN: 1, CHAINB: n, XTRA: 13 * n });

test("the registry at 256 records: PICO is the last and TNFIND finds it (KE-AR4)", async () => {
  const t = await picoBoard();
  assert.deepEqual(registry(t), ["PICO"]);
  assert.equal(t.load((await chain(128)).file).carry, 0);
  assert.equal(t.load((await chain(127)).file).carry, 0, "255 loaded records beside PICO");
  const names = registry(t);
  assert.deepEqual([names.length, names[255]], [256, "PICO"]);
  assert.equal(t.find("PICO").carry, 0, "PICO found");
});

test("a service whose records would take the registry past 256 is refused, and the registry works after (KE-AR4)", async () => {
  const t = await picoBoard();
  assert.equal(t.load((await chain(128)).file).carry, 0);
  const top = t.word(6);
  const r = t.load((await chain(128)).file);
  assert.deepEqual([r.carry, r.rc], [1, 1], "refused, REMOVE undoing INIT");
  assert.equal(t.word(6), top, "its pages given back");
  const names = registry(t);
  assert.deepEqual([names.length, names[128]], [129, "PICO"]);
  assert.equal(t.find("PICO").carry, 0, "TNFIND: PICO");
  assert.equal(t.nth(0).carry, 0, "TNLIST: the first service's newest");
  assert.equal(t.nth(128).carry, 0, "TNLIST: the last, PICO");
  assert.equal(t.nth(129).carry, 1, "TNLIST: past it");
  t.prompt();
  assert.doesNotMatch(t.unload(), /UNLOAD\?/);
  assert.deepEqual(registry(t), ["PICO"], "UNLOAD took the first service's records");
  assert.equal(t.load((await chain(1)).file).carry, 0, "and another loads");
  assert.equal(t.find("PICO").carry, 0);
});

test("INIT returning 0 installs a service with no records", async () => {
  const t = await machine();
  assert.equal(t.load((await svc({ V_NONE: 1 })).file).carry, 0);
  assert.notEqual(t.head(), 0);
  assert.equal(t.word(t.m.sym("REGHEAD")), 0);
  assert.equal(t.nth(0).carry, 1);
});

test("REMOVE calling the removal by its ROM address is refused, and UNLOAD goes on", async () => {
  const t = await machine();
  const d = await svc({ V_REMWIN: 1 }, { raw: { RAWUNL: t.m.sym("SVCUNL") } });
  t.load(d.file);
  const base = t.head();
  t.prompt();
  t.unload();
  assert.equal(t.m.read(base + d.symbols.RESULT), 1, "the call returned carry");
  assert.equal(t.m.read(t.m.sym("SVCBSY")), 0);
  assert.equal(t.m.read(t.m.sym("SVCHEAD")), 0);
});

test("NAME.SVC installs, from a drive too; a file that won't read and a refused load go to BADCMD", async () => {
  const image = standardCard();
  const good2 = (await svc()).file;
  volume(image, "A").write("OK.SVC", good2);
  volume(image, "B").write("OK2.SVC", good2);
  volume(image, "A").write("FAIL.SVC", (await svc({ V_FAIL: 1 })).file);
  const t = bench(boot(image));
  const stub = t.word(6);
  assert.match(t.m.command("NONE.SVC"), /NONE\.SVC\?/);
  assert.equal(fcbType(t.m), "SVC", "the loader's path, not the COM path's");
  assert.match(t.m.command("FAIL.SVC"), /FAIL\.SVC\?/);
  assert.equal(t.m.read(t.m.sym("SVCRC")), 1, "INIT ran and failed");
  assert.equal(t.word(6), stub);
  assert.doesNotMatch(t.m.command("OK.SVC"), /\?/);
  assert.doesNotMatch(t.m.command("B:OK2.SVC"), /\?/);
  assert.equal(t.word(6), (stub & 0xff00) - 0x200);
});

test("an old NAME.DRV is no service: the COM path says NAME.DRV? with nothing loaded", async () => {
  const image = standardCard();
  volume(image, "A").write("OK.DRV", (await svc()).file);
  const m = boot(image);
  assert.match(m.command("OK.DRV"), /OK\.DRV\?/);
  assert.equal(m.read(m.sym("SVCHEAD")), 0, "nothing loaded");
});

test("SERVICES lists each service and its pages, the newest first, with none and after UNLOAD", async () => {
  const image = standardCard();
  volume(image, "A").write("OK.SVC", (await svc()).file);
  volume(image, "A").write("TWO.SVC", (await svc({ HDRNAME: '"TWO     "', XTRA: 300 })).file);
  const t = bench(boot(image));
  assert.doesNotMatch(t.m.command("SERVICES"), /\?|DEMO/);
  t.m.command("OK.SVC");
  t.m.command("TWO.SVC");
  assert.match(t.m.command("SERVICES"), /TWO 2\r\nDEMO 1\r\n/);
  t.m.command("UNLOAD");
  assert.match(t.m.command("SERVICES"), /SERVICES\r\r\nDEMO 1\r\n/);
});

test("a demonstration file is 60 bytes: a 25-byte header, 31 of image, 4 of relocation", async () => {
  const d = await svc();
  assert.deepEqual([d.file.length, DHLEN, d.image - DHLEN, d.data.length], [60, 25, 31, 4]);
});

test("a dependency's name over 8 bytes is refused by the writer", async () => {
  await assert.rejects(svc({}, { deps: [{ name: "TOOLONGNAME", version: 1 }] }), /at most 8 bytes/);
});

test("the relocation data decodes to the same fixups by delta, and a long gap takes 255s", () => {
  assert.deepEqual([...encoders.delta([2, 9])], [3, 7]);
  assert.deepEqual([...encoders.delta([600])], [255, 255, 91]);
  assert.deepEqual([...encoders.bitmap([0, 9], 16)], [0x80, 0x40]);
  assert.deepEqual([...encoders.offsets([513])], [1, 2]);
});

test("the table has no removal: function 2 is refused and the service stays", async () => {
  const t = await machine();
  t.load((await svc()).file);
  assert.equal(t.call(t.m.sym("ABICALL"), { b: 0, c: 16 }).carry, 1); // past the last, TNFONT
  assert.equal(t.find("DEMO").carry, 0);
});

test("warm boot keeps a service, and a reset empties both", async () => {
  const t = await machine();
  const d = await svc();
  t.load(d.file);
  t.prompt();
  t.warmBoot();
  assert.equal(t.find("DEMO").carry, 0);
  t.prompt();
  t.m.reset();
  const from = t.m.output.length;
  t.m.expect(/A>$/, { from, maxCycles: 200_000_000 });
  assert.deepEqual([t.word(t.m.sym("REGHEAD")), t.m.read(t.m.sym("SVCHEAD"))], [0, 0]);
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
    const x = transaction(t, (await svc(over)).file);
    assert.deepEqual([x.r.carry, x.r.rc], [1, 1]);
    untouched(t, x);
    const top = t.word(6);
    t.prompt();
    t.warmBoot();
    assert.deepEqual([t.word(6), t.m.read(t.m.sym("SVCBSY"))], [top, 0]);
  });
}

test("INIT fails with a hook left: the pages stay, nothing is registered, UNLOAD refuses", async () => {
  const t = await machine();
  const x = transaction(t, (await svc({ V_HOOK: 1, V_HOOKFL: 1 })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 2]);
  const base = t.head();
  assert.notEqual(base, 0);
  assert.deepEqual([t.word(t.m.sym("PZTOP")), t.word(t.m.sym("REGHEAD"))], [base, 0]);
  assert.equal(t.find("DEMO").carry, 1);
  t.prompt();
  assert.match(t.unload(), /UNLOAD\?/);
  t.warmBoot();
  assert.equal(t.word(t.m.sym("PZTOP")), base, "warm boot keeps them");
});

test("INIT lies and REMOVE refuses: installed with no records, and the load says so", async () => {
  const t = await machine();
  const x = transaction(t, (await svc({ V_WILD: 1, V_REFUSE: 1 })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 2]);
  assert.equal(t.find("DEMO").carry, 1);
  assert.equal(t.word(t.m.sym("REGHEAD")), 0);
  assert.notEqual(t.head(), 0);
});

for (const [name, over, raw] of [
  ["a load", { V_LOAD: 1 }, ["RAWLOAD", "SVCLOAD"]],
  ["a removal", { V_UNL: 1 }, ["RAWUNL", "SVCUNL"]],
]) {
  test(`INIT calling ${name} is refused`, async () => {
    const t = await machine();
    t.load((await svc({ HDRNAME: '"FIRST   "', RECNAME: '"FIRST   "' })).file);
    const d = await svc(over, raw ? { raw: { [raw[0]]: t.m.sym(raw[1]) } } : {});
    assert.equal(t.load(d.file).carry, 0);
    assert.equal(t.m.read(t.head() + d.symbols.RESULT), 1, "the call returned carry");
    assert.equal(t.m.read(t.m.sym("SVCBSY")), 0);
    assert.equal(t.find("FIRST").carry, 0, "the service below stays");
  });
}

test("no client can see a record while its INIT runs", async () => {
  const t = await machine();
  const d = await svc({ V_PROBE: 1 });
  t.load(d.file);
  assert.equal(t.m.read(t.head() + d.symbols.RESULT), 1, "find returned carry inside INIT");
  assert.equal(t.find("DEMO").carry, 0);
});

test("a warm boot inside INIT rolls the ceiling back", async () => {
  const t = await machine();
  const before = snapshot(t.m);
  const ceiling = t.word(6) & 0xff00;
  const [top, pztop] = [t.word(6), t.word(t.m.sym("PZTOP"))];
  assert.equal(t.load((await svc({ V_WB: 1 })).file).back, false);
  t.m.runUntil(() => t.m.waitingForInput(), 200_000_000, "the prompt");
  assert.deepEqual([t.word(6), t.word(t.m.sym("PZTOP")), t.m.read(t.m.sym("SVCBSY"))], [top, pztop, 0]);
  assert.deepEqual(changed(t.m, before, snapshot(t.m), ceiling, ["load", "command"]), []);
  assert.equal(t.load((await svc()).file).carry, 0, "the guard is down: a load works");
  t.prompt();
  t.unload();
  assert.deepEqual([t.word(6), t.m.read(t.m.sym("SVCHEAD"))], [top, 0], "and UNLOAD works");
});

test("a warm boot from inside REMOVE clears the guard, the service stays, and a later load works", async () => {
  const t = await machine();
  assert.equal(t.load((await svc({ V_REMWB: 1 })).file).carry, 0);
  const page = t.head();
  const top = t.word(6);
  t.prompt();
  t.m.mark = t.m.output.length;
  t.m.type("UNLOAD\r");
  t.m.runUntil(() => t.m.ready() && /[A-P]>$/.test(t.m.text(t.m.mark)), 200_000_000, "the prompt after a warm boot");
  assert.deepEqual([t.m.read(t.m.sym("SVCBSY")), t.head(), t.word(6)], [0, page, top], "the guard down and the service in");
  assert.equal(t.load((await svc({ HDRNAME: '"SECOND  "', RECNAME: '"SECOND  "' })).file).carry, 0);
  assert.equal(t.word(6), top - ((await svc({ HDRNAME: '"SECOND  "', RECNAME: '"SECOND  "' })).image + 255 >> 8) * 256);
});

test("a warm boot inside INIT after a hook leaves it dangling, which is why hooks go last", async () => {
  const t = await machine();
  const top = t.word(6);
  t.load((await svc({ V_HOOK: 1, V_WB: 1 })).file);
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
  t.load((await svc({ RECVER: 1 })).file);
  const r = t.load((await client()).file);
  assert.deepEqual([r.carry, r.rc], [1, 0]);
});

test("a dependency present is bound at INIT, and last in is first out", async () => {
  const t = await machine();
  t.load((await svc()).file);
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

test("two services publishing one record: the newest, and removal uncovers the older", async () => {
  const t = await machine();
  t.load((await svc()).file);
  const older = t.find("DEMO").hl;
  t.load((await svc({ RECVER: 3, HDRNAME: '"NEWER   "' })).file);
  assert.notEqual(t.find("DEMO").hl, older);
  t.prompt();
  t.unload();
  assert.equal(t.find("DEMO").hl, older);
});

for (const [name, over] of [["REMOVE refuses", { V_REFUSE: 1 }], ["not removable", { FLAGS: 0 }]]) {
  test(`${name}: UNLOAD says so and changes nothing`, async () => {
    const t = await machine();
    t.load((await svc(over)).file);
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
    const limit = t.m.read(t.m.sym("SVCLIM") + i);
    const x = transaction(t, (await svc({ [field]: limit + 1 })).file);
    assert.deepEqual([x.r.carry, x.r.rc], [1, 0]);
    untouched(t, x);
    assert.equal(t.load((await svc({ [field]: limit })).file).carry, 0);
    const sum = t.load((await svc({ [field]: 1 })).file);
    assert.deepEqual([sum.carry, sum.rc], [1, 0]);
  });
}

test("the scan can't see a GLVEC-style vector: INIT failed, pages freed, the vector left", async () => {
  const t = await machine({ tms: true, matrix: true });
  const x = transaction(t, (await svc({ V_GLVEC: 1 })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 1]);
  assert.notEqual(t.word(t.m.sym("GLVEC")), 0);
  assert.deepEqual(x.differs(), [t.m.sym("GLVEC").toString(16), (t.m.sym("GLVEC") + 1).toString(16)]);
});

test("a program that makes a link a cycle can't loop find or enumerate", async () => {
  const t = await machine();
  t.load((await svc()).file);
  const rec = t.word(t.m.sym("REGHEAD"));
  t.poke(rec, rec);
  const f = t.find("ABSENT");
  assert.deepEqual([f.back, f.carry], [true, 1]);
  assert.equal(t.nth(255).back, true);
});

test("a resident that keeps a pointer past removal runs into freed pages, and the generation tells it", async () => {
  const t = await machine();
  const late = await svc({ V_LATE: 1, HDRNAME: '"LATE    "', RECNAME: '"LATE    "' });
  t.load(late.file);
  const table = t.find("LATE").hl;
  const demo = await svc();
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
  assert.doesNotThrow(() => checkInterfaces("        CALL    ABICALL ; not $C025\n", "ok.asm"));
});

// Malformed files, each changing one thing in a good file.
const good = await svc();
const S = good.image;
const edit = (fn) => {
  const f = Uint8Array.from(good.file);
  fn(f, new DataView(f.buffer));
  return f;
};
const u16 = (at, v) => edit((_, d) => d.setUint16(at, v, true));
const top = 0xb9; // (0006h)'s page on the card in standardCard()
const extraFor = (n) => n - S;
const MALFORMED = [
  ["the file shorter than its header", good.file.slice(0, 16), 0x110],
  ["a wrong magic", edit((f) => (f[0] = 0x45))],
  ["format version 2, whose service reads the font at ABIFONT", edit((f) => (f[1] = 2))],
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

// The stack: a service as the console, each table routine using nothing, or six
// bytes, of its caller's stack. From a service's first instruction until control
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
  const d = await svc({ V_STK: 1, DEPTH: depth, STKB: declared, STKI: declared, STKC: declared });
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
  assert.deepEqual(await stackRun(0, 0), { bdos: 0, bios: 0, ccp: 6 }, "INIT's call to TNDRVR, through the dispatcher");
  const used = await stackRun(1, 6);
  assert.deepEqual(used, { bdos: 6, bios: 6, ccp: 6 }, "declared 6 on each");
  assert.deepEqual(await stackRun(1, 2), used, "the ROM can't check what a file declares");
  assert.ok(Object.values(used).some((u) => u > 2), "a declaration of 2 fails");
});

for (const label of ["INIT", "REMOVE"]) {
  test(`makeSvc stops at a source with no ${label}, as TAS does`, async () => {
    const dir = mkdtempSync(resolve(ROOT, "build/svc-"));
    const text = readFileSync(resolve(ROOT, "test/programs/res.asm"), "utf8").replace(new RegExp(`^${label}:`, "m"), `X${label}:`);
    const path = resolve(dir, "NOLAB.asm");
    writeFileSync(path, text);
    await assert.rejects(makeSvc(path, { work: dir }), /INIT and REMOVE required/);
    rmSync(dir, { recursive: true });
  });
}

// Restart vectors. The sweep keeps a jump at or above the top's page, at warm
// boot, after an unload and after a failed INIT; a declared slot that holds a
// jump refuses the load.
const slot = (m, at) => Array.from({ length: 8 }, (_, i) => m.read(at + i));
const DEFAULT = [0, 0, 0, 0, 0, 0, 0, 0xc9];
const DEFAULT38 = [0xfb, 0xed, 0x4d, 0, 0, 0, 0, 0];
const jp = (a) => [0xc3, a & 0xff, a >> 8];
const pokes = (t, at, bytes) => bytes.forEach((b, i) => t.m.write(at + i, b));

test("a jump into a service is kept over warm boot, and RST 38h reaches a kept 0038h", async () => {
  const t = await machine();
  const d = await svc({ V_VEC: 1, VECAT: 0x38, FLAGS: 0x81 });
  assert.equal(t.load(d.file).carry, 0);
  t.prompt();
  const base = t.head();
  t.warmBoot();
  assert.deepEqual(slot(t.m, 0x38), [...jp(base + d.symbols.VHAND), 0, 0, 0, 0, 0]);
  t.put(0x300, [0xff, 0xc9]);
  assert.equal(t.call(0x300).back, true);
  assert.equal(t.m.read(base + d.symbols.RESULT), 0x5a);
});

test("the bound: a jump at or below the top goes, and one above it stays", async () => {
  const t = await machine();
  t.load((await svc()).file);
  t.prompt();
  const page = t.head() >> 8;
  pokes(t, 0x10, jp((page << 8) - 1));
  pokes(t, 0x18, jp(page << 8));
  pokes(t, 0x20, jp((page << 8) + 1));
  t.warmBoot();
  assert.deepEqual(slot(t.m, 0x10), DEFAULT);
  assert.deepEqual(slot(t.m, 0x18), DEFAULT);
  assert.deepEqual(slot(t.m, 0x20), [...jp((page << 8) + 1), 0, 0, 0, 0, 0]);
});

test("the bound with no service: a jump into the stub's page below the stub goes", async () => {
  const t = await machine();
  const stub = t.word(t.m.sym("STUBAD"));
  pokes(t, 0x10, jp(stub - 1));
  pokes(t, 0x18, jp(stub));
  pokes(t, 0x20, jp(stub + 3));
  t.warmBoot();
  assert.deepEqual(slot(t.m, 0x10), DEFAULT);
  assert.deepEqual(slot(t.m, 0x18), DEFAULT);
  assert.deepEqual(slot(t.m, 0x20), [...jp(stub + 3), 0, 0, 0, 0, 0]);
});

test("UNLOAD gives a vector into its pages and a slot it declared their defaults, and reports success", async () => {
  const t = await machine();
  t.load((await svc({ V_VEC: 1, VECAT: 0x10, FLAGS: 0x05 })).file);
  t.prompt();
  const hw = t.m.sym("ABICALL");
  pokes(t, 0x20, jp(hw)); // undeclared, outside its pages: REMOVE's to restore
  pokes(t, 0x10, jp(hw)); // declared: goes whatever it holds
  assert.doesNotMatch(t.unload(), /UNLOAD\?/);
  assert.deepEqual(slot(t.m, 0x10), DEFAULT);
  assert.deepEqual(slot(t.m, 0x20), [...jp(hw), 0, 0, 0, 0, 0]);
});

test("a vector into freed pages goes at UNLOAD with no declaration", async () => {
  const t = await machine();
  t.load((await svc({ V_VEC: 1, VECAT: 0x38 })).file);
  t.prompt();
  assert.doesNotMatch(t.unload(), /UNLOAD\?/);
  assert.deepEqual(slot(t.m, 0x38), DEFAULT38);
});

test("a failed INIT's vector goes with its pages", async () => {
  const t = await machine();
  const r = t.load((await svc({ V_VEC: 1, V_VECFL: 1 })).file);
  assert.deepEqual([r.carry, r.rc], [1, 1]);
  assert.deepEqual(slot(t.m, 8), DEFAULT);
});

test("a failed INIT's claimed slot goes, even with a jump outside its pages, so a retry loads", async () => {
  const t = await machine();
  const r = t.load((await svc({ V_VEC: 1, V_VECX: 1, V_VECFL: 1, FLAGS: 3 })).file);
  assert.deepEqual([r.carry, r.rc], [1, 1]);
  assert.deepEqual(slot(t.m, 8), DEFAULT);
  assert.equal(t.load((await svc({ V_VEC: 1, FLAGS: 3 })).file).carry, 0);
});

test("a warm boot inside INIT takes the vector it set", async () => {
  const t = await machine();
  assert.equal(t.load((await svc({ V_VEC: 1, V_WB: 1 })).file).back, false);
  t.m.runUntil(() => t.m.waitingForInput(), 200_000_000, "the prompt");
  assert.deepEqual(slot(t.m, 8), DEFAULT);
});

test("a second claim is refused with nothing changed", async () => {
  const t = await machine();
  t.load((await svc({ V_VEC: 1, FLAGS: 3 })).file);
  const x = transaction(t, (await svc({ V_VEC: 1, FLAGS: 3, HDRNAME: '"SECOND  "', RECNAME: '"SECOND  "' })).file);
  assert.deepEqual([x.r.carry, x.r.rc], [1, 0]);
  assert.deepEqual(x.differs(), []);
});

test("a claim on a free slot installs, and format 3's flags of 1 claim nothing", async () => {
  const t = await machine();
  t.poke(0x10, 0);
  assert.equal(t.load((await svc({ FLAGS: 0xfe })).file).carry, 0);
  t.prompt();
  const held = await machine();
  pokes(held, 0x08, jp(held.m.sym("ABICALL")));
  assert.equal(held.load((await svc({ FLAGS: 1 })).file).carry, 0);
});

test("a service with a vector is gone at a recognised reset, and the vector with it", async () => {
  const image = standardCard();
  volume(image, "A").write("VEC.SVC", (await svc({ V_VEC: 1, VECAT: 0x10, FLAGS: 5 })).file);
  const m = boot(image);
  m.command("VEC.SVC");
  assert.equal(m.read(0x10), 0xc3);
  m.reset();
  m.expect(/A>$/, { from: m.output.length, maxCycles: 200_000_000 });
  assert.deepEqual(slot(m, 0x10), DEFAULT);
  assert.equal(m.read(m.sym("SVCHEAD")), 0);
});

// Nothing a service needs lies below (0006h).
for (const opts of [{}, { tms: true, matrix: true }]) {
  test(`a program setting SP from (0006h) leaves SERVICES and UNLOAD working, ${opts.tms ? "PICO" : "serial"}`, async () => {
    const image = standardCard();
    const a = volume(image, "A");
    a.write("ONE.SVC", (await svc({ HDRNAME: '"ONE     "', RECNAME: '"ONE     "' })).file);
    a.write("TWO.SVC", (await svc({ HDRNAME: '"TWO     "', RECNAME: '"TWO     "' })).file);
    a.write("KEEP.SVC", (await svc({ FLAGS: 0, HDRNAME: '"KEEP    "', RECNAME: '"KEEP    "' })).file);
    // LD HL,(0006h); LD SP,HL; LD HL,FFFFh; PUSH HL three times; JP 0
    a.write("SMASH.COM", Uint8Array.from([0x2a, 6, 0, 0xf9, 0x21, 0xff, 0xff, 0xe5, 0xe5, 0xe5, 0xc3, 0, 0]));
    const m = boot(image, opts);
    const say = (line) => {
      m.mark = m.output.length;
      if (m.videoConsole()) m.typeMatrix(`${line.toLowerCase()}\r`);
      else m.type(`${line}\r`);
      m.runUntil(() => m.waitingForInput() && /[A-P]>$/.test(m.text(m.mark)), 400_000_000, line);
      return m.text(m.mark);
    };
    say("ONE.SVC");
    say("TWO.SVC");
    const top = m.read(6) | (m.read(7) << 8);
    say("SMASH");
    assert.equal(m.read(top - 1), 0xff, "the six bytes below (0006h) are the program's");
    if (opts.tms) {
      assert.equal(m.videoConsole(), true, "the ROM's PICO9918 console");
      say("SERVICES");
      assert.match(m.screen().join("\n"), /TWO +\d+\s+ONE +\d+\s+A>/, "the loaded two alone: the ROM's console is no service");
    } else assert.match(say("SERVICES"), /TWO +\d+\r\nONE +\d+\r\n/);
    assert.doesNotMatch(say("UNLOAD"), /UNLOAD\?/);
    assert.doesNotMatch(say("UNLOAD"), /UNLOAD\?/);
    say("KEEP.SVC");
    say("SMASH");
    assert.match(say("UNLOAD"), /UNLOAD\?/, "not removable, and refused as it should be");
    assert.deepEqual(m.violations, []);
  });
}

test("a BDOS call is two jumps from CALL 5, with no service, one and two", async () => {
  const t = await machine();
  const entry = t.m.sym("BENTRY");
  const count = () => {
    t.put(0x300, [0x0e, 12, 0xcd, 5, 0, 0xc9]); // function 12, CALL 5, RET
    const c = t.m.cpu.cpu;
    t.poke(t.m.sym("CSTKTOP") - 2, STUB);
    Object.assign(c, { sp: t.m.sym("CSTKTOP") - 2, pc: 0x300 });
    const seen = [];
    while (t.m.pc !== entry) {
      if (t.m.pc !== 0x300 && t.m.pc !== 0x302) seen.push(t.m.pc);
      t.m.step();
    }
    t.m.runUntil(() => t.m.pc === STUB, 1_000_000, "the return");
    return seen;
  };
  assert.deepEqual(count(), [5, t.word(t.m.sym("STUBAD"))]);
  t.load((await svc({ HDRNAME: '"ONE     "', RECNAME: '"ONE     "' })).file);
  assert.deepEqual(count(), [5, t.head()]);
  t.load((await svc({ HDRNAME: '"TWO     "', RECNAME: '"TWO     "' })).file);
  assert.deepEqual(count(), [5, t.head()]);
});

// KB-21: function 47 from INIT or REMOVE is a warm boot there, as any other.
test("function 47 from INIT rolls the load back, and the chained line runs", async () => {
  const t = await machine();
  const top = t.word(6);
  assert.equal(t.load((await svc({ V_CHI: 1, V_CHN: 1 })).file).back, false);
  t.m.runUntil(() => t.m.waitingForInput() && t.m.read(4) >> 4 === 3, 200_000_000, "USER 3");
  assert.deepEqual([t.word(6), t.m.read(t.m.sym("SVCBSY")), t.m.read(t.m.sym("SVCHEAD"))], [top, 0, 0]);
  assert.equal(t.load((await svc()).file).carry, 0, "the guard is down");
});

test("function 47 from REMOVE keeps the service listed, and the chained line runs", async () => {
  const t = await machine();
  t.load((await svc({ V_CHR: 1, V_CHN: 1 })).file);
  t.prompt();
  const page = t.head();
  t.m.mark = t.m.output.length;
  t.m.type("UNLOAD\r");
  t.m.runUntil(() => t.m.waitingForInput() && t.m.read(4) >> 4 === 3, 200_000_000, "USER 3");
  assert.deepEqual([t.m.read(t.m.sym("SVCBSY")), t.head()], [0, page]);
});

test("makeSvc finds an include whatever its case, as CP/M and TAS do: ABI.INC is abi.inc (B2)", async () => {
  assert.equal(onDisk(resolve(ROOT, "drivers"), "../SRC/ABI.INC"), resolve(ROOT, "src/abi.inc"));
  assert.equal(onDisk(resolve(ROOT, "drivers"), "../src/abi.inc"), resolve(ROOT, "src/abi.inc"), "an exact spelling as it is");
  const dir = mkdtempSync(resolve(ROOT, "build/svc-case-"));
  const text = readFileSync(resolve(ROOT, "test/programs/res.asm"), "utf8").replace("        ORG     $0100", `%INCLUDE "${relative(dir, resolve(ROOT, "src")).toUpperCase().replace(/\\/g, "/")}/ABI.INC"\n        ORG     $0100`);
  writeFileSync(resolve(dir, "res.asm"), text);
  const { file } = await makeSvc(resolve(dir, "res.asm"), { work: resolve(dir, "work") });
  assert.equal(file[0], 0x44, "built");
  rmSync(dir, { recursive: true });
});
