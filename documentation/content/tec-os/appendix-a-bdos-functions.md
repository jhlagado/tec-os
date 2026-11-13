---
title: A. BDOS functions
parent: TEC-OS
nav_order: 101
nav_group: "Reference"
---

# Appendix A. BDOS functions

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

Use the function number to find its registers in the table, then its effects and
failure results in the numbered entry. TEC-OS implements the CP/M 2.2 interface
with selected additions numbered 44 to 48, 99 and 108. Those additions do not
establish general CP/M 3 compatibility. Unsupported calls are listed at the end.
[Chapter 20](20-a-file-through-the-bdos.md) explains the file machinery behind
these contracts and the file control block (FCB).

| `C` | Name | In | Out |
| ---: | --- | --- | --- |
| 0 | System reset | | does not return |
| 1 | Console input | | `A` = character |
| 2 | Console output | `E` = character | |
| 3 | Reader input | | `A` = byte |
| 4 | Punch output | `E` = byte | |
| 5 | List output | `E` = byte | |
| 6 | Direct console I/O | `E` = `FFh` or character | `A` = character or 0 |
| 7 | Get IOBYTE | | `A` = IOBYTE |
| 8 | Set IOBYTE | `E` = IOBYTE | |
| 9 | Print string | `DE` → string ending `$` | |
| 10 | Read console buffer | `DE` → buffer | the line in the buffer |
| 11 | Get console status | | `A` = 1 or 0 |
| 12 | Return version number | | `HL` = `0022h` |
| 13 | Reset disk system | | `A` = 0 |
| 14 | Select disk | `E` = drive | |
| 15 | Open file | `DE` → FCB | `A` = directory code |
| 16 | Close file | `DE` → FCB | `A` = directory code |
| 17 | Search for first | `DE` → FCB | `A` = directory code |
| 18 | Search for next | | `A` = directory code |
| 19 | Delete file | `DE` → FCB | `A` = 0 or `FFh` |
| 20 | Read sequential | `DE` → FCB | `A` = 0 or 1 |
| 21 | Write sequential | `DE` → FCB | `A` = 0, 1 or 2 |
| 22 | Make file | `DE` → FCB | `A` = directory code |
| 23 | Rename file | `DE` → FCB | `A` = 0 or `FFh` |
| 24 | Return login vector | | `HL` = vector |
| 25 | Return current disk | | `A` = drive |
| 26 | Set DMA address | `DE` = address | |
| 27 | Get allocation vector address | | `HL` = address |
| 28 | Write protect disk | | |
| 29 | Get read-only vector | | `HL` = vector |
| 30 | Set file attributes | `DE` → FCB | `A` = 0 or `FFh` |
| 31 | Get disk parameter block address | | `HL` = address |
| 32 | Set or get user code | `E` = `FFh` or user | `A` = user or 0 |
| 33 | Read random | `DE` → FCB | `A` = 0, 1, 3, 4 or 6 |
| 34 | Write random | `DE` → FCB | `A` = 0, 2, 3, 5 or 6 |
| 35 | Compute file size | `DE` → FCB | `R0` to `R2` in the FCB, `A` = `FFh` |
| 36 | Set random record | `DE` → FCB | `R0` to `R2` in the FCB, `A` = 0 |
| 37 | Reset drive | `DE` = drives | `A` = 0 |
| 38 | Access drive | | `A` = 0 |
| 39 | Free drive | | `A` = 0 |
| 40 | Write random with zero fill | `DE` → FCB | as function 34 |
| 44 | Set multi-sector count | `E` = count | `A` = 0 or `FFh` |
| 45 | Set BDOS error mode | `E` = mode | `A` = 0 |
| 46 | Get disk free space | `E` = drive | 3 bytes at the DMA address, `A` = 0 |
| 47 | Chain to program | command at the DMA address | does not return or `A` = `FFh` |
| 48 | Flush buffers | | `A` = 0 or `FFh` |
| 99 | Truncate file | | `A` = `FFh` |
| 108 | Get or set program return code | `DE` = `FFFFh` or code | `HL` = code or 0 |

These are ordinary results. A disk error can instead abort the call or
return the error registers described below.

## Calling a function

A program loads the function number into `C`, loads its argument into `E` or
`DE` and calls `0005h`. On return `HL` holds the result, `A` copies its low
byte and `B` copies its high byte (`src/cpm/bdos.asm:194-214`). Byte results
have 0 in `H` and `B`. An entry that says “returns nothing” returns 0. No
other register or result flag is promised. Test the returned value rather
than treating carry as a success flag. The call places a two-byte return
address on the program's stack, then the BDOS switches to its own stack.
That stack's declared allocation is 54 bytes
(`src/cpm/bdos.asm:124-129`, `src/layout.asm:110`).

A function that takes an FCB uses its first byte to select a drive: 0 for
the default drive, 1 to 16 for A to P. The FCB is a 36-byte file control
block, laid out in [Chapter 20](20-a-file-through-the-bdos.md). Selection
precedes functions 15, 16, 17, 19 to 23, 30, 33 to 35 and 40
(`src/tables.asm:85-93`, `src/cpm/bdos.asm:156-181`). A `?` in the drive byte
is allowed only for function 17. An explicit FCB drive changes the selected
drive for that operation without changing the logical default. The caller's
drive byte is left intact (`src/cpm/bdosfile.asm:128-195`).

The file functions return a directory code in `A` where CP/M 2.2 does: 0 to 3,
the place in the 128-byte directory record of the entry found or `FFh` for
none.

## The errors

A disk operation that cannot proceed gives one of four BDOS errors. By
default the BDOS prints the message, takes a key and warm boots without
returning. An ordinary key retained during output can satisfy that wait.
Output-time `^S` and `^P` have their separate console effects. The remaining
command chain is dropped (`src/cpm/bdoscon.asm:47-64`, `119-127`, `297-322`,
`src/cpm/bdos.asm:103-105`). Function 45 instead permits silent or printed
returns with `A` = `L` = `FFh` and `H` = `B` = the error code. Those returns
preserve the chain. They are distinct from an ordinary not-found, end-of-file
or full-directory result listed under a function.

| Code | Message | Given for |
| ---: | --- | --- |
| 1 | `Bdos Err On d: Bad Sector` | A failed data/directory transfer or a read/write allocation-block reference beyond the volume (`src/cpm/bdosrec.asm:69-82`, `222-225`, `705-706`, `src/cpm/bdoslog.asm:82-107`, `src/cpm/bdoscon.asm:28-30`, `75-91`) |
| 2 | `Bdos Err On d: R/O` | A change by function 19, 21, 22, 23, 30, 34 or 40 to a drive protected by function 28 or by the mounted volume's flag. Close instead succeeds without writing (`src/cpm/bdoslog.asm:210-215`, `758-767`, `src/cpm/bdosfile.asm:252-258`) |
| 3 | `Bdos Err On d: File R/O` | Function 19 or 23 reached a read-only directory entry or function 21, 34 or 40 received an FCB with that attribute (`src/cpm/bdosfile.asm:355-366`, `393-399`, `539-545`, `610-617`, `src/cpm/bdosrec.asm:280-283`) |
| 4 | `Bdos Err On d: Select` | An unmounted drive, a drive past D or an FCB's `?` drive outside function 17 (`src/bios.asm:61-92`, `src/cpm/bdosfile.asm:176-195`, `src/cpm/bdoslog.asm:757-760`) |

[Appendix D](appendix-d-error-messages.md#the-bdos-s-errors) gives recovery
procedures. Earlier or partial physical writes are not rolled back when a
transfer fails.

## The functions

**0 System reset.** Ends the program by warm boot through the RAM BIOS
table's warm boot entry (`src/cpm/bdos.asm:220`). Does not return.

**1 Console input.** Waits for a character and echoes it to the console. A
character kept from an earlier status call or typed during output comes first
(`src/cpm/bdos.asm:280-286`). Returns the character in `A`. Every character is
echoed, including control characters. Tab is expanded to spaces. This
differs from CP/M 2.2's restricted echo of printing characters, CR, LF, tab
and backspace (`src/cpm/bdoscon.asm:252-264`).

**2 Console output.** Prints the character in `E`. A tab becomes spaces to the
next multiple of 8 columns. Before each character the BDOS checks for a key.
`^S` stops the output until the next key. A `^C` then ends the program by warm
boot and any other key resumes the output and is discarded. `^P` turns the
copy of the output to the list device on or off. Any other key is kept for the
next input call (`src/cpm/bdos.asm:294-297`, `src/cpm/bdoscon.asm:169-193`,
`src/cpm/bdoscon.asm:299-330`). Returns nothing. The `^C` after `^S` ends the
program in CP/M 2.2 too.

**3 Reader input.** Waits for a byte from the reader device, the serial port
(`src/cpm/bdos.asm:302-303`, `src/console.asm:478-489`). Returns it in `A`.

**4 Punch output.** Sends the byte in `E` to the punch device, the serial port
(`src/cpm/bdos.asm:309-312`, `src/console.asm:474-475`). Returns nothing.

**5 List output.** Sends the byte in `E` to the list device, which discards it
(`src/cpm/bdos.asm:314-320`, `src/console.asm:458-459`). Returns nothing.

**6 Direct console I/O.** With `E` = `FFh`, reads a waiting character without
echo. With any other `E`, sends `E` to the console with no tab expansion, no
`^S` check and no copy to the list device (`src/cpm/bdos.asm:329-347`).
Returns the character in `A` or 0 if none is waiting. The values `FEh` and
`FDh`, which CP/M 3 gives a meaning of their own, are sent as characters.

**7 Get IOBYTE.** Reads the byte at `0003h` (`src/cpm/bdos.asm:353-354`).
Returns it in `A`.

**8 Set IOBYTE.** Writes `E` to `0003h` (`src/cpm/bdos.asm:362-364`). Returns
nothing. TEC-OS acts only on the IOBYTE's console field
(`src/console.asm:75-133`).

**9 Print string.** Prints the characters from `DE` up to a `$`, which is not
printed, as function 2 prints each (`src/cpm/bdos.asm:373-385`). Returns
nothing.

**10 Read console buffer.** Reads a line into the buffer at `DE`. The buffer's
first byte is the maximum number of characters it takes. Return or LF ends the
line. Reaching the buffer's maximum ends it too. The editing keys are
backspace, Delete, `^U`, `^R`, `^X`, `^E`, `^P` and `^C` while the line is
empty. At the CCP's prompt `^W` and `^N` recall lines from command history.
For a program they are characters
(`src/cpm/bdos.asm:403-662`, `src/cpm/bdos.asm:482-486`). Returns the number
read in the buffer's second byte, with the characters from the third on.
Returns 0 in `A`. The returned line excludes the editing controls. Backspace
erases the removed character on screen while Delete echoes it. `^C` is
ignored while the line contains characters. On an empty line it ends the
program by warm boot and drops the remaining command chain. Deleting or
clearing all characters restores that abort condition
(`src/cpm/bdos.asm:499-540`, `553-622`).
[Chapter 23](23-the-history-ring.md) explains the history storage. The recall works only for the first function 10 after the shell's
`LINE` call, and the history is the shell's (`src/cpm/bdos.asm:473-490`,
`docs/shell.md:308-322`). With no shell installed `^W` and `^N` are
characters at the prompt too.

**11 Get console status.** Tests for a waiting character. A character the BIOS
has is read and kept for the next input call (`src/cpm/bdos.asm:707-720`).
Returns 1 in `A` if a character is waiting and 0 if not.

**12 Return version number.** Returns `0022h` in `HL`: CP/M 2.2
(`src/cpm/bdos.asm:727-728`).

**13 Reset disk system.** Logs out every drive, clears the read-only vector,
selects drive A and sets the DMA address to `0080h`. Drive A is logged in again
(`src/cpm/bdosfile.asm:19-44`). Returns 0. The user number stays as it is, as in
CP/M 2.2. The CCP's call at each warm boot sets a flag first. Drives with no
dirty flag and a matching allocation-vector sum then stay logged in
(`src/cpm/bdosfile.asm:61-107`).

**14 Select disk.** Makes the drive in `E`, 0 to 15 for A to P, the default
drive, logging it in if it is not (`src/cpm/bdosfile.asm:116-136`). Returns
nothing. A drive past D or with no volume gives the `Select` error.

**15 Open file.** Searches for the FCB's file and logical extent and copies
the entry's name through allocation map into the FCB, replacing any `?` in
the name. EX retains the requested logical extent. RC describes that extent
and S2's bit 7 marks the FCB unmodified
(`src/cpm/bdosfile.asm:205-207`, `src/cpm/bdosfn.asm:489-529`). Returns the
directory code or `FFh` if there is no such file. The FCB's `CR` is not
changed: a program sets it to 0 before reading from the start.

**16 Close file.** Writes the FCB's extent, record count and allocation map
back to the file's directory entry. An FCB on an earlier extent than its
entry's writes back only the allocation map (`src/cpm/bdosfile.asm:229-287`).
Returns the directory code or `FFh` if the entry is not found. Returns 0
and writes nothing when S2's bit 7 marks the FCB unmodified since open or
make. On a read-only drive it writes nothing and returns 0 even for an FCB
that was never opened, as CP/M 2.2's close does
(`src/cpm/bdosfile.asm:229-258`).

**17 Search for first.** Searches for the first entry that matches the FCB,
with `?` matching any character. It copies the containing directory record
to the DMA address (`src/cpm/bdosfile.asm:313-335`). A `?` in the FCB's extent
byte matches every extent. Otherwise matching respects the DPB's extent
mask and uses module 0 because ordinary search clears S2. A `?` in the drive
byte matches every directory entry of the default drive, in use or not.
Returns the directory code or `FFh` if none matches
(`src/cpm/bdosfn.asm:584-650`).

**18 Search for next.** Continues the last search from the entry after the one
found (`src/cpm/bdosfile.asm:343-344`). `DE` is not used. Returns the
directory code or `FFh` if none matches.

**19 Delete file.** Erases every entry that matches the FCB and frees its
allocation blocks. `?` is allowed (`src/cpm/bdosfile.asm:380-415`). Each entry's
blocks are freed only once its directory write has returned. A write that
fails in a mode of function 45 that returns the error therefore leaves that
entry's blocks in use. It does not establish that a failed physical write
left the card unchanged. Returns 0 or `FFh` if no file matched. A matching
file with its read-only attribute set gives the `File R/O`
error. The entries erased before it stay erased.

**20 Read sequential.** Reads the record at the FCB's `CR` into the DMA
address and moves on to the next extent after record 127
(`src/cpm/bdosrec.asm:178-233`). Returns 0 on success. It returns 1 when CR
reaches RC, when a needed map block is missing, when the next extent is
absent or when closing the extent returns `FFh`. A transfer failure instead
takes the BDOS error path.

**21 Write sequential.** Writes the record at the DMA address at the FCB's
`CR` and moves on. It takes a new allocation block or a new extent when the
record falls in one (`src/cpm/bdosrec.asm:20-158`). Returns 0 on success.
Returns 1 when the directory has no entry for a new extent or when the close
of the extent it leaves finds no entry for it. Returns 2 when the drive is
full. After a 1 the FCB stays on its extent with `CR` at 128 so a later
write, once an entry has been freed, makes the extent the FCB needs
(`src/cpm/bdosrec.asm:94-135`). A block taken for a write that then fails
stays in the FCB's map. A later successful close publishes it in the entry
(`src/cpm/bdosrec.asm:593-619`). An FCB with the read-only attribute set gives
the `File R/O` error (`src/cpm/bdosfile.asm:355-366`). On a
volume on a drive other than the logged drive, success means the record is in the
cache's copy of its block. That pending block reaches the card at the next
close, directory request, write to another block, console read, function 48,
`MOUNT` or warm boot, and the same holds for functions 34 and 40
(`docs/recovery.md:120-160`). [Chapter 19](19-cache-and-persistence.md)
explains the pending block.

**22 Make file.** Creates an empty entry for the FCB's name in the current
user area, writes it to the directory and opens it
(`src/cpm/bdosfile.asm:428-514`). Does not test for a file of the same name.
Returns the directory code or `FFh` if the directory is full. After the
drive-write check it clears `S2` before searching for a free entry and keeps
`EX`, selecting an extent among the file's first 32 as in CP/M 2.2. This
`S2` reset occurs even when the directory is full
(`src/cpm/bdosfile.asm:428-435`, `459-468`). On the successful path it clears
`S1`, `RC` and the allocation map, then copies the entry with module 0 into
the directory buffer. It sets the FCB's `S2` bit 7 before calling the
directory write. The returned FCB's `S2` is therefore `80h`, marking it
unmodified (`src/cpm/bdosfile.asm:458-514`).

**23 Rename file.** Gives every entry of the file named in the FCB's first 16
bytes the name and type at offsets 17 to 27 (`src/cpm/bdosfile.asm:558-612`).
The second drive byte, at offset 16, is not read. Returns 0 or `FFh` if there
is no such file. An entry with its read-only attribute set gives the `File
R/O` error (`src/cpm/bdosfile.asm:592-599`).

**24 Return login vector.** Returns in `HL` a bit for each logged-in drive,
bit 0 for A (`src/cpm/bdosfn.asm:10-12`).

**25 Return current disk.** Returns the default drive in `A`, 0 for A
(`src/cpm/bdosfn.asm:21-22`).

**26 Set DMA address.** Sets the address of the 128-byte record buffer to `DE`
(`src/cpm/bdosfn.asm:34-39`). Returns nothing.

**27 Get allocation vector address.** Returns in `HL` the address of the
default drive's allocation vector (`src/cpm/bdosfn.asm:48-53`). A `MOUNT`
onto the default drive selects it again so this is the new volume's vector at
once (`src/volsvc.asm:335-345`).

**28 Write protect disk.** Sets the default drive's bit in the read-only
vector until the next warm boot, disk reset or function 37 for the drive
(`src/cpm/bdosfn.asm:122-135`, `src/cpm/bdosfn.asm:343-355`). Returns nothing.
A later modifying call gives the `R/O` error. Close is the exception: it
succeeds without writing.

**29 Get read-only vector.** Returns the read-only vector in `HL`, bit 0 for A
(`src/cpm/bdosfn.asm:141-142`). A volume that the card marks read-only appears
in it once its drive has been selected (`src/cpm/bdoslog.asm:210-215`).

**30 Set file attributes.** Copies the FCB's name and type with their bit 7
attributes into every entry of the file (`src/cpm/bdosfile.asm:542-546`,
`src/cpm/bdosfile.asm:579-612`). Bit 7 of the first type byte is the
read-only attribute and bit 7 of the second the system attribute, which `DIR`
hides. Returns 0 or `FFh` if there is no such file.

**31 Get disk parameter block address.** Returns in `HL` the address of the
default drive's DPB (`src/cpm/bdosfn.asm:151-153`). After a `MOUNT` onto that
drive it is the new volume's at once, as for function 27.

**32 Set or get user code.** With `E` = `FFh`, reads the user number. With any
other `E`, sets the user number to the low five bits of `E`, as in CP/M 2.2
(`src/cpm/bdosfn.asm:162-177`). Returns the user number in `A` or 0 after a
set. The CCP's `USER` command takes 0 to 15 and the byte at `0004h` holds
only four bits of the number
(`src/cpm/ccpcmd.asm:223-246`, `src/cpm/ccp.asm:306-324`).

**33 Read random.** Reads the record whose number is in the FCB's `R0` and
`R1` into the DMA address and leaves the FCB's extent and `CR` at that record
so that a sequential read after it reads the same record
(`src/cpm/bdosrec.asm:243-249`, `src/cpm/bdosrec.asm:317-427`). Returns 0 on
success. Returns 1 when the record has not been written. Returns 3 when the
current extent can't be closed. Returns 4 when the extent has not been
written. Returns 6 when `R2` is not 0. After a 4 the FCB's `EX` and `S2`
are restored to name the extent described by its record count and allocation
map. A second read of that record returns 4 again and a write can make the
requested extent.

**34 Write random.** Writes the record at the DMA address to the record whose
number is in `R0` and `R1`. It makes the extent when the record falls in one
the file lacks (`src/cpm/bdosrec.asm:259-427`). Returns 0 on success. Returns
2 when the drive is full. Returns 3 when the current extent can't be closed.
Returns 5 when the directory has no entry for the extent. Returns 6 when `R2`
is not 0. After a 5 the FCB's `EX` and `S2` are restored to name the extent
described by its record count and allocation map, as after function 33's 4.
A later write can make the requested extent once a directory entry is free.
An FCB with the read-only attribute set gives the `File R/O` error.

**35 Compute file size.** Sets `R0` to `R2` to the file's size in records,
from whichever of its entries ends highest or to 0 if there is no such file
(`src/cpm/bdosfn.asm:196-248`). Returns `FFh` in `A`.

**36 Set random record.** Sets `R0` to `R2` from the FCB's extent and `CR`,
the record the next sequential call would read or write
(`src/cpm/bdosfn.asm:260-281`). Returns 0.

**37 Reset drive.** Logs out each drive whose bit is set in `DE`, bit 0 for A,
and clears its bit in the read-only vector (`src/cpm/bdosfn.asm:343-355`). The
drive's next selection logs it in again with a full directory scan.
Returns 0.

**38 Access drive** and **39 Free drive.** MP/M's functions, which CP/M 2.2
does not define. Both do nothing and return 0 (`src/tables.asm:92`).

**40 Write random with zero fill.** Function 34, with each allocation block the
write newly allocates filled with zeros before the record is written
(`src/cpm/bdosrec.asm:259-285`, `src/cpm/bdosrec.asm:643-685`). After each
zero-fill write the BIOS DMA address is restored to the program's DMA buffer
before error handling (`src/cpm/bdoslog.asm:99-107`). It is already restored
if the BDOS returns a write error in the mode set by function 45. Returns as
function 34 does.

**44 Set multi-sector count.** With `E` = 1 returns 0. With any other `E`
changes nothing and returns `FFh` in `A` (`src/cpm/bdos.asm:188-202`). TEC-OS
reads and writes one record a call so 1 is the only count.

**45 Set BDOS error mode.** Sets the mode to `E` (`src/cpm/bdos.asm:232-235`).
With `E` = `FFh` a BDOS error returns to the program with `A` = `FFh` and the
error's code in `H`, prints nothing and keeps the rest of a chained line. With
`E` = `FEh` it prints the message first and then returns in the same way. Any
other `E` is the default: the message, a key and the end of the program, with
the rest of a chained line dropped (`src/cpm/bdoscon.asm:47-64`). A warm boot
puts the default back (`src/boot.asm:398-405`, `src/ram.asm:222-223`). Returns 0.
A sequential read or write that returns a transfer error leaves
the FCB on the record it didn't read or write, as in CP/M 3
(`src/cpm/bdosrec.asm:69-82`, `src/cpm/bdosrec.asm:220-224`).

**46 Get disk free space.** Selects the drive in `E`, 0 to 15 for A to P, as
it selects an FCB's drive. It puts the drive's free space in records in the
three bytes at the DMA address, low byte first (`src/cpm/bdosfn.asm:68-119`).
The default drive stays as it was. Returns 0. A drive past D or with no volume
gives the `Select` error.

**47 Chain to program.** Replaces what is left of the CCP's command line with
the command at the DMA address, which ends with a 0 within its first 128
bytes. It ends the program by warm boot and the CCP runs the command next
(`src/cpm/bdos.asm:52-94`). The command may hold `!` and `&`. `E` is ignored.
The shell splits the command at `!` and `&` and its first
piece runs whatever the program's result was. With no shell the ROM runs the
command whole as one command (`src/cpm/bdos.asm:52-94`,
`docs/compatibility.md:27-32`).
Warm boot flushes the write-behind records before the CCP loads the command.
If that flush fails, failed cache lines are dropped and `Write lost` cancels
the chain (`src/cache.asm:258-296`, `539-554`). Does not return on success.
Returns `FFh` in `A` for a command with no 0 in its first 128 bytes or with
a CR or LF before the 0. The program then continues with the line unchanged.

**48 Flush buffers.** Writes every changed line of the block cache to the card
(`src/cpm/bdos.asm:244-245`, `src/volsvc.asm:373-388`). `E` = `FFh`, CP/M 3's
purge, gives the same flush. Returns 0 in `A` or `FFh` if any write failed.
A failed line is kept for the next flush, and A's
pending block is among the lines written (`src/volsvc.asm:360-389`,
`docs/compatibility.md:37-40`). Earlier
or partial card writes are not undone. This explicit call reports failure
through its return value, not the warm-boot `Write lost` path
(`src/cache.asm:258-296`, `539-554`).

**99 Truncate file.** Changes nothing (`src/cpm/bdos.asm:81-82`,
`src/cpm/bdos.asm:143-144`). Returns `FFh` in `A`. TEC-OS has no truncate.

**108 Get or set program return code.** With `DE` = `FFFFh`, reads the code.
With any other `DE`, sets the code to `DE` (`src/cpm/bdos.asm:257-272`). All
programs share one code. A cold reset clears it to 0 and warm boot keeps it
(`src/boot.asm:61-65`, `388-407`, `src/ram.asm:372-373`). The
CCP sets the code to 0 as it takes each command and to `FF00h` when a command
fails. Under the shell a piece after ` &` runs only when the code is outside
`FF00h` to `FFFEh` (`src/cpm/ccp.asm:220-223`, `563-568`,
`drivers/shell.asm:200-226`). Returns the code in
`HL` or 0 after a set.

## Other numbers

Every other function number, from 41 to 255 except 44 to 48, 99 and 108, does
nothing and returns 0 in `A` and `HL` (`src/cpm/bdos.asm:145-146`). Function
50, CP/M 3's direct BIOS call, is one of them. A program reaches the BIOS
through its jump table, whose warm boot entry is the address at `0001h`
(`src/boot.asm:304-314`).

## Differences from Digital Research's BDOS

Function 12 reports CP/M 2.2. TEC-OS derives from Portable CP/M, an original
implementation of that interface (`src/cpm/PROVENANCE.md:1-7`). Code written
for Digital Research's BDOS encounters these differences:

- The BDOS code is in ROM. Writing to it cannot install a hook. The BDOS
  calls the RAM BIOS jump table, where a program can replace an entry
  (`src/rom.asm:36-41`, `src/cpm/bdos.asm:12-33`).
- Functions 44 to 48, 99 and 108 occupy selected CP/M 3 numbers with the
  limited meanings above. Function 99 returns `FFh` without truncating.
  Every other number above 40 returns 0 without doing anything
  (`src/cpm/bdos.asm:130-146`).
- The CCP's warm-entry disk reset retains clean drives whose allocation
  vector sums still match. Dirty drives rebuild from the directory up to
  the retained bound while an unmarked sum mismatch requires a full scan.
  A program's function 13 resets every drive
  (`src/cpm/bdosfile.asm:19-107`).
- `^P` during output toggles the list copy. Digital Research's BDOS retains
  that key for input and handles the toggle in line input. TEC-OS also
  echoes every character in function 1, including control characters,
  rather than restricting the echo to printing characters, CR, LF, tab and
  backspace (`src/cpm/bdos.asm:280-286`, `src/cpm/bdoscon.asm:252-264`,
  `297-322`).
- Function 10 uses `^W` and `^N` for history only at the CCP's prompt. A
  program receives those keys as characters (`src/cpm/bdos.asm:482-486`).
- Neither geometry uses the check vector: both set CKS to 0. This mechanism
  therefore does not detect a card exchanged while TEC-OS is running
  (`format/format.json:51`, `58`). Follow the card-change procedure in
  [Chapter 6](06-cards-on-the-pc.md#writing-the-physical-card).
