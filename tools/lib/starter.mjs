// The starter card's display files: the GLCD's driver and the startup file that
// loads it. A PICO9918's console is the ROM's (KS39), so a board with one needs
// no file, and the GLCD's line there gives way quietly or, with no GLCD, passes
// over it.

import { resolve } from "node:path";
import { makeSvc } from "./svc.mjs";

export async function displayFiles(root, assembleGlcd) {
  const work = resolve(root, "build/svc");
  const glcd = assembleGlcd ? await assembleGlcd() : (await makeSvc(resolve(root, "drivers/glcd.asm"), { work })).file;
  return [
    { name: "GLCD.SVC", description: "the GLCD console, a driver", bytes: glcd },
    { name: "STARTUP.CMD", description: "the commands run at cold boot", bytes: Buffer.from("GLCD.SVC\r\n\x1a", "latin1") },
  ];
}
