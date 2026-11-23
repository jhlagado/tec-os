---
title: Follow data in memory
parent: TBG
nav_order: 4
nav_group: First session
---

# 4. Follow data in memory

This program fills four bytes, counting down from 4. Save it as `FILL.ASM`
beside `STEP.ASM`.

```asm
        ORG $0100
START:  LD HL,BUF
        LD B,4
FILL:   LD (HL),B
        INC HL
        DJNZ FILL
        RET
BUF:    DS 4
```

Assemble it and start it in TBG:

```text
A>TAS FILL
A>TBG.SVC FILL
```

1. Press **Space**. HL now holds `010A`, the address of `BUF`.
2. In Registers, press **Down** twice and **Right** once to select HL, then
   press **Enter**. Memory opens at `010A` and its top row ends with `HL`:
   it follows HL.
3. Press **Space** twice. `LD B,4` runs, then `LD (HL),B` writes `04` at the
   cursor.
4. Press **Space** again. `INC HL` runs and Memory moves on to `010B` with it.
5. Press **Esc** to go back to Registers, then **Tab** to Code. Select the
   `RET` row at `0109`, and press **R**. The loop runs to its end and stops
   before the RET.
6. Press **Tab** twice to reach Memory, press **G**, type `10A` and press
   **Enter**. The buffer reads `04 03 02 01`.
