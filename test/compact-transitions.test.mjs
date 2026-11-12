import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const {Machine,symbolsFromD8}=await import(pathToFileURL(root+'/host/machine.mjs'));
const {createContainer}=await import(pathToFileURL(root+'/tools/lib/container.mjs'));
const read=(v,f)=>readFileSync(root+'/'+f);
const font=readFileSync(root+'/format/tec-compact/export/tec-compact.bin'),old=font;
const hash=b=>createHash('sha256').update(b).digest('hex');
const word=(m,a)=>m.read(a)|(m.read(a+1)<<8);
const patterns=font=>Buffer.from(Array.from({length:256},(_,code)=>{const c=code&127,at=c<32?0:(c-32)*8;return [...font.subarray(at,at+8)].map(b=>code&128?b^255:b)}).flat());
function boot(variant){
 const m=new Machine({rom:read(variant,'build/tecos/tecos.rom'),symbols:symbolsFromD8(JSON.parse(read(variant,'build/tecos/tecos.d8.json'))),sdImage:createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'}]),tms:true,matrix:true,glcd:false,clock:new Date('2026-01-01T12:00:00Z')});
 m.expect(/A(:\S*)?>$/,{from:0,maxCycles:200_000_000});m.runUntil(()=>m.ready(),200_000_000,'raw prompt');return m;
}
function state(m,width,font){
 assert.equal(m.read(m.sym('PIWID')),width,'retained width');assert.equal(m.read(m.sym('VWID')),width,'terminal width');assert.equal(m.read(m.sym('VHGT')),24);
 const snap=m.tec1g.state.display.tms9918.stateSnapshot();
 assert.equal(m.tmsLayout().cols,width,'hardware width');
 const reg=m.sym('REGS'+width);assert.deepEqual([...snap.registers.slice(0,8)],Array.from({length:8},(_,i)=>m.read(reg+i)),'width registers');
 assert.equal(word(m,m.sym('PIREGP')),reg,'register pointer');
 assert.equal(m.read(m.sym('PITPG')),width===80?0x10:4,'page offset');
 assert.equal(m.read(m.sym('PITPD')),0,'draw page');assert.equal(m.read(m.sym('PITPS')),0,'shown page');
 for(let row=0;row<24;row++)assert.equal(word(m,m.sym('PIROWT')+row*2),(width===80?0x1000:0x800)+row*width,'row table');
 assert.deepEqual(Buffer.from(snap.vram.slice(0,2048)),patterns(font),'all 256 font patterns');
 return {width,registers:[...snap.registers.slice(0,8)],patternSha256:hash(snap.vram.slice(0,2048)),pageOffset:m.read(m.sym('PITPG')),draw:0,show:0};
}
function call(m,address,regs){
 const cpu=m.cpu.cpu,saved=m.cpu.captureCpuState();
 const savedStub=Array.from({length:5},(_,i)=>m.read(0x60+i));
 [0xcd,address&255,address>>8,0x18,0xfe].forEach((b,i)=>m.write(0x60+i,b));
 Object.assign(cpu,regs,{sp:0x7000,pc:0x60});const start=m.cycles;
 m.runUntil(()=>m.pc===0x63,20_000_000,'claim helper');const result={a:cpu.a,carry:cpu.flags.C,cycles:m.cycles-start};
 m.cpu.restoreCpuState(saved);savedStub.forEach((b,i)=>m.write(0x60+i,b));return result;
}
function quietCommand(m,line,mode){
 const start=m.cycles;m.type(line.toLowerCase()+'\r');
 m.runUntil(()=>m.cycles>=start+150_000&&m.ready()&&m.read(m.sym('CONMOD'))===mode,100_000_000,line+' claimed prompt');
}
test('all six width transitions and claimed bare selectors keep the production font and owned hardware',()=>{
const transitions=[],claims=[],claimRows=[];
const sourceClaims={};
for(const variant of ['combined']){
 const source=read(variant,'src/layout.asm').toString();
 const matches=[...source.matchAll(/^CDCLM[ \t]+EQU[ \t]+\$([0-9a-f]+)[ \t]*(?:;[^\n]*)?$/gim)];
 assert.equal(matches.length,1,'one pinned CDCLM definition');
 sourceClaims[variant]=parseInt(matches[0][1],16);
 assert.equal(sourceClaims[variant],0x10,'ea3ef3d source-defined claim value');
}
const m=boot('combined');
for(const [from,to] of [[32,40],[32,80],[40,32],[40,80],[80,32],[80,40]]){
 m.command('CON PICO '+from);const before=state(m,from,font);
 const begin=m.cycles;m.command('CON PICO '+to);const after=state(m,to,font);
 assert.equal(m.read(m.sym('VCLAIM')),0);assert.deepEqual(m.violations,[]);
 const row={from,to,before,after,cycles:m.cycles-begin};transitions.push(row);
}
for(const width of [32,40,80]){
 const readings=[];
 for(const variant of ['combined']){
  const b=boot(variant);b.command('CON PICO '+width);state(b,width,variant==='combined'?font:old);
  const acquired=call(b,b.sym('ABICALL'),{b:1,c:b.sym('TNVIDEO')});assert.equal(acquired.a,0);assert.equal(acquired.carry,0,'VIDEO acquisition carry clear');assert.equal(b.sym('CDCLM'),sourceClaims[variant],'map/source CDCLM agreement');assert.equal(b.read(b.sym('VCLAIM')),b.sym('CDCLM'),'exact source-defined claim value');

  // Establish distinctive hardware state while owned, through PICOREG.
  const reg=call(b,b.sym('GFXREG'),{a:0x1c,b:7});
  assert.equal(b.tec1g.state.display.tms9918.stateSnapshot().registers[7],0x1c,'GFXREG established distinctive owned register 7');

  const snapshot=()=>{const s=b.tec1g.state.display.tms9918.stateSnapshot();return {registers:[...s.registers],vramSha256:hash(s.vram),width:b.read(b.sym('PIWID')),claim:b.read(b.sym('VCLAIM'))}};
  const original=snapshot(),steps=[];
  for(const selector of ['CON CRT','CON PICO']){
   quietCommand(b,'CON TTY',0);quietCommand(b,selector,1);
   const after=snapshot();assert.deepEqual(after,original,'claimed '+selector+' leaves hardware and width alone');
   assert.equal(b.read(b.sym('VWID')),width);assert.equal(b.read(b.sym('VHGT')),24);
   const row={selector,before:original,after,hardwareUnchanged:true,widthPreserved:true,claimPreserved:true};steps.push(row);claimRows.push({variant,width,claim:sourceClaims[variant],...row});
  }
  assert.deepEqual(b.violations,[]);readings.push({variant,width,original,steps});
 }
 claims.push({width,readings});
}
assert.equal(transitions.length,6);assert.equal(claimRows.length,6);
});
