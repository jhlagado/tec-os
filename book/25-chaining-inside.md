# 25. Chaining inside

Checked against TEC-OS 08da4d6, with the starter card's `EDIT.COM` from Edit
845d062, whose copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

Chapter 11 describes a command line split at `!`, the condition `:`, the
return code and BDOS function 47 as you use them. Behind them are a command
line that outlives the warm boot at the end of each program, one byte that
marks the next piece of it, a 16-bit code and a copy into the CCP's buffer.
This chapter follows a line from the prompt through the CCP's main loop: where
the line is kept, how the loop takes a piece, the test of the code at `:`,
the paths that drop the rest of the line, and function 47's checks and copy.
The code is in `src/cpm/ccp.asm`, with function 47 and function 108 in
`src/cpm/bdos.asm` and the line's storage in `src/ram.asm`.

## The line kept across a warm boot

A program in a piece of a line ends with a warm boot, and the warm boot clears
the CCP's and the BDOS's working memory as a fresh load of them from disk
would leave it (Chapter 14). The rest of the line survives because the CCP's
RAM is in two parts. Its first 202 bytes, from `CMDFCB` at `BCEBh` to
`CCPCLR` at `BDB5h`, are the two FCBs the built-ins parse names into and the
command buffer that BDOS function 10 fills: a byte for the buffer's maximum
length, `CMDBUF`, a byte for the length read, `CMDLEN`, and 128 bytes of
characters, `CMDTXT`, at `BD35h` (`src/ram.asm:68-81`). `CPMINIT`, which warm
boot calls, clears from `CCPCLR` to `BDOSRME`, the end of the BDOS's RAM, 331
bytes, so the command buffer and the two FCBs before it are kept
(`src/boot.asm:270-277`, `src/boot.asm:73`). The FCBs need no clearing,
since each use of them parses a name into them in full and clears the rest
(`src/cpm/ccp.asm:1299-1324`).

The position of the next piece is `CHPOS`, one byte at `BFE5h` in the part of
the workspace above the RAM BIOS table, which warm boot leaves alone
(`src/ram.asm:192`, `src/ram.asm:240`). It holds the piece's offset in
`CMDTXT` plus one, and 0 when no piece is left, so one byte covers the 128
offsets with 0 to spare. The return code, `PRGCODE` at `BF57h`, is in the same
block (`src/ram.asm:229`). Cold boot clears the whole resident workspace, from
`WSBASE` to `WSEND`, which ends after `CHPOS` (`src/boot.asm:23-27`,
`src/ram.asm:241-242`); after a reset, then, no piece is left and the code is
0.

The buffer's maximum length, 127, is set by `CPMINIT` at every warm boot and
so at every cold boot, which runs on into warm boot (`src/boot.asm:279-281`,
`src/boot.asm:54-59`). A startup line is cut to the same length: `STLINE`
copies at most 127 characters of a line of `STARTUP.CMD` into `CMDTXT` and
passes over the rest of the line (`src/drv.asm:377`, `src/drv.asm:391-393`).
Function 47 takes a line whose 0 is within 128 bytes, so at most 127
characters too (`src/cpm/bdos.asm:51-64`). With that limit a piece's command
tail fits the page-zero buffer at `0080h`. A program's name has at least one
character, so its tail has at most 126, which `PREPPAGE` copies to `0081h`
with a 0 after it, the 0 landing at `00FFh` at the latest
(`src/cpm/ccp.asm:1273-1290`). A tail one character longer would put its 0 at
`0100h`, over the first byte of the program, which `LOADCOM` has already
loaded by then (`src/cpm/ccp.asm:269-280`).

## The main loop

The CCP's loop starts at `MAINLOOP`, after any command and after the entry
from a warm boot. `SAVEDU` stores the drive and user area at `0004h` and
returns the drive, and the loop prints the prompt with it (`src/cpm/ccp.asm:58-65`,
`src/cpm/ccp.asm:192-211`). It then looks for a line in an order with three
places (`src/cpm/ccp.asm:66-75`):

1. the next piece of a chained line, found by `CHSKIP`;
2. the next line of the startup file, from `STLINE`, once `CHPOS` is 0;
3. a line typed at the keyboard, by BDOS function 10, with the history
   turned on for it through `HFLAG`.

A chained line's pieces therefore run before the startup file's next line,
whether the line came from the startup file, from the keyboard or from
function 47. This card's startup file has three lines, and the first two hold
`!`:

```sh
printf 'DIR *.CMD!:TYPE STARTUP.CMD\nPICO.DRV!:VOLS\nUSER 0\n' > startup.cmd
cp dist/starter.img start.img
node tools/tecvol.mjs put start.img A startup.cmd --text
```

<!-- node book/capture.mjs --card start.img -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>DIR *.CMD!:TYPE STARTUP.CMD
STARTUP.CMD 
1 file, 986K free
A>:TYPE STARTUP.CMD
DIR *.CMD!:TYPE STARTUP.CMD
PICO.DRV!:VOLS
USER 0

A>PICO.DRV!:VOLS
PICO.DRV?

A>:VOLS
A>USER 0
A>
```

Each line of the file is echoed whole by `STLINE`, through BDOS function 9,
so a `$` in a line would end its echo there (`src/drv.asm:407-411`), and its
later pieces are echoed by the CCP after their own prompts. `PICO.DRV`
fails on this serial-only board, so `:VOLS` is dropped, and the loop goes on to
the startup file's third line.

`CHSKIP` reads `CHPOS` and returns at once with `Z` when it is 0. Otherwise it
points `HL` at `CMDTXT - 1` plus `CHPOS` and steps past spaces and `!`, and
returns `Z` only if it reaches the line's 0 (`src/cpm/ccp.asm:173-190`).
Empty pieces and spaces between pieces are passed over there, and a line that
ends with `!` ends the same as one without it. When a piece is left, the loop
goes to `MLECHO`, which prints the piece from `HL` up to its `!` or the line's
0, after the prompt (`src/cpm/ccp.asm:91-104`). The text is printed as it is
in the buffer, before the piece is turned into capitals, so the echo keeps the
case of what was typed.

A new line, typed or from the startup file, reaches `MLGOT` with its length in
`CMDLEN`. `MLGOT` writes a 0 after the line's last character, sets `CHPOS` to
1 for the line's first piece and calls `CHSKIP`, so that a new line and a
chained piece are taken by the same code; a line of nothing but spaces and `!`
goes straight back to the prompt (`src/cpm/ccp.asm:77-89`). The line typed is
already on the screen, echoed by function 10 as it was typed, and a startup
line was echoed by `STLINE`, so neither goes through `MLECHO`.

## Taking a piece

`MLTAKE` takes the piece at `HL` (`src/cpm/ccp.asm:106-149`). Its steps are:

1. If the piece starts with `:`, the code is tested, as the next section
   describes, and `HL` moves past the `:`.
2. `ARGSTRT` is set to the piece's start.
3. The loop at `MLTK1` turns each small letter into a capital, up to the
   piece's `!` or the line's 0.
4. At a `!`, `MLTK2` writes a 0 over it, so the piece ends there for every
   routine that reads it, and sets `CHPOS` to the offset of the byte after
   it, plus one. At the line's 0, `CHPOS` is set to 0.
5. `PRGCODE` is set to 0.
6. Spaces are passed over. A piece with nothing left, such as a `:` alone,
   goes back to the prompt.

Only then does the CCP look at what the piece is. A drive letter and a colon
alone select the drive (`src/cpm/ccp.asm:150-171`), and anything else goes to
`NOTDRIVE`, which compares the command with the built-ins' names and
otherwise loads a program or a driver (`src/cpm/ccp.asm:213-286`). Every
routine after `MLTAKE` reads the piece through `ARGSTRT` and stops at its 0,
so a built-in or a program reads its own piece and nothing of the pieces after
it. `PREPPAGE` copies the command tail from `ARGSTRT` up to the 0, and so the
tail at `0080h` ends at the `!` (`src/cpm/ccp.asm:1262-1290`).

`CHPOS` is set before the command runs. A program that ends normally, by
`RET`, by a jump to `0000h` or by BDOS function 0 (`src/cpm/bdos.asm:132-133`),
reaches the warm boot, then the CCP's entry and `MAINLOOP`, and `CHSKIP` finds
the next piece where `MLTAKE` left it. A built-in ends with a jump to
`STARTED` or `MAINLOOP` and reaches `CHSKIP` the same way.

The offset arithmetic at `MLTK2` uses only the low bytes of the addresses:
`L` less the low byte of `CMDTXT - 1` (`src/cpm/ccp.asm:139-143`). The
difference is below 256, so the 8-bit subtraction gives it whatever page the
buffer is on.

## The return code and :

BDOS function 108 is `FNRETC` (`src/cpm/bdos.asm:184-196`). The BDOS's
entry sends function 108 there before its table, as it does 50 and 47
(`src/cpm/bdos.asm:79-90`). `FNRETC` tests `DE`: `H AND L` is `FFh` only for
`FFFFh`, and then it returns `PRGCODE` in `HL`, with `A` and `B` set from it
as for every word the BDOS returns (`src/cpm/bdos.asm:126-130`); any other
`DE` is stored in `PRGCODE` and the call returns 0. There is one code for
every program, and in the ROM only `FNRETC`, the CCP and cold boot write
it.

At step 1 of `MLTAKE` the CCP reads `PRGCODE` into `DE`
(`src/cpm/ccp.asm:111-123`). If `D` isn't `FFh` the code is below `FF00h`, a success. If `D` is `FFh` and
`E` is too, the code is `FFFFh`, also a success. Anything else, `FF00h` to
`FFFEh`, is a failure: `CHPOS` is set to 0 and the loop goes to `STARTED`,
which prints a new line and the prompt. The piece was echoed by `MLECHO`
before `MLTAKE` read it, so the screen shows the `:` piece that didn't run,
and with `CHPOS` at 0 nothing more of the line runs. A `:` at the start of a
new line tests the code in the same way, and the code there is that of the
last command run, which may be the last piece of the line before.

The code is cleared at step 5, after the test, so the test reads the code
of the command before and the command about to run starts from 0. A program
that calls function 108 with `DE = FFFFh` at its start reads that 0.

The CCP sets the code to a failure in one place, `ERRGO`, which stores
`RCFAIL`, `FF00h`, and prints the message at `DE` before it goes to
`STARTED` (`src/cpm/ccp.asm:20`, `src/cpm/ccp.asm:335-341`). `BADCMD`, which
prints a command or argument with a question mark, falls through into it
(`src/cpm/ccp.asm:315-338`), and the built-ins' messages go there by `JP
ERRGO`: `NO FILE` from `FILENO`, `FILE EXISTS` from `REN`, `NO SPACE` from
`SAVE`, and `COPY`'s four messages through `CPFAIL` (`src/cpm/ccp.asm:830-832`,
`src/cpm/ccp.asm:923-925`, `src/cpm/ccp.asm:1257-1259`,
`src/cpm/ccp.asm:1033-1034`). A program that isn't found, won't load or is a
driver that won't install reaches `BADCMD` (`src/cpm/ccp.asm:250-279`). Every
other end of a built-in leaves the code at 0, among them `COPY`'s `COPIED`
line, which is printed through `PRTGO`, the entry after the store
(`src/cpm/ccp.asm:1025-1032`, `src/cpm/ccp.asm:339`).

## Paths that drop the rest

A line is dropped by setting `CHPOS` to 0. Besides the failed `:` above, the
BDOS does it in `CHDROP`, which clears `CHPOS` and jumps to the warm boot through the RAM
BIOS table (`src/cpm/bdos.asm:73-77`). Two kinds of event go through
`CHDROP`:

- `^C` as the first key of a line read with function 10. `LINABRT` prints
  `^C` and jumps to `CHDROP` (`src/cpm/bdos.asm:365-375`). At the CCP's own
  prompt no piece is left, since the CCP calls function 10 only with `CHPOS`
  at 0, so the drop matters for a program that reads a line.
- A disk error. `DISKERR` prints `Bdos Err On`, the drive and the cause, and
  waits for a key (`src/cpm/bdos.asm:2431-2441`); the routine for each cause
  then jumps to `CHDROP`: `File R/O` from function 19, `R/O` from `CHKRO`,
  `Select` from `SELFAIL` and `Bad Sector` from `BADSECT`
  (`src/cpm/bdos.asm:703-705`, `src/cpm/bdos.asm:2390-2410`,
  `src/cpm/bdos.asm:2426-2429`). A failed read of a directory record goes to
  `RDFAIL`, which jumps to `CHDROP` with no message
  (`src/cpm/bdos.asm:1859`, `src/cpm/bdos.asm:2423-2424`).

A reset drops the line by clearing `CHPOS` with the rest of the workspace.

Two ends of a command leave `CHPOS` as it was, and the line runs on. A key
that stops a listing at `[more]`, `^C`, Esc or `Q`, sets carry in `PGNEWL`,
and `DIR` and `TYPE` then end through `STARTED` like a listing that ran to
its end (`src/cpm/ccp.asm:717-732`, `src/cpm/ccp.asm:486`,
`src/cpm/ccp.asm:548`, `src/cpm/ccp.asm:819-828`). A failed write of the
cache at a warm boot prints `Write lost` from `CWBOOT`, which returns to
`WBOOTR`, and that jumps to the CCP's entry with nothing changed in `CHPOS`
(`src/cache.asm:347-355`, `src/boot.asm:79-82`).

## Function 47

Function 47 is `FNCHAIN` (`src/cpm/bdos.asm:46-71`), and the BDOS's entry
sends it there before its table (`src/cpm/bdos.asm:88-89`). It reads the
line at `CURDMA`, the DMA address, in two passes.

The first pass checks the line. `B` counts 128 bytes from the DMA address,
and the loop stops at the first 0. A carriage return or a line feed before
it, or 128 bytes with no 0, sends the call to `FNCHNO`, which returns `FFh`
in `A` through `RETA`, with the program's stack back and nothing changed
(`src/cpm/bdos.asm:51-64`, `src/cpm/bdos.asm:122-130`). A line from the
keyboard or the startup file can hold neither character either: function 10
ends a line at either one, and so does `STLINE` (`src/drv.asm:387-390`).

The second pass copies. `LDIR` copies 128 bytes from the DMA address into
`CMDTXT`, the line, its 0 and whatever follows the 0, and `CHPOS` is set to
1, the line's first piece (`src/cpm/bdos.asm:65-70`). `CMDTXT` has 128 bytes,
so the copy fills it exactly. The copy is made during the call, before the
warm boot and before the next program is loaded, so the line may be anywhere
in the caller's memory, even where the chained program loads. `CMDLEN` isn't
set: from here on the line is read only up to its 0.

`FNCHAIN` then jumps to `BIOWBT`, the warm boot entry of the RAM BIOS table
at `BF03h` (`src/cpm/bdos.asm:14`, `src/cpm/bdos.asm:71`). A program that
has replaced that entry gets the call, as it does for the other warm boots
the BDOS makes. The warm boot keeps `CMDTXT` and `CHPOS`, and at `MAINLOOP`
`CHSKIP` finds the line's first piece. The loop echoes it with `MLECHO` and
takes it with `MLTAKE` as it does any chained piece, so a `:` at its start
tests the code the calling program left. `E`, which CP/M 3's function 47
reads, is ignored; the CCP's entry takes the drive and user area from
`0004h`, as after any program (`src/boot.asm:80-82`, `src/cpm/ccp.asm:26-52`).

The line from function 47 replaces the whole of the old line, and `CHPOS`
points at its start, so the pieces of the old line after the program are
gone. An empty line, a 0 at the DMA address, leaves `CHSKIP` nothing to find,
and the CCP goes on to the startup file or the keyboard.

`test/chain.test.mjs` runs these rules on the host model of Chapter 26: lines
of up to 32 pieces, `:` after each kind of failure, the drops, function 47's
rejections and copy, and the program's view of page zero after a piece and
after function 47, which is the same as after a typed command.
