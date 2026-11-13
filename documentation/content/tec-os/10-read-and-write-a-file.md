---
title: Read and write a file
parent: TEC-OS
nav_order: 10
nav_group: "Writing programs"
---

# 10. Read and write a file

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A file call needs both a name and a place in memory for the data. The BDOS
keeps the file's position in a file control block and transfers its data a
record at a time. You can use the name prepared from your command line,
then read the records or make a new file and write them.

## The name from your command line

`SHOW HELLO.ASM` names a program and the file it should print. The CCP
starts SHOW at `0100h`, as in Chapter 9. Before that entry it prepares
arguments in *page zero*, the first 256 bytes of memory, at `0000h–00FFh`.
Those bytes are below your code and include the BDOS call jump you already
use at `0005h`.

The *command tail* is the text after the program's name. Its length is at
`0080h` and its characters start at `0081h`. They include the space before the
first argument. The CCP converts letters to capitals before entry so
`SHOW b:hello.asm x` gives a length of 14 and the text ` B:HELLO.ASM X`. A zero
follows the tail's last character.

A file call takes separate drive, name and type fields. The CCP prepares
the first argument as a *file control block*, or FCB, at `005Ch`.
It is a 36-byte block through
which the BDOS identifies a file and maintains the state of its operations.
For a program taking one file name, this default FCB supplies the name
already separated into fields.

Its first byte is the drive: 0 for the current drive or 1 to 16 for A to P.
The next eight bytes are the name and the next three its type, both padded
with spaces. For `SHOW b:hello.asm x`, the first byte is 2, for B, followed
by `HELLO   ASM`. There is no full stop in those eleven name/type bytes.
The BDOS works in the current user area on that drive. The drive codes
represent CP/M's range, although a drive without a mounted volume gives
a selection error.

The second argument has its name fields at `006Ch`. In the same example,
its first sixteen bytes begin with 0 and `X`, padded with spaces. These
are overlapping defaults, not two independent 36-byte work areas. Using
the first FCB changes bytes occupied by the second. A program using both
names copies the second default's first sixteen bytes into its own cleared
36-byte FCB before opening the first file. The copied name survives later
file operations and reuse of the command-tail space.

## A file's position in the FCB

A name occupies only the first twelve FCB bytes. The remaining twenty-four
are needed too, even when your source provides its own name. The BDOS
transfers file data in 128-byte units called *records*. Its position fields
select the next record and describe the file's allocated space.

| FCB byte offset | Contents |
| --- | --- |
| 0 | Drive code, 0 for current or 1 to 16 for A to P |
| 1–8 | Eight name bytes, padded with spaces |
| 9–11 | Three type bytes, padded with spaces |
| 12 | `EX`, the low part of the extent number |
| 13 | `S1`, reserved bookkeeping space, initially zero |
| 14 | `S2`, the higher extent bits and BDOS state flags |
| 15 | `RC`, the record count for the current extent |
| 16–31 | The sixteen-byte allocation map maintained by the BDOS |
| 32 | `CR`, the current sequential record |
| 33–35 | `R0`, `R1` and `R2`, the random-record field |

The sequential position is split between an *extent*, a group of 128
records, and the record within it. `EX` and `S2` identify the extent.
`CR` selects its next record, normally 0 to 127. At the boundary the BDOS
moves to the next extent as needed. You keep the complete FCB between
calls so those updates and its allocation map remain available.
Appendix A gives the full field contracts and random-record operations.

For the default FCB, byte 32 is at `007Ch`. The CCP clears it before entry.
SHOW clears it again before the first read. When constructing another FCB,
clear its state after the drive/name/type fields and set `CR` to 0.
Opening an FCB leaves `CR` unchanged. Setting it to 0 rewinds only the
current extent. To reread the whole file after advancing through extents,
reset `EX`, `S2` and `CR` to 0 before reopening it. `CR` here means
current record, not the carriage return character used in text.

## A record buffer

The FCB holds file state while the bytes being read or written go through a
separate memory buffer. The BDOS calls this the *DMA address*. It is a transfer
address in your memory, not a request to program a hardware DMA controller.
Initially it is `0080h`, with room for one 128-byte record. Function 26 changes
it to the address supplied in `DE`.

That default buffer occupies the same space as the command tail. The first
record read there replaces the tail's length and characters. A program
that still needs its original argument text copies it elsewhere before
reading. SHOW needs the parsed FCB instead, which ends before `0080h`.
Its name and sequential state therefore survive the record transfer.

Function 15 opens the file named by the FCB in `DE`. On success the BDOS
copies the relevant directory fields and allocation map into it. The result
in `A` is 0 to 3, identifying the entry's slot in a directory record.
`FFh` means no matching file extent was found. Testing for zero alone would
reject some successful opens.

Function 20 reads the next record into the DMA buffer and advances the
FCB's current record. Its ordinary result is 0 for a record read or 1
when there is no next record. These are the two file calls SHOW uses:

| Function | Name | Takes | Returns |
| --- | --- | --- | --- |
| 15 | Open file | `DE`: the file's FCB | `A`: FFh if there is no such file |
| 20 | Read sequential | `DE`: the file's FCB | `A`: 0 for a record read, 1 at the end of the file |

A disk I/O error has a separate path, described below. Process the DMA
buffer only after a successful read. Otherwise it may still hold old data.
With the default error mode, a disk error prints a message, waits for a key
and ends the program by warm boot. SHOW below uses that default.

SHOW only reads so it leaves no changed file state to close. A program that
writes must close its updated FCB before finishing. Warm boot flushes pending
writes from the block cache but cannot close the program's FCBs. The write
sequence after SHOW explains how to finish both operations and check them.

## SHOW reads a text file

SHOW uses the default FCB and DMA buffer to print the file named after
its command. Its complete listing is:

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

After open, `INC A` turns `FFh` into zero and sets the zero flag.
`JR Z` branches to `NOFILE` when that flag is set.
A successful open continues to `NEXT`. Each iteration reloads `DE` and `C`
for function 20 rather than depending on registers left by the previous
call. A zero read result starts `PUT` with the buffer address in `HL` and
128 bytes to process in `B`.

`PUT` passes each character in `E` to function 2. It saves `HL` and `BC`
on the stack before the call and restores them in reverse order afterwards,
using the convention from Chapter 9. Those saves preserve the pointer and
count while the BDOS changes registers. The loop then advances the pointer
and returns for another record after processing all 128 bytes.

A CP/M file occupies a whole number of records. Text commonly ends inside
the final record with `^Z`, byte `1Ah`. SHOW tests for it before printing
each byte. A text file with no `^Z` ends only when function 20 returns 1.
`tecvol put --text` appends the marker and fills the rest of the last
record with it as well.

`NOFILE` prints `No such file` with function 9. Its `JP BDOS` uses the
inherited return word instead of adding another return address with CALL.
The BDOS returns through that word and the program ends. SHOW with no
argument has a blank name in its FCB, finds no file and prints the same
message. Reporting success or failure to a later command is a separate
return-code convention explained in Chapter 13.

### The card and output

TAS assembles SHOW to 72 bytes. Its `work.img` is the HELLO starter-card
copy, whose preparation is in Chapter 27, and `hello.asm` is that HELLO
source, not the banner exercise. These commands, run in the repository
root with the TAS host prepared, assemble SHOW on the PC and add it and the
text file to that card:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { assembleProgram } from "./tools/lib/assemble.mjs";
const [src, out] = process.argv.slice(1);
writeFileSync(out, (await assembleProgram(src)).bytes);
' show.asm show.com
node tools/tecvol.mjs put work.img B show.com
node tools/tecvol.mjs put work.img B hello.asm --text
```

The capture contains both the successful read and the missing-file case:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card work.img B: 'SHOW HELLO.ASM' 'SHOW NOSUCH.TXT'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>SHOW HELLO.ASM
; HELLO: print a line and return to the CCP.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MESSAGE      ; the string, ended by $
        LD      C,9             ; BDOS function 9: print a string
        CALL    BDOS
        RET                     ; back to TEC-OS
MESSAGE:DB      "Hello from the TEC-1G",13,10,"$"

B:WORK>SHOW NOSUCH.TXT
No such file

B:WORK>
```

The first output repeats the HELLO source. The second prints SHOW's own error
message. The blank line before each returned command prompt is the command
processor's new line after a program exit.

## Making and writing a file

Writing uses an FCB and a DMA buffer in the same way but the state must reach
the directory before the program finishes. For a new file, prepare all 36 FCB
bytes: the drive, the space-padded name/type and zeroed state. Choose a name
that is not already present. Function 22, make file, creates a directory entry.
It is not a replace-file command.

For example, a source-derived write sequence for a new `NOTE.TXT` can use
drive code 0 followed by the name bytes `NOTE    TXT`. The following calls
assume that FCB and a separate 128-byte buffer already exist in the
program's memory. Each call reloads its inputs and checks its returned
result before continuing:

| Step | Call and required result |
| --- | --- |
| Make the new file | `C = 22`, `DE` = FCB address. Accept `A` from 0 to 3. `FFh` means no directory entry was available |
| Select the data buffer | `C = 26`, `DE` = the 128-byte buffer's address |
| Write a record | `C = 21`, `DE` = FCB address. Continue only for `A = 0` |
| Finish the file state | `C = 16`, `DE` = FCB address. Close succeeds for `A` from 0 to 3. `FFh` means the extent's entry was not found |
| Flush pending card writes | `C = 48`. `A = 0` reports success. `FFh` reports a failed flush |

The write transfers all 128 buffer bytes, including any unused end.
For a text line of two letters followed by CR and LF, four bytes hold
the line and the remaining 124 can be `1Ah`. Binary data instead uses the
whole record as data, with no special meaning assigned to `1Ah` by the
file calls. This is a call walkthrough, not a newly captured program run.

Function 21 advances `CR` after a successful write and updates the record
count and allocation state. The next call writes the next sequential
record. Fill the buffer again for each record. The DMA address remains
selected until changed. The ordinary write results are 0 for success,
1 when the directory cannot hold the next extent and 2 when no disk block
is available. A failed write is not counted as a successfully stored record.

## Close, flush and errors

Closing a modified file copies its updated record count and allocation
state to the directory. Flushing writes pending cache contents to the card.
The two operations have different inputs: a flush cannot recover file
state that was left only in an unclosed FCB. Warm boot flushes the cache
but does not close the FCBs in a departed program's memory.

On every volume, TEC-OS writes every changed or kept data line
before writing a directory block. A successful close that issues such a
write therefore performs that ordering. An
unmodified FCB can close without a directory write. Function 48 provides
an explicit flush boundary for pending writes after the file state has
been closed. Chapter 19 explains the cache's ordering and failure paths.

On any drive other than the logged drive, TEC-OS holds one pending
block. A write returns once its record is in that block's cache line, and
the block reaches the card at the next close, directory request, write to
another block, console read, function 48 or warm boot. A program that writes
a file and then waits for a key therefore leaves nothing unwritten while it
waits. A reset before one of those points loses at most that block's
records (`docs/recovery.md:98-138`).

A write that returns 1 or 2 may follow earlier successful records. Close
the partial file and check the close result before reporting how much was
written. A close failure does not make the intended file complete. A
returned disk error also needs handling before you can report partial
progress.

By default, a disk error prints `Bdos Err On`, the drive and the cause.
The BDOS then waits for a key and ends the program by warm boot.
Function 45 can request returned errors instead. With `E = FFh`,
the error returns as `A = FFh` and a code in `H` without printing.
With `E = FEh`, the message is printed first and the same values return.
Appendix A lists the causes and full contracts.

The unchanged SHOW listing uses the default error mode. Its nonzero read
result ends the program. If adapting it to returned disk errors, distinguish
an error return from ordinary end of file before treating the buffer as
valid or reporting success. The BDOS resets error mode at warm boot.

A program can also set file attributes through function 30 using the
corresponding bits in the FCB's name/type fields. That is how a program can
set the system attribute discussed with DIR. Attribute operations still require
checking their result. Appendix A gives their exact bit meanings.

At an ordinary exit, a successful warm-boot flush puts pending changes
on the card before another program loads. If a write fails there, TEC-OS
drops the failed cache lines, reports `Write lost` and cancels the remaining
command line. Explicit function 48 also reports failure, and keeps a failed
line for the next flush, so only warm boot drops a line that still fails
(`docs/recovery.md:75-96`). A later successful flush cannot restore bytes
from a line already dropped. A reset discards pending cached changes rather than finishing
unclosed work.
