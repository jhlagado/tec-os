---
title: Debugging with source symbols
parent: TBG
nav_order: 5
nav_group: Using TBG
---

# 5. Debugging with source symbols

Hexadecimal addresses are fine on a ten-byte loop. Once a program grows past a few routines, every edit near the top of your source shifts every address below it after reassembly, and checking `014Dh` against a listing breaks your stride right when you are closing in on a bug.

`TAS` already writes a companion `NAME.TBG` symbol file beside every `NAME.COM`. Loading a second resident service, `TBGSYM.SVC`, brings those labels onto the LCD.

## Symbols as an optional service

Every kilobyte of resident debugger code comes out of the TPA below it. `TBG.SVC` stays inside an 8 KiB cap and uses about 7.5 KiB. Baking symbol loading, checksum checks, label lookup and a fifth view into the core would push every session past that cap, even when you are debugging a bare `.COM` with no source or testing a big program that needs all the RAM it can get.

Splitting symbols into `TBGSYM.SVC` leaves the trade in your hands:

- **`TBG.SVC`** (~7.5 KiB) publishes a registry record called `TBGHOOK` holding a table of extension hooks.
- **`TBGSYM.SVC`** (~1.25 KiB) requires `TBGHOOK`, loads directly beneath `TBG.SVC` and plugs its symbol routines into that table.
- Because TBG places the program ceiling below the lowest resident service, `TBGSYM.SVC` sits safely above the program under test.

![TBG.SVC publishes TBGHOOK in about 7.5 KiB. TBGSYM.SVC loads below it in about 1.25 KiB, checks NAME.TBG at each launch and peels off cleanly with UNLOAD.](/images/tbg/tbgsym-hook.svg)

Install `TBG` first and `TBGSYM` second on drive A, once per session, then switch back to drive B:

```text
A>TBG
A>TBGSYM
A>B:
B>TBG FILL
```

CP/M prints `TBGSYM?` if `TBG.SVC` is not yet resident or if less than 1.25 KiB remains free above `8000h`. Whenever you want that 1.25 KiB back, run `UNLOAD`. TEC-OS always removes the newest resident service first, so `UNLOAD` detaches `TBGSYM.SVC`, restores `TBGHOOK` and leaves `TBG.SVC` resident without symbols.

You can also pair `TBGSYM` with an armed launch from Chapter 3:

```text
A>TBG ARM
A>TBGSYM
A>B:
B>FILL
```

## Verifying `.TBG` symbol files

Stale symbols are worse than none. Edit `FILL.ASM` and copy over a fresh `FILL.COM` without updating `FILL.TBG`, and old labels would land in the middle of the wrong instructions.

Each time TBG starts a program while `TBGSYM` is resident, `TBGSYM` opens the `.TBG` file beside the `.COM` and reads its trailing header record. That header holds the image's end address and a 16-bit checksum of every byte in the assembled image. `TBGSYM` sums the loaded image in RAM and checks both numbers.

When both match, symbols turn on and `SY` lights up at the right end of row 2 in Registers:

```text
>PC 0100   SP 98FEST
 AF 0000   BC 0000SY
 DE 0000   HL 0000..
 IX 0000   IY 0000..
```

When the `.TBG` file is absent or stale, `TBGSYM` ignores it quietly, `SY` stays off and TBG works in raw hex until you reassemble with `TAS`.

## Labels in Code

Start `TBG FILL` with `TBGSYM` loaded and tap `Space` four times (`LD HL,BUF`, `LD B,4`, `LD (HL),B`, `INC HL`) so `PC` lands on `0107h`. Press `Tab` to open Code:

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

Whenever `TBGSYM` matches a `.TBG` file, a fifth view called **Symbols** joins the `Tab` ring right after Memory (and one `Shift+Tab` backward from Registers). Tab to it on `FILL`:

```text
>0100 START
 0105 FILL
 010A BUF
```

Symbols lists global labels in ascending address order. `Up` and `Down` move `>` through the list. Hit `Enter` to open Code at that label without disturbing `PC` (`Esc` brings you back to Symbols), or press `B` to toggle a breakpoint straight on that label's address without visiting Code first.
