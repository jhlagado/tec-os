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
programming. Chapters 6 to 10 are for readers of Z80 assembly, and they explain each part of CP/M
where a program first uses it. Part II is for readers who want the
mechanism: how an operating system with a CP/M interface fits in 16 KiB, and
the reasons for its layout. Its explanations carry file and line references
to the source, so a reader can follow each one into the code.

No board is needed. TEC-OS runs in a web page built from the repository, and
in the same TEC-1G model from Node.js. Every example in the book was run on
that model, and the output shown is the output it produced. TEC-OS has not
yet run on a physical board.

## The book and the code

Each chapter names, at its top, the TEC-OS commit its claims were checked
against. The code is the authority: where a chapter's statement differs from
the source at that commit, the source is right and the statement is a fault
to correct.
[STYLE.md](STYLE.md) is the guide for the people writing the chapters, and
[capture.mjs](capture.mjs) is the script that runs TEC-OS on the host model to
produce each example's output.

## Contents

Chapters marked *written* are complete. For each planned chapter the entry
lists its subjects and the source files its claims are to be checked
against.

### Part I: Using and programming TEC-OS

1. **[Introduction and first boot](01-introduction.md)** (*written*). TEC-OS
   and what it needs; running it in the web page, on the host model and on a
   board; the first prompt, the startup file, the starter card, a first
   program, and the diagnostic prompt for a card that won't mount. Sources:
   `README.md`, `src/boot.asm`, `src/data.asm`, `src/vol.asm`,
   `src/diag.asm`, `src/drv.asm`, `src/cpm/ccp.asm`, `web/`, `tools/media.mjs`.
2. **The console.** The four console devices and the IOBYTE; `CON`; the
   serial terminal and its timing; display drivers taking the console; the
   video terminal's control characters and escape sequences; the matrix
   keyboard; `[more]`; the console size for programs. Sources:
   `docs/console.md`, `src/console.asm`, `src/term.asm`, `src/video.asm`,
   `drivers/pico.asm`, `drivers/glcd.asm`.
3. **The command line.** File names and wildcards; the built-in commands
   (`DIR`, `TYPE`, `ERA`, `REN`, `SAVE`, `USER`, `CON`, `COPY`, `DRIVERS`,
   `UNLOAD`, `NAME.DRV`); running a `.COM` or `.PRL` file; user areas; BDOS
   error messages; command history with `^W` and `^N`. Sources:
   `src/cpm/ccp.asm`, `src/history.asm`, `src/data3.asm`,
   `docs/compatibility.md`.
4. **Cards and volumes.** The container and its volumes; the two geometries;
   building and changing a card image with `tecvol`; recipes and the starter
   card; the block cache and the volume written behind; `VOLS` and `MOUNT`;
   drives and their cost in memory; what a reset keeps; putting an image on a
   card, and recovery after a power cut. Sources: `docs/container-format.md`,
   `docs/recovery.md`, `tools/tecvol.mjs`, `tools/lib/container.mjs`,
   `test/programs/mount.asm`, `test/programs/vols.asm`.
5. **Startup and drivers.** `A:STARTUP.CMD` and its rules; the display lines
   and the PICO9918's three widths; the keypad skip; the words `PICO?`,
   `GLCD?` and `CARD?` on the LCD; installing, listing and removing drivers.
   Sources: `docs/drivers.md`, `src/drv.asm`, `src/glcd.asm`, `src/lcd.asm`.
6. **Memory for programs.** The Z80's 64 KiB on a TEC-1G; the program area
   and the word at `0006h`; page zero; TEC-OS's own bytes at `0040h`;
   EXPAND 1, reserved for TEC-OS; CP/M 3's `XMOVE` and `MOVE`. Sources:
   `docs/memory-map.md`, `src/layout.asm`, `src/ram.asm`, `src/xmove.asm`.
7. **A first program.** Calling the BDOS; a program that prints, one that
   reads the file named on its command line; assembling with ATOM; copying
   the program to the card with `tecvol` or the web page; ending a program.
   Sources: `src/cpm/bdos.asm`, `test/programs/say.asm`,
   `test/programs/readf.asm`, `test/atom.test.mjs`.
8. **The hardware services.** The table at `C003h` and ABI 4; checking for
   TEC-OS; the nine services: board information, the 7-segment digits, the
   LCD, the PICO9918, the speaker, the joystick, the matrix keyboard's rows,
   text at a screen position and the clock; `DEMO` as an example. Sources: `docs/rom-services.md`, `src/abi.asm`, `src/abi.inc`,
   `src/hwsvc.asm`, `test/programs/demo.asm`.
9. **PRL programs and drivers.** Digital Research's PRL format as TEC-OS
   loads it; the `.DRV` format; `INIT` and `REMOVE`; the service registry
   and `ABIDRV`; the `PICO` service; writing and installing a small driver.
   Sources: `src/prl.asm`, `src/drv.asm`, `docs/drivers.md`,
   `tools/lib/drv.mjs`, `tools/lib/prl.mjs`, `test/programs/drvdemo.asm`.
10. **Chaining commands** (*to be written after the chaining release*). Several
    commands on one line with `!`; a command that runs only after a success,
    with `:`; return codes with BDOS function 108; a program that ends by
    starting another, with BDOS function 47. Sources: the chaining release's
    `src/cpm/ccp.asm` and `src/cpm/bdos.asm`.

### Part II: Inside TEC-OS

11. **The ROM and its build.** The layout from `C000h`: the reset jump, the
    table, one block of data, one block of code and the free space; the
    generated include files; ATOM and `tools/build.mjs`; the build's checks;
    one image under four profile names. Sources: `src/rom.asm`,
    `src/layout.asm`, `src/end.asm`, `tools/build.mjs`, `format/format.json`.
12. **Reset, cold boot and warm boot.** The boot overlay; `COLD`; the RAM
    checks; counting MAIN and EXPAND; recognising a reset and keeping the
    selected volumes; rebuilding page zero; the warm boot path and its cost.
    Sources: `src/reset.asm`, `src/boot.asm`, `src/vol.asm`, `src/ram.asm`,
    `docs/recovery.md`.
13. **The memory map.** Page zero and `0040h–004Fh`; the resident workspace
    from the BDOS entry to `BFFFh`; the allocation vectors; the four stacks
    and their limits; EXPAND 1's cache, history and free page. Sources:
    `src/ram.asm`, `src/layout.asm`, `docs/memory-map.md`,
    `test/stacks.test.mjs`.
14. **The BIOS and the console path.** The RAM BIOS table at `BF00h` and its
    hooks; `CONST`, `CONIN` and `CONOUT` by IOBYTE; the bit-banged serial
    port and its timing; the matrix keyboard scan; the terminal's escape
    parser; the video driver's table and `ABIGLCD`; the 20 × 4 LCD. Sources:
    `src/bios.asm`, `src/console.asm`, `src/term.asm`, `src/video.asm`,
    `src/tms.asm`, `src/lcd.asm`, `src/glcd.asm`.
15. **The BDOS.** The entry, the function table and the FCB map; files,
    extents and records; allocation vectors and the scan at warm boot; disk
    errors; functions 25, 29, 50 and 108; the differences from Digital
    Research's BDOS. Sources: `src/cpm/bdos.asm`, `src/cpm/PROVENANCE.md`,
    `docs/compatibility.md`.
16. **The CCP.** The entry from boot; reading and parsing a line; the
    built-ins; `LOADCOM`, `PREPPAGE` and the jump to `0100h`; `.COM` before
    `.PRL`; the CCP's RAM and stack. Sources: `src/cpm/ccp.asm`,
    `src/data3.asm`, `src/ram.asm`.
17. **The SD card and the volumes.** The SPI driver and its error codes; the
    container checks; the drive table; allocation vectors at cold boot; the
    mount service, `ABIVOL`; deblocking 128-byte records into 512-byte
    blocks. Sources: `src/sd.asm`, `src/vol.asm`, `src/bios.asm`,
    `format/format.json`, `docs/container-format.md`.
18. **The block cache.** Thirty lines in EXPAND 1; reads through the cache;
    write-through and write-behind; the order of a flush; the flush at warm
    boot; `Write lost`; interrupts held off across a block. Sources:
    `src/cache.asm`, `src/bios.asm`, `docs/recovery.md`.
19. **The ROM services and the driver loader.** The dispatcher at `ABIHW` and
    each service; `XMOVE` and `MOVE`; the seven steps of a driver's load;
    the registry and its generation; removal; the stack census. Sources:
    `src/hwsvc.asm`, `src/xmove.asm`, `src/drv.asm`, `src/abi.asm`,
    `docs/drivers.md`, `docs/rom-services.md`.
20. **PRL relocation.** A PRL file's header, code and bitmap; how the CCP
    loads one at `0100h`; the `.DRV` relocation list of gaps and how the
    loader applies it. Sources: `src/prl.asm`, `src/drv.asm`,
    `tools/lib/prl.mjs`, `tools/lib/drv.mjs`.
21. **Startup.** `STBOOT`, `STLINE` and `STDONE`; one record read once; the
    keypad bit; the LCD's words and the rules for clearing them. Sources:
    `src/drv.asm`, `src/cpm/ccp.asm`, `src/lcd.asm`, `src/glcd.asm`.
22. **Command history.** The 256-byte ring at `BD00h` in EXPAND 1; storing a
    line; `^W` and `^N` in the CCP's line input; what a warm boot and a reset
    do to it. Sources: `src/history.asm`, `src/cpm/bdos.asm`.
23. **Diagnostics.** The diagnostic prompt in the ROM; the separate
    diagnostics ROM, its tests and its report; running it on a board.
    Sources: `src/diag.asm`, `diag/`, `tools/diag.mjs`,
    `docs/diagnostics.md`, `docs/board-run.md`.
24. **Chaining inside** (*to be written after the chaining release*). The command line
    kept across a warm boot; splitting at `!`; the return code and `:`;
    function 47's copy and checks. Sources: the chaining release's
    `src/cpm/ccp.asm`, `src/cpm/bdos.asm` and `src/ram.asm`.
25. **The host model and the web page.** `host/machine.mjs` and the Debug80
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
