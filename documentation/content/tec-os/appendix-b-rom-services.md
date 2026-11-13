---
title: B. The ROM table and hardware services
parent: TEC-OS
nav_order: 102
nav_group: "Reference"
---

# Appendix B. The ROM table and hardware services

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

The eight-byte ROM table at `C003h` has one jump for seventeen numbered
services. Numbers 0–8 control hardware, 9–11 manage volumes, 12 registers a
display driver, 13–14 read the registry, 15 returns the console font and 16
sets the shell hook. The PICO record
provides a separate table of graphics routines. The complete hardware programs
are in Chapter 12, the dispatcher explanation in Chapter 24 and the
resident-service and registry contracts in Chapter 14.

This reference gives each service's inputs, results, status and stack bound.
Host-model costs are given with the build they were measured on, separately
from the source contracts. A stack bound is an allowance for a caller, not a claim that every
path uses that many bytes.

## The ROM table

The inspected application binary interface (ABI) is 5.1. Before calling ABICALL,
a program compares the three bytes at ABITAB with `TNA` and ABIMAJ with exactly
5. A new major may renumber services. A new minor adds service numbers at the
end so code using the 5.0 calls can run on 5.1. The
minor is still 1 although number 16, the shell hook, has been added. A caller
requiring FONT also checks for minor version 1 or later (`src/abi.inc:1-31, 208-213`,
`src/abi.asm:1-14`, `programs/DEMO.ASM:56-72`).

| Address | Bytes | Name | Contents |
| --- | ---: | --- | --- |
| `C003h` | 3 | `ABITAB` | The signature, `TNA` |
| `C006h` | 1 | `ABIMAJ` | The major version, 5 |
| `C007h` | 1 | `ABIMIN` | The minor version, 1 |
| `C008h` | 3 | `ABICALL` | `JP` to the numbered services |

ABIEND is `C00Bh`, eight bytes after ABITAB. The read-only data block follows
the ABI table. ABICALL is a JP into the dispatcher rather than an array of fixed
routine addresses (`src/rom.asm:12-18`, `src/services.asm:24-57`).

## Calling a service

C selects the number. B, DE and HL carry the documented arguments. A is never an
input because selection uses it. Except for FIND and LIST, success returns A = 0
with Z set and carry clear. Failure returns a nonzero status with carry set. What a
refusal leaves changed depends on the service. MOUNT/UNMNT, for example, can have
written or dropped cache lines before refusing the drive change, as their
section explains (`src/abi.inc:35-69`, `src/services.asm:59-67`,
`src/volsvc.asm:211-240, 275-322`).

| Status | `abi.inc` | Meaning |
| ---: | --- | --- |
| 0 | | Success |
| 1 | `TNEBAD` | No such number, an out-of-range argument or a rejected request |
| 2 | `TNENODV` | The device isn't fitted or isn't the console |

Hardware failures and an invalid service number set NZ as well as carry. Volume
and driver failures leave Z undefined so their callers test carry or A.
FIND/LIST use carry and return a generation in A on success
(`src/services.asm:59-67, 519-564`, `src/volsvc.asm:312-322`,
`src/loader.asm:636-732`).

SVTAB holds one word per number. The dispatcher enters that routine with B, DE
and HL restored and the caller's return address next on the stack. A number from
TNCOUNT, 17, upwards returns status 1 with B, DE and HL unchanged
(`src/services.asm:24-57`, `src/tables.asm:95-128`). The
invalid-number path takes 58 T-states and uses no stack below that return
address.

Every numbered call preserves its incoming interrupt state and uses the caller's
stack. IX, IY and the alternate registers are preserved except that MOUNT, UNMNT
and DESC may change IX and the alternates. Treat registers not documented as
results as destroyed (`src/abi.inc:35-69`).

| `C` | Name | `abi.inc` | Takes | Stack bound | T-states |
| ---: | --- | --- | --- | ---: | ---: |
| 0 | `INFO` | `TNINFO` | nothing | 6 | 234 |
| 1 | `DIGIT` | `TNDIGIT` | `HL` → 6 segment bytes | 4 | 20,660 |
| 2 | `LCD` | `TNLCD` | `B` = row, `HL` → 20 characters | 10 | 4,905 |
| 3 | `VIDEO` | `TNVIDEO` | `B` = 1 claim, 0 release | 12 | see the entry |
| 4 | `TONE` | `TNTONE` | `B` = half period, `DE` = half cycles | 4 | see the entry |
| 5 | `JOY` | `TNJOY` | nothing | 4 | 204 |
| 6 | `KEYS` | `TNKEYS` | `HL` → 8 bytes | 4 | 571 |
| 7 | `PUTAT` | `TNPUTAT` | `D` = row, `E` = column, `B` = count, `HL` → characters | 22 | see the entry |
| 8 | `RTC` | `TNRTC` | `B` = 0 read, 1 set, `HL` → 7 bytes | 8 | 6,923 or 7,757 |
| 9 | `MOUNT` | `TNMOUNT` | `B` = drive, `E` = container index | 24 | |
| 10 | `UNMNT` | `TNUNMNT` | `B` = drive | 24 | |
| 11 | `DESC` | `TNDESC` | `E` = container index, `HL` → 32 bytes | 24 | |
| 12 | `DRVR` | `TNDRVR` | `B` = 3 `UC1:`, `HL` = a driver's table | 4 | |
| 13 | `FIND` | `TNFIND` | `DE` → a record's name, `B` = the least version | 8 | |
| 14 | `LIST` | `TNLIST` | `B` = an index | 8 | |
| 15 | `FONT` | `TNFONT` | nothing | 4 | 184 |
| 16 | `SHELL` | `TNSHELL` | `HL` = a shell's table or 0 | 4 | |

The names and bounds come from `src/abi.inc:65-234`. The build's ABI check
compares the fixed table bytes, verifies that the service entries lie in code
and checks INFO's bits. It does not prove every routine's contract. Media
generation publishes the include as `dist/abi.inc` (`tools/build.mjs:140-155`,
`tools/media.mjs:276-283`).

### Costs and depths

The table's stack figures are current source bounds below the service's return
address, including dispatcher use. The dispatcher's temporary pushes are gone
when the selected routine begins so its depth is not added to a routine's
depth. The caller must allow for its own return word, saved registers and
nesting too (`src/services.asm:34-57`).

The cost figures start at the JP at ABICALL and end after the final RET. A CALL
adds 17 T-states. Their model provenance is:

| Figures | Build and method |
| --- | --- |
| Invalid number 58, INFO 234, DIGIT 20,660, LCD 4,905, JOY 204, KEYS 571, RTC read 6,923 and set 7,757, FONT 184 and depth 4 | Model timing and depth on the PICO9918 board |
| TONE totals for four B and DE pairs, matching the formula below | Model timing, and the instruction count |
| DIGIT lit interval 3,348, including DJNZ 3,323 | Port writes traced in the DIGIT run, and the instruction count |
| VIDEO claim 1,210 and releases 217,348/187,588/147,212 | Model timing under the entry's conditions |
| PUTAT PICO cell about 485 and depths 22/18/18/14 | Model cell and depth checks |
| PUTAT GLCD cell about 34,190 | Model timing, a 15-character call against a 1-character one |

No cost was recorded here for services 9–14 and 16.

## The hardware services

Numbers 0–8 are implemented in `src/services.asm`. None calls the BDOS. VCLAIM
holds the PICO claim flag, LCD can clear CONDEV's ROM-word bit and VIDEO release
can reset the selected console's row and column. These are resident workspace
changes, not state stored in a transient program
(`src/services.asm:1-20, 120-230`).

### 0 INFO

Returns B = device bits, DE = ROM product version, L = console columns and H =
console rows. Serial dimensions are both zero. Status is always 0. Stack bound:
6 bytes. Cost: 234 T-states, with no device read. D is
the version's major and E its minor so `0001h` means product version 0.1 rather
than ABI 5.1 (`src/services.asm:68-80`, `tools/build.mjs:28, 64-71`).

| Bit | Value | `abi.inc` | Set when |
| ---: | ---: | --- | --- |
| 0 | `01h` | `HWBMTX` | The matrix keyboard is enabled |
| 1 | `02h` | `HWBPICO` | A PICO9918 answered at cold boot |
| 2 | `04h` | `HWBGLCD` | `GLCD.SVC` is in |
| 3 | `08h` | `HWBRTC` | A DS1302 answered at cold boot |
| 4 | `10h` | `HWBCLM` | The PICO9918 is claimed |
| 7 | `80h` | `HWBWRD` | The ROM's word `GLCD?` is on LCD row 3 |

B combines CONDEV with VCLAIM. The DS1302 cold-boot bit records whether its
seconds register read below `60h`. It is not a full BCD/date validation or a new
probe on each INFO call (`src/abi.inc:249-259`, `src/boot.asm:69-72`,
`src/services.asm:412-438`).

### 1 DIGIT

Takes HL pointing to six segment patterns, leftmost first, and scans once.
Status is always 0. Stack bound: 4 bytes. Cost: 20,660 T-states (`src/services.asm:84-128`).

For each digit it writes the pattern to port `02h` and selects the digit through
port `01h`, from bit 5 for the leftmost to bit 0 for the rightmost. Bit 6
remains high for serial idle. The lit interval is 3,348 T-states, about 0.84 ms at
4 MHz, including 3,323 T-states for a DJNZ count of 256. It turns the digit off
after its interval and all six are off on return. The lit interval comes from
the port writes of a model run, with the DJNZ component counted from the
instructions. It is not a physical brightness or refresh measurement.

### 2 LCD

Takes B = row 0–3 and HL pointing to exactly 20 characters for the 20 × 4 LCD.
Status is 0 on success or 1 for a row above 3, rejected before a write. Stack
bound: 10 bytes. Cost: 4,905 T-states (`src/services.asm:120-157`).

Writing row 3 clears HWBWRD. A later GLCD.SVC installation therefore preserves
the program's replacement text instead of blanking it as the ROM's `GLCD?`
message.

### 3 VIDEO

Takes B = 1 to claim the PICO9918 or 0 to release it. Another B returns status 1
before any device test or claim change. For valid modes, status 2 means no
PICO9918 answered at cold boot. Success returns 0. Stack bound: 12 bytes
(`src/services.asm:161-230`).

A claim with a cursor to remove takes 1,210 T-states, and 298 with the
console elsewhere. A release takes 217,348 with PICO selected at 80 columns,
187,588 with PICO selected at 40 columns and 147,212 with the console
elsewhere. These are
conditional model results rather than a universal release cost.

A claim removes the selected PICO console's cursor and stores HWBCLM in VCLAIM.
While claimed, PICO console output is discarded and its cursor and page-flip
paths do not draw on the chip. The program can use its registers and video
memory (VRAM) through the graphics entries or ports.

Release with no claim returns status 0 without restoring anything. Otherwise it
clears VCLAIM and calls the ROM PICO console's restore routine when that console
started at cold boot. Mode, font and displayed page are restored. If PICO is
selected, release also clears its screen and homes its cursor. With the
Matrix switch disabled the ROM console did not start so release leaves the chip's
programmed state alone; warm boot first writes 80h to its register 1, blanking it
(`src/pico.asm:326-362`). Warm boot releases an active claim before rebuilding
page zero (`src/boot.asm:131-152`, `src/pico.asm:44-68`).

### 4 TONE

Takes B = delay count and DE = half-cycle count. It drives port `01h` bit 7
while holding bit 6 high. Status is always 0. Stack bound: 4 bytes
(`src/services.asm:233-268`).

Ordinary toggle spacing is 16 × B + 51 T-states, with B = 0 meaning 256. For
nonzero DE, the total is DE × (16 × B + 51) + 207 T-states. The model's
times for B = 10 with DE = 100, B = 1 with DE = 1, B = 120 with DE = 400 and
B = 0 with DE = 2 match it exactly. DE = 0 returns
immediately before writing the port. A nonempty tone ends with the speaker off.
A zero-duration call leaves the port untouched.

| Instructions | T-states |
| --- | ---: |
| `XOR $80`, `OUT (DIGPORT),A`, `LD C,B` | 22 |
| `DEC C`, `JR NZ` for `B` rounds, the last not taken | 16 × `B` − 5 |
| `DEC DE`, `LD C,A`, `LD A,D`, `OR E`, `LD A,C` | 22 |
| `JR NZ`, taken | 12 |

The last half cycle is five T-states shorter between its bounding writes. At 4
MHz the ordinary half period gives these calculated frequencies, not
measurements of a physical oscillator:

| `B` | T-states a half cycle | Frequency |
| ---: | ---: | ---: |
| 1 | 67 | 29,851 Hz |
| 10 | 211 | 9,479 Hz |
| 100 | 1,651 | 1,211 Hz |
| 120 | 1,971 | 1,015 Hz |
| 255 | 4,131 | 484 Hz |
| 0 | 4,147 | 482 Hz |

### 5 JOY

Returns B = active joystick lines as 1 bits, from complemented input at port
`FEh` with BC = `F7FEh`. Status is always 0. Stack bound: 4 bytes. Cost: 204
T-states (`src/services.asm:266-284`).

That address also selects matrix row 3. A pressed switch there can appear as a
joystick bit and a joystick line can appear as a matrix key. The retired
diagnostics ROM labelled the bits after MON-3 as `01h` up, `02h` down, `04h`
left, `08h` right, `10h` fire 2, `20h` pin 9, `40h` fire 1 and `80h` fire 3.
Those physical labels remain unconfirmed
(`46be5a4:diag/interact.asm:615-619`).

### 6 KEYS

Takes HL pointing to eight bytes and stores matrix rows 0–7, with a 1 for each
pressed switch. Status is always 0. Stack bound: 4 bytes. Cost: 571
T-states (`src/services.asm:280-295`).

Each input reads port `FEh` with one low bit in the high address byte, from
`FEh` for row 0 to `7Fh` for row 7. KEYS does not test keyboard presence. INFO's
HWBMTX bit reports whether the matrix keyboard is enabled.

### 7 PUTAT

Takes D = row, E = column, B = count and HL pointing to characters. Row and
column are zero-based. It writes through the display's cell routine without
moving the console cursor or using the escape parser. Stack bound: 22 bytes
(`src/services.asm:299-360`).

Status 2 means no usable video console: serial/BAT or PICO both claimed and
selected. These checks precede count and row checks. On an available video
console, B = 0 returns status 0 without reading source bytes or changing the
cursor image. For a nonzero count, the cursor image is removed before checking
the row. A row past the bottom returns 0 without writing. Right-edge clipping
occurs before each source read. A PICO claim leaves PUTAT available on the GLCD
console.

The cursor's stored position remains unchanged. CONST redraws its image when no
character is ready and CONIN while waiting for input
(`src/console.asm:135-156, 226-254`). Bytes `80h–FFh` reach the display as
reverse images of `00h–7Fh` while the ordinary video-console path filters those
high bytes (`src/pico.asm:235-277`, `drivers/glcd.asm:527-560`,
`src/term.asm:39-50`).

Measured depths are 22 bytes on GLCD and 18 on PICO with a cursor to remove,
or 18 and 14 respectively without one. These are measured paths, distinct
from the source's 22-byte bound. A cell along a row costs about 485 T-states
on the 80-column PICO and about 34,190 on GLCD.

### 8 RTC

Takes B = 0 to read the DS1302 into seven bytes at HL or B = 1 to set it from
them. Another B returns status 1 before clock access. Each valid call probes the
clock again and returns status 2 if it does not answer. Success returns 0. Stack
bound: 8 bytes (`src/services.asm:366-508`).

The seven bytes are BCD seconds, minutes, hours, date, month, weekday and year.
Setting first disables write protection and then writes `80h` as the final
control byte to enable it again. A read takes 6,923 T-states and a set 7,757.

## The volume services

Numbers 9–11 use `src/volsvc.asm`. Drives count from 0 for A. Each returns A = 0
with carry clear or TNEBAD with carry. Z is undefined on failure. All three have
a 24-byte source stack bound and may change IX and the alternate registers.
Appendix E defines the 32-byte descriptor (`src/abi.inc:139-169`,
`src/volsvc.asm:155-198, 312-322`).

| Condition | Rejected by |
| --- | --- |
| An index past the table or an unreadable descriptor block | MOUNT, DESC |
| A drive past D | MOUNT, UNMNT |
| A volume already on any drive, including the requested drive | MOUNT |
| A missing slot or one too small for the volume | MOUNT |
| An attempt to leave drive A empty | UNMNT |
| A failed cache flush | MOUNT, UNMNT |

A failed flush leaves the drive mapping unchanged. It may already have written
other dirty blocks. Each line whose write failed is kept dirty for the next
flush, so a rejected operation leaves the cache's changes in place
(`src/volsvc.asm:211-240, 275-284, 360-389`, `src/cache.asm:258-300`).

A format 1.0 card reserves slots only for drives mounted at cold boot. A format
1.1 card reserves a G8M-sized slot for each requested drive, mounted or not. A
later mount must fit that reservation (`src/boot.asm:525-634`,
`src/volsvc.asm:246-265`).

MOUNT and UNMNT flush the card's dirty cache lines before changing a drive. They
reset that drive through BDOS function 37 on the BDOS's own stack so its next
access logs it in from the directory. When MOUNT changes the default drive it
also selects it again through function 14, making functions 27 and 31 report the
new volume immediately. They must be called from outside an active BDOS call.
DESC makes no such BDOS call (`src/volsvc.asm:211-240, 275-345`). The
shell's `CD` uses MOUNT and DESC: it walks the card's descriptors with DESC
and mounts by index (`drivers/shellcd.asm:110-117`, `drivers/shellcd.asm:166-258`).
The starter card has no program of its own that calls these services.

### 9 MOUNT

Takes B = drive 0–3 and E = container index. It mounts that volume in place of
any volume on the selected drive. Status is 0 or TNEBAD. Stack bound: 24 bytes.
A volume already mounted anywhere is refused, including on the same drive
(`src/volsvc.asm:211-240`).

### 10 UNMNT

Takes B = drive 1–3 and removes its mount. Drive A cannot be emptied. Status is
0 or TNEBAD. Stack bound: 24 bytes (`src/volsvc.asm:275-322`).

### 11 DESC

Takes E = container index and HL pointing to 32 destination bytes. It copies the
descriptor and sets byte 14 to the drive on which the volume is currently
mounted or `FFh` for none. Status is 0 or TNEBAD. Stack bound: 24 bytes
(`src/volsvc.asm:182-198, 415-460`, `format/format.json:27-38`).

## A display driver's table

### 12 DRVR

Takes B = 3 for UC1: and HL pointing to its driver table. Success returns A = 0,
carry clear and HL = LINEBUF for the row read/write routines. HL = 0 instead
drops UC1:'s table and returns A = 0 with carry clear and HL destroyed. Stack
bound: 4 bytes (`src/services.asm:519-564`, `src/video.asm:120-197`).

For an installation, TNEBAD with carry means B is not 3, a UC1: table is already
installed or the Matrix switch is disabled. TNENODV means a STARTUP.CMD line
offered the table while the CON: field was CRT:. A drop with B = 3 is accepted
before those installation checks. B = 1 is always refused because CRT:'s table
belongs to the ROM. Failed calls leave the table unchanged and Z undefined.

The table is eight words. Its first six are routines in this order: put, get,
clear to end of line, restore, read row and write row. The seventh handles page
functions and only CRT: calls it so the GLCD table uses 0. The last word stores
columns then rows as bytes (`src/video.asm:129-141`, `drivers/glcd.asm:37-45`).
GLCD.SVC installs from INIT and drops from REMOVE (`drivers/glcd.asm:60-103`).

Dropping the selected mode's table causes the next console call to choose its
console again. Another selected mode and its screen are preserved
(`src/video.asm:168-197`).

## The registry

FIND and LIST read published records without calling BDOS or BIOS. They can
therefore run on the caller's stack within their eight-byte bounds. A record
contains a link word, an eight-byte name, a version byte and a table address: 13
bytes in all (`src/loader.asm:44-46, 636-732`).

FIND examines at most 256 records. LIST's byte index selects 0–255. The loader
admits at most 256 records in total and at most 255 from one new service,
validating their locations before linking the chain
(`src/loader.asm:373-424, 482-497`). Both return the eight-bit SVCGEN on success.
Successful removal increments it and can wrap it from 255 to 0
(`src/loader.asm:97-126, 717-720`). Chapter 14 explains pointer lifetime and
generation checks.

### 13 FIND

Takes DE pointing to an eight-byte space-padded name and B = minimum version. It
returns the newest matching record whose version is at least B, with carry
clear, HL = table address and A = generation. Carry set means none. Stack bound:
8 bytes (`src/loader.asm:636-646, 673-732`).

### 14 LIST

Takes B = index from 0, newest first. It returns carry clear, HL = record
address and A = generation or carry set past the end. Stack bound: 8 bytes
(`src/loader.asm:648-671`).

## The PICO record

When the ROM PICO console starts at cold boot it publishes the permanent
registry tail `PICO`, version 4, in PIBLK. UNLOAD removes resident owners rather
than that tail (`src/pico.asm:19-68`, `src/loader.asm:79-126`). On the starter card's layout in
Appendix C the table is at `BBC4h`, where Chapter 14's RECS run finds it. That is a layout
coordinate, not a fixed ABI address. Programs obtain the table through FIND. Its
first eight words are the display table described under DRVR, followed by five
entry words:

| Offset | `abi.inc` | Takes | Effect |
| ---: | --- | --- | --- |
| 16 | `PICOREG` | `B` = register, `A` = value | Writes the register |
| 18 | `PICOFIL` | `HL` = VRAM address, `DE` = count, `A` = value | Fills VRAM |
| 20 | `PICOWR` | `HL` = VRAM address, `DE` = source, `BC` = count | Copies RAM to VRAM |
| 22 | `PICORD` | `HL` = VRAM address, `DE` = destination, `BC` = count | Copies VRAM to RAM |
| 24 | `PICOWID` | `A` = 80, 40 or 32 | Sets the console's width to `A` |

The first four entries require the caller to hold VIDEO's claim. They perform no
claim or argument validation and may change AF, BC, DE and HL. Zero count
transfers no data bytes, though the address-setup routine still writes the
control port (`src/abi.inc:261-274`, `src/pico.asm:295-429`).

PICOWID was added in record version 3 and is the entry used by CON PICO 40. It
requires an unclaimed chip. Any other width or an active claim returns carry
with no width change. Success changes the saved width and marks selected CRT:
for reselection so the next console call clears its screen at that width
(`src/abi.inc:276-286`, `src/pico.asm:70-139`).

Debugger offsets from the table are PICOVRB = 36 for the record version, PICOTPD
= 41 for the drawn page and PICOTPS = 42 for the shown page
(`src/ram.asm:75-99`). These are state bytes rather than routine entries.

Version 4 adds no entry and keeps these offsets. It reserves VRAM
`3000h–37FFh` from console writes at every width, though those pixels need not
survive a width change. While the caller holds the claim, a PICOREG write to
register 1 records its interrupt-enable bit. Mode restoration and release keep
that bit and warm boot clears it. Writes made directly to the ports are not
recorded. A client that needs only the width can still accept version 3
(`src/abi.inc:276-344`, `src/pico.asm:201-236`, `src/pico.asm:302-362`).

VTEST finds a version-2-or-later PICO
record, claims the chip, writes four bytes to VRAM, reads them back, releases it
and prints the buffer. Its ENTRY helper reads a word pointer, unlike COUNT's JP
entry in Chapter 14. EX (SP),HL followed by RET enters that routine with HL
restored. Chapter 24 explains the same dispatch technique. HWLIB.ASM comes from
Chapter 12. The program performs no removal so it does not recheck the saved
table's generation before these calls.

```asm
; VTEST: write four bytes to the PICO9918's VRAM and read them back through
; the graphics entries of the ROM's PICO9918 console.
BDOS	EQU	$0005
VRAM	EQU	$3000		; an address the text modes leave alone
%INCLUDE "ABI.INC"

	ORG	$0100
	CALL	CHKHW		; the numbers below hold only on ABI 5
	JP	NZ,NOTHW
	LD	DE,NAME		; the record's eight-byte name
	LD	B,2		; version 2 has the graphics entries
	LD	C,TNFIND	; the registry's find
	CALL	ABICALL
	LD	DE,NONE
	JP	C,SAY		; carry: no such record, so print and end
	LD	(TABLE),HL	; good until this program exits
	LD	B,1		; claim the PICO9918
	LD	C,TNVIDEO
	CALL	ABICALL
	LD	HL,VRAM		; PICOWR: BC bytes from DE to VRAM at HL
	LD	DE,DATA		; the bytes to write
	LD	BC,4
	LD	A,PICOWR	; the entry's offset in the table
	CALL	ENTRY
	LD	HL,VRAM		; PICORD: BC bytes from VRAM at HL to DE
	LD	DE,BACK		; where to put them
	LD	BC,4
	LD	A,PICORD	; the entry's offset in the table
	CALL	ENTRY
	LD	B,0		; give it back: the console's screen returns
	LD	C,TNVIDEO
	CALL	ABICALL
	LD	DE,BACK		; the four bytes, as text
	JP	SAY		; prints and ends the program

; Run the table's entry at offset A, with its arguments in BC, DE and HL.
; Changes what the entry changes.
ENTRY:	PUSH	HL		; the entry's HL
	PUSH	DE		; and its DE
	LD	E,A		; DE = the offset
	LD	D,0
	LD	HL,(TABLE)
	ADD	HL,DE		; HL = the entry's word
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	EX	DE,HL		; HL = the routine
	POP	DE		; the entry's DE back
	EX	(SP),HL		; the routine goes on the stack, HL comes back
	RET			; a jump to it, with HL free

TABLE:	DW	0		; the table, once found
NAME:	DB	"PICO    "	; the record to find
NONE:	DB	"no PICO "	; printed when there is no record
	DB	"record"
	DB	13,10,"$"
DATA:	DB	"VRAM"		; the four bytes to write
BACK:	DB	"????"		; PICORD fills these four
	DB	13,10,"$"
%INCLUDE "HWLIB.ASM"
```

This host-model VRAM round trip, not a physical-board result, obtains the
PICO record from the ROM console. The recipe assumes Chapter 14's `svc.img`,
ABI.INC and HWLIB.ASM preparation:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card svc.img --board pico B: 'TAS VTEST' VTEST. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>B:
B:WORK>TAS VTEST
VTEST.COM written

B:WORK>VTEST
VRAM

B:WORK>
```

Without a started ROM PICO console there is no PICO record. The existing program
then takes its `no PICO record` branch, including on serial-only configuration
or a PICO board with the Matrix switch disabled. A program using such a chip
directly still claims it before writing its ports.

## The font

### 15 FONT

Returns HL = the ROM console font address. Status is always 0. Stack bound: 4
bytes. Cost: 184 T-states and a depth of 4 bytes
(`src/services.asm:510-517`, `src/abi.inc:208-213`).

The selected font is TEC Compact from `format/font5x7.txt`. It contains 96
characters from `20h`, eight bytes each, top row first. Each row's five pixels
occupy bits 7–3 (`tools/lib/font.mjs:9-35`). The source package checks the
selected font and retained notices (`tools/lib/font-package.mjs:8-21`).

The retained sources and modifications are recorded in
`format/FONT-NOTICES.txt`. The original TEC-OS bitmap's upstream authorship
remains unresolved (`format/FONT-NOTICES.txt:33-47`).

This build puts FONT at `C193h`. Programs use the returned
address rather than embedding that coordinate. The PICO console uses the FONT
label and GLCD.SVC obtains the
address through this call during INIT (`src/pico.asm:235-277`,
`drivers/glcd.asm:60-64`). On ABI 5.0 the number is out of range and returns
status 1 so this GLCD driver's INIT refuses installation there.

## The shell hook

### 16 SHELL

`TNSHELL` sets the shell hook. HL is a shell's table of four words, `LINE`,
`PAGE`, `HREC` and `HSTORE`, or 0 to give the prompt back to the ROM's
command processor. A table must lie in a resident's pages, at or above
`PZTOP`'s page and below the stub's page, and must not cross a page, so L is
at most `F8h`. Any other nonzero HL returns `TNEBAD`, status 1, with carry and
the hook unchanged. Otherwise it returns HL = the table it replaced, 0 for
none, with A = 0 and carry clear. BC, IX and IY are kept and DE changes. It
makes no BDOS call (`src/services.asm:566-601`, `src/abi.inc:226`,
`docs/shell.md:280-292`). Numbers from `TNCOUNT`, 17, upwards return status 1
(`src/abi.inc:228-236`). Chapter 21 describes the hook's use, and
`SHELL.SVC` is its one caller on the starter card.
