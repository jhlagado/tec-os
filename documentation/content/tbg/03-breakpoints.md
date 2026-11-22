---
title: Run to a breakpoint
parent: TBG
nav_order: 3
nav_group: First session
---

# 3. Run to a breakpoint

Start `TBG.SVC STEP` again. This time stop at `TAKE`, just before the POP.

**From Code.** Press **Tab** to see Code. Press **Down** twice until
`0104: POP DE` is on the top row. Press **B**. An asterisk marks that address.
The top row is the selected instruction. Browsing moves the selection and
leaves the program's PC where it stopped.

**From a symbol.** From Registers, press **Shift+Tab** to open Symbols.
Use **Up** and **Down** to select `TAKE` at `0104`. Press **B** to toggle
its breakpoint. Press **Tab** to return to Registers. These are two ways to
toggle the same breakpoint, so use one of them for this exercise. B works in
Code and Symbols. In the other views the LCD says `B: select in Code`.

![B sets the breakpoint on the selected Code row. R runs to that address and stops before POP DE.](/images/tbg/breakpoint.svg)

Go back to Registers with **Shift+Tab** if you set the breakpoint in Code,
then press **R**. Look for `PC: 0104` and `BP` on the register screen. The
PUSH has run, and the POP is still ahead. Press **Tab** three times, past
Code and Stack, to open Memory. The initial pointer is PC. Press **Right** to
follow SP and look for `34 12`. Press **S** to execute the POP while watching
the stack pointer move. Press **Tab** twice to return to Registers, or **R**
to finish the program.
