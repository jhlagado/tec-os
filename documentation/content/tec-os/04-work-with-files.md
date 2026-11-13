---
title: Work with files
parent: TEC-OS
nav_order: 4
nav_group: "Using the machine"
---

# 4. Work with files

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

BANNER.ASM and its saved outputs stay on B while you read other text. A listing
helps you choose the file before a command changes it. Long text can be read
a screenful at a time.

## Names in a listing

`DIR` lists files on the current drive. `DIR B:` lists B without changing the
current drive. Each entry gives a name and a type, such as `BANNER.ASM`. Names
appear in columns fitted to the console. The final line reports the number
listed and the drive's free space in KiB. A KiB is 1,024 bytes.
`NO FILE` means that no visible file matched the request.

A name has up to eight characters followed by a full stop and a type of up to
three characters. Both the full stop and type can be omitted. A drive letter
and colon select a file on another drive: `A:SAMPLE.ASM` names the supplied source
on A. Without that prefix a name refers to the drive in your prompt. DIR is
built into the command processor that runs each line you enter. TAS is a
program stored on the card.

A wildcard lets you narrow a listing without typing every complete name.
`DIR B:*.ASM` lists B's files with type ASM. The `*` matches the rest of the
name or type in which it occurs. `?` matches one character in its position. For
example, `G*.*` matches names beginning with G, whatever their type. TYPE, COPY
and REN each require unambiguous names instead of a wildcard pattern.
[Appendix J](appendix-j-command-reference.md) gives the complete name rules and
wildcard forms.

## Read a text file

`TYPE A:SAMPLE.ASM` prints the supplied source without changing it. TYPE reads
text until its first `^Z` end marker or the end of its recorded contents. It
does not assemble the source or run commands found in a file.

A short file fits before the next prompt. `STARTUP.CMD` holds the two
automatic startup commands of Chapter 1. This run on the serial terminal is
separate from your BANNER session and the 40-column screen below:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'TYPE STARTUP.CMD'. Complete captured console transcript. -->
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

The file's carriage returns and line feeds end its lines. The extra blank
line before the prompt is printed by the command processor. TYPE with a missing file
or no name prints `NO FILE`. A mistyped name therefore gives you a chance to
check the spelling and try again without changing a file.

## Read a screenful

SAMPLE.ASM is longer than one screen. TYPE and DIR pause with `[more]` on the
last row rather than scrolling the whole listing away. The pause is the
shell's, `SHELL.SVC`, which the startup file loads. Without the shell, as
after the startup bypass of Chapter 8, they list to the end without
pausing. A long text line that
wraps at the right edge uses more than one screen row. The prepared 40-column
PICO console shows 23 rows of listing before the pause.

These 24 rows are the complete first paused screen. The command echo has
already scrolled away:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'TYPE A:SAMPLE.ASM'. Full screen; trailing empty rows omitted. -->
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

Space continues the listing. The pause disappears and the next rows follow. The
next excerpt contains the full following paused screen, including `[more]`:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'TYPE A:SAMPLE.ASM' '@key  '. Full screen; trailing empty rows omitted. -->
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

Space continues at each pause until the text ends. Esc, Q or q stops a listing
before its unread remainder. `^C` stops there too. Each of these keys erases
`[more]`.

`^R` at the command prompt marks a hard-to-read line with `#` and reprints
it on a new line. `^E` starts a new screen line while leaving the command
being typed intact. Neither key changes a stored file.

## Copy, rename and selectively erase

COPY makes another file from a source. COPY, and DEL below, are commands of
the shell. Without it, typing either one looks for a program of that name
and normally gives `COPY?` or `DEL?`. The destination can give a new name, a
drive or both. With a drive alone, as in `COPY STARTUP.CMD B:`, the copy keeps
the source's name. An existing destination of that name is erased before the
replacement is made. Check the source and destination before copying over work
you need to keep.

A working copy of SAMPLE's source on B gives you a file of your own to read
or edit. `COPY A:SAMPLE.ASM B:SAMPLE.ASM` names both source and destination.
Keep an existing B:SAMPLE.ASM rather than overwriting it for this exercise.

The copy below starts at A on a fresh starter card with B empty.
It is separate from the BANNER session. On your working card, BANNER's files
have different names. This command writes only B:SAMPLE.ASM:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico --screen 'COPY A:SAMPLE.ASM B:SAMPLE.ASM'. Full screen; trailing empty rows omitted. -->
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

The count after `COPIED` is hexadecimal. Here `0024` means 36 records of
128 bytes. On the starter card SAMPLE.ASM occupies 4,485 bytes with its line
ends and end marker, which fits in 36 records. The source on A remains in place. `TYPE B:SAMPLE.ASM` reads the
new copy without changing the current drive.

REN changes a name on the same drive. Its form is `REN NEW=OLD`, with the new
name first and no spaces around `=`. ERA removes the named file. The shell's
DEL is another name for ERA: the shell hands the command to ERA. A rename to an
existing name gives `FILE EXISTS` and changes nothing. Erasing a name that is
absent gives `NO FILE`.

The following complete example begins on a separate starter card with
B empty. It does not contain BANNER.ASM, BANNER.COM or BANNER.DBG. Read it as
that separate session, not as a sequence to repeat on your current card. It
copies A's STARTUP.CMD under two names, renames one copy and erases only
NOTES.TXT. The listings and free-space figures belong to that card:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'COPY STARTUP.CMD B:' 'COPY STARTUP.CMD B:COPY.TXT' B: DIR 'REN NOTES.TXT=COPY.TXT' 'REN NOTES.TXT=STARTUP.CMD' DIR 'ERA NOTES.TXT' 'ERA NOTES.TXT' DIR. Complete captured console transcript. -->
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

`COPIED 0001` reports one 128-byte record copied. The count is hexadecimal:
`000A` means ten 128-byte records (1,280 bytes). It counts copied records rather
than space allocated to the file. Space is allocated in larger units, explained
in [Cards on the PC](06-cards-on-the-pc.md#record-sizes-and-allocated-space).

The first REN made NOTES.TXT from COPY.TXT. The next REN left both files alone
because NOTES.TXT already existed. The first ERA removed NOTES.TXT. The repeated
ERA found no such file. STARTUP.CMD remained on B and the source on A was not
renamed or erased.

On your working card, retain BANNER.ASM, BANNER.COM and BANNER.DBG. Use an exact
name when erasing a disposable copy. A selective pattern such as `*.TXT` is
erased without a confirmation question so it can remove more than one file.
Checking it with DIR first helps you avoid erasing a file you meant to keep. The
all-files erase form and its confirmation grammar are in
[Appendix J](appendix-j-command-reference.md#era).

## Recognise a failed file command

A failed command does not always mean a damaged card. A missing file, a taken
name and an invalid argument have different messages:

| Message | Meaning for these commands |
| --- | --- |
| `NO FILE` | DIR matched no visible file or TYPE, REN or ERA found no file. TYPE with no name gives it too. |
| `FILE EXISTS` | REN's new name already exists. Nothing is renamed. |
| `NAME?` | A command name or argument is invalid or a named program could not be found or loaded. |
| `NO SOURCE` | COPY did not find its source. |
| `CANNOT MAKE DEST` | COPY could not make the destination. An old destination may already have been erased. |
| `WRITE ERROR` | COPY could not write a record and attempted to close the partial destination. |
| `CLOSE ERROR` | COPY could not close the completed copy. |

The word before a question mark can be an argument rather than the command. For
example, TYPE with a wildcard names that invalid argument. COPY instead prints
`COPY?`. The exact grammar and remaining built-ins are listed in Appendix J.
[Appendix D](appendix-d-error-messages.md) gives the complete messages, causes
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
