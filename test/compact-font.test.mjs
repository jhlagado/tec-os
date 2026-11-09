import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fontPackage,validateFontNotices} from '../tools/lib/font-package.mjs';
import {validateMain,validateNotices,validateCurrentFont} from './lib/font-validation.mjs';
const root=resolve(import.meta.dirname,'..'),read=f=>readFileSync(join(root,f));
const data=JSON.parse(read('test/fixtures/compact-font/native.json'));
const font=read('format/tec-compact/export/tec-compact.bin');
const baseline=read('test/fixtures/compact-font/baseline-main.bin');
const mainContext={baseline,font,fontAt:data.fontAt,defaultOperands:data.defaultOperands,variant:'combined'};
test('TEC Compact reconstructs every fixed slot and rejects eight conversion faults',()=>{
 const temp=mkdtempSync(join(tmpdir(),'tec-font-'));try{
  execFileSync('python3',['tools/compact-font.py',temp+'/data'],{cwd:root});
  assert.deepEqual(readFileSync(temp+'/data/font.bin'),font);
  assert.equal(JSON.parse(readFileSync(temp+'/data/conversion.json')).controls.length,8);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
test('TEC Compact actual native images use the same validator as corruptions',()=>{
 // Frozen KG53 migration account and outside-byte controls retain their inputs.
 const main=read('test/fixtures/compact-font/migration-main.bin');
 assert.equal(validateMain(main,mainContext).changedBytes,429);
 for(const [at,value] of [[data.fontAt,main[data.fontAt]^8],[data.defaultOperands[0],80],[0,main[0]^1]]){
  const b=Buffer.from(main);b[at]=value;assert.throws(()=>validateMain(b,mainContext),/main exact/);
 }
 // The actual current ROM uses the mapped font validator.
 const current=read('build/tecos/tecos.rom');
 const map=JSON.parse(read('build/tecos/tecos.d8.json'));
 const fontAt=validateCurrentFont(current,map,font).fontAt-0xc000;
 const wrong=Buffer.from(current);wrong[fontAt]^=8;
 assert.throws(()=>validateCurrentFont(wrong,map,font),/current mapped FONT/);
});
test('TEC Compact complete notices survive source and media and reject omissions',()=>{
 const {notices}=fontPackage(root),context={canonical:read('format/tec-compact/export/NOTICES.txt'),expected:notices};
 const actual={source:notices,dist:read('dist/FONT-NOTICES.txt')};
 validateNotices(actual,context);validateFontNotices(notices);
 const text=notices.toString();
 for(const remove of [
  '  * Redistributions of source code must retain the above copyright\n    notice, this list of conditions and the following disclaimer.\n',
  '  * Redistributions in binary form must reproduce the above copyright\n    notice, this list of conditions and the following disclaimer in the\n    documentation and/or other materials provided with the distribution.\n',
  'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\nAND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\nIMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\nARE DISCLAIMED.',
  'Source notice: Public domain font.  Share and enjoy.\n',
 ]){assert.ok(text.includes(remove));const b=Buffer.from(text.replace(remove,''));assert.throws(()=>validateNotices({source:b,dist:b},context),/canonical/);assert.throws(()=>validateFontNotices(b),/complete/)}
 for(const key of ['dist'])assert.throws(()=>validateNotices({...actual,[key]:Buffer.from('incomplete')},context),/notices equal/);
});
