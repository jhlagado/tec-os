// TEC-OS container images: header block, volume descriptors and payloads.
// The checks here are a superset of the ROM's mount checks, so an image this
// module accepts will mount.

import { format, geometryById, geometryByName } from "./format.mjs";
import { fromLatin1, sameBytes, toLatin1 } from "./bytes.mjs";

const H = format.header.fields;
const D = format.descriptor.fields;
const BLOCK = format.blockBytes;
const MAGIC = fromLatin1(format.header.magic);
export const DEFAULT_ALIGN = 2048; // 1 MiB, a common SD erase-block multiple

export class ContainerError extends Error {}

function u16(b, o) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function put16(b, o, v) {
  b[o] = v & 0xff;
  b[o + 1] = (v >> 8) & 0xff;
}
function put32(b, o, v) {
  put16(b, o, v & 0xffff);
  put16(b, o + 2, (v >>> 16) & 0xffff);
}

/** Where descriptor i lives: block 0 after the header, then blocks 1-7. */
export function descriptorAt(i) {
  const first = format.header.descriptorsInBlock0;
  if (i < first) return format.header.descriptorsOffset + i * format.descriptor.bytes;
  const j = i - first;
  return (1 + Math.floor(j / format.header.descriptorsPerBlock)) * BLOCK + (j % format.header.descriptorsPerBlock) * format.descriptor.bytes;
}

/** The table's blocks after block 0 that hold descriptors, for `count` volumes. */
export const tableBlocksFor = (count) => Math.max(0, Math.ceil((count - format.header.descriptorsInBlock0) / format.header.descriptorsPerBlock));

/** 16-bit sum of blocks 1..k of the table (format 1.1's tableSum). */
export function tableSum(image, count) {
  let sum = 0;
  for (let i = BLOCK; i < (1 + tableBlocksFor(count)) * BLOCK; i += 1) sum = (sum + image[i]) & 0xffff;
  return sum;
}

/** 16-bit sum of the header bytes, excluding the checksum field. */
export function headerChecksum(header) {
  let sum = 0;
  for (let i = 0; i < format.header.bytes; i += 1) {
    if (i === H.checksum.offset || i === H.checksum.offset + 1) continue;
    sum = (sum + header[i]) & 0xffff;
  }
  return sum;
}

function driveIndex(mount) {
  if (mount === undefined || mount === null || mount === "-") return format.descriptor.unmounted;
  const letter = String(mount).toUpperCase().replace(/:$/, "");
  const index = letter.charCodeAt(0) - 65;
  if (letter.length !== 1 || index < 0 || index >= format.maxDrives) {
    throw new ContainerError(`drive ${mount} is outside A-${String.fromCharCode(64 + format.maxDrives)}`);
  }
  return index;
}

/**
 * Build a new container. volumes: [{ geometry, label, mount, readOnly,
 * writeBehind, id }]. One volume at most is written behind, and never a
 * read-only one.
 * Payloads are erased to E5h, an empty CP/M directory and data area. A card
 * of more than 8 volumes, or one given drives (the drives it wants, 1-4), is
 * format 1.1; any other is 1.0, which every ROM reads.
 */
export function createContainer(volumes, { align = DEFAULT_ALIGN, drives = 0 } = {}) {
  const minor = volumes.length > format.header.maxVolumesMinor0 || drives ? 1 : 0;
  if (volumes.length < 1 || volumes.length > format.header.maxVolumes) {
    throw new ContainerError(`a container holds 1-${format.header.maxVolumes} volumes`);
  }
  if (drives < 0 || drives > format.maxDrives) throw new ContainerError(`drives must be 1-${format.maxDrives}`);
  if (volumes.filter((v) => v.writeBehind).length > 1) throw new ContainerError("one volume at most is written behind");
  if (volumes.some((v) => v.writeBehind && v.readOnly)) throw new ContainerError("a read-only volume cannot be written behind");
  const labels = volumes.map((v, i) => String(v.label ?? `VOLUME${i + 1}`).toUpperCase().slice(0, 11).trimEnd());
  if (new Set(labels).size !== labels.length) throw new ContainerError("volume labels must be unique");
  if (align % format.descriptor.startAlignBlocks !== 0) {
    throw new ContainerError(`alignment must be a multiple of ${format.descriptor.startAlignBlocks} blocks`);
  }
  let next = align;
  const placed = volumes.map((v, i) => {
    const g = typeof v.geometry === "number" ? geometryById(v.geometry) : geometryByName(v.geometry);
    if (!g) throw new ContainerError(`unknown geometry ${v.geometry}`);
    const start = next;
    next = Math.ceil((start + g.payloadBlocks) / align) * align;
    return { ...v, g, start, id: v.id ?? i + 1 };
  });
  const totalBlocks = placed.reduce((end, v) => Math.max(end, v.start + v.g.payloadBlocks), 1);
  const image = new Uint8Array(totalBlocks * BLOCK);
  const header = image.subarray(0, BLOCK);
  header.set(MAGIC, H.magic.offset);
  header[H.major.offset] = format.formatVersion.major;
  header[H.minor.offset] = minor;
  header[H.drives.offset] = drives;
  put16(header, H.headerBytes.offset, format.header.bytes);
  put16(header, H.descriptorBytes.offset, format.descriptor.bytes);
  put16(header, H.volumeCount.offset, placed.length);
  put32(header, H.containerBlocks.offset, totalBlocks);
  placed.forEach((v, i) => {
    const o = descriptorAt(i);
    put32(image, o + D.volumeId.offset, v.id);
    put32(image, o + D.startBlock.offset, v.start);
    put32(image, o + D.lengthBlocks.offset, v.g.payloadBlocks);
    image[o + D.geometry.offset] = v.g.id;
    image[o + D.flags.offset] = v.readOnly ? format.descriptor.flags.readOnly : 0;
    image[o + D.cache.offset] = v.writeBehind ? format.descriptor.cacheFlags.writeBehind : 0;
    image[o + D.mount.offset] = driveIndex(v.mount);
    image.set(fromLatin1(labels[i].padEnd(11, " ")), o + D.label.offset);
    image.fill(0xe5, v.start * BLOCK, (v.start + v.g.payloadBlocks) * BLOCK);
  });
  if (minor) put16(header, H.tableSum.offset, tableSum(image, placed.length));
  put16(header, H.checksum.offset, headerChecksum(header));
  parseContainer(image);
  return image;
}

/** Validate a container and describe it. Throws ContainerError on any fault. */
export function parseContainer(image, { requireLength = true } = {}) {
  const fail = (m) => {
    throw new ContainerError(m);
  };
  if (image.length < BLOCK) fail("image is shorter than one block");
  const h = image.subarray(0, BLOCK);
  if (!sameBytes(h.subarray(0, 8), MAGIC)) fail("bad magic");
  if (h[H.major.offset] !== format.formatVersion.major) fail(`unsupported major version ${h[H.major.offset]}`);
  if (u16(h, H.headerBytes.offset) !== format.header.bytes) fail("bad header size");
  if (u16(h, H.descriptorBytes.offset) !== format.descriptor.bytes) fail("bad descriptor size");
  const minor = h[H.minor.offset];
  const count = u16(h, H.volumeCount.offset);
  const most = minor === 0 ? format.header.maxVolumesMinor0 : format.header.maxVolumes;
  if (count < 1 || count > most) fail(`bad volume count ${count}`);
  if (u16(h, H.checksum.offset) !== headerChecksum(h)) fail("header checksum mismatch");
  const drives = minor === 0 ? 0 : h[H.drives.offset];
  if (drives > format.maxDrives) fail(`bad drives field ${drives}`);
  if (image.length < (1 + tableBlocksFor(count)) * BLOCK) fail("image is shorter than its volume table");
  if (minor >= 1 && u16(h, H.tableSum.offset) !== tableSum(image, count)) fail("volume table checksum mismatch");
  const containerBlocks = u32(h, H.containerBlocks.offset);
  if (requireLength && image.length < containerBlocks * BLOCK) {
    fail(`image is truncated: ${image.length} bytes, header says ${containerBlocks * BLOCK}`);
  }
  const volumes = [];
  for (let i = 0; i < count; i += 1) {
    const o = descriptorAt(i);
    const v = {
      index: i,
      id: u32(image, o + D.volumeId.offset),
      start: u32(image, o + D.startBlock.offset),
      length: u32(image, o + D.lengthBlocks.offset),
      geometry: image[o + D.geometry.offset],
      flags: image[o + D.flags.offset],
      cache: image[o + D.cache.offset],
      mount: image[o + D.mount.offset],
      label: toLatin1(image.subarray(o + D.label.offset, o + D.label.offset + 11)).trimEnd(),
    };
    const g = geometryById(v.geometry);
    if (v.id === 0) fail(`volume ${i}: zero id`);
    if (v.flags & ~format.descriptor.flags.readOnly) fail(`volume ${i}: unknown flags`);
    if (v.cache & ~format.descriptor.cacheFlags.writeBehind) fail(`volume ${i}: unknown cache flags`);
    if (!g) fail(`volume ${i}: unknown geometry ${v.geometry}`);
    if (v.length !== g.payloadBlocks) fail(`volume ${i}: length does not match geometry ${g.name}`);
    if (v.start === 0 || v.start % format.descriptor.startAlignBlocks) fail(`volume ${i}: misaligned start`);
    if (minor >= 1 && volumes.length && v.start < volumes.at(-1).start + volumes.at(-1).length) fail(`volume ${i}: not after volume ${i - 1}`);
    if (minor >= 1 && volumes.some((p) => p.label === v.label)) fail(`volume ${i}: duplicate label ${v.label}`);
    if (v.start + v.length > containerBlocks) fail(`volume ${i}: payload beyond the container`);
    if (v.mount !== format.descriptor.unmounted && v.mount >= format.maxDrives) fail(`volume ${i}: bad drive`);
    for (const p of volumes) {
      if (p.id === v.id) fail(`volume ${i}: duplicate id`);
      if (v.mount !== format.descriptor.unmounted && p.mount === v.mount) fail(`volume ${i}: duplicate drive`);
      if (v.start < p.start + p.length && p.start < v.start + v.length) fail(`volume ${i}: overlaps volume ${p.index}`);
    }
    v.g = g;
    v.readOnly = (v.flags & format.descriptor.flags.readOnly) !== 0;
    v.writeBehind = (v.cache & format.descriptor.cacheFlags.writeBehind) !== 0;
    if (v.writeBehind && v.readOnly) fail(`volume ${i}: read-only and written behind`);
    if (v.writeBehind && volumes.some((p) => p.writeBehind)) fail(`volume ${i}: a second volume written behind`);
    v.drive = v.mount === format.descriptor.unmounted ? null : String.fromCharCode(65 + v.mount);
    volumes.push(v);
  }
  if (!volumes.some((v) => v.mount === 0)) fail("no volume is mounted as drive A");
  return { containerBlocks, volumes, minor, drives };
}

/** The payload bytes of a volume, as a view into the image. */
export function volumePayload(image, volume) {
  return image.subarray(volume.start * BLOCK, (volume.start + volume.length) * BLOCK);
}

/** Find a volume by drive letter, label or id. */
export function findVolume(info, key) {
  const k = String(key).toUpperCase().replace(/:$/, "");
  const v =
    info.volumes.find((x) => x.drive === k) ??
    info.volumes.find((x) => x.label.toUpperCase() === k) ??
    info.volumes.find((x) => String(x.id) === k);
  if (!v) throw new ContainerError(`no volume ${key}`);
  return v;
}
