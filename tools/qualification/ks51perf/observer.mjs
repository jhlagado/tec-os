// Optional external observation. No product imports and no instruction execution here.
export class RulerError extends Error {}
export const requireReading = (ok, message) => { if (!ok) throw new RulerError(message); };
const APIs = ['BREAD','BWRITE','CLOOK','CTAKE','CFILL','CWRITE','CRDREC','CWRREC','CFLALL','CFLUSH','CWBOOT','VFLUSH','SDREAD','SDWRITE','SPIR','SDCMD','SDRBLK','SDWBLK','MVCOPY','MNBLK','VMNT','VUNM'];
const CALL = new Set([0xcd,0xc4,0xcc,0xd4,0xdc,0xe4,0xec,0xf4,0xfc]);
export const BUCKETS = ['payload-shift','payload-bookkeeping','read-token-wait','write-response-wait','write-busy-wait','other-sd','cache-lookup','cache-state','copy-clear','other-storage','console-input','other-unattributed'];
const u16=(m,a)=>m.read(a)|(m.read((a+1)&65535)<<8);
const reg16=(cpu,a,b)=>((cpu[a]&255)<<8)|(cpu[b]&255);
export function makeClassifier(rows) {
  return (pc,calls) => {
    const row=rows[pc]; const file=row?.file ?? ''; const line=row?.line ?? 0;
    // SPIR serves several protocols: use its matched caller, not SPIR's PC alone.
    if(file==='sd.asm') {
      const polling=line>=62&&line<=88?calls.at(-1):null;
      if(polling?.caller?.file==='sd.asm' && [465,762,789].includes(polling.caller.line)) return ({465:'read-token-wait',762:'write-response-wait',789:'write-busy-wait'})[polling.caller.line];
      if(line>=463&&line<=477)return 'read-token-wait';
      if(line>=760&&line<=775)return 'write-response-wait';
      if(line>=781&&line<=798)return 'write-busy-wait';
      if((line>=525&&line<=646)||(line>=653&&line<=724)) {
        if((line>=544&&line<=586)||(line>=590&&line<=629)||(line>=665&&line<=714)) return 'payload-shift';
        return 'payload-bookkeeping';
      }
      return 'other-sd';
    }
    if(file==='cache.asm') {
      if(line>=695) return 'copy-clear';
      if(line>=59&&line<=116) return 'cache-lookup';
      if(line>=37&&line<=58&&calls.some(c=>c.caller?.file==='cache.asm'&&c.caller.line>=59&&c.caller.line<=116))return 'cache-lookup';
      if((line>=433&&line<=475)||(line>=532&&line<=547))return 'copy-clear';
      return 'cache-state';
    }
    if(['bios.asm','vol.asm','volsvc.asm','bdos.asm','bdosfile.asm','bdosfn.asm','bdoslog.asm','bdosrec.asm','ccpmut.asm','ccpfile.asm'].includes(file)) return 'other-storage';
    if(['console.asm','keyboard.asm','history.asm','bdoscon.asm','pico.asm','serial.asm'].includes(file)) return 'console-input';
    return 'other-unattributed';
  };
}
export function cacheState(m) {
  requireReading(m.expand?.length===2 && m.expand[1].length===16384,'unqualified 96K physical arrays');
  const b=m.expand[1]; const tags=[];
  for(let n=0;n<30;n++) { const o=0x3c00+n*4;tags.push((b[o]+b[o+1]*256+b[o+2]*65536+b[o+3]*16777216)>>>0); }
  return {tags,dirty:Array.from(b.subarray(0x3c80,0x3c9e)),next:m.read(m.sym('CNEXT')),bufok:m.read(m.sym('BUFOK')),latch:m.sysCtrl};
}
export class Observer {
  constructor(m,rows,{mode='aggregate',eventCap=25000}={}) {
    requireReading(['aggregate','detailed'].includes(mode),'unknown enabled observer mode');
    this.m=m;this.rows=rows;this.mode=mode;this.eventCap=eventCap;this.classify=makeClassifier(rows);
    this.start=m.cycles;this.buckets=Object.fromEntries(BUCKETS.map(n=>[n,0]));
    this.phaseAccounts={};this.calls=[];this.active=[];this.events=[];this.counts={};this.lbas=new Map();this.steps=0;this.eventCount=0;
    this.apiAt=new Map();for(const n of APIs) if(m.symbols.has(n)) this.apiAt.set(m.sym(n),[...(this.apiAt.get(m.sym(n))??[]),n]);
    this.apiAt.set(5,['BDOS']);this.savedStep=m.step; const base=m.step.bind(m); m.step=()=>this.step(base);
    this.savedMethods={};this.savedIoWrite=m.cpu.hardware.ioWrite;const io=this.savedIoWrite.bind(m.cpu.hardware);m.cpu.hardware.ioWrite=(port,value)=>{if((port&255)===255){this.count('latch.writes');if(this.active.some(a=>a.name==='MVCOPY'))this.count('copy.latch.writes');}return io(port,value);};this.attachSd();
  }
  account(){const p=this.phase??'unset';return this.phaseAccounts[p]??=( {cycles:0,buckets:Object.fromEntries(BUCKETS.map(n=>[n,0])),counts:{},lbaReferences:{}} );}
  count(n,amount=1){this.counts[n]=(this.counts[n]??0)+amount;const c=this.account().counts;c[n]=(c[n]??0)+amount;}
  event(e){
    requireReading(++this.eventCount<=this.eventCap,'observer event budget exhausted; result invalid');
    if(this.mode==='detailed')this.events.push(structuredClone({cycle:this.m.cycles,phase:this.phase??'unset',...e}));
  }
  lba(){const m=this.m;const a=m.sym('SDLBA');return (u16(m,a)+u16(m,a+2)*65536)>>>0;}
  cause(){const names=this.active.map(a=>a.name);const callers=this.calls.map(c=>c.caller);
    if(this.active.some(a=>a.name==='BDOS'&&a.function===48))return 'bdos48';
    if(names.includes('CWBOOT'))return 'warmboot';
    if(callers.some(r=>r?.file==='volsvc.asm'&&r.line===259))return 'mount';
    if(callers.some(r=>r?.file==='volsvc.asm'&&r.line===333))return 'unmount';
    if(names.includes('CFLUSH'))return 'directory-other-data';
    if(names.includes('CTAKE'))return 'dirty-eviction';
    if(names.includes('BWRITE'))return (this.m.read(this.m.sym('CWTYPE'))&3)===1?'directory-own':'through-data';
    return 'other-unattributed';
  }
  attachSd(){const sd=this.m.sd;requireReading(sd,'SD model required');
    const wrap=(name,fn)=>{requireReading(typeof sd[name]==='function',`missing pinned SD method ${name}`);const original=sd[name];this.savedMethods[name]=original;sd[name]=(...a)=>fn(original.bind(sd),...a);};
    wrap('handleCommand',(call,c)=>{const sent=this.active.findLast(a=>a.name==='SDCMD');requireReading(sent&&sent.inputA===c.cmd&&sent.commandArgument===c.arg,'decoded wire command differs from ROM request');this.count(`cmd${c.cmd}.issued`);this.event({kind:'command',...c});return call(c);});
    wrap('readBlock',(call,arg)=>{const result=call(arg);requireReading(result.length===512,'model block supply is not512 bytes');this.count('model.read.supplied');this.event({kind:'model-read-supply',arg});return result;});
    wrap('read',(call)=>{const r=call();if(this.active.some(a=>a.name==='SDRBLK'))this.count('read.payload.sampled-bits');return r;});
    wrap('consumeWriteByte',(call,b)=>{const state=sd.writeState;const before=state?.index??0;const r=call(b);if(state&&!state.awaitingToken&&state.index>before)this.count('write.payload.accepted-bytes',state.index-before);return r;});
    wrap('commitWrite',(call)=>{const state=sd.writeState;const start=state?.start;const complete=state?.index===512&&state.crcRemaining===0;
      const r=call();if(complete){this.count('model.write.committed');this.event({kind:'model-write-commit',start,lba:start/512});}return r;});
  }
  enter(pc,sp){const m=this.m;for(const name of this.apiAt.get(pc)??[]) {
    if(this.active.some(a=>a.name===name&&a.sp===sp))continue;
    const a={name,sp,ret:u16(m,sp),start:m.cycles,lba:this.lba(),inputA:m.cpu.cpu.a,inputHL:reg16(m.cpu.cpu,'h','l'),inputDE:reg16(m.cpu.cpu,'d','e'),inputBC:reg16(m.cpu.cpu,'b','c'),cause:this.cause()};
    if(['CLOOK','CTAKE','CFILL','CWRITE'].includes(name))a.cache=cacheState(m);
    if(name==='SDCMD'){const x=m.sym('SDARG');a.commandArgument=(m.read(x)*16777216+m.read(x+1)*65536+m.read(x+2)*256+m.read(x+3))>>>0;}
    if(name==='SPIR')a.caller=this.calls.at(-1)?.caller;
    if(['SDREAD','SDWRITE'].includes(name)){a.protocol={};a.beforeCounts={...this.counts};}
    if(name==='BDOS'){a.function=m.cpu.cpu.c;if(a.function===48)this.count('BDOS48.attempt');if([15,16,19,20,21,22,23,33].includes(a.function))a.fcb=Array.from({length:36},(_,i)=>m.read((a.inputDE+i)&65535));}
    if(name==='MVCOPY'){a.sourceBank=m.read(m.sym('XMSRC'));a.destinationBank=m.read(m.sym('XMDST'));}
    this.active.push(a);this.count(name+'.attempt');if(name!=='SPIR')this.event({kind:'entry',...a});
    if(['BREAD','BWRITE'].includes(name))this.count('logical-records.attempted');
    if(name==='CLOOK'){const key=String(a.lba);this.lbas.set(key,(this.lbas.get(key)??0)+1);this.event({kind:'lba-reference',lba:a.lba});const refs=this.account().lbaReferences;refs[key]=(refs[key]??0)+1;}
  }}
  returns(){const m=this.m;const sp=m.cpu.cpu.sp;const pc=m.pc;
    for(let i=this.active.length-1;i>=0;i--) {const a=this.active[i];if(pc!==a.ret||sp!==((a.sp+2)&65535))continue;
      this.active.splice(i,1);const z=!!m.cpu.cpu.flags.Z;this.count(a.name+'.returned');if(a.name==='BDOS'&&a.function===48){requireReading(u16(m,m.sym('OLDSP'))===a.sp,'BDOS48 OLDSP does not match public caller');this.count('BDOS48.returned');}
      if(a.name==='SPIR'){const parent=this.active.findLast(x=>['SDREAD','SDWRITE'].includes(x.name));const line=a.caller?.file==='sd.asm'?a.caller.line:0;if(parent){if(line===465&&m.cpu.cpu.a===254)parent.protocol.readToken=true;if([490,491].includes(line))parent.protocol.crcBytes=(parent.protocol.crcBytes??0)+1;if(line===762&&(m.cpu.cpu.a&31)===5)parent.protocol.writeAccepted=true;if(line===789&&m.cpu.cpu.a!==0)parent.protocol.busyReleased=true;}}
      if(['SDREAD','SDWRITE'].includes(a.name)){if(z){const delta=k=>(this.counts[k]??0)-(a.beforeCounts[k]??0);if(a.name==='SDREAD')requireReading(delta('cmd17.issued')===1&&delta('read.payload.sampled-bits')===4096&&a.protocol.readToken&&a.protocol.crcBytes===2,'successful read lacks complete protocol trace');else requireReading(delta('cmd24.issued')===1&&delta('write.payload.accepted-bytes')===512&&a.protocol.writeAccepted&&a.protocol.busyReleased,'successful write lacks complete protocol trace');}this.count(a.name+(z?'.completed':'.failed'));this.count('cause.'+a.cause+'.'+a.name+(z?'.completed':'.failed'));}
      if(a.name==='CLOOK')this.count(z?'cache.hit':'cache.miss');
      if(a.name==='SDCMD'&&[17,24].includes(a.inputA))this.count(`cmd${a.inputA}.r1-`+(m.cpu.cpu.a===0?'zero':'nonzero'));
      if(a.name==='CTAKE'){this.count(z?'allocation.success':'allocation.failure');if(a.cache.dirty.every(Boolean))this.count(z?'allocation.forced-dirty.success':'allocation.forced-dirty.failure');}
      if(a.name==='MVCOPY')this.count('copy.requested-bytes-returned',a.inputBC);
      if(['SDRBLK','SDWBLK'].includes(a.name)){requireReading(((reg16(m.cpu.cpu,'h','l')-a.inputHL)&65535)===512,'payload routine did not advance512');this.count(a.name+'.payload512-returned');}
      if(a.name!=='SPIR')this.event({kind:'return',name:a.name,cycles:m.cycles-a.start,z,a:m.cpu.cpu.a,sderr:m.read(m.sym('SDERR')),entry:a,...(a.cache?{cache:cacheState(m)}:{})});
    }
    for(let i=this.calls.length-1;i>=0;i--){const c=this.calls[i];if(pc===c.ret&&sp===c.sp){this.calls.splice(i);break;}}
  }
  step(base){this.returns();const m=this.m;const pc=m.pc,sp=m.cpu.cpu.sp,before=m.cycles;this.enter(pc,sp);
    const bucket=this.classify(pc,this.calls);const row=this.rows[pc];if(row?.file==='cache.asm'&&row.line===808)this.count('copy.byte-loop.bytes');if(row?.file==='cache.asm'&&[784,836].includes(row.line))this.count(row.line===784?'copy.fixed-prefix.ldir-bytes':'copy.equal-view.ldir-bytes',reg16(m.cpu.cpu,'b','c')||65536);if(row?.file==='cache.asm'&&row.line===545)this.count('clear.bytes',512);const op=m.read(pc);const ret=(pc+3)&65535;const result=base();
    requireReading(Number.isSafeInteger(result?.cycles)&&result.cycles>0,'unknown, zero or fractional runtime cycle result');
    requireReading(m.cycles-before===result.cycles,'Machine/runtime cycle mismatch');
    this.buckets[bucket]+=result.cycles;const phase=this.account();phase.cycles+=result.cycles;phase.buckets[bucket]+=result.cycles;this.steps++;
    if(CALL.has(op)&&m.cpu.cpu.sp===((sp-2)&65535))this.calls.push({ret,sp,caller:this.rows[pc]??null});
    this.returns();return result;
  }
  snapshot(){this.returns();const total=this.m.cycles-this.start;requireReading(Object.values(this.buckets).reduce((a,b)=>a+b,0)===total,'exclusive cycle partition mismatch');
    return structuredClone({cycles:total,phaseAccounts:this.phaseAccounts,steps:this.steps,buckets:this.buckets,counts:this.counts,eventCount:this.eventCount,events:this.events,lbaReferences:Object.fromEntries(this.lbas),completeWorkingSet:this.lbas.size,recurringWorkingSet:[...this.lbas.values()].filter(n=>n>1).length,capacity:30,capacityClass:this.lbas.size<30?'below':this.lbas.size===30?'at':'above',openApiIntervals:this.active});
  }
  detach(){this.m.step=this.savedStep;this.m.cpu.hardware.ioWrite=this.savedIoWrite;for(const [name,f] of Object.entries(this.savedMethods))this.m.sd[name]=f;}
}
export function validateTiming(readings){for(const x of readings){requireReading(x.actual===x.expected,`timing mismatch ${x.name}`);requireReading(x.actual>0,'zero timing');}}
export function validateTotals(s){if(s.phaseAccounts){requireReading(Object.values(s.phaseAccounts).reduce((n,p)=>n+p.cycles,0)===s.cycles,'phase cycles do not sum');for(const p of Object.values(s.phaseAccounts))requireReading(Object.values(p.buckets).reduce((a,b)=>a+b,0)===p.cycles,'phase bucket sum differs');}requireReading(Object.values(s.buckets).reduce((a,b)=>a+b,0)===s.cycles,'bad partition');requireReading((s.counts['SDWRITE.completed']??0)<=(s.counts['SDWRITE.attempt']??0),'completion exceeds attempts');requireReading((s.counts['SDREAD.completed']??0)<=(s.counts['SDREAD.attempt']??0),'read completion exceeds attempts');}
