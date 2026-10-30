# TEC-OS

TEC-OS is a ROM-resident operating system for the TEC-1G. It runs CP/M 2.2
programs from SD-card volumes and gives them the TEC-1G's hardware through a
table of services at `C003h`.

- 16 KiB ROM at `C000h–FFFFh`, entered through the 2 KiB boot overlay at
  reset. It holds the BIOS, the CCP and BDOS, the SD and console drivers and
  the hardware services. It is laid out as a jump to cold boot at `C000h`,
  the table at `C003h`, one block of read-only data, one block of code and
  the free space at the end. `dist/abi.inc` gives programs the table's
  addresses.
- 64 KiB of RAM: 32 KiB fixed at `0000h–7FFFh` and a 32 KiB chip in U9
  whose two halves, EXPAND 0 and EXPAND 1, share the window at
  `8000h–BFFFh`. CP/M programs get a TPA from `0100h` of 46,854 bytes on the
  starter card and at least 46,086 on any card, 768 bytes less on a board
  with a GLCD. EXPAND 1 is TEC-OS's own: its levels and history, and room
  kept for a block cache. TEC-OS says so at boot and stops if either half
  is missing.
- An SD card holding a container of CP/M volumes, built and edited on a PC
  with `tecvol`.
- A console that is one device at a time, chosen by the CP/M IOBYTE: the
  80-column PICO9918 with the matrix keyboard, the 128 × 64 GLCD with the
  matrix keyboard, or a serial terminal. `CON` shows or changes it. The
  20 × 4 LCD shows boot status.
- A web page that runs the whole system in a browser.

Everything described here has run only in the Debug80 TEC-1G model; it has
not yet run on a physical board.

## Build and test

Node.js 20 or later.

```sh
npm ci
npm run build    # ROM images for each profile in build/<profile>/
npm test         # host and emulator tests, about 90 seconds
npm run media    # dist/: ROMs, maps, starter programs, recipe and card
```

`npm run media` puts Edit on the starter card when `../edit/dist/EDIT.COM`
(or the file named by `EDIT_COM`) is a build with the screen configuration
block. `npm test` runs Edit on TEC-OS and on Triptych's CP/M when those are
present beside this repository.

The ROM is assembled with ATOM. Profiles:

| Profile | Banks | Display | Use |
| --- | ---: | --- | --- |
| `debug80` | 9 | PICO9918, 80 columns | Debug80's TEC-1G model |
| `debug80t40` | 9 | PICO9918, 40 columns | As above |
| `debug80g32` | 9 | PICO9918, 32 columns | As above, Graphics I |
| `board` | 1 | PICO9918, 80 columns | The TEC-1G as its documentation describes U9 |

## In a web page

```sh
npm run build && npm run media && npm run web
python3 -m http.server 8765 --directory web/dist
```

Open `http://localhost:8765`. The page runs the same Debug80 TEC-1G model
the tests use, at 4 MHz, with a TMS9918 screen, the 7-segment digits, the
20 × 4 LCD, the 8 × 8 RGB LEDs, the GLCD and a serial terminal. Click the
screen and type on the matrix keyboard; after `CON TTY`, type in the serial
terminal instead. The card lives in the browser's IndexedDB and survives reloads.
"New starter card" builds one from `starter.recipe.json`, checking every
file's SHA-256. Files can be copied onto and off the card from the page,
which resets the TEC-1G so CP/M sees the change.

## Cards

```sh
node tools/tecvol.mjs create card.img --volume G1M:SYSTEM:A --volume G8M:WORK:B
node tools/tecvol.mjs put card.img A HELLO.COM
node tools/tecvol.mjs put card.img A NOTES.TXT --text
node tools/tecvol.mjs dir card.img A
node tools/tecvol.mjs get card.img B RESULT.TXT result.txt --text
node tools/tecvol.mjs recipe dist/starter.recipe.json card.img
node tools/tecvol.mjs install card.img /dev/rdiskN --yes
```

`install` overwrites the device from its first block; the card is dedicated
to TEC-OS. Never change a card on the PC while the TEC-1G is using it.

## Using it

TEC-OS boots to the CP/M prompt `A>` on the PICO9918 or the GLCD when the
board's Matrix switch is on, and on the serial terminal otherwise: connect
the FTDI port at 4800 baud, 8 data bits, no parity, 2 stop bits. `CON TTY`
moves the console to the serial terminal and `CON CRT` or `CON UC1` back.
CP/M commands: `DIR`, `TYPE`, `ERA`, `REN`, `SAVE`, `USER`, `CON`, `COPY`, `B:`.
`DEMO` on the starter card shows the hardware services: the LCD, the
7-segment digits, the 8 × 8 LEDs and the PICO9918 in Graphics I. A command
that names a `.COM` file runs it, and `NAME.DRV` installs a driver.
`A:STARTUP.CMD` runs at cold boot; a keypad key held through reset skips it,
and the serial terminal is then the console. If the card is missing or invalid, a
diagnostic prompt shows the error code and offers a retry.

Do not press the hex keypad while a CP/M program is running; see
[docs/compatibility.md](docs/compatibility.md).

## Documents

- [Memory map](docs/memory-map.md), generated from the build
- [Container format](docs/container-format.md)
- [ROM services](docs/rom-services.md) (the table at `C003h` and the 19 hardware services)
- [Console](docs/console.md)
- [CP/M compatibility](docs/compatibility.md)
- [Write policy and recovery](docs/recovery.md)

## Sources

`src/` holds the ROM. `src/cpm/` holds the CCP and BDOS adapted from Portable
CP/M ([provenance](src/cpm/PROVENANCE.md)). `format/` holds the container and
geometry definition and the console font, which both the ROM build and the
host tools read. `tools/` holds the build, `tecvol` and the media script.
`test/` holds the tests, their harness and the test programs.

TEC-OS is licensed under GPL-3.0-or-later.
