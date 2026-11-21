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
| Code does not show the stopped instruction | Press **Left** to recenter on PC. |
| A breakpoint is missing after pressing **B** | In Code, pick an address inside the loaded COM other than the current PC. In Symbols, select a label inside the program. |
| Ctrl-X has no effect | Use the experimental ROM and try while a debugged program is waiting for matrix input through BDOS. The chord is checked during that wait. |
