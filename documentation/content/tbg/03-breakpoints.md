---
title: Run to a breakpoint
parent: TBG
nav_order: 3
nav_group: First session
---

# 3. Run to a breakpoint

Start `TBG.SVC STEP` again. This time stop at `TAKE`, just before the POP.

**From Code.** Press **M** twice to see Code. Press **Down** twice until
`0104: POP DE` is on the top row. Press **B**. An asterisk marks that address.
The top row is the selected instruction. Browsing moves the selection and
leaves the program's PC where it stopped.

**From a symbol.** In Code, press **Right** to open the symbol browser.
Use **Up** and **Down** to select `TAKE` at `0104`. Press **B** to toggle
its breakpoint. Press **Left** to return to Code. These are two ways to
toggle the same breakpoint, so use one of them for this exercise.

Press **R**. Look for `PC: 0104` and `BP` on the register screen. The PUSH
has run, and the POP is still ahead. Press **P** to open Memory. The initial
pointer is PC. Press **Right** to follow SP and look for `34 12`. Press
**S** to execute the POP while watching the stack pointer move. Press **P**
to close Memory, or **R** to finish the program.
