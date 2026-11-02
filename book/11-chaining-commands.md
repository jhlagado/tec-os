# 11. Chaining commands

Checked against TEC-OS 08da4d6, with the starter card's `EDIT.COM` from Edit
845d062, whose copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

A command line in TEC-OS can hold more than one command. `!` separates the
commands, and the CCP runs them in turn, each after the one before has ended,
whether that was a built-in or a program. A command written with `:` in front
runs only if the one before it succeeded, and a program reports success or
failure through a return code that it sets with BDOS function 108. A program
can also end by handing the CCP a new command line, with BDOS function 47.
This chapter describes the line split at `!`, the condition `:`, the return
code with a small program that sets it, and function 47 with a program that
uses it. It ends with the events that drop the rest of a line. These rules
are TEC-OS's own, taken from CP/M 3's CCP; CP/M 2.2 runs one command per
line. Chapter 25 describes the code behind them.

## Several commands on one line

`!` between two commands runs the first and then the second. Each command
after the first is echoed after its own prompt, so the screen reads as if you
had typed the commands one at a time:

<!-- node book/capture.mjs "DIR *.CMD!TYPE STARTUP.CMD" "vols!!  ! dir b:!" -->
```text
A>DIR *.CMD!TYPE STARTUP.CMD
STARTUP.CMD 
1 file, 986K free
A>TYPE STARTUP.CMD
PICO.DRV
GLCD.DRV

A>vols!!  ! dir b:!
00 SYSTEM      G1M A:
01 WORK        G8M B:

A>dir b:
NO FILE
A>
```

The part of a line between two `!`, or between a `!` and an end of the line,
is a piece. The second line shows the CCP passing over an empty piece, a
piece of spaces and a `!` at the end, so `vols!!  ! dir b:!` is two commands.
A line of nothing but spaces and `!` runs nothing. The CCP turns each piece into capitals as it takes
it to run, and the echo of a piece is as you typed it, so `dir b:` stays in
lower case on the screen.

A piece is a whole command, and whatever it changes holds for the pieces
after it. A drive change or a `USER` command in one piece is the drive or
user area of the next:

<!-- node book/capture.mjs "B:!COPY A:STARTUP.CMD NOTES.TXT!DIR" -->
```text
A>B:!COPY A:STARTUP.CMD NOTES.TXT!DIR
B>COPY A:STARTUP.CMD NOTES.TXT
COPIED 0001

B>DIR
NOTES.TXT   
1 file, 8172K free
B>
```

`NOTES.TXT`, with no drive, was made on drive B, because the first piece had
made B the current drive. A program in a piece starts as it would from a line
of its own: the CCP gives it the command tail and the two FCBs of Chapter 6
from its own piece, and the tail ends at the `!` after it. The pieces that
follow aren't in the tail, and no command or argument can hold a `!`.

The whole line holds up to 127 characters, as a typed line does, so a line of
32 commands of three letters each, with 31 `!`, fits. The history of Chapter
3 stores the line once, whole and as typed, and `^W` brings it back to run
again.

A line of `STARTUP.CMD` may hold `!` as well. Its pieces all run before the
startup file's next line, and a startup line's characters after the 127th
are passed over, as a typed line can't hold more.

## A command that depends on the one before

A piece that starts with `:` runs only if the command before it succeeded.
If that command failed, the `:` piece is echoed, nothing runs, and the rest
of the line is dropped, the pieces without `:` after it included:

<!-- node book/capture.mjs "NOSUCH!:DIR *.CMD!DIR *.DRV" "DIR *.DRV!:DIR *.CMD" ":DIR *.CMD" -->
```text
A>NOSUCH!:DIR *.CMD!DIR *.DRV
NOSUCH?

A>:DIR *.CMD
A>DIR *.DRV!:DIR *.CMD
PICO.DRV     PICO40.DRV   PICO32.DRV   GLCD.DRV    
4 files, 986K free
A>:DIR *.CMD
STARTUP.CMD 
1 file, 986K free
A>:DIR *.CMD
STARTUP.CMD 
1 file, 986K free
A>
```

`NOSUCH` isn't a command, so `:DIR *.CMD` didn't run and `DIR *.DRV` after
it went with the rest of the line. In the second line `DIR *.DRV` succeeded,
and `:DIR *.CMD` ran. The third line starts with `:`, and the command it
tests is the last one of the line before, the `DIR *.CMD` that succeeded. A
`:` at the start of a line typed after a failure runs nothing. On the
serial-only board the starter card's startup line `GLCD.DRV` fails, so a `:`
that starts the first line typed there runs nothing too.

## Return codes

Success and failure are one 16-bit number, the program return code of CP/M
3, which BDOS function 108 sets and reads, and which the CCP tests for `:`.
The code is a failure when it is from `FF00h` to `FFFEh`, and any other value is
a success. A call with `DE` set to `FFFFh` returns the code in `HL`, and a
call with any other `DE` sets the code to it. `FFFFh` itself can't be set, and
it counts as a success.

The CCP sets the code to 0 as it takes each piece, after testing a `:` and
before it looks for the command. A built-in that succeeds leaves it at 0, and
so does a program that never calls function 108, so an ordinary CP/M 2.2
program always succeeds. The CCP sets the code to `FF00h` when a command
fails at the CCP: a command that isn't found, a program that won't load, a
driver that won't install, and every built-in that prints `NAME?`, `NO
FILE`, `FILE EXISTS`, `NO SPACE` or one of `COPY`'s messages. An `ERA *.*`
answered with `N` erases nothing and is a success. The code is 0 after a
reset. A program that reads the code when it starts always finds 0, since
the CCP cleared it before loading the program.

A program sets the code to report on its own work. This one, `EXISTS`, fails
when the file named on its command line isn't there, and succeeds when it is:

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

Function 15 opens the file whose FCB is at `DE` and returns `FFh` in `A` when
there is no such file, as Chapter 6 describes. `EXISTS` prints nothing; its
result is the code. With this program saved as `exists.asm` in the clone, and
the next section's `run.asm` beside it, these commands assemble both and put
them on drive B of a copy of the starter card:

```sh
npx atom exists.asm exists.com
npx atom run.asm run.com
cp dist/starter.img chain.img
node tools/tecvol.mjs put chain.img B exists.com
node tools/tecvol.mjs put chain.img B run.com
```

`EXISTS NOTES.TXT!:TYPE NOTES.TXT` then types `NOTES.TXT` only if it is
there. Here the line runs once before `NOTES.TXT` is made and once after:

<!-- node book/capture.mjs --card chain.img B: "EXISTS NOTES.TXT!:TYPE NOTES.TXT!DIR" "COPY A:STARTUP.CMD NOTES.TXT" "EXISTS NOTES.TXT!:TYPE NOTES.TXT!DIR" -->
```text
A>B:
B>EXISTS NOTES.TXT!:TYPE NOTES.TXT!DIR

B>:TYPE NOTES.TXT
B>COPY A:STARTUP.CMD NOTES.TXT
COPIED 0001

B>EXISTS NOTES.TXT!:TYPE NOTES.TXT!DIR

B>:TYPE NOTES.TXT
PICO.DRV
GLCD.DRV

B>DIR
EXISTS.COM   RUN.COM      NOTES.TXT   
3 files, 8164K free
B>
```

The blank line after each `EXISTS` is the CCP's, which starts a new line
after every program. The first time, `EXISTS` failed, and `:TYPE NOTES.TXT`
and the `DIR` after it were dropped. The second time both ran.

A piece without `:` runs whatever the command before it returned, so a
failure stops the line only at a piece that starts with `:`:

<!-- node book/capture.mjs --card chain.img B: "EXISTS NONE.TXT!DIR" "EXISTS NONE.TXT" ":DIR" "USER 0" ":DIR" -->
```text
A>B:
B>EXISTS NONE.TXT!DIR

B>DIR
EXISTS.COM   RUN.COM     
2 files, 8168K free
B>EXISTS NONE.TXT

B>:DIR
B>USER 0
B>:DIR
EXISTS.COM   RUN.COM     
2 files, 8168K free
B>
```

`USER 0`, a built-in that succeeded, set the code back to 0, and the second
`:DIR` ran.

## A program that starts another

A program can end by giving the CCP a command line to run next, with BDOS
function 47, which CP/M 3 calls *chain to program*. The program puts the
line in memory, ended by a 0 byte, sets the DMA address to it with function
26, and calls function 47. When the line is accepted the call doesn't
return: TEC-OS copies the line and ends the program with a warm boot, and
the CCP runs the line next, in place of whatever was left of the line the
program came from. This program, `RUN`, ends by running the rest of its own command line as a command:

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

The CCP puts a 0 after the command tail at `0081h`, so the tail is a line
ready for function 47, with the space before its first word, which the CCP
passes over. `RUN DIR` runs `DIR`. A line from function 47 takes the place
of what was left of the line, so in `RUN A:VOLS!DIR` the `DIR` never runs:

<!-- node book/capture.mjs --card chain.img B: "RUN DIR" "RUN A:VOLS!DIR" "RUN NOSUCH!DIR" "RUN" -->
```text
A>B:
B>RUN DIR

B>DIR
EXISTS.COM   RUN.COM     
2 files, 8168K free
B>RUN A:VOLS!DIR

B>A:VOLS
00 SYSTEM      G1M A:
01 WORK        G8M B:

B>RUN NOSUCH!DIR

B>NOSUCH
NOSUCH?

B>RUN

B>
```

The chained command is echoed after the prompt, as a piece is. A command
from function 47 that isn't found, or doesn't load, fails as a typed one
does, with its name and a question mark. `RUN` alone chains an empty line,
which ends the program and runs nothing, and the prompt comes back.

The line may be up to 127 characters, and it may hold `!` and `:`, which
the CCP treats as in a typed line; a `:` at its start tests the code the
program set before the call. Function 47 rejects a line with no 0 in its
first 128 bytes, or with a carriage return or a line feed before the 0. Then
it returns with `A = FFh`, the program goes on, and the line it came from is
unchanged; in `RUN`, the message `Not run` follows. A tail can hold neither
character, so `RUN` itself never prints it. The line is copied as soon as
the function is called, so it may be anywhere in memory, even where the next
program loads. CP/M 3's function 47 also reads register `E`, and TEC-OS
ignores it: the chained command runs on the drive and in the user area held
in the byte at `0004h`, as any command after a program's end does.

A program started from a line of `STARTUP.CMD` may chain too, and the
chained line runs before the startup file's next line.

## The end of a chained line

These events drop what is left of a line, and the prompt comes back to wait
for a new one:

- a `:` piece after a failure;
- a call to function 47, whose line replaces the rest;
- `^C` typed as the first key of a line that a program reads with BDOS
  function 10;
- the key that ends a BDOS error, such as `Bdos Err On C: Select`;
- a reset.

Here the BDOS error for a drive with no volume, ended by the key `x`, drops
the `VOLS` after it:

<!-- node book/capture.mjs "@start DIR C:!VOLS" "@key x" -->
```text
A>DIR C:!VOLS

Bdos Err On C: Select
A>
```

Other ways a command can end leave the rest of the line to run. A program
that prints its own error message and returns has succeeded unless it set
the code. `^C`, Esc or `Q` at `[more]` ends a `TYPE` or `DIR` listing and
the line's next piece runs, as it does after a listing that ran to its end.
A `Write lost` message at a warm boot, which Chapter 19 describes, also
leaves the rest of the line to run.
