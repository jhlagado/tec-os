// What the web host needs of a card: the startup file's display pieces and a
// word for a card that can't drive the display chosen. The PICO9918's console is
// the ROM's (KS39), so the page writes no driver for it: its width is a
// CON PICO WIDTH line for every explicit host selection.

import { findVolume, parseContainer, volumePayload } from "../tools/lib/container.mjs";
import { CpmError, CpmVolume } from "../tools/lib/cpmfs.mjs";
import { FORMAT } from "../tools/lib/svc-format.mjs";
import { fromLatin1, toLatin1 } from "../tools/lib/bytes.mjs";

// A display piece of a startup line, under either type: a card whose files were
// renamed by hand still has its .DRV lines, and an older card its PICO.SVC; and
// a width line, the page's own CON PICO or a user's CON CRT, which would
// override the selector's width if it stayed.
const DISPLAY_PIECE = /^:?((PICO(40|32)?|GLCD)\.(SVC|DRV)|CON +(PICO|CRT):? +\d+)$/i;
const OLD_DISPLAY = /^(PICO(40|32)?|GLCD)\.DRV$/;

/** A:'s volume, read-only as its descriptor says. Its files are user 0's: the ROM loads from there. */
function driveA(image) {
  const info = parseContainer(image);
  const v = findVolume(info, "A");
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: v.readOnly });
}
const userZero = (a) => a.list({ user: 0 });

/** The file a card needs for DISPLAY, "tms" or "glcd": none for the ROM's console. */
export const displayFile = (display) => (display === "tms" ? null : "GLCD.SVC");

/** Why the card can't show DISPLAY, or null. */
export function cardProblem(image, display) {
  const name = displayFile(display);
  let a;
  let files;
  try {
    a = driveA(image);
    files = userZero(a);
  } catch {
    return "This card has no drive A: the diagnostic prompt is on the serial terminal below. A new starter card has one.";
  }
  if (!name) return null;
  if (!files.some((f) => f.name === name)) {
    const asked = name.replace(".SVC", ".DRV");
    const old = files.find((f) => f.name === asked) ?? files.find((f) => OLD_DISPLAY.test(f.name));
    if (old) return `This card is from an older TEC-OS: this ROM doesn't load ${old.name}, so the card boots as its STARTUP.CMD says. A new starter card has ${name}.`;
    return `This card has no ${name}: it boots as its STARTUP.CMD says. A new starter card has it.`;
  }
  const version = a.read(name)[1];
  if (version !== FORMAT) return `This card's ${name} is format ${version}, from an older TEC-OS, and this ROM refuses it. A new starter card has the driver.`;
  return null;
}

// A card from before the shell has no SHELL.SVC, and its MON3.SVC, if any, is
// a build the ROM installs without entering. The starter card's copies of these
// bring it up to date; the card's other files are the user's and stay.
const SYSTEM_FILES = ["SHELL.SVC", "MON3.SVC"];
const UPGRADED = "This card is from before the shell: the page gave it the starter card's SHELL.SVC and MON3.SVC, and put SHELL.SVC first in STARTUP.CMD. Its other files are as they were.";

/** True if BYTES is a service whose execution record asks to be entered on install. */
function entersOnInstall(bytes) {
  return bytes.length > 28 && bytes[25] === 0x45 && bytes[26] === 0x58 && bytes[27] === 1 && (bytes[28] & 2) !== 0;
}

/**
 * True if the card is from before the shell: A: has no SHELL.SVC, and no
 * MON3.SVC that is entered on install. A current card whose SHELL.SVC the user
 * took off has the newer MON3.SVC, and is left without the shell.
 */
export function predatesShell(image) {
  const a = driveA(image);
  const files = userZero(a);
  if (files.some((f) => f.name === "SHELL.SVC")) return false;
  return !files.some((f) => f.name === "MON3.SVC") || !entersOnInstall(a.read("MON3.SVC"));
}

/**
 * Give a card from before the shell STARTER's SHELL.SVC, and STARTER's MON3.SVC
 * in place of its own if it has one. True if it changed. STARTUP.CMD is
 * setDisplayLine's, which puts SHELL.SVC first once the card has it.
 */
function upgradeSystem(image, starter) {
  if (!predatesShell(image)) return false;
  const a = driveA(image);
  const from = driveA(starter);
  const had = new Set(userZero(a).map((f) => f.name));
  for (const name of SYSTEM_FILES) if (name === "SHELL.SVC" || had.has(name)) a.write(name, from.read(name));
  return true;
}

/**
 * Ready the card for DISPLAY at WIDTH: the problem, if any, a note, and whether
 * the card changed. The startup file's first line is set for the display. Given
 * STARTER, the current starter card's image, a card from before the shell also
 * gets the starter's system files, and the note says so. Nothing else is
 * written; a card from an older TEC-OS keeps its own files.
 */
export function prepareCard(image, display, width = 80, starter = null) {
  // The changes are made on a copy, and reach the card only when all are made:
  // a read-only A: or a full directory leaves the card as it was, and it boots so.
  const staged = image.slice();
  try {
    const problem = cardProblem(staged, display);
    const upgraded = !problem && starter !== null && upgradeSystem(staged, starter);
    const changed = !problem && (setDisplayLine(staged, display, width) || upgraded);
    if (changed) image.set(staged);
    return { problem, note: upgraded ? UPGRADED : null, changed };
  } catch (e) {
    // The user's read-only mark on STARTUP.CMD stands: write refuses it (KE-AR10),
    // and the page says so rather than force it.
    if (e instanceof CpmError && /STARTUP\.CMD is read-only$/.test(e.message)) return { problem: "This card's STARTUP.CMD is read-only, so the page can't set its display line; it boots as it is", note: null, changed: false };
    return { problem: `This card couldn't be prepared for the page (${e.message}), so it boots as it is.`, note: null, changed: false };
  }
}

/**
 * A line's pieces under the shell's rules: each with the separator before it,
 * "" for the first, "!" for a run of separators holding a !, and "&" for a run
 * of & alone. ! always separates; & does only after a space, a tab or another
 * separator, so an & inside a word is text. A blank before a separator stays
 * at the end of its piece.
 */
function pieces(line) {
  const out = [];
  let text = "";
  let sep = "";
  for (let i = 0; i < line.length; ) {
    const c = line[i];
    if (c === "!" || (c === "&" && (i === 0 || /[ \t]/.test(line[i - 1])))) {
      let bang = false;
      for (; i < line.length && /[ \t!&]/.test(line[i]); i += 1) bang ||= line[i] === "!";
      out.push({ sep, text });
      [text, sep] = ["", bang ? "!" : "&"];
    } else {
      text += c;
      i += 1;
    }
  }
  out.push({ sep, text });
  return out;
}

/**
 * STARTUP.CMD's lines without their display pieces and without SHELL.SVC, which
 * setDisplayLine writes first: the rest of each line kept and a line with
 * nothing left gone. A kept piece keeps the separator before it, so one that
 * followed a removed piece by & still runs only on success; one that now starts
 * its line starts unconditionally. An older card's ":" before a kept piece
 * becomes &, its new form.
 */
function withoutDisplay(lines) {
  const out = [];
  for (const line of lines) {
    const kept = [];
    for (const { sep, text } of pieces(line)) {
      const piece = text.trim().replace(/^:/, "");
      if (piece === "" || DISPLAY_PIECE.test(piece) || /^SHELL\.SVC$/i.test(piece)) continue;
      const own = /^\s*:/.test(text) ? "&" : sep;
      const body = text.replace(/^(\s*):/, "$1");
      kept.push(kept.length === 0 ? body.trimStart() : `${/[ \t]$/.test(kept.at(-1)) || own === "!" ? "" : " "}${own}${body}`);
    }
    if (kept.length) out.push(kept.join(""));
  }
  return out;
}

/**
 * Make STARTUP.CMD's first lines SHELL.SVC and DISPLAY's, leaving the rest:
 * GLCD.SVC for the GLCD, CON PICO WIDTH for every PICO9918 width. The ROM runs
 * the first line only and the shell the rest, so a card without SHELL.SVC gets
 * the display's line first. True if it changed.
 */
export function setDisplayLine(image, display, width = 80) {
  const a = driveA(image);
  const files = userZero(a);
  const had = files.some((f) => f.name === "STARTUP.CMD");
  const shell = files.some((f) => f.name === "SHELL.SVC");
  const old = had ? toLatin1(a.read("STARTUP.CMD")).split("\x1a")[0] : "";
  const rest = withoutDisplay(old.split(/\r?\n/));
  // The chosen display's line alone: CON UC1 loads GLCD.SVC itself, and a line
  // for it on the page's board with both would only give way.
  const display1 = display === "tms" ? `CON PICO ${width}` : displayFile(display);
  const first = shell ? ["SHELL.SVC", display1] : [display1];
  const text = [...first, ...rest].map((l) => `${l}\r\n`).join("");
  if (text === old) return false;
  a.write("STARTUP.CMD", fromLatin1(`${text}\x1a`));
  return true;
}
