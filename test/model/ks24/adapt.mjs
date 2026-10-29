// The draft's other users of the table, adapted: the GLCD driver and the
// test programs include src/abi.inc; the tests take each address from the
// symbol map and look for major 3. Edit (test/edit.test.mjs) is a separate
// project's binary and is left as it is. Each change is a literal swap that
// must find its text at BASE.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const INC = '%INCLUDE "../../src/abi.inc"';

/** Each file of DIR with its swaps: [from, to] literal pairs, every one found. */
function apply(dir, path, swaps) {
  const p = resolve(dir, path);
  let t = readFileSync(p, "utf8");
  for (const [from, to] of swaps) {
    if (!t.includes(from)) throw new Error(`${path}: no ${JSON.stringify(from.slice(0, 70))}`);
    t = t.split(from).join(to);
  }
  writeFileSync(p, t);
  return swaps.length;
}

/** The include after a program's opening comment block. */
function applyHead(dir, path, inc) {
  const p = resolve(dir, path);
  const t = readFileSync(p, "utf8");
  const re = /^((?:;.*\n)+)\n/;
  if (!re.test(t)) throw new Error(`${path}: no opening comment block`);
  writeFileSync(p, t.replace(re, (_, head) => `${head}${inc}\n\n`));
}

export function adapt(dir) {
  const changes = {};
  const go = (path, swaps) => (changes[path] = apply(dir, path, swaps));

  // Programs and the driver.
  applyHead(dir, "drivers/glcd.asm", '%INCLUDE "../src/abi.inc"');
  go("drivers/glcd.asm", [
    ["GLHOOK  EQU     $FF25           ; the video table: HL = six words, or 0", "GLHOOK  EQU     ABIGLCD         ; the video table: HL = six words, or 0"],
    ["LD      A,($FF23)       ; the ROM's font, through the FF00h table", "LD      A,(ABIFONT)     ; the ROM's font, through the table"],
    ["LD      A,($FF24)", "LD      A,(ABIFONT+1)"],
  ]);
  for (const p of ["demo", "mount", "vols", "shell", "refuse", "openrd"]) applyHead(dir, `test/programs/${p}.asm`, INC);
  go("test/programs/demo.asm", [
    ["HWSVC   EQU     $FF0B           ; hardware services, ABI 1.1", "HWSVC   EQU     ABIHW           ; hardware services"],
    ["LD      HL,$FF00        ; TEC-OS's table: hardware services from 1.1", "LD      HL,ABITAB       ; TEC-OS's table"],
    ["LD      A,($FF03)       ; ABI 2.0 and later have them all", "LD      A,(ABIMAJ)      ; ABI 2.0 and later have them all"],
    ["LD      A,($FF04)", "LD      A,(ABIMIN)"],
  ]);
  go("test/programs/mount.asm", [["VOLSVC  EQU     $FF20", "VOLSVC  EQU     ABIVOL"]]);
  go("test/programs/vols.asm", [["VOLSVC  EQU     $FF20", "VOLSVC  EQU     ABIVOL"]]);
  go("test/programs/shell.asm", [["CALL    $FF1A", "CALL    ABIXCCP"], ["CALL    $FF1D", "CALL    ABIXCMD"]]);
  go("test/programs/refuse.asm", [["CALL    $FF1A", "CALL    ABIXCCP"], ["CALL    $FF1D", "CALL    ABIXCMD"]]);
  go("test/programs/openrd.asm", [["CALL    $FF1A", "CALL    ABIXCCP"]]);

  // The assembler's root is the repository, so an include may reach src/;
  // a copy assembled elsewhere has its includes re-pointed.
  go("tools/lib/assemble.mjs", [
    ['import { basename, dirname, resolve } from "node:path";', 'import { dirname, relative, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";'],
    ["const r = await assembleAtomProject({ root: dirname(src), entry: basename(src) });", "const r = await assembleAtomProject({ root: ROOT, entry: relative(ROOT, src) });"],
    ["/** Assemble SOURCE;", 'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");\n\n/** Assemble SOURCE;'],
  ]);
  go("tools/lib/prl.mjs", [
    ['import { basename, resolve } from "node:path";', 'import { basename, dirname, relative, resolve } from "node:path";'],
    [
      "writeFileSync(copy, text.replace(org, (_, lead) => `${lead}$${hex}`));",
      "const repoint = (t) => t.replace(/^(%INCLUDE\\s+\")([^\"]+)\"/gm, (_, head, p) => `${head}${relative(work, resolve(dirname(source), p))}\"`);\n  writeFileSync(copy, repoint(text.replace(org, (_, lead) => `${lead}$${hex}`)));",
    ],
  ]);

  // The tests.
  go("test/hwsvc.test.mjs", [
    ['import { ROOT, boot, standardCard } from "./lib/fixtures.mjs";', 'import { ROOT, boot, romFor, standardCard } from "./lib/fixtures.mjs";'],
    ["const HWSVC = 0xff0b;", 'const HWSVC = romFor().symbols.get("ABIHW");'],
  ]);
  go("test/warmboot.test.mjs", [["r.call(0xff20,", 'r.call(r.m.sym("ABIVOL"),']]);
  go("test/xmove.test.mjs", [
    ["0xcd, 0x12, 0xff,", '0xcd, ...le(m.sym("ABIXMOV")),'],
    ["0xcd, 0x15, 0xff,", '0xcd, ...le(m.sym("ABIMOVE")),'],
    ["/** Run XMOVE then MOVE", "const le = (a) => [a & 0xff, a >> 8];\n\n/** Run XMOVE then MOVE"],
    [
      `test("the FF00h table gives the EXPAND count at FF10h, XMOVE at FF12h, MOVE at FF15h and the low mark at FF18h", () => {
  for (const mains of [2, 1]) {
    const m = boot(standardCard(), { ram96: true, mains });
    assert.ok(m.read(0xff03) === 2 && m.read(0xff04) >= 3, "ABI 2.3 or later");
    const at = (a) => m.read(m.read(a) | (m.read(a + 1) << 8));
    assert.deepEqual([at(0xff0e), at(0xff10), at(0xff18)], [mains, 2, 0x80], \`MAIN \${mains}\`);
    assert.deepEqual([m.read(0xff12), m.read(0xff15)], [0xc3, 0xc3]);`,
      `test("the table gives the MAIN count, XMOVE, MOVE and the low mark; EXPAND is always 2", () => {
  for (const mains of [2, 1]) {
    const m = boot(standardCard(), { ram96: true, mains });
    const S = (n) => m.sym(n);
    assert.ok(m.read(S("ABIMAJ")) === 3, "ABI 3");
    const at = (a) => m.read(m.read(a) | (m.read(a + 1) << 8));
    assert.deepEqual([at(S("ABIMAIN")), m.read(S("EXPANDS")), at(S("ABIXMRK"))], [mains, 2, 0x80], \`MAIN \${mains}\`);
    assert.deepEqual([m.read(S("ABIXMOV")), m.read(S("ABIMOVE"))], [0xc3, 0xc3]);`,
    ],
  ]);
  go("test/system.test.mjs", [
    ["  // SETV leaves 0008h jumping into the TPA, 0010h jumping into ROM (FF0Bh)", '  // SETV leaves 0008h jumping into the TPA, 0010h jumping into ROM (the\n  // hardware services\' entry in the table)\n  const HW = romFor().symbols.get("ABIHW");'],
    ["0x10: [0xc3, 0x0b, 0xff]", "0x10: [0xc3, HW & 0xff, HW >> 8]"],
    ["want.splice(0x10 - 0x08, 8, 0xc3, 0x0b, 0xff, 0, 0, 0, 0, 0);", "want.splice(0x10 - 0x08, 8, 0xc3, HW & 0xff, HW >> 8, 0, 0, 0, 0, 0);"],
    ["m.runUntil(() => m.pc === 0xff0b || m.pc === 0x0101,", "m.runUntil(() => m.pc === HW || m.pc === 0x0101,"],
    ["assert.equal(m.pc, 0xff0b, ", "assert.equal(m.pc, HW, "],
  ]);
  go("test/levels.test.mjs", [['assert.ok(m.read(0xff03) === 2 && m.read(0xff04) >= 7, "ABI 2.7 or later");', 'assert.ok(m.read(m.sym("ABIMAJ")) === 3, "ABI 3");']]);
  go("test/ram96.test.mjs", [
    ["const mainsAt = (m) => m.read(m.read(0xff0e) | (m.read(0xff0f) << 8));", 'const mainsAt = (m) => m.read(m.read(m.sym("ABIMAIN")) | (m.read(m.sym("ABIMAIN") + 1) << 8));'],
    ['assert.ok(m.read(0xff03) === 2 && m.read(0xff04) >= 1, "ABI 2.1 or later");', 'assert.ok(m.read(m.sym("ABIMAJ")) === 3, "ABI 3");'],
  ]);
  go("test/cache.test.mjs", [
    ["0xcd, 0x0b, 0xff]); // BLOCK", '0xcd, m.sym("ABIHW") & 0xff, m.sym("ABIHW") >> 8]); // BLOCK'],
    ["0xcd, 0x20, 0xff]); // FF20h: mount", '0xcd, m.sym("ABIVOL") & 0xff, m.sym("ABIVOL") >> 8]); // mount'],
  ]);
  go("test/glcd.test.mjs", [
    ['test("FF25h takes a table', 'test("the GLCD hook takes a table'],
    ["[0x21, hl & 0xff, hl >> 8, 0xcd, 0x25, 0xff, 0x18, 0xfe]", '[0x21, hl & 0xff, hl >> 8, 0xcd, m.sym("ABIGLCD") & 0xff, m.sym("ABIGLCD") >> 8, 0x18, 0xfe]'],
  ]);
  // FF05h and FF06h are gone: the first test checks the table's head
  // instead; the demo's test looks for major 3.
  go("test/devices.test.mjs", [
    [
      /test\("the old native service entry at FF06h[\s\S]*?\n\}\);\n/.exec(readFileSync(resolve(dir, "test/devices.test.mjs"), "utf8"))[0],
      `test("the table at C003h: TNA, ABI 3.0, and the entries abi.inc names", () => {
  const m = boot(standardCard());
  const S = (n) => m.sym(n);
  assert.equal(S("ABITAB"), 0xc003);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => m.read(S("ABITAB") + i)), [0x54, 0x4e, 0x41, 3, 0], "TNA 3.0");
  for (const n of ["ABIHW", "ABIXMOV", "ABIMOVE", "ABIXCCP", "ABIXCMD", "ABIVOL", "ABIGLCD"]) assert.equal(m.read(S(n)), 0xc3, \`\${n} is a jump\`);
  noViolations(m);
});
`,
    ],
    ['assert.equal(m.read(0xff03), 2, "ABI 2, with the hardware services");', 'assert.equal(m.read(m.sym("ABIMAJ")), 3, "ABI 3, with the hardware services");'],
  ]);

  // The release set: abi.inc published in dist; the free space is at the end.
  go("tools/media.mjs", [
    ['  const below = at("ABITAB") - at("CODEEND");', '  const below = 0x10000 - at("CODEEND");'],
    ['  const readme = Buffer.from(', '  copyFileSync(resolve(ROOT, "src/abi.inc"), resolve(DIST, "abi.inc"));\n  const readme = Buffer.from('],
  ]);
  return changes;
}
