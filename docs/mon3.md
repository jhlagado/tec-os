# MON3.SVC: MON-3 programs on TEC-OS

Status: **S1**, 2026-11-10 (KS53): install, `/E`, `LOAD` of a `.BIN`, `GO`,
`EXIT` and re-entry, with the first MON-3 calls. `test/mon3.test.mjs` and
`test/ks53-hello.test.mjs` hold it. All of it is emulator evidence.

`MON3.SVC` is a service (`docs/services.md`) that runs programs written for
MON-3, the TEC-1G's own monitor, under TEC-OS. The MON-3 it follows is
`jhlagado/debug80-tec1g-mon3` at `000c052`, whose ROM is the pinned
`MON3.BIN` the tests compare it with (`test/inputs.json`). Media builds it
with TAS into `dist/MON3.SVC`, beside the ROM. It is on no card yet.

## Install and enter

```text
A>MON3.SVC /E

MON3>LOAD HELLO3.BIN

MON3>GO
...
MON3>EXIT

A>
```

`MON3.SVC /E` installs the service if it isn't in, and enters it.
`MON3.SVC` alone installs it and never enters. It stays installed after
`EXIT`, so `MON3.SVC /E` enters again without reading the file. Warm boot
keeps it, and `UNLOAD` or a reset removes it. `docs/services.md` gives the
identity rule: `B:MON3.SVC /E` enters the copy installed from A:, and a
second copy needs `UNLOAD` first.

On the starter card it is 2,713 bytes of header and image in **11 pages**: the
word at `0006h` goes from `B9A4h` to `AE00h`, and the TPA from 47,268 bytes to
**44,288**. The monitor, its line buffer, its FCB, its saved page zero and its
stack are all in those pages, above anything a MON-3 program may load into.

## Commands

The line is read by BDOS 10 and made upper case. Anything but these three
prints `?`.

- **`LOAD name.BIN [addr]`**, or any type but `HEX`, loads the file at 4000h, or at the hexadecimal
  `addr`, in whole records. The address has one to four digits and ends at a
  space or the line's end, and a drive is A: to P:. The name has at most
  eight characters and the type three, and neither may hold `?` or `*`.
  Anything else prints `?`, and such a name is never looked up. CP/M keeps no byte length, so a file's last
  record loads whole, with its padding. The size is read first. Every byte
  must lie between 0100h and the page of `(0006h)`, and none in 0800h–08FFh,
  MON-3's stack and variables. The file must hold a record. Otherwise the
  line prints `?` with nothing written, and so does a file not found. Until a
  load ends well nothing is runnable, so a refused load leaves nothing
  runnable. A disk error during the load ends the session, as any BDOS error
  does.
- **`LOAD name.HEX`** loads an Intel HEX file at its records' own
  addresses, and takes no address. The file is read twice, a 128-byte record
  at a time into 0080h: the first pass checks every record and writes
  nothing, the second writes them. So a file with any fault prints `?` with
  nothing written and nothing runnable, and a good one leaves the program
  runnable at 4000h, `GO`'s default. The digits may be of either case. Each
  record is `:`, a length, an address, a type, its data and its checksum.
  A data record (type 00h) holds at least one byte, and each byte must lie
  where a `.BIN` load may write. Between records only CR and LF may come.
  The end record (type 01h, no data) must come; after it only CR, LF and 00h,
  up to the text's end: the first 1Ah, or the end of the file's last record.
  Any other type, a bad digit or checksum, a record past FFFFh, or text out
  of place is refused. A disk error during either pass ends the session.
  `BIG16K.HEX`, 16 KB in 46,093 characters, loads in about 64 million
  T-states, 16 s at 4 MHz.
- **`GO [addr]`** runs the last good load, or `addr`. With neither it prints
  `?`. It first flushes the cache (BDOS 48), so a program that hangs loses
  nothing written before it ran. Then it does what MON-3's `GO` does: the LCD
  cleared and `Running at: nnnn` on row 4, a beep unless `KEY_BEEP` turns it
  off, the latch written from `SYS_MODE` with `PROT_MODE`, and `KEY_BUFF` set
  to FFh. Only the PROTECT and CAPS bits are taken: whatever a program left
  in `SYS_MODE`, GO never sets EXPAND or a bank bit, which would hide the
  service and TEC-OS's cache, and never lets the boot overlay over page zero.
  The same value goes to `LATCHV`. The program starts with interrupts off and:

  | Register | Value |
  | --- | --- |
  | A | FFh |
  | B | the latch's copy, `SYS_MODE` |
  | C | 0 |
  | HL | the program's address |
  | SP | 087Eh, holding the return address 0049h |
  | DE | 0049h. MON-3's is C209h, its own return: the one difference |

- **`EXIT`** turns interrupts off, sets IM 1, resets the drives, puts page
  zero back, takes the warm-boot hook out, turns the digits and LED matrix
  off, leaves the serial line idle, and warm boots to `A>`.

A program's `RET` comes back to `MON3>`. Interrupts go off, PROTECT is
cleared, the serial line is idle again, the session's page zero is written
again, every drive's allocation vector is rebuilt from its directory at its
next use (BDOS 37), and a form feed gives the console back. A program that
pushes into MON-3's 128-byte stack, or past it into the TPA below 0800h,
still comes back: what it overwrote in the TPA is its own loss, and the
service's pages are untouched.

## What a program finds

MON-3's workspace is where MON-3 keeps it, set at each entry: the signature
`MON3.1G` at 0800h, the stack top at 0880h, MON-3's defaults from 0886h,
`USER_INT` (0892h) at a `RETI`, `USER_NMI` (0894h) at the `RETN` at 004Eh,
`SYS_MODE` (089Dh) the latch's shadow, and `PROT_MODE` (089Eh) 0. TEC-OS's own
page zero and `LATCHV` stay TEC-OS's: MON-3's first 256 ROM bytes are never
copied down.

In a session, and only then, the service holds these bytes of page zero:

| Bytes | In a session |
| --- | --- |
| 0008h–0030h, each slot | `PUSH HL`, `LD HL,handler`, `JP 0041h`, a zero |
| 0038h | the same, if it held the default, which starts with `EI`. A `JP` held there is left alone, and the session says `RST 38 held: no interrupts` |
| 0041h–0048h | the latch stub: the latch reloaded from `LATCHV`, so EXPAND 0 is in view before the service runs, then `JP (HL)` |
| 0049h–004Dh | GO's return: `LD HL,` the return handler, `JR 0041h` |
| 004Eh–004Fh | `RETN`, the default NMI handler |
| 0066h–006Bh | MON-3's NMI dispatch through `USER_NMI` |

No slot starts with a `JP`, so every warm boot's sweep clears them. The RAM
BIOS table's warm-boot entry points at the service's hook for the session.
At a warm boot the hook sets IM 1, idles the serial line, resets the drives
(BDOS 37, on the service's own stack), and puts back the IOBYTE and drive,
0038h–003Fh, 0041h–004Fh and 0066h as they were before `/E`. The sweep does
0008h–0037h.

Entry is refused, with return code FF00h and nothing changed:

- `RST nn held: UNLOAD or reset` when a slot from 08h to 30h holds a `JP`: a
  service's claim, or a `JP` into ROM a program left;
- `MON3 active` when a program in a session calls the entry. The call returns
  to the program.

## The ways out

`EXIT`, ^C at `MON3>`, a program's `RST 00h`, `JP 0000h` or BDOS 0, and a BDOS
error all end the session at `A>` through the warm boot, with 0008h–003Fh,
0041h–004Fh, the NMI entry, the IOBYTE and the drive as they were, and IM 1.
Each also resets the drives, so every allocation vector is rebuilt from its
directory at its next use, as after a program's `RET`.

A program that sets EXPAND through port FFh and jumps to 0000h is the one
exit that passes the hook: under EXPAND 1 the RAM BIOS table is not the one
hooked. The sweep still clears the slots, so no vector is left pointing into
the service, but the IOBYTE, IM and the NMI entry stay as the program left
them, and the drives are not reset. The hook it leaves behind only takes
itself out at the next warm boot.
The next `/E` takes it out first, and `UNLOAD` does too.

## Coverage in S1

| Entry | MON-3 | In S1 |
| --- | --- | --- |
| `RST 00h` | monitor reset | ends the session at `A>` through TEC-OS's warm boot |
| `RST 08h` | `scanKeysWait` | implemented |
| `RST 10h` | API, selector in C | the calls below; every other selector up to 62, and any above, shows `displayError` |
| `RST 18h` | GLCD API, selector in A | `displayError` (S3) |
| `RST 20h` | digits, keys, LCD wait | implemented, with MON-3's fall-through flags |
| `RST 28h` | LCD busy wait | implemented |
| `RST 30h` | breakpoint | prints `BRK` and the address and returns to `MON3>`. There is no resume |
| `RST 38h` | `USER_INT` | through `USER_INT`, when 0038h held its default at entry |
| NMI | `USER_NMI` | through `USER_NMI` at 0066h, in a session |

`RST 10h` calls implemented: 3 `beep`, 4 `convAToSeg`, 10 `scanSegments`,
11 `displayError`, 12 `LCDBusy`, 13 `stringToLCD`, 14 `charToLCD`,
15 `commandToLCD`, 16 `scanKeys`, 17 `scanKeysWait`, 18 `matrixScan`,
33 `timeDelay`, 37 `getCaps`, 48 `toggleCaps`, 53 `matrixScanASCII` and
54 `parseMatrixScan`. With the matrix keyboard fitted (port 03h's bit 0
set), calls 16 and 17, `RST 08h` and `RST 20h` read it at port FEh as
MON-3 does. As in MON-3, the dispatch passes AF, BC and HL as the caller
left them, and IX is lost. `displayError` is MON-3's own refusal: no call
that isn't built returns as if it had worked. The beep keeps port 01h's bit 6
high, so the serial line stays idle. The tested program is `HELLO3`
(`test/programs/hello3.asm`), compared with MON-3's own ROM.

## Limits

- **Not yet shipped:** HEX loading, the matrix keyboard (calls 18, 53 and 54),
  the checksum of TEC-OS's tables on a program's return, `RST 18h`'s graphics,
  and the other `RST 10h` calls. They come in S2 and S3.
- **MON-3's disk calls**, 58 to 61, are not translated to CP/M files.
- **No recovery from a hang** or from arbitrary memory damage: a program that
  loops needs the reset button. GO's flush keeps what was written before GO.
- **The accepted disk hazard.** A MON-3 program that writes B9A4h–BFFFh, the
  BDOS entry, the allocation vectors, the workspace and the RAM BIOS table, can
  damage TEC-OS's disk tables. The protections are the flush before `GO`,
  BDOS 37 on every return, at `EXIT` and at every other way out but the
  EXPAND one, and the latch stub. S2 adds the
  tables' checksum on return. Nothing snapshots TEC-OS's state around a
  program.
- **EXPAND 1 is TEC-OS's cache.** The service doesn't use it, and a program
  that sets EXPAND sees the cache. A call through a restart sets the latch
  back first.
