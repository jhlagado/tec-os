import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boot,standardCard,withShell} from './lib/fixtures.mjs';

function held(m){
 const first=m.sym(m.videoConsole()?'CINMX':'CINLP');
 const last=m.sym(m.videoConsole()?'CINME':'CINWE');
 m.runUntil(()=>m.pc>=first&&m.pc<last,50_000_000,'history input');
 const p=m.read(m.sym('PARAM'))|(m.read(m.sym('PARAM')+1)<<8);
 return String.fromCharCode(...Array.from({length:m.read(m.sym('LINCNT'))},(_,i)=>m.read(p+2+i)));
}
function setup(board){
 const image=withShell(standardCard(),...(board==='glcd'?['GLCD.SVC']:[]));
 const m=boot(image,{width:40,tms:board==='pico',matrix:board!=='serial'});
 m.runUntil(()=>m.ready(),200_000_000,'shell input');
 assert.notEqual(m.read(m.sym('SHOWN'))|(m.read(m.sym('SHOWN')+1)<<8),0);
 assert.equal(m.read(m.sym('CONMOD')),{serial:0,pico:1,glcd:3}[board]);
 return m;
}
for(const board of ['serial','pico','glcd']){
 test(`${board} up/down recalls, edits and executes shell history`,()=>{
  const m=setup(board),up=board==='serial'?'\x1b[A':'\x03',down=board==='serial'?'\x1b[B':'\x04';
  m.type('partial');assert.equal(held(m),'partial');
  const emptyMark=m.output.length;
  m.type(up);assert.equal(held(m),'partial');
  m.type(down);assert.equal(held(m),'partial');
  assert.equal(m.text(emptyMark),'','empty history leaves partial input alone');
  m.type('\x18');assert.equal(held(m),'');
  m.command('ECHO FIRST');m.command('ECHO SECOND');
  const mark=m.output.length;
  m.type('partial');assert.equal(held(m),'partial');
  const row=m.read(m.sym('VROW'));
  for(const [key,text] of [[up,'ECHO SECOND'],[up,'ECHO FIRST'],[up,'ECHO FIRST'],[down,'ECHO SECOND'],[down,''],[down,'']]){
   m.type(key);assert.equal(held(m),text);
   assert.equal(m.read(m.sym('VROW')),row,'no direct vertical cursor movement');
  }
  m.type(up);assert.equal(held(m),'ECHO SECOND');
  m.type('\x08'.repeat(6)+'THIRD\r');
  assert.match(m.expect(/A(:\S*)?>$/),/\r\nTHIRD\r\n/);
  m.type(up);assert.equal(held(m),'ECHO THIRD');
  assert.doesNotMatch(m.text(mark),/\x1b(?:\[|O)[AB]/,'no arrow escape is echoed');
  assert.deepEqual(m.violations,[]);
 });
}
test('SS3 history and unmodified CSI share history; modified sequences remain consumed',()=>{
 const m=setup('serial');m.command('ECHO FIRST');m.command('ECHO SECOND');
 m.type('\x1bOA');assert.equal(held(m),'ECHO SECOND');
 m.type('\x1bOA');assert.equal(held(m),'ECHO FIRST');
 m.type('\x1bOB');assert.equal(held(m),'ECHO SECOND');
 const mark=m.output.length;
 m.type('\x1b[1;5A\x1b[1A\x1b[2B\x1bO1;5A');
 assert.equal(held(m),'ECHO SECOND');assert.equal(m.text(mark),'');
 m.type('\x1b[B');assert.equal(held(m),'');
 assert.deepEqual(m.violations,[]);
});
test('arrow recall respects the existing line maximum without submitting it',()=>{
 const m=setup('serial');m.command('ECHO '+'x'.repeat(40));
 held(m);m.write(m.sym('LINMAX'),12);
 m.type('\x1b[A');assert.equal(held(m),'ECHO '+'x'.repeat(7));
 assert.equal(m.read(m.sym('LINCNT')),12);
 assert.deepEqual(m.violations,[]);
});

