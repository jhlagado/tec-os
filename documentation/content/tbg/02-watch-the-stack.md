---
title: Stepping through code, registers and the stack
parent: TBG
nav_order: 2
nav_group: First session
---

# 2. Stepping through code, registers and the stack

Stepping through `HELLO.COM` proved you could watch registers change while the console stayed untouched, but you still had to remember which instruction lived at `0103h`. On a real bug that mental map collapses quickly. A routine returns to the wrong address, a loop runs one time too many or a `POP` pulls back the wrong pair. To catch those mistakes you need the disassembled instructions and the live stack right in front of you.

## A six-byte stack target

Still on drive B (`B>`), open `STEP.ASM` in `TED` (`TED STEP.ASM`), type these six bytes of Z80 code, save with `^S` and quit with `^Q`:

```asm
        ORG $0100
START:  LD HL,$1234
        PUSH HL
TAKE:   POP DE
        RET
```

Assemble it with `TAS STEP` so `STEP.COM` lands on drive B. If you run `STEP` on its own, nothing prints and `B>` comes right back. All of its work happens inside the CPU and on the stack, which gives you a quiet, clean target where every instruction alters one visible piece of state.

Launch it under TBG (if you rebooted since Chapter 1, unload `SHELL.SVC` and run `TBG` on `A>` first, then switch to `B:`):

```text
B>TBG STEP
```

Registers opens on the LCD with `>PC 0100   SP 98FEST` and all six register pairs zeroed.

## Four views in a ring

Eighty character cells cannot fit registers, disassembly, stack and memory at once, so TBG splits them into four views arranged in a loop:

1. **Registers** shows `PC`, `SP`, the six 16-bit pairs, flags and the stop code.
2. **Code** disassembles instructions around `PC`.
3. **Stack** lists four 16-bit words starting at `SP`.
4. **Memory** displays sixteen raw bytes as four rows of four.

`Tab` steps forward around the ring and `Shift+Tab` steps backward. Each switch flashes the view's name (`CODE`, `STACK`, `MEMORY`) on row 1 for about half a second before its real top row appears. Any key pressed during that flash clears the title immediately and runs at once, so once you know the ring order you never wait on the animation.

![Tab cycles through Registers, Code, Stack and Memory while Shift+Tab reverses. Enter drills down from a register, stack slot or branch, and Esc steps back one level.](/images/tbg/views.svg)

You can also drill straight into a view instead of tabbing around the ring. In Registers, the arrow keys move `>` across the grid. Hit `Enter` on `PC` to open Code at the stopped instruction, or `Enter` on `SP` to open Stack. `Esc` steps back one level to where you came from. Once that one-step history is empty, `Esc` brings up `Quit? Enter yes`.

## Reading disassembled code

From the entry stop of `STEP`, tap `Space` once. `LD HL,$1234` runs, moving `PC` to `0103` and loading `1234` into `HL`. Now press `Tab` once to switch to Code:

```text
>→0103 PUSH HL
  0104 POP DE
  0105 RET
  0106 NOP
```

Numbers in Code are hexadecimal with no `$` prefix. Two dedicated marker columns keep selection and execution separate so neither ever hides the other: `>` in column 1 marks the row you are browsing, and `→` in column 2 marks `PC`. On `0103`, both sit together as `>→0103 PUSH HL`.

`Up` and `Down` move `>` through decoded instructions and scroll freely before or after `PC` without changing where the program stopped. Near `PC`, stepping backwards lands cleanly on instruction starts. Farther back, TBG works out instruction boundaries from the preceding bytes. Whenever you have scrolled away and want to snap straight back to `PC`, press `Left`.

Long instructions that run past twenty columns end with `>` at the right edge. `Shift+Right` pans the text sideways to reveal the rest (marking the left edge with `<`), and `Shift+Left` pans back. `Up` and `Down` carry that sideways offset from line to line while any other key resets it.

At the bottom sits `0106 NOP`, even though `STEP.COM` ended at `0105h` with `RET`. A Z80 keeps code and data in the same flat address space, so a raw disassembler keeps turning whatever bytes follow your program into instructions. Zeros come out as `NOP`, and in `HELLO.COM` the `'H'` (`48h`) of `"Hello from TEC-OS"` came out as `LD C,B`. Keeping track of where your code ends keeps trailing garbage from throwing you off.

## Watching the stack move

With `PUSH HL` lined up at `0103h`, press `Tab` once more to open Stack:

```text
>SP 98FE  9C51
    9900  16C3
    9902  01E4
    9904  003D
```

Stack displays four 16-bit words starting at `SP`. That top word, `9C51` at `98FEh`, is the exit address TBG pushed before starting `STEP.COM` so `RET` lands back inside TBG. Your exact address depends on the build and resident services, so keep an eye on your own starting `SP`.

You do not need to switch back to Registers to step. Tap `Space` right here in Stack and watch `PUSH HL` execute in place:

```text
>SP 98FC  1234
    98FE  9C51
    9900  16C3
    9902  01E4
```

On a Z80, the stack grows downwards. Pushing a 16-bit pair subtracts two from `SP` and stores the value at the new lower address. `SP` dropped from `98FE` to `98FC`, `1234` appeared on row 1 and TBG's return address `9C51` slid down to row 2. Whenever `SP` moves, Stack resets `>` to the top slot so pushes and pops jump out at you.

Now hit `Enter` on that top slot to open Memory at `98FCh`:

```text
98FC>34 12 51 9C FIX
9900 C3 16 E4 01
9904 3D 00 00 00
9908 00 00 00 00
```

The first two bytes read `34 12`, not `12 34`. Because the Z80 is little-endian, the low byte (`34h`) sits at the lower address (`98FCh`) and the high byte (`12h`) sits above it (`98FDh`). Stack pairs those bytes back into 16-bit words because `PUSH`, `POP`, `CALL` and `RET` work on words. Memory shows raw bytes in ascending address order. Both views read the exact same RAM through two different lenses.

![Space executes PUSH HL, moving SP down two bytes from 98FEh to 98FCh. Stack displays the word 1234 while Memory displays the bytes in address order as 34 12.](/images/tbg/stack-step.svg)

Hit `Esc` to step back to Stack, then `Shift+Tab` to return to Code, where `→` now sits on `0104 POP DE`. Tap `Space` to execute the pop, then `Shift+Tab` back to Registers. `DE` holds `1234`, `HL` still holds `1234` and `SP` has returned to `98FE`. Press `R` to let `RET` end `STEP.COM` (`PC ----`, `SP 9900`, `EX`), then `Esc` and `Enter` to return to `B>`.

## Stepping into, over and out of calls

Tapping `Space` one instruction at a time works on six bytes, not when your code calls a print helper or the BDOS. Stepping into a routine that formats a string would trap you in hundreds of instructions you already trust. TBG puts three stepping scopes on `Space`:

- **`Space` (Step Into):** Executes one instruction. On a `CALL` inside your program, TBG stops at the routine's first instruction so you can trace inside it.
- **`Shift+Space` (Step Over):** Runs a `CALL` at full speed until it returns and stops on the instruction right after the `CALL`. On any other instruction, it acts just like `Space`.
- **`Ctrl+Space` (Step Out):** Steps over nested calls until a `RET` lifts `SP` above its starting value, counting steps along the bottom row. If a routine loops for a long time before returning, any key interrupts the trace and hands control back.

Both `Space` and `R` wait for you to release the key before resuming the CPU. That release guard prevents a debugger keypress from leaking into a program polling the matrix keyboard.
