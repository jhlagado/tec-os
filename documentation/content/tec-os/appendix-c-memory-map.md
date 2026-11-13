---
title: C. Memory map
parent: TEC-OS
nav_order: 103
nav_group: "Reference"
---

# Appendix C. Memory map

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A memory address needs both a bank and a build identity. This reference
pairs the map of one build with the source contracts for each region.
[Chapter 11](11-memory-for-programs.md) explains the program's memory limits.
[Chapter 15](15-state-and-memory.md) explains resident state and its lifetime.

The address tables describe the `tecos` build at TEC-OS `c4ec0f4`, whose ROM
SHA-256 is
`a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1`. It is the
one image for every board. The starter card reserves four equal drive slots and mounts SYSTEM on A,
WORK on B and PROJECTS on C. Its startup file installs the shell; table rows
that describe the bare allocation layout explicitly exclude services. The resident workspace
addresses come from `build/tecos/tecos.d8.json`. Other builds need their own
symbol files for build-dependent addresses.

## The CPU's address space

The 64 KiB CPU address space contains fixed RAM, a bank window and ROM
(`src/layout.asm:1-7`):

| Addresses | Contents |
| --- | --- |
| `0000h–7FFFh` | Fixed RAM |
| `8000h–BFFFh` | EXPAND 0, replaced by EXPAND 1 while latch bit 2 is set |
| `C000h–FFFFh` | ROM |

At reset the first 2 KiB of ROM also appear at `0000h–07FFh`. The overlaid
jump enters `RSTENT` in ROM. Cold boot then sets latch bit 0 to remove the
overlay (`src/reset.asm:1-13`, `src/boot.asm:22-40`).
The starter card's layout with EXPAND 0 selected and no service loaded is:

| Addresses | Contents |
| --- | --- |
| `0000h–00FFh` | Page zero |
| `0100h–B6E8h` | Transient program area (TPA), 46,569 bytes |
| `B6E9h–BFFFh` | BDOS entry jump and resident workspace in EXPAND 0 |
| `C000h–FFFFh` | ROM |

TEC-OS writes the system latch at port `FFh` from its shadow at `0040h`,
`LATCHV`. The ordinary EXPAND 0 value is `01h`. With matrix Caps Lock on bit 7
is set, producing `81h`. Temporary EXPAND 1 accesses set bit 2 and restore the
shadow value afterwards (`src/layout.asm:19-28`, `src/abi.inc:302-305`,
`src/layout.asm:64-69`, `src/abi.inc:307-309`, `src/keyboard.asm:130-137`,
`src/cache.asm:21-41`). Warm boot writes `01h` before selecting its
resident stack (`src/boot.asm:131-136`).

The word at `0006h` is the exclusive top of the TPA. Without a resident service
it points to a three-byte BDOS entry stub below the allocation vectors.
`ALVINIT` packs those vectors down from `WSBASE` and reserves the jump below the
lowest vector (`src/boot.asm:536-634`). A format 1.1 card with a nonzero
drive count reserves 256 bytes for each requested drive. Otherwise each mounted
drive receives `(DSM >> 3) + 1` bytes. A service lowers `0006h` to its first
page during installation. `PZTOP` is updated when its pages are committed
(`src/loader.asm:337-350`, `src/loader.asm:499-504`).

These figures depend on the card and the services loaded:

| Card | Vectors | Word at `0006h` | TPA |
| --- | ---: | --- | ---: |
| Starter card, four reserved drive slots | 1,024 bytes | `B6E9h` | 46,569 bytes |
| Starter card with `GLCD.SVC` installed | 1,024 bytes | `B300h` | 45,568 bytes |
| Starter card after `STARTUP.CMD` installs `SHELL.SVC` | 1,024 bytes | `A700h` | 42,496 bytes |
| Starter card with `SHELL.SVC` and `GLCD.SVC` | 1,024 bytes | `A400h` | 41,728 bytes |
| Two-volume reference, no drives field, no service | 320 bytes | `B9A9h` | 47,273 bytes |

The shell takes fifteen pages, and its last page holds its 256-byte history ring (`docs/memory-map.md:8-22`,
`docs/compatibility.md:3-16`, `docs/shell.md:22-30`).

## The ROM

The ROM occupies these ranges:

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `C000h–C002h` | 3 | Reset jump, `JP RSTENT` |
| `C003h–C00Ah` | 8 | ROM table |
| `C00Bh–C5D0h` | 1,478 | Read-only data from `ROMDATA` up to `ROMCODE`, including `FONT` at `C193h–C492h` |
| `C5D1h–FA1Ah` | 13,386 | Code |
| `FA1Bh–FFFFh` | 1,509 | Unused |

That is 14,875 of the 16,384 bytes (`docs/memory-map.md:22-30`).

The CCP's four files occupy `DBB3h–E3BDh`, 2,059 bytes, from `CCPBAS`. The
BDOS's six files follow at `BDOSBAS`, `E3BEh–F198h`, 3,547 bytes (`src/rom.asm:31-40`).

The ROM copy of the BIOS jump table is data at `BIOSBAS`. Cold boot copies
its 17 jumps to `BF00h`. Calls use the RAM table, whose entries can be
replaced by resident hooks. Warm boot leaves that table intact
(`src/tables.asm:9-31`, `src/layout.asm:98-99`,
`src/boot.asm:108-111`).

## Page zero

These fixed addresses identify the current page-zero contracts
(`src/layout.asm:44-69`, `src/abi.inc:307-309`, `src/console.asm:54-65`):

| Address | Contents |
| --- | --- |
| `0000h` | `JP BF03h`, warm boot through the RAM BIOS table |
| `0003h` | IOBYTE. TEC-OS applies its console field in bits 0 and 1 |
| `0004h` | Current drive in bits 0–3 and user number in bits 4–7 |
| `0005h` | `JP` through the word at `0006h`, to the BDOS entry jump or lowest service page |
| `0008h–0037h` | Restart vectors 1–6. Each defaults to seven zeros followed by `RET`, unless a `JP` target is strictly above `PZTOP` |
| `0038h` | Restart 7 and mode 1 interrupt entry. Defaults to `EI`, `RETI` unless a qualifying `JP` remains |
| `0040h` | `LATCHV`, the system latch shadow |
| `0041h–004Fh` | Unused by TEC-OS. A `MON3.SVC` session holds them while it runs and gives them back at `EXIT` or warm boot |
| `0050h` | Load-drive byte. 0 means current drive, 1 means A and so on |
| `005Ch` | First default file control block (FCB) |
| `006Ch` | Second FCB, overlapping the first FCB's last 20 bytes |
| `0080h–00FFh` | Command tail and default DMA buffer |

Cold boot clears page zero. `PZINIT` writes the entry jumps and stub at cold
boot's end and on each warm boot. It leaves `0003h` and `0004h` unchanged
(`src/boot.asm:52-59`, `src/boot.asm:114-144`,
`src/boot.asm:300-315`). The restart sweep preserves the three bytes of
a qualifying jump and clears its remaining five bytes. A target equal to `PZTOP`
does not qualify. The default `EI`, `RETI` sequence at `0038h` is written only
when no qualifying jump remains there (`src/boot.asm:332-382`).

Service-page release clears the first byte of each claimed restart slot
before the sweep. Successful unload and failure cleanup that releases the
pages both use this rule. A failed `INIT` can retain its pages when a BIOS
hook still targets them so failure alone does not imply slot release
(`src/loader.asm:97-126`, `src/loader.asm:436-475`,
`src/loader.asm:520-540`).

The CCP records the drive/user byte for its command prompt. Before program
launch it writes both FCBs, then the command tail and default DMA address, then
the load-drive byte (`src/cpm/ccp.asm:306-324`,
`src/cpm/ccpcmd.asm:392-440`, `src/cpm/ccp.asm:454-471`). The
second FCB reaches `008Fh` so tail publication follows FCB parsing.

CP/M reserves `0040h–004Fh` for BIOS scratch. TEC-OS uses only `0040h`
there. It is the resident state byte read while EXPAND 1 hides the upper
workspace. Cold boot leaves the other 15 bytes zero. A `MON3.SVC` session
holds them while it runs: the latch stub its restarts pass through, GO's
return and a `RETN`. It gives them back at `EXIT` or warm boot. Console
state is above the RAM BIOS table (`src/layout.asm:64-69`,
`src/abi.inc:307-309`, `src/ram.asm:411-428`, `docs/memory-map.md:32-39`).

## The resident workspace

The following tables give every address and size on the starter card. A
row's clearing column names the boot sweeps that reach it. Other routines can still overwrite a retained field.

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `B6E9h–B6EBh` | 3 | BDOS entry jump, `JP BENTRY` |
| `B6ECh–BAEBh` | 1,024 | Four 256-byte allocation-vector slots |
| `BAECh–BCC9h` | 478 | BIOS disk state/buffers, PICO console block, mount scratch and terminal state |
| `BCCAh–BCF1h` | 40 | BIOS stack |
| `BCF2h–BE76h` | 389 | CCP state and stack |
| `BE77h–BEFFh` | 137 | BDOS state and stack |
| `BF00h–BF32h` | 51 | RAM BIOS table, 17 jumps |
| `BF33h–BFFFh` | 205 | SD, cache, keyboard, display, loader, startup, chain and console state plus remaining mount scratch |

The build places `WSBASE` so that the lower workspace ends immediately before
`BF00h`. Its upper span starts after the 51-byte RAM BIOS table at `BF33h`
(`tools/build.mjs:218-248`, `src/ram.asm:295-297`).
These spans have fixed addresses across cards. The allocation vectors below
`WSBASE`, at `BAECh`, vary with the card.

Cold boot clears the workspace from `WSBASE` up to but excluding `WSEND`.
Warm boot clears `CCPCLR` up to but excluding `BDOSRME`, then sets the DMA
address, command-buffer maximum and stack guard. It separately clears `BUFOK`
(`src/boot.asm:61-66`, `src/boot.asm:398-418`).
Those sweeps are `BAECh–BFFFh` and `BDBCh–BEFFh` respectively. Warm boot also writes retained fields outside
its clearing span, including `LATCHV` and `SVCBSY`
(`src/boot.asm:131-144`).

### The BIOS's block

The declarations are at `src/ram.asm:15-136`.

| Addresses | Bytes | Name | Contents | Cleared by |
| --- | ---: | --- | --- | --- |
| `BAECh` | 1 | `DSKCUR` | Selected BIOS drive | Cold boot |
| `BAEDh–BAF2h` | 6 | `DSKTRK`, `DSKSEC`, `DSKDMA` | Last track, sector and DMA address set through the BIOS | Cold boot |
| `BAF3h–BAF5h` | 3 | `BLKOFF`, `BLKSLOT` | Block within the volume and 128-byte record within that block | Cold boot |
| `BAF6h–BAF9h` | 4 | `BUFOK`, `BUFDRV`, `BUFBLK` | Validity flag, drive and block of the write-cleared key | Cold boot. Warm boot also clears `BUFOK` |
| `BAFAh–BB19h` | 32 | `DRVTAB` | Four drive entries, 8 bytes each | Cold boot |
| `BB1Ah–BB1Dh` | 4 | `DRVIDX` | Volume index + 1 for each drive, 0 for none | Cold boot |
| `BB1Eh–BB21h` | 4 | `DRVSLOT` | Vector slot per drive, 0 for none, 1 for 64 bytes or 2 for 256 | Cold boot |
| `BB22h–BB61h` | 64 | `DPHTAB` | Four 16-byte DPHs | Cold boot |
| `BB62h–BB63h` | 2 | `LOGINV` | BDOS logged-in drive vector | Cold boot |
| `BB64h–BBE3h` | 128 | `DIRBUF` | Shared directory buffer | Cold boot |
| `BBE4h–BBE5h` | 2 | `CSVDUM` | Unused check-vector placeholder | Cold boot |
| `BBE6h–BBE7h` | 2 | `STUBAD` | BDOS entry jump address | Cold boot |
| `BBE8h–BC46h` | 95 | `PIBLK` to `PIROWT` | PICO console table, width, registry record, pages, registers and row addresses | Cold boot |
| `BC47h` | 1 | `MNTCNT` | Mount/volume-service scratch count | Cold boot |
| `BC48h–BC67h` | 32 | `MNBUF` | Container header or descriptor copied from a cache line | Cold boot |
| `BC68h–BCB7h` | 80 | `LINEBUF` | Display-row scratch for terminal moves and LCD drive rows | Cold boot |
| `BCB8h–BCC5h` | 14 | `VPUTV` to `VFNV` | Seven display-table vectors | Cold boot |
| `BCC6h–BCC9h` | 4 | `VSTOP` to `CONMOD` | Scroll-region limits, PICO claim and applied console mode | Cold boot |
| `BCCAh–BCF1h` | 40 | `BSTKB` | BIOS stack up to exclusive top `BSTK` | Cold boot |

The write-cleared key identifies a block cleared for a new allocation rather
than read from the card. Clearing `BUFOK` prevents reuse of the old key.
A new type-2 write can still clear its block without a pre-read
(`src/bios.asm:298-358`).

### The CCP's block

The declarations are at `src/ram.asm:141-202`. `CCPCLR` is
`BDBCh`. The FCBs and command buffer below it survive
the warm clearing sweep for another chained piece.

| Addresses | Bytes | Name | Contents | Cleared by |
| --- | ---: | --- | --- | --- |
| `BCF2h–BD15h` | 36 | `CMDFCB` | Command FCB | Cold boot |
| `BD16h–BD39h` | 36 | `RENFCB` | Second FCB for `REN` and `COPY` | Cold boot |
| `BD3Ah` | 1 | `CMDBUF` | Function 10 maximum, 127 | Cold boot. Warm boot writes 127 |
| `BD3Bh` | 1 | `CMDLEN` | Command-line length | Cold boot |
| `BD3Ch–BDBBh` | 128 | `CMDTXT` | Retained command line | Cold boot |
| `BDBCh` | 1 | `BOOTDRV` | Drive selected for CCP entry | Cold and warm boot |
| `BDBDh–BDCBh` | 15 | `CMDSTRT` to `ERAALL` | Parser pointers and DIR, SAVE and ERA state | Cold and warm boot |
| `BDCCh–BE4Bh` | 128 | `LOADBUF` | CCP scratch record | Cold and warm boot |
| `BE4Ch–BE56h` | 11 | `STKGUARD` | CCP stack guard, `A5h` in each byte | Cold and warm boot. Warm boot then writes `A5h` |
| `BE57h–BE76h` | 32 | `CSTKBAS` | CCP stack up to exclusive top `CSTKTOP` | Cold and warm boot |

Retention of the line does not guarantee that it runs. Without the shell the
CCP runs a function 47 line whole. A failed warm-boot flush cancels the line,
writing 2 to `CHPOS` after dropping failed cache lines
(`src/cache.asm:266-300`, `src/cache.asm:624-640`).
[Chapter 22](22-chains-across-warm-boot.md) explains the other cancellation
paths.

### The BDOS's block

The declarations are at `src/ram.asm:209-288`. Warm boot clears this
whole block before setting the DMA address to `0080h`.

| Addresses | Bytes | Name | Contents | Cleared by |
| --- | ---: | --- | --- | --- |
| `BE77h–BE7Bh` | 5 | `OLDSP`, `ERRMODE`, `PARAM` | Caller SP, function 45 error mode and caller DE | Cold and warm boot |
| `BE7Ch–BE7Fh` | 4 | `COLUMN`, `LISTEN`, `PENDING`, `PENDCHR` | Console column, `^P` list-copy flag and pending-character flag/byte | Cold and warm boot |
| `BE80h–BE84h` | 5 | `LINPTR` to `HFLAG` | Line-input pointer and counts, and `HFLAG`, set for the shell's history line | Cold and warm boot |
| `BE85h–BE8Ah` | 6 | `CURDRV` to `DEFALV` | Bound/default drive and default DPB/vector pointers | Cold and warm boot |
| `BE8Bh` | 1 | `USERNO` | User number | Cold and warm boot |
| `BE8Ch` | 1 | `WRFLAG` | CCP-set flag for its disk reset | Cold and warm boot |
| `BE8Dh–BE8Eh` | 2 | `WARMV` | Drives whose allocation vectors need rebuilding to their mark | Cold and warm boot |
| `BE8Fh–BE90h` | 2 | `ROVEC` | Read-only drive vector | Cold and warm boot |
| `BE91h–BE92h` | 2 | `CURDMA` | DMA address | Cold and warm boot. Warm boot then writes `0080h` |
| `BE93h–BE9Ch` | 10 | `DPHPTR` to `XLTPTR` | Bound DPH, DPB, directory buffer, allocation vector and translation-table pointers | Cold and warm boot |
| `BE9Dh–BEC9h` | 45 | `CURTRK` to `DIRSEC` | Directory search, allocation scan and file-position state | Cold and warm boot |
| `BECAh–BEFFh` | 54 | `STKBASE` | BDOS stack up to exclusive top `STKTOP` | Cold and warm boot |

### Above the RAM BIOS table

The declarations are at `src/ram.asm:295-458`. These
addresses lie above the warm clearing span. Cold-only clearing therefore
describes storage lifetime, not an assurance that its value remains unchanged.
The history and the rest of the startup file are the shell's, so no field here
holds them. `CPEND` holds the pending block on a drive not logged, for the coalescing in
[Chapter 19](19-cache-and-persistence.md)
(`src/ram.asm:303-319`, `src/ram.asm:399-404`,
`docs/memory-map.md:60-69`).

| Addresses | Bytes | Name | Contents | Cleared by |
| --- | ---: | --- | --- | --- |
| `BF33h–BF3Dh` | 11 | `SDBYTE` to `SDXB` | SD addressing flag, big-endian argument, little-endian block address, last error and cache-transfer bank selector | Cold boot |
| `BF3Eh–BF40h` | 3 | `CNEXT` to `CIFF` | Replacement index, BIOS write type and saved interrupt flags | Cold boot |
| `BF41h` | 1 | `CANY` | Nonzero when a data line may be held behind on the logged drive | Cold boot |
| `BF42h` | 1 | `CPEND` | The coalesced pending block: its cache line plus one, 0 for none | Cold boot |
| `BF43h–BF49h` | 7 | `KBMASK` to `KBT2` | Matrix scan and pending arrow-sequence state | Cold boot |
| `BF4Ah–BF4Dh` | 4 | `PIVEC`, `GLVEC` | Console-table pointers, `PIBLK` for PICO or 0 when absent, and GLCD's table | Cold boot |
| `BF4Eh–BF51h` | 4 | `XMDST` to `MVREST` | MVCOPY source/destination banks and remaining byte count | Cold boot |
| `BF52h–BF53h` | 2 | `PZTOP` | Committed top restored to `0006h` by warm boot | Cold boot |
| `BF54h–BF55h` | 2 | `PRGCODE` | Function 108 program return code | Cold boot |
| `BF56h–BF5Ah` | 5 | `LOADTOP` to `SLDL` | Exclusive loaded-record end, last service-loader record and relocation delta | Cold boot |
| `BF5Bh–BF63h` | 9 | `SVCBSY` to `SVCRA` | Loader busy flag, registry head, lowest service page, generation, the shell's table `SHOWN`, failure code and INIT's A | Cold boot |
| `BF64h` | 1 | `STFLAG` | `FFh` during a startup line, 0 during a typed line | Cold boot |
| `BF65h` | 1 | `STPOS` | Startup state: 0 untried, 1 a record waits, `80h` done | Cold boot |
| `BF66h` | 1 | `CHPOS` | Bit 0 a function 47 line in `CMDTXT`, bit 1 the rest of the line dropped | Cold boot |
| `BF67h–BFE4h` | 126 | `HIFREE` | Unused | Cold boot |
| `BFE5h` | 1 | `RXFULL` | Nonzero while a console byte is pending in `RXCHAR` | Cold boot |
| `BFE6h` | 1 | `RXCHAR` | Pending console byte | Cold boot |
| `BFE7h` | 1 | `CONDEV` | Device/switch status and LCD recovery-word ownership bits | Cold boot |
| `BFE8h` | 1 | `VROW` | Terminal cursor row | Cold boot |
| `BFE9h` | 1 | `VCOL` | Terminal cursor column | Cold boot |
| `BFEAh` | 1 | `VWID` | Video-console columns, 0 for serial | Cold boot |
| `BFEBh` | 1 | `VHGT` | Video-console rows | Cold boot |
| `BFECh` | 1 | `ESCST` | Escape-parser state | Cold boot |
| `BFEDh` | 1 | `ESCP1` | First numeric escape parameter | Cold boot |
| `BFEEh` | 1 | `ESCP2` | Second numeric escape parameter | Cold boot |
| `BFEFh` | 1 | `KBLAST` | Last held matrix key, `FFh` for none. `abi.inc` publishes it for a service that scans the matrix, and the workspace label is `KBSLOT` (`src/abi.inc:311-318`) | Cold boot |
| `BFF0h` | 1 | `VATTR` | `80h` for reverse video | Cold boot |
| `BFF1h` | 1 | `VCURV` | 1 while the cursor cell is drawn reversed | Cold boot |
| `BFF2h–BFFFh` | 14 | `MNTBLK` to `MNTLN` | Remaining mount/volume-service scratch | Cold boot |

`CIFF` occupies one byte; `CANY` uses the byte after it. The CCP sets `HFLAG` to `FFh` while the shell's `LINE` entry reads
one line, so that line's function 10 call can use the history. `SHOWN` holds
the address of the shell's entry table, 0 with no shell. `CONDEV` combines switch, probe
and ownership state so its bits do not all prove device presence
(`src/ram.asm:229`, `src/ram.asm:382`, `src/ram.asm:315-323`,
`src/cpm/ccp.asm:251-280`,
`src/layout.asm:70-75`, `src/cpm/ccp.asm:156-158`). `SVCRA`
identifies a cause only when `SVCRC` is 1. Record-validation failure after
successful INIT sets it to 0 (`src/loader.asm:426-444`).
[Chapter 25](25-loading-and-removing-services.md) explains those load outcomes.

## EXPAND 1

These fixed bank addresses hold the cache (`src/layout.asm:32-42`,
`docs/memory-map.md:70-83`):

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `8000h–BBFFh` | 15,360 | 30 cache lines of 512 bytes |
| `BC00h–BC77h` | 120 | `CTAB`, four-byte card-block key per line, `FFFFFFFFh` when empty |
| `BC78h–BC7Fh` | 8 | Unused |
| `BC80h–BC9Dh` | 30 | `CDIRTY`, one dirty byte per line |
| `BC9Eh–BCFFh` | 98 | Unused |
| `BD00h–BFFFh` | 768 | Unused. The host model watches it so that a stray write fails |

The command history is in the shell's own pages, not in this bank
(`docs/shell.md:22-30`).

Cold boot clears the whole bank and then marks every cache key empty
(`src/boot.asm:235-252`). No BDOS or BIOS interface allocates a
program range there. Direct latch access can expose the bank but the
resident EXPAND 0 stacks disappear while it is selected. Cache
routines exclude maskable interrupts and restore the latch before any stack
operation (`src/bios.asm:379-446`, `src/sd.asm:469-574`,
`src/sd.asm:586-655`).

A jump to `0000h` with EXPAND 1 still selected reaches `BF03h` in that bank.
With its normally cleared unused bytes, execution continues through zeros
into the ROM at `C000h`. `RSTENT` distinguishes that entry from reset and
warm boot selects EXPAND 0 before setting its stack. Modified bank contents
can break that route. A program using the inherited stack also loses access
to its return word while EXPAND 1 is visible
(`src/boot.asm:22-40`, `src/boot.asm:131-136`,
`src/boot.asm:300-305`, `src/cpm/ccp.asm:464-471`).
[Chapter 16](16-reset-and-boot.md) explains the exit paths and their limits.

## The stacks

The stack reservations are defined by `BOOTSTK`, `BIOSSTN`, `CCPSTN` and
`BDOSSTN`
(`src/layout.asm:94`, `src/layout.asm:113-115`).

| Stack | Addresses | Bytes | Use |
| --- | --- | ---: | --- |
| Boot | Below `8000h` | | Cold boot until workspace clearing finishes |
| BIOS | `BCCAh–BCF1h` | 40 | Warm boot |
| CCP | `BE57h–BE76h` | 32 | CCP and a program's inherited stack, with `0000h` pushed at launch |
| BDOS | `BECAh–BEFFh` | 54 | BDOS functions and their BIOS calls, plus cold boot after workspace clearing |

Cold boot switches from `BOOTSTK` to `STKTOP` after clearing the workspace.
Console initialisation, banner, mount, drive listing and the diagnostic prompt
use that BDOS stack before the CCP starts. Diagnostic retries set `STKTOP`
again (`src/boot.asm:35-68`, `src/boot.asm:79-113`).
A BDOS call saves caller SP in `OLDSP`, sets SP to `STKTOP` and restores
caller SP on return (`src/cpm/bdos.asm:124-129`,
`src/cpm/bdos.asm:210-214`).

Services run on their caller's stack. `SVCLIM` limits the combined additional
use to 8 bytes on BDOS, 12 on BIOS and 6 on CCP
(`src/tables.asm:139-144`, `src/loader.asm:225-254`). The
host-model census measures bases of 30, 18 and 18 bytes respectively. Adding
the declared limits gives 38/54, 30/40 and 24/32 bytes. The BDOS's census, its
deepest use of all, is 32 bytes (`docs/services.md:308-330`). The
shell runs its `LINE` and `PAGE` entries on its own 32-byte stack and
declares 6 bytes of the BDOS's stack (`docs/services.md:332-339`).
[Chapter 15](15-state-and-memory.md#four-stacks-for-different-stages)
explains their scope and [Chapter 25](25-loading-and-removing-services.md)
explains declaration checks.

## Reproducing the figures

`npm run media` writes the summary into `docs/memory-map.md` from
`build/tecos/census.json` and the build's symbol file
(`tools/media.mjs:66-98`, `tools/media.mjs:181-198`,
`tools/media.mjs:291`). Chapter 27 describes ROM/media construction.
The lookup below reads `build/tecos/tecos.d8.json` after `npm run build`:

```sh
node -e '
const s = JSON.parse(require("fs").readFileSync("build/tecos/tecos.d8.json", "utf8")).symbols;
for (const n of process.argv.slice(1)) {
  const x = s.find((y) => y.name === n);
  console.log(n, (x.address ?? x.value).toString(16).toUpperCase() + "h");
}' CMDTXT PRGCODE CHPOS
```

It prints:

```text
CMDTXT BD3Ch
PRGCODE BF54h
CHPOS BF66h
```

A source change can move build-dependent addresses. Page zero, the cache addresses, RAM BIOS origin `BF00h` and ROM table origin `C003h` are
fixed by the inspected contract (`src/layout.asm:30-69`, `src/abi.inc:307-309`,
`src/layout.asm:98-99`,
`tools/build.mjs:237-248`). A symbol lookup is valid for the artifact
it reads so a later map needs that build's symbols and identity.
