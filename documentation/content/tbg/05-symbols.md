---
title: Debugging with source symbols
parent: TBUG
nav_order: 5
nav_group: Using TBUG
---

# 5. Debugging with source symbols

Hexadecimal addresses are fine on a ten-byte loop. Once a program grows past a few routines, every edit near the top of your source shifts every address below it after reassembly, and checking `014Dh` against a listing breaks your stride right when you are closing in on a bug.

`TAS` writes a companion `NAME.TBG` symbol file beside every `NAME.COM` it assembles. Symbol support is built right into `TBUG.SVC`, so whenever a matching `.TBG` file sits beside the `.COM` file, TBUG loads your labels automatically with no extra service to install.

## Verifying `.TBG` symbol files

Stale symbols are worse than none. Edit `FILL.ASM` and copy over a fresh `FILL.COM` without updating `FILL.TBG`, and old labels would land in the middle of the wrong instructions.

Each time TBUG stops a program at launch, it checks for a `NAME.TBG` file beside `NAME.COM` and reads its trailing header record. That header holds the image's end address and a 16-bit checksum of every byte in the assembled image. TBUG sums the loaded image in RAM and checks both numbers.

![TAS writes NAME.TBG beside NAME.COM. TBUG checks the end address and image checksum at launch, enabling SY, Code labels and the Symbols view on Y when both match.](/images/tbg/symbols-load.svg)

When both match, symbols turn on and `SY` lights up at the right end of row 2 in Registers:

```text
>PC 0100   SP 98FEST
 AF 0000   BC 0000SY
 DE 0000   HL 0000..
 IX 0000   IY 0000..
```

When the `.TBG` file is absent or stale, TBUG ignores it quietly, `SY` stays off and debugging continues in raw hex until you reassemble with `TAS`.

## Labels in Code

Start `TBUG.SVC FILL` from `B>` and tap `F8` (`Fn+8`) four times (`LD HL,BUF`, `LD B,4`, `LD (HL),B`, `INC HL`) so `PC` lands on `0107h`. Press `C` to jump to Code:

```text
>→0107 DJNZ FILL
  0109 RET
BUF:
  010A INC B
```

Three details jump out on those four lines:

- **Label rows:** Any label defined at an address sits on its own row right above it (`START:`, `FILL:`, `BUF:`), while the instruction below keeps its hex address.
- **Named jumps, calls and indirects:** Branch targets (`DJNZ FILL`), calls and bracketed addresses (`(nn)`) show label names when a match exists. Immediate 16-bit loads like `LD HL,010A` stay numeric because a 16-bit literal could be a plain constant like `$1234` rather than an address.
- **Data still disassembles:** On row 4, `010A INC B` sits right under `BUF:`. The `04h` you just stored in `BUF` happens to be the Z80 opcode for `INC B`. Seeing `BUF:` directly above `010A` tells you at once that those bytes are your data buffer, not code.

## The fifth view: Symbols

Whenever TBUG matches a `.TBG` file, a fifth view called **Symbols** becomes active. Jump straight to it with `Y` (or cycle to it with `Tab` after Memory) on `FILL`:

```text
>0100 START
 0105 FILL
 010A BUF
```

Symbols lists global labels in ascending address order. `Up` and `Down` move `>` through the list. Hit `Enter` to open Code at that label without disturbing `PC` (`Esc` brings you back to Symbols), or press `Space` to toggle a breakpoint straight on that label's address without visiting Code first.
