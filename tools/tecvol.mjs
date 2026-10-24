#!/usr/bin/env node
// tecvol: create, inspect and edit TEC-OS SD containers.
//
//   tecvol create IMAGE --volume G1M:SYSTEM:A [--volume G8M:WORK:B:ro] [--align N]
//   tecvol info IMAGE
//   tecvol verify IMAGE
//   tecvol dir IMAGE [DRIVE] [--user N]
//   tecvol put IMAGE DRIVE FILE [CPMNAME] [--user N] [--text] [--ro] [--sys]
//   tecvol get IMAGE DRIVE CPMNAME [OUTFILE] [--user N] [--text]
//   tecvol era IMAGE DRIVE CPMNAME [--user N]
//   tecvol recipe RECIPE.json IMAGE
//   tecvol install IMAGE DEVICE --yes
//
// Every change is written to a temporary file beside IMAGE and renamed over
// it only after the result validates. TEC-OS and the PC must not change the
// same card at the same time.

import { readFileSync, writeFileSync, renameSync, existsSync, openSync, writeSync, closeSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createContainer, parseContainer, volumePayload, findVolume } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";
import { format } from "./lib/format.mjs";

function usage(message) {
  if (message) console.error(`tecvol: ${message}`);
  console.error("usage: tecvol create|info|verify|dir|put|get|era|recipe|install ... (see tools/tecvol.mjs)");
  process.exit(2);
}

function parseArgs(argv) {
  const args = [];
  const opts = { volume: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--volume") opts.volume.push(argv[++i]);
    else if (a === "--user") opts.user = Number(argv[++i]);
    else if (a === "--align") opts.align = Number(argv[++i]);
    else if (a === "--text") opts.text = true;
    else if (a === "--ro") opts.ro = true;
    else if (a === "--sys") opts.sys = true;
    else if (a === "--yes") opts.yes = true;
    else if (a.startsWith("--")) usage(`unknown option ${a}`);
    else args.push(a);
  }
  return { args, opts };
}

/** Write bytes to path atomically, after they validate as a container. */
export function saveImage(path, image) {
  parseContainer(image);
  const tmp = resolve(dirname(path), `.${basename(path)}.tmp-${process.pid}`);
  writeFileSync(tmp, image);
  renameSync(tmp, path);
}

export function openImage(path) {
  const image = new Uint8Array(readFileSync(path));
  return { image, info: parseContainer(image) };
}

export function openVolume(image, info, drive) {
  const v = findVolume(info, drive);
  return { v, fs: new CpmVolume(volumePayload(image, v), v.g, { readOnly: v.readOnly }) };
}

function parseVolumeSpec(spec) {
  const [geometry, label, mount, flag] = spec.split(":");
  return { geometry, label, mount: mount || undefined, readOnly: flag === "ro" };
}

/** Fetch a recipe file from a URL or a path relative to the recipe. */
async function fetchFile(ref, recipeDir) {
  if (/^https?:\/\//.test(ref)) {
    const response = await fetch(ref);
    if (!response.ok) throw new Error(`${ref}: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(readFileSync(resolve(recipeDir, ref)));
}

/** Build a fresh container from a tecos-file-recipe-v1 document. */
export async function buildRecipe(recipe, recipeDir, fetcher = fetchFile) {
  if (recipe.schema !== "tecos-file-recipe-v1") throw new Error(`unsupported recipe schema ${recipe.schema}`);
  const image = createContainer(recipe.volumes.map((v) => ({ ...v, readOnly: false })));
  const info = parseContainer(image);
  for (const component of recipe.components) {
    for (const file of component.files) {
      const bytes = await fetcher(file.url, recipeDir);
      if (bytes.length !== file.bytes) throw new Error(`${file.name}: ${bytes.length} bytes, recipe says ${file.bytes}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== file.sha256) throw new Error(`${file.name}: SHA-256 mismatch`);
      const { fs } = openVolume(image, info, file.drive ?? "A");
      fs.write(file.name, bytes, { user: file.user ?? 0 });
    }
  }
  // Apply read-only flags last, so files can be written first.
  const header = image.subarray(0, format.blockBytes);
  let changed = false;
  recipe.volumes.forEach((v, i) => {
    if (v.readOnly) {
      header[format.header.descriptorsOffset + i * format.descriptor.bytes + format.descriptor.fields.flags.offset] |=
        format.descriptor.flags.readOnly;
      changed = true;
    }
  });
  if (changed) {
    const { headerChecksum } = await import("./lib/container.mjs");
    const sum = headerChecksum(header);
    header[format.header.fields.checksum.offset] = sum & 0xff;
    header[format.header.fields.checksum.offset + 1] = sum >> 8;
  }
  parseContainer(image);
  return image;
}

async function main(argv) {
  const { args, opts } = parseArgs(argv);
  const [cmd, imagePath] = args;
  if (!cmd) usage();
  const user = opts.user ?? 0;
  switch (cmd) {
    case "create": {
      if (!imagePath || opts.volume.length === 0) usage("create needs IMAGE and at least one --volume");
      if (existsSync(imagePath)) usage(`${imagePath} exists; remove it first`);
      saveImage(imagePath, createContainer(opts.volume.map(parseVolumeSpec), { align: opts.align }));
      break;
    }
    case "info":
    case "verify": {
      const { image, info } = openImage(imagePath);
      let problems = 0;
      console.log(`container: ${info.containerBlocks} blocks (${info.containerBlocks * 512} bytes), ${info.volumes.length} volume(s)`);
      for (const v of info.volumes) {
        const { fs } = openVolume(image, info, String(v.id));
        const issues = fs.verify();
        problems += issues.length;
        console.log(
          `  ${v.drive ?? "-"}: ${v.label.padEnd(11)} id ${v.id} ${v.g.name} start ${v.start} ` +
            `${v.readOnly ? "ro" : "rw"} ${fs.list().length} file(s), ${fs.freeBytes()} bytes free`,
        );
        for (const issue of issues) console.log(`     problem: ${issue}`);
      }
      if (cmd === "verify" && problems) process.exit(1);
      break;
    }
    case "dir": {
      const { image, info } = openImage(imagePath);
      const { fs } = openVolume(image, info, args[2] ?? "A");
      for (const f of fs.list({ user: opts.user })) {
        console.log(`${String(f.user).padStart(2)} ${f.name.padEnd(12)} ${String(f.bytes).padStart(8)}${f.readOnly ? " R/O" : ""}${f.system ? " SYS" : ""}`);
      }
      break;
    }
    case "put": {
      const [, , drive, file, name] = args;
      if (!file) usage("put needs IMAGE DRIVE FILE");
      const { image, info } = openImage(imagePath);
      const { fs } = openVolume(image, info, drive);
      fs.write(name ?? basename(file).toUpperCase(), readFileSync(file), { user, text: opts.text, readOnly: opts.ro, system: opts.sys });
      saveImage(imagePath, image);
      break;
    }
    case "get": {
      const [, , drive, name, out] = args;
      if (!name) usage("get needs IMAGE DRIVE CPMNAME");
      const { image, info } = openImage(imagePath);
      const { fs } = openVolume(image, info, drive);
      const bytes = fs.read(name, { user, text: opts.text });
      if (out) writeFileSync(out, bytes);
      else process.stdout.write(bytes);
      break;
    }
    case "era": {
      const [, , drive, name] = args;
      const { image, info } = openImage(imagePath);
      const { fs } = openVolume(image, info, drive);
      if (fs.erase(name, user) === 0) usage(`${name} not found`);
      saveImage(imagePath, image);
      break;
    }
    case "recipe": {
      const [, recipePath, out] = args;
      if (!out) usage("recipe needs RECIPE.json IMAGE");
      const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
      saveImage(out, await buildRecipe(recipe, dirname(resolve(recipePath))));
      break;
    }
    case "install": {
      const [, , device] = args;
      if (!device || !opts.yes) usage("install overwrites DEVICE from block 0; pass the device and --yes");
      const { image } = openImage(imagePath);
      const fd = openSync(device, "r+");
      try {
        writeSync(fd, image, 0, image.length, 0);
      } finally {
        closeSync(fd);
      }
      break;
    }
    default:
      usage(`unknown command ${cmd}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`tecvol: ${e.message}`);
    process.exit(1);
  });
}
