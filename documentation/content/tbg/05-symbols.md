---
title: Use symbols from TAS
parent: TBG
nav_order: 6
nav_group: Using TBG
---

# 6. Use symbols from TAS

TAS writes a `.TBG` file named after the source. With the usual
`TAS STEP` invocation, `STEP.COM` and `STEP.TBG` already have matching
names. If you produce `PLAY.COM` from `STEP.ASM`, put a copy of
`STEP.TBG` beside the program as `PLAY.TBG`. Use the same drive and CP/M
user area as the COM.

![Keep STEP.COM and STEP.TBG from the same TAS build together. SY confirms that TBG has matching globals to browse.](/images/tbg/symbols.svg)

TBG checks the sidecar against the loaded program. When it matches, Symbols
joins the Tab order after Memory, and Shift+Tab from Registers reaches it in
one step. It lists the program's labels in address order. **Left** and
**Right** switch to its equates, and **F** finds a symbol by typing the start
of its name. **B** sets a breakpoint only at a label in code.

Breakpoints last between sessions of the same program. Press **Q**, edit and
assemble again, then start the program with `TBG.SVC`: each breakpoint at a
label comes back at that label, wherever it has moved. One with no label comes
back only when the program is unchanged. TBG says `BP dropped:` and a count
for any it could not place. If there is no matching sidecar, Symbols is left out, and you can
still step, inspect memory, and set breakpoints by browsing Code. If `SY` is missing, check the filename and user area, then assemble
again to make sure the files are from the same build.
