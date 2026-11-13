---
title: Drives and user areas
parent: TEC-OS
nav_order: 5
nav_group: "Using the machine"
---

# 5. Drives and user areas

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

You can keep separate groups of files on the same card. A volume is a
complete disk of files, assigned to a drive letter. Within a volume, user
areas separate further groups. These locations affect file commands and
program lookup. A tool can therefore be available even when DIR omits it.
The final sections explain resident services, which occupy memory as
well as having a file on the card.

## Drive letters and volumes

The card contains a collection of volumes, also called its *container*.
TEC-OS can assign four of these volumes to drives A through D. The
letters are equivalent slots for volumes, not separate cards. On the
starter card, SYSTEM is on A, WORK on B and PROJECTS on C. D is empty.
GAMES and SPARE are present on the card but unassigned. The prompt
`A:SYSTEM>` identifies both the drive and its assigned volume.

`CD ?` lists the card's volumes, in the card's order, each with the drive it
is on:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'CD ?'. Complete captured console transcript. -->
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

WORK has the 8 MiB G8M layout. The other volumes use the 1 MiB G1M
layout. WORK, PROJECTS, GAMES and SPARE start empty for your files.
[Appendix E](appendix-e-container-format.md) describes the directory
layouts.

A drive letter followed by a colon selects that drive. The prompt changes
and a file name without a drive then refers to it. A file on another
drive can be named explicitly, as in `DIR B:` or `TYPE A:SAMPLE.ASM`.
Selecting an empty drive or naming a file on it gives `Select`. This
starter-card run selects B and then uses empty drive D:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs B: '@start D:' '@key x' '@start DIR D:' '@key x'. Complete captured console transcript. -->
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

Each file belongs to a user area numbered 0 through 15. This separates
groups of files within the same volume. `USER 3` selects area 3 across
all drives. A nonzero area appears before the prompt's drive letter, as
in CP/M 3: `3A:SYSTEM>` is area 3 on drive A. TEC-OS starts in area 0,
which contains all the starter files.

File commands use the selected area. A file created in area 3 is absent
from area 0's listing even on the same volume. This example uses
`SAVE 1 B:MINE.COM` to copy a page of existing program memory into a
demonstration file in area 3. No file is created or moved in area 0:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'USER 3' 'SAVE 1 B:MINE.COM' 'DIR B:' TAS 'USER 0' 'DIR B:'. Complete captured console transcript. -->
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

`TAS` still runs from area 3 because program lookup also checks area 0.
COPY operates within the current user area, so it cannot transfer
files to another. The PC command `tecvol put --user N` places a file in a selected
area, as [Chapter 6](06-cards-on-the-pc.md) explains. `USER` requires a
number from 0 to 15. An omitted or out-of-range number produces `?`.

The system attribute is a separate property of a file. `DIR` omits system
files as well as files outside the current area. A system file remains
available to `TYPE` and other file commands in its area and a program
command can run it. The attribute does not make the file available in
every user area or protect it against modification.

## Program lookup

A command that is not built in normally names a COM file. The search
begins on its explicit drive, or the current drive if none is named.
It checks the current user area first and then area 0 if those differ.
Area 0 lookup requires no system attribute and leaves your selected
area unchanged.

A name without a drive prefix can also find a tool on A. That search
begins only after both areas on the current drive contain no matching
file. On A, the current area again precedes area 0. At `3B>`, `TOOL`
uses this order:

| Search | File |
| --- | --- |
| 1 | B, area 3: `TOOL.COM` |
| 2 | B, area 0: `TOOL.COM` |
| 3 | A, area 3: `TOOL.COM` |
| 4 | A, area 0: `TOOL.COM` |

An explicit drive restricts lookup to that drive. `B:TOOL` checks B's
current area and area 0 only. Loading from A also leaves the current
drive unchanged. In this capture, both `A:TAS` and plain `TAS` run
A's program and print its usage line. The prompt remains on B:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs B: A:TAS TAS STARTUP.CMD. Complete captured console transcript. -->
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

An ordinary program name uses COM even if you type another extension.
`TAS.COM` and `TAS.TXT` both select `TAS.COM`. The shell treats an
explicit `.CMD` as a script on the named or current drive. Script
lookup stays on that drive. B has no STARTUP.CMD in this example,
so its command fails. `A:STARTUP.CMD` would run A's script again.
The ROM alone treats `.CMD` like another extension and searches for COM.

SVC files have a narrower search. A service command reads only the
current user area on the named or current drive. At `B:WORK>` you must
therefore name the starter driver as `A:GLCD.SVC`. `CON UC1` also names
A's driver explicitly when loading it. The resident-service examples
below explain installation and removal.

Lookup stops when a file is found but cannot load. A `TOOL.COM` too large
on B is not skipped for a smaller copy on A or in another area. An absent
file or an oversized program prints the command name with a question mark.
A card-read failure in the default error mode gives `Bad Sector` and ends
the command through the BDOS instead. It does not print that question mark.

The selected COM file loads at `0100h`. BANNER from Chapter 2 is on B,
so its plain name works at `B:WORK>`. At `A:SYSTEM>` it produces `?`
unless another copy is available there. `B:BANNER` selects the saved
file while leaving the current drive unchanged.
[Chapter 21](21-from-prompt-to-program.md) explains lookup and loading
inside the command processor.

## Changing a drive's volume

`CD` selects the volume whose directory a drive presents. It works in both
the bare ROM CCP and the shell. `CD NAME` puts the volume labelled NAME on
the current drive, A included. `CD D:NAME` puts it on
D and leaves you where you are. `CD` alone and `CD D:` show a drive's volume,
read from the card again. A volume is on at most one drive, so `CD` of a
volume already on another drive is refused and names that drive. To take a
volume off a drive, put another there. Every drive of the starter card has a
slot large enough for either geometry, so any volume fits any drive.

This run assigns GAMES to D, displays that assignment and attempts to
put WORK on C before listing all volumes:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'CD D:GAMES' 'CD D:' 'CD C:WORK' 'CD ?'. Complete captured console transcript. -->
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

WORK is already on B, so the third command fails. Naming a volume on
its existing drive displays it without another mount. An absent label
produces that name with a question mark. `CD?` indicates a name longer
than 11 characters, a drive beyond D or extra text after the name.
Each rejected command sets the failure return code and skips a following
`&` piece ([Chapter 13](13-results-and-command-chains.md)).

TEC-OS holds some recent writes in memory in its block cache. Before it
changes a drive, the mount writes them to the card. If a write fails, the
mount is refused with `CD FAILED` and the drive keeps its volume. The
same message means the volume is too large for the drive's slot, which can
happen on a card that reserves slots only for the drives mounted at cold
boot ([Chapter 15](15-state-and-memory.md#allocation-vectors-below-the-workspace)).

`CD` changes assignments in memory while leaving the card header
unchanged. The next access rereads the changed drive's directory. A
change to the current drive immediately reselects it to use the new
volume. The shell fills its prompt-label table at its first prompt
and updates it through `CD`. A program using ROM mount calls can
therefore leave an old label displayed. `CD` alone rereads the card
and updates it (`docs/shell.md:142-198`).

### CD on drive A

The commands found on A follow its volume, and so does the shell's next
start. `CD A:GAMES` puts GAMES on A. A program on SYSTEM, such as TAS, is then
not found, and `CD A:SYSTEM` brings SYSTEM back. A reset keeps the drives'
selection, so a reset after `CD A:GAMES` starts from GAMES, which has no
startup file and no shell. The bare prompt `A>` follows. ROM CD commands
remain available to restore SYSTEM:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'CD A:GAMES' TAS @reset 'CD ?' 'CD A:SYSTEM' SHELL.SVC. Complete captured console transcript. -->
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

A>CD ?

SYSTEM
WORK        B:
PROJECTS    C:
GAMES       A:
SPARE
A>CD A:SYSTEM
A:SYSTEM
A>SHELL.SVC

A:SYSTEM>
```

At the bare prompt, use `CD ?`, `CD A:SYSTEM` and `SHELL.SVC` to restore
the shell. CD preserves the current drive and user area. The starter's shell
is in user 0; use `USER 0` before loading it if you changed the area.
Reset starts in user 0. Power cycle restores the card's default drive
assignments and startup. A `CD` in a script cannot change the drive the script
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

An ordinary program exit retains the current drive and user area.
Removing the current drive's volume makes the next prompt use A. Reset
starts on A in area 0, although the volume assignments may survive.

Cold boot rebuilds TEC-OS's working memory and clears the installed services,
open-file state, command history and cache. Changes held only in that cache
are lost. Writes already accepted by the card remain.
The drive assignments can be reconstructed from recognised TEC-OS state
left in RAM. Each assigned volume must still match a descriptor on the card
in location, size, geometry and flags and fit the drive's slot.

This run assigns GAMES to D and then resets. The boot banner and volume
listing show that D still contains GAMES:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs 'CD D:GAMES' @reset 'CD ?'. Complete captured console transcript. -->
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

## Programs and resident services

SAMPLE.COM and BANNER.COM run as *transient* programs. TEC-OS loads
the COM file into program memory and starts it. After it ends, the
command prompt returns and the program's code need not remain in memory.

An SVC file installs a *resident service*. Its code stays in memory
after installation and through later program exits. Reset or a successful
`UNLOAD` removes it. A service occupies whole 256-byte pages, reducing
the space available for programs. [Chapter 11](11-memory-for-programs.md)
explains this memory boundary.

The card contains three service files. `SHELL.SVC` reads command lines,
as in [Chapter 1](01-first-session.md). `GLCD.SVC` handles the graphics
LCD and `MON3.SVC` runs MON-3 programs. Startup installs the shell
and the driver if the graphics LCD is the console. The PICO9918
console is in ROM and needs no SVC file.

`GLCD.SVC` at `A:SYSTEM>` installs that driver. The extension is required
because `GLCD` alone searches for GLCD.COM. A prefix can name the
drive explicitly, as in `A:GLCD.SVC` or `B:NAME.SVC`.

`SERVICES` lists installed services newest first, giving each name and
its page count. This command requires the shell. `UNLOAD` removes the
newest service if its removal is allowed. This run used both displays
with PICO9918 selected. Startup installed the shell but its `GLCD.SVC`
line installed no driver. Typing `GLCD.SVC` at the prompt then installed
the driver while leaving the PICO9918 selected:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board pico GLCD.SVC SERVICES UNLOAD SERVICES UNLOAD SERVICES UNLOAD. Complete captured console transcript. -->
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

A service can include an application that starts immediately after
installation. `MON3.SVC` installs and starts its application. Repeating
that command starts the installed copy without reading the file again.
Its application ends by warm boot, leaving the service installed for
re-entry or `UNLOAD`. `SHELL.SVC` also starts this way. `GLCD.SVC` only installs. Text after the name becomes the application's command tail,
so an older `MON3.SVC /E` line still starts a session.
[Appendix J](appendix-j-command-reference.md) gives the rules.

A missing service file, a wrong format or a failed installation normally
prints the command name with a question mark. A fatal card-read error
instead ends the command with the BDOS's `Bad Sector` message.
A second graphics LCD driver cannot install over the first. In this
GLCD-console run, startup had already installed the shell and the driver:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --board glcd GLCD.SVC SERVICES. Complete captured console transcript. -->
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

Removing an active graphics LCD driver selects the PICO9918 if TEC-OS
started that console. Otherwise output returns to serial.
[Chapter 7](07-choose-a-console.md) has the full selection/removal example
and [Chapter 8](08-commands-at-startup.md) explains quiet startup results
for unavailable devices. Service authoring is in
[Chapter 14](14-write-a-resident-service.md) and installation internals
are in [Chapter 25](25-loading-and-removing-services.md).

## A MON-3 session

`MON3.SVC` runs programs written for the TEC-1G's MON-3 monitor. These
programs load at `4000h` and call monitor routines through restart
instructions. HELLO3 in [Chapter 1](01-first-session.md) is an example.
The service supplies supported MON-3 calls while retaining TEC-OS's card
access and BDOS.

First build the source-only example with `TAS HELLO3 HELLO3.BIN` at the
CP/M prompt. Then `MON3.SVC` installs the service if necessary and enters
its `MON3>` prompt.
`EXIT` ends the session while leaving the service installed. The same
command can later re-enter it without reading the file again.

At `MON3>` you can load a file, run it or exit. Command words accept
capitals or lower case:

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

A program's `RET` returns to `MON3>`. With the PICO9918 or GLCD
console, the prompt waits for key release. This keeps the Esc or AD
that ended a program out of the command line. Serial has no such wait.
`^C` at `MON3>` or a program's jump to `0000h` ends the session at
`A:SYSTEM>`.

### MON-3 memory and limits

Warm boot preserves MON3.SVC. `UNLOAD` or reset removes it. Its
4,606-byte header and image occupy 18 pages. With relocation data
the file occupies 5,032 bytes. These pages hold the service code,
line buffer and recovery stack above the MON-3 program's load area.
The program itself uses MON-3's stack below `0880h`.

On a card with nothing else installed, the BDOS entry address stored
at `0006h` changes from `B6C5h` to `A400h`. Program memory falls from 46,533 bytes
to 41,728, or 40,960 with GLCD.SVC too. On the starter card, the
shell is already installed. Installing MON3 changes that address from `A700h` to `9500h` and
reduces program memory from 42,496 to 37,888 bytes. Adding
GLCD.SVC gives `9200h` and 37,120 bytes (`docs/mon3.md:47-59`).

The return-to-prompt key handling uses TEC-OS's `KBLAST` state. Each
MON3 matrix read stores the detected key there. A later TEC-OS scan
therefore recognises a held key instead of generating another press.
The display-console wait scans the matrix on each pass. It ends when
KBLAST indicates no matrix key and MON-3's key-press byte indicates
no keypad key.

The service gives a program MON-3's restarts and 46 of the 63 calls
reached through `RST 10h`. Of those, 42 behave as MON-3's own and 4,
including `setCaps` and `setProtect`, are translated onto TEC-OS's state.
It also gives calls 0 to 20 of the 34 graphics calls through `RST 18h`,
which are MON-3's own routines moved into the service. With the matrix
keyboard fitted, the keyboard calls read it as MON-3 does, and not the
keypad. An unimplemented call displays MON-3's error on the digits and waits
for a key. It then returns as a keypress would. MON-3's own disk calls are among those: they
are not translated to CP/M files.

Each entry by `MON3.SVC` sets MON-3's workspace at `0800h` and its graphics
workspace as a MON-3 reset leaves them. `GO` also takes a checksum of the
service and of TEC-OS's BIOS table in RAM, and the program's return
compares it. A difference prints `Tables damaged: EXIT and reset`, and
later loads are refused until a reset. When the GLCD is the console, the
return also sets the panel's modes again, so the console's text shows again
whatever mode the program left the panel in.

The service cannot recover a program that hangs: the reset button is the
way out. A program that writes `B6C5h–BFFFh`, which holds the BDOS entry,
the allocation vectors, TEC-OS's workspace and its BIOS table, can damage
TEC-OS's disk tables. The service writes pending changes before `GO` and
resets the drives after each return to limit that. Its messages are in
[Appendix D](appendix-d-error-messages.md#the-mon-3-session).
