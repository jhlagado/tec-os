#!/usr/bin/env node
// Executable CCP alternatives. Production source is never patched: every
// variant is a fresh archive of BASE under build/ccp-model, assembled by ATOM.
// Run the whole command under Origo's shared memory guard, MODEL_JOBS=1.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";
import { ROOT, tree, build, rom, patch } from "./lib/model.mjs";
import { Machine } from "../host/machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";

const BASE = "304d268";
const WORK = resolve(ROOT, "build/ccp-calls-model");
const outPath = process.argv[2] ?? resolve(WORK, "figures.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ccp = "src/cpm/ccp.asm";
const edit = (dir, from, to) => patch(dir, ccp, from, to);

function descriptor(dir) {
  const path = resolve(dir, ccp);
  let source = readFileSync(path, "utf8"), calls = 0, tails = 0;
  source = source.replace(/^[ \t]*LD[ \t]+C,(\d+)[^\n]*\n[ \t]*(CALL|JP)[ \t]+(CPSRC|CPDST)/gm, (_, fn, op, dest) => {
    op === "JP" ? tails++ : calls++;
    return `        CALL    DOSSEQ\n        DB      ${`${fn}*2+${dest === "CPDST" ? 1 : 0}`}${op === "JP" ? "\n        RET" : ""}`;
  });
  assert.equal(calls, 21); assert.equal(tails, 1);
  const old = `CPSRC:
        LD      DE,CMDFCB
        JP      BDOS
CPDST:
        LD      DE,RENFCB
        JP      BDOS`;
  assert.ok(source.includes(old));
  source = source.replace(old, `DOSSEQ:
        EX      (SP),HL
        LD      C,(HL)
        INC     HL
        EX      (SP),HL
        SRL     C
        LD      DE,CMDFCB
        JP      NC,BDOS
        LD      DE,RENFCB
        JP      BDOS`);
  writeFileSync(path, source);
}
function startupControls(r) {
  const entry=r.symbols.get("DOSSEQ"), start=r.symbols.get("STBOOT")-0xc000, end=r.symbols.get("STBDMA")-0xc000;
  const sites=[];
  for(let i=start;i<end-3;i++) if(r.image[i]===0xcd && r.image[i+1]===(entry&255) && r.image[i+2]===(entry>>8)) sites.push(i);
  assert.equal(sites.length,2,"both startup calls are encoded");
  return ["return-byte","FCB-selector","function"].map((mutation)=>{
    const image=Uint8Array.from(r.image);
    if(mutation==="return-byte") image[entry-0xc000+2]=0;
    else image[sites[0]+3]=mutation==="FCB-selector"?31:38;
    let error; try {boot({...r,image});} catch(e) {
      const missingStartup=e.code==="ERR_ASSERTION" && e.expected instanceof RegExp && ["USER 3","USER 0"].includes(e.expected.source);
      const guestStop=/^(CPU halted at [0-9a-f]+ before |no (first prompt|output matching) within )/.test(e.message);
      if(!missingStartup && !guestStop) throw e; // host/tool failures never qualify a mutant
      error=String(e.message);
    }
    assert.ok(error,`${mutation} must distinguish actual startup execution`);
    return {mutation,callSite:sites[0]+0xc000,detected:true,error};
  });
}

const variants = { incumbent() {}, descriptor };

function descriptorContract(r, mutation) {
  const failures = [], cycleClasses = [new Set(),new Set()];
  for (let d = 0; d < 256; d++) {
    const memory = new Uint8Array(65536).fill(0xa5);
    memory.set(r.image, 0xc000);
    const entry = r.symbols.get("DOSSEQ");
    if (mutation === "return-byte") { assert.equal(memory[entry + 2], 0x23); memory[entry + 2] = 0; }
    if (mutation === "function") { assert.equal(memory[entry + 4], 0xcb); memory[entry + 4] = 0; memory[entry + 5] = 0; }
    if (mutation === "FCB-selector") { assert.equal(memory[entry + 9], 0xd2); memory[entry + 9] = 0xda; }
    memory[0x2100] = d; memory[0x3ffe] = 0; memory[0x3fff] = 0x21;
    const m = createZ80Runtime({ memory, startAddress: entry }, 0, {read:()=>255,write(){}});
    Object.assign(m.cpu, {pc:entry,sp:0x3ffe,h:0x67,l:0x89,b:0x5a,c:0xa7,a:0x3c});
    let n=0,cycles=0;
    while(m.cpu.pc !== r.symbols.get("BDOS")) { assert.ok(++n<20); cycles+=m.step().cycles; }
    cycleClasses[d&1].add(cycles);
    const actual=m.hardware.memory, fcb=r.symbols.get(d & 1 ? "RENFCB":"CMDFCB");
    let good=m.cpu.sp===0x3ffe && m.cpu.h===0x67 && m.cpu.l===0x89 && m.cpu.b===0x5a && m.cpu.a===0x3c && m.cpu.c===(d>>1) && (m.cpu.d<<8|m.cpu.e)===fcb && actual[0x3ffe]===1 && actual[0x3fff]===0x21 && actual[0x3ffd]===0xa5;
    // A stubbed BDOS return isolates the descriptor ABI: no instruction in
    // the dispatcher may alter the handler's flags or return registers.
    actual[r.symbols.get("BDOS")]=0xc9;
    m.cpu.a=0x91; m.cpu.h=0x42; m.cpu.l=0x37;
    const flags=JSON.stringify(m.cpu.flags);
    m.step();
    good &&= m.cpu.pc===0x2101 && m.cpu.sp===0x4000 && m.cpu.a===0x91 && m.cpu.h===0x42 && m.cpu.l===0x37 && JSON.stringify(m.cpu.flags)===flags;
    if(!good) failures.push(d);
  }
  return {cases:256,mismatches:failures.length,dispatcherCycles:cycleClasses.map(x=>[...x])};
}

function corpus() {
  const cases = new Set(["", " ", "A:", "P:", "Q:", "@:", "A=", ".TXT", "*.*", "A*.T*", "ABCDEFGH.XYZ", "ABCDEFGHI.XYZ", "A.XYZZ", "A".repeat(127), "A." + "B".repeat(125)]);
  for (const n of [0, 1, 7, 8, 9, 16]) for (const e of [0, 1, 2, 3, 4, 8])
    for (const d of ["", "A:", "P:", "Q:"]) cases.add(d + "A".repeat(n) + "." + "B".repeat(e));
  for (const b of Array.from({ length: 256 }, (_, n) => n)) {
    const c = String.fromCharCode(b);
    for (const form of [c + "X.T", "X" + c + ".T", "X." + c, "ABCDEFGH" + c + "Q", "X.ABC" + c + "Q"])
      cases.add(form);
  }
  for (const name of ["*", "A*", "ABCDEFG*", "ABCDEFGH*", "ABCDEFGHI*", "?", "A?", "????????"])
    for (const tail of ["", ".TXT", "!X", "=OLD", " X", ".*TAIL"]) cases.add(name + tail);
  return [...cases];
}

function parserRead(r, input, at) {
  const memory = new Uint8Array(65536).fill(0xa5);
  memory.set(r.image, 0xc000);
  memory.set(Buffer.from(input + "\0", "latin1"), 0x2000);
  memory[0x3ffe] = 0; memory[0x3fff] = 0x30;
  const m = createZ80Runtime({ memory, startAddress: r.symbols.get("PARSEFCB") }, 0, { read: () => 255, write() {} });
  const actual = m.hardware.memory; // createZ80Runtime copies the input image
  Object.assign(m.cpu, { pc: r.symbols.get("PARSEFCB"), sp: 0x3ffe, h: 0x20, l: 0, d: at >> 8, e: at & 255, b: 0x5a, c: 0x69 });
  let cycles = 0, low = 0x3ffe, count = 0;
  while (m.cpu.pc !== 0x3000) {
    assert.ok(++count < 10000, `parser did not return: ${JSON.stringify(input)}`);
    cycles += m.step().cycles;
    low = Math.min(low, m.cpu.sp);
  }
  assert.equal(m.cpu.sp, 0x4000, "parser stack balanced");
  assert.equal(actual[at - 1], 0xa5, "FCB lower canary");
  assert.equal(actual[at + 36], 0xa5, "FCB upper canary");
  const state = { fcb: [...actual.slice(at, at + 36)], cursor: (m.cpu.h << 8 | m.cpu.l) - 0x2000, carry: m.cpu.flags.C };
  const hl = m.cpu.h << 8 | m.cpu.l;
  Object.assign(m.cpu, { pc: r.symbols.get("UNAMBIG"), sp: 0x3ffe, b: 0x3c, c: 0xa7 });
  count = 0;
  while (m.cpu.pc !== 0x3000) {
    assert.ok(++count < 1000, "UNAMBIG did not return");
    cycles += m.step().cycles;
    low = Math.min(low, m.cpu.sp);
  }
  assert.equal(m.cpu.sp, 0x4000, "UNAMBIG stack balanced");
  assert.equal(m.cpu.h << 8 | m.cpu.l, hl, "UNAMBIG preserves cursor");
  assert.equal(m.cpu.b << 8 | m.cpu.c, 0x3ca7, "UNAMBIG preserves BC");
  state.unambiguous = !m.cpu.flags.C;
  return { state, cycles, stack: 0x3ffe - low };
}

function volume(image, drive) {
  const info = parseContainer(image), v = findVolume(info, drive);
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
}
function observeFileCalls(m) {
  const trace = [], step = m.step.bind(m); let pending;
  m.step = () => {
    const c=m.cpu.cpu, sp=c.sp;
    if(pending && m.pc === pending.pc && sp === pending.sp+2) {
      trace.push({fn:pending.fn, fcb:pending.fcb, entryStack:pending.entryStack,
        result:{a:c.a,b:c.b,c:c.c,d:c.d,e:c.e,h:c.h,l:c.l,flags:{...c.flags}}}); pending=undefined;
    }
    const de=c.d<<8|c.e;
    if(m.pc===5 && [15,16,17,18,19,20,21,22,23].includes(c.c) && [m.sym("CMDFCB"),m.sym("RENFCB")].includes(de)) {
      assert.equal(pending,undefined,"no nested file BDOS call");
      pending={pc:m.read(sp)|(m.read(sp+1)<<8),sp,fn:c.c,fcb:de===m.sym("CMDFCB")?"source":"destination",entryStack:m.sym("CSTKTOP")-sp};
    }
    return step();
  };
  return trace;
}

function boot(r) {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G1M", label: "WORK", mount: "B" }]);
  const a = volume(image, "A");
  a.write("STARTUP.CMD", Buffer.from("USER 3\r\nUSER 0\r\n\x1a", "latin1"));
  a.write("HELLO.TXT", Buffer.from("hello\r\nworld\r\n\x1a"));
  a.write("SECOND.TXT", Buffer.from("second\r\n\x1a"));
  a.write("PROBE.COM", Uint8Array.of(0xc9));
  for (let n = 0; n < 4; n++) a.write(`F${n}.DAT`, Uint8Array.of(n)); // seven entries cross the six-column boundary
  const m = new Machine({ rom: r.image, symbols: r.symbols, sdImage: image, glcd: false, clock: new Date(2026, 0, 1) });
  const fileCalls=observeFileCalls(m);
  let bootPeak = 0; const step = m.step.bind(m);
  m.step = () => { const sp=m.cpu.cpu.sp; if(sp>=m.sym("CSTKBAS") && sp<=m.sym("CSTKTOP")) bootPeak=Math.max(bootPeak,m.sym("CSTKTOP")-sp); return step(); };
  m.expect(/A>$/, { from: 0, maxCycles: 80000000 });
  m.runUntil(() => m.ready(), 200000000, "first prompt");
  assert.equal(m.read(4)>>4,0); assert.match(m.text(0), /USER 3/); assert.match(m.text(0), /USER 0/);
  return { m, image, bootPeak, fileCalls, startup: m.text(0) };
}
const commands = [
  "", " ! ! ", ":", "USER 0!USER 1!:USER 0",
  "DIR", "TYPE HELLO.TXT", "DIR *.TXT", "TYPE ABCDEFGHI.TXT", "TYPE HELLO.TXTT", "TYPE *.TXT",
  "REN NEW.TXT=SECOND.TXT", "COPY HELLO.TXT B:", "TYPE B:HELLO.TXT", "ERA NEW.TXT", "DIR",
  "USER 15", "USER 16", "USER 0", "SAVE 0 ZERO.BIN", "DIR ZERO.BIN", "ERA ZERO.BIN",
  "B:", "PROBE A:FOO*.BAR BAZ.QUX", "A:", "CON TTY", "SERVICES", "UNLOAD", "DIRX",
  "DIR A B", "REN =HELLO.TXT", "COPY HELLO.TXT HELLO.TXT", "TYPE HELLO.TXT!DIR", "NOFILE!:DIR",
];
function sessions(r) {
  const { m, image, bootPeak, startup, fileCalls } = boot(r), rows = [], entries = [];
  let peak = 0;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100) entries.push({ page: [...Array(128).keys()].map((n) => m.read(0x80 + n)), fcbs: [...Array(36).keys()].map((n) => m.read(0x5c + n)), drive: m.read(0x50) });
    const sp = m.cpu.cpu.sp;
    if (sp >= m.sym("CSTKBAS") && sp <= m.sym("CSTKTOP")) peak = Math.max(peak, m.sym("CSTKTOP") - sp);
    return step();
  };
  for (const command of commands) {
    const before = m.cycles;
    const from = m.output.length;
    m.type(`${command}\r`);
    m.runUntil(() => m.ready() && m.read(m.sym("CHPOS")) === 0 && /[A-P]>$/.test(m.text(from)), 600000000, `final prompt after ${command}`);
    const output = m.text(from);
    for (let a = m.sym("STKGUARD"); a < m.sym("STKGUEND"); a++) assert.equal(m.read(a), 0xa5, `${command}: CCP stack guard`);
    rows.push({ command, output, driveUser: m.read(4), code: m.read(m.sym("PRGCODE")) | m.read(m.sym("PRGCODE") + 1) << 8, cycles: m.cycles - before });
  }
  m.cpu.cpu.pc = 0; m.runUntil(() => m.ready(), 200000000, "warm reboot flush");
  const files = ["A", "B"].map((drive) => ({ drive, files: volume(image, drive).list().map((f) => ({ ...f, bytesHash: sha(volume(image, drive).read(f.name)) })) }));
  assert.deepEqual(m.violations, []);
  const cold = new Machine({ rom: r.image, symbols: r.symbols, sdImage: image, glcd: false, clock: new Date(2026, 0, 1) });
  const coldOutput = cold.expect(/A>$/, { from: 0, maxCycles: 80000000 });
  cold.runUntil(() => cold.ready(), 200000000, "cold reopen");
  const reopened = cold.command("TYPE B:HELLO.TXT");
  assert.deepEqual(cold.violations, []);
  return { rows, entries, files, peak, bootPeak, startup, fileCalls, cardHash: sha(image), coldOutput, reopened };
}

mkdirSync(WORK, { recursive: true });
const selected = process.env.CCP_VARIANTS?.split(",") ?? Object.keys(variants);
assert.equal(selected[0], "incumbent", "the incumbent runs first");
assert.ok(selected.every((name) => name in variants), "every requested variant exists");
const cases = corpus(), figures = { baseline: BASE, runnerSha256: sha(readFileSync(new URL(import.meta.url))), selected, assembler: "atom-z80 0.3.7", commands, parserCases: cases.length * 2, variants: {} };
let baselineParsers, baselineSession;
for (const name of selected) {
  const change = variants[name];
  console.error(`CCP model: ${name}`);
  const dir = tree(WORK, name, BASE);
  change(dir);
  await build(dir);
  const r = rom(dir);
  if(name === "descriptor") {
    const contract = descriptorContract(r);
    assert.equal(contract.mismatches,0);
    const controls=["return-byte","FCB-selector","function"].map((mutation)=>({mutation,...descriptorContract(r,mutation)}));
    assert.ok(controls.every((c)=>c.mismatches>0));
    figures.descriptorContract={contract,controls,actualStartupControls:startupControls(r)};
    const at=r.symbols.get("DOSSEQ")-0xc000, bytes=r.image.slice(at,r.symbols.get("CPHEX")-0xc000);
    assert.equal(bytes.length,18);
    figures.account={callSites:21,tailSites:1,oldWrappers:12,newHelper:bytes.length,helperHex:Buffer.from(bytes).toString("hex"),callerBytesSaved:21,tailBytesSaved:0,netBytesSaved:15,
      listing:["EX (SP),HL","LD C,(HL)","INC HL","EX (SP),HL","SRL C","LD DE,CMDFCB","JP NC,BDOS","LD DE,RENFCB","JP BDOS"],
      note:"LD C,fn + CALL costs24T before old20T wrapper; CALL+descriptor uses17T before measured79/99T dispatcher. READSRC tail becomes CALL/DB/RET and adds2 live stack bytes at BDOS."};
  }
  const parserRows = cases.flatMap((input) => [0x2100, 0x21f8].map((at) => parserRead(r, input, at)));
  baselineParsers ??= parserRows;
  const mismatches = parserRows.flatMap((row, i) => JSON.stringify(row.state) === JSON.stringify(baselineParsers[i].state) ? [] : [i]);
  const result = {
    sha256: sha(r.image), rom: r.census.rom.used, ccp: r.symbols.get("BDOSBAS") - r.symbols.get("CCPBAS"),
    romRegions: r.census.rom.regions, ramRegions: r.census.ram.regions, stacks: r.census.ram.stacks,
    ram: r.census.ram.regions.find((x) => x.label === "CCP state and stack").bytes,
    tpa: r.census.ram.tpa.bytes, parser: { mismatches: mismatches.length, examples: mismatches.slice(0, 8).map((i) => cases[Math.floor(i / 2)]), cycles: parserRows.reduce((n, r) => n + r.cycles, 0), peak: Math.max(...parserRows.map((r) => r.stack)) },
  };
  const worst = parserRows.map((row, i) => ({ index: i, delta: row.cycles - baselineParsers[i].cycles })).sort((a, b) => b.delta - a.delta)[0];
  result.parser.worstCycleDelta = { input: cases[Math.floor(worst.index / 2)], cycles: worst.delta };
  result.outsideCcpBytes = result.rom - result.ccp;
  if (!name.startsWith("mutant")) {
    const session = sessions(r);
    baselineSession ??= session;
    const semantics = (s) => ({ fileCalls:s.fileCalls.map(({entryStack,...rest})=>rest), startup: s.startup, rows: s.rows.map(({ cycles, ...rest }) => rest), entries: s.entries, files: s.files, cardHash: s.cardHash, coldOutput: s.coldOutput, reopened: s.reopened });
    assert.deepEqual(semantics(session), semantics(baselineSession), `${name}: command session changed`);
    result.session = { equivalent: true, peak: session.peak, bootPeak: session.bootPeak, fileCalls:session.fileCalls, cycles: session.rows.map((row) => ({ command: row.command, cycles: row.cycles })) };
    assert.equal(mismatches.length, 0, `${name}: parser mismatch`);
  } else assert.ok(mismatches.length > 0, `${name} must be distinguished`);
  result.delta = result.rom - (figures.variants.incumbent?.rom ?? result.rom);
  figures.variants[name] = result;
  writeFileSync(outPath, JSON.stringify(figures, null, 2) + "\n");
}
console.log(JSON.stringify(figures, null, 2));
