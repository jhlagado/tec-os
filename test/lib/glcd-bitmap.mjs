// Independent six-pixel, eight-row cell check against a fixed font table.
import assert from 'node:assert/strict';
export function validateGlcdCell(actual,code,font) {
  assert.equal(font.length,768);assert.equal(actual.length,1024);
  const plain=code&127,at=plain<32?0:(plain-32)*8;
  for(let y=0;y<8;y++)for(let x=0;x<6;x++){
    const expected=(font[at+y]^(code&128?255:0))>>(7-x)&1;
    assert.equal(actual[y*16]>>(7-x)&1,expected,'fixed-font GLCD cell '+code+'/'+y+'/'+x);
  }
}
