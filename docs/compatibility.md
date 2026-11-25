# CP/M 2.2 compatibility

TEC-OS runs unmodified COM programs that use the documented CP/M 2.2
interfaces, size themselves from the BDOS address at `0006h` and fit the TPA:
46,790 bytes (`0100h–B7C5h`) on the starter card with nothing loaded, and at
least 46,534 on any card, since cold boot places the BDOS entry below the
allocation vectors of the drives the card asks for: the starter card asks for
three, each with a vector for an 8 MiB volume, and a card can ask for four. A card of two volumes and no
drives field gives 47,240. A board with a PICO9918 has the same: its console
is in the ROM and its RAM in the BIOS's state (KS39). The GLCD's driver takes
three pages under the stub's page, leaving 45,568 on the starter card. The
starter card loads `SHELL.SVC`, which takes eleven pages there, leaving
43,520, and 42,752 with the GLCD's driver too. The CCP loads a `.COM` up to
the start of the page holding the word at `0006h`, so the largest it loads on
the starter card with nothing loaded is 46,336 bytes (`0100h–B5FFh`), 200
below the TPA: a program may use the rest. It reports version 2.2.

## BDOS functions

The BDOS is an adaptation of Portable CP/M, which implements functions 0–40
with their documented conventions; 38 and 39 return zero, and functions above
40 return zero, except 45, 47, 48 and 108; CP/M 3's function 50 is not provided, and a
program reaches the BIOS through the jump table at `(0001h)`. Function 108 is CP/M 3's program return code: `DE =
FFFFh` gets it into `HL`, any other `DE` sets it; one code serves every
program, and it is 0 after a reset. The CCP clears it as it takes each
command and sets it to FF00h when a command isn't found, won't load or is a
built-in that fails. Function 47 is TEC-OS's chain, from CP/M 3's: the
command at the DMA address, ended by a 0 within 128 bytes, becomes the next
command line and the program ends by warm boot. With `SHELL.SVC` in, its pieces
run under the shell's rules; with no shell the line runs whole, as one command,
so `TYPE X!TYPE Y` is `TYPE` with the tail `X!TYPE Y`. A string with no 0
there, or holding a CR or LF, returns `A = FFh` and the program goes on. `E`
is ignored. Function 45 is CP/M 3's error mode: with `E = FFh` a BDOS error
returns to the program with `A = FFh` and `H` its code (1 disk I/O, 2 read-only
disk, 3 read-only file, 4 select) and no message, and the rest of the line
stays; with `FEh` the message is said first; any other `E` is the default, the
message, a key and the program's end. Warm boot puts the default back. Function
48 is CP/M 3's flush: every changed line of the cache goes to the card, A:'s
pending block among them, `A = 0`, or `FFh` if a write failed, that line then kept
for the next flush; `E = FFh`'s purge is the same flush. Function 12 still reports 2.2. The probe in `test/programs/probe.asm` checks on TEC-OS:

| Area | Functions | Result |
| --- | --- | --- |
| Version | 12 | 2.2 reported |
| Create, write, close, reopen, read to end | 15, 16, 20, 21, 22 | Pass, across two extent boundaries |
| Random read and write | 33, 34 | Pass; neighbouring records in the same SD block unchanged, coalesced or written behind |
| File size | 35 | Pass; a new extent's size is visible after close, as in CP/M 2.2 |
| Sparse random write | 34 | Pass |
| Rename, delete | 23, 19 | Pass |
| Wildcard search | 17 | Pass |
| User areas | 32 | Pass; files in one user area are invisible from another |
| Drive selection | 14, 25 | Pass |
| Read-only volume | 22, 29 | `Bdos Err On C: R/O`; card unchanged. Function 29 lists the volume once its drive has been selected |

A sequential write (21) moves to the next extent when it needs it, as CP/M
2.2's does: the write of record 128 of an extent, not the write of record
127, opens or makes the next one. With the directory full that write returns
1 and leaves the FCB on its extent at record 128, so the same write made
after an entry is freed makes the extent and goes on, with none missing. A
file of 128 records has one directory entry.

Function 32 keeps the low five bits of any `E` but FFh, as CP/M 2.2's does:
user numbers 0–31 reach the directory, and no `E` makes the user E5h, the
user byte of an erased entry. A program's areas last while it runs: warm
boot clears the user number, so every prompt is in area 0, and the CCP keeps
0004h's user nibble zero.

Function 13 resets the disks and selects drive A, and leaves the user number
as it is, as CP/M 2.2's does.

Function 22 makes the extent the FCB's `EX` names, of module 0: as CP/M
2.2's make, it clears `S2` and keeps `EX`, and clears `S1`, the record
count and the allocation map.

A file with the read-only attribute (`t1`'s bit 7) is refused with
`File R/O` (`Bdos Err On A: File R/O` for a file on A:), and the program
ends after a key, for a write (21, 34, 40) through an FCB opened on it, a
rename (23) and an erase (19), as in CP/M 2.2. Function 30 still sets or clears the attribute on such a
file, as CP/M 2.2's does, so a program can make it read-write again.

## Command processor

`DIR`, `ERA`, `REN`, `TYPE` and drive changes, with the
syntax of the CP/M 2.2 CCP, are in ROM, with `CON` and `UNLOAD`. `DIR`'s output
is TEC-OS's own: `NAME.EXT` columns that fit the display, then the file count
and free space. Programs that parse DR's `DIR` layout will not find it.
`SAVE` is a CP/M 2.2 built-in that TEC-OS does not provide: typed, it is an
unknown command. Nothing needs it, since TAS and BAZA write their `.COM`
files, TED saves text and `MON3.SVC` loads and runs programs itself.
`USER` is the other CP/M 2.2 built-in TEC-OS does not provide. The command
processor works in user area 0 only: the prompt shows no user number, and
every return to the prompt is in area 0, whatever area a program set. Function
32 and the user byte of a directory entry are CP/M 2.2's, so a program that
uses areas while it runs still works. The one consequence is that files a
program leaves in another area cannot be listed, erased or run from the
prompt. Named volumes and `CD` are the way to keep groups of files apart.
`SUBMIT` is not supported; `.CMD` scripts are `SHELL.SVC`'s.

`SHELL.SVC`, a resident service on the starter card and the first line of its
`STARTUP.CMD`, takes the prompt through the ROM's shell hook and adds what the
ROM's CCP leaves out ([shell.md](shell.md)): the history, `COPY`, `DEL`,
`SERVICES`, the pager, lines of several commands and `.CMD` scripts. With no
shell, after a reset with a key held for one, `!` and `&` are ordinary
characters, `COPY`, `DEL` and `SERVICES` are names like any other, `DIR` and
`TYPE` don't pause, a typed `NAME.CMD` is rejected and only the first line
of `STARTUP.CMD` runs.

Under the shell a line of up to 127 characters, typed, from a script, from
`STARTUP.CMD` or from function 47, is split into pieces. `!` always separates,
as in CP/M 3, and the next piece runs whatever the last command returned. `&`
separates only after a blank or another separator, and the next piece runs only
if the last command's code is not FF00h to FFFEh: `TED X.ASM!TAS X &X` runs `X`
only if the build succeeded, and `TED` comes back after `TAS X!TED X.ASM`
whatever it returned. A skipped piece leaves the code, so a later `&` tests the
same one. These differ from CP/M 3 in two places:

- **`&` is a separator after a blank.** CP/M 3 has none, so ` &` in a CP/M 3
  command line splits it here. An `&` inside a word is text, so a tail such as
  `MBASIC /M:&HE000` passes whole.
- **CP/M 3's `:` prefix is gone.** `&` takes its place between pieces; a piece
  starting with `:` is refused as a bad name, with FF00h.

^C at a program's line input or at `TYPE`'s or `DIR`'s `[more]`, a BDOS
error's exit, a failed write retained at warm boot and a reset drop the rest of the line.
Esc or Q at `[more]`, and `ERA *.*` answered N, are answers, not failures: they
leave the code at 0, and the line goes on. The shell's built-ins:

- `DEL` is another name for `ERA`, with the same names, patterns and `ALL
  (Y/N)?` question. A built-in comes before a program of its name, so `DEL`
  under the shell doesn't run a `DEL.COM`, as `ERA` never runs an `ERA.COM`;
  `A:DEL` or `DEL.COM` still runs the file.
- `COPY SOURCE DEST` copies one file. `DEST` may be a
  drive alone, `COPY X.COM B:`, or a blank name with a type, `COPY X.COM B:.TXT`
  or `COPY X.COM B:.*`: each takes the source's whole name, so all three make
  `B:X.COM`. A destination that names the source, on the same drive after the
  current drive is filled in, is a bad command and nothing is opened: `COPY
  X.DAT`, `COPY X.DAT X.DAT` and `COPY X.DAT A:` on A: all print `COPY?`, as does
  any text after `DEST`. On a write error, a full disk or directory, the
  destination is closed with the records written before `WRITE ERROR` is
  printed.
- `SERVICES` lists the services loaded, each with its pages.
- `TYPE` and `DIR` pause with `[more]` when the screen fills.
- The prompt keeps a history of the lines typed at it. ^W puts the line before
  in the buffer, erasing the one shown, and ^N the line after; past the newest
  the line is empty. The line recalled can be edited and sent like a typed one.
  The history is a 256-byte ring in the shell's own pages, kept by warm boot and
  emptied by a reset. A line equal to the newest is not stored again, and nor is
  one holding a 0. Programs receive ^W and ^N as characters in the buffer,
  and their lines are not kept.
- Function 10 consumes terminal navigation escape bytes without storing or
  echoing them. At the shell prompt plain Up/Down recalls older/newer commands
  through the existing ^W/^N history. Bare ROM and program line input ignore
  navigation; raw character input retains it. A lone Escape
  is ignored. `ESC [` and `ESC O` start CSI and SS3 sequences, so manually
  typed text with those prefixes is interpreted the same way. CR and editing
  controls recover from an unfinished sequence. Raw BIOS and BDOS character
  input keep their existing byte behaviour (`docs/console.md`).

In ROM too:

- `NAME.SVC` installs a service, and enters it when its execution record asks,
  as `MON3.SVC`'s and `SHELL.SVC`'s do; typed again, it enters the copy that is
  in (`docs/services.md`). `UNLOAD` removes the lowest. A `.DRV` name is no
  longer a service: `NAME.DRV` produces `NAME.DRV?` before loading any COM.
  A bare name tries COM, then SVC, then CMD: the ROM's prompt tries COM and
  SVC, and the shell adds CMD scripts. A ROM or shell built-in keeps
  precedence, so a script named `TYPE.CMD` is run only by its full name.
  Explicit extensions select only their stated type. A card saved before the
  eighteen-page shell keeps the `SHELL.SVC` it holds, which runs a script only
  by its full `NAME.CMD`; a bare name goes to the ROM, which tries COM then SVC.
  The full COM, SVC, CMD order and the built-in precedence need the new shell:
  back the image up, then choose New starter card to take it. Nothing on a
  saved card is replaced silently.
- After a reset, recognised or not, and not on an ordinary exit, the first line
  of `A:STARTUP.CMD` that is neither empty nor a `;` comment runs before the
  first prompt, from the first record, on the volume on A:; a keypad key held
  through reset skips it. A shell it loads runs the rest. `docs/services.md` and
  `docs/shell.md` have the rules.

In the bare ROM CCP and under `SHELL.SVC`, `CD ?` lists the card's named
directories and their drives. `CD NAME` selects one on the current drive,
A: included, and `CD B:NAME` on another; a
volume is never on two drives. The shell prompt shows the drive and its
selection, `B:GAMES>`; the bare prompt stays `B>`. `CD` uses the ROM table's
volume services, `TNMOUNT` and `TNDESC` (`docs/shell.md`). Selections are
for the session: a reset keeps them, as long as the card still holds each
volume. `docs/recovery.md` says how.

A command runs `NAME.COM` from the current drive, or the drive it names; no
SYS attribute is needed. When there is none there, no drive was named and the
current drive isn't A:, it runs A:'s `NAME.COM` (KD-169), so `TED` and
`TAS` run from B:; the current drive stays as it was. `B:NAME` looks
on B: only. A `.PRL` file is not run: it is a `.COM` with a 256-byte header,
and none is on the starter card or written by the tools.

A service is a resident in TEC-OS's own `.SVC` format, with an installation
that can fail cleanly and a registry through which programs find its
records (`TNFIND` and `TNLIST`, ABI 5). `docs/services.md` is its interface. It goes in
whole pages just below the BDOS entry, and the word at `0006h` moves down to
the page's start, which holds a jump straight into the BDOS, however many are in;
warm boot keeps it there. Programs that size themselves from `0006h` never reach it, a
stack set from that word included. Services are
removed last in, first out, and a reset clears them. Nothing of this changes
the TPA when no service is installed, and a program written for CP/M sees
neither.

## Base page

Warm boot at `0000h`, BDOS vector at `0005h` (target `B7C6h` on the starter card, directly
below the allocation vectors), IOBYTE at
`0003h` (stored, not acted on), the drive at `0004h` with the user nibble zero, default FCBs at
`005Ch` and `006Ch`, command tail and default DMA at `0080h`, programs at
`0100h`, entered with HL 0100h, DE 0000h and A FFh from a startup line or 0
otherwise, since the CCP's run path is shared with a service's entry. CP/M 2.2 promises a program no register at entry, and
`BAZA.COM` and the programs it compiles read neither (confirmed by P7 for BAZA.COM
and its output). The BIOS jump table is at `BF00h`, the top page of EXPAND 0, and
reached through `0001h`. The BDOS calls the BIOS through it, as CP/M 2.2
does, so a program that replaces an entry there sees the BDOS's own calls,
its console output, its console reads and the warm boot after `^C` or a disk
error. Cold boot builds the table and warm boot leaves it alone, so a
replaced entry stays until reset. A program that damages the table can stop
warm boot working; reset rebuilds it. A program may return by `RET`, by `JP 0000h` or by BDOS function 0.
The user number does not survive warm boot: every program starts in area 0.

The CCP bootstrap uses returned errors for its disk reset and saved-drive
selection. A failure stays at `Disk reset failed` / `Enter retries`, with
normal commands and shell LINE blocked until a successful Enter retry
restores valid defaults. Dirty acknowledged data is retained. An already
buffered cold startup line waits and runs once after recovery. This private
bootstrap policy does not change an application's function45 error mode or
make BDOS reentrant.

Warm boot puts the video display back into its console mode: on the
PICO9918 it reloads registers 0–7 and the font, and on the GLCD it turns the
display and graphics back on. What a program left on the screen stays until
the console writes over it. The restore costs about 145,000 T-states (36 ms) per
warm boot on the PICO9918 and 7,984 on the GLCD.

## Devices

| Device | Behaviour |
| --- | --- |
| Console | One device chosen by the IOBYTE `CON:` field: serial terminal, PICO9918 with the matrix keyboard, batch, or GLCD with the matrix keyboard ([console.md](console.md)) |
| List | Output discarded; `LISTST` reports ready |
| Punch | The serial port, 8 bits, whatever the console routing |
| Reader | The serial port, 8 bits; waits for a byte. A byte the console has already taken stays with the console |
| IOBYTE | `CON:` field selects the console; the other fields are stored and ignored |

## Applications

| Program | Version | Result | Notes |
| --- | --- | --- | --- |
| TED.COM | TED `444cf3e` (`509560a0`, 14,919 bytes), on the starter card, its document kept on the card, its most called routines' heads in `RST 1` to `RST 5`, written at its start; `^T` rings and changes nothing | Runs | Edits, saves and reopens a file on the PICO9918 at 80, 40 and 32 columns and on the GLCD at 21 × 8, and `TED NAME 12` opens at line 12 (`test/ted.test.mjs`). A file ends at its first `^Z` or at a run of `00h` that fills the rest of its last record, so a text file padded with `00h`, as an older copy onto the card made it, opens with no error; a byte TED refuses stops it with `EDIT error 03` and that byte's line and column, as `EDIT error 03 L3 C5` (`test/ted.test.mjs`). F9 (Fn+9 on the matrix) saves, runs `TAS` by function 47 and comes back at the error's line and column: F5 (Fn+5) runs at once when the last build of the same source is current (no unsaved edits, a good build, nothing saved since and `NAME.COM` present), and otherwise builds, runs the program and comes back at the same place after a key; F1 (Fn+1) shows the help pages, F3 (Fn+3) opens another file with the last name offered, and F7 rings, as TBUG keeps F6 to F8; on A: and on B:, with the PICO9918 and with a serial terminal. Its chained lines need `SHELL.SVC`, which the starter card loads: with no shell the ROM runs such a line whole, so the tool still builds and the prompt comes back in place of TED. A file name and `TED.PRJ`'s `ARGS` stop at a `!` or at an `&` after a blank, where the shell splits a line, so under the shell `ARGS X &HELLO Z` runs the program once with the tail ` X`; an `&` inside a word, as in `/M:&HE000`, is text (`test/ted.test.mjs`). Each tool on a chained line names the drive TED was loaded from. A table in TED picks the tools by the source's type: `.ASM` builds with `TAS` and F5 runs `NAME` after the build; `.BAS` builds with `BAZA NAME.BAS`, which finds `BAZA.RTL` on the current drive or the drive `BAZA.COM` was loaded from, and F5 chains `BAZ NAME.BAS!TED`, the interpreter; any other type is plain text, and `TED.PRJ`'s `MAIN` may be a `.BAS`. With the starter card's BAZA and BAZ, `TED TIMES.BAS` and F9 build and come back clean, F5 runs `TIMES.BAS` under `A:BAZ` and comes back after a key, and a syntax error brings TED back on its line in the file from BAZA's `TED.ERR`, with the last `TIMES.COM` kept byte for byte; a project on B: builds with A:'s BAZA and A:'s `BAZA.RTL` (`test/ted-baza.test.mjs`). It needs ABI major 5 and asks `TNINFO` for the console's size. `TED B:X.ASM` from A: opens B:'s file, and its build runs A:'s `TAS` on it; `C:TED X.ASM` from B: builds B:'s file with C:'s `TAS` and comes back to C:'s `TED`, since TED takes the load drive from 0050h before each tool; the CCP finds a `.COM` on A: when the current drive hasn't one. Its document is the file on the card, read in place through four 512-byte page slots, with typed text in a piece table in RAM, so it is no longer bounded by the TPA: a document is at most 65,535 bytes, and the edits have about 23 KB of RAM with the shell resident. A 64,000-byte file opens whole and a 65,664-byte one is refused with `EDIT error 04` (TED's `docs/document.md` and its tests on TEC-OS); on the starter card `TED SAMPLE.ASM` opens the file in place and a line typed at the top and saved with `^S` goes before the old text (`test/starter.test.mjs`). The PICO9918's console is in the ROM, so it costs the TPA nothing. A save over a read-only file is refused with `Save failed 16`, and the text is kept. Beside the source it writes `TED.SES`, which holds the last file's name and place, and `TED.PRJ` after a good build, whose keys are `MAIN` and `ARGS`, with `TED.ERR`, `TED.$$$` and `TED.BAK` on the way; a `TED.SES` copied from another card names that card's file and place |
| Edit | build with the screen configuration block (`ECFG` at `0103h`) | Ran until `TED.COM` took its place | Edited, saved and reopened a file on the PICO9918 at 80 × 24; also verified on Triptych's CP/M 2.2 at 80 × 24. That build tested for ABI major 3 at `C003h`, so the card and the tests took it with that one byte set to 4, checked by its hash, and read `ABIVID` at `C008h`; it also edited, saved and reopened on the GLCD at 21 × 8. Its test on Triptych's CP/M went with it |
| BAZA.COM, BAZA.RTL | Baza `4204b18`, the build of `5732c4c` (`6af11dc2`, 13,440 bytes), and `c49f477` (`421a43b9`, 13,056 bytes), on the starter card | Runs | While it compiles BAZA shows a spinner, `\|`, `/`, `-` or `\` each followed by a backspace, through BDOS function 6 (Baza's README; `test/ted-baza.test.mjs`). `BAZA TIMES` compiles the starter card's `TIMES.BAS` to `TIMES.COM`, which runs at 40 columns on the PICO9918, turns away a number outside 1 to 12 and returns to the prompt. With `GLCD.SVC` loaded and a jump put in each of RST 1 to RST 6 at the prompt, BAZA puts its own vectors there while it compiles and gives all six back before it exits, its warm boot then sweeping them, `TIMES` runs and the GLCD is still the console (`test/times.test.mjs`). BAZA takes RST 1 to RST 6, whatever they hold, only while the compiler runs, so nothing that claims them, a debugger's breakpoint for one, may be entered while it compiles (Baza's release notes); a compiled program uses none. Its RST 6 is the debugger's (Origo KD-434), an exception accepted and left open. It finds `BAZA.RTL` on the current drive or on the drive it was loaded from. `BAZA NAME` opens `NAME.BAS` only, and a type given is taken as it is. With `TED.SES` present a failed compile writes `TED.ERR` as `NAME.BAS:line:1: message`, with the file's line, and a good one deletes it; it replaces `NAME.COM` only on success, renaming the old one to `BZnnnnnn.$$B` while the new one goes in and giving it its name back if the new one can't take it (Baza's README and release notes; the TED round in `test/ted-baza.test.mjs`); a `BZ000000.$$B` left on the drive doesn't stop the next build, which leaves it as it was (`test/times.test.mjs`). A failed compile sets return code FF00h, as TAS does (Baza's release notes; `test/times.test.mjs` reads it at the prompt), so under the shell `BAZA BAD &TIMES` skips `TIMES`. BAZA sets function 45's error mode with `E = FEh`, so a disk error says its message and returns: `BAZA C:TIMES` onto a read-only C: prints `Bdos Err On C: R/O` and `File I/O failed`, skips an `&` piece, gives RST 1 to RST 6 back before it exits and ends at `A>` (`test/times.test.mjs`). Its start-up check can't fail on TEC-OS: `BAZA.COM` is self-extracting, and its loader needs `(0006h)` at `51C7h` or above, the top of its 20,679-byte memory image, before it unpacks the 17,280-byte compiler, or it warm boots with no message and no `TED.ERR`, so the compiler's own `TPA too small` is never reached (Baza's `docs/size-account.md`); a service's base is never below `8000h`. A program too big for the room left still fails with `Capacity exceeded`. `DEF CALL`, `CALL` and `REG()` call machine code: the ROM's services, a service's entries or an address (Baza's `docs/call.md`); the starter card's `BOUNCE.BAS`, Baza's `examples/BOUNCE.BAS` at `5f6b58d` (`615693a5`, 5,189 bytes) with its three font lines taken through `TNGLYPH`, service 17, by `tools/lib/bounce-source.mjs` (Baza's own file still calls the retired service 15 and waits for Baza), with its keywords in capitals and its names in lower case (`bindings/basic/basic-style.md` in Origo) and its loop in integer variables, compiles and drives the PICO9918 that way: Graphics I with 16 × 16 sprites, a ship that W/A/S/D and the arrow keys move, as TEC-OS delivers them, `ESC [ A` to `D`, an unknown sequence such as `ESC [ Z` moving nothing, and `Q` giving the display back at `A>`; it compiles to a 16,128-byte `BOUNCE.COM` (`test/starter.test.mjs`). A program that claims the PICO9918 and stops on an error gives the display back before it prints, so its message shows on the console and it ends at `A>` (`test/times.test.mjs`). `VARPTR(v)` gives a variable's address (Baza's README and `docs/call.md`) |
| BAZ.COM | Baza `8655d81`, the build of `04c87c7` with TAS `fdd21f5` (`b4bceb5b`, 20,864 bytes), on the SYSTEM and BASIC volumes | Runs, a preview | BASIC's interpreter, its runtime inside: `BAZ NAME.BAS` runs the source, and TED's F5 chains it for a `.BAS`. `TIMES.BAS` runs to the end with the output it has compiled (`test/ted-baza.test.mjs`). Baza reports that with `SHELL.SVC` resident it loads Caverns' 26,804-byte source and plays it with the compiled game's text, with a few hundred bytes to spare; a program using `SQR`, `LOG`, `EXP`, `COS`, `SIN`, `TAN`, `ATN` or `^` carries the 1,946-byte maths module and has that much less room, and `FOR` and `GOSUB` frames get 1,024 bytes, about 146 deep, when 8 KB are free, else 512. Baza reports that Caverns' source plays with the word at `0006h` at `A500h`, `A200h` and `AC00h`, reaching its first prompt in 10.49 s, and that over its 306-program corpus nothing BAZA compiles and runs is refused by BAZ; what differs is memory layout (`FRE`, and `PEEK` and `POKE` of BAZA's own addresses), `RND(0)` and the compile-time checks of lines that never run. It runs `DEF CALL`, `CALL` and `REG`, `PEEK`, `POKE`, `OUT`, `WAIT`, `INP`, `FRE`, `POS`, `ON ERROR GOTO`, `RESUME`, `ERR`, `ERL`, `DEF FN`, `GET`, `SWAP`, `DEFINT`, `DEFSNG`, `DEFSTR`, `HEX$` and `VARPTR`, seeds `RND` as a compiled program does, and that a syntax error found while loading prints `?SYNTAX ERROR IN n`. Its rarely used statements are a tail at the end of `BAZ.COM`, read back from `BAZ.COM` on the drive it was loaded from when a program uses one, so the file must keep its name, or BAZ says `BAZ.COM not found`. `END`, `STOP`, `RETURN` and `NEXT` refuse anything after them, a function or operator at the start of a statement is a `SYNTAX` error, and line numbers above 32767 work. It treats `RST 1` to `RST 5` as its own and saves nothing |
| TAS.COM | TAS `f1e4dbc` (`3bd8a569`, 10,976 bytes), on the starter card and in the ROM build, where the ROM's bytes are those `fdd21f5` gave | Runs | Writes its debug file as `NAME.TBG` beside the output, on the output's drive when the command names one, a header and the sorted globals with no statement stream, which TBUG reads; TEC-OS's ROM map holds the symbols and the ROM's one segment. Accepts bare `END` as a no-op and continues assembly; an operand remains an error. Shows console-only `|/-\\` progress while reading source and clears it before completion or diagnostics; the host runner is pinned alongside TAS because progress uses BDOS function 6. Assembles `HELLO.ASM` into `HELLO.COM` and `HELLO.TBG` on TEC-OS (`test/tas.test.mjs`); its build of itself, and TED's and TDB's builds with it, are tested in Thorium. An output name ending in `.HEX`, as in `TAS NAME NAME.HEX`, writes Intel HEX: data records at the source's own 16-bit addresses with their checksums, a gap left where the source leaves one, and the end record; `.COM`, `.BIN`, `.SVC` and `.TBG` output is as before. A program assembled that way on the card loads under `MON3.SVC` and runs at its own address and at another given to `LOAD`, with the shell, `GLCD.SVC` and `MON3.SVC` all resident and 36,096 bytes of TPA, and a source with more gaps than the assembler's memory holds fails cleanly, keeping the last good output (`test/tas-hex.test.mjs`). `TAS X X.SVC` writes a service that loads. A failed build sets FF00h by function 108, so under the shell `TED X.ASM!TAS X &X` needs no `ERA X.COM`, and a read-only output is refused. The output is written as `NAME.$$O` and renamed at the end, the old output held aside as `NAME.$$P` meanwhile: a failed placing puts the old output back, a reset between the renames is recovered at the next build, a failed rename prints `rename failed`, and a source read error `source read failed`. Several statements go on one line with a `\` between them, as in `ld a,1 \ inc b \ ret`; a `\` in quotes is still an escape. A line's code, before its comment, is at most 128 characters, blanks counted, and a longer one is refused as `line too long` at column 129; a comment may be any length (Thorium's `docs/language.md`). A line of more than 128 characters of code, which `dbee66a` took, is now refused even with no `\` in it. TEC-OS's own sources have no `\` and no line of code over 128 characters, so they assembled to the same bytes under `f71cf3d` as under `dbee66a`, and the ROM, `SHELL.SVC` and `MON3.SVC` assemble to the same bytes under `7a217f9` as under `f71cf3d`. TEC-OS's own sources keep one statement a line, and the ROM's map refuses a line with several (`tools/lib/tas-d8.mjs`) |
| ATOM.COM | build that sizes its workspace from `0006h` | Ran until `TAS.COM` took its place | Assembled `HELLO.ASM` into `HELLO.COM` on TEC-OS; needs the BDOS at `78C4h` or higher |
| ATOM.COM | 0.3.7 | Refuses to run | Requires the BDOS at `E400h` or higher |
| EDIT.COM | 0.2.0 without the screen configuration | Not run | Fixed stack at `D800h–E3FFh`, above the TPA, and assumes 80 × 24 |

Released ATOM.COM 0.3.7 and Edit 0.2.0 assume a 64 KiB system; their newer
builds take every limit from the word at `0006h`, as CP/M programs should,
and run.

## Known incompatibilities

- **`[more]`** (the shell's). The key is tested with `AND DFh`, so `#` and `;` stop a listing as
  ^C, Esc and Q do.
- **TPA ceiling.** Programs that assume a BDOS at a fixed high address, or
  more than 46,534 bytes of TPA, may fail; how much a card gives depends on
  its drives and what is loaded. Measured on the starter card: 46,790 bare,
  43,776 with the shell, and 43,008 with the shell and the GLCD's driver.
- **BDOS internals.** Programs that patch the BDOS or BIOS code fail: both are
  in ROM. The BIOS jump table in RAM is the place to hook. The one BDOS call
  that does not go through it is the check for `^S` while the BDOS writes,
  which calls the ROM's console status directly so that it draws no cursor.
- **CCP overwrite.** Programs that expect to reclaim CCP memory below the BDOS
  gain nothing: the CCP is in ROM and its workspace is above the TPA.
- **No `SAVE`.** CP/M 2.2's built-in that wrote memory pages to a file is not
  provided, as the command processor's section says.
- **No `USER`.** The prompt is always in user area 0. A program that sets an
  area with function 32 and exits finds the next prompt, and the next
  program, in area 0, and the files it left in another area cannot be listed,
  erased or run from the prompt.
- **Interrupts off in disk-critical spans.** Functional BIOS `READ` and
  `WRITE` bracket their cache/SD work with CDI/CEI, preserving the incoming
  maskable-interrupt state. Entry housekeeping uses its own protected span,
  restores that state and can report before the functional handler begins.
  Thus a whole public call can include both maintenance and requested I/O.
  Older emulated per-transfer measurements were about240,000 T-states for
  one SD transfer (60ms at4MHz),490,000 with a pre-read,5,000 for a read hit
  and10,000–13,000 for a same-block data copy. Those figures describe the
  older transfer paths, not bounds on the new complete public call. Pending
  retries or required full flushes can add multiple SD spans. An interrupt
  routine must tolerate those critical spans; DI does not exclude NMI.
- **Cooperative priority writes** ([recovery.md](recovery.md)). Each admitted
  outer API call attempts one eligible dirty block. Nested calls inherit the
  context; selected console-output/directory points add bounded opportunities.
  Required console input and other full-flush boundaries still drain the
  queue, subject to failures. Failed data remains queued through warm boot;
  `Write pending`, `Cache clear` and `Write error` distinguish retry state.
  There is no timed guarantee while a program retains the CPU. Separate
  public writes can commit separately, even within one block; only updates
  already received are coalesced. BIOS `CONST` and the raw reader provide
  ordinary entry opportunities. `CONIN` drains pending data before waiting,
  subject to reported failures. BIOS type 0 directory writes are treated as
  data; BDOS metadata uses type 1 with data-before-directory ordering. A flush caused
  by another drive's directory request can report `Bad Sector` on that drive.
- **Bit-banged serial.** Input that arrives while a program is busy and not
  polling the console is lost. Keys typed while the BDOS is printing are kept
  for the next read, as in CP/M 2.2.

## The contract at this commit

What another program or study may rely on, in one place. ABI 5.2 is not frozen
until a release. `src/abi.inc` is the published form, and the ROM assembles from it.

### The ROM table

| Address | Name | What it is |
| --- | --- | --- |
| `C003h` | `ABITAB` | `"TNA"` |
| `C006h` | `ABIMAJ` | Major version, 5 |
| `C007h` | `ABIMIN` | Minor version, 2 |
| `C008h` | `ABICALL` | `JP` to the services numbered 0 to 17 in C: the hardware services, mount, unmount, describe, the video drivers' hook, find, list, the shell hook and a glyph's rows; 15, the font's table at 5.1, is refused |

The table ends at `C00Bh`. `abi.inc` gives each service's arguments, results, carry and stack.
`PUTAT` returns status 2 on the serial terminal, or while the PICO9918 is claimed and
is the console: with the console on `UC1:`, a claim leaves it working.

The restart vectors (Origo KD-434): `RST 1` to `RST 5` (`0008h` to `0028h`) are the
running program's, which writes the ones it uses and saves nothing: it starts after a
warm boot, with them at their defaults, and the warm boot it ends with sweeps them;
`RST 6` (`0030h`) is kept for the debugger's breakpoints; `RST 7` (`0038h`) is the
interrupt vector, and the only one a service may claim. At cold boot, every warm boot,
an unload and a failed `INIT`, a sweep gives `RST 1` to `RST 6` seven zeros and a `RET`
whatever they hold, and `0038h` `EI; RETI` unless it holds a `JP` above `PZTOP`, so a
free slot's first byte isn't `C3h`. A service claims `RST 7` in its flags, and the loader
refuses a file that claims any other, by `docs/services.md`. `BAZA.COM` takes `RST 1` to
`RST 5` while it compiles and gives them back, which the rule no longer asks; from Baza
`c49f477` it leaves `RST 6` alone, so the exception it once held is closed.

### The BDOS

Functions 0 to 40, 45, 47, 48 and 108, as above. Functions 38 and 39 and
unsupported functions above 40 return zero.

### The service format

Format 4, the magic 0444h ('D', then the version), the type `.SVC`. The layout is
`docs/services.md`'s, unchanged from format 3; the version rose with ABI 5, so the
loader refuses a format 3 service, which would call ABI 4's addresses.

### Page zero and the workspace

`docs/memory-map.md` gives both. Page zero is CP/M's, with TEC-OS's latch shadow at
`0040h`; `0041h` to `004Fh` are unused by TEC-OS, cleared at cold boot, and the
console's state is above the RAM BIOS table. A `MON3.SVC` session holds `0041h` to
`004Fh`, with the restart slots and the NMI entry, while it runs, and gives them
back at `EXIT` or warm boot (`docs/mon3.md`). The RAM BIOS table is at `BF00h`. The CCP's command line and both its FCBs
are kept over warm boot, from `CCPCLR`, so a function 47 line survives the program's
warm boot, and `CHPOS` above the table holds its flag and the drop flag for the shell. `abi.inc` publishes one workspace byte, `KBLAST` at `BFEFh`: TEC-OS's
last matrix key, which any service that scans the matrix itself writes
(`docs/services.md`).

### What changed since each pin

| Area | Since `814bc44` | Before it, from `7029f57` |
| --- | --- | --- |
| ROM table | Moved from `FF00h` to `C003h` and from ABI 2.6 to 5.0: 8 bytes, the signature, the versions and one jump to 15 numbered services. `XMOVE`, `MOVE`, the nested CCP entries, the counts, the low mark, the console size's address and the font's address left it | The table was added |
| Hardware services | 19 numbered from 0 became 9 numbered from 0: `INFO`, `DIGIT`, `LCD`, `VIDEO`, `TONE`, `JOY`, `KEYS`, `PUTAT`, `RTC`, then mount, unmount, describe, the drivers' hook, find and list as 9 to 14. A number past 14 returns status 1 | Added |
| BDOS | Functions 47, 44, 46 and 99 added, the last three as CP/M 3's: 44 takes a count of 1 only and returns FFh for any other, 46 puts a drive's free records at the DMA address, and 99 returns FFh with nothing changed; function 50 gone. The command processor stays in user area 0, with no `USER` and no `SAVE`. The CCP sets function 108's code to FF00h on a failed command. A write that needs an extent a full directory can't hold returns 1 at record 128; function 32 keeps five bits; function 13 leaves the user; a read-only file refuses writes and renames with `File R/O`; a warm boot takes A: when 0004h names a drive with no volume | 50 and 108 added, and hooks through the RAM BIOS table |
| Command line | `!` and `:` in typed, startup and chained lines, a 127-character cut, and a program's tail no longer carries `!`. `STARTUP.CMD` added. `.DRV`, `NAME.DRV` and `DRIVERS` came after the pin too, and became `.SVC`, `NAME.SVC` and `SERVICES` | History and `COPY` added |
| Service format | Format 4 and the type `.SVC` are new: at the pin a driver was a PRL in EXPAND 1. The GLCD's console is a loaded driver; the PICO9918's console and the font are in the ROM (KS39) | None |
| Page zero | `0040h` holds `LATCHV` alone; `0041h` to `004Fh` are unused by TEC-OS and held by a `MON3.SVC` session while it runs, the console's state moved above the RAM BIOS table (KS36c), and `MAINS` and `EXPANDS` are gone with MAIN 1's count. `0050h` holds the drive the CCP loaded the running program from, as CP/M 3 does: 0 for the current drive, 1 for A: and so on, and 1 when it was found on A: by the search. After a warm boot a jump left at `0038h` above the top is kept, as one into a service is, and `003Bh` to `003Fh` are cleared; `RST 1` to `RST 6` always take their defaults. A clean boot's page zero differs only in the word at `0006h` | State moved there |
| Workspace | `CHPOS` added and the line kept over warm boot from `CCPCLR` | The workspace left the top page of the TPA |
| TPA | 47,268 on the starter card with no display or with the PICO9918, and 46,336 with the GLCD's driver: KS36b's block store took `BLKBUF` out of the workspace, and KS39's console block in the BIOS's state took 95 | 45,830 at `7029f57` |
