import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {adaptBounce,bounceSource} from "../tools/lib/bounce-source.mjs";
import {pinnedBytes} from "../tools/lib/pins.mjs";

const root=new URL("../",import.meta.url).pathname;
const raw=pinnedBytes(root,"BOUNCE.BAS");
const sha=b=>createHash("sha256").update(b).digest("hex");
const lines=raw.toString("latin1").split("\n");

test("starter BOUNCE adapts only its three font lines and retains separate source and CP/M pins",()=>{
 const before=Buffer.from(raw),derived=bounceSource(root);
 assert.equal(sha(raw),"615693a55fb29fd9fd831836443461f82fddca65ae983337e52ecae5b529744c");
 assert.equal(derived.length,5254);
 assert.equal(sha(derived),"7ef3b301377f3bcf0d3e040da44af40f6873054953542329297ec62f94f1f42e");
 const after=derived.toString("latin1").split("\n");
 assert.equal(after.length,lines.length);
 assert.deepEqual(lines.filter((line,i)=>line!==after[i]).map(line=>Number(line.split(" ")[0])),[40,50,170]);
 const cpm=Buffer.from(derived.toString("latin1").replace(/\n/g,"\r\n")+"\x1a","latin1");
 assert.equal(cpm.length,5370);
 assert.equal(sha(cpm),"9d9092748d11be539c86e79ba591849191540812c4342f601ac9c1de065fc0d6");
 assert.deepEqual(raw,before,"the upstream bytes stay intact");
});

test("BOUNCE adaptation rejects missing, changed and duplicated complete lines before producing output",()=>{
 for(const number of[40,50,170]){
  const line=lines.find(s=>s.startsWith(number+" "));
  for(const change of["",line+" ",line+"\n"+line]){
   const bytes=Buffer.from(raw.toString("latin1").replace(line,change),"latin1"),before=Buffer.from(bytes);
   assert.throws(()=>adaptBounce(bytes),new RegExp("exactly one complete line "+number));
   assert.deepEqual(bytes,before,"rejected input stays intact");
  }
 }
 for(const bytes of[Buffer.from(raw.toString("latin1").replace(/\n/g,"\r\n"),"latin1"),Buffer.concat([raw,Buffer.from([0x1a])])]){
  assert.throws(()=>adaptBounce(bytes),/LF text without a CP\/M terminator/);
 }
});

test("starter BOUNCE checks the whole upstream input before adapting matching font lines",()=>{
 const dir=mkdtempSync(join(tmpdir(),"bounce-source-"));
 const selected=process.env.BOUNCE_BAS;
 try{
  delete process.env.BOUNCE_BAS;
  mkdirSync(join(dir,"test"));mkdirSync(join(dir,".inputs"));
  const entry=JSON.parse(readFileSync(new URL("../test/inputs.json",import.meta.url))).inputs["BOUNCE.BAS"];
  writeFileSync(join(dir,"test/inputs.json"),JSON.stringify({inputs:{"BOUNCE.BAS":entry}}));
  const changed=Buffer.from(raw);changed[0]^=1;
  writeFileSync(join(dir,".inputs/BOUNCE.BAS"),changed);
  assert.throws(()=>bounceSource(dir),/has sha256/);
  assert.deepEqual(readFileSync(join(dir,".inputs/BOUNCE.BAS")),changed);
 }finally{
  if(selected===undefined)delete process.env.BOUNCE_BAS;else process.env.BOUNCE_BAS=selected;
  rmSync(dir,{recursive:true,force:true});
 }
});
