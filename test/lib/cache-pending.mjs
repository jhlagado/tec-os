// Real acknowledged data held by a refusing card, with complete cache ownership.
import assert from "node:assert/strict";
import { findVolume, parseContainer } from "../../tools/lib/container.mjs";
import { volume } from "./fixtures.mjs";
import { publicContext } from "./public-caller.mjs";

const word = (m, at) => m.read(at) | m.read(at + 1) << 8;

/** Observe physical cache storage without switching the guest's bank. */
export function cacheState(m) {
  assert.ok(m.classicBankIn, "observe the returned caller or classic input");
  const bank = m.expand ? m.expand[1] : m.banks[0];
  assert.equal(bank.length, 0x4000);
  const get = name => m.read(m.sym(name)), limit = m.sym("NLINES");
  const count = get("HKCNT"); assert.ok(count <= limit);
  const queue = Array.from({ length: count }, (_, i) => m.read(m.sym("HKQ") + i));
  assert.equal(new Set(queue).size, count);
  const dirty = Array.from(bank.slice(m.sym("CDIRTY") - 0x8000, m.sym("CDIRTY") - 0x8000 + limit));
  const entries = queue.map(line => {
    assert.ok(line < limit);
    const tag = bank.slice(m.sym("CTAB") - 0x8000 + line * 4, m.sym("CTAB") - 0x8000 + (line + 1) * 4);
    return { line, tag, block: [...tag].reduce((n, b, i) => n + b * 256 ** i, 0), dirty: dirty[line], payload: bank.slice(line * 512, (line + 1) * 512) };
  });
  assert.equal(new Set(entries.map(e => e.block)).size, entries.length, "each queued tag owns a distinct block");
  assert.equal(dirty.filter(Boolean).length, count, "no unqueued dirty state");
  const round = Array.from({ length: get("HKRLEN") }, (_, i) => m.read(m.sym("HKROUND") + i));
  return { queue, entries, dirty, round, position: get("HKRPOS"), pending: get("CPEND"), any: get("CANY"), depth: get("HKDEP"), busy: get("HKBUSY"), error: get("HKERR") };
}

/** Derive the absolute card block from a live word-map FCB and geometry. */
export function fileBlock(m, image, record, fcb = 0x5c, drive = "B") {
  const fs = volume(image, drive), descriptor = findVolume(parseContainer(image), drive);
  assert.ok(fs.d.dsm > 255, "this factory retains the word-map geometry");
  const perAllocation = fs.blockBytes / 128, slot = Math.floor(record / perAllocation);
  assert.ok(slot < 8);
  const allocation = word(m, fcb + 16 + slot * 2);
  assert.ok(allocation >= fs.g.dirBlocks && allocation <= fs.d.dsm, "live allocation is valid data storage");
  const byte = allocation * fs.blockBytes + (record % perAllocation) * 128;
  const block = descriptor.start + Math.floor(byte / 512);
  assert.ok(block >= descriptor.start && block < descriptor.start + descriptor.length);
  return block;
}

/**
 * Make a G8M/B file and acknowledge full blocks while the real SPI backend
 * refuses writes. CALL is an already returned public BDOS caller; no input
 * is consumed here. The caller selects when individual blocks may commit.
 */
export function retainedBlocks({ m, image, call, records = 8, fcb = 0x5c, dma = 0x2000, name = "Q       DAT", pattern = r => new Uint8Array(128).fill(r < 4 ? 0xc3 : 0xd4) }) {
  publicContext(m);
  assert.ok(records >= 4 && records <= 120 && records % 4 === 0);
  assert.equal(volume(image, "B").g.name, "G8M");
  assert.equal(name.length, 11);
  call(45, 0xff); assert.equal(m.read(m.sym("ERRMODE")), 0xff);
  [2, ...Buffer.from(name), ...new Array(24).fill(0)].forEach((v, i) => m.write(fcb + i, v));
  call(22, fcb); assert.notEqual(m.cpu.cpu.a, 0xff, "make succeeds before refusal");
  call(26, dma);
  assert.equal(cacheState(m).queue.length, 0, "no pre-existing dirty work seeds this fixture");
  assert.equal(volume(image, "B").find(`${name.slice(0, 8).trim()}.${name.slice(8).trim()}`).records, 0);
  const original = Uint8Array.from(image), expected = new Map(), attempts = [], acknowledgements = [];
  const backend = { accepts: () => false };
  const sd = m.sd, commit = sd.commitWrite.bind(sd);
  sd.commitWrite = () => {
    const { start, buffer } = sd.writeState, block = start / 512, payload = Uint8Array.from(buffer);
    assert.ok(expected.has(block), "only a previously acknowledged data block is attempted");
    assert.deepEqual(payload, expected.get(block), "the attempted block contains every acknowledged update");
    const accepted = Boolean(backend.accepts(block, payload));
    attempts.push({ block, payload, accepted });
    if (!accepted) { sd.writeState = null; sd.pendingResponse = [0x0d, 0xff]; sd.delayBytes = 1; }
    else { commit(); assert.equal(sd.pendingResponse[0], 0x05); assert.deepEqual(image.slice(start, start + 512), payload); }
  };
  for (let record = 0; record < records; record++) {
    const data = Uint8Array.from(pattern(record)); assert.equal(data.length, 128);
    data.forEach((v, i) => m.write(dma + i, v));
    call(21, fcb); publicContext(m);
    assert.equal(m.cpu.cpu.a, 0, `record ${record} acknowledged`);
    assert.equal(m.read(fcb + 32), record + 1, "sequential position advances after acknowledgment");
    const block = fileBlock(m, image, record, fcb);
    if (!expected.has(block)) expected.set(block, new Uint8Array(512));
    expected.get(block).set(data, (record & 3) * 128);
    acknowledgements.push({ record, a: m.cpu.cpu.a, cr: m.read(fcb + 32), block, fcb: Uint8Array.from({ length: 36 }, (_, i) => m.read(fcb + i)), payload: expected.get(block).slice() });
  }
  const before = cacheState(m);
  assert.equal(expected.size, records / 4); assert.equal(before.queue.length, expected.size);
  assert.deepEqual(before.entries.map(e => e.block), [...expected.keys()], "queue retains first-dirty order");
  for (const e of before.entries) { assert.equal(e.dirty, 1); assert.deepEqual(e.payload, expected.get(e.block)); }
  assert.deepEqual([before.pending, before.any, before.depth, before.busy], [0, 1, 0, 0]);
  assert.ok(attempts.length > 0 && attempts.every(a => !a.accepted), "actual card refusal occurred");
  assert.deepEqual(image, original, "no acknowledged data reached the refusing card");
  const expectedImage = Uint8Array.from(original);
  for (const [block, payload] of expected) expectedImage.set(payload, block * 512);
  return { m, image, expected, original, expectedImage, attempts, acknowledgements, backend, before, state: () => cacheState(m) };
}
