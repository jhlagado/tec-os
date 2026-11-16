---
title: State and memory inside TEC-OS
parent: TEC-OS
nav_order: 15
nav_group: "Inside TEC-OS"
---

# 15. State and memory inside TEC-OS

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED 20339b8;
     Baza is the qualified 45f2598 payload. Source-derived excerpts are
     labelled separately from console captures. -->

An ordinary program exit preserves services and command history but resets the
BDOS state for the next program. These different lifetimes follow RAM
boundaries: boot clears some regions, retains others and reconstructs selected
values. Following those boundaries explains how a new program starts without
dismantling its resident environment.

ROM holds the CCP's command processing, BDOS file and console operations and
BIOS device routines. RAM holds their changing state. EXPAND 1 stores cache
buffers outside the TPA
(`241b438:src/rom.asm:17-45`, `241b438:src/layout.asm:78-87`, `241b438:format/format.json:20-25`,
`241b438:src/services.asm:1-20`, `241b438:src/abi.inc:65-106`). SHELL.SVC reserves seventeen
pages from the TPA and places its 256-byte history ring in the last
page (`TEC-OS 42cc820f8d5bf031076f9cbacf3b9d707e51ec31:docs/shell.md:23-31`, `TEC-OS 42cc820f8d5bf031076f9cbacf3b9d707e51ec31:drivers/shell.asm:791-798`).

## Two banks at the same addresses

The Z80 sees 64 KiB of addresses. Fixed RAM covers `0000h–7FFFh` and ROM
covers `C000h–FFFFh`. The intervening `8000h–BFFFh` window selects a 16 KiB
half of U9 RAM, EXPAND 0 or EXPAND 1. Switching changes the storage visible at
those addresses (`241b438:src/layout.asm:1-7`, `241b438:src/abi.inc:304-305`).

During ordinary program execution EXPAND 0 supplies upper program memory,
workspace and stacks. Selecting EXPAND 1 replaces them with cache storage.
Thus `BF00h` addresses the RAM BIOS table only in EXPAND 0. Fixed RAM and ROM
remain accessible in either view.

System-latch bit 2 at port `FFh` selects EXPAND 1 when set. Bit 0 removes the
boot overlay when set. After reset the overlay maps the first 2 KiB of ROM at
`0000h–07FFh`. Cold boot writes LATCLAS, `01h`, to remove it and select EXPAND
0 (`241b438:src/layout.asm:19-28`, `241b438:src/abi.inc:302-305`, `241b438:src/reset.asm:1-13`,
`241b438:src/boot.asm:35-59`).

Temporary switches must preserve the other latch bits. TEC-OS records the
write-only port's normal value in LATCHV at `0040h` in fixed RAM. A switch
reads that byte, sets bit 2 for the port write and restores the saved value
afterwards. Cache lookup uses this sequence. Caps Lock's bit 7 survives it and
keyboard toggling updates both LATCHV and the port (`241b438:src/layout.asm:64-69`,
`241b438:src/abi.inc:307-309`, `241b438:src/cache.asm:41-94`, `241b438:src/keyboard.asm:130-137`).

CP/M assigns `0040h–004Fh` to BIOS scratch. TEC-OS uses only `0040h` and
leaves the remaining fifteen bytes zero after cold boot. Console state is
above the BIOS table. MVCOPY can reach buffers below `8000h` directly while
the cache bank is selected because fixed RAM stays visible
(`241b438:src/layout.asm:64-69`, `241b438:src/abi.inc:307-309`, `241b438:src/ram.asm:428-445`,
`241b438:src/cache.asm:701-708`).

## The workspace across a program exit

Each build fixes the workspace layout. BIOS, CCP and BDOS blocks lie below the
`BF00h` RAM BIOS table and each ends in a stack. SD state, cache controls and
other retained bytes lie above it. ram.asm reserves this storage with DS. Boot
code supplies initial values rather than copying workspace bytes out of ROM
(`241b438:src/ram.asm:1-11`, `241b438:src/ram.asm:131-139`, `241b438:src/ram.asm:202-215`,
`241b438:src/ram.asm:291-303`).

Cold boot clears WSBASE through WSEND. Warm boot clears only CCPCLR through
the BDOS block's end. The CCP FCBs and command buffer lie below CCPCLR while
parser scratch, CCP stack and all BDOS state lie inside the cleared span. This
placement preserves unexecuted command text across exit while resetting the
next program's BDOS environment (`241b438:src/boot.asm:61-66`, `241b438:src/boot.asm:402-422`,
`241b438:src/ram.asm:141-215`).

Warm boot treats the storage regions as follows:

| Storage | Warm-boot treatment |
| --- | --- |
| BIOS disk and display state | Outside the clearing sweep, with selected fields restored separately |
| CCP FCBs and command text | Outside the sweep |
| CCP working state and BDOS block | Cleared by `CPMINIT` |
| RAM BIOS jump table | Left in place |
| State above that table | Outside the sweep, with selected fields updated separately |
| EXPAND 1 | Outside the sweep, with dirty cache lines flushed |

Being outside the sweep does not make every value immutable. Warm boot
restores EXPAND 0 and LATCHV, releases PICO claims and clears the loader busy
flag. It restores display mode and full-screen scrolling. CPMINIT reinstates
DMA at `0080h`, command maximum 127 and the `A5h` stack guard
(`241b438:src/boot.asm:130-156`, `241b438:src/boot.asm:402-422`).

CPMINIT also clears BUFOK, invalidating the key that permits continued writes
without a pre-read. Newly allocated blocks may still qualify for a clear
without reading. Warm boot attempts a bounded queued-data pass. Failed
acknowledged lines remain available, while CWBOOT cancels the current command
remainder through CHPOS. Separate notices report pending or recovered cache
state (`a40d482:src/cache.asm:638-649`, `a40d482:src/hk.asm:204-237`).

The retained BIOS block includes drive assignments and the logged-in vector.
Above the BIOS table sit the registry, return code and startup position.
Console storage also retains PICO width. Warm boot can reuse these while
reconstructing the next environment. Cold boot clears them after reset,
although recognised volume assignments may be reconstructed
(`241b438:src/ram.asm:37-69`, `241b438:src/ram.asm:71-99`, `241b438:src/ram.asm:370-439`,
`241b438:src/boot.asm:35-65`, `241b438:src/boot.asm:101-104`).

Cold boot copies seventeen three-byte BIOS jumps to `BF00h`. Warm boot
preserves that copy and therefore preserves replacement entries. Allocation
vectors are filled when their drives log in. Separately PZINIT rewrites the
three-byte BDOS entry at every warm boot (`241b438:src/layout.asm:99-100`,
`241b438:src/boot.asm:108-111`, `241b438:src/boot.asm:314-319`).

The build positions WSBASE so the lower workspace ends at `BF00h`. Retained
storage resumes after the 51-byte table at `BF33h` and continues to WSEND.
Build checks keep those reservations below ROM but do not constrain every
store a program might make. [Appendix
C](appendix-c-memory-map.md#the-resident-workspace) lists internal variables
and addresses. Applications obtain dimensions through INFO, which returns VWID
in L and VHGT in H, instead of reading private variables
(`241b438:tools/build.mjs:218-248`, `241b438:src/ram.asm:301-303`, `241b438:src/ram.asm:473-475`,
`241b438:src/services.asm:85-91`).

## Allocation vectors below the workspace

Below the fixed workspace, allocation vectors vary with the card. A vector
marks each used allocation block with a set bit. Login constructs it from the
directory and later allocation scans RAM. Its size is `DSM / 8 + 1` bytes
where DSM is the last block number. G1M's 511 requires 64 bytes and G8M's 2047
requires 256 (`241b438:format/format.json:46-58`, `241b438:src/cpm/bdoslog.asm:165-276`,
`241b438:src/cpm/bdosrec.asm:555-626`).

A drive's 16-byte disk parameter header, DPH, includes the vector pointer set
by ALVINIT after mount. ALVINIT subtracts slot sizes from WSBASE in drive
order. Format 1.1 may specify a nonzero drive count. That reserves 256-byte
slots from A for the stated count, including unmounted drives. Each slot then
fits either geometry (`241b438:src/layout.asm:114-116`, `241b438:src/ram.asm:57-68`,
`241b438:src/boot.asm:540-567`).

Without a drives field, as on format 1.0 cards, only mounted drives receive
slots sized to their DSM. DRVSLOT records 0 for absent, 1 for 64 bytes and 2
for 256. Later mounts must fit the cold-boot slot. G1M on A and G8M on B need
320 bytes. The starter card reserves four full slots, 1,024 bytes, using 704
more so any volume fits any drive (`241b438:src/boot.asm:573-637`,
`241b438:src/volsvc.asm:254-265`).

ALVINIT subtracts another three bytes below the lowest vector for the BDOS
stub. STUBAD records its address and PZINIT writes JP BENTRY there. With no
services the stub address is PZTOP and the word at `0006h`. A resident service
allocates whole pages below it. Its relocated header begins with another JP
BENTRY and lowers `0006h` to its base page (`241b438:src/boot.asm:106-107`,
`241b438:src/boot.asm:633-638`, `241b438:src/boot.asm:304-319`, `241b438:src/loader.asm:1-10`,
`241b438:src/loader.asm:337-350`, `241b438:src/loader.asm:499-504`).

On the starter card workspace begins at `BACBh`. Four 256-byte vectors occupy
`B6CBh–BACAh` and the stub occupies `B6C8h–B6CAh`. This leaves 46,536 TPA
bytes at `0100h–B6C7h`. A two-volume G1M/G8M card without a drives field needs
320 vector bytes. Its stub at `B988h` leaves 47,240 bytes. Startup's
seventeen-page SHELL.SVC lowers the starter boundary to `A500h`, or 41,984
bytes (`TEC-OS 42cc820f8d5bf031076f9cbacf3b9d707e51ec31:docs/memory-map.md:18-19`). [Appendix C](appendix-c-memory-map.md#the-cpu-s-address-space) records
these layouts. The workspace below `BF00h` is 1,077 bytes and warm boot clears
347 at `BDA5h–BEFFh`. Above the table 205 bytes occupy `BF33h–BFFFh`
(`241b438:docs/memory-map.md:8-22`, `241b438:docs/memory-map.md:47-58`,
`241b438:docs/compatibility.md:3-16`). The cited revision's figures are three
bytes lower or larger: its ROM still had SAVE, whose three workspace bytes
have since gone. The offered build also enforces the older
minimum starter TPA of 45,830 bytes (`241b438:tools/build.mjs:204-213`,
`241b438:tools/build.mjs:271-273`).

## Page zero is rebuilt selectively

Page zero supplies entry points at fixed addresses. After cold boot clears all
256 bytes, PZINIT writes JP BF03h at `0000h` and the PZTOP jump at `0005h`.
Warm boot repeats them and rewrites the stub while retaining IOBYTE at `0003h`
and drive/user at `0004h` (`241b438:src/boot.asm:52-59`, `241b438:src/boot.asm:304-319`).

Restart slots have a separate lifetime rule. A sweep retains a JP only above
PZTOP, in resident memory or ROM. Other slots become seven zero bytes and RET.
At `0038h` the default instead uses EI and RETI unless a qualifying jump
survives. Cold boot's interrupt mode 1 routes maskable interrupts to that
address (`241b438:src/boot.asm:336-386`, `241b438:src/boot.asm:40`).

Before launching a program the CCP fills the `005Ch` FCB and `0080h` tail,
which later doubles as default DMA. The CCP also writes load drive at `0050h`.
PZINIT does not fill that byte. It copies the command FCB's drive code, 0 for
current and 1 for A, so fallback loading from A gives 1. [Appendix
C](appendix-c-memory-map.md#page-zero) lists the fields
(`241b438:src/cpm/ccp.asm:488-520`, `241b438:src/cpm/ccpcmd.asm:392-440`,
`241b438:src/layout.asm:44-69`, `241b438:src/abi.inc:307-309`).

<a id="four-stacks-for-different-stages"></a>

## Five stacks for different stages

Cold boot needs a stack before testing banked RAM. It sets SP to BOOTSTK at
`8000h`, with pushes going into fixed RAM below. Only after the check and
workspace clear does it select the BDOS stack at STKTOP. COLDRT resets that
stack for every diagnostic retry. Initial console setup, banner, mount, drive
listing and diagnostics use it before CCP entry (`241b438:src/layout.asm:95`,
`241b438:src/boot.asm:35-68`, `241b438:src/boot.asm:79-93`, `241b438:src/boot.asm:97-113`).

Warm boot must clear the CCP and BDOS stacks without using either. It selects
EXPAND 0 first and sets SP to BSTK, the 48-byte BIOS stack's top. Later the
CCP uses its own 48-byte CSTKBAS–CSTKTOP stack. Launch pushes the warm-boot
word before jumping to `0100h`, leaving 46 bytes for program calls and saves
(`241b438:src/boot.asm:130-148`, `241b438:src/layout.asm:110-112`, `241b438:src/ram.asm:202-207`,
`241b438:src/cpm/ccp.asm:488-520`).

BDOS entry saves the caller's SP in OLDSP and selects its 64-byte
STKBASE–STKTOP stack. Function work and its BIOS calls use that stack. The
result path reinstates SP so the caller's return word stays on its own stack
throughout (`241b438:src/ram.asm:291-294`, `241b438:src/cpm/bdos.asm:124-129`,
`241b438:src/cpm/bdos.asm:211-216`).

An eleven-byte guard lies below the CCP's 48-byte stack, together occupying 59
bytes. Warm boot fills the guard with `A5h`. Another value proves an overwrite
but does not identify its source instruction. CP/M's eight call levels plus
inherited return word use 18 bytes (`241b438:src/ram.asm:202-207`,
`241b438:src/boot.asm:413-419`, `241b438:src/layout.asm:103-112`).

The historical recovery host-model census records no-resident bases of 18 bytes for BIOS and 26
for CCP, including bare-ROM CD selection and refusal. BDOS's maximum over the
census is 32. Its no-resident base is 30 across serial and PICO paths,
diagnostics, recognised reset and A's pending-block flush points. Service
limits add 8 BDOS bytes, 12 BIOS bytes and 6 CCP bytes to their bases. With a
two-byte NMI return-frame reserve the totals are 40 of 64, 32 of 48 and 34 of
48 respectively, leaving at least a quarter free. These reservations do not
cover an arbitrary interrupt handler or an interrupt-initiated OS call
(`46cf3f1:docs/services.md:309-333`). SHELL's LINE and PAGE switch immediately to its
private 48-byte stack. HREC and HSTORE account for its declared 6 BDOS bytes
(`241b438:docs/services.md:347-354`).
Housekeeping temporarily uses a fifth physical stack: 56 bytes at
BFADh–BFE4h, guarded by BFABh–BFACh. Writes and notices run there before
restoring the caller's SP. The logical caller's BDOS restrictions remain;
console callbacks must return normally. The independent refusal account is
28 base bytes plus hook allowance 12 and a two-byte synthetic NMI frame,
42 of 56. That scope covers no arbitrary handler or unsafe-bank NMI
(`a40d482:src/hk.asm:174-208`, `a40d482:docs/services.md:338-345`).

Queue/round/context 68, guard 2 and worker 56 consume the existing reserved
126 bytes. They add no fixed allocation or shell page. The +36-byte recovery
allocation, public 48/64/48 stacks and the shell's page count remain unchanged.

[Appendix C](appendix-c-memory-map.md#the-stacks) lists reservations and
addresses.

The offered source retains these reservations and limits. SVCLIM bounds
combined declarations because every service adds depth to its caller's stack.
The test watches memory writes but excludes LDIR from depth calculation.
Workloads cover consoles, write-behind, diagnostics, chains and deep CCP
paths. Assertions require an intact guard and at least a quarter free after
measured use. They also require that margin after combining each base,
service allowance and two-byte NMI reserve. Source inspection establishes what
is checked rather than a new passing run (`241b438:src/tables.asm:141-146`,
`241b438:src/loader.asm:225-254`, `241b438:src/abi.inc:35-53`, `241b438:test/stacks.test.mjs:1-12`,
`241b438:test/stacks.test.mjs:25-46`, `241b438:test/stacks.test.mjs:203-273`).

The stack test triggers keypad NMI only at a new depth with RETN installed at
`0066h`. Reported depths exclude the NMI frame since TEC-OS supplies no
handler there. Normally that address is inside the default FCB at `005Ch`.
Keeping the keypad NMI jumper disabled prevents entry into its bytes during
ordinary use (`241b438:test/stacks.test.mjs:8-11`).

## EXPAND 1 and the stack boundary

The cache bank holds 30 lines of 512 bytes at `8000h–BBFFh`. Four-byte block
keys occupy `BC00h–BC77h` and dirty bytes occupy `BC80h–BC9Dh`. `FFFFFFFFh`
marks an empty key. A nonzero dirty byte means the line is newer than the
card. History is in SHELL.SVC so the final 768 bank bytes at `BD00h–BFFFh` are
unused. Source fixes these cache addresses (`241b438:src/cache.asm:1-20`,
`241b438:src/layout.asm:39-42`, `241b438:docs/memory-map.md:90-96`).

Cold boot clears the 16 KiB bank and empties the cache. Warm boot retains its
storage and flushes writes while history survives in the shell's pages. No
public BDOS, BIOS or numbered hardware call allocates an EXPAND 1 program
buffer. Direct writes can corrupt a cached block that is later sent to the
card (`241b438:src/boot.asm:239-256`, `241b438:src/cache.asm:265-306`).

The BIOS, CCP and BDOS stacks occupy EXPAND 0's window. Selecting EXPAND 1 hides
them with the workspace and BIOS table. A PUSH writes the other bank and a POP
after switching back reads different storage. Calls, returns and interrupts
use the stack too. Resident routines therefore disable maskable interrupts and
retain temporary values in registers during EXPAND 1 access. A BIOS cache operation
stores entry interrupt flags in CIFF rather than on the hidden stack. It
restores them after switching back (`241b438:src/bios.asm:379-449`).

Cache lookup, RAM detection and SD block loops follow that visibility
constraint. MVCOPY transfers directly between a cache line and fixed RAM with
EXPAND 1 visible. For an EXPAND 0 buffer it switches for every byte's read and
write. Registers retain the temporary byte until the normal bank returns
(`241b438:src/cache.asm:52-94`, `241b438:src/cache.asm:664-813`, `241b438:src/boot.asm:258-295`,
`241b438:src/sd.asm:469-574`, `241b438:src/sd.asm:586-655`).

A program stack in EXPAND 0 is hidden by the same switch, including its return
word. Page zero remains visible but `0005h` may now point into a cache line.
Normal BDOS calls and balanced returns depend on restoring the program's
ordinary memory view.
