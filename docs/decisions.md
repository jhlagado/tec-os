# Decision record

Each entry names the specification question it settles, the evidence used,
the option chosen and the date. Status words follow the specification:
**Adopted** entries are part of the TEC-OS contract; **Open** entries still
need evidence or a choice. An adopted entry can be superseded only by a later
dated entry.

Evidence sources inspected for M0 (24 October 2026):

- Debug80 runtime `@jhlagado/debug80-runtime` 0.2.0, the published package the
  test harness runs. Files: `platforms/tec1g/constants`, `sysctrl`,
  `tec1g-memory`, `tec1g-shadow`, `io-handlers`, `serial`, `sd-spi`,
  `runtime`, `runtime-lifecycle`.
- TECM8 documentation: `docs/memory-and-code-quality.md`,
  `docs/mon3/tecm8-debug80-multibank-artifact-requirements.md`,
  `docs/mon3/mon3-light-platform-direction.md`.
- MON-3 source, `MON3-1G_BC25-16_src`: `mon3.z80` (reset, latch, serial) and
  `pata_fat32.z80` (SD SPI).
- TEC-1G repository documentation: `Documentation/memmap.md`, `ioports.md`,
  `Functional Description.md`.

The schematic PDF was not machine-readable in this environment and was not
used as evidence.

## D01 Execution surfaces (Q01, Q02) — Adopted 2026-10-24

The Debug80 TEC-1G model is the hardware contract for development and for
every result reported as emulator evidence. The TEC-1G repository documents
are a cross-check for the physical board. Where they disagree, the
disagreement is recorded here and the affected code is isolated behind one
table or routine so a physical-board profile can replace it.

No result in this repository is physical-board evidence until a run on a real
TEC-1G is recorded in `docs/acceptance.md` with the board revision.

## D02 Ports and latch (Q01) — Adopted 2026-10-24

| Port | Direction | Use in TEC-OS |
| --- | --- | --- |
| `FFh` | write | System latch (74HCT273, U13) |
| `03h` | read | Status input; bit 7 is serial RX |
| `01h` | write | Bit 6 is serial TX; other bits drive the 7-segment digit select |
| `00h` | read | Keypad encoder; read before sampling RX (see D07) |
| `FDh` | read/write | SD SPI: bit 0 MOSI, bit 1 CLK, bit 2 /CS out; bit 7 MISO in |

The latch resets to `00h`. The board documentation states it is write-only;
Debug80 lets it be read back. TEC-OS never reads it: a shadow copy in fixed
RAM is the authority, and every write goes through one routine that updates
the copy and the port together.

Latch bits as Debug80 decodes them:

| Bit | Debug80 meaning | Board documentation |
| --- | --- | --- |
| 0 | `/SHADOW`, 0 = overlay on | same |
| 1 | `PROTECT`, write-protect `4000h–7FFFh` | same |
| 2 | `EXPAND`, enable the expansion window | selects which half of U9 appears |
| 3 | `E_A14`, low bit of the bank field | "possible paged memory" |
| 4–6 | bank field bits 1–3 | "possible paged memory" |
| 7 | `CAPS` lamp | same |

TEC-OS preserves bits 1 and 7 when it changes the bank.

## D03 Banked memory (Q01) — Adopted 2026-10-24, physical count Open

Debug80 decodes the four-bit field in bits 3–6. A zero upper selector gives
legacy pages 0 and 1 (bit 3); upper selector values 1–7 give physical banks
2–8. With `EXPAND` clear, `8000h–BFFFh` shows ordinary base memory. All of
these are writable RAM in Debug80. The window therefore has ten distinct
16 KiB backings: base memory plus nine expansion banks.

TEC-OS names these mappings by a logical bank number. Debug80 ignores bit 3
whenever bits 4–6 are nonzero, so the field values that reach distinct
physical banks are not consecutive; `SETBANK` takes the latch bits from a
table:

| Logical bank | Latch bits 2–6 | Debug80 backing |
| --- | --- | --- |
| classic (0) | `00h` | base memory |
| 1, 2 | `04h`, `0Ch` | legacy pages 0, 1 |
| 3–9 | `14h`, `24h`, `34h`, `44h`, `54h`, `64h`, `74h` | physical banks 2–8 |

The board documentation describes U9 as always mapped, with bit 2 choosing its
half and bits 3–6 unassigned. Under that reading the classic bank is the lower
half of U9 and native bank 1 is the upper half; native banks 2–9 alias bank 1.
The native bank count is therefore a ROM build constant (`NBANKS`): 9 for the
Debug80 profile and 1 for the documented-board profile. Applications discover
it through the capability query and never infer it. The physical decoding of
bits 3–6 remains **Open** until a board is measured.

## D04 Boot overlay (Q02) — Adopted 2026-10-24

The overlay is not a separate image. With `/SHADOW` low, reads of
`0000h–07FFh` return ROM bytes `C000h–C7FFh`, so the first 2 KiB of the 16 KiB
image serve both addresses. Bit 0 high removes it.

Debug80 sends writes made while the overlay is on to the RAM underneath. The
board documentation does not say which chip a write selects. TEC-OS does not
write `0000h–07FFh` while the overlay is on, so neither behaviour matters.

The reset path executes from the overlay alias at `0000h`, loads SP with an
address in `0800h–7FFFh`, jumps to the same code at its `C000h` alias and only
then clears the overlay.

## D05 Clock (Q03) — Adopted 2026-10-24

4 MHz, the TEC-1G standard and Debug80's fast mode. Serial and SD delay loops
derive from the `CPUHZ` build constant.

## D06 Interrupts and NMI (Q09) — Adopted 2026-10-24, revised 2026-10-25 and 2026-10-27

TEC-OS runs with maskable interrupts disabled. `IM 1` is selected so a stray
enable cannot jump through an undefined vector table, and `0038h` holds
`EI; RETI`. TEC-OS owns both vectors.

NMI cannot be masked. Its sources in Debug80 are a hex-keypad press (74C923
data available) and the TMS9918 frame interrupt. TEC-OS prevents the second
by keeping the TMS9918's interrupt enable (register 1 bit 5) clear.

**Keypad NMI (revised 2026-10-27).** On the board the keypad drives NMI only
through an optional jumper, fitted for compatibility with the original
monitor alone. TEC-OS makes no provision for a keypad NMI, and the jumper
stays off on a board that runs it. Neither the ROM nor page zero holds a
handler at `0066h`, and a program owes nothing there; it is byte 10 of the
default FCB at `005Ch`.

## D07 Console (Q03) — Adopted 2026-10-24

The console is the FTDI serial port, bit-banged at 4800 baud, 8 data bits, no
parity, two stop bits, the convention MON-3 uses. TX is port `01h` bit 6, idle
high. RX is port `03h` bit 7.

Debug80 starts delivering a queued input byte only when a program reads port
`00h`. Console status therefore reads port `00h` and discards the value before
sampling port `03h`. On the board this is a harmless read of the keypad
encoder.

Bit-banged reception has no buffer, so a byte that arrives while the CPU is
busy is lost. Console input is reliable only when the remote end sends one
character at a time while TEC-OS waits for it. The harness does this. A human
typist on a terminal at 4800 baud is normally slow enough.

Serial is always a console device; D14 adds the matrix keyboard and video
displays alongside it. MON-3 is not resident: TEC-OS owns the whole 16 KiB ROM
and reuses no MON-3 RAM reservation or service.

## D08 SD interface (Q04) — Adopted 2026-10-24

SPI mode on port `FDh`, bit-banged as MON-3 does: idle value `05h` (CS high,
MOSI high, CLK low), MISO sampled from bit 7. Initialisation sends at least
74 clocks with CS high, then CMD0, CMD8, ACMD41 until ready, CMD58 to read
the capacity bit, and CMD16 (512) for byte-addressed cards. High-capacity
cards use block addresses and standard cards use byte addresses; the driver
keeps a shift count from CMD58.

Every wait is bounded by a retry count. A failed command, a missing start
token or a write response other than `05h` returns an error to the caller.
No CRC is checked other than the fixed CMD0 and CMD8 values.

## D09 Container placement (Q05) — Adopted 2026-10-24, revisitable

The container is a contiguous byte image whose first block is the container
header. A PC tool builds and edits it as an ordinary host file. Installing it
on a card writes it raw from card block 0, so the card carries no partition
table and is dedicated to TEC-OS. The ROM reads the header from card block 0.

I chose this over a FAT-hosted file because it needs no filesystem code in a
16 KiB ROM and the image never moves on the card. The cost is that a desktop
cannot mount the card directly; all exchange goes through the PC tool. A later
format version may add a partition-table probe so the container can start at
another block; the header already allows this, because every payload offset
is relative to the container start.

## D10 Container binary layout (Q06) — Adopted 2026-10-24

Defined in [container-format.md](container-format.md). The single source of
truth is `format/format.json`; the build generates the ROM's equates and the
host tools read the same file.

## D11 CP/M implementation source (Q07) — Adopted 2026-10-24

The CCP and BDOS are adapted from Portable CP/M (`portable-cpm`, commit
`3beed4e`), an original GPL-3.0-or-later implementation of the documented
CP/M 2.2 interfaces written for ATOM. No Digital Research source is used.

Portable CP/M places its variables, buffers and stacks inside its own code
extents and expects a fresh copy from disk at each warm boot. For ROM
residency, the copies in `src/cpm/` move every writable object to RAM
equates, initialise them at cold and warm boot, and take the transient
program ceiling from a constant rather than from the CCP origin. The changes
are listed in `src/cpm/PROVENANCE.md`.

## D12 Write policy (Q11) — Adopted 2026-10-24

Synchronous write-through: a BIOS write returns success only after the SD
card has accepted the block and finished programming it. The deblocking
buffer holds one 512-byte block, keyed by volume and block number. A partial
write reads the block first unless the buffer already holds it. There is no
journal; see [recovery.md](recovery.md) for the corruption window.

## D13 CP/M 3 (Q13) — Adopted 2026-10-24

No CP/M 3 features in the first release. The classic profile reports
version 2.2.

## D14 Console devices — Adopted 2026-10-25

The console is a set of devices: serial and the matrix keyboard for input,
serial and one video display for output, all active together. The video
terminal implements an ANSI subset (cursor moves, positioning, erase, reverse
video) so programs written for ANSI terminals draw correctly on it, and the
display's size is published at `FF09h`. The first display is the TMS9918, in
40-column text mode or, with the `debug80g32` profile, 32-column Graphics I;
without a TMS9918 the ST7920 GLCD becomes a 21 × 8 console. The 20 × 4 LCD is
a status display. A V9938 in 80-column TEXT2 mode follows; the terminal layer
takes any width and height. Details in [console.md](console.md).

The matrix keyboard is implemented from Debug80's documented layout, not from
MON-3 source, because MON-3 is GPL-2.0 and TEC-OS is GPL-3.0-or-later.

## D15 Native executable and ABI (Q09, Q10) — Adopted 2026-10-25, superseded by D25

As then specified in `docs/native-abi.md`: a fixed table at `FF00h`, one
service entry with the service in `C`, managed bank reservation, copy and
call, file access through the classic bank with fixed-RAM buffers only, and
`.TNX` files with a 128-byte header. The header stores the image's end
address because a single-pass assembler cannot emit a forward difference. The
CCP falls back to `NAME.TNX` when `NAME.COM` is absent.

The classic bank stays in the window during native execution and holds the
operating system's disk workspace, so it is never given to a program.

## D16 Emulator and web host — Adopted 2026-10-25

The test harness and the planned web page both run on the published Debug80
runtime now. The interface between them and the runtime is kept narrow (CPU
step, port and memory access, device state) so a Rust machine compiled to
WebAssembly can replace it later without changing the tests or the page.

## D17 BDOS drive rebinding — Adopted 2026-10-25

Portable CP/M rescanned a drive's whole directory whenever the BDOS changed
drive. On an 8 MiB volume that is 32 SD block reads per change, about 2.5 s,
so copying between drives took that long per record. The adapted BDOS keeps
each drive's directory high-water mark in its DPH and skips the rescan for a
drive that is already logged in, as DR's BDOS does
([src/cpm/PROVENANCE.md](../src/cpm/PROVENANCE.md)).

## D18 Recipes — Adopted 2026-10-25

Programs reach a card the way they reach a Triptych disk: a
`tecos-file-recipe-v1` document lists each file by CP/M name, source URL,
byte count and SHA-256, the volumes to create and the drive for each file.
`tecvol recipe` fetches and verifies every file and builds a fresh card.
`npm run media` writes the starter recipe and card.

## D19 Command processor improvements — Adopted 2026-10-25

TEC-OS improves its own adapted CCP rather than keeping Portable CP/M's
output byte for byte. Listings follow the console: `DIR` prints compact
`NAME.EXT` entries in 13-character columns, as many as fit the width
published at `FF09h` (80 when the console is serial only): 6 columns at 80,
3 at 40, 2 at 32, 1 on the 21-column GLCD. It hides system files as before
and ends with the file count and the free space on the listed drive.

`TYPE` and `DIR` pause a screen at a time. They count the lines they print,
including lines that wrap at the console width, and one line short of a full
screen show `[more]` and wait for a key: ^C, Esc or Q stops the listing,
anything else shows the next screen. The 8-row GLCD pauses every 7 lines and
a 24-row screen every 23; a serial-only console is taken as 80 × 24.

`DIR` does not sort, because the CCP has no buffer outside the TPA, and the
CP/M habit of `SAVE`ing memory a program left behind means built-in commands
must not touch the TPA.

## D20 Console type-ahead — Adopted 2026-10-25

While it prints, the BDOS reads any waiting key to look for ^S and ^P.
Portable CP/M then discarded any other key, so typing while a program drew
its screen was lost; Edit missed keystrokes. The adapted BDOS keeps that key
for the next console read, as CP/M 2.2 does. Triptych's BDOS, built from the
same source, has the same fault.

## D21 Video is the PICO9918 — Adopted 2026-10-25

The TEC-1G's video card is always a PICO9918, never a genuine TMS9918, so
TEC-OS may rely on its F18A-compatible features. The default console is its
80-column text mode: R0 = 04h, R1 = 50h, names at 1000h (R2 = 07h), patterns
at 0000h, colours from R7. The same setup is the V9938's TEXT2 and the
F18A's T80 mode, and needs no F18A unlock. Profiles `debug80` and `board`
use 80 columns; `debug80t40` keeps 40-column text and `debug80g32` Graphics
I. Thirty-row mode, per-cell colour and other unlocked features are not used
yet.

The emulation target is PICO9918's own VDP core (MIT, from
`github.com/visrealm/pico9918`), compiled to WebAssembly through a Rust crate
and shipped in `debug80-runtime`. Until that lands, Debug80's TMS9918 model
keeps the registers and VRAM and the web page draws 80-column text itself.

## D22 48K RAM is the minimum — Adopted 2026-10-25, revised 2026-10-27

TEC-OS requires RAM at `8000h–BFFFh` as well as the fixed 32K at
`0000h–7FFFh`. No other memory configuration is supported: there is no 32K
build and no ROM in the `8000h` window. A 32K TPA (about 29K after the
resident workspace) runs small tools, but ATOM alone is 22.7K and much
established CP/M software expects 48K or more. A ROM in the window would add
16K of resident code but halve the TPA, and every change to it would mean
burning a new chip, where programs on the card update with a file copy.

Cold boot checks the window before it clears the workspace. Without RAM
there, it reports `TEC-OS needs 48K RAM: none at 8000h-BFFFh` and stops. The
check runs on the boot stack in fixed RAM, and the message goes straight to
the serial port, because the console's state is in the missing RAM.

The rest of the 96K memory (D26), MAIN 1 at `0000h–7FFFh` and
EXPAND 1 at `8000h–BFFFh`, is optional. Cold boot detects it, and what uses
it is present only when it is fitted; without it the page count reports no
extra memory and TEC-OS works as on 48K.

## D23 One console device, chosen by the IOBYTE — Adopted 2026-10-25

The console used to be every device at once: keys from serial and the matrix
keyboard, output to serial and the display. Copying every character to the
4800-baud serial line cost 9,177 T-states each, 82% of the time Edit took to
redraw a line on the PICO9918. TEC-OS now follows CP/M 2.2: the IOBYTE's
`CON:` field names one logical device, and the BIOS maps it to one physical
device. `TTY:` is the serial terminal, `CRT:` the PICO9918 with the matrix
keyboard, `UC1:` the GLCD with the matrix keyboard, and `BAT:` the CP/M batch
pairing of reader and list. Cold boot picks `CRT:`, then `UC1:`, then `TTY:`
by what answers and whether the Matrix switch is on. A display without the
keyboard is not a console, and a choice whose device is missing falls back
to the serial terminal.

The CCP gains a resident `CON` command (about 150 bytes) so the console can
be changed without a file on the card; `STAT CON:=` works too. The console
size at `0048h` describes the console in use and is 0 for the serial
terminal.

The cursor is drawn when a program polls BIOS `CONST` with nothing waiting,
as well as in `CONIN`, so programs that poll (Edit, through BDOS function 6)
show it. The video terminal gains insert and delete for characters and lines
so full-screen programs need not redraw shifted text.

## D24 Row moves shown in one frame — Adopted 2026-10-25

Moving the PICO9918's rows goes through its data port a row at a time and
takes about 21 ms for a full screen, longer than a 60 Hz frame, so a scroll
was seen sweeping down the screen. TEC-OS now builds a row move in a second
name table in VRAM and switches register 2 to it when a program next asks
for a key (or prints its next character through the BDOS), so every frame
shows a whole screen. The terminal also gains VT100 scroll regions
(`ESC [ t ; b r`), so a full-screen program can scroll its text rows in one
operation without touching a status row; Edit sets rows 1 to 23 on TEC-OS.
Rendering the emulated screen frame by frame shows no torn or partial frame
while Edit scrolls.


## D25 Native programs dropped — Adopted 2026-10-27

The native program interface of D15 is removed: the `.TNX` format and its
loader, the bank services at `FF06h`, the native memory layout and stacks,
and the CCP's fallback from `NAME.COM` to `NAME.TNX`. It had no users, and
its 1,132 bytes of ROM go back to the free space. The table at `FF00h` keeps
its layout: `FF06h` stays and answers every call with status 1 (no such
service) and carry set, `FF05h` reports no native banks, and the ABI version
becomes 2.0. The hardware services at `FF0Bh` are unchanged; a program that
checks for them accepts ABI 2.0 or later, or 1.1 or later. Open item O7 is
closed by this decision.

## D26 The 96K memory: detection and page zero — Adopted 2026-10-27

The TEC-1G's latch documentation leaves bits 3–6 unallocated; bit 3 becomes
MAIN, which of MAIN 0 and MAIN 1 (32 KiB each) is at `0000h–7FFFh`, beside
bit 2 EXPAND, which of EXPAND 0 and EXPAND 1 (16 KiB each) is at
`8000h–BFFFh`. Cold boot counts the MAIN regions and publishes the count
through `FF0Eh` (ABI 2.1), and copies page zero into MAIN 1, so an exit from
MAIN 1 reaches the warm boot. Every boot also puts the warm-boot jump at
`B503h` (`BF03h` since D27) in EXPAND 1, for an exit from a program that
left it in. Warm boot selects MAIN 0 and EXPAND 0. The calls that copy to
and from EXPAND 1 follow separately. The harness models the scheme as the
option `ram96`.

## D27 The RAM BIOS table at BF00h — Adopted 2026-10-27

The RAM copy of the BIOS jump table moves from `B500h`, just above the stub
page, to `BF00h`, so the warm-boot entry that `0001h` names is `BF03h`, and
so is the jump every boot puts in EXPAND 1. A program that uses EXPAND 1
then loses only its top page to TEC-OS. The workspace below the table holds
the BIOS, CCP and BDOS state in one run, which ends below `BF00h`, so the
warm-boot clear of the CCP and BDOS blocks never reaches the table; the GLCD
text console sits above it. The TPA is unchanged at 45,830 bytes. Programs
that follow `0001h` see no change.

## D28 The workspace sized for the card — Adopted 2026-10-27

What TEC-OS needs to boot, read the card, show a console and run CP/M
programs stays in the ROM and the workspace, as small as it can be. The
fixed workspace ends at the RAM BIOS table at `BF00h`; the SD, keyboard and
GLCD state sit above the table. Cold boot packs each mounted drive's
allocation vector below the fixed workspace, `DSM / 8 + 1` bytes in drive
order, and puts the BDOS entry jump at the highest `xx06h` address below
them, so the word at `0006h` depends on the card: `B806h` on the starter
card (46,854 bytes of TPA, 1,024 more than before), `B506h` with four 8 MiB
volumes. Warm boot rebuilds the jump from the address saved at cold boot.
The CCP's load ceiling and `SAVE` limit follow the byte at `0007h`. Each
resident stack is its deepest use, measured from reset with an NMI taken at
its deepest point, and a quarter more; the CCP's also keeps CP/M's eight
levels for a transient on it.

## D29 The BDOS calls the BIOS through the RAM table — Adopted 2026-10-27

The BDOS reaches the BIOS through the RAM copy of its jump table at `BF00h`,
as CP/M 2.2 does with its BIOS in RAM, so a program or module that replaces
an entry there catches everything that passes through it, the BDOS's own
console output and `^C` included. Hooks replace entries and chain to the
ones they replaced. Each call through the table costs one more `JP`, about
10 T-states. The BDOS's check for `^S` while it writes still calls the
ROM's console status, which draws no cursor. Cold boot builds the table and
warm boot leaves it alone, as CP/M 2.2 does, so a replaced entry survives a
warm boot; reset puts the ROM's entries back.

## Open decisions

| ID | Open item | Blocks |
| --- | --- | --- |
| O1 | Physical decoding of latch bits 2–6 and the fitted U9 device | Physical-board native banking claim |
| O2 | Closed 2026-10-27 by D06: the keypad NMI jumper stays off | — |
| O3 | Behaviour of writes to `0000h–07FFh` with the overlay on | Nothing; TEC-OS avoids them |
| O4 | Physical SD card timing at 4 MHz bit-bang rates | Physical-board storage claim |
| O5 | TMS9918 VRAM access timing on the board (no delays are inserted) | Physical-board video claim |
| O6 | Withdrawn 2026-10-26: the qualification it served is no longer in the suite | — |
| O7 | Closed by D25: the native bank services are removed | — |
| O8 | Whether the hardware service `BLOCK` ever writes raw card blocks | A card repair tool |
| O9 | Whether the hardware service `KEYS` reports the whole matrix or one row per call | The `KEYS` service |
