#!/usr/bin/env node
// Differential public CALL 0005h proof. Observe real return control before
// restoring the host's paused CCP, and distinguish fatal exits from returns.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, rom } from "./lib/model.mjs";
import { Machine } from "../host/machine.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";
const dirs=[process.argv[2]??resolve(ROOT,"build/bdos-model/incumbent"),process.argv[3]??resolve(ROOT,"build/bdos-model/combined")];
const output=process.argv[4]??resolve(ROOT,"build/bdos-public.json");
const FCB=0x1100,DMA=0x2000,STACK=0x8000,RETURN=0x108;
const sha=b=>createHash("sha256").update(b).digest("hex");
const volume=(image,drive)=>{const v=findVolume(parseContainer(image),drive);return new CpmVolume(volumePayload(image,v),v.g,{readOnly:false});};
const bytes=(m,a,n)=>Array.from({length:n},(_,i)=>m.read(a+i));
const word=(m,a)=>m.read(a)|(m.read(a+1)<<8);
const pattern=n=>Uint8Array.from({length:128},(_,i)=>(n*131+i*7+1)&255);
function card(){return createContainer([{geometry:"G1M",label:"SYSTEM",mount:"A"},{geometry:"G8M",label:"WORK",mount:"B"}]);}
function boot(r,image){const m=new Machine({rom:r.image,symbols:r.symbols,sdImage:image,glcd:false,clock:new Date(2026,0,1)});m.runUntil(()=>m.ready()&&/A>$/.test(m.text()),200000000,"initial prompt");return m;}
function setup(m,drive,name="RANDOM  DAT"){
  m.write(FCB-1,0xa5);m.write(FCB+36,0x5a);m.write(DMA-1,0x96);m.write(DMA+128,0x69);
  [drive,...Buffer.from(name),...new Array(24).fill(0)].forEach((v,i)=>m.write(FCB+i,v));
}
function random(m,n){for(let i=0;i<3;i++)m.write(FCB+33+i,n>>>(8*i)&255);}
function writeDma(m,n){pattern(n).forEach((v,i)=>m.write(DMA+i,v));}
function call(m,fn,de=FCB,{fatal}={}){
  const c=m.cpu.cpu,saved={pc:c.pc,sp:c.sp};
  [0x0e,fn,0x11,de&255,de>>8,0xcd,5,0,0x76].forEach((v,i)=>m.write(0x100+i,v));
  Object.assign(c,{pc:0x100,sp:STACK,a:0x5a,h:0x37,l:0x42,b:0x69});
  const from=m.output.length,start=m.cycles;
  m.runUntil(()=>m.pc===RETURN||(fatal&&m.waitingForInput()&&fatal.test(m.text(from))),400000000,`BDOS ${fn} public return or expected fatal error`);
  let row;
  if(m.pc===RETURN){
    assert.equal(c.sp,STACK,"guest CALL restored its actual SP");assert.equal(c.a,c.l,"A=L return convention");assert.equal(c.b,c.h,"B=H return convention");
    row={fn,outcome:"return",a:c.a,hl:c.h<<8|c.l,b:c.b,pc:m.pc,sp:c.sp};
    Object.assign(c,saved);
  }else{
    assert.ok(fatal,"only an explicitly expected error can abandon the caller");
    m.type("\r");m.runUntil(()=>m.ready()&&m.read(m.sym("CHPOS"))===0&&/A>$/.test(m.text(from)),400000000,"prompt after fatal BDOS exit");
    row={fn,outcome:"fatal",error: m.text(from)};
  }
  assert.equal(m.read(FCB-1),0xa5);assert.equal(m.read(FCB+36),0x5a);assert.equal(m.read(DMA-1),0x96);assert.equal(m.read(DMA+128),0x69);
  return {...row,fcbs:bytes(m,FCB,36),dma:bytes(m,DMA,128),driveUser:m.read(4),curDma:word(m,m.sym("CURDMA")),login:word(m,m.sym("LOGINV")),readOnly:word(m,m.sym("ROVEC")),cycles:m.cycles-start};
}
function observeStack(m){
  const top=m.sym("STKTOP"),base=m.sym("STKBASE"),step=m.step.bind(m);let peak=0;
  m.step=()=>{const sp=m.cpu.cpu.sp;if(sp>=base&&sp<=top)peak=Math.max(peak,top-sp);return step();};
  return ()=>peak;
}
function roundtrip(r){
  const image=card(),m=boot(r,image),peak=observeStack(m),rows=[];
  const run=(fn,de,opts)=>{const x=call(m,fn,de,opts);rows.push(x);return x;};
  setup(m,1);run(26,DMA);
  for(const drive of [1,2]){
    setup(m,drive);assert.notEqual(run(22).a,255);
    for(const n of [0,127,128,4095,4096,65535]){random(m,n);writeDma(m,n);assert.equal(run(n===4096?40:34).a,0);}
    assert.notEqual(run(16).a,255);
    setup(m,drive);assert.equal(run(35).a,255);assert.deepEqual(bytes(m,FCB+33,3),[0,0,1]);
    setup(m,drive);assert.notEqual(run(15).a,255);
    for(const n of [65535,4096,4095,128,127,0]){random(m,n);assert.equal(run(33).a,0);assert.deepEqual(bytes(m,DMA,128),[...pattern(n)]);}
    run(36);
    for(const fn of [33,34,40]){random(m,0x10000);const before=bytes(m,FCB,36),dm=bytes(m,DMA,128),disk=sha(image);assert.equal(run(fn).a,6);assert.deepEqual(bytes(m,FCB,36),before);assert.deepEqual(bytes(m,DMA,128),dm);assert.equal(sha(image),disk);}
    // A different, never-created extent forces RANDOPEN/RANDMISS.
    random(m,1024);assert.equal(run(33).a,4);
  }
  // Distinct user areas survive the same random I/O and publication paths.
  for(const user of [5,31]){
    run(32,user);setup(m,1,"USER    DAT");assert.notEqual(run(22).a,255);
    random(m,128);writeDma(m,user);assert.equal(run(34).a,0);assert.notEqual(run(16).a,255);
    setup(m,1,"USER    DAT");assert.equal(run(35).a,255);assert.deepEqual(bytes(m,FCB+33,3),[129,0,0]);
    assert.notEqual(run(15).a,255);random(m,128);assert.equal(run(33).a,0);assert.deepEqual(bytes(m,DMA,128),[...pattern(user)]);
    run(36);assert.deepEqual(bytes(m,FCB+33,3),[128,0,0]);
  }
  run(32,0);
  // A never-opened, non-existent extent cannot be closed before RANDOPEN.
  setup(m,1,"ABSENT  DAT");random(m,128);assert.equal(run(33).a,3);
  // Read-only file errors precede r2 overflow. Function30 can clear the bit.
  setup(m,1);assert.notEqual(run(15).a,255);m.write(FCB+9,m.read(FCB+9)|128);run(30);
  random(m,0x10000);const disk=sha(image);assert.equal(run(34,FCB,{fatal:/File R\/O/}).outcome,"fatal");assert.equal(sha(image),disk);
  setup(m,1);m.write(FCB+9,m.read(FCB+9)&127);run(30);run(28,0);random(m,0x10000);assert.equal(run(40,FCB,{fatal:/Bdos Err On A: R\/O/}).outcome,"fatal");
  assert.deepEqual(m.violations,[]);assert.ok(peak()<=40,"BDOS keeps a quarter of54 bytes free");
  m.cpu.cpu.pc=0;m.runUntil(()=>m.ready()&&/A>$/.test(m.text()),400000000,"flush warm boot");
  const reopen=boot(r,image.slice());setup(reopen,1);const size=call(reopen,35);
  const files=["A","B"].map(d=>({drive:d,files:volume(image,d).list().map(f=>({...f,hash:sha(volume(image,d).read(f.name,{user:f.user}))}))}));
  return {rows,peak:peak(),cardHash:sha(image),files,reopenedSize:size.fcbs.slice(33),reopenedOutput:reopen.text()};
}
function fullDirectory(r){
  const image=card(),a=volume(image,"A");for(let i=1;i<a.entries;i++)a.write(`F${i}.DAT`,new Uint8Array());
  const m=boot(r,image),peak=observeStack(m),rows=[];setup(m,1);rows.push(call(m,26,DMA));assert.notEqual(call(m,22).a,255);
  random(m,128);writeDma(m,128);const failed=call(m,34);rows.push(failed);assert.equal(failed.a,5,"random extent creation reports full directory");
  assert.deepEqual(m.violations,[]);assert.ok(peak()<=40,"full-directory path retains BDOS stack headroom");return {rows,peak:peak(),cardHash:sha(image)};
}
function allocationWorkload(r){
  const image=card();
  for(const drive of ["A","B"]){const v=volume(image,drive);for(let i=0;i<16;i++)v.write(`WALK${String(i).padStart(4,"0")}.DAT`,new Uint8Array(4096).fill(i+1));}
  const m=boot(r,image),peak=observeStack(m),rows=[];setup(m,1);
  rows.push(call(m,13,0)); // Full A directory scan and allocation reconstruction.
  rows.push(call(m,14,1)); // First B login: full word-allocation directory scan.
  for(const drive of [1,2]){setup(m,drive,"WALK????DAT");const row=call(m,19);assert.notEqual(row.a,255);rows.push(row);}
  m.cpu.cpu.pc=0;m.runUntil(()=>m.ready()&&/A>$/.test(m.text()),400000000,"flush after wildcard erase");
  assert.deepEqual(m.violations,[]);assert.ok(peak()<=40);
  for(const drive of ["A","B"])assert.deepEqual(volume(image,drive).list(),[]);
  return {rows,peak:peak(),cardHash:sha(image)};
}
const result={romHashes:dirs.map(d=>sha(rom(d).image)),cases:{}};
for(const [name,fn]of Object.entries({roundtrip,fullDirectory,allocationWorkload})){
  const pair=dirs.map(d=>fn(rom(d)));const semantics=x=>({...x,peak:undefined,rows:x.rows.map(({cycles,...row})=>row)});
  assert.deepEqual(semantics(pair[1]),semantics(pair[0]),name);result.cases[name]={equivalent:true,reference:pair[0],candidate:pair[1]};
  writeFileSync(output,JSON.stringify(result,null,2)+"\n");console.error(`${name}: equivalent`);
}
console.log(JSON.stringify(result,null,2));
