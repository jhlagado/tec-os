#!/usr/bin/env node
// Capture the original operand checks
// before their fixture comparisons.
// Exceptions remain model results,
// never passing test receipts.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [rootArg, pin, output] = process.argv.slice(2);
if (!rootArg || !/^[0-9a-f]{40}$/.test(pin ?? '') || !output) {
  throw Error('usage: trace-ccp-operands.mjs ROOT FULL_PIN OUTPUT.json');
}
const root = resolve(rootArg);
const out = resolve(output);
const underRoot = relative(root, out);
assert.ok(underRoot.startsWith('../'), 'write model evidence outside the measured checkout');
const driver = fileURLToPath(import.meta.url);
const driverRoot = resolve(dirname(driver), '..');
const driverPin = execFileSync('git', ['-C', driverRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['-C', driverRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const verify = () => {
  assert.equal(git('rev-parse', 'HEAD'), pin);
  assert.equal(git('status', '--porcelain'), '', 'capture requires a clean pinned checkout');
};
verify();
for (const key of ['TAS_COM', 'TECOS_TAS_HOST']) {
  assert.equal(process.env[key], undefined, `unset ${key} to use this root's prepared inputs`);
}
const host = resolve(root, '.inputs/tas-host');
const hostGit = (...args) => execFileSync('git', ['-C', host, ...args], { encoding: 'utf8' }).trim();
const hostPin = hostGit('rev-parse', 'HEAD');
const verifyHost = () => {
  assert.equal(hostGit('rev-parse', 'HEAD'), hostPin);
  assert.equal(hostGit('status', '--porcelain', '--untracked-files=no'), '', 'tracked compiler host source must be clean');
};
verifyHost();
const inputBytes = readFileSync(resolve(root, 'test/inputs.json'));
const inputPins = JSON.parse(inputBytes).inputs;
const tasSha256 = sha(readFileSync(resolve(root, '.inputs/TAS.COM')));
assert.equal(tasSha256, inputPins['TAS.COM'].sha256);
const path = resolve(root, 'test/ccp-operands.test.mjs');
const original = readFileSync(path, 'utf8');
let source = original;
function once(before, after) {
  assert.equal(source.split(before).length, 2, `unique capture insertion: ${before}`);
  source = source.replace(before, after);
}
const registered = [], captures = [];
assert.equal(globalThis.__ccpTraceModel, undefined);
globalThis.__ccpTraceModel = {
  register(name, ...args) { registered.push({ name, run: args.at(-1) }); },
  capture(packet) { captures.push(packet); },
};
once('import { test } from "node:test";', 'const test = globalThis.__ccpTraceModel.register;');
once('return { input, output, calls, peak: log.peak() };',
  'return { input, output, calls, peak: log.peak(), trace: log.calls() };');
once('  assert.deepEqual(m.violations, []);', `  globalThis.__ccpTraceModel.capture({ rows, violations: [...m.violations], romSymbols: Object.fromEntries(m.symbols), shellTable: m.read(m.sym("SHOWN")) | (m.read(m.sym("SHOWN") + 1) << 8), serviceHeadPage: m.read(m.sym("SVCHEAD")) });
  assert.deepEqual(m.violations, []);`);
source = source.replace(/from (["'])(\.[^"']+)\1/g, (_whole, _quote, specifier) =>
  `from ${JSON.stringify(pathToFileURL(resolve(dirname(path), specifier)).href)}`);
const exceptions = [];
try {
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(registered.length, 3, 'all original operand tests registered');
  for (const entry of registered) {
    try { await entry.run(); exceptions.push({ name: entry.name, error: null }); }
    catch (error) { exceptions.push({ name: entry.name, error: String(error) }); }
  }
  assert.equal(captures.length, 3, 'every original group produced complete rows');
  assert.deepEqual(captures.map(c => c.rows.length), [49, 10, 1]);
  const url = relative => pathToFileURL(resolve(root, relative)).href;
  const { romFor, SHELL_SVC } = await import(url('test/lib/fixtures.mjs'));
  const { makeSvc } = await import(url('tools/lib/svc.mjs'));
  const shell = await makeSvc(resolve(root, 'drivers/shell.asm'), { work: resolve(root, 'build/svc') });
  assert.equal(sha(shell.file), sha(SHELL_SVC), 'captured shell and symbol map agree');
  for (const capture of captures) {
    capture.shellBase = capture.shellTable ? capture.shellTable - shell.symbols.TABLE : null;
    if (capture.shellBase !== null) assert.equal(capture.shellBase & 255, 0, 'installed shell base is page aligned');
  }
  verify(); verifyHost();
  writeFileSync(out, JSON.stringify({
    classification: 'paired-trace model, not a test pass', pin, clean: true,
    node: process.version, sourceSha256: sha(original),
    transformedSourceSha256: sha(source), driverPin, driverSha256: sha(readFileSync(driver)),
    d8Sha256: sha(readFileSync(resolve(root, 'build/tecos/tecos.d8.json'))),
    inputManifestSha256: sha(inputBytes), inputPins,
    tasSha256, tasHostPin: hostPin, tasHostTrackedClean: true,
    fixtureSha256: sha(readFileSync(resolve(root, 'test/fixtures/ccp-operands.json'))),
    romSha256: sha(romFor().rom), shellSha256: sha(SHELL_SVC),
    shellSymbolsOffsets: shell.symbols, captures, exceptions,
  }, null, 2) + '\n');
  verify(); verifyHost();
} finally {
  delete globalThis.__ccpTraceModel;
}
