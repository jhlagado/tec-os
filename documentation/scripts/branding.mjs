import { parse } from 'parse5';

export function checkBranding(html, { requireMark = true } = {}) {
  const text = [], titles = [], sites = [], logos = [];
  function walk(node, hidden = false) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
    const excluded = hidden || ['script', 'style', 'code', 'pre'].includes(node.tagName);
    if (node.tagName === 'meta' && attrs.property === 'og:site_name') sites.push(attrs.content);
    if (node.tagName === 'svg' && (attrs.class ?? '').split(/\s+/).includes('mark')) logos.push(attrs['aria-label']);
    if (node.tagName === 'title') titles.push((node.childNodes ?? []).map(c => c.value ?? '').join(''));
    if (node.nodeName === '#text' && !excluded) text.push(node.value);
    for (const child of node.childNodes ?? []) walk(child, excluded);
  }
  walk(parse(html));
  const errors = [];
  if (titles.length !== 1 || !/(?:^|\| )tec-os$/.test(titles[0])) errors.push('Page title must end with tec-os');
  if (sites.length !== 1 || sites[0] !== 'tec-os') errors.push('Open Graph site name must be tec-os');
  if ((requireMark && !logos.length) || logos.some(label => label !== 'tec-os')) errors.push('Site marks must be labelled tec-os');
  if (/\btech-?os\b/i.test([...text, ...titles, ...sites, ...logos].join(' '))) errors.push('Incorrect site spelling in visible content or metadata');
  return errors;
}
