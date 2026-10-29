// The warm boot keeps the drives logged in (KS18): a drive nothing has
// changed keeps its allocation vector, a changed one is rebuilt to its
// directory's mark, and every vector after a warm boot is the one a full
// scan of the card gives. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { standardCard } from "./lib/fixtures.mjs";
import { alv, rebuilt, rig, w } from "./lib/warmboot.mjs";

test("a warm boot with nothing changed reads no block, in a tenth of the time", () => {
  const r = rig();
  const before = alv(r.m, 0);
  const x = r.warm();
  assert.equal(x.reads, 0);
  assert.ok(x.t <= 386_604, `${x.t} T-states`);
  assert.deepEqual(alv(r.m, 0), before);
});

test("after SAVE the warm boot rebuilds A from its directory up to the mark", () => {
  const r = rig();
  r.m.command("SAVE 8 X.COM");
  const x = r.warm();
  assert.ok(x.reads >= 1 && x.reads < 16, `${x.reads} blocks`);
  assert.deepEqual(alv(r.m, 0), rebuilt(r.image, 0));
  assert.equal(r.warm().reads, 0, "clean again");
});

test("a file written and never closed frees its blocks at the warm boot, as CP/M 2.2 does", () => {
  const r = rig();
  r.fcb(1, "OPEN    DAT");
  assert.notEqual(r.bdos(22), 0xff);
  for (let i = 0; i < 40; i += 1) assert.equal(r.bdos(21), 0);
  assert.notDeepEqual(alv(r.m, 0), rebuilt(r.image, 0), "the blocks are allocated in memory only");
  r.warm();
  assert.deepEqual(alv(r.m, 0), rebuilt(r.image, 0));
});

test("a vector a program wrote over is scanned in full", () => {
  const r = rig();
  const v = alv(r.m, 0);
  const dph = r.m.sym("DPHTAB");
  r.m.write(w(r.m, dph + 14) + v.length - 1, 0x0f);
  const x = r.warm();
  assert.equal(x.reads, 16);
  assert.deepEqual(alv(r.m, 0), rebuilt(r.image, 0));
});

test("a program's BIOS write of a directory entry above the mark is read at the warm boot", () => {
  const r = rig();
  const rec = new Uint8Array(128).fill(0xe5);
  rec.set([0, ...Buffer.from("RAW     DAT"), 0, 0, 0, 16, 200, 1, ...new Array(14).fill(0)]); // 16 records in block 456 (01C8h)
  for (let i = 0; i < 128; i += 1) r.m.write(0x0200 + i, rec[i]);
  const bios = w(r.m, 1) - 3; // the RAM BIOS table
  r.call(bios + 0x1b, { bc: 0 }); // SELDSK A
  r.call(bios + 0x1e, { bc: 0 }); // SETTRK 0
  r.call(bios + 0x21, { bc: 50 }); // SETSEC 50: entries 200-203
  r.call(bios + 0x24, { bc: 0x0200 }); // SETDMA
  assert.equal(r.call(bios + 0x2a, { c: 1 }), 0, "BIOS WRITE, a directory write");
  r.warm();
  assert.deepEqual(alv(r.m, 0), rebuilt(r.image, 0));
  assert.match(r.m.command("DIR"), /RAW\.DAT/);
});

test("function 13 from a program scans the whole directory", () => {
  const r = rig();
  r.reads = 0;
  r.bdos(13);
  assert.equal(r.reads, 16);
});

test("a drive set read-only is read-write again after a warm boot", () => {
  const r = rig();
  r.bdos(28);
  assert.equal(w(r.m, r.m.sym("ROVEC")) & 1, 1);
  r.warm();
  assert.equal(w(r.m, r.m.sym("ROVEC")) & 1, 0);
});

test("a mount on B: then a warm boot scans B's new volume in full", () => {
  const r = rig(standardCard([{ geometry: "G8M", label: "SPARE" }]));
  r.m.command("B:");
  r.m.command("A:");
  assert.equal(r.call(r.m.sym("ABIVOL"), { a: 0, c: 1, de: 2 }), 0, "VOLSVC: SPARE on B:");
  r.warm();
  r.reads = 0;
  r.m.command("B:");
  assert.ok(r.reads >= 32, `${r.reads} blocks`);
  assert.deepEqual(alv(r.m, 1), rebuilt(r.image, 1));
});
