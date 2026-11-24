// Compile a BASIC program with BAZA on a scratch card in the host machine, for
// the GAMES volume's finished programs. The card holds only the compiler, its
// runtime and the source; the COM file BAZA writes is returned as CP/M records.

import { Machine, symbolsFromD8 } from "../../host/machine.mjs";
import { createContainer, findVolume, parseContainer, volumePayload } from "./container.mjs";
import { CpmVolume } from "./cpmfs.mjs";

const CLOCK = new Date(2026, 0, 1, 12, 0, 0);

/** NAME.COM, compiled by BAZA from SOURCE (CP/M text), on ROM with its MAP (tecos.d8.json). */
export function compileBasic({ rom, map, baza, rtl, name, source }) {
  const image = createContainer([{ geometry: "G1M", label: "BUILD", mount: "A" }]);
  const v = findVolume(parseContainer(image), "A");
  const a = new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
  a.write("BAZA.COM", baza);
  a.write("BAZA.RTL", rtl);
  a.write(`${name}.BAS`, source);
  const m = new Machine({ rom, symbols: symbolsFromD8(map), sdImage: image, glcd: false, clock: CLOCK });
  m.mark = 0;
  m.expect(/A(:\S*)?>$/, { from: 0, maxCycles: 80_000_000 });
  m.runUntil(() => m.ready(), 200_000_000, "the first input request");
  const out = m.command(`BAZA ${name}`, { maxCycles: 2_000_000_000 });
  if (!/COM written/.test(out)) throw new Error(`BAZA ${name} did not write ${name}.COM:\n${out}`);
  return a.read(`${name}.COM`);
}
