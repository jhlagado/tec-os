# Native ABI, version 1.0

Native programs use the TEC-1G's banked RAM. They do not share an execution
environment with classic CP/M programs: starting one abandons the classic
memory layout, and ending one rebuilds it.

## Finding the ABI

The ROM table at `FF00h` is fixed for ABI 1:

| Address | Size | Contents |
| --- | ---: | --- |
| `FF00h` | 3 | `"TNA"` |
| `FF03h` | 1 | ABI major version, 1 |
| `FF04h` | 1 | ABI minor version, 0 |
| `FF05h` | 1 | Native banks in this build (`NBANKS`) |
| `FF06h` | 3 | `JP` to the service entry |
| `FF09h` | 2 | Address of the console geometry: columns, then rows; 0 when the console is serial only |

The ROM is visible at every bank setting, so the table can be read by classic
programs too, for example to learn the console size.

## Executable format (`.TNX`)

A `.TNX` file is one 128-byte header record followed by the image.

| Offset | Size | Field |
| --- | ---: | --- |
| 0 | 4 | `"TNX1"` |
| 4 | 2 | Load address: page aligned, at least `0600h` |
| 6 | 2 | End address of the image, exclusive |
| 8 | 2 | Entry address |
| 10 | 2 | ABI version required; the high byte must be 1 |
| 12 | 116 | Zero |

The image must end at or below `8000h` once rounded up to whole records. The
end address, rather than a length, is stored so that a single-pass assembler
can emit the header before the image.

The CCP runs `NAME.TNX` when the command names no runnable `NAME.COM`. A
missing file or a bad header is reported as an unknown command. The command
tail is at `0080h` as for a COM program; the default FCBs are not provided.

## Fixed RAM

| Addresses | Use |
| --- | --- |
| `0000h–00FFh` | Page zero, owned by TEC-OS. `0066h` holds the NMI handler |
| `0100h–01FFh` | Kernel state |
| `0200h–02FFh` | OS stack |
| `0300h–04FFh` | Application stack. `0300h–030Fh` is a guard |
| `0500h–05FFh` | Bounce buffer for bank copies |
| `0600h–7FFFh` | Application image and data |

The program starts with `SP = 0500h`, the top of its stack, and a return
address on it that ends the program. The bank window shows the classic bank,
which holds the operating system's disk workspace. A program reaches its own
banks only through the services below. Nothing stops a program writing the
window or the latch directly; that breaks the ABI and is not protected
against.

## Entry conditions for the program

`A = 0`, `HL` = ABI version (`0100h`), `DE = 0080h` (command tail).
Interrupts are disabled.

## Calling a service

`CALL FF06h` with the service number in `C`. Arguments go in `A`, `B`, `DE`
and `HL` as listed. On return `A` is a status, 0 for success with Z set.
`IX`, `IY` and the alternate registers are preserved; `BC`, `DE` and `HL` hold
results or are destroyed. The interrupt state on return is the caller's.
Services are not re-entrant and must not be called from interrupt or NMI
handlers. Every service except `CALL` saves the caller's `SP` and runs on the
OS stack.

| C | Service | Arguments | Results |
| ---: | --- | --- | --- |
| 0 | `QUERY` | — | `HL` ABI version, `B` bank count, `DE` ROM version |
| 1 | `ALLOC` | — | `B` = a newly reserved bank |
| 2 | `FREE` | `B` bank | — |
| 3 | `COPY` | `DE` → copy descriptor | — |
| 4 | `CALL` | `B` bank, `HL` target, `A`/`DE` passed | the target's `A`, `DE`, `HL`; see below |
| 5 | `GETBANK` | — | `B` = bank shown in the window, 0 = classic |
| 6 | `CONOUT` | `E` character | — |
| 7 | `CONIN` | — | `B` character |
| 8 | `CONST` | — | `B` = FFh when a character is ready |
| 9 | `FILE` | `B` BDOS function, `DE` argument, `HL` record buffer | `B` = BDOS `A`, `HL` = BDOS `HL` |
| 10 | `EXIT` | — | does not return |

### Status codes

| A | Meaning |
| ---: | --- |
| 0 | Success |
| 1 | Unknown service |
| 2 | Bank number out of range |
| 3 | Bank not reserved by this program |
| 4 | No free bank |
| 5 | Address range invalid or crosses its region's end |
| 6 | Bank calls nested too deeply |
| 7 | BDOS function not offered by `FILE` |
| 8 | Buffer outside fixed RAM |
| 9 | Bad `.TNX` header |
| 10 | `.TNX` image does not fit or cannot be read |

### Banks and pointers

Banks are numbered 1 to `NBANKS`; bank 0 means fixed RAM. A near pointer is
valid only for the mapping it was made for. A far address is a bank number
and an address: in fixed RAM, `0100h–7FFFh`; in a bank, `8000h–BFFFh`. ROM is
never a destination.

### `COPY`

`DE` points to an 8-byte descriptor in fixed RAM:

| Offset | Size | Field |
| --- | ---: | --- |
| 0 | 1 | Source bank |
| 1 | 2 | Source address |
| 3 | 1 | Destination bank |
| 4 | 2 | Destination address |
| 6 | 2 | Length |

Both ranges must lie entirely inside their region; a range that would cross
`8000h` or `C000h`, or wrap, is refused before anything is copied. Banks other
than 0 must be reserved. A zero length succeeds and copies nothing.
Overlapping ranges in the same bank copy as if through an intermediate
buffer. The copy runs through the 256-byte bounce buffer, so the two banks
need never be visible together. The window shows on return what it showed on
entry.

### `CALL`

`B` is a reserved bank and `HL` an address in `8000h–BFFFh`. The service
saves the window's current bank in a fixed-RAM frame, selects `B`, and enters
the target with `A` and `DE` as passed, on the caller's own stack. The target
returns with `RET`. The service restores the saved bank and returns the
target's `A`, `DE` and `HL` with carry clear. On an error nothing changes, the
target is not entered, carry is set and `A` holds the status.

Calls nest up to 8 deep, so banked code may call other banked code. The ninth
nested call is refused with status 6 and every level returns normally. A
target must leave `SP` as it found it.

### `FILE`

The BDOS file functions 13–23, 25, 30, 32–36 and 40 are offered. The FCB must
lie in fixed RAM; functions that transfer a record (17, 18, 20–21, 33, 34, 40)
take the record buffer in `HL`, also in fixed RAM, and the service sets the
DMA address itself. The classic bank is selected while the BDOS runs and
restored afterwards. Because buffers can only be in fixed RAM, a later bank
change cannot redirect an outstanding transfer.

## Ending

`EXIT`, or `RET` from the entry routine, switches to a stack in fixed RAM,
releases every bank, selects the classic bank and checks the stack guard. A
damaged guard is reported as `Native stack guard damaged`. The classic
profile is then rebuilt by a warm boot. The guard detects only overruns that
reach it; it is not memory protection.

## Interrupts

TEC-OS keeps maskable interrupts disabled and uses `IM 1`; `0038h` holds
`EI; RETI`. A native program may enable interrupts, and the services return
with the caller's interrupt state, but there is no ROM interrupt dispatcher
in ABI 1.

NMI cannot be masked. In the native profile `0066h` holds `RETN`, and every
bank change happens with `SP` in fixed RAM, so an NMI at any point returns
correctly.
