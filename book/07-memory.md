# 7. Memory for programs

Checked against TEC-OS 98c6416, with the ATOM assembler from the
repository's `atom-z80` 0.3.7. The starter card's `EDIT.COM` is from Edit
845d062, and its copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

A program on TEC-OS has most of the Z80's memory to itself, and the rest is
TEC-OS's. This chapter describes the Z80's 64 KiB as TEC-OS lays it out on a
TEC-1G, then the program area and the word at `0006h` that marks its end,
page zero and the bytes TEC-OS keeps there, the second half of the expansion
RAM, which TEC-OS keeps for itself, and the two CP/M 3 calls with which a
program copies memory.

## The Z80's 64 KiB

The Z80 addresses 64 KiB, and on a TEC-1G running TEC-OS they fall into
three parts:

| Addresses | Size | Contents |
| --- | --- | --- |
| `0000h–7FFFh` | 32 KiB | the board's fixed RAM |
| `8000h–BFFFh` | 16 KiB | EXPAND 0 or EXPAND 1, the two halves of the RAM in socket U9 |
| `C000h–FFFFh` | 16 KiB | the TEC-OS ROM |

The window at `8000h–BFFFh` shows one half of the RAM chip in U9 at a time,
and bit 2 of the board's system latch, at port `FFh`, selects which. EXPAND
0 is in view when TEC-OS starts a program. So a program sees 48 KiB of RAM
from `0000h` to `BFFFh`, with the ROM above it.

TEC-OS uses the top of that RAM and lets programs have the rest. Page zero,
`0000h–00FFh`, holds the jumps and buffers through which a program reaches
TEC-OS. The program area, which CP/M calls the TPA, runs from `0100h` up to
TEC-OS's resident workspace at the top of EXPAND 0. The workspace holds the
BDOS's entry, the drives' allocation vectors, the buffer for card blocks,
the stacks and state of the BIOS, the CCP and the BDOS, and at `BF00h` the
BIOS's jump table.

Cold boot also looks for a second 32 KiB at `0000h–7FFFh`, which bit 3 of
the latch would put in view in place of the fixed RAM. It stores 1 or 2 at
`0041h` for the number of regions, and gives the second its own copy of page
zero; TEC-OS uses no other byte of it.

## The program area and the word at 0006h

Page zero has a jump at `0005h`, and every call to the BDOS goes through it.
The word at `0006h` is the jump's address, and CP/M defines it as the end of
the program area as well: a program may use memory from `0100h` up to the
byte below that address. CP/M programs read the word to find how much memory
they have, and a program that sizes its buffers from it runs on any card and
with any drivers.

The word moves. Cold boot puts the BDOS's entry just below the allocation
vectors, so the word depends on the card's drives, as Chapter 4 explains,
and each driver installed lowers it again: TEC-OS loads the driver below the
old address, and the driver's own jump on to the BDOS becomes the target of
the jump at `0005h`. This program prints the word:

```asm
; TOP: print the word at 0006h, the first byte above the program area.
BDOS    EQU     $0005

        ORG     $0100
        LD      A,($0007)       ; the high byte first
        CALL    HEX
        LD      A,($0006)
        CALL    HEX
        LD      DE,CRLF
        LD      C,9
        JP      BDOS

HEX:    PUSH    AF              ; A as two hex digits
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    DIGIT
        POP     AF
DIGIT:  AND     $0F
        ADD     A,'0'
        CP      '9'+1
        JR      C,DIGIT1
        ADD     A,'A'-'9'-1
DIGIT1: LD      E,A
        LD      C,2
        JP      BDOS
CRLF:   DB      "h",13,10,"$"
```

`DIGIT` turns the low four bits of `A` into a character from `0` to `F` and
prints it with function 2, and `HEX` calls it for the high four bits and
then falls into it for the low four. Each ends with `JP BDOS`, so the BDOS's
return is the routine's return. Assembled as Chapter 6 describes and copied
to drive B of a copy of the starter card, it runs on a board with only a
serial terminal:

```sh
cp dist/starter.img mem.img
npx atom top.asm top.com
node tools/tecvol.mjs put mem.img B top.com
```

<!-- node book/capture.mjs --card mem.img B:TOP -->
```text
A>B:TOP
B806h

A>
```

On the web page's board, `PICO.DRV` is installed by the startup file, and
`CON UC1` then installs `GLCD.DRV`. `B:TOP`, its reply and the echo of `CON
UC1` appeared on the PICO9918, and the rest on the graphics LCD:

<!-- node book/capture.mjs --board pico --card mem.img B:TOP "CON UC1" B:TOP -->
```text
A>B:TOP
B206h

A>CON UC1
CON: UC1: GLCD
A>B:TOP
AC06h

A>
```

Each display driver takes 1,536 bytes, six pages of 256, and so the program
area is 46,854 bytes on the starter card with no driver, 45,318 with one and
43,782 with both. On a card whose header gives four drives, such as the one
Chapter 4 builds, the word is `B506h` with no driver, and the program area
46,086 bytes.

The CCP loads a `.COM` file a record of 128 bytes at a time from `0100h`,
and it stops at the 256-byte page that holds the address in the word at
`0006h`. On the starter card with no driver the last record ends at `B7FFh`,
so the largest program file that loads is 46,848 bytes, six bytes short of
the program area. A file one record longer is refused like a missing one,
with its name and a question mark. A program's data may go on to the byte
below the word at `0006h`.

The workspace above the word is TEC-OS's: a program that writes there
corrupts the drives' allocation vectors or the BDOS's state, and what
follows is a damaged card or a crash. The stack a program starts on is the
CCP's, in the workspace, with 28 bytes free below the return address, as
Chapter 6 says; a program that uses more sets `SP` to a stack of its own
below the word at `0006h`.

## Page zero

CP/M fixes the use of the first 256 bytes, and TEC-OS follows it:

| Addresses | Contents |
| --- | --- |
| `0000h–0002h` | a jump to the BIOS's warm boot, at `BF03h` |
| `0003h` | the IOBYTE |
| `0004h` | the current drive, in bits 0–3, and user area, in bits 4–7 |
| `0005h–0007h` | the jump to the BDOS, whose address is the end of the program area |
| `0008h–0037h` | the restart vectors of `RST 08h` to `RST 30h` |
| `0038h–003Ah` | `EI` and `RETI`, the return from an interrupt in mode 1 |
| `0040h–004Fh` | TEC-OS's own bytes, below |
| `005Ch–007Fh` | the FCB the CCP fills from the first word of the command tail |
| `006Ch–007Bh` | the second word's name, inside the first FCB |
| `0080h–00FFh` | the command tail, then the default DMA buffer |

The word at `0001h`, `BF03h`, is the address of the warm boot entry in the
BIOS's jump table, the table's second entry. A program finds the table by
subtracting 3 from it, and Chapter 8 describes the console's entries there.

The restart vectors are free for a program, and for a debugger, while the
program runs. At each warm boot TEC-OS writes seven zeros and a `RET` into
each one that doesn't hold a jump into the ROM, so that an `RST` through a
vector a finished program set returns at once. The Z80 enters `0038h` on an
interrupt in mode 1, the mode cold boot sets, and TEC-OS has nothing there
but the return. Warm boot disables interrupts and nothing in TEC-OS enables
them, so a program starts with them off; a program that enables them keeps
them on, except while TEC-OS reads or writes a card block, when it holds
them off and then restores them.

`0066h`, where the Z80 goes on a non-maskable interrupt, lies inside the FCB
at `005Ch`. On a board with the keypad's NMI jumper fitted, a key on the hex
keypad lands there, which is why Chapter 1 says to keep off the keypad while
a program runs.

## TEC-OS's bytes at 0040h

CP/M 2.2 leaves `0040h–004Fh` to the BIOS, and TEC-OS keeps there the state
that must stay in view whichever half of the expansion RAM is in the window:

| Address | Contents |
| --- | --- |
| `0040h` | the value last written to the system latch |
| `0041h` | the number of 32 KiB regions at `0000h`, 1 or 2 |
| `0042h` | nonzero while a console byte is waiting at `0043h` |
| `0043h` | the waiting byte |
| `0044h` | the number of halves of the expansion RAM, 2 |
| `0045h` | bits for the matrix keyboard, the displays and the LCD's word |
| `0046h`, `0047h` | the video console's cursor row and column |
| `0048h`, `0049h` | the console's columns and rows, 0 on the serial terminal |
| `004Ah–004Ch` | the state of the escape sequence being read, and its two numbers |
| `004Dh` | the matrix key down at the last scan, FFh for none |
| `004Eh` | 80h while reverse video is on |
| `004Fh` | 1 while the cursor's cell is drawn inverted |

A program reads the console's size at `0048h`, as Chapter 8 describes, and
leaves the rest alone. The latch at port `FFh` can only be written, so
`0040h` is TEC-OS's record of what it holds: a program that writes the latch
itself writes the same value to `0040h`, or TEC-OS's next change to the
latch puts back the bits as `0040h` recorded them.

## EXPAND 1

The second half of the expansion RAM, EXPAND 1, is TEC-OS's alone. Cold boot
clears it, and TEC-OS keeps in it:

| Addresses | Contents |
| --- | --- |
| `8000h–BBFFh` | the block cache's 30 blocks of 512 bytes |
| `BC00h–BC9Dh` | the cache's table: the card block each line holds, and whether it has changes |
| `BD00h–BDFFh` | the history of command lines |
| `BE00h–BEFFh` | free |
| `BF00h–BFFFh` | reserved |

A program that puts EXPAND 1 in the window and writes to it damages the
cache, and the next flush can then write wrong data to the card. TEC-OS has
no service that gives a program space there.

## XMOVE and MOVE

CP/M 3 gives programs two BIOS calls for copying memory between banks, and
TEC-OS has them with CP/M 3's numbers and registers. `XMOVE`, BIOS function
29, takes the destination bank in `B` and the source bank in `C` for the
next copy. `MOVE`, BIOS function 25, copies `BC` bytes from the address in
`DE` to the address in `HL`, forwards as `LDIR` does, between the banks
`XMOVE` named, or within bank 0 if `XMOVE` wasn't called; each `MOVE` uses
the banks once, and the next is in bank 0 again. A program reaches both
through BDOS function 50, CP/M 3's direct BIOS call, with `DE` pointing at a
BIOS parameter block of eight bytes: the BIOS function, then the values for
`A`, `BC`, `DE` and `HL`.

On TEC-OS, bank 0 is the program's view of memory, from `0000h` up to the
word at `0006h`, and bank 1 is EXPAND 1. Since EXPAND 1 is TEC-OS's, bank 1
has no bytes a program may use: a `MOVE` with any byte in bank 1 copies
nothing and returns `FFh` in `A`. A `MOVE` within bank 0 copies and returns
0. A copy that runs past the word at `0006h` is refused in the same way, and
a copy puts the latch and the interrupt state back as they
were before it. This
program tries both:

```asm
; BANKS: try CP/M 3's MOVE into bank 1, then within bank 0, and print the
; result of each, 00 for a copy made and FF for one refused.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,TOBANK1      ; XMOVE: the next MOVE goes to bank 1
        CALL    BIOS
        LD      DE,MOVE1        ; MOVE 16 bytes to 8000h in bank 1
        CALL    BIOS
        CALL    SHOW
        LD      DE,MOVE0        ; MOVE 16 bytes within bank 0
        CALL    BIOS
        CALL    SHOW
        LD      DE,COPY         ; print the copy
        LD      C,9
        JP      BDOS

BIOS:   LD      C,50            ; BDOS function 50: call the BIOS
        JP      BDOS

SHOW:   PUSH    AF              ; print A as two hex digits, then CR LF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    DIGIT
        POP     AF
        CALL    DIGIT
        LD      DE,CRLF
        LD      C,9
        JP      BDOS
DIGIT:  AND     $0F
        ADD     A,'0'
        CP      '9'+1
        JR      C,DIGIT1
        ADD     A,'A'-'9'-1
DIGIT1: LD      E,A
        LD      C,2
        JP      BDOS

; Each BIOS parameter block: the BIOS function, then A, BC, DE and HL.
TOBANK1:DB      29,0
        DW      $0100,0,0       ; B = 1, the destination; C = 0, the source
MOVE1:  DB      25,0
        DW      16,TEXT,$8000   ; 16 bytes from TEXT to 8000h
MOVE0:  DB      25,0
        DW      16,TEXT,COPY    ; 16 bytes from TEXT to COPY
TEXT:   DB      "copied in bank 0"
CRLF:   DB      13,10,"$"
COPY:   DS      16,'.'
        DB      13,10,"$"
```

Function 50 returns the registers the BIOS call left, so `A` after the call
is `MOVE`'s result. `DS 16,'.'` fills the 16 bytes of `COPY` with full stops
in the file, so that a copy that didn't happen would show as dots:

```sh
npx atom banks.asm banks.com
node tools/tecvol.mjs put mem.img B banks.com
```

<!-- node book/capture.mjs --card mem.img B:BANKS -->
```text
A>B:BANKS
FF
00
copied in bank 0

A>
```

So a program that copies within its own memory with `MOVE` gets its copy on
TEC-OS, and a program that keeps data in a second bank gets `FFh` from its
first `MOVE` there.
