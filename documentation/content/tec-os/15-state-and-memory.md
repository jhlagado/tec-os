---
title: State and memory inside TEC-OS
parent: TEC-OS
nav_order: 15
nav_group: "Inside TEC-OS"
---

# 15. State and memory inside TEC-OS

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A program ends and the command prompt returns. The next program has a fresh BDOS
workspace while your command history and installed services remain in RAM. A
reset clears much more RAM. The difference comes from the addresses the boot
routines clear and the state they rebuild afterwards.

The CCP processes commands and the BDOS supplies file and console calls. The
BIOS operates the board for them. Their code is in ROM while their changing
state is in RAM. The numbered ROM services also provide access to the board's
own devices, including the digits, 20 × 4 character LCD and speaker. Console
output can go to serial, the PICO9918 or the graphics LCD. The SD container
holds several volumes. The separate expansion bank holds the block cache, so
its buffers occupy none of the transient program area (TPA)
(`src/rom.asm:17-43`, `src/layout.asm:77-86`,
`format/format.json:20-25`, `src/services.asm:1-20`,
`src/abi.inc:65-106`). The command history is the shell's. `SHELL.SVC` is a
resident service, and its fifteen pages, the 256-byte history ring in the
last of them, lie below the TPA's ceiling like any other service's
(`docs/shell.md:22-30`, `drivers/shell.asm:793-796`).

## Two banks at the same addresses

The Z80 can address 64 KiB at once. The TEC-1G's fixed RAM occupies
`0000h–7FFFh` and the ROM occupies `C000h–FFFFh`. Between them `8000h–BFFFh` is
a 16 KiB bank window onto either half of the RAM in U9. The two halves are
EXPAND 0 and EXPAND 1. Selecting a bank changes the bytes visible at those
addresses (`src/layout.asm:1-7`, `src/abi.inc:304-305`).

Programs normally run with EXPAND 0 selected. Their upper buffers share
that bank with the resident workspace and stacks. EXPAND 1 contains the
cache instead. The address `BF00h` reaches the
RAM BIOS table in EXPAND 0 but a different byte in EXPAND 1. Fixed RAM
and ROM remain visible during this switch.

The system latch at port `FFh` controls the window. Its bit 2 selects
EXPAND 1 when set. Bit 0 turns off the boot overlay when set.
After reset that overlay shows the first 2 KiB of ROM at `0000h–07FFh`.
Cold boot removes it and selects EXPAND 0 with `LATCLAS`, `01h`
(`src/layout.asm:19-28`, `src/abi.inc:302-305`, `src/reset.asm:1-13`,
`src/boot.asm:35-59`).

The latch is write-only so TEC-OS stores its normal value in `LATCHV` at
`0040h`, below the banked window. A temporary bank switch reads that byte,
sets bit 2 in the value sent to the port and restores the saved normal
value afterwards. The cache lookup does this around its table scan.
The other latch bits survive the temporary switch, including Caps Lock's
bit 7. The keyboard routine toggles that bit in both `LATCHV` and the
latch (`src/layout.asm:64-69`, `src/abi.inc:307-309`, `src/cache.asm:38-91`,
`src/keyboard.asm:130-137`).

CP/M reserves `0040h–004Fh` for BIOS scratch. TEC-OS uses only `0040h`
there and cold boot leaves the other fifteen bytes zero.
Console state is above the RAM BIOS table. `MVCOPY` can access program
buffers below `8000h` while EXPAND 1 is selected for transfers to fixed RAM
(`src/layout.asm:64-69`, `src/abi.inc:307-309`, `src/ram.asm:411-428`,
`src/cache.asm:692-699`).

## The workspace across a program exit

The workspace has a fixed position for a given build. Below the RAM BIOS
table at `BF00h` are the BIOS, CCP and BDOS blocks, each ending in a
stack. Above the table are the SD driver, cache controls and other retained
state. `ram.asm` reserves these bytes with `DS`. Initialisation comes from
the boot code rather than bytes loaded from the ROM image
(`src/ram.asm:1-11`, `src/ram.asm:131-139`,
`src/ram.asm:196-209`, `src/ram.asm:285-297`).

Cold boot clears the workspace from `WSBASE` to `WSEND`. Warm boot clears a
shorter span, from `CCPCLR` through the end of the BDOS block. The CCP's two
file control blocks (FCBs) and command buffer lie below that span. Its parser
scratch and stack lie inside it, as does the whole BDOS block. The unexecuted
command text therefore remains available across an ordinary exit while the next
program starts with fresh BDOS state (`src/boot.asm:61-66`,
`src/boot.asm:398-418`, `src/ram.asm:141-209`).

The storage regions receive these treatments at warm boot:

| Storage | Warm-boot treatment |
| --- | --- |
| BIOS disk and display state | Outside the clearing sweep, with selected fields restored separately |
| CCP FCBs and command text | Outside the sweep |
| CCP working state and BDOS block | Cleared by `CPMINIT` |
| RAM BIOS jump table | Left in place |
| State above that table | Outside the sweep, with selected fields updated separately |
| EXPAND 1 | Outside the sweep, with dirty cache lines flushed |

A retained byte can still receive a new value. Warm boot restores EXPAND 0
and `LATCHV`, releases a program's PICO9918 claim and clears the service
loader's busy flag. It restores the video mode and scroll region too.
`CPMINIT` sets the DMA address to `0080h`, restores the command buffer's
maximum of 127 and fills the stack guard with `A5h`
(`src/boot.asm:131-152`, `src/boot.asm:398-418`).

It also clears `BUFOK`, the BIOS key for continuing writes without a
pre-read. A write after warm boot cannot reuse that old key.
A newly allocated block can still qualify for clearing without a read.
At the end of warm boot the cache flush writes pending changes.
If a write fails, its line is dropped and `CWBOOT` clears `CHPOS` before
printing `Write lost`. The remaining command chain is then cancelled
(`src/boot.asm:416-418`, `src/bios.asm:298-358`,
`src/cache.asm:266-300`, `src/cache.asm:634-640`).

The drive table and logged-in vector remain in the BIOS block.
The installed-service registry, program return code and startup position
remain above the RAM BIOS table. The PICO9918 width remains in its console
block. Those values remain available while warm boot reconstructs the next
program's environment. Reset follows the cold path and clears these regions,
although a recognised reset can reconstruct a retained drive selection
(`src/ram.asm:37-69`, `src/ram.asm:71-99`,
`src/ram.asm:364-414`, `src/boot.asm:35-65`,
`src/boot.asm:101-104`).

Cold boot copies seventeen three-byte BIOS jumps from ROM to `BF00h`. Warm boot
leaves that table in place so a replacement entry survives a program exit. The
allocation vectors are filled when the BDOS logs their drives in. The three-byte
BDOS entry is written by `PZINIT` on each warm boot
(`src/layout.asm:98-99`, `src/boot.asm:108-111`,
`src/boot.asm:310-315`).

The build derives `WSBASE` so the lower workspace ends at `BF00h`.
The state above the table starts 51 bytes later at `BF33h`.
Source reservations extend to `WSEND` at the end of that region and the
build checks that they stay below the ROM. These are placement checks,
not checks on every store a program makes. Appendix C has the individual
variables and their addresses
([resident workspace](appendix-c-memory-map.md#the-resident-workspace)).
Through `INFO` a program obtains `VWID` in `L` and `VHGT` in `H`.
It can read the console dimensions without using variable addresses
(`tools/build.mjs:218-248`, `src/ram.asm:295-297`,
`src/ram.asm:456-458`, `src/services.asm:74-80`).

## Allocation vectors below the workspace

The workspace ends at fixed addresses for a build but the allocation
vectors below it depend on the card. Each vector has a bit for every
allocation block of its volume. A set bit marks a block in use.
The BDOS builds that map from the directory when the drive is logged in.
It can then allocate blocks by scanning RAM.
The vector needs `DSM / 8 + 1`
bytes, where `DSM` is the last allocation block number. G1M's `DSM` of
511 needs 64 bytes and G8M's 2047 needs 256
(`format/format.json:46-58`, `src/cpm/bdoslog.asm:164-275`,
`src/cpm/bdosrec.asm:555-626`).

Every drive has a 16-byte disk parameter header, or DPH, in the workspace.
Its allocation-vector pointer is filled by `ALVINIT` after the card mounts.
The routine starts at `WSBASE` and subtracts each slot's size in drive
order. A format 1.1 card can specify a drive count in its header.
A nonzero count reserves that many 256-byte slots, starting with A and
including unmounted drives. Each can hold either supported
geometry's vector
(`src/layout.asm:117-119`, `src/ram.asm:57-68`,
`src/boot.asm:536-563`).

With no drives field, including every format 1.0 card, only mounted drives
receive slots. Each slot is sized from its volume's `DSM`. `DRVSLOT` records 0
for no slot, 1 for 64 bytes and 2 for 256. A later mount must fit the slot
allocated at cold boot. A card with a G1M on A and a G8M on B therefore needs
320 bytes. The starter card asks for four drives, whose four G8M-sized slots
need 1,024 bytes, 704 more, so that any of its volumes fits any drive (`src/boot.asm:569-633`, `src/volsvc.asm:254-265`).

`ALVINIT` reserves three more bytes for the BDOS entry stub directly below the
lowest vector. `STUBAD` stores that address and `PZINIT` writes `JP BENTRY`
there. With no resident service, `PZTOP` is the stub address. The word at
`0006h` contains that same top-of-TPA value. A service occupies whole pages
below it. Its relocated header starts with another `JP BENTRY` and the word at
`0006h` is lowered to the service's page boundary
(`src/boot.asm:106-107`, `src/boot.asm:629-634`,
`src/boot.asm:300-315`, `src/loader.asm:1-10`,
`src/loader.asm:337-350`, `src/loader.asm:499-504`).

The starter card gives a concrete example of that subtraction. It asks for
four drives, each with a full-sized 256-byte slot. Its workspace begins at
`BAECh`, above the four vectors at `B6ECh–BAEBh` and the stub at
`B6E9h–B6EBh`. Programs have 46,569 bytes from `0100h` to `B6E8h`. A card of
two volumes, a G1M on A and a G8M on B, with no drives field, has 320 bytes
of vectors, the stub at `B9A9h` and 47,273 bytes. The starter card's
`STARTUP.CMD` then installs `SHELL.SVC`, whose fifteen pages lower the word
at `0006h` to `A700h`, leaving 42,496 bytes. [Appendix C](appendix-c-memory-map.md#the-cpu-s-address-space)
has these figures. The workspace below `BF00h` occupies 1,044 bytes. The
warm-boot sweep clears 324 of them, from `BDBCh` through `BEFFh`. The 205
bytes above the RAM BIOS table extend from `BF33h` through `BFFFh`
(`docs/memory-map.md:8-22`, `docs/memory-map.md:47-58`,
`docs/compatibility.md:3-16`).
The offered build still checks a minimum starter TPA of 45,830 bytes
(`tools/build.mjs:204-213`, `tools/build.mjs:271-273`).

## Page zero is rebuilt selectively

Page zero provides fixed entry points below the program area.
Cold boot clears the first 256 bytes. Then `PZINIT` writes the jumps
needed by programs. At `0000h` it writes `JP BF03h`, the RAM BIOS
warm-boot entry. At `0005h` it writes the jump through `PZTOP`.
Warm boot repeats those writes and rewrites the stub.
It leaves the IOBYTE at `0003h` and drive/user byte at `0004h` unchanged
(`src/boot.asm:52-59`, `src/boot.asm:300-315`).

The restart vectors receive a separate sweep. A vector keeps a `JP`
whose target is strictly above `PZTOP` in resident memory or ROM.
Other vectors receive seven zero bytes followed by `RET`.
At `0038h` the default is `EI` followed by `RETI` unless a qualifying
jump was preserved there. Cold boot selects interrupt mode 1, whose
maskable interrupt enters at `0038h`
(`src/boot.asm:332-382`, `src/boot.asm:40`).

The CCP fills the program's FCB at `005Ch` and command tail at `0080h`
before launch. That tail storage is also the default DMA buffer.
The load-drive byte at `0050h` is written by the CCP, not `PZINIT`.
It contains the command FCB's drive byte, with 0 for the current drive
and 1 for A. A program found by fallback to A therefore receives 1.
The full page-zero table is in
[Appendix C](appendix-c-memory-map.md#page-zero)
(`src/cpm/ccp.asm:432-471`,
`src/cpm/ccpcmd.asm:392-440`, `src/layout.asm:44-69`, `src/abi.inc:307-309`).

## Four stacks for different stages

Cold boot starts with `SP` at `BOOTSTK`, `8000h`, so its stack grows down
into fixed RAM. It can clear page zero and check the expansion RAM
without depending on a stack in the untested window. After the check and
workspace clear, it switches to `STKTOP`, the BDOS stack.
`COLDRT` sets that stack again for each diagnostic retry.
The console initialisation, banner, mount, drive listing and diagnostic
prompt use it before the CCP starts
(`src/layout.asm:94`, `src/boot.asm:35-68`,
`src/boot.asm:79-93`, `src/boot.asm:97-113`).

Warm boot selects EXPAND 0 before setting
`SP` to `BSTK`, the top of the 40-byte BIOS stack.
Its clearing sweep can then erase the CCP and BDOS stacks safely.
The CCP's own stack is 32 bytes from `CSTKBAS` to `CSTKTOP`.
At program launch the CCP resets `SP` there and pushes the warm-boot
address before jumping to `0100h`. That return word leaves 30 bytes
below it for the program's calls and saved registers
(`src/boot.asm:131-144`, `src/layout.asm:113-115`,
`src/ram.asm:196-201`, `src/cpm/ccp.asm:454-471`).

A BDOS call switches to its 54-byte stack from `STKBASE` to `STKTOP`.
`BENTRY` stores the caller's `SP` in `OLDSP` and runs the function on
that separate stack, including BIOS calls made by the function.
The result path restores `SP` before returning to the program.
The caller's stack therefore retains the return word while BDOS runs
(`src/ram.asm:285-288`, `src/cpm/bdos.asm:124-129`,
`src/cpm/bdos.asm:210-214`).

Below the CCP stack is an eleven-byte guard. It shares a 43-byte
reservation with the 32-byte stack. Warm boot writes `A5h` into each
guard byte. A different value is evidence of an overwrite below the
stack, though the byte alone cannot identify which instruction wrote it.
CP/M's eight call levels plus the inherited return word occupy 18 bytes
of the reserved stack (`src/ram.asm:196-201`,
`src/boot.asm:409-415`, `src/layout.asm:101-115`).

The host-model census measures 18 bytes each for BIOS and CCP with no
loaded services. The BDOS's deepest use of all, its census, is 32 bytes. Its
base, the deepest use with no resident on the serial and PICO9918 paths, the
diagnostic console, a recognised reset and A:'s pending block written at each
flush point, is 30. The service limits are 8, 12 and 6 respectively. A
service limit is counted from the base, so base plus limit uses 38 of the
BDOS's 54 bytes, 30 of the BIOS's 40 and 24 of the CCP's 32. Each leaves at
least a quarter free (`docs/services.md:308-330`). The shell's `LINE` and
`PAGE` entries move at once to its own 32-byte stack, and it declares 6
bytes of the BDOS's stack for `HREC` and `HSTORE`
(`docs/services.md:332-339`).
[Appendix C](appendix-c-memory-map.md#the-stacks) lists the stack addresses
and reservations.

The offered source declares the same reservations and service limits. A loaded
service runs on its caller's stack so its nested use adds to that caller's
depth. `SVCLIM` limits the combined service declarations on each resident stack.
The stack test watches memory writes and excludes `LDIR` writes from its depth
calculation. Its workloads include the consoles, write-behind, diagnostic
failures, command chains and deep CCP paths. It checks the guard and requires
both measured use and base plus service limit to leave a quarter free. Reading
these assertions establishes the test's scope, not a fresh passing result
(`src/tables.asm:139-144`, `src/loader.asm:225-254`,
`src/abi.inc:35-53`, `test/stacks.test.mjs:1-12`, `test/stacks.test.mjs:25-46`,
`test/stacks.test.mjs:164-229`).

The test triggers a keypad non-maskable interrupt (NMI) only at a new stack
depth where `0066h` contains `RETN`. The quoted depths exclude an NMI frame
because TEC-OS installs no handler there. A keypad interrupt normally enters
inside the default FCB at `005Ch`. The required disabled keypad NMI jumper
prevents that entry into FCB bytes during ordinary use
(`test/stacks.test.mjs:8-11`).

## EXPAND 1 and the stack boundary

EXPAND 1 contains 30 cache lines of 512 bytes at `8000h–BBFFh`.
Their four-byte card-block keys occupy `BC00h–BC77h` and their dirty
bytes occupy `BC80h–BC9Dh`. An empty line has key `FFFFFFFFh`.
A nonzero dirty byte marks data newer than the card's copy.
The final 768 bytes at `BD00h–BFFFh` are unused, since the command history
is in the shell's own pages. The cache addresses are fixed in the source
(`src/cache.asm:1-17`, `src/layout.asm:39-42`,
`docs/memory-map.md:78-84`).

Cold boot clears that whole 16 KiB bank and marks the cache lines empty.
Warm boot leaves the cache storage in place and flushes pending writes. The
shell's history survives warm boot in the shell's own pages. No BDOS, BIOS or numbered hardware call allocates a
program buffer in EXPAND 1. A direct write there can corrupt a cached
block whose bytes may later be written to the card
(`src/boot.asm:235-252`, `src/cache.asm:258-300`).

All three resident stacks are in the banked window. Selecting EXPAND 1
hides their saved registers and return addresses along with the workspace
and RAM BIOS table. A `PUSH` then writes the other bank.
Restoring EXPAND 0 before a `POP` would read different bytes.
Calls, returns and interrupts also use the stack.
During an EXPAND 1 access the resident routines hold maskable interrupts
off and use registers for temporary values. A BIOS entry that reaches the
cache saves the interrupt state it found in `CIFF`, not on the stack, and
restores it after EXPAND 0 is back (`src/bios.asm:379-446`).

The cache lookup, RAM-detection routine and SD block loops obey the same
visibility rule. `MVCOPY` can copy directly between a cache line and fixed RAM
with EXPAND 1 selected. For a buffer in EXPAND 0 it switches the window between
each byte's read and write. Temporary values stay in registers until the normal
bank is visible again (`src/cache.asm:49-91`,
`src/cache.asm:655-804`, `src/boot.asm:254-291`,
`src/sd.asm:469-574`, `src/sd.asm:586-655`).

Your program's stack may also be in EXPAND 0. Switching banks then hides
its return word before the first store to the window. The jump at
`0005h` still exists in fixed RAM but its target can now be a cache line.
Ordinary BDOS calls and returns require the program's normal memory view.
