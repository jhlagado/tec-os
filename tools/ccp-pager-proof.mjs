#!/usr/bin/env node
// Paired execution of DIR across a page pause and every stopping answer.
// In particular, watch the candidate's live directory pointer on its stack
// until the abort message has printed and MAINLOOP has reset SP.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, rom } from "./lib/model.mjs";
import { Machine } from "../host/machine.mjs";
import { makeSvc } from "./lib/svc.mjs";
import { createContainer, parseContainer, findVolume, volumePayload } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";

const glcd = (await makeSvc(resolve(ROOT, "drivers/glcd.asm"), { work: resolve(ROOT, "build/ccp-pager-svc") })).file;
const refs = [process.argv[2] ?? resolve(ROOT, "build/ccp-model/incumbent"), process.argv[3] ?? resolve(ROOT, "build/ccp-model/combined")];
const output = process.argv[4] ?? resolve(ROOT, "build/ccp-model/pager.json");
function run(r, board, answer) {
  const image = createContainer([{ geometry: "G8M", label: "SYSTEM", mount: "A" }]);
  const v = findVolume(parseContainer(image), "A");
  const a = new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
  for (let n = 0; n < 150; n++) a.write(`F${String(n).padStart(3, "0")}.DAT`, Uint8Array.of(n));
  if (board === "glcd" && answer === "\x03") {
    a.write("GLCD.SVC", glcd);
    a.write("STARTUP.CMD", Buffer.from("GLCD.SVC\r\n\x1a"));
  }
  const m = new Machine({ rom: r.image, symbols: r.symbols, sdImage: image, glcd: board === "glcd", matrix: board === "glcd", clock: new Date(2026, 0, 1) });
  m.runUntil(() => m.ready() && /A>$/.test(m.text()), 200000000, "initial prompt");
  const guard = m.sym("STKGUARD"), base = m.sym("CSTKBAS"), top = m.sym("CSTKTOP");
  const writes = [], low = { beforePause: top, afterAnswer: top };
  let phase = "beforePause";
  const write = m.cpu.hardware.memWrite;
  m.cpu.hardware.memWrite = (addr, value) => {
    if (addr >= guard && addr < base) writes.push({ phase, pc: m.pc, addr, value });
    write(addr, value);
  };
  const step = m.step.bind(m);
  m.step = () => {
    const sp = m.cpu.cpu.sp;
    if (sp >= guard && sp <= top) low[phase] = Math.min(low[phase], sp);
    return step();
  };
  const from = m.output.length, start = m.cycles;
  m.type("DIR!USER 7\r");
  m.runUntil(() => m.waitingForInput() && m.text(from).endsWith("[more]"), 600000000, "directory page pause");
  const paused = m.text(from), atPause = m.cycles;
  phase = "afterAnswer";
  // On this matrix layout the key mapped from byte 03h is Up, producing an
  // ANSI sequence. Supply the pager byte at the BDOS pending-input boundary
  // for GLCD; serial answers still travel through the emulated terminal.
  if (board === "glcd") {
    m.write(m.sym("PENDCHR"), answer.charCodeAt(0));
    m.write(m.sym("PENDING"), 1);
  } else m.type(answer);
  const idle = () => m.ready() && m.read(m.sym("CHPOS")) === 0 && /A>$/.test(m.text(from));
  m.runUntil(idle, 200000000, "final prompt after answer");
  const stopped = m.text(from), stoppedUser = m.read(4) >> 4;
  assert.equal(stoppedUser, answer === "\x03" ? 0 : 7, "only control-C drops the next chain piece");
  const recoveryFrom = m.output.length;
  m.type("USER 3\r");
  m.runUntil(idle, 200000000, "next command");
  assert.equal(m.read(4) >> 4, 3, "next command executes after abort");
  assert.deepEqual(writes, [], "no transient write into the CCP stack guard");
  assert.deepEqual(m.violations, []);
  return { board, answer: answer.charCodeAt(0), answerDelivery: board === "glcd" ? (answer === "\x03" ? "BDOS pending-input byte" : "matrix keyboard") : "serial terminal", width: m.read(m.sym("VWID")), height: m.read(m.sym("VHGT")), paused, stopped, stoppedUser, recovery: m.text(recoveryFrom), peaks: Object.fromEntries(Object.entries(low).map(([p, v]) => [p, top - v])), guardWrites: writes.length, cycles: { toPause: atPause - start, afterAnswer: m.cycles - atPause } };
}
const result = { reference: refs[0], candidate: refs[1], romHashes: refs.map((dir) => createHash("sha256").update(rom(dir).image).digest("hex")), runs: [] };
for (const board of ["serial", "glcd"]) for (const answer of ["Q", "\x1b", "\x03"]) {
  const pair = refs.map((dir) => run(rom(dir), board, answer));
  const visible = ({ peaks, cycles, ...r }) => r;
  assert.deepEqual(visible(pair[1]), visible(pair[0]), `${board}, answer ${answer.charCodeAt(0)}`);
  result.runs.push({ board, answer: answer.charCodeAt(0), equivalent: true, reference: pair[0], candidate: pair[1] });
  console.error(`${board}, ${answer.charCodeAt(0)}: matched; candidate peaks ${JSON.stringify(pair[1].peaks)}`);
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
