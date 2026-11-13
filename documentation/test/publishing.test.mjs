import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { catalogue } from '../scripts/catalogue.mjs';
import { checkLinks } from '../scripts/site-links.mjs';
import { checkBranding } from '../scripts/branding.mjs';

function temporary(run) {
  const root = mkdtempSync(join(tmpdir(), 'tec-os-publishing-'));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('an additional book gets its own ordered navigation and chapter groups', () => temporary(root => {
  const books = [{ id: 'first', title: 'First', label: 'First book', parent: 'First', description: 'First volume' }, { id: 'second', title: 'Second', label: 'Second book', parent: 'Second', description: 'Second volume' }];
  writeFileSync(join(root, 'books.json'), JSON.stringify(books));
  for (const book of books) {
    const dir = join(root, 'content', book.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.md'), '# ' + book.title);
    for (const n of [2, 1]) writeFileSync(join(dir, `${n}.md`), `---\ntitle: Chapter ${n}\nparent: ${book.parent}\nnav_order: ${n}\nnav_group: Reading\n---\n# Chapter ${n}`);
  }
  const result = catalogue(root);
  assert.deepEqual(result.map(book => book.link), ['/first/', '/second/']);
  assert.deepEqual(result[1].sidebar[1].items.map(item => item.link), ['/second/1.html', '/second/2.html']);
  assert.ok(!JSON.stringify(result[1].sidebar).includes('/first/'));
  books[1].id = '../private';
  writeFileSync(join(root, 'books.json'), JSON.stringify(books));
  assert.throws(() => catalogue(root), /Invalid or duplicate/);
}));

test('built link checks distinguish pages, assets, encoded fragments and absent targets', () => temporary(root => {
  mkdirSync(join(root, 'book'));
  writeFileSync(join(root, 'index.html'), '<a href="/book/">Book</a><a href="https://tec-os.org/book/#a%20b">Section</a><img src="/mark.svg"><a href="https://example.org/">External</a>');
  writeFileSync(join(root, 'book/index.html'), '<h1 id="a b">A</h1><a href="../">Home</a>');
  writeFileSync(join(root, 'mark.svg'), '<svg/>');
  assert.deepEqual(checkLinks(root, 'https://tec-os.org').errors, []);
  writeFileSync(join(root, 'index.html'), '<a href="/book/#missing">Missing fragment</a><img src="/missing.svg"><a href="/absent.html">Missing page</a>');
  const errors = checkLinks(root, 'https://tec-os.org').errors;
  assert.equal(errors.length, 3);
  assert.ok(errors.some(error => error.includes('missing fragment')));
  assert.ok(errors.some(error => error.includes('/missing.svg')));
  assert.ok(errors.some(error => error.includes('/absent.html')));
}));

test('rendered branding rejects misspellings in titles, metadata, marks and ordinary text', () => {
  const page = '<html><head><title>First session | tec-os</title><meta property="og:site_name" content="tec-os"></head><body><svg class="mark" aria-label="tec-os"></svg><h1>tec-os library</h1><pre>historical literal: TechOS</pre><script>const old = "Tech-OS";</script></body></html>';
  assert.deepEqual(checkBranding(page), []);
  for (const [from, to] of [
    ['First session | tec-os', 'First session | TechOS'],
    ['content="tec-os"', 'content="Tech-OS"'],
    ['aria-label="tec-os"', 'aria-label="TechOS"'],
    ['tec-os library', 'TechOS library']
  ]) assert.ok(checkBranding(page.replace(from, to)).length, `${from}: the incorrect spelling must fail`);
});
