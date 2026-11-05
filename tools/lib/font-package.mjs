// Fixed inputs for the selected font. Validate before publishing generated files.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fontBytes} from './font.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function fontPackage(root) {
  const font=Buffer.from(fontBytes(root));
  assert.equal(sha(font),'5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8','selected font identity');
  const original=readFileSync(resolve(root,'format/font-original.bin'));
  assert.equal(sha(original),'43eb0ec9a8513a670df112948435801b9ae91874e1d17f1283d8990e586e0fb0','original font identity');
  assert.equal(sha(readFileSync(resolve(root,'format/font5x7-original.txt'))),'ba4aaea026956d45e384de39e622a02d5b672e3df17f74714732bb05a27c3c3e','original source identity');
  const notices=readFileSync(resolve(root,'format/FONT-NOTICES.txt'));
  validateFontNotices(notices);
  return {font,original,notices};
}
/** Exact full copyright, conditions, disclaimer, origin limits and edits. */
export function validateFontNotices(notices) {
  assert.equal(sha(notices),'36ab503d3fef3a231cbfcced867e1089089c1e7519da7f6fb3666d7c9993d870','complete selected font notices');
}
