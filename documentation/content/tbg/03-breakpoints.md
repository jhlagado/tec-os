---
title: Run to a breakpoint
parent: TBG
nav_order: 3
nav_group: First session
---

# 3. Run to a breakpoint

Start `TBG.SVC STEP` again. This time stop at `TAKE`, just before the POP.

**From Code.** Press **Tab** to see Code. The `>` in the first column is the
selection and the `@` beside it marks PC. Press **Down** twice to move the
`>` to `0104 POP DE`. Press **B**. A `*` marks that address, and the bottom
row says `BP SET 0104`. Browsing moves the selection and leaves the
program's PC where it stopped.

**From a symbol.** From Registers, press **Shift+Tab** to open Symbols.
Use **Up** and **Down** to select `TAKE` at `0104`. Press **B** to toggle
its breakpoint. Press **Tab** to return to Registers. These are two ways to
toggle the same breakpoint, so use one of them for this exercise. B works in
Code and Symbols. In the other views the LCD says `Select in Code first`.

![B sets the breakpoint on the selected Code row. R runs to that address and stops before POP DE.](/images/tbg/breakpoint.svg)

Go back to Registers with **Shift+Tab** if you set the breakpoint in Code,
then press **R**. Look for `PC 0104` and `BP` on the register screen. The
PUSH has run, and the POP is still ahead. Press **Tab** twice, past Code, to
open Stack: the top word is `1234`. Press **Enter** to open Memory at that
slot and look for its bytes, `34 12`. Press **Esc** to go back to Stack, then
**S** to execute the POP and watch SP move up. Press **Shift+Tab** twice to
return to Registers, or **R** to finish the program.

To stop at a line just once, select it in Code and press **Ctrl+R**. The
program runs to that line and stops there without leaving a breakpoint
behind. A breakpoint on the way stops it first.
