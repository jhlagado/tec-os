import {test} from 'node:test';
import {validateGlcdCell} from './lib/glcd-bitmap.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const data=root+'/format/tec-compact/export';
const {Machine,symbolsFromD8}=await import(pathToFileURL(root+'/host/machine.mjs'));
const {createContainer,parseContainer,findVolume,volumePayload}=await import(pathToFileURL(root+'/tools/lib/container.mjs'));
const {CpmVolume}=await import(pathToFileURL(root+'/tools/lib/cpmfs.mjs'));
const font=readFileSync(data+'/tec-compact.bin');Machine.font=font;
const rom=readFileSync(root+'/build/tecos/tecos.rom');
const symbols=symbolsFromD8(JSON.parse(readFileSync(root+'/build/tecos/tecos.d8.json')));
const rows=[];
const word=(m,a)=>m.read(a)|(m.read(a+1)<<8);
function card(startup){
 const image=createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'},{geometry:'G8M',label:'WORK',mount:'B'}]);
 const info=parseContainer(image),a=findVolume(info,'A'),disk=new CpmVolume(volumePayload(image,a),a.g);
 if(startup!==undefined)disk.write('STARTUP.CMD',Buffer.from(startup+'\r\n\x1a'));
 disk.write('ROWS.TXT',Buffer.from('\x1b[2J\x1b[H,;Qgjpqy{}\r\nMMMMMMMMMM\r\n\x1b[7m,;Qgjpqy{}\x1b[0m\r\n\x1a'));
 return image;
}
function boot(image,opts={tms:true,matrix:true,glcd:false},variant='combined'){
 const selected={rom,symbols};
 const m=new Machine({...selected,sdImage:image,clock:new Date('2026-01-01T12:00:00Z'),...opts});
 const windows=Object.fromEntries([['bdos','STKBASE','STKTOP'],['ccp','CSTKBAS','CSTKTOP'],['bios','BSTKB','BSTK']].map(([n,b,t])=>[n,[m.sym(b),m.sym(t)]]));
 const low=Object.fromEntries(Object.entries(windows).map(([n,[b,t]])=>[n,t]));
 const step=m.step.bind(m);
 m.step=()=>{const sp=m.cpu.cpu.sp;for(const [n,[b,t]] of Object.entries(windows))if(sp>=b&&sp<=t)low[n]=Math.min(low[n],sp);return step()};
 m.modelDepths=()=>Object.fromEntries(Object.entries(windows).map(([n,[b,t]])=>[n,{reserved:t-b,deepest:t-low[n]}]));
 m.expect(/A(:\S*)?>$/,{from:0,maxCycles:200_000_000});m.runUntil(()=>m.ready(),200_000_000,'first input');
 return m;
}
function call(m,address,regs={}){
 const c=m.cpu.cpu;
 [0xcd,address&255,address>>8,0x18,0xfe].forEach((v,i)=>m.write(0x60+i,v));
 Object.assign(c,{sp:0x7000,pc:0x60,...regs});
 let min=c.sp;const begin=m.cycles;
 m.runUntil(()=>{min=Math.min(min,c.sp);return m.pc===0x63},6_000_000,'display return');
 return {stack:0x7000-min,cycles:m.cycles-begin,carry:c.flags.C};
}
const expected=code=>{
 const normal=code&127;const at=normal<32?0:(normal-32)*8;
 return [...font.subarray(at,at+8)].map(b=>code&128?b^255:b);
};
test('raw cold40 and all PICO/GLCD aliases, reverse and row7 rendering on production media',()=>{
const raw=card();const info=parseContainer(raw),a=findVolume(info,'A');
assert.deepEqual(new CpmVolume(volumePayload(raw,a),a.g).list().map(f=>f.name),['ROWS.TXT']);
function rawDefault(m,image){
 const a=findVolume(parseContainer(image),'A');
 assert.ok(!new CpmVolume(volumePayload(image,a),a.g).list().some(f=>f.name==='STARTUP.CMD'),'raw default forbids startup injection');
 assert.equal(m.read(m.sym('PIWID')),40,'raw cold default without STARTUP or injected width');
}
const cold=boot(raw);rawDefault(cold,raw);
assert.throws(()=>rawDefault(cold,card('CON PICO 40')),/forbids startup/);
assert.equal(cold.tec1g.state.display.tms9918.stateSnapshot().registers[7],0x31);
rows.push({case:'raw-cold',width:40,noStartup:true,noFixtureInjection:true});
for(const width of [32,40,80]){
 const m=boot(card());
 m.command('CON PICO '+width);assert.equal(m.read(m.sym('PIWID')),width);
 m.command('CON TTY');assert.equal(m.read(m.sym('VWID')),0);assert.equal(m.read(m.sym('VHGT')),0);m.command('CON CRT');assert.equal(m.read(m.sym('PIWID')),width);
 m.command('CON PICO');assert.equal(m.read(m.sym('PIWID')),width);
 const mark=m.output.length;m.cpu.cpu.pc=0;
 m.runUntil(()=>m.ready()&&/A(:\S*)?>$/.test(m.text(mark)),200_000_000,'warm preservation');
 assert.equal(m.read(m.sym('PIWID')),width);
 m.command('TYPE ROWS.TXT');
 const text=',;Qgjpqy{}';
 for(let i=0;i<text.length;i++){
  assert.equal(m.cell(0,i),text.charCodeAt(i),'normal row and row-7 ink');
  assert.equal(m.cell(1,i),'M'.charCodeAt(0),'adjacent row preserved');
  assert.equal(m.cell(2,i),text.charCodeAt(i)|128,'reverse terminal row');
 }
 assert.ok(m.read(m.sym('VROW'))>=3,'cursor follows the adjacent test rows');
 const vram=m.tec1g.state.display.tms9918.stateSnapshot().vram;
 for(let code=0;code<256;code++)assert.deepEqual([...vram.slice(code*8,code*8+8)],expected(code),'pattern '+width+'/'+code);
 const before=m.read(m.sym('PIWID'));
 call(m,m.sym('ABICALL'),{b:1,c:m.sym('TNVIDEO')});
 const refused=call(m,m.sym('TMSWID'),{a:width===80?40:80});
 assert.equal(refused.carry,1);assert.equal(m.read(m.sym('PIWID')),before);
 call(m,m.sym('ABICALL'),{b:0,c:m.sym('TNVIDEO')});
 let peak=0;
 for(let code=0;code<256;code++){
  const r=call(m,m.sym('TMSPUT'),{a:code,b:Math.floor(code/width),c:code%width});
  peak=Math.max(peak,r.stack);
 }
 assert.deepEqual(m.violations,[]);
 rows.push({case:'pico',width,aliases:256,reverse:'XOR FF',stack:peak,explicitSelection:true,bareSelectionPreserved:true,warmPreserved:true});
}
for(const width of [40,80]){
 const m=boot(card('CON PICO '+width));
 assert.equal(m.read(m.sym('PIWID')),width,'explicit startup precedence');
 rows.push({case:'startup',width});
}
const glcdImage=new Uint8Array(readFileSync(root+'/dist/starter.img'));
const gi=parseContainer(glcdImage),ga=findVolume(gi,'A');
new CpmVolume(volumePayload(glcdImage,ga),ga.g).write('ROWS.TXT',Buffer.from('\x1b[2J\x1b[H,;Qgjpqy{}\r\nMMMMMMMMMM\r\n\x1b[7m,;Qgjpqy{}\x1b[0m\r\n\x1a'));
const g=boot(glcdImage,{tms:false,matrix:true,glcd:true});
g.command('TYPE ROWS.TXT');
const text=',;Qgjpqy{}',pixels=g.tec1g.state.display.glcdCtrl.glcd;
for(let row=0;row<3;row++)for(let col=0;col<text.length;col++){
 const code=row===1?77:text.charCodeAt(col)|(row===2?128:0);
 for(let y=0;y<8;y++)for(let x=0;x<6;x++){
  const px=col*6+x,py=row*8+y;
  assert.equal((pixels[py*16+(px>>3)]>>(7-(px&7)))&1,(expected(code)[y]>>(7-x))&1,'adjacent/cursor/reverse GLCD');
 }
}
assert.ok(g.read(g.sym('VROW'))>=3);
const table=word(g,g.sym('GLVEC'));assert.ok(table);assert.equal(g.read(table+14),21);assert.equal(g.read(table+15),8);
let peak=0;
for(let code=0;code<256;code++){
 const r=call(g,word(g,table),{a:code,b:0,c:0});peak=Math.max(peak,r.stack);
 const bytes=g.tec1g.state.display.glcdCtrl.glcd;
 validateGlcdCell(bytes,code,font);
 if(code===65){
  const original=readFileSync(root+'/format/font-original.bin');
  assert.throws(()=>validateGlcdCell(bytes,code,original),/fixed-font GLCD cell/);
  const wrong=Buffer.from(font);wrong[(65-32)*8]^=8;
  assert.throws(()=>validateGlcdCell(bytes,code,wrong),/fixed-font GLCD cell/);
 }

}
assert.deepEqual(g.violations,[]);
rows.push({case:'glcd',width:21,rows:8,aliases:256,stack:peak,reversePadding:'consumer complements all six cells'});
});
