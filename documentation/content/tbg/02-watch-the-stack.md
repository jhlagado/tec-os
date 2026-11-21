---
title: Watch a program change the stack
parent: TBG
nav_order: 2
nav_group: First session
---

# 2. Watch a program change the stack

This six-byte program makes a convenient practice target. Save it as
`STEP.ASM` on a writable drive with TAS available.

```asm
        ORG $0100
START:  LD HL,$1234
        PUSH HL
TAKE:   POP DE
        RET
```

Assemble and load it from the CP/M prompt:

```text
A>TAS STEP
A>TBG.SVC STEP
```

A matching `STEP.TBG` from TAS adds `SY` beside the PC on the register display.

1. Press **S** once. The PC moves to `0103` and HL becomes `1234`.
2. Press **M** to see the Stack view. Note the address on the top row.
3. Press **S** while still looking at the stack. Its top address moves down
   by two bytes, and the word `1234` appears there.
4. Press **M** to see Code. The PC is at `0104` and the next instruction is
   `POP DE`. Press **S**, then **M** to return to Registers. DE is now `1234`
   and SP is back at its starting value.
5. Press **R** to let `RET` finish the program. The register display shows
   `EX`. Press **Q** to return to CP/M.

The stack view prints words. The byte view prints the bytes in address
order, so the same saved word appears there as `34 12`.
