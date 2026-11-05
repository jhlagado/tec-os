// Exercise build refusals in an isolated copy, keeping the published ROM intact.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const work = mkdtempSync(join(root, 'build/ks42-controls-'));
const opts = { cwd: work, encoding: 'utf8' };
const tas = { ...process.env, TECOS_ROM_ASSEMBLER: 'tas' };
const build = (env = tas) => spawnSync(process.execPath, ['tools/build.mjs'], { ...opts, env });
const artifact = join(work, 'build/tecos/tecos.rom');
function reject(name, expected, env) {
  const result = build(env);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, expected, name);
  assert.doesNotMatch(result.stderr, /"backend":"atom"/);
  assert.ok(!existsSync(artifact), name + ' published a ROM');
  console.log('Refused ' + name);
}
try {
  for (const name of ['src', 'tools', 'drivers', 'test/programs', 'format', 'package.json']) {
    cpSync(join(root, name), join(work, name), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'));
  reject('unknown selection', /unknown TECOS_ROM_ASSEMBLER/, { ...tas, TECOS_ROM_ASSEMBLER: 'unknown' });
  reject('missing TAS.COM', /set TAS_COM/, { ...tas, TAS_COM: '' });
  reject('missing host', /set TECOS_TAS_HOST/, { ...tas, TECOS_TAS_HOST: '' });
  const wrong = join(work, 'wrong.com');
  writeFileSync(wrong, 'wrong');
  reject('wrong TAS.COM', /TAS.COM pin mismatch/, { ...tas, TAS_COM: wrong });
  const wrongHost = join(work, 'wrong-host');
  cpSync(join(tas.TECOS_TAS_HOST, 'tools'), join(wrongHost, 'tools'), { recursive: true });
  writeFileSync(join(wrongHost, 'tools/tas.mjs'), 'wrong');
  reject('wrong runner', /Thorium runner pin mismatch/, { ...tas, TECOS_TAS_HOST: wrongHost });

  const reset = join(work, 'src/reset.asm');
  const originalReset = readFileSync(reset, 'latin1');
  for (const [extra, error] of [['DS 1', /possible ROM gap/], ['%IF 0\n%ENDIF', /unsupported source directive/]]) {
    writeFileSync(reset, originalReset + '\n' + extra + '\n', 'latin1');
    reject(extra.replaceAll('\n', ' '), error);
  }
  writeFileSync(reset, originalReset, 'latin1');

  const entry = join(work, 'src/rom.asm');
  const originalEntry = readFileSync(entry, 'latin1');
  writeFileSync(join(work, 'outside.asm'), '; outside the source root');
  symlinkSync('../outside.asm', join(work, 'src/escape.asm'));
  for (const [include, error] of [
    ['../outside.asm', /include escapes source root/],
    [join(work, 'outside.asm'), /absolute include path/],
    ['escape.asm', /include symlink escapes source root/],
  ]) {
    writeFileSync(entry, originalEntry + '\n%INCLUDE "' + include + '"\n', 'latin1');
    reject('include escape ' + include, error);
  }
  writeFileSync(entry, originalEntry, 'latin1');

  const ram = join(work, 'src/ram.asm');
  const originalRam = readFileSync(ram, 'latin1');
  const mark = /^BDOSRME:$/m;
  assert.match(originalRam, mark);
  writeFileSync(ram, originalRam.replace(mark, 'BADRME:'), 'latin1');
  reject('missing sizing marker', /missing or invalid workspace sizing marker/);
  writeFileSync(ram, originalRam.replace(mark, 'BDOSRME EQU RAMBIOS+1'), 'latin1');
  reject('invalid sizing marker', /missing or invalid workspace sizing marker/);
  writeFileSync(ram, originalRam.replace(mark, '  DS 1\nBDOSRME:'), 'latin1');
  const buildPath = join(work, 'tools/build.mjs');
  const source = readFileSync(buildPath, 'utf8');
  const calc = 'const wsbase = RAMBIOS - workspaceBytes;';
  assert.ok(source.includes(calc));
  writeFileSync(buildPath, source.replace(calc, 'const wsbase = 0xbae7;'));
  reject('stale workspace base', /the fixed workspace must end at the RAM BIOS table/);
  writeFileSync(buildPath, source);
  const result = build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const census = JSON.parse(readFileSync(join(work, 'build/tecos/census.json')));
  assert.equal(census.ram.fixedBase, 0xbae6);
  assert.equal(census.ram.ramBios - census.ram.fixedBase, 1050);
  assert.equal(census.ram.cards.starter.tpa, 47267);
  assert.equal(census.ram.cards.fourG8M.tpa, 46563);
  const previous = new Map(['tecos.rom', 'tecos.d8.json', 'census.json'].map(name => {
    const path = join(work, 'build/tecos', name);
    return [path, readFileSync(path)];
  }));
  const qualifiedRam = readFileSync(ram, 'latin1');
  const stack = /^STKBASE:$/m;
  assert.match(qualifiedRam, stack);
  writeFileSync(ram, qualifiedRam.replace(stack, 'BADSTKB:'), 'latin1');
  const late = build();
  assert.equal(late.status, 1, late.stdout + late.stderr);
  assert.match(late.stderr, /symbol STKBASE missing from the map/);
  for (const [path, bytes] of previous) assert.deepEqual(readFileSync(path), bytes, path);
  console.log('Missing STKBASE leaves all prior build artifacts intact');
  writeFileSync(ram, qualifiedRam, 'latin1');

  const dist = join(work, 'dist');
  cpSync(join(root, 'dist'), dist, { recursive: true });
  const published = join(dist, 'tecos.rom');
  const originalPublished = readFileSync(published);
  const publishedMap = readFileSync(join(dist, 'tecos.d8.json'));
  const starter = readFileSync(join(dist, 'starter.img'));
  const generated = readFileSync(join(dist, 'files/SAMPLE.ASM'));
  const candidate = readFileSync(artifact);
  const wrongROM = Buffer.from(candidate);
  wrongROM[0] ^= 1;
  for (const broken of [wrongROM, candidate.subarray(0, -1)]) {
    writeFileSync(artifact, broken);
    const media = spawnSync(process.execPath, ['tools/media.mjs'], { ...opts, env: tas });
    assert.equal(media.status, 1, media.stdout + media.stderr);
    assert.match(media.stderr, /main ROM size or SHA-256 differs from the census/);
    assert.doesNotMatch(media.stderr, /"phase":"media"/);
    assert.deepEqual(readFileSync(published), originalPublished);
    assert.deepEqual(readFileSync(join(dist, 'tecos.d8.json')), publishedMap);
    assert.deepEqual(readFileSync(join(dist, 'starter.img')), starter);
    assert.deepEqual(readFileSync(join(dist, 'files/SAMPLE.ASM')), generated);
  }
  console.log('Media refused wrong bytes and a short ROM with the existing dist intact');
  console.log('DS 1 derives 1,050 bytes and WSBASE BAE6h, with both TPAs one byte smaller');
} finally {
  rmSync(work, { recursive: true, force: true });
}
