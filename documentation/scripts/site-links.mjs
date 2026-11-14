import { parse } from 'parse5';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
  if (node.content) walk(node.content, visit);
}

export function htmlFiles(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? htmlFiles(path) : name.endsWith('.html') ? [path] : [];
  });
}

export function checkLinks(directory, origin) {
  const root = resolve(directory);
  const files = htmlFiles(root);
  const pages = new Map();
  const errors = [];
  let checked = 0;
  for (const file of files) {
    const ids = new Set(), links = [];
    const document = parse(readFileSync(file, 'utf8'));
    walk(document, node => {
      const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
      if (attrs.id) ids.add(attrs.id);
      if (node.tagName === 'a' && attrs.name) ids.add(attrs.name);
      for (const name of ['href', 'src', 'poster']) if (attrs[name]) links.push(attrs[name]);
      if (attrs.srcset) for (const item of attrs.srcset.split(',')) links.push(item.trim().split(/\s+/)[0]);
    });
    pages.set(file, { ids, links });
  }
  for (const [file, { links }] of pages) {
    const source = '/' + relative(root, file).split(sep).join('/');
    const base = new URL(source, origin);
    for (const link of links) {
      if (/^(?:mailto:|tel:|data:|javascript:|blob:)/i.test(link)) continue;
      let url;
      try { url = new URL(link, base); } catch { errors.push(`${source}: invalid URL ${link}`); continue; }
      if (url.origin !== origin) continue;
      checked++;
      let path;
      try { path = resolve(root, '.' + decodeURIComponent(url.pathname)); } catch { errors.push(`${source}: invalid path ${link}`); continue; }
      if (path !== root && !path.startsWith(root + sep)) { errors.push(`${source}: path escapes output: ${link}`); continue; }
      if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
      else if (!existsSync(path) && !/\.[^/]+$/.test(path) && existsSync(path + '.html')) path += '.html';
      if (!existsSync(path)) { errors.push(`${source}: missing ${link}`); continue; }
      if (url.hash && pages.has(path)) {
        let id;
        try { id = decodeURIComponent(url.hash.slice(1)); } catch { errors.push(`${source}: invalid fragment ${link}`); continue; }
        if (!pages.get(path).ids.has(id)) errors.push(`${source}: missing fragment ${link}`);
      }
    }
  }
  return { pages: files.length, links: checked, errors };
}
