---
title: Drives and user areas
parent: TEC-OS
nav_order: 5
nav_group: "Using the machine"
---

# 5. Drives and user areas

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A file's volume and user area determine where you can use it. Program
lookup can find a tool outside your current drive and area, with a separate
rule for resident services.

## Programs and resident services

The `SAMPLE.COM` and small banner you have used are programs. TEC-OS loads a COM
file into program memory and starts it. When the program finishes the command
prompt returns. A program used this way is called transient because its code
need not remain available after it ends.

A file of type SVC installs a resident service. Its code stays in memory
after the installation command ends, including across later program exits.
It remains until reset or successful removal with `UNLOAD`. Services occupy
whole pages of 256 bytes. Those pages reduce the memory left for programs.
[Chapter 11](11-memory-for-programs.md) explains the program-memory boundary.

The card holds three service files. `SHELL.SVC` is the shell of
[Chapter 1](01-first-session.md), which reads your command lines,
`GLCD.SVC` is the graphics LCD driver and `MON3.SVC` runs programs written
for MON-3, as described below. The startup file installs the shell and,
where a graphics LCD is the console, the driver. The PICO9918 console is
in ROM and needs no SVC installation.
At `A:SYSTEM>`, the installation command is `GLCD.SVC`. The type is required:
`GLCD` alone searches for `GLCD.COM`. A service file can have an explicit drive, as in
`A:GLCD.SVC` or `B:NAME.SVC`.

`SERVICES`, a command of the shell, lists installed services, newest first,
with each name and the number of pages it occupies. `UNLOAD` removes the
newest service if removal is allowed. The following run used both displays
with the PICO9918 as the console. Its startup file had installed the shell,
and its `GLCD.SVC` line had installed no GLCD driver. Typing the same file
name at the prompt installed it while leaving the PICO9918 as the console:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico GLCD.SVC SERVICES UNLOAD SERVICES UNLOAD SERVICES UNLOAD. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>SERVICES
GLCD 3
SHELL 15
A:SYSTEM>UNLOAD

A:SYSTEM>SERVICES
SHELL 15
A:SYSTEM>UNLOAD

A>SERVICES
SERVICES?

A>UNLOAD
UNLOAD?

A>
```

The driver occupies three pages and the shell fifteen. The first `UNLOAD`
removed the driver, the newest service, and the second removed the shell.
`SERVICES` then had no shell to run it and became an unknown command. The
last `UNLOAD` had nothing to remove. `UNLOAD?` also appears when the newest
service cannot be removed. The command does not skip it to remove an older
service. Removal follows the reverse of installation order. A warm boot,
the restart after a program ends, retains the installed services. Reset
empties the list, and the startup file then installs the shell again.

A service can also carry an application of its own, which TEC-OS enters
as soon as the service is installed. Typing `MON3.SVC` installs the service
and starts its application, and typing it again starts the application of
the copy already installed without reading the file. The application ends
with a warm boot and leaves its service installed, so `UNLOAD` still
removes it. `MON3.SVC` and `SHELL.SVC` are entered this way and `GLCD.SVC`
only installs. Text after the name is the application's command tail, so an
older card's `MON3.SVC /E` line still starts the session.
[Appendix J](appendix-j-command-reference.md) gives the rules.

A missing service file, a wrong format or a failed installation normally
prints the command name with a question mark. A fatal card-read error
instead ends the command with the BDOS's `Bad Sector` message.
A second graphics LCD driver cannot install over the first. In this
GLCD-console run, startup had already installed the shell and the driver:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board glcd GLCD.SVC SERVICES. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>GLCD.SVC
GLCD.SVC?

A:SYSTEM>SERVICES
GLCD 3
SHELL 15
A:SYSTEM>
```

Removing the driver while the graphics LCD is the console selects the
PICO9918 if TEC-OS started its console. Otherwise output returns to
serial. The complete example of console selection and driver removal is in
[Chapter 7](07-choose-a-console.md).
[Chapter 8](08-commands-at-startup.md) explains automatic startup commands,
including the quiet result for an unavailable device. Service authoring and
installation internals have their separate homes in
[Chapter 14](14-write-a-resident-service.md) and
[Chapter 25](25-loading-and-removing-services.md).

## A MON-3 session

MON-3 is the TEC-1G's own monitor. A program written for it is loaded at
`4000h` and calls the monitor through its restart instructions, as HELLO3
does in [Chapter 1](01-first-session.md). `MON3.SVC` supplies those calls
under TEC-OS, so such a program runs with the card and the BDOS still in
place.

`MON3.SVC` installs the service if it is not in and enters it, at its
`MON3>` prompt. The service stays installed after `EXIT`, so a later
`MON3.SVC` enters it again without reading the file. A warm boot keeps it,
and `UNLOAD` or a reset removes it. Its 4,606 bytes of header and image
occupy 18 pages. On a card with nothing else installed the BDOS entry in
`0006h` moves from `B6E9h` to `A400h`, and the program memory from 46,569
bytes to 41,728, or to 40,960 with `GLCD.SVC` installed too. On the starter
card, whose startup file installs the shell first, the entry moves from
`A700h` to `9500h` and the program memory from 42,496 bytes to 37,888, or
to `9200h`, 37,120 bytes, with `GLCD.SVC` installed too (`docs/mon3.md:45-57`).
The file is 5,032 bytes with its relocation data. The
service's own code, line buffer and stack are all in those pages, above
anything a MON-3 program may load into. A program itself runs on MON-3's
stack, below `0880h`.

The `MON3>` line takes three commands, in capitals or lower case:

| Command | Effect |
| --- | --- |
| `LOAD NAME.BIN [ADDR]` | Loads the file at `4000h`, or at the hexadecimal `ADDR`, in whole records. Any type but `HEX` loads this way |
| `LOAD NAME.HEX` | Loads an Intel HEX file at its records' own addresses. The file is read twice and every record is checked before any is written |
| `GO [ADDR]` | Runs the last good load, or the program at `ADDR`, after writing pending card changes |
| `EXIT` | Ends the session with a warm boot to `A:SYSTEM>` |

A load must lie between `0100h` and the page of the BDOS entry in `0006h`,
outside `0800h–08FFh`, which holds MON-3's stack and variables. Anything
else on the line, a name with a wildcard, a file not found and a load that
would break those bounds all print `?` with nothing written. A refused load
leaves nothing runnable. A disk error during a load ends the session, as
any BDOS error does.

A program's `RET` returns to `MON3>`. Two things keep the key that ended
the program, Esc or AD, off the `MON3>` line. Each time the service reads
the matrix it records the key it found in TEC-OS's last matrix key,
`KBLAST`, so TEC-OS's own scan later takes a key still held as held, not as
a new one. And when the console is the PICO9918 or the GLCD, the return
holds `MON3>` back until no key is down. Each pass of that wait scans the
matrix itself, then checks that `KBLAST` shows no matrix key and that
MON-3's key-press byte shows no keypad key. On the serial terminal there is no wait. `^C` at `MON3>`, or
a program's jump to `0000h`, also ends the session at `A:SYSTEM>`.

The service gives a program MON-3's restarts and 46 of the 63 calls
reached through `RST 10h`. Of those, 42 behave as MON-3's own and 4,
including `setCaps` and `setProtect`, are translated onto TEC-OS's state.
It also gives calls 0 to 20 of the 34 graphics calls through `RST 18h`,
which are MON-3's own routines moved into the service. With the matrix
keyboard fitted, the keyboard calls read it as MON-3 does, and not the
keypad. A call that is
not built shows MON-3's error display on the digits, waits for a key and
returns as a key press would. MON-3's own disk calls are among those: they
are not translated to CP/M files.

Each entry by `MON3.SVC` sets MON-3's workspace at `0800h` and its graphics
workspace as a MON-3 reset leaves them. `GO` also takes a checksum of the
service and of TEC-OS's BIOS table in RAM, and the program's return
compares it. A difference prints `Tables damaged: EXIT and reset`, and
later loads are refused until a reset. When the GLCD is the console, the
return also sets the panel's modes again, so the console's text shows again
whatever mode the program left the panel in.

The service cannot recover a program that hangs: the reset button is the
way out. A program that writes `B6E9h–BFFFh`, which holds the BDOS entry,
the allocation vectors, TEC-OS's workspace and its BIOS table, can damage
TEC-OS's disk tables. The service writes pending changes before `GO` and
resets the drives after each return to limit that. Its messages are in
[Appendix D](appendix-d-error-messages.md#the-mon-3-session).

## Drive letters and volumes

TEC-OS has four drives, A to D, and they are equal. A drive letter
identifies a current assignment, not a separate card. Each drive can hold one
volume from the card's container, the collection of CP/M disks stored on that
card. The starter card holds five volumes. SYSTEM is on A, WORK on B and
PROJECTS on C. GAMES and SPARE are on no drive, and D is empty. The prompt
shows the drive and its volume, so `A:SYSTEM>` means drive A holding SYSTEM.

`CD ?` lists the card's volumes, in the card's order, each with the drive it
is on:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CD ?'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD ?

SYSTEM      A:
WORK        B:
PROJECTS    C:
GAMES
SPARE
A:SYSTEM>
```

WORK is a G8M volume, 8 MiB, and the others are G1M, 1 MiB. Their directory
layouts are described in [Appendix E](appendix-e-container-format.md). WORK,
PROJECTS, GAMES and SPARE start empty and are available for your files.

A drive letter followed by a colon selects that drive. The prompt changes
and a file name without a drive then refers to it. A file on another
drive can be named explicitly, as in `DIR B:` or `TYPE A:SAMPLE.ASM`.
Selecting an empty drive or naming a file on it gives `Select`. This
starter-card run selects B and then uses empty drive D:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs B: '@start D:' '@key x' '@start DIR D:' '@key x'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>D:
Bdos Err On D: Select
B:WORK>DIR D:

Bdos Err On D: Select
B:WORK>
```

The default error path waits for a key, `x` in this capture, then ends the
command with a warm boot. The prompt stays on B. The CP/M drive letters E
through P are accepted as names but have no TEC-OS volume and give the same
error. Q and later letters are outside that range so `Q:` gives `Q:?`.
[Appendix D](appendix-d-error-messages.md) explains these messages and the
returned-error option for programs.

## User areas

At the command prompt `USER` selects an area from 0 to 15. Every file
belongs to one area. `USER 3` selects area 3 on all drives, not a separate
area for each drive. The prompt includes a nonzero area number before the
drive letter, as in CP/M 3. Thus `3A:SYSTEM>` means area 3 with A current.
TEC-OS starts in area 0, where all starter-card files are stored.

File commands use the current area. A file made in area 3 remains out
of area 0's listing even on the same volume. For this comparison,
`SAVE 1 B:MINE.COM` prepares a demonstration file by saving one page of
existing program memory in area 3. It does not create or move a file in
area 0:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'USER 3' 'SAVE 1 B:MINE.COM' 'DIR B:' TAS 'USER 0' 'DIR B:'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>USER 3
3A:SYSTEM>SAVE 1 B:MINE.COM
3A:SYSTEM>DIR B:

MINE    .COM     256
1 file, 256 bytes
8368128 free on B:WORK
3A:SYSTEM>TAS
usage: TAS NAME [OUT.TYP]

3A:SYSTEM>USER 0
A:SYSTEM>DIR B:
NO FILE

A:SYSTEM>
```

The `TAS` program still ran in area 3 because program lookup also checks area
0. `COPY` works within
the current area so it cannot transfer a file between areas. On a PC,
`tecvol put --user N` places a file in a chosen area, as
[Chapter 6](06-cards-on-the-pc.md) explains. `USER` without a number or with a
number outside 0 to 15 fails with a question mark.

The system attribute is a separate property of a file. `DIR` omits system
files as well as files outside the current area. A system file remains
available to `TYPE` and other file commands in its area and a program
command can run it. The attribute does not make the file available in
every user area or protect it against modification.

## Program lookup

A command not built into TEC-OS normally names a COM program. On the
named drive or the current drive when none is named, the command processor
searches the current user area first. If the file is absent and the area
is not 0, it searches area 0 on the same drive. The file needs no system
attribute for this fallback. The selected user area remains unchanged.

A plain command has a further fallback to A when the current drive is
not A and neither area on that drive contained the file. On A it again
checks the current area before area 0. At `3B>` the complete order for
`TOOL` is therefore:

| Search | File |
| --- | --- |
| 1 | B, area 3: `TOOL.COM` |
| 2 | B, area 0: `TOOL.COM` |
| 3 | A, area 3: `TOOL.COM` |
| 4 | A, area 0: `TOOL.COM` |

An explicit drive prevents the drive-A fallback. `B:TOOL` checks B's
current area and area 0 only. Loading a tool from A does not itself select A.
In the following starter-card capture, both `A:TAS` and
plain `TAS` run A's program, which prints its usage line, while the prompt
stays on B:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs B: A:TAS TAS STARTUP.CMD. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>A:TAS
usage: TAS NAME [OUT.TYP]

B:WORK>TAS
usage: TAS NAME [OUT.TYP]

B:WORK>STARTUP.CMD
STARTUP.CMD?

B:WORK>
```

For an ordinary program, a type written after the name is replaced by COM.
`TAS.COM` and `TAS.TXT` both search for `TAS.COM`. Under the shell, an
explicit `.CMD` instead names a script on the named or current drive.
Here B has no `STARTUP.CMD`, so it is refused; scripts do not use the
program search's A fallback. `A:STARTUP.CMD` would run A's script again.
With no shell, `.CMD` has no special meaning and the ROM searches for COM.

The exception is type SVC. A service command reads only the current user
area on the named or current drive. It has neither area-0 fallback nor
drive-A fallback. At `B:WORK>` the starter's driver therefore needs the explicit
command `A:GLCD.SVC`. The special command `CON UC1` also names A's driver
explicitly when it loads it.

Lookup stops when a file is found but cannot load. A `TOOL.COM` too large
on B is not skipped for a smaller copy on A or in another area. An absent
file or an oversized program prints the command name with a question mark.
A card-read failure in the default error mode gives `Bad Sector` and ends
the command through the BDOS instead. It does not print that question mark.

A COM file starts at `0100h` in program memory. The small program from Chapter 2
is stored on B so its plain name works at `B:WORK>`. At `A:SYSTEM>` its plain name gives a
question mark unless another copy is available there. An explicit `B:` before
the name selects its file without changing the current drive.
[Chapter 21](21-from-prompt-to-program.md) follows lookup and loading inside the
command processor.

## Changing a drive's volume

`CD`, a command of the shell, puts a volume on a drive. `CD NAME` puts the
volume labelled NAME on the current drive, A included. `CD D:NAME` puts it on
D and leaves you where you are. `CD` alone and `CD D:` show a drive's volume,
read from the card again. A volume is on at most one drive, so `CD` of a
volume already on another drive is refused and names that drive. To take a
volume off a drive, put another there. Every drive of the starter card has a
slot large enough for either geometry, so any volume fits any drive.

This run puts GAMES on the empty D, shows it, tries to put WORK on C and
lists the volumes again:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CD D:GAMES' 'CD D:' 'CD C:WORK' 'CD ?'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD D:GAMES
D:GAMES
A:SYSTEM>CD D:
D:GAMES
A:SYSTEM>CD C:WORK
WORK is on B:

A:SYSTEM>CD ?

SYSTEM      A:
WORK        B:
PROJECTS    C:
GAMES       D:
SPARE
A:SYSTEM>
```

The third command failed because WORK was already on B. `CD` of a volume
already on the drive named shows it and mounts nothing. A label not on the
card gives the name with a question mark, and a name of more than 11
characters, a drive past D or text after the name gives `CD?`. Each refusal
sets the failure return code, so an `&` piece after it is skipped
([Chapter 13](13-results-and-command-chains.md)).

TEC-OS holds some recent writes in memory in its block cache. Before it
changes a drive, the mount writes them to the card. If a write fails, the
mount is refused with `CANNOT MOUNT` and the drive keeps its volume. The
same message means the volume is too large for the drive's slot, which can
happen on a card that reserves slots only for the drives mounted at cold
boot ([Chapter 15](15-state-and-memory.md#allocation-vectors-below-the-workspace)).

`CD` changes the running assignments in memory, not the drive fields saved
in the card's header. The changed drive's directory is read afresh on its
next use. Putting a volume on the current drive selects it again at once so
that access uses the new volume. The prompt's label comes from a table the
shell keeps, filled at its first prompt and by `CD` itself. A program that
mounts a volume through the ROM's services leaves that label stale until `CD`
alone reads the card again (`docs/shell.md:141-191`).

### CD on drive A

The commands found on A follow its volume, and so does the shell's next
start. `CD A:GAMES` puts GAMES on A. A program on SYSTEM, such as TAS, is then
not found, and `CD A:SYSTEM` brings SYSTEM back. A reset keeps the drives'
selection, so a reset after `CD A:GAMES` starts from GAMES, which has no
startup file and no shell. The bare prompt `A>` follows and there is no `CD`:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CD A:GAMES' TAS @reset. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD A:GAMES
A:GAMES
A:GAMES>TAS
TAS?

A:GAMES>
TEC-OS 0.1 for TEC-1G
A: GAMES
B: WORK
C: PROJECTS

A>
```

Power off and on, or Power cycle on the web page, gives the card's own drives
and the shell again. A `CD` in a script cannot change the drive the script
is read from: it is refused with `CD?`, and the script goes on.

## Volume and file protection

A volume can be read-only. Its files can be read and its programs can run but
creating, writing, renaming or erasing a file there gives `R/O`. A read-only
volume is never written behind. This property belongs to the volume so changing
its drive or warm-booting does not remove it. Chapter 6 explains how a prepared
card receives that flag.

A file's read-only attribute is separate. It prevents writing, renaming
or erasing that file and gives `File R/O`. It does not hide the file from
`DIR`. The system attribute controls that omission. The PC card tool can set
file attributes and a program can change them through the BDOS. TED checks
the attribute before it saves. A save over a read-only file shows
`Save failed 16` on its status row and keeps your text in the editor.

A program can also make the current drive read-only temporarily. The next
warm boot clears that temporary state. A volume
whose descriptor is read-only remains protected. In the default error mode
the `R/O` and `File R/O` messages wait for a key before ending the command.
[Appendix D](appendix-d-error-messages.md) gives the full error and recovery rules.

## The drives after a reset

A program's ordinary end retains the current drive and user area. Removing
the current drive's volume makes the next prompt fall back to A. Reset
starts at A in area 0, though the volume assignments can survive.

Cold boot rebuilds TEC-OS's working memory and clears the installed services,
open-file state, command history and cache. Changes held only in that cache
are lost. Writes already accepted by the card remain.
The drive assignments can be reconstructed from recognised TEC-OS state
left in RAM. Each assigned volume must still match a descriptor on the card
in location, size, geometry and flags and fit the drive's slot.

This run puts GAMES on D before reset. The reconstructed selection keeps it:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs 'CD D:GAMES' @reset 'CD ?'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD D:GAMES
D:GAMES
A:SYSTEM>
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS
D: GAMES

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>CD ?

SYSTEM      A:
WORK        B:
PROJECTS    C:
GAMES       D:
SPARE
A:SYSTEM>
```

No saved drive assignment is applied if a required volume no longer matches
or a required slot cannot hold it. The card's header assignments then stand.
The same defaults apply when TEC-OS cannot recover its previous state.
A normal power cycle also loses the previous assignments.
[Chapter 16](16-reset-and-boot.md#retained-drive-selection) explains the
recognition test, interrupted cold boot and recovery from an interrupted
service installation.

A card changed on a PC needs a reset when returned to the board. Warm boot
retains cached card blocks and the drives' free-space state so it does not
reinitialise the card or discard those old copies. Only cold boot starts the
card again. Do not let TEC-OS and a PC write the same card at the same time.
