# CCP and BDOS provenance

`ccp.asm` and `bdos.asm` are adapted from Portable CP/M
(`github.com/jhlagado/portable-cpm`, commit
`3beed4e60a10b3f68a68e8da0f3851946b2e96a4`), an original GPL-3.0-or-later
implementation of the documented CP/M 2.2 interfaces written for ATOM. No
Digital Research source is used.

Changes made for ROM residency in TEC-OS:

- The `ORG CCPBAS` and `ORG BDOSBAS` placements became labels; the build
  places both components in ROM after the BIOS.
- Every variable, buffer and stack moved from the code extent into a RAM block
  at the end of each file (`ORG CCPRAM`, `ORG BDOSRAM`), reserved with `DS`
  and therefore never emitted into the ROM. The BIOS clears both blocks at cold
  and warm boot, sets `CURDMA` to `0080h`, sets the command buffer length to
  127 and refills the CCP stack guard with `A5h`, reproducing the state of a
  fresh disk load.
- The fixed padding to the next component (`DS BDOSBAS-$`, `DS BIOSBAS-$`) was
  removed.
- The CCP's duplicate `CR`, `LF` and `SPACE` equates were removed, its stack
  labels were renamed `CSTKBAS` and `CSTKTOP` to avoid clashing with the BDOS,
  and the BDOS's `IOBYTE` equate now comes from `src/layout.asm`.
- The transient load ceiling and the `SAVE` page limit use the page of the
  BDOS entry jump, the byte at `0007h`, instead of the CCP origin.
- The CCP now keeps the CP/M 2.2 user/drive byte at `0004h` (user in bits 4–7)
  through `SAVEDU`, restores the user number on entry, and masks the user bits
  when printing the drive in `DIR`.
- `LOGIN` no longer rescans the directory when the BDOS rebinds a drive that
  is already logged in. Portable CP/M rescanned on every change of drive,
  which is correct but cost 32 SD block reads per switch on an 8 MiB volume.
  The directory high-water mark `DIRUSED` is now kept per drive in the third
  DPH scratch word (`DUSAVE`, `LOGFAST`), as DR's BDOS keeps its equivalent.
  The allocation vector was already per drive and is maintained by the BDOS
  between logins.
- `DIR` is rewritten for TEC-OS's displays: compact
  `NAME.EXT` entries in as many 13-character columns as the console width at
  `VWID` allows, followed by the file count and the free space on the listed
  drive (`PUTTRIM`, `PUTDEC`). It still hides system files and uses no TPA
  memory.
- `TYPE` and `DIR` print through a pager (`PGINIT`, `PGPUT`, `PGCRLF`,
  `PGNEWL`) that counts lines, including wrapped ones, against the console
  size and pauses with `[more]`; ^C, Esc or Q stops the listing.
- `CHKKEY` keeps a key that arrives during console output, other than ^S and
  ^P, as the pending character for the next read. Portable CP/M discarded it,
  so typing while a program was drawing its screen was lost; CP/M 2.2 keeps it.
- The BDOS's check for `^S` and `^P` during output (`CHKKEY`) calls the
  BIOS's `BCONST` directly through `CONSTQ`. The BIOS table's `CONST` entry
  draws the video cursor when no key is waiting, because a program that polls
  is waiting for a key; the check made for every printed character must not.
- The CCP has a built-in `CON` command that reports or sets the IOBYTE
  `CON:` field (TTY, CRT, BAT or UC1).
- `COPY SOURCE DEST` is a TEC-OS built-in (`CMDCOPY`), with the steps and
  messages of `test/programs/copy.asm`: open the source, erase and make the
  destination, copy record by record through the default DMA record, close,
  and print `COPIED nnnn` in hex. It keeps its state in the CCP's existing
  FCBs and `DIRNUM` and writes nothing in the TPA. Unlike `copy.asm`, it
  takes a drive alone, or a blank name, as the destination and fills in the
  source's name, and it refuses a destination that names the source
  (`CPPARSE` puts the current drive, from page zero's `0004h`, in a 0 drive
  byte, and the two FCBs' bytes 0 to 11 are compared
  before the open).
- The line editor (`FNLINE`) keeps a history of the lines typed at the CCP
  prompt in a ring in EXPAND 1 (`src/history.asm`). The CCP sets `HFLAG`
  before its prompt's function 10, and only that call stores its line or
  takes ^W and ^N as recall keys; for a program, function 10 is CP/M 2.2's.
  `LINCLEAR`'s loop became the subroutine `LINERASE`, shared with recall.
- `DIV16` divides HL by DE, giving the quotient in DE and the remainder in
  HL, by shifts and trial subtractions, for divisors from 1 to 8000h. The
  BDOS uses it to split a record number into track and sector, where
  Portable CP/M subtracted the sectors per track once a track: up to 1,023
  times at the end of an 8 MiB volume. `PUTDEC` in the CCP divides by 10
  with it and prints the remainders in reverse, in place of a table of
  powers of ten.
- The CCP's reset at its entry (`WRFLAG` with function 13) keeps each logged
  drive whose allocation vector nothing has changed since its last scan and
  that still sums as it did then (`WRESET`, `ALVSUM`); `LOGINV` lives in the
  BIOS's workspace so that it survives the warm boot. A drive that has
  changed (`ALFOUND`, or the BIOS's mark on a directory write, both in the
  DPH's second scratch word) is rebuilt at its next selection from the
  entries up to its directory mark (`WARMV`); `DUSAVE` keeps the higher of
  the two marks. Function 13 from a program and function 37 are CP/M 2.2's.
