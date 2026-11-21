# Learning TBG on TEC-OS

TBG is a debugger for CP/M COM programs. It stops a program before its first
instruction so you can step through the code, watch registers change, and run
to an instruction you choose. TBG uses the character LCD and the matrix
keyboard. The program can keep using the 9918 display.

## 1. Get to the first stop

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

## 2. Watch a program change the stack

This six-byte program makes a convenient practice target. Save it as
`STEP.ASM` on a writable drive with TAS available.

```asm
        ORG $0100
START:  LD HL,$1234
        PUSH HL
TAKE:   POP DE
        RET
```

Assemble and load it from the CP/M prompt:

```text
A>TAS STEP
A>TBG.SVC STEP
```

A matching `STEP.TBG` from TAS adds `SY` beside the PC on the register display.

1. Press **S** once. The PC moves to `0103` and HL becomes `1234`.
2. Press **M** to see the Stack view. Note the address on the top row.
3. Press **S** while still looking at the stack. Its top address moves down
   by two bytes, and the word `1234` appears there.
4. Press **M** to see Code. The PC is at `0104` and the next instruction is
   `POP DE`. Press **S**, then **M** to return to Registers. DE is now `1234`
   and SP is back at its starting value.
5. Press **R** to let `RET` finish the program. The register display shows
   `EX`. Press **Q** to return to CP/M.

The stack view prints words. The byte view prints the bytes in address
order, so the same saved word appears there as `34 12`.

## 3. Run to a breakpoint

Start `TBG.SVC STEP` again. This time stop at `TAKE`, just before the POP.

**From Code.** Press **M** twice to see Code. Press **Down** twice until
`0104: POP DE` is on the top row. Press **B**. An asterisk marks that address.
The top row is the selected instruction. Browsing moves the selection and
leaves the program's PC where it stopped.

**From a symbol.** In Code, press **Right** to open the symbol browser.
Use **Up** and **Down** to select `TAKE` at `0104`. Press **B** to toggle
its breakpoint. Press **Left** to return to Code. These are two ways to
toggle the same breakpoint, so use one of them for this exercise.

Press **R**. Look for `PC: 0104` and `BP` on the register screen. The PUSH
has run, and the POP is still ahead. Press **P** to open Memory. The initial
pointer is PC. Press **Right** to follow SP and look for `34 12`. Press
**S** to execute the POP while watching the stack pointer move. Press **P**
to close Memory, or **R** to finish the program.

## 4. Controls at a glance

| Key | What it does |
| --- | --- |
| **S** | Step one instruction while staying in the current view. |
| **R** | Run until a breakpoint or program return. |
| **Q** | Leave the debugger. |
| **M** | Cycle Registers, Stack, and Code. |
| **P** | Open or close the register-based Memory view. |
| **B** | Toggle the selected Code address or symbol label. In Registers, Stack, or Memory it targets the instruction immediately after the one at PC. |
| **W** | Save a register snapshot at a normal stop. |

| View | Arrow keys |
| --- | --- |
| Code | **Up/Down** browse instructions, **Left** recenters on PC, and **Right** opens Symbols when available. |
| Memory | **Up/Down** move four bytes. **Left/Right** choose PC, SP, HL, DE, BC, IX, IY, or AF and reset the scroll offset. |
| Symbols | **Up/Down** browse globals. **Left** goes back to Code. Labels in the loaded program can be used as breakpoint addresses. |

Registers shows AF, BC, DE, HL, IX, IY, SP, and PC. Use Stack to read four
little-endian words from SP. Use Memory to watch a pointer move as you step.
For example, select HL to inspect its destination, then step an instruction
that increments HL.

## 5. Use symbols from TAS

TAS writes a `.TBG` file named after the source. With the usual
`TAS STEP` invocation, `STEP.COM` and `STEP.TBG` already have matching
names. If you produce `PLAY.COM` from `STEP.ASM`, put a copy of
`STEP.TBG` beside the program as `PLAY.TBG`. Use the same drive and CP/M
user area as the COM.

TBG checks the sidecar against the loaded program. If there is no matching
sidecar, you can still step, inspect memory, and set breakpoints by browsing
Code. If `SY` is missing, check the filename and user area, then assemble
again to make sure the files are from the same build.

## 6. Save a snapshot or catch the next launch

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
  Saving a snapshot while this read is paused is still in development.

## 7. If something does not work

| Symptom | What to check |
| --- | --- |
| CP/M prints `TBG.SVC?` | Check the disk and service filename, unload the shell, and check whether the startup script loaded other services. |
| The Viewer shows the register screen but keys have no effect | Click the character LCD and press and release the debugger key. |
| Code does not show the stopped instruction | Press **Left** to recenter on PC. |
| A breakpoint is missing after pressing **B** | In Code, pick an address inside the loaded COM other than the current PC. In Symbols, select a label inside the program. |
| Ctrl-X has no effect | Use the experimental ROM and try while a debugged program is waiting for matrix input through BDOS. The chord is checked during that wait. |

## Build the service if you need a copy

From a Thorium checkout next to your TEC-OS checkout, run
`node tools/build-tdb.mjs --service ../tec-os`. The output is
`build/tbg/TBG.SVC`. Copy that file to your TEC-OS disk. The standard Viewer
ROM supports the direct-launch exercises in this manual. Armed launch and
the Ctrl-X input pause require the experimental ROM.

[Viewer build source](https://github.com/jhlagado/tec-os-viewer/tree/tbg-lcd-workflow) ·
[Thorium source](https://github.com/jhlagado/thorium) ·
[Origo P5 test evidence](https://github.com/jhlagado/origo/tree/tbg-resident-evidence)
