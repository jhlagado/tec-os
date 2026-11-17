// Paired native game timing; ordinary commands only, without state pokes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ROOT,boot,volume} from '../test/lib/fixtures.mjs';
const [baseline,candidate,output]=process.argv.slice(2);
assert.ok(output,'usage: BASELINE.COM CANDIDATE.COM REPORT.json');
const commands=['take compass','inventory','north','west','west','south','west','take sword','inventory','east','north','west','north','east','east','look'];
function run(path){
 const image=new Uint8Array(fs.readFileSync(ROOT+'/dist/starter.img'));volume(image,'A').write('CAVBASIC.COM',fs.readFileSync(path));
 const bytes=fs.readFileSync(path);let context;
 for(let i=0;i<bytes.length-13;i++)if(bytes[i]===0xed&&bytes[i+1]===0x53&&bytes[i+4]===0xed&&bytes[i+5]===0x43&&bytes[i+8]===0xc9&&bytes.readUInt16LE(i+6)===bytes.readUInt16LE(i+2)+2)context=bytes.readUInt16LE(i+2);
 assert.ok(context,'source recorder context');
 const m=boot(image,{tms:true,matrix:true,width:80});let gcCalls=0;const step=m.step.bind(m);m.step=()=>{const gc=m.read(context+22)|m.read(context+23)<<8;if(gc>0&&m.pc===gc)gcCalls++;return step();};
 function keys(cmd){const mark=m.output.length,start=m.cycles,gcStart=gcCalls;m.enqueueInput(cmd+'\r','matrix');m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&((m.waitingForInput()&&m.text().endsWith('? '))||m.ready());},500000000,cmd);return {command:cmd,cycles:m.cycles-start,gcCalls:gcCalls-gcStart,output:m.text(mark)};}
 const startup=keys('cavbasic');const events=commands.map(keys);assert.deepEqual(m.violations,[]);return {startup,events,totalGarbageCollections:events.reduce((n,e)=>n+e.gcCalls,0),totalCommandCycles:events.reduce((n,e)=>n+e.cycles,0)};
}
const a=run(baseline),b=run(candidate);assert.equal(a.startup.output,b.startup.output);assert.deepEqual(a.events.map(e=>e.output),b.events.map(e=>e.output));
const result={baseline:a,candidate:b,commandCycleIncrease:b.totalCommandCycles-a.totalCommandCycles,commandPercentIncrease:100*(b.totalCommandCycles/a.totalCommandCycles-1),scope:'Native TEC-OS console command-to-prompt timings; includes console and OS work. No combat or clock-seed equivalence claim.'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({baselineCycles:a.totalCommandCycles,candidateCycles:b.totalCommandCycles,percentIncrease:result.commandPercentIncrease}));
