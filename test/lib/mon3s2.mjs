// MON3.SVC's S2 tests: sessions on a card, the BDOS 15 counter, what a load
// writes and leaves runnable, and the HEX files KG64 names, made by its record
// rule.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { volume } from "./fixtures.mjs";
import { MON3, PROMPT, bytesAt, card, line, machine, mon3Svc, word } from "./mon3.mjs";

export const sha = (b) => createHash("sha256").update(b).digest("hex");

/** F memoised by its argument's JSON. */
export const memo = (f) => {
  const made = new Map();
  return (arg = {}) => {
    const k = JSON.stringify(arg);
    if (!made.has(k)) made.set(k, f(arg));
    return made.get(k);
  };
};

/** MON3.SVC's build, made once: { file, symbols, image, fixups }. */
export const mon3Build = memo(() => mon3Svc());

/** Every BDOS 15 that M makes, by the name in its FCB: m.opens. */
export function countOpens(m) {
  m.opens = [];
  const bentry = m.sym("BENTRY");
  const step = m.step.bind(m);
  m.step = () => {
    const c = m.cpu.cpu;
    if (m.pc === bentry && c.c === 15) {
      const de = (c.d << 8) | c.e;
      const f = String.fromCharCode(...bytesAt(m, de + 1, 11));
      m.opens.push(`${f.slice(0, 8).trimEnd()}.${f.slice(8).trimEnd()}`);
    }
    return step();
  };
  return m;
}

/** A machine on a card with FILES on A:, and TEXT written as text files, counting opens. OPTS as lib/mon3's machine. */
export function boot(files, opts, text = {}) {
  const image = card(files);
  const a = volume(image, "A");
  for (const [name, bytes] of Object.entries(text)) a.write(name, bytes, { text: true });
  const m = countOpens(machine(image, opts));
  m.image = image;
  return m;
}

/** The pages of the services installed, newest first. */
export function pages(m) {
  const out = [];
  for (let p = m.read(m.sym("SVCHEAD")); p; p = m.read((p << 8) + 8)) out.push(p);
  return out;
}

/** The page of the installed service named NAME. */
export const pageOf = (m, name = "MON3") => pages(m).find((p) => String.fromCharCode(...bytesAt(m, (p << 8) + 17, 8)).trimEnd() === name);

/** A digest of the TPA, 0100h to the page below (0006h). */
export const tpaDigest = (m) => sha(Uint8Array.from(bytesAt(m, 0x100, (word(m, 6) & 0xff00) - 0x100)));
/** The TPA's bytes, 0100h to the page below (0006h). */
export const tpaBytes = (m) => Uint8Array.from(bytesAt(m, 0x100, (word(m, 6) & 0xff00) - 0x100));
/** MON3.SVC's state byte NAME, read in the installed service. */
export const state = (m, svc, name) => m.read((pageOf(m) << 8) + svc.symbols[name]);
/** Nonzero after a good load. */
export const runnable = (m, svc) => state(m, svc, "RUNOK");

/** A session on a card with FILES and TEXT files, MON3.SVC (SVC, or the build) installed and entered. */
export async function inSession(files = {}, { svc, machine: opts, text } = {}) {
  svc ??= await mon3Build();
  const m = boot({ "MON3.SVC": svc.file, ...files }, opts, text);
  m.command("MON3.SVC");
  assert.ok(line(m, "MON3.SVC /E").mon3, "MON3.SVC /E gives MON3>");
  return { m, svc };
}

export const refused = (r) => /\r\n\?\r\n\r\nMON3>$/.test(r.out);
export const ok = (r) => r.mon3 && !/\r\n\?\r\n/.test(r.out);

/** Type TEXT at MON3> and run until the program is at PC. */
export function goTo(m, text, pc, max = 50_000_000) {
  m.mark = m.output.length;
  m.type(`${text}\r`);
  m.runUntil(() => m.pc === pc, max, `pc ${pc.toString(16)} after ${text}`);
}

/** Run on to MON3>, from the mark. */
export function toMon3(m, max = 50_000_000) {
  m.runUntil(() => m.waitingForInput() && MON3.test(m.text(m.mark)), max, "MON3>");
  return m.text(m.mark);
}

/** Run M to the CCP's prompt, answering a BDOS error's key. */
export function toPrompt(m, from = m.mark) {
  for (let i = 0; i < 20; i += 1) {
    const n = m.output.length;
    const end = m.cycles + 40_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && PROMPT.test(m.text(from))), 60_000_000, "the CCP's prompt");
    if (m.waitingForInput() && PROMPT.test(m.text(from))) return m.text(from);
    if (m.waitingForInput() && m.output.length === n) m.type("\r");
  }
  throw new Error(`no prompt: ${m.text(from)}`);
}

// HEX files by KG64's record rule: records of up to 16 data bytes, upper-case
// digits, the end record last, CR LF after every record.

const h2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

/** One record's text, without its CR LF: LEN, ADDRESS, TYPE, DATA, and a checksum (or CHECK in its place). */
export function record(address, type, data = [], check) {
  const bytes = [data.length, (address >> 8) & 0xff, address & 0xff, type, ...data];
  const sum = check ?? (-bytes.reduce((a, b) => a + b, 0) & 0xff);
  return `:${[...bytes, sum].map(h2).join("")}`;
}

/** The records of BLOCKS ([address, bytes]), sixteen data bytes each. */
export const dataRecords = (blocks) => blocks.flatMap(([at, bytes]) => Array.from({ length: Math.ceil(bytes.length / 16) }, (_, i) => record(at + i * 16, 0, [...bytes.subarray(i * 16, i * 16 + 16)])));

export const END = ":00000001FF";

/** Lines joined with CR LF after each, as bytes. */
export const lines = (ls) => Buffer.from(ls.map((l) => `${l}\r\n`).join(""), "latin1");

/** A HEX file of BLOCKS ([address, bytes]) by the record rule. */
export const hexFile = (blocks) => lines([...dataRecords(blocks), END]);

/** BIG16K.BIN: 16,384 bytes, byte i = (7i + 3) AND FFh. */
export const BIG16K = Uint8Array.from({ length: 16384 }, (_, i) => (7 * i + 3) & 0xff);

export const HASHES = {
  "HELLO3.HEX": "b05cec7bf24806e790033e7a0b262dea4a9ef696746a302107df33709705a89d",
  "BIG16K.HEX": "cdfb67f69f9ac473a370e6ba5e1d0b7a5380958100ffabce446402e04f8a64ec",
  "BIG16K.BIN": "ab571d12466f75ae481bdbbbfec70a0c53bf78e2849862addfa9a049d8f6fbc0",
  "MZ80.HEX": "cd2369448e27e0653274a1f36e3dab21ac73162dd42abde9cfe449acabafd950",
};
