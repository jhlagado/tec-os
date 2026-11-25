---
title: Reference, diagnostics and building TBUG
parent: TBUG
nav_order: 6
nav_group: Reference
---

# 6. Reference, diagnostics and building TBUG

All TBUG controls, screen indicators, fault messages and build commands sit here for quick lookup.

## Keys at a glance

On the TEC-1G matrix keyboard, `Fn+5` through `Fn+8` send `F5` through `F8`.

| Key | Action |
| --- | --- |
| `R` / `C` / `S` / `M` / `Y` | Jump straight to Registers, Code, Stack, Memory or Symbols. |
| `Tab` / `Shift+Tab` | Cycle forward or backward through the views. |
| `F5` (`Fn+5`) | Run until exit or a breakpoint. In Code with `>` off `PC`, run once to the selected line with no breakpoint left behind. |
| `F6` (`Fn+6`) | Step Out: trace over calls until `RET` lifts `SP` above its starting value. Row 4 counts steps and any key stops it. |
| `F7` (`Fn+7`) | Step Over: run a `CALL` to the instruction after it as one step. |
| `F8` (`Fn+8`) | Step Into: run one instruction, stopping at the entry of a local `CALL`. |
| `Space` | Toggle a breakpoint on the selected row in Code or Symbols (up to eight inside the `.COM`). |
| `Ctrl+Esc` (held) | Break in while running: stop before the next BDOS call at `0005h`. `F5` continues into the call. |
| `G` | Prompt for a hex address (`Backspace` rubs out a digit, `Esc` cancels). Jumps Memory in Memory, or Code elsewhere. |
| `E` | Edit: in Registers, type a new hex value for the selected pair. In Memory, enter hex digits where each pair writes a byte immediately and advances. `Esc` leaves edit mode. |
| `Enter` | Follow or open: in Registers, `PC` opens Code, `SP` opens Stack and `HL`/`DE`/`BC`/`IX`/`IY` open Memory following that pair. In Stack, opens Memory at the slot. In Code, follows a jump or call target. In Symbols, opens Code at the label. |
| `Esc` | Step back one view, or cancel a prompt or edit mode. |
| `Q` | Prompt `Quit TBUG? Y/N`. Press `Y` or `Q` to quit and return to CP/M. |
| `H` | Open context-sensitive help from `TBUG.HLP`. `Left`/`Right` turn pages and `Esc` or `H` returns. |

`F5` to `F8` all wait for every key to be released before resuming the program so the keypress never reaches the program, while arrow keys repeat when held. Each view switch flashes the view's name briefly on the bottom row.

## Arrow keys by view

| View | Arrow behaviour |
| --- | --- |
| Registers | Arrows move `>` around the register grid. |
| Code | `Up`/`Down` move `>` through decoded instructions and scroll freely before or after `PC`. `Left` snaps `>` back to `PC`. Long rows end with `>`. `Shift+Right` and `Shift+Left` pan sideways (`Up`/`Down` keep the offset, any other key resets it). |
| Stack | `Up`/`Down` select one of the four slots. Whenever `SP` moves, selection returns to the top slot. |
| Memory | `Up`/`Down` move `>` by one four-byte row, scrolling at the top and bottom edges (`Ctrl+Up`/`Ctrl+Down` jump sixteen bytes). `Left`/`Right` move the byte cursor. Clamps at `0000h` and `FFFFh`. |
| Symbols | `Up`/`Down` select a label in ascending address order. |

## LCD indicators and commands

- **Stop codes (Registers row 1, right):** `ST` for an initial stop or step, `BP` for a breakpoint and `EX` for exit (`PC` reads `----`).
- **Symbols badge (Registers row 2, right):** `SY` when TBUG matched `NAME.TBG` beside the `.COM`.
- **Flags (Registers rows 3–4, right):** Row 3 holds `Z` and `C`. Row 4 holds `S` and `P`. Clear flags appear as `.`.
- **Code column 2:** `→` marks `PC`, `□` marks a user breakpoint and `█` marks `PC` stopped on a breakpoint.
- **Memory source tag (row 1, right):** `FIX` marks a fixed address, and a pair name (`HL`) tracks that register. Scrolling away adds `+` (`HL+`). `EDT` marks byte edit mode (`3_` shows a pending first digit).

| Command | Effect |
| --- | --- |
| `TBUG.SVC` | Install TBUG on drive A if absent, or show `TBUG 0.3 ready` with version and arm state. |
| `TBUG.SVC NAME [tail]` | Arm TBUG and hand the command line back to the command processor, which loads `NAME.COM` at `0100h` and stops before its first instruction. |
| `TBUG.SVC ARM` | Catch the next `.COM` launch from the CCP (requires TEC-OS ABI 5.3 or later). |
| `UNLOAD TBUG` | Remove the resident TBUG service and free its upper RAM. |

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| CP/M prints `TBUG.SVC?` | Install `TBUG.SVC` from drive A, or free RAM above `8000h` by unloading `SHELL.SVC` or other services. |
| `H` prints `No help: TBUG.HLP` | Copy `TBUG.HLP` beside `TBUG.SVC` or onto drive A. |
| `Space` prints `Select in Code first` | Press `C` (or `Y`), move `>` onto an instruction or label and press `Space`. |
| Code does not show the stopped instruction | Press `Left` in Code to snap `>` back to `PC`. |
| `F5` stopped unexpectedly early | In Code, `F5` runs to the selected row when `>` is off `PC`. Press `Left` first to run freely. |
| `Space` prints `Not in the COM` | Breakpoints and one-shot `F5` targets must lie inside the loaded `.COM` image. |
| `Space` prints `BP FULL (8)` | Eight breakpoints are active. Toggle an existing one off with `Space` first. |
| `E` in Memory prints `Not writable` or `End of range` | Only program memory (`0100h` up to the lowest resident service) can be edited. |
| Memory stays still while a register changes | The source tag is `FIX`. Open Memory by pressing `Enter` on that register pair in Registers. |
| `F6` runs for a long time | Press any key to stop the trace. A routine with a long loop before `RET` takes many steps. |
| `Ctrl+Esc` does not stop a running program | It breaks at the next BDOS call (`0005h`). A tight loop that never calls the OS needs a breakpoint. During a line read, finish the line with `Enter`, then hold `Ctrl+Esc`, and TBUG stops at the next BDOS call. |
| `SY` is absent and Code shows no labels | Reassemble with `TAS` so `NAME.TBG` matches `NAME.COM` and sits beside it on the same drive. |
| `TBUG.SVC ARM` prints `ARM needs ABI 5.3` | The ROM lacks `COMVEC`. Update to TEC-OS ABI 5.3 or later. |
| Program fails to load | Check the program name, drive and available TPA. |

## Building TBUG from source

TBUG lives in its own repository, [`jhlagado/tbug`](https://github.com/jhlagado/tbug). Clone it beside `tas` (`jhlagado/tas`), `ted` (`jhlagado/ted`) and `tec-os`, run `npm ci` in `tas`, then run `npm run build` in `tbug`. The build writes two files:

- `build/TBUG.SVC`: the resident LCD debugger with built-in symbol support
- `build/TBUG.HLP`: the context-sensitive help pages opened by `H`

Copy both files to your TEC-OS disk. `TBUG.SVC ARM` and `TBUG.SVC NAME` require TEC-OS ABI 5.3 or later.

[TBUG source](https://github.com/jhlagado/tbug) ·
[Origo P8 test evidence](https://github.com/jhlagado/origo/tree/main/studies/p8-tbg/evidence)
