# 6. A first program

Checked against TEC-OS 98c6416, with the ATOM assembler from the
repository's `atom-z80` 0.3.7 on the PC and, on the TEC-1G, `ATOM.COM` from
ATOM 505cee1 (`assets/atom-cpm22.com`), SHA-256
`c99135936bcccfaffb29c98679ed4dbb5d2d6a76c62080de15a1831da2403be7`. The
starter card's `EDIT.COM` is from Edit 845d062, and its copy on the card has
the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

A program for TEC-OS is a CP/M program: Z80 code that TEC-OS loads at
`0100h` and that reaches the console and the files through the BDOS. This
chapter describes two of them. The first prints a line; you assemble it with
ATOM on a PC, copy it to a card and run it. The second prints the file named
on its command line, and through it the chapter explains how the CCP passes
a command line to a program and how a program opens and reads a file. You
then assemble the first program again on the TEC-1G itself, and the last
section describes the ways a program returns to TEC-OS.

## Calling the BDOS

A program calls one of the BDOS's functions by putting the function's number
in register `C` and calling address `0005h`. A function that takes a byte,
such as a character to print, takes it in register `E`, and one that takes
an address, such as a string's or a file's, takes it in `DE`. A function
that returns a byte returns it in `A`, and one that returns a word returns
it in `HL`. CP/M 2.2 defines no register as kept across a call, so a program
saves in its own memory, or on its stack, every value it uses after the
call.

The word at `0006h`, inside the jump at `0005h`, is the address that jump
leads to, the BDOS's entry or a driver's jump on to it, and it is also the
end of the memory a program may use, as Chapter 7 explains. Beyond reading
that word, a program has no use for that address: it calls `0005h`.

The functions this chapter uses are these:

| Function | Name | Takes | Returns |
| --- | --- | --- | --- |
| 2 | Console output | `E`: the character | nothing |
| 9 | Print string | `DE`: the string, ended by `$` | nothing |
| 15 | Open file | `DE`: the file's FCB | `A`: FFh if there is no such file |
| 20 | Read sequential | `DE`: the file's FCB | `A`: 0 for a record read, 1 at the end of the file |

Appendix A lists every function.

## A program that prints

This program prints a line with function 9 and returns:

```asm
; HELLO: print a line and return to the CCP.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MESSAGE      ; the string, ended by $
        LD      C,9             ; BDOS function 9: print a string
        CALL    BDOS
        RET                     ; back to TEC-OS
MESSAGE:DB      "Hello from the TEC-1G",13,10,"$"
```

`ORG $0100` places it at `0100h`, where the CCP loads every program and
starts it. Function 9 prints each character from the address in `DE` up to
the `$`, which isn't printed, so the 13 and 10 before it, a carriage return
and a line feed, end the line. The `RET` at the end returns to TEC-OS, as
the last section explains.

ATOM is a Z80 assembler that runs on a PC and on CP/M, and `npm ci` installs
it with the repository. Saved as `hello.asm` in the clone, the program
assembles with this command, which writes the 33 bytes of `hello.com`:

```sh
npx atom hello.asm hello.com
```

The output file's type, `.com`, gives a CP/M program: the bytes of the code
from `0100h` on, with nothing before them.

## Copying the program to a card

`tecvol`, from Chapter 4, puts the program on a card image. A copy of the
starter card keeps the original as it was:

```sh
cp dist/starter.img work.img
node tools/tecvol.mjs put work.img B hello.com
```

`put` names the file `HELLO.COM` on drive B. `book/capture.mjs` boots
`work.img` and types the commands; on a board, `tecvol install` from Chapter
4 writes `work.img` to the card. `B:` makes drive B current, `DIR` shows the
program, and `HELLO`, the program's name without its type, runs it:

<!-- node book/capture.mjs --card work.img B: DIR HELLO -->
```text
A>B:
B>DIR
HELLO.COM   
1 file, 8172K free
B>HELLO
Hello from the TEC-1G

B>
```

The transcript leaves out the boot before `B:`. The blank line before the
prompt comes from TEC-OS: when a program ends, the CCP starts a new line
before it prints the prompt again. The CCP searches for the program on the
current drive only, so at `A>` the command `HELLO` comes back as `HELLO?`,
and `B:HELLO` runs the program from drive B.

The web page copies a file from the PC to its card without `tecvol`. Its
"Drive" list holds the drives the card's header names, and "Copy file to
drive" writes the chosen files onto the volume of the drive selected there.
Each name becomes the CP/M name in capitals; "as text" makes the copy a text
file, as `tecvol put --text` does. The page then presses the board's reset,
so that TEC-OS starts again with the changed card, and the reset loses any
change still in the block cache, so a `^C` at the prompt before the copy
puts those changes on the card first. The list below the button shows the
files on the selected drive, each with a "Download" button that copies it
back to the PC.

## The command line

The second program, `SHOW`, prints a text file, and the file's name is the
first word after the command: `SHOW HELLO.ASM` prints `HELLO.ASM`. The CCP
prepares two things in page zero, the first 256 bytes of memory, before it
starts a program, and `SHOW` uses one of them.

The first is the command tail at `0080h`. Its first byte is the number of
characters typed after the command's name, and the characters follow it,
with the space before the first word and with letters in capitals, as the
CCP turns every command line into capitals. For `SHOW b:hello.asm x` the
byte at `0080h` is 14, and `0081h` onwards holds ` B:HELLO.ASM X`.

The second is a file control block, an FCB: the 36 bytes through which a
program names a file to the BDOS and the BDOS keeps its place in the file.
The CCP fills the FCB at `005Ch` from the first word of the tail and the 16
bytes at `006Ch` from the second, if there is one. An FCB starts with the
drive, 0 for the current drive or 1 to 16 for A to P, then 8 bytes of name
and 3 of type, each padded with spaces. For `SHOW b:hello.asm x` the FCB at
`005Ch` holds 2, for drive B, then `HELLO   ASM`; the bytes at `006Ch` hold
0 and `X`, padded. A program that takes one file name opens the FCB at
`005Ch` as it stands.

The FCB's byte 32, at `007Ch` for the FCB at `005Ch`, is the current record:
the number of the next 128-byte record that a sequential read takes, within
the part of the file the FCB is on. A program sets it to 0 before the first
read. The CCP clears it already, but a program that opens a file from its
own FCB, or opens the same FCB again, sets it itself.

## A program that reads a file

```asm
; SHOW NAME: print the text file NAME on the console.
BDOS    EQU     $0005
FCB     EQU     $005C           ; the CCP's FCB for the first name
DMA     EQU     $0080           ; where the BDOS reads a record

        ORG     $0100
        XOR     A
        LD      (FCB+32),A      ; read from the first record
        LD      DE,FCB
        LD      C,15            ; open the file
        CALL    BDOS
        INC     A               ; FFh: no such file
        JR      Z,NOFILE
NEXT:   LD      DE,FCB
        LD      C,20            ; read the next record into DMA
        CALL    BDOS
        OR      A
        RET     NZ              ; no more records
        LD      HL,DMA
        LD      B,128
PUT:    LD      A,(HL)
        CP      $1A             ; ^Z ends a text file
        RET     Z
        PUSH    HL
        PUSH    BC
        LD      E,A
        LD      C,2             ; print the character in E
        CALL    BDOS
        POP     BC
        POP     HL
        INC     HL
        DJNZ    PUT
        JR      NEXT
NOFILE: LD      DE,NOMSG
        LD      C,9
        JP      BDOS            ; print, and return from there
NOMSG:  DB      "No such file",13,10,"$"
```

Function 15 opens the file the FCB names. It finds the file's directory
entry and copies the entry's allocation into the FCB, and it returns FFh in
`A` if there is no such file; `INC A` turns FFh into 0 and sets the zero
flag, so `JR Z` takes that case. Function 20 then reads one record of 128
bytes into the DMA address, the buffer the BDOS reads into and writes from,
which is `0080h` until a program changes it with function 26. The same 128
bytes held the command tail, so a program that uses its tail copies it
before the first read. Function 20 returns 0 in `A` for a record read and 1
when there is no record left.

`PUT` prints the record's bytes one at a time with function 2, which takes
its character in `E`. Function 2 changes the registers, so `PUSH` and `POP`
keep the pointer in `HL` and the count in `B` across each call. The loop
stops at a `^Z`, the byte with which a CP/M text file ends: a CP/M file's
length is a whole number of records, so the end of the text is marked inside
the last record, and the rest of that record is commonly `^Z` too, as
`tecvol put --text` fills it. A file with no `^Z` stops at its last record,
when function 20 returns 1.

When there is no file, `NOFILE` prints a message with `JP BDOS` in place of
a `CALL` followed by `RET`: the BDOS returns to the address on top of the
stack, which is the `0000h` the CCP left there, and the program ends.

The program assembles to 72 bytes. These commands assemble it and put it on
drive B with `hello.asm` as a text file to print:

```sh
npx atom show.asm show.com
node tools/tecvol.mjs put work.img B show.com
node tools/tecvol.mjs put work.img B hello.asm --text
```

<!-- node book/capture.mjs --card work.img B: "SHOW HELLO.ASM" "SHOW NOSUCH.TXT" -->
```text
A>B:
B>SHOW HELLO.ASM
; HELLO: print a line and return to the CCP.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MESSAGE      ; the string, ended by $
        LD      C,9             ; BDOS function 9: print a string
        CALL    BDOS
        RET                     ; back to TEC-OS
MESSAGE:DB      "Hello from the TEC-1G",13,10,"$"

B>SHOW NOSUCH.TXT
No such file

B>
```

`SHOW` with no name opens an FCB of spaces, finds no such file and prints
the same message.

## Assembling on the TEC-1G

ATOM also runs on TEC-OS itself, as a CP/M program, `ATOM.COM`. The ATOM
repository holds it as `assets/atom-cpm22.com`; with a clone of ATOM beside
the TEC-OS clone, `tecvol` copies it onto drive B under its CP/M name:

```sh
node tools/tecvol.mjs put work.img B ../atom/assets/atom-cpm22.com ATOM.COM
```

`ATOM HELLO` assembles `HELLO.ASM`, the copy of the source that `SHOW`
printed, from the current drive and writes `HELLO.COM` beside it. Here the
`HELLO.COM` from the PC is erased first, so that the one `DIR` lists is
ATOM's:

<!-- node book/capture.mjs --card work.img B: "ERA HELLO.COM" "ATOM HELLO" DIR HELLO -->
```text
A>B:
B>ERA HELLO.COM
B>ATOM HELLO

HELLO.COM written

B>DIR
SHOW.COM     HELLO.ASM    ATOM.COM     HELLO.COM   
4 files, 8140K free
B>HELLO
Hello from the TEC-1G

B>
```

With `A:EDIT HELLO.ASM`, the starter card's editor, to change the source,
the whole cycle of editing, assembling and running a program takes place on
the TEC-1G.

## The ways a program ends

When the CCP starts a program it puts the address `0000h` on the stack, so a
`RET` from the program's first level jumps to `0000h`. Page zero holds a
jump there to the BIOS's warm boot, and so every ordinary end of a program
is a warm boot:

- a `RET` with the stack as the program found it;
- a jump to `0000h`;
- BDOS function 0, which runs the warm boot itself;
- a `^C` typed as the first key of a line that the program reads with BDOS
  function 10;
- a key pressed after a BDOS error such as `Bdos Err On B: Bad Sector`.

The warm boot writes the block cache's changes to the card, puts back the
jumps in page zero, clears each restart vector at `0008h–0037h`, the
addresses that `RST` instructions call (Chapter 7), that a program set,
keeping only a jump into the ROM, starts the CCP again and prints the prompt
on the drive and in the user area held in the byte at `0004h`. The CCP
writes that byte before it starts a program, so the prompt is on the drive
and user area current then, unless the program changed the byte. Drivers
stay installed, and the IOBYTE keeps its value. Chapter 14 describes the
warm boot step by step.

The stack the CCP gives a program is the CCP's own, and it has 28 bytes free
below the return address, enough for a few levels of calls and pushes. A
program that uses more points `SP` at a stack in its own memory. A `RET` at
the end then doesn't reach `0000h`, so such a program ends with `JP 0000h`
or function 0.

A program that never ends, or one that has crashed, is stopped with the
reset button. A reset runs cold boot, which loses the changes still in the
block cache, as Chapter 4 describes, and keeps the drives' volumes.
