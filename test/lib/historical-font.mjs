// KG24(c)'s original bitmap input, without changing the selected production ROM.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function historicalFontContext(image,symbols) {
  const start=symbols.get('PISTART')-0xc000,end=symbols.get('TMSWID')-0xc000,call=symbols.get('TMSW');
  const pattern=Buffer.from([0x3e,40,0xcd,call&255,call>>8]);
  const found=Buffer.from(image).indexOf(pattern,start);assert.ok(found>=start&&found<end,'cold40 setup operand');
  assert.equal(Buffer.from(image).indexOf(pattern,found+1),-1,'unique cold setup');
  return {selectedSha256:sha(image),coldOperands:[symbols.get('PITPL')-0xc000+14,found+1]};
}
export function validateHistoricalFont(selected,restored,at,original,context) {
  assert.ok(selected instanceof Uint8Array,'selected ROM required');
  assert.match(context.selectedSha256,/^[0-9a-f]{64}$/);
  assert.equal(sha(selected),context.selectedSha256,'selected production identity');
  assert.ok(Number.isInteger(at)&&at>=0&&at+768<=selected.length,'mapped FONT span');
  assert.ok(original instanceof Uint8Array,'original font required');assert.equal(original.length,768,'original font size');
  assert.equal(sha(original),'43eb0ec9a8513a670df112948435801b9ae91874e1d17f1283d8990e586e0fb0','original font identity');
  assert.equal(sha(selected.subarray(at,at+768)),'5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8','selected FONT identity');
  assert.equal(restored.length,selected.length);
  assert.deepEqual(Buffer.from(restored.subarray(0,at)),Buffer.from(selected.subarray(0,at)),'unchanged native prefix');
  assert.deepEqual(Buffer.from(restored.subarray(at+768)),Buffer.from(selected.subarray(at+768)),'unchanged native suffix');
  assert.deepEqual(Buffer.from(restored.subarray(at,at+768)),Buffer.from(original),'exact historical font bytes');
  assert.equal([...restored.keys()].filter(i=>restored[i]!==selected[i]).length,427,'registered font changes only');
  for(const operand of context.coldOperands){assert.equal(selected[operand],40);assert.equal(restored[operand],40,'retained cold40 operand')}
  return {fontAt:at+0xc000,fontBytes:768,changedBytes:427,originalSha256:sha(original),restoredSha256:sha(restored)};
}
export function restoreHistoricalFont(selected,at,original,context) {
  const before=Buffer.from(selected),restored=Buffer.from(selected);
  assert.ok(original instanceof Uint8Array,'original font required');
  Buffer.from(original).copy(restored,at);validateHistoricalFont(selected,restored,at,original,context);
  assert.deepEqual(Buffer.from(selected),before,'source ROM buffer unchanged');
  return restored;
}
