#!/usr/bin/env node
// Bounded BDOS alternatives. Every tree is an archive; production is untouched.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";
import { ROOT, tree, build, rom, patch } from "./lib/model.mjs";
const BASE="022a4ef", WORK=resolve(ROOT,"build/bdos-model");
const out=process.argv[2]??resolve(WORK,"figures.json");
const sha=b=>createHash("sha256").update(b).digest("hex");
const edit=(d,a,b)=>patch(d,"src/cpm/bdos.asm",a,b);
const prefix=`        LD      HL,(DPBPTR)
        LD      BC,5
        ADD     HL,BC
        LD      C,(HL)
        INC     HL
        LD      B,(HL)
        SRL     B
        RR      C
        SRL     B
        RR      C
        SRL     B
        RR      C
        INC     BC
        LD      HL,(ALVPTR)`;
function length(d){
  edit(d,"ALVSUM: "+prefix.trimStart(),"ALVSUM: CALL    ALVLEN");
  edit(d,"INITALV:\n"+prefix,"ALVLEN:\n"+prefix+"\n        RET\n\nINITALV:\n        CALL    ALVLEN");
}
function sum(d){
  edit(d,`        LD      DE,0
ALVSL:  LD      A,(HL)
        ADD     A,E
        LD      E,A
        JR      NC,ALVS1
        INC     D
ALVS1:  INC     HL
        DEC     BC
        LD      A,B
        OR      C
        JR      NZ,ALVSL
        RET`, `        EX      DE,HL          ; existing SUMDE takes its source in DE
        LD      HL,0
        CALL    SUMDE
        EX      DE,HL          ; sum in DE, pointer past the vector in HL
        RET`);
}
function mask(d){
  edit(d,`RONZ:\tCALL\tDRVMASK\t\t; HL = the drive's bit
        LD      DE,(ROVEC)
        LD      A,L
        AND     E
        LD      L,A
        LD      A,H
        AND     D
        OR      L
\tRET`, `RONZ:   LD      DE,(ROVEC)
        JR      VTEST          ; DRVMASK preserves DE; same mask and Z result`);
}
function random(d){
  edit(d,`        LD      A,C
        AND     $80
        RLCA
        LD      B,A
        LD      A,D
        ADD     A,A
        AND     $1E
        OR      B
        LD      (TARGEX),A`, `        LD      A,C
        RLCA                    ; r0 bit 7 becomes EX bit 0
        LD      A,D
        RLA
        AND     $1F
        LD      (TARGEX),A`);
  edit(d,`        LD      A,D
        SRL     A
        SRL     A
        SRL     A
        SRL     A
        LD      B,A
        LD      A,E
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,A
        OR      B
        AND     $3F
        LD      (TARGS2),A`, `        LD      A,D             ; r2 was proved zero before any FCB write
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        LD      (TARGS2),A`);
}
const variants={incumbent(){},length,sum,mask,random,combined(d){length(d);sum(d);mask(d);random(d);}};
function engine(r){
  const memory=new Uint8Array(65536).fill(0xa5);memory.set(r.image,0xc000);
  const m=createZ80Runtime({memory,startAddress:0},0,{read:()=>255,write(){}});
  const mem=m.hardware.memory, s=n=>r.symbols.get(n), word=(a,v)=>{mem[a]=v&255;mem[a+1]=v>>8;};
  const invoke=(entry,{stop=0x7000,...regs}={})=>{
    word(0x7ffe,0x7000);
    Object.assign(m.cpu,{a:0x3c,b:0x5a,c:0x69,d:0x45,e:0x67,h:0x12,l:0x34,sp:0x7ffe,pc:entry,...regs});
    let cycles=0,low=0x7ffe,n=0;
    while(m.cpu.pc!==stop){assert.ok(++n<2000000,"bounded helper return");cycles+=m.step().cycles;low=Math.min(low,m.cpu.sp);}
    assert.equal(m.cpu.sp,stop===0x7000?0x8000:0x7ffe,"actual helper SP before restoration");
    const c=m.cpu;
    return {a:c.a,bc:c.b<<8|c.c,de:c.d<<8|c.e,hl:c.h<<8|c.l,carry:c.flags.C,z:c.flags.Z,cycles,stack:0x7ffe-low};
  };
  word(s("DPBPTR"),0x1800);word(s("ALVPTR"),0x2000);word(s("PARAM"),0x1100);
  return {m,mem,s,word,invoke};
}
function probes(r){
  const e=engine(r),{mem,s,word,invoke}=e, rows=[];
  let cycles=0,peak=0;
  const put=(kind,key,reading,state)=>{cycles+=reading.cycles;peak=Math.max(peak,reading.stack);rows.push({kind,key,state});};
  const dsms=[0,1,7,8,15,16,127,128,255,256,511,512,1023,1024,2047,2048,4095,4096,65534,65535];
  for(const dsm of dsms)for(const pattern of [0,255,73]){
    word(0x1805,dsm);const n=(dsm>>3)+1;for(let i=0;i<n;i++)mem[0x2000+i]=pattern===73?(i*73+19)&255:pattern;
    const expected=mem.slice(0x2000,0x2000+n).reduce((a,b)=>(a+b)&65535,0);
    const got=invoke(s("ALVSUM"));assert.equal(got.de,expected);assert.equal(got.hl,0x2000+n);assert.equal(got.bc,0);
    put("sum",[dsm,pattern],got,{a:got.a,bc:got.bc,de:got.de,hl:got.hl,carry:got.carry,z:got.z});
  }
  // Exhaustive DSM arithmetic stops before checksumming or clearing memory.
  for(let dsm=0;dsm<65536;dsm++){
    word(0x1805,dsm);const got=invoke(s("ALVSUM"),{stop:s("ALVSUM")+(r.symbols.has("ALVLEN")?3:26)});
    assert.equal(got.bc,(dsm>>3)+1);assert.equal(got.hl,0x2000);cycles+=got.cycles;peak=Math.max(peak,got.stack);
  }
  for(const dsm of dsms){
    word(0x1805,dsm);const n=(dsm>>3)+1;mem.fill(0xa5,0x1fff,0x2000+Math.max(n,2)+1);mem[0x1809]=0xc0;mem[0x180a]=0x05;
    const got=invoke(s("INITALV"));assert.equal(mem[0x1fff],0xa5);assert.equal(mem[0x2000+Math.max(n,2)],0xa5);
    const bytes=[...mem.slice(0x2000,0x2000+Math.max(n,2))];assert.equal(bytes[0],0xc0);assert.equal(bytes[1],5);assert.ok(bytes.slice(2).every(x=>x===0));put("init",dsm,got,bytes);
  }
  const vectors=[0,65535,...Array.from({length:16},(_,i)=>1<<i),...Array.from({length:16},(_,i)=>65535^(1<<i))];
  for(let drive=0;drive<16;drive++)for(const vector of vectors){
    mem[s("CURDRV")]=drive;word(s("ROVEC"),vector);const got=invoke(s("RONZ"));assert.equal(Boolean(got.z),!(vector&(1<<drive)));put("mask",[drive,vector],got,{a:got.a,bc:got.bc,de:got.de,hl:got.hl,carry:got.carry,z:got.z});
  }
  for(let record=0;record<65536;record++){
    mem.fill(0,0x1100,0x1124);mem[0x110c]=(record>>7)&31;mem[0x110e]=(record>>12)&63;mem[0x1121]=record&255;mem[0x1122]=record>>8;
    const got=invoke(s("RANDPREP"));assert.equal(got.a,0);assert.equal(Boolean(got.carry),false);assert.equal(mem[s("TARGEX")],(record>>7)&31);assert.equal(mem[s("TARGS2")],record>>12);assert.equal(mem[0x1120],record&127);
    cycles+=got.cycles;peak=Math.max(peak,got.stack);
  }
  for(const record of [0,127,128,4095,4096,65535])for(const r2 of [1,2,127,128,255]){
    mem.fill(0x39,0x1100,0x1124);mem[0x1121]=record&255;mem[0x1122]=record>>8;mem[0x1123]=r2;const before=mem.slice(0x1100,0x1124);
    const got=invoke(s("RANDPREP"));assert.equal(got.a,6);assert.equal(Boolean(got.carry),true);assert.deepEqual(mem.slice(0x1100,0x1124),before);put("overflow",[record,r2],got,{a:got.a,carry:got.carry,fcb:[...before]});
  }
  return {rows,cycles,peak,counts:{dsm:65536,checksum:60,initialize:20,masks:544,random:65536,overflow:30}};
}
mkdirSync(WORK,{recursive:true});const result={baseline:BASE,runnerSha256:sha(readFileSync(new URL(import.meta.url))),variants:{}};let reference;
for(const name of (process.env.BDOS_VARIANTS??Object.keys(variants).join(",")).split(",")){
  console.error(`BDOS model: ${name}`);const dir=tree(WORK,name,BASE);variants[name](dir);await build(dir);const r=rom(dir);
  if(name==="incumbent")assert.equal(sha(r.image),"ab2d0c6b8a8d5d36ad3c51af3ef22cfb166890cc412f51bb9352b7a80cb27ed6");
  const p=probes(r);reference??=p;assert.deepEqual(p.rows,reference.rows,`${name}: helper observations`);
  const d8=JSON.parse(readFileSync(resolve(dir,"build/tecos/tecos.d8.json"))),kinds={};for(const x of d8.files["cpm/bdos.asm"].segments)kinds[x.kind]=(kinds[x.kind]??0)+x.end-x.start;
  result.variants[name]={rom:r.census.rom.used,sha256:sha(r.image),bdos:kinds,ram:r.symbols.get("BDOSRME")-r.symbols.get("BDOSRAM"),stack:r.symbols.get("STKTOP")-r.symbols.get("STKBASE"),tpa:r.census.ram.tpa.bytes,probes:{equivalent:true,counts:p.counts,cycles:p.cycles,peak:p.peak},delta:r.census.rom.used-(result.variants.incumbent?.rom??r.census.rom.used)};
  writeFileSync(out,JSON.stringify(result,null,2)+"\n");
}
console.log(JSON.stringify(result,null,2));
