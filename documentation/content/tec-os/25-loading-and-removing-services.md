---
title: Loading and removing services
parent: TEC-OS
nav_order: 25
nav_group: "Inside TEC-OS"
---

# 25. Loading and removing services

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A service file first loads at `0100h` like a COM program. The loader moves
its header and image to whole pages below the program ceiling, runs INIT
and publishes the returned records. Removal reverses the saved owner and
registry links. This chapter follows those changes through the commit and
failure paths. [Chapter 14](14-write-a-resident-service.md) explains writing
a service and [Appendix H](appendix-h-service-file-format.md) gives the
complete file format.

## The resident entry and its pages

The word at `0006h` is both the target of the jump at `0005h` and the top
of program memory. A program can size its memory or initialise SP from
that word. The starter card's TAS has `LD HL,($0006)` and `LD SP,HL` at `010Dh`, the
bytes `2Ah`, `06h`, `00h` and `F9h` (`Thorium dbee66a:src/tas/MAIN.ASM:13-14`
in its source).
Service storage must therefore begin at the new ceiling, with every resident
byte at or above it. A downward-growing
program stack then grows away from the service.

The loader places `JP BENTRY` at offset zero of each resident header and
sets `0006h` to that page's start. A BDOS call goes through the page-zero
jump and this jump directly into the ROM, regardless of the number of
services. It does not traverse their code
(`src/loader.asm:337-350`). The tests exercise a stack set from `0006h` with multiple services and
count two jumps with zero, one and two services (`test/svc.test.mjs:973-1031`).

With no service installed, `STUBAD` identifies a three-byte BDOS entry stub
immediately below the allocation vectors. `PZINIT` rewrites its `JP BENTRY` and
puts the current `PZTOP` at `0006h` on every warm boot (`src/boot.asm:300-315`,
`src/boot.asm:629-634`). The stub's low byte depends on the card's allocation
vectors. A program must read the word rather than assume page alignment.

The first service is allocated below the stub's page so the unused bytes between
that page boundary and the stub also leave the transient program area (TPA). On
the starter card, vectors begin at `B6ECh` and the stub at `B6E9h`. A first
one-page service such as Chapter 14's COUNT costs 489 bytes: 256 for the page
and 233 for the alignment gap. Later services cost whole pages without another
alignment gap. With `GLCD.SVC` as the first service, and a possible second
one, the layout is:

| Addresses | What is there |
| --- | --- |
| `B6ECh` up | The allocation vectors, then the resident workspace |
| `B6E9h–B6EBh` | The stub, `JP BENTRY`, the top with no service in |
| `B600h–B6E8h` | 233 bytes no service can use |
| `B300h–B5FFh` | `GLCD.SVC`, three pages. `B300h` holds `JP BENTRY` |
| `B200h–B2FFh` | A second service of one page. `B200h` would hold `JP BENTRY` |
| `0100h` up | The TPA, its top at the word in `0006h` |

The file header and resident header occupy the same 25 bytes but several
fields change meaning during installation. The loader replaces completed
file metadata with the two old list heads and the direct BDOS entry
(`src/loader.asm:28-46`, `src/loader.asm:331-350`):

| Offset | Bytes | In memory |
| ---: | ---: | --- |
| 0 | 3 | `JP BENTRY` |
| 3 | 1 | The flags or 0 if a hook kept the pages |
| 4 | 2 | `REMOVE`, from the header's start |
| 6 | 2 | The registry's head before this service |
| 8 | 1 | The owner before it: the next older service's page, 0 at the last |
| 9 | 3 | Unused |
| 12 | 3 | Each stack's room left below this service |
| 15 | 2 | Unused |
| 17 | 8 | The name |

The saved owner byte identifies the next older service, not a copy of the old
ceiling. `SVCABV` converts it to the page above this service, using the stub's
page for owner zero. `SLTOP` reconstructs `PZTOP` and `0006h` from `SVCHEAD` or
restores the exact stub address when no owner remains (`src/loader.asm:54-70`,
`src/loader.asm:566-588`).

## Page relocation

Service addresses depend on the pages already occupied. A page-aligned move
keeps every address's low byte and adds the destination page to its high
byte. A fixup therefore identifies a high byte rather than a full word.
The loader applies the same page delta to each marked byte.

The PC helper `makeSvc` assembles with TAS at `0100h` and `0200h`, as a CP/M
PRL file is made. `assembleAt` rewrites an indented `ORG $0100` line that has
nothing after it for the second assembly. Missing INIT or REMOVE labels
produce `INIT and REMOVE required`. Different assembly lengths also fail. The
file holds the image for page zero with its 25-byte header: each fixup's byte
one less than at `0100h` (`tools/lib/prl.mjs:33-53`,
`tools/lib/svc.mjs:101-140`).

`fixupsOf` ignores equal bytes and accepts a changed byte only when its second
value is the first plus one modulo 256. A different change produces
`byte N is not relocatable`. A changed header byte is rejected separately.
Expressions such as half or twice a relocatable address can violate that rule.
An absolute external address such as `0005h` remains equal and is not marked so
its BDOS call survives relocation (`tools/lib/svc.mjs:66-74`).

The interface check rejects explicit ROM addresses written in the matched
hexadecimal forms, such as `$C000` or `0C000h`. It requires interface names
from `abi.inc`. The scan does not detect decimal or binary spellings and
is not a proof that the program uses only published interfaces
(`tools/lib/svc.mjs:17-25`).

Fixups are numbered from the image after the header. The writer appends
dependencies and then a gap list. Its first gap is measured from the byte
before the image. A byte of 255 advances without patching and longer gaps
use repeated 255 bytes. A gap exactly divisible by 255 needs a final zero
byte to apply the fixup at that position
(`tools/lib/svc.mjs:36-47`, `tools/lib/svc.mjs:156-181`). Appendix H describes
the bytes. TAS produces the same file format on the card, as Chapter 14 explains.
The two writers fill different header fields, as Appendix H specifies
(`Thorium dbee66a:src/tas/DRV.ASM:92-120`).

## Installation before commit

The CCP sends a command with type SVC to `SVCGO`. It calls `LOADCOM` to
read the file into `DF`, `0100h`, then calls `SVCLOAD`. `LOADTOP` is the
exclusive end of the records read, not an independently stored file-byte
length (`src/loader.asm:896-906`, `src/cpm/ccp.asm:625-661`).
[Chapter 21](21-from-prompt-to-program.md#program-lookup-and-capacity)
explains the read and its capacity limit.

Carry reports failure. `SVCRC` distinguishes the loader outcomes and
`SVCRA` stores INIT's returned status when that status is the cause.
The CCP normally prints the command name with `?`. The quiet startup
exception requires INIT's absent-device status and the appropriate loader
outcome (`src/loader.asm:368-370`, `src/loader.asm:426-429`,
`src/cpm/ccp.asm:403-412`).
[Chapter 26](26-startup-inside-the-ccp.md) explains that exception.

The loader has seven stages. Before the resident move its writes are
confined to the loaded file and loader scratch. The move temporarily lowers
`0006h` but leaves `PZTOP` unchanged. The final write to `PZTOP` commits
the reservation (`src/loader.asm:140-299`, `src/loader.asm:331-370`,
`src/loader.asm:499-518`).

### 1. File and page validation

`SVCLOAD` clears `SVCRC` and rejects a nested load while `SVCBSY` is set.
It checks the leading D and `SVCFMT`, currently 4. `SVCEXT` checks the
header-plus-image size against `LOADTOP`. `SVCIN` requires both INIT and
REMOVE offsets to lie from byte 25 through the last image byte
(`src/loader.asm:140-168`, `src/loader.asm:609-634`, `src/abi.inc:247-252`).

The loader adds the requested extra memory to the header/image size,
subtracts one and takes the high byte as the page count minus one. It
subtracts that count from the page below `PZTOP`. Overflow, borrow or a
base below `8000h` rejects the load. The resulting page is stored in
`SLDL` as the relocation delta (`src/loader.asm:183-195`). With no other service, COUNT's 100 bytes below `B6E9h`
select page `B5h`.

### 2. Dependencies

The byte at offset 2 counts nine-byte dependencies after the image.
`SVCEXT` checks each entry against the records read. The loader passes
its eight-byte name to `REGFIND` with the least version in C. The next
entry's address remains on the stack through `EX (SP),HL`. A missing or
too-old record rejects the load (`src/loader.asm:196-223`). A dependency
is resolved before the new service has any published records.

### 3. Stack allowances

The relocation-list extent is checked before its bytes are read. The loader
then subtracts the service's three declared stack figures from the room
remaining. With no service present it uses `SVCLIM`. Otherwise it uses
offset 12 of the newest resident header. A borrow rejects the load.
Each successful subtraction overwrites the new header's figure with the
remaining allowance (`src/loader.asm:225-258`).

The order is BDOS, BIOS and CCP. For COUNT loaded first, the limits 8, 12
and 6 less its declarations of 2 each leave `06h`, `0Ah` and `04h` at
`B50Ch`. The loader stores those remaining values in the resident
header instead of maintaining another total.

### 4. Fixups in the loaded file

Relocation runs in the file buffer at `0100h`. BC counts list bytes and HL
begins at `DF+DHLEN-1`, `0118h`. Each gap advances HL. The loader requires the
resulting offset to remain below the header/image size, including when the gap
is 255. A 255 skips the patch while other bytes add `SLDL` to the byte addressed
by HL. A rejected list can leave the loaded file partly relocated
(`src/loader.asm:260-299`).

In `GLCD.SVC` the driver table begins with `00F2h`, `014Dh` and `0152h`.
Installation at `B300h` changes them to `B3F2h`, `B44Dh` and `B452h` at
`B319h`. Its 767 header/image bytes occupy three pages. With the 233-byte
alignment gap, the TPA falls from 46,569 to 45,568 bytes. SERVICES, the shell's command, counts whole reserved pages, including unused
bytes in the final page (`drivers/shellcmd.asm:15-50`).

The PICO-plus-GLCD startup case has another outcome. With CRT already
selected, DRVR rejected the GLCD INIT's table with `TNENODV`. The failed load
returned `SVCRC` 1, freed its pages and passed quietly. The TPA stayed as the
shell had left it, and SERVICES, the shell's, listed only the shell:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --board pico SERVICES. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>SERVICES
SHELL 15
A:SYSTEM>
```

A successful typed GLCD installation while PICO is active is a different
path: the active PICO console remains selected (`src/loader.asm:901-922`).

### 5. Restart claims and the resident move

Bits 1 to 7 of the flags claim RST 1 through RST 7. Before moving the
image, `SVCMOV` reads the first byte of every claimed slot at `0008h`
through `0038h`. An existing JP rejects the load with carry and `SVCRC`
zero (`src/loader.asm:306-326`).

The loader saves the size before replacing file fields. It copies the old
`REGHEAD` and `SVCHEAD`, three bytes, into header offsets 6 through 8 and
writes `JP BENTRY` at offset zero. `LDIR` then moves the header and image
to the selected page. The zero left in B supplies the low byte of the
new `0006h` word. `PZTOP` still describes the previously committed ceiling
(`src/loader.asm:331-350`). `SVCBND` obtains the new base and upper page
bound through the saved owner (`src/loader.asm:566-588`).

### 6. INIT and early exits

`SVCCALL` sets `SVCBSY` to `80h`, reads the callback's relative offset
and adds the resident page to its high byte. It jumps to INIT, which
returns to the instruction after `CALL SVCCALL` on the CCP stack
(`src/loader.asm:365-370`, `src/loader.asm:550-559`).

A warm boot during INIT republishes the unchanged `PZTOP` at `0006h` and
clears the busy window. The new pages return to program memory and restart
vectors into those pages fail the subsequent sweep
(`src/boot.asm:141-144`, `src/boot.asm:300-308`, `src/boot.asm:332-382`).
That is ceiling recovery, not an undo of arbitrary device or BIOS changes.
A BIOS hook already installed by INIT can point into the released TPA.
A test records that dangling-hook outcome
(`test/svc.test.mjs:583-590`). Hooks therefore go last.

An accepted function 47 call from INIT reaches the same warm boot. Its
replacement line remains subject to the failed-flush cancellation explained
in [Chapter 13](13-results-and-command-chains.md)
(`src/cpm/bdos.asm:85-95`, `src/cache.asm:634-640`). The tests
also cover a later successful load after INIT's warm boot and function 47
(`test/svc.test.mjs:554-567`, `test/svc.test.mjs:1033-1041`).
A reset can recognise a hung INIT's temporary ceiling because `RSLCAP`
checks the stub and valid page range without comparing `0006h` to `PZTOP`
(`src/boot.asm:154-212`).

### 7. Records and reservation commit

INIT returns its first record in HL or zero for no records. `SVCBND`
sets D to the base page and E to the exclusive upper page. On INIT carry
the loader enters rollback. Otherwise it counts the existing registry and
walks the proposed chain (`src/loader.asm:368-401`).

For every proposed record, `SVCCK` checks the first byte and the last of
its thirteen bytes. The final byte is also the table pointer's high byte,
which must identify a page inside the service. Every nonzero next link
is checked on the next iteration. Page comparisons allow records anywhere
inside the reserved pages, including extra storage
(`src/loader.asm:401-424`, `src/loader.asm:594-602`). They do not validate
the contents or length of the entry table.

The registry can hold at most 256 records. An empty registry permits one
service to add 255. With N existing records, a new service can add at most
256 minus N, still subject to the 255-record per-service limit. The
counter and link checks reject an excessive or cyclic proposed chain
(`src/loader.asm:371-424`). The PICO case loads 128 and then
127 service records, leaving the permanent PICO record at position 255.
A second group of 128 instead exceeds the total
(`test/svc.test.mjs:255-305`).

`SVCLK` publishes the proposed first record at `REGHEAD` and attaches the
previous head to the last record's link held through `SLN`. A zero first
record leaves the registry alone. `SVCCOM` sets `SVCHEAD` to the new page
and writes `PZTOP`: the reservation commit. `SVCSHUT` clears the busy
window. The final comparison and complemented carry return success for
`SVCRC` zero or failure for 1 and 2 (`src/loader.asm:482-518`).

## Rollback and retained pages

A rejection before the move returns carry with `SVCRC` zero. Zero also occurs on
a successful load so carry must be read with it. After the move the loader
distinguishes a clean release from a reservation retained for unsafe or
incomplete cleanup:

| SVCRC on failure | Outcome | Loader state |
| ---: | --- | --- |
| 0 | Rejected before the resident move | Previous resident state preserved, loaded file may be changed |
| 1 | INIT failed or records were rejected and cleanup completed | Old ceiling restored and restart vectors swept |
| 2 | A RAM BIOS hook remains or REMOVE rejected cleanup | Pages committed without publishing the proposed records |

INIT carry goes straight to `SVCSCAN`: the failed-INIT contract requires
cleanup before returning carry. A rejected record instead clears `SVCRA` and calls
REMOVE to undo a successful INIT. This prevents INIT's earlier status from
being reported as the cause of record rejection. REMOVE carry takes
`SVCKEEP` directly (`src/loader.asm:368-370`, `src/loader.asm:426-480`).

`SVCSCAN` compares the target page of every one of the seventeen RAM BIOS
entries with the new service's bounds. With no hit, `SVCFRE` clears the
first byte of each claimed restart slot. The loader restores `0006h` from
`PZTOP`, sweeps vectors and reports outcome 1. A hit clears the resident
flags and commits outcome 2. Clearing bit 0 makes that retained service
nonremovable (`src/loader.asm:446-480`, `src/loader.asm:525-540`).

These are two distinct retained-page paths. A REMOVE failure retains its flags
while a detected BIOS hook clears them. Neither path publishes the new record
chain. The scan covers only RAM BIOS targets, not a table registered through
DRVR or every pointer that INIT could have written. The tests include
retained BIOS-hook pages across warm boot, REMOVE failure and an unscanned GLVEC
pointer after pages were released (`test/svc.test.mjs:508-529`,
`test/svc.test.mjs:657-663`).

SERVICES walks owners from `SVCHEAD`, not published records from `REGHEAD`.
A retained failed service can therefore appear in SERVICES while FIND
cannot locate its proposed interface. Offset 8 links each owner to the
next older page (`drivers/shellcmd.asm:15-50`, `src/loader.asm:36`).

## Registry lookup and lifetime

FIND, numbered service 13, takes an eight-byte name at DE and the least
version in B. `SVFND` moves the version to C and clears B for a 256-record
limit. `REGFIND` compares name bytes at offset 2 and the version at offset
10, then returns the table pointer at offset 11. LIST, number 14, takes
an index in B and returns that record's address. Both successful calls
return the generation in A (`src/loader.asm:643-720`).

New records precede older ones. FIND therefore returns the newest matching
name with a sufficient version. Removing that owner exposes an older
match. When the ROM PICO console starts, `PISTART` puts `PIREC` at the
registry's permanent tail before any loaded service. UNLOAD cannot remove
that ROM record (`src/pico.asm:53-68`, `src/loader.asm:482-504`). The
duplicate-name test checks the older interface becoming visible
again (`test/svc.test.mjs:621-630`).

FIND's walk is bounded at 256 records. LIST's byte index also bounds its
traversal, even after a program corrupts links into a cycle. `REGFIND` saves
three register pairs. An internal call adds its two-byte return word to those
six bytes. The application binary interface (ABI) gives FIND and LIST an
eight-byte bound below the public caller's return address, including dispatcher
use (`src/loader.asm:654-732`, `src/abi.inc:185-206`).

The count before installation is bounded too. `SVCNT` decrements B for
links beyond the first and rejects when that limit reaches zero. A corrupted
cycle cannot keep this current loop running indefinitely
(`src/loader.asm:380-395`).
The client-cycle test exercises FIND and LIST, not a load (`test/svc.test.mjs:665-673`).

There is no numbered operation to remove a record. Number 17 is beyond the
last, 16, the shell hook, and returns carry from dispatch. Proposed records become visible only after `SVCLK`
so INIT cannot find its own newly proposed record through FIND
(`src/services.asm:34-38`, `src/loader.asm:482-497`). Tests cover
both boundaries (`test/svc.test.mjs:468-473`,
`test/svc.test.mjs:546-552`).

## Entering an installed service

A service command can also enter the service. `SVCRUN`
first calls `EXFIND`, which walks the owner list from `SVCHEAD` and counts
the services whose ready execution record has its enter bit set and holds the
command's eight-byte name. With one match `SVCENT` enters it with no file
read. With two or more the command is rejected. With none `SVCGO` installs
the file as this chapter describes. If the new service's record has bit 1,
`EXFIND` runs again and the service is entered once its INIT has set it
ready. A service that never became ready is removed with `SVCUNL` and the
command is rejected (`src/loader.asm:734-765`,
`src/loader.asm:785-833`).

`SVCENT` adds the service's page to the record's entry offset. A carry from
that addition means the entry word was relocated, and the command is
rejected. Otherwise the address goes to `CMDRN1`, the path that starts a
`.COM`, so page zero and the tail are prepared as for a program and the
entry is called with HL at its own address
(`src/loader.asm:767-780`, `src/cpm/ccp.asm:447-473`).
[Appendix H](appendix-h-service-file-format.md#the-execution-record) gives
the record's layout.

## Removing the newest owner

Only the lowest owner can be removed. Its header saves exactly the registry and
owner heads from before its load so reversing loads in order restores both lists
without unlinking records individually.

`SVCUNL` rejects a busy loader, a top page unequal to `SVCHEAD` or flags
with bit 0 clear. With no owner, `SVCHEAD` zero cannot match the stub's
page. The zero read from `SVCBSY` supplies L when forming the resident
page address (`src/loader.asm:97-111`).

`SVCCALL` runs REMOVE and `SVCSHUT` clears busy without changing its carry.
REMOVE failure returns before the loader changes the heads or ceiling.
The callback must preserve its own state on that refusal. A warm boot or
accepted function 47 inside REMOVE also leaves the committed owner in
place and clears busy (`src/loader.asm:111-114`, `src/boot.asm:141-144`).
The function-47 test keeps that service listed
(`test/svc.test.mjs:1033-1052`).

On success `SVCFRE` releases claimed restart slots. A three-byte `LDIR`
restores `REGHEAD` and `SVCHEAD` from header offset 6, removing all of
that owner's records at once. The following byte is `SVCGEN`, incremented
through an exchange and `INC (HL)`. `SLTOP` restores the next owner page
or the exact stub address to `PZTOP` and `0006h`. Finally `PZSWP` resets
vectors into the released pages and returns carry clear
(`src/loader.asm:115-126`, `src/loader.asm:54-70`). UNLOAD attempts this
owner only, never skipping a nonremovable newest service.

`SVCGEN` is one byte and repeats after 256 removals. Through the published
interface removal happens at the CCP so a running program can retain a record
address until exit. A resident service retaining it longer must check the
current generation or declare the provider as a dependency. The dependency
prevents loading without its provider and the owner order prevents removing that
older provider first (`src/ram.asm:376-391`, `src/loader.asm:97-126`,
`src/loader.asm:196-223`). Chapter 14 explains the client-side dependency
contract.

Warm boot preserves `REGHEAD`, `SVCHEAD` and `PZTOP` outside the range
cleared by `CPMINIT`. Cold boot clears resident workspace and removes
loaded owners. A ROM PICO record can be registered again during that cold
boot (`src/ram.asm:364-391`, `src/boot.asm:61-72`,
`src/boot.asm:398-407`, `src/pico.asm:62-65`). The serial-board
reset test leaves both heads empty (`test/svc.test.mjs:475-487`).

## Checks and service responsibilities

The loader validates declared extents, entries, page bounds, dependencies,
records and aggregate stack figures. It cannot infer all the effects of
arbitrary Z80 code from those fields. Its gap-list checks bound the target
within the header/image extent, not the meaning of the byte being patched.
The PC helper separately rejects header fixups and nonrelocatable differences
(`src/loader.asm:269-299`, `tools/lib/svc.mjs:66-74`).

`PZSWP` preserves a restart slot only when it holds JP to an address
strictly above `PZTOP`. Other slots receive their defaults. After removal
or rollback, a jump into freed pages fails that comparison. At `0038h`
the EI/RETI default is installed only when no qualifying jump remains
(`src/boot.asm:332-382`). Cold reset clears the old service vectors too.
The tests cover removal, failed INIT, warm boot during INIT
and recognised reset (`test/svc.test.mjs:913-941`,
`test/svc.test.mjs:961-971`).

Header flags reserve restart slots before INIT can install its jumps.
The claim check reads only the first byte: even a JP into ROM left by a
finished program blocks that slot until reset or explicit repair. Claimed
slots are cleared before the sweep regardless of their current target
(`src/loader.asm:306-326`, `src/loader.asm:525-540`). Tests cover
a second claim and clearing a claimed slot whose target was elsewhere
(`test/svc.test.mjs:901-911`, `test/svc.test.mjs:928-949`).

An unclaimed vector is not reserved by that flag check. A jump to retained
memory may pass the sweep even though the loader has no ownership claim for it.
REMOVE must restore such changes. A failed INIT runs no REMOVE so INIT must undo
its own changes and disable any interrupt source it started. Warm boot during
INIT can leave that device source enabled. Under a default EI/RETI vector an
active interrupt source can repeat without being serviced
(`src/loader.asm:368-370`, `src/boot.asm:139-144`, `src/boot.asm:332-382`).

The three stack limits are 8, 12 and 6 bytes for BDOS, BIOS and CCP,
counted above their no-service base use (`src/tables.asm:139-144`).
[Chapter 15](15-state-and-memory.md) distinguishes the base
measurements, limits and reserved quarter-stack margin. The loader sums
header declarations rather than measuring a callback's use.

GLCD declares 2, 0 and 6 bytes, taking the whole CCP
allowance (`drivers/glcd.asm:31-35`). COUNT's additional 2 then cannot
fit. `SHELL.SVC` declares 6, 0 and 0, so after the starter card's startup
the shell and GLCD have spent the BDOS allowance as well
(`drivers/shell.asm:39-41`). With PICO active the startup GLCD installation
fails quietly, leaving 2 BDOS bytes and the whole CCP allowance for COUNT. The ROM PICO console is part of the base,
not another loaded service.
The stack-watch test declares 2 while using 6 and still
loads: the arithmetic check cannot detect the understated use
(`test/svc.test.mjs:795-822`).
