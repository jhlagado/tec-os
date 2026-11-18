#!/usr/bin/env node
// Link and price a protected RAM body without executing or saving a target.
// The resulting report cannot qualify a bootable ROM or a memory contract.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,posix,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeGenerated} from './build.mjs';
import {tasAssembler} from './lib/tas-rom.mjs';
import {decodeImage} from './lib/tas-d8.mjs';
import {inputsDir,pinnedBytes} from './lib/pins.mjs';
import {parsePriceHex,validatePriceRanges,servicePrices,placementDecision,deferWorkspaceEquates} from './lib/rom-link-price.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BASE='96bf06bef12847631b68d95f5881ba0945893ca6';
const CODEC='9dff4655a698ff921ebd94d0c5aebf5853c755952cef2f47097cbc3875161b3e';
const sha=b=>createHash('sha256').update(b).digest('hex');
const hex=n=>'$'+n.toString(16).toUpperCase().padStart(4,'0');
const bodyFiles=['ccpbody.asm',...['ccpdir','ccpfile','ccpmut','ccpcmd','bdos','bdosfile','bdosrec','bdosfn','bdoslog','bdoscon'].map(n=>'cpm/'+n+'.asm')];
const labels=s=>new Set([...s.matchAll(/^([A-Z_][A-Z0-9_]*):/gmi)].map(m=>m[1].toUpperCase()));
function once(s,from,to){assert.equal(s.split(from).length,2,'expected one source boundary: '+from);return s.replace(from,to);}

function transformSource(src) {
  const path=join(src,'cpm/ccp.asm'),text=readFileSync(path,'latin1');
  const start=text.indexOf('\nCCPENT:\n'),body=text.indexOf('\nSTARTED:\n');
  assert.ok(start>0&&body>start,'CCP split boundaries');
  const equ=once(text.slice(0,start),'CCPBAS:','');
  let prefix='CCPBAS:\n'+text.slice(start+1,body);
  const packet=text.slice(body+1);
  writeFileSync(join(src,'ccpequ.asm'),equ,'latin1');
  writeFileSync(join(src,'ccpbody.asm'),packet,'latin1');
  const workspaceSource=readFileSync(join(src,'ram.asm'),'latin1');
  const workspaceNames=new Set([...labels(workspaceSource),...[...workspaceSource.matchAll(/^([A-Z_][A-Z0-9_]*)\s+EQU\b/gmi)].map(m=>m[1].toUpperCase())]);
  const deferred=deferWorkspaceEquates(new Map(bodyFiles.map(f=>[f,readFileSync(join(src,f),'latin1')])),workspaceNames);
  for(const [file,text] of deferred.rewritten)writeFileSync(join(src,file),text,'latin1');
  writeFileSync(join(src,'lateequ.asm'),deferred.text,'latin1');
  const ramLabels=new Set(bodyFiles.flatMap(f=>[...labels(readFileSync(join(src,f),'latin1'))]));
  const changes=[];
  const changeBranches=(file,source,targets)=>source.split('\n').map((line,i)=>{
    const branch=line.match(/^(\s*)jr\s+(?:(nz|z|nc|c)\s*,\s*)?([A-Z_][A-Z0-9_]*)(\s*(?:;.*)?)$/i);
    if(branch&&targets(branch[3].toUpperCase())){
      changes.push({file,line:i+1,from:line.trim(),to:'jp '+(branch[2]?branch[2]+',':'')+branch[3],addedBytes:1});
      return branch[1]+'jp '+(branch[2]?branch[2]+',':'')+branch[3]+branch[4];
    }
    const loop=line.match(/^\s*djnz\s+([A-Z_][A-Z0-9_]*)\s*(?:;.*)?$/i);
    assert.ok(!loop||!targets(loop[1].toUpperCase()),'cross-boundary DJNZ needs a separate model');
    return line;
  }).join('\n');
  for(const file of bodyFiles){
    const p=join(src,file),s=readFileSync(p,'latin1');
    assert.ok(!/^\s*ORG\b/gmi.test(s),'body contains an origin');
    writeFileSync(p,changeBranches(file,s,target=>!ramLabels.has(target)),'latin1');
  }
  prefix=changeBranches('ccpboot.asm',prefix,target=>ramLabels.has(target));
  prefix+='\n  jp STARTED\n';
  changes.push({file:'ccpboot.asm',from:'fallthrough to STARTED',to:'jp STARTED',addedBytes:3});
  writeFileSync(join(src,'ccpboot.asm'),prefix,'latin1');
  let entry=readFileSync(join(src,'rom.asm'),'latin1');
  entry=once(entry,'%INCLUDE "cpm/ccp.asm"','%INCLUDE "ccpboot.asm"');
  for(const file of bodyFiles.slice(1)) entry=once(entry,'%INCLUDE "'+file+'"','');
  const before=[ '%INCLUDE "ccpequ.asm"','  ORG RAMORG','RAMBEG:',...bodyFiles.map(f=>'%INCLUDE "'+f+'"'),'RAMEND:','%INCLUDE "ram.asm"','%INCLUDE "lateequ.asm"'].join('\n');
  entry=once(entry,'%INCLUDE "ram.asm"',before);
  writeFileSync(join(src,'rom.asm'),entry,'latin1');
  return {changes,deferredEquates:deferred.declarations,consoleLabels:[...labels(readFileSync(join(src,'conmode.asm'),'latin1'))]};
}

// Flatten only declared local includes into unique CP/M names. Absolute paths
// and escaping symlinks are refused before the pinned compiler sees a file.
function stage(src,dir,workspace,origin) {
  const sources=new Map(),used=new Set();
  function visit(file){
    if(sources.has(file))return basename(file).toUpperCase();
    assert.ok(!posix.isAbsolute(file)&&file!=='..'&&!file.startsWith('../'),'include path');
    const full=realpathSync(join(src,file)),rel=relative(src,full);
    assert.ok(rel!=='..'&&!rel.startsWith('../')&&!posix.isAbsolute(rel),'include symlink');
    const name=basename(file).toUpperCase();
    assert.match(name,/^[A-Z0-9$_-]{1,8}\.(ASM|INC)$/);assert.ok(!used.has(name),'ambiguous CP/M name');used.add(name);
    let text=readFileSync(full,'latin1');
    if(file==='gen/config.asm'){
      assert.equal([...text.matchAll(/^WSBASE\s+EQU\s+\$[0-9A-F]+$/gmi)].length,1);
      text=text.replace(/^WSBASE\s+EQU\s+\$[0-9A-F]+$/mi,'WSBASE EQU '+hex(workspace));
      text+='\nRAMORG EQU '+hex(origin)+'\n';
    }
    sources.set(file,text);
    text=text.replace(/^(\s*%INCLUDE\s+")([^"\r\n]+)(")/gmi,(_,a,child,b)=>{
      let selected=posix.normalize(posix.join(posix.dirname(file),child));
      try{readFileSync(join(src,selected));}catch(error){assert.equal(error.code,'ENOENT');selected=posix.normalize(child);}
      return a+visit(selected)+b;
    });
    writeFileSync(join(dir,name),text,'latin1');
    return name;
  }
  visit('rom.asm');
  const digest=createHash('sha256');
  for(const [file,text] of [...sources].sort(([a],[b])=>a<b?-1:a>b?1:0))digest.update(file+'\0').update(text);
  return digest.digest('hex');
}

export async function priceLink({codecPath=join(ROOT,'.inputs/pack-com.mjs')}={}) {
  const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
  assert.equal(git('status','--porcelain'),'','measurement source must be clean');
  assert.equal(git('diff',BASE,'--','src','format','drivers'),'','frozen target sources differ');
  const codecBytes=readFileSync(codecPath);assert.equal(sha(codecBytes),CODEC,'codec pin');
  const {parse,encode,decode}=await import(pathToFileURL(resolve(codecPath)).href);
  await tasAssembler(); // Verify compiler, runner and CPU model pins.
  const host=resolve(process.env.TECOS_TAS_HOST??join(inputsDir(ROOT),'tas-host'));
  const {assemble}=await import(pathToFileURL(join(host,'tools/tas.mjs')).href);
  // Reuse normal generation without assembling a normal or experimental ROM.
  writeGenerated({name:'tecos'},0xa000);
  const dir=mkdtempSync(join(tmpdir(),'tecos-link-price-'));
  try{
    const src=join(dir,'src');cpSync(join(ROOT,'src'),src,{recursive:true});
    const patch=readFileSync(join(ROOT,'test/model/rom-link/history.patch'));
    execFileSync('git',['apply','--check','-'],{cwd:dir,input:patch,stdio:['pipe','pipe','pipe']});
    execFileSync('git',['apply','-'],{cwd:dir,input:patch,stdio:['pipe','pipe','pipe']});
    const transformed=transformSource(src),states=[],passes=[];
    let workspace=0xa000,origin=0x8000;
    for(let pass=1;pass<=8;pass++){
      const work=join(dir,'pass'+pass);mkdirSync(work);
      const sourceHash=stage(src,work,workspace,origin);
      const com=join(work,'TAS.COM');writeFileSync(com,pinnedBytes(ROOT,'TAS.COM'));
      const result=await assemble({dir:work,root:'ROM.ASM',out:'PRICE.HEX',com});
      assert.equal(result.code,0,result.console);assert.ok(result.bytes&&result.dbg,'missing HEX/debug pair');
      const map=parsePriceHex(Buffer.from(result.bytes)),dbg=Buffer.from(result.dbg);
      assert.ok(dbg.length>=128,'short debug');
      const header=dbg.subarray(-128),end=header.readUInt16LE(8)||0x10000;
      assert.ok(end>origin&&end<=0x10000,'debug extent');
      const dense=Buffer.alloc(Math.ceil((end-origin)/128)*128);
      for(const [address,value] of map){assert.ok(address>=origin&&address<end,'HEX/debug extent mismatch');dense[address-origin]=value;}
      const {globals}=decodeImage(dbg,dense,origin);
      const at=name=>{const s=globals.get(name);assert.ok(s&&s.kind==='label','missing label '+name);return s.value;};
      const range={ramStart:at('RAMBEG'),ramEnd:at('RAMEND'),workspace,romStart:at('RESET'),romEnd:at('CODEEND')};
      assert.equal(range.ramStart,origin);assert.equal(at('STARTED'),origin);
      assert.equal(globals.get('WSBASE')?.value,workspace);
      validatePriceRanges(map,range);
      assert.ok(at('BENTRY')>=origin&&at('BENTRY')<range.ramEnd,'BDOS must be in packet');
      for(const name of ['CCPENT','CCPBAS','SVCDSP',...transformed.consoleLabels])assert.ok(at(name)>=0xc000&&at(name)<range.romEnd,'retained ROM label '+name);
      const packet=dense.subarray(0,range.ramEnd-origin),tokens=parse(packet),packed=Buffer.from(encode(packet,tokens).bytes);
      assert.equal(Buffer.compare(Buffer.from(decode(packed,packet.length)),packet),0,'host codec roundtrip');
      const workspaceSpan=at('BDOSRME')-workspace;
      assert.ok(workspaceSpan>0&&workspaceSpan<0x2000,'workspace sizing');
      const state={...range,workspaceSpan,packetBytes:packet.length,packedBytes:packed.length,packetSHA256:sha(packet),packedSHA256:sha(packed)};
      passes.push({...state,pass,sourceSHA256:sourceHash,hexSHA256:sha(result.bytes),debugSHA256:sha(dbg),compilerTstates:result.tstates});
      if(placementDecision(states,state)==='stable'){
        assert.equal(range.ramEnd,workspace,'final packet must end immediately below workspace');
        assert.equal(workspace,0xbf00-workspaceSpan,'final workspace placement');
        const retained=dense.subarray(0xc000-origin,range.romEnd-origin);
        const layout=servicePrices(workspace,packet.length);
        return {schema:'tecos-protected-code-price-v1',diagnosticOnly:true,targetExecuted:false,sourcePin:git('rev-parse','HEAD'),frozenTargetPin:BASE,
          compilerPin:'7a217f96c76f11641af3fa0b22d0b34be6e2a467',compilerSHA256:sha(pinnedBytes(ROOT,'TAS.COM')),
          codecPin:'eee4ee6846add13c0ea120fbf2de8be0ec08c0b1',codecSHA256:CODEC,historyPatchSHA256:sha(patch),
          transformedBranches:transformed.changes,deferredEquates:transformed.deferredEquates,passes,retainedRomBytes:retained.length,retainedRomSHA256:sha(retained),packedBytes:packed.length,
          subtotalBytes:retained.length+packed.length,unpriced:['native decoder','bounds and checksum validation','header and metadata','cold installation','ROM-safe failure path'],
          layoutProposal:layout,layoutBasis:'Proposed starter-card arithmetic only. Staged ALVINIT is unchanged; cold installation and allocation changes are unpriced.',allProposedResidentCasesCoexist:layout.cases.every(c=>c.coexists),qualification:'Size/coexistence experiment only; no normal bootable artifact, reserve pass, runtime, timing, stack or board clearance.'};
      }
      workspace=0xbf00-workspaceSpan;origin=workspace-packet.length;
      assert.ok(origin>=0x8000&&origin<workspace,'packet placement outside protected classic region');
    }
    throw new Error('placement did not stabilise within eight passes');
  }finally{rmSync(dir,{recursive:true,force:true});}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'no target execution or output-image options');
  try{console.log(JSON.stringify(await priceLink(),null,2));}
  catch(error){console.error('Non-executing link price refused: '+error.message);process.exitCode=1;}
}
