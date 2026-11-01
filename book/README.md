# TEC-OS: CP/M in ROM for the TEC-1G

TEC-OS is an operating system for the TEC-1G, held entirely in the board's
16 KiB ROM. It runs CP/M 2.2 programs from volumes on an SD card, and it gives
programs the board's displays, keyboards, LEDs and clock through a table of
services. This book is about using TEC-OS, writing programs for it and the
way it works inside.

## The reader

The book is written for someone who knows the TEC-1G, or a Z80 board like it,
and wants to use the board as a small disk computer rather than a trainer.
Chapters 1 to 5 begin at the first prompt, and a reader of them needs no
programming. Chapters 6 to 11 are for readers of Z80 assembly, and they
explain each part of CP/M where a program first uses it. Part II is for
readers who want the mechanism: how an operating system with a CP/M interface
fits in 16 KiB, and the reasons for its layout.

## How the book teaches

Part I works through transcripts. Each one is a real run of TEC-OS: what you
type at the prompt and what TEC-OS printed in reply, copied unchanged, with
the command that produced it. You can repeat every one in the web page that
the repository builds, or on a PC with the script [capture.mjs](capture.mjs),
which runs the same TEC-1G model from Node.js. Part II explains the code
itself, and each of its statements about the code gives the source file and
line it rests on, so you can follow the explanation into the ROM.

Every example was run on the Debug80 TEC-1G model, a software TEC-1G. TEC-OS
has not yet run on a physical board, so what the book says about a board is
what the code expects of one.

Each chapter names, at its top, the TEC-OS commit its claims were checked
against. The code is the authority: where a chapter's statement differs from
the source at that commit, the source is right and the statement is a fault
to correct. [STYLE.md](STYLE.md) is the guide for the chapters' writers.

## Conventions

Addresses and bytes are hexadecimal with a trailing `h`, as in `0100h`, as the
Z80 assemblers of CP/M's time wrote them. Sizes in bytes are decimal. A KiB is
1,024 bytes and a MiB is 1,024 KiB. Times are in T-states, the Z80's clock
cycles; at the TEC-1G's 4 MHz one T-state is a quarter of a microsecond.

A transcript shows the prompt with what you type after it, then TEC-OS's
reply:

```text
A>CON
CON: TTY: serial terminal
A>
```

A transcript usually starts at the prompt where its first command is typed,
and leaves out the boot before it. A key held with Ctrl is written with a
caret, so `^C` means Ctrl and C together.

## Contents

Chapters 1, 2, 4, 6, 7, 8, 12, 13, 14, 15, 18, 19, 21, 23, 24 and 26 and
appendices E, F and G are written. The entries for the other chapters list
their planned subjects and the source files their statements are to be
checked against.

### Part I: Using and programming TEC-OS

1. **[Introduction and first boot](01-introduction.md).** TEC-OS and what it
   needs; building it; running it in the web page, from Node.js and on a
   board; the first boot line by line, the startup file and the display
   drivers; the starter card; running a program; reset and power; the
   diagnostic prompt for a card that won't mount. Sources: `README.md`,
   `src/reset.asm`, `src/boot.asm`, `src/console.asm`, `src/layout.asm`,
   `src/data.asm`, `src/data2.asm`, `src/data3.asm`, `src/vol.asm`,
   `src/sd.asm`, `src/diag.asm`, `src/drv.asm`, `src/glcd.asm`,
   `src/cpm/ccp.asm`, `src/cpm/bdos.asm`, `drivers/glcd.asm`,
   `test/programs/demo.asm`, `host/card.mjs`, `web/`, `tools/media.mjs`,
   `tools/tecvol.mjs`, `docs/board-run.md`, `book/capture.mjs`.
2. **The console.** The console devices `TTY:`, `CRT:`, `BAT:` and `UC1:`;
   `CON`; the serial terminal and its settings; a display driver taking the
   console; the matrix keyboard, its Shift, Ctrl and Caps keys and its
   arrows; `[more]` in long listings. Sources: `docs/console.md`,
   `src/console.asm`, `src/cpm/ccp.asm`, `drivers/pico.asm`,
   `drivers/glcd.asm`.
3. **The command line.** File names and wildcards; the built-in commands
   (`DIR`, `TYPE`, `ERA`, `REN`, `SAVE`, `USER`, `CON`, `COPY`, `DRIVERS`,
   `UNLOAD`, `NAME.DRV`); running a `.COM` or `.PRL` file; user areas; BDOS
   error messages; command history with `^W` and `^N`. Sources:
   `src/cpm/ccp.asm`, `src/cpm/bdos.asm`, `src/history.asm`,
   `src/data3.asm`, `docs/compatibility.md`.
4. **Cards and volumes.** The container and its volumes; the two geometries;
   building and changing a card image with `tecvol`; recipes and the starter
   card; the block cache and the volume written behind; `VOLS` and `MOUNT`;
   drives and their cost in memory; what a reset keeps; putting an image on a
   card, and recovery after a power cut. Sources: `docs/container-format.md`,
   `docs/recovery.md`, `tools/tecvol.mjs`, `tools/lib/container.mjs`,
   `tools/lib/cpmfs.mjs`, `tools/lib/recipe.mjs`, `tools/lib/starter.mjs`,
   `src/cache.asm`, `test/programs/mount.asm`, `test/programs/vols.asm`.
5. **Startup and drivers.** `A:STARTUP.CMD` and its rules; the display lines
   and the PICO9918's three widths; the keypad skip; the words `PICO?`,
   `GLCD?` and `CARD?` on the LCD; installing, listing and removing drivers.
   Sources: `docs/drivers.md`, `src/drv.asm`, `src/glcd.asm`, `src/lcd.asm`,
   `src/data3.asm`, `drivers/pico.asm`, `drivers/glcd.asm`, `host/card.mjs`.
6. **A first program.** Calling the BDOS; a program that prints, and one that
   reads the file named on its command line; assembling with ATOM; copying
   the program to the card with `tecvol` or the web page's "Copy file to
   drive"; the ways a program ends. Sources: `src/cpm/bdos.asm`,
   `src/cpm/ccp.asm`, `test/programs/say.asm`, `test/programs/readf.asm`,
   `test/atom.test.mjs`, `web/src/main.mjs`.
7. **Memory for programs.** The Z80's 64 KiB on a TEC-1G; the program area
   and the word at `0006h`; page zero; TEC-OS's own bytes at `0040h`;
   EXPAND 1, reserved for TEC-OS; CP/M 3's `XMOVE` and `MOVE`. Sources:
   `docs/memory-map.md`, `src/layout.asm`, `src/ram.asm`, `src/xmove.asm`.
8. **Programs and the console.** The BIOS console calls; the control
   characters and the ANSI escape sequences the video terminal acts on; the
   cursor; the console size at `0048h` and through the table; the IOBYTE's
   other devices, the list device, the punch and the reader. Sources:
   `docs/console.md`, `docs/compatibility.md`, `src/bios.asm`,
   `src/term.asm`, `src/console.asm`, `test/programs/term.asm`,
   `test/programs/punrdr.asm`.
9. **The hardware services.** The table at `C003h` and ABI 4; checking for
   TEC-OS; the nine services: board information, the 7-segment digits, the
   LCD, the PICO9918, the speaker, the joystick, the matrix keyboard's rows,
   text at a screen position and the clock; `DEMO` as an example. Sources:
   `docs/rom-services.md`, `src/abi.asm`, `src/abi.inc`, `src/hwsvc.asm`,
   `src/layout.asm`, `test/programs/demo.asm`.
10. **PRL programs and drivers.** Digital Research's PRL format as TEC-OS
    loads it; the `.DRV` format; `INIT` and `REMOVE`; the service registry
    and `ABIDRV`; the `PICO` service; writing and installing a small driver.
    Sources: `src/prl.asm`, `src/drv.asm`, `docs/drivers.md`, `drivers/`,
    `tools/lib/drv.mjs`, `tools/lib/drv-format.mjs`, `tools/lib/prl.mjs`,
    `test/programs/drvdemo.asm`.
11. **Chaining commands** (planned). Several commands on one line with `!`;
    a command that runs only after a success, with `:`; return codes; a
    program that ends by starting another, with BDOS function 47. TEC-OS at
    commit 98c6416 runs one command per line and has no function 47, and
    this chapter will describe the release that adds them. Sources: that
    release's `src/cpm/ccp.asm` and `src/cpm/bdos.asm`.

### Part II: Inside TEC-OS

12. **The ROM and its build.** The layout from `C000h`: the reset jump, the
    table, one block of data, one block of code and the free space; the
    generated include files; ATOM and `tools/build.mjs`; the build's checks;
    one image under four profile names. Sources: `src/rom.asm`,
    `src/layout.asm`, `src/end.asm`, `tools/build.mjs`,
    `tools/lib/assemble.mjs`, `format/format.json`.
13. **The memory map.** Page zero and `0040h–004Fh`; the resident workspace
    from the BDOS entry to `BFFFh`; the allocation vectors; the four stacks
    and their limits; EXPAND 1's cache, history and free page. Sources:
    `src/ram.asm`, `src/layout.asm`, `docs/memory-map.md`,
    `test/stacks.test.mjs`.
14. **Reset, cold boot and warm boot.** The boot overlay; `COLD`; the two RAM
    checks; counting MAIN and EXPAND; recognising a reset and keeping the
    selected volumes; rebuilding page zero; the warm boot path and its cost.
    Sources: `src/reset.asm`, `src/boot.asm`, `src/vol.asm`, `src/ram.asm`,
    `docs/recovery.md`.
15. **The BIOS and the console path.** The RAM BIOS table at `BF00h` and its
    hooks; `CONST`, `CONIN` and `CONOUT` by IOBYTE; the list, punch and
    reader entries; the bit-banged serial port and its timing; the matrix
    keyboard scan; the terminal's escape parser; the video driver's table and
    `ABIGLCD`; the 20 × 4 LCD. Sources: `src/bios.asm`, `src/console.asm`,
    `src/term.asm`, `src/video.asm`, `src/tms.asm`, `src/lcd.asm`,
    `src/glcd.asm`.
16. **The BDOS.** The entry, the function table and the FCB map; files,
    extents and records; allocation vectors and the scan at warm boot; disk
    errors; function 50, with BIOS functions 25 (`MOVE`) and 29 (`XMOVE`);
    function 108; the differences from Digital Research's BDOS. Sources:
    `src/cpm/bdos.asm`, `src/cpm/PROVENANCE.md`, `docs/compatibility.md`.
17. **The CCP.** The entry from boot; reading and parsing a line; the
    built-ins; `LOADCOM`, `PREPPAGE` and the jump to `0100h`; `.COM` before
    `.PRL`; the CCP's RAM and stack. Sources: `src/cpm/ccp.asm`,
    `src/data3.asm`, `src/ram.asm`.
18. **The SD card and the volumes.** The SPI driver and its error codes; the
    container checks; the drive table; allocation vectors at cold boot; the
    mount service, `ABIVOL`; deblocking 128-byte records into 512-byte
    blocks. Sources: `src/sd.asm`, `src/vol.asm`, `src/bios.asm`,
    `format/format.json`, `docs/container-format.md`.
19. **The block cache.** Thirty lines in EXPAND 1; reads through the cache;
    write-through and write-behind; the order of a flush; the flush at warm
    boot; `Write lost`; interrupts held off across a block. Sources:
    `src/cache.asm`, `src/bios.asm`, `src/layout.asm`, `docs/recovery.md`.
20. **The ROM services and the driver loader.** The dispatcher at `ABIHW` and
    each service; `XMOVE` and `MOVE`; the seven steps of a driver's load;
    the registry and its generation; removal; the stack census. Sources:
    `src/hwsvc.asm`, `src/xmove.asm`, `src/drv.asm`, `src/abi.asm`,
    `docs/drivers.md`, `docs/rom-services.md`.
21. **PRL relocation.** A PRL file's header, code and bitmap; how the CCP
    loads one at `0100h`; the `.DRV` relocation list of gaps and how the
    loader applies it. Sources: `src/prl.asm`, `src/drv.asm`,
    `tools/lib/prl.mjs`, `tools/lib/drv.mjs`.
22. **Startup.** `STBOOT`, `STLINE` and `STDONE`; one record read once; the
    keypad bit; the LCD's words and the rules for clearing them. Sources:
    `src/drv.asm`, `src/cpm/ccp.asm`, `src/lcd.asm`, `src/glcd.asm`,
    `src/data3.asm`, `drivers/glcd.asm`.
23. **Command history.** The 256-byte ring at `BD00h` in EXPAND 1; storing a
    line; `^W` and `^N` in the CCP's line input; the effect of a warm boot
    and of a reset. Sources: `src/history.asm`, `src/cpm/bdos.asm`.
24. **Diagnostics.** The diagnostic prompt in the ROM; the separate
    diagnostics ROM, its tests and its report; running it on a board.
    Sources: `src/diag.asm`, `diag/`, `tools/diag.mjs`,
    `docs/diagnostics.md`, `docs/board-run.md`.
25. **Chaining inside** (planned). The command line kept across a warm boot;
    splitting at `!`; the return code and `:`; function 47's copy and its
    checks. Like Chapter 11, it will describe the release that adds
    chaining. Sources: that release's `src/cpm/ccp.asm`, `src/cpm/bdos.asm`
    and `src/ram.asm`.
26. **The host model and the web page.** `host/machine.mjs` and the Debug80
    TEC-1G runtime; the SD card and clock attached to it; the tests; the web
    page's build, its card in IndexedDB and its controls. Sources:
    `host/machine.mjs`, `host/card.mjs`, `web/`, `test/lib/`.

### Appendices

- **A. BDOS functions.** Each function from 0 to 40, with 50 and 108: its
  registers, its result and any difference from CP/M 2.2. Sources:
  `src/cpm/bdos.asm`, `docs/compatibility.md`.
- **B. ROM services.** The table at `C003h` entry by entry, the hardware
  services by number with their registers and status codes, and `ABIDRV`.
  Sources: `src/abi.asm`, `src/abi.inc`, `src/hwsvc.asm`,
  `docs/rom-services.md`.
- **C. Memory map.** The CPU's address space, page zero, the resident
  workspace, EXPAND 1 and the stacks, generated from the build. Sources:
  `docs/memory-map.md`, `tools/media.mjs`, `src/ram.asm`.
- **D. Error messages.** Every message TEC-OS prints, with its cause and the
  remedy: the CCP's, the BDOS's, the diagnostic prompt's codes, the LCD's
  words and `Write lost`. Sources: `src/data.asm`, `src/data2.asm`,
  `src/data3.asm`, `src/sd.asm`, `src/vol.asm`.
- **E. The container format.** The header's fields, the volume descriptors,
  the table beyond block 0, the checks and their codes, and the G1M and G8M
  geometries with their disk parameters. Sources:
  `docs/container-format.md`, `format/format.json`,
  `tools/lib/container.mjs`, `src/vol.asm`.
- **F. `tecvol`.** Each command, `create`, `info`, `verify`, `dir`, `put`,
  `get`, `era`, `recipe` and `install`, with its options and an example.
  Sources: `tools/tecvol.mjs`, `tools/lib/container.mjs`,
  `tools/lib/cpmfs.mjs`, `tools/lib/recipe.mjs`.
- **G. The TEC-1G as TEC-OS uses it.** The ports TEC-OS reads and writes,
  among them `00h`, `01h`, `03h`, `FDh` and `FFh`; the system latch's bits;
  the configuration switches, the Matrix switch and the keypad bit; U9 and
  its jumpers; the hex keypad and the NMI a key press raises; the 8 × 8 LEDs,
  which no service drives; the DS1302 clock and the SD adaptor. Sources:
  `src/layout.asm`, `src/console.asm`, `src/drv.asm`, `src/sd.asm`,
  `src/hwsvc.asm`, `test/programs/demo.asm`, `docs/compatibility.md`,
  `docs/board-run.md`.
