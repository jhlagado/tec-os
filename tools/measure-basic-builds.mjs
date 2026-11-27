// Compile the starter BASIC examples on native TEC-OS with an exact compiler.
// Usage: COMPILER_BUILD.json COMPILER_DIR OUTPUT_DIR
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
const [report,compilerDir,out]=process.argv.slice(2);
assert.ok(out,'usage: COMPILER_BUILD.json COMPILER_DIR OUTPUT_DIR');
const build=JSON.parse(readFileSync(report));
const sha=b=>createHash('sha256').update(b).digest('hex');
const compiler=readFileSync(resolve(compilerDir,'BAZC.COM')),rtl=readFileSync(resolve(compilerDir,'BAZC.RTL'));
assert.equal(sha(compiler),build.compilerSha256);assert.equal(sha(rtl),build.librarySha256);
mkdirSync(out,{recursive:true});const results=[];
for(const name of ['TIMES','BOUNCE']){
 const image=new Uint8Array(readFileSync(ROOT+'/dist/starter.img')),a=volume(image,'A');
 a.write('BAZC.COM',compiler);a.write('BAZC.RTL',rtl);
 const m=boot(image,{tms:true,matrix:true,width:80});
 m.enqueueInput('bazc '+name.toLowerCase()+'\r','matrix');
 m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.ready();},2_000_000_000,'native '+name+' compile');
 assert.match(m.text(),/COM written/);assert.deepEqual(m.violations,[]);
 const bytes=a.read(name+'.COM');writeFileSync(resolve(out,name+'.COM'),bytes);
 const r={name,bytes:bytes.length,sha256:sha(bytes),stdout:m.text(),violations:m.violations};results.push(r);
 console.log(JSON.stringify({name,bytes:r.bytes,sha256:r.sha256}));
}
writeFileSync(resolve(out,'builds.json'),JSON.stringify({compilerSha256:sha(compiler),librarySha256:sha(rtl),results},null,2)+'\n');
