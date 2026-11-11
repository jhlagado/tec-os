# Reading the TEC-OS source

Start with the ROM's memory and entry points, then follow a console call and
a disk request. This order explains the shared state before the larger CP/M
files. It describes the current source; [release status](wip.md) records what
the generated outputs and evidence cover.

## Recommended order

1. **Image and public interface.** [src/rom.asm](../src/rom.asm) lists the
   assembly include order. [src/abi.inc](../src/abi.inc) defines the public
   addresses, service numbers, arguments and table offsets.
   [src/abi.asm](../src/abi.asm) emits the table at C003h. Include order is
   assembly order, not the best order for learning the implementation.

2. **Memory and boot.** [src/layout.asm](../src/layout.asm) defines addresses
   and sizes. [src/ram.asm](../src/ram.asm) allocates workspace, buffers and
   stacks. Then read [src/reset.asm](../src/reset.asm) and
   [src/boot.asm](../src/boot.asm): RESET jumps to RSTENT, which distinguishes
   reset from warm entry. Follow COLD and WBOOTR separately. The RAM BIOS
   jump table comes from [src/tables.asm](../src/tables.asm), with its handlers
   in [src/bios.asm](../src/bios.asm). Cold boot copies the table to RAM so
   installed hooks can intercept calls.

3. **Console and display.** [src/console.asm](../src/console.asm) selects
   serial, PICO or GLCD routing and buffers input.
   [src/keyboard.asm](../src/keyboard.asm) scans the matrix.
   [src/term.asm](../src/term.asm) interprets video terminal output, while
   [src/video.asm](../src/video.asm) dispatches through driver tables.
   [src/tms.asm](../src/tms.asm) probes the PICO9918 and
   [src/pico.asm](../src/pico.asm) implements its console. The loaded GLCD
   implementation is [drivers/glcd.asm](../drivers/glcd.asm).
   [src/lcd.asm](../src/lcd.asm) handles the separate character LCD.

4. **CP/M commands and calls.** [src/cpm/ccp.asm](../src/cpm/ccp.asm) handles
   the prompt, command dispatch and transient loading. Its companions
   `ccpfile.asm`, `ccpmut.asm` and `ccpcmd.asm` contain listing/output,
   file-changing commands and other built-ins respectively.
   [src/cpm/bdos.asm](../src/cpm/bdos.asm) dispatches CALL 0005h and handles
   character and line input. Continue through `bdosfile.asm` for file
   operations, `bdosrec.asm` for record I/O, `bdosfn.asm` for queries and
   directory iteration, `bdoslog.asm` for directory I/O and drive login and
   `bdoscon.asm` for console helpers and errors. All are in `src/cpm/`.
   The prompt's history, `COPY`, the pager and lines of several commands
   are `SHELL.SVC`'s, in `drivers/shell.asm` ([docs/shell.md](shell.md)).

5. **Disk path.** Follow a BDOS record request through BIOS into
   [src/cache.asm](../src/cache.asm) and [src/sd.asm](../src/sd.asm).
   The cache operates on 512-byte card blocks. The SD driver handles SPI
   commands and transfers. [src/vol.asm](../src/vol.asm) validates the
   container and mounts defaults. [src/volsvc.asm](../src/volsvc.asm) handles
   runtime volume operations and [src/volutil.asm](../src/volutil.asm)
   supplies shared helpers. [format/format.json](../format/format.json) and
   [the container specification](container-format.md) define the on-card
   layout used by both ROM and host tools.

6. **Public services and resident extensions.**
   [src/services.asm](../src/services.asm) dispatches numbered ABI calls and
   implements hardware calls. [src/loader.asm](../src/loader.asm) loads
   `.SVC` files, relocates them, runs INIT/REMOVE and publishes registry
   records. These are different uses of “service”.
   [The ROM interface](rom-services.md) covers numbered calls and
   [resident services](services.md) covers file layout, hooks and lifetime.
   [programs/SAMPLE.ASM](../programs/SAMPLE.ASM) is a small public-ABI client.

7. **Build and evidence.** [tools/build.mjs](../tools/build.mjs) assembles the
   ROM and generates inputs under `src/gen/` from `format/`.
   [tools/media.mjs](../tools/media.mjs) packages the release files and card
   images. `test/` contains host/emulator tests, `test/lib/` their harness and
   `test/programs/` executable fixtures. `diag/` is the board diagnostic, a
   RAM program that MON3 loads; [diagnostics.md](diagnostics.md) describes
   it. It includes `src/sd.asm` and `src/tms.asm` rather than copying them.

## Symbol families

Prefixes are local clues. Their meaning depends on the module.

| Prefix or name | Meaning and starting point |
| --- | --- |
| `TN*`, `TNE*` | Public numbered calls and error constants in `abi.inc`, such as `TNFONT` and `TNEBAD`. |
| `HWS*` | Hardware-call implementations in `services.asm`, such as `HWSLCD`. |
| `CON*`, `KB*` | Console routing and matrix-keyboard routines in `console.asm` and `keyboard.asm`. |
| `VT*` | Terminal/display operations and gates in `term.asm` and `video.asm`. |
| `PI*`, `TMS*` | PICO state, tables and console routines in `ram.asm` and `pico.asm`. These names are not all callable entries. |
| `CMD*` | CCP command handlers, such as `CMDSAVE` in `ccpcmd.asm`. |
| `FN*` | BDOS function handlers, such as `FNOPEN` in `bdosfile.asm`. |
| `SVC*` | Resident-service loading, removal and registry state in `loader.asm` and `ram.asm`. |
| `PZ*` | Page-zero setup, sweep and boundary state in `boot.asm`, `loader.asm` and `ram.asm`. |
| `SD*`, `SPI*` | SD-card operations and SPI byte-transfer helpers in `sd.asm`. |
| `V*` | Context-dependent: video calls such as `VPUT` in `video.asm`, but volume calls such as `VFLUSH` in `volsvc.asm`. |

For example, `PICOWID` is a public byte offset, 24, into the PICO entry table.
That table slot contains the address of `TMSWID`, the routine that sets the
console width. Clients find the table through `TNFIND` and use the offset.
The CCP width command in `ccpcmd.asm` shows this lookup. The implementation's
label is not the public offset or a fixed ROM address.

Routine headers give entry contracts. Nearby declarations explain shared
state and dispatch tables. [Assembly style](assembly-style.md) describes the
layout conventions used to keep those explanations readable.
