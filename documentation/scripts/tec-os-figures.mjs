import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = new URL('../public/images/tec-os/', import.meta.url);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const rect = (x, y, w, h, cls = '') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
const text = (x, y, value, cls = '', anchor = 'start') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}" xml:space="preserve">${esc(value)}</text>`;
const arrow = (x1, y1, x2, y2) => `<path class="arrow" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#arrow)"/>`;
const note = (y, value) => text(360, y, value, 'note', 'middle');
function box(x, y, title, lines = [], w = 200, h = 88) {
  return [rect(x, y, w, h), text(x + w / 2, y + 26, title, 'head', 'middle'),
    ...lines.map((s, i) => text(x + w / 2, y + 51 + i * 19, s, '', 'middle'))].join('\n');
}
function row(y, entries) {
  return entries.flatMap(([title, ...lines], i) => [box(24 + i * 236, y, title, lines),
    i < entries.length - 1 ? arrow(226 + i * 236, y + 44, 254 + i * 236, y + 44) : '']).join('\n');
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
.head {fill:var(--accent);font:bold 16px system-ui,sans-serif}
.note {font:14px system-ui,sans-serif}
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

add('edit-build-run', 'From source text to a running program',
  'TED saves BANNER.ASM. TAS assembles BANNER.COM. The CCP loads and runs the COM at 0100h. Editing the source requires another build before the executable changes.', 158, [
    row(20, [['Edit in TED', 'BANNER.ASM', 'Saved source text'], ['Assemble with TAS', 'BANNER.COM', 'Code and data'], ['Run from the CCP', 'Load at 0100h', 'Execute the bytes']]),
    note(140, 'A source edit takes effect after a successful rebuild.')
  ]);

add('drive-volumes', 'Drive letters and volumes on one card',
  'The starter card has SYSTEM, WORK, PROJECTS, GAMES and SPARE. Initially A maps SYSTEM, B maps WORK, C maps PROJECTS and D is empty. CD D:GAMES assigns the existing GAMES volume to D.', 292, [
    rect(24, 16, 302, 252), text(175, 43, 'Volumes in one card container', 'head', 'middle'),
    ...['SYSTEM', 'WORK', 'PROJECTS', 'GAMES', 'SPARE'].map((s, i) => text(58, 78 + i * 37, s)),
    ...['A: SYSTEM', 'B: WORK', 'C: PROJECTS', 'D: GAMES'].flatMap((s, i) => [box(442, 54 + i * 49, s, [], 254, 36), arrow(199, 73 + i * 37, 434, 72 + i * 49)]),
    text(442, 34, 'After CD D:GAMES', 'head'), note(287, 'SPARE remains unassigned. The files stay inside their volumes.')
  ]);

add('bdos-layers', 'A program uses the BDOS and BIOS',
  'A COM program passes a function number in C and calls 0005h. BDOS console and disk routines use RAM BIOS entries. Those entries reach device routines or installed hooks. Numbered hardware services are a separate interface.', 178, [
    row(20, [['COM program', 'C = function', 'CALL 0005h'], ['BDOS in ROM', 'Console / files', 'RAM BIOS entries'], ['BIOS device path', 'Device routines', 'Or installed hooks']]),
    note(140, 'For example: print a character, or read a file record.'),
    note(162, 'Numbered hardware services have a separate entry interface.')
  ]);

add('fcb-and-buffer', 'File state and transferred bytes',
  'The FCB describes the file and sequential position. Function 26 selects the DMA buffer. Function 20 reads a 128-byte record there and advances the FCB position on success. The default buffer at 0080h overlaps the command tail.', 246, [
    box(24, 22, 'File control block', ['Name / allocation', 'Sequential position']),
    box(260, 22, 'BDOS function 20', ['DE = FCB address', 'Read next record']),
    box(496, 22, 'DMA buffer', ['128 data bytes', 'Default: 0080h']),
    arrow(226, 66, 254, 66), arrow(462, 66, 490, 66),
    text(360, 145, 'Function 26 sets the DMA address from DE.', 'note', 'middle'),
    note(174, 'A successful read supplies new buffer data and advances the FCB.'),
    note(201, 'Copy needed command-tail text before using the default buffer.'),
    note(228, 'An unsuccessful read does not supply valid new data.')
  ]);

add('tpa-boundary', 'Program memory below the resident boundary',
  'A schematic, not to scale: page zero is below 0100h. The TPA starts at 0100h and ends before the entry address held in the word at 0006h. Resident services and system reservations are above it. Their sizes depend on the build and card.', 326, [
    text(24, 32, 'Higher addresses', 'note'), text(696, 32, 'Schematic: not to scale', 'note', 'end'),
    rect(185, 49, 350, 62), text(360, 75, 'System reservations', 'head', 'middle'), text(360, 98, 'Workspace, vectors and entry stub', '', 'middle'),
    rect(185, 111, 350, 53), text(360, 143, 'Installed resident services', 'head', 'middle'),
    rect(185, 164, 350, 89, 'highlight'), text(360, 197, 'Transient program area', 'head', 'middle'), text(360, 225, 'Program code, data and private stack', '', 'middle'),
    rect(185, 253, 350, 40), text(360, 279, 'Page zero: jumps and buffers', '', 'middle'),
    text(171, 170, '(0006h)', 'accent', 'end'), text(171, 257, '0100h', '', 'end'), text(171, 288, '0000h', '', 'end'),
    note(318, 'The address held at 0006h is excluded from the TPA.')
  ]);

add('bank-window', 'Two RAM banks at the same CPU addresses',
  'Both views have fixed RAM at 0000h–7FFFh and ROM at C000h–FFFFh. Latch bit 2 selects which 16 KiB half of U9 appears at 8000h–BFFFh: EXPAND 0 for ordinary upper RAM or EXPAND 1 for the cache. A stack in EXPAND 0 is hidden in the cache view.', 288, [
    text(246, 28, 'Normal view · EXPAND 0', 'head', 'middle'), text(562, 28, 'Cache view · EXPAND 1', 'head', 'middle'),
    ...[108, 424].flatMap(x => [rect(x, 46, 276, 43), text(x + 138, 73, 'C000h–FFFFh · ROM', '', 'middle'), rect(x, 89, 276, 83, 'highlight'), rect(x, 172, 276, 54), text(x + 138, 204, '0000h–7FFFh · fixed RAM', '', 'middle')]),
    text(246, 119, '8000h–BFFFh', '', 'middle'), text(246, 148, 'Upper RAM / stacks', 'head', 'middle'),
    text(562, 119, '8000h–BFFFh', '', 'middle'), text(562, 148, 'Block cache', 'head', 'middle'),
    note(252, 'Latch bit 2 selects the window. Fixed RAM and ROM stay visible.'),
    note(277, 'An EXPAND 0 stack is hidden while EXPAND 1 is selected.')
  ]);

add('boot-paths', 'Cold boot and warm boot have different lifetimes',
  'Abbreviated paths: reset starts cold boot with a fixed-RAM stack, saved-selection checks and RAM tests. Initialisation clears workspace and cache and mounts the card before command processing. Warm boot restores the normal bank, rebuilds page zero, resets BDOS state and attempts pending writes, retaining installed services and failed acknowledged data.', 355, [
    text(185, 29, 'Reset / cold boot', 'head', 'middle'), text(535, 29, 'Program exit / warm boot', 'head', 'middle'),
    box(35, 45, 'Establish early state', ['Fixed-RAM stack', 'Capture selection; test RAM'], 300),
    box(385, 45, 'Restore normal bank', ['EXPAND 0 and BIOS stack', 'Page zero; reset BDOS'], 300),
    arrow(185, 138, 185, 156), arrow(535, 138, 535, 156),
    box(35, 163, 'Initialise the machine', ['Clear workspace and cache', 'Console, card and vectors'], 300),
    box(385, 163, 'Attempt pending writes', ['Bounded flush', 'Retain failed data'], 300),
    arrow(185, 256, 185, 274), arrow(535, 256, 535, 274),
    text(185, 294, 'Command processing / startup', '', 'middle'), text(535, 294, 'Command processing resumes', '', 'middle'),
    note(324, 'Warm boot normally retains installed services and command state.'),
    note(346, 'Sequences abbreviated. Failed writes can cancel the remaining command line.')
  ]);

add('record-to-block', 'A CP/M record inside an SD block',
  'Track 2 and sector 5 produce record 133: 2 times 64 plus 5. Dividing by four gives block offset 33 and slot 1. A volume beginning at block 2048 therefore uses SD block 2081, with the record in bytes 128–255 of its 512 bytes.', 258, [
    row(18, [['Logical position', 'Track 2, sector 5', '2 × 64 + 5 = 133'], ['Record 133', '133 ÷ 4 = 33 rem 1', 'Offset 33, slot 1'], ['SD block 2081', 'Volume start 2048', '2048 + 33 = 2081']]),
    ...['0–127', '128–255', '256–383', '384–511'].flatMap((s, i) => [rect(64 + i * 148, 142, 148, 54, i === 1 ? 'highlight' : ''), text(138 + i * 148, 166, 'Slot ' + i, i === 1 ? 'accent' : '', 'middle'), text(138 + i * 148, 187, s, '', 'middle')]),
    note(225, 'One SD transfer covers all four 128-byte record slots.'), note(247, 'The selected record occupies bytes 128–255 in this example.')
  ]);

add('cache-order', 'Queued data and directory publication',
  'Writes to the same 512-byte cache line combine there while it is dirty. A cooperative OS-call opportunity attempts eligible queued data. Failed acknowledged data stays queued. Directory publication follows its data prerequisites; a rejected unpublished directory image is dropped rather than retried later. This is not a timed durability guarantee.', 336, [
    row(20, [['Record writes', 'Merge into one', '512-byte cache line'], ['First-dirty queue', 'Coalesce updates', 'Keep queue position'], ['OS-call opportunity', 'Bounded write work', 'Success: line clean']]),
    note(140, 'A failed acknowledged data write stays dirty for another attempt.'),
    row(170, [['Data prerequisites', 'Write data first', 'Require success'], ['Write directory', 'Publish file metadata', 'After prerequisites'], ['Published metadata', 'Successful update', 'Names stored file data']]),
    note(288, 'Failure of either write step drops the unpublished directory image.'),
    note(315, 'Cooperative work has no clock deadline and provides no rollback.')
  ]);

add('command-chain', 'Conditional continuation after warm boot',
  'For TAS BANNER & BANNER ! DIR, the shell tests TAS’s result before BANNER. A failing result skips BANNER, while DIR after the unconditional separator still runs. Warm boot normally preserves the pending line and result; explicit cancellation or failed-flush recovery can discard the remainder.', 218, [
    text(360, 30, 'TAS BANNER & BANNER ! DIR', 'head', 'middle'),
    row(53, [['TAS BANNER', 'Run the assembler', 'Retain result on exit'], ['& BANNER', 'Run on success', 'Skip on failure'], ['! DIR', 'Run regardless of', 'The earlier result']]),
    note(173, 'The shell tests the previous result before starting the next piece.'),
    note(199, 'Cancellation or failed-flush recovery can discard the remaining line.')
  ]);

add('service-commit', 'Tentative service installation and final commit',
  'The service loader validates file size, dependencies and stack allowances, then applies relocation and moves the resident image tentatively. INIT runs before returned-record validation and final registry/reservation commit. Failure requires cleanup; arbitrary device or BIOS changes made by INIT are not automatically reversed.', 310, [
    row(20, [['1 · Validate', 'File / dependencies', 'Stack allowances'], ['2 · Relocate', 'Patch the loaded', 'Image at 0100h'], ['3 · Move resident', 'Tentative boundary', 'PZTOP not committed']]),
    '<path class="arrow" d="M696 108 V132 H12 V207 H18" marker-end="url(#arrow)"/>',
    row(163, [['4 · Run INIT', 'Initialise the service', 'Return records'], ['5 · Check records', 'Validate bounds', 'And registry capacity'], ['6 · Commit', 'Publish registry', 'Commit PZTOP']]),
    note(280, 'Failure takes cleanup paths before a successful reservation commit.'),
    note(302, 'INIT must undo its own device or hook changes where required.')
  ]);

add('evidence-scopes', 'Model evidence and physical-board evidence',
  'One route runs pinned ROM and inputs in the Debug80 model to collect transcripts, assertions and T-states. A separate route runs diagnostics on an identified physical board and records its actual devices and results. A model pass establishes the exercised model behaviour, not an unperformed board test.', 251, [
    text(185, 28, 'Software-model route', 'head', 'middle'), text(535, 28, 'Physical-board route', 'head', 'middle'),
    box(35, 44, 'Pinned ROM and inputs', ['Debug80 runtime', 'Reproducible workload'], 300),
    box(385, 44, 'Identified board and card', ['Actual hardware', 'Diagnostic workload'], 300),
    arrow(185, 138, 185, 158), arrow(535, 138, 535, 158),
    text(185, 183, 'Transcript / assertions / T-states', '', 'middle'), text(535, 183, 'Board log / device observations', '', 'middle'),
    note(220, 'Each result applies to its recorded artifact, setup and exercised paths.'),
    note(243, 'A model pass does not establish physical-board behaviour.')
  ]);

assert.equal(figures.size, 12);
const check = process.argv.includes('--check');
if (!check) mkdirSync(out, { recursive: true });
for (const [name, svg] of figures) {
  const target = new URL(name, out);
  if (check) assert.equal(readFileSync(target, 'utf8'), svg, `Regenerate ${name}`);
  else writeFileSync(target, svg);
}
console.log(`${check ? 'Verified' : 'Generated'} ${figures.size} TEC-OS figures in ${fileURLToPath(out)}`);
