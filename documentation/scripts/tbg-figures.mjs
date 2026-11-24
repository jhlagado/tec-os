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
add('first-stop', 'TBG in high TPA with separate console and LCD paths',
  'ROM occupies C000h to FFFFh above upper RAM. Resident workspace and the BDOS stub sit at the top of upper RAM, with TBG.SVC (30 pages) below them. A COM program loads at 0100h below (0006h) and uses the main console (PICO9918, serial TTY or GLCD), while TBG uses only the 20x4 character LCD and matrix keyboard.', 318, [
    text(198, 24, 'Memory layout (not to scale)', 'head', 'middle'),
    text(544, 24, 'Separate human interfaces', 'head', 'middle'),
    rect(82, 40, 236, 36),
    text(200, 63, 'C000h–FFFFh · TEC-OS ROM', '', 'middle'),
    rect(82, 76, 236, 36),
    text(200, 99, 'Resident workspace (upper RAM)', '', 'middle'),
    rect(82, 112, 236, 52, 'highlight'),
    text(200, 134, 'TBG.SVC (30 pages)', 'head', 'middle'),
    text(200, 154, 'Resident debugger in RAM', '', 'middle'),
    rect(82, 164, 236, 68),
    text(200, 190, 'Program at 0100h', 'head', 'middle'),
    text(200, 213, 'Code, data and stack', '', 'middle'),
    rect(82, 232, 236, 34),
    text(200, 254, 'Page zero (0000h–00FFh)', '', 'middle'),
    text(74, 80, 'C000h', 'small', 'end'),
    text(74, 170, '(0006h)', 'accent', 'end'),
    text(74, 236, '0100h', 'small', 'end'),
    arrow(320, 138, 396, 118),
    arrow(320, 198, 396, 212),
    box(400, 68, '20 × 4 LCD + matrix keys', ['>PC 0100   SP 98FEST', 'TBG stays off the console'], 296, 94, 'highlight'),
    box(400, 174, 'Main console (9918 / TTY / GLCD)', ['A>TBG B:HELLO', 'Hello from TEC-OS'], 296, 84),
    note(292, 'ROM is read-only at C000h–FFFFh; resident workspace and TBG sit in upper RAM below it.'),
    note(312, 'TBG writes nothing to the main console. Focus the LCD in the Viewer; F6 returns to 9918.')
  ]);

// Chapter 2: View cycle, drill-down and stepping scopes
add('views', 'Cycling views, following pointers and stepping',
  'Tab cycles forward through Registers, Code, Stack and Memory (and Symbols when TBGSYM is loaded), and Shift+Tab moves back. Enter opens the target of a register, stack slot or branch, and Esc returns one level. Space steps into, Shift+Space steps over and Ctrl+Space steps out.', 276, [
    text(360, 26, 'Tab cycles forward  ·  Shift+Tab goes back', 'head', 'middle'),
    box(24, 42, 'Registers', ['PC, SP, pairs', 'Flags, ST/BP/EX'], 152, 82, 'highlight'),
    arrow(178, 83, 200, 83),
    box(204, 42, 'Code', ['Disassembly', '>, →, □, █'], 152, 82),
    arrow(358, 83, 380, 83),
    box(384, 42, 'Stack', ['4 live words', 'from SP down'], 152, 82),
    arrow(538, 83, 560, 83),
    box(564, 42, 'Memory', ['16 bytes', 'FIX or reg'], 132, 82),
    row(154, [
      ['Space · Step Into', 'One instruction', 'Enters local CALL'],
      ['Shift+Space · Over', 'Runs a CALL whole', 'Stops after return'],
      ['Ctrl+Space · Out', 'Until SP rises', 'Any key interrupts']
    ], 86),
    note(264, 'Enter drills down from a register, stack slot or branch. Esc returns one level.')
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
  'Pressing B in Code registers a breakpoint at 0104h (POP DE, opcode D1h). While the program runs, TBG patches 0104h with F7h (RST 30h) and saves D1h. When the CPU hits F7h, TBG restores D1h, stops at PC 0104 with BP and keeps the breakpoint registered.', 242, [
    row(20, [
      ['1 · Mark in Code', '>□0104 POP DE', 'Saved byte: D1h'],
      ['2 · Patch on Run', '0104h ← F7h (RST 30h)', 'CPU runs full speed'],
      ['3 · Trap and restore', '0104h ← D1h restored', '>PC 0104   SP 98FCBP']
    ], 92),
    box(24, 138, 'Code column marks', ['>  selected row    →  program counter', '□  user breakpoint    █  PC on breakpoint'], 672, 72),
    note(230, 'Up to eight user breakpoints can be active inside the loaded COM image.')
  ]);

// Chapter 3: Four ways to stop a running program
add('stop-paths', 'Four ways to stop a program at full speed',
  'Comparison of four stop methods: R in Code with selection off PC runs once with no breakpoint left behind; B sets a persistent RST 30h breakpoint; holding Ctrl+Esc breaks at the next BDOS call (0005h); TBG ARM catches the next COM launch via ABI 5.3 COMVEC.', 256, [
    box(24, 20, 'R off PC (one-shot)', ['Temporary stop at selection', 'No □ left behind', 'Ideal for loop exits'], 324, 96),
    box(372, 20, 'B in Code (persistent)', ['Up to 8 RST 30h traps', 'Stays set across runs', 'Needs address inside COM'], 324, 96, 'highlight'),
    box(24, 134, 'Ctrl+Esc held (break in)', ['Stops at next CALL 0005h', 'Return address sits on stack', 'Needs OS calls to trigger'], 324, 96),
    box(372, 134, 'TBG ARM (next launch)', ['Hooks next CCP COM via COMVEC', 'Stops at 0100h with normal tail', 'Requires TEC-OS ABI 5.3+'], 324, 96),
    note(248, 'Every stop lands in the same TBG inspection loop, where you can step, inspect or press R.')
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
    rect(24, 148, 120, 48),
    text(84, 177, '0000h–00FFh', 'small', 'middle'),
    rect(144, 148, 356, 48, 'highlight'),
    text(322, 169, 'Writable with E (0100h to lowest service)', 'head', 'middle'),
    text(322, 188, 'Program code, data and stack · EDT mode', 'small', 'middle'),
    rect(500, 148, 196, 48),
    text(598, 177, 'TBG / ROM (protected)', 'small', 'middle'),
    note(226, 'Scrolling while following a register shows HL+. Opening via Tab or G uses FIX.'),
    note(252, 'Editing refuses addresses below 0100h or inside resident services so TBG stays intact.')
  ]);

// Chapter 5: Two-service hook architecture (TBG.SVC + TBGSYM.SVC)
add('tbgsym-hook', 'How TBGSYM.SVC attaches to TBG.SVC through TBGHOOK',
  'TBG.SVC sits in 30 pages of high TPA and publishes a TBGHOOK record. Loading TBGSYM.SVC claims five pages below it, fills the hook table at INIT and verifies each program against its .TBG file checksum. UNLOAD removes TBGSYM.SVC first and restores TBGHOOK, leaving TBG.SVC resident.', 276, [
    text(196, 26, 'Resident service stack', 'head', 'middle'),
    text(532, 26, 'At each program launch', 'head', 'middle'),
    rect(48, 42, 296, 62, 'highlight'),
    text(196, 66, 'TBG.SVC (30 pages · 7,522 B)', 'head', 'middle'),
    text(196, 88, 'Publishes TBGHOOK registry record', '', 'middle'),
    arrow(196, 128, 196, 108),
    rect(48, 130, 296, 66, 'highlight'),
    text(196, 154, 'TBGSYM.SVC (5 pages · 1,142 B)', 'head', 'middle'),
    text(196, 176, 'Hooks TBGHOOK · UNLOAD peels off', '', 'middle'),
    rect(48, 196, 296, 44),
    text(196, 223, 'Program TPA below TBGSYM', '', 'middle'),
    box(392, 42, '1 · Read NAME.TBG', ['Check end address', 'Check image checksum'], 296, 84),
    arrow(540, 128, 540, 150),
    box(392, 154, '2 · Match enables symbols', ['SY on Registers · labels in Code', '5th Symbols view in Tab cycle'], 296, 86, 'highlight'),
    note(264, 'If NAME.TBG is missing or stale after a rebuild, TBG runs cleanly without symbols.')
  ]);

assert.equal(figures.size, 7);
const check = process.argv.includes('--check');
if (!check) mkdirSync(out, { recursive: true });
for (const [name, svg] of figures) {
  const target = new URL(name, out);
  if (check) assert.equal(readFileSync(target, 'utf8'), svg, `Regenerate ${name}`);
  else writeFileSync(target, svg);
}
console.log(`${check ? 'Verified' : 'Generated'} ${figures.size} TBG figures in ${fileURLToPath(out)}`);
