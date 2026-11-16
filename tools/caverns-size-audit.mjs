// Read-only size/link audit on a disposable native TEC-OS card.
// Requires the matching sibling BAZA build report; changes no game source.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
const br=JSON.parse(fs.readFileSync(ROOT+'/../baza/build/runtime-build.json'));
const f=JSON.parse(fs.readFileSync(ROOT+'/test/caverns-basic.json'));
assert.equal(br.compilerSha256,f.compilerSha256,'native compiler report must match the qualified compiler');
assert.equal(br.librarySha256,f.librarySha256);
const rtl=fs.readFileSync(ROOT+'/../baza/src/generated/rtl.inc','utf8');
const templateStart=parseInt(/^RTSTART EQU \$([0-9A-F]+)/m.exec(rtl)[1],16);
const source=fs.readFileSync(ROOT+'/programs/CAVBASIC.BAS','utf8'),b=fs.readFileSync(ROOT+'/programs/CAVBASIC.COM');
const footer=b.lastIndexOf(Buffer.from('BZ01')),end=b.readUInt16LE(footer+4),rtstart=b.readUInt16LE(footer+8),runtime=rtstart-(templateStart-0x103),cells=Math.min(...Object.values(f.symbols).map(s=>s.address));
const hook=runtime-0x103+br.templateAddresses.setSource;let hooks=0;
const lines=new Set(source.trim().split('\n').map(s=>Number(s.split(' ')[0])));
for(let i=3;i<runtime-256-8;i++)if(b[i]===0x11&&lines.has(b.readUInt16LE(i+1))&&b[i+3]===1&&b[i+6]===0xcd&&b.readUInt16LE(i+7)===hook)hooks++;
let dataBytes=0,dataText=0,dataBlocks=0,otherText=0;
for(const line of source.trim().split('\n')){
 const body=line.replace(/^\d+ /,'');if(body.startsWith('REM '))continue;
 if(body.startsWith('DATA ')){
  dataBlocks++;dataBytes+=8;
  for(const match of body.slice(5).matchAll(/"([^"]*)"|([^,]+)/g)){
   if(match[1]!==undefined){dataBytes+=2+match[1].length;dataText+=match[1].length;}
   else{const s=match[2].trim();dataBytes+=6+s.length;}
  }
 }else for(const match of body.matchAll(/"([^"]*)"/g))otherText+=match[1].length;
}
const image=new Uint8Array(fs.readFileSync(ROOT+'/dist/starter.img')),m=boot(image,{tms:true,matrix:true,width:80}),word=p=>m.read(p)|m.read(p+1)<<8;
const step=m.step.bind(m);let flags;
m.step=()=>{if(m.pc===0&&word(br.addresses.symbolBaseWord)===br.addresses.imageEnd)flags={math:m.read(br.arithmeticAddresses.selectionWord),numericDisplay:m.read(br.numericAddresses.selectionWord),...Object.fromEntries(Object.entries(br.integerAddresses).filter(([k])=>k.endsWith('Selection')).map(([k,p])=>[k,m.read(p)]))};return step();};
function command(s){const mark=m.output.length;m.enqueueInput(s+'\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.ready();},800_000_000,s);return m.text(mark);}
const serviceOutput=command('services'),shellTPA=word(6)-256;
assert.match(command('baza cavbasic'),/COM written/);assert.equal(createHash('sha256').update(volume(image,'A').read('CAVBASIC.COM')).digest('hex'),f.comSha256);
const unloadOutput=command('unload'),bareTPA=word(6)-256;
const result={gameSha256:f.comSha256,fileBytes:b.length,applicationCodeAndData:runtime-0x103,runtimeCodeAndWorkspace:cells-runtime,scalarCells:footer+256-cells,entryJump:3,footer:10,padding:b.length-(end-256),sourceContextSites:hooks,sourceContextBytes:hooks*9,dataBlocks,encodedDATABytes:dataBytes,DATAstringBytes:dataText,otherLiteralTextBytes:otherText,remainingApplicationInstructionsAndInlineMetadata:runtime-0x103-dataBytes-otherText-hooks*9,flags,shellTPA,bareTPA,serviceOutput,unloadOutput};
fs.writeFileSync(ROOT+'/build/caverns/size-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
