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
