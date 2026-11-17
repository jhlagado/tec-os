import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boot,program,romFor,standardCard,volume,withShell} from './lib/fixtures.mjs';
import {Machine} from './lib/machine.mjs';

function fixture(shell=false,matrix=false){
 const card=standardCard();
 volume(card,'A').write('ONE.TXT',Buffer.from('ARROW-CANARY\r\n'),{text:true});
 return boot(shell?withShell(card):card,{tms:matrix,matrix,width:80});
}

function held(m){
 const first=m.sym(m.videoConsole()?'CINMX':'CINLP');
 const last=m.sym(m.videoConsole()?'CINME':'CINWE');
 m.runUntil(()=>m.pc>=first&&m.pc<last,50_000_000,'line input');
 const p=m.read(m.sym('PARAM'))|m.read(m.sym('PARAM')+1)<<8;
 const n=m.read(m.sym('LINCNT'));
 return Buffer.from(Array.from({length:n},(_,i)=>m.read(p+2+i))).toString('latin1');
}

for(const shell of [false,true])for(const matrix of [false,true]){
 test(`${shell?'shell':'ROM CCP'} ${matrix?'matrix':'serial'} arrows preserve the partial command and cursor`,()=>{
  const m=fixture(shell,matrix);
  m.type('TYPE ');assert.equal(held(m),'TYPE ');
  const pos=()=>[m.read(m.sym('VROW')),m.read(m.sym('VCOL'))];
  const before=pos(),mark=m.output.length;
  m.type(matrix?'\x03\x04':'\x1b[A\x1b[B');
  assert.equal(held(m),'TYPE ');
  assert.deepEqual(pos(),before);
  assert.equal(m.text(mark),'','no navigation byte is echoed');
  m.type('ONE.TXT\r');
  assert.match(m.expect(/A(:\S*)?>$/),/ARROW-CANARY/);
  assert.deepEqual(m.violations,[]);
 });
}

test('buffered line input consumes CSI modifiers and every SS3 final without storing them',()=>{
 const m=fixture(true);
 m.type('TYPE ');
 assert.equal(held(m),'TYPE ');
 const mark=m.output.length;
 m.type('\x1b[1;5A\x1b[1;2B\x1b[C\x1b[D\x1bOH\x1bOF\x1bOP\x1bOQ\x1bOR\x1bOS');
 assert.equal(held(m),'TYPE ');
 assert.equal(m.text(mark),'');
 m.type('ONE.TXT\r');
 assert.match(m.expect(/A(:\S*)?>$/),/ARROW-CANARY/);
 assert.deepEqual(m.violations,[]);
});

test('Escape prefixes recover through ordinary keys, CR, backspace and another Escape',()=>{
 const m=fixture();
 for(const input of ['TY\x1bPE ONE.TXT\r','TYPE ONE.TXT\x1b[\r','TYPE ONE.TXX\x1b[\x08T\r','TYPE \x1b[\x1b[BONE.TXT\r']){
  const mark=m.output.length;
  m.type(input);
  assert.match(m.expect(/A(:\S*)?>$/,{from:mark}),/ARROW-CANARY/,JSON.stringify(input));
 }
 assert.deepEqual(m.violations,[]);
});

test('navigation does not consume the last free byte or complete a full line early',()=>{
 const m=fixture();
 m.type('TYPE ');held(m);
 m.write(m.sym('LINMAX'),6);
 m.type('\x1b[A\x1b[B');
 assert.equal(held(m),'TYPE ');
 assert.equal(m.read(m.sym('LINCNT')),5);
 m.type('X');
 m.expect(/A(:\S*)?>$/);
 assert.deepEqual(m.violations,[]);
});

test('a program uses the same filtered function 10 while raw keyboard input keeps arrow bytes',async()=>{
 const card=standardCard();
 volume(card,'A').write('LINE.COM',(await program('line')).bytes);
 volume(card,'A').write('KEYS.COM',(await program('keys')).bytes);
 const m=boot(card,{tms:true,matrix:true});
 m.type('LINE\r');
 m.runUntil(()=>m.read(m.sym('LINMAX'))===20&&m.waitingForInput(),100_000_000,'program line input');
 m.type('AB\x03\x04CD');
 assert.equal(held(m),'ABCD');
 m.type('\r');m.expect(/A(:\S*)?>$/);
 const mark=m.output.length;
 m.type('KEYS\r');m.type('\x03\x05');
 assert.match(m.expect(/A(:\S*)?>$/,{from:mark}),/1B 5B 41 1B 5B 44 /);
 assert.deepEqual(m.violations,[]);
});

test('the unfiltered input path reproduces escape bytes stored and echoed at the prompt',()=>{
 const {rom,symbols}=romFor();
 const at=symbols.get('LINKEY')-0xc000;
 assert.deepEqual([...rom.subarray(at,at+3)],[0xfe,0x1b,0xca]);
 rom.fill(0,at,at+5);
 const m=new Machine({rom,symbols,sdImage:standardCard()});
 m.expect(/A>$/);
 m.runUntil(()=>m.ready(),100_000_000,'the control prompt');
 const mark=m.output.length;
 m.type('AB\x1b[A');
 assert.equal(held(m),'AB\x1b[A');
 assert.match(m.text(mark),/\x1b\[A/);
 assert.deepEqual(m.violations,[]);
});
