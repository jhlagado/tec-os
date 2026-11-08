// Prepared source only. Execution requires a separate allocation of this exact seal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {Observer,RulerError,requireReading,validateTiming,validateTotals,cacheState,makeClassifier} from './observer.mjs';
import {validateCopyResult,validateHit,validateCopyPath,validateCauses,validateExplicitFlush} from './accounts.mjs';
import {qualifyAccounts} from './probes.mjs';
import {proposedReturnedPrompt} from './prompt.mjs';
const CODE=path.dirname(fileURLToPath(import.meta.url));
const HERE=process.env.KS51_PACKET;
requireReading(HERE&&path.isAbsolute(HERE),'explicit private packet path required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(dir,n,v)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(v,null,2)+'\n');
const bind=json(path.join(HERE,'inputs.json'));
const product=process.env.KS51_PRODUCT;
const out=process.env.KS51_RESULT;
requireReading(product&&path.isAbsolute(product)&&out&&path.isAbsolute(out),'explicit absolute product/result paths required');
requireReading(process.env.ORIGO_GUARD===String(process.ppid),'actual shared guard parent required');
requireReading(!fs.existsSync(out),'result path must be fresh');
fs.mkdirSync(out,{recursive:false});
const report={runtime:{node:process.versions,platform:process.platform,arch:process.arch},status:'STARTED_NOT_QUALIFIED',baseline:bind.baseline,command:process.argv.slice(2),started:new Date().toISOString(),promptObservationCorrected:true,actualNode:{pid:process.pid,parent:process.ppid,guard:process.env.ORIGO_GUARD,argv:process.argv,execArgv:process.execArgv,executable:process.execPath,nodeOptions:process.env.NODE_OPTIONS}};
save(out,'status.json',report);
function checkFile(p,expect){const b=fs.readFileSync(p);requireReading(b.length===expect.bytes&&sha(b)===expect.sha256,`input mismatch ${p}`);return b;}
function tree(p,prefix=''){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?tree(path.join(p,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();}
function preflight(){
  const seal=json(path.join(CODE,'seal.dat'));
  for(const [p,h] of Object.entries(seal.sources))checkFile(path.join(CODE,p),h);
  requireReading(JSON.stringify(tree(HERE))===JSON.stringify(Object.keys(seal.files).sort()),'packet missing/extra path');
  for(const [p,h] of Object.entries(seal.files))checkFile(path.join(HERE,p),h);
  for(const [p,h] of Object.entries(bind.source_files))checkFile(path.join(product,p),h);
  const root=path.join(product,'node_modules/@jhlagado/debug80-runtime');
  requireReading(JSON.stringify(tree(root))===JSON.stringify(Object.keys(bind.runtime_package.files).sort()),'runtime missing/extra path');
  for(const [p,h] of Object.entries(bind.runtime_package.files))checkFile(path.join(root,p),h);
  const native={};for(const [n,h] of Object.entries(bind.native)){const b=fs.readFileSync(path.join(HERE,'frozen',n));requireReading(sha(b)===h,`native mismatch ${n}`);native[n]=b;}
  const d8=JSON.parse(native['tecos.d8.json']);
  const required=['VROW','VCOL','CONMOD','STPOS','HFLAG','CINLP','CINWE','CSTPOLL','CSTGOT','CINMX','CINME','CSTMX','CSTMXE','KBPOLL','KBDELIV'];
  for(const name of required){const found=d8.symbols.filter(s=>s.name===name);requireReading(found.length===1&&Number.isInteger(found[0].address??found[0].value),'strict prompt symbol '+name);}
  for(const [first,last] of [['CINLP','CINWE'],['CSTPOLL','CSTGOT'],['CINMX','CINME'],['CSTMX','CSTMXE'],['KBPOLL','KBDELIV']]){const at=n=>d8.symbols.find(s=>s.name===n).address;requireReading(at(first)<at(last),'strict input range '+first);}
  return {rom:native['tecos.rom'],d8,rows:json(path.join(HERE,'pc-source.json')).rows,seal:sha(fs.readFileSync(path.join(CODE,'seal.dat')))};
}
// No fixture/test helpers: their top-level assembly is outside this measurement.
async function loadRuntime(){
  const get=p=>import(pathToFileURL(path.join(product,p)).href);
  const machine=await get('host/machine.mjs');
  const container=await get('tools/lib/container.mjs');
  const cpm=await get('tools/lib/cpmfs.mjs');
  return {...machine,...container,...cpm};
}
function keys(m,text,done=()=>true,limit=1_000_000_000){
  m.enqueueInput(text,m.videoConsole()?'matrix':'serial');
  m.runUntil(()=>(m.pumpInput(),!m.pending?.length&&m.waitingForInput()&&done()),limit,`keys ${JSON.stringify(text)}`);
}
function quitEditor(m) {
  const outputStart = m.output.length;
  keys(m, '\x11', () => proposedReturnedPrompt({
    rows: m.screen(),
    row: m.read(m.sym('VROW')),
    column: m.read(m.sym('VCOL')),
    outputSinceKeys: m.text(outputStart).slice(-512),
    pending: (m.pending ?? []).length,
    waiting: m.waitingForInput(),
    ready: m.ready(),
    mode: m.read(m.sym('CONMOD')),
  }));
}
const pattern=(n,seed=19)=>Uint8Array.from({length:n},(_,i)=>(i*7+(i>>7)*13+seed)&255);
const text=n=>Buffer.from(('alpha beta gamma delta\r\n'.repeat(Math.ceil(n/24))).slice(0,n-3)+'\r\n\x1a','latin1');
const equal=(a,b,msg)=>requireReading(Buffer.from(a).equals(Buffer.from(b)),msg);
function volume(rt,image,drive){const v=rt.findVolume(rt.parseContainer(image),drive);return new rt.CpmVolume(rt.volumePayload(image,v),v.g);}
const SMALL_FIXTURE='small-single-a-v1';
function workDrive(cell){return cell.fixture===SMALL_FIXTURE?'A':'B';}
// Ordinary boot logs A. No extra guest command or hidden prime is introduced.
function smallFixture(rt,cell){
  requireReading(cell.size==='small'&&['ted','copy','baza'].includes(cell.workflow),'wrong small fixture cell');
  const image=rt.createContainer([{geometry:'G1M',label:'WORK',mount:'A',writeBehind:cell.policy==='behind'}]);
  const a=volume(rt,image,'A');
  a.write('STARTUP.CMD',Buffer.from('CON PICO 40\r\n\x1a','latin1'));
  a.write('NEIGH.DAT',pattern(1024));
  if(cell.workflow==='copy'){a.write('DATA.DAT',pattern(4096));a.write('OLD.DAT',pattern(4096,173));a.write('COPY.DAT',pattern(4096,173));}
  if(cell.workflow==='ted'){
    requireReading(bind.ted.status==='HASH_MATCHED_PIN_NOT_NEW_QUALIFICATION','pinned native TED missing');
    a.write('TED.COM',checkFile(path.join(HERE,'frozen/TED.COM'),bind.ted));
    a.write('EDIT.TXT',text(128));
  }
  if(cell.workflow==='baza'){
    requireReading(cell.nativeCase==='hello','small native fixture must use exact qualified hello');
    const offer=json(path.join(HERE,'p7-offer/manifest.json'));const c=offer.cases.find(c=>c.id===cell.nativeCase);requireReading(c,'unknown qualified native case');
    a.write('BAZA.COM',checkFile(path.join(HERE,'p7-offer',offer.compiler.path),{bytes:offer.compiler.fileBytes,sha256:offer.compiler.sha256}));
    a.write('HELLO.BAS',checkFile(path.join(HERE,`p7-offer/cases/${c.id}/HELLO.BAS`),{bytes:c.sourceDiskBytes,sha256:c.sourceSha256}));
    requireReading(!a.find('HELLO.COM')&&a.g.payloadBytes-a.usedBlocks().size*a.blockBytes>=65536,'native clean output/scratch precondition');
  }
  return image;
}
function fixture(rt,cell){
  if(cell.fixture===SMALL_FIXTURE)return smallFixture(rt,cell);
  requireReading(cell.fixture===undefined,'unknown fixture version');
  const image=rt.createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'},{geometry:cell.workflow==='dir'&&cell.size==='small'?'G1M':'G8M',label:'WORK',mount:'B',writeBehind:cell.policy==='behind'}]);
  const a=volume(rt,image,'A'),b=volume(rt,image,workDrive(cell));
  // Explicit console, independent of the cold-default assumption.
  a.write('STARTUP.CMD',Buffer.from('CON PICO 40\r\n\x1a','latin1'));
  b.write('NEIGH.DAT',pattern(1024));
  const n=cell.size==='small'?4096:24576;
  if(cell.workflow==='dir')for(let i=0;i<(cell.size==='small'?240:496);i++)b.write(`D${String(i).padStart(4,'0')}.DAT`,pattern(128));
  if(cell.workflow==='copy'){a.write('DATA.DAT',pattern(n));a.write('OLD.DAT',pattern(n,173));b.write('COPY.DAT',pattern(n,173));}
  if(cell.workflow==='ted'){
    requireReading(bind.ted.status==='HASH_MATCHED_PIN_NOT_NEW_QUALIFICATION','pinned native TED missing');
    const ted=checkFile(path.join(HERE,'frozen/TED.COM'),bind.ted);a.write('TED.COM',ted);b.write('EDIT.TXT',text(n),{text:true});
  }
  if(cell.workflow==='baza'){
    const offer=json(path.join(HERE,'p7-offer/manifest.json'));const c=offer.cases.find(c=>c.id===cell.nativeCase);requireReading(c,'unknown qualified native case');
    const compiler=checkFile(path.join(HERE,'p7-offer',offer.compiler.path),{bytes:offer.compiler.fileBytes,sha256:offer.compiler.sha256});
    a.write('BAZA.COM',compiler);const source=checkFile(path.join(HERE,`p7-offer/cases/${c.id}/HELLO.BAS`),{bytes:c.sourceDiskBytes,sha256:c.sourceSha256});b.write('HELLO.BAS',source);
    requireReading(!b.find('HELLO.COM')&&b.g.payloadBytes-b.usedBlocks().size*b.blockBytes>=65536,'native clean output/scratch precondition');
  }
  return image;
}
function physical(m){return {cpu:m.cpu.captureCpuState(),cycles:m.cycles,latch:m.sysCtrl,main:m.main.map(b=>sha(b)),expand:m.expand.map(b=>sha(b)),card:sha(m.sdImage),output:sha(Buffer.from(m.output)),serial:sha(Buffer.from(m.serial)),vram:sha(m.tec1g.state.display.tms9918.stateSnapshot().vram),sd:Object.fromEntries(Object.entries(m.sd).filter(([k,v])=>k!=='image'&&typeof v!=='function')),cache:cacheState(m)};}
function machine(rt,input,image){return new rt.Machine({rom:input.rom,symbols:rt.symbolsFromD8(input.d8),sdImage:image,highCapacity:true,ram96:true,mains:2,expands:2,tms:true,matrix:true,glcd:false,ramFill:0x76,rtc:true,clock:new Date('2026-01-01T12:00:00Z')});}
function boot(m){m.expect(/A>$/,{from:0,maxCycles:300_000_000});m.runUntil(()=>m.ready(),300_000_000,'first prompt');requireReading(m.videoConsole()&&m.tmsLayout().cols===40,'explicit PICO40 console not active');}
function publicCommand(m,line){m.mark=m.output.length;keys(m,line+'\r',()=>/\r\n\d*[A-P]>$/.test(m.text(m.mark)),4_000_000_000);return m.text(m.mark);}
function runDir(m){m.mark=m.output.length;m.enqueueInput('DIR B:\r','matrix');let pages=0;let last=m.cycles;
  m.runUntil(()=>{m.pumpInput();if(!m.pending?.length&&m.pc===m.sym('PGWAIT')){requireReading(++pages<=128,'pager response budget');m.enqueueInput(' ','matrix');}
    requireReading(m.cycles-last<=5_000_000_000,'directory cycle budget');
    return !m.pending?.length&&m.waitingForInput()&&/\r\n\d*A>$/.test(m.text(m.mark));},5_000_000_000,'complete DIR with spaces');return {text:m.text(m.mark),pages};
}
function workload(rt,m,cell,phase){
  const b=volume(rt,m.sdImage,workDrive(cell));const neighbor=Buffer.from(b.read('NEIGH.DAT'));const a=volume(rt,m.sdImage,'A');
  const measured=(label,f)=>{phase(label);return f();};let details={};
  if(cell.workflow==='dir'){const before=sha(m.sdImage);details=measured('directory',()=>runDir(m));requireReading(sha(m.sdImage)===before,'DIR mutated card');for(const f of b.list())requireReading(details.text.includes(f.name.split('.')[0]),`listing omitted ${f.name}`);const free=(b.g.dpb.dsm+1-b.usedBlocks().size)*b.blockBytes/1024;requireReading(details.text.includes(`${b.list().length} files, ${free}K free`),'directory count/free-space mismatch');}
  if(cell.workflow==='copy'){
    const before=Buffer.from(a.read('DATA.DAT'));const destinationBefore=Buffer.from(b.read('COPY.DAT'));requireReading(!destinationBefore.equals(before),'COPY must start with a distinct destination');details.destinationPreimageSha256=sha(destinationBefore);
    details.text=measured('copy-command',()=>publicCommand(m,`COPY A:DATA.DAT ${workDrive(cell)}:COPY.DAT`));
    requireReading(/COPIED [0-9A-F]{4}/.test(details.text),'COPY success missing');
    measured('following-warm-flush',()=>publicCommand(m,'\x03'));
    validateCopyResult({sourceBefore:before,destinationBefore,destinationAfter:b.read('COPY.DAT'),sourceAfter:a.read('DATA.DAT'),neighborBefore:neighbor,neighborAfter:b.read('NEIGH.DAT')});details.copyOracle={sourceSha256:sha(before),destinationBeforeSha256:sha(destinationBefore),destinationAfterSha256:sha(b.read('COPY.DAT'))};
  }
  if(cell.workflow==='ted'){
    const before=Buffer.from(b.read('EDIT.TXT',{text:true}));
    measured('editor-launch-load',()=>keys(m,`TED ${workDrive(cell)}:EDIT.TXT\r`,()=>m.screen().at(-1).includes('EDIT.TXT')));
    const expected=Buffer.concat([Buffer.from('Y'),before]);
    measured('editor-edit',()=>keys(m,'Y'));
    measured('editor-save',()=>keys(m,'\x13',()=>Buffer.from(b.read('EDIT.TXT',{text:true})).equals(Buffer.concat([Buffer.from('Y'),before]))));
    measured('editor-quit-flush',()=>quitEditor(m));
    equal(b.read('EDIT.TXT',{text:true}),expected,'TED saved text differs');
    measured('editor-cached-reopen',()=>keys(m,`TED ${workDrive(cell)}:EDIT.TXT\r`,()=>m.screen()[0].startsWith(expected.toString('latin1').split('\n')[0].slice(0,30))));
    measured('editor-final-quit',()=>quitEditor(m));details.expectedTextSha256=sha(expected);
  }
  if(cell.workflow==='baza'){
    const offer=json(path.join(HERE,'p7-offer/manifest.json'));const c=offer.cases.find(c=>c.id===cell.nativeCase);
    requireReading(!b.find('HELLO.COM'),'owned output must be absent before measured native compile');
    measured('compiler-select-drive',()=>publicCommand(m,`${workDrive(cell)}:`));
    let loaded=false,sourceOpened=false,statusSet=false;const calls=[];m.mark=m.output.length;m.enqueueInput(c.invocation+'\r','matrix');phase('compiler-command-load');
    const compiler=fs.readFileSync(path.join(HERE,'p7-offer/compiler/BAZA.COM'));
    m.runUntil(()=>{m.pumpInput();const cpu=m.cpu.cpu;
      if(!loaded&&m.pc===256){equal(Uint8Array.from({length:compiler.length},(_,i)=>m.read(256+i)),compiler,'native loaded image mismatch');loaded=true;phase('compiler-native-initialisation');}
      if(loaded&&m.pc===5){const de=(cpu.d<<8)|cpu.e;const fcb=String.fromCharCode(...Array.from({length:11},(_,i)=>m.read(de+1+i)&127));calls.push({cycle:m.cycles,function:cpu.c,de});
        if(!sourceOpened&&cpu.c===15&&fcb==='HELLO   BAS'){sourceOpened=true;phase('compiler-source-open-through-status');}
        if(cpu.c===108&&de!==65535){requireReading(de===c.compilerExit,'native exit status mismatch');statusSet=true;phase('compiler-return-flush');}}
      return !m.pending?.length&&m.waitingForInput()&&new RegExp(`\\r\\n\\d*${workDrive(cell)}>$`).test(m.text(m.mark));},c.cycleAllowanceUsed,'qualified native compile');
    requireReading(loaded&&sourceOpened&&statusSet,'native phase/status witnesses incomplete');
    requireReading(m.text(m.mark).includes(c.compilerConsole),'native compiler diagnostic mismatch');details.text=m.text(m.mark);details.bdosCalls=calls;
    measured('compiler-following-flush',()=>publicCommand(m,'\x03'));
    const compiled=b.read(c.outputFile);requireReading(sha(compiled)===c.outputSha256&&compiled.length===c.outputBytes,'native output mismatch');
    requireReading(!b.list().some(f=>/^BZ[0-9]{6}\.\$\$\$$/.test(f.name)),'native temporary remains');
    equal(b.read('HELLO.BAS'),fs.readFileSync(path.join(HERE,`p7-offer/cases/${c.id}/HELLO.BAS`)),'native source changed');
    details.nativeCase=c.id;details.outputSha256=sha(compiled);details.phaseBoundary='native firstPC0100; source-open at public BDOS15 for HELLO.BAS; status at BDOS108; return/flush separate';
  }
  if(cell.fixture===SMALL_FIXTURE&&cell.workflow==='ted'){
    const ted=fs.readFileSync(path.join(HERE,'frozen/TED.COM'));const padded=Buffer.alloc(Math.ceil(ted.length/128)*128);padded.set(ted);
    equal(a.read('TED.COM'),padded,'colocated editor image changed');
  }
  if(cell.fixture===SMALL_FIXTURE&&cell.workflow==='baza')equal(a.read('BAZA.COM'),fs.readFileSync(path.join(HERE,'p7-offer/compiler/BAZA.COM')),'colocated compiler image changed');
  equal(b.read('NEIGH.DAT'),neighbor,'neighbor changed');a.usedBlocks();b.usedBlocks();requireReading(m.violations.length===0,'memory write violation');return details;
}
async function sample(rt,input,cell,mode,index){
  const image=fixture(rt,cell);const initial=sha(image);fs.writeFileSync(path.join(out,`${mode}-${index}-initial.img`),image);const m=machine(rt,input,image);
  const separate=(name,f)=>{const start=m.cycles;const o=mode==='none'?null:new Observer(m,input.rows,{mode});if(o)o.phase=name;const value=f();const reading=o?.snapshot()??{cycles:m.cycles-start};o?.detach();return {value,reading};};
  const bootReading=separate('boot',()=>boot(m)).reading;
  const prime=cell.thermal==='warm'?separate('public-prime',()=>{
    if(cell.workflow==='ted'){keys(m,`TED ${workDrive(cell)}:EDIT.TXT\r`,()=>m.screen().at(-1).includes('EDIT.TXT'));quitEditor(m);return {conditioning:'load/quit without editing source'};}
    const value=workload(rt,m,cell,()=>{});if(cell.workflow==='copy'){publicCommand(m,`COPY A:OLD.DAT ${workDrive(cell)}:COPY.DAT`);publicCommand(m,'\x03');requireReading(!Buffer.from(volume(rt,image,workDrive(cell)).read('COPY.DAT')).equals(Buffer.from(volume(rt,image,'A').read('DATA.DAT'))),'warm COPY must restore a different preimage through the guest');}if(cell.workflow==='baza'){publicCommand(m,'ERA HELLO.COM');publicCommand(m,'\x03');requireReading(!volume(rt,image,workDrive(cell)).find('HELLO.COM'),'warm native output cleanup failed');}return value;
  }):null;
  const stateBefore=physical(m);const start=m.cycles;const hostBefore=process.memoryUsage();const began=performance.now();let observer=mode==='none'?null:new Observer(m,input.rows,{mode});
  const phases=[];const phase=name=>{observer&&(observer.phase=name);phases.push({name,cycle:m.cycles});};
  const details=workload(rt,m,cell,phase);
  const reading=observer?.snapshot()??{cycles:m.cycles-start};observer?.detach();const wallMs=performance.now()-began;const hostAfter=process.memoryUsage();
  if(observer)validateTotals(reading);
  const final=physical(m);
  const id=`${mode}-${index}`;fs.writeFileSync(path.join(out,id+'-card.img'),image);
  save(out,id+'-reading.json',{cell,mode,index,initialCardSha256:initial,bootReading,prime,stateBefore,phases,details,reading,final,hostWallMs:wallMs,hostMemoryBefore:hostBefore,hostMemoryAfter:hostAfter,hostMemoryScope:'snapshots; not per-mode peaks; guard reports whole-job sampled family peak'});
  // Fresh RAM, unchanged resulting card, public reopen/verification; outside measured interval.
  const fresh=machine(rt,input,image);boot(fresh);
  if(cell.workflow==='ted'){keys(fresh,`TED ${workDrive(cell)}:EDIT.TXT\r`,()=>fresh.screen()[0].startsWith(Buffer.from(volume(rt,image,workDrive(cell)).read('EDIT.TXT',{text:true})).toString('latin1').split('\n')[0].slice(0,30)));quitEditor(fresh);}
  if(cell.workflow==='copy')equal(volume(rt,image,workDrive(cell)).read('COPY.DAT'),volume(rt,image,'A').read('DATA.DAT'),'fresh-card copy differs');
  if(cell.workflow==='baza'){
    const offer=json(path.join(HERE,'p7-offer/manifest.json'));const c=offer.cases.find(c=>c.id===cell.nativeCase);
    const standalone=rt.createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'},{geometry:'G8M',label:'WORK',mount:'B',writeBehind:cell.policy==='behind'}]);
    volume(rt,standalone,'A').write('STARTUP.CMD',Buffer.from('CON PICO 40\r\n\x1a','latin1'));volume(rt,standalone,'B').write('HELLO.COM',volume(rt,image,workDrive(cell)).read('HELLO.COM'));
    requireReading(!volume(rt,standalone,'A').find('BAZA.COM')&&!volume(rt,standalone,'B').find('HELLO.BAS'),'standalone compiler/source present');
    const run=machine(rt,input,standalone);boot(run);publicCommand(run,'B:');const text=publicCommand(run,c.runGenerated);const body=text.replace(/^HELLO\r\r\n/,'').replace(/\r\nB>$/,'');
    equal(Buffer.from(body,'latin1'),fs.readFileSync(path.join(HERE,`p7-offer/cases/${c.id}/expected-stdout.bin`)),'generated standalone stdout differs');
    requireReading(run.read(run.sym('PRGCODE'))===c.programExit&&run.read(run.sym('PRGCODE')+1)===0,'generated standalone status differs');
    fs.writeFileSync(path.join(out,id+'-standalone.img'),standalone);save(out,id+'-standalone.json',{text,body,status:c.programExit,final:physical(run),compilerAbsent:true,sourceAbsent:true,scope:'acceptance outside timed compile'});
  }
  return {id,cycles:reading.cycles,final,wallMs,capacityClass:reading.capacityClass??null,completeWorkingSet:reading.completeWorkingSet??null,counts:reading.counts??null};
}
function rejectReading(name,f){let rejected=false;try{f();}catch(e){if(!(e instanceof RulerError))throw e;rejected=true;}requireReading(rejected,`fault accepted ${name}`);return {name,rejected};}
function rpc(m,name,{a=0,hl=0,bc=0,de=0}={}){
  const c=m.cpu.cpu;const sp=0x7000;const end=0x6000;m.write(sp,end&255);m.write(sp+1,end>>8);c.sp=sp;c.pc=typeof name==='number'?name:m.sym(name);c.a=a;c.b=bc>>8;c.c=bc&255;c.d=de>>8;c.e=de&255;c.h=hl>>8;c.l=hl&255;
  m.runUntil(()=>m.pc===end&&c.sp===sp+2,1_000_000_000,`ruler ${name}`);return {a:c.a,z:!!c.flags.Z,carry:!!c.flags.C,sp:c.sp,hl:(c.h<<8)|c.l};
}
async function rulers(rt,input){
  const cell={workflow:'copy',size:'small',policy:'through',thermal:'cold'};const m=machine(rt,input,fixture(rt,cell));boot(m);
  const readings=[];
  for(const count of [1,2,128,512]){m.write(0x1000,0xed);m.write(0x1001,0xb0);for(let i=0;i<count;i++)m.write(0x2000+i,i&255);
    const c=m.cpu.cpu;c.pc=0x1000;c.b=count>>8;c.c=count&255;c.h=0x20;c.l=0;c.d=0x30;c.e=0;const before=m.cycles;const r=m.step();
    readings.push({name:`LDIR-${count}`,actual:r.cycles,expected:21*count-5,delta:m.cycles-before,pc:m.pc});
    requireReading(m.pc===0x1002&&c.b===0&&c.c===0,'runtime block-repeat granularity mismatch');for(let i=0;i<count;i++)requireReading(m.read(0x3000+i)===(i&255),'LDIR data mismatch');}
  m.write(0x1000,0);m.cpu.cpu.pc=0x1000;readings.push({name:'NOP',actual:m.step().cycles,expected:4});validateTiming(readings);
  const controls=[];const bad=Buffer.from(input.rom);bad[0]^=1;const badFile=path.join(out,'wrong-valid-ROM.rom');fs.writeFileSync(badFile,bad);controls.push(rejectReading('same-size-wrong-ROM',()=>checkFile(badFile,{bytes:input.rom.length,sha256:bind.native['tecos.rom']})));controls.push(rejectReading('wrong-valid-LDIR-terminal-cost',()=>validateTiming(readings.map(x=>({...x,expected:x.name.startsWith('LDIR')?x.expected+5:x.expected})))));
  const latch=m.sysCtrl;const saved=m.expand.map(b=>b[0x3f00]);m.expand[0][0x3f00]=0x12;m.expand[1][0x3f00]=0x34;m.cpu.hardware.ioWrite(0xff,latch|4);requireReading(m.read(0xbf00)===0x34,'physical EXPAND1 mapping mismatch');m.cpu.hardware.ioWrite(0xff,latch&~4);requireReading(m.read(0xbf00)===0x12,'physical EXPAND0 mapping mismatch');m.cpu.hardware.ioWrite(0xff,latch);m.expand.forEach((b,i)=>b[0x3f00]=saved[i]);requireReading(m.sysCtrl===latch,'latch not restored');
  const classifier=makeClassifier(input.rows);const at=(file,line)=>Number(Object.entries(input.rows).find(([,r])=>r.file===file&&r.line===line)?.[0]);
  requireReading(classifier(at('sd.asm',66),[{caller:{file:'sd.asm',line:465}}])==='read-token-wait','SPIR token attribution wrong');
  requireReading(classifier(at('sd.asm',66),[{caller:{file:'sd.asm',line:762}}])==='write-response-wait','SPIR response attribution wrong');
  requireReading(classifier(at('sd.asm',66),[{caller:{file:'sd.asm',line:789}}])==='write-busy-wait','SPIR busy attribution wrong');
  requireReading(classifier(at('sd.asm',66),[{caller:{file:'sd.asm',line:490}}])==='other-sd','CRC charged as wait');
  controls.push(rejectReading('SPIR-false-wait-control',()=>requireReading(classifier(at('sd.asm',66),[{caller:{file:'sd.asm',line:490}}])==='read-token-wait','intended false attribution rejected')));
  // Actual ROM mechanism: clear tags through CDROP, then fill29/30/31 blocks.
  const capacity=[];
  for(const n of [29,30,31]){for(let a=0;a<30;a++)rpc(m,'CDROP',{a});const obs=new Observer(m,input.rows,{mode:'detailed'});
    for(let i=0;i<n;i++){const lba=2048+i;for(let j=0;j<4;j++)m.write(m.sym('SDLBA')+j,(lba>>>8*j)&255);const r=rpc(m,'CLOOK');requireReading(!r.z,'fresh block incorrectly hit');const take=rpc(m,'CTAKE');requireReading(take.z,'line allocation failed');requireReading(rpc(m,'CFILL',{a:take.a}).z,'fill failed');}
    requireReading(rpc(m,'CLOOK').z,'known repeated block did not hit');const s=obs.snapshot();obs.detach();validateHit(s,n);capacity.push({n,reading:s});requireReading(s.completeWorkingSet===n&&s.capacityClass===(n<30?'below':n===30?'at':'above'),'capacity trace mismatch');
  }
  controls.push(rejectReading('always-miss-hit-counter',()=>validateHit({...capacity[0].reading,counts:{...capacity[0].reading.counts,'cache.hit':0,'cache.miss':30}},29)));
  controls.push(rejectReading('capacity-off-by-one',()=>requireReading(capacity[2].reading.completeWorkingSet===30,'31 must not be30')));
  // Routine-attempt versus command refusal and successful firmware return.
  const obs=new Observer(m,input.rows,{mode:'detailed'});
  for(let j=0;j<4;j++)m.write(m.sym('SDLBA')+j,255);
  m.write(m.sym('SDBYTE'),1);const refusal=rpc(m,'SDREAD',{hl:0x2000});requireReading(!refusal.z,'SDSC range refusal missing');
  const refused=obs.snapshot();requireReading(refused.counts['SDREAD.attempt']===1&&!(refused.counts['cmd17.issued']??0),'refusal counted as physical read');
  controls.push(rejectReading('attempt-renamed-completion',()=>requireReading(refused.counts['SDREAD.attempt']===(refused.counts['SDREAD.completed']??0),'attempt is not completion')));
  // A legal read and unchanged write prove distinct model supply, payload and firmware completion surfaces.
  m.write(m.sym('SDBYTE'),0);for(let j=0;j<4;j++)m.write(m.sym('SDLBA')+j,(2048>>>8*j)&255);
  requireReading(rpc(m,'SDREAD',{hl:0x2000}).z,'legal firmware read failed');
  requireReading(rpc(m,'SDWRITE',{hl:0x2000}).z,'legal firmware write failed');
  const legal=obs.snapshot();obs.detach();validateTotals(legal);
  requireReading(legal.counts['model.read.supplied']===1&&legal.counts['read.payload.sampled-bits']===4096&&legal.counts['SDREAD.completed']===1,'read protocol counters disagree');
  requireReading(legal.counts['model.write.committed']===1&&legal.counts['write.payload.accepted-bytes']===512&&legal.counts['SDWRITE.completed']===1,'write protocol counters disagree');
  // A real model commit followed by rejected response must not become firmware completion.
  const originalCommit=m.sd.commitWrite;m.sd.commitWrite=function(){originalCommit.call(this);this.pendingResponse=[0x0b,0xff];};
  const commitFaultObserver=new Observer(m,input.rows,{mode:'detailed'});const priorCard=sha(m.sdImage);m.write(0x2000,m.read(0x2000)^1);
  const commitFault=rpc(m,'SDWRITE',{hl:0x2000});const committedFailure=commitFaultObserver.snapshot();commitFaultObserver.detach();m.sd.commitWrite=originalCommit;
  requireReading(!commitFault.z&&committedFailure.counts['model.write.committed']===1&&!committedFailure.counts['SDWRITE.completed']&&sha(m.sdImage)!==priorCard,'commit-then-error distinction failed');
  controls.push(rejectReading('model-commit-renamed-firmware-success',()=>requireReading(committedFailure.counts['model.write.committed']===(committedFailure.counts['SDWRITE.completed']??0),'model commit is not firmware success')));
  const probes=[];
  const probe=(kind,delay=0)=>{const p=machine(rt,input,fixture(rt,cell));boot(p);for(let j=0;j<4;j++)p.write(p.sym('SDLBA')+j,(2048>>>8*j)&255);
    const handle=p.sd.handleCommand;p.sd.handleCommand=function(c){handle.call(this,c);if(c.cmd===17&&kind==='read-delay')this.pendingResponse.splice(1,0,...Array(delay).fill(255));};
    const commit=p.sd.commitWrite;p.sd.commitWrite=function(){commit.call(this);if(kind==='busy-delay')this.pendingResponse=[5,...Array(delay).fill(0),255];if(kind==='busy-nonff')this.pendingResponse=[5,1];};
    const o=new Observer(p,input.rows,{mode:'detailed'});const r=rpc(p,kind.startsWith('read')?'SDREAD':'SDWRITE',{hl:0x2000});const reading=o.snapshot();o.detach();requireReading(r.z,'legal protocol contrast failed');return {kind,reading};};
  const readBase=probe('read-base'),readDelay=probe('read-delay',3),writeBase=probe('write-base'),writeDelay=probe('busy-delay',3),writeNonff=probe('busy-nonff');
  requireReading(readDelay.reading.buckets['read-token-wait']>readBase.reading.buckets['read-token-wait']&&readDelay.reading.buckets['payload-shift']===readBase.reading.buckets['payload-shift'],'token-delay sensitivity failed');
  requireReading(writeDelay.reading.buckets['write-busy-wait']>writeBase.reading.buckets['write-busy-wait']&&writeDelay.reading.buckets['payload-shift']===writeBase.reading.buckets['payload-shift'],'busy-delay sensitivity failed');
  probes.push(readBase,readDelay,writeBase,writeDelay,writeNonff);
  controls.push(rejectReading('token-delay-hidden-by-ruler',()=>requireReading(readDelay.reading.buckets['read-token-wait']===readBase.reading.buckets['read-token-wait'],'real wait contrast must be visible')));
  controls.push(rejectReading('double-count-cycle-bucket',()=>validateTotals({...legal,buckets:{...legal.buckets,'other-sd':legal.buckets['other-sd']+1}})));
  controls.push(rejectReading('completion-exceeds-attempt',()=>validateTotals({...legal,counts:{...legal.counts,'SDWRITE.completed':2}})));
  const faulty=machine(rt,input,fixture(rt,cell));boot(faulty);faulty.step=()=>({cycles:0});const broken=new Observer(faulty,input.rows);
  controls.push(rejectReading('unknown-zero-runtime-cycle',()=>faulty.step()));broken.detach();
  const hostFault=new Error('intentional host fault');faulty.step=()=>{throw hostFault;};const hostObserver=new Observer(faulty,input.rows);let propagated=false;
  try{rejectReading('host-must-propagate',()=>faulty.step());}catch(e){if(e!==hostFault)throw e;propagated=true;}hostObserver.detach();requireReading(propagated,'host fault misclassified as semantic rejection');
  const accounts=qualifyAccounts({rt,input,machine,fixture,boot,rpc,pattern,rejectReading});
  controls.push(...accounts.controls);
  const copySource=pattern(128),copyOld=pattern(128,173),copyNeighbor=pattern(128,7);const copyReading={sourceBefore:copySource,destinationBefore:copyOld,destinationAfter:copySource,sourceAfter:copySource,neighborBefore:copyNeighbor,neighborAfter:copyNeighbor};validateCopyResult(copyReading);
  controls.push(rejectReading('COPY-retains-old-destination',()=>validateCopyResult({...copyReading,destinationAfter:copyOld})));
  controls.push(rejectReading('COPY-wrong-payload',()=>validateCopyResult({...copyReading,destinationAfter:pattern(128,99)})));
  controls.push(rejectReading('COPY-equal-preimage-is-vacuous',()=>validateCopyResult({...copyReading,destinationBefore:copySource})));
  save(out,'rulers.json',{readings,controls,capacity,refused,legal,committedFailure,probes,accounts,hostFaultPropagated:propagated,status:'RULERS_PASSED_RUNTIME_ONLY'});
  return {readings,controls:controls.map(c=>c.name),status:'RULERS_PASSED_RUNTIME_ONLY'};
}
let input;
try{
  input=preflight();const rt=await loadRuntime();const [task,id]=process.argv.slice(2);
  if(task==='rulers')report.result=await rulers(rt,input);
  else if(task==='cell'){
    const matrix=json(path.join(HERE,'matrix.json'));const cell=matrix.cells.find(c=>c.id===id);requireReading(cell,'unknown frozen cell');
    requireReading(process.env.KS51_RULER_RESULT,'accepted exact ruler result required');
    requireReading(process.env.KS51_RULER_SHA256&&sha(fs.readFileSync(process.env.KS51_RULER_RESULT))===process.env.KS51_RULER_SHA256,'reviewed ruler result identity mismatch');const r=json(process.env.KS51_RULER_RESULT);requireReading(r.status==='PASSED'&&r.packetSeal===input.seal&&r.command[0]==='rulers','ruler result not bound to packet');
    const samples=[];for(let i=0;i<5;i++)for(const mode of ['none','aggregate','detailed'])samples.push(await sample(rt,input,cell,mode,i));
    for(let i=0;i<5;i++){const trio=samples.filter(s=>s.id.endsWith('-'+i));for(const s of trio.slice(1)){requireReading(s.cycles===trio[0].cycles,'observer changed Z80 cycles');requireReading(JSON.stringify(s.final)===JSON.stringify(trio[0].final),'observer changed final machine/device/card state');}requireReading(JSON.stringify(trio[1].counts)===JSON.stringify(trio[2].counts),'aggregate/detailed I/O counts differ');}
    const aggregate=samples.filter(s=>s.id.startsWith('aggregate'));requireReading(new Set(aggregate.map(s=>s.cycles)).size===1,'deterministic cycles vary; diagnose before comparison');
    const median=a=>a.toSorted((x,y)=>x-y)[Math.floor(a.length/2)];requireReading(new Set(aggregate.map(s=>JSON.stringify(s.counts))).size===1,'deterministic I/O counts vary');const cycles=median(aggregate.map(s=>s.cycles));
    const hostByMode=Object.fromEntries(['none','aggregate','detailed'].map(mode=>{const a=samples.filter(s=>s.id.startsWith(mode+'-')).map(s=>s.wallMs);const m=median(a);return [mode,{medianMs:m,madMs:median(a.map(x=>Math.abs(x-m)))}];}));report.result={cell,samples,hostByMode,hostOverhead:{aggregateMedianDeltaMs:hostByMode.aggregate.medianMs-hostByMode.none.medianMs,detailedMedianDeltaMs:hostByMode.detailed.medianMs-hostByMode.none.medianMs,scope:'attach+workload+snapshot+detach; excludes result serialization/card persistence; host cost is not guest speed'},cyclesMedian:cycles,cyclesMAD:median(aggregate.map(s=>Math.abs(s.cycles-cycles))),capacityClosed:aggregate.every(s=>s.capacityClass===(cell.size==='small'?'below':'above')),warning:'unclosed traced-capacity cells remain required'};
  }else throw new RulerError('choose rulers or one frozen cell');
  // Recheck all immutable inputs after execution; changed inputs invalidate every reading.
  const after=preflight();requireReading(after.seal===input.seal,'packet identity changed');
  report.status='PASSED';report.packetSeal=input.seal;
}catch(e){report.status='FAILED';report.error={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;}
finally{report.finished=new Date().toISOString();save(out,'status.json',report);}
