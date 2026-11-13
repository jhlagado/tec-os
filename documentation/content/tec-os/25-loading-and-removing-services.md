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

A resident service must remain callable after another program loads.
The loader therefore takes its code out of the transient program area
and lowers the program ceiling. The file first loads at `0100h`, like a
COM program. Its header and image then move to whole reserved pages, INIT
runs and validated records become public. Removal must restore the old
owner and registry state before those pages become program memory again.
[Chapter 14](14-write-a-resident-service.md) explains service authoring and
[Appendix H](appendix-h-service-file-format.md) gives the file format.

## The resident entry and its pages

The memory boundary must also support programs that place their stack
at the top of available RAM. Word `0006h` is both the jump target from
`0005h` and the program-memory ceiling. Starter TAS reads it and sets SP
at `010Dh` using `2Ah`, `06h`, `00h`, `F9h`
(`Thorium dbee66a:src/tas/MAIN.ASM:13-14` in its source). Every resident
byte must lie at or above the new ceiling so a downward-growing program
stack moves away from service storage.

Each resident header starts with `JP BENTRY`. The loader points `0006h`
at that page, so a BDOS call still takes the page-zero jump followed by
a direct jump into ROM (`src/loader.asm:337-350`). Added services do not
add dispatch hops. Tests count two jumps with zero, one and two services
and exercise a stack initialised from `0006h`
(`test/svc.test.mjs:973-1031`).

Without installed services, the three-byte stub at `STUBAD` sits directly
below allocation vectors. Every warm boot, `PZINIT` rebuilds `JP BENTRY`
there and writes current `PZTOP` to `0006h` (`src/boot.asm:300-315`,
`src/boot.asm:629-634`). Vector sizes determine the stub's low byte.
Programs must read the full word rather than assume a page boundary.

The first service is allocated below the stub's page. This also removes
the gap between that page boundary and the stub from the TPA. On
the starter card, vectors begin at `B6ECh` and the stub at `B6E9h`. A first
one-page service such as Chapter 14's COUNT costs 489 bytes: 256 for the page
and 233 for the alignment gap. Later services cost whole pages without another
alignment gap. With `GLCD.SVC` as the first service and a possible second
one, the layout is:

| Addresses | What is there |
| --- | --- |
| `B6ECh` up | The allocation vectors, then the resident workspace |
| `B6E9h–B6EBh` | The stub, `JP BENTRY`, the top with no service in |
| `B600h–B6E8h` | 233 bytes no service can use |
| `B300h–B5FFh` | `GLCD.SVC`, three pages. `B300h` holds `JP BENTRY` |
| `B200h–B2FFh` | A second service of one page. `B200h` would hold `JP BENTRY` |
| `0100h` up | The TPA, its top at the word in `0006h` |

Moving the file also changes the header's role. Its 25 bytes first
describe the file and later retain removal state. Completed metadata is
replaced with the previous list heads and direct BDOS entry
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

Offset 8 identifies the next older owner by page. It is not an exact
saved ceiling. `SVCABV` derives the upper page using that owner or the
stub page for zero. `SLTOP` reconstructs `PZTOP` and `0006h` from
`SVCHEAD`, restoring the exact stub address after the final removal
(`src/loader.asm:54-70`, `src/loader.asm:566-588`).

## Page relocation

Reserved addresses vary with the services already loaded. Page-aligned
relocation preserves each address low byte and adds a page delta to its
high byte. A fixup therefore marks only the high byte to adjust. Every
marked byte receives the same delta.

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
from `abi.inc`. Decimal or binary spellings bypass
this scan, so it cannot prove exclusive use of published interfaces
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

Installation begins through the ordinary program reader. Type SVC reaches
`SVCGO`, which calls `LOADCOM` into `DF`, `0100h`, then `SVCLOAD`.
`LOADTOP` records the exclusive end of loaded records rather than the
file's independent byte length (`src/loader.asm:896-906`,
`src/cpm/ccp.asm:625-661`). [Chapter 21](21-from-prompt-to-program.md#program-lookup-and-capacity)
explains the reader and capacity check.

Failures carry two kinds of information. Carry marks failure, `SVCRC`
classifies the loader outcome and `SVCRA` stores INIT status when INIT
caused it. Normally the CCP prints the command with `?`. Quiet startup
requires both the absent-device INIT status and the matching loader
outcome (`src/loader.asm:368-370`, `src/loader.asm:426-429`,
`src/cpm/ccp.asm:403-412`). [Chapter 26](26-startup-inside-the-ccp.md)
explains that exception.

The seven stages below separate tentative work from a committed
reservation. Before moving resident bytes, changes are limited to the
loaded file and scratch. The move lowers `0006h` temporarily while
`PZTOP` retains the old ceiling. Writing `PZTOP` is the final reservation
commit (`src/loader.asm:140-299`, `src/loader.asm:331-370`,
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

Dependencies are checked before the new service can publish anything.
Header byte 2 counts nine-byte entries after the image. `SVCEXT` bounds
each against loaded records. `REGFIND` receives the eight-byte name and
minimum version in C. `EX (SP),HL` keeps the next entry address across
lookup. Missing or insufficient versions reject installation
(`src/loader.asm:196-223`).

### 3. Stack allowances

The next check protects the remaining declared stack allowances. The
loader first bounds the relocation-list extent then subtracts the three
service figures. With no owner it starts from `SVCLIM`. Otherwise it
uses remaining allowances at newest header offset 12. Borrow rejects the
load. Successful subtraction replaces the new header's declared figures
with the remaining amounts (`src/loader.asm:225-258`).

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

The resident move preserves enough state to reverse later publication.
After saving size, the loader copies old `REGHEAD` and `SVCHEAD` into
header offsets 6–8 and writes `JP BENTRY` at zero. `LDIR` moves the
header and image to the selected page. Its final zero B supplies the low
byte of new `0006h`. `PZTOP` still marks the old committed boundary
(`src/loader.asm:331-350`). `SVCBND` derives the new base and exclusive
upper page through the saved owner (`src/loader.asm:566-588`).

### 6. INIT and early exits

`SVCCALL` sets `SVCBSY` to `80h`, reads the callback's relative offset
and adds the resident page to its high byte. It jumps to INIT, which
returns to the instruction after `CALL SVCCALL` on the CCP stack
(`src/loader.asm:365-370`, `src/loader.asm:550-559`).

Warm boot inside INIT restores the earlier ceiling and releases the
tentative pages. It rewrites `0006h` from unchanged
`PZTOP` and clears busy. Restart jumps into released pages fail the
following sweep (`src/boot.asm:141-144`, `src/boot.asm:300-308`,
`src/boot.asm:332-382`). Arbitrary device and BIOS changes are not undone.
A previously installed BIOS hook can still point into released TPA, as
the dangling-hook test records (`test/svc.test.mjs:583-590`). Hook
installation must therefore be last.

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

After INIT returns, record validation precedes publication. HL is the
first proposed record or zero. `SVCBND` supplies base page D and exclusive
upper page E. Carry from INIT starts rollback. Otherwise the loader counts
existing records then walks the proposed chain (`src/loader.asm:368-401`).

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

Publication has separate registry and memory steps. `SVCLK` installs
the first record at `REGHEAD` and links the previous head after the last
proposed record via `SLN`. Zero records leave the registry unchanged.
`SVCCOM` installs the owner page in `SVCHEAD` and commits `PZTOP`.
`SVCSHUT` clears busy. Final flags report success for `SVCRC` zero and
failure for 1 or 2 (`src/loader.asm:482-518`).

## Rollback and retained pages

Failure does not always release the tentative pages. Before the move,
rejection returns carry with `SVCRC` zero. Success also uses zero, so the
code alone is insufficient. After the move, cleanup determines the outcome:

| SVCRC on failure | Outcome | Loader state |
| ---: | --- | --- |
| 0 | Rejected before the resident move | Previous resident state preserved, loaded file may be changed |
| 1 | INIT failed or records were rejected and cleanup completed | Old ceiling restored and restart vectors swept |
| 2 | A RAM BIOS hook remains or REMOVE rejected cleanup | Pages committed without publishing the proposed records |

INIT failure and record rejection require different cleanup. INIT carry
goes straight to `SVCSCAN` because failed INIT must undo its own effects.
Rejected records follow successful INIT, so the loader clears `SVCRA`
and calls REMOVE. The earlier INIT status then cannot be misreported as
the cause. REMOVE carry enters `SVCKEEP` (`src/loader.asm:368-370`,
`src/loader.asm:426-480`).

`SVCSCAN` compares the target page of every one of the seventeen RAM BIOS
entries with the new service's bounds. With no hit, `SVCFRE` clears the
first byte of each claimed restart slot. The loader restores `0006h` from
`PZTOP`, sweeps vectors and reports outcome 1. A hit clears the resident
flags and commits outcome 2. Clearing bit 0 makes that retained service
nonremovable (`src/loader.asm:446-480`, `src/loader.asm:525-540`).

Retained pages have two distinct causes and flag states. REMOVE failure
keeps the flags. A detected BIOS hook clears them. Neither publishes the
proposed record chain. The target scan covers RAM BIOS entries only,
excluding a DRVR table and arbitrary stored pointers. Tests retain BIOS
hook pages across warm boot, reject REMOVE and demonstrate an unscanned
GLVEC pointing into released pages (`test/svc.test.mjs:508-529`,
`test/svc.test.mjs:657-663`).

SERVICES reports reserved owners rather than public interfaces. It
walks `SVCHEAD` while FIND walks `REGHEAD`. A failed retained service can
therefore appear in SERVICES without its proposed interface being findable.
Header offset 8 links the next older owner (`drivers/shellcmd.asm:15-50`,
`src/loader.asm:36`).

## Registry lookup and lifetime

FIND, numbered service 13, takes an eight-byte name at DE and the least
version in B. `SVFND` moves the version to C and clears B for a 256-record
limit. `REGFIND` compares name bytes at offset 2 and the version at offset
10, then returns the table pointer at offset 11. LIST, number 14, takes
an index in B and returns that record's address. Both successful calls
return the generation in A (`src/loader.asm:643-720`).

New records are linked before old ones, so FIND selects the newest
matching name with a sufficient version. Removing that owner exposes the
older match again. The ROM PICO record, `PIREC`, is registered by
`PISTART` as the permanent tail and cannot be removed through UNLOAD
(`src/pico.asm:53-68`, `src/loader.asm:482-504`). The duplicate-name test
checks restoration of the older interface (`test/svc.test.mjs:621-630`).

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

An executable service command first searches installed owners.
`SVCRUN` calls `EXFIND`, counting ready execution records with the enter
bit and matching eight-byte name. A single match enters through `SVCENT`
without reading a file. Multiple matches reject the command. No match
causes installation through `SVCGO`.

If the new execution record has bit 1, `EXFIND` runs again after INIT
sets readiness. Failure to become ready causes `SVCUNL` and rejection
(`src/loader.asm:734-765`, `src/loader.asm:785-833`).

`SVCENT` adds the service's page to the record's entry offset. A carry from
that addition means the entry word was relocated and the command is
rejected. Otherwise `CMDRN1` uses the program-start path
to prepare page zero and the command tail. Entry receives HL at its own
address
(`src/loader.asm:767-780`, `src/cpm/ccp.asm:447-473`).
[Appendix H](appendix-h-service-file-format.md#the-execution-record) gives
the record's layout.

## Removing the newest owner

Removal follows reverse load order because each header saves the exact
previous registry and owner heads. Only the lowest owner can be removed.
Restoring those heads removes its records together without individual
unlinking.

`SVCUNL` rejects a busy loader, a top page unequal to `SVCHEAD` or flags
with bit 0 clear. With no owner, `SVCHEAD` zero cannot match the stub's
page. The zero read from `SVCBSY` supplies L when forming the resident
page address (`src/loader.asm:97-111`).

REMOVE can refuse before any head or ceiling changes. `SVCCALL` runs
the callback and `SVCSHUT` clears busy while preserving carry. A refusal
must leave the service's own state intact. Warm boot or accepted function
47 inside REMOVE also keeps the committed owner and clears busy
(`src/loader.asm:111-114`, `src/boot.asm:141-144`). The function-47 test
still lists that service afterwards (`test/svc.test.mjs:1033-1052`).

Successful removal releases claimed restart slots with `SVCFRE`. A
three-byte `LDIR` restores both heads from header offset 6, removing all
owner records. The adjacent `SVCGEN` byte increments through exchange
and `INC (HL)`. `SLTOP` restores the next owner page or exact stub address
in `PZTOP` and `0006h`. `PZSWP` then resets vectors into released pages
and returns carry clear (`src/loader.asm:115-126`, `src/loader.asm:54-70`).
UNLOAD attempts only this owner, even when it is nonremovable.

Record addresses remain valid only while the provider's pages remain
reserved. Published removal occurs at the CCP, so a running program can
retain an address until exit. A resident client needs a dependency or a
current generation check for longer use. `SVCGEN` is a byte and repeats
after 256 removals. Dependencies require a provider at load time and reverse
owner order prevents removing that older provider first
(`src/ram.asm:376-391`, `src/loader.asm:97-126`, `src/loader.asm:196-223`).
Chapter 14 explains the client contract.

Ordinary warm boot preserves `REGHEAD`, `SVCHEAD` and `PZTOP` outside
`CPMINIT`'s clear. Cold boot clears resident workspace and removes loaded
owners. It can register the ROM PICO record again (`src/ram.asm:364-391`,
`src/boot.asm:61-72`, `src/boot.asm:398-407`, `src/pico.asm:62-65`). The
serial-board reset test ends with both heads empty
(`test/svc.test.mjs:475-487`).

## Checks and service responsibilities

These checks validate declarations and bounds rather than arbitrary
callback effects. The loader checks file extents, entry points, pages,
dependencies, records and aggregate stack figures. Gap-list validation
keeps targets within the header/image extent but cannot establish the
meaning of the patched byte. The PC helper separately rejects header
fixups and nonrelocatable differences (`src/loader.asm:269-299`,
`tools/lib/svc.mjs:66-74`).

`PZSWP` preserves a restart slot only when it holds JP to an address
strictly above `PZTOP`. Other slots receive their defaults. After removal
or rollback, a jump into freed pages fails that comparison. At `0038h`
the EI/RETI default is installed only when no qualifying jump remains
(`src/boot.asm:332-382`). Cold reset clears the old service vectors too.
The tests cover removal, failed INIT, warm boot during INIT
and recognised reset (`test/svc.test.mjs:913-941`,
`test/svc.test.mjs:961-971`).

Header flags reserve restart slots before INIT can install its jumps.
The claim check reads only the first byte. Even a JP into ROM from a
finished program blocks the slot until reset or explicit repair. Claimed
slots are cleared before the sweep regardless of their current target
(`src/loader.asm:306-326`, `src/loader.asm:525-540`). Tests cover
a second claim and clearing a claimed slot whose target was elsewhere
(`test/svc.test.mjs:901-911`, `test/svc.test.mjs:928-949`).

Unclaimed vectors remain the service's cleanup responsibility. A jump
to retained memory can pass the sweep without any header ownership claim.
REMOVE must restore it. Failed INIT never invokes REMOVE, so INIT must
undo changes and disable every interrupt source it enabled. Warm boot
inside INIT can leave such a source active. With a default EI/RETI slot,
interrupts can then repeat without service (`src/loader.asm:368-370`,
`src/boot.asm:139-144`, `src/boot.asm:332-382`).

Stack checks depend on accurate declarations too. The additional limits
are 8 BDOS bytes, 12 BIOS bytes and 6 CCP bytes above no-service use
(`src/tables.asm:139-144`). [Chapter 15](15-state-and-memory.md) separates
base measurements, limits and the reserved quarter-stack margin. The
loader adds declarations rather than measuring callbacks.

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
