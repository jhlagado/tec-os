---
title: The resident workbench and your first stop
parent: TBUG
nav_order: 1
nav_group: First session
---

# 1. The resident workbench and your first stop

A debugger makes the most sense on a program whose normal output you already know. Start with a tiny greeting program: write it in `TED`, assemble it with `TAS` and run it straight from the prompt. Once you have seen it print and vanish in an instant, load the exact same binary under TBUG and slow it down to one instruction at a time.

## Build and run a baseline

Make sure `TBUG.SVC` and `TBUG.HLP` sit on drive A alongside `TED.COM` and `TAS.COM`. Switch to drive B so your own files stay on the working volume:

```text
A:SYSTEM>B:
B:WORK>
```

When you type a bare command on drive B, TEC-OS checks drive B first and then falls back to drive A for `.COM` programs. You can run `TED` and `TAS` directly from `B:WORK>` without typing `A:` in front of them, and your source and `.COM` files stay right on drive B without `B:` either.

Open a new source file called `HELLO.ASM`:

```text
B:WORK>TED HELLO.ASM
```

`TED` clears the console and shows the filename and cursor position on the bottom row. Enter this nine-byte program and its message string, using two leading spaces so every line sits cleanly inside 40 columns:

```asm
  ORG $0100

START: LD DE,MSG
  LD C,9
  CALL $0005
  RET

MSG: DB "Hello from TEC-OS",13,10,"$"
```

Save with `^S`. Once `Saved` appears on the status row, quit with `^Q` to return to `B:WORK>`.

Assemble `HELLO.ASM` into a `.COM` executable:

```text
B:WORK>TAS HELLO
HELLO.COM written
```

Beside `HELLO.COM`, `TAS` also writes `HELLO.TBG` containing your labels. TBUG loads that symbol file automatically when it matches the `.COM` image, which Chapter 5 looks at in detail.

Run the program normally first so you have a baseline:

```text
B:WORK>HELLO
Hello from TEC-OS

B:WORK>
```

Four Z80 instructions just ran in a fraction of a millisecond. `LD DE,MSG` pointed `DE` at the greeting at `0109h`. `LD C,9` selected BDOS string print. `CALL $0005` handed control to TEC-OS to write every character up to `$`, and `RET` returned to the prompt. All you saw was the finished line.

## Resident memory and the LCD

Ordinary `.COM` programs load at `0100h` and grow upwards into free RAM. Resident services load from the top down, right below the TEC-OS ROM at `C000h`, and lower the address stored at `0006h` so transient programs stay underneath them.

On the starter card, `SHELL.SVC` is already loaded at boot and uses enough upper RAM that TBUG may not fit beside it. Switch back to drive A and run `UNLOAD` to drop the shell and return to the bare `A>` prompt. If your card loads other services at boot, unload or omit them when you need space for TBUG.

![TBUG is loaded at the top of RAM below the ROM and uses only the 20 × 4 character LCD and matrix keyboard while the program keeps the console.](/images/tbg/first-stop.svg)

Once resident, TBUG survives warm boots and works transparently alongside the rest of the computer. Whenever a debugged program stops, TBUG draws on the 20 × 4 character LCD and reads the matrix keyboard. Your console stays untouched, so any text or graphics your program draws remains exactly where the program put it.

## Install TBUG and catch the first stop

At the `A>` prompt, type `TBUG.SVC` on its own to install the service:

```text
A>TBUG.SVC
```

The LCD displays the ready screen and the prompt returns on the console:

```text
TBUG 0.3 ready
Not armed
TBUG.SVC NAME debugs
TBUG.SVC ARM arms
```

That screen confirms TBUG is resident, shows its version and tells you whether an armed launch is active. From now on, `TBUG.SVC` from any drive enters the resident copy straight away without reading disk again. When you eventually want the memory back, `UNLOAD TBUG` removes the service.

Switch back to drive B and start `HELLO` under TBUG:

```text
A>B:
B>TBUG.SVC HELLO
```

`TBUG.SVC HELLO` arms the debugger and hands the command line back to the command processor, which locates and loads `HELLO.COM` at `0100h` itself. TBUG then catches the launch before the first instruction runs. On the console, your launch line sits alone with no greeting underneath it. On the LCD, `TBUG Tab Next H Help` flashes briefly and gives way to the Registers screen:

```text
>PC 0100   SP 98FEST
 AF 0000   BC 0000SY
 DE 0000   HL 0000..
 IX 0000   IY 0000..
```

Every number on the LCD is hexadecimal. Your `SP` value depends on what sits above the TPA, and `SY` appears on row 2 because `HELLO.TBG` sits beside `HELLO.COM`.

## Reading eighty characters of CPU state

A 20 × 4 LCD gives you eighty character cells, so every column earns its keep:

- **Top row:** `PC` is the address of the next instruction (`0100` at entry) and `SP` is the top of the stack. Flush against the right edge sits a two-letter stop code: `ST` for an initial stop or step, `BP` for a breakpoint and `EX` once the program exits.
- **Rows 2 to 4:** The six 16-bit pairs `AF`, `BC`, `DE`, `HL`, `IX` and `IY` sit in two columns, with `>` marking the selected pair.
- **Right edge of rows 2 to 4:** Row 2 shows `SY` when a matching `.TBG` symbol file is loaded and stays blank otherwise. Rows 3 and 4 hold four Z80 flags as letters when set and `.` when clear: `Z` (zero) and `C` (carry) on row 3, `S` (sign) and `P` (parity/overflow) on row 4.

## Step `HELLO.COM` by hand

On the TEC-1G matrix keyboard, `Fn+5` through `Fn+8` send the function keys `F5` through `F8`. Here `F8` (`Fn+8`) steps one instruction into the program and `F5` (`Fn+5`) runs at full speed.

Tap `F8` once and let it go. The Z80 executes `LD DE,MSG` at `0100h` and halts again before `0103h`. On the LCD, `PC` advances to `0103` and `DE` becomes `0109`, the address of `"Hello from TEC-OS"`. Over on the console, nothing has moved.

Tap `F8` a second time. `LD C,9` runs, moving `PC` to `0105` and setting the low byte of `BC` to `09`:

```text
>PC 0105   SP 98FEST
 AF 0000   BC 0009SY
 DE 0109   HL 0000..
 IX 0000   IY 0000..
```

Both arguments for BDOS function 9 are now sitting in the CPU, with `CALL $0005` lined up next at `0105h`.

Now press `F5` to let the program finish at full speed. `CALL $0005` prints `Hello from TEC-OS` onto the console just as it did in your standalone run. Then `RET` pops TBUG's exit return address off the stack, raising `SP` from `98FE` to `9900`. Instead of vanishing back to CP/M, TBUG catches the exit and shows `>PC ----   SP 9900EX` on row 1.

Press `Q` to leave TBUG. The LCD displays `Quit TBUG? Y/N`. Press `Y` or `Q` to confirm (any other key keeps you inside TBUG). Your `B>` prompt returns on the console, and TBUG stays resident at the top of RAM for the next run.
