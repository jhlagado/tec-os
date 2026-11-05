// Boot the generated starter and save, build and run its edited SAMPLE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boot, ROOT, volume } from '../../lib/fixtures.mjs';

const image = new Uint8Array(readFileSync(resolve(ROOT, 'dist/starter.img')));
const m = boot(image, { tms: true, matrix: true });
const screen = () => m.screen().map(line => line.trimEnd());
const status = () => screen()[23];
const keys = (input, description, done) => {
  m.enqueueInput(input, 'matrix');
  let next = 0;
  m.runUntilChecked(() => {
    m.pumpInput();
    if (m.pending?.length || !m.waitingForInput() || m.cycles < next) return false;
    next = m.cycles + 20_000;
    return done();
  }, 400_000_000, description);
};
const disk = volume(image, 'A');
const edited = 'Hello from the TEC-OS.';
const sample = () => Buffer.from(disk.read('SAMPLE.ASM', { text: true })).toString('utf8');
const line = sample().split('\n')
  .findIndex(text => text.startsWith('HELLO:')) + 1;
assert.ok(line > 0);
keys(`ted sample.asm ${line}\r`, 'TED at the hello line', () => status().includes(`L${line} C1`));
keys('\x1b[C'.repeat(22) + 'the ', 'edit the greeting', () => screen().some(text => text.includes(edited)));
keys('\x13', 'save SAMPLE.ASM', () => sample().includes(edited));
let mark = m.output.length;
keys('\x14b', 'build SAMPLE', () => /TED\r\n/.test(m.text(mark)) && /SAMPLE\.ASM/.test(status()));
assert.match(m.text(mark), /SAMPLE\.COM written/);
mark = m.output.length;
keys('\x14r', 'run SAMPLE', () => /Press a key/.test(m.text(mark)));
assert.ok(m.text(mark).includes(edited), 'edited greeting printed');
keys(' ', 'return to TED', () => /SAMPLE\.ASM/.test(status()));
keys('\x11', 'return to CCP', () => m.ready() && screen().includes('A>'));
assert.deepEqual(m.violations, []);
console.log(`Generated starter: TED edited and saved SAMPLE.ASM line ${line}, TAS built it, and SAMPLE printed "${edited}".`);
