import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = new URL('../public/images/tbug/', import.meta.url);
const W = 720;

const esc = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const r0 = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

const NARROW = new Set([...'ijltfr.,:;\'"|!()[] ']);
const monoW = (s, size) => String(s).length * size * 0.6;
const sansW = (s, size) => {
  let units = 0;
  for (const ch of String(s)) {
    if (ch >= 'A' && ch <= 'Z') units += 0.68;
    else if (ch >= '0' && ch <= '9') units += 0.56;
    else if (NARROW.has(ch)) units += 0.31;
    else units += 0.53;
  }
  return units * size;
};

/* ---------- Drafting-room SVG primitives (matches TEC-OS house theme) ---------- */

const rect = (cls, x, y, w, h, r = 4) =>
  `  <rect class="${cls}" x="${r0(x)}" y="${r0(y)}" width="${r0(w)}" height="${r0(h)}" rx="${r}"/>`;

const text = (cls, x, y, s, anchor = 'start') =>
  `  <text class="${cls}" x="${r0(x)}" y="${r0(y)}" text-anchor="${anchor}" xml:space="preserve">${esc(s)}</text>`;

const line = (cls, x1, y1, x2, y2, marker = '') =>
  `  <line class="${cls}" x1="${r0(x1)}" y1="${r0(y1)}" x2="${r0(x2)}" y2="${r0(y2)}"${
    marker ? ` marker-end="url(#${marker})"` : ''
  }/>`;

const path = (cls, d, marker = '') =>
  `  <path class="${cls}" d="${d}"${marker ? ` marker-end="url(#${marker})"` : ''}/>`;

const circle = (cls, cx, cy, r) =>
  `  <circle class="${cls}" cx="${r0(cx)}" cy="${r0(cy)}" r="${r0(r)}"/>`;

const eyebrow = (x, y, s, anchor = 'start') =>
  text('cap', x, y, String(s).toUpperCase(), anchor);

const hrule = (y, x1 = 40, x2 = W - 40) => line('rule', x1, y, x2, y);

/* ---------- Composite helpers ---------- */

/**
 * Clean keycap / command pill badge. Auto-sizes to its text with generous
 * horizontal padding so labels never feel squeezed.
 */
function badge({ x, y, label, cls = 'pill', textCls = 'pill-t', minW = 24, h = 22 }) {
  const tw = monoW(label, 11);
  const w = Math.max(minW, Math.ceil(tw + 14));
  return {
    w,
    svg: [
      rect(cls, x, y, w, h, 3),
      text(textCls, x + w / 2, y + h / 2 + 4, label, 'middle'),
    ].join('\n'),
  };
}

/**
 * Spacious card with optional keycap badge or step number, bold title,
 * and well-spaced body lines. All lines left-aligned with 18px inner margin.
 */
function card({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  cls = 'bx',
  key = null,
  tag = null,
  step = null,
  hi = false,
}) {
  const boxCls = hi ? 'bxs' : cls;
  const out = [rect(boxCls, x, y, w, h, 5)];
  const px = x + 18;

  if (step !== null) {
    // Numbered step header: small signal/ink circle + title beside it
    const cx = px + 10;
    const cy = y + 25;
    out.push(circle(hi ? 'sig-dot' : 'ink-dot', cx, cy, 10));
    out.push(text('inv', cx, cy + 4, String(step), 'middle'));
    out.push(text(hi ? 'nb on-sig' : 'nb', px + 28, cy + 4.5, title));
    lines.forEach((l, i) => {
      const isMono = typeof l === 'object' ? l.mono : false;
      const str = typeof l === 'object' ? l.text : l;
      out.push(text(isMono ? 't' : 'ns', px, y + 54 + i * 20, str));
    });
  } else if (key !== null) {
    // Keycap header: pill badge on left, optional right-aligned micro-tag, title below or beside
    const b = badge({
      x: px,
      y: y + 14,
      label: key,
      cls: hi ? 'pill-s' : 'pill',
      textCls: hi ? 'pill-ts' : 'pill-t',
    });
    out.push(b.svg);
    if (tag) {
      out.push(text('dim-cap', x + w - 18, y + 29, tag.toUpperCase(), 'end'));
      out.push(text(hi ? 'nb on-sig' : 'nb', px, y + 54, title));
      lines.forEach((l, i) => {
        const isMono = typeof l === 'object' ? l.mono : false;
        const str = typeof l === 'object' ? l.text : l;
        out.push(text(isMono ? 't' : 'ns', px, y + 74 + i * 18, str));
      });
    } else {
      out.push(text(hi ? 'nb on-sig' : 'nb', px + b.w + 10, y + 29.5, title));
      lines.forEach((l, i) => {
        const isMono = typeof l === 'object' ? l.mono : false;
        const str = typeof l === 'object' ? l.text : l;
        out.push(text(isMono ? 't' : 'ns', px, y + 54 + i * 19, str));
      });
    }
  } else {
    out.push(text(hi ? 'nb on-sig' : 'nb', px, y + 28, title));
    lines.forEach((l, i) => {
      const isMono = typeof l === 'object' ? l.mono : false;
      const str = typeof l === 'object' ? l.text : l;
      out.push(text(isMono ? 't' : 'ns', px, y + 51 + i * 19, str));
    });
  }
  return out.join('\n');
}

/**
 * Memory byte strip with generous cells, address ticks above, and optional
 * sub-labels below.
 */
function strip({ x, y, cells, cw = 66, ch = 40 }) {
  const out = [];
  const draw = (c, i) => {
    const cx = x + i * cw;
    out.push(text(c.hi ? 'dim on-sig' : 'dim', cx + cw / 2, y - 9, c.addr, 'middle'));
    out.push(rect(c.hi ? 'bxs' : 'bx', cx, y, cw, ch, 0));
    out.push(text(c.hi ? 'tb on-sig' : 't', cx + cw / 2, y + ch / 2 + 4.5, c.val, 'middle'));
    if (c.sub) {
      out.push(text(c.hi ? 'ns on-sig' : 'dimn', cx + cw / 2, y + ch + 18, c.sub, 'middle'));
    }
  };
  cells.forEach((c, i) => { if (!c.hi) draw(c, i); });
  cells.forEach((c, i) => { if (c.hi) draw(c, i); });
  return out.join('\n');
}

function document(title, desc, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-labelledby="figTitle figDesc">
  <title id="figTitle">${esc(title)}</title>
  <desc id="figDesc">${esc(desc)}</desc>
  <defs>
    <style>
      :root {
        --ink:    #111417;
        --ink-2:  #3a4148;
        --dim:    #656d75;
        --rule:   #d0d4d8;
        --fill:   #ffffff;
        --fill-2: #f1f3f2;
        --sig:    #236c4a;
        --sig-bg: #eef6f1;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --ink:    #e8ecea;
          --ink-2:  #b5beb9;
          --dim:    #828d87;
          --rule:   #38403c;
          --fill:   #1c1f22;
          --fill-2: #24292c;
          --sig:    #6ec996;
          --sig-bg: #182b22;
        }
      }

      .bx      { fill: var(--fill);   stroke: var(--ink);  stroke-width: 1.4; }
      .bxq     { fill: var(--fill-2); stroke: var(--rule); stroke-width: 1.3; }
      .bxs     { fill: var(--sig-bg); stroke: var(--sig);  stroke-width: 1.9; }
      .pill    { fill: var(--fill-2); stroke: var(--rule); stroke-width: 1.1; }
      .pill-s  { fill: var(--fill);   stroke: var(--sig);  stroke-width: 1.2; }
      .sig-dot { fill: var(--sig);    stroke: none; }
      .ink-dot { fill: var(--ink);    stroke: none; }

      .rule    { fill: none; stroke: var(--rule); stroke-width: 1; }
      .tick    { fill: none; stroke: var(--dim);  stroke-width: 1; }
      .ln      { fill: none; stroke: var(--ink);  stroke-width: 1.4; }
      .sline   { fill: none; stroke: var(--sig);  stroke-width: 1.8; }
      .dash    { fill: none; stroke: var(--dim);  stroke-width: 1.2; stroke-dasharray: 4 3; }

      .t       { font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--ink); }
      .tb      { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--ink); }
      .ts      { font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--ink-2); }
      .nb      { font: 600 13.5px system-ui, -apple-system, "Segoe UI", sans-serif; fill: var(--ink); }
      .ns      { font: 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: var(--ink-2); }
      .dim     { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--dim); }
      .dimn    { font: 11.5px system-ui, -apple-system, "Segoe UI", sans-serif; fill: var(--dim); }
      .cap     { font: 700 10px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--sig); letter-spacing: 0.12em; }
      .dim-cap { font: 600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--dim); letter-spacing: 0.1em; }
      .pill-t  { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--ink); }
      .pill-ts { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--sig); }
      .inv     { font: 700 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--fill); }
      .on-sig  { fill: var(--sig); }
    </style>
    <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M0,0.8 L10,5 L0,9.2 Z" fill="var(--ink)"/>
    </marker>
    <marker id="arS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M0,0.8 L10,5 L0,9.2 Z" fill="var(--sig)"/>
    </marker>
  </defs>
${body}
</svg>
`;
}

export const figures = new Map();
function add(name, title, desc, height, parts) {
  figures.set(name + '.svg', document(title, desc, height, parts.filter(Boolean).join('\n')));
}

/* ============================================================
   1. Chapter 1: Two-screen workbench and TPA layout
   ============================================================ */
add(
  'first-stop',
  'TBUG in high memory with separate console and LCD paths',
  'TEC-OS ROM sits at C000h to FFFFh. TBUG.SVC loads at the top of RAM below the ROM. The program runs from 0100h up to the address at 0006h where TBUG begins, above page zero. TBUG uses the 20x4 LCD and matrix keyboard while the program keeps the console.',
  324,
  [
    eyebrow(124, 30, 'Memory layout (not to scale)'),
    eyebrow(416, 30, 'Separate displays'),

    // Memory column: x=124..332 (w=208), flush drafting-room bands
    rect('bxq', 124, 48, 208, 46, 0),
    text('nb', 228, 69, 'TEC-OS ROM', 'middle'),
    text('dimn', 228, 86, 'Read-only · 16 KB', 'middle'),

    rect('bx', 124, 150, 208, 66, 0),
    text('nb', 228, 179, 'Program (TPA)', 'middle'),
    text('ns', 228, 198, 'Code, data and stack', 'middle'),

    rect('bxq', 124, 216, 208, 42, 0),
    text('ns', 228, 241, 'Page zero', 'middle'),

    // Draw highlighted TBUG band last so its signal stroke sits cleanly on top
    rect('bxs', 124, 94, 208, 56, 0),
    text('nb on-sig', 228, 118, 'TBUG.SVC', 'middle'),
    text('ns', 228, 137, 'Loaded at top of RAM', 'middle'),

    // Left address ticks and labels
    line('tick', 112, 48, 124, 48),
    text('dim', 104, 52, 'FFFFh', 'end'),

    line('tick', 112, 94, 124, 94),
    text('dim', 104, 98, 'C000h', 'end'),

    line('sline', 110, 150, 124, 150),
    text('tb on-sig', 104, 154, '(0006h)', 'end'),

    line('tick', 112, 216, 124, 216),
    text('dim', 104, 220, '0100h', 'end'),

    line('tick', 112, 258, 124, 258),
    text('dim', 104, 262, '0000h', 'end'),

    // Clean orthogonal connectors across a generous 84px gutter
    path('sline', 'M332,122 H374 V104 H414', 'arS'),
    path('ln', 'M332,183 H374 V200 H414', 'ar'),

    // Right column: two spacious display cards (x=416..680, w=264)
    card({
      x: 416,
      y: 62,
      w: 264,
      h: 84,
      title: '20 × 4 LCD',
      lines: [
        'Matrix keyboard · debugger UI',
        { text: '>PC 0100   SP 98FE', mono: true },
      ],
      hi: true,
    }),
    card({
      x: 416,
      y: 162,
      w: 264,
      h: 76,
      title: 'Console',
      lines: ['Default display · program I/O'],
    }),

    text(
      'dimn',
      40,
      298,
      'TBUG loads at the top of RAM, below the ROM. Program memory ends where TBUG begins (0006h).',
    ),
  ],
);

/* ============================================================
   2. Chapter 2: View navigation and stepping scopes
   ============================================================ */
add(
  'views',
  'Switching views and stepping with F6 to F8',
  'R, C, S, M and Y jump straight to Registers, Code, Stack, Memory and Symbols, and Tab cycles through them. Enter opens the target of a register, stack slot or branch, Esc steps back and Q quits. F8 steps into, F7 steps over and F6 steps out (Fn+8, Fn+7 and Fn+6 on the TEC-1G).',
  434,
  [
    eyebrow(40, 30, 'Five views · press key to jump or Tab / Shift+Tab to cycle'),

    // Row 1: 3 spacious cards (w=198, gap=23 => 40, 261, 482 .. 680)
    card({
      x: 40,
      y: 48,
      w: 198,
      h: 86,
      key: 'R',
      title: 'Registers',
      lines: ['PC, SP and pairs', 'Flags and stop reason'],
      hi: true,
    }),
    card({
      x: 261,
      y: 48,
      w: 198,
      h: 86,
      key: 'C',
      title: 'Code',
      lines: ['Live disassembly', 'Marks: >  →  □  █'],
    }),
    card({
      x: 482,
      y: 48,
      w: 198,
      h: 86,
      key: 'S',
      title: 'Stack',
      lines: ['Four 16-bit words', 'From SP downward'],
    }),

    // Row 2: 2 cards centred neatly below (w=220, gap=28 => 126, 374 .. 594)
    card({
      x: 126,
      y: 154,
      w: 220,
      h: 86,
      key: 'M',
      title: 'Memory',
      lines: ['16-byte hex window', 'FIX or register follow'],
    }),
    card({
      x: 374,
      y: 154,
      w: 220,
      h: 86,
      key: 'Y',
      title: 'Symbols',
      lines: ['Global labels', 'Loaded from .TBG'],
    }),

    hrule(264),

    eyebrow(40, 290, 'Stepping keys · F8, F7 and F6 (Fn+8, Fn+7, Fn+6 on TEC-1G)'),

    // Stepping row: 3 spacious cards (w=198, gap=23)
    card({
      x: 40,
      y: 308,
      w: 198,
      h: 86,
      key: 'F8',
      title: 'Step into',
      lines: ['One instruction', 'Enters a local CALL'],
    }),
    card({
      x: 261,
      y: 308,
      w: 198,
      h: 86,
      key: 'F7',
      title: 'Step over',
      lines: ['Runs a CALL whole', 'Stops after return'],
    }),
    card({
      x: 482,
      y: 308,
      w: 198,
      h: 86,
      key: 'F6',
      title: 'Step out',
      lines: ['Runs until SP rises', 'Any key interrupts'],
    }),

    text(
      'dimn',
      40,
      418,
      'Enter drills down from a register, stack slot or branch. Esc steps back and Q quits.',
    ),
  ],
);

/* ============================================================
   3. Chapter 2: Stack word vs little-endian bytes in STEP.ASM
   ============================================================ */
add(
  'stack-step',
  'PUSH HL in Stack view and in little-endian Memory',
  'In STEP.COM, LD HL,$1234 loads HL, then PUSH HL moves SP down by two bytes from 98FEh to 98FCh and stores 34h at 98FCh and 12h at 98FDh. Stack view shows the word 1234 while Memory shows the bytes in address order as 34 12.',
  354,
  [
    eyebrow(40, 30, 'STEP.COM · three consecutive states'),

    // 3 state cards (w=190, gap=35 => 40, 265, 490 .. 680)
    card({
      x: 40,
      y: 46,
      w: 190,
      h: 82,
      title: 'Before PUSH HL',
      lines: [
        { text: 'PC 0103 · HL 1234', mono: true },
        { text: 'SP = 98FEh', mono: true },
      ],
    }),
    line('ln', 230, 87, 261, 87, 'ar'),

    card({
      x: 265,
      y: 46,
      w: 190,
      h: 82,
      title: 'After PUSH HL',
      lines: [
        { text: 'PC 0104 · SP 98FCh', mono: true },
        { text: 'Top word = 1234', mono: true },
      ],
      hi: true,
    }),
    line('ln', 455, 87, 486, 87, 'ar'),

    card({
      x: 490,
      y: 46,
      w: 190,
      h: 82,
      title: 'After POP DE',
      lines: [
        { text: 'PC 0105 · DE 1234', mono: true },
        { text: 'SP = 98FEh', mono: true },
      ],
    }),

    hrule(154),

    // Bottom comparison: Stack view (left) vs Memory bytes (right)
    // Both aligned on the exact same horizontal datum axis (y=234)
    eyebrow(102, 180, 'Stack view · 16-bit words'),
    eyebrow(376, 180, 'Memory view · bytes in address order'),

    // Stack rows (x=102..292, w=190, flush rows)
    text('cap', 40, 238, 'SP'),
    line('sline', 64, 234, 98, 234, 'arS'),

    rect('bx', 102, 254, 190, 40, 0),
    text('dim', 120, 278, '98FE'),
    text('t', 274, 278.5, '9C51', 'end'),

    rect('bxs', 102, 214, 190, 40, 0),
    text('dim on-sig', 120, 238, '98FC'),
    text('tb on-sig', 274, 238.5, '1234', 'end'),

    text('dimn', 102, 312, 'High byte paired with low'),

    // Connector from Stack word to Memory byte pair (aligned to strip centre y=234)
    line('sline', 296, 234, 368, 234, 'arS'),

    // Memory strip: 4 cells of w=76 (x=376..680, y=214..254, mid=234)
    strip({
      x: 376,
      y: 214,
      cw: 76,
      ch: 40,
      cells: [
        { addr: '98FC', val: '34', hi: true, sub: 'low byte' },
        { addr: '98FD', val: '12', hi: true, sub: 'high byte' },
        { addr: '98FE', val: '51', hi: false },
        { addr: '98FF', val: '9C', hi: false },
      ],
    }),

    text(
      'dimn',
      40,
      340,
      'The Z80 stores the low byte (34h) at the lower address and the high byte (12h) above it.',
    ),
  ],
);

/* ============================================================
   4. Chapter 3: Breakpoint patch-and-restore lifecycle
   ============================================================ */
add(
  'breakpoint',
  'Software breakpoint patch and restore using RST 30h',
  'Pressing Space in Code registers a breakpoint at 0104h (POP DE, opcode D1h). While the program runs under F5, TBUG patches 0104h with F7h (RST 30h) and saves D1h. When the CPU hits F7h, TBUG restores D1h, stops at PC 0104 with BP and keeps the breakpoint registered.',
  316,
  [
    eyebrow(40, 30, 'Software breakpoint lifecycle · RST 30h'),

    card({
      x: 40,
      y: 46,
      w: 190,
      h: 96,
      step: 1,
      title: 'Mark with Space',
      lines: [
        { text: '0104h · POP DE', mono: true },
        'Saves opcode D1h',
      ],
    }),
    line('ln', 230, 94, 261, 94, 'ar'),

    card({
      x: 265,
      y: 46,
      w: 190,
      h: 96,
      step: 2,
      title: 'Patch on F5',
      lines: [
        { text: '0104h ← F7h', mono: true },
        'CPU runs at full speed',
      ],
      hi: true,
    }),
    line('ln', 455, 94, 486, 94, 'ar'),

    card({
      x: 490,
      y: 46,
      w: 190,
      h: 96,
      step: 3,
      title: 'Trap & restore',
      lines: [
        { text: '0104h ← D1h', mono: true },
        'Stops at 0104 with BP',
      ],
    }),

    // Clean legend panel for Code view marks (x=40..680, w=640)
    rect('bxq', 40, 174, 640, 92, 5),
    eyebrow(60, 198, 'Code view column marks'),

    ...[
      ['>', 'Selected row', false],
      ['→', 'Program counter', false],
      ['□', 'User breakpoint', true],
      ['█', 'PC on breakpoint', true],
    ].flatMap(([sym, desc, hi], i) => {
      const mx = 60 + i * 155;
      const b = badge({
        x: mx,
        y: 216,
        label: sym,
        cls: hi ? 'pill-s' : 'pill',
        textCls: hi ? 'pill-ts' : 'pill-t',
        minW: 28,
        h: 26,
      });
      return [
        b.svg,
        text('ns', mx + b.w + 10, 233, desc),
      ];
    }),

    text(
      'dimn',
      40,
      298,
      'Up to eight user breakpoints can be active inside the loaded COM image.',
    ),
  ],
);

/* ============================================================
   5. Chapter 3: Four ways to stop a running program
   ============================================================ */
add(
  'stop-paths',
  'Four ways to stop a program at full speed',
  'Comparison of four stop methods: F5 in Code with selection off PC runs once with no breakpoint left behind; Space sets a persistent RST 30h breakpoint; holding Ctrl+Esc breaks at the next BDOS call (0005h); TBUG.SVC ARM catches the next COM launch via ABI 5.3 COMVEC.',
  316,
  [
    eyebrow(40, 30, 'Four ways to stop a running program'),

    // 2x2 airy grid (w=306, col gap=28 => x=40, 374 .. 680; row h=104, row gap=20)
    card({
      x: 40,
      y: 48,
      w: 306,
      h: 104,
      key: 'F5 off PC',
      tag: 'One-shot',
      title: 'Run to selection',
      lines: ['Temporary stop at the cursor row', 'Leaves no □ breakpoint behind'],
    }),
    card({
      x: 374,
      y: 48,
      w: 306,
      h: 104,
      key: 'Space',
      tag: 'Persistent',
      title: 'User breakpoint in Code',
      lines: ['Up to 8 RST 30h traps in RAM', 'Address must sit inside the COM'],
      hi: true,
    }),
    card({
      x: 40,
      y: 172,
      w: 306,
      h: 104,
      key: 'Ctrl+Esc',
      tag: 'Break in',
      title: 'Hold to interrupt',
      lines: ['Stops at the next CALL 0005h', 'Caller return address sits on stack'],
    }),
    card({
      x: 374,
      y: 172,
      w: 306,
      h: 104,
      key: 'TBUG.SVC ARM',
      tag: 'Next launch',
      title: 'Catch the next COM',
      lines: ['Traps next launch via COMVEC', 'Requires TEC-OS ABI 5.3 or newer'],
    }),

    text(
      'dimn',
      40,
      302,
      'Every stop lands in the same TBUG inspection loop, where you can step, inspect or press F5.',
    ),
  ],
);

/* ============================================================
   6. Chapter 4: Fixed vs register-following Memory and writable range
   ============================================================ */
add(
  'memory-follow',
  'Following HL across the FILL.COM buffer in Memory',
  'In FILL.COM, opening Memory via Enter on HL locks the display to HL at 010Ah. When LD (HL),B writes 04h and INC HL advances HL to 010Bh, Memory moves to 010Bh automatically. Scrolling away appends + (HL+). Editing with E writes only from 0100h up to the lowest resident service.',
  354,
  [
    eyebrow(40, 30, 'After LD (HL),B · locked to HL'),
    eyebrow(416, 30, 'After INC HL · window advances'),

    // Left byte strip: 4 cells x 66px = 264px (x=40..304)
    strip({
      x: 40,
      y: 66,
      cw: 66,
      ch: 40,
      cells: [
        { addr: '010A', val: '04', hi: true },
        { addr: '010B', val: '00', hi: false },
        { addr: '010C', val: '00', hi: false },
        { addr: '010D', val: '00', hi: false },
      ],
    }),
    text('tb on-sig', 172, 132, '010A>04 00 00 00 HL', 'middle'),

    // Wide 112px gutter between strips for clean arrow + instruction label
    text('dim', 360, 74, 'INC HL', 'middle'),
    line('sline', 318, 86, 402, 86, 'arS'),

    // Right byte strip: 4 cells x 66px = 264px (x=416..680)
    strip({
      x: 416,
      y: 66,
      cw: 66,
      ch: 40,
      cells: [
        { addr: '010B', val: '00', hi: true },
        { addr: '010C', val: '00', hi: false },
        { addr: '010D', val: '00', hi: false },
        { addr: '010E', val: '00', hi: false },
      ],
    }),
    text('tb on-sig', 548, 132, '010B>00 00 00 00 HL', 'middle'),

    hrule(158),

    // Bottom section: writable range bar (x=40..680, w=640, flush drafting segments)
    eyebrow(40, 184, 'Writable range for E (Edit mode)'),

    rect('bxq', 40, 202, 122, 62, 0),
    text('ns', 101, 228, 'Page zero', 'middle'),
    text('dim', 101, 248, '0000h–00FFh', 'middle'),

    rect('bxq', 518, 202, 162, 62, 0),
    text('ns', 599, 228, 'TBUG / ROM', 'middle'),
    text('dim', 599, 248, 'Protected', 'middle'),

    rect('bxs', 162, 202, 356, 62, 0),
    text('nb on-sig', 340, 228, 'Writable with E (0100h to lowest service)', 'middle'),
    text('ns', 340, 248, 'Program code, data and stack · EDT mode', 'middle'),

    text(
      'dimn',
      40,
      298,
      'Scrolling away from a followed register appends + (HL+). Opening via M, Tab or G uses FIX.',
    ),
    text(
      'dimn',
      40,
      320,
      'Editing refuses addresses below 0100h or inside resident services so TBUG stays intact.',
    ),
  ],
);

/* ============================================================
   7. Chapter 5: Automatic symbol loading from NAME.TBG inside TBUG.SVC
   ============================================================ */
add(
  'symbols-load',
  'Automatic symbol loading from NAME.TBG inside TBUG.SVC',
  'TAS writes NAME.TBG beside NAME.COM. When TBUG.SVC stops a program at launch, its built-in symbol loader checks NAME.TBG against the image end address and 16-bit checksum. A match lights up SY on Registers, shows labels in Code and enables the Symbols view on Y.',
  312,
  [
    eyebrow(40, 30, 'Automatic symbol loading · built into TBUG.SVC'),

    card({
      x: 40,
      y: 46,
      w: 190,
      h: 96,
      step: 1,
      title: 'Assemble',
      lines: [
        { text: 'Writes NAME.COM', mono: true },
        { text: 'Writes NAME.TBG', mono: true },
      ],
    }),
    line('ln', 230, 94, 261, 94, 'ar'),

    card({
      x: 265,
      y: 46,
      w: 190,
      h: 96,
      step: 2,
      title: 'Launch in TBUG',
      lines: [
        'Checks image end',
        'Checks 16-bit sum',
      ],
    }),
    line('ln', 455, 94, 486, 94, 'ar'),

    card({
      x: 490,
      y: 46,
      w: 190,
      h: 96,
      step: 3,
      title: 'Symbols active',
      lines: [
        'SY flag · Code labels',
        'Symbols view on Y',
      ],
      hi: true,
    }),

    // Quiet fallback callout box (x=40..680, w=640)
    rect('bxq', 40, 172, 640, 88, 5),
    eyebrow(60, 198, 'Missing or stale NAME.TBG'),
    text('ns', 60, 222, 'TBUG ignores a missing or mismatched file quietly and debugs in raw hex.'),
    text('ns', 60, 242, 'Reassemble with TAS to write a fresh matching NAME.COM and NAME.TBG pair.'),

    text(
      'dimn',
      40,
      292,
      'Symbol support is built into TBUG.SVC and loads automatically with no extra service.',
    ),
  ],
);

/* ---------- Geometry verification (padding, collisions, bounds) ---------- */

function verifyGeometry(name, src) {
  const problems = [];
  const attrs = (tag) => {
    const map = {};
    for (const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)) map[m[1]] = m[2];
    return map;
  };
  const unesc = (s) => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  const svgAttrs = attrs(src.match(/<svg[^>]*>/)[0]);
  const sw = Number(svgAttrs.width);
  const sh = Number(svgAttrs.height);

  const fonts = {};
  const style = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  for (const m of style.matchAll(/\.([\w-]+)\s*\{[^}]*?font:\s*([^;]+);/g)) {
    const decl = m[2];
    const size = Number(decl.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 13);
    fonts[m[1]] = { size, mono: /mono/i.test(decl) };
  }

  const texts = [];
  for (const m of src.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const a = attrs(`<text${m[1]}>`);
    const cls = (a.class ?? 't').split(/\s+/)[0];
    const { size, mono } = fonts[cls] ?? { size: 12.5, mono: true };
    const content = unesc(m[2]);
    const w = mono ? monoW(content, size) : sansW(content, size);
    const x = Number(a.x);
    const y = Number(a.y);
    const anchor = a['text-anchor'] ?? 'start';
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    texts.push({ x: left, y: y - size * 0.78, w, h: size * 1.02, s: content, cls });
  }

  const boxes = [];
  for (const m of src.matchAll(/<rect([^>]*)\/>/g)) {
    const a = attrs(m[0]);
    boxes.push({
      x: Number(a.x),
      y: Number(a.y),
      w: Number(a.width),
      h: Number(a.height),
      cls: a.class ?? '',
    });
  }

  // Canvas bounds with generous outer margin
  for (const el of [...texts, ...boxes]) {
    if (el.x < 16 || el.x + el.w > sw - 16) {
      problems.push(`${name}: horizontal margin tight for "${el.s ?? el.cls}" (${el.x.toFixed(0)}..${(el.x + el.w).toFixed(0)})`);
    }
    if (el.y < 12 || el.y + el.h > sh - 10) {
      problems.push(`${name}: vertical margin tight for "${el.s ?? el.cls}" (${el.y.toFixed(0)}..${(el.y + el.h).toFixed(0)})`);
    }
  }

  // No text collisions
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i];
      const b = texts[j];
      if (a.x + a.w - 2 > b.x && b.x + b.w - 2 > a.x && a.y + a.h - 2 > b.y && b.y + b.h - 2 > a.y) {
        problems.push(`${name}: text overlap "${a.s}" and "${b.s}"`);
      }
    }
  }

  // Generous horizontal padding inside enclosing boxes
  for (const t of texts) {
    if (t.cls === 'inv') continue;
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const holder = boxes
      .filter((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!holder) continue;
    const minPad = /pill/.test(holder.cls) ? 5 : 10;
    const leftPad = t.x - holder.x;
    const rightPad = holder.x + holder.w - (t.x + t.w);
    if (leftPad < minPad || rightPad < minPad) {
      problems.push(
        `${name}: tight padding (${leftPad.toFixed(1)}px L, ${rightPad.toFixed(1)}px R) for "${t.s}" in ${holder.w}px ${holder.cls}`,
      );
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
}

assert.equal(figures.size, 7);
const check = process.argv.includes('--check');
if (!check) mkdirSync(out, { recursive: true });
for (const [name, svg] of figures) {
  verifyGeometry(name, svg);
  const target = new URL(name, out);
  if (check) assert.equal(readFileSync(target, 'utf8'), svg, `Regenerate ${name}`);
  else writeFileSync(target, svg);
}
console.log(`${check ? 'Verified' : 'Generated'} ${figures.size} TBUG figures in ${fileURLToPath(out)}`);
