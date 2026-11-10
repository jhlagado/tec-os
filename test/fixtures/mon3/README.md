# The MON-3 reference

The MON3.SVC tests compare a program under MON3.SVC with the same program
under MON-3 itself. This folder holds the recorded result of the reference
run. It does not hold MON-3.

## MON-3's ROM is a pinned input, not a file here

- **What:** `mon3.bin`, 16,384 bytes, SHA-256
  `9eacfdc8ef5937a27a39cf4a10a3479334695b8fb94d1076a58a8306f144c1ac`. It is
  MON-3 release 2025.16 for the TEC-1G (`MON3.1G`), by Brian Chiha with
  Craig Hart, Mark Jelic, Ian McLean and James Elphick, as its source says.
- **Where from:** the public repository `jhlagado/debug80-tec1g-mon3`, commit
  `000c052ab857f8cbfe9deaf7dcd3dd23675744c3`, path
  `roms/tec1g/mon-3/mon3.bin`.
- **Licence:** that repository has no licence file at that commit, and
  neither `mon3.bin` nor its source there carries a licence statement. With
  no stated permission to redistribute it, the ROM is not copied into this
  repository.
- **How the tests get it:** as `MON3.BIN` in `test/inputs.json`, the way the
  other outside files are pinned: from `MON3_BIN`, then `.inputs/MON3.BIN`,
  then `../debug80-tec1g-mon3/roms/tec1g/mon-3/mon3.bin`. `npm run inputs`
  fetches it. Without it the MON3.SVC tests that need the reference are
  skipped, or fail under `STRICT=1`.

## `hello3-reference.json`

The result of `reference()` in `test/lib/mon3.mjs` for `HELLO3.BIN`
(`test/programs/hello3.asm`, 173 bytes, SHA-256
`666ca183a9014e3bb170033afaaf4c6397917dcf3719aa4b43ffb6897ed4d913`), on the
pinned `@jhlagado/debug80-runtime`.

The harness puts MON-3's ROM at C000h, the first 256 bytes of it at 0000h
and its 23 default bytes at 0886h, as MON-3's own reset leaves them, sets
`SYS_MODE` (089Dh) to 01h, and enters MON-3 at C284h, where its GO key
clears the LCD, with HL 4000h and SP 0880h. It records:

- **`at4000`:** the registers, flags and interrupt state at the program's
  first instruction, the speaker edges since GO, and the LCD's fourth row;
- **`after`:** the LCD, the edges and the digits 3,000,000 cycles later;
- **`key`:** the edges and digits after key 5 is held for 400,000 cycles and
  released for 400,000;
- **`back`:** where the AD key's `RET` lands, and SP there.

`test/ks53-hello.test.mjs` runs the harness again and requires the same
result, then compares MON3.SVC with it.
