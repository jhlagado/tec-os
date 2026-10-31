// Edit, the full-screen CP/M editor, on TEC-OS and on Triptych's CP/M 2.2.
// Emulator evidence. EDIT.COM and Triptych's headless package are pinned
// inputs (test/inputs.json); the pinned EDIT.COM has the screen
// configuration block (tag "ECFG" at 0103h).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ROOT, boot, standardCard, volume } from "./lib/fixtures.mjs";
import { editForAbi4 } from "../tools/lib/edit.mjs";
import { check, pinned } from "./lib/inputs.mjs";

const EDIT = pinned("EDIT.COM");
const TRIPTYCH = pinned("triptych-headless");
const editCom = () => editForAbi4(new Uint8Array(readFileSync(EDIT.path)), ROOT);
const NOTES = "hello\nsecond line\n";
const EDITED = "hello\nYsecond line\n";

function editOnTecOs({ tms, profile = "debug80", cols = 80 }) {
  check(EDIT);
  const image = standardCard();
  const a = volume(image, "A");
  a.write("EDIT.COM", editCom());
  a.write("NOTES.TXT", Buffer.from(NOTES), { text: true });
  let m = boot(image, { tms, profile, matrix: true });
  const screen = () => (tms ? m.screen() : m.glcdScreen());
  m.mark = m.output.length;
  m.typeMatrix("edit notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[0] === "hello", 400_000_000, "the editor's first screen");
  const rows = tms ? 24 : 8;
  assert.equal(screen().length, rows);
  assert.deepEqual([m.read(m.sym("VWID")), m.read(m.sym("VHGT"))], tms ? [cols, 24] : [21, 8], "the console's geometry");
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
  m = boot(image, { tms, profile, matrix: true, ramFill: 0x76 });
  m.typeMatrix("edit notes.txt\r");
  m.runUntilChecked(() => m.waitingForInput() && screen()[1] === "Ysecond line", 400_000_000, "the saved text");
  m.typeMatrix("\x11");
  m.runUntilChecked(() => m.waitingForInput() && screen().some((l) => l.startsWith("A>")), 400_000_000, "the prompt");
}

for (const [cols, profile] of [[80, "debug80"], [40, "debug80t40"], [32, "debug80g32"]]) {
  test(`Edit edits, saves and reopens a file on TEC-OS with the PICO9918 (${cols} x 24)`, { skip: EDIT.skip, timeout: 900_000 }, () => {
    editOnTecOs({ tms: true, profile, cols });
  });
}

test("Edit does the same on the GLCD (21 x 8)", { skip: EDIT.skip, timeout: 900_000 }, () => {
  editOnTecOs({ tms: false });
});

test("the built starter card carries the patched EDIT.COM", { skip: EDIT.skip, timeout: 300_000 }, () => {
  check(EDIT);
  execFileSync(process.execPath, ["tools/media.mjs"], { cwd: ROOT, stdio: "ignore" });
  const card = new Uint8Array(readFileSync(resolve(ROOT, "dist/starter.img")));
  const onCard = volume(card, "A").read("EDIT.COM").subarray(0, editCom().length);
  assert.deepEqual([...onCard], [...editCom()]);
  assert.equal(onCard[0xe8c], 4, "the major byte");
  assert.deepEqual([...readFileSync(resolve(ROOT, "dist/files/EDIT.COM"))], [...editCom()]);
});

test("editForAbi4 refuses another binary, and one with no major test at its offset", { skip: EDIT.skip }, () => {
  check(EDIT);
  const pinnedBytes = new Uint8Array(readFileSync(EDIT.path));
  const other = Uint8Array.from(pinnedBytes);
  other[0] ^= 0xff;
  assert.throws(() => editForAbi4(other, ROOT), /sha256/);
  const moved = Uint8Array.from(pinnedBytes);
  moved[0xe8c - 4] ^= 0xff;
  const root = mkdtempSync(resolve(tmpdir(), "edit-"));
  mkdirSync(resolve(root, "test"));
  const sha256 = createHash("sha256").update(moved).digest("hex");
  writeFileSync(resolve(root, "test/inputs.json"), JSON.stringify({ inputs: { "EDIT.COM": { sha256 } } }));
  assert.throws(() => editForAbi4(moved, root), /no major test/);
  rmSync(root, { recursive: true });
});

test(
  "Edit edits and saves a file on Triptych's CP/M 2.2 (80 x 24)",
  { skip: EDIT.skip || TRIPTYCH.skip, timeout: 900_000 },
  async () => {
    check(EDIT);
    check(TRIPTYCH);
    const dir = TRIPTYCH.path;
    const { createDisk, TriptychDisk } = await import(resolve(dir, "src/index.mjs"));
    const require = createRequire(resolve(dir, "src/index.mjs"));
    const { TriptychCpu } = require(resolve(dir, "dist/wasm/triptych_host_wasm.js"));
    const cpu = new TriptychCpu(readFileSync(resolve(dir, "dist/boot.bin")));
    const notes = new TextEncoder().encode(NOTES.replace(/\n/g, "\r\n") + "\x1a");
    cpu.install_drive(0, createDisk([["EDIT.COM", editCom()], ["NOTES.TXT", notes]]).image(), true);
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
