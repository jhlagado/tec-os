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
export function validateNotices({source,dist},{canonical,expected}){
 // The retained canonical packet includes every copyright, condition and
 // disclaimer line. Token presence is insufficient to pass this comparison.
 assert.ok(source.subarray(0,canonical.length).equals(canonical),'complete canonical X11/Spleen notice packet');
 eq(source,expected,'exact notice packet and declared edits');
 eq(dist,source,'source/dist notices equal');
 return {entrypoint:'validateNotices',sha256:sha(source),canonicalBytes:canonical.length,bytes:source.length};
}

// Evergreen checks use the current mapped slot, without freezing unrelated code.
// The ROM holds the font packed: FONT's 384 bytes, two rows a byte, and
// FONTW's four codes and their fifth-column rows, bit 7 the top. What FNTGLY
// gives back from them must be the chosen font, byte for byte.
export function validateCurrentFont(image,map,font) {
 const at=name=>{const symbol=map.symbols.find(s=>s.name===name);assert.ok(symbol,'mapped '+name);return (symbol.address??symbol.value)-0xc000};
 const fontAt=at('FONT'),wideAt=at('FONTW');assert.ok(fontAt>=0&&fontAt+384<=image.length&&wideAt+8<=image.length);
 assert.equal(sha(font),'5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8','fixed chosen font');
 const packed=image.subarray(fontAt,fontAt+384),codes=[...image.subarray(wideAt,wideAt+4)],masks=[...image.subarray(wideAt+4,wideAt+8)];
 const rows=Buffer.alloc(768);
 for(let i=0;i<96;i++)for(let r=0;r<8;r++){const b=packed[i*4+(r>>1)],w=codes.indexOf(i+32);rows[i*8+r]=(r&1?(b<<4)&0xf0:b&0xf0)|(w>=0&&masks[w]&(0x80>>r)?8:0)}
 eq(rows,font,'current mapped FONT bytes');
 return {entrypoint:'validateCurrentFont',fontAt:fontAt+0xc000,fontBytes:392};
}
