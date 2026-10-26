// Qualification with an unmodified CP/M application: the Basie compiler and
// linker, taken from the Basie release disk, a pinned input (test/inputs.json).
// Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openIbm3740 } from "../tools/lib/ibm3740.mjs";
import { boot, standardCard, volume } from "./lib/fixtures.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const DISK = pinned("BASIE.DSK");

test(
  "BASIE compiles and links ADVENT on TEC-OS; the program runs after power loss",
  { skip: DISK.skip, timeout: 1_800_000 },
  () => {
    check(DISK);
    const dsk = readFileSync(DISK.path);
    const image = standardCard();
    const a = volume(image, "A");
    const release = openIbm3740(new Uint8Array(dsk));
    for (const f of release.list()) a.write(f.name, release.read(f.name));

    let m = boot(image, { tms: true, matrix: true });
    const compile = m.command("BASIE ADVENT", { maxCycles: 3_000_000_000 });
    assert.doesNotMatch(compile, /error|Bdos Err/i, compile);
    assert.match(m.command("DIR"), /ADVENT\.COM/);
    assert.deepEqual(m.violations, []);
    const cycles = m.cycles;

    m = boot(image, { ramFill: 0x76 });
    m.mark = m.output.length;
    m.type("ADVENT\r");
    assert.match(m.expect(/> $/, { maxCycles: 200_000_000 }), /bring the gold back to the cellar/);
    m.type("QUIT\r");
    m.expect(/A>$/, { maxCycles: 200_000_000 });
    assert.deepEqual(volume(image, "A").verify(), []);
    console.log(`BASIE.DSK as pinned; compile and link took ${cycles} T-states`);
  },
);
