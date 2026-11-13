---
title: Make a small program
parent: TEC-OS
nav_order: 2
nav_group: "Using the machine"
---

# 2. Make a small program

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

You can keep the source for a program on the card and change it whenever
you need a different result. Here you create BANNER, a short greeting
program, in TED. After saving and building it you change the greeting
and run the new version.

## A new source file

The tools are on A and your new file goes on B. At the `A:SYSTEM>` prompt,
`A:TED B:BANNER.ASM` starts TED from A to edit BANNER.ASM on B. The drive
prefixes locate the tool and source separately. Return runs the command.

TED opens an empty editing area for the new file. Its last screen row
shows TED and BANNER.ASM. `L1 C1` is the cursor position, line 1 column 1,
and `*` marks unsaved work. Arrow keys move through the text. Backspace,
also written `^H`, removes the character before the cursor. These keys
now change the source text inside TED.

A semicolon begins a comment, explanatory text for someone reading the
source. Comments and blank lines produce no instructions in BANNER.COM.

This complete source fits the 40-column screen. Enter each line with
Return, including blanks and the final line. The instruction lines
begin with two spaces. Retaining those spaces and the comments beginning
with `;` keeps your file aligned with the positions used below.

<!-- The source the captures below assemble, put on B with tecvol put --text. -->
```asm
  org $0100

; Print one line to the console.
; Takes nothing. Returns to the CCP.
; Changes AF, BC, DE and HL.

START:
  ld de,MSG      ; Text for BDOS.
  ld c,9         ; $ ends the text.
  call 5
  ret            ; CCP warm boot.

MSG: db "Hello from TEC-OS",13,10,"$"
```

The final Return leaves the cursor at `L14 C1`. Blank lines count in
these positions even though they produce no instructions. The next step
uses line 14 to demonstrate a build error.

## A rejected build and its repair

A build translates source text into the program's bytes. An error stops
that translation and gives a position to repair. You can practise that
repair before creating BANNER.COM: type `BROKEN` at line 14 and press
Return. The cursor moves to `L15 C1`. `^S` saves BANNER.ASM and displays
`Saved` on the status row. A saved text file can still contain errors.

`^T B` saves the source and runs TAS for an `.ASM` file. The keys form a
sequence: press Ctrl and T together, release Ctrl and then press B.
Chapter 3 uses the same sequence to build BASIC source with BAZA. This
excerpt shows the rejected build before TED redraws its screen. The initial
screen-clear controls, leading blank line and final editor redraw are omitted:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card banner-broken.img --board pico --screen '@start A:TED B:BANNER.ASM' $'@press \x14B' '@run 400'. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
A:SYSTEM>A:TAS B:BANNER.ASM
BANNER.ASM:14:1: unknown instruction or directive

A:SYSTEM>A:TED
```

The error names BANNER.ASM at line 14 column 1. `BROKEN` is an invalid
instruction or directive. This first rejected build creates no BANNER.COM. TED reopens the source at the error. Its status row displays
`unknown instruction or directive` in place of the usual file position.

Left clears the message and moves the cursor to the end of the preceding
line. The status now reads `L13 C38`. Down moves to the end of `BROKEN` at
`L14 C7`. Six Backspaces remove its six letters. The cursor is then at
`L14 C1` on the extra blank line. `^G` deletes forwards and removes that
extra line too. It supplies the Delete action on the matrix keyboard, which
has no separate Delete key. The source is now the complete listing above.

`^S` saves the repaired text. Wait for `Saved` before `^Q` quits TED and
returns to `A:SYSTEM>`. The prompt's own key read finishes pending card writes.
The successful return to the prompt establishes preservation only if no
write-failure message appeared. `Write lost` means some pending changes
were dropped. Another `^C` cannot recover those changes.

Reopening `A:TED B:BANNER.ASM` reads the saved file and starts at `L1 C1`
in this session. The deliberate extra line is gone. The corrected text
has survived quitting TED because it was saved on the card.

## The first successful run

`^T B` now assembles the corrected source into BANNER.COM. TED then
reopens the source for further editing.

`^T R` builds the source and runs the resulting program. The initial run
produced this complete console text before the editor redraw. The initial
clear-screen controls and leading blank line are omitted:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card banner-plain.img --board pico --screen '@start A:TED B:BANNER.ASM' $'@press \x14R' '@run 400'. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
A:SYSTEM>A:TAS B:BANNER.ASM
BANNER.COM written

A:SYSTEM>A:TED

A:SYSTEM>B:BANNER
Hello from TEC-OS

A:SYSTEM>A:TED
Press a key
```

`BANNER.COM written` confirms that assembly completed. BANNER prints the
greeting. The `A:SYSTEM>A:TED` lines are commands to reopen the editor.
TED combines its build and return commands on a line that the startup
shell executes in order. Each command has its own prompt. Chapter 13
explains this command chaining. At `Press a key` the output remains
visible until Space returns you to the source at `L1 C1`.

TAS also writes debugger information to BANNER.DBG beside the other files
on B. Keep the three BANNER files together. This exercise uses the `.ASM`
file for editing and the `.COM` file for running.

## The printed line

The greeting is stored in the program alongside the instructions that
print it. TAS translates the instructions into bytes for the Z80 processor
and includes the message as data.

`org $0100` sets the program's start address to `0100h`, where TEC-OS
loads a COM program. The `$` prefix denotes hexadecimal in TAS source.
`START:` and `MSG:` are labels for positions in the assembled program.
START names the first instruction. MSG names the message bytes that follow.

Registers are small storage locations inside the Z80. `C` holds a byte
and `DE` is a register pair large enough for a memory address. `ld de,MSG`
loads the address of the message, leaving its text in memory. `ld c,9`
loads the number 9. The printing routine uses that number to select an
operation and DE to locate the text.

Programs call TEC-OS's console and file interface, the BDOS, through
address `0005h`. Here `call 5` invokes function 9 to print the text at DE.
Execution continues at the following instruction after the function
returns. The final `ret` ends BANNER through TEC-OS's command processor,
the CCP. Its warm boot displays a command prompt.

`db` includes literal bytes in the program. The greeting supplies character bytes. The following 13 and 10 end
the displayed line with carriage return and line feed. Function 9 stops before the `$` byte.
This `"$"` is a data character, unlike the hexadecimal prefix in `$0100`.
Changing the greeting requires keeping its quotes and final `,13,10,"$"`.

A BDOS call may change register values. BANNER needs no earlier register
values after printing because its next instruction returns to TEC-OS.

## A changed greeting

You can now change the text that BANNER prints. An arrow key clears a
status message and restores TED's position display while moving normally.
Left at the start of this file leaves the cursor at `L1 C1`.

From `L1 C1`, twelve Down presses reach `L13 C1`, the MSG line. Twenty-six
Right presses move to `L13 C27`, just before the quote after TEC-OS. Typing
`!` inserts it inside the quoted greeting. The cursor moves to `L13 C28`
and the `*` returns. Only this line changes:

<!-- The edited source's MSG line. -->
```asm
MSG: db "Hello from TEC-OS!",13,10,"$"
```

`^S` saves the new text. `^T B` then rebuilds BANNER.COM from that text.

`^T R` builds and runs the changed program. Its new greeting appears in
this separate capture. The initial clear-screen controls and leading
blank line are omitted:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card banner-edited.img --board pico --screen '@start A:TED B:BANNER.ASM' $'@press \x14R' '@run 400'. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
A:SYSTEM>A:TAS B:BANNER.ASM
BANNER.COM written

A:SYSTEM>A:TED

A:SYSTEM>B:BANNER
Hello from TEC-OS!

A:SYSTEM>A:TED
Press a key
```

Space returns to TED. Both the saved source and rebuilt program now
contain the exclamation mark. Saving source alone leaves the earlier COM
unchanged, which is why the edit needs another build.

## Saved source and the standalone program

`^Q` quits the editor. Wait for `A:SYSTEM>` before a reset or card removal:
the prompt's key read writes every changed line. A write-failure
message has the same consequence as in the earlier save: the prompt alone
does not prove the file was preserved.

A fresh machine with new RAM can read the edited source from the saved
card. `A:TED B:BANNER.ASM` displays the exclamation mark and twelve Down
presses reach MSG at `L13 C1`. This text was read from the file rather than
retained from the earlier editor session.

The executable can run independently after `^Q` and a successful
empty-prompt `^C`. `B:BANNER` runs it from B while A remains current,
without opening TED or assembling source. The final excerpt includes
the quit's preservation step, the standalone run and a final `^C`:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card banner-edited.img 'A:TAS B:BANNER.ASM' '^C' B:BANNER '^C'. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>A:TAS B:BANNER.ASM
BANNER.COM written

A:SYSTEM>^C
A:SYSTEM>B:BANNER
Hello from TEC-OS!

A:SYSTEM>^C
A:SYSTEM>
```

BANNER.ASM remains on the card, ready for another edit and build.

## Several statements on a line

The complete BANNER exercise uses a separate line for each instruction.
A more compact source layout is optional. TAS accepts several statements
on a line separated by a backslash, `\`. Thorium's `CHAIN.ASM`
demonstration used this layout on an earlier starter card. Its main part
can be entered in TED in the same way:

```asm
START:
  ld b,5 \ ld c,'1'             ; count five lines, numbered from 1

LINE:
  push bc \ ld de,TEXT          ; keep the count, point at "LINE "
  ld c,PRINT \ call BDOS        ; print it
  pop bc \ push bc \ ld e,c     ; take the line's digit
  ld c,CONOUT \ call BDOS       ; print it
  ld de,CRLF \ ld c,PRINT       ; point at CR LF
  call BDOS \ pop bc            ; end the line, get the count back
  inc c \ djnz LINE \ ret       ; the next line, or back to the CCP
```

Each `\` ends one statement and starts the next, so the first line of the
loop is `push bc` followed by `ld de,TEXT`. A label stands alone on its
line, as `START:` and `LINE:` do here, or begins the line. A label or an
`EQU` cannot follow a `\`. A comment still runs from the semicolon to the end
of the line, and here it describes the whole line's step rather than each
instruction. Inside quotes a backslash is still an escape, as in `'\\'`
for the backslash character, and does not separate statements.

Both layouts assemble to the same bytes. On the earlier card,
`TAS CHAIN` wrote 43 bytes and `CHAIN` printed `LINE 1` to `LINE 5`.
The recommended layout has labels on their own lines. An instruction
line contains at most three statements with a comment for the group.

A line's code, before its comment, can be at most 128 characters long,
blanks included. A longer line is rejected, normally as `line too long` at
column 129, whether it holds one statement or several. A line much longer
than that can be cut by TAS's source window first and then gives the error of
its cut text, but it is rejected either way. A comment may be any length.
