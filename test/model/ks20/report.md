# KS20's model: GLCD a resident, drivers and the image save retired

Run on an extract of `b025dbb` (runtime 0.3.0, as that commit pins), the
debug80 profile. `model.mjs` prints every figure below; `figures.json` is
its output for that run. No product source changes: the resident is a
sketch in this folder, and the ROM it runs on is `b025dbb`'s with one
instruction changed in the model's copy.

## How the model works

- **The resident.** `glcd-resident.asm` is `drivers/glcd.asm` as a kind-1
  module: the same drawing code, a header with INIT and REMOVE, a six-word
  video table, and row moves straight between its screen text and
  `LINEBUF`. Its INIT stores the table's address where `CONSW` reads it;
  its REMOVE does what `UNLOAD`'s driver branch does now. Both use the
  ROM's symbols directly, where the product will use the new entry.
- **The ROM.** `CONSW`'s `LD HL,DRVVEC` becomes `LD HL,(GLVEC)`, the
  same three bytes, with `GLVEC` at `DRVPG`'s two bytes. Nothing else in
  the ROM changes, so the boot path loads `GLCD.PRL` as it does now, and
  `PRLGO` installs it as a resident.
- **The workload.** The stack census's commands (`test/stacks.test.mjs`)
  on a GLCD board with the matrix keyboard, then `CONOUT.COM`, a program
  started on the CCP stack that calls the BIOS's `CONOUT` directly with
  text that wraps, scrolls, inserts and deletes characters and lines, and
  clears to the end of a line. The same workload runs on the driver, on
  `b025dbb` unchanged, and on the resident.
- **Stack depth.** Every `CONOUT` call is followed from its entry to its
  return: the depth is the caller's `SP` before the `CALL` less the lowest
  `SP` during it, so it includes the return address. Calls are grouped by
  where they came from: a program (return address in the TPA), the BDOS,
  or other ROM code. The driver's own stack in EXPAND 1 (`BF80h–C000h`) is
  measured apart.
- **ROM bytes.** `rom.mjs` takes each retired routine's size from
  `b025dbb`'s symbol map. It assembles the new code (`glcd-entry.asm`: the
  entry and `CCPIN`'s refusal of an image) with the product's symbols to
  get its size.

## Choice 1: GLCD's cost

| Figure | Driver, `b025dbb` | Resident |
| --- | ---: | ---: |
| Code bytes (`GLCD.PRL`'s n) | 663 | 685 |
| Pages | 3, in EXPAND 1 | 3, below `(0006h)` |
| `(0006h)` on the model's GLCD card | `B706h` | `B406h` |
| TPA lost on a GLCD board | 0 | 768 bytes, 3 pages |
| `CONOUT` from a program, deepest, with its return address | 26 | 24 |
| `CONOUT` from the BDOS, deepest | 26 | 24 |
| BDOS stack, deepest of 54 | 40 | 38 |
| Driver stack in EXPAND 1 | 16 | none |

- **Pages.** The resident is 22 bytes larger than the driver: the table
  and `LBUF` words, INIT and REMOVE, and the row moves' indirection,
  less the hook list. It still fits three pages, with 83 bytes to spare.
  A board without a GLCD loses nothing.
- **The caller's stack.** A program started on the CCP stack has 25
  bytes below its `SP` (`CSTKTOP` − 2). A direct `CONOUT` call takes 24 of
  them on the resident, so it fits with 1 byte to spare, and the GLCD
  needs no stack of its own. The resident is 2 bytes shallower than the
  driver, because `XCALL` pushed `AF` on the caller's stack. The GLCD's
  routines never go deeper than the ROM's own path around them.
- **The margin is thin, and it was already exceeded.** `CONOUT.COM`
  pushes `HL` before each call, so it reaches 26 bytes below its start on
  the resident and 28 on the driver: 1 and 3 bytes into the 16-byte guard
  below the CCP stack, on both designs. A program on the CCP stack that
  pushes anything before it calls the BIOS's `CONOUT` on a GLCD board
  already goes past the 25 bytes at `b025dbb`. The stacks census's own
  workload doesn't show this, because its programs call the BDOS. The
  design is 2 bytes better than today and doesn't make this worse. The
  docs' advice that a program sets up its own stack still stands.
- **Screens.** After each of the 20 commands, the ST7920's graphics RAM
  on the resident equals the driver's byte for byte.
  The gate's workload needs text in every column. A fault that loses the
  21st column on a row move goes unseen by commands whose lines are
  shorter, as the census's first three are; `CONOUT.COM`'s wrapped lines
  show it.
- **`UNLOAD`.** On the resident, `UNLOAD` puts the console on serial and
  `(0006h)` back to `B706h`. `FILL.COM` then overwrites the freed pages
  with `HALT` and prints through the BDOS, and the line reaches the serial
  console. The same check passes on the driver.

## Choice 2: ROM

| Freed | Bytes |
| --- | ---: |
| The six thunks | 24 |
| `DRVVEC` | 12 |
| `XCALL` | 46 |
| The row wrappers, `VXRDR`, `VXWRR`, `VXCOPY` | 40 |
| `PRLDRV` and `PRLHK`, the driver load | 76 |
| `PRLGO`'s kind-2 dispatch | 4 |
| `UNLOAD`'s driver branch, less a `JP BADCMD` | 37 |
| `CCPIN`'s image save | 37 |
| `XEXIT`'s image restore | 32 |
| `XALLOC` and `XFREE` | 43 |
| `MEMINIT`'s allocation of the levels' and history's pages | 5 |
| **Total** | **356** |

| Costs | Bytes |
| --- | ---: |
| The `FF26h` entry: `HL` a table, or 0 to hand the console back | 25 |
| `CCPIN`'s refusal of an image (`HL` ≠ `0100h`) | 6 |
| `CONSW`'s `LD HL,(GLVEC)` in place of `LD HL,DRVVEC` | 0 |
| The table's `JP`, at `FF00h`'s end | 3 |
| **Total** | **34** |

- **Net:** 322 bytes freed, 325 of them below `FF00h`, where `b025dbb`
  has 876 free. KS21 would then have about 1,201 bytes below `FF00h`.
- **The transfer buffer** is in EXPAND 1's reserved page, not in ROM. With
  the call table, `XSP` and the driver stack, the page gives up 226 bytes;
  only warm boot's jump at `BF03h` stays.
- **Not counted:** `MOVE`'s bank-1 path. With `XMARK` at `80h`, its range
  check refuses every bank-1 copy, so the code stays as it is. Removing
  that path would free more.
- **The refusal** is 6 bytes with a `JP`; a `JR` within range makes it 5.

### The table's address

`FF23h` holds a word, so the next free address in the table is `FF25h`.
The brief names `FF26h`. An entry at `FF26h` leaves `FF25h` as a pad byte,
4 bytes in all, and moves `ABIEND` to `FF29h`. The model puts the entry at
`FF25h`. Which address to use is an open decision for the brief.

## Draft gates: a pass input and a fail input for each

| Gate | Pass input | Fail input |
| --- | --- | --- |
| ROM: at least 300 bytes freed against `b025dbb` (the model's 322, less a margin of 22) | The model's accounting: 322 | `b025dbb` itself: 0 freed. A build that keeps `XALLOC` and `XFREE` frees 279 |
| TPA: `(0006h)` unchanged on the starter card; on a GLCD board, lowered by 768 and no more | The model: `B706h` to `B406h` on its GLCD card; the starter card has no `GLCD.PRL` | The resident given a stack page of its own, or grown past 768 bytes of code: 4 pages, 1,024 lower |
| Screens: the ST7920's graphics RAM equal to the driver's, byte for byte, after each command | The model: 20 of 20 commands equal | The resident with `VRDROW` copying 20 of 21 columns: `CONOUT.COM`'s screen differs. The census's first three commands don't show it, because their text never reaches the 21st column (`figures.json`, `screensFault`) |
| `UNLOAD`, then output on serial | The resident: `FILLED` reaches the serial console, `(0006h)` back to `B706h` | The resident with REMOVE a bare `RET`: no prompt after `UNLOAD`, because the console still points at the freed pages |
| Stacks: a program on the CCP stack calling the BIOS's `CONOUT` directly takes at most 25 bytes, its return address included; the census keeps a quarter of the BDOS stack free | The resident: 24, and the BDOS stack 38 of 54 | The driver at `b025dbb`: 26. The resident with one more push on its deepest path: 26 |
| Shell-outs: `CCP` and `EXIT` at the prompt, and a resident calling `XCCP` and `XCMD` with `0100h`, at each depth to six, restore drives, user and mounts | `test/levels.test.mjs`'s checks, run with `HL` = `0100h` | A build whose `XEXIT` skips the remount pass: a drive the child remounted stays remounted |
| Refusals: `XCCP` and `XCMD` with an image, and a kind-2 PRL, each with carry set and nothing changed | `HL` = `0200h`: carry set, `CCPLVL`, `XMARK` and EXPAND 1 unchanged; `DRV.PRL` (kind 2): carry set, `(0006h)` unchanged | `b025dbb`: `HL` = `0200h` is accepted and one page is saved to EXPAND 1; `DRV.PRL` is installed |
| EXPAND 1: no write to `8000h–BCFFh` after cold boot's clear | The suite on the build, with a write watch on EXPAND 1 | `b025dbb`'s `test/levels.test.mjs`, whose shell-out with an image writes the image's pages below `BD00h` |
| The full suite, strict, twice | Both runs pass every test | Any failure or skip |

The model runs the first five rows' inputs (`figures.json`). The last
four need the build. Their inputs come from the code at `b025dbb`, and the
model doesn't run them.

## Files

- `model.mjs`: runs the model and prints every figure as JSON
- `glcd.mjs`: choice 1
- `rom.mjs`: choice 2
- `lib.mjs`: the product it runs against
- `glcd-resident.asm`: the resident sketch
- `glcd-entry.asm`: the ROM's new code, assembled for its size
- `screens.mjs`: writes the driver's screens at `b025dbb` to
  `test/glcd-screens.json`, the reference for `test/glcd.test.mjs`
- `CONOUT.COM` and `FILL.COM`: in `test/programs/` since KS20's build
- `figures.json`: the run on `b025dbb`
