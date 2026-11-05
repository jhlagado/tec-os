// Source declarations used by generated media documentation.

/** Fixed BIOS state in page zero, 0040h-004Fh, with its source caption. */
export function pageZeroDeclarations(src) {
  return [...src.matchAll(/^(\w+)\s+EQU\s+\$(004[0-9A-F])\b(?:[ \t]*;[ \t]*(.*))?/gm)]
    .map((m) => {
      const preceding = src.slice(0, m.index).replace(/\r\n/g, '\n');
      const lines = preceding.split('\n');
      lines.pop(); // The declaration begins just after this newline.
      if (lines.at(-1) === '') lines.pop(); // The compact block separator.
      const header = [];
      while (lines.at(-1)?.startsWith(';')) header.unshift(lines.pop().replace(/^; ?/, ''));
      // An inline caption wins. A margin block's final sentence is its
      // declaration caption; earlier sentences explain the surrounding state.
      const caption = header.join(' ').trim().split(/(?<=[.!?])\s+/).at(-1) ?? '';
      const what = m[3] ?? caption;
      return { at: parseInt(m[2], 16), name: m[1], what };
    })
    .sort((x, y) => x.at - y.at);
}
