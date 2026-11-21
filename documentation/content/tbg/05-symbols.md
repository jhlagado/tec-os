---
title: Use symbols from TAS
parent: TBG
nav_order: 5
nav_group: Using TBG
---

# 5. Use symbols from TAS

TAS writes a `.TBG` file named after the source. With the usual
`TAS STEP` invocation, `STEP.COM` and `STEP.TBG` already have matching
names. If you produce `PLAY.COM` from `STEP.ASM`, put a copy of
`STEP.TBG` beside the program as `PLAY.TBG`. Use the same drive and CP/M
user area as the COM.

![Keep STEP.COM and STEP.TBG from the same TAS build together. SY confirms that TBG has matching globals to browse.](/images/tbg/symbols.svg)

TBG checks the sidecar against the loaded program. If there is no matching
sidecar, you can still step, inspect memory, and set breakpoints by browsing
Code. If `SY` is missing, check the filename and user area, then assemble
again to make sure the files are from the same build.
