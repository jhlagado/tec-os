// The starter card's startup files: the shell, the GLCD's driver and the
// startup file that loads them. The ROM runs STARTUP.CMD's first line, which
// installs SHELL.SVC, and the shell runs the rest. A PICO9918's console is the
// ROM's, so a board with one needs no file, and the GLCD's line there gives way
// quietly or, with no GLCD, passes over it.

import { resolve } from "node:path";
import { makeSvc } from "./svc.mjs";

/** STARTUP.CMD's lines on the starter card: the shell first, then the GLCD. */
export const STARTUP_LINES = ["SHELL.SVC", "GLCD.SVC"];

// Tests build the services with makeSvc; media supplies its own writers.
export async function displayFiles(root, { assembleGlcd, assembleShell } = {}) {
  const work = resolve(root, "build/svc");
  const glcd = assembleGlcd ? await assembleGlcd() : (await makeSvc(resolve(root, "drivers/glcd.asm"), { work })).file;
  const shell = assembleShell ? await assembleShell() : (await makeSvc(resolve(root, "drivers/shell.asm"), { work })).file;
  return [
    { name: "SHELL.SVC", description: "the shell: history, COPY, DEL, SERVICES, the pager, ! and & lines and .CMD scripts", bytes: shell },
    { name: "GLCD.SVC", description: "the GLCD console, a driver", bytes: glcd },
    { name: "STARTUP.CMD", description: "the commands run at cold boot", bytes: Buffer.from(`${STARTUP_LINES.map((l) => `${l}\r\n`).join("")}\x1a`, "latin1") },
  ];
}
