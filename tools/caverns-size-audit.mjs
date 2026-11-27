// Read-only size/link audit on a disposable native TEC-OS card.
// Usage: BAZC_BUILD_REPORT [BAZC_DIRECTORY [RTL_INCLUDE]].
// Requires matching compiler/runtime artifacts; changes no game source.
import fs from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
const buildPath=process.argv[2]??ROOT+'/../baza/build/runtime-build.json';
const br=JSON.parse(fs.readFileSync(buildPath));
const compilerDir=process.argv[3]??dirname(buildPath);
const f=JSON.parse(fs.readFileSync(ROOT+'/test/caverns-basic.json'));
assert.equal(br.compilerSha256,f.compilerSha256,'native compiler report must match the qualified compiler');
assert.equal(br.librarySha256,f.librarySha256);
const rtl=fs.readFileSync(process.argv[4]??ROOT+'/../baza/src/generated/rtl.inc','utf8');
const templateStart=parseInt(/^RTSTART EQU \$([0-9A-F]+)/m.exec(rtl)[1],16);
const source=fs.readFileSync(ROOT+'/programs/CAVERNS.BAS','utf8'),b=fs.readFileSync(ROOT+'/programs/CAVERNS.COM');
const footer=b.lastIndexOf(Buffer.from('BZ01')),end=b.readUInt16LE(footer+4),rtstart=b.readUInt16LE(footer+8),runtime=rtstart-(templateStart-0x103),cells=Math.min(...Object.values(f.symbols).map(s=>s.address));
// Decode DATA blocks structurally, including digit-only whole numbers (tag 4).
// Source lines identify blocks; link, end tag and skip target guard the layout.
const dataLines=new Set(source.trim().split('\n').filter(l=>/^\d+ DATA /.test(l)).map(l=>Number(l.split(' ')[0])));
const blocks=[];let dataBytes=0,dataText=0,dataBlocks=0,otherText=0,numericDataItems=0,wholeNumberItems=0;
for(let i=3;i+8<runtime-256;i++){
 if(b[i]!==0xc3||!dataLines.has(b.readUInt16LE(i+5)))continue;
 const target=b.readUInt16LE(i+1)-256;
 if(target<=i+7||target>runtime-256)continue;
 let p=i+7,text=0,numbers=0,whole=0,valid=true;
 while(p<target-1){const tag=b[p++],length=b[p++];if(![1,2,3,4].includes(tag)||p+length+(tag===2?4:0)>target-1){valid=false;break;}
  if(tag===1)text+=length;else numbers++;
  if(tag===4)whole++;p+=length+(tag===2?4:0);
 }
 if(!valid||p!==target-1||b[p]!==0)continue;
 const previous=blocks.at(-1);assert.equal(b.readUInt16LE(i+3),previous?previous.start+259:0,'DATA linked in emission order');
 blocks.push({start:i,end:target,line:b.readUInt16LE(i+5)});dataBytes+=target-i;dataText+=text;numericDataItems+=numbers;wholeNumberItems+=whole;i=target-1;
}
assert.equal(blocks.length,dataLines.size,'every DATA line structurally decoded');dataBlocks=blocks.length;
for(const line of source.trim().split('\n')){const body=line.replace(/^\d+ /,'');if(!body.startsWith('REM ')&&!body.startsWith('DATA '))for(const match of body.matchAll(/"([^"]*)"/g))otherText+=match[1].length;}
const hook=runtime-0x103+br.templateAddresses.setSource;let hooks=0,contextBytes=0;
const lines=new Set(source.trim().split('\n').map(s=>Number(s.split(' ')[0])));
for(let i=3;i+4<runtime-256;i++){
 const block=blocks.find(x=>i>=x.start&&i<x.end);if(block){i=block.end-1;continue;}
 const legacy=i+9<=b.length&&b[i]===0x11&&lines.has(b.readUInt16LE(i+1))&&b[i+3]===1&&b[i+6]===0xcd&&b.readUInt16LE(i+7)===hook;
 const compact=i+7<=b.length&&b[i]===0xcd&&b.readUInt16LE(i+1)===hook&&lines.has(b.readUInt16LE(i+3));
 const first=b[i]===0xcf&&lines.has(b.readUInt16LE(i+1));
 const later=b[i]===0xd7&&lines.has(b.readUInt16LE(i+1))&&b[i+3]>0;
 if(legacy||compact||first||later){hooks++;contextBytes+=legacy?9:compact?7:first?3:4;}
}
const image=new Uint8Array(fs.readFileSync(ROOT+'/dist/starter.img'));
for(const name of ['BAZC.COM','BAZC.RTL']){
 const bytes=fs.readFileSync(resolve(compilerDir,name));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),name.endsWith('.COM')?f.compilerSha256:f.librarySha256);
 volume(image,'A').write(name,bytes);
}
// Install files before boot, so directory/cache state belongs to this image.
const m=boot(image,{tms:true,matrix:true,width:80}),word=p=>m.read(p)|m.read(p+1)<<8;
const step=m.step.bind(m);let flags;
m.step=()=>{if(m.pc===0&&word(br.addresses.symbolBaseWord)===br.addresses.imageEnd)flags={math:m.read(br.arithmeticAddresses.selectionWord),numericDisplay:m.read(br.numericAddresses.selectionWord),...Object.fromEntries(Object.entries(br.integerAddresses).filter(([k])=>k.endsWith('Selection')).map(([k,p])=>[k,m.read(p)]))};return step();};
function command(s){const mark=m.output.length;m.enqueueInput(s+'\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.ready();},800_000_000,s);return m.text(mark);}
const serviceOutput=command('services'),shellTPA=word(6)-256;
assert.match(command('bazc caverns'),/COM written/);assert.equal(createHash('sha256').update(volume(image,'A').read('CAVERNS.COM')).digest('hex'),f.comSha256);
const unloadOutput=command('unload'),bareTPA=word(6)-256;
const result={gameSha256:f.comSha256,fileBytes:b.length,applicationCodeAndData:runtime-0x103,runtimeCodeAndWorkspace:cells-runtime,scalarCells:footer+256-cells,entryJump:3,footer:10,padding:b.length-(end-256),sourceContextSites:hooks,sourceContextBytes:contextBytes,dataBlocks,numericDataItems,wholeNumberItems,encodedDATABytes:dataBytes,DATAstringBytes:dataText,otherLiteralTextBytes:otherText,remainingApplicationInstructionsAndInlineMetadata:runtime-0x103-dataBytes-otherText-contextBytes,flags,shellTPA,bareTPA,serviceOutput,unloadOutput};
fs.writeFileSync(ROOT+'/build/caverns/size-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
