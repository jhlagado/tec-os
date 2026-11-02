# Appendix A. BDOS functions

Checked against TEC-OS 08da4d6.

This appendix lists each BDOS function TEC-OS has, from 0 to 40 and then 47,
50 and 108: the registers it takes, what it returns, and where it differs from
CP/M 2.2. Chapter 16 describes the mechanism behind them.

## Calling a function

A program loads the function's number into `C` and its argument into `E` or
`DE`, and calls `0005h`. The BDOS returns its result in `HL`, with the low
byte in `A` as well and the high byte in `B` (`src/cpm/bdos.asm:119-130`). A
function that returns a byte has 0 in `H` and `B`; one that returns nothing
returns 0. No other register is kept, as in CP/M 2.2. The call uses two bytes
of the program's stack, for its return address: the BDOS runs on its own
54-byte stack (`src/cpm/bdos.asm:79-82`, `src/layout.asm:80`).

A function that takes an FCB, a 36-byte file control block whose layout
Chapter 16 gives, works on the drive in its first byte: 0 for the default
drive, 1 to 16 for A to P. The BDOS selects that drive before the function
runs, for functions 15, 16, 17, 19 to 23, 30, 33 to 35 and 40
(`src/data3.asm:84`, `src/cpm/bdos.asm:100-114`). A `?` in the drive byte is
allowed only for function 17.

A function that cannot be carried out at all prints one of the BDOS's errors,
waits for a key and ends the program by warm boot, whatever the key; it does
not return (`src/cpm/bdos.asm:2404-2441`). The errors are:

- `Bdos Err On d: Select`, for a drive with no volume, a drive past D, or a
  `?` drive byte outside function 17;
- `Bdos Err On d: R/O`, for a change to a drive that function 28 has made
  read-only, by function 19, 21, 22, 23, 30, 34 or 40
  (`src/cpm/bdos.asm:2390-2402`);
- `Bdos Err On d: File R/O`, for function 19 on a file whose read-only
  attribute is set (`src/cpm/bdos.asm:697-705`);
- `Bdos Err On d: Bad Sector`, for a record or a directory record that won't
  write, which includes every write to a volume the card marks read-only, a
  record of a file that won't read, and a block number past the end of the
  volume (`src/cpm/bdos.asm:2319-2329`, `src/cpm/bdos.asm:2426-2429`).

A directory record that won't read ends the program by warm boot with no
message (`src/cpm/bdos.asm:1858-1859`, `src/cpm/bdos.asm:2423-2424`). In CP/M
2.2 a key other than `^C` after `Bad Sector` passes over the error and the
program goes on.

## Console functions

**0 System reset.** Ends the program by warm boot, through the RAM BIOS
table's warm boot entry (`src/cpm/bdos.asm:132-133`). Does not return.

**1 Console input.** Waits for a character and returns it in `A`, echoed to
the console (`src/cpm/bdos.asm:198-204`). A character kept from an earlier
status call or typed during output comes first. Every character is echoed,
control characters too; CP/M 2.2 echoes only printing characters, CR, LF, tab
and backspace.

**2 Console output.** Prints the character in `E`
(`src/cpm/bdos.asm:206-210`). A tab becomes spaces to the next multiple of 8
columns. Before each character the BDOS checks for a key: `^S` stops the
output until the next key, which is discarded; `^P` turns the copy of the
output to the list device on or off; any other key is kept for the next input
call (`src/cpm/bdos.asm:2464-2481`, `src/cpm/bdos.asm:2531-2554`). In CP/M 2.2
a `^C` after `^S` ends the program; in TEC-OS it resumes the output like any
other key.

**3 Reader input.** Waits for a byte from the reader device, the serial port,
and returns it in `A` (`src/cpm/bdos.asm:212-214`).

**4 Punch output.** Sends the byte in `E` to the punch device, the serial port
(`src/cpm/bdos.asm:216-220`).

**5 List output.** Sends the byte in `E` to the list device, which discards it
(`src/cpm/bdos.asm:222-226`).

**6 Direct console I/O.** With `E` = `FFh`, returns a waiting character in
`A`, not echoed, or 0 if none is waiting. With any other `E`, sends `E` to the
console, with no tab expansion and no `^S` check (`src/cpm/bdos.asm:228-241`).
The values `FEh` and `FDh`, which CP/M 3 gives a meaning of their own, are
sent as characters.

**7 Get IOBYTE.** Returns the byte at `0003h` in `A`
(`src/cpm/bdos.asm:243-245`).

**8 Set IOBYTE.** Writes `E` to `0003h` (`src/cpm/bdos.asm:247-250`). Of its
fields, TEC-OS acts on the console field only.

**9 Print string.** Prints the characters from `DE` up to a `$`, which is not
printed, as function 2 prints each (`src/cpm/bdos.asm:252-264`).

**10 Read console buffer.** Reads a line into the buffer at `DE`
(`src/cpm/bdos.asm:266-456`). The buffer's first byte gives the most
characters it takes; the BDOS returns the number read in the second byte, with
the characters from the third on. Return or LF ends the line, and so does the
last character the buffer takes. The editing keys are backspace, Delete, `^U`,
`^R`, `^X`, `^E`, `^P` and `^C` as the line's first key, as Chapter 16
describes. When the CCP calls it for the prompt, `^W` and `^N` recall lines
from the command history; for a program they are characters
(`src/cpm/bdos.asm:333-338`).

**11 Get console status.** Returns 1 in `A` if a character is waiting and 0 if
not (`src/cpm/bdos.asm:458-472`). A character the BIOS has is read and kept
for the next input call.

## The disk system

**12 Return version number.** Returns `0022h` in `HL`: CP/M 2.2
(`src/cpm/bdos.asm:474-476`).

**13 Reset disk system.** Logs out every drive, clears the read-only vector,
selects drive A, sets user 0 and sets the DMA address to `0080h`; drive A is
logged in again (`src/cpm/bdos.asm:478-502`). Returns 0. Setting the user
number to 0 differs from CP/M 2.2, whose function 13 leaves it as it is. The
CCP's call at each warm boot sets a flag first, and then the drives whose
allocation vectors are unchanged stay logged in (`src/cpm/bdos.asm:504-543`).

**14 Select disk.** Makes the drive in `E`, 0 to 15 for A to P, the default
drive, logging it in if it is not (`src/cpm/bdos.asm:545-559`). A drive past D
or with no volume is the `Select` error.

**24 Return login vector.** Returns in `HL` a bit for each logged-in drive,
bit 0 for A (`src/cpm/bdos.asm:1420-1422`).

**25 Return current disk.** Returns the default drive in `A`, 0 for A
(`src/cpm/bdos.asm:1424-1426`).

**26 Set DMA address.** Sets the address of the 128-byte record buffer to `DE`
(`src/cpm/bdos.asm:1428-1434`).

**27 Get allocation vector address.** Returns in `HL` the address of the
default drive's allocation vector (`src/cpm/bdos.asm:1436-1438`).

**28 Write protect disk.** Sets the default drive's bit in the read-only
vector, so that a later change to the drive is the `R/O` error, until the next
warm boot or disk reset (`src/cpm/bdos.asm:1440-1452`).

**29 Get read-only vector.** Returns the read-only vector in `HL`, bit 0 for A
(`src/cpm/bdos.asm:1454-1456`). A volume that the card marks read-only does
not appear in it.

**31 Get disk parameter block address.** Returns in `HL` the address of the
default drive's DPB (`src/cpm/bdos.asm:1458-1460`).

**32 Set or get user code.** With `E` = `FFh`, returns the user number in `A`;
with any other `E`, sets the user number to `E` and returns 0
(`src/cpm/bdos.asm:1462-1471`). The value is stored without a check; the CCP's
`USER` command takes 0 to 15.

**37 Reset drive.** Logs out each drive whose bit is set in `DE`, bit 0 for A,
and clears its bit in the read-only vector (`src/cpm/bdos.asm:1600-1614`).
Returns 0. The drive is logged in again, and its directory read, at its next
selection.

**38 Access drive** and **39 Free drive.** MP/M's functions, which CP/M 2.2
does not define. Both return 0 and do nothing (`src/data3.asm:83`).

## Files

The file functions return a directory code in `A` where CP/M 2.2 does: 0 to 3,
the place in the 128-byte directory record of the entry found, or `FFh` for
none.

**15 Open file.** Searches for the FCB's file and extent and copies the
directory entry into the FCB, so that `?` in the name is replaced
(`src/cpm/bdos.asm:598-603`, `src/cpm/bdos.asm:1693-1739`). Returns the
directory code, or `FFh` if there is no such file. The FCB's `CR` is not
changed: a program sets it to 0 before reading from the start.

**16 Close file.** Writes the FCB's extent, record count and allocation map
back to the file's directory entry (`src/cpm/bdos.asm:605-649`). Returns the
directory code, or `FFh` if the entry is not found. An FCB that nothing has
been written through since its open is closed with nothing written, and the
call returns 0.

**17 Search for first.** Searches for the first entry that matches the FCB,
with `?` matching any character, and copies the directory record that holds it
to the DMA address (`src/cpm/bdos.asm:659-676`). Returns the directory code,
or `FFh` for none. A `?` in the FCB's extent byte matches every extent;
otherwise only the entries of that extent match. A `?` in the drive byte
returns every directory entry of the default drive, in use or not.

**18 Search for next.** Continues the last search from the entry after the one
found (`src/cpm/bdos.asm:678-681`). `DE` is not used.

**19 Delete file.** Erases every entry that matches the FCB, `?` allowed, and
frees its blocks (`src/cpm/bdos.asm:683-722`). Returns 0, or `FFh` if no file
matched. A matching file with its read-only attribute set is the `File R/O`
error; the entries erased before it stay erased.

**20 Read sequential.** Reads the record at the FCB's `CR` into the DMA
address and moves on, to the next extent after record 127
(`src/cpm/bdos.asm:941-987`). Returns 0, or 1 at the end of the file.

**21 Write sequential.** Writes the record at the DMA address at the FCB's
`CR` and moves on, taking a new block and a new extent when it needs them
(`src/cpm/bdos.asm:807-939`). Returns 0, 1 if the directory has no entry for a
new extent, or 2 if the drive is full. The file's read-only attribute is not
tested; CP/M 2.2 reports `File R/O` for a write to such a file.

**22 Make file.** Creates an empty entry for the FCB's name in the current
user area, writes it to the directory and opens it
(`src/cpm/bdos.asm:724-805`). Returns the directory code, or `FFh` if the
directory is full. It does not test for a file of the same name.

**23 Rename file.** Gives every entry of the file named in the FCB's first 16
bytes the name and type at offsets 17 to 27 (`src/cpm/bdos.asm:820-850`).
Returns 0, or `FFh` if there is no such file. The second drive byte, at offset
16, is not read.

**30 Set file attributes.** Copies the FCB's name and type, with their bit 7
attributes, into every entry of the file (`src/cpm/bdos.asm:814-818`,
`src/cpm/bdos.asm:828-850`). Returns 0, or `FFh` if there is no such file. Bit
7 of the first type byte is the read-only attribute and of the second the
system attribute, which `DIR` hides.

**33 Read random.** Reads the record whose number is in the FCB's `R0` and
`R1` into the DMA address, and leaves the FCB's extent and `CR` at that
record, so that a sequential read after it reads the same record
(`src/cpm/bdos.asm:989-995`, `src/cpm/bdos.asm:1013-1124`). Returns 0, or 1
for a record not written, 3 if the current extent won't close, 4 for an extent
not written, or 6 if `R2` is not 0.

**34 Write random.** Writes the record at the DMA address to the record whose
number is in `R0` and `R1`, making its extent if needed
(`src/cpm/bdos.asm:997-1124`). Returns 0, or 2 if the drive is full, 3 if the
current extent won't close, 5 if the directory has no entry for the extent, or
6 if `R2` is not 0.

**35 Compute file size.** Sets `R0` to `R2` to the file's size in records,
from whichever of its entries ends highest, or to 0 if there is no such file
(`src/cpm/bdos.asm:1473-1541`). Returns `FFh` in `A`.

**36 Set random record.** Sets `R0` to `R2` from the FCB's extent and `CR`,
the record the next sequential call would read or write
(`src/cpm/bdos.asm:1543-1566`). Returns 0.

**40 Write random with zero fill.** Function 34, with each block the write
newly allocates filled with zeros before the record is written
(`src/cpm/bdos.asm:997-1007`, `src/cpm/bdos.asm:1258-1307`).

## Functions from CP/M 3

**47 Chain to program.** Replaces what is left of the CCP's command line with
the command at the DMA address, which ends with a 0 within its first 128
bytes, and ends the program by warm boot; the CCP runs the command next
(`src/cpm/bdos.asm:46-71`). The command may hold `!` and `:`. A command with
no 0 in its first 128 bytes, or with a CR or LF before the 0, returns `FFh` in
`A`, and the program goes on with the line unchanged. `E` is ignored.

**50 Direct BIOS call.** Calls a BIOS function with the registers given in the
BIOSPB at `DE` (`src/cpm/bdos.asm:135-182`):

| Offset | Contents |
| ---: | --- |
| 0 | the BIOS function's number |
| 1 | `A` |
| 2–3 | `BC` |
| 4–5 | `DE` |
| 6–7 | `HL` |

Functions 0 to 16 call the entry of the RAM BIOS table at `BF00h` plus three
times the number, so a replaced entry is called. Function 25 is `MOVE`, which
copies `BC` bytes from `DE` to `HL`, and 29 is `XMOVE`, which sets the banks,
`B` for the destination and `C` for the source, for the next `MOVE`
(`src/xmove.asm:9-19`). A range in bank 1, EXPAND 1, or one in bank 0 that
goes past the word at `0006h`, makes `MOVE` return `FFh` with nothing copied
(`src/xmove.asm:15-18`, `src/xmove.asm:147-169`). Any other function returns
`FFh` in `A`. The call returns with the registers the BIOS routine left. The
alternate `AF` is changed.

**108 Get or set program return code.** With `DE` = `FFFFh`, returns the code
in `HL`; with any other `DE`, sets the code to `DE` and returns 0
(`src/cpm/bdos.asm:184-196`). One code serves every program; a reset clears it
to 0 and a warm boot keeps it. The CCP sets it to 0 as it takes each command
and to `FF00h` when a command fails, and a command line's piece that starts
with `:` runs only when the code is not from `FF00h` to `FFFEh`
(`src/cpm/ccp.asm:111-123`).

## Other numbers

Every other function number, from 41 to 255 but 47, 50 and 108, returns 0 in
`A` and `HL` and does nothing (`src/cpm/bdos.asm:90-91`).
