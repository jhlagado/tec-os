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

1. Press **S**. HL now holds `010A`, the address of `BUF`.
2. In Registers, press **Down** twice and **Right** once to select HL, then
   press **Enter**. Memory opens at `010A` and its top row ends with `HL`:
   it follows HL.
3. Press **S** twice. `LD B,4` runs, then `LD (HL),B` writes `04` at the
   cursor.
4. Press **S** again. `INC HL` runs and Memory moves on to `010B` with it.
5. Press **Esc** to go back to Registers, then **Tab** to Code. Select the
   `RET` row, the last before `BUF:`, and press **Ctrl+R**. The loop runs to
   its end and stops before the RET.
6. Press **Tab** twice to reach Memory, press **G**, type `10A` and press
   **Enter**. The buffer reads `04 03 02 01`.

To keep those bytes, press **W** in Memory, type `BUF.BIN` and press
**Enter**, press **Enter** again for the cursor's address, and give `4` as the
byte count. **L** loads a file back: it asks for the name and an address,
shows the range of whole records it will fill, and loads when you press
**Enter**. A file is read in whole 128-byte records, and **W** pads its last
record with `00`.
