# KS48 fixture dispositions

The 734 historical names remain unchanged. Names mentioning cold 80 describe
the historical assertion. Their new assertion or explicit selection is recorded
here. The case-level inventory is fixture-audit.json.

- test/lib/fixtures.mjs keeps the public test helper width argument/default 80.
  With no STARTUP, 80 and 32 now write their explicit width. An existing STARTUP
  still suppresses fixture injection. The helper is not raw-default evidence.
- pico.test's at helper now selects every requested width explicitly. Its
  80/40/32 scroll, screen, graphics and ownership loops keep all three modes.
- pico.test's claimed width refusal/version-2 case explicitly starts at 80,
  preserving its refused 40 request and old width assertions.
- pico.test's direct VRAM name-table case explicitly starts at 80, preserving
  its 1000h table and 80-column extent.
- console.test's historical default-80 name explicitly selects 80 and keeps
  its register, directory layout and 80-character wrapping checks.
- ks39.test's historical reset-to-80 name now checks cold 40 after reset. Its
  explicit 40/32 selections and warm preservation remain unchanged.
- pico.test's browser cases now expect an explicit 80 line. The selected 40
  line, colon transfer, non-display chain and idempotence checks remain. The
  read-only and full-directory cases still attempt a write and preserve the
  original card. The unchanged full-directory card cold-boots at 40.
- test/model/ks42/starter.mjs explicitly selects 80 after actual starter boot
  to retain its historical route. The new qualification workflow separately
  boots the actual starter at raw 40 and explicitly selects 80 on the card.
- TED's 80/40/32 edit/reopen cases retain explicit width arguments. Its old
  PICO round uses the legacy80 fixture and remains genuinely 80. Its absent
  debugger simulation stays historical and supplies no TDB acceptance.
- Existing startup cases, serial cases, GLCD geometry, historical gates and
  screen workload fixtures keep their original purpose. They do not become
  default-width proofs.

compact-display.test constructs Machine directly on a card whose only file is
ROWS.TXT, checks cold40 and rejects a forced CON PICO40 startup as raw proof.
It separately covers explicit startup40/80. The fixed font/native/notice and
all-six-transition tests use the production artifacts. The source-only host
mapping test also rejects the old implicit80 omission through its real mapping
entrypoint before any native product measurement.

The first focused check also exposed two console fixtures. The no-file banner
case now requests cold40 so it retains the banner without an injected startup.
The DIR40 case expects the actual six files and 1004K free, with no incidental
STARTUP.CMD. The PISTART header now states cold40 and both changed instructions
keep the existing inline comment column.

The separate masking.test board(cols) helper constructs Machine directly. Its
old cols!==80 branch is removed. It now writes CON PICO for every requested
width before asserting PIWID and observing interrupt discipline. A search of
all test/source helpers found no remaining cold80 omission outside the
intentional host-helper mutation control. stacks.test uses withDisplay; TED
uses boot; pico's at loop and masking's board loop now explicitly select80.
The new raw/default and transition helpers construct Machine without a hidden
width fixture. Diagnostic ROM tests program their own diagnostic80 mode.

The first complete qualification found KG24(c)'s original-font golden in
GLCD's twenty-command workload. The proposed repair keeps glcd-screens.json
byte-exact. A separate historical-only workload uses a checked disposable ROM
copy with just the original FONT span restored. TPA and CONOUT-stack readings
keep their own unmodified-production workload. Other board() calls also stay
on production input. The fixed-font GLCD alias validator gains old-font and
wrong-font rejection on actual A-cell pixels. The proposal awaits independent
source review and allocation; no corrected workload has run.
