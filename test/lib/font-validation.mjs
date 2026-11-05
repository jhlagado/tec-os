import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const eq=(a,b,label)=>assert.ok(Buffer.from(a).equals(Buffer.from(b)),label);
export function validateMain(actual,{baseline,font,fontAt,defaultOperands,variant}){
 assert.equal(actual.length,16384,'main length');assert.equal(baseline.length,16384,'baseline length');
 assert.ok(['baseline','font-only','default-only','combined'].includes(variant),'variant');
 const expected=Buffer.from(baseline);
 if(['font-only','combined'].includes(variant)){assert.equal(font.length,768,'font length');font.copy(expected,fontAt)}
 if(['default-only','combined'].includes(variant))for(const at of defaultOperands){assert.equal(baseline[at],80,'baseline cold operand');expected[at]=40}
 eq(actual,expected,'main exact font/default/outside allowlist');
 return {entrypoint:'validateMain',variant,sha256:sha(actual),changedBytes:[...actual.keys()].filter(i=>actual[i]!==baseline[i]).length};
}
export function deriveDiagnosticTrailer(image){
 assert.equal(image.length,16384,'diagnostic length');
 const blank=Buffer.from(image);blank.fill(255,0x3ff6);
 const id=createHash('sha256').update(blank).digest().subarray(0,8);
 const withId=Buffer.from(image);id.copy(withId,0x3ff6);
 const sum=withId.subarray(0,0x3ffe).reduce((n,b)=>(n+b)&65535,0);
 const trailer=Buffer.alloc(10);id.copy(trailer);trailer.writeUInt16LE(sum,8);return trailer;
}
export function validateDiagnostic(actual,{baseline,font,fontAt,variant}){
 assert.equal(actual.length,16384,'diagnostic length');assert.equal(baseline.length,16384,'baseline diagnostic length');
 assert.ok(['baseline','combined'].includes(variant),'diagnostic variant');
 // First establish the independently derived trailer even for the reference.
 eq(baseline.subarray(0x3ff6),deriveDiagnosticTrailer(baseline),'reference diagnostic trailer');
 const expected=Buffer.from(baseline);
 if(variant==='combined'){assert.equal(font.length,768);font.copy(expected,fontAt)}
 deriveDiagnosticTrailer(expected).copy(expected,0x3ff6);
 eq(actual.subarray(0,0x3ff6),expected.subarray(0,0x3ff6),'diagnostic exact FONT-only body');
 eq(actual.subarray(0x3ff6,0x3ffe),expected.subarray(0x3ff6,0x3ffe),'diagnostic derived image ID');
 eq(actual.subarray(0x3ffe),expected.subarray(0x3ffe),'diagnostic derived checksum');
 return {entrypoint:'validateDiagnostic',variant,sha256:sha(actual),imageId:actual.subarray(0x3ff6,0x3ffe).toString('hex'),checksum:actual.readUInt16LE(0x3ffe)};
}
export function validateNotices({source,dist,diag},{canonical,expected}){
 // The retained canonical packet includes every copyright, condition and
 // disclaimer line. Token presence is insufficient to pass this comparison.
 assert.ok(source.subarray(0,canonical.length).equals(canonical),'complete canonical X11/Spleen notice packet');
 eq(source,expected,'exact notice packet and declared edits');
 eq(dist,source,'source/dist notices equal');eq(diag,source,'source/diag notices equal');
 return {entrypoint:'validateNotices',sha256:sha(source),canonicalBytes:canonical.length,bytes:source.length};
}

// Evergreen checks use the current mapped slot, without freezing unrelated code.
export function validateCurrentFont(image,map,font) {
 const symbol=map.symbols.find(s=>s.name==='FONT');assert.ok(symbol,'mapped FONT');
 const at=(symbol.address??symbol.value)-0xc000;assert.ok(at>=0&&at+768<=image.length);
 assert.equal(sha(font),'5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8','fixed chosen font');
 eq(image.subarray(at,at+768),font,'current mapped FONT bytes');
 return {entrypoint:'validateCurrentFont',fontAt:at+0xc000,fontBytes:768};
}
export function validateCurrentDiagnostic(image,map,font) {
 const result=validateCurrentFont(image,map,font);
 eq(image.subarray(0x3ff6),deriveDiagnosticTrailer(image),'current diagnostic derived ID/checksum');
 return {...result,entrypoint:'validateCurrentDiagnostic'};
}
