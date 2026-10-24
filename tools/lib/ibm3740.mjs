// Read-only access to standard 8-inch single-density CP/M 2.2 disk images
// (IBM 3740: 77 tracks of 26 records, two system tracks, 1 KiB blocks, 64
// directory entries), stored in logical record order as Debug80, Triptych
// and the Basie release produce them.

import { CpmVolume } from "./cpmfs.mjs";

const SYSTEM_BYTES = 2 * 26 * 128;

export const IBM3740 = {
  name: "IBM3740",
  blockBytes: 1024,
  payloadBlocks: 0,
  dirBlocks: 2,
  dpb: { spt: 26, bsh: 3, blm: 7, exm: 0, dsm: 242, drm: 63, al0: 0xc0, al1: 0, cks: 16, off: 2 },
};

/** A read-only CpmVolume over the data area of a 3740 image. */
export function openIbm3740(image) {
  const need = SYSTEM_BYTES + 243 * 1024;
  if (image.length < need) throw new Error(`disk image is ${image.length} bytes; expected at least ${need}`);
  return new CpmVolume(image.subarray(SYSTEM_BYTES), IBM3740, { readOnly: true });
}
