---
title: Chains across a warm boot
parent: TEC-OS
nav_order: 22
nav_group: "Inside TEC-OS"
---

# 22. Chains across a warm boot

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A program's ordinary exit rebuilds the command processor's working state,
yet the next piece of its command line can still run. The shell keeps the
line and its position in its own pages, which warm boot leaves alone, and
the ROM keeps a function 47 line and two flags for it outside the warm-boot
clear. Chapter 13 explains their practical use. Without the shell the ROM
runs one command per line and this chapter's mechanism is absent.

## Where the line is kept

Warm boot calls `CPMINIT` to clear the CCP's scratch space and the BDOS's
state. The clear begins at `CCPCLR` and stops before `BDOSRME`
(`src/boot.asm:141-152`, `src/boot.asm:398-407`, `src/ram.asm:141-158`).
Everything a line needs to survive a program's exit is outside that span.

The shell holds the line it is working through. `LTXT` is its text, up to
127 characters and a zero, `LPOS` the address of the next piece or 0 when
none remains, and `LCOND` nonzero when that piece follows a run of `&` alone
(`drivers/shell.asm:692-791`). These are variables in the shell's own pages,
a resident service's memory below the TPA's ceiling, so neither warm boot
nor a program's normal use of the TPA reaches them. `LORG` holds the line's
origin, `FFh` for a line of `STARTUP.CMD` and 0 otherwise, and is passed
with each piece (`drivers/shell.asm:161-167`, `drivers/shell.asm:527-540`).

The ROM keeps its command buffer below `CCPCLR`. That span is 202 bytes:
two 36-byte FCBs, the maximum-length byte `CMDBUF`, the input-length byte
`CMDLEN` and 128 character bytes at `CMDTXT` (`src/ram.asm:148-157`). The
shell's piece is copied into `CMDTXT` each time the ROM runs it. A line that
a program passes to function 47 is copied there too, and survives the
program's warm boot there until the next prompt.

`CHPOS` is above the RAM BIOS table, outside the clear. It holds
two flags: bit 0 when a function 47 line waits in `CMDTXT`, and bit 1 when
the rest of the line has been dropped. The 16-bit return code `PRGCODE` is
in that upper block too (`src/ram.asm:399-404`, `src/ram.asm:366-367`). The
address of the shell's table, `SHOWN`, which tells the ROM a shell holds
the prompt, is beside them (`src/ram.asm:382`).

Cold boot clears the entire resident workspace from `WSBASE` through the span
ending at `WSEND`. That includes `CMDTXT`, `CHPOS`, `PRGCODE` and `SHOWN`, and
cold boot forgets every service, so a reset starts with no shell, no line in
hand and a zero result (`src/boot.asm:61-65`, `docs/shell.md:269-271`). The
startup file then installs the shell again.

## The line and tail limits

A line must also fit the command tail prepared for each program. The shell
reads a typed line with a capacity of 127 characters, and a script or
startup line keeps its first 127 (`drivers/shell.asm:276-282`,
`drivers/shellio.asm:70-114`). Function 47 requires a zero within its first
128 bytes, giving the same 127-character maximum, and the shell copies at
most 127 bytes of it (`src/cpm/bdos.asm:66-84`, `drivers/shell.asm:180-188`).
`SHLINE` writes a zero at the ROM buffer's last byte after each `LINE` call,
so a piece handed to the ROM is bounded (`src/cpm/ccp.asm:275-277`).

A program name occupies at least one character of its piece, leaving at most
126 for the tail. `PREPPAGE` copies that tail to `0081h` and appends a zero.
At the maximum length, the zero lands at `00FFh`. One further character would
put it at `0100h`, over the program's first byte (`src/cpm/ccp.asm:18-24`,
`src/cpm/ccpcmd.asm:402-445`). Loading precedes `PREPPAGE` so the limit
protects code already in memory. The load-drive byte at `0050h` lies below
the tail and is written separately before entry (`src/cpm/ccp.asm:454-473`,
`src/layout.asm:56-62`).

## The next command source

After a command or warm boot, `MAINLOOP` restores the CCP stack and calls
`SAVEDU`, which records the current drive and user area at `0004h`. With a
shell holding the hook, `SHLINE` sets `HFLAG` for one history line, passes
`CHPOS`'s flags in A, clears them, and calls the shell's `LINE` with `DE`
at `CMDTXT` (`src/cpm/ccp.asm:110-124`, `src/cpm/ccp.asm:251-282`). `LINE`
takes its own stack and then finds the next piece from the first available
source in this order (`drivers/shell.asm:161-300`):

1. With bit 1 set, the rest of the line in hand is dropped: `LPOS` becomes 0.
2. With bit 0 set, the function 47 line in `CMDTXT` replaces the line in
   hand. Its first piece runs whatever the last command returned.
3. A remaining piece at `LPOS`.
4. The rest of `STARTUP.CMD`, once, when the shell was installed by the
   startup line.
5. The next line of an open script, `STARTUP.CMD`'s included.
6. A line read with BDOS function 10, with the history offered.

A startup line's pieces therefore precede the next line of the file. The
same priority applies to a line supplied through function 47 by a program
started during startup. The example below uses three startup lines after
the shell's:

```sh
printf 'SHELL.SVC\nDIR *.CMD &TYPE STARTUP.CMD\nNOSUCH.SVC &CD\nUSER 0\n' > startup.cmd
cp dist/starter.img start.img
node tools/tecvol.mjs put start.img A startup.cmd --text
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card start.img. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>DIR *.CMD &TYPE STARTUP.CMD

STARTUP .CMD     128
1 file, 128 bytes
935936 free on A:SYSTEM
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

The first `DIR` succeeds so its `TYPE STARTUP.CMD` runs before the
`NOSUCH.SVC` line. That service file is missing, so its `CD` is skipped,
not echoed, and the shell proceeds to `USER 0`, the file's last line. The
path back to the file depends on `LPOS` being 0, not on the previous command
having succeeded (`drivers/shell.asm:200-266`).

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

`LEAD` starts a line. It passes over blanks and `!` with `SKIPSB` and sets
`Z` at the line's zero, so empty lines and lines of spaces and `!` need no
separate case. A line whose first piece starts with `&` would test the
previous line's result, so `LEAD` drops the line, folds the word and rejects
it through `BADW` as `&WORD?` with `FF00h` (`drivers/shell.asm:302-319`,
`drivers/shellio.asm:186-203`).

`SPLIT` takes the piece at `HL`. It scans forwards, keeping in `DE` the end
of the last byte that is not a blank, until the line's zero, a `!`, or an `&`
whose preceding byte is a space or a tab. An `&` after any other byte is text.
At a separator `SPLIT` writes a zero at `DE`, so the piece ends before the
blanks in front of its separator. It then passes over the whole run of
blanks, `&` and `!` that follows. A `!` anywhere in the run makes the next
piece unconditional, and a run of `&` alone makes it conditional. `LPOS`
becomes the next piece's address and `LCOND` records how it runs, or `LPOS`
becomes 0 at the line's end (`drivers/shell.asm:321-413`).

A piece after the first goes to `LNRUN`, which prints the prompt and the
piece as typed with `PUTZ`, up to the zero `SPLIT` wrote. A function 47
line's first piece takes the same path, so it is echoed too. A typed line's
first piece was already echoed by function 10, and a script's line is echoed
whole before its first piece, so `FIRST` takes them without another echo
(`drivers/shell.asm:229-234`, `drivers/shell.asm:294-300`).

`BUILTIN` folds the piece's letters to capitals and compares its first word
with COPY, DEL and SERVICES, a word ending at a blank or the piece's end. A
match runs the shell's own handler. Otherwise `SCRCHK` parses the word as a
file name, and a type of `CMD` opens a script. Anything else goes to `HAND`,
which copies the piece, zero-ended, to the ROM's buffer, puts back the
CCP's stack and returns the line's origin to `SHLINE`
(`drivers/shell.asm:426-540`).

The ROM then runs the piece as a typed line. `MLSKIP` passes over spaces,
and an empty piece returns to the prompt. `MLTAKE` sets `ARGSTRT`, converts
letters to capitals to the zero and clears `PRGCODE` for the new command. A
drive letter and colon alone select that drive. Other text reaches
`NOTDRIVE`, which compares the ROM's built-in names and otherwise loads a COM
program or installs an SVC service (`src/cpm/ccp.asm:184-248`,
`src/cpm/ccp.asm:339-441`). Chapter 21 explains program search and launch.
`LPOS` is already set before any of those commands runs.

A built-in reads from `ARGSTRT`, and a loaded program receives a copy of only
that piece's tail. Neither includes the following pieces
(`src/cpm/ccpcmd.asm:402-445`).

An ordinary program exit reaches warm boot through the inherited return
word, a jump to `0000h` or BDOS function 0. After a successful flush, the
next `LINE` call resumes at `LPOS`. The ROM's built-ins return through
`MAINLOOP` or `STARTED` and use the same `LINE` call
(`src/cpm/ccp.asm:94-124`, `src/cpm/ccp.asm:467-473`,
`src/cpm/bdos.asm:216-221`, `src/boot.asm:141-152`). The shell's own
built-ins end through `CODED`, which sets the return code with function 108
and hands the ROM an empty line, so the ROM prints the next prompt's new line
and calls `LINE` again with the code untouched (`drivers/shell.asm:576-598`).

## The result before the next piece

The conditional test must read the previous command's result before the ROM
clears it for the new command. At `LN2`, with `LCOND` set, the shell reads
the code with function 108, `DE = FFFFh`. A high byte below `FFh` accepts
the piece. When the high byte is `FFh` the low byte decides: `FFh` accepts
`FFFFh`, and any other value is a failure, so `FF00h` through `FFFEh` fail
(`drivers/shell.asm:200-226`).

A failure skips the piece. `SPLIT` still runs on it to find the next
separator, but nothing is echoed or handed to the ROM, and the code is left
as it was. The next conditional piece therefore tests the same code, and a
piece after `!` runs (`drivers/shell.asm:220-226`). The ROM's clear at
`MLTK3` occurs only when a piece is taken, so a program begins with a zero
code (`src/cpm/ccp.asm:220-223`).

BDOS function 108 reaches `FNRETC` directly from `BENTRY`, before the
ordinary function table. The entry saves `DE` in `PARAM`. `FNRETC` loads it
into `HL`, ANDs the two bytes and increments the result. Only `FFFFh`
produces zero. That query returns `PRGCODE` in `HL`, with `A = L` and
`B = H` through `RETWORD`. Every other argument stores the code and returns
zero through `RETZERO` (`src/cpm/bdos.asm:124-134`,
`src/cpm/bdos.asm:194-214`, `src/cpm/bdos.asm:250-272`).

There is one shared return code. The ROM's explicit stores are in `FNRETC`,
`MLTK3` and `ERRGO`. Cold boot also zeros its workspace location
(`src/cpm/bdos.asm:264`, `src/cpm/ccp.asm:221-222`, `src/cpm/ccp.asm:563-566`,
`src/boot.asm:61-65`). The shell's built-ins store theirs through function
108 in `CODED`. A program that leaves the code untouched returns the zero
established when its piece was taken.

`ERRGO` stores `RCFAIL`, or `FF00h`, before printing the error message.
`BADCMD` echoes the failed command or argument with a question mark and falls
through to that store (`src/cpm/ccp.asm:26-30`, `src/cpm/ccp.asm:536-568`).
`NO FILE` from `FILENO`, `FILE EXISTS` from REN and `NO SPACE` from SAVE all
use `ERRGO` (`src/cpm/ccpfile.asm:412-420`, `src/cpm/ccpmut.asm:144-149`,
`src/cpm/ccpcmd.asm:383-390`). Missing programs, failed loads and
unsuccessful service installations reach `BADCMD` too. Startup's quiet
absent-device service path instead returns through `SVCOK` with the initial
zero (`src/cpm/ccp.asm:396-412`). The shell's `BADW` prints its refusals in
the same form and sets `FF00h`, and COPY's four error messages go through
`ERRMSG` to the same failure code. A successful COPY ends through `BDONE`
with 0 (`drivers/shell.asm:554-608`, `drivers/shellcmd.asm:130-154`).

## Cancellation instead of continuation

Cancelling a line clears `LPOS`. The text can remain in `LTXT` because the
next-piece check no longer selects it. The ROM cannot reach the shell's
variables, so it sets bit 1 of `CHPOS` and the shell clears `LPOS` at its
next `LINE` call (`drivers/shell.asm:170-174`). The BDOS uses `CHDROP`, which
sets that bit and jumps through the RAM BIOS warm-boot entry `BIOWBT`
(`src/cpm/bdos.asm:96-106`). Three paths reach `CHDROP`:

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
`[more]`, `PGWAIT` reads a key with function 6, erases the prompt, clears
bit 5 of the key with `AND DFh`, then compares the result with `03h`, `1Bh`
and `Q`. This makes `^C`, Esc, `Q` and `q` stop the listing. It also maps
`#` to `^C` and `;` to Esc. `^C` and `#` go through `PGDROP`, which clears
`LPOS` directly. Esc, `;`, `Q` and `q` go straight to `PGSTOP`, leaving the
next piece available (`drivers/shellio.asm:450-502`).

Both stop paths return carry set through `PAGE`. DIR and TYPE use that carry
to finish the listing and return through `STARTED`, as at an ordinary
listing end (`src/cpm/ccpfile.asm:210-220`, `src/cpm/ccpfile.asm:262-283`,
`src/cpm/ccpfile.asm:382-400`). The difference between stopping a listing
and dropping its line is the store to `LPOS`, not the carry result.

Warm boot can cancel a line after a program has already ended. `WBOOTR`
calls `CWBOOT` before entering the CCP. `CWBOOT` calls `CFLALL` to attempt
all dirty cache lines, A:'s pending block among them. If a write fails,
that cache line is dropped. On any failure `CWBOOT` sets the drop flag and
prints `Write lost` once (`src/boot.asm:149-152`, `src/cache.asm:624-640`).
A successful flush leaves the line in hand. Chapter 19 explains the
card-write consequences.

A drop ends only the current line. A script, or the rest of `STARTUP.CMD`,
goes on with its next line, since `LINE` falls through to `NEXT` with
`LPOS` at 0 (`drivers/shell.asm:170-174`, `drivers/shell.asm:243-266`,
`docs/shell.md:85-88`). A reset instead removes the shell with every other
service and clears the workspace, so cold boot starts with no line.

## A replacement line from function 47

Function 47 makes a new line through the ROM's buffer. `BENTRY` dispatches
directly to `FNCHAIN`, which reads from `CURDMA` in two passes, validation
before copying (`src/cpm/bdos.asm:52-94`, `src/cpm/bdos.asm:133-134`).

The validation loop counts 128 bytes in `B`. The first zero accepts the line.
The loop branches to `FNCHNO` on a CR or LF before the first zero or on
exhaustion of all 128 bytes without zero. That returns `A = FFh` through `RETA`
and restores the caller's stack. Neither `CMDTXT` nor `CHPOS` has been
written, so rejection leaves the original line available
(`src/cpm/bdos.asm:66-83`, `src/cpm/bdos.asm:200-214`).

On acceptance, `FNCH2` copies exactly 128 bytes to `CMDTXT` with `LDIR`,
the line, its zero and any bytes after the zero, and sets `CHPOS` to 1
(`src/cpm/bdos.asm:85-94`). This copy finishes during the call, before the
next program can overwrite the caller's memory. The line can therefore
occupy caller memory that the next load will replace. `FNCHAIN` then jumps
through `BIOWBT`, the RAM BIOS warm-boot entry at `BF03h`. A program that
replaced that entry receives the call just as for other BDOS warm boots
(`src/cpm/bdos.asm:94-95`, `src/layout.asm:98-99`).

The normal warm-boot path flushes pending writes before the next prompt.
Only a successful flush guarantees that those writes reached the card. A
failure drops failed lines, reports `Write lost` and writes 2 to `CHPOS`.
That store clears the function 47 flag, so the shell drops the line in hand
and the supplied line does not run either (`src/cache.asm:634-640`,
`drivers/shell.asm:170-198`). An accepted function-47 call ends the caller
but does not guarantee execution of the supplied command.

At the next prompt `SHLINE` passes bit 0 to `LINE`, which copies at most 127
bytes from `CMDTXT` into `LTXT`, marks its origin as typed and starts it at
`LEAD`. Its first piece runs whatever the calling program's code was, and
its later pieces follow the rules above (`drivers/shell.asm:176-198`).
Register `E` selects no additional operation in this implementation. The
next command uses the drive and user area from `0004h`, passed in `C` by
warm boot (`src/boot.asm:150-152`, `src/cpm/ccp.asm:46-88`).

The copy replaces the old line and its position, so none of its later pieces
survives. An empty supplied line is valid: its first byte is zero. `LEAD`
then finds no piece and the shell proceeds to the next startup or script
line or keyboard input (`drivers/shell.asm:188-190`).

With no shell, the ROM's prompt takes the function 47 line itself.
`MLDRV` reads and clears `CHPOS`, and with bit 0 set `MLCHN` echoes
`CMDTXT` to its zero and runs it whole as one command, so `TYPE X!TYPE Y` is
`TYPE` with the tail `X!TYPE Y` (`src/cpm/ccp.asm:138-182`,
`docs/shell.md:41-42`).
