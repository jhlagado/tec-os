import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareCard,setDisplayLine} from '../host/card.mjs';
import {createContainer,parseContainer,findVolume,volumePayload} from '../tools/lib/container.mjs';
import {CpmVolume} from '../tools/lib/cpmfs.mjs';
const root=resolve(import.meta.dirname,'..');
const disk=image=>{const a=findVolume(parseContainer(image),'A');return new CpmVolume(volumePayload(image,a),a.g)};
const card=()=>createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'}]);
const startup=image=>Buffer.from(disk(image).read('STARTUP.CMD')).toString().split('\x1a')[0];
function mapping(prepare,set){
 for(const width of [32,40,80]){
  const image=card();disk(image).write('STARTUP.CMD',Buffer.from('CON CRT 32\r\nDIR!PICO.SVC!:USER 3\r\n\x1a'));
  assert.deepEqual(prepare(image,'tms',width),{problem:null,note:null,changed:true});
  assert.equal(startup(image),`CON PICO ${width}\r\nDIR!USER 3\r\n`);
  assert.equal(prepare(image,'tms',width).changed,false);assert.equal(set(image,'tms',width),false);
 }
 const implicit=card();prepare(implicit,'tms');assert.equal(startup(implicit),'CON PICO 80\r\n','public default80');
 const readOnly=card();disk(readOnly).write('STARTUP.CMD',Buffer.from('DIR\r\n\x1a'),{readOnly:true});const before=readOnly.slice();assert.match(prepare(readOnly,'tms',80).problem,/read-only/);assert.deepEqual(readOnly,before);
 const full=card(),a=disk(full);for(let i=0;a.list().length<a.entries;i++)a.write(`F${i}.DAT`,new Uint8Array());const old=full.slice();assert.ok(prepare(full,'tms',80).problem);assert.deepEqual(full,old);
}
test('host width choices explicitly select all modes and preserve atomicity and chains',()=>mapping(prepareCard,setDisplayLine));
test('host width validator rejects the old cold80 omission in a disposable source copy',async()=>{
 mkdirSync(resolve(root,'build'),{recursive:true});const temp=mkdtempSync(resolve(root,'build/host-width-'));
 try{
  mkdirSync(temp+'/host');symlinkSync(resolve(root,'tools'),temp+'/tools');
  const source=readFileSync(resolve(root,'host/card.mjs'),'utf8'),anchor='display === "tms" ? [`CON PICO ${width}`]';assert.ok(source.includes(anchor));
  writeFileSync(temp+'/host/card.mjs',source.replace(anchor,'display === "tms" ? (Number(width) === 80 ? [] : [`CON PICO ${width}`])'));
  const bad=await import(pathToFileURL(temp+'/host/card.mjs'));assert.throws(()=>mapping(bad.prepareCard,bad.setDisplayLine),/CON PICO 80/);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
