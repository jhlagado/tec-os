---
title: Reference, diagnostics and building TBG
parent: TBG
nav_order: 6
nav_group: Reference
---

# 6. Reference, diagnostics and building TBG

All TBG controls, screen indicators, fault messages and build commands sit here for quick lookup.

## Keys at a glance

TBG keeps letter commands to five keys: `R`, `B`, `G`, `E` and `H`. Everything else uses `Tab`, `Space`, `Enter`, `Esc` and the arrow keys with `Shift` and `Ctrl`.

| Key | Action |
| --- | --- |
| `Tab` | Next view: Registers, Code, Stack, Memory, then Symbols when `TBGSYM` has matched a `.TBG` file. |
| `Shift+Tab` | Previous view. |
| `Space` | Step Into: run one instruction, stopping at the entry of a local `CALL`. |
| `Shift+Space` | Step Over: run a `CALL` to the instruction after it as one step. |
| `Ctrl+Space` | Step Out: trace over calls until `RET` lifts `SP` above its starting value. Row 4 counts steps and any key stops it. |
| `R` | Run until exit or a breakpoint. In Code with `>` off `PC`, run once to the selected line with no breakpoint left behind. |
| `Ctrl+Esc` (held) | Break in while running: stop before the next BDOS call at `0005h`. `R` continues into the call. |
| `B` | Toggle a breakpoint on the selected row in Code or Symbols (up to eight inside the `.COM`). |
| `G` | Prompt for a hex address (`Backspace` rubs out a digit, `Esc` cancels). Jumps Memory in Memory, or Code elsewhere. |
| `E` | Edit: in Registers, type a new hex value for the selected pair. In Memory, enter hex digits where each pair writes a byte immediately and advances. `Esc` leaves edit mode. |
| `Enter` | Follow or open: in Registers, `PC` opens Code, `SP` opens Stack and `HL`/`DE`/`BC`/`IX`/`IY` open Memory following that pair. In Stack, opens Memory at the slot. In Code, follows a jump or call target. In Symbols, opens Code at the label. |
| `Esc` | Step back one view. At the top level, displays `Quit? Enter yes` (any other key stays). |
| `H` | Open context-sensitive help from `TBG.HLP`. `Left`/`Right` turn pages and `Esc` or `H` returns. |

`Space` and `R` wait for key release before resuming the program so the keypress never reaches the program, while arrow keys repeat when held. In the browser Viewer, click the LCD to focus TBG (`Tab` stays captured there) and press `F6` to return focus to the console.

## Arrow keys by view

| View | Arrow behaviour |
| --- | --- |
| Registers | Arrows move `>` around the register grid. |
| Code | `Up`/`Down` move `>` through decoded instructions and scroll freely before or after `PC`. `Left` snaps `>` back to `PC`. Long rows end with `>`. `Shift+Right` and `Shift+Left` pan sideways (`Up`/`Down` keep the offset, any other key resets it). |
| Stack | `Up`/`Down` select one of the four slots. Whenever `SP` moves, selection returns to the top slot. |
| Memory | `Up`/`Down` scroll one four-byte row (`Ctrl+Up`/`Ctrl+Down` jump sixteen bytes). `Left`/`Right` move the byte cursor. Clamps at `0000h` and `FFFFh`. |
| Symbols | `Up`/`Down` select a label in ascending address order. |

## LCD indicators and commands

- **Stop codes (Registers row 1, right):** `ST` for an initial stop or step, `BP` for a breakpoint and `EX` for exit (`PC` reads `----`).
- **Symbols badge (Registers row 2, right):** `SY` when `TBGSYM` matched the `.TBG` file.
- **Flags (Registers rows 3–4, right):** Row 3 holds `Z` and `C`. Row 4 holds `S` and `P`. Clear flags appear as `.`.
- **Code column 2:** `→` marks `PC`, `□` marks a user breakpoint and `█` marks `PC` stopped on a breakpoint.
- **Memory source tag (row 1, right):** `FIX` marks a fixed address, and a pair name (`HL`) tracks that register. Scrolling away adds `+` (`HL+`). `EDT` marks byte edit mode (`3_` shows a pending first digit).

| Command | Effect |
| --- | --- |
| `TBG` (or `TBG.SVC`) | Install TBG on drive A if absent, or show the ready screen with version and arm state from any drive. |
| `TBG NAME [tail]` | Load `NAME.COM` at `0100h` and stop before its first instruction, cancelling any arm. |
| `TBG ARM` | Catch the next `.COM` launch from the CCP (requires TEC-OS ABI 5.3 or later). |
| `TBGSYM` (or `TBGSYM.SVC`) | Load the optional symbols extension on top of `TBG.SVC`. |
| `UNLOAD` | Remove the newest resident service (`TBGSYM.SVC` before `TBG.SVC`). |

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| CP/M prints `TBG?` or `TBG.SVC?` | Install `TBG` from drive A (where `TBG.SVC` lives), or free RAM above `8000h`. `TBG.SVC` needs about 7.5 KiB (capped at 8 KiB). Run `UNLOAD` to remove `SHELL.SVC` or other services. |
| Viewer shows Registers but keys do nothing | Click the character LCD to focus it, then press and release the key. |
| `Tab` moves browser focus off the LCD | Use a Viewer build with LCD `Tab` capture. `F6` returns focus to the console. |
| `H` prints `No help: TBG.HLP` | Copy `TBG.HLP` beside `TBG.SVC` or onto drive A. |
| `B` prints `Select in Code first` | Switch to Code (or Symbols), move `>` onto an instruction and press `B`. |
| Code does not show the stopped instruction | Press `Left` in Code to snap `>` back to `PC`. |
| `R` stopped unexpectedly early | In Code, `R` runs to the selected row when `>` is off `PC`. Press `Left` first to run freely. |
| `B` prints `Not in the COM` | Breakpoints and one-shot `R` targets must lie inside the loaded `.COM` image. |
| `B` prints `BP FULL (8)` | Eight breakpoints are active. Toggle an existing one off with `B` first. |
| `E` in Memory prints `Not writable` or `End of range` | Only program memory (`0100h` up to the lowest resident service) can be edited. |
| Memory stays still while a register changes | The source tag is `FIX`. Open Memory by pressing `Enter` on that register pair in Registers. |
| `Ctrl+Space` runs for a long time | Press any key to stop the trace. A routine with a long loop before `RET` takes many steps. |
| `Ctrl+Esc` does not stop a running program | It breaks at the next BDOS call (`0005h`). A tight loop that never calls the OS needs a breakpoint. During a line read, hold `Ctrl+Esc` as you press `Enter`. |
| `SY` is absent and Code shows no labels | Load `TBGSYM` after `TBG`, and reassemble with `TAS` so `.TBG` matches `.COM`. |
| CP/M prints `TBGSYM?` or `TBGSYM.SVC?` | Load `TBG` first, run `TBGSYM` on drive A and ensure at least 1.25 KiB remains free above `8000h`. |
| `TBG ARM` prints `ARM needs ABI 5.3` | The ROM lacks `COMVEC`. Use `TBG NAME` or update to TEC-OS ABI 5.3 or later. |
| LCD prints `TBG: no COM` or `Too big:` | Check the program name, drive and available TPA. TBG returns failure code `FF00h` to CP/M. |

## Building TBG from source

TBG lives in its own repository alongside Thorium and TEC-OS. Clone `jhlagado/tbg` beside your `thorium` and `tec-os` checkouts, run `npm ci` in `thorium`, then run `npm run build` in `tbg`. The build checks that the core footprint stays within 8 KiB and writes three files:

- `build/TBG.SVC`: the core resident LCD debugger (about 7.5 KiB)
- `build/TBG.HLP`: the context-sensitive help pages opened by `H`
- `build/TBGSYM.SVC`: the optional symbols extension (about 1.25 KiB)

Copy all three files to your TEC-OS disk. Any standard TEC-OS ROM supports direct launches and every exercise in this book. `TBG ARM` requires ABI 5.3 or later.

[TBG source](https://github.com/jhlagado/tbg) ·
[Viewer build source](https://github.com/jhlagado/tec-os-viewer) ·
[Origo P8 test evidence](https://github.com/jhlagado/origo/tree/main/studies/p8-tbg/evidence)
