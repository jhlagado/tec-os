// The container and geometry contract, loaded from format/format.json. Both
// the ROM build and the host tools use this module, so they cannot disagree.

import formatJson from "../../format/format.json" with { type: "json" };

export const format = formatJson;

/** Derived figures for one geometry, checked against the firmware limits. */
export function geometryInfo(geometry) {
  const d = geometry.dpb;
  const blockBytes = 128 << d.bsh;
  if (d.blm !== (1 << d.bsh) - 1) throw new Error(`${geometry.name}: BLM does not match BSH`);
  if (d.spt !== 64) throw new Error(`${geometry.name}: the BIOS maps 64 records per track`);
  if (d.off !== 0 || d.cks !== 0) throw new Error(`${geometry.name}: OFF and CKS must be zero`);
  if (d.dsm > 2047) throw new Error(`${geometry.name}: DSM exceeds the 256-byte allocation vector`);
  const expectedExm = d.dsm < 256 ? blockBytes / 1024 - 1 : blockBytes / 2048 - 1;
  if (d.exm !== expectedExm) throw new Error(`${geometry.name}: EXM should be ${expectedExm}`);
  const payloadBytes = geometry.payloadBlocks * format.blockBytes;
  const dataBytes = (d.dsm + 1) * blockBytes;
  if (dataBytes > payloadBytes) throw new Error(`${geometry.name}: DSM exceeds the payload`);
  const dirEntriesPerBlock = blockBytes / 32;
  let dirBlocks = 0;
  for (let bit = 15; bit >= 0; bit -= 1) {
    const mask = (d.al0 << 8) | d.al1;
    if (mask & (1 << bit)) dirBlocks += 1;
  }
  if (dirBlocks * dirEntriesPerBlock !== d.drm + 1) {
    throw new Error(`${geometry.name}: AL0/AL1 reserve ${dirBlocks} blocks for ${d.drm + 1} entries`);
  }
  const records = payloadBytes / 128;
  if (records > 65536) throw new Error(`${geometry.name}: more than 65536 records`);
  return {
    ...geometry,
    blockBytes,
    payloadBytes,
    dataBytes,
    dirBlocks,
    tracks: records / d.spt,
    alvBytes: Math.floor(d.dsm / 8) + 1,
  };
}

export function geometryById(id) {
  const geometry = format.geometries.find((g) => g.id === id);
  return geometry ? geometryInfo(geometry) : undefined;
}

export function geometryByName(name) {
  const geometry = format.geometries.find((g) => g.name.toLowerCase() === String(name).toLowerCase());
  return geometry ? geometryInfo(geometry) : undefined;
}
