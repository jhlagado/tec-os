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

A successful assembly is useful only with the matching map and media.
The map must label the instructions in that ROM and card programs must
use interfaces the ROM supplies. TEC-OS writes the image, symbol map and
memory census together. Media preparation then checks map provenance and
ROM size and hash against the census (`tools/build.mjs:275-325`,
`tools/media.mjs:181-195`).

[Chapter 6](06-cards-on-the-pc.md) supplies the host setup for card tools.
Building the system also requires the pinned assembler host below.

## Prepared tools and selected assembler

Preparation supplies two groups of inputs. Node.js 20 or later runs the
host tools and `npm ci` installs locked dependencies. `npm run inputs`
prepares Thorium TED.COM and TAS.COM plus Baza's BAZA.COM, BAZA.RTL
and BOUNCE.BAS. It also fetches MON-3's `MON3.BIN` and thirteen program
and library sources. Only tests read those MON-3 inputs when comparing
`MON3.SVC` with the original (`test/inputs.json:3-193`,
`docs/mon3.md:13-16`, `docs/mon3.md:360-367`).

The current product build selects TAS for every assembly: main ROM,
board diagnostics, `GLCD.SVC`, `SHELL.SVC`, `DEMO.COM`, `MON3.SVC` and test
programs and services. The starter supplies HELLO3.ASM as source.
`TAS HELLO3 HELLO3.BIN` builds its binary on the guest before MON3 runs it.
The build has no atom-z80 dependency or alternate assembler selection. Historical trees from before the TAS
ROM build require manual atom-z80 0.3.7 installation
(`package.json:14-29`, `tools/build.mjs:344-350`,
`tools/media.mjs:197-231`, `README.md:91-102`).

Binary and host pins are checked independently. TAS.COM is pinned to
Thorium `3d1e2c0ea5269e1dfa4138671fab850c158f1670` and its prepared host
to `3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689`. The source README's
Build and test procedure creates a temporary host, installs locked
dependencies and verifies it before moving it to `.inputs/tas-host`.
Repeating preparation validates an existing host. Checks cover the runner,
lock file, locked Z80 runtime and 10,343-byte TAS binary
(`tools/lib/tas-rom.mjs:10-11`, `test/inputs.json:4-13`).

This TAS takes several statements on a line and rejects a line with more
than 128 characters of code, as
[Chapter 2](02-make-a-small-program.md#several-statements-on-a-line)
describes. TEC-OS source uses a statement per line within
that limit. The ROM, `GLCD.SVC`, `MON3.SVC`, `DEMO.COM`, `HELLO3.BIN`
and test programs therefore retain their earlier `dbee66a` assembly bytes (`docs/compatibility.md:226`). ROM maps assign a statement to each source line. The build therefore
rejects a `\` outside quotes and comments in ROM source
(`tools/lib/tas-d8.mjs:105-121`,
`tools/lib/tas-d8.mjs:155-157`).

Selection uses an explicit `TAS_COM`, `TED_COM`, `BAZA_COM`, `BAZA_RTL`
or `BOUNCE_BAS` first, followed by `.inputs/NAME`, then legacy sibling
files in `../thorium/dist/`, `../baza/dist/` or `../baza/examples/`
(`README.md:81-90`). Every selected file must match size and SHA-256.
Empty overrides or mismatched binaries stop the operation rather than
falling through (`tools/lib/pins.mjs:10-48`). Input preparation can fetch
a pinned copy when only the sibling is absent or stale. The temporary
download is verified before replacement (`tools/inputs.mjs:37-65`).

Assembler-host selection uses `TECOS_TAS_HOST` or defaults to
`.inputs/tas-host`. An empty override fails. Assembly consumes prepared
local files and performs no downloads (`tools/lib/tas-rom.mjs:77-109`).
With preparation complete, `npm run build` produces the TAS-built main
ROM. `npm run diag` assembles `DIAG.HEX` and `DIAG.BIN` for MON-3 at
`4000h`. `npm run media` prepares distribution files (`package.json:14-23`,
`tools/diag.mjs:1-9`, `tools/build.mjs:344-350`). Chapter 28 explains
using the diagnostics.

## Generated configuration, geometry and font

Generated files keep host definitions and ROM declarations consistent.
Before writing them, the build validates the font, retained originals and
complete notices (`tools/build.mjs:344-350`, `tools/lib/font-package.mjs:8-21`).
It writes `config.asm`, `format.asm`, `geom.asm` and `font.asm` under
`src/gen/`. The first two contain equates and the last two contain ROM
data, each marked as generated (`tools/build.mjs:62-137`).

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

The host reads that same JSON through `tools/lib/format.mjs`.
`geometryInfo` requires 64 records per track, no reserved tracks, zero
`CKS` and allocation vectors no larger than 256 bytes. It checks block
size, `EXM`, directory allocation, payload and record-count consistency
(`tools/lib/format.mjs:9-40`). Shared definitions prevent offset drift.
They do not make ROM and host validation identical, as
[Chapter 18](18-card-blocks-and-volumes.md) explains.

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

## Source order and reserved RAM

Assembly order distinguishes declarations from emitted image bytes.
`src/rom.asm` contains the complete include sequence:

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

The first four includes establish names before use. `abi.inc` defines
published interface addresses and numbers. Generated configuration and
format files supply equates. `layout.asm` names ports, latch values,
page-zero fields and fixed RAM locations (`src/rom.asm:7-10`,
`src/layout.asm:9-100`).

RAM declarations also precede the ROM origin. `ram.asm` first selects
`WSBASE` and reserves variables and stacks with unfilled `DS`. These
addresses are not initial data to copy from ROM. Its second origin is
`RAMBIOS+BIOSLEN`, placing upper state after the 51-byte BIOS table
(`src/ram.asm:1-18`, `src/ram.asm:291-304`). The build interprets TAS-map
reservations before extracting the ROM extent
(`tools/lib/tas-d8.mjs:203-208`, `tools/lib/tas-d8.mjs:259-299`).

`reset.asm` then selects `ORG $C000`. `abi.asm`, four data files and
routine files follow. Consecutive includes keep each CCP, BDOS and volume
routine group together in the image (`src/rom.asm:12-45`).
[Chapter 15](15-state-and-memory.md) explains the declared workspace's
lifetimes independently of assembly order.

## Two passes to place the workspace

Workspace placement must satisfy a fixed upper boundary despite changing
stack and variable declarations. It ends immediately below the RAM BIOS
table at `BF00h`. The build obtains its size from an assembled label
rather than duplicating the declaration count (`tools/build.mjs:216-231`).

A probe assembly starts with `WSBASE = 8000h`. Its real `BDOSRME` label
minus `8000h` gives size. Subtracting that size from `BF00h` gives the
final base. The build regenerates configuration, assembles again and
checks reported `WSBASE`. Missing markers, equates masquerading as labels
and invalid extents stop placement (`tools/build.mjs:218-231`).

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

These TAS checks validate constructed artifacts. They establish neither
runtime behaviour nor physical-board qualification.

## Image regions and their addresses

The resulting ROM has a fixed 16 KiB extent at `C000h–FFFFh`. Reset
and numbered-call entries occupy its beginning, followed by read-only data
and code. Unused space forms a final gap (`src/reset.asm:1-13`,
`src/abi.asm:9-14`, `src/rom.asm:1-17`, `src/end.asm:1-4`):

| Addresses | Bytes | Region |
| --- | ---: | --- |
| `C000h–C002h` | 3 | Reset jump |
| `C003h–C00Ah` | 8 | ROM interface |
| `C00Bh–C5D5h` | 1,483 | Read-only data |
| `C5D6h–FBCFh` | 13,818 | Code |
| `FBD0h–FFFFh` | 1,072 | Free |

In the cited build, 15,312 of 16,384 bytes are used. The complete hash is
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`
(`docs/memory-map.md:1-32`). Census regions use exclusive ends while the
lookup table prints the final occupied address (`tools/build.mjs:275-290`).

At `C000h`, `JP RSTENT` transfers control into the code, at `C5D6h`. The interface at `C003h` contains `TNA`, major 5, minor 1 and a
jump at `C008h` to `SVCDSP`. Its exclusive end is `C00Bh`
(`src/reset.asm:12-13`, `src/abi.asm:9-14`). The boot overlay and entry path
are explained in [Chapter 16](16-reset-and-boot.md).

Read-only data spans `ROMDATA` through exclusive `ROMCODE`. It groups
BIOS jumps, keyboard tables, command names and handlers, BDOS dispatch,
numbered services, geometry, font and messages under their consumer source
names. For example, cache message `CWMSG` contains `Write lost`
(`src/tables.asm:1-14`, `src/tables.asm:38-146`, `src/text.asm:92-96`).
Cold boot copies the BIOS jumps to `BF00h` for execution through RAM
(`src/boot.asm:108-111`).

Routine bytes extend from `RSTENT` to `CODEEND` after the final include.
The remaining ROM is filled with `FFh` (`src/boot.asm:22-35`,
`src/end.asm:1-4`, `tools/build.mjs:231-234`). A mismatched symbol map
can place plausible labels over different instructions. Image, map and
census must therefore remain paired from the same build.

## Placement and interface checks

Before output publication, placement checks validate the assembled
relationships below. Missing symbols stop the build and placement failures
start with `placement check failed:` (`tools/build.mjs:194-202`):

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

The TPA check calculates layout without booting. `cardLayout` packs
vectors downward from `WSBASE`, using `floor(DSM / 8) + 1` bytes each,
then reserves the three-byte BDOS stub. Reference DSM values 511 and
2047 require 64 and 256 bytes, 320 total (`tools/build.mjs:204-213`).
That two-volume entry at `B985h` leaves 47,237 bytes from `0100h`, the
build line's reported TPA. Starter's four 256-byte slots instead give
entry `B6C5h` and 46,533 bytes. Memory map and media manifest describe
starter layout. A different build needs its own census and ceiling.

## Matching the ROM and media

The build publishes three matching files in `build/tecos/`:
`tecos.rom`, `tecos.d8.json` and `census.json`. The census records hash,
ROM regions, serial counts, RAM regions, card layout and stack extents
(`tools/build.mjs:275-323`). `tools/capture.mjs` locates labels through
the D8 file beside its selected ROM (`tools/capture.mjs:65-72`).

An existing distribution also receives those files, with the census
renamed `tecos.census.json`. Build updates existing manifest profile
figures but leaves card contents and programs for media preparation
(`tools/build.mjs:328-341`). After success it copies `FONT-NOTICES.txt`
into existing `dist/` (`tools/build.mjs:348-350`). `npm run media` then
prepares distribution outputs from the selected build
(`tools/media.mjs:181-222`).

Media preparation validates the font package before preparing or replacing
outputs (`tools/media.mjs:181-182`). It checks that the map was
generated by TAS, then checks ROM length and SHA-256 against the census.
It assembles GLCD.SVC, SHELL.SVC, DEMO and MON3.SVC with TAS. Recipe
preparation also requires valid pinned TED, TAS, BAZA.COM, BAZA.RTL and
BOUNCE.BAS (`tools/media.mjs:181-231`). HELLO3 is supplied as source only.
At the CP/M prompt, `TAS HELLO3 HELLO3.BIN` builds its flat image with
`ORG 4000h` for MON-3 to load (`test/programs/hello3.asm:1-8`). For GLCD.SVC, SHELL.SVC and MON3.SVC, the TAS service writer compares
flat assemblies at `0100h` and `0200h`. It checks headers and relative
symbols then packs relocation data (`tools/lib/tas-distribution.mjs:6-59`). The distribution
COM writer checks DEMO's declared zero-filled buffers
(`tools/lib/tas-distribution.mjs:21-74`).

The starter recipe requests four equal drive slots. SYSTEM is G1M on A, WORK is G8M on B and PROJECTS is G1M on C.
G1M volumes GAMES and SPARE remain unassigned. The logged drive is written
behind. Internal revision 14 is the only recipe. The web page builds this same card
so media no longer writes a separate page recipe.

A holds thirteen files. SHELL.SVC, GLCD and STARTUP supply resident
services and startup. TED, TAS and SAMPLE support assembly development.
BAZA, `BAZA.RTL`, TIMES and pinned BOUNCE.BAS supply the BASIC tools
and examples. DEMO.ASM is program source. MON3.SVC supplies MON-3 and
HELLO3.ASM its sample source. A generated HELLO3.BIN is a user file, so a
system-service upgrade preserves it on an existing saved card.

`STARTUP.CMD` holds two lines, `SHELL.SVC` and then the GLCD
installation line. Media still builds and checks DEMO.COM but writes it
beside the card's files, not onto the card, where `TAS DEMO` makes it. It
also writes a copy of MON3.SVC beside the ROM
(`tools/media.mjs:203-257`, `tools/media.mjs:273-281`,
`tools/lib/starter.mjs:10-22`).

Component entries record each
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

The final build line reports the reference TPA as well as ROM use:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
tecos: ROM 15312/16384 bytes, TPA $0100-$B984 (47237 bytes), sha256 ac86ad233696d22a
```

The displayed hash is a sixteen-digit prefix of full SHA-256
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`
(`tools/build.mjs:278`, `tools/build.mjs:358-361`).

## HELLO through TED and TAS

HELLO provides a small program for comparing the card and PC assembly
routes. Its intentional error and repair are separate from Chapter 2's
BANNER exercise. The complete source is:

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

The entry origin matches CCP loading at `0100h`. Function 9 reads the
string from `DE` until `$`, omitting the terminator. Bytes 13 and 10
produce the line ending. RET uses the return word placed by the CCP
(`src/cpm/bdos.asm:367-385`, `src/cpm/ccp.asm:454-471`). TAS produces
33 bytes.

The editor example places source on B while TED and TAS remain on A.
It uses PICO9918 at 80 columns. Saving the listing as `hello.asm` in the
repository root permits this separate starter-image copy:

```sh
cp dist/starter.img work.img
node tools/tecvol.mjs put work.img B hello.asm --text
```

At `A:SYSTEM>`, `CON PICO 80` selects 80 columns. `B:` changes the
working drive and `TED HELLO.ASM 7` positions the editor at CALL BDOS.
Inserting `1` at the line start creates an assembly error. `^T B` saves
and supplies the shell chain `A:TAS HELLO.ASM` followed by `A:TED`.
The PICO9918 displays the resulting diagnostic:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card work.img --board pico --screen 'CON PICO 80' B: '@start TED HELLO.ASM 7' '@press 1' $'@press \x14B' '@run 400'. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
B:WORK>A:TAS HELLO.ASM
HELLO.ASM:7:1: expected a label, instruction or directive

B:WORK>A:TED
```

The diagnostic identifies filename, line and column. TED reopens there
with the message on its status row. This screen retains the intervening
blank rows so that source and status positions can be compared:

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

The repair uses backspace because the matrix keyboard has no Delete key.
Right moves beyond `1` and `^H` removes it. `^T R` saves, assembles and
runs corrected HELLO. TED then waits for a key before redrawing:

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

A key restores TED at line 7 and `^Q` exits. DIR lists five B files.
TAS has written `HELLO.COM` and `HELLO.DBG` beside the source. After the
first successful build, `THOR.PRJ` supplies the source for build keys.
`THOR.SES` retains the work file and editing position. These are program
editing artifacts, separate from the ROM D8 map.

## HELLO assembled on the PC

PC assembly uses the same pinned TAS.COM through the prepared host.
`tools/lib/assemble.mjs` exposes `assembleProgram`, returning an image
for origin `0100h` (`tools/lib/assemble.mjs:1-30`). With `hello.asm` in
the repository root, the following writes `hello.com`:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' hello.asm hello.com
```

The resulting 33 bytes match card-side `TAS HELLO`. A trace beginning
`tecos ROM` appears on standard error. COM contains the raw binary for
origin `0100h`. Other Z80 assemblers can emit that form but number,
equate and string syntax can differ.

A separate image provides the test destination while preserving starter
as the source copy:

```sh
cp dist/starter.img work.img
node tools/tecvol.mjs put work.img B hello.com
```

`put` stores the name as `HELLO.COM` on B (`tools/tecvol.mjs:147-154`).
Physical-board use requires installing `work.img` to the card through
Chapter 6's `tecvol install` procedure. This host-model capture instead
boots the image and enters `B:`, DIR and HELLO:

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

The final blank line is produced by the CCP's program-return path
(`src/cpm/ccp.asm:90-96`).
