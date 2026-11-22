---
title: Save a snapshot or catch the next launch
parent: TBG
nav_order: 6
nav_group: Using TBG
---

# 6. Save a snapshot or catch the next launch

At an ordinary stop, press **W** to write `TBGSTATE.BIN` to the current
drive and user area. The last LCD row reports the result. This binary file
contains the stopped register image. If the file already exists, move or
rename it at the prompt before taking another snapshot.

The experimental TEC-OS ROM supports two more ways to enter TBG:

- **Stop on the next launch.** At the CP/M prompt, enter `TBG.SVC ARM`, then
  run the COM as usual, for example `STEP`. TBG stops the next eligible COM
  at entry. It looks for symbols on the drive and in the user area where the
  shell found the executable.
- **Pause a program waiting for matrix input.** While the debugged program is
  waiting for a key or line through BDOS, press **Ctrl-X**. When the LCD
  shows `INPUT PAUSED`, focus the LCD in the Viewer and press **R** to return
  to the same read. Focus the program's input surface again and finish typing.
  If the LCD offers **W Save**, press **W** before resuming to save the
  registers from the program's call to BDOS 10. The PC in this snapshot
  is the address where that call returns. Wait for the save result on
  the LCD before pressing **R**.

![With the experimental ROM, Ctrl-X pauses a pending matrix line read. R returns to that read so you can finish the line.](/images/tbg/input-pause.svg)
