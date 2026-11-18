# Protected-code link pricing

This branch contains a non-executing diagnostic experiment. It does not
implement a bootable RAM architecture, change the accepted LCD revision,
reduce the supported TPA or qualify a firmware release. The model is in
Origo, `studies/p3-tec-os/stages/rom-resident-link-price-model.md`.

The helper compiles the frozen LCD/font target sources with the actual
reviewed prompt-history source patch. It emits the proposed RAM body first,
then workspace reservations, then retained ROM. This respects TAS's
forward-only origins. Genuine HEX and the debug file must agree; packet
coverage, reservation boundaries, ROM console policy and placement
convergence are checked before a subtotal can be reported.

Prepare the normal pinned TAS and host as in README.md. Place the exact
Baza codec `tools/pack-com.mjs` from
`eee4ee6846add13c0ea120fbf2de8be0ec08c0b1` at `.inputs/pack-com.mjs`.
Its required SHA-256 is
`9dff4655a698ff921ebd94d0c5aebf5853c755952cef2f47097cbc3875161b3e`.
The helper checks it before importing its host parse/encode/decode functions.

On a clean committed tree, run `node tools/rom-link-price.mjs` under Origo's
shared memory guard. The report goes to standard output. There is no
experimental image output or execution option. Temporary HEX, debug and
source copies are deleted even on refusal. Normal source generation is
reused, but neither the product build nor an experimental target is run.
The existing TAS compiler itself runs on its pinned host, as for other
assembly measurements.

`node --test test/rom-link-price.test.mjs` checks the host HEX refusal and
placement rules without compiling or executing target code. These tests
cannot qualify native timing, stacks, callbacks, reset, NMI or a board.

A retained-ROM-plus-packed-payload subtotal excludes the decoder, bounds,
checksum, metadata, cold installation and failure path. The report lists
those costs as unpriced. It cannot clear the 128-byte reserve. Resident
combinations falling below `8000h` are reported as coexistence failures;
the proposed smaller shell is a separate unqualified dependency.

No helper result should enter dist/, a runtime fixture, hosting or a release.
A complete installation price and reviewed memory contract must precede any
proposal to change permanent application memory or the landing order.
