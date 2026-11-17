// Observe vector restoration before warm boot can clear stale jumps.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROOT,boot,volume,startupFile} from './lib/fixtures.mjs';
const vectors=m=>Array.from({length:6},(_,i)=>Array.from({length:3},(_,j)=>m.read(8+i*8+j)));
function drive(m,text,done){
 const mark=m.output.length;m.enqueueInput(text,"matrix");
 m.runUntilChecked(()=>{m.pumpInput();return !m.pending?.length&&done();},500_000_000,text);
 return m.text(mark);
}
// Matrix code 3 is the up arrow; press the actual Ctrl+C chord instead.
function ctrlC(m){
 m.tec1g.applyMatrixKey(0,1,true);m.tec1g.applyMatrixKey(4,6,true);
 m.runUntilChecked(()=>m.read(m.sym('KBLAST'))===38,100_000_000,'Ctrl+C key');
 m.tec1g.applyMatrixKey(4,6,false);m.tec1g.applyMatrixKey(0,1,false);
 m.runUntilChecked(()=>m.read(m.sym('KBLAST'))===255,100_000_000,'Ctrl+C release');
}
for(const mode of ['input','paused FF output'])test('Baza gives restart vectors back before warm boot after Ctrl-C in '+mode,{timeout:120000},()=>{
 const image=new Uint8Array(readFileSync(ROOT+'/dist/starter.img')),a=volume(image,'A');
 a.write('STARTUP.CMD',startupFile('SHELL.SVC','GLCD.SVC'));
 a.write('BREAKIN.BAS',Buffer.from(mode==='input'?'10 INPUT a$\n20 PRINT a$\n':'10 PRINT CHR$(255);\n20 GOTO 10\n'),{text:true});
 const m=boot(image,{matrix:true});
 assert.notEqual(m.read(m.sym('SVCHEAD')),0,'shell service loaded');
 const original=vectors(m),exits=[];
 const step=m.step.bind(m);m.step=()=>{
  if(!exits.length&&(m.pc===0||m.pc===m.sym('WBOOTR')))exits.push(vectors(m));
  return step();
 };
 assert.match(drive(m,'baza breakin\r',()=>m.ready()),/COM written/);
 assert.deepEqual(exits.at(-1),original,'compiler restored all six vectors before exit');
 exits.length=0;
 if(mode==='input'){
  drive(m,'breakin\r',()=>m.waitingForInput()&&m.text().endsWith('? '));
  assert.deepEqual(vectors(m),original,'aborting BDOS input runs with the original vectors');
  ctrlC(m);m.runUntilChecked(()=>m.ready(),100_000_000,'input Ctrl-C returns');
 }else{
  m.typeMatrix('breakin\r');
  m.runUntilChecked(()=>vectors(m)[0].some((v,i)=>v!==original[0][i]),100_000_000,'program owns RST 1');
  m.typeMatrix('\x13');ctrlC(m);
  m.runUntilChecked(()=>m.ready(),100_000_000,'paused output Ctrl-C returns');
 }
 assert.equal(exits.length,1,'one normal warm-boot entry');
 assert.deepEqual(exits[0],original,'program restored vectors before warm boot could mask a defect');
 assert.match(drive(m,'services\r',()=>m.ready()),/SHELL/i);
 assert.deepEqual(m.violations,[]);
});
