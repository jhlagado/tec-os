import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkCompactSource } from './style-compact.mjs';
import { LIMITS, parseLine } from './style.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonDigest = value => digest(Buffer.from(JSON.stringify(value), 'utf8'));

/** Complete raw diagnostics and source-bound runs for lossless Latin1 text. */
export function diagnoseCompactSource(text, name, entries = [], exceptions = {}) {
  assert.equal(typeof text, 'string', 'source text required');
  const bytes = Buffer.from(text, 'latin1');
  assert.equal(bytes.toString('latin1'), text, 'lossless Latin1 source required');
  const raw = checkCompactSource(text, name, entries, exceptions);
  const sourceSha256 = digest(bytes);
  const configurationDigest = jsonDigest({ entries, exceptions });
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const allLongRuns = [];
  let instructions = [];
  let codeLines = 0, commented = 0, longestRun = 0;
  const finish = () => {
    longestRun = Math.max(longestRun, instructions.length);
    if (instructions.length > LIMITS.run) {
      const run = { start: instructions[0], end: instructions.at(-1),
        instructions, length: instructions.length };
      allLongRuns.push({ ...run, id: jsonDigest({ sourceSha256, ...run }) });
    }
    instructions = [];
  };
  for (const [index, line] of lines.entries()) {
    const parsed = parseLine(line);
    if (parsed.kind === 'code') {
      codeLines++;
      if (parsed.comment >= 0) { commented++; finish(); }
      else instructions.push(index + 1);
    } else if (parsed.kind === 'comment') finish();
    // Labels, blanks, data and directives leave the instruction run open.
  }
  finish();
  const observed = { codeLines, commented,
    share: codeLines ? commented / codeLines : 1, longestRun };
  for (const [key, value] of Object.entries(observed)) {
    assert.equal(value, raw[key], 'raw count parity: ' + key);
  }
  const quantity = fault => fault.rule === 'density' || fault.rule === 'run';
  return {
    raw,
    quantityDiagnostics: raw.faults.filter(quantity),
    fatalMechanicalFaults: raw.faults.filter(fault => !quantity(fault)),
    allLongRuns,
    sourceSha256,
    configurationDigest,
    thresholds: { share: LIMITS.share, run: LIMITS.run },
    semanticReviewRequired: true,
    classification: 'diagnostic-only',
  };
}
