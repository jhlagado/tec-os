---
title: Get to the first stop
parent: TBG
nav_order: 1
nav_group: First session
---

# 1. Get to the first stop

Put `TBG.SVC` and the COM file you want to debug on a TEC-OS disk. If you use
the Viewer, use the build with LCD keyboard support, mount that disk, and
select the 9918 display for the operating-system
prompt. Click the 9918 display to type at the prompt. Once TBG stops the program,
click the character LCD so the Viewer sends your keys to the debugger.

If the shell service is running, use its `UNLOAD` command to return to the
bare CP/M prompt. TBG needs that resident memory. On a card that starts other
services too, boot with those services omitted if TBG still will not fit.

For a program called `DEMO.COM`, type:

```text
A>TBG.SVC DEMO
```

On the LCD, look for `PC: 0100`. The program is loaded and has yet to execute
its first instruction. `PC` is the address of the next instruction, and `SP`
points to the top of the program's stack. The numbers on these screens are
hexadecimal.
