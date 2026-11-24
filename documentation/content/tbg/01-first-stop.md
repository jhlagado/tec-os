---
title: The resident workbench and your first stop
parent: TBG
nav_order: 1
nav_group: First session
---

# 1. The resident workbench and your first stop

Before inspecting a program under TBG, you need a working `.COM` file whose normal output you have already seen. This chapter takes a short greeting program through the full TEC-OS cycle. You enter the source in `TED`, assemble it with `TAS` and run it at the prompt. You then load the same executable under `TBG.SVC` to watch its instructions execute on the character LCD while its output appears on the main console.

## Build a program and run it first

Put `TBG.SVC` on a TEC-OS disk alongside `TED.COM` and `TAS.COM`. The examples below assume the tools sit on drive A and your working files on drive B, as on the standard starter card. On a single-drive setup, omit the `B:` prefix.

Start `TED` from the command prompt to create a new source file called `HELLO.ASM`:

```text
A:SYSTEM>A:TED B:HELLO.ASM
```

`TED` opens an empty editing area with the filename and cursor position on the bottom status row. Enter this nine-byte program and its message string, using two leading spaces so every line fits inside a 40-column display:

```asm
  ORG $0100

START: LD DE,MSG
  LD C,9
  CALL $0005
  RET

MSG: DB "Hello from TEC-OS",13,10,"$"
```

Saving with `^S` writes `HELLO.ASM` to drive B and displays `TED  HELLO.ASM    Saved` on the status row. Once `Saved` appears, `^Q` quits `TED` and returns to the prompt.

Assembling `HELLO.ASM` with `TAS` turns that source into an executable:

```text
A:SYSTEM>A:TAS B:HELLO
HELLO.COM written
```

`TAS` writes `HELLO.COM` on drive B along with a companion `HELLO.TBG` file beside it. That second file holds the program's labels for the optional symbols service in Chapter 5.

Running the program normally first establishes its baseline output:

```text
A:SYSTEM>B:HELLO
Hello from TEC-OS

A:SYSTEM>
```

The greeting appears on the main console and the prompt returns immediately. Inside the Z80, four instructions ran in sequence. `LD DE,MSG` pointed `DE` at the message bytes at `0109h`. `LD C,9` selected BDOS function 9, the string-printing call. `CALL $0005` entered TEC-OS to print the text up to the `$` terminator. Finally, `RET` returned control to the command processor. In a normal run all four instructions finish in a fraction of a millisecond, leaving only the printed line as evidence.

## Resident memory and the LCD

A CP/M `.COM` program loads at `0100h` and grows upwards into the transient program area (TPA). A resident service loads from the top of the TPA downwards. Installation lowers the ceiling word at `0006h` so transient programs stay below the service.

`TBG.SVC` occupies 30 pages (7,522 bytes) of that high memory and is capped at 32 pages (8,192 bytes). On the standard starter card, `SHELL.SVC` is already loaded at boot (`SERVICES` reports `SHELL 18`), leaving too little room above `8000h` for TBG. Running `UNLOAD` at the prompt removes the newest resident service one at a time until you return to the bare `A>` CP/M prompt. Remove or omit any other boot services when you need space for TBG.

Once installed, TBG stays resident across warm boots. Whenever a debugged program stops, TBG claims the 20 × 4 character LCD and the matrix keyboard. It writes nothing to the main console. Your program keeps using the PICO9918 display, a serial terminal or a graphics LCD without TBG overwriting a single character of its output.

![TBG sits in 30 pages at the top of the TPA and uses only the 20 × 4 character LCD and matrix keyboard while the program keeps the main console.](/images/tbg/first-stop.svg)

On physical hardware, the character LCD and matrix keyboard are always in front of you. In the browser Viewer, one PC keyboard feeds both displays so you switch focus explicitly:

- Click the 9918 display to type commands at the TEC-OS prompt.
- Click the character LCD once TBG stops the program so your keys go to the debugger.
- While the LCD has focus, `Tab` stays with TBG instead of moving browser focus. `F6` returns focus to the 9918 display.

Use a Viewer build that supports LCD keyboard focus and `Tab` capture.

## Install TBG and catch the first stop

For a command typed without an extension, TEC-OS searches for a `.COM` file first and then falls through to `.SVC`. You can therefore type bare `TBG` instead of `TBG.SVC` (both forms work identically, and `TBG.SVC` skips the `.COM` check).

Typing `TBG` with no program name installs the service on its own:

```text
A>TBG
```

The LCD displays the ready screen, then control returns to the CP/M prompt:

```text
TBG 0.3 ready
Not armed
TBG.SVC NAME debugs
TBG.SVC ARM arms
```

That ready screen confirms the service is resident and shows which build is loaded. It also reports whether an armed launch is active. Every later `TBG` command enters the copy already in memory rather than loading a second copy from disk.

Starting `HELLO.COM` under TBG takes the program name after `TBG`:

```text
A>TBG B:HELLO
```

TBG loads `B:HELLO.COM` at `0100h`, prepares its initial stack and halts the Z80 before the first instruction executes. The main console stays at your command line with no greeting printed yet. On the character LCD, `TBG  Tab Next H Help` appears for about half a second before giving way to the Registers screen:

```text
>PC 0100   SP 98FEST
 AF 0000   BC 0000
 DE 0000   HL 0000..
 IX 0000   IY 0000..
```

The exact `SP` address depends on the resident services above the TPA, so your value may differ from `98FE`. Every number on the LCD is hexadecimal.

## Reading the Registers screen

The 20 × 4 LCD has eighty character cells in all, so TBG packs the CPU's state tightly:

- **Row 1:** `PC` is the program counter, holding the address of the next instruction (`0100` at entry). Beside it sits `SP`, the stack pointer. The two-letter stop code sits flush on the right: `ST` for a step or entry stop, `BP` for a breakpoint and `EX` for exit.
- **Rows 2 to 4:** The six 16-bit register pairs `AF`, `BC`, `DE`, `HL`, `IX` and `IY` sit in two columns. The `>` in the first column marks the selected register.
- **Status and flags:** The rightmost two columns of row 2 stay blank until `TBGSYM.SVC` loads matching symbols and prints `SY`. Rows 3 and 4 end with four Z80 flags, shown as letters when set and `.` when clear. Row 3 holds `Z` (zero) and `C` (carry). Row 4 holds `S` (sign) and `P` (parity/overflow).

## Take control of `HELLO.COM`

With the LCD focused, you can now run `HELLO.COM` at your own pace and watch the CPU state change before anything reaches the console.

Pressing and releasing `Space` executes the single instruction at `0100h`, `LD DE,MSG`, and stops before `0103h`. On the LCD, `PC` moves from `0100` to `0103` and `DE` changes to `0109`, the address of the `MSG` string in memory. The main console remains blank below your command line.

A second `Space` executes `LD C,9`, a two-byte instruction, and stops at `0105h`. `PC` now reads `0105`, and the low byte of `BC` changes to `09` (`C = 09h`):

```text
>PC 0105   SP 98FEST
 AF 0000   BC 0009
 DE 0109   HL 0000..
 IX 0000   IY 0000..
```

Both arguments for BDOS function 9 are now loaded in the CPU's registers, and the next instruction at `0105h` is `CALL $0005`.

Pressing `R` lets the program run from `0105h`. `CALL $0005` enters TEC-OS, and `Hello from TEC-OS` appears on the main console just as it did in your standalone run. The final `RET` then pops TBG's exit return address off the stack, lifting `SP` from `98FE` to `9900`. Instead of dropping straight back to CP/M, TBG catches the exit and updates the top row to `>PC ----   SP 9900EX`.

![HELLO.COM has printed its greeting on the PICO9918 display while the 20 × 4 LCD holds the post-exit register state with EX.](/images/tbg/viewer-hello-exit.png)

Pressing `Esc` at the top level replaces the bottom row with `Quit? Enter yes` because there is no earlier view to return to. Pressing `Enter` confirms the exit, while any other key keeps you inside TBG. Your prompt returns on the main console and `TBG.SVC` stays resident in high memory, ready for the next program.
