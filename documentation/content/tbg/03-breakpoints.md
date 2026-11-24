---
title: Breakpoints, running to a target and catching live programs
parent: TBG
nav_order: 3
nav_group: Using TBG
---

# 3. Breakpoints, running to a target and catching live programs

Single-stepping gets you through six instructions. The moment a program fills a table, clears a screen or loops a hundred times before hitting the broken line, tapping `Space` stops being practical. You want the Z80 running at full speed right up to the spot you want to inspect and halting cleanly there.

TBG gives you four ways to catch a full-speed program, moving from the lightest touch to the widest reach: a disposable one-shot run to a line, persistent breakpoints, breaking into a live program at its next OS call and arming TBG to catch a normal launch from the prompt.

## Run freely or stop once at a line

From Registers, Stack or Memory, pressing `R` lets the program run freely until exit or a breakpoint. In Code, `R` has a handy twist that saves you from setting and clearing throwaway breakpoints.

When `>` sits on the same row as `→` (`PC`), `R` runs freely. Scroll `>` off `PC` onto another instruction and press `R` instead, and TBG places an invisible temporary stop on that row and runs to it. Once the CPU halts there, the temporary stop vanishes with no `□` mark left behind. Any persistent breakpoint sitting along the way still fires first.

That single habit makes jumping past a loop effortless: scroll `>` to the instruction right after `DJNZ`, hit `R` and land there in one move. Watch the flip side too. If `R` in Code stops sooner than you expected, check whether `>` had been scrolled away from `→`. `Left` snaps `>` back to `PC` so `R` runs freely again.

## Persistent breakpoints

When you want to stop at the same line on every pass through a loop or every call to a routine, set a persistent breakpoint with `B`.

Start `TBG STEP` from `B>` and press `Tab` to open Code. `>` and `→` sit together on `0100 LD HL,1234`. Move `>` down twice to `0104 POP DE`, leaving `→` back at `0100`:

```text
 →0100 LD HL,1234
  0103 PUSH HL
> 0104 POP DE
  0105 RET
```

Press `B`. A hollow box `□` appears in column 2 beside `0104`, and the bottom row flashes `BP SET 0104`:

```text
 →0100 LD HL,1234
  0103 PUSH HL
>□0104 POP DE
BP SET 0104
```

`B` works in Code (and in Symbols once `TBGSYM` is loaded). Elsewhere, TBG prints `Select in Code first`. Pressing `B` a second time on a marked row clears the breakpoint and prints `BP REMOVED 0104`.

Switch back to Registers with `Shift+Tab` and press `R`. The Z80 runs `LD HL,$1234` and `PUSH HL` at full speed and halts right before `POP DE`:

```text
>PC 0104   SP 98FCBP
 AF 0000   BC 0000
 DE 0000   HL 1234..
 IX 0000   IY 0000..
```

`BP` on row 1 confirms a breakpoint hit. `HL` already holds `1234` and `SP` has already dropped to `98FC`, proving `PUSH HL` ran while `POP DE` is still waiting. Tab back to Code and column 2 on `0104` now shows a solid block `█`, meaning `PC` is stopped on a user breakpoint.

## Patching and restoring with `RST 30h`

A Z80 has no hardware breakpoint registers, so TBG patches RAM while the program runs. Pressing `B` at `0104h` records the address and saves its original opcode byte (`D1h` for `POP DE`). While stopped, RAM stays completely untouched so Code and Memory show the real bytes.

When you press `R`, TBG writes `F7h` (`RST 30h`, also called `RST 6`) over the first byte at `0104h` and starts the CPU. When execution hits `0104h`, `RST 30h` jumps straight into TBG's trap handler. TBG saves every register, writes the original `D1h` byte back into `0104h`, leaves the breakpoint registered in its table and draws the LCD with `BP`.

![Pressing B registers 0104h and saves D1h. While running, TBG patches 0104h with F7h (RST 30h). On trap, TBG restores D1h and stops with BP.](/images/tbg/breakpoint.svg)

That mechanism explains two limits you will run into:

- **Inside the `.COM` only:** Breakpoints must lie inside the loaded program image. Trying to set one in ROM or outside the `.COM` prints `Not in the COM`.
- **Eight slots:** Up to eight user breakpoints can be active at once. A ninth prints `BP FULL (8)` until you toggle one off with `B`.

Because TBG restores the original opcode at every stop, stepping past a breakpoint with `Space` or continuing with `R` runs the real instruction cleanly and re-arms the trap automatically.

## Breaking into a running program

Sometimes you hit `R` and realise the program has wandered into an endless loop with no breakpoint ahead of it. Hold `Ctrl+Esc` while the program runs.

TBG catches the program at its next call to TEC-OS through `0005h` (the BDOS entry) before that call executes. The LCD stops at `PC 0005`, with the caller's return address sitting at the top of Stack. From there you can open Stack to see which routine called the BDOS, jump to Code, inspect registers or plant a breakpoint. Press `R` to continue right into the OS call.

Two boundaries limit `Ctrl+Esc`:

- **Buffered line input:** While a program sits inside a BDOS line read (function 10), TEC-OS owns the keyboard and ignores `Ctrl+Esc`. Hold `Ctrl+Esc` as you press `Enter` to submit the line, and TBG stops at the very next BDOS call.
- **Tight CPU loops:** Any program printing, reading a file or polling the console hits `0005h` and stops straight away. A pure calculation loop that never calls `0005h` cannot be caught this way. Set a breakpoint inside the loop and run again.

## Catching a normal launch with `ARM`

Direct launches (`TBG STEP`) are quick, but sometimes you want a program to start through its normal command line, with real command arguments or from `STARTUP.CMD`.

Arm TBG at the prompt:

```text
B>TBG ARM
```

Now run any `.COM` program normally, such as `STEP` or `HELLO`. TEC-OS routes the launch through `COMVEC` (added in TEC-OS ABI 5.3) and stops the program at `0100h` with its ordinary command tail intact in page zero (`0080h`).

![Four ways to stop a running program: one-shot R off PC, persistent B breakpoints, Ctrl+Esc at the next BDOS call and TBG ARM via COMVEC.](/images/tbg/stop-paths.svg)

A few details keep `ARM` predictable:

- Typing bare `TBG` prints `Armed` on row 2 of the ready screen so you can check whether the trap is set.
- Starting a direct launch like `TBG STEP` while armed cancels the arm, flashes `ARM cancelled` and debugs `STEP`.
- Putting `TBG ARM` in `STARTUP.CMD` arms every cold boot automatically.
- On a ROM older than ABI 5.3, `TBG ARM` prints `ARM needs ABI 5.3` and arms nothing. Use direct launches or update the ROM.
