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
 assert.equal(sha(raw),"b886676a13d5a3f7de57d765acbc00bd0b1c025d1c913125d013ff56cc396eb3");
 assert.equal(derived.length,5252);
 assert.equal(sha(derived),"f0b82774290550b9ad6824fcc42b49543df9da90513f99b338cef84f0f1eb0c0");
 const after=derived.toString("latin1").split("\n");
 assert.equal(after.length,lines.length);
 assert.deepEqual(lines.filter((line,i)=>line!==after[i]).map(line=>Number(line.split(" ")[0])),[40,50,170]);
 const cpm=Buffer.from(derived.toString("latin1").replace(/\n/g,"\r\n")+"\x1a","latin1");
 assert.equal(cpm.length,5368);
 assert.equal(sha(cpm),"4d0bbdd86d0ae06a02ab86c286aa571a4cdec3247c6c1f17b8f61dcc95a58328");
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
