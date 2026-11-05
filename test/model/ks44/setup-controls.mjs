// Execute the documented setup block, including its failure handling.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const work = mkdtempSync(join(root, 'build/ks44-setup-'));
const fence = String.fromCharCode(96).repeat(3);
const setup = readFileSync(join(root, 'README.md'), 'utf8').split(fence + 'sh\n')[1].split(fence)[0];
const env = { ...process.env };
for (const name of ['TAS_COM', 'TED_COM', 'TECOS_TAS_HOST', 'TECOS_ROM_ASSEMBLER', 'TECOS_ROM_TRACE']) delete env[name];
const execute = extra => spawnSync('sh', ['-c', setup], { cwd: work, env: { ...env, ...extra }, encoding: 'utf8' });
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
try {
  for (const name of ['tools', 'test/inputs.json', 'test/lib/digest.mjs', 'package.json', 'package-lock.json', '.inputs', 'build/tecos', 'dist']) {
    cpSync(join(root, name), join(work, name), { recursive: true });
  }
  for (const name of ['TAS.COM', 'TED.COM']) cpSync(join(root, 'dist/files', name), join(work, '.inputs', name));
  const host = join(work, '.inputs/tas-host');
  const saved = ['tools/tas.mjs', 'package-lock.json', 'node_modules/@jhlagado/debug80-runtime/dist/z80/runtime.js']
    .map(name => [join(host, name), sha(join(host, name))]);
  const output = sha(join(work, 'dist/starter.img'));
  const repeat = execute({});
  assert.equal(repeat.status, 0, repeat.stderr);
  for (const [path, digest] of saved) assert.equal(sha(path), digest);

  const badInput = execute({ TAS_COM: join(work, 'package.json') });
  assert.notEqual(badInput.status, 0);
  assert.match(badInput.stderr, /not pinned/);
  for (const [path, digest] of saved) assert.equal(sha(path), digest);
  assert.equal(sha(join(work, 'dist/starter.img')), output);

  const prior = join(work, '.inputs/prior-host');
  renameSync(host, prior);
  const gitFailure = execute({
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'url.file:///ks44-missing-remote.git.insteadOf',
    GIT_CONFIG_VALUE_0: 'https://github.com/jhlagado/thorium.git',
  });
  assert.notEqual(gitFailure.status, 0);
  assert.equal(existsSync(host), false);
  assert.ok(!readdirSync(join(work, '.inputs')).some(name => name.startsWith('.tas-host.')));

  // Make npm succeed, then alter the staged lock before pin verification.
  const bin = join(work, 'bin');
  mkdirSync(bin);
  const npm = spawnSync('which', ['npm'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nset -eu\n"$KS44_NPM" "$@"\nif [ "$PWD" != "$KS44_ROOT" ] && [ "$1" = ci ]; then printf tampered > package-lock.json; fi\n', { mode: 0o755 });
  const verificationFailure = execute({ PATH: bin + ':' + env.PATH, KS44_NPM: npm, KS44_ROOT: work });
  assert.notEqual(verificationFailure.status, 0);
  assert.match(verificationFailure.stderr, /Thorium lock pin mismatch/);
  assert.equal(existsSync(host), false);
  assert.ok(!readdirSync(join(work, '.inputs')).some(name => name.startsWith('.tas-host.')));
  for (const [path, digest] of saved) assert.equal(sha(path.replace(host, prior)), digest);
  assert.equal(sha(join(work, 'dist/starter.img')), output);
  renameSync(prior, host);
  console.log('README setup repeat and input, clone and staged-verification failures passed with prior host and artifacts intact');
} finally {
  rmSync(work, { recursive: true, force: true });
}
