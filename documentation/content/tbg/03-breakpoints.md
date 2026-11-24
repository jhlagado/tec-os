---
title: Run to a breakpoint
parent: TBG
nav_order: 3
nav_group: First session
---

# 3. Run to a breakpoint

Start `TBG.SVC STEP` again. This time stop at `TAKE`, just before the POP.

**From Code.** Press **Tab** to see Code. The `>` in the first column is the
selection and the `→` beside it marks PC. Press **Down** twice to move the
`>` to `0104 POP DE`. Press **B**. A `□` marks that address, and the bottom
row says `BP SET 0104`. Browsing moves the selection and leaves the
program's PC where it stopped.

B works in Code. In the other views the LCD says `Select in Code first`.

![B sets the breakpoint on the selected Code row. R runs to that address and stops before POP DE.](/images/tbg/breakpoint.svg)

Go back to Registers with **Shift+Tab**, then press **R**. Look for `PC 0104` and `BP` on the register screen. The
PUSH has run, and the POP is still ahead. Press **Tab** twice, past Code, to
open Stack: the top word is `1234`. Press **Enter** to open Memory at that
slot and look for its bytes, `34 12`. Press **Esc** to go back to Stack, then
**Space** to execute the POP and watch SP move up. Press **Shift+Tab** twice to
return to Registers, or **R** to finish the program.

To stop at a line just once, select it in Code and press **R** there. With
the selection moved off PC, R runs to the selected line and stops without
leaving a breakpoint behind; a breakpoint on the way stops it first. With
the selection on PC, or in any other view, R runs freely. **Left** puts
Code's selection back on PC.
