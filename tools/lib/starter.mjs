// The starter card's display files: the PICO9918's driver at the card's width,
// 80 columns, the GLCD's, and the startup file that loads them before the first
// prompt: the PICO9918, then the GLCD. A board without one refuses its line, and
// the prompt follows. The page's other widths are built apart: it writes one as
// the card's PICO.SVC.

import { resolve } from "node:path";
import { PICO_WIDTHS, makeSvc } from "./svc.mjs";

export async function displayFiles(root) {
  const work = resolve(root, "build/svc");
  const { file: glcd } = await makeSvc(resolve(root, "drivers/glcd.asm"), { work });
  return [
    { name: "GLCD.SVC", description: "the GLCD console, a driver", bytes: glcd },
    { name: "STARTUP.CMD", description: "the commands run at cold boot", bytes: Buffer.from("GLCD.SVC\r\n\x1a", "latin1") },
  ];
}

/** The PICO9918's driver at the page's other widths, by the name the page fetches. */
export async function widthDrivers(root) {
  const work = resolve(root, "build/svc");
  const names = Object.keys(PICO_WIDTHS).filter((n) => n !== "PICO.SVC");
  return Promise.all(names.map(async (name) => ({ name, cols: PICO_WIDTHS[name].COLS, bytes: (await makeSvc(resolve(root, "drivers/pico.asm"), { defs: PICO_WIDTHS[name], work })).file })));
}
