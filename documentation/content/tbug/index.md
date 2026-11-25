---
title: TBUG
has_children: true
nav_exclude: true
---

# Using TBUG

On TEC-OS, ordinary development follows a short loop. You write Z80 assembly in `TED`, assemble a `.COM` program with `TAS` and run it by typing its name at the prompt. TEC-OS loads the file at `0100h`, runs it and drops you back to the prompt. When the output looks right, you carry on.

When something goes wrong, that loop gives you almost nothing to work with. A Z80 at 4 MHz executes hundreds of thousands of instructions a second, so by the time garbled text hits the screen or the machine hangs, the broken instruction is long gone. Stuffing print calls into the source shifts addresses, clobbers registers and muddies the very console output you are trying to read.

TBUG puts a resident debugger right inside TEC-OS. It loads at the top of RAM below the ROM and catches a `.COM` program before its first instruction at `0100h`. From there you can read the CPU's registers, step through disassembled instructions, watch the stack and memory change byte by byte and run at full speed between breakpoints.

## Transparent to the console

TBUG runs through the TEC-1G's 20 × 4 character LCD and matrix keyboard, treating the LCD as a second display dedicated to the debugger. Nothing TBUG draws ever touches your normal console. Whatever display or terminal your session uses, the program under test writes to it undisturbed and behaves as if no debugger were present. You watch the program on the console and steer it from the LCD.

## Built-in symbols

By itself, TBUG can debug any `.COM` binary using hexadecimal addresses. Whenever a matching `NAME.TBG` symbol file written by `TAS` sits beside `NAME.COM`, TBUG loads it automatically. Your own assembly labels appear in the disassembly, branch targets display by name and a fifth Symbols view lists every global label in address order.

## Before you start

You should be comfortable at the TEC-OS prompt, able to enter a short file in `TED` and able to read basic Z80 instructions and hexadecimal. Every chapter works through a concrete program rather than listing controls in isolation. You write or reuse a small `.ASM` file, run it normally to see what it does, then bring it under TBUG so each control turns up beside the problem that calls for it.

Addresses and bytes use hexadecimal with a trailing `h`, such as `0100h`, and sizes use KiB or decimal bytes.

## Chapters

1. [The resident workbench and your first stop](01-first-stop.md)
2. [Stepping through code, registers and the stack](02-watch-the-stack.md)
3. [Breakpoints, running to a target and catching live programs](03-breakpoints.md)
4. [Following and editing data in memory](04-follow-data.md)
5. [Debugging with source symbols](05-symbols.md)
6. [Reference, diagnostics and building TBUG](06-reference.md)
