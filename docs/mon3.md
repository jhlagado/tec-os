# MON3.SVC: MON-3 programs on TEC-OS

Status: **S2**, 2026-11-10 (KS53): install, `/E`, `LOAD` of a `.BIN` or a
`.HEX`, `GO`, `EXIT` and re-entry; MON-3's restarts and 46 of its 63
`RST 10h` calls, the matrix keyboard, and the checksum of TEC-OS's tables on
a program's return. `test/mon3.test.mjs`, `test/ks53-hello.test.mjs` and
`test/mon3-s2.test.mjs` hold it, the last comparing each call with MON-3's
own ROM on the same emulator. All of it is emulator evidence.

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

On the starter card it is 3,607 bytes of header and image in **15 pages**: the
word at `0006h` goes from `B9A4h` to `AA00h`, and the TPA from 47,268 bytes to
**43,264**. The monitor, its line buffer, its FCB, its saved page zero and its
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

## The tables' checksum

`GO` sums, modulo 65,536, the service's own bytes from its header to its
saved page zero (code, tables, text, the load state, the hook's word and
the target it replaced) and the RAM BIOS table's 51 bytes, with the hook
linked. All of these stay fixed while a program runs. When the program
returns, by `RET`, `RST 30h` or call 2, the sum is taken again before
anything in it is written. A difference prints
`Tables damaged: EXIT and reset` and sets a flag that only a reset clears,
since a reset also removes the service: every later `LOAD` prints the
warning again and is refused without opening the file, and each re-entry
prints it before its first `MON3>`. `GO` and `EXIT` still run. The sum
itself, the flag, the digits `RST 30h` and `GO` write, the line buffer, the
FCB and the stack lie outside the summed bytes, which the monitor rewrites.

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

## Coverage in S2

| Entry | MON-3 | In S2 |
| --- | --- | --- |
| `RST 00h` | monitor reset | ends the session at `A>` through TEC-OS's warm boot |
| `RST 08h` | `scanKeysWait` | implemented, keypad and matrix |
| `RST 10h` | API, selector in C | the calls below; a selector of 63 or more shows `displayError` |
| `RST 18h` | GLCD API, selector in A | `displayError` (S3) |
| `RST 20h` | digits, keys, LCD wait | implemented, keypad and matrix, with MON-3's fall-through flags |
| `RST 28h` | LCD busy wait | implemented |
| `RST 30h` | breakpoint | prints `BRK` and the address and returns to `MON3>`. There is no resume |
| `RST 38h` | `USER_INT` | through `USER_INT`, when 0038h held its default at entry |
| NMI | `USER_NMI` | through `USER_NMI` at 0066h, in a session |

Each restart reaches its handler 101 T after the `RST`, the interrupt 103 T
after its acknowledge.

`RST 10h` calls implemented: 0 `softwareID`, 1 `versionID`, 2 `preInit`,
3 `beepAlways`, 4 `convAToSeg`, 5 `regAToASCII`, 6 `ASCIItoSegment`,
7 `stringCompare`, 8 `HLToString`, 9 `AToString`, 10 `scanSegments`,
11 `displayError`, 12 `LCDBusy`, 13 `stringToLCD`, 14 `charToLCD`,
15 `commandToLCD`, 16 `scanKeys`, 17 `scanKeysWait`, 18 `matrixScan`,
19 `joystickScan`, 20 `serialEnable`, 21 `serialDisable`, 22 `txByte`,
23 `rxByte`, 25 `sendToSerial`, 26 `receiveFromSerial`, 28 `sendHex`,
29 `genDataDump`, 30 `checkStartEnd`, 33 `timeDelay`, 34 `playNote`,
35 `playTune`, 37 `getCaps`, 38 `getShadow`, 39 `getProtect`,
40 `getExpand`, 41 `setCaps`, 43 `setProtect`, 45 `stringToSerial`,
48 `toggleCaps`, 49 `random`, 53 `matrixScanASCII`, 54 `parseMatrixScan`,
55 `LCDConfirm`, 56 `getGLCDTerm` and 62 `RGBScan`. With the matrix
keyboard fitted (port 03h's bit 0 set), calls 16 and 17, `RST 08h` and
`RST 20h` read it at port FEh as MON-3 does, a row at a time.

Translated, on TEC-OS's resources: 2 `preInit` sets the workspace up again
and returns to `MON3>` with nothing runnable, after checking the tables;
41 `setCaps`, 43 `setProtect` and 48 `toggleCaps` write the latch as `GO`
takes it, PROTECT and CAPS with the overlay off, and `LATCHV` with it.
PROTECT set by call 43 takes effect at once, as in MON-3, and the return to
`MON3>` clears it.

Not built, and refused: deferred 24 `intelHexLoad` (`LOAD name.HEX` reads
HEX from the card), 27 `sendAssembly`, 31 `menuDriver`, 32 `paramDriver`,
36 `playTuneMenu`, 46 `RTCAPI`, 47 `menuPop`, 50 `setDisStart`,
51 `getDisNext`, 52 `getDisassembly` and 57 `setGLCDTerm`; unsupported
42 `setShadow`, 44 `setExpand`, 58 `loadFromDisk`, 59 `openFile`,
60 `readSector` and 61 `writeSector`. Each shows `displayError`, waits for a
key and returns with A the key and Z and C set, as a key press gives:
MON-3's own convention, so a program sees the refusal only on the digits.
A refused call leaves its outputs unwritten: `DISFROM` (50 to 52),
`C_FILENO` (59) and 0600h–07FFh (60). `RTCAPI` answers every function with
carry and A = B, as MON-3 answers one it lacks, and touches no port.

As in MON-3, the dispatch passes AF, BC and HL as the caller left them, and
IX is lost. Calls 22 and 23 run at `BAUD`, which a session sets to 001Bh,
4800 baud, as MON-3 does with no RTC; `RNG_SEED` is seeded from R.

Where the session differs from MON-3, by design:

- Port 01h's bit 6, the serial TX line, stays high in the writes of calls 3,
  10, 34 and 35 and in the digit scans of 11 and `RST 20h`, so the line stays
  idle. A scan takes 5,604 T against MON-3's 5,495, with MON-3's registers
  and flags; the tones' periods are MON-3's.
- With the matrix fitted, MON-3 and the session read the matrix, not the
  keypad.

The tested programs are `HELLO3` (`test/programs/hello3.asm`) and five of
the pinned repository's own: `lcd-test`, `serial`, `matrix-demo`,
`matrix-demo-rgb` and `matrixz80`, each compared with MON-3's own ROM.

## Limits

- **Not yet shipped:** `RST 18h`'s graphics and the GLCD terminal (S3), and
  the deferred calls above.
- **MON-3's disk calls**, 58 to 61, are not translated to CP/M files.
- **No recovery from a hang** or from arbitrary memory damage: a program that
  loops needs the reset button. GO's flush keeps what was written before GO.
- **The accepted disk hazard.** A MON-3 program that writes B9A4h–BFFFh, the
  BDOS entry, the allocation vectors, the workspace and the RAM BIOS table, can
  damage TEC-OS's disk tables. The protections are the flush before `GO`,
  BDOS 37 on every return, at `EXIT` and at every other way out but the
  EXPAND one, the latch stub, and the tables' checksum on return. Every BDOS
  call the service makes goes through its own header, so a program that
  clears 0005h–0007h does not misdirect it. Nothing snapshots TEC-OS's state
  around a program.
- **EXPAND 1 is TEC-OS's cache.** The service doesn't use it, and a program
  that sets EXPAND sees the cache. A call through a restart sets the latch
  back first.
