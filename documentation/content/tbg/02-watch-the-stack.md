---
title: Stepping through code, registers and the stack
parent: TBG
nav_order: 2
nav_group: First session
---

# 2. Stepping through code, registers and the stack

Stepping through `HELLO.COM` in Chapter 1 showed registers changing while the main console stayed clean, yet you still had to picture the instructions from your source listing. Once a real program misbehaves, mental tracking breaks down fast. A subroutine returns to the wrong address, a loop runs one time too many or a `POP` pulls back the wrong register. Diagnosing those failures requires seeing the instructions in memory beside the stack underneath `SP`.

This chapter builds a six-byte program that exercises registers, a stack push and a stack pop. Through it you tour TBG's views and read disassembled instructions directly on the LCD. Along the way you compare word order in Stack against byte order in Memory and use the three stepping scopes that control how TBG handles calls.

## A six-byte target for the stack

Open `STEP.ASM` in `TED` on drive B (`A:TED B:STEP.ASM`), enter this six-byte program, save with `^S` and quit with `^Q`:

```asm
        ORG $0100
START:  LD HL,$1234
        PUSH HL
TAKE:   POP DE
        RET
```

Running `TAS` turns the six-byte source into `STEP.COM`:

```text
A:SYSTEM>A:TAS B:STEP
STEP.COM written
```

Running `B:STEP` on its own prints nothing and returns immediately to the prompt. All of its work happens inside the CPU and on the stack, which makes it a clean target for TBG. Every instruction changes one visible piece of machine state without noise from console I/O.

Make sure `TBG.SVC` is resident (unload `SHELL.SVC` first if you rebooted) and launch `STEP.COM` under TBG:

```text
A>TBG B:STEP
```

Click the character LCD if you are in the Viewer. The Registers view opens with `>PC 0100   SP 98FEST` and all six 16-bit pairs zeroed.

## Moving between views

Eighty character cells cannot display registers, disassembly, stack and memory at the same time. TBG therefore divides the machine into four views arranged in a ring:

1. **Registers** displays `PC`, `SP`, the six 16-bit pairs, flags and the stop code.
2. **Code** disassembles instructions from memory around `PC`.
3. **Stack** displays four 16-bit words starting at `SP`.
4. **Memory** displays sixteen raw bytes as four rows of four.

`Tab` steps forward through the ring and `Shift+Tab` steps backward. Whenever the view changes, its name flashes across row 1 for about half a second (`CODE`, `STACK`, `MEMORY`). The view's own top row then returns. Pressing any key during that flash clears the title immediately and runs the key's action, so you never have to wait once you know the ring order.

![Tab cycles through Registers, Code, Stack and Memory while Shift+Tab reverses. Enter drills down from a register, stack slot or branch, and Esc steps back one level.](/images/tbg/views.svg)

You can also jump directly into a related view instead of cycling with `Tab`. In Registers, the arrow keys move the `>` marker around the grid. Pressing `Enter` on `PC` opens Code at the stopped instruction, and pressing `Enter` on `SP` opens Stack. Pressing `Esc` returns one level back to the view you came from. At the top level, with no earlier view on that one-step history, `Esc` displays `Quit? Enter yes`.

## Reading the Code view

From the first stop of `STEP.COM` in Registers, pressing `Space` once runs `LD HL,$1234`. `PC` advances three bytes from `0100` to `0103`, and `HL` becomes `1234`.

Pressing `Tab` once moves into Code:

```text
>→0103 PUSH HL
  0104 POP DE
  0105 RET
  0106 NOP
```

Every number in Code is hexadecimal without a `$` prefix. The first two columns carry separate status markers so one never hides the other. Column 1 holds `>` for the row you are inspecting. Column 2 holds `→` for the instruction at `PC`. At `0103h` both marks coincide, producing `>→0103 PUSH HL`.

Browsing in Code moves the `>` selection without changing `PC`. `Up` and `Down` move through decoded instructions, scrolling once you pass the top or bottom of the four-row window. You can inspect instructions ahead of `PC` or scroll backwards into earlier code. Near `PC`, stepping back lands cleanly on instruction starts. Farther back, TBG reconstructs instruction boundaries from the preceding bytes. Whenever you have wandered away from the stopped instruction, `Left` snaps `>` straight back to `PC`.

When an instruction is too wide for twenty columns, its row ends with `>` at the right edge. Pressing `Shift+Right` scrolls the text sideways to reveal the rest (with `<` at the left edge), and `Shift+Left` scrolls it back. `Up` and `Down` keep that sideways scroll position from line to line while any other key resets it.

The fourth line reads `0106 NOP` even though `STEP.COM` ended at `0105h` with `RET`. The Z80 stores instructions and data in the same flat address space. A raw disassembler therefore keeps turning whatever bytes lie past the end of the program into mnemonics. Zero bytes appear as `NOP`, and in `HELLO.COM` the `'H'` (`48h`) of `"Hello from TEC-OS"` appeared as `LD C,B`. Knowing where your program ends keeps those trailing bytes from fooling you.

## Watching the stack move

With `PUSH HL` next at `0103h`, pressing `Tab` once more from Code opens Stack:

```text
>SP 98FE  9C51
    9900  16C3
    9902  01E4
    9904  003D
```

Stack displays four 16-bit words starting at the current `SP`. The word `9C51` at `98FEh` is the exit address TBG pushed before starting `STEP.COM` so `RET` returns into TBG. The exact address varies with your build and resident services, so keep an eye on your own top address (`98FE` here).

You do not need to return to Registers to step. Pressing `Space` while still looking at Stack executes `PUSH HL` and updates the screen in place:

```text
>SP 98FC  1234
    98FE  9C51
    9900  16C3
    9902  01E4
```

The Z80 stack grows downwards through memory. Pushing a 16-bit pair subtracts two from `SP` and writes the two bytes at the new lower address. `SP` dropped from `98FE` to `98FC`, `1234` appeared at the top slot and TBG's exit word `9C51` shifted down to row 2. Whenever `SP` changes, Stack resets the selection to the top slot so pushes and pops stand out immediately.

Pressing `Enter` on that top stack slot opens Memory directly at `98FCh`:

```text
98FC>34 12 51 9C FIX
9900 C3 16 E4 01
9904 3D 00 00 00
9908 00 00 00 00
```

The first two bytes are `34 12`, not `12 34`. Because the Z80 is little-endian, it stores the low byte (`34h`) at the lower address (`98FCh`) and the high byte (`12h`) at the next address (`98FDh`). Stack pairs those bytes back into 16-bit words because `PUSH`, `POP`, `CALL` and `RET` operate on words. Memory prints raw bytes in ascending address order. Both views inspect the exact same RAM through two lenses.

![Space executes PUSH HL, moving SP down two bytes from 98FEh to 98FCh. Stack displays the word 1234 while Memory displays the bytes in address order as 34 12.](/images/tbg/stack-step.svg)

Pressing `Esc` returns to Stack, and `Shift+Tab` returns to Code with `→` sitting on `0104 POP DE`. One `Space` executes the pop, and `Shift+Tab` returns to Registers. `DE` now holds `1234`, `HL` still holds `1234` and `SP` is back at `98FE`. Pressing `R` lets `RET` finish `STEP.COM`, leaving `PC` at `----`, `SP` at `9900` and `EX` on the top right. Pressing `Esc`, then `Enter`, returns to the CP/M prompt.

## Three ways to step

Single-stepping with `Space` is exact, but real programs call subroutines and TEC-OS BDOS routines constantly. Stepping into a routine that prints a twenty-character string would keep you tapping `Space` for hundreds of instructions. TBG puts three stepping scopes on `Space` and its modifiers:

- **`Space` (Step Into):** Executes one instruction. On a `CALL` inside your program, TBG stops at the subroutine's first instruction so you can trace inside it.
- **`Shift+Space` (Step Over):** Runs a `CALL` at full speed until it returns and stops at the instruction immediately after the `CALL`. On any instruction other than a call, it behaves just like `Space`.
- **`Ctrl+Space` (Step Out):** Traces over nested calls until a `RET` lifts `SP` above its starting value. While it runs, the bottom row counts the steps. If a subroutine loops for a long time before returning, pressing any key interrupts the trace and hands control back to you.

Both `Space` and `R` wait until you release the key before resuming the Z80. That key-release guard ensures your debugger keypress never leaks into a program polling the matrix keyboard.

Stepping works best once you are already near the suspect code. Tapping `Space` through an initialisation loop or a menu handler wastes time. Chapter 3 covers full-speed execution and the four ways TBG stops a running program on demand.
