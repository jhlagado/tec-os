// What the web host needs of a card: the startup file's display lines, and a
// word for a card that can't drive the display chosen.

import { findVolume, parseContainer, volumePayload } from "../tools/lib/container.mjs";
import { CpmVolume } from "../tools/lib/cpmfs.mjs";

export const WIDTH_FILES = { 80: "PICO.DRV", 40: "PICO40.DRV", 32: "PICO32.DRV" };
const DISPLAY_LINE = /^(PICO(40|32)?|GLCD)\.DRV$/i;

function driveA(image) {
  const info = parseContainer(image);
  const v = findVolume(info, "A");
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
}

/** The first line a card needs for DISPLAY, "tms" or "glcd", at WIDTH. */
export const displayFile = (display, width) => (display === "tms" ? WIDTH_FILES[width] : "GLCD.DRV");

/** Why the card can't show DISPLAY at WIDTH, or null. */
export function cardProblem(image, display, width) {
  const name = displayFile(display, width);
  let files;
  try {
    files = driveA(image).list();
  } catch {
    return "This card has no drive A: the diagnostic prompt is on the serial terminal below. A new starter card has one.";
  }
  if (files.some((f) => f.name === name)) return null;
  return `This card has no ${name}: it boots as its STARTUP.CMD says. A new starter card has it.`;
}

/** Ready the card for DISPLAY at WIDTH: the problem, if any, and whether the card changed. */
export function prepareCard(image, display, width) {
  const problem = cardProblem(image, display, width);
  return { problem, changed: problem ? false : setDisplayLine(image, display, width) };
}

/** Make STARTUP.CMD's first line the driver for DISPLAY at WIDTH, leaving the rest. True if it changed. */
export function setDisplayLine(image, display, width) {
  const a = driveA(image);
  const had = a.list().some((f) => f.name === "STARTUP.CMD");
  const old = had ? Buffer.from(a.read("STARTUP.CMD")).toString("latin1").split("\x1a")[0] : "";
  const rest = old.split(/\r?\n/).filter((l) => l !== "" && !DISPLAY_LINE.test(l.trim()));
  const text = [displayFile(display, width), ...(display === "tms" ? ["GLCD.DRV"] : []), ...rest].map((l) => `${l}\r\n`).join("");
  if (text === old) return false;
  a.write("STARTUP.CMD", Buffer.from(`${text}\x1a`, "latin1"));
  return true;
}
