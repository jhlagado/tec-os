# TEC-OS

TEC-OS is a ROM-resident operating system for the TEC-1G. It runs CP/M 2.2
programs from SD-card volumes and offers native programs a separate interface
to the TEC-1G's banked RAM.

- 16 KiB ROM at `C000h–FFFFh`, entered through the 2 KiB boot overlay at
  reset. It holds the BIOS, the CCP and BDOS, the SD and console drivers and
  the native interface.
- 32 KiB fixed RAM at `0000h–7FFFh` and a 16 KiB bank window at
  `8000h–BFFFh`. CP/M programs get a 45,830-byte TPA from `0100h`.
- An SD card holding a container of CP/M volumes, built and edited on a PC
  with `tecvol`.
- A console made of the serial port, the matrix keyboard and a TMS9918
  (or, without one, the 128 × 64 GLCD), used together, with a status display
  on the 20 × 4 LCD.
- A web page that runs the whole system in a browser.

Everything described here has run only in the Debug80 TEC-1G model; it has
not yet run on a physical board. See [docs/acceptance.md](docs/acceptance.md).

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
| `debug80` | 9 | TMS9918, 40 columns | Debug80's TEC-1G model |
| `debug80g32` | 9 | TMS9918, 32 columns | As above, Graphics I |
| `board` | 1 | TMS9918, 40 columns | The TEC-1G as its documentation describes U9 |

## In a web page

```sh
npm run build && npm run media && npm run web
python3 -m http.server 8765 --directory web/dist
```

Open `http://localhost:8765`. The page runs the same Debug80 TEC-1G model
the tests use, at 4 MHz, with a TMS9918 screen, the 7-segment digits, the
20 × 4 LCD, the 8 × 8 RGB LEDs, the GLCD and a serial terminal. Click the
screen and type: keys go to the matrix keyboard, or to the serial port if you
choose. The card lives in the browser's IndexedDB and survives reloads.
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

TEC-OS boots to the CP/M prompt `A>`. Connect a terminal to the FTDI port at
4800 baud, 8 data bits, no parity, 2 stop bits, or use the matrix keyboard
and a TMS9918 card. CP/M commands: `DIR`, `TYPE`, `ERA`, `REN`, `SAVE`,
`USER`, `B:`. A command that names a `.COM` file runs it; one that names a
`.TNX` file runs a native program. If the card is missing or invalid, a
diagnostic prompt shows the error code and offers a retry.

Do not press the hex keypad while a CP/M program is running; see
[docs/compatibility.md](docs/compatibility.md).

## Documents

- [Specification](docs/specification.md) and [decisions](docs/decisions.md)
- [Memory map](docs/memory-map.md), generated from the build
- [Container format](docs/container-format.md)
- [Native ABI](docs/native-abi.md)
- [Console](docs/console.md)
- [CP/M compatibility](docs/compatibility.md)
- [Write policy and recovery](docs/recovery.md)
- [Acceptance evidence](docs/acceptance.md)

## Sources

`src/` holds the ROM. `src/cpm/` holds the CCP and BDOS adapted from Portable
CP/M ([provenance](src/cpm/PROVENANCE.md)). `format/` holds the container and
geometry definition and the console font, which both the ROM build and the
host tools read. `tools/` holds the build, `tecvol` and the media script.
`test/` holds the tests, their harness and the test programs.

TEC-OS is licensed under GPL-3.0-or-later.
