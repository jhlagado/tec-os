// The console font, format/font5x7.txt: one parser for the ROM's copy, which
// the display drivers draw from, and the tests.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hex = (v) => `$${v.toString(16).toUpperCase().padStart(2, "0")}`;

/** The font at ROOT as 96 glyphs of 8 rows, 20h to 7Fh. */
export function fontGlyphs(root) {
  const text = readFileSync(resolve(root, "format/font5x7.txt"), "utf8");
  const glyphs = new Map();
  let rows;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || (line.startsWith("#") && !/^[#.]{5}$/.test(line))) continue;
    const head = /^= ([0-9A-F]{2})$/.exec(line);
    if (head) {
      const code = parseInt(head[1], 16);
      if (code < 0x20 || code > 0x7f || glyphs.has(code)) throw new Error(`font: duplicate or out-of-range glyph ${head[1]}`);
      rows = [];
      glyphs.set(parseInt(head[1], 16), rows);
      continue;
    }
    if (!/^[#.]{5}$/.test(line)) throw new Error(`font: bad row ${JSON.stringify(line)}`);
    if (!rows || rows.length >= 8) throw new Error("font: row outside an eight-row glyph");
    rows.push(parseInt(line.replace(/#/g, "1").replace(/\./g, "0"), 2) << 3);
  }
  const out = [];
  for (let c = 0x20; c < 0x80; c += 1) {
    const g = glyphs.get(c);
    if (!g || g.length !== 8) throw new Error(`font: glyph ${c.toString(16)} missing or not 8 rows`);
    out.push(g);
  }
  return out;
}

/** The font as 768 bytes. */
export const fontBytes = (root) => Uint8Array.from(fontGlyphs(root).flat());

/**
 * The font packed as the ROM holds it. A glyph is a 4 by 7 design but for the
 * few rows that light a fifth column (bit 3). FONT is four bytes a glyph, two
 * rows a byte, the upper row in the high nibble. FONTW lists the glyphs with a
 * fifth column: their codes, then for each the rows that have it, bit 7 the
 * top row. The ROM's FNTGLY turns them back into eight rows.
 */
export function packFont(glyphs) {
  const packed = [];
  const wide = [];
  glyphs.forEach((rows, i) => {
    let mask = 0;
    rows.forEach((v, r) => {
      if (v & 0x07) throw new Error(`font: glyph ${(i + 0x20).toString(16)} lights a sixth column`);
      if (v & 0x08) mask |= 0x80 >> r;
    });
    for (let r = 0; r < 8; r += 2) packed.push((rows[r] & 0xf0) | (rows[r + 1] >> 4));
    if (mask) wide.push([i + 0x20, mask]);
  });
  if (wide.length !== FONTWN) throw new Error(`font: ${wide.length} glyphs with a fifth column, the ROM takes ${FONTWN}`);
  return { packed, codes: wide.map(([c]) => c), masks: wide.map(([, m]) => m) };
}

/** The glyphs FNTGLY gives back from a packing: what the ROM draws. */
export function unpackFont({ packed, codes, masks }) {
  return Array.from({ length: 96 }, (_, i) => {
    const w = codes.indexOf(i + 0x20);
    return Array.from({ length: 8 }, (_, r) => {
      const b = packed[i * 4 + (r >> 1)];
      const row = r & 1 ? (b << 4) & 0xf0 : b & 0xf0;
      return w >= 0 && masks[w] & (0x80 >> r) ? row | 0x08 : row;
    });
  });
}

/** The number of glyphs with a fifth column FNTGLY searches. */
export const FONTWN = 4;

/** The packed font as source: a heading, FONT, then FONTW's codes and rows. */
export function fontSource(root, heading) {
  const glyphs = fontGlyphs(root);
  const pack = packFont(glyphs);
  if (JSON.stringify(unpackFont(pack)) !== JSON.stringify(glyphs)) throw new Error("font: the packing does not give the font back");
  const rows = glyphs.map((_, i) => `\tDB\t${pack.packed.slice(i * 4, i * 4 + 4).map(hex).join(",")}`);
  return [heading, "FONT:", ...rows, "FONTW:", `\tDB\t${pack.codes.map(hex).join(",")}`, `\tDB\t${pack.masks.map(hex).join(",")}`].join("\n") + "\n";
}

/** src/gen/font.asm's text. */
export const romFontSource = (root) => fontSource(root, "; The console font packed, four bytes a character from 20h, and\n; the glyphs with a fifth column: FNTGLY's. Generated from\n; format/font5x7.txt by tools/build.mjs. Do not edit.");
