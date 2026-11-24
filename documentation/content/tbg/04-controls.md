---
title: Controls at a glance
parent: TBG
nav_order: 5
nav_group: Using TBG
---

# 5. Controls at a glance

![Tab moves through Registers, Code, Stack and Memory, and Shift+Tab goes back. Memory follows a register or stays at an address.](/images/tbg/views.svg)

TBG keeps letters to a few: **R**, **B**, **G**, **E** and **H**. Everything
else is the arrows, Tab, Space, Enter and Esc, with Shift and Ctrl.

| Key | What it does |
| --- | --- |
| **Tab** | Go to the next view: Registers, Code, Stack, then Memory, and Symbols when TBGSYM has loaded the program's labels. |
| **Shift+Tab** | Go back to the view before. |
| **Space** | Step one instruction. A call into the program stops at its first instruction. |
| **Shift+Space** | Step over: a call runs to the instruction after it. |
| **Ctrl+Space** | Step out: run until the current routine returns to its caller. The bottom row counts the steps; any key stops it. |
| **R** | Run until a breakpoint or the program's end. In Code with the selection moved off PC, run to the selected line instead, with no breakpoint left behind. |
| **Ctrl+Esc**, held | While the program runs, stop it at its next call to the operating system, at `0005`. **R** goes on into the call. |
| **B** | Toggle a breakpoint on the selected Code line. |
| **G** | Type an address in hex and press **Enter** to show it: in Memory, Memory there; elsewhere, Code. **Backspace** removes a digit and **Esc** cancels. |
| **E** | Edit: in Registers, type a new value for the selected register; in Memory, type hex digits and each pair writes a byte at the cursor and moves on. **Esc** ends the edit. |
| **Enter** | Open: in Registers, PC opens Code, SP opens Stack and the other pairs open Memory following them; in Stack, Memory at the slot; in Code, the target of a jump or call. |
| **Esc** | Go back to the view you came from. With nowhere to go back to, it asks `Quit? Enter yes`; any other key stays. |
| **H** | Show help for the current view. **Left/Right** turn its pages and **Esc** or **H** goes back. |

Space and R wait until you let the key go before the program runs, so the
program never sees the key. The arrows repeat when held.

When the view changes, its name shows on the top row for about half a
second, such as `CODE`, and then the view's own top row returns. A key
pressed while the name shows clears it and acts at once.

| View | Arrow keys |
| --- | --- |
| Registers | The arrows move the `>` selection around the grid. |
| Code | **Up/Down** move the `>` selection, then scroll. Browsing reaches any address, before PC too. **Left** returns to PC. An instruction too long for the row ends in `>` at the right edge; **Shift+Right** moves the selected row's text along to show the rest, with `<` before it, and **Shift+Left** moves it back. **Up** and **Down** keep that position from line to line; any other key puts the text back. |
| Stack | **Up/Down** select a slot. When SP moves, the selection goes back to the top. |
| Memory | **Up/Down** move a row of four bytes, and with **Ctrl** a page of sixteen. **Left/Right** move the `>` cursor from byte to byte. Memory stops at `0000` and `FFFF` instead of wrapping. |

Registers shows PC and SP on the top row, then AF, BC, DE, HL, IX and IY,
with `ST`, `BP` or `EX` for how the program stopped, and `SY` when symbols are loaded. The last two columns of
rows 2 and 3 show the Z, C, S and P/V flags as letters, or `.` when clear.
Stack shows four words from SP, the top one marked `SP`.

Code marks each row in its second column: `→` for PC, `□` for a breakpoint
and `█` for PC stopped on a breakpoint. Numbers in Code are hexadecimal and have no `$`. Stepping
back is exact when PC is close below; further back, TBG works out the
instruction start from the bytes before it.

Memory shows sixteen bytes. The top row ends with where they come from: `FIX`
for an address of its own, or a register's name when Memory follows it, with
`+` when you have scrolled away from it. Memory starts at PC the first time
you Tab to it. Editing writes only the program's memory, from `0100` up to
TBG itself, and `EDT` shows while you type. A digit waiting for its pair
shows as `3_`.
