# 14. Reset, cold boot and warm boot

Checked against TEC-OS 98c6416.

TEC-OS starts in two ways. Cold boot runs after power-on and after the reset
button, and it builds everything from nothing: page zero, the workspace, the
card's drives, the cache. Warm boot runs at the end of every program, and it
puts back only what a program may have changed, keeping the drives, the
drivers and the cache. This chapter follows cold boot from the first
instruction at `0000h` to the point where it falls into warm boot, with its
two checks of the RAM, the count of the memory regions and the test that
separates a reset from a power-on, and then follows warm boot to the CCP and
measures what it costs.

## The boot overlay

When the TEC-1G comes out of reset its system latch is `00h`. With bit 0 of
the latch low, the board shows the ROM's first 2 KiB at `0000h–07FFh` as
well as at `C000h–C7FFh`, and the Z80, which starts at `0000h`, runs ROM code
before any RAM has been written. The ROM's first instruction is `JP COLD`
(`src/reset.asm:5-6`), and the Z80 runs it from the copy at `0000h`. The
jump's target is an address in `C000h–FFFFh`, so the next instruction comes
from the ROM proper, and `COLD`'s first act after `DI` and loading the stack
pointer is to write `LATCLAS`, `01h`, to the latch (`src/boot.asm:9-12`).
Bit 0 high turns the copy off, `0000h–07FFh` is RAM again, and the latch now
has MAIN 0 and EXPAND 0 in view (`src/layout.asm:16`, `src/layout.asm:19`).
The Z80 comes out of reset with interrupts off, and TEC-OS never turns them
on itself: its routines that must run with them off put them back as they
found them (`src/cache.asm:17-34`), so they come on only if a program
enables them.

## Cold boot

`COLD` is one routine, `src/boot.asm:9-54`, and the steps of a cold boot are
its lines in order:

1. `DI`, the stack at `8000h`, the latch at `LATCLAS` and interrupt mode 1
   (`src/boot.asm:9-13`).
2. `RSLCAP`, which reads what the RAM holds from before the reset, if it
   holds anything, and keeps the drive selection; it runs before anything it
   reads is cleared (`src/boot.asm:14`).
3. Page zero cleared, all 256 bytes, and `LATCHV` set to `LATCLAS`
   (`src/boot.asm:15-21`).
4. `RAMCHK`, which returns only if there is RAM at `8000h–BFFFh`
   (`src/boot.asm:22`).
5. The resident workspace cleared, from `WSBASE` to `WSEND`, and the stack
   moved to the BIOS stack inside it (`src/boot.asm:23-28`).
6. `CONINIT`, which starts the serial terminal, reads the Matrix switch and
   probes for the PICO9918, then the banner (`src/boot.asm:29-31`).
7. `LCDINIT` and the LCD's top row (`src/boot.asm:34-36`).
8. `SDINIT`, which starts the card, and `MOUNT`, which reads and checks the
   container and fills the drive table; either failure goes to the
   diagnostic prompt, `DIAG` (`src/boot.asm:37-40`).
9. `ALVINIT`, which places the allocation vectors and the BDOS entry jump,
   and `RESEL`, which applies the kept selection if the card still has it
   (`src/boot.asm:41-42`).
10. `PZTOP`, the top of the TPA, set to the BDOS entry jump, since no driver
    is loaded yet (`src/boot.asm:43-44`).
11. The BIOS jump table copied from the ROM to `BF00h` (`src/boot.asm:45-48`).
12. The volumes printed on the console and on the LCD (`src/boot.asm:49-50`).
13. Drive A and user 0 at `0004h`, and page zero built by `PZINIT`
    (`src/boot.asm:51-53`).
14. `MEMINIT`, which counts the MAIN and EXPAND regions and clears EXPAND 1
    (`src/boot.asm:54`). When it returns, cold boot runs on into warm boot,
    the next routine in the file.

The order follows from what each step needs. The reset test comes first because the steps after
it clear the memory it reads. The workspace is cleared only after the RAM
check, since until then it may not be RAM, and the stack moves into it only
after it is cleared. The BIOS table is copied at cold boot and never again,
so that a program that replaces one of its entries keeps the replacement
across warm boots, as on CP/M 2.2 (`src/boot.asm:45-47`). Chapter 18
describes steps 8 and 9, and the rest of this chapter steps 2, 4 and 14.

The diagnostic prompt's `R` jumps back to `COLDRT`, step 7
(`src/diag.asm:22-23`, `src/boot.asm:32-34`). A retry clears the LCD, starts
the card again and mounts it, without clearing the memory or printing the
banner a second time.

On the starter card with the serial board, cold boot takes 1,283,603
T-states from the first instruction to the CCP's entry, about 0.32 seconds,
measured on the host model. Three steps take most of it: the banner, 25
characters at 9,372 T-states each on the serial port; the read of the
container's block 0, 219,137 T-states; and `MEMINIT`, about 347,000, most
of it the clearing of EXPAND 1. The startup file's commands then run before
the first prompt, and on the serial board that prompt comes 8,892,292
T-states after reset.

## The two RAM checks

TEC-OS needs RAM at `8000h–BFFFh`, because its workspace and stacks are there,
and it needs both halves of U9, because EXPAND 1 holds the cache.

The first check, `RAMCHK`, runs before anything has been printed, on the
boot stack in fixed RAM (`src/boot.asm:290-308`). It writes `55h` at `8000h`
and `AAh` at `BFFFh`, then reads both back, and does it again with the
patterns swapped. Both ends are written before either is read, so that a
board with nothing in U9, whose data bus floats, can't return the byte just
written from the bus itself (`src/boot.asm:291-293`). If either byte is
wrong, `RAMBAD` sends `TEC-OS needs 64K RAM` to the serial port and stops in
a loop (`src/boot.asm:310-319`). It calls the transmit routine `TXBYTE`
directly, since the console isn't started yet and that routine uses only the
port and the stack.

The second check is in `MEMINIT`, near the end of cold boot, and it looks for
EXPAND 1 (`src/boot.asm:143-148`). It uses `DETECT`, the same routine that
counts MAIN regions. If the count is not 2, it jumps to the same `RAMBAD`, and
the same message goes to the serial port after the volumes have been printed.
`EXPANDS` at `0044h` therefore always holds 2 once cold boot has finished
(`src/layout.asm:41`).

## Counting MAIN and EXPAND

`DETECT` tests whether setting a given latch bit puts different RAM at a
given address (`src/boot.asm:185-213`). It reads the byte at the
address with the bit clear, sets the bit and reads the byte again, then
writes the complement of the first byte and clears the bit. If the byte read
now, with the bit clear, is no longer the first byte, the write landed in
the same RAM, so the bit selects nothing and there is one region. If the
byte is unchanged, the write went to other RAM, and there are two. Each byte
is put back as it was, and the routine returns 1 or 2 with the latch values
without and with the bit in `D` and `E`. Nothing is pushed while the bit is
set, because the stack itself may be in the RAM the bit replaces.

`MEMINIT` tests EXPAND at `8000h` with `LATEXP`, and MAIN at `0100h` with
`LATMAIN` (`src/layout.asm:21-22`, `src/boot.asm:143-171`). With EXPAND 1
found, it uses `DETECT`'s latch value to put EXPAND 1 in view, clears all
16 KiB of it, fills the cache's 120 bytes of line addresses with `FFh`, which
marks every line empty, and puts EXPAND 0 back (`src/boot.asm:149-162`). It
sets EXPAND 1's low mark to `80h`, which closes it to programs' copies
(`src/boot.asm:163-165`). The count of MAIN regions goes to `MAINS` at
`0041h`, which the table at `C00Dh` points at. With a second MAIN, `MNCOPY`
copies page zero into it, a byte at a time, switching the latch between each
read and its write (`src/boot.asm:172-183`), so that MAIN 1's `0000h` also
jumps to the RAM BIOS table.

## Recognising a reset

The TEC-1G's reset button and its power-on reset the Z80 in the same way.
The difference is in the RAM: after power-on it holds whatever the chips came
up with, and after the button it still holds what TEC-OS left there.
TEC-OS uses that to keep one thing across a reset, the selection of volumes
on the drives, so that a reset of a board whose drives were changed with
`MOUNT` comes back with the same drives. The test is `RSLCAP`
(`src/boot.asm:84-138`), and it reads only fixed addresses and runs nothing
it finds. RAM counts as TEC-OS's when all of these hold:

- `0000h` holds a `JP` to `BF03h`, the RAM BIOS table's warm boot entry;
- `0005h` holds a `JP`;
- the word in `STUBAD`, the address where cold boot put the BDOS entry jump,
  is an address of the form `xx06h`, and the three bytes there are
  `JP BENTRY`, the BDOS entry of this ROM;
- the word at `0006h` is of the form `xx06h`, at least `8000h`, and no
  higher than `STUBAD`'s page.

The last condition allows for drivers, which lower the word at `0006h`, and
the word is not compared with `PZTOP`, so that a reset pressed to recover
from a driver's `INIT` that hung still passes (`src/boot.asm:88-89`). The test depends
on two addresses of this build, `STUBAD`'s own and `BENTRY`, and RAM left by a
build with either one elsewhere fails it (`src/boot.asm:90-91`). Cold boot clears
page zero at its start and writes its jumps again only at step 13, so a reset
pressed during cold boot before that step, or at the diagnostic prompt, fails
the test too.

When the RAM passes, `RSLCAP` copies the drive table, 32 bytes, to `RSLBUF`
at `0100h` in the TPA (`src/boot.asm:131-135`, `src/layout.asm:89-95`).
Nothing writes there between `COLD` and `MEMINIT`, so the copy survives the
clearing of the workspace and is still there for the diagnostic prompt's
retry. When the RAM fails, `RSLCAP` puts 0 in drive A's geometry byte in
`RSLBUF`, which means no selection (`src/boot.asm:136-138`).

The selection is applied by `RESEL`, after `MOUNT` has accepted the card in
the socket and `ALVINIT` has given its drives their vectors in the usual way
(`src/vol.asm:391-480`). It works in two steps. The first reads and changes
nothing in the drive table: it walks the card's descriptors and compares
each with every kept drive on the eight bytes a drive-table entry holds, the
start, the length, the geometry and the flags. A descriptor goes to the first
kept drive it matches, and the volume must fit that drive's vector slot. If a
read fails, a matching volume would not fit its slot, or a kept drive is left
with no match, `RESEL` returns and the card's own drives stand. Only when
every kept drive has matched does the second step copy `RSLBUF` over the
drive table and the drives' indexes and build each drive's DPH; it reads
nothing and can't fail. A drive that was empty before the reset stays empty,
even if the card names a volume for it (`src/vol.asm:402-404`).

The run below unmounts drive B with `MOUNT B:`, then presses reset. The kept
selection has no volume on B, the starter card's two volumes still match, and
after the reset only A is listed:

<!-- node book/capture.mjs "MOUNT B:" "@reset" -->
```text
A>MOUNT B:
Unmounted

A>
TEC-OS 0.1 for TEC-1G
A: SYSTEM     

A>PICO.DRV
PICO.DRV?

A>GLCD.DRV
GLCD.DRV?

A>
```

The selection is all that a reset keeps. Cold boot clears page zero, the
workspace and EXPAND 1 as on any cold boot, so drivers, the registry, the
cache, open files and the history are gone, and the console is the serial
terminal again (`src/boot.asm:15-28`, `src/boot.asm:149-155`). A change the
cache held for the card is lost. Once a recognised reset has applied a
selection, the next reset finds it again while the card still holds those
volumes, so only losing the RAM returns the drives to the card's own
choice; `docs/recovery.md` sets out these limits for the user.

## Page zero

`PZINIT` writes page zero's fixed parts at the end of cold boot and again at
every warm boot (`src/boot.asm:215-265`). It puts `JP BF03h` at `0000h`, a
`JP` at `0005h` to `PZTOP`, and `JP BENTRY` at the address in `STUBAD`; it
writes `EI` and `RETI` at `0038h`, where interrupt mode 1 and `RST 38h` go;
and it rewrites the restart vectors at `0008h–0037h`. A vector that jumps
into the ROM keeps its jump and has the rest of its eight bytes zeroed. Any
other becomes seven zeros and a `RET`, so that an `RST` through it returns
at once with the interrupt state unchanged, and a vector that a program
pointed into the TPA does not outlive the program (`src/boot.asm:235-240`).
The IOBYTE at `0003h` and the drive and user byte at `0004h` are left as they
are. Chapter 13 lists page zero in full.

## Warm boot

Warm boot is `WBOOTR`, `src/boot.asm:56-82`. It is the second entry of the
BIOS table, and the jump at `0000h` leads to it through the RAM table at
`BF03h`. A program reaches it by returning from `0100h`, since the CCP
pushes `0000h` before it jumps there (`src/cpm/ccp.asm:14`,
`src/cpm/ccp.asm:213-216`), by jumping to `0000h`, or by calling BDOS
function 0 (`src/cpm/bdos.asm:97-98`). The BDOS goes there itself after a
`^C` typed as the first key of a line read with function 10
(`src/cpm/bdos.asm:336-340`) and after it has reported a disk error such as
`Bdos Err On B: Select` (`src/cpm/bdos.asm:2372-2375`,
`src/cpm/bdos.asm:2391-2394`). A `^C` at the prompt
is the first case, since the CCP reads its line with function 10:

<!-- node book/capture.mjs ^C -->
```text
A>^C
A>
```

Warm boot's steps are:

1. `DI`, then EXPAND 1 in view, and `JP WBOOTR` written at `BF03h` in EXPAND
   1 (`src/boot.asm:59-65`). The jump is for a program that ends with
   EXPAND 1 in view: its jump to `0000h` reaches `BF03h` in EXPAND 1, where
   this jump is.
2. The latch and `LATCHV` set to `LATCLAS`, which puts MAIN 0 and EXPAND 0
   back, and the stack set to the BIOS stack (`src/boot.asm:66-69`). The
   latch comes before the stack because the BIOS stack is in EXPAND 0.
3. `PZINIT`, as above (`src/boot.asm:70`).
4. `DRVBSY` cleared, so that a driver's `INIT` or `REMOVE` that a program's
   end interrupted is not taken to be still running (`src/boot.asm:71-72`).
5. `CPMINIT`, which clears the CCP's and the BDOS's state, 533 bytes from
   `CCPRAM` to `BDOSRME`, as a fresh load of them from disk would leave it,
   puts the DMA address back at `0080h`, sets the command buffer's maximum
   length to 127, fills the CCP stack's guard with `A5h` and marks the
   deblocking buffer empty so that a changed card is read again
   (`src/boot.asm:270-288`).
6. The console put right: `HWVREL` gives back the PICO9918 if a program
   claimed it, `VREST` restores the video display's mode if the console is
   on one, and `VTREGR` resets the scroll region to the whole screen
   (`src/boot.asm:74-78`).
7. `CWBOOT`, which writes every changed line of the cache to the card and
   prints `Write lost` if any write has failed since the last warm boot
   (`src/boot.asm:79`, `src/cache.asm:347-355`).
8. A jump to the CCP's entry, `CCPENT`, with `C` holding the drive and user
   byte from `0004h` (`src/boot.asm:80-82`).

Warm boot leaves the rest alone. The drive table, the DPHs and
the allocation vectors are in the BIOS's part of the workspace, which
`CPMINIT` does not clear, and so are `LOGINV`, the BDOS's record of the
logged-in drives, and the BIOS table at `BF00h` (`src/ram.asm:22-34`). The
drivers below the BDOS entry, the registry's head and the video drivers'
tables above the BIOS table, and the cache's lines and the history in EXPAND
1 are kept too.

The CCP's entry does the rest (`src/cpm/ccp.asm:25-50`). It sets its
stack and sets `WRFLAG` before it calls BDOS function 13, the disk reset.
With that flag set, function 13 keeps each logged-in drive whose vector
nothing has changed since it was last built and that still sums as it did
then; a drive that a write has changed is marked to be rebuilt, at its next
selection, from its directory entries up to the highest one in use; any
other is dropped and is scanned in full when it is next selected
(`src/cpm/bdos.asm:445-507`). A program's own call of function 13 has no flag
set and drops every drive, as CP/M 2.2 does. The CCP then sets the user
number from the byte it was given, calls `STBOOT`, which starts the startup
file once after a cold boot (Chapter 22 describes it), and selects the drive
if it is not A.

## The cost of a warm boot

On the starter card with the serial board, warm boot takes 35,602 T-states,
about 9 milliseconds, from the first instruction of `WBOOTR` to the CCP's
label `STARTED`, where it starts printing the prompt. That figure was
measured on the host model with nothing changed since the last warm boot. It
reads no block. Of it, `CPMINIT` takes 11,669 T-states, the cache's flush,
with no line to write, 7,953, and the CCP's entry with its disk reset
13,733.

A warm boot after `SAVE 8 X.COM` on drive A takes 123,655 T-states on the
same measure. The extra 88,000 or so are the rebuild of A's vector from its
directory up to the last entry in use, read from the block cache with no
card access. For comparison, a disk reset of the kind a program makes, which
drops drive A and scans its whole directory again, takes 1,035,495 T-states
on the starter card even with the directory in the cache, and the first scan
of drive B's 512 entries, with the card read for each of its 32 directory
blocks, takes 9,163,463. The test `test/warmboot.test.mjs` checks the
unchanged case on its own card: a warm boot that reads no block and takes at
most 386,604 T-states (`test/warmboot.test.mjs:11-17`).
