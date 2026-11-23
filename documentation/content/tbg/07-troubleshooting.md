---
title: If something does not work
parent: TBG
nav_order: 7
nav_group: Reference
---

# 7. If something does not work

| Symptom | What to check |
| --- | --- |
| CP/M prints `TBG.SVC?` | Check the disk and service filename, unload the shell, and check whether the startup script loaded other services. |
| The Viewer shows the register screen but keys have no effect | Click the character LCD and press and release the debugger key. |
| Tab moves the browser away from the LCD | Use the Viewer build with LCD Tab support. F6 is the way back to the 9918 display. |
| H says `No help: TBG.HLP` | Copy `TBG.HLP` from the TBG build beside `TBG.SVC`, or to A:. |
| B or Ctrl+R says `Select in Code first` | Press **Tab** to reach Code, select the instruction, then press the key again. |
| Code does not show the stopped instruction | Press **Left** to return to PC. |
| B says `Not in the COM` | Breakpoints and Ctrl+R need an address inside the loaded program. |
| B in Symbols says `B: not code` | The label is data or an equate. Breakpoints go on instructions. |
| A breakpoint is gone after assembling again | It had no label and the program changed. Put a label on the line to keep it. |
| B says `BP FULL (8)` | Eight breakpoints are set. Press **B** on one of them to remove it first. |
| Code shows `?` beside an address | TBG could not be sure that row starts an instruction. Press **G** and type a known address, or step to it. |
| E in Memory says `Not writable` or `End of range` | Only the program's memory, `0100` up to TBG, can be edited. |
| Memory does not move when a register changes | It shows `FIX`: it has an address of its own. Open it from the register in Registers with **Enter**. |
| Step out or Until runs for a long time | Press any key to stop it. A routine that loops before returning takes many steps. |
| The LCD says `TBG: no COM` and a name | Check the program's name and drive. TBG returns to CP/M with the command marked as failed. |
| Ctrl-X has no effect | Use the experimental ROM and try while a debugged program is waiting for matrix input through BDOS. The chord is checked during that wait. |
