# Release 1 status

This branch is the TEC-OS release 1 candidate in Origo's release roadmap
(P3: KD-258, KD-259, KD-262). It combines:

- the debugger-support interfaces (KS40);
- the shorter assembly comments;
- the bare-VDP boot fix (XR-04);
- the Compact font with 40 columns by default;
- the owner's 40-column `SAMPLE.ASM`;
- BASIC and TED's language support (KD-262): BAZA's `BAZA.COM` and
  `BAZA.RTL` from Baza `747b9a7`, the sample `TIMES.BAS`, and TED from
  Thorium `b69d544`, whose language table builds a `.BAS` with BAZA. The
  starter card holds nine files; the Viewer's page card adds `DEMO.ASM`,
  which `TAS DEMO` builds into the demo, and Baza's `BOUNCE.BAS` sprite
  game. Whether `BOUNCE.BAS` also goes on the starter card is open.

The boot R1 policy is decided: with a PICO installed, real boot writes the
selected mode's R1 with the frame interrupt off (KD-258 D1). A ROM-owned
interrupt dispatcher is next-stage work (KD-259).

The generated ROM, maps and media are built from this source. The ROM is
`3ed68c47…`, 16,077 bytes, and `docs/memory-map.md` and
`docs/rom-services.md` are generated from it. Strict test runs are recorded
in Origo. All evidence so far comes from emulation; a physical TEC-1G smoke
test is still owed before release 1 is declared, and KD-262 adds the D5
smoke test's BAZA build and run from TED, the book's BASIC page and the
Viewer's card. The viewer keeps its own
firmware pin and receiving checks.
