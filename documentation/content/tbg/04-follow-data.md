---
title: Following and editing data in memory
parent: TBG
nav_order: 4
nav_group: Using TBG
---

# 4. Following and editing data in memory

Registers hold pointers, counters and flags. Most real program state lives in RAM buffers, strings and tables. Once a loop walks past the end of a buffer or copies a string backwards, watching one fixed address stops helping as soon as the pointer moves on. You want Memory to follow the register walking the buffer. You also want to patch a byte or register right on the live machine to test a fix before editing source.

This chapter builds a ten-byte buffer-filling program and locks Memory onto `HL` so the window tracks every write. It then covers jumping across views with `Enter` and `G` and editing live registers and RAM with `E`.

## A buffer-filling target

Open `FILL.ASM` in `TED` on drive B (`A:TED B:FILL.ASM`), enter this short loop, save with `^S` and quit with `^Q`:

```asm
        ORG $0100
START:  LD HL,BUF
        LD B,4
FILL:   LD (HL),B
        INC HL
        DJNZ FILL
        RET
BUF:    DS 4
```

Assemble it with `TAS` and start it under TBG:

```text
A:SYSTEM>A:TAS B:FILL
FILL.COM written
A:SYSTEM>UNLOAD
A>TBG B:FILL
```

`FILL.COM` points `HL` at the four-byte `BUF` reservation at `010Ah`, loads `4` into `B` and loops four times. Each pass stores `B` at `(HL)`, advances `HL` and decrements `B` with `DJNZ`. At the end, `BUF` should hold `04 03 02 01`.

## Fixed memory and register-following memory

Memory shows sixteen bytes at a time, arranged as four rows of four bytes. Each row begins with its four-digit hex address, and `>` marks the selected byte cursor. The right end of row 1 displays the address source:

- **`FIX`** means Memory is anchored at a fixed address and stays there while you step. The first time you reach Memory with `Tab`, it opens as `FIX` at the current `PC`.
- **A register name (`HL`, `DE`, `BC`, `IX` or `IY`)** means Memory follows that register pair. Whenever an instruction changes the register, the Memory window moves with it.
- **A register name with `+` (`HL+`)** means Memory is still tracking that register, but you have scrolled away from offset zero. The offset stays locked as the register advances.

At the first stop of `FILL.COM` (`PC 0100`), pressing `Space` once executes `LD HL,BUF`. `PC` moves to `0103` and `HL` becomes `010A`, the address of `BUF`.

In Registers, move `>` onto `HL` (`Down` twice, `Right` once) and press `Enter`. Memory opens straight at `010Ah` with `HL` on the top right:

```text
010A>00 00 00 00 HL
010E 00 00 00 00
0112 00 00 00 00
0116 00 00 00 00
```

Stepping twice with `Space` runs `LD B,4` and then `LD (HL),B`, writing `04` directly under the cursor at `010Ah`:

```text
010A>04 00 00 00 HL
010E 00 00 00 00
0112 00 00 00 00
0116 00 00 00 00
```

Pressing `Space` once more executes `INC HL`. `HL` advances from `010Ah` to `010Bh`, and Memory moves with it automatically:

```text
010B>00 00 00 00 HL
010F 00 00 00 00
0113 00 00 00 00
0117 00 00 00 00
```

Pressing `Down` here peeks four bytes further ahead and changes row 1 to `010F>00 00 00 00 HL+`, showing that the window now tracks `HL` plus an offset.

![Following HL moves Memory from 010Ah to 010Bh as INC HL runs. Editing with E is restricted to program memory between 0100h and the lowest resident service.](/images/tbg/memory-follow.svg)

Now let the loop finish using the one-shot run from Chapter 3. Press `Esc` to return to Registers, `Tab` to open Code, move `>` down to `0109 RET` and press `R`. The remaining three iterations run at full speed and stop before `RET`.

To inspect the finished buffer from its start, press `Tab` twice to reach Memory, press `G`, type `10A` and press `Enter`. `G` switches Memory to `FIX` at `010Ah`, and the top row reads `04 03 02 01`.

## Navigating memory and following pointers

Inside Memory, the arrow keys give you fine and coarse movement without wrapping unexpectedly across the edges of the 64 KiB address space:

- **`Left` / `Right`** move the `>` byte cursor one byte at a time, scrolling across row edges automatically.
- **`Up` / `Down`** scroll one row of four bytes.
- **`Ctrl+Up` / `Ctrl+Down`** jump a full page of sixteen bytes.
- **`G`** prompts for a hexadecimal address (`Backspace` deletes a digit, `Esc` cancels). In Memory, `G` jumps Memory to that fixed address. In any other view, `G` opens Code at that address.

Memory clamps cleanly at `0000h` and `FFFFh` instead of wrapping round.

You can also follow addresses directly from Code, Stack and Registers using `Enter`:

- In **Code**, pressing `Enter` on a jump or call instruction (`JP`, `JR`, `DJNZ`, `CALL`) opens Code at its destination address.
- In **Stack**, pressing `Enter` on any of the four slots opens Memory at that slot's address.
- In **Registers**, pressing `Enter` on `HL`, `DE`, `BC`, `IX` or `IY` opens Memory following that 16-bit pair. `AF` holds the accumulator and flags rather than a pointer, so it does not open Memory.

In every case, `Esc` steps back one level to where you started.

## Editing live registers and bytes

Reading memory tells you what went wrong. Editing live state lets you test a theory on the spot without leaving TBG to rebuild the `.COM` file.

To change a CPU register, select its pair with the arrow keys in **Registers** and press `E`. Type the new hexadecimal value and press `Enter` to write it (`Esc` cancels). That lets you force a loop counter to `1` to inspect the final iteration, flip a flag in `AF` to take the other branch or point `HL` at a test buffer.

In **Memory**, position `>` on the byte you want to change and press `E`. The top right tag switches to `EDT`, meaning hex keys now write bytes instead of running commands. Typing hexadecimal digits writes straight to RAM. After the first digit, TBG displays the half-entered byte with an underscore, such as `3_`. Typing the second digit writes the completed byte immediately and advances the cursor to the next byte with no `Enter` needed between bytes. Typing `3E2AC9` writes three bytes in sequence and leaves the cursor on the fourth.

Pressing `Esc` discards any unfinished first digit and leaves edit mode while keeping every completed byte you wrote.

TBG enforces one safety fence around editing: you can only modify program memory from `0100h` up to the lowest resident service above the TPA. Page zero (`0000h–00FFh`), TBG itself and ROM are protected. Trying to write there displays `Not writable` or `End of range` and leaves the byte untouched so a slip in `EDT` mode cannot crash the debugger under your feet.

Through four chapters you have worked entirely in raw hexadecimal addresses: `0103h`, `0109h`, `010Ah`. On a ten-byte loop that is manageable. On a thousand-byte program that you keep editing and reassembling, translating addresses by hand gets old fast. Chapter 5 adds the optional symbols service so TBG displays your own assembly labels.
