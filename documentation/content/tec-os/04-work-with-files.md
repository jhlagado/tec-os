---
title: Work with files
parent: TEC-OS
nav_order: 4
nav_group: "Using the machine"
---

# 4. Work with files

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A saved source file can be read, copied or renamed without rebuilding its
program. You can keep an original and edit a copy, then erase the copy
when it is no longer useful. The file listing identifies names before
you change them. BANNER.ASM and its outputs can remain on B throughout.

## Names in a listing

`DIR` lists the current drive's files. `DIR B:` lists B while leaving
the current drive selected. The startup shell displays each file on a
row with its size in bytes.
The totals below give the file count, combined bytes and free space
for that drive and volume. `NO FILE` means no visible file matched.
`DIR /W` selects the ROM's wide listing instead.

Names follow the same form as BANNER.ASM: up to eight characters, a full
stop and a type of up to three characters. You can omit the full stop and
type. A drive prefix selects another location, so `A:SAMPLE.ASM` refers
to the supplied source on A. Without a prefix, the current drive applies.
TEC-OS processes DIR as a command without loading a program file.
Running TAS instead reads its COM file from the card.

Wildcards select a group of files for a listing. `DIR B:*.ASM` lists B's
ASM files. `*` matches the rest of the name or type containing it and `?`
matches a character at its position. `G*.*` therefore matches names
beginning with G, with any type. TYPE, COPY and REN require unambiguous
names. [Appendix J](appendix-j-command-reference.md) gives the complete
name and wildcard rules.

## Read a text file

`TYPE A:SAMPLE.ASM` displays the supplied source without changing it.
TYPE stops at the first `^Z` text-end marker or the end of the recorded
contents. Displaying a file neither assembles its source nor executes
commands written in it.

`STARTUP.CMD` is short enough to display before the next prompt. It
contains the two automatic startup commands from Chapter 1. This serial
terminal run is separate from both your BANNER session and the later
40-column capture:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'TYPE STARTUP.CMD'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>TYPE STARTUP.CMD
SHELL.SVC
GLCD.SVC

A:SYSTEM>
```

The file's carriage returns and line feeds end each displayed line.
The command processor adds the blank line before the prompt. A missing
file or omitted name produces `NO FILE`. Correcting a mistyped name and
trying TYPE again changes no file.

## Read a screenful

SAMPLE.ASM needs more than a screenful. The startup shell pauses TYPE
and DIR at `[more]` so you can read before continuing. On the prepared
40-column PICO console, 23 listing rows precede the pause. A long source
line can wrap across several rows. Without `SHELL.SVC`, as after the
startup bypass in Chapter 8, these commands continue to the end without
pausing.

The first paused screen contains these 24 rows. The typed command has
already scrolled off the display:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'TYPE A:SAMPLE.ASM'. The full screen, with trailing empty rows omitted. -->
```text
; A first program for TEC-OS. Build it
; with TAS SAMPLE. Run it with SAMPLE.

; Say hello through CP/M BDOS, then
; check for the TEC-OS ABI 5 table.
; Print the screen size, write to LCD
; row 2, show 123456 and beep.

; TEC-OS's table and service numbers use
; the names from abi.inc. ABITAB points
; to "TNA", then the major version.

ABITAB    EQU   $C003

; The major version this speaks: 5.

ABIMAJ    EQU   $C006

; CALL here with the service in C.

ABICALL   EQU   $C008

; INFO returns L=columns, H=rows.
[more]
```

Space clears the pause and displays the next rows. The complete next
paused screen is:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'TYPE A:SAMPLE.ASM' '@key  '. The full screen; trailing empty rows omitted. -->
```text

TNINFO    EQU   0

; HL points to six digit patterns.

TNDIGIT   EQU   1

; B=row 0-3, HL points to 20 characters.

TNLCD     EQU   2

; B=pitch, DE=length.

TNTONE    EQU   4

; CP/M's entry for the console.

BDOS      EQU   5

; CP/M runs a program from here.

  ORG $0100

[more]
```

Space continues at each pause until the end. Esc, Q, q or `^C` ends
the listing before the remaining text. Each clears `[more]` from the screen.

Two prompt keys can help with the line you are typing. `^R` marks it
with `#` and reprints it on a new line. `^E` starts a new screen line
without discarding the command. Both affect the display, leaving stored
files unchanged.

## Copy, rename and selectively erase

COPY creates a second file. Its destination can specify a new name, a
drive or both. A drive alone, as in `COPY STARTUP.CMD B:`, keeps the
source's name. COPY and the DEL command below require the startup shell.
Without it, TEC-OS searches for programs with those names and normally
prints `COPY?` or `DEL?`. An existing destination of that name is erased before the
replacement is made. Check the source and destination before copying over work
you need to keep.

A working copy of SAMPLE's source on B gives you a file of your own to read
or edit. `COPY A:SAMPLE.ASM B:SAMPLE.ASM` names both source and destination.
Keep an existing B:SAMPLE.ASM rather than overwriting it for this exercise.

This capture uses a fresh starter card with B empty. It is separate
from the BANNER session. The command writes only B:SAMPLE.ASM, whose
name differs from the BANNER files on your working card:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'COPY A:SAMPLE.ASM B:SAMPLE.ASM'. The full screen, with trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>COPY A:SAMPLE.ASM B:SAMPLE.ASM
COPIED 0024

A:SYSTEM>
```

The hexadecimal count `0024` means 36 records of 128 bytes. These
records contain the 4,485-byte SAMPLE.ASM, including line endings and
its end marker. The source stays on A. `TYPE B:SAMPLE.ASM` displays
the copy without selecting B as the current drive.

REN changes a file's name on its existing drive. `REN NEW=OLD` puts
the new name first, with no spaces around `=`. An existing new name
produces `FILE EXISTS` and leaves both files unchanged. ERA removes
a named file or prints `NO FILE` for an absent one. The shell's DEL
command invokes ERA with the same arguments.

The following complete example begins on a separate starter card with
B empty. It does not contain BANNER.ASM, BANNER.COM or BANNER.DBG. Read it as
that separate session, not as a sequence to repeat on your current card. It
copies A's STARTUP.CMD under two names, renames one copy and erases only
NOTES.TXT. The listings and free-space figures belong to that card:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'COPY STARTUP.CMD B:' 'COPY STARTUP.CMD B:COPY.TXT' B: DIR 'REN NOTES.TXT=COPY.TXT' 'REN NOTES.TXT=STARTUP.CMD' DIR 'ERA NOTES.TXT' 'ERA NOTES.TXT' DIR. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>COPY STARTUP.CMD B:
COPIED 0001

A:SYSTEM>COPY STARTUP.CMD B:COPY.TXT
COPIED 0001

A:SYSTEM>B:
B:WORK>DIR

STARTUP .CMD     128
COPY    .TXT     128
2 files, 256 bytes
8364032 free on B:WORK
B:WORK>REN NOTES.TXT=COPY.TXT
B:WORK>REN NOTES.TXT=STARTUP.CMD
FILE EXISTS
B:WORK>DIR

STARTUP .CMD     128
NOTES   .TXT     128
2 files, 256 bytes
8364032 free on B:WORK
B:WORK>ERA NOTES.TXT
B:WORK>ERA NOTES.TXT
NO FILE
B:WORK>DIR

STARTUP .CMD     128
1 file, 128 bytes
8368128 free on B:WORK
B:WORK>
```

`COPIED 0001` means a 128-byte record was copied. `000A` would mean ten
records, 1,280 bytes. This count describes transferred records. The card
allocates storage in larger units, explained in
[Cards on the PC](06-cards-on-the-pc.md#record-sizes-and-allocated-space).

The first REN renames COPY.TXT to NOTES.TXT. The second changes nothing
because NOTES.TXT already exists. ERA then removes NOTES.TXT and its
repetition reports `NO FILE`. STARTUP.CMD remains on B and the original
on A is unchanged.

On your working card, retain BANNER.ASM, BANNER.COM and BANNER.DBG. Use an exact
name when erasing a disposable copy. A selective pattern such as `*.TXT` is
erased without a confirmation question so it can remove more than one file.
Checking it with DIR first helps you avoid erasing a file you meant to keep. The
all-files erase form and its confirmation grammar are in
[Appendix J](appendix-j-command-reference.md#era).

## Recognise a failed file command

A command can fail because a file is missing, a destination name is
already used or an argument is invalid. These cases do not establish
card damage. The messages distinguish them:

| Message | Meaning for these commands |
| --- | --- |
| `NO FILE` | DIR matched no visible file or TYPE, REN or ERA found no file. TYPE with no name gives it too. |
| `FILE EXISTS` | REN's new name already exists. Nothing is renamed. |
| `NAME?` | A command name or argument is invalid or a named program could not be found or loaded. |
| `NO SOURCE` | COPY did not find its source. |
| `CANNOT MAKE DEST` | COPY could not make the destination. An old destination may already have been erased. |
| `WRITE ERROR` | COPY could not write a record and attempted to close the partial destination. |
| `CLOSE ERROR` | COPY could not close the completed copy. |

The word before `?` may be the invalid argument. TYPE with a wildcard
prints that argument, whereas COPY prints `COPY?`. Appendix J lists
the exact grammar and other built-ins.
[Appendix D](appendix-d-error-messages.md) gives complete messages, causes
and recovery actions.

After COPY's `WRITE ERROR`, a successful close preserves the records already
written. The message does not prove that the close succeeded. Check a failed
copy before you depend on it. Keep the source until the copied file has been
checked.

A card-operation failure can instead produce `Bdos Err On`, a drive letter and a
cause such as `Bad Sector`, `Select`, `R/O` or `File R/O`. In the normal command
environment it waits for a key before ending the command. The warm boot restarts
the command processor. Repeating an erase or copy can change more files or
replace an incomplete destination. Keep the card and any recoverable original
while checking the cause in Appendix D. Pending-write failures and recovery are
explained there without assuming that every failed operation was rolled back.
