// MON3.SVC's second stage: HEX loading, file names, the matrix keyboard and
// the size (KG64); the MON-3 API against MON-3 itself, the latch, the
// checksum and the fixes carried from the first stage (KG65); the real
// programs (KG66). Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MON3, PROMPT, bin, bytesAt, hello3, line, mon3Variant, word } from "./lib/mon3.mjs";
import { goTo, hexFile, inSession, ok, pageOf, refused, runnable, toMon3, toPrompt, tpaDigest } from "./lib/mon3s2.mjs";

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// GO carries PROTECT and CAPS into the latch: SYS_MODE 81h and PROT_MODE
// 02h written at MON3> give 83h at the program, and 81h back at MON3>.

async function goCarries(svc) {
  const { m } = await inSession({ "RET.BIN": bin(0xc9) }, { svc });
  assert.ok(ok(line(m, "LOAD RET.BIN")));
  m.write(0x089d, 0x81);
  m.write(0x089e, 0x02);
  goTo(m, "GO", 0x4000, 5_000_000);
  assert.equal(m.sysCtrl, 0x83, `the latch at 4000h: ${hex2(m.sysCtrl)}h`);
  assert.equal(m.read(0x40), m.sysCtrl, "LATCHV equals the latch at 4000h");
  toMon3(m, 5_000_000);
  assert.equal(m.sysCtrl, 0x81, `the latch at MON3>: ${hex2(m.sysCtrl)}h`);
  assert.equal(m.read(0x40), m.sysCtrl, "LATCHV equals the latch at MON3>");
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG65 go carries protect and caps", () => goCarries());

test("KG65 mutant: GOKEEP EQU $00 drops PROTECT and CAPS at GO", async () => {
  const svc = await mon3Variant([["GOKEEP EQU $82\n", "GOKEEP EQU $00\n"]]);
  await assert.rejects(goCarries(svc), /the latch at 4000h/);
});

// A program that clears 0005h-0007h: every BDOS call the service makes goes
// through its header's JP, so each way out still works.

const CLEAR5 = [0xaf, 0x32, 0x05, 0x00, 0x32, 0x06, 0x00, 0x32, 0x07, 0x00]; // XOR A; LD (0005h),A; (0006h); (0007h)

/** The installed service's image, as relocated in memory. */
const loadedImage = (m, svc) => bytesAt(m, pageOf(m) << 8, svc.image);

/** The static check: no CALL 0005h and no JP 0005h in the image as loaded. */
async function noCall5(svc) {
  const { m, svc: s } = await inSession({}, { svc });
  const image = loadedImage(m, s);
  for (const op of [0xcd, 0xc3]) {
    const at = image.findIndex((b, i) => b === op && image[i + 1] === 0x05 && image[i + 2] === 0x00);
    assert.equal(at, -1, `no ${hex2(op)} 05 00 in the relocated image (at ${at})`);
  }
}

/** The three exits with 0005h-0007h cleared. */
async function bdosDamaged(svc) {
  const files = { "R0.BIN": bin(CLEAR5, 0xc7), "J0.BIN": bin(CLEAR5, 0xc3, 0, 0), "RET.BIN": bin(CLEAR5, 0xc9), "ONE.BIN": bin(0xc9) };
  const { m } = await inSession(files, { svc });
  for (const name of ["R0.BIN", "J0.BIN"]) {
    assert.ok(ok(line(m, `LOAD ${name}`)), name);
    m.mark = m.output.length;
    m.type("GO\r");
    const from = m.mark;
    m.runUntil(() => m.waitingForInput() && PROMPT.test(m.text(from)), 60_000_000, `A> after ${name}`);
    const dir = m.command("DIR");
    for (const f of ["MON3.SVC", ...Object.keys(files)]) assert.match(dir, new RegExp(`\\b${f.split(".")[0]}\\s+${f.split(".")[1]}\\b|\\b${f.replace(".", "\\.")}\\b`), `${name}: DIR lists ${f}`);
    assert.ok(line(m, "MON3.SVC /E").mon3, `${name}: and the session enters again`);
  }
  assert.ok(ok(line(m, "LOAD RET.BIN")));
  m.mark = m.output.length;
  m.type("GO\r");
  toMon3(m, 10_000_000);
  assert.equal(m.read(7), 0, "0007h holds 0");
  assert.ok(refused(line(m, "LOAD ONE.BIN")), "LOAD refused while 0007h holds 0");
  m.mark = m.output.length;
  m.type("EXIT\r");
  assert.match(toPrompt(m), /A>$/, "EXIT reaches A>");
}

test("KG65 bdos page damaged", async () => {
  await noCall5();
  await bdosDamaged();
});

test("KG65 mutant: the hook's BDOS 37 through 0005h hangs after RST 00h", async () => {
  const svc = await mon3Variant([["RESETD:\n  ld de,0-1\n  ld c,37\n  jp BDOS\n", "RESETD:\n  ld de,0-1\n  ld c,37\n  jp $0005\n"]]);
  await assert.rejects(bdosDamaged(svc), /A> after R0\.BIN/);
});

test("KG65 mutant: LOAD's BDOS 15 through 0005h fails the static check", async () => {
  const svc = await mon3Variant([["  ld c,15        ; open\n  call BDOS\n", "  ld c,15        ; open\n  call $0005\n"]]);
  await assert.rejects(noCall5(svc), /no CD 05 00/);
});

// File names: a wildcard, a name over eight characters or a type over
// three is refused before BDOS 15, for .BIN and .HEX alike.

const NAMES = (t) => [`LOAD HELLO?.${t}`, `LOAD H*.${t}`, `LOAD HELLO3.${t[0]}?${t[2]}`, `LOAD ABCDEFGHI.${t}`, `LOAD HELLO3.${t}X`];

async function fileNames(svc) {
  const h = await hello3();
  const files = { "HELLO3.BIN": h, "ABCDEFGH.BIN": h, "HELLO3.HEX": hexFile([[0x4000, h]]), "ABCDEFGH.HEX": hexFile([[0x4000, h]]), "ONE.BIN": bin(0xc9) };
  const { m, svc: s } = await inSession(files, { svc });
  for (const cmd of [...NAMES("BIN"), ...NAMES("HEX")]) {
    assert.ok(ok(line(m, "LOAD ONE.BIN 5000")), "a good load first");
    const [before, opens] = [tpaDigest(m), m.opens.length];
    const r = line(m, cmd);
    assert.ok(refused(r), `${cmd}: ? (${JSON.stringify(r.out)})`);
    assert.deepEqual(m.opens.slice(opens), [], `${cmd}: BDOS 15 never called`);
    assert.equal(tpaDigest(m), before, `${cmd}: nothing written`);
    assert.equal(runnable(m, s), 0, `${cmd}: nothing runnable`);
  }
  assert.ok(!line(m, "EXIT").mon3);
}

test("KG64 file names", () => fileNames());

test("KG64 mutant: the wildcard test removed loads HELLO?.BIN", async () => {
  const svc = await mon3Variant([["  cp '?'\n  scf\n  ret z          ; a wildcard\n  cp '*'\n  scf\n  ret z          ; and the other\n", ""]]);
  await assert.rejects(fileNames(svc), /LOAD HELLO\?\.BIN: \?/);
});

test("KG64 mutant: the name-length test removed loads ABCDEFGH.BIN for ABCDEFGHI.BIN", async () => {
  const svc = await mon3Variant([["  ret c          ; a wildcard\n  bit 7,b        ; B below 0: too long\n  scf\n  ret nz\n", "  ret c          ; a wildcard\n"]]);
  await assert.rejects(fileNames(svc), /LOAD ABCDEFGHI\.BIN: \?/);
});

test("KG64 mutant: the type-length test removed loads HELLO3.BIN for HELLO3.BINX", async () => {
  const svc = await mon3Variant([["  ret c          ; a wildcard\n  bit 7,b        ; too long\n  scf\n  ret nz\n", "  ret c          ; a wildcard\n"]]);
  await assert.rejects(fileNames(svc), /LOAD HELLO3\.BINX: \?/);
});
