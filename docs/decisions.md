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

TEC-OS names these mappings by a logical bank number:

| Logical bank | Latch bits 2–6 | Debug80 backing |
| --- | --- | --- |
| classic (`0`) | `EXPAND=0`, field 0 | base memory |
| native 1–9 | `EXPAND=1`, field `n−1` | physical banks 0–8 |

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
then clears the overlay. NMI can arrive before SP is loaded; the first
instruction is `LD SP`, which leaves a ten-T-state window. That window is a
documented residual risk.

## D05 Clock (Q03) — Adopted 2026-10-24

4 MHz, the TEC-1G standard and Debug80's fast mode. Serial and SD delay loops
derive from the `CPUHZ` build constant.

## D06 Interrupts and NMI (Q09) — Adopted 2026-10-24

TEC-OS runs with maskable interrupts disabled. `IM 1` is selected so a stray
enable cannot jump through an undefined vector table. The RST 38h vector holds
`EI; RETI` as a guard.

NMI sources in Debug80 are a keypad press (74C923 data available) and the
TMS9918 frame interrupt when that card is active. `DI` does not mask them.
The ROM image has `RETN` at offset `0066h`, so NMI is harmless while the
overlay is on; boot installs `RETN` at RAM `0066h`. In the classic profile,
`0066h` lies inside the default FCB at `005Ch`, so a CP/M program that writes
that FCB also overwrites the NMI vector. A keypad press while such a program
runs can therefore crash it. TEC-OS cannot mask this in software. Whether the
board can disable keypad NMI is **Open**.

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

The terminal convention is plain ASCII with CR/LF line endings and backspace;
no cursor addressing is assumed. LCD, GLCD and keypad are not used as the
console in the first release. MON-3 is not resident: TEC-OS owns the whole
16 KiB ROM and reuses no MON-3 RAM reservation or service.

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

## Open decisions

| ID | Open item | Blocks |
| --- | --- | --- |
| O1 | Physical decoding of latch bits 2–6 and the fitted U9 device | Physical-board native banking claim |
| O2 | Whether keypad NMI can be disabled on the board | Classic-mode robustness claim |
| O3 | Behaviour of writes to `0000h–07FFh` with the overlay on | Nothing; TEC-OS avoids them |
| O4 | Physical SD card timing at 4 MHz bit-bang rates | Physical-board storage claim |
