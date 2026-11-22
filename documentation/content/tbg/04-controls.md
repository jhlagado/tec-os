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
| **S** | Step one instruction while staying in the current view. |
| **R** | Run until a breakpoint or program return. |
| **B** | Toggle a breakpoint on the selected Code instruction or symbol label. |
| **W** | Save a register snapshot at a normal stop. |
| **H** | Show help for the current view. **Left/Right** turn its pages and **Esc** or **H** goes back. |
| **Q** | Leave the debugger. Press **Enter** when the LCD asks, or any other key to stay. |

A view's name shows on the top row for a moment when you arrive. Pressing a
key during that moment does its job at once. S and R wait until you let the
key go before the program runs, so the program never sees the key. The
arrows repeat when held.

| View | Arrow keys |
| --- | --- |
| Code | **Up/Down** browse instructions and **Left** recenters on PC. |
| Memory | **Up/Down** move four bytes. **Left/Right** choose PC, SP, HL, DE, BC, IX, IY, or AF and reset the scroll offset. |
| Symbols | **Up/Down** browse globals. Labels in the loaded program can be used as breakpoint addresses. |

Registers shows AF, BC, DE, HL, IX, IY, SP, and PC. Use Stack to read four
little-endian words from SP. Use Memory to watch a pointer move as you step.
For example, select HL to inspect its destination, then step an instruction
that increments HL.
