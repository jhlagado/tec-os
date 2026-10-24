// Build a card from a tecos-file-recipe-v1 document. Runs in Node and in the
// browser: the caller supplies fetch(url) returning the file's bytes.

import { createContainer, headerChecksum, parseContainer, findVolume, volumePayload } from "./container.mjs";
import { CpmVolume } from "./cpmfs.mjs";
import { format } from "./format.mjs";

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch, verify and place every file; return the new container image. */
export async function buildRecipe(recipe, fetchFile) {
  if (recipe.schema !== "tecos-file-recipe-v1") throw new Error(`unsupported recipe schema ${recipe.schema}`);
  const image = createContainer(recipe.volumes.map((v) => ({ ...v, readOnly: false })));
  const info = parseContainer(image);
  for (const component of recipe.components) {
    for (const file of component.files) {
      const bytes = await fetchFile(file.url);
      if (bytes.length !== file.bytes) throw new Error(`${file.name}: ${bytes.length} bytes, recipe says ${file.bytes}`);
      if ((await sha256Hex(bytes)) !== file.sha256) throw new Error(`${file.name}: SHA-256 mismatch`);
      const v = findVolume(info, file.drive ?? "A");
      new CpmVolume(volumePayload(image, v), v.g).write(file.name, bytes, { user: file.user ?? 0 });
    }
  }
  // Read-only flags go on last, once the files are written.
  const header = image.subarray(0, format.blockBytes);
  recipe.volumes.forEach((v, i) => {
    if (v.readOnly) {
      header[format.header.descriptorsOffset + i * format.descriptor.bytes + format.descriptor.fields.flags.offset] |=
        format.descriptor.flags.readOnly;
    }
  });
  const sum = headerChecksum(header);
  header[format.header.fields.checksum.offset] = sum & 0xff;
  header[format.header.fields.checksum.offset + 1] = sum >> 8;
  parseContainer(image);
  return image;
}
