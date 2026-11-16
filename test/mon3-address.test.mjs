// Address policy and validation use the actual relocated service in the emulator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bin, bytesAt, line, word } from "./lib/mon3.mjs";
import { END, goTo, hexFile, inSession, lines, ok, pageOf, record, refused, runnable, toMon3, tpaDigest } from "./lib/mon3s2.mjs";

const at = (m, svc) => word(m, (pageOf(m) << 8) + svc.symbols.RUNAT);
const rec = (address, data) => record(address, 0, data);
const entry = address => record(0, 5, [0, 0, address >> 8, address & 255]);
function ready(m, svc, cmd, address) {
  const result = line(m, cmd);
  assert.ok(ok(result), `${cmd}: ${result.out}`);
  assert.equal(runnable(m, svc), 1, `${cmd}: ready`);
  assert.equal(at(m, svc), address, `${cmd}: remembered GO address`);
}
function runs(m, command, address) {
  goTo(m, command, address);
  toMon3(m);
}

test("MON3 BIN LOAD addr then bare GO; omitted base and one-off GO override", async () => {
  const { m, svc } = await inSession({ "RET.BIN": bin(0xc9) });
  ready(m, svc, "LOAD RET.BIN 2000", 0x2000);
  assert.equal(m.read(0x2000), 0xc9);
  runs(m, "GO", 0x2000);
  // A separate explicitly selected entry does not change the load default.
  m.write(0x2010, 0xc9);
  runs(m, "GO 2010", 0x2010);
  assert.equal(at(m, svc), 0x2000);
  runs(m, "GO", 0x2000);
  ready(m, svc, "LOAD RET.BIN", 0x4000);
  runs(m, "GO", 0x4000);
  assert.ok(refused(line(m, "GO 4000 X")), "extra GO operand refused");
  const before = tpaDigest(m);
  assert.ok(refused(line(m, "LOAD RET.BIN 2000 X")), "extra BIN operand refused");
  assert.equal(tpaDigest(m), before);
  assert.equal(runnable(m, svc), 0);
});

test("MON3 HEX lowest default is independent of record order and retains gaps", async () => {
  const text = { "ORDER.HEX": hexFile([[0x2010, bin(0xc9, 0x55)], [0x2000, bin(0xc9)]]) };
  const { m, svc } = await inSession({}, { text });
  m.write(0x2001, 0xa5);
  ready(m, svc, "LOAD ORDER.HEX", 0x2000);
  assert.equal(m.read(0x2001), 0xa5, "gap unchanged");
  assert.deepEqual([...bytesAt(m, 0x2010, 2)], [0xc9, 0x55]);
  runs(m, "GO", 0x2000);
  runs(m, "GO 2010", 0x2010);
  assert.equal(at(m, svc), 0x2000);
  m.write(0x5001, 0x6a);
  ready(m, svc, "LOAD ORDER.HEX 5000", 0x5000);
  assert.deepEqual([...bytesAt(m, 0x5010, 2)], [0xc9, 0x55]);
  assert.equal(m.read(0x5001), 0x6a);
  runs(m, "GO", 0x5000);
  ready(m, svc, "LOAD ORDER.HEX 1000", 0x1000);
  assert.equal(m.read(0x1010), 0xc9);
  runs(m, "GO", 0x1000);
});

test("MON3 HEX rebases low and FFFF logical origins without relocating operands", async () => {
  const text = {
    "ZERO.HEX": hexFile([[0, bin(0xc3, 0x34, 0x12)]]),
    "LAST.HEX": hexFile([[0xffff, bin(0xc9)]]),
  };
  const { m, svc } = await inSession({}, { text });
  ready(m, svc, "LOAD ZERO.HEX 3000", 0x3000);
  assert.deepEqual([...bytesAt(m, 0x3000, 3)], [0xc3, 0x34, 0x12], "JP 1234 remains absolute");
  ready(m, svc, "LOAD LAST.HEX 2000", 0x2000);
  runs(m, "GO", 0x2000);
});

test("MON3 HEX type 05 record is passed over: the file loads and GO's address is the lowest data address", async () => {
  // Each file's lowest data byte is a RET and the address its entry record
  // names holds a HALT or nothing: GO must start at the lowest data byte.
  const low = rec(0x2000, [0xc9, 0x5a]);
  const files = {
    "FIRST.HEX": [entry(0x2010), low, rec(0x2010, [0x76]), END],
    "LAST.HEX": [low, rec(0x2010, [0x76]), entry(0x2010), END],
    "BETWEEN.HEX": [rec(0x2010, [0x76]), entry(0x2010), low, END],
    "GAP.HEX": [low, entry(0x2008), END],
    "PASTEND.HEX": [low, entry(0x2002), END],
    "BELOW.HEX": [low, entry(0x1fff), END],
    "TWICE.HEX": [low, entry(0x2001), entry(0x2000), END],
    "UPPER.HEX": [low, record(0, 5, [0, 1, 0x20, 0]), END],
    "FIELD.HEX": [low, record(1, 5, [0, 0, 0x20, 0]), END],
    "NONE.HEX": [low, record(0, 5), END],
    "LONG.HEX": [low, record(0x2000, 5, [0x76, 0x76, 0x76, 0x76, 0x76, 0x76, 0x76, 0x76]), END],
  };
  // Each file is paired with the same records less the entry records: the
  // two must leave the same memory and the same address for GO.
  const plain = name => name.replace(".HEX", "P.HEX");
  const text = {};
  for (const [name, rows] of Object.entries(files)) {
    text[name] = lines(rows);
    text[plain(name)] = lines(rows.filter(row => row.slice(7, 9) !== "05"));
  }
  const { m, svc } = await inSession({}, { text });
  const clear = address => [0, 1, 0x10].forEach(i => m.write(address + i, 0));
  for (const name of Object.keys(files)) {
    for (const [operand, address] of [["", 0x2000], [" 5000", 0x5000]]) {
      clear(address);
      ready(m, svc, `LOAD ${plain(name)}${operand}`, address);
      const expected = tpaDigest(m);
      clear(address);
      ready(m, svc, `LOAD ${name}${operand}`, address);
      assert.deepEqual([...bytesAt(m, address, 2)], [0xc9, 0x5a], `${name}${operand}: data loaded`);
      assert.equal(tpaDigest(m), expected, `${name}${operand}: the entry record writes nothing`);
      runs(m, "GO", address);
      assert.equal(at(m, svc), address, `${name}${operand}: GO's address kept`);
    }
  }
});

test("MON3 HEX overlapping data records keep file order under a rebase", async () => {
  const text = { "OVERLAP.HEX": lines([rec(0x2010, [0x76, 1]), rec(0x2000, [0xc9]), rec(0x2010, [0xc9, 2]), END]) };
  const { m, svc } = await inSession({}, { text });
  ready(m, svc, "LOAD OVERLAP.HEX 5000", 0x5000);
  assert.deepEqual([...bytesAt(m, 0x5010, 2)], [0xc9, 2], "later overlapping bytes win");
});

test("MON3 HEX rebased exact protected and resident boundaries", async () => {
  const text = { "EDGE.HEX": hexFile([[0xfff0, new Uint8Array(16).fill(0xc9)]]) };
  const { m, svc } = await inSession({}, { text });
  const top = word(m, 6) & 0xff00;
  for (const base of [0x100, 0x7f0, 0x900, top - 16]) {
    ready(m, svc, `LOAD EDGE.HEX ${base.toString(16)}`, base);
    assert.deepEqual([...bytesAt(m, base, 16)], new Array(16).fill(0xc9));
  }
  for (const base of [0xff, 0x7f1, 0x800, 0x8ff, top - 15, top, 0xfff1]) {
    const before = tpaDigest(m);
    assert.ok(refused(line(m, `LOAD EDGE.HEX ${base.toString(16)}`)));
    assert.equal(tpaDigest(m), before);
    assert.equal(runnable(m, svc), 0);
  }
});

test("MON3 HEX late syntax, checksum and rebased boundary refusals write nothing", async () => {
  const prefix = rec(0x2000, [0xc9, 0x5a]);
  const texts = {
    "SUM.HEX": [prefix, rec(0x2010, [1]).slice(0, -2) + "00", END],
    "DIGIT.HEX": [prefix, ":01201000GGCE", END],
    "EOFADR.HEX": [prefix, record(1, 1)],
    "MISSING.HEX": [prefix],
    "EMPTY.HEX": [END],
    "WRAP.HEX": [prefix, rec(0xffff, [1, 2]), END],
    // An entry record is passed over, but it is still a record: its
    // checksum, digits and length are checked, and it is not data.
    "ENTSUM.HEX": [prefix, entry(0x2000).slice(0, -2) + "00", END],
    "ENTDIG.HEX": [prefix, ":0400000500002G00D7", END],
    "ENTCUT.HEX": [prefix, ":040000050000D7", END],
    "ENTONLY.HEX": [entry(0x2000), END],
    "TYPE2.HEX": [prefix, record(0, 2, [0x10, 0]), END],
    "TYPE3.HEX": [prefix, record(0, 3, [0, 0, 0x20, 0]), END],
    "TYPE4.HEX": [prefix, record(0, 4, [0, 0]), END],
    "GAPS.HEX": [prefix, rec(0x2010, [0xc9]), END],
  };
  const text = Object.fromEntries(Object.entries(texts).map(([name, rows]) => [name, lines(rows)]));
  const { m, svc } = await inSession({ "RET.BIN": bin(0xc9) }, { text });
  const top = word(m, 6) & 0xff00;
  const cmds = [
    ...Object.keys(texts).filter(n => n !== "GAPS.HEX").flatMap(n => [`LOAD ${n}`, `LOAD ${n} 5000`]),
    "LOAD GAPS.HEX 0", "LOAD GAPS.HEX FF", "LOAD GAPS.HEX 7F0",
    "LOAD GAPS.HEX 800", "LOAD GAPS.HEX 8FF", "LOAD GAPS.HEX FFF8",
    `LOAD GAPS.HEX ${(top - 0x10).toString(16)}`, `LOAD GAPS.HEX ${top.toString(16)}`,
    "LOAD GAPS.HEX 10000", "LOAD GAPS.HEX $5000", "LOAD GAPS.HEX 0x5000", "LOAD GAPS.HEX 5000 X",
  ];
  for (const cmd of cmds) {
    ready(m, svc, "LOAD RET.BIN 6000", 0x6000);
    const before = tpaDigest(m);
    const result = line(m, cmd);
    assert.ok(refused(result), `${cmd}: ${result.out}`);
    assert.equal(tpaDigest(m), before, `${cmd}: entire destination unchanged`);
    assert.equal(runnable(m, svc), 0, `${cmd}: prior readiness cleared`);
    assert.ok(refused(line(m, "GO")), `${cmd}: bare GO refused`);
  }
});

test("MON3 damaged-table LOAD refusal also clears the previous bare GO target", async () => {
  const { m, svc } = await inSession({ "RET.BIN": bin(0xc9) });
  ready(m, svc, "LOAD RET.BIN 2000", 0x2000);
  const before = tpaDigest(m);
  // Inject the monitor's already-latched damage flag, not damage to the
  // tables themselves, to isolate this refusal branch.
  m.write((pageOf(m) << 8) + svc.symbols.DMG, 1);
  const opens = m.opens.length;
  assert.ok(refused(line(m, "LOAD RET.BIN 5000")));
  assert.equal(m.opens.length, opens, "damaged state refuses before opening the file");
  assert.equal(tpaDigest(m), before);
  assert.equal(runnable(m, svc), 0);
  assert.ok(refused(line(m, "GO")));
});
