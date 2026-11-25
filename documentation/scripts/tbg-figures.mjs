import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = new URL('../public/images/tbg/', import.meta.url);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const rect = (x, y, w, h, cls = '') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
const text = (x, y, value, cls = '', anchor = 'start') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}" xml:space="preserve">${esc(value)}</text>`;
const arrow = (x1, y1, x2, y2) => `<path class="arrow" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#arrow)"/>`;
const note = (y, value) => text(360, y, value, 'note', 'middle');

function box(x, y, title, lines = [], w = 200, h = 92, cls = '') {
  return [
    rect(x, y, w, h, cls),
    text(x + w / 2, y + 25, title, 'head', 'middle'),
    ...lines.map((s, i) => text(x + w / 2, y + 50 + i * 20, s, '', 'middle'))
  ].join('\n');
}

function row(y, entries, h = 92) {
  return entries.flatMap(([title, ...lines], i) => [
    box(24 + i * 236, y, title, lines, 200, h),
    i < entries.length - 1 ? arrow(226 + i * 236, y + h / 2, 254 + i * 236, y + h / 2) : ''
  ]).join('\n');
}

function cellStrip(x, y, cells, cw = 84, ch = 46) {
  return cells.flatMap(([addr, val, hi], i) => {
    const cx = x + i * cw;
    return [
      text(cx + cw / 2, y - 8, addr, 'small', 'middle'),
      rect(cx, y, cw, ch, hi ? 'highlight' : ''),
      text(cx + cw / 2, y + 29, val, hi ? 'accent' : '', 'middle')
    ];
  }).join('\n');
}

function document(title, desc, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(desc)}</desc>
<defs><style>
svg {color:#233333;--panel:#edf4ee;--edge:#648479;--accent:#155c48;--paper:#fff}
@media(prefers-color-scheme:dark) {svg {color:#eef4ef;--panel:#172c27;--edge:#739888;--accent:#a3dfbd;--paper:#1c1f22}}
rect {fill:var(--panel);stroke:var(--edge);stroke-width:1.3}
text {fill:currentColor;font:14px ui-monospace,monospace}
.head {fill:var(--accent);font:bold 15px system-ui,sans-serif}
.note {font:14px system-ui,sans-serif}
.small {font:12px ui-monospace,monospace}
.accent {fill:var(--accent);font-weight:bold}
.arrow {fill:none;stroke:var(--accent);stroke-width:1.6}
.highlight {stroke:var(--accent);stroke-width:2.5}
</style>
<marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="var(--accent)"/></marker></defs>
${body}
</svg>
`;
}

export const figures = new Map();
function add(name, title, desc, height, parts) {
  figures.set(name + '.svg', document(title, desc, height, parts.join('\n')));
}

// Chapter 1: Two-screen workbench and TPA layout
add('first-stop', 'TBUG in high memory with separate console and LCD paths',
  'TEC-OS ROM sits at C000h to FFFFh. TBUG.SVC loads at the top of RAM below the ROM. The program runs from 0100h up to the address at 0006h where TBUG begins, above page zero. TBUG uses the 20x4 LCD and matrix keyboard while the program keeps the console.', 266, [
    text(204, 24, 'Memory (not to scale)', 'head', 'middle'),
    text(548, 24, 'Separate displays', 'head', 'middle'),
    rect(84, 42, 240, 36),
    text(204, 65, 'TEC-OS ROM', 'head', 'middle'),
    rect(84, 78, 240, 46, 'highlight'),
    text(204, 106, 'TBUG.SVC', 'head', 'middle'),
    rect(84, 124, 240, 56),
    text(204, 157, 'Program (TPA)', 'head', 'middle'),
    rect(84, 180, 240, 36),
    text(204, 203, 'Page zero', '', 'middle'),
    text(76, 48, 'FFFFh', 'small', 'end'),
    text(76, 82, 'C000h', 'small', 'end'),
    text(76, 128, '(0006h)', 'accent', 'end'),
    text(76, 184, '0100h', 'small', 'end'),
    text(76, 216, '0000h', 'small', 'end'),
    arrow(326, 101, 412, 95),
    arrow(326, 152, 412, 169),
    box(416, 62, '20 × 4 LCD', ['Matrix keyboard'], 264, 66, 'highlight'),
    box(416, 140, 'Console', ['Default display'], 264, 66),
    note(248, 'TBUG is loaded at the top of RAM, below the ROM. Program memory ends where TBUG begins (0006h).')
  ]);

// Chapter 2: View navigation and stepping scopes
add('views', 'Switching views and stepping with F6 to F8',
  'R, C, S, M and Y jump straight to Registers, Code, Stack, Memory and Symbols, and Tab cycles through them. Enter opens the target of a register, stack slot or branch, Esc steps back and Q quits. F8 steps into, F7 steps over and F6 steps out (Fn+8, Fn+7 and Fn+6 on the TEC-1G).', 278, [
    text(360, 26, 'R · C · S · M · Y jump directly   ·   Tab / Shift+Tab cycle', 'head', 'middle'),
    box(16, 42, 'R · Registers', ['PC, SP, pairs', 'Flags & stops'], 128, 82, 'highlight'),
    arrow(146, 83, 158, 83),
    box(160, 42, 'C · Code', ['Disassembly', '>, →, □, █'], 124, 82),
    arrow(286, 83, 298, 83),
    box(300, 42, 'S · Stack', ['4 live words', 'from SP down'], 124, 82),
    arrow(426, 83, 438, 83),
    box(440, 42, 'M · Memory', ['16 bytes', 'FIX or reg'], 124, 82),
    arrow(566, 83, 578, 83),
    box(580, 42, 'Y · Symbols', ['Global labels', 'from .TBG'], 124, 82),
    box(16, 152, 'F8 (Fn+8) · Step Into', ['One instruction', 'Enters local CALL'], 212, 86),
    box(254, 152, 'F7 (Fn+7) · Step Over', ['Runs a CALL whole', 'Stops after return'], 212, 86),
    box(492, 152, 'F6 (Fn+6) · Step Out', ['Until SP rises', 'Any key interrupts'], 212, 86),
    note(264, 'Enter drills down from a register, stack slot or branch. Esc steps back and Q quits.')
  ]);

// Chapter 2: Stack word vs little-endian bytes in STEP.ASM
add('stack-step', 'PUSH HL in Stack view and in little-endian Memory',
  'In STEP.COM, LD HL,$1234 loads HL, then PUSH HL moves SP down by two bytes from 98FEh to 98FCh and stores 34h at 98FCh and 12h at 98FDh. Stack view shows the word 1234 while Memory shows the bytes in address order as 34 12.', 274, [
    row(20, [
      ['Before PUSH HL', 'PC 0103 · HL 1234', 'SP = 98FEh'],
      ['After PUSH HL', 'PC 0104 · SP 98FCh', 'Stack top: 1234'],
      ['After POP DE', 'PC 0105 · DE 1234', 'SP = 98FEh']
    ], 86),
    text(170, 140, 'Stack view (16-bit words)', 'head', 'middle'),
    text(520, 140, 'Memory view (bytes in address order)', 'head', 'middle'),
    box(46, 152, '>SP 98FC  1234', ['    98FE  9C51', 'High byte paired with low'], 248, 84, 'highlight'),
    arrow(298, 194, 344, 194),
    cellStrip(350, 174, [
      ['98FC', '34', true],
      ['98FD', '12', true],
      ['98FE', '51', false],
      ['98FF', '9C', false]
    ], 86, 46),
    note(260, 'The Z80 stores the low byte (34h) at the lower address and the high byte (12h) above it.')
  ]);

// Chapter 3: Breakpoint patch-and-restore lifecycle
add('breakpoint', 'Software breakpoint patch and restore using RST 30h',
  'Pressing Space in Code registers a breakpoint at 0104h (POP DE, opcode D1h). While the program runs under F5, TBUG patches 0104h with F7h (RST 30h) and saves D1h. When the CPU hits F7h, TBUG restores D1h, stops at PC 0104 with BP and keeps the breakpoint registered.', 252, [
    box(16, 20, '1 · Mark with Space', ['>□0104 POP DE', 'Saved byte: D1h'], 212, 92),
    arrow(230, 66, 250, 66),
    box(254, 20, '2 · Patch on F5', ['0104h ← F7h (RST 30h)', 'CPU runs full speed'], 212, 92),
    arrow(468, 66, 488, 66),
    box(492, 20, '3 · Trap and restore', ['0104h ← D1h restored', '>PC 0104   SP 98FCBP'], 212, 92),
    box(16, 136, 'Code column marks', ['>  selected row    →  program counter', '□  user breakpoint    █  PC on breakpoint'], 688, 82),
    note(240, 'Up to eight user breakpoints can be active inside the loaded COM image.')
  ]);

// Chapter 3: Four ways to stop a running program
add('stop-paths', 'Four ways to stop a program at full speed',
  'Comparison of four stop methods: F5 in Code with selection off PC runs once with no breakpoint left behind; Space sets a persistent RST 30h breakpoint; holding Ctrl+Esc breaks at the next BDOS call (0005h); TBUG.SVC ARM catches the next COM launch via ABI 5.3 COMVEC.', 224, [
    box(24, 18, 'F5 off PC (one-shot)', ['Temporary stop at selection', 'No □ left behind'], 324, 82),
    box(372, 18, 'Space in Code (persistent)', ['Up to 8 RST 30h traps', 'Needs address inside COM'], 324, 82, 'highlight'),
    box(24, 114, 'Ctrl+Esc held (break in)', ['Stops at next CALL 0005h', 'Return address sits on stack'], 324, 82),
    box(372, 114, 'TBUG.SVC ARM (next launch)', ['Catches next COM via COMVEC', 'Requires TEC-OS ABI 5.3+'], 324, 82),
    note(216, 'Every stop lands in the same TBUG inspection loop, where you can step, inspect or press F5.')
  ]);

// Chapter 4: Fixed vs register-following Memory and writable range
add('memory-follow', 'Following HL across the FILL.COM buffer in Memory',
  'In FILL.COM, opening Memory via Enter on HL locks the display to HL at 010Ah. When LD (HL),B writes 04h and INC HL advances HL to 010Bh, Memory moves to 010Bh automatically. Scrolling away appends + (HL+). Editing with E writes only from 0100h up to the lowest resident service.', 272, [
    text(190, 26, 'After LD (HL),B at 010Ah', 'head', 'middle'),
    text(530, 26, 'After INC HL · Memory moves to 010Bh', 'head', 'middle'),
    cellStrip(24, 54, [
      ['010A', '04', true],
      ['010B', '00', false],
      ['010C', '00', false],
      ['010D', '00', false]
    ], 80, 44),
    text(184, 120, '010A>04 00 00 00 HL', 'accent', 'middle'),
    arrow(350, 76, 372, 76),
    cellStrip(376, 54, [
      ['010B', '00', true],
      ['010C', '00', false],
      ['010D', '00', false],
      ['010E', '00', false]
    ], 80, 44),
    text(536, 120, '010B>00 00 00 00 HL', 'accent', 'middle'),
    rect(24, 148, 112, 48),
    text(80, 177, '0000h–00FFh', 'small', 'middle'),
    rect(136, 148, 376, 48, 'highlight'),
    text(324, 169, 'Writable with E (0100h to lowest service)', 'head', 'middle'),
    text(324, 188, 'Program code, data and stack · EDT mode', 'small', 'middle'),
    rect(512, 148, 184, 48),
    text(604, 177, 'TBUG / ROM (protected)', 'small', 'middle'),
    note(226, 'Scrolling while following a register shows HL+. Opening via M, Tab or G uses FIX.'),
    note(252, 'Editing refuses addresses below 0100h or inside resident services so TBUG stays intact.')
  ]);

// Chapter 5: Automatic symbol loading from NAME.TBG inside TBUG.SVC
add('symbols-load', 'Automatic symbol loading from NAME.TBG inside TBUG.SVC',
  'TAS writes NAME.TBG beside NAME.COM. When TBUG.SVC stops a program at launch, its built-in symbol loader checks NAME.TBG against the image end address and 16-bit checksum. A match lights up SY on Registers, shows labels in Code and enables the Symbols view on Y.', 244, [
    box(16, 20, '1 · Assemble with TAS', ['Writes NAME.COM', 'Writes NAME.TBG'], 212, 92),
    arrow(230, 66, 250, 66),
    box(254, 20, '2 · Launch in TBUG', ['Check end address', 'Check image sum'], 212, 92),
    arrow(468, 66, 488, 66),
    box(492, 20, '3 · Symbols active', ['SY · Code labels', 'Symbols view (Y)'], 212, 92, 'highlight'),
    box(16, 134, 'Missing or stale NAME.TBG', ['TBUG ignores the file quietly and debugs in raw hex', 'Reassemble with TAS to write a matching pair'], 688, 82),
    note(234, 'Symbol support is built into TBUG.SVC and loads automatically with no extra service.')
  ]);

assert.equal(figures.size, 7);
const check = process.argv.includes('--check');
if (!check) mkdirSync(out, { recursive: true });
for (const [name, svg] of figures) {
  const target = new URL(name, out);
  if (check) assert.equal(readFileSync(target, 'utf8'), svg, `Regenerate ${name}`);
  else writeFileSync(target, svg);
}
console.log(`${check ? 'Verified' : 'Generated'} ${figures.size} TBUG figures in ${fileURLToPath(out)}`);
