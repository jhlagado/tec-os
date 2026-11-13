---
title: Write a resident service
parent: TEC-OS
nav_order: 14
nav_group: "Writing programs"
---

# 14. Write a resident service

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

`COUNT.SVC` counts console characters after the command that installs it
has ended. Its hook shows how resident code survives program exits and how
another program finds a routine inside it. The starter card's startup file
installs `SHELL.SVC` first, so `SERVICES` also lists `SHELL 15` below the
newer services and `UNLOAD` removes it only after them
([Chapter 5](05-drives-and-user-areas.md)). The failed-INIT example has a separate current
workflow below. Use the PC setup from
[Chapter 6](06-cards-on-the-pc.md) for their card preparation.

## Code that stays

A COM program starts at `0100h`. After it ends, a later program can overwrite
its memory. A resident service occupies reserved pages of 256 bytes and
remains installed through warm boots. Reset discards it. `UNLOAD` removes
the newest service only when its flags and removal routine allow that.
[Chapter 5](05-drives-and-user-areas.md#programs-and-resident-services)
gives the installation, listing and removal commands.

A driver is a service that operates hardware. A library provides routines
for programs. The starter's `GLCD.SVC` is a display driver. COUNT hooks the
console's output routine and also provides a count-reading routine to clients.

The pages come from the transient program area, or TPA, below the BDOS entry
jump. Installation lowers the word at `0006h`, the program-memory ceiling
established in [Chapter 11](11-memory-for-programs.md). The numbered ROM calls
used in [Chapter 12](12-use-the-boards-devices.md) occupy no service pages and
do not appear in `SERVICES`. A resident service can publish named records in the
registry so that programs can find its routines. ROM calls 13 and 14 find and
enumerate those records.

COUNT intercepts output through the BIOS jump table in RAM at `BF00h`. The word
at `0001h` identifies its `WBOOT` entry and each entry is a three-byte `JP`.
Warm boot preserves the table. A hook on an entry does its own work and then
jumps to the target that the entry previously held. The BDOS and CCP send
console output through `CONOUT` so their characters pass through COUNT. `PUTAT`
and the ROM's own messages bypass that entry.

A transient program must restore every BIOS entry it changes before ending,
including `WBOOT` if it changed that entry. Otherwise a later call can jump into
overwritten program memory. COUNT instead reserves resident memory for its hook
and restores the entry when removed. The BDOS's key check during output calls
ROM `CONST` directly so a hook on the RAM table's `CONST` does not intercept
that check. [Chapter 17](17-console-paths.md) describes the remaining console
paths.

## COUNT.SVC

This `COUNT.SVC` source hooks `CONOUT`. Its `CHARS` word stores
the count and its record provides a routine to read that word:

```asm
; COUNT.SVC: count the characters that reach the BIOS's CONOUT, and publish
; the count in a record. REMOVE puts CONOUT back.
%INCLUDE "ABI.INC"

	ORG	$0100
HDR:	DB	'D',SVCFMT,0,1	; magic, format, no dependencies, removable
	DW	0,0,0,0		; REMOVE, size, extra memory, relocation
	DB	2,2,2		; bytes added to the BDOS, BIOS, CCP stacks
	DW	0		; INIT
	DB	"COUNT   "	; the name SERVICES prints

; Point CONOUT at MYCO, keeping the old target. Returns HL = the record,
; carry clear. Changes AF, DE and HL.
INIT:	CALL	CONSLOT		; HL = the address held by CONOUT's JP
	LD	E,(HL)		; DE = that jump's target
	INC	HL
	LD	D,(HL)
	LD	(OLDCO),DE	; MYCO ends by jumping there
	LD	DE,MYCO		; the hook goes in last
	LD	(HL),D
	DEC	HL
	LD	(HL),E
	LD	HL,REC		; the record for the loader
	OR	A		; carry clear: installed
	RET

; Put CONOUT back. Returns carry clear. Changes AF, DE and HL.
REMOVE:	CALL	CONSLOT		; HL = the address held by CONOUT's JP
	LD	DE,(OLDCO)	; the target INIT saved
	LD	(HL),E
	INC	HL
	LD	(HL),D
	OR	A		; carry clear: removal goes ahead
	RET

; Find CONOUT's slot in the BIOS table. Returns HL = the address held by its
; JP. Changes F and DE.
CONSLOT:LD	HL,($0001)	; HL = the WBOOT entry
	LD	DE,9+1		; three entries on, and past the JP's opcode
	ADD	HL,DE
	RET

; The hook: count a character, then CONOUT as it was. Keeps every register
; for that jump.
MYCO:	PUSH	HL		; two bytes of the caller's stack
	LD	HL,(CHARS)	; the count, a word
	INC	HL
	LD	(CHARS),HL
	POP	HL		; C still holds the character
	DB	$C3		; JP to the entry replaced
OLDCO:	DW	0		; INIT fills this in

; The record's one entry. Returns HL = the count. Changes nothing else.
GETCNT:	LD	HL,(CHARS)
	RET

REC:	DW	0		; the link: the loader fills it
	DB	"COUNT   "	; the record's name
	DB	1		; its interface version
	DW	TABLE		; its entry table
TABLE:	JP	GETCNT		; offset 0: the count
CHARS:	DW	0		; the count itself
```

### The header

The first 25 bytes are the header. The source declares it at `0100h` with
the name, flags, extra-memory request and stack declarations. Leave the
routine offsets, sizes and dependency count zero for the file writer.
Both pinned TAS and `makeSvc` require labels named `INIT` and `REMOVE`,
even for a service whose flags prohibit removal.

`SVCFMT` in `abi.inc` is 4 at the inspected source. The loader checks that
format together with the initial `D` and rejects every other format. Pinned TAS
preserves the source's format byte. `makeSvc` overwrites it with 4. TAS writes
the dependency count only when a `DEPS` label exists so a source without
dependencies must already contain zero there.

| Offset | Bytes | Contents | Written by |
| ---: | ---: | --- | --- |
| 0 | 1 | The letter `D`, `44h` | the source |
| 1 | 1 | The format, 4, `SVCFMT` in `abi.inc` | The source supplies it and `makeSvc` overwrites it with 4. |
| 2 | 1 | Number of dependencies | `makeSvc` or TAS when `DEPS` exists |
| 3 | 1 | Flags: bit 0 permits removal. Bits 1 to 7 claim `RST 1` to `RST 7` | the source |
| 4 | 2 | `REMOVE`, from the header's start | the tool |
| 6 | 2 | Size of the header and image | the tool |
| 8 | 2 | Extra memory after the image | the source |
| 10 | 2 | Size of the relocation data | the tool |
| 12 | 3 | Stack bytes added: BDOS, BIOS, CCP | the source |
| 15 | 2 | `INIT`, from the header's start | the tool |
| 17 | 8 | The name | the source |

Flags bit 0 permits removal. Bits 1 to 7 claim restart vectors, described
under Restart vectors below. Extra memory follows the image and is not
cleared by the loader. Initialise any buffer before reading it. The name
is eight bytes padded with spaces and is the name printed by `SERVICES`.

The file contains the header and image, then dependencies, then relocation
data. The writers convert addresses for page 0, ready for the loader to
add the actual base page. TAS pads the file to whole 128-byte records and
the loader ignores bytes after the declared relocation data.
[Appendix H](appendix-h-service-file-format.md) gives the complete encoding
and the distinction between the file header and its installed form.

### INIT

`INIT` runs after the loader has copied the service into its pages and relocated
the image. `CONSLOT` finds `CONOUT`'s entry from the word at `0001h`. After the
`WBOOT` entry come `CONST`, `CONIN` and `CONOUT` so `CONOUT`'s `JP` is at the
word's value plus 9. The `+ 1` steps past the `JP`'s opcode to the two bytes of
its target. `INIT` saves those two bytes in `OLDCO` and writes the address of
`MYCO` over them. All work that can fail must finish before the hook is
installed. The failure paths below explain the consequences of leaving a hook
behind.

A return with carry clear reports successful initialisation. `HL` identifies the
first record for publication or is zero when there are no records. The loader
checks the records before committing the installation.

### The hook

`MYCO` runs inside every call of the `CONOUT` entry. `CONOUT` takes its
character in `C`. `MYCO` puts back the one register it uses so the entry it
replaced runs with the registers it would have had. `MYCO`'s last instruction is
a `JP` written as data, whose target is the two bytes `INIT` filled in at
`OLDCO`. The old `CONOUT` therefore returns straight to the caller.

### REMOVE

`UNLOAD` calls `REMOVE` to undo the service's changes. COUNT writes the
two saved bytes back over `CONOUT`'s target. Carry clear permits removal.
A routine that returns carry set must leave the service and its external
state usable because the loader keeps it installed.

## Assembly, installation and measurements

`TAS NAME OUT.TYP` writes the output under the name given. For the output
type `.SVC` it fills in the header's fields and the relocation data. For any
other type it writes a flat image, except that it rejects `.DBG` and a type
that starts with `$`. So `TAS COUNT COUNT.SVC` writes the service, in place
of any `COUNT.SVC` already on the drive.

COUNT and GLCD cannot both fit within the declared CCP stack allowance.
For the COUNT workflow, use the serial or PICO console with GLCD absent
from `SERVICES`. [Chapter 7](07-choose-a-console.md) explains switching
consoles. Select a working replacement console before removing GLCD.
The Stacks section below explains the declarations behind this restriction.

The recipe below prepares a separate `svc.img` using the host
card-tool setup from Chapter 6. Save COUNT's listing as `count.asm` beside
the other PC sources. `HWLIB.ASM` is the helper from Chapter 12 and
`area.asm` is Chapter 11's AREA program. `chars.asm`, listed under
Publishing a record below, reads COUNT's count. The retained captures name
their specific run revisions:

```sh
cp dist/starter.img svc.img
node tools/tecvol.mjs put svc.img B dist/abi.inc --text
node tools/tecvol.mjs put svc.img B area.asm --text
node tools/tecvol.mjs put svc.img B hwlib.asm --text
node tools/tecvol.mjs put svc.img B count.asm --text
node tools/tecvol.mjs put svc.img B chars.asm --text
```

This run assembles AREA and CHARS before writing COUNT.SVC:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card svc.img B: 'TAS AREA' 'TAS CHARS' 'TAS COUNT COUNT.SVC' AREA COUNT.SVC SERVICES AREA CHARS CHARS UNLOAD SERVICES AREA CHARS. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS AREA
AREA.COM written

B:WORK>TAS CHARS
CHARS.COM written

B:WORK>TAS COUNT COUNT.SVC
COUNT.SVC written

B:WORK>AREA
42496 bytes

B:WORK>COUNT.SVC

B:WORK>SERVICES
COUNT 1
SHELL 15
B:WORK>AREA
42240 bytes

B:WORK>CHARS
count 0053

B:WORK>CHARS
count 0070

B:WORK>UNLOAD

B:WORK>SERVICES
SHELL 15
B:WORK>AREA
42496 bytes

B:WORK>CHARS
no COUNT record

B:WORK>
```

The rest of that same run measured the TPA, installed COUNT, read the count
twice and removed the service:



The file has 100 header/image bytes and 11 relocation bytes, and the PC
writer below gives the same 111-byte total. COUNT occupied one page, as
`SERVICES` reported. The measured TPA fell by 256 bytes, that page, and
removal restored them. The shell, installed first, had already taken the
alignment gap below the BDOS entry stub, which is lost with the first service
only.
[Chapter 25](25-loading-and-removing-services.md#the-resident-entry-and-its-pages)
explains the allocation. These addresses and sizes describe this card's
layout and are not a memory ceiling for programs to assume.

The two CHARS results differed by `18h` (24 characters printed between the
calls). The hook remained installed across each program's warm boot.

### The PC file writer

The repository's `makeSvc` in `tools/lib/svc.mjs` writes service files on
the PC. It uses TAS and assembles at `0100h` and `0200h`, as a CP/M PRL
file is made (`tools/lib/svc.mjs:1-4`, `tools/lib/prl.mjs:33-53`). Its input needs an indented
`ORG $0100` line with no trailing comment. An include such as `%INCLUDE "ABI.INC"` is
resolved relative to the source file, matching path components without
regard to case. Copying `abi.inc` into the current directory is sufficient
only when `count.asm` is there too. The include remains source-adjacent
even though temporary assembly copies are written under `build/svc`.

This PC recipe, run in the repository root with `count.asm` there, writes
COUNT's 111 meaningful bytes. They equal the first 111 bytes of the 128-byte
file that the card's `TAS COUNT COUNT.SVC` writes:

```sh
cp dist/abi.inc .
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { makeSvc } from "./tools/lib/svc.mjs";
const { file } = await makeSvc("count.asm", { work: "build/svc" });
writeFileSync("COUNT.SVC", file);
'
node tools/tecvol.mjs put svc.img B COUNT.SVC
```

## Beyond the loader's checks

The loader checks the file layout, dependencies, declared stack use and
returned records. Those checks cannot establish whether INIT and REMOVE
restore every external change. Your service must undo its hooks and device
state before its pages become available to programs again.

### The hook as INIT's last act

A hook installed before a later failing operation can leave an entry pointing
into pages that the loader releases. An ordinary failed INIT is followed
by a scan of the 17 BIOS jump-table targets. A target in the provisional
service pages causes the loader to retain those pages with no records and
clear the flags, making the retained service nonremovable. This scan does
not cover another pointer, such as a display table registered through ROM
service 12. INIT must undo that change itself.

A warm boot during INIT bypasses its return path and that scan. The loader
has temporarily lowered `0006h` but has not committed the new ceiling.
Warm boot restores the previous ceiling and abandons the installation
without calling REMOVE. A hook left behind can then reach overwritten
memory. Complete every operation that can fail before writing the hook
and return immediately after the final setup.

An accepted BDOS function 47 call from INIT takes this warm-boot path.
The replacement line is subject to the normal flush and command-chain
rules in [Chapter 13](13-results-and-command-chains.md). A rejected function
47 call returns `FFh` to INIT and does not warm-boot. INIT must handle that
return and continue or report failure as appropriate.

### A failed INIT

Before returning carry set, INIT must undo everything it changed. A typed
installation then fails with the file name and a question mark, though a
default-mode fatal card-read error can end the command earlier. An INIT
that started an interrupt source must turn it off before reporting failure.

FAIL's INIT returns carry set without changing any external state.
Save this complete original source as `fail.asm`:

```asm
; FAIL.SVC: a service whose INIT returns carry set, so the load fails.
%INCLUDE "ABI.INC"

	ORG	$0100
HDR:	DB	'D',SVCFMT,0,1	; magic, format, no dependencies, removable
	DW	0,0,0,0		; REMOVE, size, extra memory, relocation
	DB	0,0,0		; no stack bytes added
	DW	0		; INIT
	DB	"FAIL    "	; the name SERVICES would print

; Nothing was done, so there is nothing to undo. Returns carry set: not
; installed.
INIT:	SCF
	RET

; Never reached: a failed INIT runs no REMOVE. Returns carry clear.
REMOVE:	OR	A
	RET
```

`SCF` sets carry and `RET` returns to the loader. Since INIT did no setup,
there is nothing to undo. The loader does not call REMOVE after this return.
It scans the BIOS targets and releases FAIL's provisional pages because none
points into them.

The following run uses the PICO9918 console at 40 columns with the Matrix
switch enabled, on a separate copy of the starter card with `fail.asm`,
Chapter 11's `area.asm` and the matching `abi.inc` on B. AREA needs no HWLIB
include. The startup file had installed only the shell:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico --card svc2.img B: 'TAS AREA' 'TAS FAIL FAIL.SVC' AREA SERVICES FAIL.SVC AREA. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>B:
B:WORK>TAS AREA
AREA.COM written

B:WORK>TAS FAIL FAIL.SVC
FAIL.SVC written

B:WORK>AREA
42496 bytes

B:WORK>SERVICES
SHELL 15
B:WORK>FAIL.SVC
FAIL.SVC?

B:WORK>AREA
42496 bytes

B:WORK>
```

The question mark reports the failed installation. AREA printed the same
42,496-byte TPA before and after it, and FAIL left no resident allocation.
The attempt04 verification of this workflow, on ROM `fa63989b`, also checked
the service state directly: INIT returned carry set once, REMOVE was not called and the loader restored
the complete baseline after its BIOS scan. An INIT that changes hardware or
hooks must undo those changes before returning carry set.

GLCD's INIT reports an absent graphics LCD with carry set and `A` = 2,
`TNENODV`. Its table registration reports `TNEBAD`, status 1, when the Matrix
switch is disabled or a GLCD table is already registered. For a startup line
with CON requesting CRT, registration returns TNENODV. In STARTUP.CMD that INIT
failure is quiet when cleanup releases the pages. It leaves a zero command
result so a following `&` piece can run. Retained-page failures, failed file
validation and rejected records do not receive that exception. A driver that
finds its device absent can use the same return convention.
[Chapter 8](08-commands-at-startup.md) describes the startup policy and Chapter
13 explains conditional pieces.

### REMOVE and a hook on a hook

REMOVE restores the target saved by its own INIT. A service installed after
COUNT would save MYCO as the previous CONOUT target. Output would pass through
the new hook, then MYCO, then the ROM routine. Removal proceeds from the lowest,
newest service so its REMOVE restores MYCO before COUNT's REMOVE restores the
original target. A nonremovable newest service blocks removal of every older
service.

UNLOAD runs REMOVE from the CCP while no transient program is running.
The loader can also call REMOVE after successful INIT when record checks
fail. An accepted function 47 call from an UNLOAD removal abandons the
return path, leaving the service listed. Its queued line still depends on
the normal warm-boot flush. A rejected call returns to REMOVE. Neither
case relieves REMOVE of restoring any state it changed before ending or
reporting refusal.

### Restart vectors

COUNT changes no restart vector in page zero. An interrupt or RST handler
can instead use one of the vectors at `0008h` through `0038h`. Header
flags bits 1 to 7 claim RST 1 through RST 7. INIT must write the jump
itself. The loader rejects the load before INIT if a claimed vector already
starts with `JP`, including a jump into ROM left by an earlier program.
An unclaimed vector change is outside this conflict check.

The page-zero sweep covers `0008h` to `003Fh` at cold and warm boot and
after removal or failure cleanup that releases the pages. It preserves a
`JP` only when its target is strictly above the TPA ceiling. The remaining
five bytes of a preserved vector are cleared. Other vectors become seven
zeros followed by RET, except `0038h`, which becomes EI, RETI and zeros.
A resident handler therefore survives warm boot when its entry address is
above the ceiling.

Removal and failure cleanup clear the claimed vectors before sweeping so those
slots take their defaults even if their jumps target ROM. An unclaimed jump
outside the released pages can survive the sweep. Your cleanup must restore it.
Cold and warm boot enter with interrupts disabled. A maskable handler at `0038h`
receives interrupts only after a program or service enables them with EI.

### The ROM's addresses

A resident service calls the ROM through the table at `C003h`, using the names
in `abi.inc`. Internal routine addresses can change between builds. Format 4
ties a loaded service to major version 5 of the application binary interface
(ABI) so the service does not need the major-version check that a transient
client needs. Check the result of a call added in a later minor version. GLCD
does this for FONT, added in ABI 5.1.

`makeSvc` checks source text for ROM literals from `$C000` to `$FFFF` and
`0C000h` to `0FFFFh`, excluding comments. Decimal, binary or differently
expressed addresses can escape that check. It is a writing constraint, not proof
that every call uses the interface. Pinned TAS has no equivalent ROM-address
check. The loader separately blocks nested load or removal while INIT or REMOVE
is active. Ordinary CCP commands cannot run inside those routines but a direct
internal call could attempt the operation.

## Stacks

A service uses its caller's stack. Header bytes 12 to 14 declare the extra bytes
it can add on the BDOS, BIOS and CCP stacks, in that order. MYCO pushes one word
while intercepting CONOUT and then pops it before the tail jump. CONOUT can run
on any of those stacks so COUNT declares 2, 2 and 2.

The loader sums the declarations of all installed services. The limits at the
inspected source are 8 extra bytes on the BDOS stack, 12 on the BIOS stack and 6
on the CCP stack. GLCD declares 6 for the CCP so GLCD and COUNT cannot both be
installed with these declarations. On a GLCD-only configuration, startup
installs GLCD and COUNT then fails with `COUNT.SVC?`. The earlier console
prerequisite avoids that conflict. The captures here use configurations in which COUNT can load.

CHEAT changes COUNT's BDOS declaration to 9, above the limit even with no
other service installed. This capture omits its assembly lines:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card svc.img B: 'TAS CHEAT CHEAT.SVC' CHEAT.SVC SERVICES. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS CHEAT CHEAT.SVC
CHEAT.SVC written

B:WORK>CHEAT.SVC
CHEAT.SVC?

B:WORK>SERVICES
SHELL 15
B:WORK>
```

The shell declares 6 bytes of the BDOS's stack, and even alone CHEAT's 9
exceed the BDOS's limit of 8.

You must calculate those declarations. The loader checks their sums, not the
code's actual stack use. It cannot check a transient program's private stack
either so document the space each public routine needs there. A service
executing on the BDOS stack must not call the BDOS again. In particular, MYCO
cannot report its count through function 9 from inside the output hook. CHARS
prints it from outside the hook instead.

## Publishing a record

CHARS needs COUNT's routine address even though COUNT can load at different
pages. The registry provides that lookup. It is a linked list whose head is in
TEC-OS's resident workspace. Each record occupies 13 bytes in its service's
resident pages:

| Offset | Bytes | Contents |
| ---: | ---: | --- |
| 0 | 2 | The next record, 0 at the last |
| 2 | 8 | The record's name, padded with spaces |
| 10 | 1 | Its interface version |
| 11 | 2 | Its entry table's address |

INIT returns its first record in HL. Link several records through their
first words and terminate the service's chain with zero. COUNT returns
its single REC. The loader joins the last record to the previous registry
head and publishes the first as the new head. It checks both ends of each
record and the table address against the service's pages. It does not
check the table's contents or the routines reached through it.

One service can publish at most 255 records and the whole registry can hold at
most 256. FIND examines at most 256 records. LIST takes a byte index, 0 through
255. Record rejection calls REMOVE to undo a successful INIT. The typed command
fails with a question mark but failure does not always free the pages. If REMOVE
returns carry set, the loader retains the service with no proposed records.
Successful cleanup is followed by the BIOS-target scan described above, which
can retain pages as nonremovable. Design REMOVE to work both after publication
and before publication has succeeded.

The record's name and version identify the table layout. COUNT version 1 has one
JP at offset zero, to GETCNT, which returns the count in HL. Later versions can
append entries while preserving that contract. FIND accepts a record at or above
the requested minimum version so changing the meaning of an existing entry would
break older clients despite a successful lookup.

A client is a program or service that uses a record. For FIND, set C to
`TNFIND`, service 13, DE to the eight-byte padded name and B to the minimum
version, then call ABICALL. Carry clear returns the entry table in HL and
the current registry generation in A. Carry set reports no matching record.
This CHARS client uses the helpers in HWLIB.ASM:

```asm
; CHARS: print the count that COUNT.SVC publishes, in hex.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW	; prints and ends the program
	LD	DE,NAME		; the record's eight-byte name
	LD	B,1		; the least interface version
	LD	C,TNFIND	; the registry's find
	CALL	ABICALL
	LD	DE,NONE
	JP	C,SAY		; carry: no such record, so print and end
	CALL	CALLHL		; offset 0 of the table: HL = the count
	PUSH	HL		; the low byte, for after the label
	LD	A,H		; the high byte first
	LD	DE,MSG		; the label
	CALL	LABHEX		; A is the high byte
	POP	HL
	LD	A,L		; the low byte, on the same line
	CALL	HEX
	LD	DE,CRLF		; end the line
	JP	SAY		; prints and ends the program

; Call the routine at HL, whose RET returns to the caller of CALLHL. Changes
; what that routine changes.
CALLHL:	JP	(HL)

NAME:	DB	"COUNT   "	; the record to find
NONE:	DB	"no COUNT "	; printed when there is no record
	DB	"record"
	DB	13,10,"$"
MSG:	DB	"count $"	; the label before the count
CRLF:	DB	13,10,"$"
%INCLUDE "HWLIB.ASM"
```

The Z80 has no indirect CALL instruction. CALLHL supplies one by jumping
through HL while leaving its caller's return address on the stack.
GETCNT therefore returns to the instruction after `CALL CALLHL`.

CHKHW checks the ABI signature and major version before the first ROM
call. A COM file can run on a different system, where `C008h` may contain
unrelated code. In the run above CHARS prints `no COUNT record` after UNLOAD removes
COUNT.

LIST, service 14 or `TNLIST`, takes the index in B and returns the record
itself in HL with the generation in A. Carry is set past the last record.
Newly published records precede older services' records, retaining their
own linked order. This RECS program prints each record's name,
version and table address:

```asm
; RECS: list the registry, newest record first: each record's name, its
; interface version and the address of its entry table.
BDOS	EQU	$0005
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
NEXT:	LD	A,(INDEX)	; the next record's number
	LD	B,A		; B = that number
	LD	C,TNLIST	; the registry's enumerate
	CALL	ABICALL
	RET	C		; carry: past the last record
	LD	A,(INDEX)	; the next one, for the next round
	INC	A
	LD	(INDEX),A
	CALL	SHOW		; one line for this record
	JR	NEXT		; until the carry above

; Print the record at HL on one line. Changes AF, BC, DE and HL.
SHOW:	INC	HL		; past the link word
	INC	HL		; HL = the name
	LD	B,8		; the eight bytes of the name
SHOW1:	LD	E,(HL)		; BDOS console output
	LD	C,2
	PUSH	BC		; the BDOS changes these
	PUSH	HL
	CALL	BDOS
	POP	HL
	POP	BC
	INC	HL		; the name's next byte
	DJNZ	SHOW1
	LD	A,(HL)		; the version, after the name
	INC	HL		; HL = the table's word
	LD	DE,VERS
	CALL	LABHEX		; LABHEX and HEX keep HL
	LD	E,(HL)		; DE = the table's address
	INC	HL
	LD	D,(HL)
	EX	DE,HL		; HL = it, which HEX keeps
	LD	A,H		; high byte first
	LD	DE,TABL
	CALL	LABHEX
	LD	A,L		; the low byte, on the same line
	CALL	HEX
	LD	DE,CRLF		; end the line
	JP	SAY		; its RET is this routine's

INDEX:	DB	0
VERS:	DB	" version $"
TABL:	DB	" table $"
CRLF:	DB	13,10,"$"
%INCLUDE "HWLIB.ASM"
```

Save that source as `recs.asm` and put it on B with the same `--text`
card-tool operation used for the other sources. The run below uses the PICO
board configuration. Startup's GLCD line installs nothing
while the PICO console is active, leaving stack room for COUNT.
With COUNT.SVC built by TAS on the card, RECS lists two records. The table
addresses are this run's:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card svc.img --board pico B: 'TAS COUNT COUNT.SVC' 'TAS RECS' COUNT.SVC RECS. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS COUNT COUNT.SVC
COUNT.SVC written

B:WORK>TAS RECS
RECS.COM written

B:WORK>COUNT.SVC

B:WORK>RECS
COUNT    version 01 table A65F
PICO     version 04 table BBE8

B:WORK>
```

The shell, which publishes no record, is not listed.

PICO is the ROM console's permanent record, registered when that console starts
at cold boot. UNLOAD cannot remove it. Its graphics entries require the display
claim described in Chapter 12 and listed in
[Appendix B](appendix-b-rom-services.md). GLCD publishes no record so it does
not appear in RECS even when installed.

FIND returns the first record with the requested name and a sufficient
version. A newer service's qualifying record hides an older one until
the newer service is removed. A newer record below the minimum version
does not hide an older qualifying record.

RECS's byte-sized INDEX wraps after 255. The two-record listing ends
normally but a full 256-record registry would wrap to zero and repeat. A client
intended to enumerate that capacity must stop after processing index 255 rather
than depend on a further out-of-range LIST call.

## Depending on another service

A table address remains usable only while its service is resident. Its
lifetime depends on the client:

- A program may keep it until it exits. UNLOAD runs from the CCP after the
  program has ended.
- A service that needs another names the record as a dependency and may keep the
  pointer. The dependency must be installed first so it sits above the dependent
  in memory. Only the lowest service can go so the dependent goes first.
- A service that finds a later-installed provider cannot assume that its pointer
  survives removal. Find the record for each use or validate a cached pointer
  against the registry generation within its wrap limit.

The generation is a byte incremented by each successful removal. FIND and LIST
return it in A on success. A different value from the one stored with a pointer
proves that a removal occurred so discard the cached pointer. The byte wraps
after 256 removals and the same value can then accompany a stale pointer.
Installation alone does not increment it. A cache that must follow the newest
provider must perform a new lookup after additions too, even while its old
provider remains resident.

A dependency is nine bytes: the minimum version followed by the eight-byte
padded name. In TAS source, place whole dependency entries at the end
under DEPS. TAS counts them, excludes them from the image and writes them
after it. The PC writer takes dependencies from the `deps` option to
makeSvc, not from TAS's trailing DEPS convention. Appendix H gives both
forms. This NEEDS.SVC binds to COUNT once during INIT:

```asm
; NEEDS.SVC: a service that names COUNT's record as a dependency and binds to
; it once, at INIT. Its own entry would use TABLE.
%INCLUDE "ABI.INC"

	ORG	$0100
HDR:	DB	'D',SVCFMT,0,1	; the tool writes the dependency count
	DW	0,0,0,0		; REMOVE, size, extra memory, relocation
	DB	0,0,0		; no stack bytes added
	DW	0		; INIT
	DB	"NEEDS   "

; Find COUNT's table and keep it. Returns HL = 0, no record, carry clear.
; Changes AF, BC and DE.
INIT:	LD	DE,NAME		; the same name and version as the dependency
	LD	B,1
	LD	C,TNFIND	; the registry's find
	CALL	ABICALL
	RET	C		; the loader has checked this already
	LD	(TABLE),HL	; safe to keep: COUNT can't leave first
	LD	HL,0		; no record of its own
	OR	A
	RET

; Nothing to undo. Returns carry clear.
REMOVE:	OR	A		; carry clear: removal goes ahead
	RET

NAME:	DB	"COUNT   "	; the record to find
TABLE:	DW	0		; the table, once found
DEPS:	DB	1,"COUNT   "	; the least version, then the record's name
```

The loader checks each dependency before moving the service or running INIT.
NEEDS uses the same name and version in its declaration and FIND call so that
lookup is already satisfied when INIT starts. Without COUNT the installation
fails before INIT. The run below shows the failed attempt, then installation
and removal in the required order:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card svc.img B: 'TAS COUNT COUNT.SVC' 'TAS NEEDS NEEDS.SVC' NEEDS.SVC COUNT.SVC NEEDS.SVC SERVICES UNLOAD UNLOAD SERVICES. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS COUNT COUNT.SVC
COUNT.SVC written

B:WORK>TAS NEEDS NEEDS.SVC
NEEDS.SVC written

B:WORK>NEEDS.SVC
NEEDS.SVC?

B:WORK>COUNT.SVC

B:WORK>NEEDS.SVC

B:WORK>SERVICES
NEEDS 1
COUNT 1
SHELL 15
B:WORK>UNLOAD

B:WORK>UNLOAD

B:WORK>SERVICES
SHELL 15
B:WORK>
```

The first UNLOAD removed NEEDS, the lowest service. Only then could the
second remove COUNT. NEEDS could retain its pointer because COUNT's pages
could not be released before NEEDS's own removal.
