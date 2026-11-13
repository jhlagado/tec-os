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

SHOW will print the text file named on its command line. To read it the
program needs a file name, a position within the file and memory for the
incoming bytes. The BDOS keeps the name and position in a file control block.
It transfers the data separately in fixed-size records. Writing uses the same
two pieces of storage.

## The name from your command line

In `SHOW HELLO.ASM`, SHOW is the program and HELLO.ASM is its argument. The
CCP prepares that argument before starting SHOW at `0100h`. Its argument
storage is in *page zero*, the first 256 bytes at `0000h–00FFh`. This is below
the program and includes the BDOS jump at `0005h` used in Chapter 9.

The text after the program name is the *command tail*. Its length is at
`0080h` and its characters begin at `0081h`, including the leading space. The
CCP capitalises letters before program entry. Thus `SHOW b:hello.asm x`
supplies length 14 and text ` B:HELLO.ASM X`, followed by a zero.

The BDOS needs a drive, name and type in separate fields. For the first
argument the CCP has already separated them into a *file control block*, or
FCB, at `005Ch`. The full FCB occupies 36 bytes. File calls use it to identify
the file and retain operation state between calls. A program with a file-name
argument can start with this default FCB.

The drive byte is 0 for the current drive or 1 to 16 for A to P. Eight
space-padded name bytes follow it and then three type bytes. The example's
drive byte is 2 for B. Its eleven name and type bytes have this layout in
memory:

```text
HELLO   ASM
```

No full stop separates those fields. The file belongs to the current user
area on that drive. These drive codes cover CP/M's range but selecting an
unmounted drive produces a selection error.

The CCP also parses the second name at `006Ch`. For the example its first
sixteen bytes begin with 0 and a space-padded `X`. This default overlaps the
first FCB. It is not another independent 36-byte buffer. File operations on
the first FCB change some of those bytes. A program using both names must copy
the second default's first sixteen bytes into its own cleared 36-byte FCB
before opening the first. That copy also survives reuse of the command tail.

## A file's position in the FCB

Reading needs more than the twelve name bytes. A complete FCB includes another
twenty-four bytes for file state. The BDOS transfers 128-byte units called
*records*. Position fields identify the next record while other fields
describe allocated storage:

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

Sequential position combines an *extent* of 128 records, identified by `EX`
and `S2`, with a record within it. `CR` selects the next record within it,
normally 0 to 127. The BDOS advances to another extent at the boundary.
Retaining the full FCB between calls preserves this position and the
allocation map. Appendix A explains the fields and random-record operations.

In the default FCB, `CR` is byte 32 at `007Ch`. The CCP clears it before entry
and SHOW clears it again before reading. A newly constructed FCB needs zeroed
state after its drive/name/type fields and `CR = 0`. Open leaves `CR`
unchanged. Clearing that byte rewinds the current extent only. To reread from
the start after crossing extents, clear `EX`, `S2` and `CR` before reopening.
The FCB field is the current record. The abbreviation for a text carriage
return has a different meaning.

## A record buffer

File state stays in the FCB while transferred bytes go through a separate
buffer. The BDOS calls the buffer's address the *DMA address*. Despite the
historical name this is a memory transfer address, not a hardware DMA request.
Its initial value is `0080h`, with space for a 128-byte record. Function 26
selects another buffer using the address in `DE`.

A first read into the default buffer overwrites the command tail. Copy any
argument text still needed before reading. SHOW only needs the parsed FCB,
which ends below `0080h`, so its name and file position survive the transfer.

Function 15 opens the file through the FCB address in `DE`. It copies
directory fields and the allocation map into the FCB. A successful result in
`A` is 0 to 3, the entry's slot in a directory record. `FFh` reports no
matching file extent. A test for zero alone would wrongly reject three
successful results.

Function 20 reads the next record into the selected DMA buffer and advances
the FCB position. It returns 0 for a read or 1 when no next record exists.
SHOW uses these calls:

| Function | Name | Takes | Returns |
| --- | --- | --- | --- |
| 15 | Open file | `DE`: the file's FCB | `A`: FFh if there is no such file |
| 20 | Read sequential | `DE`: the file's FCB | `A`: 0 for a record read, 1 at the end of the file |

Only a successful read supplies valid buffer data. Any other result can leave
bytes from an earlier transfer. Disk I/O errors have the separate path
described below. Under the default error mode used by SHOW, an error prints a
message, waits for a key and ends the program through warm boot.

SHOW leaves file data unchanged so its FCB needs no close. A writer must close
its FCB before exiting. Warm boot flushes cached writes but cannot close FCBs
left in the program's memory. The write sequence below separates those
completion steps.

## SHOW reads a text file

The complete SHOW program reads through the default FCB and DMA buffer, then
prints the characters it receives:

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

After open, `INC A` turns failure's `FFh` into zero and sets the zero flag for
`JR Z,NOFILE`. Success continues at `NEXT`. The loop reloads `DE` and `C` for
every function-20 call. It uses no register value left over from the earlier
call. A zero result starts `PUT` with `HL` pointing to DMA and `B` counting
128 bytes.

For each byte `PUT` calls function 2 with the character in `E`. Its `PUSH` and
`POP` pairs preserve `HL` and `BC` as explained in Chapter 9. The pointer and
count therefore remain available after output changes registers. After all 128
bytes the program reads another record.

CP/M files contain whole records but text can finish partway through the last.
The conventional marker is `^Z`, byte `1Ah`, which SHOW tests before printing.
Without that marker SHOW continues until function 20 returns 1. The PC command
`tecvol put --text` appends `^Z` and pads the final record with it.

`NOFILE` prints `No such file` through function 9. Its `JP BDOS` adds no stack
word so the routine returns through the inherited CCP address and ends SHOW.
With no argument the default name is blank and produces the same message. This
message alone does not report failure to a later command. Chapter 13 explains
that return-code convention.

### The card and output

The PC assembly recipes here and in Chapter 11 require a prepared TAS host
and matching distribution files. [Chapter 27's tool
preparation](27-build-the-rom-and-media.md#prepared-tools-and-selected-assembler)
describes the host setup and [its media
preparation](27-build-the-rom-and-media.md#matching-the-rom-and-media) supplies
`dist/`. The [HELLO
setup](27-build-the-rom-and-media.md#hello-through-ted-and-tas) creates
`work.img` and provides `hello.asm` for this recipe.

TAS produces a 72-byte SHOW program. The commands below assemble it from the
repository root and add SHOW and HELLO.ASM to that card copy. Here `hello.asm`
is the HELLO source, not the banner exercise:

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

The capture runs SHOW once with that source file and once with a missing name:

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

The first run prints the HELLO source and the second prints SHOW's error text.
After either program exit the command processor emits the blank line before
its next prompt.

## Making and writing a file

A writer must finish the file's directory state as well as transfer its data.
For a new file prepare all 36 FCB bytes with the drive, space-padded name/type
and zeroed state. Choose an unused name. Function 22 creates an entry for a
new file and does not replace an existing file.

For `NOTE.TXT` on the current drive the FCB's drive byte is 0. Its eleven name
and type bytes have this layout in memory:

```text
NOTE    TXT
```

The source-derived sequence below assumes a complete FCB and a separate
128-byte buffer already allocated in the program. Each call reloads its inputs
and checks its result before proceeding:

| Step | Call and required result |
| --- | --- |
| Make the new file | `C = 22`, `DE` = FCB address. Accept `A` from 0 to 3. `FFh` means no directory entry was available |
| Select the data buffer | `C = 26`, `DE` = the 128-byte buffer's address |
| Write a record | `C = 21`, `DE` = FCB address. Continue only for `A = 0` |
| Finish the file state | `C = 16`, `DE` = FCB address. Close succeeds for `A` from 0 to 3. `FFh` means the extent's entry was not found |
| Flush pending card writes | `C = 48`. `A = 0` reports success. `FFh` reports a failed flush |

A write transfers every byte of the 128-byte buffer. A two-letter text line
followed by CR and LF uses four bytes. Its remaining 124 bytes can be `1Ah`. A
binary file uses those bytes as data with no special interpretation of `1Ah`.
This sequence describes calls verified from source. It is not a newly captured
program run.

A successful function 21 updates `CR`, the record count and allocation state.
Refill the buffer before each following write. The DMA address stays selected
until another call changes it. Ordinary write results are 0 for success, 1 for
no directory space for the next extent and 2 for no free disk block. Count a
record as stored only after success.

## Close, flush and errors

Close copies a modified FCB's record count and allocation state into the
directory. Flush transfers pending cache contents to the card. A flush cannot
reconstruct file state left only in an unclosed FCB. Warm boot performs the
flush but does not close FCBs after a program ends.

Directory writes follow data writes on every volume. Every changed or kept
data line reaches the card before its directory block. A close that writes the
directory performs this ordering. An unmodified FCB may close without a
directory write. Function 48 supplies an explicit flush after closing. Chapter
19 explains the cache ordering and failures.

Writes to a drive other than the logged drive share a single pending block.
The call returns when its record reaches that block's cache line. The block is
written at the next close, directory request, write to another block, console
read, function 48 or warm boot. No pending bytes remain during a successful
flush before a key wait. A reset before a flush point loses at most that
block's records (`docs/recovery.md:98-138`).

A write result of 1 or 2 can follow earlier successful records. Close that
partial file and check the close result before reporting progress. A failed
close leaves the intended file incomplete. Handle returned disk errors too
before reporting how much was stored.

Default disk-error handling prints `Bdos Err On` with the drive and cause,
waits for a key and warm-boots out of the program. Function 45 selects
returned errors. With `E = FFh` the call returns `A = FFh` and a code in `H`
without printing. With `E = FEh` it prints first and returns the same values.
Appendix A gives the causes and contracts.

SHOW uses the default mode and exits on a nonzero read result. An adaptation
using returned errors must distinguish failure from ordinary end of file. It
must also avoid processing stale buffer data or reporting success after an
error. Warm boot resets the error mode.

Function 30 sets file attributes through bits in the FCB's name/type fields. A
program can use it to set the system attribute described with DIR. Check its
result as with other file calls. Appendix A defines the attribute bits.

An ordinary exit attempts to flush pending writes before another program
loads. Success puts them on the card. Failure drops the failed cache lines,
reports `Write lost` and cancels the remaining command line. Explicit function
48 also reports failure but retains a failed line for another flush. Only warm
boot drops a line that still fails (`docs/recovery.md:75-96`). A later flush
cannot recover bytes already dropped. Reset discards pending cached changes
and does not finish unclosed work.
