---
title: TBG
has_children: true
nav_exclude: true
---

# Using T-Bug (TBG)

On TEC-OS, ordinary development follows a short loop. You write Z80 assembly in `TED`, assemble a `.COM` program with `TAS` and run it by typing its name at the prompt. TEC-OS loads the file at `0100h`, runs it and drops you back to the prompt. When the output looks right, you carry on.

When something goes wrong, that loop gives you almost nothing to work with. A Z80 at 4 MHz executes hundreds of thousands of instructions a second, so by the time garbled text hits the screen or the machine hangs, the broken instruction is long gone. Stuffing print calls into the source shifts addresses, clobbers registers and muddies the very console output you are trying to read.

TBG, pronounced T-Bug, puts a resident debugger right inside TEC-OS. It sits at the top of RAM below the ROM and catches a `.COM` program before its first instruction at `0100h`. From there you can read the CPU's registers, step through disassembled instructions, watch the stack and memory change byte by byte and run at full speed between breakpoints.

## Transparent to the console

TBG runs through the TEC-1G's 20 × 4 character LCD and matrix keyboard, treating the LCD as a second display dedicated to the debugger. Nothing TBG draws ever touches your normal console. Whatever display or terminal your session uses, the program under test writes to it undisturbed and behaves as if no debugger were present. You watch the program on the console and steer it from the LCD.

## Small core, optional symbols

Every resident service reduces the memory available to your program. `TBG.SVC` stays within 8 KiB and uses about 7.5 KiB, leaving plenty of room for real `.COM` programs alongside registers, disassembly, stack, memory inspection, breakpoints and live editing.

By itself, TBG works in raw hexadecimal addresses. Whenever you want your own assembly labels in the disassembly and a browsable list of names, you can load a second resident service, `TBGSYM.SVC`, on top of TBG. It reads the `.TBG` symbol file that `TAS` writes beside each `.COM` file and takes about another 1.25 KiB of RAM. Keeping symbols in a separate service makes that memory a choice: load `TBGSYM` when names save time, and leave it out when a large program needs the space.

## Before you start

You should be comfortable at the TEC-OS prompt, able to enter a short file in `TED` and able to read basic Z80 instructions and hexadecimal. Every chapter works through a concrete program rather than listing controls in isolation. You write or reuse a small `.ASM` file, run it normally to see what it does, then bring it under TBG so each control turns up beside the problem that calls for it.

Addresses and bytes use hexadecimal with a trailing `h`, such as `0100h`, and sizes use KiB or decimal bytes.

## Chapters

1. [The resident workbench and your first stop](01-first-stop.md)
2. [Stepping through code, registers and the stack](02-watch-the-stack.md)
3. [Breakpoints, running to a target and catching live programs](03-breakpoints.md)
4. [Following and editing data in memory](04-follow-data.md)
5. [Debugging with source symbols](05-symbols.md)
6. [Reference, diagnostics and building TBG](06-reference.md)
