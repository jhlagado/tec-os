---
title: Diagnose the machine
parent: TEC-OS
nav_order: 28
nav_group: "Inside TEC-OS"
---

# 28. Diagnose the machine

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

A card failure can stop TEC-OS before the first command prompt. The error code
and `R retry>` let you correct the card and try mounting it again. A separate
diagnostics program, loaded by the board's own monitor, checks that a physical
board behaves as TEC-OS assumes and prints one serial line for each check.
Host model results remain separate from observations on a physical board.

## The diagnostic prompt

The message `No volume mounted, error ` precedes a two-digit hexadecimal
code. The character LCD shows `CARD?` on its last row. Both come from
`DIAG`, entered after card initialisation or container mounting fails
(`src/boot.asm:646-654`, `src/text.asm:14-16`, `src/lcd.asm:66-80`). The initialisation codes are
`01h` to `04h` and `0Bh`. Container errors are `20h` to `2Ah`
(`src/sd.asm:12-26`, `src/vol.asm:11-30`).

At `R retry> ` you can type a single key. The routine echoes its original
case and ends the line. Either `R` or `r` restarts the card operations. Every other key produces
another prompt so a digit appears unchanged even though the comparison uses a
masked value (`src/boot.asm:656-667`, `src/text.asm:15`).

Your available console determines where you can answer. Cold boot selects the
PICO9918 screen when that display responds and the Matrix switch enables
the keyboard.
Otherwise it selects serial. The GLCD console driver is on the card and has
not been loaded at this point (`src/console.asm:32-45`,
`src/video.asm:18-24`, `src/pico.asm:53-68`). A board with neither an active
PICO9918 console nor an attached terminal shows only `CARD?` on the LCD.

In this model capture the socket is empty and the console is the
PICO9918 with its matrix keyboard. Typing `H` produces another prompt.
Serial output is empty:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card none --board pico --screen H. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
No volume mounted, error 01
R retry> H
R retry>
```

`R` returns to `COLDRT`. That entry resets the BDOS stack and initialises the
20 × 4 LCD to clear `CARD?`. It then calls `SDINIT` and `MOUNT` again.
You can insert or correct the card while the prompt waits.
The retry needs no board reset (`src/boot.asm:92-101`, `652`).
`MOUNT` reads the container table afresh rather than accepting cached table
bytes (`src/vol.asm:42-47`, `376-418`). [Appendix D](appendix-d-error-messages.md)
lists each code's cause and remedy.

The banner appears before either card operation. The RAM check, console
initialisation and clock probe precede it (`src/boot.asm:60-77`). A board
without the required RAM stops at `TEC-OS needs 64K RAM` on serial
(`src/boot.asm:431-484`, `src/text.asm:11`). [Chapter 16](16-reset-and-boot.md#ram-before-the-workspace) explains that check.
`COLDRT` and `DIAG` use the BDOS stack before the CCP runs. Both failure
jumps follow completed calls so `DIAG` starts at that stack's top
(`src/boot.asm:66`, `92-100`, `622-640`).

A recognised reset can retain the selected volumes through a failed mount and
retry. `RSLCAP` copies the drive table before the cold clears. `RSLBUF`, its
scratch buffer, is at `0100h` in fixed RAM (`src/boot.asm:41-58`, `211-216`,
`src/layout.asm:118-130`). That buffer survives the route to `DIAG`: `MEMINIT`
clears EXPAND 1 and the mount uses a line in the block cache there for table
reads (`src/boot.asm:77`, `232-249`, `src/vol.asm:32-47`).
[Chapter 16](16-reset-and-boot.md#retained-drive-selection) explains recognition
and reselection.

## The board diagnostics

The card prompt diagnoses card startup and mounting with TEC-OS in the ROM
socket. The board diagnostics answer a different question: whether a
physical TEC-1G behaves as TEC-OS assumes. They are a RAM program that MON-3,
the TEC-1G's own monitor, loads and runs, so MON-3 stays in the ROM socket
(`docs/diagnostics.md:1-8`, `diag/diag.asm:1-9`). The SD card comes first.
Every TEC-OS SD result so far is from the host model, whose card answers at
once and never stalls, so the SD checks measure how much of each of TEC-OS's
waits a real card uses (`docs/diagnostics.md:10-13`).

The program includes TEC-OS's own SD driver and PICO9918 probe instead of
copying them. A board run therefore exercises the driver code that TEC-OS
runs (`diag/diag.asm:23-24`, `docs/diagnostics.md:38-40`). Where a check
needs a count of a driver's waits, the program repeats the driver's sequence
with the driver's own primitives and counts each wait against the same bound
(`docs/diagnostics.md:137-141`).

## Building the program

From the prepared checkout of [Chapter 27](27-build-the-rom-and-media.md),
the build command is:

```sh
npm run diag
```

`tools/diag.mjs` generates `diag/gen/config.asm` and `diag/gen/fmt.asm`. They
hold the version, the serial delay counts from the same derivation as the
TEC-OS ROM build and the container format's fields. The script then
assembles `diag/diag.asm` with TAS, which the diagnostics always use
(`tools/diag.mjs:1-17`, `tools/diag.mjs:38-116`, `tools/diag.mjs:143-146`).
It writes four files to `build/diag/` (`tools/diag.mjs:176-192`):

| File | Contents |
| --- | --- |
| `DIAG.HEX` | Intel HEX for `4000h`, the file MON-3 loads |
| `DIAG.BIN` | The same bytes as a binary image for `4000h` |
| `diag.d8.json` | The symbol map |
| `diag.json` | Version, image ID, SHA-256, size and memory use |

The build checks the layout before writing. `START` must be at `4000h`, the
variables must start at `1000h` and end by `3FFFh`, and the code and tables
must end below `7FFFh`, which leaves a spare byte below `8000h` for the
PROTECT check (`tools/diag.mjs:152-157`, `docs/diagnostics.md:54-58`). The image ID is the first
eight bytes of the SHA-256 of the image with the ID itself zero. The build
stores it in the image and the program's first serial line prints it, so a
log names the image that ran (`tools/diag.mjs:122-127`,
`tools/diag.mjs:158-162`, `diag/main.asm:161-170`).

The program runs its code and tables from `4000h`, MON-3's default address.
Its variables, block buffers and its own 256-byte stack are in
`1000h–3FFFh` (`diag/main.asm:10-17`, `diag/vars.asm:8-10`,
`diag/vars.asm:168-172`). The code and tables are never written. The RAM and
PROTECT checks write test patterns only to free RAM after the stack, after
the program and in the `8000h–BFFFh` window, with PROTECT turned off
through MON-3 first (`docs/diagnostics.md:45-68`).

## Loading and running

MON-3 loads `DIAG.HEX` by either of two routes
(`docs/diagnostics.md:70-85`, `docs/board-run.md:36-52`):

- Over the FTDI port: set the terminal to 4800 baud, 8 data bits, no parity,
  2 stop bits and no flow control. Choose Intel HEX Load in MON-3's main menu
  and send `DIAG.HEX` as a plain text file. The digits show `PASS` when the
  load is good. If they show `FAIL`, set the terminal to wait a few
  milliseconds after each character or line and send it again.
- From a FAT32 card: copy `DIAG.HEX` to the card's root, fit the card and
  load the file through MON-3's Drive Access, Catalog (`Fn-F` in data entry
  mode). The program asks for the card to test before any SD access, so you
  can then swap the FAT32 card for the TEC-OS card.

Start the program from MON-3's data entry mode with the address `4000h` and
`GO`. It sends nothing until you press `GO` at `Log on? GO=send` on the LCD's
last row, so you can start the terminal's log first. It then prints its
header and asks for the card to test. `GO` starts the checks and `AD`
returns to MON-3 (`diag/main.asm:35-49`, `docs/board-run.md:54-61`).

The first check, SHAD, runs at once after that `GO`. Keep off the keypad
until the LCD's second row changes from `Latch bit 0` to `SD1 MISO idle`,
under a second later. While SHAD runs the ROM can show at `0000h`, and the
vectors at `0038h` and `0066h` are then the ROM's (`diag/memory.asm:330-345`,
`docs/board-run.md:62-64`). At each question `GO` goes on and `AD` skips or
leaves. Enter and Esc do the same on the matrix keyboard. The LCD shows the
check on row 2, its result on row 3 and the running totals on row 4. At the
end the program puts MON-3's latch settings back through MON-3's own calls and
returns to MON-3 (`diag/main.asm:94-112`, `docs/diagnostics.md:95-102`).

## The checks

The checks run in a fixed order (`diag/main.asm:201-204`):

| Check | What it tests |
| --- | --- |
| SHAD | That latch bit 0 clear shows the ROM at `0000h–07FFh` and set shows RAM, as TEC-OS's boot expects (`diag/memory.asm:338`) |
| SD1 | The card's data line with the card deselected (`diag/sdcard.asm:467`) |
| SD2 | Card start-up along `SDINIT`'s path, with the tries each step used (`diag/sdcard.asm:508`) |
| SD3 | The most polls each wait used over 64 reads, against TEC-OS's bounds (`diag/sdcard.asm:577`) |
| SD4 | The card's capacity, maker and serial number and the agreement of its addressing mode (`diag/sdcard.asm:708`) |
| SD5 | Repeated reads of the same blocks, compared (`diag/sdtests.asm:81`) |
| SD6 | Read speed, timed by the DS1302 or by a stopwatch between two beeps (`diag/sdtests.asm:231`) |
| SD7 | A read-only container check that follows `MOUNT`'s steps, and the first block past the container (`diag/sdvol.asm:1-12`) |
| SD8 | The write test, described below (`diag/sdwrite.asm:18`) |
| SD9 | Card removal and reinsertion as TEC-OS would see them (`diag/sdwrite.asm:974`) |
| RAM | Free RAM and both EXPAND settings of the `8000h–BFFFh` window, which must hold different data (`diag/memory.asm:100-106`) |
| PROT | That PROTECT stops a write in `4000h–7FFFh` and its removal lets the write land (`diag/memory.asm:258`) |
| CLK | The CPU clock against one DS1302 second, with a `WARN` outside 2% of 4 MHz (`diag/devices.asm:86-91`) |
| VDP | The PICO9918, found by TEC-OS's probe, and its frame rate (`diag/devices.asm:164`) |
| LCD | The 20 × 4 LCD, by reading back two addresses (`diag/devices.asm:271`) |
| GLCD | The graphics LCD's busy flag (`diag/devices.asm:327`) |
| RTC | The DS1302's registers, read and not set (`diag/devices.asm:357`) |
| INT | IM 1 interrupts through MON-3's vector at `0892h` (`diag/devices.asm:453-461`) |
| KEYS | The code of each keypad and matrix key you press (`diag/devices.asm:569`) |

Each check prints one serial line: its name, a status, then `key=value`
fields. Other lines begin with `# `. The first line starts `TEC1G-DIAG` with
the version, image ID, size and MON-3's stack pointer, and the last is
`SUMMARY` with the four totals (`diag/main.asm:72-85`,
`diag/main.asm:161-197`, `docs/diagnostics.md:104-120`). The statuses are
(`docs/diagnostics.md:122-127`):

| Status | Meaning |
| --- | --- |
| `PASS` | The board did what TEC-OS relies on |
| `WARN` | It worked, with a figure worth checking, given in the line |
| `FAIL` | It did not. The line gives what was read |
| `SKIP` | Not run, with the reason in `reason=` |

SD3's margins are the main SD result. A `WARN` there names any wait that used
more than a quarter of TEC-OS's bound: the card works, but nearer TEC-OS's
limit than a slower card might allow (`docs/diagnostics.md:168-173`).

## The SD write test

TEC-OS writes the card, so SD8 writes it too, under one rule: it addresses
only blocks that SD7 proved free, from the first block past the container to
the block before the card's last. It never addresses blocks 0–7 or any
volume's blocks (`diag/sdwrite.asm:7-16`, `diag/sdwrite.asm:61-102`,
`docs/diagnostics.md:213-220`).

SD8 writes nothing and reports `SKIP` with the reason unless start-up (SD2),
the read checks (SD5) and the container check (SD7) passed, the margins
(SD3) passed or warned and the card's size and addressing agree (SD4)
(`diag/sdwrite.asm:18-58`). It also writes nothing when either read-only
check before the question fails (`diag/sdwrite.asm:104-162`,
`diag/sdwrite.asm:451-511`):

1. Block 0 must read twice exactly as SD7 found it.
2. Each power-of-two block from block 8 to the card's end is read twice and
   compared with block 0. A card that ignores its high address bits, as fake
   cards do, reads one of them as block 0.

Only then does it ask. Writing needs `8` then `GO`. `AD` or any other key
skips the test, and holding `AD` while it runs stops it at the next block
(`diag/sdwrite.asm:166-175`, `diag/sdwrite.asm:513-540`). Each block is read
twice and saved before the pattern is written. After the pattern's readback
the saved data is written back with TEC-OS's `SDWRITE` and checked, up to
three times (`diag/sdwrite.asm:565-725`, `docs/diagnostics.md:248-266`).

The rule bounds where SD8 sends writes, not where a faulty card puts them. A
card that wraps or remaps where these checks cannot see could still land a
write on a used block. That block is put back, and an alias is reported
where the checks detect one (`docs/diagnostics.md:218-220`,
`docs/diagnostics.md:371-377`). The procedure for the card is therefore part
of the test (`docs/board-run.md:7-25`):

1. Use a card you can lose, or save an image of the whole card first.
2. Write the TEC-OS starter image to it.
3. If the log shows `SD8 FAIL alias`, `SD8 FAIL restore-failed` or the note
   to restore the card from its backup, write the starter image or your
   backup back to the card before using it. Do not run TEC-OS on it first.

A reset or power cut during SD8 can leave the block in hand holding the
pattern. Keep the backup until the run is over (`docs/diagnostics.md:274-277`).

## What the diagnostics establish

`test/diag.test.mjs` runs the program on the Debug80 host model with a stub
monitor in place of MON-3. Each case that reaches SD8 checks that no write
addressed blocks 0–7, the container or the card's last block, and that
blocks 0–7 and every volume block are unchanged afterwards. The cases
include a starter-layout card, a byte-addressed card, fake and wrapping
cards, a card whose write lands on block 3 and failed restores
(`test/diag.test.mjs:211-221`, `test/diag.test.mjs:240-648`,
`docs/diagnostics.md:401-447`). Those runs establish the program's logic
and arithmetic and that SD8 leaves the modelled card as it was. The model
supplies the card's answers, so they establish nothing about a board
(`docs/diagnostics.md:15-18`).

Because MON-3 is in the socket, the program cannot check TEC-OS's own
power-on path: the reset overlay entry, cold boot, the mount and the
console with the TEC-OS ROM fitted. That needs a separate run with the
TEC-OS ROM in place. The program also leaves the PICO9918's picture, the
8 × 8 LEDs, the speaker and the status LEDs unchecked, and `SDREAD` does not
check the CRC bytes (`docs/diagnostics.md:359-381`).

A board report is the whole serial log from the `TEC1G-DIAG` line to the
`SUMMARY` line. It belongs with the image ID, the card's make and markings,
the DIP switch settings and anything the LCD or the board did that the log
does not show (`docs/board-run.md:76-85`). Its lines establish what that
board did with that image and card.
