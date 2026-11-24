---
title: TBG
has_children: true
nav_exclude: true
---

# Using T-Bug (TBG)

TEC-OS is a CP/M-compatible disk operating system for the TEC-1G. You write assembly source in `TED` and assemble a `.COM` program with `TAS`. Typing its name at the prompt loads the binary at `0100h`, runs it to completion and returns to the prompt. When a program works, you see its output on the console and move on.

When a program prints wrong text, corrupts a buffer or hangs, that normal cycle gives you little evidence. The Z80 executes hundreds of thousands of instructions a second. By the time a fault appears on screen, the instruction behind it has long since passed. Adding print statements changes the program's size, alters its registers and clutters the display you are trying to check.

TBG, pronounced T-Bug, puts a debugger directly inside TEC-OS. It loads into high memory as a resident service and stops a `.COM` program before its first instruction at `0100h`. From that stop you can inspect the Z80's registers and read disassembled instructions. You can also watch the stack and memory change byte by byte, stepping one instruction at a time or running at full speed between breakpoints.

## Two screens on one machine

TBG operates entirely through the TEC-1G's 20 × 4 character LCD and matrix keyboard. It writes nothing to the main console. Whether your session uses the PICO9918 display, a serial terminal or the graphics LCD, the program under test runs on that console as usual. From the program's perspective, nothing sits between it and its screen. You watch its output on the main display while controlling execution on the LCD.

## Memory and optional symbols

Every resident service reduces the transient program area available below it. TBG's core service, `TBG.SVC`, fits within 32 pages (8,192 bytes) and currently uses 30 pages (7,522 bytes). That compact footprint leaves room for substantial `.COM` programs alongside registers, disassembly, stack, memory inspection, breakpoints and live editing.

On its own, TBG displays hexadecimal addresses. You can load a second optional service, `TBGSYM.SVC`, whenever you want your own assembly labels in the disassembly and a browsable list of symbols. It reads the `.TBG` file that `TAS` writes beside each `.COM` file and attaches to TBG through a resident hook. Because `TBGSYM.SVC` claims another five pages of memory (1,142 bytes), it stays separate from the core. Load it when named labels help. Leave it unloaded when your program needs the extra memory.

## The intended reader

This book is a guided tour rather than a pure reference manual. It assumes you can use the TEC-OS prompt, enter a short file in `TED` and read basic Z80 instructions, registers and hexadecimal numbers. Each chapter builds a small program or reuses an earlier one, runs it and then inspects it under TBG. Every control appears beside the problem it solves.

The examples run on a physical TEC-1G and in the browser [TEC-OS Viewer](https://jhlagado.github.io/tec-os-viewer/). The text notes the Viewer's extra focus step between the console display and the character LCD alongside the hardware behaviour. Addresses and bytes use hexadecimal with a trailing `h`, as in `0100h`, and sizes in bytes are decimal.

## Chapters

1. [The resident workbench and your first stop](01-first-stop.md)
2. [Stepping through code, registers and the stack](02-watch-the-stack.md)
3. [Breakpoints, running to a target and catching live programs](03-breakpoints.md)
4. [Following and editing data in memory](04-follow-data.md)
5. [Debugging with source symbols](05-symbols.md)
6. [Reference, diagnostics and building TBG](06-reference.md)
