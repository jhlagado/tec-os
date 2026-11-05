// KG24(c)'s original bitmap input, without changing the selected production ROM.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function validateHistoricalFont(selected,restored,at,original) {
  assert.ok(selected instanceof Uint8Array,'selected ROM required');
  assert.equal(sha(selected),'fa63989b65d1e7e7a07f45e2a2b33e52f785d74216a3fde38af86b2d913f302d','selected production identity');
  assert.equal(at,0x179,'registered FONT offset');
  assert.ok(original instanceof Uint8Array,'original font required');assert.equal(original.length,768,'original font size');
  assert.equal(sha(original),'43eb0ec9a8513a670df112948435801b9ae91874e1d17f1283d8990e586e0fb0','original font identity');
  assert.equal(sha(selected.subarray(at,at+768)),'5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8','selected FONT identity');
  assert.equal(restored.length,selected.length);
  assert.deepEqual(Buffer.from(restored.subarray(0,at)),Buffer.from(selected.subarray(0,at)),'unchanged native prefix');
  assert.deepEqual(Buffer.from(restored.subarray(at+768)),Buffer.from(selected.subarray(at+768)),'unchanged native suffix');
  assert.deepEqual(Buffer.from(restored.subarray(at,at+768)),Buffer.from(original),'exact historical font bytes');
  assert.equal([...restored.keys()].filter(i=>restored[i]!==selected[i]).length,427,'registered font changes only');
  for(const address of [0xd1bb,0xd1e3])assert.equal(restored[address-0xc000],40,'retained cold40 operand');
  return {fontAt:at+0xc000,fontBytes:768,changedBytes:427,originalSha256:sha(original),restoredSha256:sha(restored)};
}
export function restoreHistoricalFont(selected,at,original) {
  const before=Buffer.from(selected),restored=Buffer.from(selected);
  assert.ok(original instanceof Uint8Array,'original font required');
  Buffer.from(original).copy(restored,at);validateHistoricalFont(selected,restored,at,original);
  assert.deepEqual(Buffer.from(selected),before,'source ROM buffer unchanged');
  return restored;
}
