// Sized DIR's cost against DIR /W on three G8M workloads, and two controls:
// shells altered to hash every name to one bucket and to keep the legacy
// engine. Guest cycles at 4 MHz on the serial console; emulator figures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContainer } from "../tools/lib/container.mjs";
import { volume } from "./lib/fixtures.mjs";
import { cacheState } from "./lib/cache-pending.mjs";
import { SHELL, at, code, pageOf, shellCard, shellMachine, shellVariant, word } from "./lib/shell.mjs";

const PROMPT = /\r\n\d*[A-P](:\S*)?>$/;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function hash(name) {
  const [base, ext = ""] = name.split(".");
  let h = 0;
  for (const value of Buffer.from(base.padEnd(8) + ext.padEnd(3), "latin1")) h = (((h << 1) | (h >> 7)) ^ (value & 127)) & 255;
  return h & 127;
}

function rows(text) {
  const found = [];
  for (const line of text.replaceAll("[more]\r      \r", "").split(/\r\n|\r/)) {
    if (!/^[^:>\x00-\x1f]*\S[^:>\x00-\x1f]* +\d+$/.test(line) && !/^[^ .:>\x00-\x1f]{1,8}\.[^ .:>\x00-\x1f]{3}\d+$/.test(line)) continue;
    assert.equal(line.length, 20, `filename row width: ${JSON.stringify(line)}`);
    assert.match(line.slice(12), /^ *\d{1,8}$/);
    found.push([line.slice(0, 12).trimEnd(), Number(line.slice(12))]);
  }
  return found;
}

function checkWide(text, inserted, freeBytes) {
  const names = inserted.map(([name]) => name), lines = [];
  for (let offset = 0; offset < names.length; offset += 6) {
    // At eighty columns the ROM uses six thirteen-column slots. Only
    // the sixth slot omits padding, including on the final partial row.
    lines.push(names.slice(offset, offset + 6).map((name, column) => column < 5 ? name.padEnd(12) : name).join(" "));
  }
  const actual = text.replaceAll("[more]\r      \r", "").split(/\r\n|\r/).filter(line => line.length);
  assert.deepEqual(actual, ["DIR /W", ...lines, `${names.length} files, ${Math.floor(freeBytes / 1024)}K free`, "B:WORK>"],
    "the complete wide inventory, order, six-column fields and count/free footer");
}

function cache(m) {
  const state = cacheState(m), bank = m.expand ? m.expand[1] : m.banks[0];
  return { queue: state.queue, dirty: state.dirty, round: state.round, position: state.position,
    pending: state.pending, any: state.any, depth: state.depth, busy: state.busy, error: state.error,
    tags: Array.from({ length: m.sym("NLINES") }, (_, i) => [...bank.slice(m.sym("CTAB") - 0x8000 + i * 4, m.sym("CTAB") - 0x8000 + i * 4 + 4)]) };
}

/**
 * B:WORK, a G8M, with LARGE files of 40 KiB, N of one record and BIG.DAT of
 * 100 KiB. One DIR /W first, then DIR /W and DIR timed. Both listings are
 * checked whole before any figure is used: every name, its order, each size,
 * the count, the total and the free space. Returns the cycles, the BDOS 17,
 * 18 and 35 calls and the card reads of each timed listing.
 */
function timed({ n = 0, large = 0, svc = SHELL, variant = null }) {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B" }], { drives: 4 });
  const b = volume(image, "B"), inserted = [];
  for (let i = 0; i < large; i++) {
    const name = `L${String(i).padStart(4, "0")}.DAT`;
    b.write(name, new Uint8Array(40960).fill(3)); inserted.push([name, 40960]);
  }
  for (let i = 0; i < n; i++) {
    const name = `F${String(i).padStart(4, "0")}.DAT`;
    b.write(name, new Uint8Array(128).fill(1)); inserted.push([name, 128]);
  }
  b.write("BIG.DAT", new Uint8Array(102400).fill(2)); inserted.push(["BIG.DAT", 102400]);
  const marks = new Set(inserted.filter(([, bytes]) => bytes > 128).map(([name]) => hash(name)));
  const wanted = [...inserted.filter(([name]) => !marks.has(hash(name))), ...inserted.filter(([name]) => marks.has(hash(name)))];
  const freeBytes = b.freeBytes();
  shellCard({}, { image, shell: svc.file });
  const inputSha256 = sha(image);
  if (!variant) assert.deepEqual(Buffer.from(svc.file), readFileSync(new URL("../dist/files/SHELL.SVC", import.meta.url)), "the card's shell is the one media builds");
  const m = shellMachine(image, { noWait: true });
  const quiet = () => {
    if (!m.classicBankIn || !m.ready()) return false;
    const p = pageOf(m), s = svc.symbols;
    return p && !word(m, p + s.LPOS) && !m.read(p + s.SOPEN) && !m.read(p + s.STSKIP);
  };
  m.runUntil(() => quiet() && PROMPT.test(m.text(0)), 2_000_000_000, "completed startup prompt");
  at(m, "B:");
  assert.ok(m.classicBankIn);
  assert.equal(cacheState(m).queue.length, 0);
  const step = m.step.bind(m), read = m.sd.readBlock.bind(m.sd), commit = m.sd.commitWrite.bind(m.sd);
  let current = null;
  m.step = () => {
    if (current && m.pc === m.sym("BENTRY")) {
      const c = m.cpu.cpu.c;
      if (c === 17) current.searchFirst++;
      if (c === 18) current.searchNext++;
      if (c === 35) current.size++;
    }
    return step();
  };
  m.sd.readBlock = arg => {
    const payload = read(arg);
    if (current) current.sdReads++;
    return payload;
  };
  m.sd.commitWrite = () => {
    if (current) current.sdWrites++;
    return commit();
  };
  const listing = line => {
    const record = { line, searchFirst: 0, searchNext: 0, size: 0, sdReads: 0, sdWrites: 0, cacheBefore: cache(m) };
    const before = Buffer.from(image), start = m.cycles;
    m.mark = m.output.length;
    current = record;
    try {
      m.type(`${line}\r`);
      for (;;) {
        const more = () => /\[more\]$/.test(m.text(m.mark));
        m.runUntil(() => (m.waitingForInput() && more()) || (quiet() && PROMPT.test(m.text(m.mark))), 20_000_000_000, line);
        if (!more()) break;
        const length = m.output.length;
        m.type(" ");
        m.runUntil(() => m.output.length > length + 12, 400_000_000, "pager reply");
      }
    } finally { current = null; }
    record.cycles = m.cycles - start;
    record.cacheAfter = cache(m);
    assert.deepEqual(Buffer.from(image), before, "a listing leaves the card as it was");
    assert.deepEqual(m.violations, []);
    assert.equal(code(m), 0);
    assert.equal(record.sdWrites, 0, "a listing writes nothing");
    return { text: m.text(m.mark), record };
  };
  try {
    const preparation = listing("DIR /W"), wide = listing("DIR /W"), sized = listing("DIR");
    // The cycles are taken; these checks step no guest.
    checkWide(preparation.text, inserted, freeBytes);
    checkWide(wide.text, inserted, freeBytes);
    assert.deepEqual(rows(sized.text), wanted, "the complete legacy-partition order and every independently known size");
    const total = inserted.reduce((sum, [, bytes]) => sum + bytes, 0);
    assert.match(sized.text, new RegExp(`\\r\\n${inserted.length} files, ${total} bytes\\r\\n`));
    assert.match(sized.text, new RegExp(`\\r\\n${freeBytes} free on B:WORK\\r\\n`));
    assert.equal(sha(image), inputSha256);
    return { n, large, files: inserted.length, marked: inserted.filter(([name]) => marks.has(hash(name))).length,
      dirMs: sized.record.cycles / 4000, wideMs: wide.record.cycles / 4000, ratio: sized.record.cycles / wide.record.cycles,
      shell: { bytes: svc.file.length, sha256: sha(svc.file), variant },
      commands: [preparation.record, wide.record, sized.record] };
  } finally { m.step = step; m.sd.readBlock = read; m.sd.commitWrite = commit; }
}

/** The fields of a result worth printing: the cache's state stays out of the line. */
const brief = r => ({ ...r, commands: r.commands.map(({ cacheBefore, cacheAfter, ...c }) => ({ ...c, queued: [cacheBefore.queue.length, cacheAfter.queue.length], dirty: [cacheBefore.any, cacheAfter.any] })) });
const sizedListing = r => r.commands[2];

const WORKLOADS = [
  { title: "S2-9 g8m time", n: 451, large: 0, cap: 2.5 },
  { title: "S2-9 g8m large files", n: 251, large: 100, cap: 8 },
  { title: "S2-9 g8m all large", n: 0, large: 180, cap: 18 },
];
// Each workload is measured once: a control reads the same figures its row asserts.
const measured = new Map();
const normal = item => {
  if (!measured.has(item.title)) measured.set(item.title, timed(item));
  return measured.get(item.title);
};

// The table engine: the marks search and the two output searches, and no
// BDOS 35, whatever the files' sizes.
for (const item of WORKLOADS) test(item.title, { timeout: 1_800_000 }, t => {
  const result = normal(item);
  t.diagnostic(JSON.stringify({ title: item.title, cap: item.cap, ...brief(result) }));
  assert.ok(result.ratio <= item.cap, `DIR ${result.dirMs.toFixed(0)} ms, ${result.ratio.toFixed(2)} times DIR /W's ${result.wideMs.toFixed(0)}, over ${item.cap}`);
  assert.equal(sizedListing(result).searchFirst, 3, "three searches");
  assert.equal(sizedListing(result).size, 0, "no BDOS 35");
});

// The controls. Each first gives the whole listing right, as timed checks,
// and is then compared with the unaltered shell on the same card. Neither
// claims a bound of its own: the rows above hold the caps.

test("DIR cost control: one bucket for every name costs more than 128", { timeout: 1_800_000 }, async t => {
  const edits = [["  and $7F        ; 128 two-byte heads", "  xor a          ; one bucket"]];
  const svc = await shellVariant(edits), base = normal(WORKLOADS[0]);
  const result = timed({ n: 451, svc, variant: "one bucket" });
  t.diagnostic(JSON.stringify({ control: "one bucket", normalRatio: base.ratio, overCap: result.ratio > WORKLOADS[0].cap, ...brief(result) }));
  assert.equal(sizedListing(result).searchFirst, 3, "still the table engine");
  assert.equal(sizedListing(result).size, 0);
  assert.ok(sizedListing(result).cycles > sizedListing(base).cycles, `${sizedListing(result).cycles} cycles against ${sizedListing(base).cycles}`);
});

test("DIR cost control: the legacy engine sizes each large file by BDOS 35 and costs more", { timeout: 1_800_000 }, async t => {
  const edits = [["  inc a          ; enable after clearing", "  xor a          ; keep legacy mode"]];
  const svc = await shellVariant(edits), base = normal(WORKLOADS[2]);
  const result = timed({ large: 180, svc, variant: "legacy engine" });
  t.diagnostic(JSON.stringify({ control: "legacy engine", normalRatio: base.ratio, overCap: result.ratio > WORKLOADS[2].cap, ...brief(result) }));
  assert.equal(sizedListing(result).size, result.marked, "one BDOS 35 for each file of more than one entry");
  assert.ok(sizedListing(result).searchFirst > result.marked, "and a search begun again after each");
  assert.ok(sizedListing(result).cycles > sizedListing(base).cycles, `${sizedListing(result).cycles} cycles against ${sizedListing(base).cycles}`);
});
