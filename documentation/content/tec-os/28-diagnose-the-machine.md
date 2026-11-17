---
title: Diagnose the machine
parent: TEC-OS
nav_order: 28
nav_group: "Inside TEC-OS"
---

# 28. Diagnose the machine

<!-- Checked against TEC-OS 57a8c38b7f341433285e39c4bec14ecc486ffe26 (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED 02b63d8;
     Baza is the qualified eee4ee6 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A machine stopped before its command prompt needs a recovery path that
works without files or loaded drivers. TEC-OS supplies an error code and
`R retry>` for card initialisation and mount failures. Checking the board
itself requires a separate diagnostics program under its monitor. That
program prints a serial result for each check. Model results and physical
board observations remain separate kinds of evidence.

## The diagnostic prompt

Card failure enters `DIAG`. It prints `No volume mounted, error ` and
a two-digit hexadecimal code while the character LCD shows `CARD?` on
its last row (`b95b2a9:src/boot.asm:650-658`, `b95b2a9:src/text.asm:14-16`,
`b95b2a9:src/lcd.asm:66-80`). Initialisation reports `01h`–`04h` or `0Bh`.
Container validation reports `20h`–`2Ah` (`b95b2a9:src/sd.asm:12-26`,
`b95b2a9:src/vol.asm:11-30`).

The retry prompt accepts a key at a time. It echoes original case and
ends the line. `R` or `r` restarts card operations. Other keys produce
another prompt. Masking for comparison therefore does not alter a digit's
echo (`b95b2a9:src/boot.asm:660-671`, `b95b2a9:src/text.asm:15`).

The reply must use a console already available before mounting. Cold
boot selects PICO9918 when its display responds and the Matrix switch
enables the keyboard. Otherwise it uses serial. GLCD cannot supply this
prompt because its driver has not yet loaded from the card
(`b95b2a9:src/console.asm:32-45`, `b95b2a9:src/video.asm:18-24`, `b95b2a9:src/pico.asm:53-68`).
Without active PICO or an attached terminal, only LCD `CARD?` is visible.

The following empty-socket model capture uses PICO9918 and its matrix
keyboard. H repeats the prompt and no serial output is produced:

<!-- TEC-OS 57a8c38: node tools/capture.mjs --card none --board pico --screen H. Full screen; trailing empty rows omitted. -->
```text

TEC-OS 0.1 for TEC-1G
No volume mounted, error 01
R retry> H
R retry>
```

Retry reruns the card path without resetting the board. `R` enters
`COLDRT`, resets the BDOS stack and initialises the 20 × 4 LCD to clear
`CARD?`. It then calls `SDINIT` and `MOUNT` (`b95b2a9:src/boot.asm:92-101`, `b95b2a9:src/boot.asm:660-671`).
The waiting prompt permits card insertion or correction. Mount rereads
the container table rather than using earlier cached metadata
(`b95b2a9:src/vol.asm:42-47`, `b95b2a9:src/vol.asm:376-418`).
[Appendix D](appendix-d-error-messages.md) gives causes and remedies.

The banner locates failure after several earlier checks. RAM validation,
console initialisation and clock probe precede it (`b95b2a9:src/boot.asm:60-77`).
Missing required RAM instead prints `TEC-OS needs 64K RAM` on serial
(`b95b2a9:src/boot.asm:435-488`, `b95b2a9:src/text.asm:11`), as
[Chapter 16](16-reset-and-boot.md#ram-before-the-workspace) explains.
`COLDRT` and `DIAG` use the BDOS stack before CCP entry. Both failure
jumps follow completed calls, leaving `DIAG` at that stack's top
(`b95b2a9:src/boot.asm:61-68`, `b95b2a9:src/boot.asm:92-100`, `b95b2a9:src/boot.asm:640-671`).

Recognised reset can preserve volume assignments through this retry.
`RSLCAP` saves the drive table in fixed-RAM `RSLBUF` at `0100h` before
cold clearing (`b95b2a9:src/boot.asm:41-58`, `b95b2a9:src/boot.asm:215-220`, `b95b2a9:src/layout.asm:118-130`).
`MEMINIT` clears EXPAND 1 instead and mount reads metadata into its cache,
so the saved table survives entry to `DIAG` (`b95b2a9:src/boot.asm:77`, `b95b2a9:src/boot.asm:236-253`,
`b95b2a9:src/vol.asm:32-47`). [Chapter 16](16-reset-and-boot.md#retained-drive-selection)
explains the recognition and reselection conditions.

## The board diagnostics

Board diagnostics test assumptions that a card retry cannot establish.
MON-3, the TEC-1G monitor, remains in the ROM socket and loads them as
a RAM program (`b95b2a9:docs/diagnostics.md:1-8`, `b95b2a9:diag/diag.asm:1-9`). SD checks
run first because the recorded TEC-OS SD results so far come from a host
model whose card answers immediately without stalls. Physical checks
measure the waits a real card consumes (`b95b2a9:docs/diagnostics.md:10-13`).

The diagnostic includes the actual TEC-OS SD driver and PICO9918 probe
(`b95b2a9:diag/diag.asm:23-24`, `b95b2a9:docs/diagnostics.md:38-40`). Checks that need
wait counts repeat the driver's sequence using its primitives and bounds
rather than substituting a different wait policy
(`b95b2a9:docs/diagnostics.md:137-141`).

## Building the program

The prepared checkout from [Chapter 27](27-build-the-rom-and-media.md)
builds diagnostics with:

```sh
npm run diag
```

`tools/diag.mjs` generates `diag/gen/config.asm` and `diag/gen/fmt.asm`
as generated build outputs, not tracked assembly inputs,
for version, serial delays and container fields. Serial timing uses the
ROM build's derivation. TAS then assembles `diag/diag.asm`
(`b95b2a9:tools/diag.mjs:1-17`, `b95b2a9:tools/diag.mjs:38-116`,
`b95b2a9:tools/diag.mjs:143-146`).
Four outputs are written under `build/diag/` (`b95b2a9:tools/diag.mjs:176-192`):

| File | Contents |
| --- | --- |
| `DIAG.HEX` | Intel HEX for `4000h`, the file MON-3 loads |
| `DIAG.BIN` | The same bytes as a binary image for `4000h` |
| `diag.d8.json` | The symbol map |
| `diag.json` | Version, image ID, SHA-256, size and memory use |

Layout checks protect the program during its own tests. `START` must
be `4000h`. Variables start at `1000h` and end by `3FFFh`. Code and
tables end below `7FFFh`, leaving a spare byte for PROTECT below `8000h`
(`b95b2a9:tools/diag.mjs:152-157`, `b95b2a9:docs/diagnostics.md:54-58`). The image ID is
the first eight SHA-256 bytes calculated with its own field zeroed.
The build stores that ID and the first serial line prints it, tying a
log to its image (`b95b2a9:tools/diag.mjs:122-127`, `b95b2a9:tools/diag.mjs:158-162`,
`b95b2a9:diag/main.asm:161-170`).

MON-3 executes code and tables at its default `4000h` address. Variables,
block buffers and a 256-byte private stack occupy `1000h–3FFFh`
(`b95b2a9:diag/main.asm:10-17`, `b95b2a9:diag/vars.asm:8-10`, `b95b2a9:diag/vars.asm:168-172`).
Tests never write code or tables. RAM and PROTECT patterns use free RAM
after the stack and program, plus the `8000h–BFFFh` window. PROTECT
must first be disabled through MON-3 (`b95b2a9:docs/diagnostics.md:45-68`).

## Loading and running

MON-3 loads `DIAG.HEX` by either of two routes
(`b95b2a9:docs/diagnostics.md:70-85`, `b95b2a9:docs/board-run.md:36-52`):

- Over the FTDI port: set the terminal to 4800 baud, 8 data bits, no parity,
  2 stop bits and no flow control. Choose Intel HEX Load in MON-3's main menu
  and send `DIAG.HEX` as a plain text file. The digits show `PASS` when the
  load is good. If they show `FAIL`, set the terminal to wait a few
  milliseconds after each character or line and send it again.
- From a FAT32 card: copy `DIAG.HEX` to the card's root, fit the card and
  load the file through MON-3's Drive Access, Catalog (`Fn-F` in data entry
  mode). The card-selection prompt precedes all SD access, so you
  can then swap the FAT32 card for the TEC-OS card.

Execution starts at `4000h` with GO in MON-3 data-entry mode. The program
waits at LCD `Log on? GO=send` before any serial output, providing time
to enable terminal logging. GO then prints the header and requests the
test card. Another GO begins checks and AD returns to MON-3
(`b95b2a9:diag/main.asm:35-49`, `b95b2a9:docs/board-run.md:54-61`).

The initial SHAD check requires a short keypad-free interval. Keep off
the keypad until LCD row 2 changes from `Latch bit 0` to `SD1 MISO idle`,
under a second after GO. SHAD can expose ROM at `0000h`, making the
`0038h` and `0066h` vectors MON-3's (`b95b2a9:diag/memory.asm:330-345`,
`b95b2a9:docs/board-run.md:62-64`). At later questions, GO continues and AD skips
or leaves. Matrix Enter and Esc provide the same controls. LCD rows 2,
3 and 4 display check, result and totals. Completion restores MON-3 latch
settings through monitor calls and returns (`b95b2a9:diag/main.asm:94-112`,
`b95b2a9:docs/diagnostics.md:95-102`).

## The checks

The checks run in a fixed order (`b95b2a9:diag/main.asm:201-204`):

| Check | What it tests |
| --- | --- |
| SHAD | That latch bit 0 clear shows the ROM at `0000h–07FFh` and set shows RAM, as TEC-OS's boot expects (`b95b2a9:diag/memory.asm:338`) |
| SD1 | The card's data line with the card deselected (`b95b2a9:diag/sdcard.asm:467`) |
| SD2 | Card start-up along `SDINIT`'s path, with the tries each step used (`b95b2a9:diag/sdcard.asm:508`) |
| SD3 | The most polls each wait used over 64 reads, against TEC-OS's bounds (`b95b2a9:diag/sdcard.asm:577`) |
| SD4 | The card's capacity, maker and serial number and the agreement of its addressing mode (`b95b2a9:diag/sdcard.asm:708`) |
| SD5 | Repeated reads of the same blocks, compared (`b95b2a9:diag/sdtests.asm:81`) |
| SD6 | Read speed, timed by the DS1302 or by a stopwatch between two beeps (`b95b2a9:diag/sdtests.asm:231`) |
| SD7 | A read-only container check that follows `MOUNT`'s steps, and the first block past the container (`b95b2a9:diag/sdvol.asm:1-12`) |
| SD8 | The write test, described below (`b95b2a9:diag/sdwrite.asm:18`) |
| SD9 | Card removal and reinsertion as TEC-OS would see them (`b95b2a9:diag/sdwrite.asm:974`) |
| RAM | Free RAM and both EXPAND settings of the `8000h–BFFFh` window, which must hold different data (`b95b2a9:diag/memory.asm:100-106`) |
| PROT | That PROTECT stops a write in `4000h–7FFFh` and its removal lets the write land (`b95b2a9:diag/memory.asm:258`) |
| CLK | The CPU clock against one DS1302 second, with a `WARN` outside 2% of 4 MHz (`b95b2a9:diag/devices.asm:86-91`) |
| VDP | The PICO9918, found by TEC-OS's probe, and its frame rate (`b95b2a9:diag/devices.asm:164`) |
| LCD | The 20 × 4 LCD, by reading back two addresses (`b95b2a9:diag/devices.asm:271`) |
| GLCD | The graphics LCD's busy flag (`b95b2a9:diag/devices.asm:327`) |
| RTC | The DS1302's registers, read and not set (`b95b2a9:diag/devices.asm:357`) |
| INT | IM 1 interrupts through MON-3's vector at `0892h` (`b95b2a9:diag/devices.asm:453-461`) |
| KEYS | The code of each keypad and matrix key you press (`b95b2a9:diag/devices.asm:569`) |

Each check prints one serial line: its name, a status, then `key=value`
fields. Other lines begin with `# `. The first line starts `TEC1G-DIAG` and gives
version, image ID, size and MON-3 stack pointer. The final `SUMMARY`
line gives four totals (`b95b2a9:diag/main.asm:72-85`,
`b95b2a9:diag/main.asm:161-197`, `b95b2a9:docs/diagnostics.md:104-120`). The statuses are
(`b95b2a9:docs/diagnostics.md:122-127`):

| Status | Meaning |
| --- | --- |
| `PASS` | The board did what TEC-OS relies on |
| `WARN` | It worked, with a figure worth checking, given in the line |
| `FAIL` | It did not. The line gives what was read |
| `SKIP` | Not run, with the reason in `reason=` |

SD3 reports the headroom in TEC-OS's SD waits. Any wait using more than
a quarter of its bound receives WARN. That card completed the operation
but used more of the available margin, leaving less room for slower
responses (`b95b2a9:docs/diagnostics.md:168-173`).

## The SD write test

The write test must exercise SDWRITE without deliberately addressing
stored volumes. SD8 uses the region SD7 established as
free. This starts immediately beyond the container and ends before the
card's last block. Blocks 0–7 and every volume block are excluded
(`b95b2a9:diag/sdwrite.asm:7-16`, `b95b2a9:diag/sdwrite.asm:61-102`,
`b95b2a9:docs/diagnostics.md:213-220`).

SD8 first checks the earlier results. SD2, SD5 and SD7 must pass, SD3
must pass or warn and SD4 must establish matching capacity and addressing.
Otherwise it writes nothing and reports SKIP with a reason
(`b95b2a9:diag/sdwrite.asm:18-58`). Two further read-only checks must also pass
before confirmation (`b95b2a9:diag/sdwrite.asm:104-162`,
`b95b2a9:diag/sdwrite.asm:451-511`):

1. Block 0 must read twice exactly as SD7 found it.
2. Each power-of-two block from block 8 to the card's end is read twice and
   compared with block 0. A card that ignores its high address bits, as fake
   cards do, reads one of them as block 0.

Writing requires explicit `8` then GO confirmation. AD or any other key
skips it. Holding AD during the test stops at the next block
(`b95b2a9:diag/sdwrite.asm:166-175`, `b95b2a9:diag/sdwrite.asm:513-540`). Every block is
read twice and saved before receiving the pattern. After pattern readback,
the saved bytes are restored with TEC-OS SDWRITE and checked, with up
to three attempts (`b95b2a9:diag/sdwrite.asm:565-725`,
`b95b2a9:docs/diagnostics.md:248-266`).

The address restriction cannot control a faulty card's internal mapping.
Undetected wrapping or remapping can send a free-region write to used
storage. Detected aliases are reported and the affected block restored
(`b95b2a9:docs/diagnostics.md:218-220`, `b95b2a9:docs/diagnostics.md:371-377`). A safe
card procedure is therefore required even with those checks
(`b95b2a9:docs/board-run.md:7-25`):

1. Use a card you can lose, or save an image of the whole card first.
2. Write the TEC-OS starter image to it.
3. If the log shows `SD8 FAIL alias`, `SD8 FAIL restore-failed` or the note
   to restore the card from its backup, write the starter image or your
   backup back to the card before using it. Do not run TEC-OS on it first.

Reset or power loss during SD8 can leave the current block containing
the pattern. The backup must be kept until the run finishes
(`b95b2a9:docs/diagnostics.md:274-277`).

<a id="what-the-diagnostics-establish"></a>

## Diagnostic evidence and limits

The model-test source checks the diagnostic's control flow and address
arithmetic; these citations are not new execution receipts.
`test/diag.test.mjs` executes it in Debug80 with a stub monitor. Every
case reaching SD8 checks that write addresses exclude blocks 0–7, the
container and final card block. It also compares blocks 0–7 and every
volume block afterwards. Fixtures include starter, byte-addressed, fake
and wrapping cards, writes redirected to block 3 and failed restores
(`b95b2a9:test/diag.test.mjs:211-221`, `b95b2a9:test/diag.test.mjs:240-648`,
`b95b2a9:docs/diagnostics.md:401-447`). These source assertions concern modelled responses
and card state. They establish no physical-board result
(`b95b2a9:docs/diagnostics.md:15-18`).

MON-3 in the socket also leaves TEC-OS power-on behaviour untested.
Reset overlay, cold boot, mount and console need a separate run with the
TEC-OS ROM fitted. The diagnostic does not check the PICO picture,
8 × 8 LEDs, speaker or status LEDs. SDREAD also leaves CRC bytes unchecked
(`b95b2a9:docs/diagnostics.md:359-381`).

A reproducible board report includes the full serial log from
`TEC1G-DIAG` through SUMMARY, its image ID, card make and markings and
DIP switch settings. LCD or board observations absent from the log belong
with it (`b95b2a9:docs/board-run.md:76-85`). The resulting evidence applies to
that board, image and card.
