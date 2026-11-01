# 13. The memory map

Checked against TEC-OS 98c6416.

TEC-OS has 16 KiB of ROM and, of RAM, the 64 KiB a TEC-1G with U9 fitted
has. Chapter 7 describes that memory as a program sees it. This chapter
describes it from TEC-OS's side: how the system latch puts RAM and ROM into
the Z80's 64 KiB, what TEC-OS keeps in page zero, the resident workspace at
the top of EXPAND 0 and the allocation vectors below it, the four stacks and
the measurements that size them, and the use TEC-OS makes of EXPAND 1. The
addresses are those of the build at 98c6416 with the starter card in the
socket; `docs/memory-map.md`, which `npm run media` writes from the build's
census, has the same figures.

## The address space and the latch

The Z80's address space has three regions. `0000h–7FFFh` is the board's fixed RAM,
`8000h–BFFFh` is a window onto one half of the RAM chip in U9, and
`C000h–FFFFh` is the ROM (`src/layout.asm:3-6`). The window's two halves are
EXPAND 0 and EXPAND 1, each 16 KiB, and bit 2 of the system latch at port
`FFh`, `LATEXP`, selects EXPAND 1 when it is set (`src/layout.asm:13`,
`src/layout.asm:18`). Bit 3, `LATMAIN`, selects a second 32 KiB at
`0000h–7FFFh`, MAIN 1, on a board that has one (`src/layout.asm:20`).
Bit 0, `LATSHAD`, high, turns off the copy of the ROM's first 2 KiB that the
board shows at `0000h` after a reset (`src/layout.asm:16`). TEC-OS runs with
the latch at `LATCLAS`, `01h`: the copy off, MAIN 0 and EXPAND 0 in view
(`src/layout.asm:19`).

The latch can be written but not read. TEC-OS keeps what it last wrote in a
byte of page zero, `LATCHV` at `0040h` (`src/layout.asm:37`). A routine
that changes a bank for a moment reads `LATCHV`, sets its bit, writes the
result to the port and, when it is done, writes `LATCHV` to the port
unchanged.
The block cache's lookup is an example: it writes `LATCHV` with `LATEXP` added
to put EXPAND 1 in view, searches the table of lines there, and ends with
`LD A,(LATCHV)` and `OUT (SYSLAT),A` (`src/cache.asm:42-44`,
`src/cache.asm:74-75`). `LATKEEP`, `83h`, names the bits a bank change
leaves as they were: bit 0, bit 1, which the board calls PROTECT, and bit 7,
CAPS (`src/layout.asm:17`). The matrix keyboard's Caps key toggles bit 7 in
`LATCHV` and in the latch (`src/console.asm:392-397`).

Because the latch moves `8000h–BFFFh` from one half to the other, anything
TEC-OS must reach while EXPAND 1 is in view has to be outside the window.
`LATCHV` is one such byte. It is in page zero, with the rest of the state
TEC-OS keeps out of the window.

## Page zero

CP/M puts its fixed addresses in the first 256 bytes of memory, and TEC-OS
writes them as CP/M 2.2 does. Cold boot clears all of page zero
(`src/boot.asm:15-21`), and `PZINIT`, at cold boot and at every warm boot,
writes the parts TEC-OS sets (`src/boot.asm:218-265`):

| Address | Contents |
| --- | --- |
| `0000h` | `JP BF03h`, the warm boot entry of the RAM BIOS table |
| `0003h` | the IOBYTE |
| `0004h` | the current drive in bits 0–3 and user number in bits 4–7 |
| `0005h` | `JP` to the BDOS entry; the word at `0006h` is the top of the TPA |
| `0008h–0037h` | the restart vectors 1 to 6, each a `RET` unless it jumps into ROM |
| `0038h` | `EI` and `RETI`, for restart 7 and the interrupt of mode 1 |
| `0040h–004Fh` | TEC-OS's state |
| `005Ch` | the default file control block |
| `0080h` | the default DMA buffer and the command tail |

`PZINIT` leaves the IOBYTE and the drive and user byte as they are
(`src/boot.asm:215-217`). The word it writes at `0006h` is `PZTOP`, the entry
of the lowest resident driver or, with none, the BDOS entry jump itself
(`src/boot.asm:223-224`). The restart vectors are made safe at each warm
boot: a vector that holds a jump into the ROM, at `C000h` or above, keeps its
three bytes and the rest is zeroed; any other becomes seven zeros and a
`RET`, so an `RST` through it returns at once (`src/boot.asm:235-265`). A
vector that a program pointed into the TPA is cleared when the program ends.

The bytes `0040h–004Fh` are the sixteen that CP/M 2.2 leaves to the BIOS.
TEC-OS keeps there the state that has to be in view whatever the window shows
(`src/layout.asm:35-52`):

| Address | Name | Contents |
| --- | --- | --- |
| `0040h` | `LATCHV` | the copy of the system latch |
| `0041h` | `MAINS` | MAIN regions fitted, 1 or 2 |
| `0042h` | `RXFULL` | nonzero while a console byte waits in `RXCHAR` |
| `0043h` | `RXCHAR` | that byte |
| `0044h` | `EXPANDS` | EXPAND regions fitted, always 2 |
| `0045h` | `CONDEV` | console devices present, a bit each |
| `0046h` | `VROW` | video terminal cursor row |
| `0047h` | `VCOL` | and column |
| `0048h` | `VWID` | video columns, 0 on the serial terminal |
| `0049h` | `VHGT` | video rows |
| `004Ah` | `ESCST` | escape parser state |
| `004Bh` | `ESCP1` | first numeric parameter |
| `004Ch` | `ESCP2` | second numeric parameter |
| `004Dh` | `KBLAST` | matrix key held at the last poll, `FFh` none |
| `004Eh` | `VATTR` | `80h` while reverse video is on |
| `004Fh` | `VCURV` | 1 while the cursor cell is inverted |

Two of these are published. The table at `C003h` has a word at `C008h` that
points at `VWID`, so a program can find the console's size, and one at
`C00Dh` that points at `MAINS` (`src/abi.asm:10-13`). Chapter 15 describes
the console's bytes.

On a board with MAIN 1, cold boot copies page zero into it as well
(`src/boot.asm:140-142`, `src/boot.asm:172-183`). The jump at MAIN 1's
`0000h` then leads to the RAM BIOS table in EXPAND 0, so a program that ends
with MAIN 1 in view still reaches warm boot.

## The resident workspace

TEC-OS's working memory is at the top of EXPAND 0, from the BDOS entry jump
to `BFFFh`. With the starter card in the socket and no driver loaded it is
laid out like this:

| Addresses | Bytes | Region |
| --- | ---: | --- |
| `B806h–B808h` | 3 | the BDOS entry jump |
| `B809h–B817h` | 15 | unused |
| `B818h–B957h` | 320 | allocation vectors |
| `B958h–BCC4h` | 877 | BIOS disk state and buffers |
| `BCC5h–BCEAh` | 38 | BIOS stack |
| `BCEBh–BE76h` | 396 | CCP state and stack |
| `BE77h–BEFFh` | 137 | BDOS state and stack |
| `BF00h–BF32h` | 51 | RAM BIOS table |
| `BF33h–BFE4h` | 178 | SD, keyboard and GLCD state |
| `BFE5h–BFFFh` | 27 | unused |

The image initialises none of it: `ram.asm` reserves each byte with `DS`,
and cold boot and warm boot clear and set it (`src/ram.asm:1-4`).

The middle part, from `WSBASE` at `B958h` to `BEFFh`, has fixed addresses for
a given build, and its size, 1,448 bytes, sets `WSBASE`: Chapter 12 describes
how the build places it so that it ends at `BF00h`. It is three blocks, one
after the other (`src/ram.asm:1-3`).

The first is the BIOS's, from `DSKCUR` to the BIOS stack
(`src/ram.asm:8-62`). It begins with the disk state, the drive, track, sector
and DMA address the BDOS last set and the block and record they map to, and
then holds the 512-byte deblocking buffer `BLKBUF` at `B966h` with its key
(`src/ram.asm:16-20`), the drive table and the drives' DPHs, which Chapter 18
describes, the 128-byte directory buffer `DIRBUF` that every drive shares,
the word `STUBAD` that holds the BDOS entry jump's address, the mount
service's scratch bytes, and the video terminal's state: an 80-byte row
buffer for scrolling, the seven vectors into the display driver, the scroll
region and the console mode (`src/ram.asm:45-58`).

The second block is the CCP's, from `CCPRAM` at `BCEBh` (`src/ram.asm:64-65`):
its two FCBs, the command buffer with its 128 characters, the state of the
directory listing and the pager, and a 128-byte scratch buffer, `LOADBUF`,
then a guard and the CCP's stack
(`src/ram.asm:67-124`). The third is the BDOS's, from `BDOSRAM` at `BE77h`:
the saved stack pointer, the console column, the line editor's state, the
current and default drives, the user number, the read-only vector and the
drives to rebuild at warm boot, the pointers into the current drive's DPH, DPB and vector, the
directory search state and the file's position, then the BDOS's stack
(`src/ram.asm:126-186`). It ends at `BDOSRME`, `BF00h`.

`BF00h–BF32h` is the RAM BIOS table, seventeen three-byte jumps that cold
boot copies from the ROM (`src/layout.asm:73-74`, `src/boot.asm:45-48`).
It starts a page, so that a program that follows the word at `0001h`, which
points at its second entry, finds the table on a page boundary
(`src/bios.asm:1-3`).

Above the table, from `SDBYTE` at `BF33h`, is state that the build puts at a
fixed offset from it, 51 bytes on (`src/ram.asm:188`): the SD card driver's
command argument, block address and last error, the block cache's next line,
failure flag and saved interrupt state, the matrix keyboard's scan state, the
two video drivers' table addresses, the history's head, `XMOVE`'s banks,
`PZTOP`, the PRL and driver loader's state and the driver registry's head,
and the 128-byte record of `A:STARTUP.CMD` that startup reads
(`src/ram.asm:189-235`). It ends at `WSEND`, `BFE5h`, and the build checks
that it ends by `C000h` (`src/ram.asm:236-237`, `tools/build.mjs:277`).

Below `WSBASE` the layout depends on the card, and that part is the subject
of the next section.

## The allocation vectors and the BDOS entry

A CP/M drive's allocation vector has one bit for each allocation block of its
disk, set while the block is in use, and the BDOS keeps it in memory while the
drive is logged in. Its size is `DSM / 8 + 1` bytes, where `DSM` is the
number of the disk's last allocation block. A G1M volume, with `DSM` 511,
needs 64 bytes, and a G8M volume, with `DSM` 2047, needs 256.

Cold boot places the vectors after it has read the card. `ALVINIT` starts at
`WSBASE` and works down, giving each drive its vector in drive order and
putting each one's address in the drive's DPH (`src/vol.asm:496-570`). How
much it gives each drive depends on the card. A card of container format 1.1
whose header has a drive count of N gets a 256-byte slot for each of drives A to
the Nth, mounted or not, so that any of those drives can later take any
volume. Any other card, including every format 1.0 card, gets a slot for each
drive it mounts, of the size its volume needs (`src/vol.asm:517-545`).
`DRVSLOT` records each drive's slot: 0 for none, 1 for 64 bytes and 2 for 256
(`src/ram.asm:29`, `src/vol.asm:546-551`). The starter card is format 1.0
with a G1M volume on A and a G8M volume on B, so its vectors take 64 and 256
bytes, 320 in all, from `B818h` to `B957h`.

Under the vectors goes the BDOS entry jump, `JP BENTRY`. `ALVINIT` takes the
lowest vector's address, subtracts 9, and sets the low byte to 6
(`src/vol.asm:571-576`): the result is the highest address of the form
`xx06h` at which the three-byte jump still ends below the vectors. For the
starter card that is `B806h`, and the bytes from `B809h` to `B817h` are left
unused. `STUBAD` keeps the address, and `PZINIT` writes the jump there and
puts the address at `0006h` (`src/ram.asm:34`, `src/boot.asm:225-230`).
CP/M 2.2's own BDOS starts on a page boundary and is entered six bytes in,
after its serial number, so the word at `0006h` has the same form.

Every TEC-OS resident keeps that form. A driver's header and image are
moved to a page boundary below the BDOS entry jump, the header's bytes at
offset 6 become the driver's jump, and loading it lowers the word at `0006h`
to that jump (`src/drv.asm:1-5`, `src/drv.asm:16`, `src/boot.asm:121-124`).
Chapter 20 describes the loader.

The word at `0006h` is the top of the TPA, so the card sets how much
memory programs have. The starter card gives 46,854 bytes, from `0100h` to
`B805h`. The largest card, four G8M volumes, takes four 256-byte vectors, puts
the entry at `B506h` and leaves 46,086 bytes; the build works out both figures
in its census, and checks that the starter card's TPA is at least 45,830
bytes (`tools/build.mjs:226-236`, `tools/build.mjs:280-281`).

## The four stacks

TEC-OS uses four stacks, and only the first is outside the workspace.

The boot stack starts at `8000h`, `BOOTSTK`, and grows down into fixed RAM
(`src/layout.asm:68`). Cold boot sets it first (`src/boot.asm:10`), because
the workspace is not yet known to be RAM: on it cold boot recognises a reset,
clears page zero and runs the RAM check. After the check has passed and the
workspace has been cleared, cold boot moves to the BIOS stack
(`src/boot.asm:22-28`).

The BIOS stack, `BSTKB` to `BSTK`, is 38 bytes at `BCC5h–BCEAh`
(`src/ram.asm:60-62`). Cold boot runs on it from the end of the RAM check,
warm boot sets it before anything else (`src/boot.asm:69`), and the
diagnostic prompt sets it again on entry (`src/diag.asm:5`).

The CCP's stack, `CSTKBAS` to `CSTKTOP`, is 30 bytes at `BE59h–BE76h`
(`src/ram.asm:121-123`). The CCP sets it on entry and at the top of its main
loop. It is also the stack a program starts with: the CCP sets it again,
pushes the address of warm boot and jumps to `0100h`, which leaves the
program 28 bytes below that return word (`src/cpm/ccp.asm:210-216`). CP/M
2.2 gives a program eight levels of stack and the return word, and with an
NMI's frame those take 20 of the 30 bytes (`src/layout.asm:77-79`). Below
it is a guard of 13 bytes, `STKGUARD`, which warm boot fills with `A5h`
(`src/ram.asm:115-120`, `src/boot.asm:281-285`); a guard byte that is no
longer `A5h` shows that the stack went past its bottom.

The BDOS's stack, `STKBASE` to `STKTOP`, is 54 bytes at `BECAh–BEFFh`
(`src/ram.asm:183-185`). The BDOS moves to it on entry, keeping the caller's
stack pointer in `OLDSP`, and runs every function on it, the BIOS calls from
the BDOS included.

The three sizes in the workspace are equates in `layout.asm`: 54 for the
BDOS, 30 for the CCP and 38 for the BIOS (`src/layout.asm:80-82`). The
comment above them gives the rule: each is the deepest use, measured with
an NMI's frame on it, and a quarter more (`src/layout.asm:76-79`). The
measurement is `test/stacks.test.mjs`. It boots the model under the heaviest
workloads of the test suite, on each console, with a write-behind drive,
without a card and on the CCP's deepest paths, and watches every write to
memory, the clearing `LDIR`s excepted: the lowest address written in each
stack gives its depth. It passes when each stack's deepest use leaves at
least a quarter of it free and no guard byte has changed
(`test/stacks.test.mjs:182`, `test/stacks.test.mjs:208-211`). It presses the
keypad's NMI at each new depth only while `0066h` holds a `RETN`
(`test/stacks.test.mjs:62-69`), and TEC-OS puts no handler there, so at
98c6416 the measured depths include no NMI frame.

A loaded driver runs on the stack of whoever called it, so the drivers'
own depths add to these. `DRVLIM` gives the most that the drivers together
may add to each stack, in bytes: 8 to the BDOS's, 12 to the BIOS's and 6 to
the CCP's
(`src/data3.asm:112`). Chapter 20 describes how the loader uses them.

## EXPAND 1

EXPAND 1 is TEC-OS's own, and no program can reach any byte of it through the
services. Cold boot selects it, clears all 16 KiB with an `LDIR` and puts
`FFh` in the cache's table of lines, then selects EXPAND 0 again
(`src/boot.asm:149-162`). Its pages are:

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `8000h–BBFFh` | 15,360 | the block cache's 30 lines, 512 bytes each |
| `BC00h–BC77h` | 120 | each line's card block, 4 bytes, `FFFFFFFFh` while empty |
| `BC80h–BC9Dh` | 30 | each line's dirty byte |
| `BD00h–BDFFh` | 256 | the command history |
| `BE00h–BEFFh` | 256 | free |
| `BF00h–BFFFh` | 256 | reserved |

The cache's lines and its table are at fixed addresses
(`src/layout.asm:24-26`), and so is the history's page, `HRING`
(`src/history.asm:14`). Chapter 19 describes the cache and Chapter 23 the
history. The page at `BE00h` is unused. The page at `BF00h` matches the RAM
BIOS table's page in EXPAND 0, and warm boot writes one jump into it: with
EXPAND 1 in view it puts `JP WBOOTR` at `BF03h` (`src/boot.asm:59-65`). A
program that ends with EXPAND 1 still in view and jumps to `0000h` reaches
`BF03h` in EXPAND 1, and that jump takes it to warm boot, which selects
EXPAND 0.

CP/M 3's `XMOVE` and `MOVE` copy between banks, and TEC-OS gives them to
programs through BDOS function 50. They treat bank 1 as EXPAND 1 from
`8000h` up to a low mark, `XMARK`, and cold boot sets the mark to `80h`, the
start of the window, so that bank 1 has no bytes a program may copy to or from
(`src/xmove.asm:1-7`, `src/boot.asm:163-165`, `src/layout.asm:23`).
`MVRANGE` rejects every range in bank 1 that does not lie between `8000h` and
the mark, and in bank 0 every range that does not end by the word at `0006h`
(`src/xmove.asm:147-169`). TEC-OS's own copies, from the cache's lines to the
DMA buffer and back, use the same routine without the check, `MVCOPY`.

The routines that put EXPAND 1 in view use no stack until EXPAND 0 is back,
because all three resident stacks are in the window: a `PUSH` with EXPAND 1 in
view would write into EXPAND 1, and the `POP` after it would read EXPAND 0.
The cache's routines, the history's and `DETECT`, which counts the regions at
cold boot, state the rule at their heads (`src/cache.asm:10-13`,
`src/history.asm:16-18`, `src/boot.asm:185-188`), and the SD card driver's
block loops keep to it when a cache line is the buffer
(`src/sd.asm:258-260`).
