// Compare interrupt-enable teardown.
// These bytes are model projections.
import assert from 'node:assert/strict';

const b64 = bytes => Buffer.from(bytes).toString('base64');
const clone = value => JSON.parse(JSON.stringify(value));
const word = (memory, address, value) => {
  memory[address] = value & 255;
  memory[address + 1] = value >> 8;
};
export class OracleFailure extends Error {
  constructor(code, actual, expected) {
    super(code); this.name = 'R1OracleFailure'; this.code = code; this.actual = actual; this.expected = expected;
  }
}
const equal = (actual, expected, code) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new OracleFailure(code, actual, expected);
};

// Run the public CPU on a flat fixture.
// No interrupt delivery API is called.
export function observe(api, declaration, projection, variant, fault = null) {
  assert.ok(variant === 'old' || variant === 'proposed');
  const at = projection.addresses;
  const memory = new Uint8Array(65536);
  const helper = [...projection[variant]];
  const tables = clone(projection.tables);
  if (fault?.kind === 'helper') {
    assert.deepEqual(helper.slice(fault.offset, fault.offset + fault.before.length), fault.before);
    helper.splice(fault.offset, fault.before.length, ...fault.after);
  }
  if (fault?.kind === 'table') {
    assert.equal(tables[fault.width][fault.offset], fault.fromByte);
    tables[fault.width][fault.offset] = fault.toByte;
  }
  memory.set(projection.caller, at.caller);
  memory.set(helper, at.helper);
  memory.set(projection.vpair, at.pair);
  memory.set(projection.iffget, at.iff);
  for (const [width, bytes] of Object.entries(tables)) memory.set(bytes, at.tables[width]);
  memory.fill(0x5a, at.stack - 16, at.stack);
  const installed = declaration.width !== undefined || !declaration.device;
  const pointer = installed ? at.tables[declaration.width ?? 32] : 0;
  word(memory, at.regptr, pointer);
  word(memory, at.pivec, installed ? 0x6500 : 0);
  memory[at.shadow] = 32;
  memory[at.condev] = declaration.device ? 2 : 0;
  memory[at.claim] = declaration.claim;
  const vdp = api.createTms9918();
  const registers = [0x13, declaration.seedR1, 0x2a, 0x35, 9, 0x1b, 7, 0x31];
  for (let index = 0; index < registers.length; index++) {
    vdp.writeControl(registers[index]); vdp.writeControl(0x80 | index);
  }
  vdp.writeControl(0); vdp.writeControl(0x40);
  for (let index = 0; index < 16384; index++) vdp.writeData((index * 17 + 3) & 255);
  vdp.setActive(declaration.device);
  const cpu = api.initCpu();
  Object.assign(cpu, {pc: at.caller, sp: at.stack, b: 0x12, c: 0x34, d: 0x56, e: 0x78,
    h: 0xa4, l: 0xb5, i: 0x5b, iff1: Number(declaration.iff ?? false), iff2: Number(declaration.iff ?? false)});
  const snapshot = () => {
    const video = vdp.stateSnapshot();
    return {cpu: clone(cpu), memory: b64(memory), video: {active: video.active,
      videoStandard: video.videoStandard, frameCount: video.frameCount, status: video.status,
      registers: video.registers, vram: b64(video.vram)}, shadow: memory[at.shadow],
      claim: memory[at.claim], regptr: memory[at.regptr] | memory[at.regptr + 1] << 8,
      pivec: memory[at.pivec] | memory[at.pivec + 1] << 8};
  };
  const before = snapshot();
  const writes = [], ports = [], trace = [];
  let minimumSP = cpu.sp, cycles = 0;
  const writable = new Set([at.shadow, at.stack - 1, at.stack - 2, at.stack - 3, at.stack - 4]);
  const callbacks = {
    mem_read(address) { assert.ok(Number.isInteger(address) && address >= 0 && address < 65536); return memory[address]; },
    mem_write(address, value) {
      assert.ok(writable.has(address), 'CPU wrote outside shadow/owned stack');
      assert.ok(writes.length < 32);
      writes.push({address, value, pc: cpu.pc, sp: cpu.sp}); memory[address] = value;
      minimumSP = Math.min(minimumSP, cpu.sp);
    },
    io_read() { throw new Error('unexpected helper IO read'); },
    io_write(port, value) {
      assert.equal(port & 255, 0xbf, 'control port only'); assert.ok(ports.length < 4);
      ports.push({port, low: port & 255, value, pc: cpu.pc}); vdp.writeControl(value);
    },
  };
  const allowedPC = address => address >= at.caller && address < at.stop ||
    address >= at.helper && address < at.helper + helper.length ||
    address >= at.pair && address < at.pair + projection.vpair.length ||
    address >= at.iff && address < at.iff + projection.iffget.length;
  while (cpu.pc !== at.stop) {
    assert.ok(trace.length < projection.limits.stepsPerObservation && allowedPC(cpu.pc) && !cpu.halted,
      'bounded real helper return');
    const entry = {pc: cpu.pc, sp: cpu.sp, bytes: [...memory.slice(cpu.pc, cpu.pc + 4)]};
    const elapsed = api.execute(cpu, callbacks);
    assert.ok(Number.isInteger(elapsed) && elapsed > 0);
    cycles += elapsed; minimumSP = Math.min(minimumSP, cpu.sp);
    trace.push({...entry, nextPC: cpu.pc, nextSP: cpu.sp, cycles: elapsed});
    assert.ok(cycles <= projection.limits.cyclesPerObservation);
  }
  return {kind: 'R1_DIRECT_CPU_OBSERVATION', caseID: declaration.id, variant,
    fault: fault?.kind ?? null, modelProjectionNotROM: true, assembled: false,
    interruptDeliveryInvoked: false, before, after: snapshot(), helper,
    writes, ports, trace, cycles, minimumSP, stackBytes: at.stack - minimumSP};
}

// Check setup before a fault assertion.
// CPU errors are not fault results.
export function validateSetup(record, declaration, projection, cycles) {
  const at = projection.addresses;
  assert.equal(record.after.cpu.pc, at.stop); assert.equal(record.after.cpu.sp, at.stack);
  assert.equal(record.stackBytes, declaration.device || record.ports.length ? 4 : 2);
  assert.equal(record.cycles, cycles);
  for (const key of ['b', 'c', 'd', 'e', 'i']) assert.equal(record.after.cpu[key], record.before.cpu[key]);
  assert.equal(record.after.cpu.iff1, record.before.cpu.iff1);
  assert.equal(record.after.cpu.iff2, record.before.cpu.iff2);
  assert.equal(record.after.claim, record.before.claim); assert.equal(record.after.regptr, record.before.regptr);
  assert.equal(record.after.pivec, record.before.pivec);
  assert.ok(record.ports.length === 0 || record.ports.length === 2);
  if (record.ports.length) {
    assert.equal(record.after.cpu.h, 0x81); assert.equal(record.after.cpu.l, record.ports[0].value);
  } else {
    assert.equal(record.after.cpu.h, record.before.cpu.h); assert.equal(record.after.cpu.l, record.before.cpu.l);
  }
  assert.equal(record.after.video.vram, record.before.video.vram);
  for (const key of ['active', 'videoStandard', 'frameCount', 'status']) {
    assert.equal(record.after.video[key], record.before.video[key]);
  }
  for (const index of [0, 2, 3, 4, 5, 6, 7]) {
    assert.equal(record.after.video.registers[index], record.before.video.registers[index]);
  }
  const before = Buffer.from(record.before.memory, 'base64'), after = Buffer.from(record.after.memory, 'base64');
  assert.equal(before.length, 65536); assert.equal(after.length, 65536);
  const allowed = new Set([at.shadow, at.stack - 1, at.stack - 2, at.stack - 3, at.stack - 4]);
  for (let index = 0; index < 65536; index++) if (!allowed.has(index)) assert.equal(after[index], before[index]);
  for (const row of record.ports) assert.equal(row.port, row.value << 8 | 0xbf);
}
export function expectedCycles(declaration, variant) {
  if (!declaration.device) return 65;
  const base = declaration.width === undefined ? variant === 'old' ? 238 : 228 : variant === 'old' ? 255 : 252;
  return base - (declaration.iff ? 5 : 0);
}
export function verifyPolicy(record, declaration, variant) {
  const expected = !declaration.device ? record.before.video.registers[1] :
    declaration.width === 32 ? 0xc0 : declaration.width ? 0xd0 : variant === 'old' ? 0xc0 : 0x80;
  equal(record.after.video.registers[1], expected, 'R1_BYTE');
  equal(record.after.shadow, 0, 'SHADOW_ZERO');
  equal(record.ports.map(row => row.value), declaration.device ? [expected, 0x81] : [],
    declaration.device ? 'R1_PAIR' : 'ABSENT_PORTS');
}
export function requireBare80(record) {
  equal(record.after.video.registers[1], 0x80, 'R1_BYTE');
}
