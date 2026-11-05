import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkInterfaces, DHLEN, FORMAT, fixupsOf, packSvc } from './svc.mjs';

export const GLCD_SOURCE = 'drivers/glcd.asm';

const relativeSymbols = ({ globals, origin }) => Object.fromEntries([...globals].map(([name, symbol]) => [
  name, { kind: symbol.kind, value: symbol.value - (symbol.kind === 'label' ? origin : 0) },
]));

export function relocateGlcd(at1, at2) {
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

export async function assembleGlcd(root, run) {
  checkInterfaces(readFileSync(join(root, GLCD_SOURCE), 'utf8'), 'GLCD');
  const assemble = origin => run({ root, entry: GLCD_SOURCE, origin, target: 'GLCD.SVC', phase: 'flat' });
  const at1 = await assemble(0x100);
  const at2 = await assemble(0x200);
  const { at0, symbols, fixups } = relocateGlcd(at1, at2);
  return packSvc(at0, symbols, fixups).file;
}

export async function assembleDistributionCom(root, run, name) {
  assert.ok(name === 'MOUNT.COM' || name === 'DEMO.COM', 'unsupported TAS distribution program');
  const entry = 'test/programs/' + name.replace('.COM', '.asm').toLowerCase();
  const { image } = await run({ root, entry, origin: 0x100, target: name, phase: 'final' });
  // The decoded image includes DS bytes, including the final DEMO buffers.
  return image;
}
