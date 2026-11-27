// Generate the reader-editable BASIC listing from labelled authoring source.
// BAZC itself still compiles the generated BAS directly on TEC-OS.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const world=JSON.parse(readFileSync(root+'programs/caverns/world.json'));
const template=readFileSync(root+'programs/caverns/engine.bas.in','utf8');
const constants={ABSENT:0,CARRIED:-1,ROOM_COUNT:54,OBJECT_COUNT:24,FIRST_ITEM:7,LAST_TREASURE:17,MAX_CARRIED:11,VALUE_OFFSET:24,INITIAL_DATA_COUNT:48,FATAL:128,PROMPT:1,REDISPLAY:2,FINISH:3};
world.rooms.forEach(r=>constants['ROOM_'+r.key]=r.id);
world.objects.forEach(o=>constants['ITEM_'+o.key]=o.id);
world.verbs.forEach((v,i)=>constants['VERB_'+v.trim().toUpperCase()]=i+1);
const directionOrder=['north','south','west','east'];
assert.equal(world.rooms.length,54);assert.equal(world.objects.length,24);
assert.equal(world.verbs.length,26);assert.equal(world.directions.length,4);
world.rooms.forEach((r,i)=>{assert.equal(r.id,i+1);assert.deepEqual(Object.keys(r.exits).sort(),[...directionOrder].sort());});
world.objects.forEach((o,i)=>assert.equal(o.id,i+1));
const quote=s=>{assert.ok(!/[\"\r\n]/.test(s)&&[...s].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)<127),'BASIC DATA strings must be printable ASCII without embedded quotes');return '\"'+s+'\"';};
const labels={},rows=[],pending=[];
function add(text){if(!text.startsWith('REM '))for(const n of pending.splice(0))labels[n]=(rows.length+1)*10;rows.push(text);}
const data=(values,chunk)=>{for(let i=0;i<values.length;i+=chunk)add('DATA '+values.slice(i,i+chunk).join(','));};
for(const raw of template.split('\n')){
 const s=raw.trim();if(!s||s.startsWith('#'))continue;
 const label=/^@([A-Z_]+):$/.exec(s);if(label){assert.ok(!Object.hasOwn(labels,label[1])&&!pending.includes(label[1]));pending.push(label[1]);continue;}
 if(s==='@WORLD_DATA'){
  // Keep complete prose; wrap at word boundaries for the 80-column console.
  for(const room of world.rooms){
   const pieces=[];let line='';
   for(const word of room.description.split(' ')){
    assert.ok(word.length<=79,'prose word exceeds console width');
    if(line&&line.length+1+word.length>79){pieces.push(line);line='';}
    line+=(line?' ':'')+word;
   }
   if(line)pieces.push(line);
   data([String(pieces.length),...pieces.map(quote)],2);
  }
  pending.push('EXIT_DATA');data(world.rooms.flatMap(r=>directionOrder.map(d=>r.exits[d])),27);
  pending.push('OBJECT_DATA');data(world.objects.flatMap(o=>[quote(o.adjective),quote(o.noun)]),10);
  pending.push('INITIAL_DATA');data(world.objects.map(o=>o.initial),24);
  pending.push('VALUE_DATA');data(world.objects.map(o=>o.value),24);
  pending.push('DIRECTION_DATA');data(world.directions.map(quote),4);
  pending.push('VERB_DATA');data(world.verbs.map(quote),10);continue;
 }
 add(s);
}
assert.equal(pending.length,0);
const output=rows.map((s,i)=>{
 // Replace authoring symbols outside strings. REM text stays readable.
 if(!s.startsWith('REM '))s=s.split(/("[^"]*")/g).map((p,j)=>j%2?p:p.replace(/\{([A-Z_]+)\}/g,(_,k)=>{assert.ok(Object.hasOwn(constants,k),k);return constants[k];}).replace(/@([A-Z_]+)/g,(_,k)=>{assert.ok(Object.hasOwn(labels,k),k);return labels[k];})).join('');
 const line=(i+1)*10+' '+s;assert.ok(line.length<=254,`BASIC physical line exceeds 254: ${line}`);return line;
}).join('\n')+'\n';
const stateSymbols={'A%':'RM%','H%':'HB%','D%':'DB%','W%':'HT%','G%':'SH%','T%':'TD%','E%':'CR%','J%':'JF%','C0%':'CL%','F%':'FT%','U%':'TU%','R0%':'RP%','K0%':'GT%','P%()':'OB%()','S%':'SC%'};
const metadata={lineStep:10,labels,constants,stateSymbols,banner:labels.BANNER,resume:labels.GAME_LOOP};
const check=process.argv.includes('--check');
if(check){assert.equal(readFileSync(root+'programs/CAVERNS.BAS','utf8'),output);assert.deepEqual(JSON.parse(readFileSync(root+'programs/caverns/source-map.json')),metadata);}
else{writeFileSync(root+'programs/CAVERNS.BAS',output);writeFileSync(root+'programs/caverns/source-map.json',JSON.stringify(metadata,null,2)+'\n');}
console.log(`Caverns: ${rows.length} lines, step 10, ${world.rooms.length} rooms; ${check?'source current':'BASIC and source map written'}.`);
