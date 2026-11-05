// Exercise real resolution and preparation entry points in a disposable tree.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const work = mkdtempSync(join(root, 'build/ks44-controls-'));
const env = { ...process.env };
for (const name of ['TAS_COM', 'TED_COM', 'TECOS_TAS_HOST', 'TECOS_ROM_ASSEMBLER', 'TECOS_ROM_TRACE']) delete env[name];
const run = (args, extra = {}) => spawnSync(process.execPath, args, { cwd: work, env: { ...env, ...extra }, encoding: 'utf8' });
const verifier = ['--input-type=module', '-e', 'import { tasAssembler } from "./tools/lib/tas-rom.mjs"; await tasAssembler();'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  for (const name of ['tools', 'test', 'src', 'diag', 'drivers', 'format', 'programs', 'docs', 'package.json', '.inputs', 'build/tecos', 'build/diag', 'dist']) {
    cpSync(join(root, name), join(work, name), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'));
  const manifestPath = join(work, 'test/inputs.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  for (const name of ['TAS.COM', 'TED.COM']) {
    const bytes = readFileSync(join(root, 'dist/files', name));
    writeFileSync(join(work, '.inputs', name), bytes);
    writeFileSync(join(work, name), bytes);
    manifest.inputs[name].default = name; // a valid legacy alternative remains available
  }
  writeFileSync(manifestPath, JSON.stringify(manifest));
  function snapshot() {
    return ['.inputs/TAS.COM', '.inputs/TED.COM', 'build/tecos/tecos.rom', 'build/tecos/tecos.d8.json',
      'build/tecos/census.json', 'dist/starter.img'].map(name => [name, sha(readFileSync(join(work, name)))]);
  }
  const previous = snapshot();
  function reject(args, extra, error) {
    const result = run(args, extra);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, error);
    assert.deepEqual(snapshot(), previous, 'prior inputs or outputs changed');
  }
  assert.equal(run(['tools/inputs.mjs']).status, 0);
  assert.deepEqual(snapshot(), previous);
  assert.equal(run(verifier).status, 0);
  const wrong = join(work, 'wrong.com');
  writeFileSync(wrong, 'wrong');
  for (const args of [verifier, ['tools/media.mjs'], ['tools/inputs.mjs']]) {
    reject(args, { TAS_COM: wrong }, /(?:pinned|not pinned)/);
  }
  reject(verifier, { TECOS_TAS_HOST: join(work, 'missing-host') }, /no TAS host/);
  reject(verifier, { TECOS_TAS_HOST: '' }, /TECOS_TAS_HOST is empty/);
  for (const name of ['TAS.COM', 'TED.COM']) {
    const path = join(work, '.inputs', name);
    const bytes = readFileSync(path);
    writeFileSync(path, 'tampered');
    for (const args of [['tools/media.mjs'], ['tools/inputs.mjs']]) {
      const result = run(args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /(?:pinned|not pinned)/);
    }
    writeFileSync(path, bytes);
    assert.deepEqual(snapshot(), previous);
  }
  for (const name of ['TAS.COM', 'TED.COM']) {
    const path = join(work, '.inputs', name);
    const bytes = readFileSync(path);
    rmSync(path);
    symlinkSync('missing-target', path);
    for (const args of [['tools/media.mjs'], ['tools/inputs.mjs']]) {
      const result = run(args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /(?:no .* at .*\.inputs|selected .* not pinned)/);
    }
    rmSync(path);
    writeFileSync(path, bytes);
    assert.deepEqual(snapshot(), previous);
  }
  for (const path of ['package-lock.json', 'node_modules/@jhlagado/debug80-runtime/dist/z80/runtime.js']) {
    const file = join(work, '.inputs/tas-host', path);
    const bytes = readFileSync(file);
    writeFileSync(file, 'tampered');
    reject(verifier, {}, /(?:lock|runtime) pin mismatch/);
    writeFileSync(file, bytes);
  }

  // Fetch must really fail after the local TED is missing and its sibling is stale.
  const ted = readFileSync(join(work, '.inputs/TED.COM'));
  rmSync(join(work, '.inputs/TED.COM'));
  writeFileSync(join(work, 'TED.COM'), 'stale sibling');
  const cache = join(work, '.inputs/.git-TED-COM');
  mkdirSync(cache, { recursive: true });
  const git = args => spawnSync('git', ['-C', cache, ...args], { encoding: 'utf8' });
  assert.equal(git(['init', '-q']).status, 0);
  // The copied fetch cache may already have its remote.
  git(['remote', 'remove', 'origin']);
  assert.equal(git(['remote', 'add', 'origin', join(work, 'missing-remote.git')]).status, 0);
  const failed = run(['tools/inputs.mjs', 'TED.COM']);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /(?:not appear to be a git repository|Could not read|Command failed)/);
  assert.equal(sha(readFileSync(join(work, '.inputs/TAS.COM'))), previous[0][1]);
  for (const [name, digest] of previous.slice(2)) assert.equal(sha(readFileSync(join(work, name))), digest);
  assert.ok(!readdirSync(join(work, '.inputs')).some(name => name.startsWith('.download-')));

  // Restore the real remote and exercise partial preparation through git fetch.
  assert.equal(git(['remote', 'set-url', 'origin', 'https://github.com/jhlagado/thorium.git']).status, 0);
  const partial = run(['tools/inputs.mjs']);
  assert.equal(partial.status, 0, partial.stderr);
  assert.deepEqual(readFileSync(join(work, '.inputs/TED.COM')), ted);
  assert.deepEqual(snapshot(), previous);
  console.log('Resolution, repeat verification, stale sibling, partial setup, wrong inputs and real fetch failure controls passed');
} finally {
  rmSync(work, { recursive: true, force: true });
}
