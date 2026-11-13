import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { catalogue, CONTENT, markdownFiles, ROOT } from './catalogue.mjs';

const books = catalogue();
const files = markdownFiles(CONTENT);
for (const file of ['package.json', 'books.json', '.vitepress/config.mts', '.vitepress/theme/Mark.vue', '.vitepress/theme/index.ts', 'content/index.md', 'content/thorium/index.md', 'README.md']) {
  assert.ok(!/\btech-?os\b/i.test(readFileSync(join(ROOT, file), 'utf8')), 'Incorrect site spelling: ' + file);
}
for (const file of files) {
  const path = relative(CONTENT, file);
  assert.ok(!/(^|\/)(editorial|_internal|archive|scripts)(\/|$)/.test(path), 'Private content in publication: ' + path);
}
assert.equal(readFileSync(join(ROOT, 'public/CNAME'), 'utf8').trim(), 'tec-os.org');
if (process.argv.includes('--import')) {
  const origin = JSON.parse(readFileSync(join(ROOT, 'provenance.json'), 'utf8'));
  assert.equal(origin.manuscript.length, 40, 'Original manuscript page count');
  for (const row of origin.manuscript) {
    const bytes = readFileSync(join(ROOT, row.destination));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, 'Imported page differs: ' + row.destination);
  }
  console.log('Original import: all 40 manuscript pages match their recorded hashes.');
}
console.log(`${books.length} book(s), ${files.length} public Markdown pages; catalogue and publication boundaries valid.`);
