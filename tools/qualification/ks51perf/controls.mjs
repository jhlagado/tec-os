// Source only: a separate exact allocation is required before importing this file.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {proposedReturnedPrompt,DiagnosticEvidenceError} from './prompt.mjs';
import {endpointControls} from './endctrl.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.env.ORIGO_GUARD,String(process.ppid),'actual shared guard parent required');
assert.equal(process.env.NODE_OPTIONS,'--max-old-space-size=64');
const source=fs.readFileSync(path.join(HERE,'runner.mjs'),'utf8');
const begin=source.indexOf('function keys('),end=source.indexOf('const pattern=',begin);
assert.ok(begin>=0&&end>begin);
const extracted=source.slice(begin,end);
assert.equal((extracted.match(/function keys\(/g)??[]).length,1);
assert.equal((extracted.match(/function quitEditor\(/g)??[]).length,1);
assert.equal((source.match(/quitEditor\(m\)/g)??[]).length,4); // declaration and three m callers
assert.equal((source.match(/quitEditor\(fresh\)/g)??[]).length,1);
assert.equal((source.match(/keys\((?:m|fresh),'\\x11'/g)??[]).length,0);
let begins=0;
const context=vm.createContext({proposedReturnedPrompt});
vm.runInContext(extracted+'\nthis.quit=quitEditor;',context,{timeout:1000});
const rowsAt=row=>{const rows=Array(24).fill('');rows[row]='A>';return rows;};
const valid=()=>({rows:rowsAt(1),row:1,column:2,outputSinceKeys:'\x1b[r\x1b[0m\x1b[2J\x1b[H\r\nA>',pending:0,waiting:true,ready:true,mode:1});
const cases=[];
function caller(id,state,expected){
 const output=[0x58,0x59];let capturedMark=null,accepted=null;
 const m={output,pending:Array(state.pending).fill({}),videoConsole:()=>true,
  screen:()=>state.rows,sym:n=>n,read:n=>({VROW:state.row,VCOL:state.column,CONMOD:state.mode})[n],
  text:mark=>{capturedMark=mark;return state.outputSinceKeys;},waitingForInput:()=>state.waiting,ready:()=>state.ready,
  enqueueInput:(text,via)=>{begins++;assert.equal(text,'\x11');assert.equal(via,'matrix');},pumpInput(){},
  runUntil(predicate,limit,label){assert.equal(limit,1_000_000_000);assert.equal(label,'keys "\\u0011"');accepted=predicate();}};
 context.quit(m);assert.equal(accepted,expected,id);
 if(state.pending===0&&state.waiting)assert.equal(capturedMark,2,id+' current output mark');
 cases.push({id,expected,actual:accepted});
}
for(const row of [0,1,12,23])caller('usable-prompt-row-'+row,{...valid(),rows:rowsAt(row),row},true);
const negatives=[
 ['editor-body-not-ready',{ready:false}],['body-not-whole-row',{rows:rowsAt(1).map(x=>x==='A>'?'text A>':x)}],
 ['stale-screen',{outputSinceKeys:''}],['substring-no-line-boundary',{outputSinceKeys:'body A>'}],
 ['wrong-current-row',{row:2}],['wrong-column',{column:1}],['wrong-drive',{rows:rowsAt(1).map(x=>x==='A>'?'B>':x),outputSinceKeys:'\r\nB>'}],
 ['pending-key',{pending:1}],['not-input-wait',{waiting:false}],['not-ccp-ready',{ready:false}],['wrong-mode',{mode:0}],
];
for(const [id,patch]of negatives)caller(id,{...valid(),...patch},false);
const malformed=[
 ['short-rows',{rows:[]},'invalid screen evidence'],
 ['bad-row-type',{row:'1'},'invalid prompt evidence'],
 ['bad-column-type',{column:null},'invalid prompt evidence'],
 ['bad-pending',{pending:-1},'invalid prompt-state evidence'],
 ['bad-waiting',{waiting:1},'invalid prompt-state evidence'],
 ['bad-ready',{ready:1},'invalid prompt-state evidence'],
 ['bad-mode',{mode:'1'},'invalid prompt-state evidence'],
];
for(const [id,patch,reason]of malformed){
 assert.throws(()=>proposedReturnedPrompt({...valid(),...patch}),e=>e instanceof DiagnosticEvidenceError&&e.message===reason,id);
 cases.push({id,rejected:true,errorType:'DiagnosticEvidenceError',reason});
}
const hostFault=new Error('intentional prompt getter fault');
const broken={...valid()};Object.defineProperty(broken,'rows',{get(){throw hostFault;}});
assert.throws(()=>proposedReturnedPrompt(broken),e=>e===hostFault);
const getterFault=new Error('intentional wrapper screen fault');
const badMachine={output:[],pending:[],videoConsole:()=>true,enqueueInput(){begins++;},pumpInput(){},waitingForInput:()=>true,
 runUntil:f=>f(),screen(){throw getterFault;}};
assert.throws(()=>context.quit(badMachine),e=>e===getterFault);
assert.equal(cases.length,22);
assert.equal(begins,16);
const inherited=endpointControls();
const report={kind:'PROMPT_OBSERVATION_SYNTHETIC_CONTROLS_ONLY',cases,begins,inherited,
 actualNode:{pid:process.pid,parent:process.ppid,guard:process.env.ORIGO_GUARD,argv:process.argv,execArgv:process.execArgv,executable:process.execPath,nodeOptions:process.env.NODE_OPTIONS},
 extractedSourceSHA256:crypto.createHash('sha256').update(extracted).digest('hex'),
 ordinaryHostFaultIdentityPreserved:true,guestExecutions:0,baselineSamples:0,productionCredit:0,
 claim:'Actual ordinary keys and quitEditor plus pure exact predicate; synthetic machines only, not guest or baseline qualification.'};
process.stdout.write('KS51_PROMPT_CONTROLS '+JSON.stringify(report)+'\n');
