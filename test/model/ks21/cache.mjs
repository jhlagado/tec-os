// KS21's cache, modelled over today's ROM. The machine runs as it is; each
// BIOS READ and WRITE is followed from entry to return, with the card block
// it maps (SDLBA at GETBLKW) and the time it spends in SDREAD and SDWRITE.
// A cache of the brief's design, 30 lines, round robin, one volume written
// behind, is kept beside it, and each operation's cost is replaced by what
// the cache would spend:
//
//   READ, hit:   today's cost less its card read and its record LDIR, plus
//                a lookup and the record's copy from the line to DSKDMA.
//   READ, miss:  today's cost, with a card read where today BLKBUF already
//                held the block, plus a lookup and the line's fill from
//                BLKBUF, and the write of a dirty line taken for it.
//   WRITE, write-through: today's cost plus a lookup, and the line's
//                refresh from BLKBUF when the block has one.
//   WRITE, write-behind: no card write; the record is copied into the line
//                (filled first on a miss, as a read is), which is dirty. A
//                directory write then writes every dirty line of the volume
//                and the directory line itself.
//   Warm boot:   every dirty line written.
//
// A line written costs a line copy to BLKBUF and the average SDWRITE. The
// cache's timing is modelled; the machine's data are today's.

import { w } from "../ks20/lib.mjs";

export const LINES = 30;

/** The copy costs, in T-states, from copy.mjs, and the lookup's. */
export function costs(copy, variant = "mvbl", lookup) {
  copy = { ...copy, lookup };
  // "direct": the bound if the card's block loop ran with the line in view,
  // so no line copy at all.
  const line = variant === "direct" ? 0 : copy.line[variant].lineToBlkbuf.t;
  const rec = copy.record;
  return {
    line,
    recordBelow: rec["0080h (below 8000h)"].lineToDma,
    recordAbove: rec["9000h (at or above 8000h)"].lineToDma,
    recordStraddle: rec["7FC0h (64 bytes each side)"].lineToDma,
    ldir: copy.todayRecordLdir,
    lookupHit: copy.lookup.hitMiddle.t,
    lookupMiss: copy.lookup.miss.t,
  };
}

/**
 * Follow M's disk operations and model the cache. wb: the drive (0-3)
 * written behind, or null for every volume written through; null cache
 * (lines 0) gives today's ROM. Returns the model's state; its `delta` is
 * the T-states the cache would add (negative: save) so far.
 */
export function attach(m, { wb = null, lines = LINES, cost }) {
  const S = (n) => m.sym(n);
  const at = { bread: S("BREAD"), bwrite: S("BWRITE"), getblk: S("GETBLKW"), sdread: S("SDREAD"), sdwrite: S("SDWRITE"), wboot: S("WBOOTR") };
  const idle = [["CINLP", "CINWE"], ["CINMX", "CINME"]].map(([a, b]) => [S(a), S(b)]);
  const st = {
    delta: 0,
    lastDisk: 0,
    active: 0,
    cache: Array.from({ length: lines }, () => null), // { drive, block, dirty }
    next: 0,
    counts: { readHit: 0, readMiss: 0, writeHit: 0, writeMiss: 0, linesWritten: 0, flushes: 0, cardReads: 0, cardWrites: 0 },
    avg: { r: 217_248, w: 214_907, nr: 0, nw: 0 },
  };
  let op = null;
  let sd = null;
  const recordCost = (dma) => (dma + 128 <= 0x8000 ? cost.recordBelow : dma >= 0x8000 ? cost.recordAbove : cost.recordStraddle);
  const writeLine = () => {
    st.counts.linesWritten += 1;
    return cost.line + st.avg.w;
  };
  const find = (drive, block) => st.cache.findIndex((l) => l && l.drive === drive && l.block === block);
  /** A line for a new block: the next clean one in turn, else the next written. */
  const take = (drive, block) => {
    let extra = 0;
    let i = -1;
    for (let k = 0; k < lines && i < 0; k += 1) {
      const j = (st.next + k) % lines;
      if (!st.cache[j] || !st.cache[j].dirty) i = j;
    }
    if (i < 0) {
      i = st.next;
      extra += writeLine();
    }
    st.cache[i] = { drive, block, dirty: false };
    st.next = (i + 1) % lines;
    return { i, extra };
  };
  const finish = (o) => {
    const actual = m.cycles - o.t0;
    st.lastDisk = m.cycles;
    if (!lines || o.block === null) return;
    const hitAt = find(o.drive, o.block);
    let model;
    if (o.kind === "read") {
      if (hitAt >= 0) {
        st.counts.readHit += 1;
        model = actual - o.sdr - cost.ldir + cost.lookupHit + recordCost(o.dma);
      } else {
        st.counts.readMiss += 1;
        const { extra } = take(o.drive, o.block);
        model = actual + (o.nr ? 0 : st.avg.r) + cost.lookupMiss + cost.line + extra;
      }
    } else if (o.drive !== wb) {
      model = actual + (hitAt >= 0 ? cost.lookupHit + cost.line : cost.lookupMiss);
      st.counts[hitAt >= 0 ? "writeHit" : "writeMiss"] += 1;
    } else {
      let i = hitAt;
      let fill = 0;
      if (i < 0) {
        st.counts.writeMiss += 1;
        const t = take(o.drive, o.block);
        i = t.i;
        fill = t.extra + cost.line + (o.nr || o.cleared ? o.sdr : st.avg.r);
      } else st.counts.writeHit += 1;
      model = actual - o.sdr - o.sdw - cost.ldir + (hitAt >= 0 ? cost.lookupHit : cost.lookupMiss) + recordCost(o.dma) + fill;
      st.cache[i].dirty = true;
      if (o.type === 1) {
        // A directory write: the volume's dirty data lines, then the directory line.
        for (const l of st.cache) if (l && l.dirty && l.drive === wb && l !== st.cache[i]) [(model += writeLine()), (l.dirty = false)];
        model += writeLine();
        st.cache[i].dirty = false;
        st.counts.flushes += 1;
      }
    }
    st.delta += model - actual;
  };
  const step = m.step.bind(m);
  m.step = () => {
    const pc = m.pc;
    const c = m.cpu.cpu;
    if (sd === null && (pc === at.sdread || pc === at.sdwrite)) sd = { kind: pc === at.sdread ? "r" : "w", t0: m.cycles, ret: w(m, c.sp), sp: c.sp };
    if (!op && (pc === at.bread || pc === at.bwrite))
      op = { kind: pc === at.bread ? "read" : "write", type: c.c, t0: m.cycles, ret: w(m, c.sp), sp: c.sp, sdr: 0, sdw: 0, nr: 0, block: null, drive: 0, dma: w(m, S("DSKDMA")), cleared: false };
    if (op && pc === at.getblk) {
      op.block = w(m, S("SDLBA")) + w(m, S("SDLBA") + 2) * 0x10000;
      op.drive = m.read(S("DSKCUR"));
      op.cleared = c.c !== 0;
    }
    if (pc === at.wboot && lines) {
      for (const l of st.cache) if (l && l.dirty) [(st.delta += writeLine()), (l.dirty = false)];
    }
    const before = m.cycles;
    const r = step();
    if (!idle.some(([a, b]) => pc >= a && pc < b)) st.active += m.cycles - before;
    const sp = m.cpu.cpu.sp;
    if (sd && m.pc === sd.ret && sp === sd.sp + 2) {
      const t = m.cycles - sd.t0;
      if (sd.kind === "r") [(st.counts.cardReads += 1), (st.avg.nr += 1), (st.avg.r += (t - st.avg.r) / Math.min(st.avg.nr, 50))];
      else [(st.counts.cardWrites += 1), (st.avg.nw += 1), (st.avg.w += (t - st.avg.w) / Math.min(st.avg.nw, 50))];
      if (op) op[sd.kind === "r" ? "sdr" : "sdw"] += t;
      if (op && sd.kind === "r") op.nr += 1;
      sd = null;
    }
    if (op && m.pc === op.ret && sp === op.sp + 2) {
      finish(op);
      op = null;
    }
    return r;
  };
  /** The modelled T-states of the work since mark (idle input waits left out). */
  st.mark = () => ({ active: st.active, delta: st.delta });
  st.since = (mk) => Math.round(st.active - mk.active + st.delta - mk.delta);
  return st;
}
