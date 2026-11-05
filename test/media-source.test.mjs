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
