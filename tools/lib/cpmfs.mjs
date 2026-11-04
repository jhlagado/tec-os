// CP/M 2.2 directory and allocation on a TEC-OS volume payload.
//
// A volume is the byte payload of one container volume and its geometry.
// Records are numbered linearly from the start of the payload (OFF is 0), so
// allocation block n starts at byte n * blockBytes.

import { fromLatin1, toLatin1 } from "./bytes.mjs";

export class CpmError extends Error {}

const ENTRY = 32;
const RECORD = 128;
const EOF = 0x1a;

/** Parse "NAME.EXT" into 11 upper-case bytes, or throw. */
export function cpmName(name) {
  const m = /^([A-Za-z0-9_$#@!%&'()\-^{}~]{1,8})(?:\.([A-Za-z0-9_$#@!%&'()\-^{}~]{0,3}))?$/.exec(name);
  if (!m) throw new CpmError(`invalid CP/M 8.3 filename ${JSON.stringify(name)}`);
  return fromLatin1(m[1].toUpperCase().padEnd(8, " ") + (m[2] ?? "").toUpperCase().padEnd(3, " "));
}

function displayName(bytes) {
  const raw = toLatin1(bytes.map((b) => b & 0x7f));
  const base = raw.slice(0, 8).trimEnd();
  const ext = raw.slice(8, 11).trimEnd();
  return ext ? `${base}.${ext}` : base;
}

export class CpmVolume {
  constructor(payload, geometry, { readOnly = false } = {}) {
    this.data = payload;
    this.g = geometry;
    this.d = geometry.dpb;
    this.readOnly = readOnly;
    this.blockBytes = geometry.blockBytes;
    this.entries = this.d.drm + 1;
    this.wide = this.d.dsm > 255; // 16-bit block pointers
    this.pointers = this.wide ? 8 : 16;
    this.extentsPerEntry = this.d.exm + 1;
  }

  entry(i) {
    return this.data.subarray(i * ENTRY, (i + 1) * ENTRY);
  }

  /** The entry's allocated blocks as [slot, block], skipping empty slots. */
  slotsOf(e) {
    const list = [];
    for (let k = 0; k < this.pointers; k += 1) {
      const b = this.wide ? e[16 + 2 * k] | (e[17 + 2 * k] << 8) : e[16 + k];
      if (b !== 0) list.push([k, b]);
    }
    return list;
  }

  /** Every live directory entry, with its file identity and extent number. */
  scan() {
    const out = [];
    for (let i = 0; i < this.entries; i += 1) {
      const e = this.entry(i);
      if (e[0] === 0xe5 || e[0] > 31) continue;
      out.push({
        index: i,
        user: e[0],
        key: toLatin1(e.subarray(1, 12).map((b) => b & 0x7f)),
        name: displayName(e.subarray(1, 12)),
        extent: (e[12] & 0x1f) | ((e[14] & 0x3f) << 5),
        rc: e[15],
        readOnly: (e[9] & 0x80) !== 0,
        system: (e[10] & 0x80) !== 0,
        slots: this.slotsOf(e),
      });
      out.at(-1).blocks = out.at(-1).slots.map(([, b]) => b);
    }
    return out;
  }

  usedBlocks() {
    const used = new Set();
    for (let b = 0; b < this.g.dirBlocks; b += 1) used.add(b);
    for (const e of this.scan()) {
      for (const b of e.blocks) {
        if (b > this.d.dsm) throw new CpmError(`${e.name}: block ${b} beyond DSM`);
        if (used.has(b)) throw new CpmError(`${e.name}: block ${b} allocated twice`);
        used.add(b);
      }
    }
    return used;
  }

  /** Files grouped by user and name, with their record counts. */
  list({ user } = {}) {
    const files = new Map();
    for (const e of this.scan()) {
      if (user !== undefined && e.user !== user) continue;
      const id = `${e.user}:${e.key}`;
      const f = files.get(id) ?? { user: e.user, name: e.name, key: e.key, entries: [], readOnly: false, system: false };
      f.entries.push(e);
      f.readOnly ||= e.readOnly;
      f.system ||= e.system;
      files.set(id, f);
    }
    return [...files.values()]
      .map((f) => {
        f.entries.sort((a, b) => a.extent - b.extent);
        f.records = this.recordCount(f.entries);
        f.bytes = f.records * RECORD;
        return f;
      })
      .sort((a, b) => a.user - b.user || a.name.localeCompare(b.name));
  }

  recordCount(entries) {
    const last = entries[entries.length - 1];
    return last.extent * 128 + Math.min(last.rc, 128);
  }

  find(name, user = 0) {
    const key = toLatin1(cpmName(name));
    return this.list({ user }).find((f) => f.key === key);
  }

  /** Read a file's records. text: stop at the first ^Z and convert CRLF to LF. */
  read(name, { user = 0, text = false } = {}) {
    const f = this.find(name, user);
    if (!f) throw new CpmError(`${user}/${name} not found`);
    const out = new Uint8Array(f.records * RECORD);
    const recordsPerBlock = this.blockBytes / RECORD;
    for (const e of f.entries) {
      const firstLogical = e.extent - (e.extent % this.extentsPerEntry);
      // The entry ends at its last logical extent's RC, whatever its blocks
      // hold past it; records no entry holds stay zero.
      const end = e.extent * 128 + Math.min(e.rc, 128);
      // A slot's place in the entry fixes its records, holes included.
      for (const [k, b] of e.slots) {
        const record0 = firstLogical * 128 + k * recordsPerBlock;
        const n = Math.min(recordsPerBlock, end - record0, f.records - record0);
        if (n <= 0) continue;
        out.set(this.data.subarray(b * this.blockBytes, b * this.blockBytes + n * RECORD), record0 * RECORD);
      }
    }
    if (!text) return out;
    const z = out.indexOf(EOF);
    return fromLatin1(toLatin1(z < 0 ? out : out.subarray(0, z)).replace(/\r\n/g, "\n"));
  }

  erase(name, user = 0) {
    this.assertWritable();
    const key = toLatin1(cpmName(name));
    let n = 0;
    for (const e of this.scan()) {
      if (e.user === user && e.key === key) {
        this.entry(e.index)[0] = 0xe5;
        n += 1;
      }
    }
    return n;
  }

  assertWritable() {
    if (this.readOnly) throw new CpmError("volume is read-only");
  }

  /**
   * Write a file, replacing any file of the same name. text: convert LF to
   * CRLF, end with ^Z and pad with ^Z; binary pads with zeros.
   */
  write(name, bytes, { user = 0, text = false, readOnly = false, system = false } = {}) {
    this.assertWritable();
    if (!Number.isInteger(user) || user < 0 || user > 15) throw new CpmError(`user ${user} outside 0-15`);
    const key = cpmName(name);
    let body = Uint8Array.from(bytes);
    if (text) body = fromLatin1(toLatin1(body).replace(/\r?\n/g, "\r\n") + String.fromCharCode(EOF));
    const records = Math.ceil(body.length / RECORD);
    const padded = new Uint8Array(records * RECORD).fill(text ? EOF : 0);
    padded.set(body);
    // Plan against the intact directory, reclaiming this file's allocations.
    const old = this.find(name, user);
    const reusable = new Set(old?.entries.map((e) => e.index) ?? []);
    const used = this.usedBlocks();
    for (const e of old?.entries ?? []) for (const b of e.blocks) used.delete(b);
    const recordsPerBlock = this.blockBytes / RECORD;
    const blocksNeeded = Math.ceil(records / recordsPerBlock);
    const free = [];
    for (let b = 0; b <= this.d.dsm && free.length < blocksNeeded; b += 1) if (!used.has(b)) free.push(b);
    if (free.length < blocksNeeded) throw new CpmError("disk full");
    const recordsPerEntry = 128 * this.extentsPerEntry;
    const entryCount = Math.max(1, Math.ceil(records / recordsPerEntry));
    const slots = [];
    for (let i = 0; i < this.entries && slots.length < entryCount; i += 1) if (this.entry(i)[0] === 0xe5 || reusable.has(i)) slots.push(i);
    if (slots.length < entryCount) throw new CpmError("directory full");
    // No capacity check below this point can fail.
    this.erase(name, user);
    free.forEach((b, k) => {
      const chunk = padded.subarray(k * this.blockBytes, (k + 1) * this.blockBytes);
      this.data.set(chunk, b * this.blockBytes);
    });
    const blocksPerEntry = this.pointers;
    for (let n = 0; n < entryCount; n += 1) {
      const e = this.entry(slots[n]);
      e.fill(0);
      e[0] = user;
      e.set(key, 1);
      if (readOnly) e[9] |= 0x80;
      if (system) e[10] |= 0x80;
      const inEntry = Math.min(recordsPerEntry, records - n * recordsPerEntry);
      const lastLocal = inEntry === 0 ? 0 : Math.floor((inEntry - 1) / 128);
      const extent = n * this.extentsPerEntry + lastLocal;
      e[12] = extent & 0x1f;
      e[14] = extent >> 5;
      e[15] = inEntry === 0 ? 0 : inEntry - lastLocal * 128;
      const blocks = free.slice(n * blocksPerEntry, (n + 1) * blocksPerEntry);
      blocks.forEach((b, k) => {
        if (this.wide) {
          e[16 + 2 * k] = b & 0xff;
          e[17 + 2 * k] = b >> 8;
        } else e[16 + k] = b;
      });
    }
    return { records, blocks: free.length, entries: entryCount };
  }

  freeBytes() {
    return (this.d.dsm + 1 - this.usedBlocks().size) * this.blockBytes;
  }

  /** Structural check of the directory; returns a list of problems. */
  verify() {
    const problems = [];
    try {
      this.usedBlocks();
    } catch (e) {
      problems.push(e.message);
    }
    // Gaps between entries are legal: random writes leave them. Each entry
    // must be the only one for its group of logical extents, have a record
    // count of at most 128, and hold no block beyond the records it claims.
    const recordsPerBlock = this.blockBytes / RECORD;
    for (const f of this.list()) {
      const groups = new Set();
      for (const e of f.entries) {
        const group = Math.floor(e.extent / this.extentsPerEntry);
        if (groups.has(group)) problems.push(`${f.user}/${f.name}: two directory entries for extent group ${group}`);
        groups.add(group);
        if (e.rc > 128) problems.push(`${f.user}/${f.name}: extent ${e.extent} has record count ${e.rc}`);
        const records = (e.extent % this.extentsPerEntry) * 128 + Math.min(e.rc, 128);
        const slots = Math.ceil(records / recordsPerBlock);
        for (const [k] of e.slots) {
          if (k >= slots) problems.push(`${f.user}/${f.name}: extent ${e.extent} has a block in slot ${k}, beyond its ${records} records`);
        }
      }
    }
    return problems;
  }
}
