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

A build sequence should run a program only after a successful build. An editor
must also reopen after the build tool ends. TEC-OS supports both through
command chains and program return codes. The starter card installs `SHELL.SVC`
to interpret several commands on a line. Without it the ROM prompt executes a
single command per line as CP/M 2.2 does.

## Several commands on one line

An exclamation mark, `!`, joins commands unconditionally. The shell prints a
prompt and echoes each later command before running it. This is CP/M 3's
command-chain form. The first captured line runs two commands and the second
includes empty pieces:

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

A *piece* is the text between separators or the line's edges. Spaces and
repeated separators collapse into a single separation. The second command
line entered above therefore executes two commands while a line containing
only spaces and `!` executes none. The shell echoes later pieces as typed
before capitalising them. The displayed `dir b:` therefore executes as
`DIR B:`.

Each piece executes as a complete command. A drive or user-area change carries
into later pieces. Here `B:` makes B current before COPY creates `NOTES.TXT`:

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

Only the current piece's tail reaches a program. Spaces immediately before a
separator are excluded. An argument cannot include `!` because it always
separates pieces. An ordinary program exit leaves the later pieces available.

A full line may contain 127 characters. That fits 32 three-letter commands
with 31 separators. History stores a typed chain once in its original form and
`^W` recalls the whole line. Startup lines can contain chains too. Their
pieces finish before the next file line begins.

## Conditional pieces

An ampersand after a space, `&`, makes the next piece conditional on success.
Failure skips that piece without echoing it. Skipping preserves the failure
result so another `&` also skips. A following `!` executes regardless:

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

In the first line NOSUCH fails, skipping `DIR *.CMD` before `!` permits
`DIR *.SVC`. The second line succeeds at `DIR *.SVC` and runs `&DIR *.CMD`.
The third failure skips both conditional pieces.

The shell treats `&` as a separator only after a space, tab or another
separator. Within a word it stays literal. `OK&TYPE` is therefore a single
name and a tail such as `/M:&HE000` reaches its program intact. In a separator
run any `!` makes continuation unconditional. A run containing only `&`
remains conditional.

A new line starts independently of the preceding result. It cannot begin with
`&` because that would depend on the previous line. Such a line is rejected in
full. TEC-OS also omits CP/M 3's `:` conditional prefix and rejects a first
piece beginning with `:` as a bad name:

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

The conditional test uses a result code rather than displayed text. Built-ins
report their own failure but your program must set a return code. Chapter 10's
`SHOW NOSUCH.TXT` prints `No such file` without setting failure so a following
`&` piece still runs.

## The return code

BDOS function 108 reads or sets the 16-bit return code using CP/M 3's
convention. `FF00h–FFFEh` mean failure and all other values mean success. With
`DE = FFFFh` it reads the code into `HL`. Every other DE value sets it. The
read selector prevents setting `FFFFh` itself, although the shell classifies
that value as success.

The shell reads function 108 before deciding on an `&` piece. As each command
is taken the ROM processor clears the code to 0. A program therefore starts
with 0. A successful built-in leaves it unchanged, as does a CP/M 2.2 program
using no return-code call. Reset clears it too.

Command-processor failures set `FF00h`, including missing commands, load
failures and rejected service installations. Their messages include `NAME?`,
`NO FILE`, `FILE EXISTS`, `NO SPACE` and COPY errors. Declining `ERA *.*` with
`N` counts as success because nothing was erased. Startup's quiet
absent-device rule is explained below.

## A program that reports failure

EXISTS turns a file-open result into a command result. It opens the default
FCB at `005Ch` using Chapter 10's file calls:

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

Open returns `FFh` for a missing file. `INC A` turns that into zero. `RET NZ`
therefore exits on a successful open with the initial code still 0. A missing
file instead causes function 108 to set `FF00h`. EXISTS prints no text on
either path.

The example card also holds RUN, listed below. These commands copy both
sources onto B in a starter-card copy so TAS can assemble them there:

```sh
cp dist/starter.img chain.img
node tools/tecvol.mjs put chain.img B exists.asm --text
node tools/tecvol.mjs put chain.img B run.asm --text
```

At `B:WORK>`, `A:TAS EXISTS` and `A:TAS RUN` create `EXISTS.COM` and
`RUN.COM`. The chain `EXISTS NOTES.TXT &TYPE NOTES.TXT &DIR *.COM` displays
and lists only when the file exists. The capture repeats it before and after
COPY creates the file:

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

EXISTS is silent but the command processor still prints its normal
post-program new line. At first the failure skips TYPE and DIR without echo.
Once COPY creates NOTES.TXT both conditional pieces run.


`EXISTS NONE.TXT !DIR *.COM` runs DIR despite failure. In the final chain the
first conditional DIR skips. `!USER 0` then runs successfully, resetting the
result to 0 so the final `&DIR *.COM` executes.

Set a failure code whenever your program's task fails, including after
printing an error. Function 45 may return BDOS errors for the program to
handle but it does not set the shell result for you. A returned disk error
permits the program and line to continue. Default-mode errors instead
terminate the program and cancel the remaining pieces.

## Ends that drop the line

An ordinary `RET`, `JP 0000h` or BDOS function 0 preserves later pieces across
warm boot. The following events cancel them:

- `^C` is typed while a line read with function 10 is empty. At the
  shell's prompt there is already no remaining piece.
- `^C` ends a `^S` pause during a program's output.
- `^C` ends the `[more]` pause in a TYPE or DIR listing.
- A key ends a BDOS error in the default error mode.
- Warm boot reports `Write lost` after a failed cache flush.
- A reset clears the pending commands.

Reset restarts startup from its beginning. After the other cancellations the
shell advances to the next startup or script line or waits for typed input.
Cancellation removes the current line's remainder while leaving later startup
lines available.

Here D has no mounted volume. The key `x` ends the default BDOS error and the
following CD is cancelled:

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

At `[more]`, Esc or `Q` stops the current listing while allowing its next
piece to run. `^C` instead cancels the remainder of the line.

## A program that supplies the next command

An editor's build action needs to save the source, execute the assembler and
reopen the editor. BDOS function 47 supplies that sequence as a replacement
command line when the current program ends. CP/M 3 names this operation *chain
to program*.

Place a zero-terminated line in memory and select its address as DMA with
function 26. Function 47 validates and copies the line immediately, then ends
the program through warm boot. It replaces all remaining commands from the
original line. Acceptance does not return to the caller.

The next load still depends on warm boot's flush. Success puts pending changes
on the card before loading. Failure drops the failed cache lines, prints
`Write lost` and cancels the queued line, including a function-47 replacement.
An accepted line may therefore never execute.

RUN uses its own command tail as the replacement:

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

The tail's text begins at `0081h` and the command processor has appended a
zero. Its leading space is permitted and skipped, so `RUN DIR` supplies
` DIR`. Function 26 receives the text address rather than the length byte at
`0080h`.

Later pieces were never part of that tail. In `RUN CD!DIR *.COM`, RUN supplies
` CD` only. Replacing the original line removes its later DIR:

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

A supplied command is echoed after its prompt. A missing or unloadable program
fails with its name and a question mark just as typed input does. RUN with no
argument supplies an empty line, ending the program without another command
before the next prompt.

The replacement may contain up to 127 characters including `!` and `&`. Its
first piece executes independently of the departing program's result. The
shell then applies the ordinary piece rules. An initial `&` is rejected.
Immediate copying permits source text in memory that the next program will
reuse. TEC-OS ignores the E parameter used by CP/M 3's function 47. Drive and
user selection comes from `0004h` as on an ordinary exit.

Without SHELL.SVC the ROM echoes and executes the supplied line as a single
command. `TYPE X!TYPE Y` then invokes TYPE with the literal tail `X!TYPE Y`.

A line must contain a zero within its first 128 bytes and no preceding CR or
LF. Otherwise function 47 returns `A = FFh` and preserves the original line.
RUN would then print `Not run`. A CCP-prepared tail satisfies these conditions
because it has a terminator and contains neither line-ending byte.

Service INIT and REMOVE routines may also call function 47. Acceptance still
causes warm boot, with installation or removal consequences described in
Chapter 14. Chapter 22 traces how the copied text survives warm boot and
reaches the shell.

## TED's build and return

TED uses function 47 after its `^T` prefix. A build saves the editor state and
supplies a line that runs the build tool followed by TED. The `!` separator
reopens TED whether the build succeeds or fails. The new invocation restores
the file and position. `.ASM` selects TAS and `.BAS` selects BAZA. For another
type the build keys use the source named by `THOR.PRJ`, if present. The prefix
commands include the build and run operations from Chapters 2 and 3:

| Keys | Effect |
| --- | --- |
| `^T B` | Saves the file and builds it with `TAS` or `BAZA`. A failed build opens at the error |
| `^T R` | Builds the program as `^T B` does, then runs it |
| `^T D` | For an `.ASM` file, runs the program under `TDB`, a debugger the starter card does not contain. For a `.BAS` file, shows `No debugger` and runs nothing |
| `^T O` | Opens another file, named at a prompt |
| `^T F` | Opens the previous file again |

The starter card has no TDB. On an `.ASM` file `^T D` therefore produces
`A:TDB?`, then the chained `A:TED` restores the editor's place.

These sequences require the shell. Without it the ROM passes the entire rest
of the line as the build tool's tail. The tool still builds but the prompt
returns instead of TED.

TED places file names and `THOR.PRJ`'s `ARGS` value on the command line. It
truncates either at a shell separator: any `!` or an `&` following a blank.
Thus `ARGS X &Y` makes `^T R` run once with tail ` X` and nothing afterwards.
An embedded `&` in `/M:&HE000` remains literal
(`Thorium a2fe556:README.md:51-58`, `docs/compatibility.md:222`,
`test/ted.test.mjs:305-333`).

The load-drive byte at `0050h`, explained in Chapter 11, identifies TED's tool
drive. With tools loaded from A and source on current drive B, TED supplies
`A:TAS` or `A:BAZA` followed by `A:TED`. The files stay on their separate
drives and each return to the editor is a new invocation through the command
processor.

TAS writes `.DBG` and `.COM` beside the source, giving `HELLO.DBG` and
`HELLO.COM` for Chapter 27's example. In this setup TED also stores `THOR.PRJ`
and `THOR.SES` there. After the first successful compilation and project
update THOR.PRJ identifies the source for later build keys. THOR.SES retains
the file and position from the preceding exit. Chapter 27 contains the full
error, repair and run capture and its recipe.

## Chains in the startup file

Shell-read STARTUP.CMD lines use the same `!` and `&` rules. A line's pieces
run before the next file line. A program started there can replace its
remainder through function 47, subject to the same failed-flush cancellation.
`^C` cancels the current line while preserving the next startup line.

Startup treats absent devices separately from other failures. A service
reporting device absence passes quietly with a success result. Display
commands with no operation on that board can do the same. A following
conditional piece then runs. Other rejected installations set a failure result
and skip it.

This recipe puts the shell and three chained lines into STARTUP.CMD on a
separate starter-card copy:

```sh
printf 'SHELL.SVC\nGLCD.SVC &CD\nNOSUCH.SVC &CD\nNOSUCH.SVC !CD\n' > startup.cmd
cp dist/starter.img schain.img
node tools/tecvol.mjs put schain.img A startup.cmd --text
```

On the serial-only model those lines produced:

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

The shell echoes each startup line and each later piece. GLCD.SVC reports
absent hardware quietly so `&CD` runs. The missing NOSUCH.SVC is an ordinary
failure and skips its `&CD`. Joining the same failure with `!CD` instead runs
CD. Quiet device absence is a startup policy. A typed GLCD.SVC on this board
fails with `GLCD.SVC?`.

The ROM reads the first startup line before the shell is installed so that
line executes whole. Installing SHELL.SVC there lets the shell process later
lines as shown. Chapter 8 explains the two startup readers.
