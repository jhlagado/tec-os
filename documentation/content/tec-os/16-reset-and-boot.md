---
title: Reset and boot
parent: TEC-OS
nav_order: 16
nav_group: "Inside TEC-OS"
---

# 16. Reset and boot

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

A program can finish and leave the next command prompt ready without resetting
the board. Warm boot rebuilds the program environment while retaining the drive
selection, services and history. Cold boot follows a reset or a call to the
BIOS's first entry. It checks RAM and reconstructs the resident workspace, card
mount and block cache before entering the same warm-boot path
(`src/boot.asm:35-115`, `src/boot.asm:131-152`). The clearing spans and retained
regions are mapped in
[Chapter 15](15-state-and-memory.md#the-workspace-across-a-program-exit).

## The reset instruction

The Z80 starts at `0000h` after reset but TEC-OS resides at `C000h`.
The TEC-1G's latch resets to `00h`, which makes the first 2 KiB of ROM
visible at `0000h–07FFh` as well as `C000h–C7FFh`. Latch bit 0 controls
this boot overlay. The first instruction is `JP RSTENT`, whose target is
in high ROM. After that jump the CPU can remove the overlay without
removing the code it is executing (`src/reset.asm:1-13`,
`src/layout.asm:19-28`, `src/abi.inc:302-305`, `src/boot.asm:35-39`).

`RSTENT` reads `0002h`. At reset the overlay supplies the high byte of
that first jump's target, `HIGH(RSTENT)`. Equality sends execution to
`COLD`. With the overlay off, page zero normally holds `JP BF03h` instead.
Its high byte is `BFh`, which sends `RSTENT` to warm boot
(`src/boot.asm:13-26`).

That second route handles an exit which reaches `0000h` with EXPAND 1
still selected. The jump to `BF03h` then enters the unused part of that
bank. Cold boot cleared it to zero so the CPU executes `NOP`s until it
reaches the jump at `C000h`. Warm boot restores EXPAND 0 and attempts the
pending cache writes. This route starts only after execution reaches the
page-zero jump. A return through a stack hidden by EXPAND 1 has the separate
stack problem explained in [Chapter 15](15-state-and-memory.md#expand-1-and-the-stack-boundary)
(`src/boot.asm:13-26`, `src/boot.asm:131-152`, `src/boot.asm:235-252`).

`COLD` disables maskable interrupts, sets `SP` to `8000h` and writes
`LATCLAS`, `01h`, to the latch. Bit 0 removes the overlay and bit 2 leaves
EXPAND 0 selected. It then selects interrupt mode 1, whose interrupt entry
is `0038h` (`src/boot.asm:35-40`, `src/layout.asm:22-28`). Maskable
interrupts stay disabled unless a program or service enables them.
Routines such as the BIOS's `CEI` restore an enabled state only if it was
saved on entry (`src/bios.asm:379-446`). The default restart code written
at `0038h` contains another `EI`. Writing that instruction does not execute
it and a qualifying resident jump there is preserved instead
(`src/boot.asm:332-382`).

## Cold-boot order

Cold boot must preserve the old selection before clearing its evidence.
It must also prove the banked RAM before moving the stack there.
The calls in `COLD` establish those dependencies in this order
(`src/boot.asm:35-115`):

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
    (`src/boot.asm:108-111`, `src/layout.asm:99-100`).
13. `SHOWVOL` prints one console line per mounted drive. `LCDVOLS` writes
    the letters and labels of A and B to LCD rows 1 and 2
    (`src/boot.asm:112-113`, `src/boot.asm:496-523`, `src/lcd.asm:104-137`).
14. Page zero's drive/user byte receives A and user 0. Execution continues
    into warm boot, whose `PZINIT` builds page zero once
    (`src/boot.asm:114-144`).

Clearing page zero also sets its IOBYTE to zero, the serial `TTY:` choice.
`PISTART` changes the console field to 1, `CRT:`, only when the PICO9918
responds and the Matrix switch enables the keyboard. It does so before the banner's
first console call. With the Matrix switch off the console stays serial
and `PISTART` leaves its console uninitialised even if the PICO9918 answers
(`src/boot.asm:52-59`,
`src/console.asm:42-45`, `src/video.asm:18-24`, `src/pico.asm:44-67`).

The status LCD has bounded waits so its absence cannot stop boot.
`LCDWAIT` polls the busy flag at most 256 times before each command or
character. A missing display adds that bounded wait. Drives C and D have
no LCD row. Row 3 carries `CARD?` at the diagnostic prompt or `GLCD?`
after a failed `CON UC1` load of `GLCD.SVC` (`src/lcd.asm:23-50`,
`src/lcd.asm:62-67`, `src/lcd.asm:104-137`, `src/boot.asm:646-654`,
`src/loader.asm:862-887`). [Appendix G](appendix-g-tec-1g.md)
gives the display's hardware connections.

A diagnostic retry starts at step 8. `R` jumps to `COLDRT`, which resets
the stack, clears the LCD and starts and mounts the card again. It keeps
the existing memory and prints no second banner. `MOUNT` resets its table
block marker so each required table block is read from the card afresh,
even if a cache line already holds it (`src/boot.asm:92-101`,
`src/boot.asm:656-667`, `src/vol.asm:42-47`, `src/vol.asm:367-420`).

## RAM before the workspace

The workspace and resident stacks need RAM at `8000h–BFFFh`. The cache
needs EXPAND 1 behind the same window. The command history is in the
shell's own pages, not in either bank's fixed areas
(`docs/shell.md:23-31`). `RAMCHK` checks both
before console initialisation, using the boot stack below `8000h`
(`src/boot.asm:420-440`, `src/layout.asm:95`).

`RAMPAT` first writes `55h` at `8000h` and `AAh` at `BFFFh`, then reads
both back. It repeats with the patterns swapped. Writing both ends before
reading either prevents a floating bus on a board with an empty U9 socket
from returning the byte just written (`src/boot.asm:432-435`,
`src/boot.asm:443-460`).

The second check calls `DETECT` with `LATEXP` and address `8000h`.
The routine saves the byte visible with the bit clear, selects the other
view and saves that byte too. It writes the complement of the first byte
with the bit set, then clears the bit and reads the address again
(`src/boot.asm:264-280`, `src/boot.asm:436-439`).

A changed byte in the original view means both selections reached the same
RAM. An unchanged byte means the write reached a different region.
`DETECT` puts both bytes back for two regions or only the original byte
for one. It returns 1 or 2. No stack access occurs while the latch bit is
set because that bit could hide the stack itself
(`src/boot.asm:281-291`).

A wrong end-byte or a count other than 2 enters `RAMBAD`. It sends
`TEC-OS needs 64K RAM` directly through `TXBYTE` and stops in a loop.
`TXBYTE` needs the serial port, ROM code and the fixed-RAM stack, not the
uninitialised console workspace (`src/boot.asm:431-484`, `src/text.asm:11`,
`src/console.asm:352-393`).

After the workspace and console are ready, `MEMINIT` selects EXPAND 1 and
zeros all 16 KiB. It fills the cache's 120 bytes of block keys with `FFh`
to mark all 30 lines empty. It restores EXPAND 0 before returning.
The banked stack is hidden throughout that clear so the routine uses
registers and `LDIR` until the normal view is back
(`src/boot.asm:227-252`, `src/layout.asm:39-42`).

## Retained drive selection

Power-on and the reset button reset the CPU in the same way. RAM after
power-on has arbitrary contents while RAM after a button press can still
contain TEC-OS's state. `RSLCAP` checks that state to recover the volume
assignments made with `MOUNT`. It reads page zero, `STUBAD`, the three
bytes addressed by `STUBAD` and the drive table. It executes none of that
old RAM (`src/boot.asm:154-165`, `src/boot.asm:167-225`).

Recognition requires all of these conditions:

- `0000h` contains `JP BF03h`, the RAM BIOS warm-boot entry.
- `0005h` contains a `JP` opcode.
- The word in `STUBAD` points to three bytes containing `JP BENTRY`,
  where `BENTRY` is this ROM's BDOS entry.
- The word at `0006h` is at least `8000h`. It equals `STUBAD` or names
  a page boundary no higher than `STUBAD`'s page
  (`src/boot.asm:167-212`).

The floor test comes before the comparison with `STUBAD`. The page-boundary
case permits services to lower the entry word. `RSLCAP` does not compare
it with `PZTOP`, which may still describe the earlier top during a service's
`INIT`. A reset used to recover from a hung `INIT` can therefore pass.
Recognition depends on this build's `STUBAD` location and `BENTRY` address.
A different layout need not pass (`src/boot.asm:154-165`,
`src/boot.asm:180-212`).

On success `RSLCAP` copies the 32-byte drive table to `RSLBUF` at
`0100h`. That fixed-RAM copy survives the clears and remains available
through diagnostic retries. On failure it sets the saved A-drive geometry
to zero, the marker for no retained selection. Cold boot then uses the
card's default assignments (`src/boot.asm:214-225`,
`src/layout.asm:118-131`, `src/volsvc.asm:13-22`).

Cold boot clears page zero early and rebuilds its jumps only after the
mount, as it enters warm boot. A reset during that incomplete interval,
including a reset at the diagnostic prompt, fails recognition. The RAM no
longer contains the required page-zero jumps (`src/boot.asm:52-59`,
`src/boot.asm:97-115`, `src/boot.asm:141`).

`RESEL` runs after the new card mount and allocation-vector placement.
The slots and TPA therefore come from the card's normal allocation policy,
not from the saved selection. Its first phase changes no drive assignment.
It walks the card descriptors and compares each with every saved drive.
The comparison covers the entry's eight bytes: start, length, geometry
and flags. Each descriptor goes to the first matching saved drive and
must fit its vector slot (`src/volsvc.asm:13-97`,
`src/volsvc.asm:138-153`, `src/volsvc.asm:254-265`).

The card's defaults remain in place after a failed read, an undersized slot
or any retained drive left unmatched. Only a complete match permits the
second phase. That phase copies the saved entries and matched indexes into
the drive table and builds each mounted drive's DPH. It performs no card
read and has no failure exit. A previously empty drive stays empty even if
the card assigns a volume to that letter (`src/volsvc.asm:30-129`).

In this capture, `CD D:GAMES` put GAMES on the empty D before reset.
The saved assignment matched the starter card so D was listed afterwards:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'CD D:GAMES' @reset. Complete captured console transcript. -->
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

A recognised reset retains only those assignments. Cold boot still clears
page zero, the workspace and EXPAND 1. Loaded services, their registry,
open-file state and cache contents are discarded. The shell is one of those
services, and its history goes with it. `STARTUP.CMD` then loads the shell
again, as the capture shows. The initial
console is selected again from the detected PICO9918 and Matrix switch
(`src/boot.asm:52-77`, `src/boot.asm:235-252`).

Dirty bytes held only in the cache are lost. Bytes already written to the
card remain there, with no rollback. Later resets can retain the same
assignments while recognition succeeds and the card still has the volumes.
A failed recognition or failed reselection leaves the card's defaults.
Power cycling normally removes the recognisable RAM state and resetting
during cold boot clears it as described above.
[Appendix D](appendix-d-error-messages.md#write-lost) gives the
recovery rules for failed cache writes
(`src/boot.asm:167-225`, `src/volsvc.asm:13-129`).

## Page zero and vector lifetime

A completed boot needs fixed entry jumps even after a program has overwritten
page zero. `PZINIT` writes `JP BF03h` at `0000h`, a jump through `PZTOP`
at `0005h` and `JP BENTRY` at the stub. Both cold and warm boot use this
same call. It preserves the IOBYTE at `0003h` and the drive/user byte at
`0004h` (`src/boot.asm:114-144`, `src/boot.asm:293-315`).

Execution continues into `PZSWP`, which sweeps restart vectors
`0008h–003Fh`. A vector's `JP` survives only when its target is strictly
above `PZTOP`, in resident memory or ROM. The three jump bytes remain and
the other five bytes become zero. Every other vector gets seven zeros
followed by `RET`. An `RST` through that default returns without changing
the interrupt state (`src/boot.asm:332-372`).

The equality boundary excludes the first byte of the lowest service or
of the stub when no service is loaded. A jump exactly to `PZTOP` gets the
default. A jump one byte above it survives. At `0038h` the default instead
starts with `EI` followed by `RETI`, with zeros after it. A preserved jump
at `0038h` bypasses that replacement. This applies to both mode-1 interrupt
entry and an explicit `RST 38h` (`src/boot.asm:349-382`).

The sweep prevents program vectors into the TPA from surviving the program.
Service removal also runs it after raising the top so vectors into freed
pages are cleared. A failed `INIT` which releases its pages runs the same
sweep. [Chapter 15's page-zero section](15-state-and-memory.md#page-zero-is-rebuilt-selectively)
locates the other page-zero fields (`src/loader.asm:113-126`,
`src/loader.asm:450-470`).

## Warm boot and pending writes

The jump at `0000h` reaches `WBOOTR` through the second RAM BIOS entry at
`BF03h`. At launch the CCP pushes `0000h` before jumping to `0100h` so a
program's final return follows that path. An explicit jump to `0000h`, BDOS
function 0 and an accepted function-47 command also lead to warm boot
(`src/boot.asm:117-131`, `src/cpm/ccp.asm:454-471`, `src/cpm/bdos.asm:85-105`,
`src/cpm/bdos.asm:220`).

`CHDROP` clears the remaining chain before that jump. The BDOS uses it
for `^C` at the start of a function-10 line, for `^C` used to resume output
paused with `^S` and for an error in the default error mode. Function 45
can select returned-error modes instead. A select failure such as
`Bdos Err On B: Select` takes the default exit after its message and a key
(`src/cpm/bdos.asm:103-105`, `src/cpm/bdos.asm:521-531`,
`src/cpm/bdoscon.asm:32-64`, `src/cpm/bdoscon.asm:286-310`,
`src/cpm/bdoslog.asm:751-760`).

The prompt line is read with function 10, by the shell's `LINE` entry or,
with no shell, by the CCP itself, so `^C` at an empty prompt uses that first
route:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs '^C'. Complete captured console transcript. -->
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

Warm boot rebuilds the environment in this order:

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
   `src/ram.asm:141-155`, `src/ram.asm:215-223`).
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

Clearing `BUFOK` prevents a write from reusing the pre-boot key to skip
a block read. A new type-2 allocation write can still clear its block
without a pre-read (`src/boot.asm:416-418`, `src/bios.asm:298-358`).

An accepted function 47 supplies a new command chain but its warm boot has
the same flush qualification. The next command proceeds after a successful
flush. A failure discards the failed cache line and the chain, leaving the
card's existing copy for that line. Warm boot continues to the CCP in either
case (`src/cpm/bdos.asm:85-95`, `src/cache.asm:258-300`,
`src/cache.asm:634-640`, `src/boot.asm:149-152`).

The CCP then selects its own stack, sets `WRFLAG` and calls BDOS function
13. That flagged reset retains a logged-in drive whose directory is clean
and whose allocation-vector sum still matches. A changed directory requires
a rebuild to its recorded mark. A mismatched vector requires a full scan.
`STBOOT` prepares startup once after cold boot, before the prompt's command
source checks. Subsequent warm boots retain its position
(`src/cpm/ccp.asm:46-88`, `src/cpm/bdosfile.asm:19-107`,
`src/cpm/ccpcmd.asm:747-790`).

## Boot costs

These costs are host-model measurements on the starter card and serial
board. At 4 MHz, 4,000,000 T-states take one second.

Cold boot measured 1,371,831 T-states from the first instruction to the
CCP entry, about 0.34 seconds. `MEMINIT` took 346,677 of them, mostly
clearing EXPAND 1, and reading container block 0 took 219,232. Startup
commands ran before the first prompt: `STARTUP.CMD` loads `SHELL.SVC`, then
tries `GLCD.SVC`. The first entry to `BCONIN` at that prompt was recorded
before executing its instruction, at 8,844,833 T-states after reset, about
2.2 seconds. Serial `BCONOUT` measured 9,448 T-states for one echoed
character. The banner contains 25 output characters
(`src/text.asm:12`).

An unchanged warm boot measured 32,494 T-states, about 8 milliseconds,
from the first instruction of `WBOOTR` to the CCP's `STARTED` label, where
the shell's prompt begins. It read no card block. Within that run `CPMINIT`
took 7,222 T-states, the empty `CWBOOT` flush took 8,437 and the CCP entry
and disk reset took 14,295. The workspace sweep cleared 324 bytes from
`CCPCLR` to the byte before `BDOSRME`.

After `SAVE 8 X.COM` on A, warm boot measured 146,209 T-states over the
same interval. The extra roughly 114,000 came from rebuilding A's vector
through the last used directory entry. Those directory reads came from
the cache, with no card access. An ordinary program's full disk reset,
function 13, instead logged A out and scanned its complete directory. That
measured 1,063,001 T-states even with the directory cached. The first
selection of B after cold boot, function 14, scanned its 512 entries,
reading its 32 directory blocks from the card, and took 9,159,227
T-states.

The warm-boot test uses its own card and a separate bound. Its unchanged
case asserts zero block reads, an unchanged allocation vector and no more
than 386,604 T-states (`test/warmboot.test.mjs:11-17`). That is the test's
assertion, not a measurement of the starter-card run.
