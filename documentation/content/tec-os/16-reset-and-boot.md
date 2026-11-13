---
title: Reset and boot
parent: TEC-OS
nav_order: 16
nav_group: "Inside TEC-OS"
---

# 16. Reset and boot

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

Returning from a program must prepare another command without discarding the
resident system. Warm boot rebuilds the program environment while retaining
drive selection, services and history. Reset or BIOS entry 0 instead starts
cold boot. It checks RAM and rebuilds workspace, mounts and cache before
joining the warm path (`src/boot.asm:35-115`, `src/boot.asm:131-152`).
[Chapter 15](15-state-and-memory.md#the-workspace-across-a-program-exit) maps
the clearing boundaries. Here the order of operations explains which state is
usable at each step.

## The reset instruction

Reset begins at `0000h` while TEC-OS code lives at `C000h`. The latch resets
to `00h`, mapping the first 2 KiB of ROM into `0000h–07FFh` as well as
`C000h–C7FFh`. Bit 0 controls that overlay. The initial JP RSTENT enters high
ROM before the overlay is removed so execution continues from unchanged
storage (`src/reset.asm:1-13`, `src/layout.asm:19-28`, `src/abi.inc:302-305`,
`src/boot.asm:35-39`).

RSTENT distinguishes reset from a low-RAM exit by reading `0002h`. The overlay
supplies HIGH(RSTENT), the first jump's high target byte, selecting COLD. With
the overlay off, the usual JP BF03h at page zero supplies `BFh`, selecting
warm boot (`src/boot.asm:13-26`).

The warm alternative handles a jump to `0000h` with EXPAND 1 still visible.
BF03h then lies in that bank's unused zeroed region. Execution proceeds
through NOPs to the ROM jump at `C000h`. Warm boot selects EXPAND 0 and
attempts pending writes. This recovery requires reaching the page-zero jump. A
return on a hidden stack has the separate problem described in [Chapter
15](15-state-and-memory.md#expand-1-and-the-stack-boundary)
(`src/boot.asm:13-26`, `src/boot.asm:131-152`, `src/boot.asm:235-252`).

COLD disables maskable interrupts, places SP at `8000h` and writes LATCLAS,
`01h`, to the latch. This removes the overlay and selects EXPAND 0. It selects
interrupt mode 1 with entry `0038h` (`src/boot.asm:35-40`,
`src/layout.asm:22-28`). Interrupts remain disabled until a program or service
enables them. BIOS routines such as CEI restore enabled state only if saved at
entry (`src/bios.asm:379-446`). Writing EI into the default `0038h` handler
does not execute it. A qualifying resident jump there is preserved instead
(`src/boot.asm:332-382`).

## Cold-boot order

Cold boot has two early dependencies. It must capture the previous drive
selection before clearing it and test banked RAM before putting a stack there.
COLD orders the work accordingly (`src/boot.asm:35-115`):

1. `DI`, the fixed-RAM boot stack at `8000h`, `LATCLAS` and interrupt
   mode 1 establish the initial execution state (`src/boot.asm:35-40`).
2. `RSLCAP` checks the old RAM and saves a recognised drive selection
   before any of its evidence is cleared (`src/boot.asm:41`,
   `src/boot.asm:167-225`).
3. The page-zero clear writes all 256 bytes and sets `LATCHV`, the latch
   shadow, to `LATCLAS` (`src/boot.asm:52-59`).
4. `RAMCHK` checks the bank window at `8000h–BFFFh` and the second RAM bank
   behind it. It returns only after both checks pass (`src/boot.asm:60`,
   `src/boot.asm:431-460`).
5. The workspace clear runs from `WSBASE` to `WSEND`. `SP` then moves
   to `STKTOP`, the BDOS stack. No program is using that stack yet
   (`src/boot.asm:61-66`).
6. `CONINIT` starts serial input/output, reads the Matrix switch and probes
   the PICO9918. A responding PICO9918 with that switch on becomes the
   40-column console. Otherwise serial remains selected. `RTCHAS` probes
   the clock and records its presence.
   The banner goes to the selected console (`src/boot.asm:68-76`,
   `src/console.asm:34-45`, `src/video.asm:18-24`, `src/pico.asm:53-67`).
7. `MEMINIT` clears EXPAND 1 and marks every cache line empty before
   mounting needs a cache line (`src/boot.asm:77`,
   `src/boot.asm:235-252`).
8. `COLDRT` sets the BDOS stack afresh. `LCDINIT` clears the 20 × 4 LCD
   and the top row receives `TEC-OS 0.1  TEC-1G`
   (`src/boot.asm:92-96`, `src/text.asm:65`).
9. `SDINIT` starts the card. `MOUNT` reads and validates the container
   table through the cache and fills the drive table. Either failure jumps
   to `DIAG`, the diagnostic prompt (`src/boot.asm:97-101`,
   `src/vol.asm:32-48`).
10. `ALVINIT` reserves allocation vectors and the three-byte BDOS entry
    stub. `RESEL` applies a saved selection only if it can match the
    retained volumes to this card and fit their vector slots
    (`src/boot.asm:103-104`, `src/boot.asm:536-634`, `src/volsvc.asm:13-129`).
11. `PZTOP` receives the stub address as the top of the transient program area
    (TPA). There are no loaded services yet (`src/boot.asm:106-107`).
12. The ROM's seventeen BIOS jumps are copied to `BF00h`. Warm boot
    leaves this RAM table in place, including replacement entries
    (`src/boot.asm:108-111`, `src/layout.asm:98-99`).
13. `SHOWVOL` prints one console line per mounted drive. `LCDVOLS` writes
    the letters and labels of A and B to LCD rows 1 and 2
    (`src/boot.asm:112-113`, `src/boot.asm:496-523`, `src/lcd.asm:104-137`).
14. Page zero's drive/user byte receives A and user 0. Execution continues
    into warm boot, whose `PZINIT` builds page zero once
    (`src/boot.asm:114-144`).

Page-zero clearing sets IOBYTE to zero for TTY serial. PISTART changes its
console field to 1 for CRT only with a responding PICO and Matrix enabled.
This occurs before banner output. With Matrix off the console remains serial
and PICO console state is not initialised even when the chip answers
(`src/boot.asm:52-59`, `src/console.asm:42-45`, `src/video.asm:18-24`,
`src/pico.asm:44-67`).

Boot can continue with no status LCD. LCDWAIT polls its busy flag at most 256
times per command or character so absence adds a bounded delay. LCD rows
represent A and B only. Row 3 displays CARD? in diagnostics or GLCD? after a
failed CON UC1 load (`src/lcd.asm:23-50`, `src/lcd.asm:62-67`,
`src/lcd.asm:104-137`, `src/boot.asm:646-654`, `src/loader.asm:862-887`).
[Appendix G](appendix-g-tec-1g.md) gives the connections.

A diagnostic `R` retries from step 8 through COLDRT. It resets the stack and
LCD before starting and mounting the card again. Existing memory is retained
and no second banner is printed. MOUNT clears its table-block marker so
validation rereads required table blocks from the card even if cached
(`src/boot.asm:92-101`, `src/boot.asm:656-667`, `src/vol.asm:42-47`,
`src/vol.asm:367-420`).

## RAM before the workspace

The resident workspace and stacks require `8000h–BFFFh`, with cache storage in
the other bank. History uses shell pages rather than either fixed bank area
(`docs/shell.md:22-30`). RAMCHK must establish both bank views before console
initialisation while still using the fixed-RAM stack (`src/boot.asm:420-440`,
`src/layout.asm:94`).

RAMPAT writes `55h` at `8000h` and `AAh` at `BFFFh` before reading either. It
repeats with the patterns exchanged. A floating bus at an empty U9 socket
therefore cannot pass merely by returning the last value written
(`src/boot.asm:432-435`, `src/boot.asm:443-460`).

A second test checks that selecting another bank reaches different storage.
DETECT receives LATEXP and `8000h`. It saves the byte in each view, writes the
first byte's complement with the bit set and then rereads with the bit clear
(`src/boot.asm:264-280`, `src/boot.asm:436-439`).

A changed original byte means both views address the same RAM. An unchanged
byte means separate regions. DETECT restores both saved bytes for separate
regions or the original byte for shared storage and returns 2 or 1. It avoids
stack access while the bit is set because that view may hide the stack
(`src/boot.asm:281-291`).

A failed end-byte test or any result other than 2 enters RAMBAD. It sends
`TEC-OS needs 64K RAM` directly through TXBYTE and loops. TXBYTE requires only
serial hardware, ROM and the fixed stack, so the failure can be reported
before console workspace exists (`src/boot.asm:431-484`, `src/text.asm:11`,
`src/console.asm:352-393`).

After workspace and console setup, MEMINIT zeros all 16 KiB of EXPAND 1. It
marks the 30 cache lines empty by filling their 120 key bytes with `FFh`. With
the banked stack hidden it uses registers and LDIR until EXPAND 0 is restored
before return (`src/boot.asm:227-252`, `src/layout.asm:39-42`).

## Retained drive selection

Power-on and button reset produce the same CPU reset signal. Power-on RAM is
arbitrary but a button reset can leave valid TEC-OS state. RSLCAP reads page
zero, STUBAD, the three bytes it addresses and the drive table to recognise
that state. It executes no old RAM (`src/boot.asm:154-165`,
`src/boot.asm:167-225`).

RSLCAP accepts the old layout only under these conditions:

- `0000h` contains `JP BF03h`, the RAM BIOS warm-boot entry.
- `0005h` contains a `JP` opcode.
- The word in `STUBAD` points to three bytes containing `JP BENTRY`,
  where `BENTRY` is this ROM's BDOS entry.
- The word at `0006h` is at least `8000h`. It equals `STUBAD` or names
  a page boundary no higher than `STUBAD`'s page
  (`src/boot.asm:167-212`).

The `8000h` floor is tested before STUBAD comparison. The page-boundary
alternative permits a resident service's lower entry word. PZTOP is not
compared because it may still hold the previous committed ceiling during INIT.
A reset after a hung INIT can therefore be recognised. Matching depends on
this build's STUBAD location and BENTRY address, so another layout may fail
(`src/boot.asm:154-165`, `src/boot.asm:180-212`).

Recognition copies the 32-byte drive table to RSLBUF at `0100h`. That
fixed-RAM buffer survives clearing and diagnostic retries. Failure instead
marks the saved A geometry zero and uses the card's defaults
(`src/boot.asm:214-225`, `src/layout.asm:121-134`, `src/volsvc.asm:13-22`).

Page-zero jumps are cleared early and restored only after mounting. Reset
during that interval, including at diagnostics, cannot recognise the previous
state because the required jumps are absent (`src/boot.asm:52-59`,
`src/boot.asm:97-115`, `src/boot.asm:141`).

RESEL runs after mount and vector allocation so the card's normal policy still
determines slots and TPA. Its first phase changes no assignments. It compares
card descriptors against every saved drive using all eight entry bytes: start,
length, geometry and flags. Each descriptor must match the first eligible
saved drive and fit its vector slot (`src/volsvc.asm:13-97`,
`src/volsvc.asm:138-153`, `src/volsvc.asm:254-265`).

A read failure, undersized slot or unmatched saved drive leaves the complete
default selection intact. Only a complete match enters the second phase, which
copies saved entries and matched indexes and builds their DPHs. This phase
completes without card reads or a failure exit. A saved empty drive remains
empty even if the card assigns it a volume by default
(`src/volsvc.asm:30-129`).

Here `CD D:GAMES` assigns GAMES to an empty D. After reset the descriptors
still match so the boot list includes D:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CD D:GAMES' @reset. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD D:GAMES
D:GAMES
A:SYSTEM>
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS
D: GAMES

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>
```

Only volume assignments survive that recognised reset. Cold boot clears page
zero, workspace and EXPAND 1. It discards loaded services, registry, open-file
state and cache data. The discarded shell pages contain its history too.
Startup then installs it again as the capture shows. Console selection is
repeated from PICO detection and the Matrix switch (`src/boot.asm:52-77`,
`src/boot.asm:235-252`).

Reset loses dirty bytes still in cache. Already written card bytes remain with
no rollback. Later resets may keep reapplying the assignment while recognition
and descriptor matching succeed. Power cycling normally removes recognisable
RAM and resetting during cold boot clears it as described above. [Appendix
D](appendix-d-error-messages.md#write-lost) gives failed-write recovery rules
(`src/boot.asm:167-225`, `src/volsvc.asm:13-129`).

## Page zero and vector lifetime

Program code can overwrite page zero, so every completed boot rebuilds its
entry jumps. PZINIT writes JP BF03h at `0000h`, the PZTOP jump at `0005h` and
JP BENTRY at the stub. Cold and warm paths share this operation. It preserves
IOBYTE at `0003h` and drive/user at `0004h` (`src/boot.asm:114-144`,
`src/boot.asm:293-315`).

PZSWP then sweeps restart slots at `0008h–003Fh`. A JP survives only above
PZTOP in resident memory or ROM. Its three bytes remain while the other five
are cleared. Every other slot receives seven zeros and RET, making an RST
return without changing interrupt state (`src/boot.asm:332-372`).

A target equal to PZTOP, the first byte of the lowest service or bare stub, is
cleared. PZTOP plus one survives. At `0038h` the default is instead EI, RETI
and zeros. A preserved JP bypasses that default for both mode-1 interrupts and
explicit `RST 38h` (`src/boot.asm:349-382`).

Program vectors into the TPA therefore expire on exit. Removal raises the
ceiling before sweeping so vectors into freed service pages expire too. Failed
INIT cleanup uses the same sweep when it releases pages. [Chapter
15](15-state-and-memory.md#page-zero-is-rebuilt-selectively) locates the other
fields (`src/loader.asm:113-126`, `src/loader.asm:450-470`).

## Warm boot and pending writes

The page-zero jump reaches WBOOTR through the second RAM BIOS entry at
`BF03h`. The CCP's inherited `0000h` return word makes a program's final RET
follow it. `JP 0000h`, BDOS function 0 and an accepted function 47 also reach
warm boot (`src/boot.asm:117-131`, `src/cpm/ccp.asm:454-471`,
`src/cpm/bdos.asm:85-105`, `src/cpm/bdos.asm:220`).

Some exits first cancel the current command remainder through CHDROP. These
include empty-line `^C`, `^C` resuming a `^S` pause and default-mode BDOS
errors. Function 45's returned-error modes avoid that error exit. A default
selection error such as `Bdos Err On B: Select` prints and waits for a key
before cancellation (`src/cpm/bdos.asm:103-105`, `src/cpm/bdos.asm:521-531`,
`src/cpm/bdoscon.asm:32-64`, `src/cpm/bdoscon.asm:286-310`,
`src/cpm/bdoslog.asm:751-760`).

Prompt input uses function 10 through either the shell's LINE entry or the
bare CCP. An empty-prompt `^C` therefore takes the same exit:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs '^C'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>^C
A:SYSTEM>
```

Warm boot reconstructs the environment in this sequence:

1. `DI` disables maskable interrupts. `LATCLAS` is written to `LATCHV`
   and the port before `SP` is set to the BIOS stack. Selecting EXPAND 0
   first makes that stack visible (`src/boot.asm:131-136`).
2. `PIICLR` ends any program's PICO9918 interrupt session, even with no
   claim. It clears the tracked interrupt-enable bit and, on a detected
   chip, rewrites register 1 with the interrupt off. `HWVREL` then releases
   any program claim and restores the driver state. With `PIICLR`'s write
   first, the chip's interrupt is off before page zero is rebuilt. The source makes no promise about the
   board's NMI wiring (`src/boot.asm:117-139`, `src/pico.asm:326-362`,
   `src/services.asm:206-230`, `src/pico.asm:201-236`).
3. `PZINIT` rebuilds the entry jumps, stub and restart vectors
   (`src/boot.asm:141`).
4. Bit 7 of `SVCBSY` is cleared. An interrupted service `INIT` or `REMOVE`
   does not leave the loader busy (`src/boot.asm:142-143`).
5. `CPMINIT` clears `CCPCLR` through the byte before `BDOSRME`, including
   the BDOS state and error mode. It keeps the command text below that
   span, restores DMA to `0080h`, sets the command maximum to 127 and
   fills the CCP stack guard with `A5h`. It also clears `BUFOK`, invalidating
   the old no-pre-read key (`src/boot.asm:144`, `src/boot.asm:398-418`,
   `src/ram.asm:141-155`, `src/ram.asm:209-217`).
6. `VREST` restores the display mode for a video console. `VTREGR` resets
   the scroll region to the whole screen (`src/boot.asm:145-148`,
   `src/term.asm:172-181`).
7. `CWBOOT` attempts every dirty cache line. Successful writes reach the
   card before the CCP can load a chained program. Each failed line is
   dropped and flushing continues. After any failure `CWBOOT` clears
   `CHPOS` and prints `Write lost` once. A successful flush leaves the
   chain position intact (`src/boot.asm:149`, `src/cache.asm:266-300`,
   `src/cache.asm:624-640`).
8. `CCPENT` receives the page-zero drive/user byte in `C`
   (`src/boot.asm:150-152`).

BUFOK clearing prevents an old continuation key from skipping a required block
read. A fresh type-2 allocation may still start by clearing its block instead
of reading (`src/boot.asm:416-418`, `src/bios.asm:298-358`).

Function 47 uses this same flush boundary. Its replacement command proceeds
only after success. Failure drops the failed line and command chain, leaving
that line's existing card copy. Warm boot reaches the CCP in either case
(`src/cpm/bdos.asm:85-95`, `src/cache.asm:258-300`, `src/cache.asm:634-640`,
`src/boot.asm:149-152`).

CCP entry selects its stack, sets WRFLAG and calls BDOS 13. That flagged reset
retains clean logged-in drives whose allocation-vector sums match. A changed
directory requires scanning to its recorded mark and a vector mismatch
requires a full scan. STBOOT prepares startup once after cold boot before
command-source checks. Later warm boots retain its file position
(`src/cpm/ccp.asm:46-88`, `src/cpm/bdosfile.asm:19-107`,
`src/cpm/ccpcmd.asm:747-790`).

## Boot costs

The retained measurements below use the host model, serial board and starter
card. At 4 MHz each 4,000,000 T-states represents a second.

Cold boot took 1,371,831 T-states from reset's first instruction to CCP entry,
about 0.34 seconds. MEMINIT used 346,677 mainly clearing EXPAND 1. Container
block 0 took 219,232 to read. Startup then loaded SHELL.SVC and attempted
GLCD.SVC. The first prompt's BCONIN entry was reached at 8,844,833 T-states,
about 2.2 seconds, measured before executing that entry instruction. Serial
BCONOUT took 9,448 T-states per echoed character and the banner contains 25
(`src/text.asm:12`).

An unchanged warm boot took 32,494 T-states, about 8 milliseconds, from WBOOTR
to CCP STARTED where the shell prompt begins. It read no card blocks. CPMINIT
used 7,222, empty CWBOOT used 8,437 and CCP entry with disk reset used 14,295.
The clear covered 324 bytes from CCPCLR to just below BDOSRME.

After `SAVE 8 X.COM` on A the same warm interval took 146,209 T-states.
Rebuilding A's vector through the last used directory entry added roughly
114,000. Cached directory blocks supplied all reads. An ordinary program's
function 13 instead logged A out and scanned the whole directory, taking
1,063,001 T-states even from cache. First selection of B after cold boot,
function 14, read 32 directory blocks for its 512 entries and took 9,159,227
T-states.

The automated warm-boot test uses a different card and limit. Its unchanged
case requires no block reads, an unchanged vector and at most 386,604 T-states
(`test/warmboot.test.mjs:11-17`). That assertion is separate from the
starter-card measurements above.
