// Edit, the full-screen CP/M editor, on TEC-OS and on Triptych's CP/M 2.2.
// Emulator evidence. EDIT.COM comes from EDIT_COM or ../edit/dist/EDIT.COM
// and must be a build with the screen configuration block (tag "ECFG" at
// 0103h); other builds assume a 64 KiB system and are skipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";

const EDIT = process.env.EDIT_COM ?? resolve(ROOT, "../edit/dist/EDIT.COM");
const TRIPTYCH = process.env.TRIPTYCH_HEADLESS ?? resolve(ROOT, "../triptych/packages/triptych-headless");

function editImage() {
  if (!existsSync(EDIT)) return { skip: `no ${EDIT}` };
  const bytes = new Uint8Array(readFileSync(EDIT));
  const tag = Buffer.from(bytes.subarray(3, 7)).toString("latin1");
  if (tag !== "ECFG") return { skip: `${EDIT} has no screen configuration block` };
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const edit = editImage();
const NOTES = "hello\nsecond line\n";
const EDITED = "hello\nYsecond line\n";

function editOnTecOs({ tms }) {
  const image = standardCard();
  const a = volume(image, "A");
  a.write("EDIT.COM", edit.bytes);
  a.write("NOTES.TXT", Buffer.from(NOTES), { text: true });
  let m = boot(image, { tms, matrix: true });
  const screen = () => (tms ? m.screen() : m.glcdScreen());
  m.mark = m.output.length;
  m.typeMatrix("edit notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[0] === "hello", 400_000_000, "the editor's first screen");
  const rows = tms ? 24 : 8;
  assert.equal(screen().length, rows);
  assert.match(screen()[rows - 1], /NOTES/, "status row on the last line");
  m.typeMatrix("\x04Y"); // down arrow, then Y
  m.typeMatrix("\x13"); // ^S save
  const saved = () => Buffer.from(volume(image, "A").read("NOTES.TXT", { text: true })).toString() === EDITED;
  m.runUntilChecked(() => m.waitingForInput() && saved(), 400_000_000, "the saved file on the card");
  m.typeMatrix("\x11"); // ^Q quit
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => l.startsWith("A>")), 400_000_000, "the prompt");
  assert.deepEqual(m.violations, []);
  assert.equal(Buffer.from(volume(image, "A").read("NOTES.TXT", { text: true })).toString(), EDITED);

  // Power cycle and open it again.
  m = boot(image, { tms, matrix: true, ramFill: 0x76 });
  m.typeMatrix("edit notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[1] === "Ysecond line", 400_000_000, "the saved text");
  m.typeMatrix("\x11");
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => l.startsWith("A>")), 400_000_000, "the prompt");
}

test("Edit edits, saves and reopens a file on TEC-OS with the PICO9918 (80 x 24)", { skip: edit.skip, timeout: 900_000 }, () => {
  editOnTecOs({ tms: true });
});

test("Edit does the same on the GLCD (21 x 8)", { skip: edit.skip, timeout: 900_000 }, () => {
  editOnTecOs({ tms: false });
});

test(
  "Edit edits and saves a file on Triptych's CP/M 2.2 (80 x 24)",
  { skip: edit.skip ?? (!existsSync(TRIPTYCH) && `no ${TRIPTYCH}`), timeout: 900_000 },
  async () => {
    const { createDisk, TriptychDisk } = await import(resolve(TRIPTYCH, "src/index.mjs"));
    const require = createRequire(resolve(TRIPTYCH, "src/index.mjs"));
    const { TriptychCpu } = require(resolve(TRIPTYCH, "dist/wasm/triptych_host_wasm.js"));
    const cpu = new TriptychCpu(readFileSync(resolve(TRIPTYCH, "dist/boot.bin")));
    const notes = new TextEncoder().encode(NOTES.replace(/\n/g, "\r\n") + "\x1a");
    cpu.install_drive(0, createDisk([["EDIT.COM", edit.bytes], ["NOTES.TXT", notes]]).image(), true);
    const text = () => Buffer.from(cpu.serial_output()).toString("latin1");
    // Run until output has been quiet for a while, so each key arrives when
    // the editor is waiting for it.
    const settle = () => {
      let last = -1;
      let quiet = 0;
      for (let i = 0; i < 5000 && quiet < 40; i += 1) {
        cpu.run_slice(50_000, 500_000);
        const n = text().length;
        quiet = n === last ? quiet + 1 : 0;
        last = n;
      }
    };
    try {
      settle();
      for (const keys of ["EDIT NOTES.TXT\r", "\x1b[B", "Y", "\x13", "\x11"]) {
        cpu.enqueue_serial_input(new TextEncoder().encode(keys));
        settle();
      }
      assert.match(text(), /Saved/);
      assert.match(text(), /\r\nA>$/);
      const back = Buffer.from(new TriptychDisk(cpu.export_drive(0)).readFile("NOTES.TXT")).toString("latin1");
      assert.equal(back.slice(0, back.indexOf("\x1a")), EDITED.replace(/\n/g, "\r\n"));
    } finally {
      cpu.free();
    }
  },
);

test("the EDIT.COM under test is recorded", { skip: edit.skip }, () => {
  console.log(`EDIT.COM ${EDIT} sha256 ${edit.sha256}`);
});
