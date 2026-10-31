// The console font, format/font5x7.txt: one parser for the display drivers' copy
// (drivers/font.asm), the diagnostics ROM's and the tests.

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
      rows = [];
      glyphs.set(parseInt(head[1], 16), rows);
      continue;
    }
    if (!/^[#.]{5}$/.test(line)) throw new Error(`font: bad row ${JSON.stringify(line)}`);
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

/** The font as source: a heading, the label FONT and DB rows. */
export function fontSource(root, heading) {
  const rows = fontGlyphs(root).map((g) => `        DB      ${g.map(hex).join(",")}`);
  return [heading, "FONT:", ...rows].join("\n") + "\n";
}

/** drivers/font.asm's text. */
export const driverFontSource = (root) => fontSource(root, "; The console font, 8 bytes a character from 20h, for each display driver. From\n; format/font5x7.txt: the build checks that the two agree. Do not edit.");
