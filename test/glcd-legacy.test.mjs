import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {boot,fcbType,standardCard,volume} from "./lib/fixtures.mjs";

const fixture=new URL("./fixtures/glcd-abi51/",import.meta.url);
const legacy=readFileSync(new URL("GLCD.SVC",fixture));
const provenance=JSON.parse(readFileSync(new URL("provenance.json",fixture)));
const word=(m,at)=>m.read(at)|(m.read(at+1)<<8);

function installedState(m){
 return {
  entry:word(m,6),ceiling:word(m,m.sym("PZTOP")),
  owner:m.read(m.sym("SVCHEAD")),generation:m.read(m.sym("SVCGEN")),
  registry:word(m,m.sym("REGHEAD")),shell:word(m,m.sym("SHOWN")),
  glcd:word(m,m.sym("GLVEC")),glcdPresent:m.read(m.sym("CONDEV"))&4,
  ioByte:m.read(3),mode:m.read(m.sym("CONMOD")),
  geometry:word(m,m.sym("VWID")),claim:m.read(m.sym("VCLAIM")),
    vectors:Array.from({length:14},(_,i)=>m.read(m.sym("VPUTV")+i)),
    bios:Array.from({length:m.sym("BIOSLEN")},(_,i)=>m.read(m.sym("RAMBIOS")+i)),
 };
}

test("FL-24 older GLCD fixture is the pinned ABI 5.1 distribution artifact",()=>{
 assert.equal(legacy.length,836);
 const hash=createHash("sha256").update(legacy).digest("hex");
 assert.equal(hash,"ac040f75f8d91226fd80ff9be1764673dec0ec5cde606769425bd815fb75e736");
 assert.equal(provenance.artifact.bytes,legacy.length);
 assert.equal(provenance.artifact.sha256,hash);
});

// Preserve the console already selected
// on each board. The no-PICO case uses
// serial before LCD integration and the
// LCD after it. No new driver is loaded
// by the startup file.
for(const tms of[true,false]){
 test(`FL-24 ABI 5.1 GLCD rejection preserves pages, hooks and console with PICO ${tms?"present":"absent"}`,()=>{
  const image=standardCard(),a=volume(image,"A");
  a.write("GLCD.SVC",legacy);
  a.write("STARTUP.CMD",Buffer.from([0x1a]));
  a.write("CANARY.TXT",Buffer.from("CONSOLE STILL WORKS\r\n\x1a","latin1"));
  const m=boot(image,{tms,matrix:true,width:40,glcd:true});
  assert.equal(m.read(0xc007),4,"the target ROM is ABI 5.4");
  assert.equal(word(m,m.sym("GLVEC")),0,"no GLCD hook before the attempt");
  const before=installedState(m),calls=[];
  const step=m.step.bind(m);
  m.step=()=>{
   if(m.pc===m.sym("SVCDSP")&&m.read(m.sym("SVCBSY"))===0x80)calls.push(m.cpu.cpu.c);
   return step();
  };
  for(let attempt=0;attempt<2;attempt++){
   const start=calls.length;
   assert.match(m.command("GLCD.SVC",{maxCycles:80_000_000}),/GLCD\.SVC\?/);
   assert.equal(fcbType(m),"SVC","the command reached the service loader");
   assert.deepEqual(calls.slice(start),[15],"INIT stops at the retired font service before publishing a hook");
   assert.equal(m.read(m.sym("SVCRC")),1,"failed INIT released its pages");
   assert.equal(m.read(m.sym("SVCRA")),1,"INIT returned TNEBAD from TNFONT");
   assert.equal(m.read(m.sym("SVCBSY")),0,"the callback window is closed");
   assert.deepEqual(installedState(m),before,"no allocation, registry or console change");
   assert.match(m.command("TYPE CANARY.TXT"),/CONSOLE STILL WORKS/);
   assert.match(m.command("DIR"),/CANARY/);
   assert.deepEqual(installedState(m),before,"the prompt remains usable without retaining pages");
  }
  assert.deepEqual(m.violations,[]);
 });
}
