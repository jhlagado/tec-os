#!/usr/bin/env node
// tecvol: create, inspect and edit TEC-OS SD containers.
//
//   tecvol create IMAGE --volume G1M:SYSTEM:A [--volume G8M:WORK:B:ro] [--align N] [--drives N]
//                (more than 8 volumes, or --drives, makes a format 1.1 card;
//                :wb after the drive writes that volume behind, one at most,
//                and not with :ro)
//   tecvol info IMAGE
//   tecvol verify IMAGE
//   tecvol dir IMAGE [DRIVE] [--user N]
//   tecvol put IMAGE DRIVE FILE [CPMNAME] [--user N] [--text] [--ro] [--sys] [--force]
//   tecvol get IMAGE DRIVE CPMNAME [OUTFILE] [--user N] [--text]
//   tecvol era IMAGE DRIVE CPMNAME [--user N] [--force]
//                (put over, or era of, a file with the read-only attribute is
//                refused, as TEC-OS refuses it, unless --force is given)
//   tecvol recipe RECIPE.json IMAGE
//   tecvol install IMAGE DEVICE --yes
//
// Every change is written to a temporary file beside IMAGE and renamed over
// it only after the result validates. TEC-OS and the PC must not change the
// same card at the same time.

import { readFileSync, writeFileSync, renameSync, existsSync, openSync, writeSync, closeSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createContainer, parseContainer, volumePayload, findVolume } from "./lib/container.mjs";
import { CpmVolume } from "./lib/cpmfs.mjs";
import { buildRecipe } from "./lib/recipe.mjs";

function usage(message) {
  if (message) console.error(`tecvol: ${message}`);
  console.error("usage: tecvol create|info|verify|dir|put|get|era|recipe|install ... (see tools/tecvol.mjs)");
  process.exit(2);
}

/** V as a whole number from LO to HI in decimal digits, or the usage line naming OPTION: checked before any change. */
function whole(option, v, lo, hi) {
  if (!/^\d{1,8}$/.test(v ?? "") || Number(v) < lo || Number(v) > hi) usage(`${option} ${JSON.stringify(v ?? "")}: a whole number ${lo} to ${hi}`);
  return Number(v);
}

function parseArgs(argv) {
  const args = [];
  const opts = { volume: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--volume") opts.volume.push(argv[++i]);
    else if (a === "--user") {
      const v = argv[++i]; // an integer 0 to 15, checked before any change (KE-152)
      if (!/^\d{1,2}$/.test(v ?? "") || Number(v) > 15) usage(`--user ${JSON.stringify(v ?? "")}: a user number 0 to 15`);
      opts.user = Number(v);
    }
    else if (a === "--align") opts.align = whole("--align", argv[++i], 1, 0xffffff); // a positive count of blocks (D4)
    else if (a === "--drives") opts.drives = whole("--drives", argv[++i], 1, 4); // 1 to 4 drives (D4)
    else if (a === "--text") opts.text = true;
    else if (a === "--ro") opts.ro = true;
    else if (a === "--sys") opts.sys = true;
    else if (a === "--yes") opts.yes = true;
    else if (a === "--force") opts.force = true; // a read-only file written over or erased (KE-AR10)
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

export { buildRecipe, fileFetcher };

export function openVolume(image, info, drive) {
  const v = findVolume(info, drive);
  return { v, fs: new CpmVolume(volumePayload(image, v), v.g, { readOnly: v.readOnly }) };
}

function parseVolumeSpec(spec) {
  const [geometry, label, mount, ...flags] = spec.split(":");
  for (const f of flags) if (f !== "ro" && f !== "wb") usage(`unknown volume flag :${f}`);
  return { geometry, label, mount: mount || undefined, readOnly: flags.includes("ro"), writeBehind: flags.includes("wb") };
}

/** Fetch a recipe file from a URL or a path relative to the recipe. */
function fileFetcher(recipeDir) {
  return async (ref) => {
    if (/^https?:\/\//.test(ref)) {
      const response = await fetch(ref);
      if (!response.ok) throw new Error(`${ref}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }
    return new Uint8Array(readFileSync(resolve(recipeDir, ref)));
  };
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
      saveImage(imagePath, createContainer(opts.volume.map(parseVolumeSpec), { align: opts.align, drives: opts.drives }));
      break;
    }
    case "info":
    case "verify": {
      const { image, info } = openImage(imagePath);
      let problems = 0;
      console.log(`container: format 1.${info.minor}, ${info.containerBlocks} blocks (${info.containerBlocks * 512} bytes), ${info.volumes.length} volume(s)${info.drives ? `, ${info.drives} drive(s) wanted` : ""}`);
      for (const v of info.volumes) {
        const fs = new CpmVolume(volumePayload(image, v), v.g, { readOnly: v.readOnly });
        const issues = fs.verify();
        problems += issues.length;
        // A block given twice or past DSM leaves the free space unknown: verify
        // has it as a problem line, and the volumes after this one are still
        // listed (KE-AR12).
        let free;
        try {
          free = `${fs.freeBytes()} bytes free`;
        } catch {
          free = "free unknown";
        }
        console.log(
          `  ${v.drive ?? "-"}: ${v.label.padEnd(11)} id ${v.id} ${v.g.name} start ${v.start} ` +
            `${v.readOnly ? "ro" : "rw"}${v.writeBehind ? " wb" : ""} ${fs.list().length} file(s), ${free}`,
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
      fs.write(name ?? basename(file).toUpperCase(), readFileSync(file), { user, text: opts.text, readOnly: opts.ro, system: opts.sys, force: opts.force });
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
      if (fs.erase(name, user, { force: opts.force }) === 0) usage(`${name} not found`);
      saveImage(imagePath, image);
      break;
    }
    case "recipe": {
      const [, recipePath, out] = args;
      if (!out) usage("recipe needs RECIPE.json IMAGE");
      const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
      saveImage(out, await buildRecipe(recipe, fileFetcher(dirname(resolve(recipePath)))));
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
