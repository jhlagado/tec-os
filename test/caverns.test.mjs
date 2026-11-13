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
function basicGame(){const image=card();volume(image,'A').write('CAVBASIC.COM',compileBasic());const m=boot(image,{tms:true,matrix:true,width:80});keys(m,'cavbasic',question(m));return m;}
function noDeath(out){assert.doesNotMatch(out,/Another adventure|ERROR IN|killed|smashes your skull/i);}
const tour=[['galar',16],['east',17],['look',17],['west',33],['north',29],['east',26],['east',25],['west',26],['south',27],['east',28],['get rope',28],['down with rope',35],['east',36],['north',39],['west',38],['north',43],['east',44]];

test('both maps have the same 216 exits, all 54 rooms reachable and only the documented puzzle exceptions',()=>{
 assert.equal(sha(read('programs/CAVERNS.COM')),map.sha256);
 const source=read('programs/CAVBASIC.BAS').toString();
 const exits=source.split('\n').filter(l=>/^17[4-9]0 DATA |^18[01]0 DATA /.test(l)).flatMap(l=>l.split('DATA ')[1].split(',').map(Number));
 const defaults={'-1':11,'-2':0,'-3':0,'-4':0,'-5':0,'-6':128};
 assert.deepEqual(exits.map(x=>x<0?defaults[x]:x),map.exits);
 for(const [index,sentinel]of Object.entries(map.dynamicSentinels))assert.equal(exits[index],sentinel,'dynamic exit '+index);
 const exceptions=new Set(['1,0,2','19,2,20','37,1,35','39,2,38','43,1,38','49,2,48']),seen=new Set(),opposite=[1,0,3,2];
 for(let room=1;room<=54;room++)for(let dir=0;dir<4;dir++){
  const dest=map.exits[(room-1)*4+dir];assert.ok(dest===0||dest===128||dest>=1&&dest<=54);
  if(dest===0||dest===128)continue;const k=[room,dir,dest].join(',');
  if(exceptions.has(k))seen.add(k);else assert.equal(map.exits[(dest-1)*4+opposite[dir]],room,k);
 }
 assert.deepEqual(seen,exceptions);
 const edges=Array.from({length:55},()=>[]);
 for(let room=1;room<=54;room++)for(const d of map.exits.slice((room-1)*4,room*4))if(d>0&&d<=54)edges[room].push(d);
 for(const [a,b]of [[2,1],[20,19],[35,37],[37,38],[38,39],[38,43],[48,49],[28,35]])edges[a].push(b);
 const reached=new Set([1]),queue=[1];while(queue.length)for(const d of edges[queue.shift()])if(!reached.has(d)){reached.add(d);queue.push(d);}
 assert.equal(reached.size,54);
});

test('Caverns80 completes for 126 points, tours all 54 rooms and persists the winning save across reboot',{timeout:300_000},()=>{
 const image=card(),m=boot(image,{tms:true,matrix:true,width:80});
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

test('BASIC completes the same quest, exercises every puzzle and visits all 54 rooms without leaking control frames',{timeout:300_000},()=>{
 const m=basicGame(),visited=new Set([1]);
 for(const point of reference.checkpoints){
  const cmd=point.command;
  if(cmd.startsWith('kill ')){
   const id={troll:3,dragon:4,wizard:1,goblin:6,demon:2}[cmd.split(' ')[1]];
   for(let tries=0;element(m,'P%',id)!==0&&tries<14;tries++)noDeath(keys(m,cmd,question(m)));
   assert.equal(element(m,'P%',id),0,cmd);continue;
  }
  const out=keys(m,cmd,question(m));noDeath(out);assert.equal(integer(m,'A%'),point.room,cmd);visited.add(point.room);
 }
 assert.equal(integer(m,'S%'),126);
 for(const id of treasures)assert.equal(element(m,'P%',id),1);
 assert.equal(element(m,'P%',9),0,'bomb consumed at the oak door');
 for(const [cmd,room]of tour){const out=keys(m,cmd,question(m));noDeath(out);assert.equal(integer(m,'A%'),room,cmd);visited.add(room);}
 assert.equal(visited.size,54);assert.equal(integer(m,'C0%'),1);
 assert.match(keys(m,'score',question(m)),/126/);assert.deepEqual(m.violations,[]);
});

test('BASIC informational commands are free, absent objects stay absent, fatal moves restart cleanly, and exit restores the shell',{timeout:300_000},()=>{
 const m=basicGame();
 for(let i=0;i<40;i++)assert.match(keys(m,'look',question(m)),/darkened room/);
 assert.equal(integer(m,'U%'),0);
 assert.match(keys(m,'i',question(m)),/carrying nothing/);
 assert.match(keys(m,'get sword',question(m)),/Where/);assert.equal(element(m,'P%',20),7);
 assert.match(keys(m,'get compass',question(m)),/darkened room/);
 assert.match(keys(m,'list',question(m)),/compass/);
 for(const cmd of ['n','w','w','s','w'])noDeath(keys(m,cmd,question(m)));
 assert.equal(integer(m,'A%'),7);
 assert.match(keys(m,'w',question(m)),/chasm/);
 assert.match(keys(m,'y',question(m)),/darkened room/);assert.equal(integer(m,'U%'),0);
 assert.match(keys(m,'list',question(m)),/carrying nothing/);
 keys(m,'quit',question(m));keys(m,'n');assert.ok(m.ready());assert.deepEqual(m.violations,[]);
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
