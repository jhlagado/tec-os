import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCompactSource } from '../tools/lib/style-compact.mjs';

const source = [
  '; Load the byte.',
  '',
  'ENTRY:',
  "  ld a,'A'".padEnd(17) + '; keep the literal',
  '',
  'INNER:',
  '  ret'.padEnd(17) + '; done',
].join('\n');

const rules = (text) => checkCompactSource(text, 'X.ASM', ['ENTRY']).faults.map(({ rule }) => rule);

test('compact layout checks routine headers and preserves literal case', () => {
  assert.deepEqual(rules(source), []);
  assert.ok(rules(source.replace('; Load the byte.\n', '')).includes('header'));
  assert.ok(rules(source.replace("ld a,'A'", "LD A,'A'")).includes('case'));
  assert.ok(rules(source.replace('  ret', '\tret')).includes('spaces'));
  assert.ok(rules(source.replace(/ +; done/, ' ; done')).includes('column'));
  assert.ok(rules(source.replace('\n\nINNER:', '\nINNER:')).includes('blank'));
});

test('%INCLUDE starts at the left margin', () => {
  const include = '%INCLUDE "file.asm"';
  assert.deepEqual(rules(include + '\n\n' + source), []);
  assert.ok(rules('  ' + include + '\n\n' + source).includes('column'));
});

test('column-18 notes continue an adjacent inline note', () => {
  const continuation = ' '.repeat(17) + '; continued';
  assert.deepEqual(rules(source + '\n' + continuation + '\n' + continuation), []);
  for (const gap of ['\n', '\n\n', '\n; standalone\n']) {
    assert.ok(rules(source.replace(/ +; done$/, '') + gap + continuation).includes('continuation'));
  }
  assert.ok(rules(source + '\n\n' + continuation).includes('continuation'));
});

test('standalone notes do not count toward inline coverage', () => {
  const text = ['; Load the byte.', '', 'ENTRY:', '', '; Read the input.', '', '  ld a,(hl)', '  ret'].join('\n');
  assert.ok(rules(text).includes('density'));
  assert.deepEqual(rules(text.replace('  ret', '  ret'.padEnd(17) + '; return the byte')), []);
});


test('code labels require blanks after headers and between local or consecutive aliases', () => {
  assert.ok(rules(source.replace('; Load the byte.\n\n', '; Load the byte.\n')).includes('blank'));
  const aliases = source.replace('ENTRY:', 'ENTRY:\n\n.LOCAL:\n\nALIAS:');
  assert.deepEqual(rules(aliases), []);
  for (const label of ['.LOCAL:', 'ALIAS:']) {
    assert.ok(rules(aliases.replace('\n\n' + label, '\n' + label)).includes('blank'), label);
  }
  assert.ok(rules(source.replace('ENTRY:\n', 'ENTRY: ')).includes('label-line'));
});

test('only the nearest margin header across one blank belongs to an entry', () => {
  for (const middle of ['  nop', 'DATA: DB 0', '  ORG $100', 'OTHER:', 'ALIAS:', '']) {
    const text = source.replace('; Load the byte.\n\n', '; Load the byte.\n\n' + middle + '\n\n');
    assert.ok(rules(text).includes('header'), middle || 'extra blank');
  }
  assert.ok(rules(source.replace('; Load the byte.\n\n', '; Load the byte.\n')).includes('header'));
  assert.ok(rules(source.replace('; Load the byte.\n', '')).includes('header'));
});

test('margin blocks have blanks on both sides and may meet a file boundary', () => {
  assert.deepEqual(rules(source + '\n\n; Final note.'), []);
  assert.ok(rules(source + '\n; Final note.').includes('block-before'));
  assert.ok(rules(source.replace('; Load the byte.\n\n', '; Load the byte.\n')).includes('block-after'));
  const between = source.replace('\n\nINNER:', '\n\n; Internal step.\n\nINNER:');
  assert.deepEqual(rules(between), []);
  assert.ok(rules(between.replace('; Internal step.\n\n', '; Internal step.\n')).includes('block-after'));
});

test('data labels retain their declaration conventions without routine headers', () => {
  assert.deepEqual(rules(source + '\nDATA:\n  DB 0\nNEXT: DB 1\nCOUNT EQU 2'), []);
});

test('header exceptions match exact counts across the blank and stale entries fail', () => {
  const text = source.replace('; Load the byte.', Array.from({length:16}, () => '; Caller contract.').join('\n'));
  const check = exceptions => checkCompactSource(text, 'X.ASM', ['ENTRY'], exceptions).faults.map(f=>f.rule);
  assert.ok(check({}).includes('header-length'));
  assert.deepEqual(check({headers:{ENTRY:16}}), []);
  assert.ok(check({headers:{ENTRY:17}}).includes('exception'));
  assert.ok(checkCompactSource(source, 'X.ASM', ['ENTRY'], {headers:{ENTRY:16}}).faults.some(f=>f.rule==='exception'));
  assert.ok(checkCompactSource(source, 'X.ASM', ['ENTRY'], {lines:['; Absent line.']}).faults.some(f=>f.rule==='exception'));
});

test('the source cap remains 24576 bytes with one byte over refused', () => {
  const text = source + '\n\n' + '; '.padEnd(24576 - Buffer.byteLength(source) - 2, 'x');
  const check = text => checkCompactSource(text, 'X.ASM', ['ENTRY'], {lines:[text.split('\n').at(-1)]}).faults.map(f=>f.rule);
  assert.equal(Buffer.byteLength(text), 24576);
  assert.deepEqual(check(text), []);
  assert.ok(check(text+'x').includes('size'));
});
