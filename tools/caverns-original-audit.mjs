// Infer the recovered map without executing or rewriting the BASIC program.
// Usage: node tools/caverns-original-audit.mjs ../caverns/src/caverns.basic
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(process.argv[2]),text=bytes.toString('latin1');
const lines=new Map(text.split(/\r?\n/).map(l=>/^(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map(m=>[+m[1],m[2]]));
const exits=Array.from({length:8},(_,i)=>lines.get(174+i).replace(/^DATA\s+/,'').split(',').map(s=>s.trim())).flat();
assert.equal(exits.length,216);
function graph(collapsed){
 // Optimistically unlock every other puzzle. The vault's bomb is spent.
 const state={H:collapsed?128:11,T:19,E:38,W:43,G:39,D:49};
 const values=exits.map(s=>Object.hasOwn(state,s)?state[s]:Number(s));
 const edges=Array.from({length:55},()=>[]);
 for(let room=1;room<=54;room++){
  for(let d=0;d<4;d++){const dest=values[(room-1)*4+d];if(dest>=1&&dest<=54)edges[room].push({room:dest,command:'NSWE'[d]});}
  edges[room].push({room:16,command:'GALAR'});
 }
 for(const [from,to,command]of [[2,1,'USE KEY'],[35,37,'USE KEY'],[28,35,'USE ROPE']])edges[from].push({room:to,command});
 return {values,edges};
}
function path(edges,start,end){const queue=[start],previous=new Map([[start,null]]);while(queue.length){const from=queue.shift();for(const e of edges[from])if(!previous.has(e.room)){previous.set(e.room,{from,...e});queue.push(e.room);}}
 if(!previous.has(end))return null;const route=[];for(let r=end;r!==start;){const step=previous.get(r);route.unshift({from:step.from,to:r,command:step.command});r=step.from;}return route;
}
assert.match(lines.get(86),/A=11.*H=128/);
assert.match(lines.get(125),/A=16/);assert.match(lines.get(142),/A=2.*A=1/);
const intact=graph(false),collapsed=graph(true);
const report={source:'jhlagado/caverns d60481500140c79da0e6e06719a518c4231c4588 src/caverns.basic',sourceSha256:createHash('sha256').update(bytes).digest('hex'),originalExits:exits,initialKeyRoom:34,hutDoor:{outside:2,inside:1,requiredObject:19},drainage:{conduit54:collapsed.values.slice(53*4,54*4),woodenBridge53:collapsed.values.slice(52*4,53*4),eastBank52:collapsed.values.slice(51*4,52*4)},intactBridgeRouteFromConduit:path(intact.edges,54,1),collapsedBridgeRouteFromConduit:path(collapsed.edges,54,1),scope:'Static intended DATA semantics, all puzzle destinations unlocked, bomb already used for the treasure vault. Not a MicroWorld emulator proof. The old bomb handler can also decrement the room number; it is a single-use action, not an ordinary reusable passage.'};
assert.ok(report.intactBridgeRouteFromConduit);assert.equal(report.collapsedBridgeRouteFromConduit,null);
writeFileSync(new URL('../test/caverns-original.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({keyRoom:34,hutDoor:'room 2 -> room 1 using key',conduit:report.drainage,intactBridgeReturn:true,collapsedBridgeReturn:false}));
