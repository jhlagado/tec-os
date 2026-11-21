// Queue release follows the CPU's actual acknowledgement, even when the
// caller pumps input only after the program has left that instruction.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boot,standardCard,volume,romFor} from './lib/fixtures.mjs';

function start(bytes) {
  const image=standardCard();
  volume(image,'A').write('KEY.COM',Uint8Array.from(bytes));
  const m=boot(image,{tms:true,matrix:true,width:40});
  m.type('KEY.COM\r');
  m.runUntil(()=>m.pc===0x100,50_000_000,'the actual program');
  m.enqueueInput('\x03','matrix');m.pumpInput();
  assert.equal(m.pending[0].down,true);
  return m;
}

test('ROM console acknowledgement releases an arrow after the guest returns to RAM',()=>{
  // Poll BDOS 6, keep the received byte and spin in RAM.
  const m=start([0x1e,255,0x0e,6,0xcd,5,0,0xb7,0x28,0xf6,0x32,1,0x60,0xc3,0x0d,1]);
  const head=m.pending[0];
  m.runUntil(()=>m.read(0x6001)===27,50_000_000,'the console arrow prefix');
  assert.ok(m.pc<0xc000,'pump after the ROM has returned');
  assert.ok(head.releaseAt<=m.cycles,'ROM acknowledgement has no extra hold');
  m.pumpInput();assert.equal(head.up,true);
  assert.deepEqual(m.violations,[]);
});

test('a RAM scanner retains its arrow hold across coarse input pumping',()=>{
  const key=romFor().symbols.get('KBLAST');
  // Read row zero, acknowledge Up and keep sampling its physical bit.
  const m=start([0x3e,0xfe,0xdb,0xfe,0xcb,0x5f,0x20,0xf8,0x3e,3,
    0x32,key&255,key>>8,0x3e,0xfe,0xdb,0xfe,0x32,0,0x60,0xc3,0x0d,1]);
  const head=m.pending[0];
  m.runUntil(()=>head.releaseAt!==undefined,50_000_000,'RAM acknowledgement');
  const due=head.releaseAt;
  assert.ok(due>m.cycles+190_000,'retain the fifty-millisecond interval');
  m.runUntil(()=>m.cycles>=due-100,250_000,'coarse work before release');
  m.pumpInput();assert.notEqual(head.up,true);
  assert.equal(m.read(0x6000)&8,0,'raw hardware still has Up down');
  m.runUntil(()=>m.cycles>=due,1000,'the release deadline');
  m.pumpInput();assert.equal(head.up,true);
  m.runUntil(()=>m.read(0x6000)&8,1000,'the physical key release');
  assert.deepEqual(m.violations,[]);
});
