// The ROM bytes that drivers' retirement frees, from the product's symbol
// map, and those the GLCD entry costs, from glcd-entry.asm assembled with
// the product's symbols.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HERE, PRODUCT, WORK, assemble, symbolOf } from "./lib.mjs";

export async function romModel() {
  const d8 = JSON.parse(readFileSync(resolve(PRODUCT, "build/debug80/tecos.d8.json"), "utf8"));
  const census = JSON.parse(readFileSync(resolve(PRODUCT, "build/debug80/census.json"), "utf8"));
  const symbols = new Map(d8.symbols.map((s) => [s.name.toUpperCase(), s.address ?? s.value]));
  const S = (n) => symbolOf(symbols, n);
  const span = (from, to) => S(to) - S(from);
  // CMDUNL: LD HL,(PZTOP) / LD L,0 / CALL PRLREM / JP NC,STARTED (11 bytes)
  // stay, then JP BADCMD (3) in place of the driver branch.
  const cmdunl = d8.symbols.filter((s) => s.address > S("CMDUNL")).sort((a, b) => a.address - b.address)[0].address - S("CMDUNL");
  const freed = {
    thunks: span("THK0", "DRVVEC"),
    drvvec: span("DRVVEC", "XCALL"),
    xcall: span("XCALL", "VXRDR"),
    rowWrappers: span("VXRDR", "GLCBOOT"),
    prlDriverLoad: span("PRLDRV", "PRLREL"),
    prlKindDispatch: 4, // DEC A / JP Z,PRLDRV in PRLGO
    unloadDriverBranch: cmdunl - 11 - 3,
  };
  // The image save: CCPIN's 18 bytes before its image code stay (the saved
  // SP, PRLN, the flag and the level check), and XEXIT's 20 before its
  // restore (the level check and the record read back).
  const imageSave = {
    ccpinImage: span("CCPIN", "CI2") - 18,
    xexitRestore: span("XEXIT", "XE1") - 20,
    allocator: span("XALLOC", "XMOVE"),
    meminitAlloc: 5, // LD A,2 / CALL XALLOC: the levels' and history's pages are fixed
  };
  Object.assign(freed, imageSave);
  const freedTotal = Object.values(freed).reduce((a, b) => a + b, 0);

  const hex = (v) => `$${v.toString(16).toUpperCase().padStart(4, "0")}`;
  const inc = [`GLVEC   EQU     ${hex(S("DRVPG"))}`, ...["LINEBUF", "CONDEV", "TMSVEC", "VIDSET", "SERCON"].map((n) => `${n.padEnd(8)}EQU     ${hex(S(n))}`)].join("\n");
  const src = resolve(WORK, "glcd-entry.asm");
  writeFileSync(src, readFileSync(resolve(HERE, "glcd-entry.asm"), "utf8").replace("; ROM EQUS", inc));
  const { symbols: es } = await assemble.assembleProgram(src, { base: 0xc000 });
  const entry = es.GLHEND - es.GLHOOK;
  const refusal = es.CCPIME - es.CCPIMG;
  const table = es.TABEND - 0xff25;

  return {
    romAtBaseline: { used: census.rom.used, free: census.rom.free, belowFF00: S("ABITAB") - S("CODEEND") },
    freed,
    freedTotal,
    cost: { entry, imageRefusal: refusal, tableEntry: table, conswChange: 0 },
    netBelowFF00: freedTotal - entry - refusal,
    netWithTable: freedTotal - entry - refusal - table,
    notCounted: "MOVE's bank-1 path stays: with XMARK 80h its range check refuses every bank-1 copy",
    expand1ReservedPage: { callTable: 16, xsp: 2, transferBuffer: 80, driverStack: 128, total: 226 },
    workspace: "DRVPG and DRVNP become GLVEC: no change in size",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await romModel(), null, 2));
