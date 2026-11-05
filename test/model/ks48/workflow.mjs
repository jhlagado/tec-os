import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [rootArg,out]=process.argv.slice(2),root=realpathSync(rootArg);
const {Machine,symbolsFromD8}=await import(pathToFileURL(root+'/host/machine.mjs'));
const {parseContainer,findVolume,volumePayload}=await import(pathToFileURL(root+'/tools/lib/container.mjs'));
const {CpmVolume}=await import(pathToFileURL(root+'/tools/lib/cpmfs.mjs'));
const rom=readFileSync(root+'/build/tecos/tecos.rom');
const symbols=symbolsFromD8(JSON.parse(readFileSync(root+'/build/tecos/tecos.d8.json')));
const rows=[];
for(const width of [40,80]){
 const image=new Uint8Array(readFileSync(root+'/dist/starter.img'));
 const volume=()=>{const a=findVolume(parseContainer(image),'A');return new CpmVolume(volumePayload(image,a),a.g)};
 if(width===80){const original=Buffer.from(volume().read('STARTUP.CMD',{text:true})).toString();volume().write('STARTUP.CMD',Buffer.from('CON PICO 80\r\n'+original));}
 const m=new Machine({rom,symbols,sdImage:image,tms:true,matrix:true,glcd:false,clock:new Date('2026-01-01T12:00:00Z')});
 m.expect(/A>$/,{from:0,maxCycles:200_000_000});m.runUntil(()=>m.ready(),200_000_000,'raw starter');
 assert.equal(m.read(m.sym('PIWID')),width);
 const screen=()=>m.screen().map(s=>s.trimEnd()),status=()=>screen()[23];
 const keys=(input,description,done)=>{m.enqueueInput(input,'matrix');let next=0;m.runUntilChecked(()=>{m.pumpInput();if(m.pending?.length||!m.waitingForInput()||m.cycles<next)return false;next=m.cycles+20_000;return done()},400_000_000,description)};
 const sample=()=>Buffer.from(volume().read('SAMPLE.ASM',{text:true})).toString('utf8');
 const lines=sample().split('\n'),line=lines.findIndex(s=>s.startsWith('HELLO:'))+1;
 assert.ok(line>0);const column=lines[line-1].indexOf('TEC-OS');assert.ok(column>=0);
 const edited='Hello from the TEC-OS.';
 keys(`ted sample.asm ${line}\r`,'TED greeting',()=>status().includes(`L${line} C1`));
 keys('\x1b[C'.repeat(column)+'the ','edit greeting',()=>screen().some(s=>s.includes(edited)));
 keys('\x13','save greeting',()=>sample().includes(edited));
 let mark=m.output.length;
 keys('\x14b','TAS build',()=>/TED\r\n/.test(m.text(mark))&&/SAMPLE\.ASM/.test(status()));
 assert.match(m.text(mark),/SAMPLE\.COM written/);
 mark=m.output.length;keys('\x14r','run SAMPLE',()=>/Press a key/.test(m.text(mark)));assert.ok(m.text(mark).includes(edited));
 keys(' ','return to TED',()=>/SAMPLE\.ASM/.test(status()));
 keys('\x11','return to CCP',()=>m.ready()&&screen().includes('A>'));
 keys(`ted sample.asm ${line}\r`,'reopen saved greeting',()=>status().includes(`L${line} C1`)&&screen().some(s=>s.includes(edited)));
 assert.ok(sample().includes(edited));assert.equal(m.read(m.sym('PIWID')),width);assert.deepEqual(m.violations,[]);
 rows.push({width,line,column:column+1,edited,saved:true,built:true,ran:true,reopened:true,cycles:m.cycles,explicitStartup:width===80});
}
writeFileSync(out,JSON.stringify({rows},null,2)+'\n');
