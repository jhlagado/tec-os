# MON3.SVC: MON-3 programs on TEC-OS

Status: **S3**, 2026-11-11 (KS53): install and entry, `LOAD` of a `.BIN` or a
`.HEX`, `GO`, `EXIT` and re-entry; MON-3's restarts, 46 of its 63
`RST 10h` calls (42 implemented, 4 translated) and 21 of its 34 `RST 18h`
graphics calls, the matrix keyboard, the checksum of TEC-OS's tables on a
program's return, MON-3's graphics workspace at each entry, and the GLCD
console given back after a program draws. `test/mon3.test.mjs`,
`test/ks53-hello.test.mjs`, `test/mon3-s2.test.mjs` and
`test/mon3-s3.test.mjs` hold it, the last two comparing each call with
MON-3's own ROM on the same emulator. All of it is emulator evidence.

`MON3.SVC` is a service (`docs/services.md`) that runs programs written for
MON-3, the TEC-1G's own monitor, under TEC-OS. The MON-3 it follows is
`jhlagado/debug80-tec1g-mon3` at `000c052`, whose ROM is the pinned
`MON3.BIN` the tests compare it with (`test/inputs.json`). Media builds it
with TAS into `dist/MON3.SVC`, beside the ROM, and puts it on the starter
card, the one card, which the Viewer runs too. Beside it are `HELLO3.BIN`,
built by TAS from `test/programs/hello3.asm` to load at 4000h, and that
source as `HELLO3.ASM`, which `TAS HELLO3 HELLO3.BIN` builds on the card
(`test/starter.test.mjs`).

## Install and enter

```text
A>MON3.SVC

MON3>LOAD HELLO3.BIN

MON3>GO
...
MON3>EXIT

A>
```

`MON3.SVC` installs the service if it isn't in, and enters it: its execution
record asks to be entered on install. It stays installed after `EXIT`, so
`MON3.SVC` enters again without reading the file. Warm boot keeps it, and
`UNLOAD` or a reset removes it. `docs/services.md` gives the identity rule:
`B:MON3.SVC` enters the copy installed from A:, and a second copy needs
`UNLOAD` first. An older card's line with `/E` after the name still enters:
the `/E` is only a tail, which `MON3.SVC` doesn't read.

On the starter card it is 4,606 bytes of header and image in **18 pages**: the
word at `0006h` goes from `B9A9h` to `A700h`, and the TPA from 47,273 bytes to
**42,496**. With `GLCD.SVC` installed too, as the GLCD console's startup does,
the TPA is **41,728**. The monitor, its line buffer, its FCB, its saved page
zero and its stack are all in those pages, above anything a MON-3 program may
load into. MON-3's graphics buffer and variables are not: they are MON-3's
own workspace, in the TPA where MON-3 keeps them.

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
  A file must hold at least one data record. The end record (type 01h, no
  data) must come; after it only CR, LF and 00h,
  up to the text's end: the first 1Ah, or the end of the file's last record.
  Any other type, a bad digit or checksum, a record past FFFFh, or text out
  of place is refused. A disk error during either pass ends the session.
  `BIG16K.HEX`, 16 KB in 46,093 characters, loads in 64,083,813 T-states,
  16 s at 4 MHz, on the starter card with `MON3.SVC` alone. The figure
  moves by some tens of thousands of T-states with where the file lies on
  the card, which other files change.
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
next use (BDOS 37), and the GLCD console's panel is set again ("The GLCD
console", below). Two things keep the key that ended the program, AD or
Esc, off the `MON3>` line. Each read of the matrix records the key in
`KBLAST` ("Coverage in S2", below), so TEC-OS's scan takes a key still held
as held, not new, and the Viewer, which holds a key until that scan has
read it, lets it go. And while CON: is a matrix console, `CRT:` or `UC1:`
(IOBYTE bit 0 set), the return holds `MON3>` back until no key is down.
Each pass runs MON-3's `scanKeys`, then scans the matrix itself, whatever
`scanKeys` took as its input, so `KBLAST` is fresh. It then asks `KBLAST`
for no matrix key at all, chords and keys outside the keypad's set
included, and `KPRESS` for no keypad key. TEC-OS reads the matrix into a
line by the switch as it was at cold boot, so a matrix key held while the
keypad ends a program, after the Matrix switch has gone off, is recorded
as held and holds `MON3>` back too. While a key is
held the console is polled (BDOS 6 with E = FFh) and what it reads is
dropped. On `TTY:` and `BAT:` the console reads only the serial line, so a
held key can't reach the line and there is no wait. The poll can itself
move CON: from `UC1:` to `TTY:`, when `GLCD.SVC` isn't in, so each pass
reads the IOBYTE again, and the wait ends there. Then a form feed gives the console back. Then come the tables'
warning or the breakpoint's `BRK nnnn`, if there is one, then
`MON3>`, in that order on every console, so that a video console still shows
the message after the form feed has cleared it. A program that
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
`Tables damaged: EXIT and reset`, after the return's form feed, and sets a
flag that only a reset clears,
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

MON-3's graphics workspace is set at each entry too, as every MON-3 reset
leaves it through `initLCD`: `GBUF`, 0A00h–0DFFh, and the graphics calls'
variables, 0E00h–0E19h, hold zero, except `VPORT` (0E13h), the buffer the
drawing calls use, which holds 0A00h. `CLRBUF` (0E0Ch) zero is the session's
choice, as no MON-3 reset writes it. The step runs at each entry by `MON3.SVC`, after
the service is installed or found, and at call 2. A program's `GO` and its
return do not run it, as MON-3's `softBoot` does not, so what one program
leaves there the next one finds.

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
0038h–003Fh, 0041h–004Fh and 0066h as they were before the entry. The sweep does
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
The next entry takes it out first, and `UNLOAD` does too.

## Coverage in S2

| Entry | MON-3 | In S2 |
| --- | --- | --- |
| `RST 00h` | monitor reset | ends the session at `A>` through TEC-OS's warm boot |
| `RST 08h` | `scanKeysWait` | implemented, keypad and matrix |
| `RST 10h` | API, selector in C | the calls below; a selector of 63 or more shows `displayError` |
| `RST 18h` | GLCD API, selector in A | calls 0 to 20, MON-3's own routines; 21 and above show `displayError` |
| `RST 20h` | digits, keys, LCD wait | implemented, keypad and matrix, with MON-3's fall-through flags |
| `RST 28h` | LCD busy wait | implemented |
| `RST 30h` | breakpoint | prints `BRK` and the address and returns to `MON3>`. There is no resume |
| `RST 38h` | `USER_INT` | through `USER_INT`, when 0038h held its default at entry |
| NMI | `USER_NMI` | through `USER_NMI` at 0066h, in a session |

Each restart reaches its handler 101 T after the `RST`, the interrupt 103 T
after its acknowledge.

`RST 10h` calls implemented, 42 of them: 0 `softwareID`, 1 `versionID`,
3 `beepAlways`, 4 `convAToSeg`, 5 `regAToASCII`, 6 `ASCIItoSegment`,
7 `stringCompare`, 8 `HLToString`, 9 `AToString`, 10 `scanSegments`,
11 `displayError`, 12 `LCDBusy`, 13 `stringToLCD`, 14 `charToLCD`,
15 `commandToLCD`, 16 `scanKeys`, 17 `scanKeysWait`, 18 `matrixScan`,
19 `joystickScan`, 20 `serialEnable`, 21 `serialDisable`, 22 `txByte`,
23 `rxByte`, 25 `sendToSerial`, 26 `receiveFromSerial`, 28 `sendHex`,
29 `genDataDump`, 30 `checkStartEnd`, 33 `timeDelay`, 34 `playNote`,
35 `playTune`, 37 `getCaps`, 38 `getShadow`, 39 `getProtect`,
40 `getExpand`, 45 `stringToSerial`, 49 `random`, 53 `matrixScanASCII`, 54 `parseMatrixScan`,
55 `LCDConfirm`, 56 `getGLCDTerm` and 62 `RGBScan`. With the matrix
keyboard fitted (port 03h's bit 0 set), calls 16 and 17, `RST 08h` and
`RST 20h` read it at port FEh as MON-3 does, a row at a time.

Translated, on TEC-OS's resources, 4 of them: 2 `preInit`, 41 `setCaps`,
43 `setProtect` and 48 `toggleCaps`. Call 2 sets the workspace up again and
returns to `MON3>` with nothing runnable, after checking the tables. MON-3's
`preInit` is a hard restart that sets the GLCD up again through `initLCD`;
the session's call 2 does not. On the GLCD console its return sets the
panel's modes as any return does, and on any other console it leaves the
panel as the program left it. Calls
41, 43 and 48 write the latch as `GO` takes it, PROTECT and CAPS with the
overlay off, and `LATCHV` with it.
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
- Each restart enters through the latch stub at 0041h, which writes the
  latch from `LATCHV` to port FFh before the handler runs: one more write
  to port FFh at every restart than MON-3 makes, of the value already
  there.
- Calls 0 and 1 return HL at their strings in the service, `MON3.1G` and
  `2025.16`, not in MON-3's ROM. The strings are MON-3's.
- With the matrix fitted, MON-3 and the session read the matrix, not the
  keypad.
- Each read of the matrix, by `scanKeys`, `scanKeysWait`, `RST 20h` or
  `matrixScan` (call 18) and the calls built on it, also records the key it
  found, or FFh for none, in TEC-OS's last matrix key, `KBLAST`, which
  `abi.inc` publishes (`docs/services.md`), as TEC-OS's own scan records
  it. MON-3 has no such byte, and nothing a program sees changes. While a program runs, TEC-OS's scan
  doesn't run, so without this a host that holds a matrix key until TEC-OS
  has read it, as the Viewer does, would never let it go, and no later key
  would come. Back at `MON3>`, or after `EXIT`, TEC-OS's scan finds a key
  still held recorded and doesn't take it as a new one.

## RST 18h: the graphics calls

`RST 18h` takes the call in A, as MON-3 does. The service runs MON-3's own
routines for calls 0 to 20, in MON-3's order, with only their addresses
moved, so each leaves the registers, the flags, memory and the ST7920 as
MON-3's does, and takes MON-3's time from its first instruction to its
`RET`. They draw into the 1,024-byte buffer at `VPORT`, `GBUF` unless a
program moves it, and `plotToLCD` copies it to the panel.

Graphics calls implemented, 21 of them: 0 `initLCD`, 1 `clearGBUF`,
2 `clearGrLCD`, 3 `clearTxtLCD`, 4 `setGrMode`, 5 `setTxtMode`,
6 `drawBox`, 7 `drawLine`, 8 `drawCircle`, 9 `drawPixel`, 10 `fillBox`,
11 `fillCircle`, 12 `plotToLCD`, 13 `printString`, 14 `printChars`,
15 `delayUS`, 16 `delayMS`, 17 `setBufClear`, 18 `setBufNoClear`,
19 `clearPixel` and 20 `flipPixel`.

Deferred, and refused: 21 `drawGraphic`, 22 `invGraphic`,
23 `initTerminal`, 24 `sendCharToLCD`, 25 `sendStringToLCD`,
26 `sendRegToLCD`, 27 `sendHLToLCD`, 28 `setCursor`, 29 `getCursor`,
30 `displayCursor`, 31 `autoLF`, 32 `underline` and 33 `plotAlways`. They
share MON-3's 1,536-byte font, its cursor and the terminal's buffers at
1000h–17BFh, about nine pages more, and the small ones only set or read
state that the others use, so none is built alone. Each shows `displayError`, waits for a
key and returns as a key press does, as the refused `RST 10h` calls do;
a call of 34 or more does the same, as under MON-3. None reports success,
and none writes the ST7920.

As in MON-3, the routine gets BC, DE and HL as the caller left them and
returns straight to the caller, and IX is lost. A on entry is not MON-3's
(the low byte of the routine's address there), but no routine reads it.
After call 14, DE ends in the service's copy of MON-3's row table, not in
MON-3's ROM. From the `RST` to the routine's first instruction the session
takes 253 T, MON-3 175 T: the restart path's 101 T and a 17 T test that
refuses 21 and above, against MON-3's 21 T jump and its 19 T test. So a
program takes MON-3's time and 78 T more for each `RST 18h`.

## The GLCD console

At a program's return, when CON: is `UC1:` (IOBYTE AND 3 is 3), the
session sends the ST7920 `GLCD.SVC`'s own mode bytes, 30h, 0Ch, 01h, 34h
and 36h, the same as its `GLCMOD`, each followed by about 2.1 ms (8,389 T at
4 MHz, MON-3's own count of 0140h), before the form feed. That is the basic set, the display on, DDRAM cleared, the extended set
and graphics on, so the console's text shows again whatever the program
left: text mode, or text in DDRAM over the graphics. It runs on every
return, by `RET`, `RST 30h` or call 2. It runs whenever CON: is `UC1:`,
whatever driver holds it, and also when `GLCD.SVC` has been removed and
IOBYTE left at `UC1:`. It reads no status and uses fixed delays, so it
cannot hang, and with no GLCD fitted its writes go nowhere. It takes
41,999 T, about 10.5 ms. It leaves the ST7920's reversed lines and scroll as a program set
them, as `GLCD.SVC`'s own restore does. `EXIT` needs none of its own: its
warm boot restores the console's driver.

On any other console the panel stays as the program left it, as MON-3's
`softBoot` leaves it: a program's text mode, its DDRAM text and its
graphics are still there at `MON3>`.

The tested programs are `HELLO3` (`test/programs/hello3.asm`) and ten of
the pinned repository's own: `lcd-test`, `serial`, `matrix-demo`,
`matrix-demo-rgb` and `matrixz80`, and the GLCD programs `glcd-mad`,
`glcd-maze`, `glcd-text`, `glcd-3d` and `glcd-demo`, each compared with
MON-3's own ROM. `glcd-maze` seeds its maze from R, which counts
instruction fetches and so follows the side; the comparison sets R to 0 at
its two `LD A,R` on both sides. The console's return is tested with
`glcd-mad` and `test/programs/glcdret.asm`.

## Limits

- **Not built:** `RST 18h`'s calls 21 to 33, the GLCD terminal and the
  graphics font, and the deferred `RST 10h` calls above. A program that
  calls them sees `displayError`.
- **MON-3's dispatch at 0040h**, which MON-3 copies to RAM, is not there in a
  session: a program that calls 0040h directly, outside MON-3's restarts, is
  not supported.
- **MON-3's disk calls**, 58 to 61, are not translated to CP/M files.
- **No recovery from a hang** or from arbitrary memory damage: a program that
  loops needs the reset button. GO's flush keeps what was written before GO.
- **The accepted disk hazard.** A MON-3 program that writes B9A9h–BFFFh, the
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
