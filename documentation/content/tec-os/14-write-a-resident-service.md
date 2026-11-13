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

Counting output across several program runs requires code that remains in
memory after installation. `COUNT.SVC` reserves memory for that code and
publishes a routine another program can locate.

## Code that stays

Memory loaded from a COM file at `0100h` becomes available for later programs
after exit. A resident service instead reserves 256-byte pages that survive
warm boot. Reset discards it. UNLOAD removes only the newest service and only
when its flags and removal routine permit it. [Chapter
5](05-drives-and-user-areas.md#programs-and-resident-services) gives the
commands for installing, listing and removing services.

A service may operate hardware as a driver or supply callable routines as a
library. The starter card's GLCD.SVC is a display driver. COUNT does both a
hook operation and a library operation: it intercepts console output and
provides a count-reading routine.

Resident pages reduce the TPA available to later programs. Installation lowers
the word at `0006h` below the BDOS entry jump, following [Chapter
11](11-memory-for-programs.md)'s memory contract. [Chapter
12](12-use-the-boards-devices.md)'s numbered ROM routines use no service pages
and do not appear in SERVICES. A RAM service may publish named registry
records. ROM calls 13 and 14 find and enumerate those records.

COUNT changes the CONOUT jump in the RAM BIOS table at `BF00h`. The word at
`0001h` locates WBOOT and each table entry is a three-byte JP. A hook performs
its work then jumps to the previous target. Since warm boot preserves this
table, BDOS and CCP output keeps passing through COUNT across program exits.
PUTAT and private ROM printing bypass CONOUT.

A transient hook would become invalid when another program overwrote its code.
A transient program must therefore restore every changed BIOS entry before
exit, including WBOOT. COUNT keeps its hook in reserved pages and restores
CONOUT during removal. Hook coverage still depends on the route used. BDOS
output checks call ROM CONST directly so a RAM CONST hook misses those checks.
[Chapter 17](17-console-paths.md) traces the console paths.

## COUNT.SVC

COUNT stores a word in CHARS, increments it in the CONOUT hook and publishes a
routine that reads it:

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

The service begins with a 25-byte header at `0100h`. Source supplies its name,
flags, extra-memory request and stack declarations. Leave routine offsets,
sizes and dependency count zero for the file writer. Both pinned TAS and
makeSvc require INIT and REMOVE labels even when removal is prohibited by the
flags.

At the inspected revision SVCFMT is 4. The loader requires both the initial
`D` and that format. Pinned TAS preserves the source's format byte while
makeSvc overwrites it with 4. TAS fills the dependency count only with a DEPS
label, so a source with no dependencies must supply a zero count itself.

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

Removal permission is flags bit 0. Bits 1–7 claim restart vectors as described
below. Extra memory follows the image but the loader does not clear it.
Initialise buffers before reading them. SERVICES prints the eight-byte
space-padded header name.

The file stores header and image first, dependencies next and relocation data
last. File writers convert addresses for page 0 so the loader can add the
installation page. TAS pads to 128-byte records. The loader ignores padding
after the declared relocation data. [Appendix
H](appendix-h-service-file-format.md) distinguishes this file encoding from
the installed header.

### INIT

INIT runs after copying and relocation. CONSLOT derives CONOUT from the WBOOT
word at `0001h`: CONST, CONIN and CONOUT follow it, putting CONOUT at +9.
Another byte skips the JP opcode. INIT copies the old two-byte target to OLDCO
and replaces it with MYCO. Complete every fallible operation before installing
that hook. The failure paths below explain why cleanup cannot be assumed.

Carry clear returns successful initialisation. HL then names the first record
to publish or zero for none. The loader validates the proposed records before
committing the installation.

### The hook

CONOUT receives its character in C. MYCO saves HL, increments CHARS and
restores HL before jumping to the previous CONOUT target. That JP is encoded
as data followed by OLDCO, the target filled during INIT. All registers have
their original values at the jump and the old routine returns directly to the
caller.

### REMOVE

COUNT's REMOVE restores CONOUT's two saved target bytes. Carry clear permits
the loader to release the service. Carry set reports refusal and leaves it
installed. A refusing routine must therefore leave the service and its
external state usable.

## Assembly, installation and measurements

TAS selects service-file output from the explicit type. `TAS NAME OUT.TYP`
writes that named output and `.SVC` triggers header completion and relocation
data. Other types produce a flat image except `.DBG` and types beginning with
`$`, which are rejected. Thus `TAS COUNT COUNT.SVC` replaces any existing
COUNT.SVC on the drive.

Startup installs SHELL.SVC first so SERVICES lists `SHELL 15` beneath newer
services and UNLOAD reaches it only after removing them
([Chapter 5](05-drives-and-user-areas.md)).

The example needs serial or PICO console operation with GLCD absent from
SERVICES. COUNT plus GLCD exceeds the CCP stack allowance described below.
Select a working replacement console before removing GLCD. [Chapter
7](07-choose-a-console.md) explains console switching.

The recipe creates a separate `svc.img` with [Chapter 6](06-cards-on-the-pc.md)'s host tools. Save
COUNT as `count.asm` alongside the PC sources. It also needs Chapter 12's
HWLIB.ASM, Chapter 11's `area.asm` and the `chars.asm` client listed under
Publishing a record. Each retained capture identifies its run revision:

```sh
cp dist/starter.img svc.img
node tools/tecvol.mjs put svc.img B dist/abi.inc --text
node tools/tecvol.mjs put svc.img B area.asm --text
node tools/tecvol.mjs put svc.img B hwlib.asm --text
node tools/tecvol.mjs put svc.img B count.asm --text
node tools/tecvol.mjs put svc.img B chars.asm --text
```

The run builds AREA and CHARS, writes COUNT.SVC, then measures installation,
use and removal:

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




COUNT has 100 header/image bytes and 11 relocation bytes. The PC writer below
produces the same 111-byte total. SERVICES reports a single allocated page and
AREA shows a 256-byte reduction, restored after UNLOAD. The shell had already
consumed the first-service alignment gap below the BDOS stub. [Chapter
25](25-loading-and-removing-services.md#the-resident-entry-and-its-pages)
explains that allocation. These sizes describe this card rather than a fixed
program ceiling.

The CHARS readings increase from `0053` to `0070`, a difference of `1Dh`,
counting 29 intervening output characters. The hook remains active through
each program's warm boot.

### The PC file writer

The PC makeSvc writer in `tools/lib/svc.mjs` assembles at `0100h` and `0200h`
with TAS to derive relocation, as for a CP/M PRL file
(`tools/lib/svc.mjs:1-4`, `tools/lib/prl.mjs:33-53`). It requires an indented
`ORG $0100` line without a trailing comment. Includes resolve relative to the
source with case-insensitive path components. Copying abi.inc to the current
directory is sufficient only with count.asm there too. Temporary copies under
`build/svc` retain this source-relative include base.

From the repository root, with count.asm there, this recipe writes 111
meaningful bytes. They match the first 111 bytes of the card TAS's 128-byte
record-padded service:

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

File-layout validation cannot prove hook cleanup. The loader checks
dependencies, declared stack use and records. INIT and REMOVE must restore
external pointers and device state before released pages can be reused.

### The hook as INIT's last act

A late INIT failure can strand a previously installed hook. After an ordinary
failed return the loader scans all 17 BIOS jump targets. A target inside the
provisional pages forces it to retain them without records and clear their
flags, making the service nonremovable. The scan excludes other pointers such
as a service-12 display table. INIT must undo those itself.

Warm boot inside INIT bypasses both its return path and that scan. Although
`0006h` was lowered provisionally, warm boot restores the prior committed
ceiling and abandons installation without REMOVE. A leftover hook can then
point into overwritten memory. Install the hook only after all fallible setup
and return immediately afterwards.

An accepted function-47 call inside INIT follows this warm-boot abandonment
path. Its replacement line still depends on [Chapter
13](13-results-and-command-chains.md)'s flush rules. Rejection returns `FFh`
without warm boot so INIT must handle that result before continuing or
reporting failure.

### A failed INIT

Before returning carry set, INIT must reverse every external change, including
disabling any interrupt source it started. Typed installation then prints the
file name and a question mark. A fatal default-mode card-read error can
terminate it earlier.

FAIL tests rejection without any external setup to reverse. Save its complete
source as `fail.asm`:

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

SCF sets carry and RET returns failure. The loader calls REMOVE only after a
successful INIT. Its BIOS-target scan finds no pointer into FAIL's pages and
releases them.

The following 40-column PICO run has the Matrix switch enabled. A separate
starter-card copy holds fail.asm, Chapter 11's area.asm and matching abi.inc
on B. AREA needs no HWLIB. Startup has installed only the shell:

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

The question mark reports rejection and the identical 42,496-byte AREA results
show no retained allocation. Workflow attempt04 on ROM `fa63989b` also checked
state directly. INIT returned carry set once and REMOVE never ran. After the
BIOS scan the complete baseline was restored. Services with real hardware or
hooks must perform their own rollback before that failed return.

GLCD uses carry set with `A = 2`, TNENODV, for an absent display. Registration
returns TNEBAD, status 1, if Matrix is disabled or a GLCD table already
exists. A startup CRT request instead gives TNENODV. Startup suppresses that
failure only when cleanup releases the pages, leaving a success result for a
following `&`. Retained-page failures, invalid files and rejected records
receive no quiet exception. Another absent-device driver may use the same
convention. [Chapter 8](08-commands-at-startup.md) gives startup policy and
Chapter 13 explains conditional pieces.

### REMOVE and a hook on a hook

Hooks form a chain in installation order. A later CONOUT hook saves MYCO as
its previous target, then forwards output through MYCO to the ROM routine.
Removal proceeds from the newest, lowest service so the later REMOVE restores
MYCO before COUNT restores the original target. A nonremovable newest service
prevents removal of all older services.

UNLOAD invokes REMOVE from the CCP with no transient program running. The
loader also invokes it when successful INIT is followed by invalid records. An
accepted function 47 during UNLOAD abandons removal's return path and leaves
the service listed. Its new line still requires a successful flush. Rejection
returns to REMOVE. In either case REMOVE remains responsible for restoring
state before terminating or refusing removal.

### Restart vectors

COUNT claims no restart vector. A handler can claim slots `0008h–0038h`
through header flags bits 1–7, for RST 1–7. INIT writes the jump itself.
Before INIT the loader rejects a claim whose slot already begins with JP,
including an old program's jump into ROM. It does not check undeclared vector
changes.

Cold and warm boot sweep `0008h–003Fh`, as does removal or failure cleanup
that frees pages. A JP survives only above the TPA ceiling. Its remaining five
slot bytes are cleared. Other slots become seven zeros and RET, except
`0038h`'s EI, RETI and zeros. A resident handler above the ceiling therefore
survives program exits.

Before sweeping released pages the loader clears claimed slots even when they
point into ROM. An unclaimed jump outside those pages may survive so your
cleanup must restore it. Cold and warm boot disable maskable interrupts. A
handler at `0038h` runs only after a program or service enables them with EI.

### The ROM's addresses

ROM access uses the fixed `C003h` interface and abi.inc names because internal
addresses can move. Format 4 already requires ABI major 5, removing the
transient client's major-check requirement. Calls added in a later minor
version still need their results checked. GLCD checks FONT, introduced in 5.1.

makeSvc rejects source ROM literals from `$C000–$FFFF` and `0C000h–0FFFFh`
after excluding comments. Decimal, binary and other expressions can evade this
text check so it does not prove interface-only access. Pinned TAS has no
matching check. Separately the loader refuses nested load or removal while
INIT or REMOVE is active. Those routines cannot run ordinary CCP commands but
could attempt a direct internal call.

## Stacks

A hook adds stack use to its caller. Header bytes 12–14 declare the extra
bytes on BDOS, BIOS and CCP stacks respectively. MYCO pushes a two-byte word
and pops it before forwarding output. COUNT declares 2, 2 and 2 because CONOUT
can execute on all three stacks.

The loader sums installed declarations against limits of 8 BDOS bytes, 12 BIOS
bytes and 6 CCP bytes at the inspected revision. GLCD declares the full CCP
allowance of 6 so adding COUNT fails. On a GLCD-only board startup installs
GLCD and COUNT reports `COUNT.SVC?`. The console prerequisite above avoids
this conflict in the captured workflows.

CHEAT changes COUNT's BDOS declaration to 9, which exceeds 8 even alone. The
capture includes the build and rejected load:

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

SHELL declares 6 BDOS bytes. CHEAT's declaration already fails the limit
without adding those bytes.

Base declarations on calculated stack use. The loader sums declarations
without inspecting the code's stack behaviour and cannot validate a transient
client's private stack. Document the allowance each public routine requires.
Code already on the BDOS stack must not reenter the BDOS. MYCO therefore
cannot print through function 9 inside its output hook. The separate CHARS
client prints the result outside the hook.

## Publishing a record

CHARS needs a callable address even though COUNT's installation address
varies. COUNT publishes a named registry record for that purpose. The registry
head is in resident workspace and its linked records occupy 13 bytes each
inside service pages:

| Offset | Bytes | Contents |
| ---: | ---: | --- |
| 0 | 2 | The next record, 0 at the last |
| 2 | 8 | The record's name, padded with spaces |
| 10 | 1 | Its interface version |
| 11 | 2 | Its entry table's address |

INIT returns its first record in HL. Multiple records link through their first
words and end with zero. COUNT supplies REC alone. The loader links the final
record to the previous head and publishes the new first record. It validates
the ends of each record and its table address against service pages. Table
contents and routine targets remain the service's responsibility.

The limits are 255 records per service and 256 in the complete registry. FIND
visits at most 256 records and LIST uses a byte index from 0 to 255. Rejected
records cause REMOVE after successful INIT. The typed load fails with a
question mark but pages may remain. Carry set from REMOVE retains the service
without the proposed records. Successful cleanup still undergoes the
BIOS-target scan, which can retain nonremovable pages. REMOVE must work before
publication as well as after it.

A name and interface version identify a table's layout. COUNT version 1 places
a JP to GETCNT at offset zero, returning the count in HL. A compatible later
version can append entries. FIND accepts any version at or above the client's
minimum, so changing an existing entry's meaning would break clients that
still pass the version check.

A *client* is a program or service calling a published routine. FIND takes
`C = TNFIND`, service 13, DE pointing to the eight-byte padded name and B
holding the minimum version. Carry clear returns the table in HL and registry
generation in A. Carry set means no match. CHARS uses that lookup with
HWLIB.ASM's helpers:

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

Z80 has no indirect CALL instruction. CALLHL jumps through HL with the
existing return address still on the stack. GETCNT's RET therefore resumes
after `CALL CALLHL`.

Before lookup CHKHW validates the signature and major version. A COM file may
be running on another system where `C008h` is unrelated code. After COUNT is
unloaded the captured CHARS run reports `no COUNT record`.

LIST, `TNLIST` or service 14, returns a record address in HL for index B and
its generation in A. Carry set means the index is past the end. New services
precede older records while retaining their own linked order. RECS prints each
name, version and table address:

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

Save RECS as `recs.asm` and copy it to B with the same `--text` operation.
This PICO-model run leaves GLCD uninstalled during startup, preserving stack
room for COUNT. After TAS builds COUNT.SVC, RECS lists two records at the
addresses shown:

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

RECS lists published records so it omits SHELL.

The permanent PICO record is registered when the ROM console starts at cold
boot. UNLOAD cannot remove it. Its graphics entries use [Appendix
B](appendix-b-rom-services.md)'s claim contract from Chapter 12. GLCD is
omitted too because its service publishes no record.

FIND selects the first matching name with a sufficient version. A newer
qualifying record hides the older one until removal. A newer version below the
client's minimum does not hide an older qualifying record.

RECS stops correctly with two records but its byte INDEX wraps after 255. At
the full 256-record capacity it would repeat from zero. A complete enumerator
must stop after index 255 instead of waiting for a further out-of-range
result.

## Depending on another service

A client can use a table pointer only while the provider remains resident. The
following lifetime rules distinguish transient clients from services:

- A program may keep it until it exits. UNLOAD runs from the CCP after the
  program has ended.
- A service that needs another names the record as a dependency and may keep the
  pointer. The dependency must be installed first so it sits above the dependent
  in memory. Only the lowest service can go so the dependent goes first.
- A service that finds a later-installed provider cannot assume that its pointer
  survives removal. Find the record for each use or validate a cached pointer
  against the registry generation within its wrap limit.

Successful removal increments the byte generation returned by FIND and LIST. A
different value proves removal occurred and invalidates a cached pointer. An
equal generation is reliable only within the wrap limit because the byte
repeats after 256 removals. Installation does not increment it. A cache that
must follow the newest provider needs a new lookup after additions too.

A declared dependency stores a minimum version followed by an eight-byte
padded name, nine bytes in all. TAS takes complete entries under a trailing
DEPS label, counts them and writes them after the image. makeSvc instead takes
its `deps` option. Appendix H specifies both forms. NEEDS.SVC declares COUNT
and binds its table once in INIT:

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

Dependencies are checked before relocation or INIT. NEEDS uses the same name
and version for its declaration and FIND call so the record is already
available at entry. Without COUNT the loader rejects it before INIT. The run
shows that failure followed by valid installation and removal order:

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

UNLOAD removes the lowest service, NEEDS, before COUNT. COUNT's pages cannot
be freed first so NEEDS may retain its table pointer for its own resident
lifetime.
