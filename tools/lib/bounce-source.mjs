import assert from "node:assert/strict";
import { pinnedBytes } from "./pins.mjs";

const changes = [
  ["40 REM tone beeps and the font gives its address",
    "40 REM tone beeps and the font gives one glyph's rows"],
  ["50 DEF CALL vi = ROM 3: DEF CALL bp = ROM 4: DEF CALL ft = ROM 15",
    "50 DEF CALL vi = ROM 3: DEF CALL bp = ROM 4: DEF CALL gl = ROM 17"],
  ['170 CALL ft: f = REG("HL"): CALL vw, hl = 256, de = f, bc = 768',
    '170 g$ = "12345678": FOR c% = 32 TO 127: CALL gl, b = c%, hl = g$: CALL vw, hl = 256 + 8 * (c% - 32), de = g$, bc = 8: NEXT'],
];

// Adapt the font access in an LF source.
// Validate every complete line before
// replacing any of them. The caller's
// bytes and all other lines stay intact.
export function adaptBounce(raw) {
  const text = raw.toString("latin1");
  assert.ok(!/[\r\x1a]/.test(text), "BOUNCE source must be LF text without a CP/M terminator");
  const lines = text.split("\n");
  const positions = changes.map(([before]) => {
    const matches = lines.flatMap((line, at) => line === before ? [at] : []);
    assert.equal(matches.length, 1, `BOUNCE adaptation requires exactly one complete line ${before.split(" ")[0]}`);
    return matches[0];
  });
  for (const [i, [, after]] of changes.entries()) lines[positions[i]] = after;
  return Buffer.from(lines.join("\n"), "latin1");
}

// Check the upstream input's whole-file
// pin before adapting its font calls.
// The result is LF text. Media creation
// adds CRLF and the CP/M terminator.
export function bounceSource(root) {
  return adaptBounce(pinnedBytes(root, "BOUNCE.BAS"));
}
