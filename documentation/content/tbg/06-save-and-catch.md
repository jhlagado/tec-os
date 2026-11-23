---
title: Break in or catch the next launch
parent: TBG
nav_order: 6
nav_group: Using TBG
---

# 6. Break in or catch the next launch

**Break in.** While a program runs under TBG, hold **Ctrl+Esc**. TBG stops
the program at its next call to the operating system, before the call is
made: the LCD shows `PC 0005` and the program's return address is on its
stack. It is an ordinary stop, so you can look around, step and set
breakpoints. Press **R** to carry on into the call.

The break waits for a system call, so a program printing, reading a file or
polling for a key stops at once. While the program waits for you to type a
line, the operating system has the keyboard and nothing breaks in: hold the
chord as you press **Enter**, and the program stops at its next call. A
program that loops without calling the operating system cannot be broken in
this way; set a breakpoint and run again.

**Stop on the next launch.** With the experimental TEC-OS ROM, enter
`TBG.SVC ARM` at the CP/M prompt, then run the COM as usual, for example
`STEP`. TBG stops it at its first instruction. A direct `TBG.SVC NAME` while
armed cancels the arm and says so.
