---
title: Build a BASIC program
parent: TEC-OS
nav_order: 3
nav_group: "Using the machine"
---

# 3. Build a BASIC program

<!-- Source and test contracts checked at TEC-OS
     c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     programs/TIMES.BAS, test/times.test.mjs and test/ted-baza.test.mjs.
     TED.COM is pinned at Thorium a2fe556 and Baza at 50dc512. The BAZA
     screen was retaken with the landed firmware; outputs taken from strict
     test assertions are labelled as source-derived excerpts, not captures.
     Both full firmware strict passes include the BASIC and TED scenarios.
     Host-model evidence is retained in Origo's book-shell2 evidence. -->

BASIC provides another way to write programs on the TEC-1G. The card's
TIMES.BAS reads a name and number, then prints a multiplication table.
You compile it with BAZA and run the resulting program. Changing it in
TED uses the same edit, build and run cycle as BANNER.

These results use the same software TEC-1G host model as Chapters 1 and 2.
BAZA and TED's BASIC build keys still need a recorded physical-board run.

## The BASIC source

TIMES.BAS is on A beside the supplied tools. `TYPE TIMES.BAS` displays
the file at `A:SYSTEM>`. Chapter 4 explains this command and its page
controls. The complete source is:

<!-- TEC-OS 8b69e51 programs/TIMES.BAS, lines 1-22, complete. The starter
     card stores it with CRLF line ends and a final ^Z (tools/media.mjs). -->
```text
10 REM TIMES.BAS, a first BASIC program
20 REM Build it with BAZA TIMES,
30 REM then type TIMES to run it.
40 PRINT "HELLO FROM BASIC ON TEC-OS."
50 INPUT "WHAT IS YOUR NAME"; n$
60 PRINT "HI, "; n$; "."
70 INPUT "PICK A NUMBER, 1 TO 12"; n
80 IF n < 1 OR n > 12 THEN 100
90 IF n = INT(n) THEN 120
100 PRINT "PLEASE PICK 1 TO 12."
110 GOTO 70
120 PRINT "THE"; n; "TIMES TABLE:"
130 t = 0
140 FOR i = 1 TO 12
150 p = i * n
160 PRINT i; TAB(4); "X"; n; TAB(9); "="; p
170 t = t + p
180 NEXT i
190 PRINT "THEY ADD UP TO"; t
200 PRINT "THAT IS"; t / 12; "ON AVERAGE."
210 PRINT "GOODBYE, "; n$; "!"
220 END
```

The line numbers increase through the source. `REM` introduces a remark
and `PRINT` writes text or numbers. `INPUT` displays a question and stores
the answer in a variable: `n$` for the name and `n` for the number.
Lines 80 and 90 check for a whole number from 1 to 12. An invalid answer
goes to line 100 and then back to the input. The `FOR` and `NEXT` loop
repeats lines 150 to 170 with `i` from 1 to 12. Each repetition prints a
row and adds its product to `t`. `TAB` aligns the output in columns.

## A compiler and its library

BAZA compiles classic Microsoft BASIC source into a CP/M executable.
`BAZA TIMES` reads the whole TIMES.BAS file and writes TIMES.COM. You can
then run it like SAMPLE.COM, with no compiler or library needed on the
card. BAZA has no interactive `list` or `run` command. You edit the text
file and compile it again. A repeated or decreasing line number produces
an error. Source is compiled as a whole, with no line-replacement operation.

The two compiler files are on A. `BAZA.COM` runs the compiler and
`BAZA.RTL` contains routines copied into the executable. BAZA reads this
library from the current drive. If it is absent there, BAZA reads it from
the drive that supplied `BAZA.COM`. Source on B can therefore be compiled
with both tools left on A.

## Compiling and running TIMES

At `A:SYSTEM>`, `BAZA TIMES` compiles TIMES.BAS into TIMES.COM on A.
The name needs no type, as with `TAS SAMPLE`. During compilation a mark
cycles through `|`, `/`, `-` and `\` at the start of the line. Each is
followed by a backspace. Completion prints `COM written` over the last
mark and returns to the prompt:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --screen 'BAZA TIMES'. The full screen, with trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>BAZA TIMES
COM written

A:SYSTEM>
```

The marks go only to the console, and the compiled program is the same
with or without them (`Baza 50dc512:README.md:26-30`).

The command `TIMES` runs TIMES.COM. This 40-column output is checked by
the TEC-OS host-model test with answers `TEC`, 13 and then 7. The starting
`A:SYSTEM>TIMES` line is omitted:

<!-- TEC-OS 8b69e51 test/times.test.mjs:28-40, the asserted output, with
     the screen check at :120-122: answers TEC, 13 and 7, trailing spaces
     removed. Not a separate capture. -->
```text
HELLO FROM BASIC ON TEC-OS.
WHAT IS YOUR NAME? TEC
HI, TEC.
PICK A NUMBER, 1 TO 12? 13
PLEASE PICK 1 TO 12.
PICK A NUMBER, 1 TO 12? 7
THE 7 TIMES TABLE:
 1  X 7  = 7
 2  X 7  = 14
 3  X 7  = 21
 4  X 7  = 28
 5  X 7  = 35
 6  X 7  = 42
 7  X 7  = 49
 8  X 7  = 56
 9  X 7  = 63
 10 X 7  = 70
 11 X 7  = 77
 12 X 7  = 84
THEY ADD UP TO 546
THAT IS 45.5 ON AVERAGE.
GOODBYE, TEC!

A:SYSTEM>
```

`INPUT` adds `? ` after each question. The answer 13 is outside the
permitted range, so execution returns to line 70 for another number.
Numbers print with a space on each side, as in Microsoft BASIC. `TAB(4)`
and `TAB(9)` align `X` and `=` even as the numbers grow wider. `END`
finishes the program and returns to the prompt.

## TIMES in TED

`TED TIMES.BAS` opens the source for editing. Arrow keys, Backspace and
`^G` work as they did in BANNER.ASM. `^S` saves and `^Q` quits. The file
type selects the build tool: TAS for `.ASM` and BAZA for `.BAS`. The
`^T` sequences are otherwise the same:

| Keys | `.ASM` file | `.BAS` file |
| --- | --- | --- |
| `^T B` | Saves and builds with `TAS` | Saves and builds with `BAZA` |
| `^T R` | Builds with `TAS`, then runs the program | Builds with `BAZA`, then runs the program |
| `^T D` | Chains `TDB`, which the starter card does not contain, so the CCP prints `A:TDB?` and TED returns | Shows `No debugger` and runs nothing |

`^T B` saves TIMES.BAS and runs `A:BAZA TIMES.BAS`. The A prefix is the
drive that supplied TED. The console displays this command and
`COM written` before TED reopens the source at your previous position.
After the first successful build, `THOR.PRJ: TIMES.BAS` appears on the
status row. TED has recorded TIMES.BAS as the build source in its project
file.

`^T R` rebuilds and runs TIMES. TED waits at `Press a key` after the
program ends, leaving its output visible. A keypress restores the source
at the same position. `^T D` instead displays `No debugger` in the editor.
It performs no external command or file write.

The same build works with a source file on B. From `B:WORK>`, TED and
BAZA load from A and BAZA reads A's `BAZA.RTL`. The result, TIMES.COM,
is written beside TIMES.BAS on B.

## A change of your own

Keeping your version on WORK preserves the supplied source on SYSTEM.
At `A:SYSTEM>`, this `COPY` command copies TIMES.BAS from A to B and
reports `COPIED` with the record count. Chapter 4 explains the other forms:

```text
A:SYSTEM>COPY A:TIMES.BAS B:TIMES.BAS
```

`B:` selects WORK. `TED TIMES.BAS` at `B:WORK>` then loads TED from A
and opens your copy. The greeting is on BASIC line 40, the fourth file
line. You can change the greeting while keeping the line number, `PRINT`
and both quotes:

```text
40 PRINT "HELLO FROM MY FIRST BASIC."
```

`^S` saves the change and `^T B` compiles it with A's BAZA, writing
TIMES.COM on B. `^T R` builds and runs it with the new greeting. Answering
the questions completes the program and a further key returns to TED.
The host-model tests cover `^T R` with TIMES.BAS on A and a build with it
on B.

`^Q` quits TED and returns to `B:WORK>`. Wait for that prompt before a
reset or power-off: its console read writes all pending changes on every
drive. Chapter 1 explains why.

## A failed compile

A syntax error stops compilation and returns TED to the faulty line.
In the model test, inserting `95 PRINT (` before file line 10 placed it
between BASIC lines 90 and 100. Its number is in order but its expression
is unfinished. After `^T B` saved the file, BAZA printed this message
over the last progress mark:

<!-- TEC-OS 8b69e51 test/ted-baza.test.mjs:94-101, the asserted console
     text with the spinner's marks taken out (:29-31). Not a separate
     capture. -->
```text
A:SYSTEM>A:BAZA TIMES.BAS
?SYNTAX ERROR IN 95
```

The message names BASIC line 95. TED reopens at file line 10, where that
BASIC line occurs, and displays the message on its status row. BAZA writes the file position to `THOR.ERR`
when `THOR.SES` is on the current drive. These examples keep both beside
the source. TED reads and removes the error record. Correcting or deleting
the faulty line allows another build.

The failed compile leaves the earlier TIMES.COM unchanged. BAZA writes
to a temporary file and renames it TIMES.COM only after a successful
compile. A failure therefore leaves the previous complete program in place
until a successful compile replaces it.

Running TIMES after a failed compile would run that earlier version.
You can prevent this by making execution depend on a successful compile.
BAZA sets a failure return code, as TAS does, so this conditional command
line works at the prompt. Chapter 13 explains return codes and chains:

```text
A:SYSTEM>BAZA TIMES &TIMES
```

`&` after a space separates a command that runs only after success.
A successful compile runs TIMES. A failed compile skips TIMES and returns
to the prompt, leaving the older executable unused. The startup shell
executes these conditional lines.

## Compiler details

The following details describe source layout and compiler limits. They are
not needed to compile and change TIMES.

BAZA includes some later Microsoft BASIC-80 forms for CP/M. `&H`
introduces hexadecimal constants and `HEX$` is also supported. `MOD` computes
a remainder and `\` performs whole-number division. The additions
also include `XOR`, `WAIT port, mask` for waiting on a port bit and
`SWAP a, b` for exchanging variables
(`Baza 50dc512:docs/mbasic.md:10-12`, `:38-50`).

`BAZA.COM` is a 13,184-byte packed file. Each invocation unpacks it into
the 17,152-byte compiler, adding about a quarter of a second to a compile
(`Baza 50dc512:docs/size-account.md:3-29`).

TIMES.BAS uses capital keywords, lower-case variable names and spaces
between words. Its remarks are sentences and its quoted text is in
capitals. BOUNCE.BAS uses the same layout. BAZA's lexer folds other
letters to capitals and ignores spaces and tabs. Quotes, `REM` remarks
and `DATA` items retain their original bytes
(`Baza 50dc512:src/lex.asm:17-19`). Thus `PRINT` and `print` select the
same keyword, while `n<1` and `n < 1` make the same comparison.

This layout leaves the compiled program unchanged. TIMES.BAS produces
the same TIMES.COM as its earlier all-lower-case source. Text inside
quotes is preserved, so its greeting prints in capitals
(`Baza 50dc512:docs/language.md:19`). The book's prompt commands use
capitals, but lower case also works. The host-model test types
`baza times` (`test/times.test.mjs:79`).

On the four-drive starter card TED has 28,694 bytes of text room with
the shell loaded. Leaving a MON-3 session with `EXIT` keeps `MON3.SVC`
installed and reduces that room to 24,086 bytes, or 23,318 with the GLCD
driver too. Unload MON3.SVC before editing a larger source. These are
host-model measurements (`docs/compatibility.md`).

## Machine code from BASIC

BASIC source can also call the board's devices through machine code.
This optional route uses a ROM service, a resident service entry or a
routine at an address because BAZA has no graphics or sound statements.
`DEF CALL` names the routine, `CALL` runs it with specified registers and
`REG` reads a resulting register value (`Baza 50dc512:docs/call.md:1-6`).
Chapter 12 describes these ROM services for assembly programs.

BOUNCE.BAS, a sprite game on the card, does all its drawing this
way. Three of its lines show the pattern
(`Baza 50dc512:examples/BOUNCE.BAS:6`, `11`, `18`):

<!-- Baza 50dc512 examples/BOUNCE.BAS file lines 6, 11 and 18, as the
     card holds it (TEC-OS 8b69e51 tools/media.mjs:224-227). -->
```text
50 DEF CALL vi = ROM 3: DEF CALL bp = ROM 4: DEF CALL ft = ROM 15
100 CALL vi, b = 1
170 CALL ft: f = REG("HL"): CALL vw, hl = 256, de = f, bc = 768
```

The colons separate statements written on the same source line.

`ROM 3` selects the video service, `ROM 4` the tone service and
`ROM 15` the font service. A call definition can also name an address
or a quoted service record with its version and entry number. The
record is found when `DEF CALL` executes
(`Baza 50dc512:docs/call.md:16-26`).

Each `CALL` argument loads a register. `a`, `b`, `c`, `d`, `e`, `h`
and `l` take a byte. `bc`, `de` and `hl` take a word or the address of
a string variable's bytes. Afterwards `REG("HL")` reads the resulting
HL and `REG("CY")` reads carry. A routine's failure result needs an
explicit `REG` check because `CALL` raises no error itself
(`Baza 50dc512:docs/call.md:51-64`, `Baza 50dc512:docs/call.md:72-82`).

Line 170 gets the font address and uses `vw` to copy 768 bytes to
PICO9918 memory. Line 90 defines `vw` as `"PICO", 3, 10`, entry 10
of the PICO console record for copying RAM to VRAM
(`Baza 50dc512:examples/BOUNCE.BAS:10`, `Baza 50dc512:docs/call.md:24-25`).

Ordinary BAZA numbers use 32-bit floating point. An addition takes
about 3,000 T-states on the Z80, close to a millisecond at 4 MHz. A
name ending in `%`, such as `x%`, instead holds a whole number from
-32768 to 32767.

Simple statements compile to short 16-bit code with suitable operands.
Each operand must be an integer variable, a whole-number constant from
0 to 32767 or an integer-array element. Such an array element must have
a single subscript that is itself an integer variable or whole number.
The supported statements are copies or a single arithmetic operation:
addition, subtraction, multiplication, division, `\` or `MOD`. They
also include a single `AND`, `OR` or `XOR`, an `IF` with a single relation
and `FOR` or `NEXT` using an integer variable. A quotient is rounded
down. Other forms still use the floating-point routines, including
statements with several operators (`Baza 50dc512:docs/speed.md:3-31`).
BOUNCE moves its balls with these simple integer statements
(`Baza 50dc512:examples/BOUNCE.BAS:47-48`, `62-65`):

<!-- Baza 50dc512 examples/BOUNCE.BAS file lines 62 to 65. -->
```text
560 FOR i% = 0 TO 3
570 x%(i%) = x%(i%) + dx%(i%)
572 IF x%(i%) < 8 THEN 580
574 IF x%(i%) <= 232 THEN 590
```

`VARPTR(v)` gives the address of a variable or an array element, which
`PEEK`, `POKE` and `CALL` accept. A program can therefore `POKE` a short
routine into a dimensioned array, which never moves, and name its address
with `DEF CALL` (`Baza 50dc512:docs/call.md:26-38`,
`Baza 50dc512:docs/call.md:91-99`).

While a program holds the PICO9918, TEC-OS hides the console. If the
program then stops on a run-time error, it gives the display back before
printing, so the message shows at the prompt. The host-model test checks
this with a program that claims the display and then divides by zero
(`Baza 50dc512:docs/call.md:66-70`, `test/times.test.mjs:213-233`).

On the card, `BAZA BOUNCE` compiles it and `BOUNCE` runs it on
the PICO9918, which it needs. Tap W, A, S and D, or the arrow keys, to steer
the ship. The matrix arrows send Esc, `[` and a letter from `A` to `D`.
Lines 950 to 999 translate these sequences to W, S, D or A. Q ends the
game, restores the display console and prints the score at `A:SYSTEM>`.
The host-model test checks each of these steps
(`tools/media.mjs:224-227`, `test/starter.test.mjs:108-189`,
`Baza 50dc512:examples/BOUNCE.BAS:84`, `103-115`).
