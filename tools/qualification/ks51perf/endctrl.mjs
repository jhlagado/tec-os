// Keep the inherited synthetic controls.
import {DiagnosticEvidenceError,need,proposedReturnedPrompt} from './prompt.mjs';
const waitCheckpointErrors=new WeakMap();
function boundedError(error){
  const name=String(error?.name??typeof error),message=String(error?.message??error),stack=String(error?.stack??'');
  return {name:name.slice(0,128),message:message.slice(0,512),stack:stack.slice(0,4096),
    truncated:{name:name.length>128,message:message.length>512,stack:stack.length>4096}};
}
export function retainWaitFailure(error,writeCheckpoint){
  try{writeCheckpoint();}
  catch(logError){waitCheckpointErrors.set(error,[...(waitCheckpointErrors.get(error)??[]),{origin:'wait-error',...boundedError(logError)}]);}
  throw error;
}
export function diagnosticFailureStatus(error,writeCheckpoint){
  const status={status:'FAILED_DIAGNOSTIC',error:boundedError(error),checkpointErrors:[...(waitCheckpointErrors.get(error)??[])]};
  try{writeCheckpoint();}
  catch(logError){status.checkpointErrors.push({origin:'diagnostic-error',...boundedError(logError)});}
  return status;
}
export function checkpointErrorControls(){
  const cases=[];
  for(const [id,innerFails,outerFails]of [
    ['inner-failed-outer-successful',true,false],
    ['inner-and-outer-failed',true,true],
    ['inner-successful-outer-failed',false,true],
  ]){
    const original=new Error('original wait failure'),inner=new Error('inner checkpoint failure'),outer=new Error('outer checkpoint failure');
    original.stack='original wait stack';inner.stack='inner checkpoint stack';outer.stack='outer checkpoint stack';Object.freeze(original);
    let caught,innerCalls=0,outerCalls=0;
    try{retainWaitFailure(original,()=>{innerCalls++;if(innerFails)throw inner;});}
    catch(error){if(error!==original)throw error;caught=error;}
    need(caught===original&&innerCalls===1,'original exception identity or inner attempt lost: '+id);
    const status=diagnosticFailureStatus(caught,()=>{outerCalls++;if(outerFails)throw outer;});
    need(status.status==='FAILED_DIAGNOSTIC'&&outerCalls===1,'failure status or outer attempt lost: '+id);
    need(status.error.name==='Error'&&status.error.message==='original wait failure'&&status.error.stack==='original wait stack','original exception evidence lost: '+id);
    const expected=[];if(innerFails)expected.push(['wait-error','inner checkpoint failure','inner checkpoint stack']);if(outerFails)expected.push(['diagnostic-error','outer checkpoint failure','outer checkpoint stack']);
    need(status.checkpointErrors.length===expected.length,'checkpoint error count differs: '+id);
    for(const [i,[origin,message,stack]]of expected.entries()){
      const actual=status.checkpointErrors[i];need(actual.origin===origin&&actual.name==='Error'&&actual.message===message&&actual.stack===stack,'checkpoint error or origin lost: '+id);
      need(!actual.truncated.name&&!actual.truncated.message&&!actual.truncated.stack,'short checkpoint evidence truncated: '+id);
    }
    need(!Object.prototype.hasOwnProperty.call(original,'diagnosticLogError'),'original exception mutated: '+id);
    cases.push({id,originalIdentityRetained:true,checkpointErrors:expected.length,origins:expected.map(x=>x[0]),failedStatus:true});
  }
  const large=new Error('m'.repeat(1024));large.name='n'.repeat(256);large.stack='s'.repeat(8192);let caught;
  try{retainWaitFailure(large,()=>{throw large;});}catch(error){if(error!==large)throw error;caught=error;}
  need(caught===large,'bounded-evidence original identity lost');
  const bounded=diagnosticFailureStatus(caught,()=>{throw large;});
  for(const error of [bounded.error,...bounded.checkpointErrors])need(error.name.length===128&&error.message.length===512&&error.stack.length===4096&&error.truncated.name&&error.truncated.message&&error.truncated.stack,'error evidence bounds changed');
  need(bounded.checkpointErrors.length===2&&large.name.length===256&&large.message.length===1024&&large.stack.length===8192,'bounds mutated the original exception or lost errors');
  return {cases,bounds:{nameCodeUnits:128,messageCodeUnits:512,stackCodeUnits:4096,primaryAndTwoCheckpointErrors:true,truncationExplicit:true},scope:'synthetic ordinary Error callbacks through the production retention functions; no I/O or guest acceptance'};
}
export function endpointControls(){
  const rows=Array(24).fill('');rows[1]='A>';
  const valid={rows,row:1,column:2,outputSinceKeys:'\x1b[2J\x1b[H\r\nA>',pending:0,waiting:true,ready:true,mode:1};
  const last=Array(24).fill('');last[23]='A>';
  const cases=[
    ['valid-prompt-above-blank-rows',valid,true],
    ['valid-prompt-on-bottom-row',{...valid,rows:last,row:23},true],
    ['editor-text-is-not-CCP',{...valid,ready:false},false],
    ['stale-screen-without-new-prompt',{...valid,outputSinceKeys:''},false],
    ['pending-key',{...valid,pending:1},false],
    ['not-input-wait',{...valid,waiting:false},false],
    ['wrong-current-row',{...valid,row:2},false],
    ['wrong-drive',{...valid,rows:rows.map(x=>x==='A>'?'B>':x),outputSinceKeys:'\r\nB>'},false],
    ['wrong-cursor-column',{...valid,column:1},false],
  ];
  const result=cases.map(([id,state,expected])=>{const actual=proposedReturnedPrompt(state);need(actual===expected,'endpoint control differs: '+id);return {id,expected,actual};});
  need(!/A>$/.test(valid.rows.join('\n')),'original false-prompt-boundary contrast changed');
  const fault=new Error('intentional endpoint host fault');
  const broken={...valid};Object.defineProperty(broken,'rows',{get(){throw fault;}});
  let propagated=false;try{proposedReturnedPrompt(broken);}catch(e){if(e!==fault)throw e;propagated=true;}
  need(propagated,'ordinary host error lost its identity');
  return {cases:result,originalJoinedScreenRejectsValidPrompt:true,hostErrorPropagated:true,checkpointErrorControls:checkpointErrorControls(),executedScope:'synthetic endpoint data only, not guest or baseline acceptance'};
}

