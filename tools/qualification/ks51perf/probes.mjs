// Bounded actual-ROM account contrasts. Prepared source; never evaluated here.
import {Observer,requireReading} from './observer.mjs';
import {validateCopyPath,validateCauses,validateExplicitFlush} from './accounts.mjs';
export function qualifyAccounts({rt,input,machine,fixture,boot,rpc,pattern,rejectReading}){
  const copy=[],causes=[],controls=[];
  const physical=(m,bank,address)=>address<0x8000?m.main[0][address]:m.expand[bank][address-0x8000];
  const put=(m,bank,address,value)=>{if(address<0x8000)m.main[0][address]=value;else m.expand[bank][address-0x8000]=value;};
  const copyCases=[
    {id:'zero',n:0,sourceBank:0,destinationBank:0,source:0x2000,destination:0x3000,equal:0,prefix:0,byte:0,latches:0},
    {id:'equal-view32',n:32,sourceBank:0,destinationBank:0,source:0x2000,destination:0x3000,equal:32,prefix:0,byte:0,latches:2},
    {id:'fixed-prefix128',n:128,sourceBank:1,destinationBank:0,source:0x8000,destination:0x3000,equal:0,prefix:128,byte:0,latches:3},
    {id:'byte-window128',n:128,sourceBank:1,destinationBank:0,source:0x8000,destination:0x9000,equal:0,prefix:0,byte:128,latches:257},
    {id:'cross8000-split128',n:128,sourceBank:1,destinationBank:0,source:0x8000,destination:0x7fc0,equal:0,prefix:64,byte:64,latches:131},
  ];
  const reversed=copyCases.filter(c=>c.sourceBank!==c.destinationBank).map(c=>({...c,id:c.id+'-reverse',sourceBank:c.destinationBank,destinationBank:c.sourceBank,source:c.destination,destination:c.source}));
  for(const c of [...copyCases,...reversed])for(const iff of [0,1]){
    const cell={workflow:'copy',size:'small',policy:'through',thermal:'cold'};
    const m=machine(rt,input,fixture(rt,cell));boot(m);
    for(let i=0;i<c.n;i++){put(m,c.sourceBank,c.source+i,(i*11+7)&255);put(m,c.destinationBank,c.destination+i,0x55);}
    m.write(m.sym('XMSRC'),c.sourceBank);m.write(m.sym('XMDST'),c.destinationBank);
    const cpu=m.cpu.cpu;cpu.iff1=iff;cpu.iff2=iff;cpu.b_prime=0x12;cpu.c_prime=0x34;cpu.d_prime=0x56;cpu.e_prime=0x78;
    const latch=m.sysCtrl;const writeStart=m.expand1Writes.length;
    const obs=new Observer(m,input.rows,{mode:'detailed'});const result=rpc(m,'MVCOPY',{bc:c.n,de:c.source,hl:c.destination});
    const reading=obs.snapshot();obs.detach();
    const expected={'MVCOPY.attempt':1,'MVCOPY.returned':1,'copy.requested-bytes-returned':c.n,'copy.equal-view.ldir-bytes':c.equal,'copy.fixed-prefix.ldir-bytes':c.prefix,'copy.byte-loop.bytes':c.byte,'copy.latch.writes':c.latches};
    validateCopyPath(reading,expected);requireReading(result.a===0&&m.sysCtrl===latch&&cpu.iff1===iff&&cpu.iff2===iff,'MVCOPY result/latch/IFF differs');
    requireReading(cpu.b_prime===0x12&&cpu.c_prime===0x34&&cpu.d_prime===0x56&&cpu.e_prime===0x78,'MVCOPY alternate BC/DE differs');
    for(let i=0;i<c.n;i++)requireReading(physical(m,c.destinationBank,c.destination+i)===((i*11+7)&255),'MVCOPY actual destination differs');
    // Direct internal-helper calls deliberately lack a cache caller. Retain the
    // existing guard's observations; permit only writes in this exact test span.
    const writes=m.expand1Writes.slice(writeStart);
    requireReading(writes.length===(c.destinationBank===1?c.n:0),'synthetic copy write census differs');
    requireReading(writes.every(w=>c.destinationBank===1&&w.addr>=c.destination&&w.addr<c.destination+c.n),'unexpected expansion write outside synthetic copy span');
    if(c.n)controls.push(rejectReading(`zero-copy-counter-${c.id}-iff${iff}`,()=>validateCopyPath({...reading,counts:{...reading.counts,'copy.requested-bytes-returned':0}},expected)));
    copy.push({case:c,iff,reading,result,expected,syntheticInternalCallWrites:writes});
  }
  function card(){const image=rt.createContainer([{geometry:'G1M',label:'SYSTEM',mount:'A'},{geometry:'G8M',label:'WORK',mount:'B',writeBehind:true},{geometry:'G1M',label:'SPARE'}]);
    const v=rt.findVolume(rt.parseContainer(image),'A');new rt.CpmVolume(rt.volumePayload(image,v),v.g).write('STARTUP.CMD',Buffer.from('CON PICO 40\r\n\x1a','latin1'));return image;}
  function fresh(){const m=machine(rt,input,card());boot(m);for(let a=0;a<30;a++)rpc(m,'CDROP',{a});return m;}
  function writeRecord(m,drive,record,type=0,seed=51){
    const selected=rpc(m,'BSELDSK',{bc:drive});requireReading(selected.hl!==0,'ruler drive refused');
    rpc(m,'BSETTRK',{bc:Math.floor(record/64)});rpc(m,'BSETSEC',{bc:record%64});rpc(m,'BSETDMA',{bc:0x2000});
    const descriptor=rt.findVolume(rt.parseContainer(m.sdImage),drive===0?'A':'B');
    const existing=m.sdImage.subarray(descriptor.start*512+record*128,descriptor.start*512+record*128+128);
    const bytes=type===1?existing:pattern(128,seed);
    for(let i=0;i<128;i++)m.write(0x2000+i,bytes[i]);
    requireReading(rpc(m,'BWRITE',{bc:type}).a===0,'ruler BIOS write failed');
  }
  function record(id,m,obs,expected){const reading=obs.snapshot();obs.detach();validateCauses(reading,expected);
    const wrong=structuredClone(reading);for(const key of Object.keys(wrong.counts))if(/^cause\..*\.SDWRITE\.(completed|failed)$/.test(key))delete wrong.counts[key];wrong.counts['cause.wrong-constant.SDWRITE.completed']=wrong.counts['SDWRITE.attempt'];
    controls.push(rejectReading(`wrong-flush-cause-${id}`,()=>validateCauses(wrong,expected)));causes.push({id,expected,reading});return reading;}
  for(const id of ['through-data','dirty-eviction','directory','warmboot','mount','unmount']){
    const m=fresh();const obs=new Observer(m,input.rows,{mode:'detailed'});
    let expected;
    if(id==='through-data'){writeRecord(m,0,128);expected={'cause.through-data.SDWRITE.completed':1};}
    else if(id==='dirty-eviction'){for(let i=0;i<31;i++)writeRecord(m,1,128+4*i,0,51+i);expected={'cause.dirty-eviction.SDWRITE.completed':1};}
    else{
      writeRecord(m,1,128);
      if(id==='directory'){writeRecord(m,1,0,1);expected={'cause.directory-other-data.SDWRITE.completed':1,'cause.directory-own.SDWRITE.completed':1};}
      if(id==='warmboot'){requireReading(rpc(m,'CWBOOT').z,'warm flush failed');expected={'cause.warmboot.SDWRITE.completed':1};}
      if(id==='mount'){requireReading(!rpc(m,'VSMNT',{bc:0x0100,de:2}).carry,'mount flush failed');expected={'cause.mount.SDWRITE.completed':1};}
      if(id==='unmount'){requireReading(!rpc(m,'VSUNM',{bc:0x0100}).carry,'unmount flush failed');expected={'cause.unmount.SDWRITE.completed':1};}
    }
    record(id,m,obs,expected);
  }
  // Public BDOS entry0005h, not FNFLSH's jumped body or BDOS private stack.
  const m=fresh();const obs=new Observer(m,input.rows,{mode:'detailed'});const flushReturns=[];
  const flush=expected=>{const r=rpc(m,5,{bc:48});requireReading(r.a===expected&&r.sp===0x7002,'public BDOS48 result/return stack differs');
    requireReading(!obs.active.some(a=>a.name==='BDOS'&&a.function===48),'BDOS48 remains active after real OLDSP return');flushReturns.push(r);};
  writeRecord(m,1,128,0,61);flush(0);writeRecord(m,0,128,0,62);
  writeRecord(m,1,132,0,63);const commit=m.sd.commitWrite;m.sd.commitWrite=function(){commit.call(this);this.pendingResponse=[0x0b,0xff];};flush(255);m.sd.commitWrite=commit;
  writeRecord(m,0,132,0,64);writeRecord(m,1,136,0,65);flush(0);
  const explicit=obs.snapshot();obs.detach();validateExplicitFlush(explicit);
  const stale=structuredClone(explicit);stale.openApiIntervals.push({name:'BDOS',function:48});controls.push(rejectReading('stale-BDOS48-frame',()=>validateExplicitFlush(stale)));
  const wrong=structuredClone(explicit);wrong.counts['cause.bdos48.SDWRITE.completed']+=2;delete wrong.counts['cause.through-data.SDWRITE.completed'];controls.push(rejectReading('BDOS48-borrows-following-normal-writes',()=>validateExplicitFlush(wrong)));
  causes.push({id:'public-BDOS48-success-failure-repeat',reading:explicit,flushReturns});
  return {copy,causes,controls,status:'ACCOUNTS_PASSED_RUNTIME_ONLY'};
}
