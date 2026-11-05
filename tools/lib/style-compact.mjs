import { LIMITS, parseLine } from './style.mjs';

const register = /^(?:af'?|bc|de|hl|sp|ix[hl]?|iy[hl]?|[abcdehlir]|nz|z|nc|po|pe|p|m)$/i;
const tokens = /"[^"]*"|'[^']*'|\b[A-Za-z_][\w]*'?(?![\w])/g;

/** Labels naming instructions, including consecutive aliases, not data. */
function codeLabels(parsed) {
  const found = new Set();
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].kind !== 'label') continue;
    for (let j = i + 1; j < parsed.length; j++) {
      if (['blank', 'comment', 'label'].includes(parsed[j].kind)) continue;
      if (parsed[j].kind === 'code') found.add(i);
      break;
    }
  }
  return found;
}

/** Only the nearest margin header across one required blank belongs here. */
function headerLines(lines, at) {
  if (lines[at - 1] !== '') return 0;
  let count = 0;
  for (let i = at - 2; i >= 0 && lines[i].startsWith(';'); i--) count++;
  return count;
}

/** Check compact layout. Entry names come from the routine inventory. */
export function checkCompactSource(text, name, entries = [], exceptions = {}) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const parsed = lines.map(parseLine);
  const labels = codeLabels(parsed);
  const faults = [];
  const fault = (rule, line, what) => faults.push({ rule, line, what });
  const expected = new Set(entries);
  const used = new Set();
  const wide = exceptions.lines ?? [];
  const longHeaders = { ...exceptions.headers };
  let codeLines = 0, commented = 0, run = 0, longestRun = 0;
  let routines = 0, headless = 0;
  let inlineNote = false;
  for (const [i, line] of lines.entries()) {
    const p = parsed[i];
    const n = i + 1;
    const isBlock = p.kind === 'comment' && p.commentCol === 1;
    const isContinuation = p.kind === 'comment' && p.commentCol === 18;
    const label = p.label?.replace(/:$/, '');
    if (line.length > 40 && !wide.includes(line)) fault('end', n, 'line exceeds 40 columns');
    if (wide.includes(line)) used.add(line);
    if (p.code.replace(/"[^"]*"|'[^']*'/g, '').includes('\t') || /^\t/.test(line)) fault('spaces', n, 'use spaces outside literals');
    if (label && label !== label.toUpperCase()) fault('case', n, 'uppercase label or constant');
    if (p.mnemonic?.toUpperCase() === '%INCLUDE' && !/^%include\b/i.test(p.code)) {
      fault('column', n, '%INCLUDE begins at column 1');
    }
    if (isContinuation && !inlineNote) fault('continuation', n, 'continue an inline note');
    if (p.kind === 'label') {
      if (labels.has(i) && i > 0 && lines[i - 1] !== '') fault('blank', n, 'put a blank line above every code label');
      if (expected.delete(label)) {
        routines++;
        const header = headerLines(lines, i);
        if (!header) {
          headless++;
          fault('header', n, `${label} has no header`);
        }
        if (header > 15 && header !== longHeaders[label]) fault('header-length', n, `${label} has ${header} header lines`);
        if (header === longHeaders[label]) delete longHeaders[label];
      }
    }
    if (isBlock) {
      if (i > 0 && !lines[i - 1].startsWith(';') && lines[i - 1] !== '') fault('block-before', n, 'put a blank line above a margin block');
      if (i + 1 < lines.length && !lines[i + 1].startsWith(';') && lines[i + 1] !== '') fault('block-after', n, 'put a blank line below a margin block');
    }
    if (p.kind === 'code') {
      codeLines++;
      if (p.label) fault('label-line', n, 'give a code label its own line');
      const prefix = p.operand ? `  ${p.mnemonic} ${p.operand}` : `  ${p.mnemonic}`;
      if (p.code.trimEnd() !== prefix) fault('spacing', n, 'put the instruction on its own line with two leading spaces and one operand separator');
      if (p.mnemonic !== p.mnemonic.toLowerCase()) fault('case', n, 'lowercase mnemonic');
      for (const token of p.operand?.match(tokens) ?? []) {
        if (register.test(token) && token !== token.toLowerCase()) fault('case', n, `lowercase ${token}`);
      }
      if (p.comment >= 0) { commented++; run = 0; }
      else { run++; longestRun = Math.max(longestRun, run); }
    }
    if (p.comment >= 0) {
      if (p.kind === 'comment') {
        if (!isBlock && !isContinuation) fault('column', n, 'comment begins at column 1 or 18');
      } else if (p.commentCol !== 18 || p.code.length - p.code.trimEnd().length < 2) {
        fault('column', n, 'inline semicolon at column 18 with two spaces after code');
      }
      if (p.comment + 1 < line.length && line[p.comment + 1] !== ' ') fault('spacing', n, 'space after semicolon');
    }
    if (p.kind === 'comment') run = 0;
    inlineNote = isContinuation ? inlineNote : p.kind !== 'comment' && p.commentCol === 18
      && p.code.length - p.code.trimEnd().length >= 2;
  }
  for (const entry of expected) fault('inventory', 0, `missing routine label ${entry}`);
  for (const line of wide) if (!used.has(line)) fault('exception', 0, `unused line exception: ${line}`);
  for (const label of Object.keys(longHeaders)) fault('exception', 0, `unused header exception: ${label}`);
  const share = codeLines ? commented / codeLines : 1;
  if (share < LIMITS.share) fault('density', 0, `${Math.round(share * 100)} percent of instructions have notes`);
  if (longestRun > LIMITS.run) fault('run', 0, `${longestRun} code lines without a comment`);
  const bytes = Buffer.byteLength(text, 'latin1');
  if (bytes > LIMITS.bytes) fault('size', 0, `${bytes} bytes`);
  if (!/^[A-Z0-9_]{1,8}\.[A-Z]{3}$/i.test(name)) fault('name', 0, `${name} is not an 8.3 name`);
  return { name, lines: lines.length, codeLines, commented, share, routines, headless, longestRun, bytes, faults };
}
