// What the web host needs of a card: the startup file's display pieces, and a
// word for a card that can't drive the display chosen.

import { findVolume, parseContainer, volumePayload } from "../tools/lib/container.mjs";
import { CpmVolume } from "../tools/lib/cpmfs.mjs";
import { FORMAT } from "../tools/lib/svc-format.mjs";
import { fromLatin1, toLatin1 } from "../tools/lib/bytes.mjs";

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

/** The first line a card needs for DISPLAY, "tms" or "glcd", at WIDTH. */
export const displayFile = (display, width) => (display === "tms" ? WIDTH_FILES[width] : "GLCD.SVC");

/** Why the card can't show DISPLAY at WIDTH, or null. */
export function cardProblem(image, display, width) {
  const name = displayFile(display, width);
  let a;
  let files;
  try {
    a = driveA(image);
    files = a.list();
  } catch {
    return "This card has no drive A: the diagnostic prompt is on the serial terminal below. A new starter card has one.";
  }
  if (!files.some((f) => f.name === name)) {
    const old = files.find((f) => OLD_DISPLAY.test(f.name));
    if (old) return `This card is from an older TEC-OS: this ROM doesn't load ${old.name}, so the card boots as its STARTUP.CMD says. A new starter card has ${name}.`;
    return `This card has no ${name}: it boots as its STARTUP.CMD says. A new starter card has it.`;
  }
  const version = a.read(name)[1];
  if (version !== FORMAT) return `This card's ${name} is format ${version}, from an older TEC-OS, and this ROM refuses it. A new starter card has the driver.`;
  return null;
}

/** Ready the card for DISPLAY at WIDTH: the problem, if any, and whether the card changed. */
export function prepareCard(image, display, width) {
  const problem = cardProblem(image, display, width);
  return { problem, changed: problem ? false : setDisplayLine(image, display, width) };
}

/** A startup line without its display pieces, the rest of the chain kept: "" if none is left. */
const withoutDisplay = (line) =>
  line
    .split("!")
    .filter((p) => !DISPLAY_PIECE.test(p.trim()))
    .join("!");

/** Make STARTUP.CMD's first line the driver for DISPLAY at WIDTH, leaving the rest. True if it changed. */
export function setDisplayLine(image, display, width) {
  const a = driveA(image);
  const had = a.list().some((f) => f.name === "STARTUP.CMD");
  const old = had ? toLatin1(a.read("STARTUP.CMD")).split("\x1a")[0] : "";
  const rest = old.split(/\r?\n/).map(withoutDisplay).filter((l) => l.trim() !== "");
  const text = [displayFile(display, width), ...(display === "tms" ? ["GLCD.SVC"] : []), ...rest].map((l) => `${l}\r\n`).join("");
  if (text === old) return false;
  a.write("STARTUP.CMD", fromLatin1(`${text}\x1a`));
  return true;
}
