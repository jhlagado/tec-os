// KG24(c)'s original bitmap input, without changing the selected production ROM.
// The ROM's font is packed and only FNTGLY reads it, so the original font goes in
// at FNTGLY: while a substitution is on, each call returns the original font's
// eight rows for B, by FNTGLY's contract, and FNTGLY itself never runs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const ORIGINAL_SHA='43eb0ec9a8513a670df112948435801b9ae91874e1d17f1283d8990e586e0fb0';
/** The eight rows FNTGLY's contract gives for B from a 768-byte font. */
export function glyphRows(font,b) {
  const plain=b&127,at=plain<32?0:(plain-32)*8;
  return Array.from(font.subarray(at,at+8),v=>b&128?v^255:v);
}
/** Serve FNTGLY's calls on machine M from ORIGINAL. Returns the call count. */
export function substituteHistoricalFont(m,original) {
  assert.ok(original instanceof Uint8Array,'original font required');assert.equal(original.length,768,'original font size');
  assert.equal(sha(original),ORIGINAL_SHA,'original font identity');
  const entry=m.sym('FNTGLY'),cpu=m.cpu.cpu,prev=m.mvWatch;let calls=0;
  m.mvWatch=(pc)=>{
    if(pc===entry){
      let hl=(cpu.h<<8)|cpu.l;
      for(const v of glyphRows(original,cpu.b))m.write(hl++,v);
      cpu.h=(hl>>8)&255;cpu.l=hl&255;cpu.a=0;cpu.flags.Z=1;cpu.flags.C=0;cpu.flags.S=0;
      cpu.pc=m.read(cpu.sp)|(m.read(cpu.sp+1)<<8);cpu.sp=(cpu.sp+2)&0xffff;calls++;
    }
    prev?.(cpu.pc);
  };
  return ()=>calls;
}
