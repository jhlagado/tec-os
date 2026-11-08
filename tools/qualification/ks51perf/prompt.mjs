// Recognise a fresh usable A prompt.
export class DiagnosticEvidenceError extends Error {}
export const need=(ok,text)=>{if(!ok)throw new DiagnosticEvidenceError(text);};

export function proposedReturnedPrompt(s){
  need(Array.isArray(s.rows)&&s.rows.length===24&&s.rows.every(x=>typeof x==='string'),'invalid screen evidence');
  need(Number.isInteger(s.row)&&Number.isInteger(s.column)&&typeof s.outputSinceKeys==='string','invalid prompt evidence');
  need(Number.isInteger(s.pending)&&s.pending>=0&&typeof s.waiting==='boolean'&&typeof s.ready==='boolean'&&Number.isInteger(s.mode),'invalid prompt-state evidence');
  return s.pending===0&&s.waiting===true&&s.ready===true&&s.mode===1&&
    s.row>=0&&s.row<24&&s.column===2&&s.rows[s.row]==='A>'&&
    /(?:^|\r\n)A>$/.test(s.outputSinceKeys);
}
