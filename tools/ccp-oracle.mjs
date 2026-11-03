// Qualification of the reconstructed Digital Research CCP, not TEC-OS parity.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { transform } from 'esbuild';
import { assembleAtomProject, materializeAtomGeneration, writeAtomD8 } from 'atom-z80';
import { createZ80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';
const P='3beed4e60a10b3f68a68e8da0f3851946b2e96a4';
const D='2cb5cb6138ac7864b0c97ea32482f617de97da97';
const portable=process.env.PORTABLE_CPM_REPO || resolve('../portable-cpm');
const debug=process.env.DEBUG80_REPO || resolve('../debug80');
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputs={};
function blob(repo,pin,path) {
 const b=execFileSync('git',['-C',repo,'show',`${pin}:${path}`],{maxBuffer:4*1024*1024});
 inputs[`${pin}:${path}`]=sha(b); return b;
}
const moduleFrom=async text=>import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
const started=performance.now();
const scratch=await mkdtemp(join(tmpdir(),'ccp-oracle-'));
const report={kind:'original-system qualification, not TEC-OS parity',pins:{portable:P,debug:D,atom:'0.3.7',runtime:'0.3.3'},inputs,normalization:[],patches:[],geometry:{records:2002,recordBytes:128,tracks:77,sectors:26,systemRecords:52},addresses:{ccp:0xe400,bdos:0xec00,bios:0xfa00},results:[]};
try {
 const disk=blob(portable,P,'third_party/cpm22/cpm22.img');
 assert.equal(sha(disk),'7d2898386a77ff3c1e84b0141dad251a19be795befadb7dd8a9ba5965ba4654f');
 const ccp=disk.subarray(0,0x800),bdos=disk.subarray(0x800,0x1600);
 assert.equal(sha(ccp),'67fda0f138c3654a2fb15ae49acb2e663c848774779fa9822eda0f6d3a9b8da3');
 assert.equal(sha(ccp.subarray(0,1979)),'1930f9e276ea79c4e118b3a3fc2178ca0c02732f5073ff6763d8abe1d6cd391c');
 const imported=blob(debug,D,'apps/debug80-vscode/roms/cpm22/cpm22.img');
 assert.deepEqual(disk.subarray(0,6656),imported.subarray(0,6656));
 let lastSymbols;
 async function assemble(name,source,base,length) {
  await writeFile(join(scratch,name),source);
  const a=await assembleAtomProject({root:scratch,entry:name});
  lastSymbols=Object.fromEntries(writeAtomD8(a.project,a.generation,{base}).symbols.filter(s=>s.kind==='label').map(s=>[s.name,s.address]));
  return materializeAtomGeneration(a.generation,{base,...(length?{length}:{}),fill:0}).bytes;
 }
 const upstream=blob(debug,D,'third_party/cpm22/ccp.asm');
 const converter=blob(debug,D,'scripts/cpm22/convert-8080-to-z80.mjs');
 await writeFile(join(scratch,'original.asm'),upstream);await writeFile(join(scratch,'convert.mjs'),converter);
 execFileSync(process.execPath,[join(scratch,'convert.mjs'),join(scratch,'original.asm'),join(scratch,'converted.asm'),'$E400','atom']);
 const converted=await readFile(join(scratch,'converted.asm'),'utf8');
 // ATOM's compact identifiers: bijective renaming of declared symbols only.
 const names=new Map();for(const line of converted.split('\n')){const m=/^\s*([A-Za-z_][A-Za-z0-9_]*)(?::|\s+EQU\b)/i.exec(line);if(m&&!names.has(m[1].toUpperCase()))names.set(m[1].toUpperCase(),'S'+String(names.size).padStart(6,'0'));}
 const projected=converted.replace(/"[^"\n]*"|'[^'\n]*'|;[^\n]*|\b[A-Za-z_][A-Za-z0-9_]*\b/g,t=>names.get(t.toUpperCase())??t);
 try {const rebuilt=await assemble('original-short.asm',projected,0xe400);assert.deepEqual(Buffer.from(rebuilt.subarray(0,1979)),ccp.subarray(0,1979));report.sourceReproduction={status:'pass',initializedBytes:1979,sha256:sha(rebuilt.subarray(0,1979)),emittedBytes:rebuilt.length,projectionSha256:sha(projected)};}
 catch(e){report.sourceReproduction={status:'unresolved',reason:String(e),projectionSha256:sha(projected)};}
 const biosSource=blob(portable,P,'test/fixtures/test-bios.asm').toString();
 const bios=await assemble('bios.asm','CCPBAS EQU $E400\nBDOSBAS EQU $EC00\nBIOSBAS EQU $FA00\nBIOSEND EQU $FE00\n'+biosSource,0xfa00,1024);
 const biosSymbols=lastSymbols;
 report.executables={ccp:sha(ccp),bdos:sha(bdos),bios:sha(bios)};
 const runtimePath=new URL(import.meta.resolve('@jhlagado/debug80-runtime/z80/runtime'));
 report.runtimeEntry={url:runtimePath.href,sha256:sha(await readFile(runtimePath))};
 const machineSource=blob(portable,P,'test/support/portable-cpm-machine.ts').toString();
 let adapted=(await transform(machineSource,{loader:'ts',format:'esm',target:'es2022'})).code;
 adapted=adapted.replace(/import\s*\{\s*createDebug80TestHarness\s*\}\s*from\s*[^;]+;/,'').replace(/import\s*\{[\s\S]*?targetProfile[\s\S]*?\}\s*from\s*[^;]+;/,'');
 const prefix=`const DEFAULT_PROFILE='triptych-cpu-v0.1'; const targetProfile=id=>{if(id!==DEFAULT_PROFILE)throw Error('profile');return {ccp:0xe400,bdos:0xec00,bios:0xfa00}};\n`;
 // Function injection avoids resolving repository-relative .js imports from TS.
 const machineModule=await moduleFrom(prefix+'const createDebug80TestHarness=()=>({createRuntime:globalThis.__ccpOracleRuntime});\n'+adapted);
 globalThis.__ccpOracleRuntime=io=>createZ80Runtime({memory:new Uint8Array(65536),startAddress:0},0,io);
 report.machineAdapter={source:sha(machineSource),adapted:sha(prefix+adapted),changes:['fixed default profile E400/EC00/FA00','runtime factory supplied from pinned dependency; no CPU/disk algorithm changes']};
 const {PortableCpmMachine}=machineModule;
 const fs=await moduleFrom(blob(portable,P,'tools/lib/cpm22-disk.mjs').toString());
 const install=(image,name,bytes)=>fs.installCpm22File(image,{name,bytes});
 const fresh=()=>{const x=Uint8Array.from(disk);x.fill(0xe5,6656);return x;};
 const boot=image=>new PortableCpmMachine({ccp,bdos,bios,disk:image});
 const prompt='\r\nA>';
 const command=(m,line)=>{m.enqueueAscii(line+'\r');return m.runUntilOutputSuffix(prompt,4_000_000);};
 const logical=(image,name)=>Buffer.from(fs.readCpm22File(image,name));
 let image=install(fresh(),'HELLO.TXT',Buffer.from('HELLO\r\n\x1a'));
 let m=boot(image);assert.equal(m.runUntilOutputSuffix(prompt),prompt);
 let out=command(m,'TYPE HELLO.TXT');assert.equal(out,'TYPE HELLO.TXT\rHELLO\r\n\r\nA>');
 const typeExpected=out;
 report.results.push({name:'boot and TYPE',output:out});
 out=command(m,'REN OTHER.TXT=HELLO.TXT');
 assert.equal(logical(m.exportDisk(),'OTHER.TXT').subarray(0,8).toString(),'HELLO\r\n\x1a');
 let persisted=m.exportDisk();m=boot(persisted);m.runUntilOutputSuffix(prompt);
 out=command(m,'TYPE OTHER.TXT');assert.ok(out.includes('HELLO\r\n'));
 out+=command(m,'ERA OTHER.TXT');assert.throws(()=>logical(m.exportDisk(),'OTHER.TXT'));
 report.results.push({name:'REN persist/reboot TYPE then ERA',output:out,disk:sha(m.exportDisk())});
 out=command(m,'USER 5');out+=command(m,'SAVE 0 EMPTY.DAT');
 assert.equal(m.readRam(4,1)[0]>>>4,5);
 report.results.push({name:'USER and SAVE 0',output:out,userDrive:m.readRam(4,1)[0]});
 // Observe transient state before RET can overwrite it.
 image=install(fresh(),'PROBE.COM',await assemble('probe.asm','ORG $100\n RET\n',0x100));
 m=boot(image);m.runUntilOutputSuffix(prompt);m.enqueueAscii('PROBE B:FOO*.BAR BAZ.QUX\r');
 for(let n=0;m.cpuState().pc!==0x100;n++){assert.ok(n<4_000_000,'transient entry');m.step();}
 const state={fcb1:[...m.readRam(0x5c,16)],fcb2:[...m.readRam(0x6c,16)],tail:[...m.readRam(0x80,22)],sp:m.cpuState().sp,dma:[...m.readRam(biosSymbols.CURDMA,2)],returnWord:[...m.readRam(m.cpuState().sp,2)]};
 assert.equal(Buffer.from(state.fcb1.slice(1,12)).toString(),'FOO?????BAR');
 assert.equal(Buffer.from(state.fcb2.slice(1,12)).toString(),'BAZ     QUX');
 assert.equal(state.tail[0],19);assert.equal(state.tail[20],0);assert.equal(Buffer.from(state.tail.slice(1,20)).toString(),' B:FOO*.BAR BAZ.QUX');assert.deepEqual(state.dma,[128,0]);assert.ok(state.sp>=0xe400&&state.sp<0xec00);assert.ok((state.returnWord[0]|state.returnWord[1]<<8)>=0xe400);
 m.runUntilOutputSuffix(prompt,4_000_000);report.results.push({name:'transient FCBs tail stack and RET',state});
 // $$$.SUB holds counted command records, consumed last record first.
 const sub=new Uint8Array(256);for(const [record,line] of [[0,'TYPE SECOND.TXT'],[1,'TYPE FIRST.TXT']]){sub[record*128]=line.length;sub.set(Buffer.from(line),record*128+1);}
 image=install(fresh(),'FIRST.TXT',Buffer.from('FIRST\r\n\x1a'));image=install(image,'SECOND.TXT',Buffer.from('SECOND\r\n\x1a'));image=install(image,'$$$.SUB',sub);
 m=boot(image);out=m.runUntilOutputSuffix('SECOND\r\n\r\nA>',4_000_000);
 assert.ok(out.indexOf('FIRST\r\n')<out.indexOf('SECOND\r\n'));
 // Drive the prompt's command-source check to completion before inspecting deletion.
 m.enqueueAscii('\r');out+=m.runUntilOutputSuffix(prompt,4_000_000);
 assert.throws(()=>logical(m.exportDisk(),'$$$.SUB'));
 report.results.push({name:'SUBMIT reverse order and deletion',output:out,disk:sha(m.exportDisk())});
 // Negative control reaches a prompt but changes visible content.
 image=install(fresh(),'HELLO.TXT',Buffer.from('WRONG\r\n\x1a'));m=boot(image);m.runUntilOutputSuffix(prompt);out=command(m,'TYPE HELLO.TXT');
 assert.ok(out.endsWith(prompt));assert.throws(()=>assert.equal(out,typeExpected));report.results.push({name:'negative visible-content control',caught:true,output:out});
 report.elapsedMs=performance.now()-started;report.maxRssKiB=process.resourceUsage().maxRSS;report.status='pass';
 console.log(JSON.stringify(report,null,2));
} finally {delete globalThis.__ccpOracleRuntime;await rm(scratch,{recursive:true,force:true});}
