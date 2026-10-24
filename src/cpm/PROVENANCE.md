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
- The transient load ceiling and the `SAVE` page limit use `TPATOP` (the stub
  page) instead of the CCP origin.
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
