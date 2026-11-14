// Regenerate the BASIC debug fixture from a real native BAZA compilation.
// Usage: node tools/caverns-fixture.mjs BAZA_BUILD_REPORT [BAZA_DIRECTORY]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
import {pinnedBytes} from './lib/pins.mjs';
const build=JSON.parse(readFileSync(process.argv[2]));
const bytes=n=>process.argv[3]?readFileSync(resolve(process.argv[3],n)):pinnedBytes(ROOT,n);
const compiler=bytes('BAZA.COM'),rtl=bytes('BAZA.RTL');
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(compiler),build.compilerSha256);
assert.equal(sha(rtl),build.librarySha256);
const source=readFileSync(resolve(ROOT,'programs/CAVBASIC.BAS'));
const image=new Uint8Array(readFileSync(resolve(ROOT,'dist/starter.img'))),a=volume(image,'A');
a.write('BAZA.COM',compiler);a.write('BAZA.RTL',rtl);a.write('CAVBASIC.BAS',source,{text:true});
const m=boot(image,{tms:true,matrix:true,width:80}),step=m.step.bind(m);
const word=p=>m.read(p)|m.read(p+1)<<8;
let symbols;
m.step=()=>{
 if(m.pc===0&&word(build.addresses.symbolBaseWord)===build.addresses.imageEnd){
  symbols={};const first=word(build.addresses.symbolBaseWord),end=word(build.addresses.symbolEndWord);
  assert.ok(end>=first&&(end-first)%8===0);
  for(let p=first;p<end;p+=8){
   const kind=m.read(p+2),space=m.read(p+3);if(kind>2||space>1)continue;
   const name=String.fromCharCode(m.read(p))+(m.read(p+1)?String.fromCharCode(m.read(p+1)):'')+['','%','$'][kind]+(space===1?'()':'');
   symbols[name]={address:word(p+4),kind,space};
  }
 }
 return step();
};
m.enqueueInput('baza cavbasic\r','matrix');
m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.ready();},800_000_000,'native Caverns compile');
assert.match(m.text(),/COM written/);assert.ok(symbols?.['P%()']);
const com=a.read('CAVBASIC.COM');assert.ok(com.length<40000);
assert.deepEqual(m.violations,[]);
const record={sourceSha256:sha(source),compilerSha256:sha(compiler),librarySha256:sha(rtl),comSha256:sha(com),comBytes:com.length,symbols};
writeFileSync(resolve(ROOT,'test/caverns-basic.json'),JSON.stringify(record,null,2)+'\n');
mkdirSync(resolve(ROOT,'build/caverns'),{recursive:true});
writeFileSync(resolve(ROOT,'build/caverns/CAVBASIC.COM'),com);
writeFileSync(resolve(ROOT,'programs/CAVBASIC.COM'),com);
console.log(JSON.stringify({bytes:com.length,comSha256:record.comSha256,symbols:Object.keys(symbols).length}));
