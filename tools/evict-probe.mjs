// Prototype probe for the service-evict model: the starter card's services
// evicted for EVBIG.COM, which overwrites the whole TPA, and brought back
// at the prompt. Prints figures; asserts nothing. node tools/evict-probe.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, boot, program, volume } from "../test/lib/fixtures.mjs";
import { owners, word } from "../test/lib/shell.mjs";

const EVBIG = (await program("evbig")).bytes;
const CLOCK = 4_000_000;
const ms = (cycles) => Math.round((cycles * 1000) / CLOCK);
const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");

function card() {
  const image = new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img")));
  volume(image, "A").write("EVBIG.COM", EVBIG);
  return image;
}

const STACKS = { BDOS: ["STKBASE", "STKTOP"], BIOS: ["BSTKB", "BSTK"], CCP: ["CSTKBAS", "CSTKTOP"] };

/** Watch the three ROM stacks: lay() starts a reading, depth() gives the deepest write since. */
function watch(m) {
  const ranges = Object.entries(STACKS).map(([n, [lo, hi]]) => [n, m.sym(lo), m.sym(hi)]);
  let low = {};
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    const pc = m.cpu.cpu.pc;
    const ldir = (m.read(pc) === 0xed && m.read(pc + 1) === 0xb0) || (m.read(pc - 1) === 0xed && m.read(pc) === 0xb0);
    if (!ldir) for (const [n, b, t] of ranges) if (addr >= b && addr < t && addr < low[n]) low[n] = addr;
    write(addr, value);
  };
  m.lay = () => { low = Object.fromEntries(ranges.map(([n, , t]) => [n, t])); };
  m.depth = () => Object.fromEntries(ranges.map(([n, , t]) => [n, t - low[n]]));
  m.lay();
}

const state = (m) => ({
  top: hex(word(m, 6)),
  tpa: word(m, 6) - 0x100,
  owners: owners(m).map((o) => `${o.name}@${o.page.toString(16)}`).join(" "),
  shell: hex(word(m, m.sym("SHOWN"))),
  iobyte: m.read(3),
  conmod: m.read(m.sym("CONMOD")),
  evn: m.read(m.sym("EVN")),
});

/**
 * Type LINE and run to the next ready prompt. The cycles in all, and from
 * the program's exit, the first warm boot after it started at 0100h, to
 * that prompt.
 */
function run(m, line, max = 900_000_000) {
  const start = m.cycles;
  let began = 0;
  let exit = 0;
  const wboot = m.sym("WBOOTR");
  m.mark = m.output.length;
  m.type(`${line}\r`);
  m.runUntil(() => {
    if (m.pc === 0x100) {
      began = m.cycles;
      exit = 0;
    } else if (m.pc === wboot && began && !exit) exit = m.cycles;
    return m.ready();
  }, max, `the prompt after ${line}`);
  return { text: m.text(m.mark), total: m.cycles - start, afterExit: exit ? m.cycles - exit : null, toStart: began ? began - start : null };
}

function scenario(name, opts, steps) {
  console.log(`\n== ${name}`);
  const m = boot(card(), opts);
  watch(m);
  console.log("boot", JSON.stringify(state(m)));
  for (const step of steps) {
    m.lay();
    const r = run(m, step);
    console.log(JSON.stringify(step), JSON.stringify({ ...state(m), totalMs: ms(r.total), toStartMs: r.toStart && ms(r.toStart), afterExitMs: r.afterExit && ms(r.afterExit), stacks: m.depth() }));
    console.log("   ", JSON.stringify(r.text));
  }
  console.log("violations", JSON.stringify(m.violations));
  return m;
}

const which = process.argv[2] ?? "all";
if (which === "all" || which === "serial") scenario("serial board: SHELL.SVC only", {}, ["EVBIG", "EVICT EVBIG", "EVICT EVBIG J", "EVICT EVBIG", "EVBIG"]);
if (which === "all" || which === "glcd") scenario("GLCD and matrix keyboard: SHELL.SVC and GLCD.SVC", { matrix: true }, ["EVBIG", "EVICT EVBIG", "EVBIG"]);
if (which === "all" || which === "pico") scenario("PICO9918 and matrix keyboard", { matrix: true, tms: true }, ["EVBIG", "EVICT EVBIG", "EVBIG"]);
