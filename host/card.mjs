// What the web host needs of a card: the startup file's display pieces, the
// PICO9918's driver at the width chosen, and a word for a card that can't drive
// the display chosen. A card holds one PICO.SVC; the page writes it at its width.

import { findVolume, parseContainer, volumePayload } from "../tools/lib/container.mjs";
import { CpmVolume } from "../tools/lib/cpmfs.mjs";
import { FORMAT } from "../tools/lib/svc-format.mjs";
import { fromLatin1, toLatin1 } from "../tools/lib/bytes.mjs";

/** The driver for each width, as the page fetches it from files/; on the card it is PICO.SVC. */
export const WIDTH_FILES = { 80: "PICO.SVC", 40: "PICO40.SVC", 32: "PICO32.SVC" };
// A display piece of a startup line, under either type: a card whose files were
// renamed by hand still has its .DRV lines.
const DISPLAY_PIECE = /^:?(PICO(40|32)?|GLCD)\.(SVC|DRV)$/i;
const OLD_DISPLAY = /^(PICO(40|32)?|GLCD)\.DRV$/;

function driveA(image) {
  const info = parseContainer(image);
  const v = findVolume(info, "A");
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
}

/** The first line a card needs for DISPLAY, "tms" or "glcd". */
export const displayFile = (display) => (display === "tms" ? "PICO.SVC" : "GLCD.SVC");

/** Why the card can't show DISPLAY, or null. */
export function cardProblem(image, display) {
  const name = displayFile(display);
  let a;
  let files;
  try {
    a = driveA(image);
    files = a.list();
  } catch {
    return "This card has no drive A: the diagnostic prompt is on the serial terminal below. A new starter card has one.";
  }
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
 * Ready the card for DISPLAY: the problem, if any, and whether the card changed.
 * DRIVER, the PICO9918's driver at the width chosen, becomes A:PICO.SVC when it
 * differs, on a card with drive A and no older driver: a card from an older
 * TEC-OS is left alone.
 */
export function prepareCard(image, display, driver) {
  let problem = cardProblem(image, display);
  let wrote = false;
  if (display === "tms" && driver instanceof Uint8Array && (!problem || /^This card (has no|'s) PICO\.SVC/.test(problem))) {
    const a = driveA(image);
    const had = a.list().some((f) => f.name === "PICO.SVC") ? a.read("PICO.SVC").subarray(0, driver.length) : null;
    if (!had || had.length !== driver.length || had.some((b, i) => b !== driver[i])) {
      a.write("PICO.SVC", driver);
      wrote = true;
    }
    problem = cardProblem(image, display);
  }
  return { problem, changed: problem ? wrote : setDisplayLine(image, display) || wrote };
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

/** Make STARTUP.CMD's first line the driver for DISPLAY, leaving the rest. True if it changed. */
export function setDisplayLine(image, display) {
  const a = driveA(image);
  const had = a.list().some((f) => f.name === "STARTUP.CMD");
  const old = had ? toLatin1(a.read("STARTUP.CMD")).split("\x1a")[0] : "";
  const rest = withoutDisplay(old.split(/\r?\n/));
  const text = [displayFile(display), ...(display === "tms" ? ["GLCD.SVC"] : []), ...rest].map((l) => `${l}\r\n`).join("");
  if (text === old) return false;
  a.write("STARTUP.CMD", fromLatin1(`${text}\x1a`));
  return true;
}
