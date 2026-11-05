// Negative control through the unchanged refusing-REMOVE regression.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [candidate, mutant, out] = process.argv.slice(2).map(path => resolve(path));
mkdirSync(out, { recursive: true });
const test = 'test/svc.test.mjs';
assert.deepEqual(readFileSync(resolve(candidate, test)), readFileSync(resolve(mutant, test)), 'actual test source must be unchanged');
cpSync(resolve(candidate, 'build/tecos'), resolve(mutant, 'build/tecos'), { recursive: true });
const args = ['--test', '--test-name-pattern=cyclic registry rollback, REMOVE refusal 1', test];
const result = spawnSync(process.execPath, args, {
  cwd: mutant, encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL',
});
writeFileSync(resolve(out, 'output.log'), (result.stdout ?? '') + (result.stderr ?? ''));
assert.equal(result.error, undefined);
assert.equal(result.signal, null);
assert.equal(result.status, 1, 'fixture mutant must fail');
assert.match(result.stdout, /retained pages publish no records and preserve generation, hooks and vectors/);
assert.match(result.stdout, /hook:/);
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(resolve(out, 'result.json'), JSON.stringify({
  args, cwd: mutant, code: result.status, signal: result.signal,
  testSha256: sha(resolve(candidate, test)),
  fixtureSha256: sha(resolve(mutant, 'test/programs/svcdemo.asm')),
  romSha256: sha(resolve(mutant, 'build/tecos/tecos.rom')),
  expectedFailure: 'The unchanged V_REFUSE=1 test reaches the loader-state comparison after checking natural SP, RESULT=2 and rc=2. The omitted OLDCO restoration differs at the actual hook.',
}, null, 2) + '\n');
console.log('Refusing-REMOVE fixture mutant rejected by the unchanged actual-hook assertion');
