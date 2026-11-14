// A genuine program update and refused backend for shell warm-error tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { program, volume } from "./fixtures.mjs";
import { parseContainer, findVolume } from "../../tools/lib/container.mjs";
import { publicContext } from "./public-caller.mjs";

const SAY = await program("pendsay");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const word = (m, at) => m.read(at) | m.read(at + 1) << 8;
export const pendingSayFiles = () => ({ "SAY.COM": SAY.bytes, "HOLD.DAT": new Uint8Array(128).fill(0x22) });

function state(m) {
  assert.ok(m.classicBankIn);
  const bank = m.expand ? m.expand[1] : m.banks[0];
  assert.equal(bank.length, 0x4000);
  const count = m.read(m.sym("HKCNT")), limit = m.sym("NLINES");
  assert.ok(count <= limit);
  const queue = Array.from({ length: count }, (_, i) => m.read(m.sym("HKQ") + i));
  assert.equal(new Set(queue).size, queue.length);
  const dirty = Array.from(bank.slice(m.sym("CDIRTY") - 0x8000, m.sym("CDIRTY") - 0x8000 + limit));
  const entries = queue.map(line => {
    assert.ok(line < limit);
    const tag = bank.slice(m.sym("CTAB") - 0x8000 + line * 4, m.sym("CTAB") - 0x8000 + (line + 1) * 4);
    return { line, block: [...tag].reduce((n, b, i) => n + b * 256 ** i, 0), dirty: dirty[line], payload: bank.slice(line * 512, (line + 1) * 512) };
  });
  assert.equal(dirty.filter(Boolean).length, queue.length, "no unowned dirty line is used to manufacture this fault");
  return { queue, entries, dirty, pending: m.read(m.sym("CPEND")), any: m.read(m.sym("CANY")), depth: m.read(m.sym("HKDEP")), busy: m.read(m.sym("HKBUSY")) };
}

export function pendingSayFailure(m, image) {
  const fs = volume(image, "A"), file = fs.find("HOLD.DAT");
  assert.ok(file && file.records === 1 && file.entries.length === 1);
  assert.deepEqual(fs.read("HOLD.DAT"), new Uint8Array(128).fill(0x22));
  const slots = file.entries[0].slots; assert.equal(slots.length, 1); assert.equal(slots[0][0], 0);
  const allocation = slots[0][1]; assert.ok(allocation >= fs.g.dirBlocks && allocation <= fs.d.dsm);
  const descriptor = findVolume(parseContainer(image), "A"), block = descriptor.start + allocation * fs.blockBytes / 512;
  const original = Uint8Array.from(image), expected = image.slice(block * 512, (block + 1) * 512);
  expected.fill(0x5a, 0, 128);
  const expectedImage = Uint8Array.from(original); expectedImage.set(expected, block * 512);
  const acknowledgements = [], warms = [], attempts = [];
  let armed = false, refusing = true, programEntries = 0;
  const assertOwned = snapshot => {
    assert.deepEqual([snapshot.pending, snapshot.any, snapshot.busy], [0, 1, 0]);
    assert.equal(snapshot.entries.length, 1);
    assert.equal(snapshot.entries[0].block, block); assert.equal(snapshot.entries[0].dirty, 1);
    assert.deepEqual(snapshot.entries[0].payload, expected);
  };
  const commit = m.sd.commitWrite.bind(m.sd);
  m.sd.commitWrite = () => {
    if (!armed) return commit();
    const { start, buffer } = m.sd.writeState, payload = Uint8Array.from(buffer);
    assert.equal(start / 512, block); assert.deepEqual(payload, expected);
    attempts.push({ block, payload, accepted: !refusing });
    if (refusing) {
      m.sd.writeState = null; m.sd.pendingResponse = [0x0d, 0xff]; m.sd.delayBytes = 1;
    } else {
      commit(); assert.equal(m.sd.pendingResponse[0], 0x05);
      assert.deepEqual(image.slice(start, start + 512), payload);
    }
  };
  const step = m.step.bind(m);
  m.step = () => {
    if (m.pc === 0x100) {
      assert.deepEqual(Uint8Array.from({ length: SAY.bytes.length }, (_, i) => m.read(0x100 + i)), Uint8Array.from(SAY.bytes), "the actual program entry has the compiled write fixture");
      publicContext(m); programEntries++;
      if (!armed) { assert.equal(state(m).queue.length, 0); armed = true; }
    }
    if (armed && m.pc === SAY.symbols.WROTE) {
      publicContext(m); assert.equal(m.cpu.cpu.a, 0); assert.equal(m.read(SAY.symbols.FCB + 32), 1);
      const snapshot = state(m); assertOwned(snapshot);
      assert.equal(sha(image), sha(original)); acknowledgements.push(snapshot);
    }
    if (armed && m.pc === m.sym("WBOOTR")) {
      const snapshot = state(m); assertOwned(snapshot); warms.push(snapshot);
    }
    return step();
  };
  return {
    attempts, acknowledgements, warms,
    get programEntries() { return programEntries; },
    assertPending: () => {
      assert.equal(programEntries, 1); assert.equal(acknowledgements.length, 1); assert.equal(warms.length, 1);
      assert.ok(attempts.length > 0 && attempts.every(a => !a.accepted));
      const snapshot = state(m); assertOwned(snapshot);
      assert.deepEqual(snapshot.queue, acknowledgements[0].queue);
      assert.deepEqual(snapshot.entries, acknowledgements[0].entries);
      assert.equal(sha(image), sha(original)); assert.deepEqual(fs.verify(), []);
      return snapshot;
    },
    release: () => { refusing = false; },
    assertRecovered: () => {
      const snapshot = state(m);
      assert.equal(snapshot.queue.length, 0); assert.ok(snapshot.dirty.every(v => !v));
      assert.deepEqual([snapshot.pending, snapshot.any, snapshot.busy], [0, 0, 0]);
      assert.equal(attempts.filter(a => a.accepted).length, 1);
      assert.equal(sha(image), sha(expectedImage));
      assert.deepEqual(fs.read("HOLD.DAT"), new Uint8Array(128).fill(0x5a)); assert.deepEqual(fs.verify(), []);
    },
  };
}
