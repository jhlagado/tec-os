# 23. Command history

Checked against TEC-OS 98c6416, with the starter card's `EDIT.COM` from Edit
845d062, whose card copy has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

At the CCP's prompt, `^W` brings back the line typed before, and `^N` the line
after the one shown. Chapter 3 describes the keys from the prompt. This
chapter describes the store behind them: a ring of 256 bytes in EXPAND 1, the
way a line goes into it, the way `^W` and `^N` walk it inside BDOS function
10, and what a warm boot and a reset leave of it. All of it is in
`src/history.asm`, with a few lines in the BDOS's line input and the CCP.

## Recalling a line

`^W` at an empty prompt puts the newest line from the history in the line
buffer and echoes it, as if it had been typed. A second `^W` replaces it with
the line before that. The line can then be edited with the keys of BDOS
function 10, such as backspace, and Return runs it. Here two lines were typed,
and then `^W`, `^W` and Return; the screen shows the recalled `CON` after the
prompt, and its reply:

<!-- node book/capture.mjs --board pico --screen CON "TYPE STARTUP.CMD" "@start "$'\x17\x17' -->
```text
A>CON
CON: CRT: PICO9918
A>TYPE STARTUP.CMD
PICO.DRV
GLCD.DRV

A>CON
CON: CRT: PICO9918
A>
```

Most of the transcripts in this chapter come from the PICO9918's screen. A
recall erases the line already on the console with a backspace, a space and a
backspace for each character, and the screen shows the result of the erasure
where the serial output would show the bytes. The capture's `@start` line
types its keys and a Return together; `$'\x17'` is the shell's way of writing
`^W`, `$'\x0e'` `^N` and `$'\x08'` backspace.

A recalled line is the start of a new line, not a fixed copy. Here `DIR *.DRV`
was recalled with `^W`, its last three characters were taken off with
backspace and `CMD` was typed in their place:

<!-- node book/capture.mjs --board pico --screen "DIR *.DRV" "@start "$'\x17\x08\x08\x08CMD' -->
```text
A>DIR *.DRV
PICO.DRV     PICO40.DRV   PICO32.DRV   GLCD.DRV
4 files, 986K free
A>DIR *.CMD
STARTUP.CMD
1 file, 986K free
A>
```

`^N` moves the other way, toward the newest line, and one step past the newest
it leaves an empty line. In this run `^W` `^W` showed `CON`, `^N` showed `DIR
*.CMD`, and a second `^N` emptied the line, so the Return ran nothing and the
CCP printed the prompt again:

<!-- node book/capture.mjs --board pico --screen CON "DIR *.CMD" "@start "$'\x17\x17\x0e\x0e' -->
```text
A>CON
CON: CRT: PICO9918
A>DIR *.CMD
STARTUP.CMD
1 file, 986K free
A>
A>
```

At the oldest line `^W` changes nothing, and with no line shown `^N` changes
nothing.

## The ring at BD00h

The history is the page at `BD00h` in EXPAND 1 (`src/history.asm:14`). Chapter
13 lists EXPAND 1's contents: the block cache's 30 lines at `8000h–BBFFh`, the
cache's table at `BC00h`, the history at `BD00h` and a free page at `BE00h`.
EXPAND 1 shares the addresses `8000h–BFFFh` with EXPAND 0, which holds
TEC-OS's workspace and the top of the program area, and bit 2 of the system
latch at port `FFh`, `LATEXP`, selects it (`src/layout.asm:13`, `18`). The
copy services `XMOVE` and `MOVE`, a program's route to EXPAND memory, reject
every byte of EXPAND 1: cold boot sets its low mark to `80h`, so the range
they may copy in it is empty (`src/boot.asm:163` to `165`,
`src/layout.asm:23`, `src/xmove.asm:4` to `6`).

Two routines read and write the ring a byte at a time. `HGET` returns the byte
at offset `L` in `A`, and `HPUT` writes `A` there, with `H` holding the ring's
page, `BDh` (`src/history.asm:16` to `42`). Each saves the interrupt state,
turns interrupts off, writes the latch with `LATEXP` added to TEC-OS's copy of
it at `0040h`, makes the access, writes the latch back as it was, and turns
interrupts on again if they were on before. No stack is used while EXPAND 1 is
in view (`src/history.asm:17` and `18`). The BDOS's stack, on which function
10 runs, is in the workspace at `8000h–BFFFh` in EXPAND 0, and a push or a
return then would reach EXPAND 1's bytes in its place.

The offset into the page is `L` alone, so moving from offset `FFh` to the next
byte with `INC L` reaches offset `00h`, and the page is a ring with no end.
Each line is stored as its characters followed by a byte of 0, written forward
from the offset in `HHEAD`, a byte of the workspace in EXPAND 0
(`src/ram.asm:216` and `217`). After a line's 0, `HHEAD` holds the offset of
the byte that follows it.

The ring is kept so that the byte at `HHEAD` is always 0, and so is the byte
before it, the newest line's terminator (`src/history.asm:6` to `10`). A 0
that follows another 0 is an empty entry. The empty entry at `HHEAD` separates
the newest line from the oldest, and a walk back from the newest line stops
when it reaches an empty entry.

## Storing a line

The CCP reads a command line with BDOS function 10, and before the call it
sets the byte `HFLAG` to `FFh` (`src/cpm/ccp.asm:67` to `71`,
`src/ram.asm:137`). Function 10 ends at `LINDONE`, after Return, after a line
feed or when the buffer is full. There it reads `HFLAG`, clears it, and calls
`HSTORE` if the flag was set and the line has at least one character
(`src/cpm/bdos.asm:407` to `420`). A program that calls function 10 itself
finds `HFLAG` clear, since every warm boot clears the CCP's and the BDOS's
RAM, which holds it (`src/boot.asm:73`, `272` to `276`). So only the lines
typed at the CCP's prompt go into the history. The lines of `STARTUP.CMD`
don't: the CCP takes each of them from `STLINE` in place of function 10
(`src/cpm/ccp.asm:65` and `66`), so after cold boot the history is empty.

`HSTORE` stores the line as function 10 returns it, before the CCP turns its
small letters into capitals (`src/cpm/ccp.asm:73` to `92`), so a recalled line
comes back as it was typed:

<!-- node book/capture.mjs --board pico --screen con "@start "$'\x17' -->
```text
A>con
CON: CRT: PICO9918
A>con
CON: CRT: PICO9918
A>
```

Two lines are not stored (`src/history.asm:104` to `130`). One that holds a
byte of 0 would end early in the ring, and `HSTORE` passes over it. One that
is the same as the newest line, of the same length, is left out, so a command
repeated at the prompt takes one entry. To find the newest line `HSTORE`
starts from its terminator at `HHEAD − 1` and goes back to its first byte with
`HSTART`, which steps back until the byte before is 0 (`src/history.asm:44` to
`51`). The comparison goes on to the end of the new line, counting differences
in `C`, and the line counts as a repeat only if there were none and the newest
line ends at the same place.

Here `CON` was typed twice and `DIR *.CMD` once. The ring holds two lines, so
`^W` three times reached `CON` and stayed there:

<!-- node book/capture.mjs --board pico --screen CON CON "DIR *.CMD" "@start "$'\x17\x17\x17' -->
```text
A>CON
CON: CRT: PICO9918
A>CON
CON: CRT: PICO9918
A>DIR *.CMD
STARTUP.CMD
1 file, 986K free
A>CON
CON: CRT: PICO9918
A>
```

A line to be stored is written from `HHEAD` with `HPUT`, then its 0, and
`HHEAD` moves past the 0 (`src/history.asm:133` to `144`). When the ring is
full, the new line overwrites the oldest lines, and the last one it reaches
may be cut part way through. The loop at `HSCLR` deals with that remnant: it
writes 0 forward from the new `HHEAD`, up to and including the first byte that
was 0 already (`src/history.asm:145` to `151`). That byte is the terminator of
the line partly overwritten, so the remnant is gone, the byte at `HHEAD` is 0,
and the ring holds only whole lines. When nothing was overwritten, the byte at
`HHEAD` was already 0, and the loop clears that one byte.

Each line takes its length and one byte more. The CCP's buffer holds up to 127
characters (`src/boot.asm:279` and `280`), so a line of that length takes 128
bytes of the ring, half of it, and short commands such as `DIR` take four
bytes each.

## ^W and ^N in function 10

Function 10 passes `^W` and `^N`, codes 23 and 14 (`src/cpm/bdos.asm:41` and
`42`), to `LINHIST` (`src/cpm/bdos.asm:267` to `270`). With `HFLAG` clear, in
a program's call, `LINHIST` sends the code on as an ordinary character into
the buffer, as CP/M 2.2's function 10 does (`src/cpm/bdos.asm:298` to `301`).
With it set, it calls `HREC` (`src/cpm/bdos.asm:302`).

`HPOS` records the line shown, as the offset of its terminator
(`src/ram.asm:138`). Each call of function 10 starts with `HPOS` equal to
`HHEAD`, the empty entry, which means no line is shown yet
(`src/cpm/bdos.asm:232` and `233`). `HREC` works from `HPOS`
(`src/history.asm:53` to `102`):

- For `^W` it finds the first byte of the shown entry with `HSTART`. The byte
  before that is the terminator of the entry before, and the byte before that
  terminator is that entry's last character. If that character is 0, the entry
  before is empty: the walk has reached the oldest line, and `HREC` returns
  with the line as it is (`src/history.asm:62` to `68`). Otherwise the entry
  before's terminator becomes `HPOS`.
- For `^N` with no line shown, `HPOS` equal to `HHEAD`, `HREC` returns at once
  (`src/history.asm:70` to `72`). Otherwise it steps forward to the next byte
  of 0, the terminator of the entry after, which becomes `HPOS`
  (`src/history.asm:73` to `76`). After the newest line that next 0 is the one
  at `HHEAD`, so the entry shown is the empty one and the line becomes empty.

To show the entry, `HREC` erases what is in the buffer with `LINERASE`, the
routine behind `^X`, which takes the characters off one at a time and erases
each on the console (`src/cpm/bdos.asm:394` to `405`). It then copies the
entry's bytes into the buffer with `HGET`, counting and echoing each one, as
if it had been typed, up to the buffer's maximum (`src/history.asm:83` to
`102`). From then on function 10 goes on reading keys, and the recalled
characters are edited like typed ones.

## Warm boot and reset

A warm boot leaves the history as it was. Nothing in the warm boot path writes
to EXPAND 1's page at `BD00h`, and `HHEAD` is in the part of the workspace
above the RAM BIOS table at `BF00h`, outside the RAM that `CPMINIT` clears
(`src/boot.asm:59` to `82`, `272` to `276`, `src/ram.asm:186`, `217`). A
program's exit, a `^C` at the prompt and BDOS function 0 all keep it. Here
`^C` at the prompt was followed by `^W`:

<!-- node book/capture.mjs CON "^C" "@start "$'\x17' -->
```text
A>CON
CON: TTY: serial terminal
A>^C
A>CON
CON: TTY: serial terminal
A>
```

A reset clears it. Cold boot clears the resident workspace, `HHEAD` with it
(`src/boot.asm:23` to `27`), and `MEMINIT` fills all of EXPAND 1 with 0 before
it marks the cache's lines empty (`src/boot.asm:149` to `160`). The page at
`BD00h` is then all zeros, `HHEAD` is 0, and the byte before it, at offset
`FFh`, is 0: the ring is empty and still kept as `HSTORE` and `HREC` require.
This holds for a recognised reset too, the one that keeps the selected
volumes, since only the drives' table is carried across it (`src/boot.asm:131`
to `135`). After the reset in this run, `^W` and Return gave an empty line:

<!-- node book/capture.mjs CON "@reset" "@start "$'\x17' -->
```text
A>CON
CON: TTY: serial terminal
A>
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>PICO.DRV
PICO.DRV?

A>GLCD.DRV
GLCD.DRV?

A>
A>
```
