// Sized DIR's original workloads and predetermined cost observations.
// Guest cycles measure the serial workload at 4 MHz. Host timings and
// deliberately altered services are not production performance claims.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createContainer } from "../tools/lib/container.mjs";
import { volume } from "./lib/fixtures.mjs";
import { cacheState } from "./lib/cache-pending.mjs";
import { SHELL, at, code, pageOf, shellCard, shellMachine, shellVariant, word } from "./lib/shell.mjs";

const PROMPT = /\r\n\d*[A-P](:\S*)?>$/;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const evidence = process.env.DIR_EVIDENCE;
let serial = 0;

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
  const service = { kind: variant ? "variant" : "normal", rawBytes: svc.file.length, rawSha256: sha(svc.file), imageBytes: svc.image,
    variant: variant ? { ...variant, editsSha256: sha(Buffer.from(JSON.stringify(variant.edits))) } : null };
  const inputSha256 = sha(image), stem = evidence ? resolve(evidence, `cost-${String(++serial).padStart(3, "0")}`) : null;
  if (stem) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(`${stem}.input.img.gz`, gzipSync(image));
    writeFileSync(`${stem}.shell.svc`, svc.file);
    writeFileSync(`${stem}.prepared.json`, JSON.stringify({ inputBytes: image.length, inputSha256, service, n, large }) + "\n");
  }
  let m = null, failure = null, complete = false, current = null, restore = null;
  const commands = [];
  try {
    if (!variant) assert.deepEqual(Buffer.from(svc.file), readFileSync(new URL("../dist/files/SHELL.SVC", import.meta.url)));
    m = shellMachine(image, { noWait: true });
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
      if (current) {
        const block = m.sd.resolveAddress(arg) / 512;
        assert.ok(Number.isInteger(block)); assert.equal(payload.length, 512);
        current.sdReads++;
        current.readBlocks.set(block, (current.readBlocks.get(block) ?? 0) + 1);
      }
      return payload;
    };
    m.sd.commitWrite = () => {
      const state = m.sd.writeState;
      const attempt = state ? { start: state.start, bytes: state.buffer.length, sha256: sha(Buffer.from(state.buffer)) } : null;
      const result = commit();
      if (current) { current.sdWriteAttempts++; current.writes.push({ ...attempt, accepted: m.sd.pendingResponse[0] === 5 }); }
      return result;
    };
    restore = () => { m.step = step; m.sd.readBlock = read; m.sd.commitWrite = commit; };
    const listing = (line, role) => {
      const record = { line, role, searchFirst: 0, searchNext: 0, size: 0, sdReads: 0, sdWriteAttempts: 0, writes: [], readBlocks: new Map(), cacheBefore: cache(m) };
      const before = Buffer.from(image), start = m.cycles;
      let commandFailure = null;
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
        assert.deepEqual(Buffer.from(image), before);
        assert.deepEqual(m.violations, []);
        assert.equal(code(m), 0);
        assert.equal(record.sdWriteAttempts, 0);
        return { text: m.text(m.mark), cycles: m.cycles - start, counters: record };
      } catch (error) { commandFailure = error; throw error; }
      finally {
        current = null;
        const captureErrors = [];
        const retain = (part, action) => {
          try { action(); }
          catch (error) { captureErrors.push({ part, name: error.name, message: error.message }); }
        };
        record.cycles = m.cycles - start;
        record.inputSha256 = sha(before); record.finalSha256 = sha(image);
        record.readBlocks = [...record.readBlocks].sort((a, b) => a[0] - b[0]);
        record.error = commandFailure ? { name: commandFailure.name, message: commandFailure.message } : null;
        record.captureErrors = captureErrors;
        commands.push(record);
        retain("result", () => { record.result = code(m); });
        retain("cache-after", () => { record.cacheAfter = m.classicBankIn ? cache(m) : null; });
        if (stem) retain("raw console", () => writeFileSync(`${stem}.${role}.console.bin`, Buffer.from(m.text(m.mark), "latin1")));
        if (captureErrors.length) {
          console.error(JSON.stringify({ scope: "cost command evidence failure", primary: record.error, captureErrors }));
          if (!commandFailure) throw new Error(`cost command capture failed: ${JSON.stringify(captureErrors)}`);
        }
      }
    };
    const preparation = listing("DIR /W", "preparation-wide");
    const wide = listing("DIR /W", "measured-wide"), sized = listing("DIR", "measured-sized");
    // All end cycles are already captured; these host checks step no guest.
    checkWide(preparation.text, inserted, freeBytes);
    checkWide(wide.text, inserted, freeBytes);
    assert.deepEqual(rows(sized.text), wanted, "the complete legacy-partition order and every independently known size");
    const total = inserted.reduce((sum, [, bytes]) => sum + bytes, 0);
    assert.match(sized.text, new RegExp(`\\r\\n${inserted.length} files, ${total} bytes\\r\\n`));
    assert.match(sized.text, new RegExp(`\\r\\n${freeBytes} free on B:WORK\\r\\n`));
    assert.equal(sha(image), inputSha256);
    // Functional workload completion; the outer positive cap is checked later.
    complete = true;
    return { n, large, files: inserted.length, right: true, dir: sized.cycles / 4000, wide: wide.cycles / 4000,
      ratio: sized.cycles / wide.cycles, service, commands };
  } catch (error) { failure = error; throw error; }
  finally {
    restore?.();
    if (stem) {
      const captureErrors = [];
      const retain = (part, action) => {
        try { action(); }
        catch (error) { captureErrors.push({ part, name: error.name, message: error.message }); }
      };
      retain("full console", () => writeFileSync(`${stem}.console.bin`, Buffer.from(m ? m.text(0) : "", "latin1")));
      if (sha(image) !== inputSha256) retain("changed card", () => writeFileSync(`${stem}.final.img.gz`, gzipSync(image)));
      retain("metadata", () => writeFileSync(`${stem}.json`, JSON.stringify({ complete: complete && !failure && !captureErrors.length,
        completionScope: "functional workload only; outer positive cap is checked later",
        inputBytes: image.length, inputSha256, finalSha256: sha(image), service, n, large,
        error: failure ? { name: failure.name, message: failure.message } : null, captureErrors, commands }, null, 2) + "\n"));
      if (captureErrors.length) {
        console.error(JSON.stringify({ scope: "cost final evidence failure", primary: failure ? String(failure) : null, captureErrors }));
        if (!failure) throw new Error(`cost final capture failed: ${JSON.stringify(captureErrors)}`);
      }
    }
  }
}

for (const item of [
  { title: "S2-9 g8m time", n: 451, large: 0, cap: 2.5 },
  { title: "S2-9 g8m large files", n: 251, large: 100, cap: 8 },
  { title: "S2-9 g8m all large", n: 0, large: 180, cap: 18 },
]) test(item.title, { timeout: 1_800_000 }, t => {
  const result = timed(item);
  t.diagnostic(JSON.stringify({ scope: "DIR initial cost diagnostic", role: "normal", title: item.title, cap: item.cap, withinHistoricalCap: result.ratio <= item.cap, ...result }));
  assert.ok(result.ratio <= item.cap, `${result.ratio} exceeds ${item.cap}`);
});

test("DIR cost observation: one bucket with full keys", { timeout: 1_800_000 }, async t => {
  const edits = [["  and $7F        ; 128 two-byte heads", "  xor a          ; one bucket"]];
  const svc = await shellVariant(edits), result = timed({ n: 451, svc, variant: { label: "one-bucket", edits } });
  t.diagnostic(JSON.stringify({ scope: "DIR initial cost diagnostic", role: "control", historicalCap: 2.5, exceedsHistoricalCap: result.ratio > 2.5, ...result }));
});

test("DIR cost observation: aggregation disabled with legacy searches", { timeout: 1_800_000 }, async t => {
  const edits = [["  inc a          ; enable after clearing", "  xor a          ; keep legacy mode"]];
  const svc = await shellVariant(edits), result = timed({ large: 180, svc, variant: { label: "aggregation-disabled", edits } });
  t.diagnostic(JSON.stringify({ scope: "DIR initial cost diagnostic", role: "control", historicalCap: 18, exceedsHistoricalCap: result.ratio > 18, ...result }));
});
