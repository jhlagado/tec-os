import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'parse5';
import { ROOT, SITE, catalogue, CONTENT, markdownFiles } from './catalogue.mjs';
import { checkLinks, htmlFiles } from './site-links.mjs';
import { checkBranding } from './branding.mjs';

const out = join(ROOT, '.vitepress/dist');
const result = checkLinks(out, SITE);
assert.deepEqual(result.errors, [], result.errors.join('\n'));
assert.equal(readFileSync(join(out, 'CNAME'), 'utf8').trim(), 'tec-os.org');
readFileSync(join(out, '.nojekyll'));
const sourcePages = markdownFiles(CONTENT);
for (const file of sourcePages) readFileSync(join(out, relative(CONTENT, file).replace(/\.md$/, '.html')));
const sitemap = readFileSync(join(out, 'sitemap.xml'), 'utf8');
assert.ok(sitemap.includes(SITE + '/'), 'Canonical origin in sitemap');
assert.ok(!sitemap.includes('debug80.com'), 'No reference-site sitemap origin');
for (const file of htmlFiles(out)) {
  const path = relative(out, file);
  assert.ok(!/(?:^|\/)(editorial|_internal|archive|scripts|test)(?:\/|$)/.test(path), 'Private page: ' + path);
  const html = readFileSync(file, 'utf8');
  assert.deepEqual(checkBranding(html, { requireMark: path !== '404.html' }), [], 'Site branding: ' + path);
  assert.ok(!html.includes('Debug80 Docs'), 'Stale site branding: ' + path);
  const canonicals = [], urls = [];
  function inspect(node) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
    if (node.tagName === 'link' && attrs.rel === 'canonical') canonicals.push(attrs.href);
    if (node.tagName === 'meta' && attrs.property === 'og:url') urls.push(attrs.content);
    for (const child of node.childNodes ?? []) inspect(child);
  }
  inspect(parse(html));
  const expected = SITE + '/' + path.replaceAll('\\', '/').replace(/index\.html$/, '');
  assert.deepEqual(canonicals, path === '404.html' ? [] : [expected], 'Canonical URL: ' + path);
  assert.deepEqual(urls, path === '404.html' ? [] : [expected], 'Open Graph URL: ' + path);
}
const chunks = join(out, 'assets/chunks');
const search = readdirSync(chunks).find(name => name.startsWith('@localSearchIndexroot.') && name.endsWith('.js'));
assert.ok(search, 'Local search index generated');
const index = await import(new URL('../.vitepress/dist/assets/chunks/' + search, import.meta.url));
assert.ok(JSON.parse(index.default).documentCount >= sourcePages.length, 'Local search index contains the public pages');
for (const book of catalogue()) assert.ok(sitemap.includes(SITE + book.link), 'Book missing from sitemap: ' + book.id);
console.log(`Published output: ${result.pages} HTML pages, ${result.links} internal links/assets/fragments checked; canonical origin, search and publication boundaries valid.`);
