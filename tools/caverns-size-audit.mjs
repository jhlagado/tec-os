// Read-only size/link audit on a disposable native TEC-OS card.
// Usage: BAZA_BUILD_REPORT [BAZA_DIRECTORY [RTL_INCLUDE]].
// Requires matching compiler/runtime artifacts; changes no game source.
import fs from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
import {restartVectors} from './caverns-scenario.mjs';
const buildPath=process.argv[2]??ROOT+'/../baza/dist/compiler-build.json';
const br=JSON.parse(fs.readFileSync(buildPath));
const compilerDir=process.argv[3]??dirname(buildPath);
const f=JSON.parse(fs.readFileSync(ROOT+'/test/caverns-basic.json'));
assert.equal(br.compilerSha256,f.compilerSha256,'native compiler report must match the qualified compiler');
assert.equal(br.librarySha256,f.librarySha256);
const rtl=fs.readFileSync(process.argv[4]??ROOT+'/../baza/src/generated/rtl.inc','utf8');
const templateStart=parseInt(/^RTSTART EQU \$([0-9A-F]+)/m.exec(rtl)[1],16);
const source=fs.readFileSync(ROOT+'/programs/CAVBASIC.BAS','utf8'),b=fs.readFileSync(ROOT+'/programs/CAVBASIC.COM');
const footer=b.lastIndexOf(Buffer.from('BZ01')),end=b.readUInt16LE(footer+4),rtstart=b.readUInt16LE(footer+8),runtime=rtstart-(templateStart-0x103),cells=Math.min(...Object.values(f.symbols).map(s=>s.address));
const hook=runtime-0x103+br.templateAddresses.setSource;let hooks=0,contextBytes=0;
const lines=new Set(source.trim().split('\n').map(s=>Number(s.split(' ')[0])));
// A source-context site sets the line and statement: LD DE,line; LD BC,statement;
// CALL hook (legacy, 9 bytes); CALL hook, DW line, DW statement (compact, 7);
// RST 1, DW line for a line's first statement (3); RST 2, DW line, DB statement
// for a later one (4). The restart forms count only when the image has the
// runtime's RST 1 to 5 table. Sites follow the source, so each one's line and
// statement must come after the last one's.
const restarts=restartVectors(b);let last=[-1,-1];
for(let i=3;i<runtime-256-8;i++){
 const legacy=b[i]===0x11&&lines.has(b.readUInt16LE(i+1))&&b[i+3]===1&&b[i+6]===0xcd&&b.readUInt16LE(i+7)===hook;
 const compact=b[i]===0xcd&&b.readUInt16LE(i+1)===hook&&lines.has(b.readUInt16LE(i+3));
 const first=restarts&&b[i]===0xcf&&lines.has(b.readUInt16LE(i+1));
 const later=restarts&&b[i]===0xd7&&lines.has(b.readUInt16LE(i+1));
 if(!(legacy||compact||first||later))continue;
 const site=legacy?[b.readUInt16LE(i+1),b.readUInt16LE(i+4)]:compact?[b.readUInt16LE(i+3),b.readUInt16LE(i+5)]:[b.readUInt16LE(i+1),first?0:b[i+3]];
 assert.ok(site[0]>last[0]||site[0]===last[0]&&site[1]>last[1],`source context ${site} at ${(i+256).toString(16)} after ${last}`);
 last=site;hooks++;contextBytes+=legacy?9:compact?7:first?3:4;
}
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
for(const name of ['BAZA.COM','BAZA.RTL']){
 const bytes=fs.readFileSync(resolve(compilerDir,name));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),name.endsWith('.COM')?f.compilerSha256:f.librarySha256);
 volume(image,'A').write(name,bytes);
}
const step=m.step.bind(m);let flags;
m.step=()=>{if(m.pc===0&&word(br.addresses.symbolBaseWord)===br.addresses.imageEnd)flags={math:m.read(br.arithmeticAddresses.selectionWord),numericDisplay:m.read(br.numericAddresses.selectionWord),...Object.fromEntries(Object.entries(br.integerAddresses).filter(([k])=>k.endsWith('Selection')).map(([k,p])=>[k,m.read(p)]))};return step();};
function command(s){const mark=m.output.length;m.enqueueInput(s+'\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.ready();},800_000_000,s);return m.text(mark);}
const serviceOutput=command('services'),shellTPA=word(6)-256;
assert.match(command('baza cavbasic'),/COM written/);assert.equal(createHash('sha256').update(volume(image,'A').read('CAVBASIC.COM')).digest('hex'),f.comSha256);
const unloadOutput=command('unload'),bareTPA=word(6)-256;
const result={gameSha256:f.comSha256,fileBytes:b.length,applicationCodeAndData:runtime-0x103,runtimeCodeAndWorkspace:cells-runtime,scalarCells:footer+256-cells,entryJump:3,footer:10,padding:b.length-(end-256),sourceContextSites:hooks,sourceContextBytes:contextBytes,dataBlocks,encodedDATABytes:dataBytes,DATAstringBytes:dataText,otherLiteralTextBytes:otherText,remainingApplicationInstructionsAndInlineMetadata:runtime-0x103-dataBytes-otherText-contextBytes,flags,shellTPA,bareTPA,serviceOutput,unloadOutput};
fs.mkdirSync(ROOT+'/build/caverns',{recursive:true});
fs.writeFileSync(ROOT+'/build/caverns/size-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
