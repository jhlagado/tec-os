// KS40 software contracts. Native NMI is suppressed, not qualified here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Machine,symbolsFromD8} from '../host/machine.mjs';
import {createContainer} from '../tools/lib/container.mjs';
import {assembleProgram} from '../tools/lib/assemble.mjs';
const root=resolve(import.meta.dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const word=(m,a)=>m.read(a)|(m.read(a+1)<<8);
const setword=(m,a,v)=>{m.write(a,v&255);m.write(a+1,v>>8)};
function make(variant,{matrix=true,tms=true,mutate}={}) {
 const dir=root+'/build/tecos/';
 const sy=symbolsFromD8(JSON.parse(readFileSync(dir+'tecos.d8.json')));
 const rom=Buffer.from(readFileSync(dir+'tecos.rom'));
 if(mutate)mutate(rom,n=>sy.get(n)-0xc000);
 const m=new Machine({rom,symbols:sy,tms,matrix,glcd:false,ramFill:0});
 m.cpu.hardware.ioWrite(255,1);m.write(m.sym('LATCHV'),1);
 // Suppress native NMI delivery: this checks register/shadow ordering only.
 const vdp=m.tec1g.state.display.tms9918, consume=vdp.consumeNmi.bind(vdp);
 vdp.consumeNmi=()=>{consume();return false};
 m.write(m.sym('CONDEV'),tms?(matrix?3:2):0);
 m.minsp=65535;m.vdpPorts=[];m.trace=[];m.addr=0;m.latch=null;
 const wr=m.cpu.hardware.ioWrite,rd=m.cpu.hardware.ioRead;
 m.cpu.hardware.ioWrite=(port,value)=>{
  const p=port&255;
  if(p===190||p===191)m.vdpPorts.push({direction:'write',port:p,value});
  if(p===191){if(m.latch===null)m.latch=value;else{if(!(value&128))m.addr=((value&63)<<8)|m.latch;m.latch=null}}
  if(p===190){m.trace.push(m.addr);m.addr=(m.addr+1)&16383}
  return wr(port,value);
 };
 m.cpu.hardware.ioRead=(port)=>{const p=port&255;if(p===190||p===191)m.vdpPorts.push({direction:'read',port:p});if(p===191)m.latch=null;return rd(port)};
 const step=m.step.bind(m);
 m.step=()=>{m.minsp=Math.min(m.minsp,m.cpu.cpu.sp);return step()};
 return m;
}
function call(m,addr,regs={}) {
 const cpu=m.cpu.cpu, stop=0x63;
 [0xcd,addr&255,addr>>8,0x18,0xfe].forEach((v,i)=>m.write(0x60+i,v));
 Object.assign(cpu,{a:0,b:0,c:0,d:0,e:0,h:0,l:0,sp:0x7000,pc:0x60},regs);
 m.minsp=0x7000;const start=m.cycles,begin=m.trace.length;
 m.runUntil(()=>m.pc===stop,3_000_000,'return');
 return {cycles:m.cycles-start,stack:0x7000-m.minsp,writes:m.trace.slice(begin),a:cpu.a,flags:{...cpu.flags}};
}
function select(m){const p=m.sym('PIBLK');call(m,m.sym('CONSWV'),{h:p>>8,l:p&255,b:1})}
function init(m){call(m,m.sym('PISTART'),{h:m.sym('CONDEV')>>8,l:m.sym('CONDEV')&255});select(m)}
const state=m=>m.tec1g.state.display.tms9918.stateSnapshot();
const ie=m=>state(m).registers[1]&32;
const shadow=m=>m.read(m.sym(m.symbols.has('PITIE')?'PITIE':'PIRAM')+(m.symbols.has('PITIE')?0:1))&32;
function find(m,least=2,expected=true) {
 [...'PICO    '].forEach((v,i)=>m.write(0x2100+i,v.charCodeAt(0)));
 const r=call(m,m.sym('ABICALL'),{b:least,c:m.sym('TNFIND'),d:0x21,e:0});
 assert.equal(r.flags.C,expected?0:1);return expected?((m.cpu.cpu.h<<8)|m.cpu.cpu.l):null;
}
function claim(m,b){return call(m,m.sym('ABICALL'),{b,c:m.sym('TNVIDEO')})}
function reg(m,table,b,a){return call(m,word(m,table+m.sym('PICOREG')),{a,b})}
const geometry=w=>({base:w===80?0x1000:0x800,step:w===80?0x1000:0x400,size:w*24});
const overlaps=(a,b)=>a[0]<b[1]&&b[0]<a[1];
function mapcheck(base,w,reserved) {
 const {base:n,step,size}=geometry(w);
 const consolePages=[[n,n+size],[n+step,n+step+size]];
 const fixed=[[0,0x800],[0x3fff,0x4000],...(w===32?[[0x2000,0x2020],[0x1b00,0x1b80],[0x3800,0x4000]]:[])];
 const reserve=[base,base+reserved];
 assert.ok(![...fixed,...consolePages].some(x=>overlaps(reserve,x)));
 return {width:w,base,occupied:w*24,reserved:reserve[1]-base,consolePages,fixed};
}
function noWrites(writes,base,reserved){assert.ok(writes.every(a=>a<base||a>=base+reserved),'console touched reserved VRAM')}
const fresh=()=>{const m=make('bit');init(m);return {m,table:find(m,4)}};
const assertionOnly=e=>e.code==='ERR_ASSERTION';
function armed(m,table,w,bit=32){claim(m,0);call(m,word(m,table+m.sym('PICOWID')),{a:w});select(m);claim(m,1);reg(m,table,1,(w===32?0xc0:0xd0)|bit)}
function warm(m){m.cpu.cpu.pc=m.sym('WBOOTR');m.runUntil(()=>m.cpu.cpu.sp===m.sym('BSTK'),500_000,'warm stack');m.minsp=m.sym('BSTK');m.runUntil(()=>m.pc===m.sym('PZINIT'),3_000_000,'PZINIT');return m.sym('BSTK')-m.minsp}

test('KS40 common 3000h reservation survives console writes at every width and rejects boundary faults',()=>{
 const {m,table}=fresh();
 for(const w of [32,40,80]){
  armed(m,table,w,0);const writes=[...call(m,word(m,table+6)).writes];
  for(let row=0;row<24;row++){
   writes.push(...call(m,m.sym('TMSCLR'),{b:row,c:0}).writes);
   writes.push(...call(m,m.sym('TMSPUT'),{a:65,b:row,c:w-1}).writes);
  }
  writes.push(...call(m,m.sym('TMSMBEG'),{b:1,c:22}).writes);
  for(let row=1;row<=22;row++)writes.push(...call(m,m.sym('TMSWRR'),{b:row}).writes);
  noWrites(writes,0x3000,0x800);mapcheck(0x3000,w,0x800);
 }
 noWrites([0x2fff,0x3800],0x3000,0x800);
 for(const at of [0x3000,0x3400,0x37ff])assert.throws(()=>noWrites([at],0x3000,0x800),assertionOnly);
 assert.throws(()=>mapcheck(0x1000,80,0x800),assertionOnly);
 assert.throws(()=>assert.equal(0x3000>>10,15),assertionOnly);
 for(const [width,high]of [[80,0x30],[40,0x34],[32,0x34]]){
  const bad=make('bit',{mutate:(rom,at)=>{const p=rom.indexOf(Buffer.from([0x21,0,0]),at('TMSSET'));assert.ok(p>=at('TMSSET')&&p<at('TMSPAT'));rom[p+2]=high}});
  call(bad,bad.sym('PISTART'),{h:bad.sym('CONDEV')>>8,l:bad.sym('CONDEV')&255});const t=find(bad,4);
  armed(bad,t,width,0);const result=call(bad,word(bad,t+6));
  assert.throws(()=>noWrites(result.writes,0x3000,0x800),assertionOnly);
 }
});

test('KS40 PICOREG tracks claimed R1 IE while other registers and raw writes stay untracked',()=>{
 const {m,table}=fresh();armed(m,table,40);
 assert.equal(shadow(m),32);assert.equal(ie(m),32);
 for(const b of [0,2,3,4,5,6,7]){reg(m,table,b,0);assert.equal(shadow(m),32)}
 reg(m,table,1,0xd0);assert.equal(shadow(m),0);
 m.cpu.hardware.ioWrite(191,0xf0);m.cpu.hardware.ioWrite(191,0x81);
 assert.equal(ie(m),32);assert.equal(shadow(m),0);
 call(m,word(m,table+6));assert.equal(ie(m),0);
});

test('KS40 restore and ordinary release preserve tracked IE at 32 40 and 80 columns',()=>{
 const {m,table}=fresh();
 for(const w of [32,40,80])for(const bit of [0,32]){
  armed(m,table,w,bit);for(let n=0;n<2;n++){call(m,word(m,table+6));assert.equal(ie(m),bit);assert.equal(shadow(m),bit);assert.equal(state(m).registers[1],(w===32?0xc0:0xd0)|bit)}
  reg(m,table,2,w===80?15:12);assert.equal(state(m).registers[2],w===80?15:12);
  claim(m,0);assert.equal(ie(m),bit);assert.equal(shadow(m),bit);
 }
 const bad=make('bit',{mutate:(rom,at)=>{const p=at('TMSR')+6;assert.equal(rom[p],0x3a);rom.set([0xaf,0,0],p)}});
 init(bad);const t=find(bad,4);armed(bad,t,40);call(bad,word(bad,t+6));
 assert.throws(()=>assert.equal(ie(bad),32),assertionOnly);
});

test('KS40 accepted widths preserve IE and claimed or invalid widths change nothing',()=>{
 const {m,table}=fresh();
 for(const w of [32,40,80])for(const bit of [0,32]){
  armed(m,table,w,bit);
  assert.equal(call(m,word(m,table+m.sym('PICOWID')),{a:w===80?40:80}).flags.C,1);
  assert.equal(m.read(table+14),w);assert.equal(shadow(m),bit);
  claim(m,0);const next=w===32?40:32;
  assert.equal(call(m,word(m,table+m.sym('PICOWID')),{a:next}).flags.C,0);
  call(m,word(m,table+6));assert.equal(ie(m),bit);assert.equal(shadow(m),bit);
  for(const a of [0,31,81]){assert.equal(call(m,word(m,table+m.sym('PICOWID')),{a}).flags.C,1);assert.equal(m.read(table+14),next);assert.equal(shadow(m),bit)}
 }
});

test('KS40 real warm boot clears hardware and shadow before PZINIT claimed or unclaimed',()=>{
 for(const held of [false,true]){
  const {m,table}=fresh();armed(m,table,40);if(!held)claim(m,0);
  assert.equal(ie(m),32);const depth=warm(m);assert.equal(ie(m),0);assert.equal(shadow(m),0);assert.equal(depth,held?12:4,"KD-250 warm depth");
  call(m,word(m,table+6));assert.equal(ie(m),0);
 }
 for(const kind of ['skip-clear','stale-shadow']){
  const bad=make('bit',{mutate:(rom,at)=>{
   if(kind==='stale-shadow'){const p=at('PIICLR')+1;assert.equal(rom[p],0x32);rom.set([0,0,0],p)}
   else{const target=at('PIICLR')+0xc000,p=rom.indexOf(Buffer.from([0xcd,target&255,target>>8]),at('WBOOTR'));assert.ok(p>=at('WBOOTR')&&p<at('PZINIT'));rom.set([0,0,0],p)}
  }});
  init(bad);const t=find(bad,4);armed(bad,t,40);claim(bad,0);warm(bad);
  assert.throws(()=>{assert.equal(ie(bad),0);assert.equal(shadow(bad),0)},assertionOnly);
 }
});

test('KS40 quit and abort clear before vector teardown and incompatible ownership cannot arm',()=>{
 // A provisional transient client, not an installed IRQ handler.
 for(const exit of ['quit','abort']){
  const {m,table}=fresh(),owner=0x2200;let owns=false;
  const arm=()=>{assert.ok(owns);assert.equal(m.read(0x38),0xc3);assert.equal(word(m,0x39),owner);reg(m,table,1,0xf0)};
  assert.equal(claim(m,1).a,0);owns=true;m.write(0x38,0xc3);setword(m,0x39,owner);arm();
  claim(m,0);assert.equal(ie(m),32,'hooked target retains the session');
  claim(m,1);reg(m,table,1,0xd0);assert.equal(ie(m),0,exit+' clear before vector teardown');assert.equal(shadow(m),0);
  setword(m,0x39,0x2300);assert.throws(arm,assertionOnly);assert.equal(ie(m),0);assert.equal(shadow(m),0);claim(m,0);
 }
});

test('KS40 bare and absent VDP paths clear safely without absent-device port access',()=>{
 const bare=make('bit',{matrix:false});bare.write(bare.sym('PITIE'),32);
 bare.cpu.hardware.ioWrite(191,0xe0);bare.cpu.hardware.ioWrite(191,0x81);warm(bare);
 assert.equal(ie(bare),0);assert.equal(shadow(bare),0);assert.equal(word(bare,bare.sym('PIREGP')),0);
 // XR-04: a bare VDP is left blanked (80h), not unblanked by the 32-column C0h.
 assert.equal(state(bare).registers[1],0x80,'bare warm boot writes blanked R1');
 assert.deepEqual(bare.vdpPorts.filter(p=>p.direction==='write').slice(-2).map(p=>p.value),[0x80,0x81]);
 const missing=make('bit',{tms:false,matrix:false});missing.write(missing.sym('PITIE'),32);warm(missing);
 assert.equal(shadow(missing),0);assert.deepEqual(missing.vdpPorts,[]);
 const bad=make('bit',{tms:false,matrix:false,mutate:(rom,at)=>{const p=at('PIICLR')+9;assert.equal(rom[p],0xc8);rom[p]=0}});
 warm(bad);assert.throws(()=>assert.deepEqual(bad.vdpPorts,[]),assertionOnly);
});

test('KS40 cold legacy storage clears before the primary40 console starts',()=>{
 const cold=make('bit');cold.write(cold.sym('PITIE'),255);cold.cpu.cpu.sp=0x7000;cold.cpu.cpu.pc=cold.sym('COLDZ');
 cold.runUntil(()=>cold.pc===cold.sym('CONINIT'),3_000_000,'CONINIT');assert.equal(shadow(cold),0);
 const m=new Machine({rom:readFileSync(root+'/build/tecos/tecos.rom'),symbols:symbolsFromD8(JSON.parse(readFileSync(root+'/build/tecos/tecos.d8.json'))),sdImage:createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'}]),tms:true,matrix:true,glcd:false,clock:new Date('2026-01-01T12:00:00Z')});
 const vdp=m.tec1g.state.display.tms9918,consume=vdp.consumeNmi.bind(vdp);vdp.consumeNmi=()=>{consume();return false};
 m.expect(/A>$/,{from:0,maxCycles:200_000_000});m.runUntil(()=>m.ready(),200_000_000,'raw primary40');
 assert.equal(m.read(m.sym('PIWID')),40);assert.equal(m.read(m.sym('VWID')),40);assert.equal(shadow(m),0);assert.deepEqual(m.violations,[]);
});

test('KS40 PICO version4 keeps width minimum3 ABI5.1 and every public state offset',()=>{
 const {m,table}=fresh();assert.equal(m.sym('PICOVER'),4);assert.equal(m.sym('PICOWVER'),3);
 assert.equal(m.read(m.sym('ABIMAJ')),5);assert.equal(m.read(m.sym('ABIMIN')),1);
 m.write(table+m.sym('PICOVRB'),3);find(m,4,false);assert.equal(find(m,3),table);
 m.write(table+m.sym('PICOVRB'),2);find(m,3,false);find(m,4,false);m.write(table+m.sym('PICOVRB'),5);assert.equal(find(m,4),table);
 for(const [name,value]of Object.entries({PICOREG:16,PICOFIL:18,PICOWR:20,PICORD:22,PICOWID:24,PICOVRB:36,PICOTPD:41,PICOTPS:42,PINT32:0x3000,PINT40:0x3000,PINT80:0x3000,PICOMNT:0x3000,PIR132:0xc0,PIR140:0xd0,PIR180:0xd0,LATCHV:0x40,SYSLAT:0xff,LATEXP:4,LCDCMD:4,LCDDAT:0x84,VDPDAT:0xbe,VDPCTL:0xbf}))assert.equal(m.sym(name),value,name);
 for(const [name,value]of Object.entries({PIWID:14,PIREC:26,PITPD:41,PITPS:42,PIREGP:45,PIROWT:47}))assert.equal(m.sym(name)-m.sym('PIBLK'),value,name);
 const con=Buffer.from(Array.from({length:m.sym('CONWD')-m.sym('CMDCON')},(_,i)=>m.read(m.sym('CMDCON')+i)));
 assert.ok(con.includes(Buffer.from([1,m.sym('TNFIND'),3,0xcd,8,0xc0])));
});

test('KS40 DEMO and VIDMODE retain baseline native bytes and DEMO equals actual TAS media',async()=>{
 for(const [name,length,hash]of [['demo',1191,'7514c21df1dfabe11ddfa5ba94df9a40871f197e3e9b9d2e239c2b4988a9482d'],['vidmode',61,'db1ea487e5cd573149bdfa61853366efefc19e450b0920094ab111dc2ba665df']]){
  const {bytes}=await assembleProgram(root+(name==='demo'?'/programs/DEMO.ASM':'/test/programs/'+name+'.asm'));assert.equal(bytes.length,length);assert.equal(sha(bytes),hash,'exact measured baseline native '+name);
  if(name==='demo')assert.ok(Buffer.from(bytes).equals(readFileSync(root+'/dist/DEMO.COM')),'actual TAS media DEMO');
 }
 // DEMO.ASM's exact text: the page card ships it, comments and all, so a
 // change to any line, not only to the code, must be seen.
 assert.equal(sha(readFileSync(root+'/programs/DEMO.ASM')),'0c8efeeddf6816ad0a9f5e87c8d4f4c1a068eb7a5ef9627bb827fe63f28f85a2');
});
