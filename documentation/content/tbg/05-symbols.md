---
title: Debugging with source symbols
parent: TBG
nav_order: 5
nav_group: Using TBG
---

# 5. Debugging with source symbols

By the time a program grows past a few routines, hexadecimal addresses slow you down. Every time you insert an instruction near the top of your source and reassemble with `TAS`, every label below it shifts by a few bytes. Checking `014Dh` against your listing breaks your concentration just when you are trying to follow a bug.

`TAS` already writes a symbol file called `NAME.TBG` beside every `NAME.COM` it assembles. To display those labels on the LCD, you load a second resident service, `TBGSYM.SVC`, on top of `TBG.SVC`.

## Symbols as a separate service

Every byte of resident debugger code comes directly out of the transient program area below it. TBG's core service uses about 7.5 KiB within a hard 8 KiB ceiling. Folding symbol loading, checksum verification, label lookup and a fifth view into that core would push every session past that limit. You would pay that memory cost even when debugging a raw `.COM` with no source or testing a large program that needs every free kilobyte.

Keeping symbols in `TBGSYM.SVC` makes that memory cost a choice:

- **`TBG.SVC`** (about 7.5 KiB) publishes a named registry record called `TBGHOOK` containing a table of extension hooks.
- **`TBGSYM.SVC`** (about 1.25 KiB) declares `TBGHOOK` as a dependency, loads directly below `TBG.SVC` at `INIT` and installs its symbol callbacks into that table.
- `TBG.SVC` places the program ceiling below the lowest resident service, so `TBGSYM.SVC` sits safely above the program being debugged.

![TBG.SVC publishes TBGHOOK in about 7.5 KiB. TBGSYM.SVC loads below it in about 1.25 KiB, checks NAME.TBG at each launch and peels off cleanly with UNLOAD.](/images/tbg/tbgsym-hook.svg)

That layered design keeps the workflow simple. Load `TBG` first and `TBGSYM` second, once per session:

```text
A>TBG
A>TBGSYM
A>TBG B:FILL
```

CP/M prints `TBGSYM?` (or `TBGSYM.SVC?`) if `TBG.SVC` is not already resident. It also refuses the load when fewer than 1.25 KiB remain free above `8000h`. Type `UNLOAD` at the prompt whenever you want that memory back. TEC-OS always removes the newest resident service first. `UNLOAD` therefore runs `TBGSYM.SVC`'s removal routine, restores `TBGHOOK` and leaves `TBG.SVC` resident without symbols.

You can also combine `TBGSYM.SVC` with an armed launch from Chapter 3:

```text
A>TBG ARM
A>TBGSYM
A>B:FILL
```

## Verifying `.TBG` symbol files

Stale symbols are worse than no symbols at all. Suppose you edit `FILL.ASM` and rebuild `FILL.COM` on another machine without copying the new `FILL.TBG`. Labels at old addresses would point straight into the middle of the wrong instructions.

Each time TBG launches a program with `TBGSYM.SVC` resident, `TBGSYM` looks for the `.TBG` file beside the `.COM` file and reads its trailing header record. That header records the image's end address and a 16-bit modular checksum of every byte in the assembled `.COM` image. `TBGSYM` sums the loaded image in memory and compares both values.

- **Exact match:** Symbols activate for the session and `SY` appears at the right end of row 2 in Registers:

```text
>PC 0100   SP 98FEST
 AF 0000   BC 0000SY
 DE 0000   HL 0000..
 IX 0000   IY 0000..
```

- **Missing or mismatched `.TBG`:** `TBGSYM` ignores the file silently, `SY` stays absent and TBG debugs normally with raw hex addresses. Reassembling the source with `TAS` writes a fresh matching pair of `.COM` and `.TBG` files.

## Working with labels on the LCD

Launch `TBG B:FILL` with `TBGSYM.SVC` loaded and step four times with `Space` (`LD HL,BUF`, `LD B,4`, `LD (HL),B`, `INC HL`) so `PC` reaches `0107h`. Pressing `Tab` opens Code with your own labels inline:

```text
>→0107 DJNZ FILL
  0109 RET
BUF:
  010A INC B
```

Three details stand out on those four lines:

- **Label rows:** A label defined at an address sits on its own row immediately above that address, such as `START:`, `FILL:` and `BUF:`. The instruction below retains its hexadecimal address.
- **Named branch and indirect operands:** Jump targets (`DJNZ FILL`), call targets and bracketed addresses (`(nn)`) show label names wherever a match exists. Immediate 16-bit loads such as `LD HL,010A` stay numeric because a raw 16-bit constant could be a number like `$1234` rather than an address.
- **Data still disassembles in Code:** The last line reads `010A INC B`. That address is `BUF:`, where `LD (HL),B` just wrote `04h`, and `04h` happens to be the Z80 opcode for `INC B`. Seeing `BUF:` right above `010A` tells you immediately that those bytes belong to your data buffer rather than executable code.

![TBGSYM.SVC active on FILL.COM in the TEC-OS Viewer: the 9918 console stays at the launch prompt while Code on the LCD shows DJNZ FILL and the BUF: label row.](/images/tbg/viewer-tbgsym-code.png)

## The fifth view: Symbols

When `TBGSYM.SVC` matches a `.TBG` file, a fifth view called **Symbols** joins the `Tab` ring right after Memory (and one `Shift+Tab` backward from Registers). Press `Tab` from Memory to open it on `FILL.COM`:

```text
>0100 START
 0105 FILL
 010A BUF
```

Symbols lists the program's global labels in ascending address order:

- **`Up` / `Down`** move `>` through the list.
- **`Enter`** jumps directly to Code at the selected label without moving `PC`. Pressing `Esc` returns to your place in Symbols.
- **`B`** toggles a breakpoint at the selected label's address directly from Symbols, saving a trip through Code when you already have a routine name in mind.

You now have the complete TBG workbench: building a baseline in `TED` and `TAS`, inspecting all four core views on the LCD, stopping full-speed programs four ways, editing live RAM and loading source symbols on demand. Chapter 6 gathers every key, indicator, troubleshooting check and build command into one quick reference.
