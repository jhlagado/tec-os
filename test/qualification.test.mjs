// Qualification with an unmodified CP/M application: the Basie compiler and
// linker, taken from the Basie release disk. Emulator evidence. Skipped when
// the disk is not present beside this repository.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { openIbm3740 } from "../tools/lib/ibm3740.mjs";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";

const DISK = process.env.BASIE_DSK ?? resolve(ROOT, "../basie/build/BASIE.DSK");

test(
  "BASIE compiles and links ADVENT on TEC-OS; the program runs after power loss",
  { skip: !existsSync(DISK) && `no ${DISK}`, timeout: 1_800_000 },
  () => {
    const dsk = readFileSync(DISK);
    const digest = createHash("sha256").update(dsk).digest("hex");
    const image = standardCard();
    const a = volume(image, "A");
    const release = openIbm3740(new Uint8Array(dsk));
    for (const f of release.list()) a.write(f.name, release.read(f.name));

    let m = boot(image);
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
    console.log(`BASIE.DSK sha256 ${digest}; compile and link took ${cycles} T-states`);
  },
);
