// Actual TEC-OS ROM, starter card and matrix input; no state shortcuts in
// either completion route. The BASIC symbol fixture comes from native BAZA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,boot,volume} from './lib/fixtures.mjs';
const read=p=>readFileSync(resolve(ROOT,p));
const json=p=>JSON.parse(read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const card=()=>new Uint8Array(read('dist/starter.img'));
const reference=json('test/caverns-route.json');
const map=json('test/caverns-map.json');
const basic=json('test/caverns-basic.json');
const treasures=[7,8,10,11,12,13,14,15,16,17];
function keys(m,text,done=()=>m.ready()){
 const mark=m.output.length;m.enqueueInput(text+'\r','matrix');let seen=-1,paged=false;
 try{m.runUntilChecked(()=>{
  m.pumpInput();if(m.output.length!==seen){seen=m.output.length;paged=m.text(mark).endsWith('[Space/Enter: more, Q: skip] ');}
  if(!m.pending?.length&&paged){m.enqueueInput('q','matrix');paged=false;}
  return !m.pending?.length&&done();
 },500_000_000,text);}catch(e){throw Error(text+': '+m.text(mark).slice(-1000),{cause:e});}
 return m.text(mark);
}
const question=m=>()=>m.waitingForInput()&&m.text().endsWith('? ');
const word=(m,p)=>m.read(p)|m.read(p+1)<<8;
const integer=(m,n)=>word(m,basic.symbols[n].address)<<16>>16;
const element=(m,n,i)=>{const b=word(m,basic.symbols[n+'()'].address);assert.equal(m.read(b),1);return word(m,b+4+2*i)<<16>>16;};
let compiled;
function compileBasic(){
 if(!compiled){
  assert.equal(sha(read('programs/CAVBASIC.BAS')),basic.sourceSha256,'regenerate BASIC debug fixture after source edits');
  assert.equal(sha(read('.inputs/BAZA.COM')),basic.compilerSha256);
  const image=card(),m=boot(image,{tms:true,matrix:true,width:80});
  assert.match(keys(m,'baza cavbasic'),/COM written/,'compiles with the shell resident');
  compiled=volume(image,'A').read('CAVBASIC.COM');
  assert.equal(sha(compiled),basic.comSha256);assert.ok(compiled.length<40000);
  assert.deepEqual(m.violations,[]);
 }
 return compiled;
}
function basicGame(){const image=card();volume(image,'A').write('CAVBASIC.COM',compileBasic());const m=boot(image,{tms:true,matrix:true,width:80});keys(m,'con pico 80');assert.equal(m.read(m.sym('VWID')),80);keys(m,'cavbasic',question(m));return m;}
function noDeath(out){assert.doesNotMatch(out,/Another adventure|ERROR IN|killed|smashes your skull/i);}
const tour=[['galar',16],['east',17],['look',17],['west',33],['north',29],['east',26],['east',25],['west',26],['south',27],['east',28],['get rope',28],['down with rope',35],['east',36],['north',39],['west',38],['north',43],['east',44]];

test('BASIC preserves all 216 original exits and starting object locations',()=>{
 const source=read('programs/CAVBASIC.BAS').toString();
 const original=json('test/caverns-original.json');
 const exits=source.split('\n').filter(l=>/^17[4-9]0 DATA |^18[01]0 DATA /.test(l)).flatMap(l=>l.split('DATA ')[1].split(',').map(Number));
 const names={'-1':'H','-2':'T','-3':'E','-4':'W','-5':'G','-6':'D'};
 assert.deepEqual(exits.map(x=>x<0?names[x]:String(x)),original.originalExits);
 const ip=source.match(/^1880 DATA (.*)$/m)[1].split(',').map(Number);
 assert.deepEqual(ip,[36,19,10,14,17,47,8,1,51,45,22,46,54,19,19,19,19,0,34,7,18,15,24,38]);
 const files=volume(card(),'A').list().map(x=>x.name);
 assert.ok(!files.includes('CAVERNS.COM'),'assembly comparison is not released on the starter disk');
 assert.ok(files.includes('CAVBASIC.COM'));
 assert.equal(sha(volume(card(),'A').read('CAVBASIC.COM')),basic.comSha256);
});

test('Caverns80 completes for 126 points, tours all 54 rooms and persists the winning save across reboot',{timeout:300_000},()=>{
 const image=card();volume(image,'A').write('CAVERNS.COM',read('programs/CAVERNS.COM'));
 const m=boot(image,{tms:true,matrix:true,width:80});
 keys(m,'con pico 80');assert.match(keys(m,'caverns',question(m)),/darkened room/);
 // Addresses refer to the hash-checked 0.1.1 artifact, exported with its route.
 const s=reference.symbols,visited=new Set([1]);
 for(const point of reference.checkpoints){const out=keys(m,point.command,question(m));noDeath(out);assert.equal(m.read(s.playerLocation),point.room,point.command);assert.deepEqual(Array.from({length:24},(_,i)=>m.read(s.objectLocation+i)),point.objects,point.command);visited.add(point.room);}
 assert.equal(m.read(s.score),126);
 for(const [cmd,room]of tour){const out=keys(m,cmd,question(m));noDeath(out);assert.equal(m.read(s.playerLocation),room,cmd);visited.add(room);}
 assert.equal(visited.size,54);assert.equal(m.read(s.candleIsLitFlag),1);
 for(const id of treasures)assert.equal(m.read(s.objectLocation+id-1),1);
 assert.match(keys(m,'score',question(m)),/126/);
 assert.match(keys(m,'save',question(m)),/Game saved to disk/);
 keys(m,'quit',question(m));keys(m,'n');
 const rebooted=boot(image,{tms:true,matrix:true,width:80});keys(rebooted,'caverns',question(rebooted));
 assert.match(keys(rebooted,'load',question(rebooted)),/Game loaded\./);
 assert.match(keys(rebooted,'score',question(rebooted)),/126/);
 for(const id of treasures)assert.equal(rebooted.read(s.objectLocation+id-1),1);
 assert.deepEqual(m.violations,[]);assert.deepEqual(rebooted.violations,[]);
});

test('original-based BASIC completes a first-discovery quest for 126 with the refined bridge and bomb',{timeout:300_000},()=>{
 const m=basicGame(),route=json('test/caverns-refined-route.json'),visited=new Set([1]);
 let completed=false,attempts=0;
 for(;attempts<8&&!completed;attempts++){
  let learned=false,firstSpell=false,died=false;
  for(const point of route.trace){
   if(point.command==='galar'&&!firstSpell){assert.ok(learned,'clue visited before first spell');firstSpell=true;}
   let out;
   if(point.before===21&&point.after===20&&integer(m,'T%')===0){
    const objects=Array.from({length:24},(_,i)=>element(m,'P%',i+1));
    assert.match(keys(m,'use candle',question(m)).replace(/\r?\n/g,''),/nothing around you has changed/);
    assert.equal(integer(m,'A%'),21);assert.equal(integer(m,'T%'),0);
    assert.deepEqual(Array.from({length:24},(_,i)=>element(m,'P%',i+1)),objects);
   }
   if(point.command==='use sword'){
    const id=Array.from({length:6},(_,i)=>i+1).find(i=>element(m,'P%',i)===integer(m,'A%'));
    assert.ok(id);
    for(let tries=0;element(m,'P%',id)!==point.objects[id-1]&&tries<22;tries++){
     out=keys(m,point.command,question(m));
     if(/smashes your skull/.test(out)){died=true;break;}
     noDeath(out);
    }
   }else{
    let cmd=point.command;
    if(cmd==='use rope')cmd='down with rope';
    if(cmd==='use key')cmd=point.before===2?'open door with key':'open gate with key';
    if(cmd==='use candle')cmd='light bomb with candle';
    out=keys(m,cmd,question(m));
   }
   if(died)break;
   noDeath(out);assert.equal(integer(m,'A%'),point.after,point.command);
   assert.deepEqual(Array.from({length:24},(_,i)=>element(m,'P%',i+1)),point.objects,point.command);
   visited.add(point.after);if(point.after===50)learned=true;
   if(point.command==='use rope'){
    assert.match(keys(m,'north',question(m)),/can't go that way/);
    assert.equal(integer(m,'A%'),35,'rope descent has no upward exit');
   }
   if(point.command==='get grill'){
    assert.match(keys(m,'west',question(m)),/can't go that way/);
    assert.equal(integer(m,'A%'),38,'cell wall closes behind the player');
   }
   if(point.command==='get bomb'){
    const objects=Array.from({length:24},(_,i)=>element(m,'P%',i+1));
    assert.match(keys(m,'use candle',question(m)).replace(/\r?\n/g,''),/nothing around you has changed/);
    assert.equal(integer(m,'A%'),51);assert.equal(integer(m,'T%'),0);
    assert.deepEqual(Array.from({length:24},(_,i)=>element(m,'P%',i+1)),objects);
   }
   if(point.command==='get key'&&point.after===35){
    assert.equal(Array.from({length:18},(_,i)=>element(m,'P%',i+7)).filter(x=>x===-1).length,11);
    assert.match(keys(m,'take brick',question(m)),/too many objects/);
    assert.equal(element(m,'P%',23),35);
   }
  }
  if(died){assert.match(keys(m,'y',question(m)),/darkened room/);continue;}
  completed=true;
 }
 assert.ok(completed,'possible winning combat outcomes must yield a complete quest');
 assert.equal(integer(m,'T%'),19);assert.equal(integer(m,'H%'),11);
 assert.ok(integer(m,'U%')<230,'winning quest fits original candle lifetime');
 assert.equal(element(m,'P%',9),0);for(const id of treasures)assert.equal(element(m,'P%',id),1);
 assert.match(keys(m,'score',question(m)),/126/);
 // Visit the sole remaining room and exercise the original bat relocation.
 for(const cmd of ['get compass','galar','east'])noDeath(keys(m,cmd,question(m)));
 assert.equal(integer(m,'A%'),17);visited.add(17);
 assert.match(keys(m,'west',question(m)),/giant bat picked you up/);
 assert.equal(integer(m,'A%'),33);assert.equal(element(m,'P%',5),24);
 assert.equal(visited.size,54,'every room visited using ordinary commands');
 for(const cmd of ['galar','north','east','north','north','north','west','north','use key','drop compass'])noDeath(keys(m,cmd,question(m)));
 assert.match(keys(m,'quit',question(m)),/Perfectionist and genius/);
 keys(m,'n');assert.ok(m.ready());assert.deepEqual(m.violations,[]);
});

test('BASIC informational commands are free, absent objects stay absent, fatal moves restart cleanly, and exit restores the shell',{timeout:300_000},()=>{
 const m=basicGame();
 for(let i=0;i<40;i++)assert.match(keys(m,'look',question(m)),/darkened room/);
 assert.equal(integer(m,'U%'),0);
 assert.match(keys(m,'i',question(m)),/carrying nothing/);
 assert.match(keys(m,'get sword',question(m)),/Where/);assert.equal(element(m,'P%',20),7);
 assert.match(keys(m,'get compass',question(m)),/darkened room/);
 assert.match(keys(m,'list',question(m)),/compass/);
 for(const cmd of ['n','w','s','s','w'])noDeath(keys(m,cmd,question(m)));
 assert.equal(integer(m,'A%'),7);
 assert.match(keys(m,'w',question(m)),/chasm/);
 assert.match(keys(m,'y',question(m)),/darkened room/);assert.equal(integer(m,'U%'),0);
 assert.match(keys(m,'list',question(m)),/carrying nothing/);
 keys(m,'quit',question(m));keys(m,'n');assert.ok(m.ready());assert.deepEqual(m.violations,[]);
});

test('BASIC aliases validate presence, missing nouns cannot create objects, and compass loss randomizes directions',{timeout:300_000},()=>{
 const m=basicGame();
 for(const cmd of ['take bomb','put grail','with key','using rope','take','put']){
  const before=Array.from({length:24},(_,i)=>element(m,'P%',i+1));
  const out=keys(m,cmd,question(m));noDeath(out);
  assert.deepEqual(Array.from({length:24},(_,i)=>element(m,'P%',i+1)),before,cmd);
  assert.equal(integer(m,'A%'),1);
 }
 keys(m,'take compass',question(m));assert.equal(element(m,'P%',8),-1);
 for(const cmd of ['north','put compass','west'])noDeath(keys(m,cmd,question(m)));
 assert.equal(integer(m,'A%'),3);assert.equal(element(m,'P%',8),2);
 for(let tries=0;integer(m,'A%')===3&&tries<20;tries++)noDeath(keys(m,'east',question(m)));
 assert.ok([2,5].includes(integer(m,'A%')),'original room 3 east is blocked; compass loss must redirect it');
 assert.deepEqual(m.violations,[]);
});

test('recovered drainage exits reach the hut with an intact bridge, but retain the original return-path gap after collapse',()=>{
 const original=json('test/caverns-original.json');
 function reachable(collapsed){
  const state={H:collapsed?128:11,T:19,E:38,W:43,G:39,D:49};
  const ex=original.originalExits.map(x=>Object.hasOwn(state,x)?state[x]:Number(x));
  const graph=Array.from({length:55},()=>[]);
  for(let r=1;r<=54;r++){graph[r].push(16);for(const d of ex.slice((r-1)*4,r*4))if(d>=1&&d<=54)graph[r].push(d);}
  for(const [a,b]of [[2,1],[35,37],[28,35]])graph[a].push(b);
  const reached=new Set([54]),queue=[54];while(queue.length)for(const d of graph[queue.shift()])if(!reached.has(d)){reached.add(d);queue.push(d);}
  return reached;
 }
 assert.ok(reachable(false).has(1));assert.ok(!reachable(true).has(1));
 for(let room=1;room<=10;room++)assert.ok(!reachable(true).has(room));
 assert.equal(original.hutDoor.outside,2);assert.equal(original.initialKeyRoom,34);
});
