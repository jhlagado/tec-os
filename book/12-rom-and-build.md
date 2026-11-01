# 12. The ROM and its build

Checked against TEC-OS 98c6416.

TEC-OS is one 16 KiB image for the addresses `C000h–FFFFh`. This chapter
describes how that image is laid out, from the jump at its first byte to the
free space at its end, and how the build makes it: the source files and the
order ATOM assembles them in, the include files the build writes before it
assembles, the two assemblies that place the workspace, the checks the build
makes on the result, and the four names under which it writes the one image.

## The image from C000h

The ROM has five parts, in this order:

| Addresses | Bytes | Part |
| --- | ---: | --- |
| `C000h–C002h` | 3 | the reset jump |
| `C003h–C017h` | 21 | the table |
| `C018h–C33Ch` | 805 | the data |
| `C33Dh–F8CCh` | 13,712 | the code |
| `F8CDh–FFFFh` | 1,843 | free |

The figures are those of the build at commit 98c6416, which writes them to
`build/debug80/census.json` and, through `npm run media`, to the ROM table
in `docs/memory-map.md`. The used part, from `C000h` to the end of the code,
is 14,541 of the 16,384 bytes.

The first three bytes are a jump, `JP COLD` (`src/reset.asm:6`), to `C33Dh`,
the first byte of the code. Chapter 14 describes how the Z80 reaches it at
reset.

The table at `C003h` is the fixed interface for programs and drivers
(`src/abi.asm:7-21`). It starts with the signature `TNA` and the ABI's major
and minor version, 4 and 0, and goes on with a word, `0048h`, that points at
the console's columns and rows in page zero, then a jump to the hardware
services at `C00Ah`, a word that points at the count of MAIN regions at
`C00Dh`, and three more jumps: the mount service at `C00Fh`, the video
drivers' hook at `C012h` and the driver registry at `C015h`. Chapter 9
describes the table from a program's side and Chapter 20 the services
behind it. The table ends at `C018h`, where the data begins.

The data block runs from the label `ROMDATA` (`src/data.asm:6`) to
`ROMCODE` (`src/data3.asm:114`). It is spread over four files, `data.asm`,
`data2.asm`, the generated `gen/geom.asm` and `data3.asm`, which follow one
another in the assembly, and it holds the messages, the keyword strings, the
keyboard's tables, the container's name and disk parameters, the BDOS's
function table and the hardware services' table. Each group is headed by the
name of the source file whose code uses it, so `CWMSG`, the text
`Write lost`, sits under `cache.asm` (`src/data3.asm:108-109`). Apart from
the `RET` at `C01Dh`, described below, nothing in the block runs where it is.
The BIOS jump table `BIOSBAS` (`src/data.asm:20-36`) is in it as the source of
the copy that programs and the BDOS call, which Chapter 15 describes.

The block's first five bytes are the CCP's keyword `TYPE` and its zero
(`src/data.asm:11-12`), and the sixth, at `C01Dh`, is a `RET`
(`src/data.asm:13`). The `RET` is there for programs from the previous ABI.
ABI 3 had its mount service at `C01Dh`, and a card from that time can hold a
`MOUNT.COM` or `VOLS.COM` that calls `C01Dh` without testing the table; the
`RET` sends such a call straight back with nothing done
(`src/data.asm:8-10`). `TYPE` and its terminator are the five bytes that fill
the space between the table's end and that address.

The code starts at `COLD` and runs through every routine of TEC-OS, ending at
the label `CODEEND`, which `src/end.asm:2` defines after the last file. The
free space is the rest of the ROM, in one gap; the build fills it with
`FFh` (`tools/build.mjs:256-259`).

## The source files and their order

The ROM's source is in `src/`, and `src/rom.asm` is its top file. It holds
nothing but includes, and their order is the order of assembly
(`src/rom.asm:1-3`):

```asm
%INCLUDE "gen/config.asm"
%INCLUDE "gen/format.asm"
%INCLUDE "layout.asm"
%INCLUDE "ram.asm"
%INCLUDE "reset.asm"
%INCLUDE "abi.asm"
%INCLUDE "data.asm"
%INCLUDE "data2.asm"
%INCLUDE "gen/geom.asm"
%INCLUDE "data3.asm"
%INCLUDE "boot.asm"
```

The list goes on through `bios.asm`, `console.asm`, `term.asm`, `video.asm`,
`tms.asm`, `lcd.asm`, `sd.asm`, `vol.asm`, `diag.asm`, `cpm/ccp.asm`,
`cpm/bdos.asm`, `hwsvc.asm`, `xmove.asm`, `glcd.asm`, `cache.asm`,
`history.asm`, `prl.asm` and `drv.asm`, and ends with `end.asm`
(`src/rom.asm:4-33`).

The first four files emit no bytes. `gen/config.asm` and `gen/format.asm`
are equates, and so is `layout.asm`, which names the ports, the system
latch's values, TEC-OS's bytes in page zero and the fixed addresses in RAM
(`src/layout.asm:8-95`). `ram.asm` names the resident workspace: it sets
the origin to `WSBASE` and reserves each variable with `DS`, which defines
a label and moves the address on without emitting anything
(`src/ram.asm:6`, `src/ram.asm:9-186`); a second origin, at
`RAMBIOS+BIOSLEN`, places the state that sits above the RAM BIOS table
(`src/ram.asm:188-237`). Chapter 13 describes that memory. Only with
`reset.asm` and its `ORG $C000` (`src/reset.asm:5`) do bytes start, and
from there each file's bytes follow the last's.

That order is what makes the layout. The table follows the reset jump
because `abi.asm` follows `reset.asm`; the data follows the table because the
four data files come next; and the code follows the data because every file
after `data3.asm` is code. So a code file's routines are in the code block
and its strings and tables are in the data block, under a heading with the
file's name.

## The generated files

Before it assembles, the build writes three files into `src/gen/`, each
headed with a line saying it is generated and not to be edited
(`tools/build.mjs:63-139`).

`gen/config.asm` holds the settings that depend on the build. `WSBASE` is
the first byte of the resident workspace, which the build places as the next
section describes. `VERHI`, `VERLO` and `ROMVER` are the version, 0.1, which
the banner and the LCD's top row print from (`src/data.asm:17`,
`src/data2.asm:8`). The last five, `TXDLY`, `TXSTOP`, `RXDLY`, `RXHALF` and
`RXPOLL`, are the delay counts for the bit-banged serial port. The build
works them out from the CPU's clock, 4,000,000 Hz, and the baud rate, 4800,
using the T-states of the loops in `console.asm` (`tools/build.mjs:24-25`,
`tools/build.mjs:40-61`). At 98c6416 they are 49, 105, 50, 74 and 77. The
build stops with an error if a count would not fit in a byte. Chapter 15
explains the loops and the arithmetic behind the counts.

`gen/format.asm` and `gen/geom.asm` come from `format/format.json`, the one
definition of the card's container. It gives the container's name,
`TECOSVOL`, the sizes of the header and of a volume descriptor, the offset of
each field in both, the limits on the number of volumes and drives, and the
two geometries with their disk parameter blocks. `gen/format.asm` turns the
field offsets and limits into equates, such as `HCOUNT EQU 14` for the
volume count's offset in the header and `DMOUNT EQU 14` for the drive byte's
offset in a descriptor (`tools/build.mjs:82-116`). `gen/geom.asm` holds
bytes: the container's name as `FMTMAG`, a table `GEOTAB` with each
geometry's id, its payload in blocks and the address of its disk parameter
block, and the two blocks themselves, `DPB1` and `DPB2`
(`tools/build.mjs:117-137`). It is the one generated file included in the
data block. The same `format.json` is read by `tools/lib/format.mjs`, which
`tecvol` and the other tools on the PC use, so the ROM and the tools take the
container's layout from one file. `geometryInfo` there checks each geometry
before either uses it: 64 records a track, no reserved tracks and no check
vector, an allocation vector of at most 256 bytes, and an `EXM` and directory
blocks that match the block size and the number of directory entries
(`tools/lib/format.mjs:9-41`).
Chapter 18 describes the container.

## ATOM and the two assemblies

The assembler is ATOM, the npm package `atom-z80` at version 0.3.7. The
build calls it as a library: `assembleAtomProject` with `src/` as the root
and `rom.asm` as the entry, followed by `writeAtomD8` for the symbol map
(`tools/build.mjs:208-214`). `npm run build` runs `tools/build.mjs`.

The build assembles the ROM twice, because the workspace's position depends
on its size. The workspace runs up to the RAM BIOS table at `BF00h`, which
has a fixed address, so its first byte, `WSBASE`, is `BF00h` less the
workspace's size, and the size is known only after an assembly. The first
assembly is a probe, with `WSBASE` set to `8000h`; the build reads the
address of `BDOSRME`, the label at the workspace's end, and takes `8000h`
from it (`tools/build.mjs:244-248`). At 98c6416 the workspace is 1,448
bytes, so the second assembly has `WSBASE` at `B958h`
(`tools/build.mjs:249-251`).

The second assembly's output is the ROM. `materializeAtomGeneration` turns
it into bytes from `C000h`, filling every gap with `FFh`, and the build
copies them into a 16,384-byte array that is `FFh` everywhere else
(`tools/build.mjs:256-259`).

A separate module, `tools/lib/assemble.mjs`, assembles stand-alone programs
with the same assembler, at `0100h` for a `.COM` file
(`tools/lib/assemble.mjs:10-20`). `npm run media` uses it to build the
starter card's programs; the ROM's build does not.

## The build's checks

Between the second assembly and writing the image, the build checks the
result against the rules the layout depends on, and stops with
`placement check failed:` and the rule's text when one fails
(`tools/build.mjs:222-224`). The checks are:

- every byte the assembly emitted is at `C000h` or above, so that no part of
  the source puts bytes in RAM, and the image is at most 16 KiB
  (`tools/build.mjs:253-257`);
- `RESET` is at `C000h`, the table at `C003h`, the data block starts where
  the table ends, and the `RET` at `C01Dh` is a `C9h`
  (`tools/build.mjs:262-265`);
- the table, the data and the code are in that order, and the code ends
  within the ROM (`tools/build.mjs:266-267`);
- every address in `src/abi.inc`, the include file that programs and drivers
  assemble with, equals the address of the matching label in `abi.asm`, and
  every label there has an entry (`tools/build.mjs:145-151`, `tools/build.mjs:268`);
- the hardware services' numbers and status codes in `abi.inc` are the ones
  in `hwsvc.asm`, and their bits match the `CD` bits of `layout.asm`
  (`tools/build.mjs:155-165`);
- the PICO driver's table offsets in `abi.inc` name the right entries in each
  width of `PICO.DRV`, which the check builds (`tools/build.mjs:169-181`);
- `drivers/font.asm` is the font that `format/font5x7.txt` gives
  (`tools/build.mjs:185-187`);
- no `.asm` file in `src`, `drivers`, `diag` or `test/programs` names an
  address from `FF00h` to `FF27h`, where an older table was
  (`tools/build.mjs:190-197`);
- each driver's source reaches the ROM only through the names in `abi.inc`
  (`tools/build.mjs:200-206`);
- the RAM BIOS table is at `BF00h`, the workspace ends exactly there, the
  state above the table starts 51 bytes after it, at `SDBYTE`, and all of it
  ends by `C000h` (`tools/build.mjs:274-277`);
- the BIOS stack ends at or below the start of the CCP's workspace
  (`tools/build.mjs:278`);
- on the starter card the TPA is at least 45,830 bytes
  (`tools/build.mjs:280-281`).

The last check works out the TPA without running the ROM. `cardLayout`
follows the arithmetic that cold boot's `ALVINIT` uses, which Chapter 13
describes: the allocation vectors packed down from `WSBASE`, and the BDOS
entry jump below them (`tools/build.mjs:232-236`). For the starter card's two
volumes, a G1M with `DSM` 511 and a G8M with `DSM` 2047,
the vectors take 320 bytes and the entry is at `B806h`, which leaves 46,854
bytes from `0100h`.

## One image, four names

When the checks pass, the build writes three files into `build/<profile>/`:
`tecos.rom`, the image; `tecos.d8.json`, the symbol map in Debug80's D8
format, which `book/capture.mjs` reads to find TEC-OS's labels; and
`census.json`, the figures for the ROM's parts, the RAM's regions and the
stacks (`tools/build.mjs:283-331`).

The build has four profile names, `debug80`, `debug80t40`, `debug80g32`
and `board`, and they all name the same image (`tools/build.mjs:28-35`).
The PICO9918's width is set by the driver loaded at startup (Chapter 5), so
every board takes the same image. The build assembles the first profile and
copies its image and map to the other three, changing only the name and the
description in each census (`tools/build.mjs:335-349`). `npm run build`
prints one line for each:

```text
debug80: ROM 14541/16384 bytes, TPA $0100-$B805 (46854 bytes), sha256 59f01f21287f0d9b
debug80t40: ROM 14541/16384 bytes, TPA $0100-$B805 (46854 bytes), sha256 59f01f21287f0d9b
debug80g32: ROM 14541/16384 bytes, TPA $0100-$B805 (46854 bytes), sha256 59f01f21287f0d9b
board: ROM 14541/16384 bytes, TPA $0100-$B805 (46854 bytes), sha256 59f01f21287f0d9b
```

The hash is the first 16 hexadecimal digits of the image's SHA-256. `npm run
media` then copies each profile's three files to `dist/` as
`tecos-<profile>.rom`, `tecos-<profile>.d8.json` and
`tecos-<profile>.census.json` (`tools/media.mjs:183-188`), and writes
`docs/memory-map.md` from the `debug80` census. The four ROM files in `dist/`
have the same SHA-256,
`59f01f21287f0d9b1b6dd30b3fbe8df5f1971a14b9bb033715c90bd592d95932`, and the
names are kept so that anything that reads a ROM by its profile's name still
has a file to read.
