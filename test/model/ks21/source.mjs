// The development loop's program, X.ASM: a few lines that print a line,
// then tables and comments to bring the source to the size asked for, as a
// program's own data and notes would. TAS assembles it to X.COM.

export function source(bytes) {
  const head = [
    "; X: prints a line and returns, for KS21's development loop.",
    "",
    "BDOS    EQU     $0005",
    "",
    "        ORG     $0100",
    "        LD      DE,MSG",
    "        LD      C,9",
    "        JP      BDOS",
    "",
    'MSG:    DB      "X OK",13,10,"$"',
    "",
  ];
  const lines = [...head];
  for (let i = 0; lines.join("\r\n").length < bytes - 200; i += 1) {
    lines.push(`; Table ${i}: eight bytes of a pattern, kept for the program's later use.`);
    lines.push(`TAB${i}:  DB      ${Array.from({ length: 8 }, (_, k) => (i * 8 + k) & 0xff).join(",")}`);
  }
  return Buffer.from(lines.join("\r\n") + "\r\n\x1a", "latin1");
}
