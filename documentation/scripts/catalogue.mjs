import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT = join(ROOT, 'content');
export const SITE = 'https://tec-os.org';

export function markdownFiles(dir) {
  return readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? markdownFiles(path) : name.endsWith('.md') ? [path] : [];
  });
}

export function catalogue(root = ROOT) {
  const books = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'));
  const ids = new Set();
  const content = join(root, 'content');
  return books.map(book => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id) || ids.has(book.id)) throw new Error('Invalid or duplicate book id: ' + book.id);
    ids.add(book.id);
    if (![book.title, book.label, book.parent, book.description].every(x => typeof x === 'string' && x.trim())) throw new Error('Incomplete book: ' + book.id);
    const directory = join(content, book.id);
    const index = join(directory, 'index.md');
    readFileSync(index);
    const chapters = markdownFiles(directory).filter(path => path !== index).map(path => {
      const { data } = matter(readFileSync(path, 'utf8'));
      if (data.parent !== book.parent || typeof data.title !== 'string' || !Number.isFinite(Number(data.nav_order))) throw new Error('Invalid chapter front matter: ' + relative(content, path));
      return { text: data.title, link: '/' + relative(content, path).replaceAll('\\', '/').replace(/\.md$/, '.html'), group: data.nav_group ?? 'Chapters', order: Number(data.nav_order) };
    }).sort((a, b) => a.order - b.order || a.link.localeCompare(b.link));
    const groups = [];
    for (const chapter of chapters) {
      let group = groups.at(-1);
      if (group?.text !== chapter.group) { group = { text: chapter.group, collapsed: false, items: [] }; groups.push(group); }
      group.items.push({ text: chapter.text, link: chapter.link });
    }
    return { ...book, link: '/' + book.id + '/', sidebar: [{ text: book.title, link: '/' + book.id + '/' }, ...groups], chapters };
  });
}
