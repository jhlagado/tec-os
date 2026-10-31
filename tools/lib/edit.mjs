// The pinned EDIT.COM tests the table for major version 3, and on any other
// falls back to its configured 80 x 24. Until Edit accepts major 4, the card and
// the tests take that binary with the one immediate byte changed, so that it keeps
// the shipped display's geometry. The hash says that it is the binary this offset
// was read from.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AT = 0xe8c; // the operand of CP 3 after LD A,(C006h)
const CODE = [0x3a, 0x06, 0xc0, 0xfe, 0x03];

/** EDIT.COM's bytes for ABI 4, from the pinned bytes. */
export function editForAbi4(bytes, root) {
  const pin = JSON.parse(readFileSync(resolve(root, "test/inputs.json"), "utf8")).inputs["EDIT.COM"].sha256;
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== pin) throw new Error(`EDIT.COM has sha256 ${got}, pinned ${pin}`);
  if (CODE.some((v, i) => bytes[AT - 4 + i] !== v)) throw new Error("EDIT.COM: no major test at the fixed offset");
  const out = Uint8Array.from(bytes);
  out[AT] = 4;
  return out;
}
