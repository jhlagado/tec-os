// A: coalescing's machines, shared by test/coalesce.test.mjs, the write-behind
// rows in test/cache.test.mjs and the stack census: a three-volume card, a
// program's calls made from a stub at 3000h, each card write with its block,
// the card refusing writes on demand, ROM mutants made by patching the
// build's image, and the census's flush workload. The volume on the logged
// drive is written behind and every other coalesces, so a machine that
// tests A:'s coalescing is logged on B:.

import assert from "node:assert/strict";
import { createContainer, findVolume, parseContainer } from "../../tools/lib/container.mjs";
import { Machine } from "./machine.mjs";
import { TEST_CLOCK, romFor, volume } from "./fixtures.mjs";
import { watch } from "./census.mjs";
import { finishBarePrompt, publicContext, recoveryInput } from "./public-caller.mjs";

export const FCB = 0x5c;
export const FCB2 = 0x3800;
export const FCB3 = 0x3a00;
export const DMA = 0x2000;
export const BUF = 0x3900;
export const TOP = 0x3000;

/** SYSTEM on A:, WORK on B:, and ARCHIVE, index 2, on no drive; C: has a slot. */
export const card = () =>
  createContainer(
    [
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B" },
      { geometry: "G1M", label: "ARCHIVE", mount: "-" },
    ],
    { drives: 3 },
  );

/** Record R's 128 bytes, SALT changing them for a rewrite. */
export const pat = (r, salt = 0) => Uint8Array.from({ length: 128 }, (_, k) => (r * 131 + k * 7 + 1 + salt) & 0xff);
export const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const word = (m, a) => m.read(a) | (m.read(a + 1) << 8);

/** The card blocks of IMAGE's DRIVE directory. */
export function dirBlocks(image, drive = "A") {
  const v = findVolume(parseContainer(image), drive);
  const a = volume(image, drive);
  const n = (a.g.dirBlocks * a.blockBytes) / 512;
  return new Set(Array.from({ length: n }, (_, i) => v.start + i));
}

/** Type LOGGED's drive change at M's prompt, unless it is A:, and run to the next prompt. */
function logOn(m, logged) {
  if (logged === "A") return;
  m.type(`${logged}:\r`);
  m.expect(new RegExp(`${logged}(:\\S*)?>$`), { maxCycles: 400_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the drive change");
}

/** An FCB's drive byte for A:: 0, the default drive, when logged on A:, else 1. */
const driveA = (logged) => (logged === "A" ? 0 : 1);

/**
 * A machine on IMAGE under ROM (the build's when not given), at its first
 * prompt after logging on LOGGED (B: unless given), and the calls a program
 * makes; a name's drive is A: unless given. BUDGET, when given, is the most
 * cycles the machine may run from here: past it every step throws, so a
 * hang fails its test.
 */
export function rig({ rom, image = card(), budget, logged = "B" } = {}) {
  const r0 = rom ?? romFor();
  const m = new Machine({ ...r0, sdImage: image, clock: TEST_CLOCK });
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  logOn(m, logged);
  const normalization = finishBarePrompt(m);
  const t = { writes: [], reads: [] };
  const lba = () => word(m, m.sym("SDLBA")) + word(m, m.sym("SDLBA") + 2) * 0x10000;
  const [sdw, sdr] = [m.sym("SDWRITE"), m.sym("SDREAD")];
  const limit = budget === undefined ? Infinity : m.cycles + budget;
  const step = m.step.bind(m);
  m.step = () => {
    if (m.cycles > limit) throw new Error(`the cycle bound: ${budget} cycles passed`);
    if (m.pc === sdw) t.writes.push(lba());
    else if (m.pc === sdr) t.reads.push(lba());
    return step();
  };
  /** Run CODE from TOP to its final JR $, SP at TOP; pumping queued input if PUMP. */
  const stub = (code, pump = false) => {
    publicContext(m);
    [...code, 0x18, 0xfe].forEach((v, i) => m.write(TOP + i, v));
    Object.assign(m.cpu.cpu, { sp: TOP, pc: TOP });
    const end = TOP + code.length;
    const t0 = m.cycles;
    m.runUntil(() => (pump && m.pumpInput(), m.pc === end), 400_000_000, "the stub");
    publicContext(m);
    return { a: m.cpu.cpu.a, h: m.cpu.cpu.h, cycles: m.cycles - t0 };
  };
  const bdos = (fn, de = FCB, pump = false) => stub([0x0e, fn, 0x11, de & 0xff, de >> 8, 0xcd, 0x05, 0x00], pump);
  /** A ROM service through ABICALL: C the service, B the drive, E the index. */
  const svc = (c, b, e) => stub([0x0e, c, 0x06, b, 0x1e, e, 0xcd, m.sym("ABICALL") & 0xff, m.sym("ABICALL") >> 8]);
  /** The BIOS entry at OFF in the jump table (06h CONST, 09h CONIN). */
  const bios = (off, pump = false) => {
    const at = word(m, 1) - 3 + off;
    return stub([0xcd, at & 0xff, at >> 8], pump);
  };
  const name = (n, at = FCB, drive = driveA(logged)) => [drive, ...Buffer.from(n.padEnd(11)), ...new Array(24).fill(0)].forEach((v, i) => m.write(at + i, v));
  const put = (r, salt) => pat(r, salt).forEach((v, k) => m.write(DMA + k, v));
  const setR = (n) => [n & 0xff, n >> 8, 0].forEach((v, i) => m.write(FCB + 33 + i, v));
  const blockOf = (r, at = FCB) => word(m, at + 16 + 2 * (r >> 4));
  /** Whether record R of the file at AT is on the card. */
  const onCard = (r, salt = 0, at = FCB) => {
    const off = blockOf(r, at) * 2048 + (r & 15) * 128;
    return same(volume(image, "A").data.subarray(off, off + 128), pat(r, salt));
  };
  /** Records 0 to N-1 of the file at FCB: C on the card, - not. */
  const state = (n = 3) => [...Array(n).keys()].map((k) => (onCard(k) ? "C" : "-")).join("");
  const pending = () => m.read(m.sym("CPEND"));
  /** The card answering each block write with an error while the flag's on is true. */
  const refuse = () => {
    const sd = m.sd;
    const commit = sd.commitWrite.bind(sd);
    const f = { on: true };
    sd.commitWrite = () => {
      if (!f.on) return commit();
      sd.writeState = null;
      sd.pendingResponse = [0x0d, 0xff];
      sd.delayBytes = 1;
    };
    return f;
  };
  /** Start a warm boot and stop at normal or recovery input. Capture results
   * before explicitly completing normal input for another synthetic call. */
  const warm = (go = () => (m.cpu.cpu.pc = 0)) => {
    const mark = m.output.length;
    const at = () => recoveryInput(m) || (m.ready() && /\r\n\d*[A-P](:\S*)?>$/.test(m.text(mark)));
    go();
    m.runUntil(() => (m.pumpInput(), at()), 400_000_000, "normal or bootstrap recovery input after warm boot");
    return m.text(mark);
  };
  /** Press reset and run to the prompt. */
  const reset = () => {
    m.reset();
    m.expect(/[A-P](:\S*)?>$/, { from: m.output.length, maxCycles: 200_000_000 });
    m.runUntil(() => m.ready(), 200_000_000, "the prompt after the reset");
  };
  return { image, m, t, normalization, stub, bdos, svc, bios, name, put, setR, blockOf, onCard, state, pending, refuse, warm, reset };
}

/**
 * P.DAT made on A: with function 45 in its FFh mode, and records 0 to 2
 * written: one card block, pending. With OPEN, Q.DAT, two records on A:,
 * is open at FCB2 and B:B.DAT made at FCB3 first.
 */
export function three({ open = false, ...opts } = {}) {
  const image = opts.image ?? card();
  if (open) volume(image, "A").write("Q.DAT", Uint8Array.from({ length: 256 }, (_, i) => i & 0xff));
  const r = rig({ ...opts, image });
  r.bdos(45, 0xff);
  if (open) {
    r.name("Q       DAT", FCB2);
    r.bdos(15, FCB2);
    r.name("B       DAT", FCB3, 2);
    r.bdos(22, FCB3);
  }
  r.name("P       DAT");
  r.bdos(22);
  r.bdos(26, DMA);
  for (let k = 0; k < 3; k += 1) {
    r.put(k);
    r.bdos(21);
  }
  return r;
}

/** F.DAT, eight records, made and closed on A:, then opened again. */
export function closed8(opts = {}) {
  const r = rig(opts);
  r.name("F       DAT");
  r.bdos(22);
  r.bdos(26, DMA);
  for (let k = 0; k < 8; k += 1) {
    r.put(k);
    r.bdos(21);
  }
  r.bdos(16);
  r.name("F       DAT");
  r.bdos(15);
  return r;
}

/**
 * The build's ROM with EDIT(bytes, at, put) applied: at(NAME) a symbol's
 * offset in the image, put(i, bytes) writing there. A mutant's code that
 * needs more room goes in the free tail at CODEEND.
 */
export function mutant(edit) {
  const { rom, symbols } = romFor();
  const bytes = Uint8Array.from(rom);
  const at = (n) => {
    assert.ok(symbols.has(n), `no symbol ${n}`);
    return symbols.get(n) - 0xc000;
  };
  const put = (i, list) => list.forEach((v, k) => (bytes[i + k] = v));
  edit(bytes, at, put, (n) => symbols.get(n));
  return { rom: bytes, symbols };
}

const lo = (a) => a & 0xff;
const hi = (a) => a >> 8;
/** Assert BYTES at I are WANT (null any byte). */
function expectAt(bytes, i, want) {
  assert.deepEqual([...bytes.subarray(i, i + want.length)].map((v, k) => (want[k] === null ? null : v)), want, `the mutant's site at ${(i + 0xc000).toString(16)}`);
}
const call = (a) => [0xcd, lo(a), hi(a)];
const jp = (a) => [0xc3, lo(a), hi(a)];

/** The single mutants: the build's ROM with one change each. */
export const MUTANTS = {
  /** FNSTAT without its CKEY. */
  fnstat: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("FNSTAT"), call(sym("CKEY")));
      put(at("FNSTAT"), [0, 0, 0]);
    }),
  /** READDIR without its CPOUT and BADSECT jump. */
  readdir: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("READDIR"), [...call(sym("CPOUT")), 0xc2, lo(sym("BADSECT")), hi(sym("BADSECT"))]);
      put(at("READDIR"), [0, 0, 0, 0, 0, 0]);
    }),
  /** FNCLSE without its CPOUT and BADSECT jump. */
  fnclse: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("FNCLSE"), [...call(sym("CPOUT")), 0xc2, lo(sym("BADSECT")), hi(sym("BADSECT"))]);
      put(at("FNCLSE"), [0, 0, 0, 0, 0, 0]);
    }),
  /** BCONIN without its CKEY. */
  bconin: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("BCONIN"), call(sym("CKEY")));
      put(at("BCONIN"), [0, 0, 0]);
    }),
  /** BWGET without PUSH BC, CALL CPMOVE, POP BC, RET NZ. */
  cpmove: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("BWGET"), [0xc5, ...call(sym("CPMOVE")), 0xc1, 0xc0]);
      put(at("BWGET"), [0, 0, 0, 0, 0, 0]);
    }),
  /** BWGET marking type 1 (directory) writes off the logged drive to coalesce too: its BIT 0,(HL) and JR NZ,BWGO gone. */
  type1: () =>
    mutant((b, at, put, sym) => {
      const i = at("BWGET") + 15;
      expectAt(b, i, [0x21, lo(sym("CWTYPE")), hi(sym("CWTYPE")), 0xcb, 0x46, 0x20, null]);
      put(i + 3, [0, 0, 0, 0]);
    }),
  /** VFLUSH through CFLALL again, dropping failed lines. */
  cflall: () =>
    mutant((b, at, put, sym) => {
      const i = at("VFLUSH") + 7;
      expectAt(b, i, [0x3e, sym("NLINES"), ...call(sym("CFLUSH"))]);
      put(i, [...call(sym("CFLALL")), 0, 0]);
    }),
  /** CPFLSH clearing CPEND before the write, by a jump to that code in the free tail. */
  cpendearly: () =>
    mutant((b, at, put, sym) => {
      const p = sym("CPEND");
      expectAt(b, at("CPFLSH"), [0x3a, lo(p), hi(p), 0xb7, 0xc8, 0x3d, ...call(sym("CDGET")), 0xc4, lo(sym("CWRITE")), hi(sym("CWRITE")), 0xc0]);
      const tail = at("CODEEND");
      // LD A,(CPEND); OR A; RET Z; DEC A; PUSH AF; XOR A; LD (CPEND),A; POP AF;
      // CALL CDGET; CALL NZ,CWRITE; RET NZ; XOR A; RET
      put(tail, [0x3a, lo(p), hi(p), 0xb7, 0xc8, 0x3d, 0xf5, 0xaf, 0x32, lo(p), hi(p), 0xf1, ...call(sym("CDGET")), 0xc4, lo(sym("CWRITE")), hi(sym("CWRITE")), 0xc0, 0xaf, 0xc9]);
      put(at("CPFLSH"), jp(tail + 0xc000));
    }),
  /** CPOUT with three more pushes around its CPFLSH, by a jump to that code in the free tail. */
  push3: () =>
    mutant((b, at, put, sym) => {
      const i = at("CPOUT") + 9;
      expectAt(b, i, [...call(sym("CPFLSH")), 0xd1, ...jp(sym("BRET"))]);
      const tail = at("CODEEND");
      // PUSH BC x3; CALL CPFLSH; POP BC x3; POP DE; JP BRET
      put(tail, [0xc5, 0xc5, 0xc5, ...call(sym("CPFLSH")), 0xc1, 0xc1, 0xc1, 0xd1, ...jp(sym("BRET"))]);
      put(i, [...jp(tail + 0xc000), 0, 0, 0, 0]);
    }),
  /** CPOUT without its fast test of CPEND: every call takes CDI, CPFLSH and CEI. */
  nofast: () =>
    mutant((b, at, put, sym) => {
      const p = sym("CPEND");
      expectAt(b, at("CPOUT"), [0x3a, lo(p), hi(p), 0xb7, 0xc8]);
      put(at("CPOUT"), [0, 0, 0, 0, 0]);
    }),
  /**
   * CPMOVE keeping the pending block when its line is the next in turn, the
   * line a miss takes, rather than when the write's block is its tag:
   * CALL CLOOK made LD A,(CNEXT), and its JR NZ,CPFLSH gone.
   */
  byline: () =>
    mutant((b, at, put, sym) => {
      const i = at("CPMOVE") + 5;
      expectAt(b, i, [...call(sym("CLOOK")), 0x20, null]);
      put(i, [0x3a, lo(sym("CNEXT")), hi(sym("CNEXT")), 0, 0]);
    }),
  /** BWGET marking the logged drive's data writes to coalesce: its JR Z,BWGO after the BOOTDRV test gone. */
  wbcoalesce: () =>
    mutant((b, at, put, sym) => {
      const i = at("BWGET") + 6;
      expectAt(b, i, [0x3a, lo(sym("BOOTDRV")), hi(sym("BOOTDRV")), 0x21, lo(sym("DSKCUR")), hi(sym("DSKCUR")), 0xbe, 0x28, null]);
      put(i + 7, [0, 0]);
    }),
  /** MR2: every console read writing the pending block only, CPOUT in place of each CKEY call. */
  mr2: () =>
    mutant((b, at, put, sym) => {
      const want = call(sym("CKEY"));
      let n = 0;
      for (let i = 0; i + 3 <= b.length; i += 1) {
        if (b[i] === want[0] && b[i + 1] === want[1] && b[i + 2] === want[2]) {
          put(i, call(sym("CPOUT")));
          n += 1;
        }
      }
      assert.equal(n, 5, "CKEY's five callers");
    }),
  /** MBD: BWGET testing the BDOS's current disk, CURDRV, in place of BOOTDRV. */
  mbd: () =>
    mutant((b, at, put, sym) => {
      const i = at("BWGET") + 6;
      expectAt(b, i, [0x3a, lo(sym("BOOTDRV")), hi(sym("BOOTDRV"))]);
      put(i, [0x3a, lo(sym("CURDRV")), hi(sym("CURDRV"))]);
    }),
  /** M1: a drive change at the prompt without its CALL VFLUSH, before LD A,B and LD (BOOTDRV),A. */
  m1: () =>
    mutant((b, at, put, sym) => {
      const want = [...call(sym("VFLUSH")), 0x78, 0x32, lo(sym("BOOTDRV")), hi(sym("BOOTDRV"))];
      const i = Buffer.from(b).indexOf(Buffer.from(want));
      assert.ok(i > 0, "the drive change's flush");
      put(i, [0, 0, 0]);
    }),
  /**
   * MDIR: a directory write off the logged drive writing only itself, with
   * no flush of the other lines first. CWB3's LD A,C and CALL CFLUSH become a
   * call to code in the free tail that flushes only on the logged drive.
   */
  mdir: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("CWB3"), [0x79, ...call(sym("CFLUSH")), 0xcc, lo(sym("CWRITE")), hi(sym("CWRITE"))]);
      const tail = at("CODEEND");
      // LD A,(BOOTDRV); LD HL,DSKCUR; CP (HL); LD A,C; JR Z,+2; CP A; RET; JP CFLUSH
      put(tail, [0x3a, lo(sym("BOOTDRV")), hi(sym("BOOTDRV")), 0x21, lo(sym("DSKCUR")), hi(sym("DSKCUR")), 0xbe, 0x79, 0x28, 0x02, 0xbf, 0xc9, ...jp(sym("CFLUSH"))]);
      put(at("CWB3"), [...call(tail + 0xc000), 0]);
    }),
  /** MNC: CKEY that never tests CANY, so every console read scans the 30 lines. */
  mnc: () =>
    mutant((b, at, put, sym) => {
      expectAt(b, at("CKEY"), [0x3a, lo(sym("CANY")), hi(sym("CANY")), 0xb7, ...[0xca, lo(sym("CPOUT")), hi(sym("CPOUT"))]]);
      put(at("CKEY"), [0, 0, 0, 0, 0, 0, 0]);
    }),
  /** MTW: CKEY scanning the 30 lines twice, by a call to code in the free tail. */
  mtw: () =>
    mutant((b, at, put, sym) => {
      const i = at("CKEY") + 11;
      expectAt(b, i, [0x3e, sym("NLINES"), ...call(sym("CFLUSH"))]);
      const tail = at("CODEEND");
      // LD A,NLINES; CALL CFLUSH; LD A,NLINES; JP CFLUSH
      put(tail, [0x3e, sym("NLINES"), ...call(sym("CFLUSH")), 0x3e, sym("NLINES"), ...jp(sym("CFLUSH"))]);
      put(i, [...call(tail + 0xc000), 0, 0]);
    }),
  /** MN: MNFILL copying descriptor byte 15's bit 0 into the drive entry's bit 1 again, by code in the free tail. */
  mn: () =>
    mutant((b, at, put, sym) => {
      const i = at("MNFILL") + 19;
      expectAt(b, i, [0xdd, 0x7e, 13, 0x77, 0xc9]);
      const tail = at("CODEEND");
      // LD A,(IX+15); AND 1; ADD A,A; OR (IX+13); RET
      put(tail, [0xdd, 0x7e, 15, 0xe6, 1, 0x87, 0xdd, 0xb6, 13, 0xc9]);
      put(i, call(tail + 0xc000));
    }),
};

/**
 * The stack census's flush workload under ROM (the build's when not given),
 * logged on LOGGED (B: unless given, so that A: coalesces), in MODE "writing", "refusing" or "removed" (the card out): a block pending
 * before each flush point, BDOS 1, 6 input, 10 and 11, a BIOS
 * CONIN called directly, BDOS 17 and 48, MOUNT, a B: write and the next
 * block. The accepting run also reaches an extent change inside BDOS 21;
 * failed runs record accepted writes separately from issued attempts. The
 * resident/worker stacks, each call's program-stack depth and its cycles.
 */
export function flushRun(mode, rom, { logged = "B" } = {}) {
  const r0 = rom ?? romFor();
  const m = new Machine({ ...r0, sdImage: card(), clock: TEST_CLOCK });
  const census = watch(m);
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 200_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  logOn(m, logged);
  const normalization = finishBarePrompt(m);
  let low = TOP;
  const step = m.step.bind(m);
  m.step = () => {
    const sp = m.cpu.cpu.sp & 0xffff;
    if (sp < low && sp > 0x2100) low = sp;
    return step();
  };
  const stub = (code, pump = false) => {
    publicContext(m);
    [...code, 0x18, 0xfe].forEach((v, i) => m.write(TOP + i, v));
    Object.assign(m.cpu.cpu, { sp: TOP, pc: TOP });
    const end = TOP + code.length;
    const t0 = m.cycles;
    m.runUntil(() => (pump && m.pumpInput(), m.pc === end), 400_000_000, "the stub");
    publicContext(m);
    return m.cycles - t0;
  };
  const bdos = (fn, de = FCB, pump = false) => stub([0x0e, fn, 0x11, de & 0xff, de >> 8, 0xcd, 0x05, 0x00], pump);
  const name = (n, at = FCB, drive = driveA(logged)) => [drive, ...Buffer.from(n.padEnd(11)), ...new Array(24).fill(0)].forEach((v, i) => m.write(at + i, v));
  const conin = word(m, 1) + 6;
  const abicall = m.sym("ABICALL");
  bdos(45, 0xff);
  name("B       DAT", FCB3, 2);
  bdos(22, FCB3);
  name("P       DAT");
  bdos(22);
  bdos(26, DMA);
  if (mode === "removed") m.sd = null;
  if (mode === "refusing") {
    const sd = m.sd;
    sd.commitWrite = () => {
      sd.writeState = null;
      sd.pendingResponse = [0x0d, 0xff];
      sd.delayBytes = 1;
    };
  }
  let rec = 0;
  const writeStatuses = [];
  const pend = () => {
    bdos(21);
    writeStatuses.push(m.cpu.cpu.a);
    rec += 1;
  };
  const pendingState = () => ({
    pending: m.read(m.sym("CPEND")), any: m.read(m.sym("CANY")),
    queued: m.symbols.has("HKCNT") ? m.read(m.sym("HKCNT")) : undefined,
  });
  const pendingBefore = {};
  const cycles = {};
  const depth = {};
  const cases = [
    ["BDOS 1", () => (m.enqueueInput("x"), bdos(1, 0, true))],
    ["BDOS 6 E=FFh", () => bdos(6, 0xff)],
    ["BDOS 10", () => (m.write(BUF, 20), m.enqueueInput("ab\r"), bdos(10, BUF, true))],
    ["BDOS 11", () => bdos(11, 0)],
    ["BIOS CONIN", () => (m.enqueueInput("x"), stub([0xcd, conin & 0xff, conin >> 8], true))],
    ["BDOS 17", () => (name("???????????", FCB2), bdos(17, FCB2))],
    ["BDOS 48", () => bdos(48, 0)],
    ["MOUNT C:", () => stub([0x0e, 9, 0x06, 2, 0x1e, 2, 0xcd, abicall & 0xff, abicall >> 8])],
    ["a B: write", () => bdos(21, FCB3)],
    ["the next block", () => (pend(), pend(), pend(), pend(), 0)],
  ];
  for (const [what, fn] of cases) {
    pend();
    pendingBefore[what] = pendingState();
    assert.ok(pendingBefore[what].queued ?? (pendingBefore[what].pending || pendingBefore[what].any), `${what}: actual dirty work before the public call`);
    low = TOP;
    cycles[what] = fn();
    depth[what] = TOP - low;
  }
  while (rec < 130) pend();
  const finalWritePosition = { extent: m.read(FCB + 12), record: m.read(FCB + 32) };
  if (mode === "writing") {
    assert.deepEqual(writeStatuses, new Array(130).fill(0), "every accepting-run record write succeeded");
    assert.deepEqual(finalWritePosition, { extent: 1, record: 2 }, "the accepting run really crossed an extent boundary");
  }
  bdos(16);
  const closeStatus = m.cpu.cpu.a;
  pendingBefore["BIOS CONIN after close"] = pendingState();
  if (mode === "writing") {
    assert.ok(closeStatus <= 3, "successful CP/M close returns a directory slot from 0 to 3");
    assert.equal(pendingBefore["BIOS CONIN after close"].queued ?? (pendingBefore["BIOS CONIN after close"].pending || pendingBefore["BIOS CONIN after close"].any), 0, "accepting close drained the queue");
  }
  low = TOP;
  m.enqueueInput("x");
  cycles["BIOS CONIN after close"] = stub([0xcd, conin & 0xff, conin >> 8], true);
  depth["BIOS CONIN after close"] = TOP - low;
  return { ...census(), programStack: depth, cycles, normalization, pendingBefore, writeStatuses, finalWritePosition, closeStatus };
}
