// Qualification of the reconstructed Digital Research CCP, not TEC-OS parity.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
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
const report={kind:'bounded original-system versus TEC-OS diagnostic, not feature parity',pins:{portable:P,debug:D,atom:'0.3.7',runtime:'0.3.3'},inputs,normalization:[],patches:[],geometry:{records:2002,recordBytes:128,tracks:77,sectors:26,systemRecords:52},addresses:{ccp:0xe400,bdos:0xec00,bios:0xfa00},results:[]};
try {
 for(const [name,version] of [['atom-z80','0.3.7'],['@jhlagado/debug80-runtime','0.3.3']]){
  const root=resolve(import.meta.dirname,'../node_modules',name);const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));assert.equal(pkg.version,version);
  const entries=[];async function walk(dir){for(const e of (await readdir(join(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name==='node_modules')continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())entries.push([p,sha(await readFile(join(root,p)))]);}}await walk('');report.pins[name]={version,treeSha256:sha(JSON.stringify(entries)),files:entries.length};
 }
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
 report.runtimeEntry={path:'@jhlagado/debug80-runtime/dist/z80/runtime.js',sha256:sha(await readFile(runtimePath))};
 const machineSource=blob(portable,P,'test/support/portable-cpm-machine.ts').toString();
 let adapted=(await transform(machineSource,{loader:'ts',format:'esm',target:'es2022'})).code;
 adapted=adapted.replace(/import\s*\{\s*createDebug80TestHarness\s*\}\s*from\s*[^;]+;/,'').replace(/import\s*\{[\s\S]*?targetProfile[\s\S]*?\}\s*from\s*[^;]+;/,'');
 const prefix=`const DEFAULT_PROFILE='triptych-cpu-v0.1'; const targetProfile=id=>{if(id!==DEFAULT_PROFILE)throw Error('profile');return {ccp:0xe400,bdos:0xec00,bios:0xfa00}};\n`;
 // Function injection avoids resolving repository-relative .js imports from TS.
 const executableAdapter=prefix+'const createDebug80TestHarness=()=>({createRuntime:globalThis.__ccpOracleRuntime});\n'+adapted;
 const machineModule=await moduleFrom(executableAdapter);
 globalThis.__ccpOracleRuntime=io=>createZ80Runtime({memory:new Uint8Array(65536),startAddress:0},0,io);
 report.machineAdapter={source:sha(machineSource),adapted:sha(executableAdapter),changes:['fixed default profile E400/EC00/FA00','runtime factory supplied from pinned dependency; no CPU/disk algorithm changes']};
 const {PortableCpmMachine}=machineModule;
 const fs=await moduleFrom(blob(portable,P,'tools/lib/cpm22-disk.mjs').toString());
 const install=(image,name,bytes)=>fs.installCpm22File(image,{name,bytes});
 const fresh=()=>{const x=Uint8Array.from(disk);x.fill(0xe5,6656);return x;};
 const boot=image=>new PortableCpmMachine({ccp,bdos,bios,disk:image});
 const prompt='\r\nA>';
 const command=(m,line)=>{m.enqueueAscii(line+'\r');return m.runUntilOutputSuffix(prompt,4_000_000);};
 const logical=(image,name)=>Buffer.from(fs.readCpm22File(image,name));
 const targetRoot=resolve(process.env.TECOS_COMPARE_ROOT || '../tec-os-ccp-calls/build/ccp-calls-model/descriptor-shared');
 const targetPin='07daed7d03565b8ec8cec8234d19365f67e87682';
 const rom=await readFile(join(targetRoot,'build/tecos/tecos.rom'));
 assert.equal(sha(rom),'ab2d0c6b8a8d5d36ad3c51af3ef22cfb166890cc412f51bb9352b7a80cb27ed6');
 const mapBytes=await readFile(join(targetRoot,'build/tecos/tecos.d8.json'));
 const {Machine,symbolsFromD8,EXPAND1_WRITES}=await import(join(targetRoot,'host/machine.mjs'));
 const {createContainer,parseContainer,findVolume,volumePayload}=await import(join(targetRoot,'tools/lib/container.mjs'));
 const {CpmVolume}=await import(join(targetRoot,'tools/lib/cpmfs.mjs'));
 const symbols=symbolsFromD8(JSON.parse(mapBytes));
 const targetFiles={};
 for(const path of ['host/machine.mjs','tools/lib/bytes.mjs','tools/lib/container.mjs','tools/lib/cpmfs.mjs','src/cpm/ccp.asm','src/cpm/bdos.asm','package-lock.json'])targetFiles[path]=sha(await readFile(join(targetRoot,path)));
 const targetRepo=resolve(process.env.TECOS_MODEL_REPO || '../tec-os-ccp-calls');
 report.target={modelPin:targetPin,modelTool:sha(blob(targetRepo,targetPin,'tools/ccp-call-model.mjs')),rom:sha(rom),symbols:sha(mapBytes),files:targetFiles,resolver:'TECOS_COMPARE_ROOT, default ../tec-os-ccp-calls/build/ccp-calls-model/descriptor-shared',geometry:'single G1M A: volume, write-through; independent of reference disk geometry'};
 const targetVol=image=>{const info=parseContainer(image),v=findVolume(info,'A');return new CpmVolume(volumePayload(image,v),v.g,{readOnly:false});};
 const padded=text=>{const b=new Uint8Array(128).fill(0x1a);b.set(Buffer.from(text));return b;};
 const hello=padded('HELLO\r\n'),probe=padded('');probe[0]=0xc9;
 const files=[['HELLO.TXT',hello],['PROBE.COM',probe]];
 const refImage=()=>files.reduce((image,[name,bytes])=>install(image,name,bytes),fresh());
 const tecImage=()=>{const x=createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A',writeBehind:false}]);for(const [name,bytes] of files)targetVol(x).write(name,bytes);return x;};
 report.logicalInputs=files.map(([name,bytes])=>({name,user:0,records:1,sha256:sha(bytes)}));
 function refBoot(image=refImage()){const m=boot(image);m.runUntilOutputSuffix(prompt);return m;}
 function tecBoot(image=tecImage()){const m=new Machine({rom,symbols,sdImage:image,tms:false,matrix:false,glcd:false,rtc:false});m.expect(/\r\nA>$/);return m;}
 function refWait(m){for(let n=0;m.cpuState().pc!==biosSymbols.CONIN;n++){assert.ok(n<1_000_000,'reference input wait');m.step();}}
 const refRun=(m,line)=>{const output=command(m,line);refWait(m);return output;};
 const snapshotRef=image=>Array.from({length:64},(_,i)=>image.subarray(6656+i*32,6656+(i+1)*32)).filter(e=>e[0]<16).map(e=>{const name=Buffer.from(e.subarray(1,9)).toString().trim()+'.'+Buffer.from(e.subarray(9,12)).toString().trim();const data=logical(image,name);return {name,user:e[0],records:e[15],sha256:sha(data)};}).sort((a,b)=>a.name.localeCompare(b.name));
 const snapshotTec=image=>targetVol(image).list().map(f=>({name:f.name,user:f.user,records:f.records,sha256:sha(targetVol(image).read(f.name,{user:f.user}))})).sort((a,b)=>a.name.localeCompare(b.name));
 let r=refBoot(),t=tecBoot();
 for(const line of ['USER 0','USER 00','USER 01','USER 15','USER 16','USER 1 EXTRA']){
  refRun(r,'USER 0');t.command('USER 0');
  const original={output:refRun(r,line),userDrive:r.readRam(4,1)[0]};
  const tecos={output:t.command(line),userDrive:t.read(4)};
  report.results.push({case:line,original,tecos,sameOutput:original.output===tecos.output,sameUser:original.userDrive===tecos.userDrive});
 }
 r=refBoot();t=tecBoot();
 for(const line of ['TYPE HELLO.TXT','REN OTHER.TXT=HELLO.TXT','SAVE 0 EMPTY.DAT']){
  const original={output:refRun(r,line)},tecos={output:t.command(line)};
  report.results.push({case:line,original,tecos,sameOutput:original.output===tecos.output});
 }
 // Both drives are write-through. Export physical images, create fresh machines,
 // then observe logical files and bytes, not unlike raw geometry/allocation maps.
 const rd=r.exportDisk(),td=Uint8Array.from(t.sdImage);
 r=refBoot(rd);t=tecBoot(td);
 const original={files:snapshotRef(r.exportDisk()),output:refRun(r,'TYPE OTHER.TXT')};
 const tecos={files:snapshotTec(t.sdImage),output:t.command('TYPE OTHER.TXT')};
 assert.deepEqual(original.files,tecos.files,'paired persisted logical file effects');
 report.results.push({case:'export/reboot persisted logical files',original,tecos,sameOutput:original.output===tecos.output,sameFiles:true});
 r=refBoot();t=tecBoot();const line='PROBE B:FOO*.BAR BAZ.QUX';r.enqueueAscii(line+'\r');t.mark=t.output.length;t.type(line+'\r');
 for(let n=0;r.cpuState().pc!==0x100;n++){assert.ok(n<4_000_000,'original transient');r.step();}
 t.runUntil(()=>t.pc===0x100,100_000_000,'TEC-OS transient');
 const take=(read,sp,dma)=>({fcb1:Array.from({length:36},(_,i)=>read(0x5c+i)),fcb2:Array.from({length:36},(_,i)=>read(0x6c+i)),tail:Array.from({length:21},(_,i)=>read(0x80+i)),sp,dma:Array.from({length:2},(_,i)=>read(dma+i)),returnWord:[read(sp),read(sp+1)]});
 const rs=take(a=>r.readRam(a,1)[0],r.cpuState().sp,biosSymbols.CURDMA),ts=take(a=>t.read(a),t.cpu.cpu.sp,t.sym('CURDMA'));
 assert.deepEqual(rs.tail,ts.tail);assert.deepEqual(rs.dma,ts.dma);
 r.runUntilOutputSuffix(prompt);t.expect(/\r\nA>$/);
 report.results.push({case:line,original:rs,tecos:ts,sameTail:true,sameDma:true,placement:'SP/return address differ intentionally: original resident RAM CCP versus TEC-OS ROM CCP and warm-boot return; no address normalization applied',fcbByteDifferences:rs.fcb1.flatMap((v,i)=>v===ts.fcb1[i]?[]:[{address:0x5c+i,original:v,tecos:ts.fcb1[i]}])});
 assert.deepEqual(EXPAND1_WRITES,[]);assert.deepEqual(t.violations,[]);
 report.elapsedMs=performance.now()-started;report.maxRssKiB=process.resourceUsage().maxRSS;report.status='diagnostic complete; differences are not parity failures';console.log(JSON.stringify(report,null,2));
} catch(e){report.status='harness failure';report.error=String(e);console.log(JSON.stringify(report,null,2));throw e;} finally {delete globalThis.__ccpOracleRuntime;await rm(scratch,{recursive:true,force:true});}
