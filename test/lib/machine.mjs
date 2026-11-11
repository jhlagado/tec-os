// Node wrapper around the shared machine: symbol maps come from files.

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { after, afterEach, beforeEach } from "node:test";
import { basename, resolve } from "node:path";
import { EXPAND1_WRITES, Machine as HostMachine, symbolsFromD8 } from "../../host/machine.mjs";
import { findVolume, parseContainer, volumePayload } from "../../tools/lib/container.mjs";
import { CpmVolume } from "../../tools/lib/cpmfs.mjs";
import { fontBytes } from "../../tools/lib/font.mjs";

HostMachine.font = fontBytes(resolve(import.meta.dirname, "../.."));

export { EXPAND1_WRITES, bootMachine } from "../../host/machine.mjs";

// With TECOS_TEST_RESIDENT naming a .SVC file, every machine started on a
// card installs that service by a line in A:STARTUP.CMD, the first or the one
// after a first SHELL.SVC line, so a test's
// own steps run with it installed and no session active (test/mon3.test.mjs
// reruns existing tests that way). TECOS_TEST_RESIDENT_LOG names a file that gets
// one line for each such machine: the BDOS entry's word at its first prompt.
const RESIDENT = process.env.TECOS_TEST_RESIDENT;
const RESIDENT_LOG = process.env.TECOS_TEST_RESIDENT_LOG;

/** Put the RESIDENT file on IMAGE's A: and name it first in its STARTUP.CMD. */
function addResident(image) {
  const v = findVolume(parseContainer(image), "A");
  const a = new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
  const name = basename(RESIDENT).toUpperCase();
  a.write(name, readFileSync(RESIDENT));
  const startup = a.list().some((f) => f.name === "STARTUP.CMD") ? Buffer.from(a.read("STARTUP.CMD", { text: true })) : Buffer.alloc(0);
  // After a first SHELL.SVC line, so that the shell still loads and runs the rest.
  const shell = /^SHELL\.SVC\r?\n/i.exec(startup.toString("latin1"))?.[0].length ?? 0;
  a.write("STARTUP.CMD", Buffer.concat([startup.subarray(0, shell), Buffer.from(`${name}\n`, "latin1"), startup.subarray(shell)]), { text: true });
}

export class Machine extends HostMachine {
  constructor(options) {
    if (RESIDENT && options.sdImage) addResident(options.sdImage);
    super(options);
    this.resident = RESIDENT && options.sdImage ? "pending" : undefined;
  }

  ready() {
    const r = super.ready();
    if (r && this.resident === "pending") {
      this.resident = "logged";
      if (RESIDENT_LOG) appendFileSync(RESIDENT_LOG, `${JSON.stringify({ file: process.argv[1], entry: this.read(6) | (this.read(7) << 8) })}\n`);
    }
    return r;
  }
}

// Every test file that runs a machine: EXPAND 1 at 8000h-BCFFh is the block
// cache's, BD00h-BFFFh is free, and after cold boot's clear nothing but the
// cache writes the first or anything the second.
after(() => assert.deepEqual(EXPAND1_WRITES, [], "a write to EXPAND 1 below BD00h, not by the cache, or to its free pages, after cold boot's clear"));

// Each such write is marked with the test it was made in. With TEST_TRACE set
// to a file, each test's start and end are appended to it, and each test that
// made such a write, one JSON line each, so that the mutant runner
// (tools/lib/mutants.mjs) can name the test in which a file was killed, or
// that the check above fails for.
const TRACE = process.env.TEST_TRACE;
const trace = (what, t) => TRACE && appendFileSync(TRACE, `${JSON.stringify({ what, file: process.argv[1], test: t.name })}\n`);
let writes = 0;
beforeEach((t) => {
  writes = EXPAND1_WRITES.length;
  trace("start", t);
});
afterEach((t) => {
  for (const w of EXPAND1_WRITES.slice(writes)) w.test = t.name;
  if (EXPAND1_WRITES.length > writes) trace("expand1", t);
  trace("end", t);
});

export function loadSymbols(path) {
  return symbolsFromD8(JSON.parse(readFileSync(path, "utf8")));
}
