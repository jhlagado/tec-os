---
title: Call TEC-OS
parent: TEC-OS
nav_order: 9
nav_group: "Writing programs"
---

# 9. Call TEC-OS

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

Your program can read a key, print text or collect a line through the BDOS.
The same calls work with the selected console so the program uses TEC-OS
instead of handling the keyboard or display hardware itself.

## A COM program and its calls

A `.COM` file contains the program's bytes, including any literal data. The
CCP loads them as they stand at `0100h` and starts execution there. There is
no executable header to skip. `ORG $0100` places the assembler's labels at
the addresses where the program will run.

The CCP processes your command and starts the program. The BDOS provides its
console and file operations. Beneath those operations, the BIOS drives the
TEC-1G's devices. Using the BDOS keeps ordinary console calls separate from
the machine's ports and display drivers. Chapter 11 explains the raw BIOS
interface and its stack/input contract. Here both input and output use the
BDOS.

Registers hold the values passed to a call. `A`, `B`, `C` and `E` each hold a
byte. `BC`, `DE` and `HL` are 16-bit register pairs, large enough for a memory
address. To select a BDOS operation, you put its function number in `C` and call
`0005h`. A byte parameter goes in `E` while an address or word parameter goes in
`DE`. A byte result is returned in `A` and a word result in `HL`. For example,
function 2 takes the character in `E` and function 9 takes an address in `DE`.
In source, `BDOS EQU $0005` gives that call address a name.

## Calls, returns and saved values

`CALL` puts the address of the following instruction on the stack before
entering the routine. `RET` removes that address and resumes execution
there. The stack is memory addressed by `SP`, the stack pointer. Each return
address occupies two bytes and each call moves `SP` down by two. A returning
routine moves it back up by two.

The CCP also supplies a return address when it starts your program. It puts
`0000h` on the inherited stack before jumping to `0100h`. A top-level `RET`
therefore ends the program through the warm-boot jump at `0000h`. Calls within
the program must return before that last `RET` so it reaches the word supplied
by the CCP.

The BDOS may change the registers. A returned value is usable according to
that function's contract but any other value you still need must be saved
before the call. CP/M 2.2 defines no register as preserved across every BDOS
call. TEC-OS's entry uses its own stack internally and restores the caller's
`SP` when returning. That restores the stack position, not the contents of
your registers.

`PUSH` saves a register pair on your stack and moves `SP` down by two. `POP`
restores a pair and moves it up by two. The most recently pushed pair comes
off first. For example, saving `HL` then `BC` requires restoring `BC` then
`HL` before a return. `PUSH AF` saves `A` and the flags together when
those are the values you need afterwards.

The program begins with 30 bytes available below its inherited return word.
A call uses two of those bytes until it returns. Two saved pairs use another
four. Balanced calls and saves in a small BDOS program can use that space
but deeper nesting needs a stack of your own. Chapter 11 explains its
placement and the exit rule after changing `SP`.

## Printing a character or string

Function 2 prints the character in `E`. A loop that keeps its text pointer
in `HL` and its remaining count in `B` must save both across that call. This
fragment from the SHOW listing assumes the next character is already in
`A`:

```asm
        PUSH    HL
        PUSH    BC
        LD      E,A
        LD      C,2             ; print the character in E
        CALL    BDOS
        POP     BC
        POP     HL
```

The restored pointer and count are available for the next loop step. The
reverse order of the two pops also restores the stack to its position before
the pushes. Chapter 10 contains the complete SHOW listing and its file
operations.

Function 9 sends the string from `DE` up to a `$`, omitting that terminator.
A carriage return and line feed in the string end a displayed line. Their
byte values are 13 and 10. A zero byte is not this function's terminator.
Your source therefore supplies a final `"$"` in the `DB` data used for a
function-9 call.

## Reading a key or an edited line

Function 1 waits for the next key and prints it as well as returning its
byte in `A`. A single-key choice can use that result directly. An answer
containing several characters is easier to read with function 10, which
supplies the line editor.

Function 10 takes a buffer address in `DE`. Its first byte gives the maximum
character count. The second receives the number entered and the characters
follow it. A maximum of 20 needs a 22-byte buffer: two control bytes
followed by the space for input. The returned count defines the text's
length so it is not automatically a function-9 string.

Save this program as `B:LINE.ASM`. It reads a line, prints a fixed
acknowledgement and returns to the command prompt:

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

`BUF` reserves the two control bytes and 20 input bytes. After function 10
returns, the program loads `DE` and `C` again for function 9. It does not
depend on their values surviving the input call. `GOT` is a fixed
acknowledgement, not a copy of the text in `BUF`. The final `RET` uses the
return word supplied by the CCP.

On drive B, build it with `TAS LINE`. This serial capture begins at that
command:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card line.img B: 'TAS LINE' '@start LINE' HELLO. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
B:WORK>TAS LINE
LINE.COM written
```

Type `LINE` to run it, then `HELLO` and Return. The same run continues:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card line.img B: 'TAS LINE' '@start LINE' HELLO. Console excerpt; terminal controls and editor redraw outside the selected span omitted. -->
```text
B:WORK>LINE
HELLO
GOT

B:WORK>
```

Function 10 echoes `HELLO` while reading it. The buffer then holds
count 5 followed by those five characters. Function 9 prints `GOT`.
The program's final `RET` reaches warm boot through `0000h`.

Function 10 ends the line at Return, line feed or the buffer's maximum length. The
editing keys operate as at the command prompt: backspace removes the last
character, `^X` removes the line and `^R` reprints it. A `^C` on an empty
line ends the program. Within a nonempty line it is ignored. Command-history
recall is specific to the CCP prompt. In a program's ordinary function-10
input, `^W` and `^N` are input bytes rather than recall commands.

## Input while output is running

Functions 1, 2, 9 and 10 expand tabs to spaces up to the next multiple of eight
columns, counted from the last carriage return. They also copy printed output to
the list device while `^P` has that copy enabled. In CP/M the list device is the
printer. TEC-OS's normal list routine discards the bytes so toggling the copy
has no visible effect on the unmodified system.

| Key | Effect |
| --- | --- |
| `^P` | Turns the copy of console output to the list device on or off |

Functions 2 and 9 check for a key before printing each character. `^S`
pauses output until the next key. A `^C` used to end that pause terminates
the program by warm boot. Any other resume key is consumed and has no
further effect. A `^P` detected during output toggles the copy just as it
does during line input.

The first other key detected during output is held for the next BDOS console
read. While that key is pending, no further key is read during output.
Reading it consumes the pending byte and permits later input to be taken.
This is a single pending key, not a buffer for a stream typed ahead while
the program is busy.

## Direct input and the console functions

Function 6 lets an interactive program handle keys without the BDOS's echo
and line editing. With `E = FFh`, it returns a waiting byte in `A` or zero
if none is ready. It neither waits nor prints the key. With any other `E`,
it prints that byte without the BDOS's tab expansion, pause checking or list
copy. A full-screen program can use this call for both input and output. The
selected console still interprets its own control bytes, as Chapter 17
explains.

Function 11 reports whether input is ready: `A = 1` for a waiting key,
otherwise 0. It can read the key internally and hold it for the next BDOS
input call. This allows you to check for input between other operations
while keeping all access through the BDOS. The complete set of console calls
is:

| Function | Name | Takes | Returns |
| --- | --- | --- | --- |
| 1 | Console input | nothing | `A`: the next key, which is also printed |
| 2 | Console output | `E`: the character | nothing |
| 6 | Direct console I/O | `E`: FFh to read or a character to print | for FFh, `A`: the key or 0 if none is waiting |
| 9 | Print string | `DE`: the string, ended by `$` | nothing |
| 10 | Read console buffer | `DE`: the buffer | the line in the buffer |
| 11 | Console status | nothing | `A`: 1 if a key is waiting, else 0 |

Appendix A lists all BDOS functions and their full register and result
contracts.

## Returning to the prompt

The prompt normally returns on the drive and in the user area where your
program started. If that drive is unavailable, it falls back to A.

A top-level `RET` with the stack restored ends your program through warm
boot. A jump to `0000h` or BDOS function 0 also takes that path. Console
input and error handling can end a program there too:

- `^C` while a function-10 line is empty.
- `^C` after `^S` has paused output through function 2 or 9.
- A key pressed after a default-mode BDOS error such as
  `Bdos Err On B: Bad Sector`.

Those exits pass through the BDOS's abort path before warm boot. Chapter 13
distinguishes their effects on a remaining command chain. Chapter 10 explains
disk errors and returned error modes alongside file calls.

Warm boot rebuilds the jumps at the bottom of memory and restarts the CCP.
Services remain installed and the selected console stays in use. Pending card
writes are flushed before the next load. A successful flush puts them on the
card while a failure drops the failed lines in the block cache and reports
`Write lost`. Chapter 16 explains the full warm-boot sequence.

