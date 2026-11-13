---
title: Results and command chains
parent: TEC-OS
nav_order: 13
nav_group: "Writing programs"
---

# 13. Results and command chains

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

You can join commands on a line and make later pieces depend on success.
Your programs report that result through a return code. They can also
supply a new command line when they end, as TED does for a build and
return to the editor. The shell, `SHELL.SVC`, which the starter card's
startup file loads, runs these lines. The ROM's own prompt without the shell
runs one command per line, as CP/M 2.2 does.

## Several commands on one line

`!` separates commands. Each command after the first is echoed at its own
command prompt before it runs. This is CP/M 3's form of command chaining.
The following capture shows two commands on the first line. The second line
also contains empty pieces:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'DIR *.CMD!TYPE STARTUP.CMD' 'cd!!  ! dir b:!'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR *.CMD!TYPE STARTUP.CMD

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
A:SYSTEM>TYPE STARTUP.CMD
SHELL.SVC
GLCD.SVC

A:SYSTEM>cd!!  ! dir b:!
A:SYSTEM
A:SYSTEM>dir b:
NO FILE

A:SYSTEM>
```

A *piece* is the text bounded by separators or the line's edges. A run of
separators and spaces counts as one separator, so `cd!!  ! dir b:!` runs
two commands. A line made entirely of spaces and `!` runs nothing. The shell
echoes each later piece as typed and then converts its letters to capitals.
The lower-case `dir b:` above therefore runs as `DIR B:`.

Each piece is a whole command whose drive or user-area selection applies
to the following pieces. Here `B:` selects drive B before `COPY` creates
`NOTES.TXT`:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'B:!COPY A:STARTUP.CMD NOTES.TXT!DIR'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:!COPY A:STARTUP.CMD NOTES.TXT!DIR
B:WORK>COPY A:STARTUP.CMD NOTES.TXT
COPIED 0001

B:WORK>DIR

NOTES   .TXT     128
1 file, 128 bytes
8368128 free on B:WORK
B:WORK>
```

A program receives only the command tail of its own piece. A piece ends
before the spaces in front of its separator, and `!` always separates, so
it cannot occur inside a command or argument. The later pieces remain
available after the program's ordinary exit.

The complete line has the usual limit of 127 characters. For example,
32 three-letter commands and their 31 separators fit exactly. Command
history stores a typed line once, whole and as typed. `^W` recalls the
whole chain. A startup line can also contain several pieces, which run
before the file's next line.

## Conditional pieces

`&` after a space joins a piece that runs only if the command before it
succeeded. After a failure the piece is skipped and not echoed. A skipped
piece leaves the result as it was, so a following `&` piece is skipped too,
and a following `!` piece runs:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'NOSUCH &DIR *.CMD !DIR *.SVC' 'DIR *.SVC &DIR *.CMD' 'NOSUCH &DIR *.CMD &DIR *.SVC'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>NOSUCH &DIR *.CMD !DIR *.SVC
NOSUCH?

A:SYSTEM>DIR *.SVC

SHELL   .SVC    3712
GLCD    .SVC     896
MON3    .SVC    5120
3 files, 9728 bytes
935936 free on A:SYSTEM
A:SYSTEM>DIR *.SVC &DIR *.CMD

SHELL   .SVC    3712
GLCD    .SVC     896
MON3    .SVC    5120
3 files, 9728 bytes
935936 free on A:SYSTEM
A:SYSTEM>DIR *.CMD

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
A:SYSTEM>NOSUCH &DIR *.CMD &DIR *.SVC
NOSUCH?

A:SYSTEM>
```

`NOSUCH` failed, so `DIR *.CMD` was skipped and `DIR *.SVC`, after `!`, ran.
The second line began with a successful `DIR *.SVC`, so its `&DIR *.CMD`
ran. On the third line both conditional pieces were skipped.

`&` is a separator only after a space, a tab or another separator. An `&`
inside a word is text, so `OK&TYPE` is one name and a program's tail such
as `/M:&HE000` reaches the program whole. A run of separators that holds
any `!` always continues, and one of `&` alone is conditional.

Each new line runs whatever the last line returned. A line whose first
piece starts with `&` would test the previous line's result, so it is
rejected and none of it runs. CP/M 3's `:` prefix for a conditional piece
is not provided, and a piece starting with `:` is rejected as a bad name:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs '&DIR *.CMD' ':DIR *.CMD'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>&DIR *.CMD
&DIR?

A:SYSTEM>:DIR *.CMD
:DIR?

A:SYSTEM>
```

A built-in command reports failure through its result as well as its
message. A program must set its own return code to report failure.
Printing an error message alone leaves a conditional piece free to run.
For example, `SHOW NOSUCH.TXT` from Chapter 10 prints `No such file` but
never sets a failure code. An `&` piece after it runs.

## The return code

BDOS function 108 reads or sets the 16-bit program return code, using the
CP/M 3 convention. Values from `FF00h` through `FFFEh` mean failure.
Every other value means success. With `DE = FFFFh`, the call reads the code
into `HL`. Any other value in `DE` sets the code. `FFFFh` itself cannot be
set because it selects the read operation, though the shell treats that
value as success.

The shell reads the code with function 108 before an `&` piece. The ROM's
command processor then clears the code to 0 as it takes each command. Your
program therefore reads 0 at entry. A successful built-in leaves 0, as does
an ordinary CP/M 2.2 program that never calls function 108. A reset also
clears the code.

A command that fails in the command processor sets `FF00h`. That includes a
missing command, a failed program load and an unsuccessful service
installation. Built-in error messages include `NAME?`, `NO FILE`,
`FILE EXISTS`, `NO SPACE` and COPY's errors. Answering `N` to `ERA *.*`
erases nothing and counts as success. Startup's quiet device outcomes have
a separate rule described below.

## A program that reports failure

`EXISTS` reports whether its named file is present. It opens the default file
control block (FCB) at `005Ch`, using the file-call conventions from Chapter 10:

```asm
; EXISTS: a failure, return code FF00h, when the file named on the command
; line isn't there.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,$005C        ; the FCB the CCP filled from the tail
        LD      C,15            ; BDOS function 15: open the file
        CALL    BDOS
        INC     A               ; A = FFh: no such file
        RET     NZ              ; it is there: the code stays 0
        LD      DE,$FF00        ; a failure
        LD      C,108           ; BDOS function 108: set the return code
        CALL    BDOS
        RET
```

Function 15 returns `FFh` when there is no such file. `INC A` turns that value
into zero so `RET NZ` returns immediately when the file exists. Otherwise
`EXISTS` sets `FF00h` with function 108 before returning. It prints nothing in
either case.

The card for this example also holds `RUN`, whose complete source appears
below. Both sources are copied to drive B of a starter-card copy and
assembled there by the card's TAS:

```sh
cp dist/starter.img chain.img
node tools/tecvol.mjs put chain.img B exists.asm --text
node tools/tecvol.mjs put chain.img B run.asm --text
```

At `B:WORK>`, `A:TAS EXISTS` and `A:TAS RUN` then write `EXISTS.COM` and
`RUN.COM`. `EXISTS NOTES.TXT &TYPE NOTES.TXT &DIR *.COM` prints the file only
when it is present. This capture runs that line before and after creating
the file:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card chain.img B: 'A:TAS EXISTS' 'A:TAS RUN' 'EXISTS NOTES.TXT &TYPE NOTES.TXT &DIR *.COM' 'COPY A:STARTUP.CMD NOTES.TXT' 'EXISTS NOTES.TXT &TYPE NOTES.TXT &DIR *.COM' 'EXISTS NONE.TXT !DIR *.COM' 'EXISTS NONE.TXT &DIR *.COM !USER 0 &DIR *.COM'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>A:TAS EXISTS
EXISTS.COM written

B:WORK>A:TAS RUN
RUN.COM written

B:WORK>EXISTS NOTES.TXT &TYPE NOTES.TXT &DIR *.COM

B:WORK>COPY A:STARTUP.CMD NOTES.TXT
COPIED 0001

B:WORK>EXISTS NOTES.TXT &TYPE NOTES.TXT &DIR *.COM

B:WORK>TYPE NOTES.TXT
SHELL.SVC
GLCD.SVC

B:WORK>DIR *.COM

EXISTS  .COM     128
RUN     .COM     128
2 files, 256 bytes
8343552 free on B:WORK
B:WORK>EXISTS NONE.TXT !DIR *.COM

B:WORK>DIR *.COM

EXISTS  .COM     128
RUN     .COM     128
2 files, 256 bytes
8343552 free on B:WORK
B:WORK>EXISTS NONE.TXT &DIR *.COM !USER 0 &DIR *.COM

B:WORK>USER 0
B:WORK>DIR *.COM

EXISTS  .COM     128
RUN     .COM     128
2 files, 256 bytes
8343552 free on B:WORK
B:WORK>
```

The command processor prints a new line after each program, including the
silent `EXISTS`. On the first attempt its failure skips `TYPE NOTES.TXT`
and `DIR *.COM`, and neither is echoed. After `COPY` makes the file, both
pieces run.

A failure by itself does not stop an unconditional piece. The end of the
transcript above shows both unconditional and conditional pieces.

`DIR *.COM` after `!` runs whatever `EXISTS` returned. On the second line
the failure skips the first `DIR *.COM`. `USER 0` after `!` runs, succeeds
and clears the result to 0, so the last `&DIR *.COM` lists the files.

Your program should set a failure code when its work fails, including when
it prints an error message. Function 45 can select BDOS errors as return
values for your program to handle. The return code for the shell remains
your responsibility. A returned BDOS error allows the program and its
line to continue. In the default error mode, a BDOS error ends the program
and drops the remaining pieces.

## Ends that drop the line

An ordinary `RET`, jump to `0000h` or call of BDOS function 0 leaves the
remaining pieces available after warm boot. These events drop them:

- `^C` is typed while a line read with function 10 is empty. At the
  shell's prompt there is already no remaining piece.
- `^C` ends a `^S` pause during a program's output.
- `^C` ends the `[more]` pause in a TYPE or DIR listing.
- A key ends a BDOS error in the default error mode.
- Warm boot reports `Write lost` after a failed cache flush.
- A reset clears the pending commands.

A reset starts the startup file again. After the other events the shell
takes the next line of its startup file or script, or waits for typed
input. Dropping the current line leaves any later startup lines available.

In this capture, drive D has no volume. The key `x` ends the BDOS error and
the `CD` piece is dropped:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs '@start DIR D:!CD' '@key x'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR D:!CD

Bdos Err On D: Select
A:SYSTEM>
```

Esc or `Q` at `[more]` stops only the listing. Its next piece still runs,
as after a listing that reaches its end. This differs from `^C`, which
drops the rest of the line.

## A program that supplies the next command

An editor's build key must save the source, run the assembler and reopen
the editor. BDOS function 47 lets a program finish by supplying the next
command line. CP/M 3 calls it *chain to program*.

Your program places a zero-terminated line in memory and sets the DMA
address to it with function 26. It then calls function 47. An accepted
line is copied immediately and the call ends the program by warm boot.
The copied line replaces everything left of the original line.
The call does not return on acceptance.

Warm boot flushes pending card writes before the next program loads.
A successful flush therefore puts your writes on the card first.
A failed flush drops the failed cache lines and prints `Write lost`.
It also cancels the rest of the line, including a line accepted by
function 47. Acceptance of the line does not guarantee its execution.

`RUN` supplies the rest of its own command tail as the new command:

```asm
; RUN: end by running the rest of the command line as a command.
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,$0081        ; the command tail, ended by a 0
        LD      C,26            ; BDOS function 26: set the DMA address
        CALL    BDOS
        LD      C,47            ; BDOS function 47: chain to the command
        CALL    BDOS
        LD      DE,NOTRUN       ; back here only if it was rejected
        LD      C,9
        CALL    BDOS
        RET
NOTRUN: DB      "Not run",13,10,"$"
```

The command processor puts a zero after the tail at `0081h`. Its initial
space is allowed and the command processor passes over it so `RUN DIR`
supplies ` DIR`. Function 26 takes the tail's address, not the length byte
at `0080h`.

The original line's later pieces lie outside that tail. In `RUN CD!DIR *.COM`,
`RUN` supplies only ` CD`. That replaces the old line so its `DIR` is
gone:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card chain.img B: 'A:TAS RUN' 'RUN DIR *.COM' 'RUN CD!DIR *.COM' 'RUN NOSUCH!DIR *.COM' RUN. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>A:TAS RUN
RUN.COM written

B:WORK>RUN DIR *.COM

B:WORK>DIR *.COM

RUN     .COM     128
1 file, 128 bytes
8355840 free on B:WORK
B:WORK>RUN CD!DIR *.COM

B:WORK>CD
B:WORK
B:WORK>RUN NOSUCH!DIR *.COM

B:WORK>NOSUCH
NOSUCH?

B:WORK>RUN

B:WORK>
```

The shell echoes each supplied command after the prompt. A missing command
or one that cannot load fails as a typed command does, with its name and
a question mark. `RUN` alone supplies an empty line, which ends the program
and runs nothing before the next prompt.

A supplied line may contain up to 127 characters, including `!` and `&`.
Under the shell its pieces follow the rules above and its first piece runs
whatever your program's result was. A line that begins with `&` is rejected
as a typed one is. The immediate copy allows the line to occupy memory that
the next program will overwrite. TEC-OS ignores register `E`, which CP/M 3's
function 47 also takes. The next command uses the drive and user area in
`0004h`, as after an ordinary program exit.

Without the shell the ROM's prompt echoes the supplied line and runs it
whole, as one command: `TYPE X!TYPE Y` is then `TYPE` with the tail
`X!TYPE Y`.

Function 47 rejects a line with no zero in its first 128 bytes. It also rejects
a carriage return or line feed before that zero. Rejection returns `A = FFh` and
leaves the original line unchanged so your program can handle it. `RUN` would
print `Not run` on that path. A tail the command processor prepared has the
required terminator and contains neither CR nor LF. Its line always passes
this validation.

A service's `INIT` or `REMOVE` can also call function 47. An accepted call
still causes warm boot. Chapter 14 explains the installation and removal
consequences. Chapter 22 explains how the command buffer survives warm boot
and how the copied line reaches the shell.

## TED's build and return

TED's `^T` prefix uses function 47 to end the current editor program and
run a command. For a build, its line invokes the build tool and then TED
again, joined by `!`, so TED returns whether the build succeeded or failed.
The editor's file and cursor position are saved for that new invocation.
The tool depends on the source's type: TAS for an `.ASM` file and BAZA for a
`.BAS` file. Any other type is plain text, and the keys then build the
project's source if `THOR.PRJ` names one. The operational build and run keys
from Chapters 2 and 3 are included here with the other prefix commands:

| Keys | Effect |
| --- | --- |
| `^T B` | Saves the file and builds it with `TAS` or `BAZA`. A failed build opens at the error |
| `^T R` | Builds the program as `^T B` does, then runs it |
| `^T D` | For an `.ASM` file, runs the program under `TDB`, a debugger the starter card does not contain. For a `.BAS` file, shows `No debugger` and runs nothing |
| `^T O` | Opens another file, named at a prompt |
| `^T F` | Opens the previous file again |

Because `TDB` is absent, `^T D` on an `.ASM` file ends with the command
processor's `A:TDB?` and the chained `A:TED` then reopens the editor at its
place.

These lines need the shell. Without it the ROM runs TED's line whole: the
build tool receives the rest of the line as its tail and still builds, and
the prompt returns in place of TED.

A file name or the `ARGS` key of `THOR.PRJ` goes onto that line, so TED
stops either one where the shell would split the line: at a `!`, or at an
`&` after a blank. With `ARGS X &Y`, `^T R` runs the program once with the
tail ` X` and runs nothing after it. An `&` inside a word, as in
`/M:&HE000`, stays in the tail
(`Thorium a2fe556:README.md:51-58`, `docs/compatibility.md:222`,
`test/ted.test.mjs:305-333`).

Chapter 11 explains the load-drive byte at `0050h`. TED uses that byte to
prefix the tools' names. With tools loaded from A and source on current
drive B, the build line invokes `A:TAS` or `A:BAZA` and then `A:TED`. The
tools remain on A and the source on B. The editor is a new program
invocation each time it returns through the command processor.

TAS writes a `.DBG` debug file beside the source and its `.COM` output.
For Chapter 27's `HELLO` example these are `HELLO.DBG` and `HELLO.COM`.
TED also keeps `THOR.PRJ` and `THOR.SES` beside the source in this setup.
After the first successful build and project-file update, `THOR.PRJ` names
the source for the build keys. `THOR.SES` records the file and editing position from the previous
exit. Chapter 27 has HELLO's full error, repair and run capture with its recipe.

## Chains in the startup file

A line of `STARTUP.CMD` that the shell runs can contain the same `!` and
`&` pieces. Its remaining pieces run before the file's next line. A program
started by startup can also call function 47. The supplied command runs
before the next startup line, subject to the same failed-flush cancellation.
A `^C` that ends a program or its input drops the current line but leaves
the next startup line available.

Startup has a special success rule for absent devices. A service line that
reports its device absent passes quietly, with no failure message and a
success code. Display commands with nothing to do on that board can also
pass quietly. A following conditional piece therefore runs. Other failed
installations report failure and skip a following `&` piece.

These commands prepare a startup file with the shell and three chained
lines on a starter-card copy:

```sh
printf 'SHELL.SVC\nGLCD.SVC &CD\nNOSUCH.SVC &CD\nNOSUCH.SVC !CD\n' > startup.cmd
cp dist/starter.img schain.img
node tools/tecvol.mjs put schain.img A startup.cmd --text
```

The capture uses the serial-only board:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card schain.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC &CD

A:SYSTEM>CD
A:SYSTEM
A:SYSTEM>NOSUCH.SVC &CD
NOSUCH.SVC?

A:SYSTEM>NOSUCH.SVC !CD
NOSUCH.SVC?

A:SYSTEM>CD
A:SYSTEM
A:SYSTEM>
```

The shell echoes each startup line whole, then each later piece at its own
prompt. `GLCD.SVC` reports an absent graphics LCD and passes quietly so its
`CD` runs and shows A's volume. `NOSUCH.SVC` is missing from the card, which
is an ordinary failure. Its `&CD` is skipped. The last line joins the same
failure to `CD` with `!`, so `CD` runs. Quiet absence applies to a startup line.
Typed at the prompt on this board, `GLCD.SVC` fails with `GLCD.SVC?`.

The ROM's own startup line, the first, runs whole without the shell. A
`SHELL.SVC` on that line installs the shell, which then runs the following
lines as shown here. Chapter 8 explains the two readers of the file.
