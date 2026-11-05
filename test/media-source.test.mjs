import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageZeroDeclarations } from '../tools/lib/media-source.mjs';

test('media keeps the latch Contents caption from the actual separated and reflowed layout source', () => {
  const src = readFileSync(new URL('../src/layout.asm', import.meta.url), 'utf8');
  assert.deepEqual(pageZeroDeclarations(src), [
    { at: 0x40, name: 'LATCHV', what: 'shadow copy of the system latch' },
  ]);
});


test('media captions span wrapped blocks, preserve inline captions and do not cross declarations', () => {
  const src = [
    '; Context. shadow copy of the',
    '; system latch',
    '',
    'LATCHV EQU $0040',
    '; preceding text',
    'INLINE EQU $0041 ; explicit caption',
    'EMPTY EQU $0042',
    '',
    '; A caption cannot cross unrelated code.',
    '  nop',
    '',
    'OTHER EQU $0043',
  ].join('\n');
  assert.deepEqual(pageZeroDeclarations(src), [
    { at: 0x40, name: 'LATCHV', what: 'shadow copy of the system latch' },
    { at: 0x41, name: 'INLINE', what: 'explicit caption' },
    { at: 0x42, name: 'EMPTY', what: '' },
    { at: 0x43, name: 'OTHER', what: '' },
  ]);
  assert.equal(pageZeroDeclarations(src.replaceAll('\n', '\r\n'))[0].what, 'shadow copy of the system latch');
});
