---
title: Chains across a warm boot
parent: TEC-OS
nav_order: 22
nav_group: "Inside TEC-OS"
---

# 22. Chains across a warm boot

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

A command chain must preserve its next position while the program it
starts exits through warm boot. The CCP's scratch state is rebuilt at that
exit, so the shell stores the line and position in its resident pages.
The ROM separately retains function 47 input and its two control flags
outside the warm-clear boundary. Chapter 13 explains their use. Without
the shell, the ROM still accepts a replacement line but runs it as a single
command rather than a chain.

<a id="where-the-line-is-kept"></a>

## Retained command state

The first boundary is the memory cleared on exit. Warm boot calls
`CPMINIT` to clear CCP scratch and BDOS state from `CCPCLR` up to exclusive
`BDOSRME` (`src/boot.asm:141-152`, `src/boot.asm:398-407`,
`src/ram.asm:141-164`). Continuation state must remain outside this span.

The shell retains up to 127 characters and a zero in `LTXT`. `LPOS`
points to the next piece or is zero when none remains. Nonzero `LCOND`
marks a piece following only `&` separators (`drivers/shell.asm:692-791`).
All three belong to resident shell pages outside the TPA. Ordinary
program use and warm boot leave them intact. `LORG` retains startup origin
as `FFh`, otherwise zero, and accompanies every piece
(`drivers/shell.asm:161-167`, `drivers/shell.asm:527-540`).

The ROM buffer also survives because it precedes `CCPCLR`. Its 202 bytes
contain two 36-byte FCBs, capacity byte `CMDBUF`, count byte `CMDLEN` and
128 text bytes at `CMDTXT` (`src/ram.asm:148-157`). Each shell piece is
copied there for execution. Function 47 uses the same buffer to retain a
replacement line across the caller's warm boot.

Flags above the RAM BIOS table coordinate the retained copies. `CHPOS`
bit 0 marks a function 47 line in `CMDTXT`. Bit 1 marks cancellation of
the current line. `PRGCODE` retains the 16-bit result alongside this state
(`src/ram.asm:405-410`, `src/ram.asm:372-373`). `SHOWN` stores the shell
table address used for the prompt hook (`src/ram.asm:388`).

Cold boot deliberately removes this continuation. It clears the resident
workspace from `WSBASE` through the span ending at `WSEND`, including
`CMDTXT`, `CHPOS`, `PRGCODE` and `SHOWN`. It also removes service
registration. Reset therefore starts without a shell or retained line and
with a zero result (`src/boot.asm:61-65`, `docs/shell.md:276-278`). Startup
can install the shell again.

## The line and tail limits

Every input path uses the same text bound so the result fits program
argument storage. Typed shell lines allow 127 characters. Scripts and
startup retain their first 127 (`drivers/shell.asm:276-282`,
`drivers/shellio.asm:70-114`). Function 47 requires zero within 128 bytes
and the shell copies at most 127 characters (`src/cpm/bdos.asm:66-84`,
`drivers/shell.asm:180-188`). After `LINE`, `SHLINE` also zeroes the final
ROM buffer byte (`src/cpm/ccp.asm:275-277`).

A name consumes at least a character, leaving at most 126 tail characters.
`PREPPAGE` places the tail at `0081h` and appends zero. At maximum length
that zero occupies `00FFh`. Another character would overwrite the loaded
program at `0100h` (`src/cpm/ccp.asm:18-24`, `src/cpm/ccpcmd.asm:402-445`).
Loading precedes argument preparation, so this bound protects existing
code. The independent load-drive byte at `0050h` lies below the tail
(`src/cpm/ccp.asm:454-473`, `src/layout.asm:56-62`).

## The next command source

Each prompt rebuilds the handoff from this retained state. `MAINLOOP`
restores the CCP stack and `SAVEDU` packs drive and user at `0004h`.
With the hook installed, `SHLINE` sets `HFLAG`, passes `CHPOS` in A,
clears the flags and calls `LINE` with `DE` pointing to `CMDTXT`
(`src/cpm/ccp.asm:110-124`, `src/cpm/ccp.asm:251-282`). `LINE` switches
to the shell stack and processes sources in this order
(`drivers/shell.asm:161-300`):

1. With bit 1 set, the rest of the line in hand is dropped: `LPOS` becomes 0.
2. With bit 0 set, the function 47 line in `CMDTXT` replaces the line in
   hand. Its first piece runs whatever the last command returned.
3. A remaining piece at `LPOS`.
4. The rest of `STARTUP.CMD`, once, when the shell was installed by the
   startup line.
5. The next line of an open script, `STARTUP.CMD`'s included.
6. A line read with BDOS function 10, with the history offered.

A startup line therefore completes its pieces before input advances to
the next file line. A program started during startup can supply function
47 input at the same priority. This example places three lines after
shell installation:

```sh
printf 'SHELL.SVC\nDIR *.CMD &TYPE STARTUP.CMD\nNOSUCH.SVC &CD\nUSER 0\n' > startup.cmd
cp dist/starter.img start.img
node tools/tecvol.mjs put start.img A startup.cmd --text
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card start.img. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>DIR *.CMD &TYPE STARTUP.CMD

STARTUP .CMD     128
1 file, 128 bytes
937984 free on A:SYSTEM
A:SYSTEM>TYPE STARTUP.CMD
SHELL.SVC
DIR *.CMD &TYPE STARTUP.CMD
NOSUCH.SVC &CD
USER 0

A:SYSTEM>NOSUCH.SVC &CD
NOSUCH.SVC?

A:SYSTEM>USER 0
A:SYSTEM>
```

Successful DIR permits TYPE before the next startup line. Missing
`NOSUCH.SVC` makes its conditional CD disappear without an echo. The shell
then runs `USER 0` from the following line. Returning to file input depends
on `LPOS` becoming zero, regardless of the previous result
(`drivers/shell.asm:200-266`).

The ROM's own startup line, the first, is echoed whole through BDOS
function 9, so a `$` ends that echo but not the line. The shell echoes each
later line whole after its prompt and each later piece at its own prompt,
with no `$` limit (`src/cpm/ccpcmd.asm:850-874`,
`drivers/shell.asm:243-266`, `drivers/shell.asm:229-234`). The quiet
absent-device exception changes the result too: on this serial-only board,
replacing `NOSUCH.SVC` with `GLCD.SVC` would leave success and allow `CD`
to run. The ROM tests both the line's origin, which the shell passes back
as `FFh`, and the absent-device installation result before taking that
quiet path (`src/cpm/ccp.asm:396-412`). Chapter 26 explains the full
startup and display rules.

## Finding and taking a piece

Initial parsing separates a new line from continuation. `LEAD` uses
`SKIPSB` to pass blanks and `!`, returning Z at the terminating zero.
Empty lines and separator-only lines therefore need no command. Leading
`&` would depend on an unrelated previous line's result. `LEAD` drops
that line and `BADW` reports the folded word as `&WORD?` with `FF00h`
(`drivers/shell.asm:302-319`, `drivers/shellio.asm:186-203`).

`SPLIT` finds the current piece and saves the next position before
execution. Starting at `HL`, it tracks the end of the last nonblank byte
in `DE`. Zero or `!` ends the piece. `&` ends it only after a space or tab.
Elsewhere it remains text. The splitter writes zero at `DE`, removing
spaces immediately before the separator.

It then skips the entire following run of blanks, `&` and `!`. Any `!`
makes the next piece unconditional. A run containing only `&` makes it
conditional. `LPOS` receives the next address and `LCOND` the condition,
or `LPOS` becomes zero at line end (`drivers/shell.asm:321-413`).

Echoing depends on which input has already been displayed. `LNRUN`
prints a prompt and the zero-ended piece for continuations and the first
piece of function 47 input. Typed input was echoed by function 10 and a
script line was echoed as a whole, so `FIRST` avoids a second echo
(`drivers/shell.asm:229-234`, `drivers/shell.asm:294-300`).

The shell then classifies the piece. `BUILTIN` uppercases it and checks
COPY, DEL, SERVICES, CD, DIR, CLS, ECHO and PAUSE. A blank or end must
follow the name (`drivers/shell.asm:650-667`). Otherwise
`SCRCHK` parses a file reference and opens type CMD as a script. Remaining
pieces reach `HAND`, which copies zero-ended text to the ROM buffer,
restores the CCP stack and returns origin to `SHLINE`
(`drivers/shell.asm:426-540`).

At that point `LPOS` is already safe from the coming command. The ROM
uses its ordinary path: `MLSKIP` discards spaces and empty pieces, then
`MLTAKE` sets `ARGSTRT`, uppercases text and clears `PRGCODE`. A drive-only
piece selects its drive. `NOTDRIVE` dispatches built-ins, COM loads or SVC
installation (`src/cpm/ccp.asm:184-248`, `src/cpm/ccp.asm:339-441`).
Chapter 21 explains that execution path.

Arguments stop at the piece boundary. Built-ins read `ARGSTRT` and a
loaded program receives that piece's tail. Neither receives later pieces
(`src/cpm/ccpcmd.asm:402-445`).

Program exit returns through the inherited word, a jump to `0000h` or
function 0. Successful warm-boot flushing permits the next `LINE` call to
resume `LPOS`. ROM built-ins return through `MAINLOOP` or `STARTED` and
reach the same call (`src/cpm/ccp.asm:94-124`, `src/cpm/ccp.asm:467-473`,
`src/cpm/bdos.asm:216-221`, `src/boot.asm:141-152`). Shell built-ins use
`CODED` to set function 108's result and return an empty ROM line. The
ROM adds the prompt newline and calls `LINE` again without clearing that
result (`drivers/shell.asm:576-598`).

## The result before the next piece

Conditional continuation must test the old result before the ROM clears
it. At `LN2`, nonzero `LCOND` causes function 108 with `DE = FFFFh` to
query the code. A high byte below `FFh` permits execution. With high byte
`FFh`, only low byte `FFh` permits execution. Thus `FF00h`–`FFFEh` fail
and `FFFFh` succeeds (`drivers/shell.asm:200-226`).

A failing code skips execution and echo but still requires splitting
the piece to locate its successor. The code remains unchanged, so another
conditional tests the same failure. A successor after `!` runs
(`drivers/shell.asm:220-226`). The ROM clears the code at `MLTK3` only
when taking a piece, giving a new program its initial zero
(`src/cpm/ccp.asm:220-223`).

BDOS function 108 reaches `FNRETC` directly from `BENTRY`, before the
ordinary function table. The entry saves `DE` in `PARAM`. `FNRETC` loads it
into `HL`, ANDs the two bytes and increments the result. Only `FFFFh`
produces zero. That query returns `PRGCODE` in `HL`, with `A = L` and
`B = H` through `RETWORD`. Every other argument stores the code and returns
zero through `RETZERO` (`src/cpm/bdos.asm:124-134`,
`src/cpm/bdos.asm:194-214`, `src/cpm/bdos.asm:250-272`).

All commands share `PRGCODE`. ROM stores occur in `FNRETC`, `MLTK3` and
`ERRGO`, with cold boot zeroing the workspace (`src/cpm/bdos.asm:264`,
`src/cpm/ccp.asm:221-222`, `src/cpm/ccp.asm:563-566`, `src/boot.asm:61-65`).
Shell `CODED` stores through function 108. A program leaving the value
unchanged therefore returns the zero established at piece entry.

`ERRGO` stores `RCFAIL`, or `FF00h`, before printing the error message.
`BADCMD` echoes the failed command or argument with a question mark and falls
through to that store (`src/cpm/ccp.asm:26-30`, `src/cpm/ccp.asm:536-568`).
`NO FILE` from `FILENO`, `FILE EXISTS` from REN and `NO SPACE` from SAVE all
use `ERRGO` (`src/cpm/ccpfile.asm:412-420`, `src/cpm/ccpmut.asm:144-149`,
`src/cpm/ccpcmd.asm:383-390`). Missing programs, failed loads and
unsuccessful service installations reach `BADCMD` too. Startup's quiet
absent-device service path instead returns through `SVCOK` with the initial
zero (`src/cpm/ccp.asm:396-412`). The shell's `BADW` prints its refusals in
the same form and sets `FF00h`. COPY's four error messages reach that
failure code through `ERRMSG`. A successful COPY ends through `BDONE`
with 0 (`drivers/shell.asm:554-608`, `drivers/shellcmd.asm:130-154`).

## Cancellation instead of continuation

Cancellation removes the position needed for continuation. Clearing
`LPOS` leaves any text in `LTXT` unreachable by the next-piece check.
ROM code signals this through `CHPOS` bit 1 and the next `LINE` call
clears `LPOS` (`drivers/shell.asm:170-174`). BDOS `CHDROP` sets the flag
then jumps through RAM BIOS `BIOWBT` (`src/cpm/bdos.asm:96-106`). Three
paths use it:

- `LINABRT` takes `^C` when function 10's input is empty. It prints `^C` before
  jumping. Within a nonempty line, the key is ignored. At the shell's prompt
  `LPOS` is already 0, so there is no pending piece to cancel
  (`src/cpm/bdos.asm:515-533`).
- `CHKKEY` reads the key after a `^S` output pause. `^C` jumps to `CHDROP`. Any
  other resume key is consumed and output continues
  (`src/cpm/bdoscon.asm:285-309`).
- `BDERR` takes the default disk-error path. `DISKMSG` prints `Bdos Err On`, the
  drive and the cause, then `GETCHAR` waits for a key. The exit jumps to
  `CHDROP` (`src/cpm/bdoscon.asm:36-66`). Chapter 20 explains the four causes.

Function 45 can select a returned error instead. With `ERRMODE = FFh`,
`BDERR` returns `A = FFh` and `H` holding the error code from 1 to 4,
with no message. With `FEh`, it prints first and returns the same values.
Neither path sets the drop flag. The application can therefore handle the
error and leave its remaining pieces available. Warm boot clears `ERRMODE`
with the rest of the BDOS workspace, restoring the default for the next
program (`src/cpm/bdos.asm:223-235`, `src/cpm/bdoscon.asm:36-66`,
`src/boot.asm:398-403`).

The listing pager is the shell's and has its own cancellation path. At
`[more]`, `PGWAIT` reads a key with function 6 and erases the prompt. It
clears bit 5 with `AND DFh` then compares against `03h`, `1Bh` and `Q`. This makes `^C`, Esc, `Q` and `q` stop the listing. It also maps
`#` to `^C` and `;` to Esc. `^C` and `#` go through `PGDROP`, which clears
`LPOS` directly. Esc, `;`, `Q` and `q` go straight to `PGSTOP`, leaving the
next piece available (`drivers/shellio.asm:450-502`).

Stopping output and dropping a line return the same carry-set result
through `PAGE`. DIR and TYPE finish through `STARTED` in either case
(`src/cpm/ccpfile.asm:210-220`, `src/cpm/ccpfile.asm:262-283`,
`src/cpm/ccpfile.asm:382-400`). Only the `LPOS` store determines whether
another command remains available.

Cancellation can also follow a program that has already finished.
`WBOOTR` calls `CWBOOT`, which attempts all dirty lines through `CFLALL`,
including A's pending block. Failed lines are dropped. Any failure sets
the drop flag and prints `Write lost` once (`src/boot.asm:149-152`,
`src/cache.asm:624-640`). A successful flush preserves continuation.
Chapter 19 explains the storage consequence.

Dropping a line leaves its script open. With `LPOS` zero, `LINE` reaches
`NEXT` and reads the next script or startup line
(`drivers/shell.asm:170-174`, `drivers/shell.asm:243-266`,
`docs/shell.md:86-89`). Reset removes the shell and other services and
clears workspace, so no line survives cold boot.

## A replacement line from function 47

Function 47 replaces continuation through a validated ROM-buffer copy.
`BENTRY` dispatches to `FNCHAIN`, which reads `CURDMA` twice: first to
validate and then to copy (`src/cpm/bdos.asm:52-94`,
`src/cpm/bdos.asm:133-134`).

The validation loop counts 128 bytes in `B`. The first zero accepts the line.
The loop branches to `FNCHNO` on a CR or LF before the first zero or on
exhaustion of all 128 bytes without zero. That returns `A = FFh` through `RETA`
and restores the caller's stack. Neither `CMDTXT` nor `CHPOS` has been
written, so rejection leaves the original line available
(`src/cpm/bdos.asm:66-83`, `src/cpm/bdos.asm:200-214`).

On acceptance, `FNCH2` copies exactly 128 bytes to `CMDTXT` with `LDIR`.
This includes text, its zero and all trailing bytes. It sets `CHPOS` to 1
(`src/cpm/bdos.asm:85-94`). This copy finishes during the call, before the
next program can overwrite the caller's memory. The line can therefore
occupy caller memory that the next load will replace. `FNCHAIN` then jumps
through `BIOWBT`, the RAM BIOS warm-boot entry at `BF03h`. A program that
replaced that entry receives the call just as for other BDOS warm boots
(`src/cpm/bdos.asm:94-95`, `src/layout.asm:99-100`).

Acceptance ends the caller but does not guarantee the new command will
run. Normal warm boot first flushes pending writes. Failed lines are
dropped and `CWBOOT` reports `Write lost` then writes 2 to `CHPOS`,
clearing the replacement flag. The shell then discards its old continuation and the supplied line
also remains unexecuted (`src/cache.asm:634-640`,
`drivers/shell.asm:170-198`). Only a successful flush establishes that
pending writes reached the card.

At the next prompt `SHLINE` passes bit 0 to `LINE`. The shell copies at
most 127 bytes from `CMDTXT` to `LTXT`, marks typed origin and starts at
`LEAD`. Its first piece runs whatever the calling program's code was and
its later pieces follow the rules above (`drivers/shell.asm:176-198`).
Register `E` selects no additional operation in this implementation. The
next command uses the drive and user area from `0004h`, passed in `C` by
warm boot (`src/boot.asm:150-152`, `src/cpm/ccp.asm:46-88`).

The copied line replaces the old text and position, removing every old
later piece. An empty replacement is valid because its first byte is zero.
`LEAD` finds no command and advances to startup, script or keyboard input
(`drivers/shell.asm:188-190`).

Without a shell, replacement still works but splitting does not.
`MLDRV` reads and clears `CHPOS`. With bit 0 set, `MLCHN` echoes
`CMDTXT` to zero and executes the whole line. `TYPE X!TYPE Y` therefore
runs TYPE with tail `X!TYPE Y` (`src/cpm/ccp.asm:138-182`,
`docs/shell.md:42-43`).
