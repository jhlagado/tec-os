import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCompactSource } from '../tools/lib/style-compact.mjs';

const source = [
  '; Load the byte.',
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
  assert.deepEqual(rules(include + '\n' + source), []);
  assert.ok(rules('  ' + include + '\n' + source).includes('column'));
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
  const text = ['; Load the byte.', 'ENTRY:', '; Read the input.', '  ld a,(hl)', '  ret'].join('\n');
  assert.ok(rules(text).includes('density'));
  assert.deepEqual(rules(text.replace('  ret', '  ret'.padEnd(17) + '; return the byte')), []);
});
