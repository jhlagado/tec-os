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


1. Press **Space** once. The PC moves to `0103` and HL becomes
   `1234`.
2. Press **Tab** twice, through Code, to see the Stack view. Each view's
   name shows for a moment as you arrive. Note the address on the top row.
3. Press **Space** while still looking at the stack. Its top address moves down
   by two bytes, and the word `1234` appears there.
4. Press **Shift+Tab** to go back to Code. The `@` marks PC at `0104`, and
   the next instruction is `POP DE`. Press **Space**, then **Shift+Tab** to return to
   Registers. DE is now `1234` and SP is back at its starting value.
5. Press **R** to let `RET` finish the program. The register display shows
   `EX`. Press **Esc**, then **Enter** when the LCD asks, to return to CP/M.

![S executes PUSH HL, which moves SP down two bytes. Another S executes POP DE, which restores SP and leaves DE holding 1234h.](/images/tbg/stack-step.svg)

The stack view prints words. The byte view prints the bytes in address
order, so the same saved word appears there as `34 12`.
