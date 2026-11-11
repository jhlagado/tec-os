# TEC-OS

TEC-OS is a ROM-resident operating system for the TEC-1G. It runs CP/M 2.2
programs from SD-card volumes and gives them the TEC-1G's hardware through a
ROM table at `C003h`.

- 16 KiB ROM at `C000h–FFFFh`, entered through the 2 KiB boot overlay at
  reset. It holds the BIOS, the CCP and BDOS, the SD and console drivers and
  the hardware services. It is laid out as a jump to cold boot at `C000h`,
  the table at `C003h`, one block of read-only data, one block of code and
  the free space at the end. `dist/abi.inc` gives programs the table's
  addresses.
- 64 KiB of RAM: 32 KiB fixed at `0000h–7FFFh` and a 32 KiB chip in U9
  whose two halves, EXPAND 0 and EXPAND 1, share the window at
  `8000h–BFFFh`. CP/M programs get a TPA from `0100h` of 47,268 bytes on the
  starter card and at least 46,564 on any card, and 46,336 with the GLCD's
  driver. EXPAND 1 is TEC-OS's own: its block cache and history. TEC-OS says so at boot and stops if either half
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
(
  set -eu
  tas_stage=
  trap 'if [ -n "$tas_stage" ]; then rm -rf "$tas_stage"; fi' EXIT
  npm ci
  npm run inputs   # pinned TED.COM, TAS.COM, BAZA.COM, BAZA.RTL and BOUNCE.BAS
  mkdir -p .inputs
  if [ -d .inputs/tas-host ]; then
    node --input-type=module -e 'import { tasAssembler } from "./tools/lib/tas-rom.mjs"; await tasAssembler();'
  else
    tas_stage=$(mktemp -d "$PWD/.inputs/.tas-host.XXXXXX")
    git clone https://github.com/jhlagado/thorium.git "$tas_stage"
    git -C "$tas_stage" checkout --detach 3d16b30cb8ed7deccc0a8b0b04f1b961e29f5689
    (cd "$tas_stage" && npm ci)
    TECOS_TAS_HOST="$tas_stage" node --input-type=module -e 'import { tasAssembler } from "./tools/lib/tas-rom.mjs"; await tasAssembler();'
    mv "$tas_stage" .inputs/tas-host
  fi
)
```

After setup, the normal commands need no toolchain environment variables.

```sh
npm run build    # main ROM, map and census
npm run diag     # board diagnostics for MON3: DIAG.HEX and DIAG.BIN
npm run media    # ROM, programs, recipe and starter card in dist/
npm run web      # the browser page in web/dist/
npm test         # host and emulator tests, several minutes
```

The host is pinned to the KS42 runner and its locked Z80 runtime. Setup
verifies the runner, lock, runtime and TAS executable before moving the
temporary host into place. Repeating setup verifies the prepared host
without reinstalling it. `npm run inputs` validates the five application pins
and fetches missing inputs into verified temporary files before replacement.
A failed preparation keeps previous verified files. Assembly uses local
inputs and makes no downloads.

The web page's browser tests moved to TEC-OS Viewer (KD-239), which owns the
page; no test here drives a browser. `playwright` stays pinned in
`package.json` (KE-157) so that a browser can be driven against the local
`web/` page that `npm start` serves; `npx playwright install chromium` fetches
the browser that version expects.

Assembly, media and tests select each application input, TED and TAS from
Thorium and `BAZA.COM`, `BAZA.RTL` and `BOUNCE.BAS` from Baza, from an explicit
`TED_COM`, `TAS_COM`, `BAZA_COM`, `BAZA_RTL` or `BOUNCE_BAS`, then
`.inputs/NAME`, then the legacy sibling paths `../thorium/dist/TED.COM`,
`../thorium/dist/TAS.COM`, `../baza/dist/BAZA.COM`, `../baza/dist/BAZA.RTL` and
`../baza/examples/BOUNCE.BAS`. `npm run media` needs all five to build the
card. Baza's repository is private: without access to it, put the three
pinned files, from someone who has it, in `.inputs/`. A selected override
or local file must match its pin and cannot fall through to another file.
Input setup fetches the pinned local binary when a legacy sibling is stale.

TAS is the default assembler for the main ROM, the diagnostics, GLCD.SVC,
MOUNT.COM, DEMO.COM, MON3.SVC and HELLO3.BIN. The host is selected from `TECOS_TAS_HOST`, then
`.inputs/tas-host`. `TECOS_ROM_ASSEMBLER=atom` selects the ATOM reference
build and needs no TAS host; the diagnostics always use TAS. Historical builds and test-only assembly
fixtures retain their explicit ATOM paths. Unknown selections fail.
There is one image for every board,
`build/tecos/tecos.rom`, published as `dist/tecos.rom`. The
PICO9918's console is in the ROM, at 80 columns, 40, or 32 in Graphics I, which
`CON PICO 40` and the like switch between; it starts at 40. The GLCD's console
is a driver, `A:GLCD.SVC`. The web page writes a width chosen as a `CON PICO 40`
or `CON PICO 32` line at the top of the card's `STARTUP.CMD`, and takes out any
other `CON PICO` or `CON CRT` line with a width, which would override it.

## In a web page

```sh
npm run build && npm run media && npm run web
npm start
```

For an existing build, just run `npm start`. This uses the installed esbuild
development server; Python is not needed.

Open `http://localhost:8765`. The page runs the same Debug80 TEC-1G model
the tests use, at 4 MHz, with a TMS9918 screen, the 7-segment digits, the
20 × 4 LCD, the 8 × 8 RGB LEDs, the GLCD and a serial terminal. Click the
screen and type on the matrix keyboard; after `CON TTY`, type in the serial
terminal instead. The card lives in the browser's IndexedDB and survives reloads.
"New starter card" builds one from `starter.recipe.json`, checking every
file's SHA-256: the same card as `dist/starter.img`, for there is one card. Files can be copied onto and off the card from the page,
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
to TEC-OS. `put` over, or `era` of, a file with the read-only attribute is
refused, as TEC-OS refuses it, unless `--force` is given. Never change a card on the PC while the TEC-1G is using it.

## Using it

TEC-OS starts on the PICO9918 when the card answers and the board's Matrix
switch is on, from the banner on, with no file needed. Otherwise it starts on the
serial terminal and the 20 × 4 LCD, and the starter card's `STARTUP.CMD` moves
the console to the GLCD when the Matrix switch is on. Otherwise it stays on the
serial terminal: connect
the FTDI port at 4800 baud, 8 data bits, no parity, 2 stop bits. `CON TTY`
moves the console to the serial terminal and `CON CRT` or `CON UC1` back.
CP/M commands: `DIR`, `TYPE`, `ERA`, `REN`, `SAVE`, `USER`, `CON`, `COPY`, `B:`.
`DEL` is another name for `ERA`.
`SERVICES` lists the services loaded and `UNLOAD` removes the last one. A line
chains commands with `!`, and a piece starting `:` runs only if the last command
succeeded, as in `TED X.ASM!TAS X!:X`.
`SAMPLE.ASM` on the starter card is a first program to build and read:
`TAS SAMPLE` assembles it and `SAMPLE` runs it, printing the screen's size,
writing the LCD, lighting the digits and beeping through the ROM's services by
`abi.inc`'s names. `TIMES.BAS` beside it is a first BASIC program, in spaced-out
lower case: it asks a name and a number and prints that number's times table.
`BAZA TIMES` compiles it with the card's `BAZA.COM` and `BAZA.RTL` and `TIMES`
runs it; in `TED TIMES.BAS`, ^T B and ^T R build and run it with BAZA as they do
an `.ASM` with TAS. `DEMO.ASM` is a tour of the hardware: `TAS DEMO` builds
`DEMO.COM` and `DEMO` runs it, showing the LCD, the 7-segment digits, the
8 × 8 LEDs and the PICO9918 in Graphics I, and `TED DEMO.ASM` reads it. `MON3.SVC` runs programs written for MON-3, the
TEC-1G's monitor ([docs/mon3.md](docs/mon3.md)): `MON3.SVC /E` gives `MON3>`,
where `LOAD HELLO3.BIN` and `GO` run `HELLO3`, which writes four lines on the
LCD through MON-3's calls and counts on the digits. AD, or Esc on the matrix
keyboard, returns to `MON3>`, and `EXIT` to `A>`. `HELLO3.ASM` is its source,
and `TAS HELLO3 HELLO3.BIN` builds it. `BOUNCE.BAS` is Baza's sprite game:
`BAZA BOUNCE` compiles it, and `BOUNCE` takes the PICO9918 in Graphics I
through `call`; tap W, A, S and D to steer the ship, and Q gives the display
back. A BASIC program that has claimed the display and
stops on an error gives it back first, so its message shows. A command that
names a `.COM` file runs it, and `NAME.SVC` installs a service.
`A:STARTUP.CMD` runs after a reset, recognised or not, and never on an ordinary
exit, from the volume selected as A:; a keypad key held from reset until the
prompt skips it, and the console stays where cold boot put it. If the card is
missing or invalid the LCD shows `CARD?`, and a diagnostic prompt on the console,
the PICO9918 or the serial terminal, shows the error code and offers a retry. A
good retry clears the word.

Do not press the hex keypad while a CP/M program is running; see
[docs/compatibility.md](docs/compatibility.md).

## Documents

- [Memory map](docs/memory-map.md), generated from the build
- [Container format](docs/container-format.md)
- [The ROM table](docs/rom-services.md) (the table at `C003h` and the 9 hardware services)
- [Console](docs/console.md)
- [CP/M compatibility](docs/compatibility.md)
- [Write policy and recovery](docs/recovery.md)

## Sources

[Reading the source](docs/reading.md) gives a file order, call paths and symbol prefixes.

`src/` holds the ROM. `src/cpm/` holds the CCP and BDOS adapted from Portable
CP/M ([provenance](src/cpm/PROVENANCE.md)). `format/` holds the container and
geometry definition, which both the ROM build and the host tools read, and
the console font, from which the build makes the ROM's copy. `drivers/` holds
the GLCD's driver. `tools/` holds the build, `tecvol` and the media script.
`test/` holds the tests, their harness and the test programs.

[Assembly source style](docs/assembly-style.md) describes the current compact
layout, comment contracts, 8.3 names and retained test profiles.

TEC-OS is licensed under GPL-3.0-or-later.

Font sources, deliberate edits and legacy provenance limits are in [FONT-NOTICES](format/FONT-NOTICES.txt).
The PICO9918 starts at 40 columns. Use `CON PICO 80` or `CON PICO 32` for another width. Bare `CON CRT` and `CON PICO` preserve the selected width.
