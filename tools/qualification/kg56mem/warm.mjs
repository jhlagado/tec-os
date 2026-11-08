// Measure the warm stack prefix.
// matrix.dat defines the 17 outcomes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync,lstatSync,mkdirSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
// The Node executable is a large input.
// Reuse a small buffer for input hashes.
const hashBuffer=Buffer.alloc(65536);
function hashFile(path,limit){
 const fd=openSync(path,'r'),h=createHash('sha256');let bytes=0;
 try{
  for(;;){const n=readSync(fd,hashBuffer,0,hashBuffer.length,null);if(n===0)break;bytes+=n;assert.ok(bytes<=limit,'input grew while hashing');h.update(hashBuffer.subarray(0,n))}
 }finally{closeSync(fd)}
 return {bytes,sha256:h.digest('hex')};
}
const candidate='b597c3bf212a965004b28cb3f8137f400203b8cf';
const romSHA='7f47502910061da185229fa10e697132da650fb52a925c2ee0dfe97be490956b';
const mapSHA='3c164abefad1813c4b87a5c42e357286b83510229781a43cbbff30406e0fe824';
const pins={production:'98cbcfd056b732d4bc410074d0ad2a52842bdb2b911a43cb880b95964870cfe7',model:'1dfcb248de0e7f3881179b904ae7ae1fabb72aa7612e7da4ee7811a674d122d9'};
const compile=(names,body)=>Function(...names,'"use strict";\n'+body);
function extract(source,start,end,label,records){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 if(a<0||source.indexOf(start,a+1)!==-1||b<0||source.indexOf(end,b+1)!==-1)throw Error('nonunique extraction '+label);
 const text=source.slice(a,b);records.push({label,start,end,startOffset:a,endOffset:b,sha256:sha(text)});return text;
}
function verifyRows(rows){
 assert.ok(Array.isArray(rows)&&rows.length>0,'complete reviewed input inventory required');
 const seen=new Set();
 for(const x of rows){
  assert.equal(typeof x.path,'string');assert.equal(realpathSync(x.path),x.realpath);
  assert.ok(!seen.has(x.path),'duplicate input');seen.add(x.path);
  assert.ok(lstatSync(x.path).isFile(),'regular inputs only; dependency links need separate reviewed closure');
  const observed=hashFile(x.path,x.bytes);assert.equal(observed.bytes,x.bytes);assert.equal(observed.sha256,x.sha256);
 }
}
const error=e=>({name:e.name,code:e.code,message:e.message,actual:e.actual,expected:e.expected,operator:e.operator,stack:e.stack});
// Catch only the completed depth check.
function bound(depth,held){assert.ok(depth<=(held?12:4),'KG56 active warm-prefix bound')}
function rejectAddedFrame(measured){
 let caught;
 try{bound(measured.depth,true)}catch(e){caught=e}
 assert.ok(caught&&caught.code==='ERR_ASSERTION'&&caught.actual===false&&caught.expected===true&&caught.message.includes('KG56 active warm-prefix bound'),'added frame was not rejected by the bound');
 return error(caught);
}
// Completed setup history is no longer read.
function retireSetupHistory(m){
 assert.ok(Array.isArray(m.trace)&&Array.isArray(m.vdpPorts));
 m.trace=[];m.vdpPorts=[];
}
async function main(){
 if(process.argv.length!==4)throw Error('usage: warm.mjs bind.dat fresh-output-dir');
 if(!process.env.ORIGO_GUARD)throw Error('one outer guard required');
 const [bindingPath,out]=process.argv.slice(2).map(p=>resolve(p));
 const bindingBytes=readFileSync(bindingPath);
 assert.equal(sha(bindingBytes),process.env.KG56_BINDING_SHA256,'allocation must name exact reviewed binding hash');
 const b=JSON.parse(bindingBytes);
 assert.equal(b.gate,'KG56');assert.equal(b.candidate,candidate);
 for(const key of ['registered','sourceReviewAccepted','commandHostContractAccepted','runtimeInputClosureAccepted','allocationIssued'])assert.equal(b[key],true,key+' must be independently completed');
 assert.equal(realpathSync(process.execPath),b.node.realpath);const executable=hashFile(process.execPath,b.node.bytes);assert.equal(executable.bytes,b.node.bytes);assert.equal(executable.sha256,b.node.sha256);
 assert.equal(sha(readFileSync(fileURLToPath(import.meta.url))),b.workerSha256);
 assert.equal(b.bounds.sampledMB,600);assert.equal(b.bounds.heapMB,450);assert.equal(b.bounds.hardSeconds,120);assert.equal(b.bounds.jobs,1);assert.equal(b.bounds.queueWait,0);
 assert.equal(b.effectiveNodeOldSpaceMiB,64);assert.equal(b.standingNodeHeapMaximumMiB,450);
 assert.deepEqual(process.execArgv,['--max-old-space-size=64']);assert.equal(process.env.NODE_OPTIONS,undefined);
 verifyRows(b.registeredGateFiles);verifyRows(b.runtimeFiles);
 const verifyArtifacts=()=>{
  for(const dir of [join(b.productRoot,'build/tecos'),join(b.modelScratchRoot,'bit/build/tecos')]){
   assert.equal(sha(readFileSync(join(dir,'tecos.rom'))),romSHA);assert.equal(sha(readFileSync(join(dir,'tecos.d8.json'))),mapSHA);
  }
 };
 verifyArtifacts();
 // A fresh directory separates each run.
 mkdirSync(out,{mode:0o700});
 const result={state:'RUNNING',gate:'KG56',candidate,nodePid:process.pid,nodeParent:process.ppid,guard:process.env.ORIGO_GUARD,sourceOnlyAcceptance:false,nativeAcceptance:false,productAcceptance:false,newCoverage:0,nmiSuppressed:true,nmiQualified:false,extractions:[],active:[],deferred:[],addedFrame:[],errors:[]};
 const save=()=>writeFileSync(join(out,'control-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 try{
  const source={};
  for(const [kind,name]of [['production','production-test.mjs'],['model','model-check.mjs']]){
   const bytes=readFileSync(join(b.frozenSourceRoot,name));assert.equal(sha(bytes),pins[kind]);source[kind]=bytes.toString();
  }
  const ex=(kind,start,end,label)=>extract(source[kind],start,end,label,result.extractions);
  const helpers={};for(const kind of ['production','model'])helpers[kind]=ex(kind,'const word=(m,a)=>','const geometry=w=>',kind+' exact helper declarations');
  const extra=ex('production','const fresh=()=>',"\ntest('KS40 common",'production fresh/armed/warm');
  const maps=ex('model','const geometry=w=>','function negative(','model geometry validators');
  const prewarm=ex('model',' const m=make(variant);\n',' // Real warm boot boundary: before any PZINIT sweep, both representations off.','model exact complete prewarm');
  const deferred=ex('model',' const m=make(variant);\n',' // Target hooks do not run real WBOOTR:','model original prewarm and both original warm states');
  const {Machine,symbolsFromD8}=await import(pathToFileURL(join(b.productRoot,'host/machine.mjs')).href);
  const names=['word','setword','make','call','select','init','state','ie','shadow','find','claim','reg'];
  const factory=(kind,suffix)=>compile(['Machine','symbolsFromD8','readFileSync','root','scratch','assert'],helpers[kind]+suffix+'\nreturn {'+names.join(',')+(kind==='production'?',fresh,armed,warm':'')+'};')(Machine,symbolsFromD8,readFileSync,b.productRoot,b.modelScratchRoot,assert);
  const ph=factory('production',extra),mh=factory('model','');
  const prep=compile([...names,'assert','variant'],maps+prewarm+'\nreturn {m,table};');
  const reused=()=>prep(...names.map(n=>mh[n]),assert,'bit');
  const checkpoint=(m,h)=>({piwid:m.read(m.sym('PIWID')),vwid:m.read(m.sym('VWID')),claimed:m.read(m.sym('VCLAIM')),ie:h.ie(m),shadow:h.shadow(m),sp:m.cpu.cpu.sp,pc:m.pc});
  const measure=(m,h,held,width)=>{
   const before=checkpoint(m,h);assert.equal(before.piwid,width);assert.equal(before.vwid,width);assert.equal(before.ie,32);assert.equal(before.shadow,32);assert.equal(!!before.claimed,held);
   const depth=ph.warm(m),after=checkpoint(m,h);
   assert.equal(after.pc,m.sym('PZINIT'));assert.equal(after.ie,0);assert.equal(after.shadow,0);
   return {before,after,depth,window:'After BSTK installation/minsp reset to before PZINIT body',nmiSuppressed:true};
  };
  for(const setup of ['fresh','reused'])for(const width of [32,40,80])for(const held of [false,true]){
   const {m,table}=setup==='fresh'?ph.fresh():reused();const h=setup==='fresh'?ph:mh;
   ph.armed(m,table,width);if(!held)h.claim(m,0);
   retireSetupHistory(m);
   const observed=measure(m,h,held,width);assert.equal(observed.depth,held?12:4,'exact active-console KD250 reference');bound(observed.depth,held);
   result.active.push({setup,width,held,...observed});
  }
  // Retain the deferred 4/10 console path.
  const warm=[];compile([...names,'assert','variant','warmSink'],maps+deferred+'\nwarmSink.push(...warm);')(...names.map(n=>mh[n]),assert,'bit',warm);
  assert.equal(warm.length,2);assert.deepEqual(warm.map(x=>[x.claimed,x.stack]),[[false,4],[true,10]]);result.deferred=warm;
  // Warm boot (WBOOTR) calls through RAM.
  // The trampoline adds a return word.
  for(const width of [32,40,80]){
   let patch;
   const m=ph.make('bit',{mutate:(rom,at)=>{
    const start=at('WBOOTR'),target=at('HWVREL')+0xc000,p=rom.indexOf(Buffer.from([0xcd,target&255,target>>8]),start);
    assert.ok(p>=start&&p<start+64,'unique known prefix CALL required');
    const next=rom.indexOf(Buffer.from([0xcd,target&255,target>>8]),p+1);
    assert.ok(next<0||next>=start+64,'multiple prefix CALLs are not this control');
    patch={offset:p,target,before:Array.from(rom.subarray(p,p+3)),after:[0xcd,0,0x68],trampoline:[0xcd,target&255,target>>8,0xc9]};rom.set(patch.after,p);
   }});
   ph.init(m);const table=ph.find(m,4);ph.armed(m,table,width);
   patch.trampoline.forEach((v,i)=>m.write(0x6800+i,v));
   assert.deepEqual(Array.from({length:4},(_,i)=>m.read(0x6800+i)),patch.trampoline);
   retireSetupHistory(m);
   const observed=measure(m,ph,true,width);
   const normal=result.active.find(x=>x.setup==='fresh'&&x.width===width&&x.held);
   assert.equal(observed.depth,normal.depth+2,'real added CALL must show exactly one extra live return word');
   const rejection=rejectAddedFrame(observed);result.addedFrame.push({width,patch,...observed,rejection,classification:'completed-observation bound rejection'});
  }
  assert.equal(result.active.length,12);assert.equal(result.addedFrame.length,3);
  verifyRows(b.runtimeFiles);verifyRows(b.registeredGateFiles);verifyArtifacts();
  result.state='CONTROL_WORKLOAD_COMPLETED_PENDING_INDEPENDENT_RESULT_AND_RESOURCE_REVIEW';
 }catch(e){result.state='FAILED';result.errors.push(error(e));process.exitCode=1}
 finally{save()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1});
