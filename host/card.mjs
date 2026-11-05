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

/**
 * Ready the card for DISPLAY at WIDTH: the problem, if any, a note (none now),
 * and whether the card changed. The startup file's first line is set for the
 * display, and nothing else is written; a card from an older TEC-OS keeps its
 * files.
 */
export function prepareCard(image, display, width = 80) {
  // The changes are made on a copy, and reach the card only when all are made:
  // a read-only A: or a full directory leaves the card as it was, and it boots so.
  const staged = image.slice();
  try {
    const problem = cardProblem(staged, display);
    const changed = !problem && setDisplayLine(staged, display, width);
    if (changed) image.set(staged);
    return { problem, note: null, changed };
  } catch (e) {
    // The user's read-only mark on STARTUP.CMD stands: write refuses it (KE-AR10),
    // and the page says so rather than force it.
    if (e instanceof CpmError && /STARTUP\.CMD is read-only$/.test(e.message)) return { problem: "This card's STARTUP.CMD is read-only, so the page can't set its display line; it boots as it is", note: null, changed: false };
    return { problem: `This card couldn't be prepared for the page (${e.message}), so it boots as it is.`, note: null, changed: false };
  }
}

/**
 * STARTUP.CMD's lines without their display pieces, the rest of each chain kept
 * and a line with nothing left gone. A piece taken out passes its own ":" to the
 * piece after it on its line. A ":" that waited on a piece taken out goes, on its
 * line or first on the next, since it must not wait on what now comes before it.
 */
function withoutDisplay(lines) {
  const out = [];
  let taken = true; // the display lines go first, so a first ":" would depend on them
  let colon = false; // what the piece after a removed one inherits
  for (const line of lines) {
    if (line.trim() === "") continue;
    const kept = [];
    line.split("!").forEach((piece, i) => {
      const own = /^\s*:/.test(piece);
      const cond = !taken ? own : i === 0 ? own && colon : colon;
      if (DISPLAY_PIECE.test(piece.trim())) {
        taken = true;
        colon = cond;
      } else {
        kept.push(piece.replace(/^(\s*):?/, cond ? "$1:" : "$1"));
        taken = false;
      }
    });
    if (kept.join("!").trim() !== "") out.push(kept.join("!"));
  }
  return out;
}

/** Make STARTUP.CMD's first line DISPLAY's, leaving the rest: GLCD.SVC for the GLCD, CON PICO WIDTH for every PICO9918 width. True if it changed. */
export function setDisplayLine(image, display, width = 80) {
  const a = driveA(image);
  const had = userZero(a).some((f) => f.name === "STARTUP.CMD");
  const old = had ? toLatin1(a.read("STARTUP.CMD")).split("\x1a")[0] : "";
  const rest = withoutDisplay(old.split(/\r?\n/));
  // The chosen display's line alone: CON UC1 loads GLCD.SVC itself, and a line
  // for it on the page's board with both would only give way (KE-150).
  const first = display === "tms" ? [`CON PICO ${width}`] : [displayFile(display)];
  const text = [...first, ...rest].map((l) => `${l}\r\n`).join("");
  if (text === old) return false;
  a.write("STARTUP.CMD", fromLatin1(`${text}\x1a`));
  return true;
}
