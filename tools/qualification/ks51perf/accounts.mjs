// Prospective validators used by real-path rulers and their wrong-reading controls.
import {requireReading} from './observer.mjs';
const same=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
export function validateCopyResult(r){
  requireReading(!same(r.sourceBefore,r.destinationBefore),'COPY preimage already equals source');
  requireReading(same(r.destinationAfter,r.sourceBefore),'COPY destination is not the requested source');
  requireReading(!same(r.destinationAfter,r.destinationBefore),'COPY retained its old destination');
  requireReading(same(r.sourceAfter,r.sourceBefore),'COPY changed its source');
  requireReading(same(r.neighborAfter,r.neighborBefore),'COPY changed its neighbor');
}
export function validateHit(r,misses){
  requireReading(r.counts['cache.miss']===misses&&r.counts['cache.hit']===1,'known hit/miss counts disagree');
  requireReading(r.counts['SDREAD.completed']===misses,'known hit caused a physical read or a miss lost one');
}
export function validateCopyPath(r,e){
  for(const [key,wanted] of Object.entries(e))requireReading((r.counts[key]??0)===wanted,'MVCOPY path count differs: '+key);
}
export function validateCauses(r,expected){
  const actual=Object.fromEntries(Object.entries(r.counts).filter(([key,n])=>n&&/^cause\..*\.SDWRITE\.(completed|failed)$/.test(key)));
  requireReading(JSON.stringify(Object.keys(actual).sort())===JSON.stringify(Object.keys(expected).sort()),'dirty-write cause set differs');
  for(const [key,n] of Object.entries(expected))requireReading(actual[key]===n,'dirty-write cause count differs: '+key);
  requireReading(r.counts['SDWRITE.attempt']===Object.values(expected).reduce((a,b)=>a+b,0),'dirty-write attempts not fully attributed');
  requireReading(!r.openApiIntervals.some(a=>a.name==='BDOS'&&a.function===48),'explicit flush frame outlived its public return');
}
export function validateExplicitFlush(r){
  validateCauses(r,{'cause.bdos48.SDWRITE.completed':2,'cause.bdos48.SDWRITE.failed':1,'cause.through-data.SDWRITE.completed':2});
  requireReading(r.counts['BDOS48.attempt']===3&&r.counts['BDOS48.returned']===3,'successful/failed/repeated BDOS48 lifetime differs');
}
