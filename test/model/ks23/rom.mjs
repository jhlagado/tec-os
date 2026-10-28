// KS23's model ROM: the product at a commit (b8c7214 by default) with
// CMDCOPY's section of src/cpm/ccp.asm replaced by a draft from this folder,
// built for debug80 in build/model-ks23/<name>/. COPY's bytes are counted as
// KG12 counts them: COPY's code to CMDCON (from CPNAME where a draft puts
// it first), the keyword, its dispatch (9) and the
// text from CPNOSRC to CONNAMS.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PRODUCT = resolve(HERE, "../../..");
export const BASE = process.env.KS23_BASE ?? "b8c7214";
const WORK = resolve(PRODUCT, "build/model-ks23");

const START = "; TEC-OS: COPY SOURCE DEST";
const END = "; TEC-OS: CON shows";

/** The product at BASE, with COPY's section from DRAFT (a file here) if given, built; its tree. */
export function tree(name, draft) {
  const dir = resolve(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execSync(`git archive ${BASE} | tar -x -C "${dir}"`, { cwd: PRODUCT });
  symlinkSync(resolve(PRODUCT, "node_modules"), resolve(dir, "node_modules"));
  if (draft) {
    const path = resolve(dir, "src/cpm/ccp.asm");
    const src = readFileSync(path, "utf8");
    const a = src.indexOf(START);
    const b = src.indexOf(END);
    if (a < 0 || b < a) throw new Error("ccp.asm: COPY's section not found");
    writeFileSync(path, src.slice(0, a) + readFileSync(resolve(HERE, draft), "utf8") + src.slice(b));
  }
  execSync("node tools/build.mjs debug80", { cwd: dir, stdio: "pipe" });
  return dir;
}

/** COPY's bytes in the debug80 build of DIR, as KG12 counts them. */
export function copyBytes(dir) {
  const d8 = JSON.parse(readFileSync(resolve(dir, "build/debug80/tecos.d8.json"), "utf8"));
  const at = (n) => {
    const s = d8.symbols.find((x) => x.name === n);
    if (!s) throw new Error(`no symbol ${n}`);
    return s.address ?? s.value;
  };
  // COPY's code runs from the first of its labels to CMDCON: the draft
  // puts its parse routines before CMDCOPY.
  const first = Math.min(...["CMDCOPY", "CPNAME"].map((n) => d8.symbols.find((x) => x.name === n)?.address ?? Infinity));
  const code = at("CMDCON") - first;
  const keyword = at("CCPKEY") - at("COPYKEY");
  const dispatch = 9;
  const text = at("CONNAMS") - at("CPNOSRC");
  const used = readFileSync(resolve(dir, "build/debug80/tecos.rom")).length;
  const free = at("ABITAB") - at("CODEEND");
  return { code, keyword, dispatch, text, total: code + keyword + dispatch + text, freeBelowFF00: free, romBytes: used };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const draft = process.argv[2];
  const dir = tree(draft ? draft.replace(/\.asm$/, "") : "base", draft);
  console.log(JSON.stringify(copyBytes(dir), null, 2));
  if (!existsSync(dir)) process.exit(1);
}
