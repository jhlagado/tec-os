---
title: If something does not work
parent: TBG
nav_order: 8
nav_group: Reference
---

# 8. If something does not work

| Symptom | What to check |
| --- | --- |
| CP/M prints `TBG.SVC?` | Check the disk and the service's filename. TBG needs 32 pages of the memory above `8000`; unload other services if they fill it. |
| The Viewer shows the register screen but keys have no effect | Click the character LCD and press and release the debugger key. |
| Tab moves the browser away from the LCD | Use the Viewer build with LCD Tab support. F6 is the way back to the 9918 display. |
| H says `No help: TBG.HLP` | Copy `TBG.HLP` from the TBG build beside `TBG.SVC`, or to A:. |
| B says `Select in Code first` | Press **Tab** to reach Code, select the instruction, then press **B**. |
| Code does not show the stopped instruction | Press **Left** to return to PC. |
| R stopped at the wrong line | In Code, R runs to the selected line when the selection is off PC. Press **Left** first to run freely. |
| B says `Not in the COM` | Breakpoints and running to a line need an address inside the loaded program. |
| B says `BP FULL (8)` | Eight breakpoints are set. Press **B** on one of them to remove it first. |
| E in Memory says `Not writable` or `End of range` | Only the program's memory, `0100` up to TBG, can be edited. |
| Memory does not move when a register changes | It shows `FIX`: it has an address of its own. Open it from the register in Registers with **Enter**. |
| Step out runs for a long time | Press any key to stop it. A routine that loops before returning takes many steps. |
| Ctrl+Esc does not stop the program | It stops at the program's next system call. A program that never calls the operating system needs a breakpoint instead. |
| `SY` does not show and Code has no labels | Load `TBGSYM.SVC` after `TBG.SVC`, and rebuild with TAS so the `.TBG` file matches the COM. |
| CP/M prints `TBGSYM.SVC?` | Load `TBG.SVC` first. The extension also needs five pages of memory above `8000`. |
| `TBG.SVC ARM` says `ARM needs ABI 5.3` | The ROM is older than TEC-OS ABI 5.3. Start the program with `TBG.SVC NAME` instead, or update the ROM. |
| The LCD says `TBG: no COM` and a name | Check the program's name and drive. TBG returns to CP/M with the command marked as failed. |
