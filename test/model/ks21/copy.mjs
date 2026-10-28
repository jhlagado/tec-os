// KS21's choices 1 and 2: the copies the cache adds, timed on the product's
// copy core (MVCOPY) on the 96K harness, whose EXPAND 1 the model can read;
// and two faster 512-byte copies from copies.asm, timed and checked the
// same way.

import { resolve } from "node:path";
import { assemble, call, fixtures, machine as harness } from "../ks20/lib.mjs";
import { HERE } from "./here.mjs";

const { boot, standardCard } = fixtures;

function machine96() {
  const m = boot(standardCard(), { ram96: true });
  for (let i = 0; i < 0x4000; i += 1) m.expand[1][i] = (i * 7 + 3) & 0xff;
  return m;
}

/** Bank b's bytes at a..a+n (bank 1 is EXPAND 1; bank 0 the program's view). */
const bytes = (m, b, a, n) => Array.from({ length: n }, (_, i) => (b === 1 ? m.expand[1][a + i - 0x8000] : m.read(a + i)));

/** MVCOPY, the copy core behind MOVE's range check: n bytes from src in bank sb to dst in bank db. */
function core(m, { db, sb, dst, src, n }) {
  m.write(m.sym("XMDST"), db);
  m.write(m.sym("XMSRC"), sb);
  const want = bytes(m, sb, src, n);
  const r = call(m, m.sym("MVCOPY"), { hl: dst, de: src, bc: n });
  const ok = JSON.stringify(bytes(m, db, dst, n)) === JSON.stringify(want);
  return { t: r.t, ok };
}

export async function copyModel() {
  const m = machine96();
  const blkbuf = m.sym("BLKBUF");
  const line = 0x8000 + 3 * 512;
  // Choice 1: a record between a line and DSKDMA, by where DSKDMA is.
  const dmas = { "0080h (below 8000h)": 0x0080, "9000h (at or above 8000h)": 0x9000, "7FC0h (64 bytes each side)": 0x7fc0 };
  const record = {};
  for (const [label, dma] of Object.entries(dmas)) {
    const read = core(m, { db: 0, sb: 1, dst: dma, src: line + 128, n: 128 });
    const write = core(m, { db: 1, sb: 0, dst: line + 256, src: dma, n: 128 });
    record[label] = { lineToDma: read.t, dmaToLine: write.t, ok: read.ok && write.ok };
  }
  // Today's record copy, BLKBUF to DSKDMA by LDIR, for the difference.
  const ldir = 21 * 127 + 16;
  // Choice 2: a whole line, today's byte loop against the two sketches.
  const today = {
    lineToBlkbuf: core(m, { db: 0, sb: 1, dst: blkbuf, src: line, n: 512 }),
    blkbufToLine: core(m, { db: 1, sb: 0, dst: line + 1024, src: blkbuf, n: 512 }),
  };
  const { bytes: code, symbols } = await assemble.assembleProgram(resolve(HERE, "copies.asm"), { base: 0x6000 });
  code.forEach((v, i) => m.write(0x6000 + i, v));
  const lat = m.read(0x40);
  const sketch = (entry, from, to, sb) => {
    const w16 = (a, v) => [m.write(a, v & 0xff), m.write(a + 1, v >> 8)];
    w16(symbols.SRC, from);
    w16(symbols.DST, to);
    m.write(symbols.SLAT, sb === 1 ? lat | 0x04 : lat);
    m.write(symbols.DLAT, sb === 1 ? lat : lat | 0x04);
    const want = bytes(m, sb, from, 512);
    const r = call(m, symbols[entry]);
    return { t: r.t, ok: JSON.stringify(bytes(m, sb === 1 ? 0 : 1, to, 512)) === JSON.stringify(want), latch: m.read(0x40) === lat };
  };
  const u8 = { lineToBlkbuf: sketch("U8GO", line, blkbuf, 1), blkbufToLine: sketch("U8GO", blkbuf, line + 2048, 0) };
  const sp16 = { lineToBlkbuf: sketch("SP16GO", line, blkbuf, 1), blkbufToLine: sketch("SP16GO", blkbuf, line + 2560, 0) };
  // ROM bytes: the loop each would add to the copy core.
  const sizes = { u8: symbols.U8END - symbols.U8L + 2, sp16: symbols.SPEND - symbols.SP16GO };
  return {
    record,
    todayRecordLdir: ldir,
    line: { mvbl: today, u8, sp16 },
    loopBytes: sizes,
    perByte: {
      mvbl: +(today.lineToBlkbuf.t / 512).toFixed(1),
      u8: +(u8.lineToBlkbuf.t / 512).toFixed(1),
      sp16: +(sp16.lineToBlkbuf.t / 512).toFixed(1),
    },
    violations: m.violations.length,
    cleanup: harness.EXPAND1_WRITES.splice(0).length > 0, // the model writes EXPAND 1 on purpose
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await copyModel(), null, 2));
