---
title: Controls at a glance
parent: TBG
nav_order: 4
nav_group: Using TBG
---

# 4. Controls at a glance

| Key | What it does |
| --- | --- |
| **S** | Step one instruction while staying in the current view. |
| **R** | Run until a breakpoint or program return. |
| **Q** | Leave the debugger. |
| **M** | Cycle Registers, Stack, and Code. |
| **P** | Open or close the register-based Memory view. |
| **B** | Toggle the selected Code address or symbol label. In Registers, Stack, or Memory it targets the instruction immediately after the one at PC. |
| **W** | Save a register snapshot at a normal stop. |

| View | Arrow keys |
| --- | --- |
| Code | **Up/Down** browse instructions, **Left** recenters on PC, and **Right** opens Symbols when available. |
| Memory | **Up/Down** move four bytes. **Left/Right** choose PC, SP, HL, DE, BC, IX, IY, or AF and reset the scroll offset. |
| Symbols | **Up/Down** browse globals. **Left** goes back to Code. Labels in the loaded program can be used as breakpoint addresses. |

Registers shows AF, BC, DE, HL, IX, IY, SP, and PC. Use Stack to read four
little-endian words from SP. Use Memory to watch a pointer move as you step.
For example, select HL to inspect its destination, then step an instruction
that increments HL.
