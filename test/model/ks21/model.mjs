#!/usr/bin/env node
// KS21's model: the block cache's copies (choices 1 and 2), its ROM bytes
// (choice 3) and its effect on the development loop and the speed gate's
// cases (choice 4). Run against a built product tree:
//
//   PRODUCT=DIR node test/model/ks21/model.mjs [VARIANT] > figures.json
//
// VARIANT is the line copy the loop uses: mvbl (today's byte loop, the
// default), u8 or sp16. report.md gives the figures.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PRODUCT } from "../ks20/lib.mjs";
import { costs } from "./cache.mjs";
import { copyModel } from "./copy.mjs";
import { EDIT, TAS, loopModel } from "./loop.mjs";
import { romModel } from "./rom.mjs";

const variants = process.argv[2] ? [process.argv[2]] : ["mvbl", "u8"];
const copy = await copyModel();
const rom = await romModel(copy);
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const figures = { product: PRODUCT, inputs: { "TAS.COM": sha(TAS), "EDIT.COM": sha(EDIT) }, copy, rom, loop: {} };
for (const v of variants) figures.loop[v] = await loopModel(costs(copy, v, rom.lookup));
console.log(JSON.stringify(figures, null, 2));
