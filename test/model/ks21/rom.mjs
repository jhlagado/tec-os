// KS21's choice 3: the stage's ROM bytes, from cache.asm assembled with the
// product's symbols, and a lookup's T-states, from CLOOK run in EXPAND 1's
// table on the 96K harness.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRODUCT, WORK, assemble, call, fixtures, machine as harness } from "../ks20/lib.mjs";
import { HERE } from "./here.mjs";

// Names the sketch needs that today's ROM doesn't have: the workspace bytes
// it adds (in EXPAND 0's unused top page) and today's code it calls by a new
// label, stood in for here.
const NEW = { CDIRTY: 0xbf60, CNEXT: 0xbf64, CWBD: 0xbf65, CFAIL: 0xbf66, CSKIP: 0xbf67, BRSERV: 0xc000, BWTODAY: 0xc000, HWBUF: 0xbf68 };
const ROM = ["SDLBA", "LATCHV", "LATEXP", "SYSLAT", "XMDST", "MVCOPY", "BLKBUF", "BUFOK", "SDWRITE", "BLKSLOT", "DSKDMA", "GETBLK", "GETBLKW", "DSKERR", "DSKCUR", "PUTS"];

async function build(symbols, org) {
  const hex = (v) => `$${v.toString(16).toUpperCase().padStart(4, "0")}`;
  const val = (n) => symbols.get(n) ?? { LATEXP: 0x04, SYSLAT: 0xff }[n];
  const inc = [...ROM.map((n) => `${n.padEnd(8)}EQU     ${hex(val(n))}`), ...Object.entries(NEW).map(([n, v]) => `${n.padEnd(8)}EQU     ${hex(v)}`)].join("\n");
  const src = resolve(WORK, `ks21-cache-${org.toString(16)}.asm`);
  writeFileSync(src, readFileSync(resolve(HERE, "cache.asm"), "utf8").replace("; ROM EQUS", inc).replace("        ORG     $C000", `        ORG     ${hex(org)}`));
  return assemble.assembleProgram(src, { base: org });
}

export async function romModel(copy) {
  const { symbols } = fixtures.romFor();
  const { symbols: s } = await build(symbols, 0xc000);
  const sketch = s.CEND - s.CLOOK;
  // The calls today's code gains: BREAD and BWRITE into the cache (6 each),
  // warm boot and cold boot (3 each), MOUNT and the unmount (6 each), and
  // the BLOCK service (5).
  const hooks = 6 + 6 + 3 + 3 + 6 + 6 + 5;
  // A lookup, timed: CLOOK at 6000h, the table in EXPAND 1.
  const { bytes, symbols: t } = await build(symbols, 0x6000);
  const m = fixtures.boot(fixtures.standardCard(), { ram96: true });
  bytes.forEach((v, i) => m.write(0x6000 + i, v));
  const table = 0xbc00 - 0x8000;
  const lookup = (at) => {
    m.expand[1].fill(0xff, table, table + 30 * 4);
    const lba = 0x00012345;
    [0, 1, 2, 3].forEach((k) => m.write(m.sym("SDLBA") + k, (lba >> (8 * k)) & 0xff));
    if (at >= 0) [0, 1, 2, 3].forEach((k) => (m.expand[1][table + at * 4 + k] = (lba >> (8 * k)) & 0xff));
    const r = call(m, t.CLOOK);
    return at < 0 ? { t: r.t } : { t: r.t, found: r.a === at };
  };
  const look = { miss: lookup(-1), hitFirst: lookup(0), hitMiddle: lookup(15), hitLast: lookup(29) };
  harness.EXPAND1_WRITES.splice(0);
  const free = (() => {
    const d8 = JSON.parse(readFileSync(resolve(PRODUCT, "build/debug80/tecos.d8.json"), "utf8"));
    const a = (n) => d8.symbols.find((x) => x.name === n).address;
    return a("ABITAB") - a("CODEEND");
  })();
  const u8 = copy.loopBytes.u8 + 12; // with its dispatch from MVCOPY for 512-byte copies
  return {
    sketchBytes: sketch,
    hookBytes: hooks,
    stageBytes: sketch + hooks,
    withUnrolledCopy: sketch + hooks + u8,
    freeBelowFF00: free,
    leftAfter: free - sketch - hooks,
    leftAfterWithUnrolled: free - sketch - hooks - u8,
    workspaceBytes: 8,
    lookup: look,
  };
}
