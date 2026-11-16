// Actual TEC-OS ROM, starter card and matrix input; no state shortcuts in
// either completion route. The BASIC symbol fixture comes from native BAZA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
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
const integer=(m,n)=>word(m,basic.symbols[basic.stateSymbols?.[n]??n].address)<<16>>16;
const element=(m,n,i)=>{const b=word(m,basic.symbols[basic.stateSymbols?.[n+'()']??n+'()'].address);assert.equal(m.read(b),1);return word(m,b+4+2*i)<<16>>16;};
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

test('revised map and source-only starter match the author-approved release',()=>{
 const source=read('programs/CAVBASIC.BAS').toString(),revised=json('test/caverns-refined-map.json');
 const labels=json('programs/caverns/source-map.json').labels;
 const exits=source.split('\n').filter(l=>Number(l.split(' ')[0])>=labels.EXIT_DATA&&Number(l.split(' ')[0])<labels.OBJECT_DATA).flatMap(l=>l.split('DATA ')[1].split(',').map(Number));
 assert.deepEqual(exits,revised.exits);assert.equal(exits.length,216);
 const files=volume(card(),'A').list().map(x=>x.name);
 assert.ok(!files.includes('CAVERNS.COM'));assert.ok(!files.includes('CAVBASIC.COM'));
 assert.ok(files.includes('CAVBASIC.BAS'));
 const gates={'-1':11,'-2':19,'-3':38,'-4':43,'-5':39,'-6':49};
 const open=revised.exits.map(d=>gates[d]??d),unpaired=[];
 for(let r=1;r<=54;r++)for(let i=0;i<4;i++){
  const d=open[(r-1)*4+i];if(d>0&&d<55&&open[(d-1)*4+(i^1)]!==r)unpaired.push([r,i,d]);
 }
 assert.deepEqual(unpaired,[[1,0,2]],'only the explicitly self-locking hut door lacks an ordinary reverse exit');

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

test('revised BASIC first-discovery quest banks all treasures, walks back from castle and visits all rooms',{timeout:300000},()=>{
 const m=basicGame(),visited=new Set([1]),events=[];
 const room=()=>integer(m,'A%'),obj=i=>element(m,'P%',i);
 function command(cmd){const before=room(),out=keys(m,cmd,question(m));if(cmd!=='quit')noDeath(out);if(before!==room())assert.ok(out.replace(/\s+/g,'').includes(json('test/caverns-refined-map.json').descriptions[room()].replace(/\s+/g,'')),`room ${room()} description`);visited.add(room());events.push({cmd,before,after:room(),out});return out;}
 function walk(...cmds){for(const c of cmds)command(c);}
 function fight(id){assert.equal(obj(id),room());let won=false;for(let i=0;i<22;i++){command('attack creature with sword');if(obj(id)===0){won=true;break;}}assert.ok(won);assert.equal(integer(m,'F%'),0);}
 walk('take compass','north','west','west','south','west','take sword','east','east','take coin','west','north','east','east','east','east','south');
 assert.equal(room(),10);
 const turns=integer(m,'U%');assert.match(command('attack troll'),/With what/);assert.equal(integer(m,'U%'),turns);
 fight(3);walk('south','east','west');assert.equal(room(),11,'bridge side exits blocked');
 walk('south','east','take rope','west','west','south');fight(4);
 walk('south','take candle','east','west');assert.equal(room(),33,'bat carries player to colony');
 walk('west','take key','west','north','east','east','south','north','east','east','west','south','east');
 assert.equal(room(),28);assert.match(command('down'),/TIE ROPE/);assert.equal(room(),28);
 walk('tie rope to rail','down');assert.equal(room(),35);assert.equal(integer(m,'R0%'),1);
 assert.match(command('north'),/locked/);assert.equal(room(),35);
 walk('up','down','unlock gate with key');assert.equal(room(),37);assert.equal(obj(19),-1);
 walk('vard','east','west','east','take grille');
 assert.match(command('east'),/cannot fit/);assert.equal(room(),38);
 walk('drop grill','east','south');fight(1);assert.equal(obj(20),-1,'wizard does not confiscate sword');
 walk('east','north','take ruby','north');fight(6);
 walk('east','take pearl','south');assert.equal(room(),43);
 assert.match(command('south'),/latched/);walk('open hatch','south','north','east','west','west','west','west','take stone','south','east','north');
 assert.equal(room(),50);assert.match(events.at(-1).out,/hzb tzozi/);
 walk('east','take bomb');const before=Array.from({length:24},(_,i)=>obj(i+1));
 assert.match(command('light bomb with candle'),/nothing has changed/);assert.deepEqual(Array.from({length:24},(_,i)=>obj(i+1)),before);
 // The walking return proves GALAR is a convenience, not the escape requirement.
 walk('west','west','west','north','west','north','west','west','south','up','west','north','north','north');assert.equal(room(),21);
 walk('galar','north','north','east','north','north','north','west','west');assert.equal(room(),2);
 assert.match(command('use key'),/Welcome home/);assert.equal(room(),1);assert.equal(obj(19),-1);
 for(const i of [7,10,12,13])assert.equal(obj(i),1,'treasures bank automatically');
 walk('galar','south','west','north','take diamond','west','north','light bomb with candle');assert.equal(room(),20);assert.equal(obj(9),0);
 walk('east');fight(2);walk('take ring','take pendant','take grail','take shield');
 walk('galar','north','north','east','north','north','north','west','west');
 assert.match(command('use key'),/quest is complete/);assert.equal(room(),1);
 assert.equal(integer(m,'S%'),126);assert.equal(integer(m,'H%'),11);
 for(const id of treasures.filter(i=>i!==8))assert.equal(obj(id),1);
 assert.equal(obj(8),-1,'useful compass remains carried and is valued at home');
 assert.equal(visited.size,54);assert.ok(integer(m,'U%')<230);
 const moves=integer(m,'U%');assert.match(command('score'),/126/);assert.match(command('quit'),/Perfectionist and genius/);
 keys(m,'n');assert.ok(m.ready());assert.deepEqual(m.violations,[]);
 mkdirSync(ROOT+'/build/caverns',{recursive:true});writeFileSync(ROOT+'/build/caverns/refined-quest.json',JSON.stringify({gameSha256:basic.comSha256,score:126,moves,visited:[...visited].sort((a,b)=>a-b),events,violations:m.violations},null,2)+'\n');
});

test('BASIC information, aliases, failed requests, compass warning, fatal restart and exit',{timeout:300000},()=>{
 const m=basicGame();for(let i=0;i<10;i++)assert.match(keys(m,'look',question(m)),/bark hut/);
 assert.equal(integer(m,'U%'),0);
 for(const cmd of ['inventory','invent','list','i'])assert.match(keys(m,cmd,question(m)),/carrying nothing/);
 assert.match(keys(m,'take sword',question(m)),/Not here/);assert.equal(element(m,'P%',20),7);
 assert.match(keys(m,'take compass',question(m)),/Taken/);
 for(const cmd of ['north','west','west','south','west'])noDeath(keys(m,cmd,question(m)));
 assert.equal(integer(m,'A%'),7);assert.match(keys(m,'west',question(m)),/chasm/);
 assert.match(keys(m,'y',question(m)),/bark hut/);assert.equal(integer(m,'U%'),0);
 keys(m,'north',question(m));assert.match(keys(m,'west',question(m)),/lose my bearings/);
 keys(m,'quit',question(m));keys(m,'n');assert.ok(m.ready());assert.deepEqual(m.violations,[]);
});

test('historical recovered drainage exits reach the hut with an intact bridge, but retain the original return-path gap after collapse',()=>{
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
