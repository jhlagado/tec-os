---
title: Controls at a glance
parent: TBG
nav_order: 4
nav_group: Using TBG
---

# 4. Controls at a glance

![Tab moves through Registers, Code, Stack, Memory and Symbols, and Shift+Tab goes back. Memory follows a register. Symbols appears when a matching sidecar is available.](/images/tbg/views.svg)

| Key | What it does |
| --- | --- |
| **Tab** | Go to the next view: Registers, Code, Stack, Memory, then Symbols when a matching sidecar is available. |
| **Shift+Tab** | Go back to the view before. |
| **S** or **Space** | Step one instruction while staying in the current view. A call into the program stops at its first instruction. |
| **O** or **Shift+Space** | Step over: a call runs to the instruction after it. |
| **Ctrl+Space** | Step out: run until the current routine returns to its caller. |
| **U** | Until: choose **Return**, **Count**, **Memory** or **Register** with **Up/Down** and press **Enter**. Count asks for a number of steps in hex, Memory for an address whose byte to watch, and Register for the value the pair selected in Registers should reach. |
| **R** | Run until a breakpoint or program return. |
| **Ctrl+R** | Run to the line selected in Code or Symbols, with no breakpoint left behind. |
| **B** | Toggle a breakpoint on the selected Code instruction or symbol label. |
| **G** | Type an address in hex and press **Enter** to show it: in Memory, Memory there; elsewhere, Code. **Backspace** removes a digit and **Esc** cancels. |
| **Enter** | Open the selection: in Registers, PC opens Code, SP opens Stack, AF opens the flags and any other pair opens Memory following it; in Stack, Memory at the slot; in Memory, Code at the cursor; in Code, the selected instruction's bytes, with **Follow target** for a jump or call and **Open Memory**. |
| **E** | Edit: in Registers, type a new value for the selected register; in Memory, type hex digits and each pair writes a byte at the cursor and moves on. **Esc** ends the edit. |
| **F** | In Memory, freeze an address that follows a register where it is. |
| **Esc** | Go back to where Enter, a followed target or G came from. |
| **W** | Save a register snapshot at a normal stop. |
| **H** | Show help for the current view. **Left/Right** turn its pages and **Esc** or **H** goes back. |
| **Q** | Leave the debugger. Press **Enter** when the LCD asks, or any other key to stay. |

A view's name shows on the top row for a moment when you arrive. Pressing a
key during that moment does its job at once. S and R wait until you let the
key go before the program runs, so the program never sees the key. The
arrows repeat when held.

Step out and Until run the program one instruction at a time and count the
steps on the bottom row, a few hundred a second. Calls they step over run at
full speed. Press any key to stop them early; a breakpoint or the end of the
program also stops them. Step out works from anywhere in a routine,
including partway through and inside a recursive call.

| View | Arrow keys |
| --- | --- |
| Registers | The arrows move the `>` selection around the grid. |
| Stack | **Up/Down** select a slot. When SP moves, the selection goes back to the top. |
| Code | **Up/Down** move the `>` selection, then scroll. Browsing reaches any address, before PC too. **Left** returns to PC. |
| Memory | **Up/Down** move a row of four bytes, and with **Ctrl** a page of sixteen. **Left/Right** move the `>` cursor from byte to byte. Memory stops at `0000` and `FFFF` instead of wrapping. |
| Symbols | **Up/Down** browse globals. Labels in the loaded program can be used as breakpoint addresses. |

Code marks each row in its second column: `@` for PC, `*` for a breakpoint,
`#` for both, and `?` for a row before PC that TBG could not be sure starts an
instruction. Numbers in Code are hexadecimal and have no `$`.

Registers shows PC and SP on the top row, then AF, BC, DE, HL, IX and IY, with
`ST`, `BP` or `EX` for how the program stopped and `SY` when symbols match. The
flags view, from Enter on AF, spells out the flags and shows the alternate
pairs, I and the interrupt state. Stack shows four words from SP, the top one
marked `SP`.

Memory shows sixteen bytes. The top row ends with where they come from: `FIX`
for an address of its own, or a register's name when Memory follows it, with
`+` when you have scrolled away from it. Use it to watch a pointer move as
you step: select HL in Registers, press **Enter**, then step an instruction
that increments HL. Memory starts at PC the first time you Tab to it.
Editing writes only the program's memory, from `0100` up to TBG itself, and
`EDT` shows while you type. A digit waiting for its pair shows as `3_`.
