# KS24's model: a compact ROM

Run on TEC-OS `c9e421b`, on the Debug80 model. `model.mjs` builds trees from
that commit in `build/model-ks24/`: `base`, as it is; `draft`, the brief's
design with its users adapted; and one tree per variant the choices need. It
runs the host gates on every profile, then, with `--suite`, the full strict
suite twice on the draft and once on the base, and writes `figures.json`. No
source under `src/`, `drivers/` or `tools/` changes; the patched copies are
the trees.

- `draft.mjs` makes a draft tree. Each move is a literal cut from
  `c9e421b`'s sources that must find its text, and the build in the tree
  carries the brief's checks.
- `adapt.mjs` adapts the table's users in the tree: the GLCD driver, the six
  test programs and the tests. Edit is left as it is.
- `abi.asm` is the new table and `abi.inc` the include, written by hand.
- `table.asm` reaches every entry through an include. It runs with `abi.inc`
  on the draft and with `abi27.inc` (the old addresses, the same names) on
  the base.
- `gates.mjs` runs the reset trace, `(0006h)` and `table.asm` on the host
  machine.

## The draft

| Profile | Reset jump | Table | Data | Code | Free |
| --- | --- | --- | --- | --- | --- |
| `debug80`, `debug80t40`, `board` | `C000h` | `C003h–C024h` | `C025h–C691h` | `C692h–FD23h` | `FD24h–FFFFh` |
| `debug80g32` | `C000h` | `C003h–C024h` | `C025h–C691h` | `C692h–FD3Bh` | `FD3Ch–FFFFh` |

- `C000h` holds `JP COLD`, in `reset.asm`. `RESET`'s `LD SP` and `DI`, the
  49 bytes of padding, `INT38`, `ROMSIG` and `ROMVERS` are gone. `COLD`
  already does `DI` and `LD SP,BOOTSTK` before it writes the latch.
- The table at `C003h` is ABI 3.0, 34 bytes. It keeps the entries in the
  same order, less `FF05h`, `FF06h` and `FF10h`. Each entry has a label
  (`ABITAB`, `ABIMAJ`, `ABIMIN`, `ABIVID`, `ABIHW`, `ABIMAIN`, `ABIXMOV`,
  `ABIMOVE`, `ABIXMRK`, `ABIXCCP`, `ABIXCMD`, `ABIVOL`, `ABIFONT`,
  `ABIGLCD`), and `abi.inc` gives each the same name. `NONATSV` is gone.
- The data block is 1,645 bytes, from 18 runs in 13 source files plus the
  generated font and geometry. Its code is the BIOS jump table alone, 17
  `JP`s, moved as one piece.
- The code block is 13,970 bytes. The map's line records cover every byte
  of it, all of kind `code`, on every profile.
- The CCP's and the BDOS's RAM sections move into `ram.asm`, after
  `CCPRAM EQU BIOSRME`, so their `ORG` pairs go. All 367 symbols below
  `C000h` that both builds define are at the same addresses as at
  `c9e421b`.
- The six bytes before `BENTRY` go, and so does their check.
- The build checks that `RESET` is at `C000h` and `ABITAB` at `C003h`, that
  `ABIEND` is `ROMDATA` and that `ROMDATA`, `ROMCODE` and `CODEEND` come in
  order. It checks every `EQU` in `abi.inc` against the symbol table, and
  every label in `abi.asm` against `abi.inc`. It refuses `$FF00–$FF27` in
  any `.asm` file under `src/`, `drivers/` and `test/programs/`. The checks
  on `INT38`, on `COLD` below `C800h` and on the table at `FF00h` are gone.
  The census reports the reset jump, the table, the data, the code and the
  free gap.

## Free bytes

The floor is the old free bytes plus the 79 the brief removes, measured at
`c9e421b`: padding 49, `INT38` 3, `RESET`'s 4, the table's dropped entries
6, `NONATSV` 2, `ROMSIG` and `ROMVERS` 9, the BDOS's 6.

| Profile | `c9e421b` | Draft | Gained | Floor | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| `debug80` | 659 | 732 | 73 | 738 | **fails by 6** |
| `debug80t40` | 659 | 732 | 73 | 738 | **fails by 6** |
| `debug80g32` | 635 | 708 | 73 | 714 | **fails by 6** |
| `board` | 659 | 732 | 73 | 738 | **fails by 6** |

The bytes reconcile exactly: 15,725 used at `c9e421b`, less the 79 removed,
plus the BDOS's flag (14), less the lengths made operands (8), gives the
draft's 15,652. Every other move costs nothing.

## The choices

1. **Front or top table: front.** The top variant puts the table at `FFDDh`.
   It ends at `FFFEh`, because ATOM emits no byte at `FFFFh` ("program does
   not fit in the output range"). It has the same 732 free bytes as the
   front table. At the front, an added entry moves the data and the code
   up by its size, and every table address stays. At the top, an added
   entry moves the table's start down, so every address changes, and the
   free gap sits between the code and the table, not at the end.
2. **The BDOS's dispatch table: absolute words, +14 bytes.** Offsets can't
   be built. In a data block ahead of the code, `DW FNOPEN-BDOSBAS+$8000`
   names two symbols that are not yet defined, and ATOM reads the source
   once. It takes a forward reference only as one symbol plus or minus a
   constant from −128 to 127, so the variant fails with "a forward reference
   here must be one symbol plus or minus a small number". Absolute words
   can't carry the flag in bit 15 either, since every ROM address has bits
   15 and 14 set and ATOM won't fold `-$4000` into a forward word. So the
   draft has the 41 routines as words and a 6-byte bitmap, `FCBMAP`, with a
   bit for each function where the FCB's drive is bound first. The
   dispatcher finds the bit with a 16-byte loop in place of `BIT`, `RES`,
   `LD HL,BDOSBAS` and `ADD` (8 bytes): 8 more bytes of code and 6 of data.
   The offsets left in the BDOS's code would give 746 free bytes, 14 more,
   but put data in the code block. The other flag homes I counted by hand
   cost more: a `CALL FCBSEL` ahead of each of the 13 routines +25 or more,
   and a test of the function number by ranges about +20.
3. **How each piece moves.** Every run moves as written, at no cost, except
   the two below.

   | Piece | From | Bytes | Cost |
   | --- | --- | ---: | ---: |
   | `RAMMSG`, `BANNER` | `boot.asm` | 51 | 0 |
   | the BIOS jump table, one piece | `bios.asm` | 51 | 0 |
   | `KBARROW`, `KBSPEC`, `KBSHIFT` | `console.asm` | 37 | 0 |
   | `TMSVEC` | `video.asm` | 12 | 0 |
   | `TMSROWT`, `TMSREGS` (its `%IF` block) | `tms.asm` | 56 | 0 |
   | the font | `gen/font.asm` | 768 | 0 |
   | `LCDSEQ`, `LCDROWS`, `LCDBAN` | `lcd.asm` | 27 | 0 |
   | `ROTXT` | `vol.asm` | 13 | 0 |
   | `FMTMAG`, `GEOTAB`, the DPBs | `gen/geom.asm` | 50 | 0 |
   | `DGERR`, `DGPROM` | `diag.asm` | 46 | 0 |
   | the CCP's messages, keywords and `CONMSGS` | `cpm/ccp.asm` | 307 | 0 |
   | `FNTAB`, `FCBMAP`, the five error messages | `cpm/bdos.asm` | 142 | +14 |
   | `HWTAB`, `HWSEGT` | `hwsvc.asm` | 54 | 0 |
   | `GLCFCB`, `GLCMSG` | `glcd.asm` | 18 | 0 |
   | `CWMSG` | `cache.asm` | 13 | 0 |
   | `WSCLRN`, `CPMCLRN`, `GUARDN` | `end.asm` | 0 | −8 |
   | the CCP's and the BDOS's RAM sections | `ORG` pairs | 0 | 0 |

   - The three lengths in `end.asm` existed only because `boot.asm` came
     before the RAM they measure. With the RAM sections in `ram.asm`, they
     become operands (`LD BC,WSEND-WSBASE-1` and the like): 8 bytes fewer.
     Kept as words in the data block, they give 724 free bytes.
   - `TNAME`, `TCOLOR` and `TSPRITE` go ahead of the data (ATOM again), at
     no cost.
4. **The order inside each block: as at `c9e421b`, 0 bytes.** No ROM table
   needs a page, and no lookup uses an 8-bit offset, so the data's order
   saves nothing. ATOM never turns a `JP` into a `JR`, so no code order
   saves a byte by itself. The `JP`s whose target a `JR` would reach number
   86 at `c9e421b` and 83 in the draft's code block. Taking them is KS28's
   work.

## The gates

| Gate | Result |
| --- | --- |
| Layout | Pass on every profile: table, data, code in order, free space at the end; no data segment in the code block; the data block's only code is the BIOS jump table's 51 bytes |
| ROM | **Fails by 6 on every profile** (above) |
| Reset | Pass on every profile: before `OUT (SYSLAT)` the only instruction below `0800h` is `JP` at `0000h`, fetching `0000h–0002h`; the next is `COLD` at `C692h`; the first prompt follows. At `c9e421b`: `0000h–0006h` (`LD SP`, `DI`, `JP`) |
| Table | Pass on every profile: `table.asm` through `abi.inc` gives what it gives through `abi27.inc` at `c9e421b`, field for field, but the version (3.0 against 2.7) |
| No old address | Pass: no `.asm` file under `src/`, `drivers/` or `test/programs/` names `$FF00–$FF27` |
| Edit | **Fails**, as expected: see below |
| TPA | Pass on every profile: `(0006h)` is `B806h` on the starter card's volumes, as at `c9e421b`, and on the draft's own `starter.img` |
| The suite | **176 of 177, twice**, strict; the one left is Edit on the GLCD. Stacks unchanged. At `c9e421b`: 177 of 177 |

`table.asm` reads the signature and the version; `(ABIVID)`'s columns and
rows (80 x 24, 40 x 24, 32 x 24 and 80 x 24 by profile); INFO's and HEX's
registers from the hardware services; `(ABIMAIN)` and `(ABIXMRK)`; the font's
glyph for `A`; XMOVE and a 16-byte MOVE; describe volume 0; the GLCD hook
given 0; `DIR` through XCMD (its text compared too); and a nested CCP, left
with `EXIT`. Its moves cover the font, `HWSEGT` and the geometry tables in
the data block.

## The suite on the draft

The tests take every table address from the symbol map (`m.sym("ABIHW")`
and the like), with raw call bytes built from it. They look for major 3:

- `hwsvc`, `warmboot`, `xmove`, `system`, `levels`, `ram96`, `cache` and
  `glcd` take their addresses from the map.
- `xmove` reads the count of EXPAND regions at `EXPANDS` now that `FF10h` is
  gone.
- `devices`' test of `FF06h` refusing every call becomes a test of the
  table's head: `TNA`, 3.0 and a jump at each entry.

The driver and the six test programs include `../src/abi.inc` (`../../`
from `test/programs`). ATOM refuses an include outside its root, so the
draft's `assembleProgram` takes the repository as its root. `makePrl`'s
copy, assembled from `build/prl`, has its includes re-pointed. The pinned
inputs come from `ATOM_COM`, `EDIT_COM` and `TRIPTYCH_HEADLESS`.

Both strict runs on the draft pass 176 of 177, in 241 seconds each. The one
left is `Edit does the same on the GLCD`. The strict run on the base passes
177 of 177. The stack census is the same on both: BDOS 34 of 54 bytes, CCP
20 of 27, BIOS 16 of 38.

The draft's `tools/media.mjs` was also run. Its `starter.img` boots with
`(0006h)` at `B806h`, as the gate's card does.

## What failed, and what in the brief proved wrong

- **The ROM gate fails by 6 bytes on every profile.** The floor assumed
  that gathering the data costs nothing. It does, except for the BDOS's FCB
  flag: 14 bytes, because ATOM can't build the offsets table ahead of the
  code (choice 2). Making the lengths operands wins back 8. The gate holds
  at old + 73, or at old + 79 once KS28 finds 6 bytes. Which of the two is
  an open decision.
- **The brief's "offsets with a check" can't be built** with data before
  code, and absolute words can't hold the flag in bit 15. Both follow from
  ATOM's one pass, which the brief didn't account for.
- **ATOM takes `%INCLUDE` only in a file's header.** So the reset jump is a
  file of its own (`reset.asm`), and the data block is five files in
  sequence: `data.asm`, `gen/font.asm`, `data2.asm`, `gen/geom.asm` and
  `data3.asm`.
- **ATOM emits no byte at `FFFFh`.** The free space at the end runs to
  `FFFFh`, but its last byte can't be filled.
- **Edit fails on the GLCD** (`edit.test`, 21 x 8): the pinned `EDIT.COM`
  reads `FF00h`, finds no `"TNA"`, and sizes itself as 80 x 24. On the
  PICO9918 it passes, because its default is 80 x 24. Its change still
  waits (KE-77). Neither Edit nor anything outside TEC-OS was changed.
- **Outside the suite,** the KS20, KS21 and KS23 models' `rom.mjs` and
  `tools/media.mjs` read `ABITAB` as the table at `FF00h`. The draft's media
  counts the free space to the end and copies `abi.inc` into `dist`. The
  models are left for the stage.
