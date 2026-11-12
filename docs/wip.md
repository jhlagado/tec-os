# Release 1 status

This branch is the TEC-OS release 1 candidate in Origo's release roadmap
(P3: KD-258, KD-259, KD-262). It combines:

- the debugger-support interfaces (KS40);
- the shorter assembly comments;
- the bare-VDP boot fix (XR-04);
- the Compact font with 40 columns by default;
- the owner's 40-column `SAMPLE.ASM`;
- BASIC and TED's language support (KD-262): BAZA's `BAZA.COM` and
  `BAZA.RTL` from Baza `50dc512`, the sample `TIMES.BAS`, Baza's
  `BOUNCE.BAS` sprite game, steered by W, A, S and D or the arrow keys,
  and TED from Thorium `b69d544`, whose language table builds a `.BAS`
  with BAZA.
- One card (KD-278): the starter card is the Viewer's card too. It holds
  fifteen files: `BAZA.COM`, `BAZA.RTL`, `BOUNCE.BAS`, `DEMO.ASM`,
  `GLCD.SVC`, `HELLO3.ASM`, `HELLO3.BIN`, `MON3.SVC`, `MOUNT.COM`,
  `SAMPLE.ASM`, `SHELL.SVC`, `STARTUP.CMD`, `TAS.COM`, `TED.COM` and
  `TIMES.BAS`. `TAS DEMO` builds `DEMO.ASM` into the demo, and
  `MON3.SVC`, then `LOAD HELLO3.BIN` and `GO`, runs a MON-3 program that
  writes the LCD (KD-277).
- Several statements on a line (KD-275): TAS from Thorium `3d1e2c0` takes
  them with a `\` between. TEC-OS's own sources keep one statement a line.

The boot R1 policy is decided: with a PICO installed, real boot writes the
selected mode's R1 with the frame interrupt off (KD-258 D1). A ROM-owned
interrupt dispatcher is next-stage work (KD-259).

The generated ROM, maps and media are built from this source. The ROM is
`95467cae…`, 15,363 bytes used, and `docs/memory-map.md` and
`docs/rom-services.md` are generated from it. Strict test runs are recorded
in Origo. All evidence so far comes from emulation; a physical TEC-1G smoke
test is still owed before release 1 is declared, and KD-262 adds the D5
smoke test's BAZA build and run from TED, the book's BASIC page and the
Viewer's card. The viewer keeps its own
firmware pin and receiving checks.
