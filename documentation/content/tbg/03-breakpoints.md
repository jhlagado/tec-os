---
title: Breakpoints, running to a target and catching live programs
parent: TBG
nav_order: 3
nav_group: Using TBG
---

# 3. Breakpoints, running to a target and catching live programs

Single-stepping carries you cleanly through six instructions. It breaks down the moment a program initialises a table, draws a screen or loops a hundred times before reaching the line that fails. You need the Z80 to run at full speed up to the moment of interest and stop there cleanly.

TBG gives you four ways to catch a full-speed program, ordered here from lightest to widest reach. You can run once to a chosen line or set persistent breakpoints. You can also break into a running program at its next operating-system call or arm TBG to intercept a normal launch from the command prompt.

## Run freely or stop once at a line

In Registers, Stack or Memory, pressing `R` runs the program freely until exit or a breakpoint. In Code, `R` has a second behaviour that spares you from setting and clearing throwaway breakpoints.

When the `>` selection in Code sits on the same row as `→` (`PC`), `R` runs freely. Move `>` off `PC` onto another instruction and press `R` instead. TBG sets an invisible temporary stop on that row and runs to it. Once execution stops there, the temporary stop vanishes with no `□` mark left behind. A persistent breakpoint sitting along the path still stops the program first.

That single rule makes skipping past a loop effortless. Scroll `>` down to the instruction right after `DJNZ`, press `R` and land there in one step. Remember the flip side too: if `R` in Code stops sooner than you expected, check whether `>` sat away from `→`. Pressing `Left` returns `>` to `PC` so `R` runs freely again.

## Persistent breakpoints

Set a persistent breakpoint with `B` whenever you want to stop at the same instruction on every loop pass or across repeated calls to a routine.

Start `TBG B:STEP` again and press `Tab` to open Code. `>` and `→` sit together on `0100 LD HL,1234`. Pressing `Down` twice moves `>` onto `0104 POP DE`, leaving `→` back at `0100`:

```text
 →0100 LD HL,1234
  0103 PUSH HL
> 0104 POP DE
  0105 RET
```

Pressing `B` puts a hollow box `□` in column 2 beside `0104`, and the bottom row briefly prints `BP SET 0104`:

```text
 →0100 LD HL,1234
  0103 PUSH HL
>□0104 POP DE
BP SET 0104
```

`B` works in Code (and in Symbols when `TBGSYM.SVC` is loaded). Pressing `B` in Registers, Stack or Memory displays `Select in Code first`. Pressing `B` a second time on a marked row removes the breakpoint and prints `BP REMOVED 0104`.

Return to Registers with `Shift+Tab` and press `R`. The Z80 runs `LD HL,$1234` and `PUSH HL` at full speed and halts before `POP DE`:

```text
>PC 0104   SP 98FCBP
 AF 0000   BC 0000
 DE 0000   HL 1234..
 IX 0000   IY 0000..
```

`BP` at the top right confirms a breakpoint stop. `HL` holds `1234` and `SP` has already dropped to `98FC`, proving `PUSH HL` executed while `POP DE` has not. Pressing `Tab` to open Code shows a solid block `█` in column 2 on row `0104`, the combined mark for `PC` stopped on a user breakpoint.

## Patching and restoring with `RST 30h`

A Z80 has no hardware breakpoint registers, so TBG patches RAM while the program runs. Pressing `B` at `0104h` records that address along with its original opcode byte (`D1h` for `POP DE`). While the program stays stopped, RAM remains untouched so Code and Memory display the real bytes.

Pressing `R` writes `F7h` (`RST 30h`, also known as `RST 6`) over the first byte at `0104h` and starts the Z80. When execution reaches `0104h`, `RST 30h` jumps straight into TBG's trap handler. TBG saves the CPU registers, restores the original `D1h` byte into `0104h` and draws the LCD with `BP` while keeping the breakpoint registered in its table.

![Pressing B registers 0104h and saves D1h. While running, TBG patches 0104h with F7h (RST 30h). On trap, TBG restores D1h and stops with BP.](/images/tbg/breakpoint.svg)

That patch-and-restore mechanism explains two limits you will encounter:

- **Program bounds only:** Breakpoints must lie inside the loaded `.COM` image. Trying to set a breakpoint in ROM or outside the loaded program reports `Not in the COM`.
- **Eight active slots:** TBG holds up to eight user breakpoints at once. Setting a ninth reports `BP FULL (8)` until you toggle an existing one off with `B`.

TBG restores the original byte at every stop. Stepping past a breakpoint with `Space` or running on with `R` therefore executes the real instruction cleanly and re-arms the trap automatically.

## Breaking into a running program

Sometimes you let a program run with `R` and realise it is stuck or looping forever with no breakpoint ahead of it. Holding `Ctrl+Esc` while the program runs regains control.

TBG intercepts the program at its next call to the operating system through `0005h` (the BDOS entry) before that call executes. The LCD stops with `PC 0005`, and the program's return address sits at the top of Stack. From there you can open Stack to see which routine called the BDOS, jump to Code, inspect registers or set breakpoints. Pressing `R` continues straight into the operating-system call.

Two practical boundaries govern `Ctrl+Esc` break-ins:

- **Buffered line input:** While a program sits inside a BDOS line read (function 10), TEC-OS holds the keyboard and `Ctrl+Esc` is ignored. Hold `Ctrl+Esc` as you press `Enter` to submit the line, and TBG stops the program at its very next BDOS call.
- **Tight CPU loops:** A program printing, reading a file or polling the console calls `0005h` and stops at once. A tight calculation loop that skips `0005h` altogether stays out of reach of `Ctrl+Esc`. Set a breakpoint inside that loop and run again.

## Catching the next normal launch with `ARM`

Direct launches (`TBG B:STEP`) work well for quick tests. Sometimes, though, you want a program to start through its ordinary command line with arguments or from `STARTUP.CMD`.

Enter `TBG ARM` at the CP/M prompt:

```text
A>TBG ARM
```

Run any `.COM` program normally, such as `B:STEP` or `B:HELLO`. TEC-OS routes the launch through `COMVEC`, a hook added in TEC-OS ABI 5.3. TBG stops the program at `0100h` with its normal command tail intact in page zero (`0080h`).

![Four ways to stop a running program: one-shot R off PC, persistent B breakpoints, Ctrl+Esc at the next BDOS call and TBG ARM via COMVEC.](/images/tbg/stop-paths.svg)

Four rules govern how `ARM` behaves in practice:

- Typing `TBG` with no arguments shows `Armed` on row 2 of the ready screen so you can verify the trap.
- Typing a direct launch such as `TBG B:STEP` while armed cancels the arm, briefly reports `ARM cancelled` and debugs `B:STEP`.
- Putting `TBG ARM` in `STARTUP.CMD` arms every cold boot automatically.
- On a ROM older than TEC-OS ABI 5.3, `TBG ARM` prints `ARM needs ABI 5.3` and leaves nothing armed. Use direct launches or update the ROM.

With full-speed stops under your belt, you can land at any instruction in a program. The next question is what that instruction is doing to your data in RAM. Chapter 4 covers the Memory view and live editing.
