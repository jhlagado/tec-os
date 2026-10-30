// What the PICO9918's screen shows through the terminal's row moves, for a
// reference: the same output on any ROM from a cleared screen, a snapshot after
// each step. test/pico-screens.json holds these from the ROM at 7b88908, whose
// console was in the ROM.

const BASE = 0x0200;

function print(m, text) {
  const conout = m.sym("BCONOUT");
  // Each byte by PUSH-free calls through a table in RAM, then JR $.
  const code = [];
  for (const ch of Buffer.from(text, "latin1")) code.push(0x0e, ch, 0xcd, conout & 0xff, conout >> 8);
  const bconst = m.sym("BCONST"); // a poll shows a finished move
  code.push(0xcd, bconst & 0xff, bconst >> 8, 0x18, 0xfe);
  code.forEach((v, i) => m.write(BASE + i, v));
  Object.assign(m.cpu.cpu, { sp: 0x7000, pc: BASE });
  m.runUntil(() => m.pc === BASE + code.length - 2, 2_000_000_000, "the output");
}

export const STEPS = [
  ["clear", "\x1b[2J\x1b[H"],
  ["lines", Array.from({ length: 30 }, (_, i) => `line ${i}\r\n`).join("")],
  // No poll inside this one: the move is still waiting to be shown.
  ["insert characters", "\r\nabcdef\r\x1b[2@"],
  ["delete characters", "\x1b[2;1H\x1b[3P"],
  ["insert a line", "\x1b[5;1H\x1b[2L"],
  ["delete a line", "\x1b[8;1H\x1b[3M"],
  ["a region", "\x1b[4;12r\x1b[12;1H\n\n\nregion\x1b[r"],
  ["erase", "\x1b[20;5H\x1b[K\x1b[22;1H\x1b[1J"],
  ["clear again", "\x1b[2J\x1b[Hdone"],
];

export function screens(m, cols) {
  return STEPS.map(([name, text]) => {
    print(m, text);
    return { name, screen: m.screen(cols) };
  });
}
