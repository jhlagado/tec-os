# TBG on TEC-OS

TBG is an LCD debugger for CP/M COM programs. It loads a program at `0100h`
and stops before the first instruction. The debugger uses the character LCD
and matrix keyboard, leaving the program's 9918 display available. This guide
describes the current prototype.

## Start a session

Build `TBG.SVC` from the sibling Thorium repository with
`node tools/build-tdb.mjs --service ../tec-os`. Put the resulting
`build/tbg/TBG.SVC` and the COM file on a TEC-OS disk. In the Viewer, mount the
disk and focus the character LCD to send keys to the matrix keyboard.

At the CP/M prompt, type `TBG.SVC DEMO` to load `DEMO.COM` and stop at
`0100h`. A matching `DEMO.TBG` on the same drive and in the same user area
is detected automatically. The register screen shows `SY` when the sidecar
has global symbols and its image matches the COM. TAS names the sidecar after
the source, so match the filenames if you named the COM differently.

## Step, inspect, and run

The first screen shows the registers, including the next PC and the stack
pointer. Press `S` to step. For example, after stepping a `PUSH HL`, the
stack pointer should be two bytes lower.

- Press `M` to cycle through Registers, Stack, and Code. In Code, Up and Down
  browse instructions and Left recenters on the stopped PC.
- Press `P` to inspect memory through a saved register. Left and Right select
  a register and Up and Down scroll four bytes at a time. Select SP to inspect
  the live stack.
- In Code, press `B` to toggle a breakpoint at the selected instruction.
  An asterisk marks a breakpoint. In the other views, `B` targets the next
  instruction.
- Press `R` to run. TBG returns control at a breakpoint or when the program
  returns. Press `Q` to leave the debugger.

## Save and resume

At a normal stop, press `W` to write one binary register snapshot,
`TBGSTATE.BIN`, to the current drive and user area. TBG leaves any existing
snapshot in place. The last LCD row reports the result.

The experimental TEC-OS ROM also supports `TBG.SVC ARM`, which stops the next
eligible COM loaded from the shell. If the debugged program is waiting for
matrix input through BDOS, Ctrl-X opens the input pause screen. Press `R` to
return to the same read, then finish typing. Disk operations during that pause,
automatic symbol lookup on armed launch, and breakpoints entered by symbol
name are still in development.

[Origo P5 evidence](https://github.com/jhlagado/origo/tree/main/studies/p5-tdb)
