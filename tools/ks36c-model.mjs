#!/usr/bin/env node
// KS36c's model: the drivers' sizes with the ROM's font. Prototypes in
// test/model/ks36c/proto/, each the tree's driver with one change:
//   glcd-a     the font's address from service 15 at INIT, kept in a word
//   glcd-b     the font's fixed address assembled in (abi.inc would name it;
//              here a number, since only abi.inc may name a ROM address)
//   glcd-a150, glcd-b150  the same with KE-150's refusal gone from INIT
//   pico-a     PICO.SVC with the font from service 15, at each of today's widths
// Each is built by the service writer and its header and image measured
// against pages of 256 bytes.
//
//   node tools/ks36c-model.mjs --out FILE

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as M from "./lib/model.mjs";
import { PICO_WIDTHS, makeSvc } from "./lib/svc.mjs";

const PROTO = resolve(M.ROOT, "test/model/ks36c/proto");
const word = (f, o) => f[o] | (f[o + 1] << 8);
async function size(src, defs = {}) {
  const f = (await makeSvc(src, { defs, work: resolve(M.ROOT, "build/svc-ks36c") })).file;
  return { bytes: word(f, 6), pages: Math.ceil(word(f, 6) / 256), file: f.length };
}

const out = { today: {}, glcd: {}, pico: {} };
out.today["GLCD.SVC"] = await size(resolve(M.ROOT, "drivers/glcd.asm"));
for (const [n, d] of Object.entries(PICO_WIDTHS)) out.today[n] = await size(resolve(M.ROOT, "drivers/pico.asm"), d);
for (const v of ["glcd-a", "glcd-b", "glcd-a150", "glcd-b150"]) out.glcd[v] = await size(resolve(PROTO, `${v}.asm`));
for (const [n, d] of Object.entries(PICO_WIDTHS)) out.pico[n] = await size(resolve(PROTO, "pico-a.asm"), d);
writeFileSync(M.arg("--out"), JSON.stringify({ landed: M.commit("HEAD"), ...out }, null, 2) + "\n");
console.log(JSON.stringify(out));
