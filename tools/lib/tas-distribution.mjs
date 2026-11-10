import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkInterfaces, DHLEN, FORMAT, fixupsOf, packSvc } from './svc.mjs';

export const GLCD_SOURCE = 'drivers/glcd.asm';
export const MON3_SOURCE = 'drivers/mon3.asm';

const relativeSymbols = ({ globals, origin }) => Object.fromEntries([...globals].map(([name, symbol]) => [
  name, { kind: symbol.kind, value: symbol.value - (symbol.kind === 'label' ? origin : 0) },
]));

export function relocateGlcd(at1, at2) {
  assert.equal(at1.origin, 0x100, 'GLCD first origin');
  assert.equal(at2.origin, 0x200, 'GLCD second origin');
  assert.equal(at1.image.length, at2.image.length, 'GLCD flat lengths differ');
  assert.ok(at1.image.length > DHLEN, 'GLCD image has no body');
  assert.deepEqual(relativeSymbols(at1), relativeSymbols(at2), 'GLCD page-relative symbols differ');
  assert.deepEqual(at1.image.subarray(0, DHLEN), at2.image.subarray(0, DHLEN), 'GLCD header varies with origin');
  assert.ok(at1.image[0] === 0x44 && at1.image[1] === FORMAT && at1.image[2] === 0, 'invalid GLCD header');
  for (const name of ['INIT', 'REMOVE']) {
    const symbol = at1.globals.get(name);
    assert.equal(symbol?.kind, 'label', name + ' is not a label');
    const offset = symbol.value - at1.origin;
    assert.ok(offset >= DHLEN && offset < at1.image.length, name + ' is outside the GLCD body');
  }
  const fixups = fixupsOf(at1.image, at2.image, DHLEN, 'GLCD');
  const at0 = Buffer.from(at1.image);
  for (const offset of fixups) at0[offset + DHLEN]--;
  const symbols = Object.fromEntries([...at1.globals].map(([name, symbol]) => [name, symbol.value]));
  return { at0, symbols, fixups };
}

async function assembleService(root, run, source, target) {
  checkInterfaces(readFileSync(join(root, source), 'utf8'), target);
  const assemble = origin => run({ root, entry: source, origin, target, phase: 'flat' });
  const at1 = await assemble(0x100);
  const at2 = await assemble(0x200);
  const { at0, symbols, fixups } = relocateGlcd(at1, at2);
  return packSvc(at0, symbols, fixups).file;
}

export const assembleGlcd = (root, run) => assembleService(root, run, GLCD_SOURCE, 'GLCD.SVC');

/** MON3.SVC, the MON-3 session service, by the same two flat assemblies. */
export const assembleMon3 = (root, run) => assembleService(root, run, MON3_SOURCE, 'MON3.SVC');

export async function assembleDistributionCom(root, run, name) {
  assert.ok(name === 'MOUNT.COM' || name === 'DEMO.COM', 'unsupported TAS distribution program');
  const entry = name === 'DEMO.COM' ? 'programs/DEMO.ASM' : 'test/programs/' + name.replace('.COM', '.asm').toLowerCase();
  const { image, globals } = await run({ root, entry, origin: 0x100, target: name, phase: 'final' });
  const reserves = name === 'MOUNT.COM' ? [['NAME', 11], ['DESC', 32], ['MNTL', 11]]
    : [['DIGBUF', 6, 30], ['LEDBUF', 24, 24]];
  for (const [label, size, fromEnd] of reserves) {
    const symbol = globals.get(label);
    const start = symbol?.value - 0x100;
    assert.ok(symbol?.kind === 'label' && start >= 0 && start + size <= image.length, label + ' reserve extent');
    if (fromEnd !== undefined) assert.equal(start, image.length - fromEnd, label + ' trailing reserve');
    assert.ok(image.subarray(start, start + size).every(byte => byte === 0), label + ' reserve must be zero');
  }
  return image;
}
