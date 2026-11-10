#!/usr/bin/env node
// Paired bounded helper proof; no disk/BIOS or full-system claim.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createZ80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';
import { ROOT, rom } from './lib/model.mjs';
const dirs=process.argv.slice(2,4);assert.equal(dirs.length,2,'incumbent and candidate artifact directories required');
const output=process.argv[4]??resolve(ROOT,'build/bdos-extra-proof.json');
const hash=x=>createHash('sha256').update(x).digest('hex');
const FCB=0x1100,DPB=0x1800,ALV=0x2000,DIR=0x3000,TOP=0x8000,STOP=0x7000;
function engine(r,mutation){
 const memory=new Uint8Array(65536).fill(0xa5);memory.set(r.image,0xc000);
 const rt=createZ80Runtime({memory,startAddress:0},0,{read:()=>255,write(){}}),mem=rt.hardware.memory;
 const s=n=>{const a=r.symbols.get(n);assert.ok(Number.isInteger(a),`missing symbol ${n}`);return a;};
 const word=(a,v)=>{mem[a]=v&255;mem[a+1]=v>>>8&255;};
 const wordAt=a=>mem[a]|mem[a+1]<<8;
 word(s('PARAM'),FCB);word(s('DPBPTR'),DPB);word(s('ALVPTR'),ALV);word(s('DIRPTR'),DIR);word(s('MATCHPTR'),DIR);
 // A mutation either patches the image once, or patches it only while the
 // routine it names runs, so a shared instruction can be charged to one caller.
 if(mutation&&!mutation.during)mutation.patch({mem,s});
 // A BDOS function runs on BENTRY's frame: OLDSP holds the program's return
 // and the first word on the BDOS stack is RETA, which a function may reach
 // by RET. Other routines return straight to STOP.
 function invoke(name,regs={},bdos=false){
  word(TOP-2,STOP);word(s('OLDSP'),TOP-2);
  const sp=bdos?TOP-4:TOP-2;if(bdos)word(TOP-4,s('RETA'));
  const patched=mutation?.during===name?mem.slice(0xc000):null;if(patched)mutation.patch({mem,s});
  Object.assign(rt.cpu,{a:0x3c,b:0x5a,c:0x69,d:0x45,e:0x67,h:0x12,l:0x34,sp,pc:s(name),...regs});
  let cycles=0,low=sp,n=0;
  while(rt.cpu.pc!==STOP){if(++n>100000)throw new Error(`infrastructure: ${name} did not return`);cycles+=rt.step().cycles;low=Math.min(low,rt.cpu.sp);}
  if(patched)mem.set(patched,0xc000);
  const c=rt.cpu;assert.equal(c.sp,TOP,`semantic: ${name} returned SP`);
  return {a:c.a,hl:c.h<<8|c.l,de:c.d<<8|c.e,bc:c.b<<8|c.c,b:c.b,carry:c.flags.C,z:c.flags.Z,sp:c.sp,pc:c.pc,cycles,peakBytes:TOP-low};
 }
 return {mem,s,word,wordAt,invoke};
}
const semantic=(actual,expected,label)=>assert.deepEqual(actual,expected,`semantic: ${label}`);
function proof(r,mutation){
 const e=engine(r,mutation),{mem,s,word,wordAt,invoke}=e,rows=[],stats={};
 const add=(kind,key,got,state)=>{const st=stats[kind]??={calls:0,cycles:0,peakBytes:0,actualReturnSP:TOP};st.calls++;st.cycles+=got.cycles;st.peakBytes=Math.max(st.peakBytes,got.peakBytes);rows.push({kind,key,state});};
 // All CP/M allocation widths/EXM values derived from legal BSH3..7,
 // and both sides of logical-extent and sequential-record boundaries.
 for(const wide of [false,true])for(let bsh=3;bsh<=7;bsh++){
  if(wide&&bsh===3)continue;
  const exm=(1<<(bsh-(wide?4:3)))-1;
  mem[DPB+2]=bsh;mem[DPB+4]=exm;word(DPB+5,wide?1023:63);
  for(const ex of [0,1,exm,exm+1,31,255])for(const cr of [0,1,126,127]){
   mem[FCB+12]=ex;mem[s('SEQREC')]=cr;
   const got=invoke('FCBADDR'),index=((ex&exm)*128+cr)>>>bsh;
   semantic(got.hl,FCB+16+index*(wide?2:1),'FCBADDR destination');
   add('fcbaddr',[wide,bsh,exm,ex,cr],got,{hl:got.hl,de:got.de,carry:got.carry,z:got.z,sp:got.sp});
  }
 }
 // Fn36 runs its actual RETZERO/RETA/OLDSP return, not a stop before epilogue.
 // DISPATCH enters it with DE=PARAM, the FCB.
 for(const ex of [0,1,2,31,32,255])for(const s2 of [0,1,15,16,63,64,128,255])for(const cr of [0,127,128,255]){
  mem.fill(0x96,FCB-1,FCB+37);mem[FCB+12]=ex;mem[FCB+14]=s2;mem[FCB+32]=cr;
  const before=mem.slice(FCB-1,FCB+37),value=(((s2&63)*32+(ex&31))*128+cr);
  const got=invoke('FNSETRR',{d:FCB>>>8,e:FCB&255},true),expected=before.slice();for(let i=0;i<3;i++)expected[34+i]=value>>>(8*i)&255;
  semantic([...mem.slice(FCB-1,FCB+37)],[...expected],'fn36 full FCB and canaries');semantic([got.a,got.hl,got.b],[0,0,0],'fn36 return');
  add('setrr',[ex,s2,cr],got,{fcb:[...mem.slice(FCB-1,FCB+37)],a:got.a,hl:got.hl,b:got.b,sp:got.sp});
 }
 // Isolate fn35 publication from its directory search. Public file-size search
 // and persisted-file semantics belong to the separate public proof.
 for(const value of [0,255,256,65535,65536,0x123456,0xffffff]){
  mem.fill(0x69,FCB-1,FCB+37);const expected=mem.slice(FCB-1,FCB+37);
  for(let i=0;i<3;i++){mem[s('FSIZE0')+i]=value>>>(8*i)&255;expected[34+i]=value>>>(8*i)&255;}
  const got=invoke('SIZEDONE',{},true);semantic([...mem.slice(FCB-1,FCB+37)],[...expected],'fn35 publication and canaries');semantic([got.a,got.hl,got.b],[255,255,0],'fn35 return');
  add('size-publication',value,got,{fcb:[...expected],a:got.a,hl:got.hl,b:got.b,sp:got.sp});
 }
 for(const dsm of [63,1023])for(const deleted of [[],[0],[1,3],[0,1,2,3]]){
  const wide=dsm>255,n=(dsm>>3)+1,lists=[ [0,1,0,2,2,dsm,dsm+1], [3,0,wide?257:4,dsm], [0,0,0], [0,0,0] ];
  // The last valid cell must carry a unique live block: truncating either
  // the byte or word loop must alter both marking and clearing outcomes.
  const cells=wide?8:16;while(lists[0].length<cells)lists[0].push(0);lists[0][cells-1]=wide?513:7;
  word(DPB+5,dsm);mem.fill(0,DIR,DIR+128);mem.fill(0,ALV,ALV+n);mem[ALV-1]=0x96;mem[ALV+n]=0x69;
  const expected=new Uint8Array(n);
  for(let j=0;j<4;j++){
   mem[DIR+j*32]=deleted.includes(j)?0xe5:0;
   lists[j].forEach((block,i)=>{const a=DIR+j*32+16+i*(wide?2:1);if(wide)word(a,block);else mem[a]=block;});
   if(!deleted.includes(j))for(const b of lists[j])if(b>0&&b<=dsm)expected[b>>>3]|=0x80>>>(b&7);
  }
  word(s('DIRCNT'),9);word(s('DIRUSED'),5);
  const got=invoke('PARDIR'),last=[0,1,2,3].filter(j=>!deleted.includes(j)).at(-1);
  semantic([...mem.slice(ALV,ALV+n)],[...expected],'PARDIR vector');semantic([wordAt(s('DIRCNT')),wordAt(s('DIRUSED')),wordAt(s('ENTPTR'))],[13,last===undefined?5:10+last,DIR+128],'PARDIR entry bookkeeping');semantic([mem[ALV-1],mem[ALV+n]],[0x96,0x69],'walker vector canaries');
  add('pardir',[dsm,deleted],got,{vector:[...expected],dircnt:wordAt(s('DIRCNT')),dirused:wordAt(s('DIRUSED')),sp:got.sp});
  // Erasure clears each listed valid bit, with duplicate/zero/invalid cells,
  // and a second erase is idempotent. Other bits remain set.
  mem.fill(255,ALV,ALV+n);const cleared=new Uint8Array(n).fill(255);word(s('MATCHPTR'),DIR);
  for(const b of lists[0])if(b>0&&b<=dsm)cleared[b>>>3]&=~(0x80>>>(b&7));
  for(let repeat=0;repeat<2;repeat++){
   const out=invoke('FREEENT');semantic([...mem.slice(ALV,ALV+n)],[...cleared],'FREEENT clear/idempotence');semantic([mem[ALV-1],mem[ALV+n]],[0x96,0x69],'FREEENT canaries');add('freeent',[dsm,deleted,repeat],out,{vector:[...cleared],sp:out.sp});
  }
 }
 return {rows,stats};
}
const artifacts=dirs.map(rom);
for(const name of ['PUBRR','PARCELL','FREECELL','ENTCNT','ENTCELL','CLRBLK'])assert.ok(artifacts[1].symbols.has(name),`mandatory candidate symbol ${name}`);
const pair=artifacts.map(r=>proof(r));semantic(pair[1].rows,pair[0].rows,'paired required observations');
const controls=[];
function mutate(label,symbol,offset,expected,replacement,during){
 const r=artifacts[1];assert.ok(r.symbols.has(symbol),`mandatory control symbol ${symbol}`);
 let rejected=false;
 const patch=({mem,s})=>{assert.equal(mem[s(symbol)+offset],expected,'infrastructure: mutation opcode');mem[s(symbol)+offset]=replacement;};
 try{proof(r,{patch,during});}
 catch(error){if(error.code==='ERR_ASSERTION'&&error.message.startsWith('semantic:'))rejected=true;else throw error;}
 assert.ok(rejected,`negative control escaped: ${label}`);controls.push({label,rejected:true});
}
// Real candidate instruction mutations; only an expected semantic assertion
// earns credit. Missing symbols, bad opcodes and timeouts remain setup failures.
mutate('publisher omitted third byte','PUBRR',9,3,2);
mutate('publisher wrong destination','PUBRR',4,33,32);
// ENTCELL and ENTCNT are shared by both walkers. Each control patches the
// shared code only while the walker it is charged to runs, so that walker
// must catch it on its own: PARDIR for the mark side, FREEENT for clear.
mutate('walker wrong byte stride','ENTCELL',3,0x23,0,'PARDIR');
mutate('walker wrong high byte','ENTCELL',9,0x56,0x14,'PARDIR');
// ENTCNT's count initializer selects A=8 for word maps; reducing that
// immediate skips the distinct final cell while still returning normally.
mutate('mark truncated word count','ENTCN1',-1,8,7,'PARDIR');
mutate('clear truncated word count','ENTCN1',-1,8,7,'FREEENT');
mutate('clear without complemented mask','CLRBLK',4,0x2f,0);
assert.equal(controls.length,7,'all required negative controls executed');
assert.ok(controls.every(c=>c.rejected===true),'all required controls caught semantically');
const result={kind:'paired pure-helper proof; actual OLDSP return for fn35 publication/fn36; no BIOS/disk proof',romHashes:artifacts.map(r=>hash(r.image)),equivalent:true,observations:pair[0].rows.length,stats:{incumbent:pair[0].stats,candidate:pair[1].stats},negativeControls:controls};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
