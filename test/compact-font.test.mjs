import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fontPackage,validateFontNotices} from '../tools/lib/font-package.mjs';
import {validateMain,validateDiagnostic,deriveDiagnosticTrailer,validateNotices} from './lib/font-validation.mjs';
const root=resolve(import.meta.dirname,'..'),read=f=>readFileSync(join(root,f));
const data=JSON.parse(read('test/fixtures/compact-font/native.json'));
const font=read('format/tec-compact/export/tec-compact.bin');
const baseline=read('test/fixtures/compact-font/baseline-main.bin');
const diagBase=read('test/fixtures/compact-font/baseline-diag.bin');
const mainContext={baseline,font,fontAt:data.fontAt,defaultOperands:data.defaultOperands,variant:'combined'};
const diagContext={baseline:diagBase,font,fontAt:data.diagFontAt,variant:'combined'};
test('TEC Compact reconstructs every fixed slot and rejects eight conversion faults',()=>{
 const temp=mkdtempSync(join(tmpdir(),'tec-font-'));try{
  execFileSync('python3',['tools/compact-font.py',temp+'/data'],{cwd:root});
  assert.deepEqual(readFileSync(temp+'/data/font.bin'),font);
  assert.equal(JSON.parse(readFileSync(temp+'/data/conversion.json')).controls.length,8);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
test('TEC Compact actual native images use the same validator as corruptions',()=>{
 const main=read('build/tecos/tecos.rom'),diag=read('build/diag/diag.rom');
 assert.equal(validateMain(main,mainContext).changedBytes,429);validateDiagnostic(diag,diagContext);
 for(const [at,value] of [[data.fontAt,main[data.fontAt]^8],[data.defaultOperands[0],80],[0,main[0]^1]]){
  const b=Buffer.from(main);b[at]=value;assert.throws(()=>validateMain(b,mainContext),/main exact/);
 }
 for(const [at,trailer] of [[0,false],[0x3ff6,false],[0x3ffe,false],[0,true],[data.diagFontAt,true]]){
  const b=Buffer.from(diag);b[at]^=8;if(trailer)deriveDiagnosticTrailer(b).copy(b,0x3ff6);
  assert.throws(()=>validateDiagnostic(b,diagContext),/diagnostic (exact|derived)/);
 }
});
test('TEC Compact complete notices survive source, media and diagnostics and reject omissions',()=>{
 const {notices}=fontPackage(root),context={canonical:read('format/tec-compact/export/NOTICES.txt'),expected:notices};
 const actual={source:notices,dist:read('dist/FONT-NOTICES.txt'),diag:read('build/diag/FONT-NOTICES.txt')};
 validateNotices(actual,context);validateFontNotices(notices);
 const text=notices.toString();
 for(const remove of [
  '  * Redistributions of source code must retain the above copyright\n    notice, this list of conditions and the following disclaimer.\n',
  '  * Redistributions in binary form must reproduce the above copyright\n    notice, this list of conditions and the following disclaimer in the\n    documentation and/or other materials provided with the distribution.\n',
  'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"\nAND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\nIMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\nARE DISCLAIMED.',
  'Source notice: Public domain font.  Share and enjoy.\n',
 ]){assert.ok(text.includes(remove));const b=Buffer.from(text.replace(remove,''));assert.throws(()=>validateNotices({source:b,dist:b,diag:b},context),/canonical/);assert.throws(()=>validateFontNotices(b),/complete/)}
 for(const key of ['dist','diag'])assert.throws(()=>validateNotices({...actual,[key]:Buffer.from('incomplete')},context),/notices equal/);
});
