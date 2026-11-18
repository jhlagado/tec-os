// Host-only refusal cases; these neither assemble nor execute a target image.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePriceHex,validatePriceRanges,servicePrices,placementDecision} from '../tools/lib/rom-link-price.mjs';
const eof=':00000001FF\r\n';
function row(address,data,type=0){
  const b=[data.length,address>>8,address&255,type,...data];
  return ':'+[...b,(-b.reduce((s,v)=>s+v,0))&255].map(v=>v.toString(16).padStart(2,'0').toUpperCase()).join('')+'\r\n';
}
const parse=text=>parsePriceHex(Buffer.from(text,'ascii'));
test('HEX validates discontiguous data, exact coverage and CP/M padding',()=>{
 const map=parse(row(0xa000,[0x3e,0x5a])+row(0xc000,[0xc9])+eof+'\x1a\0');
 assert.deepEqual([...map],[[0xa000,0x3e],[0xa001,0x5a],[0xc000,0xc9]]);
 validatePriceRanges(map,{ramStart:0xa000,ramEnd:0xa002,workspace:0xb000,romStart:0xc000,romEnd:0xc001});
});
for(const [name,text] of [
 ['checksum',':01A000003E20\r\n'+eof],['byte count',':02A000003E22\r\n'+eof],
 ['odd digits',':01A000003E2\r\n'+eof],['missing EOF',row(0xa000,[1])],
 ['trailing record',eof+row(0xa000,[1])],['duplicate',row(0xa000,[1])+row(0xa000,[2])+eof],
 ['unsupported kind',row(0,[],5)+eof],['wrap',row(0xffff,[1,2])+eof],
 ['empty data',row(0,[])+eof],['duplicate EOF',eof+eof],
])test('HEX refuses '+name,()=>assert.throws(()=>parse(text)));
test('range validation refuses missing packet bytes and workspace data',()=>{
 const r={ramStart:0xa000,ramEnd:0xa002,workspace:0xb000,romStart:0xc000,romEnd:0xc001};
 assert.throws(()=>validatePriceRanges(parse(row(0xa000,[1])+row(0xc000,[1])+eof),r),/coverage/);
 assert.throws(()=>validatePriceRanges(parse(row(0xa000,[1,2])+row(0xb000,[0])+eof),r),/workspace/);
});
test('service floor distinguishes current shell failure and proposed shell limit',()=>{
 const p=servicePrices(0xbacb,5797);
 assert.equal(p.codeBase,0xa426);assert.equal(p.stub,0xa023);assert.equal(p.bareTpa,40739);
 assert.equal(p.baselineBareTpa,46536);assert.equal(p.bareTpaLoss,5797);
 assert.equal(p.cases[0].baselineTpa,41984);assert.equal(p.cases[0].tpaLoss,5632);
 assert.equal(p.cases[1].coexists,false);assert.equal(p.cases[3].top,0x8000);
 assert.equal(servicePrices(0xbacb,5832).cases[3].coexists,true);
 assert.equal(servicePrices(0xbacb,5833).cases[3].coexists,false);
});
test('placement requires an adjacent stable state and refuses cycles and excess passes',()=>{
 const states=[];
 assert.equal(placementDecision(states,{origin:1,length:2}),'continue');
 assert.equal(placementDecision(states,{origin:1,length:2}),'stable');
 assert.equal(placementDecision(states,{origin:2,length:2}),'continue');
 assert.throws(()=>placementDecision(states,{origin:1,length:2}),/cycle/);
 const bound=[];for(let i=0;i<8;i++)placementDecision(bound,{origin:i});
 assert.throws(()=>placementDecision(bound,{origin:9}),/bound/);
});
