// The assembly style's machine-checkable rules (Origo's
// bindings/z80-cpm/assembly-style.md), for one source's text:
//
// - tabs: no run of spaces aligns anything outside a string or a comment, and
//   a mnemonic sits at column 9, its operand at 17;
// - the comment column: a comment beside code starts at column 33, one on a
//   line of its own at column 1 or 33, and no line runs past column 80;
// - headers: every routine has a comment block at column 1 directly above its
//   label. A routine is a code label that begins a block: at the file's start
//   or after a blank line, a comment at column 1 or a directive, not one that
//   code falls into;
// - density: at least 40 percent of code lines carry a comment of their own;
// - runs: at most four code lines in a row without one, a comment on a line of
//   its own breaking the run;
// - size: at most 24,576 bytes;
// - the name: at most eight characters, a three-letter type and no hyphen.
//
// A code line holds an instruction. DB, DW and DS lines are data, and EQU,
// ORG, %INCLUDE and the other directives, a label alone and a blank line are
// neither: they are outside the density and the run rules, and a run goes on
// across them.

export const LIMITS = { share: 0.4, run: 4, bytes: 24_576, column: 33, end: 80 };

const DATA = new Set(["DB", "DW", "DS", "DEFB", "DEFW", "DEFS", "DEFM"]);
const DIRECTIVE = new Set(["EQU", "ORG", "END", "DEFL", "SET", "ALIGN", "PHASE", "DEPHASE", "ASSERT"]);

/** The column (1-based) each character of LINE starts at, tabs every 8. */
function columns(line) {
  const at = [];
  let col = 1;
  for (const ch of line) {
    at.push(col);
    col = ch === "\t" ? Math.floor((col - 1) / 8) * 8 + 9 : col + 1;
  }
  return { at, end: col - 1 };
}

/** The index of LINE's comment, the first ; outside a string, or -1. */
function commentAt(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      // 'X' is a character; AF' is a register: a quote follows a letter only there.
      if (ch === "'" && /[A-Za-z]/.test(line[i - 1] ?? "")) continue;
      quote = ch;
    } else if (ch === ";") return i;
  }
  return -1;
}

/** One line taken apart: its label, mnemonic, operand and comment, with columns. */
export function parseLine(line) {
  const c = commentAt(line);
  const code = c < 0 ? line : line.slice(0, c);
  const cols = columns(line);
  const m = /^([A-Za-z_.$?@][\w.$?@]*:?)?([ \t]+)?(\S+)?([ \t]+)?(.*?)\s*$/.exec(code);
  const label = m[1] ?? null;
  let mnemonic = m[3] ?? null;
  let operand = mnemonic ? (m[5] || null) : null;
  // A label with no colon followed by EQU: the name is the label.
  const word = mnemonic?.toUpperCase();
  const kind = !mnemonic
    ? label ? "label" : c >= 0 ? "comment" : line.trim() === "" ? "blank" : "other"
    : mnemonic.startsWith("%") || DIRECTIVE.has(word) || (operand && /^EQU\b/i.test(operand))
      ? "directive"
      : DATA.has(word)
        ? "data"
        : "code";
  const mnemonicCol = mnemonic ? cols.at[code.indexOf(mnemonic, (label ?? "").length)] : null;
  const operandCol = operand ? cols.at[code.lastIndexOf(operand)] : null;
  return { label, mnemonic, operand, comment: c, commentCol: c >= 0 ? cols.at[c] : null, end: cols.end, kind, code, mnemonicCol, operandCol };
}

/** A run of two or more spaces in the code part of LINE, outside a string. */
function spaceRun(code) {
  let quote = null;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || (ch === "'" && !/[A-Za-z]/.test(code[i - 1] ?? ""))) quote = ch;
    else if (ch === " " && (i === 0 || code[i + 1] === " " || code[i + 1] === "\t" || code[i - 1] === "\t")) return true;
  }
  return false;
}

/** The style's figures and faults for the source TEXT named NAME (its file name). */
export function checkSource(text, name) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const faults = [];
  const fault = (rule, line, what) => faults.push({ rule, line, what });
  let codeLines = 0;
  let commented = 0;
  let run = 0;
  let longestRun = 0;
  let runFrom = 0;
  let longestAt = 0;
  let routines = 0;
  let headless = 0;
  let previous = "start"; // what came before: start, blank, header, comment33, code, data, directive, label
  let pending = null; // a label on a line of its own, waiting for the line it names
  lines.forEach((line, i) => {
    const n = i + 1;
    const p = parseLine(line);
    if (spaceRun(p.code)) fault("tabs", n, "spaces align the code");
    if (p.end > LIMITS.end) fault("end", n, `the line runs to column ${p.end}`);
    if (p.comment >= 0) {
      const lone = p.kind === "comment";
      if (lone ? p.commentCol !== 1 && p.commentCol !== LIMITS.column : p.commentCol !== LIMITS.column) fault("column", n, `the comment starts at column ${p.commentCol}`);
    }
    if (p.kind === "code" || p.kind === "data" || p.kind === "directive") {
      if (p.mnemonicCol !== null && p.mnemonicCol !== 9) fault("tabs", n, `the mnemonic at column ${p.mnemonicCol}`);
      if (p.operandCol !== null && p.operandCol !== 17 && p.kind !== "directive") fault("tabs", n, `the operand at column ${p.operandCol}`);
    }
    if (p.kind === "code") {
      codeLines += 1;
      if (p.comment >= 0) {
        commented += 1;
        run = 0;
      } else {
        if (run === 0) runFrom = n;
        run += 1;
        if (run > longestRun) {
          longestRun = run;
          longestAt = runFrom;
        }
      }
    } else if (p.kind === "comment") run = 0;
    // A routine: a code label that begins a block. A label on a line of its
    // own waits for the next line: code makes it a routine, data does not.
    const begins = (before) => ["start", "blank", "header", "directive"].includes(before);
    if (p.kind === "label") {
      if (!pending) pending = { label: p.label, line: n, before: previous };
      return;
    }
    const entry = pending ?? (p.label ? { label: p.label, line: n, before: previous } : null);
    pending = null;
    if (entry && p.kind === "code" && begins(entry.before)) {
      routines += 1;
      if (entry.before !== "header") {
        headless += 1;
        fault("header", entry.line, `${entry.label.replace(/:$/, "")} has no header`);
      }
    }
    if (p.kind === "blank") previous = "blank";
    else if (p.kind === "comment") previous = p.commentCol === 1 ? "header" : "comment33";
    else previous = p.kind;
  });
  const share = codeLines ? commented / codeLines : 1;
  if (share < LIMITS.share) fault("density", 0, `${Math.round(share * 100)} percent of code lines commented`);
  if (longestRun > LIMITS.run) fault("run", longestAt, `${longestRun} code lines without a comment`);
  const bytes = Buffer.byteLength(text, "latin1");
  if (bytes > LIMITS.bytes) fault("size", 0, `${bytes} bytes`);
  if (!/^[A-Z0-9_]{1,8}\.[A-Z]{3}$/i.test(name) || name.includes("-")) fault("name", 0, `${name} is not an 8.3 name`);
  return { name, lines: lines.length, codeLines, commented, share, routines, headless, longestRun, longestAt, bytes, faults };
}
