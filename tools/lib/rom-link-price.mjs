// Validation and placement arithmetic for a non-executing link experiment.
import assert from 'node:assert/strict';

export function parsePriceHex(raw) {
  const eof=Buffer.from(':00000001FF\r\n'), at=raw.indexOf(eof);
  assert.ok(at>=0,'canonical EOF missing');
  const end=at+eof.length;
  assert.ok(raw.subarray(end).every(b=>b===0||b===0x1a),'data after EOF');
  const text=raw.subarray(0,end).toString('ascii');
  assert.ok(raw.subarray(0,end).every(b=>b<128),'non-ASCII HEX');
  const rows=text.slice(0,-2).split('\r\n'), map=new Map();
  for (const [i,row] of rows.entries()) {
    assert.match(row,/^:[0-9A-F]+$/,'HEX spelling');
    assert.equal(row.length%2,1,'HEX nibble count');
    const bytes=Buffer.from(row.slice(1),'hex');
    assert.ok(bytes.length>=5,'short HEX record');
    assert.equal(bytes.length,bytes[0]+5,'HEX byte count');
    assert.equal(bytes.reduce((s,b)=>(s+b)&255,0),0,'HEX checksum');
    const address=bytes.readUInt16BE(1),type=bytes[3];
    if (type===1) {
      assert.equal(row,':00000001FF','canonical EOF');
      assert.equal(i,rows.length-1,'EOF before final record');
      continue;
    }
    assert.equal(type,0,'unsupported HEX record');
    assert.ok(bytes[0]>0&&bytes[0]<=16&&address+bytes[0]<=0x10000,'HEX range');
    for (let n=0;n<bytes[0];n++) {
      assert.ok(!map.has(address+n),'overlapping HEX data');
      map.set(address+n,bytes[4+n]);
    }
  }
  return map;
}

export function validatePriceRanges(map,{ramStart,ramEnd,workspace,romStart,romEnd}) {
  assert.ok(Number.isInteger(ramStart)&&ramStart>=0x8000&&ramStart<ramEnd&&ramEnd<=workspace,'RAM range');
  assert.ok(workspace<romStart&&romStart===0xc000&&romEnd>romStart&&romEnd<=0x10000,'ROM/workspace range');
  assert.equal(map.keys().next().value,ramStart,'first emitted address');
  for (let a=ramStart;a<ramEnd;a++) assert.ok(map.has(a),'packet coverage');
  for (const a of map.keys()) {
    assert.ok((a>=ramStart&&a<ramEnd)||(a>=romStart&&a<romEnd),'data outside declared packet/ROM, including workspace reservations');
  }
  for (let a=romStart;a<romEnd;a++) assert.ok(map.has(a),'ROM coverage');
}

export function servicePrices(workspace,packetBytes) {
  assert.ok(Number.isInteger(workspace)&&Number.isInteger(packetBytes)&&packetBytes>0,'layout inputs');
  const codeBase=workspace-packetBytes,stub=codeBase-1024-3;
  const ceiling=Math.floor(stub/256)*256,baselineStub=workspace-1024-3;
  const baselineCeiling=Math.floor(baselineStub/256)*256;
  assert.ok(codeBase>=0x8000&&workspace<0xc000,'protected placement');
  const cases=[['shell17',17],['shell17+GLCD3+MON319',39],['shell10',10],['shell10+GLCD3+MON319',32]];
  return {codeBase,stub,bareTpa:stub-0x100,baselineBareTpa:baselineStub-0x100,bareTpaLoss:packetBytes,cases:cases.map(([name,pages])=>{
    const top=ceiling-pages*256;
    return {name,pages,top,tpa:top-0x100,baselineTpa:baselineCeiling-pages*256-0x100,tpaLoss:baselineCeiling-ceiling,coexists:top>=0x8000};
  })};
}

export function placementDecision(prior,state) {
  const key=JSON.stringify(state);
  if (prior.at(-1)===key) return 'stable';
  assert.ok(!prior.includes(key),'non-adjacent placement cycle');
  assert.ok(prior.length<8,'placement pass bound');
  prior.push(key);
  return 'continue';
}

// EQU needs a known value in TAS even where instruction operands can use
// forward references. Defer only workspace-derived aliases, in dependency
// order; leave every emitting statement and unrelated constant in place.
export function deferWorkspaceEquates(sources, workspaceNames) {
  const definitions=[];
  for (const [file,text] of sources) for (const [line,source] of text.split('\n').entries()) {
    const m=source.match(/^([A-Z_][A-Z0-9_]*)\s+EQU\s+(.+)$/i);
    if (!m) continue;
    const expression=m[2].split(';')[0].replace(/'[^']*'|"[^"]*"|\$[0-9A-F]+/gi,'');
    const dependencies=(expression.match(/\b[A-Z_][A-Z0-9_]*\b/gi)??[]).map(x=>x.toUpperCase());
    definitions.push({file,line:line+1,name:m[1].toUpperCase(),source,dependencies});
  }
  const late=new Set(workspaceNames);
  for(let round=0;round<definitions.length;round++) {
    let changed=false;
    for(const d of definitions) if(!late.has(d.name)&&d.dependencies.some(n=>late.has(n))){late.add(d.name);changed=true;}
    if(!changed)break;
  }
  const selected=definitions.filter(d=>late.has(d.name));
  assert.equal(new Set(selected.map(d=>d.name)).size,selected.length,'duplicate deferred alias');
  const selectedNames=new Set(selected.map(d=>d.name)),resolved=new Set(workspaceNames),ordered=[];
  let pending=[...selected];
  while(pending.length) {
    const ready=pending.filter(d=>d.dependencies.every(n=>!selectedNames.has(n)||resolved.has(n)));
    assert.ok(ready.length,'cyclic deferred workspace aliases');
    for(const d of ready){ordered.push(d);resolved.add(d.name);}
    const names=new Set(ready.map(d=>d.name));pending=pending.filter(d=>!names.has(d.name));
  }
  const moved=new Set(selected.map(d=>d.file+':'+d.line));
  const rewritten=new Map([...sources].map(([file,text])=>[file,text.split('\n').map((line,i)=>moved.has(file+':'+(i+1))?'; Deferred workspace alias':line).join('\n')]));
  return {rewritten,declarations:ordered,text:ordered.map(d=>d.source).join('\n')+'\n'};
}
