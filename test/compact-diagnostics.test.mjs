import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { diagnoseCompactSource } from '../tools/lib/style-diagnostics.mjs';
import { checkCompactSource } from '../tools/lib/style-compact.mjs';
import { LIMITS } from '../tools/lib/style.mjs';

const note = code => code.padEnd(17) + '; keep the byte';
const good = ['; Return the byte.', '', 'ENTRY:', note("  ld a,'A'"), note('  ret')].join('\n');
const sparse = ['; Return unchanged.', '', 'ENTRY:', ...Array(8).fill('  nop')].join('\n');
const diagnose = (text, entries = ['ENTRY'], exceptions = {}, name = 'X.ASM') =>
  diagnoseCompactSource(text, name, entries, exceptions);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fatal(rule, text, entries = ['ENTRY'], exceptions = {}, name = 'X.ASM') {
  const result = diagnose(text, entries, exceptions, name);
  const faults = result.raw.faults.filter(fault => fault.rule === rule);
  assert.ok(faults.length, 'actual raw fault ' + rule);
  for (const fault of faults) assert.ok(result.fatalMechanicalFaults.includes(fault));
  assert.ok(result.quantityDiagnostics.every(fault => fault.rule !== rule));
}

test('compact diagnostics retains the complete raw checker result', () => {
  for (const text of [good, sparse, good.replace('  ret', '  RET')]) {
    assert.deepEqual(diagnose(text).raw, checkCompactSource(text, 'X.ASM', ['ENTRY']));
  }
});

test('compact diagnostics reports sparse quantity faults without acceptance', () => {
  const result = diagnose(sparse);
  assert.deepEqual(result.quantityDiagnostics.map(f => f.rule), ['density', 'run']);
  assert.deepEqual(result.fatalMechanicalFaults, []);
  assert.equal(result.raw.longestRun, 8);
  assert.equal(result.classification, 'diagnostic-only');
});

test('compact diagnostics retains adequately annotated counts', () => {
  const { raw } = diagnose(good);
  assert.equal(raw.codeLines, 2);
  assert.equal(raw.commented, 2);
  assert.equal(raw.share, 1);
  assert.equal(raw.longestRun, 0);
  assert.deepEqual(raw.faults, []);
});

test('compact diagnostics reports every long run across labels directives and blanks', () => {
  const rows = ['; Header.', '', 'ENTRY:', '  nop', '', 'ALIAS:', '  DB 0',
    '  ORG $100', ...Array(4).fill('  nop'), '', '; Second group.', '', ...Array(6).fill('  nop')];
  const { allLongRuns } = diagnose(rows.join('\n'));
  assert.deepEqual(allLongRuns.map(r => r.instructions), [[4, 9, 10, 11, 12], [16, 17, 18, 19, 20, 21]]);
  assert.deepEqual(allLongRuns.map(r => [r.start, r.end, r.length]), [[4, 12, 5], [16, 21, 6]]);
});

test('compact diagnostics resets runs on comments without inline credit', () => {
  const text = ['; Header.', '', 'ENTRY:', ...Array(4).fill('  nop'), '', '; Split.', '', ...Array(4).fill('  nop')].join('\n');
  const result = diagnose(text);
  assert.deepEqual(result.allLongRuns, []);
  assert.equal(result.raw.longestRun, 4);
  assert.equal(result.raw.commented, 0);
  assert.ok(result.quantityDiagnostics.some(f => f.rule === 'density'));
});

test('compact diagnostics binds run identities to exact source bytes', () => {
  const first = diagnose(sparse), same = diagnose(sparse), changed = diagnose(sparse + '\n');
  assert.equal(first.sourceSha256, hash(Buffer.from(sparse, 'latin1')));
  assert.deepEqual(first.allLongRuns, same.allLongRuns);
  assert.notEqual(first.sourceSha256, changed.sourceSha256);
  assert.notEqual(first.allLongRuns[0].id, changed.allLongRuns[0].id);
  assert.notEqual(first.sourceSha256, diagnose(sparse.replace(/\n/g, '\r\n')).sourceSha256);
  assert.equal(diagnose('; Café.').sourceSha256, hash(Buffer.from('; Café.', 'latin1')));
  assert.throws(() => diagnose('; \u0100.'), /lossless Latin1/);
});

test('compact diagnostics preserves quoted semicolons literal case and declarations', () => {
  const text = good + '\nDATA: DB "A;B"\nCOUNT EQU 2';
  const before = text;
  assert.deepEqual(diagnose(text).raw.faults, []);
  assert.equal(text, before);
  const literal = good.replace("'A'", "';'");
  assert.equal(diagnose(literal).raw.commented, 2);
});

test('compact diagnostics retains frozen thresholds and source cap', () => {
  assert.deepEqual(LIMITS, { share: 0.4, run: 4, bytes: 24576, column: 33, end: 80 });
  assert.deepEqual(diagnose(good).thresholds, { share: 0.4, run: 4 });
  const text = ';'.padEnd(24576, 'x');
  assert.ok(!diagnose(text, []).raw.faults.some(f => f.rule === 'size'));
  assert.ok(diagnose(text + 'x', []).fatalMechanicalFaults.some(f => f.rule === 'size'));
});

test('compact diagnostics never returns a production acceptance verdict', () => {
  for (const text of [good, sparse, '']) {
    const result = diagnose(text);
    assert.deepEqual(Object.keys(result).sort(), ['raw', 'quantityDiagnostics', 'fatalMechanicalFaults',
      'allLongRuns', 'sourceSha256', 'configurationDigest', 'thresholds', 'semanticReviewRequired', 'classification'].sort());
    assert.equal(result.semanticReviewRequired, true);
    assert.equal(result.classification, 'diagnostic-only');
  }
});

test('compact diagnostics preserves exact configuration identities', () => {
  const entries = ['ENTRY'], exceptions = { lines: [], headers: {} };
  const snapshot = JSON.stringify({ entries, exceptions });
  const first = diagnose(good, entries, exceptions);
  assert.equal(first.configurationDigest, hash(Buffer.from(snapshot, 'utf8')));
  assert.equal(JSON.stringify({ entries, exceptions }), snapshot);
  assert.notEqual(first.configurationDigest, diagnose(good, []).configurationDigest);
  assert.equal(first.configurationDigest, diagnose(good, ['ENTRY'], { lines: [], headers: {} }).configurationDigest);
});

test('compact diagnostics keeps blank fatal', () => fatal('blank', good.replace('\n\nENTRY:', '\nENTRY:')));
test('compact diagnostics keeps block-after fatal', () => fatal('block-after', '; Fact.\n  nop', []));
test('compact diagnostics keeps block-before fatal', () => fatal('block-before', '  nop\n; Fact.', []));
test('compact diagnostics keeps case fatal', () => fatal('case', good.replace('  ret', '  RET')));
test('compact diagnostics keeps column fatal', () => fatal('column', good.replace(/ +; keep the byte/, ' ; keep the byte')));
test('compact diagnostics keeps continuation fatal', () => fatal('continuation', ' '.repeat(17) + '; Detached.', []));
test('compact diagnostics keeps end fatal', () => fatal('end', '; '.padEnd(41, 'x'), []));
test('compact diagnostics keeps exception fatal', () => fatal('exception', good, ['ENTRY'], { lines: ['UNUSED: DB 0'] }));
test('compact diagnostics keeps header fatal', () => fatal('header', good.replace('; Return the byte.\n', '')));
test('compact diagnostics keeps header-length fatal', () => fatal('header-length', good.replace('; Return the byte.', Array(16).fill('; Contract.').join('\n'))));
test('compact diagnostics keeps inventory fatal', () => fatal('inventory', good, ['ABSENT']));
test('compact diagnostics keeps label-line fatal', () => fatal('label-line', good.replace('ENTRY:\n', 'ENTRY:')));
test('compact diagnostics keeps name fatal', () => fatal('name', good, ['ENTRY'], {}, 'TOOLONGNAME.ASM'));
test('compact diagnostics keeps size fatal', () => fatal('size', ';'.padEnd(24577, 'x'), []));
test('compact diagnostics keeps spaces fatal', () => fatal('spaces', good.replace('  ret', '\tret')));
test('compact diagnostics keeps spacing fatal', () => fatal('spacing', good.replace('  ret', '   ret')));
