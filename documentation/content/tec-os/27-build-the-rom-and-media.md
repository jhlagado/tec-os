---
title: Build the ROM and media
parent: TEC-OS
nav_order: 27
nav_group: "Inside TEC-OS"
---

# 27. Build the ROM and media

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A ROM and its symbol map must describe the same addresses. Card programs
must use the interfaces supplied by that ROM. TEC-OS produces the image,
map and memory census together. Media preparation checks the selected map
generator and the ROM size/hash against the census
(`tools/build.mjs:275-325`, `tools/media.mjs:181-195`).

The host setup in [Chapter 6](06-cards-on-the-pc.md) is the starting point.
The build adds the pinned assembler host described below.

## Prepared tools and selected assembler

The repository requires Node.js 20 or later. `npm ci` installs its locked
host dependencies and `npm run inputs` prepares the application inputs.
These are TED.COM and TAS.COM from Thorium and
BAZA.COM, BAZA.RTL and BOUNCE.BAS from Baza. The same step also fetches MON-3's ROM, `MON3.BIN`, and thirteen of MON-3's
program and library sources, which only the tests read: they compare
`MON3.SVC` with MON-3 itself (`test/inputs.json:3-193`,
`docs/mon3.md:13-16`, `docs/mon3.md:360-367`).

TAS is the only assembler. It builds the main ROM, the board diagnostics,
`GLCD.SVC`, `SHELL.SVC`, `DEMO.COM` and `MON3.SVC`,
and the tests' programs and services. The starter supplies HELLO3.ASM;
`TAS HELLO3 HELLO3.BIN` builds its binary on the guest before MON3 runs it. atom-z80 is not a dependency, and no
build selects another assembler. A tree from before TAS built the ROM needs
atom-z80 0.3.7 installed by hand
(`package.json:14-29`, `tools/build.mjs:344-350`,
`tools/media.mjs:197-231`, `README.md:91-102`).

`TAS.COM` is pinned to Thorium
`3d1e2c0ea5269e1dfa4138671fab850c158f1670`. Its prepared host is from
`3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689`. The source repository's
`README.md`, under Build and test, supplies the setup procedure. It prepares
a temporary host, installs that host's locked dependencies and verifies it
before moving it to `.inputs/tas-host`. Repeating setup validates an
existing host. The checks cover the runner, lock file, locked Z80 runtime
and the 10,343-byte TAS executable (`tools/lib/tas-rom.mjs:10-11`,
`test/inputs.json:4-13`).

This TAS takes several statements on a line and rejects a line with more
than 128 characters of code, as
[Chapter 2](02-make-a-small-program.md#several-statements-on-a-line)
describes. TEC-OS's own sources keep one statement to a line and none is
that long, so the ROM, `GLCD.SVC`, `MON3.SVC`, `DEMO.COM`,
`HELLO3.BIN` and the test programs assemble to the same bytes as under the
earlier `dbee66a` (`docs/compatibility.md:226`). The ROM's map gives
each source line one statement, so the build rejects a ROM source line that
holds a `\` outside quotes and comments
(`tools/lib/tas-d8.mjs:105-121`,
`tools/lib/tas-d8.mjs:155-157`).

The input selection order is an explicit `TAS_COM`, `TED_COM`, `BAZA_COM`,
`BAZA_RTL` or `BOUNCE_BAS` then `.inputs/NAME` then the legacy sibling file
under `../thorium/dist/`, `../baza/dist/` or `../baza/examples/`
(`README.md:81-90`).
The selected file must match its size and SHA-256. An empty override,
invalid local file or wrong selected binary stops the operation. Selection
does not fall through to another candidate after a mismatch
(`tools/lib/pins.mjs:10-48`). Input preparation may fetch a pinned local
copy when only the legacy sibling is missing or stale. It verifies the
temporary download before replacing the local input
(`tools/inputs.mjs:37-65`).

`TECOS_TAS_HOST` selects the prepared host, otherwise `.inputs/tas-host`
is used. An empty host override is an error. Assembly reads local prepared
files and does not download them (`tools/lib/tas-rom.mjs:77-109`).
After preparation, `npm run build` constructs the main ROM, `npm run diag`
assembles the board diagnostics, `DIAG.HEX` and `DIAG.BIN` for MON-3 to load
at `4000h`, and `npm run media` prepares the distribution
(`package.json:14-23`, `tools/diag.mjs:1-9`). Chapter 28 describes
the diagnostics. `npm run build` always uses TAS (`tools/build.mjs:344-350`).

## Image regions and their addresses

The ROM occupies `C000h–FFFFh`, exactly 16 KiB. Its fixed beginning contains
the reset jump followed by the numbered-call interface. Read-only data and
code follow, with a single free gap at the end (`src/reset.asm:1-13`,
`src/abi.asm:9-14`, `src/rom.asm:1-17`, `src/end.asm:1-4`). The image has
these regions:

| Addresses | Bytes | Region |
| --- | ---: | --- |
| `C000h–C002h` | 3 | Reset jump |
| `C003h–C00Ah` | 8 | ROM interface |
| `C00Bh–C5D5h` | 1,483 | Read-only data |
| `C5D6h–FBCFh` | 13,818 | Code |
| `FBD0h–FFFFh` | 1,072 | Free |

Its used extent is 15,312 of 16,384 bytes. Its SHA-256 is
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`
(`docs/memory-map.md:1-32`). The census stores each
region's start and exclusive end while the table above prints the last
occupied address (`tools/build.mjs:275-290`).

At `C000h`, `JP RSTENT` transfers control into the code, at `C5D1h`. The interface at `C003h` contains `TNA`, major 5, minor 1 and a
jump at `C008h` to `SVCDSP`. Its exclusive end is `C00Bh`
(`src/reset.asm:12-13`, `src/abi.asm:9-14`). The boot overlay and entry path
are explained in [Chapter 16](16-reset-and-boot.md).

The data region starts at `ROMDATA` and ends at `ROMCODE`. It contains
the BIOS jump table, keyboard tables, command names and handlers, BDOS
function table, numbered-service table, container geometry, font and
messages. Group headings name the source whose routines use each item.
For example, `CWMSG` contains `Write lost` under the `cache.asm` heading
(`src/tables.asm:1-14`, `src/tables.asm:38-146`, `src/text.asm:92-96`).
The BIOS jumps in this region execute through the RAM copy made at
`BF00h` during cold boot (`src/boot.asm:108-111`).

Code extends from `RSTENT` to the label `CODEEND` after the last included
file. The build fills the remaining image bytes with `FFh`
(`src/boot.asm:22-35`, `src/end.asm:1-4`, `tools/build.mjs:231-234`).
A map from a different ROM can assign valid-looking labels to the wrong
instructions so the ROM, map and census belong to the same build.

## Source order and reserved RAM

`src/rom.asm` includes the files in assembly order. The complete include
listing is:

```asm
	%INCLUDE	"abi.inc"
	%INCLUDE	"gen/config.asm"
	%INCLUDE	"gen/format.asm"
	%INCLUDE	"layout.asm"
	%INCLUDE	"ram.asm"
	%INCLUDE	"reset.asm"
	%INCLUDE	"abi.asm"
	%INCLUDE	"tables.asm"
	%INCLUDE	"gen/geom.asm"
	%INCLUDE	"gen/font.asm"
	%INCLUDE	"text.asm"
	%INCLUDE	"boot.asm"
	%INCLUDE	"bios.asm"
	%INCLUDE	"console.asm"
	%INCLUDE	"keyboard.asm"
	%INCLUDE	"term.asm"
	%INCLUDE	"video.asm"
	%INCLUDE	"tms.asm"
	%INCLUDE	"pico.asm"
	%INCLUDE	"lcd.asm"
	%INCLUDE	"sd.asm"
	%INCLUDE	"vol.asm"
	%INCLUDE	"volsvc.asm"
	%INCLUDE	"volutil.asm"
	%INCLUDE	"cpm/ccp.asm"
	%INCLUDE	"cpm/ccpfile.asm"
	%INCLUDE	"cpm/ccpmut.asm"
	%INCLUDE	"cpm/ccpcmd.asm"
	%INCLUDE	"cpm/bdos.asm"
	%INCLUDE	"cpm/bdosfile.asm"
	%INCLUDE	"cpm/bdosrec.asm"
	%INCLUDE	"cpm/bdosfn.asm"
	%INCLUDE	"cpm/bdoslog.asm"
	%INCLUDE	"cpm/bdoscon.asm"
	%INCLUDE	"services.asm"
	%INCLUDE	"cache.asm"
	%INCLUDE	"loader.asm"
	%INCLUDE	"end.asm"
```

The first four included files define equates. `abi.inc` supplies the same
interface addresses and service numbers used by programs. Configuration
and format equates come from generated files. `layout.asm` names ports,
latch values, page-zero state and fixed RAM addresses
(`src/rom.asm:7-10`, `src/layout.asm:9-100`).

`ram.asm` declares resident workspace before the reset origin. Its first `ORG`
is `WSBASE`. Unfilled `DS` declarations reserve addresses for variables and
stacks. They are RAM declarations, not initial data that cold boot copies from
the ROM. The second origin is `RAMBIOS+BIOSLEN`, placing the upper state after
the 51-byte RAM jump table (`src/ram.asm:1-18`, `src/ram.asm:291-304`). The
build interprets reservations through the TAS map and extracts the ROM extent
after them (`tools/lib/tas-d8.mjs:203-208`, `tools/lib/tas-d8.mjs:259-299`).

`reset.asm` then sets `ORG $C000`. `abi.asm` follows its jump then the
four data files and finally the routine files. The CCP, BDOS and volume
routines each occupy consecutive included files. Their bytes remain together in the image (`src/rom.asm:12-45`). [Chapter 15](15-state-and-memory.md)
explains the workspace lifetimes separately from these address declarations.

## Generated configuration, geometry and font

Before generating files or assembling, the build validates the selected font,
its retained original inputs and complete notices
(`tools/build.mjs:344-350`, `tools/lib/font-package.mjs:8-21`).
It then writes four included files before assembly: `config.asm`,
`format.asm`, `geom.asm` and `font.asm` under `src/gen/`. The first two
supply equates and the last two supply ROM data. Each has a generated-file
heading (`tools/build.mjs:62-137`).

`config.asm` defines `WSBASE`, version values `VERHI`, `VERLO`, `ROMVER`
and serial delay counts. The inspected version is 0.1, printed in the boot
banner and LCD top row (`src/text.asm:12`, `src/text.asm:65`).
The serial calculation uses 4,000,000 Hz and 4,800 baud with the instruction
costs of the transmit, receive and polling loops. It produces `TXDLY`,
`TXSTOP`, `RXDLY`, `RXHALF` and `RXPOLL`. Their values are 49, 105,
50, 70 and 77.
A count outside 1–255 raises an error (`tools/build.mjs:26-28`,
`tools/build.mjs:39-76`). [Chapter 17](17-console-paths.md) explains their
bit-level timing scope.

`format/format.json` defines `TECOSVOL`, the header and descriptor sizes,
field offsets, volume and drive limits and both DPBs. `gen/format.asm`
turns these into equates. `HCOUNT EQU 14` and `DMOUNT EQU 14` refer to
fields in different structures. `gen/geom.asm` emits `FMTMAG`, `GEOTAB`
and `DPB1`/`DPB2`. Each geometry-table entry has an id, payload length
and DPB address (`format/format.json:2-58`, `tools/build.mjs:79-134`).

The host tools read the same JSON through `tools/lib/format.mjs`.
`geometryInfo` checks 64 records per track, zero reserved tracks and `CKS`,
a maximum 256-byte allocation vector and consistency of block size, `EXM`
and directory allocation. It also bounds payload and record counts
(`tools/lib/format.mjs:9-40`). Shared definitions prevent different field
offsets, though the host and ROM still perform different validation checks.
[Chapter 18](18-card-blocks-and-volumes.md) explains those boundaries.

`FONT` comes from the selected TEC Compact data in `format/font5x7.txt`.
Its 96 characters from `20h` through `7Fh` have eight rows each, for 768 bytes.
Each row has five pixels in bits 7–3. The parser requires a unique header
for every code from `20h` through `7Fh`. It requires eight rows per character
and rejects malformed or misplaced pixel data before generating `DB` lines
(`tools/lib/font.mjs:9-47`).
The font package checks SHA-256 identities for the selected font, both
retained original inputs and the complete `format/FONT-NOTICES.txt`
(`tools/lib/font-package.mjs:8-21`). The notices record the derivative's
sources, edits and limits of the original glyph attribution
(`format/FONT-NOTICES.txt:1-47`).

The font occupies `C193h–C492h`. PICO accesses
`FONT` by label and GLCD obtains its address through numbered service 15
(`src/pico.asm:253-260`, `src/services.asm:510-517`,
`drivers/glcd.asm:60-64`). The tests use the same font parser
(`test/lib/machine.mjs:10-11`).

## Two passes to place the workspace

The workspace must end immediately below the RAM BIOS table at `BF00h`.
Its size depends on the declarations and stack sizes so the build obtains
that size from an assembled label (`tools/build.mjs:216-231`).

The probe assembly uses `WSBASE = 8000h`. Its map must contain a real label
named `BDOSRME`. Subtracting `8000h` gives the workspace size. The final
base is `BF00h` minus that size. The build regenerates configuration at the
final base, assembles again and checks that the reported `WSBASE` agrees.
An absent marker, an equate substituted for the marker or an invalid extent
stops this placement (`tools/build.mjs:218-231`).

The TAS path stages the included sources under unambiguous CP/M names.
It rejects an include escaping the source root, repeated includes,
unsupported statements and a missing real workspace marker. Its conversion checks
TDBG origin, extent, checksum, padding, source definitions and emission
positions before extracting ROM bytes. It also validates RAM reservations
against their allowed extent (`tools/lib/tas-rom.mjs:16-69`,
`tools/lib/tas-d8.mjs:13-45`, `tools/lib/tas-d8.mjs:136-182`,
`tools/lib/tas-d8.mjs:203-275`). The resulting D8 map records source files,
labels and segments
(`tools/lib/tas-d8.mjs:277-299`).

TAS is the only backend. These checks inspect constructed artifacts. They do
not establish a runtime result or a board qualification.

## Placement and interface checks

A failed placement rule raises `placement check failed:` followed by its
reason. Missing map symbols also stop the build (`tools/build.mjs:194-202`).
Before writing the outputs, the build checks these properties:

- The ROM byte extent fits within 16 KiB. `RESET` is at `C000h` and the
  interface is at `C003h`. The data starts exactly at the interface's end.
  Data and code have valid order, with exclusive `CODEEND` at or below
  `10000h`
  (`tools/build.mjs:231-241`).
- The interface contains `TNA`, version 5.1 and `JP SVCDSP`, with an
  eight-byte extent. `SVCFMT` equals the PC writer's format constant.
  Every `SVTAB` target is in the code and interface device bits equal their
  `CONDEV` definitions (`tools/build.mjs:143-155`).
- PICO table offsets name the intended entries in `PITPL`. Debugger-visible
  places have their declared offsets in `PIBLK`
  (`tools/build.mjs:157-174`).
- Service sources in `drivers/` and `svc*.asm` files in `test/programs/`
  pass the ROM-literal interface check. The checked set must include
  `drivers/glcd.asm` and `test/programs/svcdemo.asm`
  (`tools/build.mjs:176-187`). This is a check of specific hexadecimal
  spellings, not proof about every possible expression
  (`tools/lib/svc.mjs:17-24`).
- `RAMBIOS` is `BF00h` and `BDOSRME` equals it. `SDBYTE` follows the
  51-byte BIOS table. Upper state ends by `C000h` and the BIOS stack ends
  no higher than the CCP workspace (`tools/build.mjs:245-249`).
- The starter transient program area (TPA) has at least 45,830 bytes
  (`tools/build.mjs:271-273`).

The last check is arithmetic, not a boot. `cardLayout` packs allocation
vectors down from `WSBASE` using `floor(DSM / 8) + 1` bytes each then
subtracts three bytes for the BDOS entry. The two-volume reference card's `DSM` values 511
and 2047 give 64 and 256 bytes for 320 together
(`tools/build.mjs:204-213`). That reference entry is `B985h`, leaving 47,237
bytes from `0100h`, the TPA printed by the build line. The starter instead
reserves four 256-byte slots, with its bare entry at `B6C5h`, 46,533 bytes.
The generated memory map and media manifest report the starter's layout. Another build must
supply its own census instead of copying that ceiling.

## Matching the ROM and media

The main build writes `build/tecos/tecos.rom`, `tecos.d8.json` and
`census.json`. The census includes the ROM's SHA-256, used/free regions,
serial counts, RAM regions, card-layout figures and stack extents
(`tools/build.mjs:275-323`). `tools/capture.mjs` reads the D8 file beside
the selected ROM to locate labels (`tools/capture.mjs:65-72`).

When `dist/` exists, the build also copies the ROM, map and census there,
renaming the last to `tecos.census.json`. It updates an existing manifest's
profile figures. It does not rebuild the card or its program files at that
point (`tools/build.mjs:328-341`). After the build succeeds it also copies
`FONT-NOTICES.txt` into an existing `dist/` (`tools/build.mjs:348-350`).
`npm run media` prepares those outputs from the selected build
(`tools/media.mjs:181-222`).

Media preparation validates the font package before preparing or replacing
outputs (`tools/media.mjs:181-182`). It checks that the map was
generated by TAS, then checks ROM length and SHA-256 against the census.
It assembles GLCD.SVC, SHELL.SVC, DEMO and MON3.SVC with TAS and validates
pinned TED, TAS, BAZA.COM, BAZA.RTL and BOUNCE.BAS before preparing the recipe
(`tools/media.mjs:181-231`). HELLO3 is supplied as source only. At the CP/M
prompt, `TAS HELLO3 HELLO3.BIN` builds its flat image with `ORG 4000h` for
MON-3 to load (`test/programs/hello3.asm:1-8`). The TAS service writer compares
flat assemblies at `0100h` and `0200h`, checks their header and relative
symbols and packs the relocation data, for GLCD.SVC, SHELL.SVC and
MON3.SVC (`tools/lib/tas-distribution.mjs:6-59`). The distribution
COM writer checks DEMO's declared zero-filled buffers
(`tools/lib/tas-distribution.mjs:21-74`).

The starter recipe requests four equal drive slots. It contains SYSTEM as
G1M on A, WORK as G8M on B and PROJECTS as G1M on C, with G1M volumes
GAMES and SPARE unassigned. The logged drive is written behind. This is the
only card recipe, at internal revision 14: the web
page builds the same card, so media no longer writes a page recipe. A holds
thirteen files: SHELL.SVC, GLCD, STARTUP, TED, the SAMPLE assembly
source, the TIMES BASIC source, TAS, BAZA, BAZA's runtime library
`BAZA.RTL`, the BASIC game BOUNCE.BAS pinned from Baza, DEMO's source
DEMO.ASM, MON3.SVC and HELLO3.ASM. The generated HELLO3.BIN is a user
file, so an existing saved card keeps it during a system-service upgrade. `STARTUP.CMD` holds two lines, `SHELL.SVC` and then the GLCD
installation line. Media still builds and checks DEMO.COM but writes it
beside the card's files, not onto the card, where `TAS DEMO` makes it. It
also writes a copy of MON3.SVC beside the ROM
(`tools/media.mjs:203-257`, `tools/media.mjs:273-281`,
`tools/lib/starter.mjs:10-22`). Component entries record each
file's size and SHA-256. Assemblies and recipe construction finish before
the output replacement begins (`tools/media.mjs:258-266`). Output
files are replaced individually after those preparation checks. The
distribution also receives `FONT-NOTICES.txt` as a companion to its
artifacts, separate from the thirteen card files
(`tools/media.mjs:277`).

Media also writes `docs/memory-map.md` and refreshes the ROM-space spans
in `docs/rom-services.md` from the census (`tools/media.mjs:46-65`,
`tools/media.mjs:282-284`). The image profile is `tecos`. Any other command-line
profile name is rejected (`tools/build.mjs:30-33`, `tools/build.mjs:353-366`).
The same image supports the detected board devices. A responding PICO9918
with the Matrix switch enabled starts at 40 columns. Explicit 80, 40 and
32-column selections remain available while GLCD uses its card driver
(`src/pico.asm:19-68`, `src/pico.asm:70-125`,
`tools/lib/starter.mjs:15-22`).

`npm run build` ends with this line:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
tecos: ROM 15312/16384 bytes, TPA $0100-$B984 (47237 bytes), sha256 ac86ad233696d22a
```

Its printed hash is the first sixteen hexadecimal digits of SHA-256
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`
(`tools/build.mjs:278`, `tools/build.mjs:358-361`).

## HELLO through TED and TAS

The HELLO example connects the two assembly routes, the card's and the PC's.
It is a separate error and repair round from Chapter 2's BANNER exercise.
Its complete source is:

```asm
; HELLO: print a line and return to the CCP.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MESSAGE      ; the string, ended by $
        LD      C,9             ; BDOS function 9: print a string
        CALL    BDOS
        RET                     ; back to TEC-OS
MESSAGE:DB      "Hello from the TEC-1G",13,10,"$"
```

`ORG $0100` places the program at the CCP's load address. Function 9 prints
from `DE` until `$` without printing the terminator. The bytes 13 and 10
end the line. The final `RET` uses the return word installed by the CCP
(`src/cpm/bdos.asm:367-385`, `src/cpm/ccp.asm:454-471`). TAS assembles it
to 33 bytes.

The editor round uses HELLO saved on B with TED and TAS on A, on the
PICO9918 at 80 columns. With the source saved as `hello.asm` in the
repository root, these commands put it on B of a copy of the starter card:

```sh
cp dist/starter.img work.img
node tools/tecvol.mjs put work.img B hello.asm --text
```

At `A:SYSTEM>`, `CON PICO 80` sets 80 columns and `B:` selects B, where
`TED HELLO.ASM 7` opens at the `CALL BDOS` line.
Inserting `1` at its start and pressing `^T B` saves the source and chains
`A:TAS HELLO.ASM` followed by `A:TED`, a line the shell runs piece by piece.
These are the PICO9918's screens:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card work.img --board pico --screen 'CON PICO 80' B: '@start TED HELLO.ASM 7' '@press 1' $'@press \x14B' '@run 400'. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
B:WORK>A:TAS HELLO.ASM
HELLO.ASM:7:1: expected a label, instruction or directive

B:WORK>A:TED
```

The diagnostic gives the source filename, line and column. TED reopens
at that position and displays the message on its status row. The following screen includes the blank rows between the source and the
status row:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card work.img --board pico --screen 'CON PICO 80' B: '@start TED HELLO.ASM 7' '@press 1' $'@press \x14B' '@run 400'. Full screen; trailing empty rows omitted. -->
```text
; HELLO: print a line and return to the CCP.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MESSAGE      ; the string, ended by $
        LD      C,9             ; BDOS function 9: print a string
1        CALL    BDOS
        RET                     ; back to TEC-OS
MESSAGE:DB      "Hello from the TEC-1G",13,10,"$"














TED  HELLO.ASM    expected a label, instruction or directive  ^S Save  ^Q Quit
```

The matrix keyboard has no Delete key. Right moves the cursor past `1`
and `^H` removes it. `^T R` then saves, assembles and runs the corrected
source. TED waits for a key before redrawing:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card work.img --board pico --screen 'CON PICO 80' B: '@start TED HELLO.ASM 7' '@press 1' $'@press \x14B' '@run 400' $'@press \x1b[C' $'@press \x08' $'@press \x14R' '@run 600'. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
B:WORK>A:TAS HELLO.ASM
HELLO.COM written

B:WORK>A:TED

B:WORK>HELLO
Hello from the TEC-1G

B:WORK>A:TED
Press a key
```

A key restores TED at line 7 and `^Q` ends the editor. `DIR` then lists
five files on B. TAS wrote `HELLO.COM` and the debug file `HELLO.DBG` beside
the source. TED's
`THOR.PRJ` names the source for the build keys after the first good build.
`THOR.SES` stores the work file and saved editing position. These files belong to
the editor/assembler round, separate from the ROM's D8 map.

## HELLO assembled on the PC

The PC uses the same TAS as the card. `tools/lib/assemble.mjs` runs the
pinned TAS.COM on the host through the prepared TAS host described above,
and `assembleProgram` returns the image for origin `0100h`
(`tools/lib/assemble.mjs:1-30`). With the source saved as `hello.asm` in the
repository root, this command writes `hello.com`:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' hello.asm hello.com
```

It writes 33 bytes, the same as the card's `TAS HELLO`. The assembler prints a trace line beginning `tecos ROM` on
standard error. A COM file is the raw binary for origin `0100h`. Another
Z80 assembler can supply that form, though number, equate and string
syntax can differ.

The next commands put the program on a separate image, leaving the starter
image as the source copy:

```sh
cp dist/starter.img work.img
node tools/tecvol.mjs put work.img B hello.com
```

`put` names it `HELLO.COM` on B (`tools/tecvol.mjs:147-154`). On a board,
`tecvol install` writes
`work.img` to the card as described in Chapter 6. This host-model capture
boots that image and enters `B:`, `DIR` and `HELLO`:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card work.img B: DIR HELLO. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>DIR

HELLO   .COM     128
1 file, 128 bytes
8368128 free on B:WORK
B:WORK>HELLO
Hello from the TEC-1G

B:WORK>
```

The blank line before the command prompt comes from the CCP's program-return
path (`src/cpm/ccp.asm:90-96`).
