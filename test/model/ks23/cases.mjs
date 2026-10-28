// KS23's gate cases, run on a built tree (rom.mjs): the base at b8c7214 for
// contrast, or the draft. Each case starts from a fresh card: SYSTEM on A:,
// WORK on B: written behind, as on the starter card, and ARCHIVE on C:,
// read-only, for KG12's cases. The command runs with the TPA filled with a
// pattern, which must hold afterwards; then ^C warm boots, so B:'s lines
// reach the card, and the card is read.
//
// Copies must make the destination byte for byte as the source and print
// what the reference command prints; refusals must print "COPY?" and leave
// the card byte for byte as it was. KG12's cases compare the built-in with
// COPY.COM (test/programs/copy.asm) on the same tree.

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const pattern = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed * 31 + (i >> 7)) & 0xff);
const TPA = [0x0100, 0xb406];
const tpaByte = (a) => (a * 13 + (a >> 8) * 7 + 0x5a) & 0xff;
const SIZES = [0, 1, 128, 157, 300];

export async function runCases(dir) {
  const { boot, program, volume } = await import(pathToFileURL(resolve(dir, "test/lib/fixtures.mjs")));
  const { createContainer } = await import(pathToFileURL(resolve(dir, "tools/lib/container.mjs")));
  const copyCom = (await program("copy")).bytes;

  function card() {
    const image = createContainer([
      { geometry: "G1M", label: "SYSTEM", mount: "A" },
      { geometry: "G8M", label: "WORK", mount: "B", writeBehind: true },
      { geometry: "G1M", label: "ARCHIVE", mount: "C", readOnly: true },
    ]);
    const a = volume(image, "A");
    const b = volume(image, "B");
    a.write("X.COM", pattern(3000, 1));
    a.write("X.DAT", pattern(1500, 2));
    a.write("S.DAT", pattern(900, 7), { system: true });
    a.write("R.DAT", pattern(700, 8), { readOnly: true });
    a.write("X.DAT", pattern(1100, 9), { user: 1 });
    b.write("X.COM", pattern(2600, 3));
    b.write("X.DAT", pattern(1300, 4));
    for (const d of ["A", "B"]) for (const n of SIZES) volume(image, d).write(`S${n}.DAT`, pattern(n * 128, n + d.charCodeAt(0)));
    b.write("E157.DAT", pattern(300 * 128, 99));
    a.write("XCOPY.COM", copyCom);
    return image;
  }

  function run(m, line) {
    m.mark = m.output.length;
    m.type(`${line}\r`);
    const prompt = /\r\n[A-P]>$/;
    m.runUntil(() => m.waitingForInput(), 4_000_000_000, line);
    if (!prompt.test(m.text(m.mark))) {
      m.type("\r"); // a BDOS error waits for a key before its warm boot
      m.runUntil(() => m.waitingForInput() && prompt.test(m.text(m.mark)), 400_000_000, `${line} after the error`);
    }
    // The lines after the command's own, without the next prompt.
    const lines = m.text(m.mark).replace(/\r\n[A-P]>$/, "").split(/\r*\n/);
    const at = lines.findIndex((l) => l.endsWith(line.replace(/\x03/g, "")));
    return lines.slice(at + 1).join("\n").trim();
  }

  /** On a fresh card: SETUP lines, then LINE with the TPA watched, then ^C. */
  function trial(line, setup = []) {
    const image = card();
    const m = boot(image);
    for (const s of setup) run(m, s);
    const before = sha(image);
    for (let a = TPA[0]; a < TPA[1]; a += 1) m.write(a, tpaByte(a));
    const text = run(m, line);
    let tpa = 0;
    for (let a = TPA[0]; a < TPA[1]; a += 1) if (m.read(a) !== tpaByte(a)) tpa += 1;
    run(m, "\x03");
    return { image, text, tpaChanged: tpa, unchanged: sha(image) === before };
  }

  const out = [];
  const copied = (name, line, setup, from, to, ref) => {
    const t = trial(line, setup);
    const [fd, fn, fu] = from;
    const [td, tn] = to;
    let same = false;
    try {
      const src = volume(t.image, fd).read(fn, { user: fu ?? 0 });
      same = Buffer.compare(Buffer.from(volume(t.image, td).read(tn)), Buffer.from(src)) === 0;
    } catch {
      same = false;
    }
    const r = ref ? trial(ref[0], ref[1]) : null;
    const textOk = r ? t.text === r.text : /^COPIED [0-9A-F]{4}$/.test(t.text);
    out.push({ case: name, command: line, kind: "copied", text: t.text, reference: r?.text, sameBytes: same, textOk, tpaKept: t.tpaChanged === 0, pass: same && textOk && t.tpaChanged === 0 });
  };
  const refused = (name, line, setup = []) => {
    const t = trial(line, setup);
    const ok = t.text === "COPY?";
    out.push({ case: name, command: line, kind: "refused", text: t.text, cardUnchanged: t.unchanged, tpaKept: t.tpaChanged === 0, pass: ok && t.unchanged && t.tpaChanged === 0 });
  };

  copied("a drive alone, A: to B:", "COPY X.COM B:", [], ["A", "X.COM"], ["B", "X.COM"], ["COPY X.COM B:X.COM"]);
  copied("a drive alone, B: to A:", "COPY B:X.COM A:", [], ["B", "X.COM"], ["A", "X.COM"], ["COPY B:X.COM A:X.COM"]);
  copied("a blank name with a type", "COPY X.COM B:.TXT", [], ["A", "X.COM"], ["B", "X.COM"], ["COPY X.COM B:X.COM"]);
  refused("onto itself", "COPY X.DAT X.DAT");
  refused("onto itself, the destination's drive named", "COPY X.DAT A:X.DAT");
  refused("onto itself, the source's drive named", "COPY A:X.DAT X.DAT");
  refused("onto its own drive alone", "COPY X.DAT A:");
  refused("no destination", "COPY X.DAT");
  refused("onto itself, SYS", "COPY S.DAT S.DAT");
  refused("onto itself, R/O", "COPY R.DAT R.DAT");
  refused("onto itself on B:", "COPY B:X.DAT X.DAT", ["B:"]);
  refused("onto itself in user 1", "COPY X.DAT A:X.DAT", ["USER 1"]);
  copied("A: to B:, same name", "COPY X.DAT B:X.DAT", [], ["A", "X.DAT"], ["B", "X.DAT"], null);
  copied("A: to B:, run on B:", "COPY A:X.DAT X.DAT", ["B:"], ["A", "X.DAT"], ["B", "X.DAT"], null);

  // KG12's cases: the built-in against COPY.COM on the same tree.
  const kg12 = [];
  for (const n of SIZES) kg12.push(`S${n}.DAT D${n}.DAT`, `S${n}.DAT B:D${n}.DAT`, `B:S${n}.DAT A:D${n}.DAT`);
  kg12.push("S157.DAT B:E157.DAT", "NONE.DAT D.DAT", "S1.DAT C:D1.DAT");
  for (const args of kg12) {
    const b = trial(`COPY ${args}`);
    const c = trial(`XCOPY ${args}`);
    const same = sha(b.image) === sha(c.image) && b.text === c.text;
    out.push({ case: "KG12", command: `COPY ${args}`, kind: "kg12", text: b.text, reference: c.text, sameAsCopyCom: same, tpaKept: b.tpaChanged === 0, pass: same && b.tpaChanged === 0 });
  }
  return out;
}
