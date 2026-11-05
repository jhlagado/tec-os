// Compare the generated distribution and independent third-page service.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DHLEN, fixupsOf, packSvc } from '../../../tools/lib/svc.mjs';
import { sameImage } from '../../../tools/lib/ks38-check.mjs';
import { decodeImage } from '../../../tools/lib/tas-d8.mjs';
import { GLCD_SOURCE, relocateGlcd } from '../../../tools/lib/tas-distribution.mjs';
import { tasAssembler } from '../../../tools/lib/tas-rom.mjs';
import { imageId } from '../../../tools/diag.mjs';

const [candidate, reference] = process.argv.slice(2).map(path => resolve(path));
assert.ok(reference, 'usage: node test/model/ks43/compare.mjs TAS_TREE ATOM_TREE');
const read = (root, path) => readFileSync(resolve(root, path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function compareMap(path, actual = JSON.parse(read(candidate, path))) {
  const { generator: got, ...data } = actual;
  const { generator: expected, ...ref } = JSON.parse(read(reference, path));
  assert.equal(got.name, 'tas');
  assert.equal(expected.name, 'atom');
  assert.deepEqual(got.inputs, expected.inputs);
  assert.equal(got.entryAddress, expected.entryAddress);
  assert.deepEqual(data, ref);
}
const paths = ['build/tecos/tecos.rom', 'build/tecos/census.json', 'build/diag/diag.rom', 'build/diag/diag.json',
  'dist/tecos.rom', 'dist/starter.img', 'dist/starter.recipe.json', 'dist/page.recipe.json',
  ...['GLCD.SVC', 'MOUNT.COM', 'DEMO.COM', 'TED.COM', 'TAS.COM', 'SAMPLE.ASM', 'STARTUP.CMD'].map(name => 'dist/files/' + name)];
for (const path of paths) {
  const got = read(candidate, path);
  assert.deepEqual(got, read(reference, path), path);
  console.log(sha(got) + '  ' + path);
}
const diagMap = 'build/diag/diag.d8.json';
compareMap(diagMap);
compareMap('build/tecos/tecos.d8.json');
compareMap('dist/tecos.d8.json');
const wrongKind = JSON.parse(read(candidate, diagMap));
const fill = wrongKind.files['boot.asm'].segments.find(segment => segment.start === 0xc007);
assert.equal(fill.kind, 'code');
fill.kind = 'data';
assert.throws(() => compareMap(diagMap, wrongKind), assert.AssertionError);

const diag = read(candidate, 'build/diag/diag.rom');
const changed = Buffer.from(diag);
changed[7] ^= 1;
changed.set(imageId(changed), 0x3ff6);
changed.writeUInt16LE(changed.subarray(0, -2).reduce((sum, byte) => (sum + byte) & 0xffff, 0), 0x3ffe);
assert.equal(sameImage(changed, diag).first[0].address, 0xc007);
for (const [name, offset] of [['MOUNT.COM', 65], ['DEMO.COM', -30]]) {
  const good = read(reference, 'dist/files/' + name);
  const bad = Buffer.from(good);
  if (offset >= 0) bad[offset] ^= 1;
  assert.notDeepEqual(offset < 0 ? bad.subarray(0, offset) : bad, good);
}

const run = await tasAssembler();
const { assembleAt } = await import(pathToFileURL(resolve(reference, 'tools/lib/prl.mjs')).href);
const source = resolve(reference, GLCD_SOURCE);
const work = resolve(reference, 'build/ks43-reference');
const assemble = origin => run({ root: candidate, entry: GLCD_SOURCE, origin, target: 'GLCD.SVC', phase: 'control-flat' });
const [at1, at2] = [await assemble(0x100), await assemble(0x200)];
const { at0, fixups, symbols } = relocateGlcd(at1, at2);
const thirdFlat = await assemble(0x9200);
for (const [label, field] of [['INIT', 15], ['REMOVE', 4]]) {
  const value = thirdFlat.globals.get(label);
  assert.equal(value.kind, 'label');
  assert.equal(value.value - 0x9200, symbols[label] - 0x100);
  assert.equal(read(candidate, 'dist/files/GLCD.SVC').readUInt16LE(field), value.value - 0x9200);
}
const ref0 = await assembleAt(source, 0, work);
const ref1 = await assembleAt(source, 0x100, work);
assert.deepEqual(at0, Buffer.from(ref0));
assert.deepEqual(at1.image, Buffer.from(ref1));
assert.deepEqual(fixups, fixupsOf(ref0, ref1, DHLEN, 'reference'));
assert.equal(fixups.length, 69);
const svc = read(candidate, 'dist/files/GLCD.SVC');
assert.deepEqual(Buffer.from(packSvc(at0, symbols, fixups).file), svc);
const third = 0x9200;
const placed = Buffer.from(svc.subarray(0, svc.readUInt16LE(6)));
let cursor = DHLEN - 1;
for (const delta of svc.subarray(placed.length)) {
  cursor += delta;
  assert.ok(delta && cursor >= DHLEN && cursor < placed.length);
  if (delta !== 255) placed[cursor] += third >> 8;
}
const refThird = Buffer.from(await assembleAt(source, third, work));
assert.deepEqual(thirdFlat.image, refThird);
assert.deepEqual(placed.subarray(DHLEN), refThird.subarray(DHLEN));
const header = Buffer.from(at2.image);
header[3]++;
assert.throws(() => relocateGlcd(at1, { ...at2, image: header }), /header varies/);
const nonunit = Buffer.from(at2.image);
nonunit[DHLEN + fixups[0]]++;
assert.throws(() => relocateGlcd(at1, { ...at2, image: nonunit }), /not relocatable/);
assert.throws(() => packSvc(at0, symbols, [...fixups, at0.length - DHLEN]), /relocation offset outside/);

// Exercise the production decoder with the exact returned image lengths.
for (const { origin, end, image } of [at1, at2]) {
  const raw = Buffer.alloc(origin === 0x100 ? image.length : Math.ceil(image.length / 128) * 128);
  image.copy(raw);
  const debug = Buffer.alloc(256);
  debug.write('TDBG', 128);
  debug[132] = 2;
  debug.writeUInt16LE(origin, 134);
  debug.writeUInt16LE(end, 136);
  debug.writeUInt16LE(image.reduce((sum, byte) => (sum + byte) & 0xffff, 0), 138);
  debug.writeUInt16LE(1, 140);
  assert.deepEqual(decodeImage(debug, raw, origin).image, image);
  assert.throws(() => decodeImage(debug, raw, origin + 1), /wrong TDBG origin/);
  assert.throws(() => decodeImage(debug, raw.subarray(0, -1), origin), /TDBG span length/);
  raw[31] ^= 1;
  assert.throws(() => decodeImage(debug, raw, origin), /TDBG checksum/);
}
console.log('ROMs, D8 maps, census, media, GLCD third page and artifact controls passed');
