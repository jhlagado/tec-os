# LCD revision 2 qualification

This is a prototype record. The combined LCD and packed-font candidate has
not passed runtime qualification or physical-board testing. It must not be
used as a firmware release.

The LCD-only checkpoint remains on `lcd-console-r2` at `6f09979`. The
integration branch, `lcd-font-integration`, combines that work with the
reviewed packed-font component
`51c87bd1cc230a3fd6c5d09ff2a7bd1618892742`. Later integration commits add
transaction rollback, fresh confirmation and startup selection. Each test
must name the exact integration pin it actually ran.

## Current evidence

A normal-origin build of
`bb17b636b2a592b65469a96c74a7449ca01009c0` stopped at the root source's
end with TAS reporting `out of memory`. It produced no census for that
candidate. The assembler can report this for an image beyond FFFFh or for
arena exhaustion. The error alone does not establish a byte count.

The build's monitored process tree peaked at 97 MB and exited after 1.5
seconds. This is host resource evidence, not a ROM or target timing result.
Later source corrections have not yet had another native build.

The transaction uses six new classic-bank snapshot bytes and one auxiliary
selection byte. The LCD profile uses existing PIBLK padding. These are
source allocations. Their actual workspace alignment, TPA effect and stack
margin still require a normal build and emulator measurements. The existing
stack guards have not been enlarged.

## Reproducing an overflow census

First run `npm run build` to prepare the generated configuration, geometry
and font. If the normal image overflows, run:

```sh
node tools/lcd-model.mjs --diagnostic-lower-origin
```

Run each heavy command under the project's shared resource guard. This
option verifies the pinned TAS assembler, runner and runtime, then moves a
private copy of both workspace and ROM down by 2000h. Page offsets and
relative-branch distances remain unchanged. It reports CODEEND's byte cost,
the implied normal-origin end and a hash of the actual source inputs. The
relocated image is discarded. It is neither run nor written to build or
distribution directories.

This diagnostic does not establish normal-origin placement, the 128-byte
ROM reserve, RAM layout, service compatibility or runtime correctness. A
normal-origin build and the full qualification gates remain required.

## Pending checks

The focused cases in `test/lcd.test.mjs` cover independent LCD and registered
routing, public UC1 selection, transient registration, complete rollback,
startup choices with the actual generated starter, stale input, held keys,
serial action bursts, invalid serial frames and both LCD profiles. The same
file includes TED editing, scrolling, saving and reopening at 20 by 4 and
40 by 4. These new cases have not yet been run against a combined image.

Serial Escape actions retain the whole question budget while waiting for
CSI or SS3 completion. A bare Escape or incomplete sequence rolls back.
Ordinary keys confirm immediately. CR uses a separate sixteen-poll optional
LF window. A frame already being received completes before return. Tests
exercise LF starting in the final poll and LF arriving after expiry. A later
LF is normal serial input, not a promised part of the confirmation action.
The precise elapsed interval and ten-second question bounds still need
measurement at 4 MHz, including late-start bad frames after idle rearming.

Physical checks remain necessary for both LCD profiles, the experimental
second-controller wiring, serial timing and actual reset recovery. Emulator
evidence must be recorded separately from those board results.
