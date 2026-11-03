// KS38's checkers. A rename leaves the image as it was, byte for byte; a move
// reorders it, so it is compared label by label, each label's bytes against
// the same label's in the baseline, with an address in the ROM taken as equal
// when it names the same label and offset on both sides. The names search
// finds old file and label names left in src/.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const ROM_BASE = 0xc000;

/** The opcodes of DJNZ and the JRs, whose operand is a displacement. */
const JR = new Set([0x10, 0x18, 0x20, 0x28, 0x30, 0x38]);

/** A built tree's image, its ROM labels by address, its constants and the end of what it uses. */
export function built(dir) {
  const at = (f) => resolve(dir, "build/tecos", f);
  const d8 = JSON.parse(readFileSync(at("tecos.d8.json"), "utf8"));
  const census = JSON.parse(readFileSync(at("census.json"), "utf8"));
  const labels = d8.symbols.filter((s) => s.kind === "label").map((s) => ({ name: s.name.toUpperCase(), address: s.address }));
  const constants = new Map(d8.symbols.filter((s) => s.kind === "constant").map((s) => [s.name.toUpperCase(), s.value]));
  return { image: readFileSync(at("tecos.rom")), labels, constants, end: ROM_BASE + census.rom.used };
}

/** A and B byte for byte: the count of bytes that differ and the first few. */
export function sameImage(a, b, shown = 8) {
  const first = [];
  let count = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    count += 1;
    if (first.length < shown) first.push({ address: ROM_BASE + i, a: a[i], b: b[i] });
  }
  return { same: count === 0, count, first, lengths: [a.length, b.length] };
}

/**
 * One side's ROM labels grouped by address: each group's names (renamed to
 * the baseline's where RENAMES maps them), its start and its length, up to the
 * next group or the end of what the ROM uses.
 */
function groups(side, renames = {}) {
  const byAddress = new Map();
  for (const { name, address } of side.labels) {
    if (address < ROM_BASE || address >= side.end) continue;
    if (!byAddress.has(address)) byAddress.set(address, []);
    byAddress.get(address).push(renames[name] ?? name);
  }
  const starts = [...byAddress.keys()].sort((x, y) => x - y);
  return starts.map((start, i) => ({ start, length: (starts[i + 1] ?? side.end) - start, names: byAddress.get(start).sort() }));
}

/** The group holding ADDRESS, and the offset into it; none outside the ROM's used part. */
function locator(list) {
  return (address) => {
    let lo = 0;
    let hi = list.length - 1;
    if (hi < 0 || address < list[0].start || address >= list[hi].start + list[hi].length) return null;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (list[mid].start <= address) lo = mid;
      else hi = mid - 1;
    }
    return { names: list[lo].names, offset: address - list[lo].start };
  };
}

/** Two places the same: the same offset into groups that share a name. */
const samePlace = (p, q) => p !== null && q !== null && p.offset === q.offset && p.names.some((n) => q.names.includes(n));

/**
 * BASE and MOVED label by label. Each group of labels at one address in BASE
 * is found in MOVED by its names; its bytes must match, but for a word that is
 * an address of the same place on both sides, the same offset from the same
 * label, a byte that is the low or high half of one label's address on both
 * sides, as CP LOW(BENTRY) is, and a relative jump's displacement to the same
 * place, when code moves between the jump and its target. RENAMES maps BASE's names to MOVED's. Names missing or extra,
 * constants that differ (an address in the ROM again taken by its place) and
 * the bytes used are reported too.
 */
export function compareLabels(base, moved, { renames = {} } = {}) {
  const fromMoved = Object.fromEntries(Object.entries(renames).map(([old, now]) => [now, old]));
  const gb = groups(base);
  const gm = groups(moved, fromMoved);
  const where = { base: locator(gb), moved: locator(gm) };
  const inMoved = new Map(gm.flatMap((g) => g.names.map((n) => [n, g])));
  const named = new Set(gb.flatMap((g) => g.names));
  const differences = [];
  let masked = 0;
  let maskedBytes = 0;
  let maskedJumps = 0;
  // A byte operand that is LOW or HIGH of a label's address: the pairs of
  // values, base and moved, that one label's moved address gives.
  const at = new Map(gm.flatMap((g) => g.names.map((n) => [n, g.start])));
  const halves = new Set(
    gb.flatMap((g) => g.names.filter((n) => at.has(n) && at.get(n) !== g.start).flatMap((n) => [`${g.start & 255},${at.get(n) & 255}`, `${g.start >> 8},${at.get(n) >> 8}`])),
  );
  for (const n of named) if (!inMoved.has(n)) differences.push({ label: n, kind: "missing" });
  for (const g of gm) for (const n of g.names) if (!named.has(n)) differences.push({ label: renames[n] ?? n, kind: "extra" });
  for (const g of gb) {
    const label = g.names.join("/");
    const present = g.names.filter((n) => inMoved.has(n));
    if (!present.length) continue;
    const m = inMoved.get(present[0]);
    const apart = present.filter((n) => inMoved.get(n) !== m);
    if (apart.length) differences.push({ label, kind: "apart", names: apart });
    if (m.length !== g.length) {
      differences.push({ label, kind: "length", base: g.length, moved: m.length });
      continue;
    }
    const a = base.image.subarray(g.start - ROM_BASE, g.start - ROM_BASE + g.length);
    const b = moved.image.subarray(m.start - ROM_BASE, m.start - ROM_BASE + m.length);
    const word = (x, k) => x[k] | (x[k + 1] << 8);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      // The differing byte is an address's low byte, or its high byte with the low one equal.
      const j = [i, i - 1].find((k) => k >= 0 && k + 1 < a.length && samePlace(where.base(word(a, k)), where.moved(word(b, k))));
      if (j !== undefined) {
        masked += 1;
        i = j + 1;
        continue;
      }
      if (halves.has(`${a[i]},${b[i]}`)) {
        maskedBytes += 1;
        continue;
      }
      // A relative jump's displacement, its opcode the same, to the same place on both sides.
      const signed = (v) => (v < 128 ? v : v - 256);
      if (i > 0 && a[i - 1] === b[i - 1] && JR.has(a[i - 1]) && samePlace(where.base(g.start + i + 1 + signed(a[i])), where.moved(m.start + i + 1 + signed(b[i])))) {
        maskedJumps += 1;
        continue;
      }
      differences.push({ label, kind: "bytes", offset: i, base: a[i], moved: b[i] });
      break;
    }
  }
  for (const [name, v] of base.constants) {
    const w = moved.constants.get(renames[name] ?? name);
    if (w === undefined || w === v || samePlace(where.base(v), where.moved(w))) continue;
    differences.push({ label: name, kind: "constant", base: v, moved: w });
  }
  const used = [base.end - ROM_BASE, moved.end - ROM_BASE];
  if (used[0] !== used[1]) differences.push({ label: "", kind: "used", base: used[0], moved: used[1] });
  return { same: differences.length === 0, differences, groups: gb.length, masked, maskedBytes, maskedJumps, used };
}

/**
 * Lines in DIR/src that name any of NAMES as a whole word, without regard to
 * case. History (.md) and generated files are outside, and so is a mention of
 * drivers/glcd.asm, the GLCD driver's own file, which keeps its name.
 */
export function searchNames(dir, names, { scope = ["src"], outside = [/\.md$/i, /^src\/gen\//], allowed = ["drivers/glcd.asm"] } = {}) {
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const term = new RegExp(`(?<![\\w.])(${escaped.join("|")})(?![\\w])`, "i");
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(resolve(dir, d), { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.name.startsWith(".") || outside.some((r) => r.test(p))) continue;
      if (e.isDirectory()) walk(p);
      else
        readFileSync(resolve(dir, p), "utf8")
          .split("\n")
          .forEach((line, i) => {
            const m = term.exec(allowed.reduce((l, a) => l.replaceAll(a, ""), line));
            if (m) hits.push({ file: relative(dir, resolve(dir, p)), line: i + 1, name: m[1] });
          });
    }
  };
  for (const s of scope) walk(s);
  return hits;
}
