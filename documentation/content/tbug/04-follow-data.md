---
title: Following and editing data in memory
parent: TBUG
nav_order: 4
nav_group: Using TBUG
---

# 4. Following and editing data in memory

Registers hold counters and pointers, while most of your program's real state sits in RAM buffers, strings and tables. When a loop writes one byte too far or copies a string backwards, staring at a fixed address stops helping the moment the pointer moves on. You want Memory locked onto the register walking the buffer, and sometimes you want to patch a register or byte right in live RAM to test a fix before going back to `TED`.

## A buffer-filling target

On drive B, open `FILL.ASM` (`TED FILL.ASM`), enter this ten-byte loop, save with `^S` and quit with `^Q`:

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

Assemble it and bring it up in TBUG:

```text
B>TAS FILL
FILL.COM written
B>TBUG.SVC FILL
```

`FILL.COM` points `HL` at the four-byte `BUF` reservation at `010Ah`, loads `4` into `B` and loops four times. Each pass stores `B` at `(HL)`, advances `HL` and decrements `B` with `DJNZ`. At `RET`, `BUF` should hold `04 03 02 01`.

## Fixed memory and register-following memory

Memory shows sixteen bytes as four rows of four. Each row starts with its four-digit hex address, `>` marks the selected byte and the top right corner names the address source:

- **`FIX`** anchors Memory to a fixed address that stays put as you step. The first time you open Memory with `M` or `Tab`, it opens as `FIX` at `PC`.
- **A register pair (`HL`, `DE`, `BC`, `IX` or `IY`)** locks Memory to that register. Whenever an instruction changes the pair, the window moves with it.
- **A pair with `+` (`HL+`)** means Memory still tracks that register, but you have scrolled away from offset zero. That offset stays locked as the register advances.

Try it on `FILL`. At the entry stop (`PC 0100`), tap `F8` (`Fn+8`) once to run `LD HL,BUF`. `PC` moves to `0103` and `HL` becomes `010A`, the address of `BUF`.

In Registers, move `>` onto `HL` (`Down` twice, `Right` once) and hit `Enter`. Memory opens straight at `010Ah` with `HL` in the top right corner:

```text
010A>00 00 00 00 HL
010E 00 00 00 00
0112 00 00 00 00
0116 00 00 00 00
```

Tap `F8` twice. `LD B,4` loads the counter, then `LD (HL),B` writes `04` right under the cursor at `010Ah`:

```text
010A>04 00 00 00 HL
010E 00 00 00 00
0112 00 00 00 00
0116 00 00 00 00
```

Tap `F8` once more for `INC HL`. `HL` moves to `010Bh`, and Memory steps forward to `010Bh` with it:

```text
010B>00 00 00 00 HL
010F 00 00 00 00
0113 00 00 00 00
0117 00 00 00 00
```

Move the cursor down past the bottom row to scroll further ahead, and row 1 switches to `HL+`, reminding you that you are looking past `HL` at a fixed offset.

![Following HL moves Memory from 010Ah to 010Bh as INC HL runs. Editing with E is restricted to program memory between 0100h and the lowest resident service.](/images/tbug/memory-follow.svg)

Now finish the loop in one move using the one-shot run from Chapter 3. Press `C` to jump to Code, scroll `>` down to `0109 RET` and press `F5`. The remaining three passes run at full speed and halt before `RET`.

Press `M` to open Memory, press `G`, type `10A` and press `Enter`. `G` switches Memory to `FIX` at `010Ah`, and the top row reads `04 03 02 01`.

## Moving around and following pointers

Memory gives you byte, row and 16-byte movement without silently wrapping across the ends of the 64 KiB address space:

- **`Left` / `Right`** walk the `>` cursor byte by byte, moving across row edges automatically.
- **`Up` / `Down`** move the `>` cursor by one row (four bytes), scrolling once you pass the top or bottom row.
- **`Ctrl+Up` / `Ctrl+Down`** jump sixteen bytes at a time.
- **`G`** opens a hex address prompt (`Backspace` rubs out a digit, `Esc` cancels). In Memory, `G` jumps Memory to that fixed address. Elsewhere, `G` opens Code there.

Scrolling stops cleanly at `0000h` and `FFFFh`.

`Enter` also follows addresses across views:

- In **Code**, `Enter` on a jump or call (`JP`, `JR`, `DJNZ`, `CALL`) opens Code at the target address.
- In **Stack**, `Enter` on any slot opens Memory at that slot's address.
- In **Registers**, `Enter` on `HL`, `DE`, `BC`, `IX` or `IY` opens Memory following that pair. `AF` holds the accumulator and flags rather than an address, so it stays out of pointer following.

In every case, `Esc` returns one level to where you started.

## Editing live registers and RAM

Inspecting state shows what went wrong. Changing state live lets you test a fix on the spot without leaving TBUG to rebuild.

In **Registers**, highlight any pair with the arrows and press `E`. Type the new hexadecimal value and hit `Enter` (`Esc` cancels). You can force a loop counter down to `1` to watch the last pass, flip a flag in `AF` to force a branch or aim `HL` at a test buffer.

In **Memory**, put `>` on a byte and press `E`. The top right tag switches to `EDT` so hex keys write bytes instead of running commands. After the first digit, TBUG shows the half-typed byte with an underscore, like `3_`. Type the second digit and TBUG writes the byte immediately and steps the cursor to the next address, with no `Enter` needed between bytes. Typing `3E2AC9` writes three consecutive bytes and leaves `>` on the fourth.

`Esc` drops any unfinished first digit and leaves edit mode while keeping every completed byte you wrote.

One safety fence guards `EDT` mode: TBUG only writes inside program memory, from `0100h` up to the lowest resident service. Page zero (`0000h–00FFh`), TBUG itself and ROM are off limits. Trying to write there prints `Not writable` or `End of range` and leaves the byte alone so a stray hex digit cannot knock the debugger out from under you.
