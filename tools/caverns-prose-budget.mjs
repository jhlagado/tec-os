// Compare native builds with identical engine/rules and full versus edited room DATA.
// The full-room control is a measurement only, never a starter-card artifact.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
import {runtimeFooter} from './caverns-scenario.mjs';
const read=p=>fs.readFileSync(ROOT+'/'+p),json=p=>JSON.parse(read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const full=json('docs/evidence/caverns-prose-concision/full-prose-candidate.json'),world=json('programs/caverns/world.json'),map=json('programs/caverns/source-map.json'),fixture=json('test/caverns-basic.json');
const withoutText=({description,...room})=>room;
assert.deepEqual(full.rooms.map(withoutText),world.rooms.map(withoutText));
const rows=read('programs/CAVERNS.BAS').toString().trimEnd().split('\n');
const first=rows.findIndex(l=>/^\d+ DATA /.test(l));assert.ok(first>0);
const prefix=rows.slice(0,first);assert.ok(prefix.every(l=>!/^\d+ DATA /.test(l)));
const roomData=[];
for(const room of full.rooms){
 const lines=[];let line='';for(const word of room.description.split(' ')){if(line&&line.length+word.length+1>79){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);
 const values=[String(lines.length),...lines.map(s=>JSON.stringify(s))];
 for(let i=0;i<values.length;i+=2)roomData.push('DATA '+values.slice(i,i+2).join(','));
}
const otherData=rows.filter(l=>Number(l.split(' ')[0])>=map.labels.EXIT_DATA).map(l=>l.replace(/^\d+ /,''));assert.ok(otherData.every(l=>l.startsWith('DATA ')));
const source=prefix.concat([...roomData,...otherData].map((s,i)=>`${(prefix.length+i+1)*10} ${s}`)).join('\n')+'\n';
fs.mkdirSync(ROOT+'/build/caverns',{recursive:true});fs.writeFileSync(ROOT+'/build/caverns/CAVFULL.BAS',source);
const image=new Uint8Array(read('dist/starter.img')),a=volume(image,'A');
assert.equal(sha(a.read('BAZC.COM')),fixture.compilerSha256);assert.equal(sha(a.read('BAZC.RTL')),fixture.librarySha256);
a.write('CAVFULL.BAS',Buffer.from(source),{text:true});
const m=boot(image,{tms:true,matrix:true,width:80});m.enqueueInput('bazc cavfull\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.ready();},800_000_000,'compile full-room control');assert.match(m.text(),/COM written/);assert.deepEqual(m.violations,[]);
const com=Buffer.from(a.read('CAVFULL.COM')),footer=runtimeFooter(com),logical=footer.address+10-256;
assert.ok(Number.isFinite(logical));fs.writeFileSync(ROOT+'/build/caverns/CAVFULL.COM',com);
const edited=read('programs/CAVERNS.COM'),editedFooter=runtimeFooter(edited);
const result={scope:'Same final engine and object/rule DATA, full recovered room prose versus edited room prose. Unshipped full-room control; compilation only, no gameplay qualification claim.',compilerSha256:fixture.compilerSha256,librarySha256:fixture.librarySha256,fullRoomSourceSha256:sha(source),fullRoomCOMSha256:sha(com),fullRoomFileBytes:com.length,fullRoomLogicalBytes:logical,editedCOMSha256:sha(edited),editedFileBytes:edited.length,editedLogicalBytes:editedFooter.address+10-256,fileBytesSaved:com.length-edited.length,logicalBytesSaved:logical-(editedFooter.address+10-256),console:m.text()};
fs.writeFileSync(ROOT+'/build/caverns/prose-budget.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,console:undefined}));
