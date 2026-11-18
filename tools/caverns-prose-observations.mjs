// Observe real native renderings of both puzzle states without patching live RAM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
import {buildLauncher,encodeScenario,scalarNames,layout} from './caverns-scenario.mjs';
const w=JSON.parse(fs.readFileSync(ROOT+'/programs/caverns/world.json')),f=JSON.parse(fs.readFileSync(ROOT+'/test/caverns-basic.json'));
const vars={'A%':1,'H%':11,'D%':128,'W%':0,'G%':0,'T%':0,'E%':0,'J%':0,'C0%':1,'F%':0,'U%':0,'R0%':0,'K0%':0};
await buildLauncher();const records=[],l=layout();
const compact=s=>s.replace(/\s+/g,'');
function observe(name,room,flags,expected,absent=[],dead=0){
 const objects=w.objects.map(o=>o.id===8||o.id===19||o.id===20||o.id===21?-1:o.id===22?28:o.initial);if(dead)objects[dead-1]=0;
 const s={format:'caverns-basic-scenario-2',gameSha256:f.comSha256,variables:{...vars,'A%':room,...flags},objects,rng:'12345678'};
 const image=new Uint8Array(fs.readFileSync(ROOT+'/dist/starter.img')),a=volume(image,'A');a.write('CAVLOAD.COM',fs.readFileSync(ROOT+'/build/caverns/CAVLOAD.COM'));a.write('TEXT.CAV',encodeScenario(s));
 const m=boot(image,{tms:true,matrix:true,width:80});m.enqueueInput('cavload text\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&m.waitingForInput()&&m.text().endsWith('? ');},500_000_000,name);
 const text=m.text();for(const needle of expected)assert.ok(compact(text).includes(compact(needle)),name+': missing '+needle);for(const needle of absent)assert.ok(!compact(text).includes(compact(needle)),name+': unexpected '+needle);
 const word=p=>m.read(p)|m.read(p+1)<<8;
 for(const n of scalarNames)assert.equal(word(f.symbols[f.stateSymbols[n]].address)<<16>>16,s.variables[n],name+': '+n);
 const base=word(f.symbols['OB%()'].address)+6;assert.deepEqual(objects,objects.map((_,i)=>word(base+2*i)<<16>>16));assert.equal(Buffer.from(Array.from({length:4},(_,i)=>m.read(l.rng+i))).reverse().toString('hex'),s.rng);
 assert.deepEqual(m.violations,[]);records.push({name,room,flags,expected,absent,output:text,screen:m.screen()});
}
observe('closed temple gate',35,{},['To the north is a locked gate.','living rock'],['North gate locked.','from which you descended']);
observe('open temple gate',35,{'K0%':1},['To the north is an open gate.'],['locked gate']);
observe('closed treasure door',20,{},['oak door bound with iron','locked from the inside','Perhaps explosives'],['East:','passage east into the treasure room']);
observe('blasted treasure door',20,{'T%':19},['blast has opened a passage east'],['locked from the inside','oak door bound with iron']);
observe('secured balcony rope',28,{'R0%':1},['rope hangs securely','End Of All Things'],['Use UP or DOWN','pagan']);
observe('secured temple rope',35,{'R0%':1},['rope hangs securely','living rock'],['Use UP or DOWN']);
observe('closed crypt seal',37,{},['The stones are marked V, A, R and D'],['East seal open.']);
observe('open crypt seal',37,{'E%':38},['stone seal in the eastern wall stands open'],['The stones are marked']);
observe('covered shaft',38,{},['rusty grille covers','too large to carry'],['DROP GRILLE']);
observe('open shaft',38,{'G%':39},['open ventilation shaft leads east'],['rusty grille covers']);
observe('raised drawbridge',48,{},['raised drawbridge keeps you from crossing'],['East drawbridge']);
observe('lowered drawbridge',48,{'D%':49},['mighty golden drawbridge spans the waters'],['East drawbridge']);
observe('wizard imagery',36,{},['swirling mist','hand held outwards','Thou shalt not pass'],['Nearby there lurks']);
observe('dragon imagery',14,{},['enormous green dragon','jets of fire'],['Nearby there lurks','sleeping dragon wakes']);
observe('dragon defeated',14,{},['bloody corpse'],['enormous green dragon','jets of fire'],4);
observe('dwarf imagery',47,{},['carrying a lantern','My job is to protect these stone steps','lunges'],['Nearby there lurks']);
fs.writeFileSync(ROOT+'/build/caverns/prose-observations.json',JSON.stringify({gameSha256:f.comSha256,cases:records.length,records},null,2)+'\n');console.log('All '+records.length+' state-dependent prose observations and complete state/RNG checks passed.');
