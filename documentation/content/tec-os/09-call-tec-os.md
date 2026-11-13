---
title: Call TEC-OS
parent: TEC-OS
nav_order: 9
nav_group: "Writing programs"
---

# 9. Call TEC-OS

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A program that prints a prompt and reads an answer needs console input and
output. The BDOS supplies both through the selected console. Your program can
use the same calls whether text goes to a serial terminal or a board display.

## A COM program and its calls

The CCP loads a `.COM` file at `0100h` and starts its first instruction there.
The file contains code and literal data with no executable header. `ORG $0100`
gives labels the addresses they will have after loading.

The CCP starts the program after processing your command. For console and file
work the program calls the BDOS. The BIOS supplies the device operations
beneath it. This division lets your program exchange text without handling
device ports. Chapter 11 explains direct BIOS calls and their different stack
and input rules. The examples here use the BDOS for both directions.

A BDOS call passes values in Z80 registers. `A`, `B`, `C` and `E` each hold a
byte while the pairs `BC`, `DE` and `HL` hold 16-bit values such as memory
addresses. Put the function number in `C` and call `0005h`. A byte argument
goes in `E` and an address or word argument in `DE`. Calls return byte results
in `A` and word results in `HL`. Thus function 2 takes a character in `E`
while function 9 takes a string address in `DE`. The definition
`BDOS EQU $0005` names the entry address in source.

## Calls, returns and saved values

The program needs a return address for each call. `CALL` stores the following
instruction's address on the stack and enters the routine. `RET` removes that
address and resumes there. `SP`, the stack pointer, addresses this memory. A
call moves it down by two bytes and the matching return moves it up by two.

Program entry has a return address too. Before jumping to `0100h` the CCP
pushes `0000h` onto the inherited stack. A final `RET` reaches the warm-boot
jump at that address and ends the program. Every earlier call must have
returned so the final `RET` reaches the CCP's word.

Save a value before calling the BDOS if you still need it afterwards. CP/M 2.2
guarantees no register across every BDOS call. Only the result documented for
the particular function can be used without a save. TEC-OS switches to an
internal stack during the call and restores your `SP` on return. That
preserves your stack position while allowing register contents to change.

`PUSH` saves a register pair and moves `SP` down by two bytes. `POP` restores
a pair and moves it up by two. Restore pairs in reverse order: `HL` then `BC`
must be popped as `BC` then `HL`. `PUSH AF` preserves `A` together with the
flags.

The inherited stack has 30 bytes below the CCP's return word. A call uses two
until it returns and two saved pairs use another four. Small programs can fit
balanced calls and saves in that allowance. Deeper nesting needs a private
stack. Chapter 11 explains where to put it and how changing `SP` affects
program exit.

## Printing a character or string

Function 2 prints the character in `E`. A text loop still needs its pointer
and count after printing each byte. This fragment saves the pointer in `HL`
and count in `B` before the call. The character is already in `A`:

```asm
        PUSH    HL
        PUSH    BC
        LD      E,A
        LD      C,2             ; print the character in E
        CALL    BDOS
        POP     BC
        POP     HL
```

Both values are available when the loop resumes. Restoring the pairs in
reverse order also balances the stack. Chapter 10 uses this fragment in SHOW's
complete file-reading loop.

Function 9 prints several characters in a call. `DE` points to a string ending
with `$` and the terminator is omitted from output. A carriage return followed
by line feed ends a displayed line. Those bytes are 13 and 10. A zero does not
terminate this call so the string's `DB` data must include the final `"$"`.

## Reading a key or an edited line

Function 1 waits for a key, echoes it and returns its byte in `A`. For a
single-key choice the returned byte is sufficient. Function 10 collects longer
answers with line editing.

Line input needs memory for both the text and its length. Function 10 takes
the buffer address in `DE`. The first byte sets the maximum character count.
The call writes the entered count into the second byte and the characters
after it. A 20-character maximum therefore needs 22 bytes. The count gives the
returned text's length. It does not have function 9's string terminator.

The following program reads an answer and prints a fixed acknowledgement
before returning to the prompt. Saving it as `B:LINE.ASM` supplies the source
for the build below:

```asm
BDOS equ $0005

  org $0100

; Read a line, print GOT and return.
; Takes input from the console.
; Returns through the CCP's word.
; Changes AF, BC, DE and HL.

START:
  ld de,BUF      ; Line input buffer.
  ld c,10        ; BDOS edits the line.
  call BDOS
  ld de,GOT      ; Fixed GOT message.
  ld c,9         ; $ ends this string.
  call BDOS
  ret            ; CCP warm boot.

GOT: db 13,10,"GOT",13,10,"$"
BUF: db 20,0
  ds 20
```

`BUF` contains the two control bytes and room for 20 characters. After input
the program reloads `DE` and `C` for function 9 because their earlier values
need not survive. `GOT` supplies a fixed acknowledgement. The input remains in
`BUF` and is not printed again. The final `RET` uses the CCP's inherited
return word.

On drive B, `TAS LINE` builds LINE.COM from that source. The serial capture
starts with the build:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card line.img B: 'TAS LINE' '@start LINE' HELLO. Console excerpt from TAS LINE. -->
```text
B:WORK>TAS LINE
LINE.COM written
```

Running `LINE` and entering `HELLO` followed by Return continues the same
capture:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card line.img B: 'TAS LINE' '@start LINE' HELLO. Console excerpt from LINE. -->
```text
B:WORK>LINE
HELLO
GOT

B:WORK>
```

The displayed `HELLO` is function 10's input echo. Its buffer receives count 5
and the five letters. Function 9 then prints `GOT` and the final `RET` reaches
warm boot through `0000h`.

Return, line feed or a full buffer ends function 10's input. Backspace removes
the last character, `^X` erases the line and `^R` reprints it. A `^C` ends the
program only on an empty line. It is ignored within a nonempty line. History
recall belongs to the CCP prompt so `^W` and `^N` are ordinary input bytes in
a program's function-10 call.

## Input while output is running

Functions 1, 2, 9 and 10 expand tabs to the next eight-column stop measured
from the last carriage return. They also copy output to the list device while
`^P` enables that copy. The list device is CP/M's printer interface. TEC-OS
normally discards its bytes so toggling the copy has no visible effect unless
that routine has been replaced.

| Key | Effect |
| --- | --- |
| `^P` | Turns the copy of console output to the list device on or off |

Output calls also let you pause a long display. Functions 2 and 9 check for
input before each printed character. `^S` pauses until another key. Resuming
with `^C` ends the program through warm boot. Any other resume key is
consumed. A `^P` received outside the pause toggles the list copy as it does
during line input.

An ordinary key received during output is retained for the next BDOS console
read. Output continues without reading further keys until that byte has been
consumed. Its single-byte capacity cannot store a stream typed while the
program is busy.

## Direct input and the console functions

An interactive program can use function 6 to handle keys without echo or line
editing. With `E = FFh` it polls input, returning a waiting byte in `A` or
zero. The call neither waits nor echoes. Every other value of `E` is printed
directly without BDOS tab expansion, pause checking or list copy. Both forms
suit a full-screen program but the selected console still interprets its own
control bytes. Chapter 17 explains that terminal processing.

Function 11 checks readiness while leaving input available for a later BDOS
read. It returns `A = 1` when a key is waiting and 0 otherwise. Internally it
can read the key and retain it in the BDOS reserve. These calls cover the
console operations used here:

| Function | Name | Takes | Returns |
| --- | --- | --- | --- |
| 1 | Console input | nothing | `A`: the next key, which is also printed |
| 2 | Console output | `E`: the character | nothing |
| 6 | Direct console I/O | `E`: FFh to read or a character to print | for FFh, `A`: the key or 0 if none is waiting |
| 9 | Print string | `DE`: the string, ended by `$` | nothing |
| 10 | Read console buffer | `DE`: the buffer | the line in the buffer |
| 11 | Console status | nothing | `A`: 1 if a key is waiting, else 0 |

Appendix A gives the full register and result contracts for every BDOS
function.

## Returning to the prompt

An ordinary exit normally restores the starting drive and user area for the
next prompt. An unavailable drive falls back to A.

With the inherited stack balanced, a top-level `RET` ends the program through
warm boot. A jump to `0000h` or BDOS function 0 has the same destination.
Console input and error handling also reach warm boot in these cases:

- `^C` while a function-10 line is empty.
- `^C` after `^S` has paused output through function 2 or 9.
- A key pressed after a default-mode BDOS error such as
  `Bdos Err On B: Bad Sector`.

These last three exits pass through the BDOS abort path. They have different
consequences for an unfinished command chain, explained in Chapter 13. Chapter
10 describes disk errors and the modes that return them to your program.

Warm boot rebuilds the low-memory jumps and restarts the CCP while retaining
installed services and console selection. It flushes pending card writes
before another program loads. A successful flush puts those bytes on the card.
A failed flush drops the failed cache lines and reports `Write lost`. Chapter
16 traces that sequence.

