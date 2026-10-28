#!/usr/bin/env node
// The reference for KG24 (c) and (b): the GLCD driver of the product at
// PRODUCT (an extract of b025dbb) run over glcd.mjs's workload, the
// ST7920's graphics RAM digested after each command, and (0006h) on that
// card. Written to test/glcd-screens.json, which test/glcd.test.mjs reads.
//
//   PRODUCT=DIR node test/model/ks20/screens.mjs COMMIT > test/glcd-screens.json

import { COMMANDS, boardRun } from "./glcd.mjs";
import { fixtures } from "./lib.mjs";

const { rom, symbols } = fixtures.romFor();
const r = await boardRun(rom, symbols, fixtures.GLCD_PRL);
const out = {
  from: process.argv[2] ?? "unnamed",
  what: "b025dbb's GLCD driver: the ST7920's graphics RAM, SHA-256 to 16 hex digits, after each command",
  bdosVector: r.tpa,
  screens: COMMANDS.map((line, i) => ({ line, gdram: r.shots[i].gdram })),
};
console.log(JSON.stringify(out, null, 2));
