// Compare the published artifacts from independent TAS and ATOM builds.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sameImage } from '../../../tools/lib/ks38-check.mjs';
import { build } from 'esbuild';

const [tasArg, atomArg, debugArg] = process.argv.slice(2);
assert.ok(debugArg, 'usage: node test/model/ks42/compare.mjs TAS_TREE ATOM_TREE DEBUG80_CHECKOUT');
const [tas, atom, debug80] = [tasArg, atomArg, debugArg].map(p => resolve(p));
const debugPin = '53853ec2968abd8513d915efa5cda621dc7ba4a3';
const git = (...args) => execFileSync('git', ['-C', debug80, ...args]);
assert.equal(git('rev-parse', 'HEAD').toString().trim(), debugPin);
assert.equal(git('status', '--porcelain', '--untracked-files=no').toString(), '', 'Debug80 reader checkout changed');

const binary = (dir, file) => readFileSync(join(dir, file));
const json = (dir, file) => JSON.parse(binary(dir, file));
const image = (dir) => binary(dir, 'build/tecos/tecos.rom');
const referenceROM = image(atom);
const actualROM = image(tas);
assert.ok(sameImage(actualROM, referenceROM).same, 'assembled ROM differs');
assert.ok(sameImage(binary(tas, 'dist/tecos.rom'), referenceROM).same, 'packaged ROM differs');
const changed = Buffer.from(actualROM);
changed[0] ^= 1;
const rejected = sameImage(changed, referenceROM);
assert.equal(rejected.count, 1);
assert.equal(rejected.first[0].address, 0xc000);

const mapFile = 'build/tecos/tecos.d8.json';
const candidate = json(tas, mapFile);
const reference = json(atom, mapFile);
assert.equal(candidate.generator.name, 'tas');
assert.equal(reference.generator.name, 'atom');

function compareMaps(actual, expected) {
  const { generator: left, ...a } = actual;
  const { generator: right, ...b } = expected;
  assert.equal(left.inputs.entry, right.inputs.entry, 'entry source');
  assert.equal(left.entryAddress, right.entryAddress, 'entry address');
  assert.deepEqual(a, b);
}
compareMaps(candidate, reference);
assert.deepEqual(json(tas, 'dist/tecos.d8.json'), candidate);
assert.deepEqual(json(tas, 'build/tecos/census.json'), json(atom, 'build/tecos/census.json'));
for (const [name, edit] of [
  ['missing symbol', m => m.symbols.splice(m.symbols.findIndex(s => s.name === 'RESET'), 1)],
  ['symbol kind', m => { m.symbols.find(s => s.name === 'RESET').kind = 'constant'; }],
  ...['end', 'line', 'lstLine'].map(field => [field, m => { m.files['reset.asm'].segments[0][field]++; }]),
]) {
  const wrong = structuredClone(candidate);
  edit(wrong);
  assert.throws(() => compareMaps(wrong, reference), assert.AssertionError, name);
}

const work = mkdtempSync(join(tmpdir(), 'tecos-kg49-reader-'));
try {
  const reader = join(work, 'reader.cjs');
  await build({
    stdin: { resolveDir: join(debug80, 'apps/debug80-vscode/src'), contents: [
      "export { parseD8DebugMap, buildMappingFromD8DebugMap } from './mapping/d8-map';",
      "export { buildSourceMapIndex, findSegmentForAddress, resolveExecutableLocation } from './mapping/source-map';",
      "export { buildD8SymbolIndex, lookupD8Definition } from './extension/d8-definition-provider';",
    ].join('\n') },
    bundle: true, outfile: reader, platform: 'node', format: 'cjs',
    plugins: [{ name: 'stub-vscode-for-lookups', setup(b) {
      b.onResolve({ filter: /^vscode$/ }, args => ({ path: args.path, namespace: 'stub-vscode' }));
      b.onLoad({ filter: /.*/, namespace: 'stub-vscode' }, () => ({ contents: 'export {};', loader: 'js' }));
    } }],
  });
  const debug = (await import(pathToFileURL(reader).href)).default;
  function lookups(value) {
    const { map, error } = debug.parseD8DebugMap(JSON.stringify(value));
    assert.ok(map, error);
    const source = debug.buildSourceMapIndex(debug.buildMappingFromD8DebugMap(map), path => path);
    const symbols = debug.buildD8SymbolIndex(map);
    const definitions = [['RESET', 'reset.asm'], ['ABICALL', 'abi.inc'], ['CODEEND', 'end.asm']]
      .map(([name, file]) => debug.lookupD8Definition(symbols, name, file));
    const breakpoints = [['reset.asm', 11], ['ram.asm', 15]]
      .map(([file, line]) => debug.resolveExecutableLocation(source, file, line));
    assert.ok(definitions.every(Boolean) && breakpoints.every(matches => matches.length));
    return {
      definitions, breakpoints,
      addresses: [0xbae7, 0xbf00, 0xc000, 0xc001, 0xc003, 0xfe91, 0xfe92]
        .map(address => debug.findSegmentForAddress(source, address)),
    };
  }
  assert.deepEqual(lookups(candidate), lookups(reference));
} finally {
  rmSync(work, { recursive: true, force: true });
}
const ranges = Object.values(candidate.files).flatMap(file => file.segments ?? []);
console.log(JSON.stringify({
  romBytes: actualROM.length, symbols: candidate.symbols.length, ranges: ranges.length,
  reservations: ranges.filter(r => r.kind === 'directive').length, debugPin,
  controls: ['ROM C000h', 'missing symbol', 'symbol kind', 'range end', 'source line', 'listing row'],
}));
