// The starter card's display files: the drivers, and the startup file that loads
// them before the first prompt: 80 columns, then the GLCD. A board without one
// refuses its line, and the prompt follows. A card for 40 or 32 columns changes
// the first line.

import { resolve } from "node:path";
import { PICO_WIDTHS, makeSvc } from "./svc.mjs";

export async function displayFiles(root) {
  const work = resolve(root, "build/svc");
  const files = [];
  for (const [name, defs] of Object.entries(PICO_WIDTHS)) {
    const { file } = await makeSvc(resolve(root, "drivers/pico.asm"), { defs, work });
    files.push({ name, description: `the PICO9918 console at ${defs.COLS} columns, a driver`, bytes: file });
  }
  const { file } = await makeSvc(resolve(root, "drivers/glcd.asm"), { work });
  files.push({ name: "GLCD.SVC", description: "the GLCD console, a driver", bytes: file });
  files.push({ name: "STARTUP.CMD", description: "the commands run at cold boot", bytes: Buffer.from("PICO.SVC\r\nGLCD.SVC\r\n\x1a", "latin1") });
  return files;
}
