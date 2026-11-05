import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inputsDir, pinnedBytes } from './pins.mjs';
import { decodeImage, scanSource, tasImage } from './tas-d8.mjs';

const runnerPin = '3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689';
const tasPin = 'dbee66a90816df9a5884a08754ebc2d458a38325';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const include = /^([ \t]*%INCLUDE[ \t]+")([^"\r\n]+)(")/gim;

function stage(root, entry, origin, rom) {
  const sourceRoot = realpathSync(root);
  function inside(file) {
    assert.ok(!posix.isAbsolute(file) && file !== '..' && !file.startsWith('../'), 'include escapes source root: ' + file);
    const path = realpathSync(join(sourceRoot, file));
    const rel = relative(sourceRoot, path);
    assert.ok(rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel), 'include symlink escapes source root: ' + file);
    return path;
  }
  const sources = new Map(), staged = new Map(), names = new Set();
  function visit(file) {
    if (sources.has(file)) return staged.get(file).name;
    const name = basename(file).toUpperCase();
    assert.match(name, /^[A-Z0-9$_-]{1,8}\.(ASM|INC)$/);
    assert.ok(!names.has(name), 'ambiguous CP/M name: ' + name);
    names.add(name);
    let original = readFileSync(inside(file));
    if (!rom && file === entry) {
      const org = /^([ \t]*ORG[ \t]+)\$0100([ \t]*)$/gim;
      const text = original.toString('latin1');
      assert.equal([...text.matchAll(org)].length, 1, 'expected one $0100 origin in ' + entry);
      original = Buffer.from(text.replace(org, (_, prefix, suffix) =>
        prefix + '$' + origin.toString(16).padStart(4, '0') + suffix), 'latin1');
    }
    if (!rom) {
      for (const line of original.toString('latin1').split(/\r?\n/)) {
        if (line.trimStart().startsWith('%')) {
          assert.match(line, /^[ \t]*%INCLUDE[ \t]+"[^"]+"[ \t]*(?:;.*)?$/i, 'unsupported distribution source directive');
        }
      }
    }
    sources.set(file, original);
    const row = { name };
    staged.set(file, row);
    row.bytes = Buffer.from(original.toString('latin1').replace(include, (_, before, path, after) => {
      // ATOM tries the including directory first, then the project root.
      assert.ok(!posix.isAbsolute(path), 'absolute include path: ' + path);
      const local = posix.normalize(posix.join(posix.dirname(file), path));
      let selected = local;
      try {
        inside(local);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        selected = posix.normalize(path);
      }
      return before + visit(selected) + after;
    }), 'latin1');
    return name;
  }
  visit(entry);
  const source = rom ? scanSource(sources, entry) : undefined;
  if (entry === 'rom.asm') {
    assert.equal(source.definitions.get('BDOSRME')?.kind, 'label', 'missing or invalid workspace sizing marker BDOSRME');
  }
  return { staged, source };
}

function readdirSyncSafe(path) {
  try { readdirSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function tasAssembler() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const entry = JSON.parse(readFileSync(join(root, 'test/inputs.json'), 'utf8')).inputs['TAS.COM'];
  assert.equal(entry.commit, tasPin, 'unsupported TAS manifest commit');
  assert.equal(entry.sha256, '45c0cf054c089163b18d40d9d009715d01a691ffee1c797a61333c3fb7963bd2', 'unsupported TAS manifest hash');
  assert.equal(entry.bytes, 10295, 'unsupported TAS manifest byte count');
  const override = process.env.TECOS_TAS_HOST;
  assert.ok(override !== '', 'TECOS_TAS_HOST is empty: unset it or select the prepared pinned host');
  const host = resolve(override ?? join(inputsDir(root), 'tas-host'));
  assert.ok(readdirSyncSafe(host), 'no TAS host at ' + host + ': prepare .inputs/tas-host as described in README.md or set TECOS_TAS_HOST');
  const com = pinnedBytes(root, 'TAS.COM');
  const runner = join(host, 'tools/tas.mjs');
  assert.equal(sha(readFileSync(runner)), 'e68e24d900bdc9aa391086f0425d0a56feedeb7257c5a71facdd4bd6f8f7bade', 'Thorium runner pin mismatch');
  assert.equal(sha(readFileSync(join(host, 'package-lock.json'))), 'fc8bcae3046fa185048627e0df26c602772cfb3b190a54089e2fe6764839bf2a', 'Thorium lock pin mismatch');
  const runtime = join(host, 'node_modules/@jhlagado/debug80-runtime');
  const hash = createHash('sha256');
  const runtimeFiles = readdirSync(join(runtime, 'dist/z80')).filter(f => f.endsWith('.js')).sort();
  for (const file of ['package.json', ...runtimeFiles.map(f => 'dist/z80/' + f)]) {
    hash.update(file + '\0').update(createHash('sha256').update(readFileSync(join(runtime, file))).digest());
  }
  assert.equal(hash.digest('hex'), 'd49287b51d474e5825d68ed4c766cd63632c9da68cded2641e881de00960219c', 'Thorium Z80 runtime pin mismatch');
  const { assemble } = await import(pathToFileURL(runner).href);
  return async ({ root, entry, origin, phase, target, rom = false }) => {
    const { staged, source } = stage(root, entry, origin, rom);
    const dir = mkdtempSync(join(tmpdir(), 'tecos-tas-'));
    try {
      for (const row of staged.values()) writeFileSync(join(dir, row.name), row.bytes);
      const executable = join(dir, 'TAS.COM');
      writeFileSync(executable, com);
      const input = staged.get(entry).name;
      const result = await assemble({ dir, root: input, out: input.replace(/\.ASM$/, '.BIN'), com: executable });
      assert.equal(result.code, 0, result.console);
      assert.ok(result.bytes && result.dbg, 'TAS did not produce both ROM and debug output');
      const dbg = Buffer.from(result.dbg), raw = Buffer.from(result.bytes);
      const output = rom ? tasImage(dbg, raw, staged, tasPin, source, entry, origin) : decodeImage(dbg, raw, origin);
      traceRom({ backend: "tas", phase, target, origin, root, runner: runnerPin, tstates: result.tstates });
      return output;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export function romBackend() {
  const backend = process.env.TECOS_ROM_ASSEMBLER ?? 'tas';
  assert.ok(backend === 'atom' || backend === 'tas', 'unknown TECOS_ROM_ASSEMBLER: ' + backend);
  return backend;
}

export function traceRom(event) {
  const line = JSON.stringify(event);
  console.error('tecos ROM ' + line);
  if (process.env.TECOS_ROM_TRACE) {
    appendFileSync(process.env.TECOS_ROM_TRACE, line + '\n');
  }
}
