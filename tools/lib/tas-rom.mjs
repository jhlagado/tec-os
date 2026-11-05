import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanSource, tasImage } from './tas-d8.mjs';

const runnerPin = '3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689';
const tasPin = 'dbee66a90816df9a5884a08754ebc2d458a38325';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const include = /^([ \t]*%INCLUDE[ \t]+")([^"\r\n]+)(")/gim;

function stage(root) {
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
    const original = readFileSync(inside(file));
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
  visit('rom.asm');
  const source = scanSource(sources);
  assert.equal(source.definitions.get('BDOSRME')?.kind, 'label', 'missing or invalid workspace sizing marker BDOSRME');
  return { staged, source };
}

export async function tasAssembler(root) {
  assert.ok(process.env.TECOS_TAS_HOST, 'set TECOS_TAS_HOST to the prepared Thorium runner directory');
  assert.ok(process.env.TAS_COM, 'set TAS_COM to the pinned TAS.COM');
  const host = resolve(process.env.TECOS_TAS_HOST);
  const com = readFileSync(resolve(process.env.TAS_COM));
  assert.equal(sha(com), '45c0cf054c089163b18d40d9d009715d01a691ffee1c797a61333c3fb7963bd2', 'TAS.COM pin mismatch');
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
  return async (phase) => {
    const { staged, source } = stage(root);
    const dir = mkdtempSync(join(tmpdir(), 'tecos-tas-'));
    try {
      for (const row of staged.values()) writeFileSync(join(dir, row.name), row.bytes);
      const executable = join(dir, 'TAS.COM');
      writeFileSync(executable, com);
      const result = await assemble({ dir, root: 'ROM.ASM', out: 'ROM.BIN', com: executable });
      assert.equal(result.code, 0, result.console);
      assert.ok(result.bytes && result.dbg, 'TAS did not produce both ROM and debug output');
      const output = tasImage(Buffer.from(result.dbg), Buffer.from(result.bytes), staged, tasPin, source);
      traceRom({ backend: "tas", phase, root, runner: runnerPin, tstates: result.tstates });
      return output;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export function romBackend() {
  const backend = process.env.TECOS_ROM_ASSEMBLER ?? 'atom';
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
