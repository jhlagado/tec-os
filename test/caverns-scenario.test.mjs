// Actual TEC-OS launch + complete externally generated state, including RNG.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {ROOT,boot,volume} from './lib/fixtures.mjs';
import {buildLauncher,encodeScenario,scalarNames,layout} from '../tools/caverns-scenario.mjs';
const basic=JSON.parse(readFileSync(ROOT+'/test/caverns-basic.json'));
const ip=[36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,18,15,24,38];
const defaults={'A%':1,'H%':11,'D%':128,'W%':0,'G%':0,'T%':0,'E%':0,'J%':0,'C0%':1,'F%':0,'U%':0};
const scenario=(vars={},objects=ip,rng='5a4a1234')=>({format:'caverns-basic-scenario-1',gameSha256:basic.comSha256,objects:[...objects],variables:{...defaults,...vars},rng});
function keys(m,text,done=()=>m.ready()){
 const mark=m.output.length;m.enqueueInput(text+'\r','matrix');
 m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&done();},500_000_000,text);return m.text(mark);
}
const question=m=>()=>m.waitingForInput()&&m.text().endsWith('? ');
const word=(m,p)=>m.read(p)|m.read(p+1)<<8;
const integer=(m,n)=>word(m,basic.symbols[n].address)<<16>>16;
function snapshot(m){
 const p=word(m,basic.symbols['P%()'].address)+6;
 return scenario(Object.fromEntries(scalarNames.map(n=>[n,integer(m,n)])),Array.from({length:24},(_,i)=>word(m,p+i*2)<<16>>16),Buffer.from(Array.from({length:4},(_,i)=>m.read(layout().rng+i))).reverse().toString('hex'));
}
function assertState(m,s){assert.deepEqual(snapshot(m),s);}
const card=()=>new Uint8Array(readFileSync(ROOT+'/dist/starter.img'));
let launcher;
async function imageWith(s,name='TEST'){
 launcher??=await buildLauncher();const image=card(),v=volume(image,'A');
 v.write('CAVLOAD.COM',readFileSync(ROOT+'/build/caverns/CAVLOAD.COM'));
 if(s)v.write(name+'.CAV',encodeScenario(s));return image;
}
test('scenario launcher fits the original COM and restores all monsters, objects, flags, counters and RNG',{timeout:120000},async()=>{
 const objects=[0,29,20,0,24,0,1,-1,-1,-1,1,1,1,1,1,1,1,0,-1,-1,-1,-1,0,39];
 const s=scenario({'A%':50,'D%':49,'W%':43,'G%':39,'T%':19,'E%':38,'J%':1,'C0%':0,'F%':12,'U%':222},objects,'12345678');
 const image=await imageWith(s),m=boot(image,{tms:true,matrix:true,width:80});
 const out=keys(m,'cavload test',question(m));
 assert.match(out,/dark|courtyard/i);assertState(m,s);
 assert.equal(launcher.launcherBytes,basic.comBytes,'no added game image or TPA bytes');
 assert.deepEqual(m.violations,[]);
});
test('real picked-up objects and encounter state survive exported file and fresh boot; RNG continuation matches',{timeout:120000},async()=>{
 const image=await imageWith(null),v=volume(image,'A');v.write('CAVBASIC.COM',readFileSync(ROOT+'/programs/CAVBASIC.COM'));
 const m=boot(image,{tms:true,matrix:true,width:80});keys(m,'cavbasic',question(m));
 for(const command of ['take compass','north','west','west','south','west','take sword','east','north','west','north','east','east','south'])keys(m,command,question(m));
 const s=snapshot(m);assert.equal(s.variables['A%'],10);assert.equal(s.objects[7],-1);assert.equal(s.objects[19],-1);
 const file=encodeScenario(s);writeFileSync(ROOT+'/build/caverns/scenarios/TROLL.CAV',file);
 writeFileSync(ROOT+'/build/caverns/scenarios/troll.json',JSON.stringify(s,null,2)+'\n');
 // This new card is constructed independently: only exported scenario bytes
 // and launcher bytes are carried across, no CPU/RAM state or old disk object.
 const fresh=await imageWith(null);volume(fresh,'A').write('TROLL.CAV',new Uint8Array(readFileSync(ROOT+'/build/caverns/scenarios/TROLL.CAV')));
 const n=boot(fresh,{tms:true,matrix:true,width:80});keys(n,'cavload troll',question(n));assertState(n,s);
 const a=keys(m,'attack troll with sword',question(m));const b=keys(n,'attack troll with sword',question(n));
 assert.equal(b,a,'same next combat result and text after restoring RNG');assert.deepEqual(snapshot(n),snapshot(m));
 // Replay after death/QUIT uses the normal restart path and reloads the slot.
 keys(n,'quit',question(n));keys(n,'y',question(n));assertState(n,s);
 const capture=name=>{const state=snapshot(n);writeFileSync(ROOT+'/build/caverns/scenarios/'+name.toLowerCase()+'.json',JSON.stringify(state,null,2)+'\n');writeFileSync(ROOT+'/build/caverns/scenarios/'+name+'.CAV',encodeScenario(state));return state;};
 const fight=(id)=>{for(let tries=0;snapshot(n).objects[id-1]===integer(n,'A%')&&tries<14;tries++)assert.doesNotMatch(keys(n,'use sword',question(n)),/Another adventure|skull/);assert.notEqual(snapshot(n).objects[id-1],integer(n,'A%'));};
 fight(3);keys(n,'south',question(n));keys(n,'south',question(n));capture('SOUTH');
 keys(n,'west',question(n));keys(n,'west',question(n));fight(4);
 keys(n,'north',question(n));keys(n,'take rope',question(n));capture('ROPE');
 keys(n,'south',question(n));keys(n,'south',question(n));capture('CAVE');
 keys(n,'south',question(n));keys(n,'take candle',question(n));keys(n,'north',question(n));capture('CANDLE');
 assert.deepEqual(m.violations,[]);assert.deepEqual(n.violations,[]);
});
test('missing, wrong-game, incompatible, truncated and corrupt scenarios are rejected before mutation',{timeout:120000},async()=>{
 const good=encodeScenario(scenario());
 for(const kind of ['missing','wrong-game','version','truncated','corrupt','extra','room','object']){
  const image=await imageWith(null);
  if(kind!=='missing'){
   let b=Buffer.from(good);
   if(kind==='wrong-game')b[8]^=1;
   if(kind==='version')b[4]=2;
   if(kind==='truncated')b=b.subarray(0,50);
   if(kind==='corrupt')b[44]^=1;
   if(kind==='extra')b=Buffer.concat([b,Buffer.alloc(128)]);
   if(kind==='room'||kind==='object'){
    b.writeUInt16LE(kind==='room'?55:0x7fff,kind==='room'?64:16);
    let sum=0;for(let i=0;i<128;i++)if(i!==6&&i!==7)sum+=b[i];b.writeUInt16LE(sum,6);
   }
   volume(image,'A').write('BAD.CAV',b);
  }
  const m=boot(image,{tms:true,matrix:true,width:80});const out=keys(m,'cavload bad');assert.match(out,/Invalid\/missing scenario/,kind);
  assert.equal(integer(m,'A%'),1,kind);const p=word(m,basic.symbols['P%()'].address)+6;
  assert.deepEqual(Array.from({length:24},(_,i)=>word(m,p+i*2)<<16>>16),ip,kind);assert.deepEqual(m.violations,[]);
 }
});

test('all bundled review checkpoints load exactly in a new machine',{timeout:120000},async()=>{
 for(const name of ['troll','south','rope','cave','candle']){
  const s=JSON.parse(readFileSync(ROOT+'/test/caverns-scenarios/'+name+'.json'));
  const m=boot(await imageWith(s),{tms:true,matrix:true,width:80});
  keys(m,'cavload test',question(m));assertState(m,s);assert.deepEqual(m.violations,[]);
 }
});
test('external scenario writer refuses incomplete or out-of-domain states',()=>{
 const variants=[s=>s.objects.pop(),s=>s.variables['A%']=55,s=>s.variables['C0%']=2,s=>s.variables['F%']=-1,s=>delete s.variables['T%'],s=>s.rng='00000000',s=>s.gameSha256='wrong'];
 for(const change of variants){const s=scenario();change(s);assert.throws(()=>encodeScenario(s));}
});
