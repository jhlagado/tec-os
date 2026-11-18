// Inventory archival and current prose without changing any game artifact.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const archive=process.argv[2];
assert.ok(archive,'Usage: node tools/caverns-text-audit.mjs /path/to/caverns [git-ref]');
const ref=process.argv[3]??'origin/master';
const git=(...args)=>execFileSync('git',['-C',archive,...args],{encoding:'utf8'});
const originalCommit=git('rev-parse',ref).trim();
const originalFile='src/protected/caverns.basic';
const bytes=execFileSync('git',['-C',archive,'show',`${originalCommit}:${originalFile}`]);
const original=bytes.toString('utf8');
const engine=readFileSync(root+'programs/caverns/engine.bas.in','utf8');
const world=JSON.parse(readFileSync(root+'programs/caverns/world.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const strings=line=>[...line.matchAll(/"([^"\r\n]*)"/g)].map(m=>m[1]);
const normal=s=>s.replace(/\s+/g,' ').trim();
const oldLines=original.split(/\r?\n/).filter(s=>s.trim()).map(s=>{
 const m=/^(\d+)\s+([\s\S]*)$/.exec(s);assert.ok(m,`Unnumbered archive line: ${s}`);
 return {line:Number(m[1]),source:m[2],literals:strings(m[2])};
});
const currentLines=engine.split('\n').map((source,i)=>({line:i+1,source,literals:strings(source)}));
const oldPrint=oldLines.filter(r=>/\bPRINT\b/.test(r.source));
const newPrint=currentLines.filter(r=>!r.source.startsWith('REM ')&&/\bPRINT\b/.test(r.source));
// Restrict archival room extraction to the original renderer, lines 10..55.
// Later IF A=... action messages are NOT room descriptions. Preserve all
// matching renderer statements, including original duplicate room53 output.
const oldRooms=oldLines.filter(r=>r.line>=10&&r.line<=55);
function roomMatches(source,id){
 const cond=source.split(/\bTHEN\s+PRINT\b/)[0];
 return cond.split(/\bOR\b/).some(part=>{
  let comparisons=[...part.matchAll(/\bA\s*(<>|=|>|<)\s*(\d+)/g)];
  return comparisons.length>0&&comparisons.every(([,op,n])=>op==='='?id===+n:op==='>'?id>+n:op==='<'?id<+n:id!==+n);
 });
}
const rooms=world.rooms.map(r=>{
 const sources=oldRooms.filter(x=>roomMatches(x.source,r.id));
 return {room:r.id,key:r.key,originalSources:sources,original:normal(sources.flatMap(x=>x.literals).join(' ')),current:r.description};
});
const data=oldLines.filter(r=>r.line>=182&&r.line<=187).flatMap(r=>r.literals);
assert.equal(data.length,48,'all archival creature/item adjective and noun pairs');
const objects=world.objects.map((o,i)=>({object:o.id,key:o.key,originalAdjective:data[i*2],originalNoun:data[i*2+1],currentAdjective:o.adjective,currentNoun:o.noun}));
const groups=[
 ['Opening and darkness',[3,4,8],["@BANNER:","@GAME_LOOP:"],['@DESCRIBE_ROOM:','@DESCRIBE_FOES:']],
 ['Creature entrance scenes',[200,202,203,205],['@FOE_INTRO:','@INVENTORY:']],
 ['Inventory and object formatting',[68,74,94,98,165],['@PRINT_OBJECT:','@READ_COMMAND:']],
 ['Score, ranking and restart',[105,192,193,194,195,196,197],['@END_ADVENTURE:','@LOAD_TABLES:'],['@COMPUTE_SCORE:','@HOMECOMING:']],
 ['Bat transport and death',[109,112,121],['@BAT_TRANSPORT:','@OBJECT_ACTION:']],
 ['Movement and magic',[120,125,127],['@MOVE:','@BAT_TRANSPORT:']],
 ['Object errors and carrying',[128,129,135,140,141,142,143],['@OBJECT_ACTION:','@SWORD:']],
 ['Sword combat',[145,148,149,150,151,153,154],['@SWORD:','@CANDLE:']],
 ['Candle and bomb',[59,62,158,160,161],['@CANDLE:','@ROPE_HELP:']],
 ['Rope',[163,164],['@TIE_ROPE:','@OPEN_HATCH:'],['@ROPE_HELP:','@COMPUTE_SCORE:']],
 ['Generic command replies',[170,171,172],['@EXECUTE_COMMAND:','@DIRECTION_OR_OBJECT:']]
];
function section(start,end){const a=engine.indexOf(start),b=engine.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`section ${start}..${end}`);return currentLines.filter(r=>r.line>engine.slice(0,a).split('\n').length&&r.line<=engine.slice(0,b).split('\n').length&&/\bPRINT\b/.test(r.source));}
const messageGroups=groups.map(([name,old,...ranges])=>({name,original:oldPrint.filter(r=>old.includes(r.line)),current:ranges.flatMap(([s,e])=>section(s,e))}));
const report={scope:'Inventory only; no changes applied. Room and message correspondence is not proof of semantic equivalence.',original:{repository:'https://github.com/jhlagado/caverns',ref,commit:originalCommit,file:originalFile,sha256:sha(bytes)},current:{worldSha256:sha(readFileSync(root+'programs/caverns/world.json')),engineSha256:sha(Buffer.from(engine))},coverage:{rooms:rooms.length,objects:objects.length,archivalPrintStatements:oldPrint.length,currentPrintSourceLines:newPrint.length,archivalPrintLiterals:oldPrint.reduce((n,r)=>n+r.literals.length,0),currentPrintLiterals:newPrint.reduce((n,r)=>n+r.literals.length,0)},rooms,objects,messageGroups,allOriginalPrintStatements:oldPrint,allCurrentPrintSourceLines:newPrint};
const out=root+'docs/evidence/caverns-text-audit/';mkdirSync(out,{recursive:true});
writeFileSync(out+'inventory.json',JSON.stringify(report,null,2)+'\n');
let md=`# Caverns complete text comparison\n\nSpoilers: author/editor review, separate from the user manual.\n\nGenerated from archived MicroWorld BASIC at ${originalCommit} and the checked\ncurrent world/engine files. Exact byte hashes and complete statement inventory\nare in [inventory.json](evidence/caverns-text-audit/inventory.json).\nNo game text has been edited by this report.\n\nCoverage: ${rooms.length} rooms, ${objects.length} creature/item descriptions,\n${oldPrint.length} original PRINT statements and ${newPrint.length} current\nPRINT source lines (including lines with multiple PRINT statements).\n\nOriginal whitespace padding is collapsed only for paragraph display. The JSON\nretains exact original statement text and string contents. Fixed-column joined\nwords such as pathleads remain visible; they are not silently guessed apart.\nOriginal room extraction is restricted to renderer lines 10–55. Earlier\nrooms.json accidentally included later door/bomb action text for rooms 2/20;\nuse this scoped inventory instead for archival room provenance.\n\n## Room descriptions\n\n`;
for(const r of rooms){md+=`### ${r.room}: ${r.key}\n\nOriginal renderer lines: ${r.originalSources.map(x=>x.line).join(', ')||'none (no room-specific renderer text)'}\n\n**Original:** ${r.original||'[No matching room-description PRINT in the original renderer.]'}\n\n**Current:** ${r.current}\n\n`;}
md+='## Creature and item names\n\nArticles are assembled from a literal a plus the adjective field.\n\n';
for(const o of objects)md+=`- **${o.object} ${o.key}:** original “${normal('a'+o.originalAdjective+o.originalNoun)}”; current “${normal('a'+o.currentAdjective+o.currentNoun)}”.\n`;
function printRows(rows){return rows.map(r=>`- Line ${r.line}: ${r.literals.map(x=>'“'+normal(x)+'”').join(' / ')||'[PRINT has no literal text; inspect source inventory for variables.]'}`).join('\n')+'\n';}
md+='\n## Other displayed messages: comparison groups\n\nGroups aid manual review; they do not claim a one-to-one mapping. Current\nline references are in the labelled authoring engine, not the generated BAS.\nThe appendices inventory every PRINT line even when not mapped in a group.\n\n';
for(const g of messageGroups)md+=`### ${g.name}\n\n**Original**\n\n${printRows(g.original)}\n**Current**\n\n${printRows(g.current)}\n`;
md+='## Complete original PRINT inventory\n\n'+printRows(oldPrint)+'\n## Complete current PRINT inventory\n\n'+printRows(newPrint);
writeFileSync(root+'docs/caverns-text-comparison.md',md);
console.log(JSON.stringify({originalCommit,...report.coverage}));
