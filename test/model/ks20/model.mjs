#!/usr/bin/env node
// KS20's model, the parts that stay after its scope was cut: GLCD as a
// resident (choice 1) and the drivers' retirement (its share of choice 6).
// Run against a built product tree:
//
//   PRODUCT=DIR node test/model/ks20/model.mjs > figures.json
//
// PRODUCT defaults to this repository. report.md gives the figures from an
// extract of b025dbb.

import { glcdModel } from "./glcd.mjs";
import { romModel } from "./rom.mjs";
import { PRODUCT } from "./lib.mjs";

const figures = { product: PRODUCT, glcd: await glcdModel(), rom: await romModel() };
console.log(JSON.stringify(figures, null, 2));
