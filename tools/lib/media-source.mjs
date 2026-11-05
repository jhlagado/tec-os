// Source declarations used by generated media documentation.

/** Fixed BIOS state in page zero, 0040h-004Fh, with its source caption. */
export function pageZeroDeclarations(src) {
  return [...src.matchAll(/^(\w+)\s+EQU\s+\$(004[0-9A-F])\b(?:[ \t]*;[ \t]*(.*))?/gm)]
    .map((m) => {
      const preceding = src.slice(0, m.index);
      const what = m[3] ?? preceding.match(/(?:^|\n); ([^\n]*)\n$/)?.[1] ?? '';
      return { at: parseInt(m[2], 16), name: m[1], what };
    })
    .sort((x, y) => x.at - y.at);
}
