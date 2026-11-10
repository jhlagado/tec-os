// Check failures against an existing distribution through the media command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const work = mkdtempSync(join(root, 'build/ks43-media-'));
try {
  for (const name of ['tools', 'src', 'drivers', 'test/programs', 'test/inputs.json', 'format', 'programs', 'docs', 'dist', 'build/tecos', 'package.json']) {
    cpSync(join(root, name), join(work, name), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'));
  const dist = join(work, 'dist');
  const snapshot = () => readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter(item => item.isFile()).map(item => join(item.parentPath, item.name)).sort()
    .map(path => [path, readFileSync(path)]);
  const previous = snapshot();
  const env = { ...process.env, TECOS_ROM_ASSEMBLER: 'tas' };
  function reject(overrides, error) {
    const result = spawnSync(process.execPath, ['tools/media.mjs'], { cwd: work, encoding: 'utf8', env: { ...env, ...overrides } });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, error);
    assert.doesNotMatch(result.stderr, /"phase":"media"|"backend":"atom"/);
    assert.deepEqual(snapshot(), previous);
    return result.stderr;
  }
  reject({ TECOS_TAS_HOST: '' }, /set TECOS_TAS_HOST/);
  reject({ TECOS_TAS_HOST: join(work, 'absent') }, /ENOENT/);
  const demo = join(work, 'programs/DEMO.ASM');
  const text = readFileSync(demo, 'latin1');
  assert.match(text, /LEDBUF:\s+DS\s+24/);
  writeFileSync(demo, text.replace(/(LEDBUF:\s+DS\s+)24/, (_, prefix) => prefix + '23'), 'latin1');
  const stderr = reject({}, /(?:DIGBUF|LEDBUF) (?:trailing reserve|reserve extent)/);
  assert.match(stderr, /"target":"GLCD.SVC"/);
  assert.match(stderr, /"target":"DEMO.COM"/);
  console.log('Missing and invalid host and late DEMO reserve failure preserved every existing dist file');
} finally {
  rmSync(work, { recursive: true, force: true });
}
