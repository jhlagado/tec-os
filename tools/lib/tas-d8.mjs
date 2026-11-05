import assert from 'node:assert/strict';
import { posix } from 'node:path';

const romBase = 0xc000;
const romRules = {
  'rom.asm': { ramFile: 'ram.asm', resetFile: 'reset.asm', resetLine: 1, ramLimit: romBase },
  'diag.asm': { ramFile: 'vars.asm', resetFile: 'boot.asm', resetLine: 8, ramLimit: 0x7f00 },
};
const definition = /^\s*([A-Za-z_][A-Za-z0-9_]*)(?:(:)|\s+(EQU)\b)/i;
const names = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const codeOrData = new Set('adc add and bit call ccf cp cpd cpdr cpi cpir cpl daa dec di djnz ei ex exx halt im in inc ind indr ini inir jp jr ld ldd lddr ldi ldir neg nop or out outd otdr outi otir pop push res ret reti retn rl rla rlc rlca rld rr rra rrc rrca rrd rst sbc scf set sla sra srl sub xor db dw cstr pstr istr'.split(' '));

export function decodeImage(dbg, raw, expectedOrigin) {
  assert.ok(dbg.length >= 256 && dbg.length % 128 === 0, 'TDBG records');
  const header = dbg.subarray(-128);
  assert.equal(header.subarray(0, 4).toString(), 'TDBG');
  assert.equal(header[4], 2, 'TDBG version');
  assert.equal(header[5], 0, 'TDBG flags');
  const origin = header.readUInt16LE(6), end = header.readUInt16LE(8) || 0x10000;
  const globalsAt = header.readUInt16LE(12) * 128, count = header.readUInt16LE(14);
  assert.ok(globalsAt > 0 && globalsAt + count * 8 <= dbg.length - 128, 'TDBG global extent');
  assert.equal(origin, expectedOrigin, 'wrong TDBG origin');
  assert.ok(end > origin && end <= 0x10000, 'TDBG image extent');
  const len = end - origin;
  assert.equal(raw.length, origin === 0x100 ? len : Math.ceil(len / 128) * 128, 'TDBG span length');
  const sum = raw.subarray(0, len).reduce((total, b) => (total + b) & 0xffff, 0);
  assert.equal(sum, header.readUInt16LE(10), 'TDBG checksum');
  assert.ok(raw.subarray(len).every(b => b === 0), 'nonzero record padding');
  const globals = new Map();
  for (let i = 0; i < count; i++) {
    const r = dbg.subarray(globalsAt + 8 * i, globalsAt + 8 * (i + 1));
    const a = r.readUInt16LE(), b = r.readUInt16LE(2), c = r.readUInt16LE(4) & 0x7ff;
    assert.equal(r[5] & 0xc8, 0x40, 'unsupported global flags');
    const digits = [Math.floor(a / 1600), Math.floor(a / 40) % 40, a % 40,
      Math.floor(b / 1600), Math.floor(b / 40) % 40, b % 40, Math.floor(c / 40), c % 40];
    assert.ok(digits.every(x => x < names.length), 'invalid RADIX-40 name');
    const name = digits.map(x => names[x]).join('').trimEnd();
    assert.match(name, /^[A-Z_][A-Z0-9_]{0,7}$/);
    assert.ok(!globals.has(name), 'duplicate TAS symbol: ' + name);
    const kind = r[5] & 16 ? 'label' : 'constant';
    const negative = Boolean(r[5] & 32);
    assert.ok(!negative || kind === 'constant', 'negative label');
    globals.set(name, { kind, value: r.readUInt16LE(6) - (negative ? 0x10000 : 0) });
  }
  return { origin, end, globals, globalsAt, image: raw.subarray(0, len) };
}

function decodeStatements(dbg, staged, end, globalsAt) {
  const partsByName = new Map([...staged].map(([file, row]) => [row.name, file]));
  let cursor = 0, address = 0, line = 0, part = -1, ended = false;
  const statements = [], regions = [], parts = [];
  const lengths = new Map();
  const take = () => {
    assert.ok(cursor < globalsAt, 'TDBG stream crosses global table');
    return dbg[cursor++];
  };
  const word = () => take() | (take() << 8);
  while (cursor < globalsAt) {
    const delta = take();
    if (delta) {
      address = delta >> 4 ? address + (delta >> 4) : word();
      line = delta & 15 ? line + (delta & 15) : word();
    } else {
      const tag = take();
      if (tag === 0xff) { ended = true; break; }
      if (tag === 0x10) part = take();
      if (tag === 1 || tag === 0x10) { address = word(); line = word(); }
      else {
        if (tag >= 0x20 && tag <= 0x23) {
          const at = word();
          assert.ok(at > (regions.at(-1)?.at ?? romBase - 1) && at < end, 'invalid region order');
          regions.push({ at, kind: tag === 0x20 ? 'code' : 'data' });
        } else if (tag === 0x50) {
          assert.equal(parts.length, 0, 'duplicate parts table');
          const n = take();
          const field = length => String.fromCharCode(...Array.from({ length }, take)).trimEnd();
          for (let i = 0; i < n; i++) {
            const name = field(8) + '.' + field(3);
            const file = partsByName.get(name);
            assert.ok(file && !parts.includes(file), 'unknown or repeated TDBG part: ' + name);
            parts.push(file);
          }
        } else if (tag === 0x60) {
          const key = take(), length = word() | (take() << 16);
          assert.ok(!lengths.has(key), 'duplicate part length');
          lengths.set(key, length);
        } else throw new Error('unsupported TDBG tag: ' + tag.toString(16));
        continue;
      }
    }
    assert.ok(address > (statements.at(-1)?.address ?? romBase - 1) && address < end, 'non-increasing or out-of-ROM emission');
    assert.ok(part >= 0 && line >= 1, 'invalid statement position');
    statements.push({ address, line, part });
  }
  assert.ok(ended && statements.length && statements[0].address === romBase, 'incomplete ROM stream');
  assert.equal(parts.length, partsByName.size, 'missing TDBG part');
  assert.equal(lengths.size, parts.length, 'missing TDBG part length');
  for (let i = 0; i < parts.length; i++) {
    assert.equal(lengths.get(i), staged.get(parts[i]).bytes.length, 'TDBG part length differs');
  }
  for (const s of statements) assert.ok(parts[s.part], 'unknown TDBG statement part');
  return { statements, regions, parts };
}

function lines(bytes) {
  const result = [];
  let offset = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 10 || bytes[i] === 13) {
      result.push({ offset, text: bytes.subarray(offset, i).toString('latin1') });
      if (bytes[i] === 13 && bytes[i + 1] === 10) i++;
      offset = i + 1;
    }
  }
  if (offset < bytes.length) result.push({ offset, text: bytes.subarray(offset).toString('latin1') });
  return result;
}

export function scanSource(sources, entry) {
  const { ramFile, resetFile, resetLine } = romRules[entry];
  const perFile = new Map([...sources].map(([file, bytes]) => [file, lines(bytes)]));
  const definitions = new Map(), fileList = [], visited = new Set();
  function visit(file) {
    assert.ok(!visited.has(file), 'include repeated or recursive: ' + file);
    assert.ok(perFile.has(file), 'missing include file: ' + file);
    visited.add(file);
    for (const [i, row] of perFile.get(file).entries()) {
      const { text, offset } = row;
      const stripped = text.trimStart();
      if (stripped === '' || stripped.startsWith(';')) continue;
      if (stripped.startsWith('%')) {
        const inc = /^%INCLUDE\s+"([^"]+)"\s*(?:;.*)?$/i.exec(stripped);
        assert.ok(inc, file + ':' + (i + 1) + ': unsupported source directive');
        const relative = posix.normalize(posix.join(posix.dirname(file), inc[1]));
        visit(perFile.has(relative) ? relative : inc[1]);
        continue;
      }
      const match = definition.exec(text);
      const kind = match?.[2] ? 'label' : 'constant';
      if (match) {
        const name = match[1].toUpperCase();
        assert.match(name, /^[A-Z_][A-Z0-9_]{0,7}$/);
        assert.ok(!definitions.has(name), 'duplicate source definition: ' + name);
        definitions.set(name, { file, line: i + 1, offset, kind });
        if (kind === 'constant') continue;
      }
      const statement = (match ? text.slice(match[0].length) : text).trimStart();
      if (statement === '' || statement.startsWith(';')) continue;
      const [op] = statement.toLowerCase().split(/\s+|;/, 1);
      const resetOrigin = file === resetFile && i + 1 === resetLine && /^ORG\s+\$C000\s*(?:;.*)?$/i.test(statement);
      const workspace = file === ramFile && (op === 'org' || op === 'ds');
      const filled = entry === 'diag.asm' && (file === 'boot.asm' || file === 'display.asm') &&
        op === 'ds' && /^DS\s+[^,;]+,\s*(?:\$[0-9a-f]+|' ')\s*(?:;.*)?$/i.test(statement);
      assert.ok(resetOrigin || workspace || filled || (file !== ramFile && codeOrData.has(op)),
        file + ':' + (i + 1) + ': unsupported statement or possible ROM gap: ' + op);
      Object.assign(row, { op, statement, filled });
    }
    fileList.push(file);
  }
  visit(entry);
  assert.equal(visited.size, perFile.size, 'unreferenced staged sources');
  return { perFile, definitions, fileList };
}

function ramOperand(text, globals) {
  // The current RAM declarations use one known term or one binary operator.
  const m = /^(\$[0-9a-f]+|[0-9]+|[a-z_][a-z0-9_]*)(?:\s*([+*-])\s*(\$[0-9a-f]+|[0-9]+|[a-z_][a-z0-9_]*))?$/i.exec(text);
  assert.ok(m, 'unsupported RAM operand: ' + text);
  const read = x => {
    if (x.startsWith('$')) return Number.parseInt(x.slice(1), 16);
    if (/^[0-9]/.test(x)) return Number(x);
    assert.ok(globals.has(x.toUpperCase()), 'unknown RAM operand: ' + x);
    return globals.get(x.toUpperCase()).value;
  };
  const left = read(m[1]);
  if (!m[2]) return left;
  const right = read(m[3]);
  if (m[2] === '+') return left + right;
  if (m[2] === '-') return left - right;
  return left * right;
}

export function tasImage(dbg, raw, staged, pin, source, entry, expectedOrigin) {
  const { origin, end, globals, globalsAt } = decodeImage(dbg, raw, expectedOrigin);
  const { ramFile, ramLimit } = romRules[entry];
  const diagnostic = entry === 'diag.asm';
  assert.ok(origin < romBase && end > romBase && end <= (diagnostic ? 0xfff6 : 0x10000), 'ROM image extent');
  assert.ok(raw.subarray(0, romBase - origin).every(b => b === 0), 'nonzero reservation bytes before ROM');
  const { statements, regions, parts } = decodeStatements(dbg, staged, end, globalsAt);
  const { perFile, definitions, fileList } = source;
  const files = Object.fromEntries(fileList.map(f => [f, {}]));
  const symbols = [];
  assert.equal(globals.size, definitions.size, 'TDBG/source definition count differs');
  for (const [name, item] of [...globals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const def = definitions.get(name);
    assert.ok(def, 'TDBG symbol has no unique source definition: ' + name);
    assert.equal(def.kind, item.kind, 'TDBG/source symbol kind mismatch: ' + name);
    const { file, line, offset } = def;
    const symbol = {
      name, identity: file + '#' + offset + ':' + name, kind: item.kind,
      ...(item.kind === 'constant' ? { value: item.value } : { address: item.value }),
      line, scope: 'global', visibility: 'source', sourceUnit: file,
    };
    (files[file].symbols ??= []).push(symbol);
    symbols.push({ ...symbol, file });
  }
  const ranges = new Map(fileList.map(f => [f, []]));
  const isData = new Set(['db', 'dw', 'cstr', 'pstr', 'istr']);
  const unplaced = new Set();
  for (const [file, rows] of perFile) {
    if (file === ramFile) continue;
    for (const [i, row] of rows.entries()) {
      if (codeOrData.has(row.op) || row.filled) unplaced.add(file + ':' + (i + 1));
    }
  }
  let region = -1;
  for (const [i, s] of statements.entries()) {
    while (region + 1 < regions.length && regions[region + 1].at <= s.address) region++;
    const file = parts[s.part], source = perFile.get(file)[s.line - 1];
    const kind = regions[region]?.kind ?? 'data';
    assert.ok(source?.op && (codeOrData.has(source.op) || source.filled), 'TDBG points outside an emitting source line');
    assert.equal(kind, isData.has(source.op) || source.filled ? 'data' : 'code', file + ':' + s.line + ': ROM region kind mismatch');
    assert.ok(unplaced.delete(file + ':' + s.line), 'duplicate emitting source line');
    const endAt = statements[i + 1]?.address ?? end;
    if (source.filled) {
      const [count, fill] = source.statement.replace(/^DS\s+/i, '').split(';', 1)[0].split(',').map(x => x.trim());
      const expression = /^(\w+)-\(\$-(\$[0-9a-f]+|\w+)\)$/i.exec(count);
      assert.ok(expression, 'unsupported diagnostic fill expression: ' + count);
      const expectedSize = ramOperand(expression[1], globals) - (s.address - ramOperand(expression[2], globals));
      assert.ok(expectedSize > 0 && endAt - s.address === expectedSize, 'ROM fill range differs from its source');
      const value = fill === "' '" ? 0x20 : Number.parseInt(fill.slice(1), 16);
      assert.ok(value <= 0xff, 'ROM fill is not a byte');
      assert.ok(raw.subarray(s.address - origin, endAt - origin).every(b => b === value), 'ROM fill bytes differ');
    }
    // D8 classifies emitted DS fills as code. TAS encodes them as byte regions.
    ranges.get(file).push({ start: s.address, end: endAt, line: s.line, kind: source.filled ? 'code' : kind });
  }
  assert.equal(unplaced.size, 0, 'missing emitting source lines');
  let cursor;
  for (const [i, s] of perFile.get(ramFile).entries()) {
    if (!s.op) continue;
    const text = s.statement.replace(/^[A-Z]+\s+/i, '').split(';', 1)[0].trim();
    const n = ramOperand(text, globals);
    if (s.op === 'org') {
      assert.ok(n >= (cursor ?? origin) && n < ramLimit, 'RAM origin moved backwards or outside RAM');
      if (diagnostic) assert.equal(cursor, undefined, 'diagnostic variables must have one origin');
      if (cursor === undefined) assert.equal(n, origin, 'initial RAM origin differs from TDBG origin');
      cursor = n;
    } else {
      assert.ok(cursor !== undefined && Number.isInteger(n) && n > 0 && cursor + n <= ramLimit, 'bad RAM reserve');
      ranges.get(ramFile).push({ start: cursor, end: cursor + n, line: i + 1, kind: 'directive' });
      cursor += n;
    }
  }
  assert.equal(cursor, diagnostic ? globals.get('VARSEND')?.value : romBase, 'reserved workspace end differs');

  let listing = 1;
  for (const file of fileList) {
    const byLine = new Map();
    for (const r of ranges.get(file)) {
      if (!byLine.has(r.line)) byLine.set(r.line, []);
      byLine.get(r.line).push(r);
    }
    for (let line = 1; line <= perFile.get(file).length; line++) {
      const rs = byLine.get(line) ?? [];
      for (const r of rs) {
        const { start, end, kind } = r;
        const lstLine = listing;
        (files[file].segments ??= []).push({ start, end, lstLine, line, column: 1, kind, confidence: 'high' });
      }
      const emitted = rs.filter(r => r.kind !== 'directive').reduce((sum, r) => sum + r.end - r.start, 0);
      listing += Math.max(1, Math.ceil(emitted / 8));
    }
    files[file].segments?.sort((a, b) => a.start - b.start || a.line - b.line);
  }
  const d8 = { format: 'd8-debug-map', version: 1, arch: 'z80', addressWidth: 16, endianness: 'little',
    files, segments: [{ start: romBase, end }], fileList, symbols,
    generator: { name: 'tas', tool: 'tas', version: pin, inputs: { entry }, entryAddress: 0 } };
  return { d8, bytes: raw.subarray(romBase - origin, end - origin) };
}

