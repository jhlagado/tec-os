// Behavioural comparison of two native executables, driven only by keyboard
// input and complete external CVB2 files. No live RAM/RNG state is patched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT,boot,volume} from './lib/fixtures.mjs';
import {buildLauncher,encodeScenario,scalarNames,layout} from '../tools/caverns-scenario.mjs';
const read=p=>readFileSync(ROOT+'/'+p),json=p=>JSON.parse(read(p));
const basic=json('test/caverns-basic.json'),old=json('test/fixtures/caverns-baseline/fixture.json');
const oldLayout=json('test/fixtures/caverns-baseline/loader.json');
const sourceMap=json('programs/caverns/source-map.json'),world=json('programs/caverns/world.json');
const initial=world.objects.map(o=>o.initial);
const vars={'A%':1,'H%':11,'D%':128,'W%':0,'G%':0,'T%':0,'E%':0,'J%':0,'C0%':1,'F%':0,'U%':0,'R0%':0,'K0%':0};
const scenario=(v={},objects=initial,rng='12345678')=>({format:'caverns-basic-scenario-2',gameSha256:basic.comSha256,variables:{...vars,...v},objects:[...objects],rng});
const objects=(change={})=>initial.map((v,i)=>change[i+1]??v);
const keyWord=(m,p)=>m.read(p)|m.read(p+1)<<8;
const scalar=(m,f,n)=>keyWord(m,f.symbols[f.stateSymbols?.[n]??n].address)<<16>>16;
function state(m,f,l){
 const p=keyWord(m,f.symbols[f.stateSymbols?.['P%()']??'P%()'].address)+6;
 return {objects:Array.from({length:24},(_,i)=>keyWord(m,p+i*2)<<16>>16),variables:Object.fromEntries(scalarNames.map(n=>[n,scalar(m,f,n)])),rng:Buffer.from(Array.from({length:4},(_,i)=>m.read(l.rng+i))).reverse().toString('hex')};
}
function keys(m,s){const mark=m.output.length;m.enqueueInput(s+'\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&((m.waitingForInput()&&m.text().endsWith('? '))||m.ready());},500_000_000,s);return m.text(mark);}
const normal=s=>s.replace(/\r\n/g,'\n').replace(/(ERROR IN|BREAK IN) \d+/g,'$1 <line>');
function encodeOld(s){const b=Buffer.from(encodeScenario(s));Buffer.from(old.comSha256,'hex').copy(b,8,0,8);b.writeUInt16LE(0,6);let sum=0;for(let i=0;i<128;i++)if(i!==6&&i!==7)sum+=b[i];b.writeUInt16LE(sum,6);return b;}
let launcher;
async function pair(s){
 launcher??=await buildLauncher();const l=layout(),machines=[];
 for(const baseline of [true,false]){
  const image=new Uint8Array(read('dist/starter.img')),a=volume(image,'A');
  a.write('CAVLOAD.COM',read(baseline?'test/fixtures/caverns-baseline/CAVLOAD.COM':'build/caverns/CAVLOAD.COM'));
  a.write('TEST.CAV',baseline?encodeOld(s):encodeScenario(s));
  const m=boot(image,{tms:true,matrix:true,width:80});const out=keys(m,'cavload test');machines.push({m,f:baseline?old:basic,l:baseline?oldLayout:l,out});
 }
 assert.equal(normal(machines[1].out),normal(machines[0].out),'initial description');
 assert.deepEqual(state(machines[1].m,basic,l),state(machines[0].m,old,oldLayout),'initial complete state');
 return machines;
}
const report=[];
const saveReport=()=>{mkdirSync(ROOT+'/build/caverns/rewrite',{recursive:true});writeFileSync(ROOT+'/build/caverns/rewrite/differential-progress.json',JSON.stringify({cases:report.length,commands:report.reduce((n,r)=>n+r.events.length,0),report},null,2)+'\n');};
async function compare(name,s,commands,{quest=false}={}){
 const [a,b]=await pair(s),events=[];
 function step(command){
  const x=keys(a.m,command),y=keys(b.m,command);
  assert.equal(normal(y),normal(x),`${name}: output for ${command}`);
  const before=state(a.m,a.f,a.l),after=state(b.m,b.f,b.l);assert.deepEqual(after,before,`${name}: state after ${command}`);
  events.push({command,room:after.variables['A%'],turns:after.variables['U%'],fatigue:after.variables['F%'],rng:after.rng,output:y});return y;
 }
 let ended=false;
 for(let i=0;i<commands.length;i++){
  const command=commands[i];let out;
  if(quest&&command==='attack creature with sword'){
   const here=scalar(a.m,a.f,'A%'),st=state(a.m,a.f,a.l),enemy=st.objects.slice(0,6).findIndex(v=>v===here);
   assert.ok(enemy>=0,'quest fight has a present creature');
   for(let tries=0;state(a.m,a.f,a.l).objects[enemy]===here&&tries<25;tries++){
    out=step(command);if(/Another adventure/.test(out))break;
   }
  }else out=step(command);
  if(/Another adventure/.test(out)&&!['y','Y'].includes(commands[i+1])){ended=true;break;}
 }
 assert.deepEqual(a.m.violations,[]);assert.deepEqual(b.m.violations,[]);
 const final=state(b.m,b.f,b.l);report.push({name,initial:s,ended,events,final});saveReport();
 return final;
}
test('rewritten listing uses ten-step numbering, lowercase variables, uppercase keywords and reproducible world data',()=>{
 execFileSync(process.execPath,['tools/caverns-source.mjs','--check'],{cwd:ROOT});
 const lines=read('programs/CAVBASIC.BAS').toString().trimEnd().split('\n');
 for(let i=0;i<lines.length;i++){
  assert.equal(Number(lines[i].split(' ')[0]),(i+1)*10);
  const body=lines[i].replace(/^\d+ /,'');if(body.startsWith('REM '))continue;
  const code=body.replace(/"[^"]*"/g,'');for(const [name]of code.matchAll(/\b[A-Za-z][A-Za-z0-9]*[%$]/g))if(!['MID$','LEFT$','RIGHT$','CHR$','STR$'].includes(name))assert.equal(name,name.toLowerCase());
  const keywords=['IF','THEN','ELSE','FOR','TO','NEXT','GOTO','GOSUB','RETURN','PRINT','INPUT','DIM','DATA','READ','RESTORE','RANDOMIZE','END','CLS','ON','OR','AND','LEN','ASC','MID','LEFT','CHR','INT','RND'];
  for(const token of code.matchAll(/\b[A-Za-z]+\b/g))if(keywords.includes(token[0].toUpperCase()))assert.equal(token[0],token[0].toUpperCase());
 }
 assert.equal(world.rooms.length,54);assert.deepEqual(world.rooms.flatMap(r=>['north','south','west','east'].map(d=>r.exits[d])),json('test/caverns-refined-map.json').exits);
 assert.equal(sourceMap.lineStep,10);
 for(const [file,hash]of [['CAVBASIC.COM',old.comSha256],['CAVBASIC.BAS',old.sourceSha256],['CAVLOAD.COM',oldLayout.launcherSha256]])assert.equal(createHash('sha256').update(read('test/fixtures/caverns-baseline/'+file)).digest('hex'),hash);
});
test('rewrite matches baseline output, complete state and RNG across checkpoints and boundary cases',{timeout:600000},async()=>{
 for(const name of ['troll','south','rope','cave','candle','check2','check3','check4','check5','check6','check7','check8','hut']){
  const s=json('test/caverns-scenarios/'+name+'.json');await compare(name,s,['look','list','inventory','invent','i','score','quit','y','look']);
 }
 await compare('uppercase and invalid objects',scenario(),['LOOK','LIST','take sword','take','put','using rope','with key','TAKE COMPASS','DROP COMPASS','GET COMPASS','north','south','vard','galar']);
 await compare('unarmed clarification then retaliation',scenario({'A%':10},objects({8:-1,20:-1})),['attack troll','kill troll','look','take pearl']);
 for(const [i,seed]of ['00000001','12345678','4002a021','541b7cad'].entries()){
  await compare('combat '+i,scenario({'A%':19,'F%':8},objects({8:-1,20:-1,21:-1}),seed),Array(25).fill('attack demon sword'));
 }
 await compare('rope lifecycle',scenario({'A%':28},objects({8:-1,19:-1,20:-1,21:-1,22:-1})),['use rope','down','tie rope','tie rope to rail','down','up','take rope','down','tie rope to rail','untie rope','tie stone','look']);
 await compare('grille and crypt',scenario({'A%':38,'E%':38,'K0%':1},objects({8:-1,19:-1,20:-1,21:-1})),['take grill','east','inventory','drop grille','east','west','west','vard','south','north']);
 await compare('wrong-place bomb',scenario({'A%':51},objects({8:-1,9:-1,20:-1,21:-1})),['use candle','light bomb with candle','drop bomb','use candle','take bomb','galar']);
 await compare('blast door',scenario({'A%':20},objects({8:-1,9:-1,20:-1,21:-1})),['light bomb with candle','light bomb with candle','east','score','attack demon with sword']);
 for(const turns of [200,229,230,32767])await compare('candle '+turns,scenario({'A%':18,'U%':turns},objects({8:-1,21:-1})),['look','dance','look','score','north','south']);
 await compare('darkness and recovery',scenario({'A%':35,'C0%':0,'R0%':1},objects({8:-1,21:16,22:28})),['look','inventory','up','down','north','use key']);
 await compare('compass loss',scenario({'A%':3},objects({8:1})),Array.from({length:15},(_,i)=>i%2?'north':'east'));
 await compare('hatch persistence',scenario({'A%':43,'E%':38,'K0%':1,'G%':39},objects({8:-1,21:-1})),['south','open hatch','south','west','south','north','east','north','look']);
 for(const amount of [0,1,3,6,10]){
  const ob=objects({8:-1,19:-1,20:-1,21:-1,9:0});for(const id of [7,10,11,12,13,14,15,16,17].slice(0,amount))ob[id-1]=-1;
  await compare('homecoming '+amount,scenario({'A%':2},ob),['use key','score','inventory','north','south','open door with key']);
 }
 // A full command witness is replayed with adaptive sword repetitions, never
 // editing either machine's live state. Both engines must make the same draws.
 const recorded=json('docs/evidence/caverns-wording-pass/quest.json').events.map(e=>e.cmd);
 const commands=recorded.filter((c,i)=>c!=='attack creature with sword'||recorded[i-1]!==c);
 let winning=false;
 for(const seed of ['5a4a1234','12345678','4002a021']){
  const final=await compare('full quest '+seed,scenario({},initial,seed),commands,{quest:true});
  if(final.variables['A%']===1&&[7,10,11,12,13,14,15,16,17].every(i=>final.objects[i-1]===1)){winning=true;break;}
 }
 assert.ok(winning,'at least one complete identical full-score quest');
 mkdirSync(ROOT+'/build/caverns/rewrite',{recursive:true});writeFileSync(ROOT+'/build/caverns/rewrite/differential.json',JSON.stringify({baselineSha256:old.comSha256,rewrittenSha256:basic.comSha256,cases:report.length,commands:report.reduce((n,r)=>n+r.events.length,0),report},null,2)+'\n');
});

test('long-input resource behaviour is recorded separately from gameplay equivalence',{timeout:120000},async()=>{
 const [a,b]=await pair(scenario());const input='x'.repeat(254);
 const before=keys(a.m,input),after=keys(b.m,input);
 assert.match(before,/OUT OF MEMORY/);
 if(/OUT OF MEMORY/.test(after))assert.ok(b.m.ready(),'resource failure exits cleanly');
 else{assert.doesNotMatch(after,/ERROR IN/);assert.equal(scalar(b.m,b.f,'A%'),1);assert.ok(b.m.waitingForInput());}
 mkdirSync(ROOT+'/build/caverns/rewrite',{recursive:true});
 writeFileSync(ROOT+'/build/caverns/rewrite/input-headroom.json',JSON.stringify({inputBytes:254,baselineOutput:before,rewrittenOutput:after,note:'Resource boundary, excluded from gameplay-equivalence claims; the console may split an overlong input.'},null,2)+'\n');
});

test('a reader can insert a BASIC line in the ten-step gap and compile without renumbering',{timeout:120000},()=>{
 const image=new Uint8Array(read('dist/starter.img')),a=volume(image,'A');
 const source=read('programs/CAVBASIC.BAS').toString(),number=sourceMap.banner;
 const banner=source.split('\n').find(l=>l.startsWith(number+' '));
 const experiment=source.replace(banner,banner+'\n'+(number+1)+' PRINT "An inserted experiment works."');
 const original=a.read('CAVBASIC.BAS');a.write('CAVTRY.BAS',Buffer.from(experiment),{text:true});
 const m=boot(image,{tms:true,matrix:true,width:80});assert.match(keys(m,'baza cavtry'),/COM written/);
 assert.ok(a.read('CAVTRY.COM').length<40000);
 const out=keys(m,'cavtry');assert.match(out,/An inserted experiment works/);assert.match(out,/bark hut/);
 keys(m,'quit');keys(m,'n');assert.ok(m.ready());assert.deepEqual(a.read('CAVBASIC.BAS'),original);
 assert.deepEqual(m.violations,[]);
});
