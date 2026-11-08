// Retain direct R1 contrasts and faults.
// Warm and cold coverage stays pending.
import * as fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rawOffer = fs.readFileSync(join(here, 'offer.dat'));
const offer = JSON.parse(rawOffer);
assert.equal(process.permission?.has('child'), false, 'effective child denial before subject imports');
assert.deepEqual(process.argv, [process.execPath, join(here, 'run.mjs')]);
assert.deepEqual(process.execArgv, offer.nodeFlags);
assert.equal(process.env.R1_OFFER_SHA, sha(rawOffer));
assert.match(process.env.ORIGO_GUARD ?? '', /^[1-9][0-9]*$/);
assert.equal(Number(process.env.ORIGO_GUARD), process.ppid);
assert.equal(process.env.NODE_OPTIONS, '--max-old-space-size=64');
assert.deepEqual(Object.keys(process.env).sort(),
  ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'R1_OFFER_SHA', 'ORIGO_GUARD', 'NODE_OPTIONS'].sort());
for (const [key, value] of Object.entries(offer.environment)) assert.equal(process.env[key], value);
const root = offer.work, files = [], readings = [], faults = [];
const sourceRows = [...offer.sourceRows, {path: 'offer.dat', bytes: rawOffer.length, sha256: sha(rawOffer)}];
let created = false, active = 'entry', providerImported = false, modelImported = false;
const block = Buffer.alloc(65536);
function fileHash(path) {
  const hash = createHash('sha256'), fd = fs.openSync(path, 'r');
  try {
    for (;;) {
      const count = fs.readSync(fd, block, 0, block.length, null);
      if (count === 0) break;
      hash.update(block.subarray(0, count));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function check(row) {
  const value = fs.lstatSync(row.path);
  assert.ok(value.isFile() && !value.isSymbolicLink() && value.nlink === 1);
  assert.equal(fs.realpathSync(row.path), row.realpath ?? row.path);
  assert.equal(value.size, row.bytes);
  assert.equal('0o' + (value.mode & 0o777).toString(8), row.mode ?? '0o644');
  assert.equal(fileHash(row.path), row.sha256);
}
function sources() {
  for (const row of sourceRows) check({...row, path: join(here, row.path), realpath: join(here, row.path)});
}
function put(name, bytes, cap) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  assert.ok(bytes.length > 0 && bytes.length <= cap, 'bounded nonempty evidence');
  const bits = [fs.constants.O_TRUNC, fs.constants.O_CREAT, fs.constants.O_WRONLY,
    fs.constants.O_EXCL, fs.constants.O_SYNC];
  assert.ok(bits.every(value => Number.isInteger(value) && value > 0));
  const fd = fs.openSync(join(root, name), bits.reduce((mask, value) => mask | value, 0), 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      assert.ok(Number.isInteger(count) && count > 0 && count <= bytes.length - offset);
      offset += count;
    }
  } finally { fs.closeSync(fd); }
  files.push({path: name, bytes: bytes.length, sha256: sha(bytes)});
}
const save = (name, value, cap) => put(name, JSON.stringify(value) + '\n', cap);
try {
  active = 'input-joins'; sources();
  const binding = JSON.parse(fs.readFileSync(join(here, 'bind.dat')));
  for (const row of binding.members) check(row);
  assert.equal(binding.runtimeAuthority, false);
  const declarations = JSON.parse(fs.readFileSync(join(here, 'cases.dat')));
  const projection = JSON.parse(fs.readFileSync(join(here, 'bytes.dat')));
  assert.equal(declarations.positive.length, 32); assert.equal(declarations.faults.length, 6);
  const direct = declarations.positive.filter(row => row.phase === 'direct');
  assert.equal(direct.length, 6); assert.deepEqual(direct.map(row => row.id), offer.expected.directIDs);
  assert.equal(projection.old.length, 29); assert.equal(projection.proposed.length, 28);
  assert.ok(!fs.existsSync(root)); fs.mkdirSync(root, {mode: 0o700}); created = true;
  for (const name of ['source', 'readings']) fs.mkdirSync(join(root, name), {mode: 0o700});
  for (const row of sourceRows) put('source/' + row.path, fs.readFileSync(join(here, row.path)), offer.caps.sourceFile);
  active = 'provider-import';
  const cpu = await import(pathToFileURL(binding.provider.cpuModule).href);
  const video = await import(pathToFileURL(binding.provider.vdpModule).href);
  providerImported = true;
  const api = {initCpu: cpu.initCpu, execute: cpu.execute, createTms9918: video.createTms9918};
  for (const value of Object.values(api)) assert.equal(typeof value, 'function');
  const model = await import('./model.mjs'); modelImported = true;
  let legacyBare = null;
  function retain(record) {
    const path = 'readings/d' + String(readings.length + 1).padStart(2, '0') + '.dat';
    save(path, record, offer.caps.reading);
    const row = {path, caseID: record.caseID, variant: record.variant, fault: record.fault,
      cycles: record.cycles, stackBytes: record.stackBytes};
    readings.push(row); return row;
  }
  for (const declaration of direct) for (const variant of ['old', 'proposed']) {
    active = declaration.id + '/' + variant;
    const record = model.observe(api, declaration, projection, variant);
    const row = retain(record);
    model.validateSetup(record, declaration, projection, model.expectedCycles(declaration, variant));
    model.verifyPolicy(record, declaration, variant);
    if (declaration.id === 'd-bare-off' && variant === 'old') legacyBare = {record, row};
  }
  function expectFault(id, action, reading, code) {
    let observed = null;
    try { action(); }
    catch (error) {
      if (!(error instanceof model.OracleFailure) || error.code !== code) throw error;
      observed = {name: error.name, code: error.code, actual: error.actual, expected: error.expected};
    }
    assert.ok(observed, 'specific fault assertion required');
    faults.push({id, reading: reading.path, rejection: observed});
  }
  active = 'n-old-c0'; assert.ok(legacyBare);
  expectFault(active, () => model.requireBare80(legacyBare.record), legacyBare.row, 'R1_BYTE');
  legacyBare = null;
  for (const id of ['n-global-32-blank', 'n-stale-shadow', 'n-absent-port']) {
    active = id;
    const fault = projection.faults[id], declaration = direct.find(row => row.id === fault.caseID);
    assert.ok(declaration);
    const record = model.observe(api, declaration, projection, 'proposed', fault);
    const row = retain(record);
    model.validateSetup(record, declaration, projection, fault.cycles);
    expectFault(id, () => model.verifyPolicy(record, declaration, 'proposed'), row, fault.code);
  }
  active = 'postflight'; sources(); for (const row of binding.members) check(row);
  assert.equal(readings.length, 15); assert.deepEqual(faults.map(row => row.id), offer.expected.faultIDs);
  save('inputs.dat', {kind: 'R1_ACTUAL_INPUT_JOINS', bindingSha256: fileHash(join(here, 'bind.dat')),
    offerSha256: sha(rawOffer), sourceRows, memberJoins: binding.members.length,
    providerFiles: binding.provider.files, providerImported, modelImported}, offer.caps.inputs);
  save('result.dat', {kind: 'R1_DIRECT_MODEL_PENDING_REVIEW', readings, faults,
    directCases: 6, cpuObservations: 15, faultDiscriminators: 4, declaredPositiveCases: 32, declaredFaultCases: 6,
    incompletePositiveIDs: declarations.incompletePositiveIDs, incompleteFaultIDs: declarations.incompleteFaultIDs,
    completeDeclaredCoverage: false, modelProjectionNotROM: true, assembled: false, physicalHardware: false,
    nativeIntegration: false, currentCandidateQualified: false, childDenied: process.permission.has('child') === false,
    pid: process.pid, ppid: process.ppid, guard: process.env.ORIGO_GUARD,
    argv: process.argv, execArgv: process.execArgv, environment: {...process.env}, offerSha256: sha(rawOffer)}, offer.caps.result);
  save('files.dat', {kind: 'R1_OUTPUT_INVENTORY', excludesOnlySelf: 'files.dat', rows: [...files]}, offer.caps.inventory);
  console.log(JSON.stringify({kind: 'R1_DIRECT_CANDIDATE', observations: 15, faults: 4, completeDeclaredCoverage: false}));
} catch (error) {
  if (created) save('fail.dat', {kind: 'R1_FIRST_FAILURE', active, providerImported, modelImported,
    completedReadings: readings.length, completedFaults: faults.length,
    error: {name: String(error.name), code: error.code ?? null, message: String(error.message).slice(0, 8192),
      stack: String(error.stack).slice(0, 8192)}, nativeIntegration: false, currentCandidateQualified: false}, offer.caps.failure);
  throw error;
}
