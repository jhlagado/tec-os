---
title: D. Error messages
parent: TEC-OS
nav_order: 104
nav_group: "Reference"
---

# Appendix D. Error messages

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (main),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

An error message identifies the operation that stopped and the recovery still
available. The tables follow cold boot, the diagnostic prompt, the LCD, the
command processor and the BDOS, then failures in the block cache and `CD`.
Ordinary status lines have a separate table at the end.

In a message `d` stands for a drive letter, `n` for a decimal number, `NAME`
for a word from the command line, `LABEL` for a volume's label and `nn` for a
code in hexadecimal. The rest is printed as it stands. `tecvol` runs on a PC
and [Appendix F](appendix-f-tecvol.md) describes it. The board diagnostics
are a separate program that MON-3 loads, described in
[Chapter 28](28-diagnose-the-machine.md).

## Cold boot

Cold boot checks the RAM once before the banner. This message goes straight to
the serial port and TEC-OS then stops in a loop. It doesn't appear on a
display or on the LCD.

| Message | Cause | Remedy | See |
| --- | --- | --- | --- |
| `TEC-OS needs 64K RAM` | The bank window at `8000h–BFFFh` failed the RAM patterns or the bank probe did not find EXPAND 1 behind it. | Fit the required 32 KiB RAM chip in U9 and check the configuration, then reset. | [Appendix G](appendix-g-tec-1g.md), `src/boot.asm:431-484`, `src/text.asm:11` |

## The diagnostic prompt

A card that can't be started or mounted stops cold boot after the banner:

```text
No volume mounted, error nn
R retry>
```

The prompt uses the ROM PICO9918 console when the PICO9918 responded at cold
boot and the Matrix switch enabled the matrix keyboard. Otherwise it uses
serial. This is a switch-enable test, not a keyboard-presence probe
(`src/console.asm:42-45`, `src/video.asm:18-24`, `src/pico.asm:53-68`).
The LCD's last row shows `CARD?` (`src/boot.asm:646-654`, `src/text.asm:14-16`).
`R` starts the LCD, card and mount again. A corrected or newly inserted card
can therefore mount without reset. The key is echoed as typed and `r`
retries too. Any other key gives the prompt again
(`src/boot.asm:92-101`, `642-653`).
[Chapter 28](28-diagnose-the-machine.md) explains the prompt.

Codes `01h` to `04h` and `0Bh` come from `SDINIT`, the start of the card
(`src/boot.asm:97-101`):

| Code | Cause | Remedy | See |
| --- | --- | --- | --- |
| `01` | `CMD0` did not return idle reply `01h` in 10 tries. An empty socket gives this code. | Insert a card and press `R`. | [Chapter 18](18-card-blocks-and-volumes.md), `src/sd.asm:190-217` |
| `02` | `ACMD41` did not return ready in 256 tries or `CMD55` returned an error bit. | Retry with `R`. If the fault persists, use another card. | [Chapter 18](18-card-blocks-and-volumes.md), `src/sd.asm:250-286` |
| `03` | `CMD58`, which reads the addressing type from the OCR, failed. | Retry, then use another card if it still fails. | `src/sd.asm:296-325` |
| `04` | `CMD16` failed to set a standard-capacity card's block length to 512 bytes. | Retry, then use another card if it still fails. | `src/sd.asm:311-322` |
| `0B` | The `CMD8` reply echoed a voltage range other than 2.7 to 3.6 V or a check pattern other than `AAh`. | Use another card. | `src/sd.asm:228-247` |

Codes `05h` to `0Ah` are the SD card driver's codes for a block read or write
(`src/sd.asm:18-26`, `336-347`). They do not reach this prompt directly.
The driver stores them in `SDERR`, with no later reader in the ROM. A failed
table read during mounting becomes code `20h`. A failed BDOS transfer gives
a disk error while a failed warm-boot flush gives `Write lost`. The
`CD` command's refusals are in their own table below.

| Code | Meaning |
| --- | --- |
| `05` | The card rejected the command |
| `06` | No read data token arrived within 65,536 polls |
| `07` | The write response was not accepted, including no response within 16 polls |
| `08` | The card stayed busy for 65,536 polls |
| `09` | The block is 4 GiB or more into a standard-capacity card, rejected before any command |
| `0A` | A non-`FFh` byte other than the `FEh` start token arrived while waiting for read data |

These are polling bounds, not measured deadlines (`src/sd.asm:397-431`,
`664-736`). Code 05 precedes block-data transfer. Codes 07 and 08 can follow
transmission of all 512 bytes so neither establishes rollback of a write.

Codes `20h` to `2Ah` come from the ROM's `MOUNT` routine, its check of the
container. The first check to fail stops the mount and no drive stays mounted
(`src/vol.asm:360-365`, `src/volutil.asm:10-20`).
[Appendix E](appendix-e-container-format.md#the-checks-and-their-codes) gives
every check in order and
[Chapter 18](18-card-blocks-and-volumes.md) explains them.

| Code | Cause | Constant |
| --- | --- | --- |
| `20` | Block 0 or an extension block of the volume table could not be read. | `src/vol.asm:46-48`, `165-171`, `200-204` |
| `21` | Block 0 does not begin with `TECOSVOL`. | `src/vol.asm:51-62` |
| `22` | The container's major version is unsupported. | `src/vol.asm:64-71` |
| `23` | The header or descriptor size is wrong or the applicable drives field exceeds 4. | `src/vol.asm:74-87`, `143-147` |
| `24` | The volume count is zero, above 8 for format 1.0 or above 127. | `src/vol.asm:89-106` |
| `25` | The header checksum or applicable extension-table sum differs. | `src/vol.asm:112-115`, `152-182` |
| `26` | Bad descriptor fields: zero id, invalid flags or geometry, length differing from its geometry or a zero/misaligned start. | `src/vol.asm:204-244`, `355-356` |
| `27` | A volume's exclusive end overflows 32 bits, exceeds the declared container or exceeds `800000h` on a standard-capacity card. That card's last addressable block is `7FFFFFh`, within its first 4 GiB. | `src/vol.asm:254-296` |
| `28` | A volume starts before the preceding volume's end. | `src/vol.asm:245-252` |
| `29` | A drive is invalid, exceeds the header's requested drive count or is assigned twice. | `src/vol.asm:307-329` |
| `2A` | No volume is assigned to drive A. | `src/vol.asm:343-353` |

For `20h`, `R` retries the read. A repeated read failure or a structural fault
needs card inspection. [Chapter 6](06-cards-on-the-pc.md#recovery-after-a-power-cut)
gives the copy-first procedure. `tecvol verify` reports container and directory
faults. `get` also validates the container before extraction so a failed
container check prevents any file read. `get` does not perform the complete
directory check that `verify` does. A fresh image can be made with `create`
and `put` or a starter recipe
(`tools/tecvol.mjs:71-81`, `113-137`, `157-164`).

The browser uses a high-capacity card model and rejects truncated images
before opening them. It therefore does not reproduce the standard-capacity
limit or Chapter 6's short-image failure through Open image. Other code
27 causes remain ROM checks, including end overflow and the declared
container bound (`host/machine.mjs:49`, `web/src/main.mjs:604-630`,
`tools/lib/container.mjs:146-149`, `171`, `src/vol.asm:254-296`).

## The LCD's words

TEC-OS writes two words on the 20 × 4 LCD's last row for a board that may
have no terminal attached.
[Chapter 26](26-startup-inside-the-ccp.md#recovery-words-and-row-ownership) explains when each
is written and cleared.

| Word | Cause | Remedy | See |
| --- | --- | --- | --- |
| `CARD?` | Cold boot stopped at the diagnostic prompt. | `R` clears the LCD before retrying. A successful retry leaves the word cleared. | [Chapter 28](28-diagnose-the-machine.md), `src/boot.asm:92-101`, `632-652`, `src/text.asm:16` |
| `GLCD?` | `CON UC1` received a failure from loading or installing `A:GLCD.SVC`. Examples include a missing or invalid file, insufficient service space, a failed controller probe or a disabled Matrix switch. The old console mode is restored. A fatal BDOS disk error instead aborts the command before this path. | Check the file on A, board configuration and installed services. A successful GLCD load, a later console take or reset clears the ROM's word. Program text on that row has separate ownership. | [Chapter 26](26-startup-inside-the-ccp.md#recovery-words-and-row-ownership), `src/loader.asm:873-943`, `drivers/glcd.asm:60-73`, `src/video.asm:142-166` |

## The CCP's failures

Each failure in this section sets the return code to `FF00h`. Under the
shell an `&` piece after it is then skipped, and a `!` piece still runs
(`src/cpm/ccp.asm:563-570`, `210-227`, `docs/shell.md:53-89`).
[Chapter 13](13-results-and-command-chains.md)
explains the code. COPY, DEL and SERVICES are the
shell's commands, and the shell prints its own refusals in the same form,
the word and a question mark (`drivers/shell.asm:554-602`).

| Message | Cause | Remedy | See |
| --- | --- | --- | --- |
| `NO FILE` | `DIR` matched no visible file, including a match consisting only of system files. `TYPE` found no file or had no name. `ERA` matched nothing. `REN` found no old name. | Check the name, drive and user area. | [Chapter 4](04-work-with-files.md), `src/cpm/ccpfile.asm:98-104`, `203-207`, `518-525`, `585-587`, `src/cpm/ccpmut.asm:57-61`, `134-137`, `src/text.asm:25-26` |
| `FILE EXISTS` | `REN` found the new name already in the current user area on that drive. | Choose another name or erase the unwanted file first. | [Chapter 4](04-work-with-files.md), `src/cpm/ccpmut.asm:126-149`, `src/text.asm:52-53` |
| `NO SPACE` | `SAVE` received a make, write or close failure. It erases an existing destination before making the replacement. After a returned write failure it attempts close but a failed close does not guarantee a complete directory entry for the partial file. Fatal disk errors use BDOS messages instead. | Inspect the partial file, free space or save to another drive. Keep another copy of the original. | [Chapter 11](11-memory-for-programs.md), `src/cpm/ccpcmd.asm:309-388`, `src/text.asm:54-55` |
| `NO SOURCE` | `COPY` did not find its source in the current user area on the specified drive. No destination has changed. | Check the name, drive and user area. | [Chapter 4](04-work-with-files.md), `drivers/shellcmd.asm:93-99`, `drivers/shellcmd.asm:215` |
| `CANNOT MAKE DEST` | `COPY` could not allocate the destination's directory entry. An old destination has already been erased. | Free directory space or copy to another drive. | `drivers/shellcmd.asm:100-106`, `drivers/shellcmd.asm:216` |
| `WRITE ERROR` | `COPY` received a nonzero sequential-write result, such as no free block or no entry for the next extent. It attempts to close the destination before printing this message. That close can also fail. A successful close preserves the records already copied. | Inspect or erase the partial destination, free space and copy again. | `drivers/shellcmd.asm:113-121`, `148-154`, `src/cpm/bdosrec.asm:94-135`, `drivers/shellcmd.asm:217` |
| `CLOSE ERROR` | After reading the source, `COPY` received `FFh` from close because no directory entry matched the destination file control block (FCB). A fatal disk error aborts through the BDOS instead. | Inspect the destination and repeat the copy after correcting the cause. | `drivers/shellcmd.asm:130-135`, `src/cpm/bdosfile.asm:252-287`, `drivers/shellcmd.asm:218` |

A host-model run of `COPY STARTUP.CMD B:NOTES.TXT` that changed the first
letter of the destination's name in the FCB just before the close printed
`CLOSE ERROR`. `NOTES.TXT` was then still listed on B, made but not closed.
This is a constructed failure, not a claim that ordinary copies have been
exhaustively tested.

### `NAME?`

The CCP prints the word it stopped at, up to the next space, with a question
mark and a blank line (`src/cpm/ccp.asm:536-570`). For a program, a service,
`COPY` and `UNLOAD` the word is the command's own. Other built-ins normally
print the first argument even when a later argument was wrong. CON updates
that position when it starts parsing a separated width so a width error
names the width (`src/cpm/ccpcmd.asm:105-118`, `src/cpm/ccp.asm:483-491`).
A missing required argument normally gives the question mark alone. TYPE
instead gives `NO FILE` (`src/cpm/ccpfile.asm:354-361`).
[Chapter 4](04-work-with-files.md) has examples. Each row for a program or
service gives a distinct cause.

| Word or command | Cause | Remedy | See |
| --- | --- | --- | --- |
| A program's name | No `NAME.COM` was found on the named/current drive in the current area or area 0. A command with no explicit drive can also fall back to A in those two areas. Any type other than `.SVC` becomes COM so `PICO.DRV` searches for `PICO.COM`. | Check the name, drive and area or use an explicit drive such as `B:NAME`. See the [old-card procedure](#a-card-from-an-older-tec-os) for obsolete display files. | [Chapter 21](21-from-prompt-to-program.md), `src/cpm/ccp.asm:422-440`, `602-627` |
| A program's name | An ambiguous, empty, overlong or invalid name or a drive beyond P. | Correct the name. | [Appendix J](appendix-j-command-reference.md), `src/cpm/ccpcmd.asm:457-592`, `618-636` |
| A program's name | The COM image would extend into the page containing the BDOS entry at `0006h`. | Remove a removable service with `UNLOAD` if that provides enough space or use a smaller program. | `src/cpm/ccp.asm:635-684` |
| `NAME.SVC` | The file is missing or its load returns a failure before installation. A default-mode BDOS disk error instead prints its disk message and aborts through `CHDROP`. | Check the name, drive and card. Services have no area-0 or drive-A lookup fallback. | [Chapter 25](25-loading-and-removing-services.md), `src/loader.asm:901-907`, `src/cpm/ccp.asm:385-409`, `src/cpm/bdoscon.asm:47-64` |
| `NAME.SVC` | The file lacks the service magic or format 4 or fails another loader check before `INIT`, such as size, entry, space, dependency, relocation or stack checks. A format-4 file is not rejected merely for its former `.DRV` type. | Use a matching service file. See the old-card procedure before replacing a whole card. | `src/loader.asm:140-258`, `251-301`, `src/abi.inc:247` |
| `NAME.SVC` | `INIT` returned carry. Failed cleanup can retain reserved pages without published records. | Check the board and `SERVICES` before retrying. | `src/loader.asm:365-370`, `422-466` |
| `GLCD.SVC` | Its controller did not respond, the Matrix switch disabled the keyboard, the UC1 table is occupied or the ROM predates application binary interface (ABI) 5.1. These are INIT failures, not an exhaustive list of load failures. | Check the configuration and `SERVICES`. | `drivers/glcd.asm:60-73`, `src/services.asm:532-564`, `src/video.asm:142-166` |
| `PICO.SVC` | An old driver passed a CRT table to `DRVR`, which accepts only UC1. | Remove its startup line. The ROM supplies the PICO console. | `src/services.asm:532-538` |
| `NAME.SVC` | Record validation failed after successful `INIT`. The status is cleared so startup also prints the name regardless of INIT's returned `A`. | Check `SERVICES`. The cleanup outcome determines whether pages remain reserved. | `src/loader.asm:373-480` |
| `UNLOAD` | The newest service cannot be removed or none exists. Reasons include an active INIT/REMOVE, a mismatched top, a non-removable flag or carry from REMOVE. | Remove services newest first and investigate the retained service. | [Chapter 5](05-drives-and-user-areas.md), `src/cpm/ccpcmd.asm:13-18`, `src/loader.asm:97-114` |
| `COPY` | A missing/ambiguous name, identical source and destination or text after the destination. The shell checks these conditions. Without the shell `COPY` is an unknown program name. | Give one source and a different destination with no further operand. | `drivers/shellcmd.asm:54-92` |
| `ERA` | A missing, extra or invalid name. `DEL`, the shell's other name for ERA, fails on the same conditions with the same output. | `ERA NAME` or `DEL NAME`. | `src/cpm/ccpmut.asm:10-14`, `drivers/shell.asm:543-552` |
| `&WORD` | A typed, script or startup line whose first piece starts with `&`. None of the line runs. | Remove the `&`: a new line runs whatever the last line returned. | `docs/shell.md:75-77` |
| `:WORD` | A piece starting with CP/M 3's `:` prefix, which TEC-OS does not provide. | Join the pieces with ` &` instead. | `docs/shell.md:91-96` |
| `NAME.CMD` | Under the shell: no such script on the named or current drive in the current user, a script named inside another script, or a script name with further pieces after it. With no shell a typed `NAME.CMD` runs `NAME.COM`, and this is the program's missing name. | Check the name and drive, and run a script from its own line. | `docs/shell.md:98-120`, `drivers/shell.asm:609-645` |
| `REN` | Invalid `NEW=OLD` syntax, a missing/ambiguous name or two different explicit drives. | Put a drive on one name or the same drive on both. | `src/cpm/ccpmut.asm:81-116` |
| `SAVE` | An invalid decimal count, a count of 256 or more, a count reaching the BDOS-entry page or a missing/ambiguous filename. | `SAVE n NAME.COM` with a count within the memory bound. | `src/cpm/ccpcmd.asm:266-307` |
| `USER` | The argument is not a single number from 0 to 15. | `USER n`. | `src/cpm/ccpcmd.asm:223-246` |
| `CON` | The device name is not TTY, CRT, BAT, UC1, PICO or GLCD, optionally followed by a colon, or the remaining text is invalid. CRT/PICO may take a separated width. | Use a supported name and width form. | [Chapter 7](07-choose-a-console.md), `src/cpm/ccpcmd.asm:55-211` |
| `CON`, the width | An unsupported width after CRT/PICO or a width joined to the name. `CON CRT80` prints `CRT80?`, not `80?`. | Separate a width of 80, 40 or 32 with a space, as in `CON PICO 40`. | `src/cpm/ccpcmd.asm:105-168`, `src/pico.asm:104-118` |
| `CON`, the width | A width follows another device name. | Put a width only after CRT or PICO. | `src/cpm/ccpcmd.asm:111-115` |
| `CON`, the width | The ROM PICO console did not start or an active claim prevents the width change. | The PICO must respond and the Matrix switch must enable the keyboard at cold boot. Release a program's claim before changing width. | `src/console.asm:42-45`, `src/pico.asm:53-68`, `src/pico.asm:81-94` |
| `DIR` or `TYPE` | Invalid or extra operands. TYPE also rejects a wildcard or an empty name part. With no operand TYPE gives `NO FILE`. | Use one filename for TYPE or one pattern for DIR. | [Chapter 4](04-work-with-files.md), `src/cpm/ccpfile.asm:17-20`, `518-525` |

The bad characters in a name are `<>,;:[]%|()/\`, from `BADCHARS`
(`src/text.asm:58-59`).

Startup suppresses an installation failure only when INIT returned `TNENODV`
and cleanup left nothing resident: `SVCRC` is 1 and `SVCRA` is 2. A missing
graphics controller can take that path. Startup registration while CRT is
active returns the same absent-device status so that line installs nothing
and prints nothing. With both displays and the matrix keyboard enabled, a
successful typed GLCD load keeps the active PICO console selected. It does
not select that console again (`src/cpm/ccp.asm:403-412`,
`src/services.asm:540-556`, `src/loader.asm:901-922`).

A startup width line is also quiet when FIND returns no PICO console.
The typed equivalent prints the width with `?`
(`src/cpm/ccpcmd.asm:134-150`).
[Chapter 26](26-startup-inside-the-ccp.md#startup-origin-and-quiet-results)
derives both conditions. The browser's missing-driver notice is a separate
host check, described in [Appendix I](appendix-i-web-page.md).

### A card from an older TEC-OS

Older cards hold their services in files of type `.DRV` and this ROM doesn't
load them. The CCP takes `GLCD.DRV` as the name of a program and prints it
with a question mark so a board with the graphics LCD keeps its console on
the serial terminal until a usable driver is installed and selected. A
responding PICO9918 with the Matrix switch enabled has its console from cold
boot without a card driver. The web page reports an old GLCD driver for a
GLCD display choice, as Appendix I describes (`host/card.mjs:26-48`).

New starter card on the web page or a new image from `npm run media`
replaces the card's contents. The other way keeps the card: rename
`GLCD.DRV` to `GLCD.SVC` and change `STARTUP.CMD` to match. That works when
the file's format, its second byte, is 4, the format this ROM loads. An older
card's `PICO.SVC` doesn't install under any name because the ROM's table no
longer takes a driver for the PICO9918. The recipe below copies the starter
card and adds two display drivers under the old type: the `PICO.SVC` kept in
the repository's tests and the card's own `GLCD.SVC`. Its startup file, like
an older card's, has no `SHELL.SVC` line:

```sh
cp dist/starter.img old.img
node tools/tecvol.mjs put old.img A test/fixtures/8f50c61/PICO.SVC PICO.DRV
node tools/tecvol.mjs put old.img A dist/files/GLCD.SVC GLCD.DRV
node tools/tecvol.mjs era old.img A GLCD.SVC
printf 'PICO.DRV\nGLCD.DRV\n' > startup.cmd
node tools/tecvol.mjs put old.img A startup.cmd --text
```

In the graphics-LCD host-model capture the ROM runs only the startup file's
first line, which fails, and no shell is installed. After renaming, PICO
still fails and leaves no installed service. GLCD installs and takes the
console. `SERVICES` is the shell's command, so without the shell it fails
too:

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card old.img --board glcd 'REN PICO.SVC=PICO.DRV' 'REN GLCD.SVC=GLCD.DRV' PICO.SVC GLCD.SVC CON SERVICES. Complete captured console transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>PICO.DRV
PICO.DRV?

A>REN PICO.SVC=PICO.DRV
A>REN GLCD.SVC=GLCD.DRV
A>PICO.SVC
PICO.SVC?

A>GLCD.SVC

A>CON
CON: UC1:
A>SERVICES
SERVICES?

A>
```

`STARTUP.CMD` still names the old files so the next board reset prints the
same failure until it is updated. A new first line of `SHELL.SVC`, copied
from a new starter card, puts the shell back. `ERA PICO.SVC` removes the old
driver. The new file comes from `tecvol put` on a PC or "Copy file to drive"
on the web page. A successful Power cycle preparation also removes display
lines of either type. The page checks the chosen driver and stages the
rewrite so missing/old drivers or protected/full storage can leave the
startup file unchanged (`host/card.mjs:30-53`, `host/card.mjs:109-146`, `host/card.mjs:205-220`).
A `GLCD.SVC` of an older format fails under the new name too, as
`GLCD.SVC?`. A matching copy from a new starter card or one put on the card
with `tecvol` replaces it.

## The BDOS's errors

The BDOS prints these messages when a disk operation can't be done at all.
Each starts a new line. By default the BDOS then waits for a key and ends the
program or command by warm boot with the rest of a chained line dropped,
whatever the key returned by input (`src/cpm/bdos.asm:103-105`,
`src/cpm/bdoscon.asm:47-64`, `99-127`). An ordinary key retained during
message output can satisfy that wait. Output-time `^S` and `^P` still have
their separate console effects (`src/cpm/bdoscon.asm:299-330`).
A program can take the errors itself with BDOS function 45. With `E` = `FFh`
the error returns with `A` = `FFh`, `H` the code in the table and no message.
With `FEh` the message is printed first and the error returns the same way.
Returning an error preserves the remaining chain. A sequential read or write
that returns an error leaves
the FCB on the record it didn't read or write. Every warm boot puts the default
back (`src/cpm/bdos.asm:223-235`, `src/ram.asm:222-223`).
[Chapter 20](20-a-file-through-the-bdos.md#errors-returned-or-reported) explains them and
[Appendix A](appendix-a-bdos-functions.md#the-errors) lists them by function.

| Message | Code | Cause | Remedy | See |
| --- | ---: | --- | --- | --- |
| `Bdos Err On d: Select` | 4 | No volume on the drive, a drive past D or `?` in an FCB drive byte outside function 17. On warm entry the CCP falls back to A if the saved drive has no volume. | Mount a volume on a usable drive or select another. | [Chapter 5](05-drives-and-user-areas.md), `src/bios.asm:61-92`, `src/cpm/bdosfile.asm:176-195`, `src/cpm/ccp.asm:48-62`, `src/text.asm:73` |
| `Bdos Err On d: R/O` | 2 | A write, make, delete, rename or attribute change on a drive protected by function 28. Close instead succeeds without writing. | Warm boot clears temporary protection. Correct a program that protects a drive before changing it. | `src/cpm/bdosfn.asm:122-135`, `src/cpm/bdosfile.asm:30-35`, `247-253`, `src/cpm/bdoslog.asm:740-749` |
| `Bdos Err On d: R/O` | 2 | A change to a volume marked read-only, including SAVE, ERA, REN or COPY's destination. That volume is not written. | Use a writable volume. Its protection is an on-card property, reapplied at login. | `src/cpm/bdoslog.asm:210-215`, `758-767`, `src/text.asm:75` |
| `Bdos Err On d: File R/O` | 3 | Delete, rename or sequential/random write reached a read-only file. ERA, REN, SAVE and COPY can reach this check. Earlier matching entries in a wildcard ERA remain erased. | Set attributes with BDOS 30 or extract the file with tecvol and put it back with --force and without --ro. The CCP has no attribute-setting command. | `src/cpm/bdosfile.asm:355-366`, `393-413`, `539-545`, `556-560`, `610-617`, `src/cpm/bdosrec.asm:274-283`, `tools/lib/cpmfs.mjs:157-191`, `src/text.asm:76-77` |
| `Bdos Err On d: Bad Sector` | 1 | A data or directory transfer failed. ERA's earlier successful directory writes remain applied, including entries of the same file or earlier wildcard matches. The failing entry and later entries are not confirmed erased. A physical partial write can damage the failing card block. | Copy first and run tecvol verify on the copy. Inspect recoverable files and replace a persistently failing card. | [Chapter 6](06-cards-on-the-pc.md#recovery-after-a-power-cut), `src/cpm/bdosfile.asm:387-407`, `src/cpm/bdoslog.asm:82-107`, `src/cpm/bdosrec.asm:69-82`, `222-225` |
| `Bdos Err On d: Bad Sector` | 1 | A volume extends beyond the card and the card rejects the command. The ROM reports that rejection before transferring block data. The source of a host-model test checks that no image byte changes in this case. | Use a card large enough for the container or build a smaller container with create. | [Chapter 18](18-card-blocks-and-volumes.md), `src/sd.asm:397-405`, `437-454`, `664-672`, `test/sd-range.test.mjs:86-107` |
| `Bdos Err On d: Bad Sector` | 1 | A file's allocation map names a block beyond the volume. Login and delete skip that invalid reference rather than indexing outside the vector. Access to the block fails. | ERA can remove the damaged entry if the required directory writes succeed. Verify a copy before further changes. | [Chapter 20](20-a-file-through-the-bdos.md), `src/cpm/bdosrec.asm:699-700`, `src/cpm/bdoslog.asm:576-604`, `src/cpm/bdoscon.asm:76-92` |

## `Write lost`

`Write lost` applies to the drive you are on, the logged drive, whose writes
wait in the block cache, and also to the pending block, the one block a
volume on another drive holds until its next flush point. Every console read
writes every changed line, so the lines a warm boot can find are those a
program left between its last key wait and its end, or those the card
refused (`docs/recovery.md:1-82`, `docs/recovery.md:120-174`). At each warm boot TEC-OS writes every
changed block in the cache to the card. A line whose write fails is dropped from the cache. This does not undo
an earlier successful or partial physical write. If any write failed, the
message is printed once on a line of its own and the rest of a chained
line is dropped (`src/cache.asm:258-296`,
`634-640`, `src/text.asm:94`).

The cached changes in dropped lines are lost and the next warm boot has
no such lines left to retry. A directory line is dropped when its write
or preceding data flush fails. The BDOS reports `Bad Sector` at once. If
only the directory write failed, its dropped block leaves nothing for the next
warm boot to retry so that failure alone gives no `Write lost`. The data blocks
that failed stay dirty in the cache. Another close or flush can retry them.
The warm boot after the recovery key writes them again and gives `Write lost`
if writes still fail (`src/cache.asm:258-296`, `546-555`). The file
that was being written needs writing again, once the card is put right and the
board reset.

Putting the card back does not itself run `SDINIT`. The card is started at cold
boot or a diagnostic retry, not at warm boot (`src/boot.asm:92-101`,
`src/boot.asm:656-667`). If writes still fail at the next warm boot, the changed
lines are dropped and `Write lost` is printed (`src/cache.asm:266-296`,
`src/cache.asm:624-640`). `MOUNT`, unmount and function 48 instead keep a
failed line for the next flush, so only a warm boot drops a flushed line that
still fails (`docs/recovery.md:97-118`). BDOS function 48 reports a failure to a program at
once: it writes every changed block and returns `A` = `FFh` if any write failed
(`src/cpm/bdos.asm:237-257`). [Chapter 19](19-cache-and-persistence.md)
explains the mechanism, and which drive is written behind.

## `CD`

The shell's `CD` prints these messages. Each refusal sets the return code to
`FF00h`, so a following `&` piece is skipped, and the drive keeps the volume
it had (`drivers/shellcd.asm:17-165`, `docs/shell.md:142-198`).
[Chapter 5](05-drives-and-user-areas.md#changing-a-drive-s-volume) gives the
operator commands and [Chapter 18](18-card-blocks-and-volumes.md) explains
the volume services.

| Message | Cause | Remedy | See |
| --- | --- | --- | --- |
| `CD?` | A name of more than 11 characters, a drive past D, text after the name or after `?`, or CD of the drive the running script is read from. A script goes on to its next line. | `CD ?` lists the card's volumes. In a script, put the volume on another drive. | `drivers/shellcd.asm:17-82`, `docs/shell.md:194-198` |
| `NAME?` | No volume on the card has that label. | List the labels with `CD ?`. | `drivers/shellcd.asm:99-103`, `143-152` |
| `NAME is on B:` | The volume is already on another drive. A volume is never on two drives. | Use that drive, or put another volume there first. | `drivers/shellcd.asm:104-109`, `154-163` |
| `CD FAILED` | The ROM's `MOUNT` service refused: the volume is too large for the drive's slot, or the flush before the change failed. The flush keeps a failed line for the next flush and prints no `Write lost` on this path. | Choose a drive whose slot fits, or recover the card if a write failed. | `drivers/shellcd.asm:110-117`, `drivers/shellcd.asm:164`, `src/volsvc.asm:211-265`, `src/volsvc.asm:360-389` |

## TED's load error

The starter card's TED (Thorium `a2fe556`) prints this
line and returns to the prompt when the file it is opening holds a byte it
rejects
(`Thorium a2fe556:README.md:25-30`, `docs/compatibility.md:223`,
`test/ted.test.mjs:94-122`). An older TED, Thorium `967678c`, also rejects `00h` padding at the end of a file and gives
error 03 without a line or column
(`Thorium 967678c:ted/src/load.asm:48-53`, `121-125`).

| Message | Cause | Action |
| --- | --- | --- |
| `EDIT error 03 Ln Cn` | The byte at that line and column is one TED rejects: a control other than tab, LF and a CR before LF, a byte from `7Fh` up, or a `00h` that is not part of a run filling the rest of the last record. Each byte counts as one column, a tab included. | Correct that byte on the PC and put the file again. A file that ends at its first `^Z`, or in `00h` filling the rest of its last record, opens without this error. |

## The MON-3 session

`MON3.SVC` prints these when typing `MON3.SVC` enters it or in a session at
`MON3>`. [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session) describes
the session. A refused entry prints `MON3.SVC?` and sets FF00h, for the
causes that [Appendix J](appendix-j-command-reference.md#resident-services)
gives for entering a service.

| Message | Cause | Action | See |
| --- | --- | --- | --- |
| `?` | The `MON3>` line is not `LOAD`, `GO` or `EXIT` in a form they take. For `LOAD`: a drive beyond P, a name or type too long or holding `?` or `*`, a file not found or empty, bytes outside `0100h` to the BDOS entry's page or inside `0800h–08FFh`, or a fault anywhere in a HEX file. `GO` with no address prints it when no load has ended well. A refused load writes nothing and leaves nothing runnable. | Correct the line, the file or the address. | [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session), `docs/mon3.md:61-98` |
| `RST nn held: UNLOAD or reset` | At entry a restart slot from `08h` to `30h` holds a `JP`: a service's claim, or a jump into ROM that a program left. The entry is refused with return code FF00h and nothing changed. | `UNLOAD` the service that holds the slot, or reset. | `docs/mon3.md:198-201` |
| `RST 38 held: no interrupts` | `0038h` held a `JP` at entry, which the session leaves alone. A program's interrupts through MON-3's `USER_INT` are not delivered. | The session runs without them. | `docs/mon3.md:185`, `232` |
| `MON3 active` | A program in a session called the service's entry. The call returns to the program with FF00h. | None. | `docs/mon3.md:202-203` |
| `BRK nnnn` | The program ran `RST 30h`, MON-3's breakpoint. The session prints `BRK` with the address and returns to `MON3>`. There is no resume. | None: the session is at `MON3>`. | `docs/mon3.md:138-140`, `231` |
| `Tables damaged: EXIT and reset` | After the program returned, the checksum over the service and TEC-OS's RAM BIOS table differed from the one `GO` took. Every later `LOAD` prints it again and is refused without opening the file, and each re-entry prints it. `GO` and `EXIT` still run. | `EXIT`, then press reset, which also removes the service. | `docs/mon3.md:146-160`, `drivers/mon3.asm:1191-1192` |
| MON-3's error display on the digits | The program called an `RST 10h` or `RST 18h` function that the session does not build, or a number beyond MON-3's calls. The call's outputs are not written. | Press a key. The call returns to the program as a key press would. | [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session), `docs/mon3.md:227-228`, `264-274`, `320-329` |

## Lines that report no fault

These lines appear in ordinary runs and need no remedy.

| Line | Meaning | See |
| --- | --- | --- |
| `TEC-OS 0.1 for TEC-1G` | The cold-boot console banner. The LCD banner is `TEC-OS 0.1  TEC-1G`. | [Chapter 1](01-first-session.md), `src/text.asm:12`, `79`, `tools/build.mjs:28` |
| `d: LABEL` | A mounted drive and volume at cold boot, with ` (read-only)` for a protected volume. LCD rows 1 and 2 show A and B without that suffix. | `src/boot.asm:496-523`, `src/lcd.asm:104-168`, `src/text.asm:13` |
| `n files, nK free` | The ROM's DIR, `DIR /W` under the shell: its listed-file count and free space. The singular is `1 file, nK free`. | [Chapter 4](04-work-with-files.md), `src/cpm/ccpfile.asm:198-254`, `src/text.asm:27-32` |
| `n files, n bytes` and `n free on d:LABEL` | The shell's DIR: the count and bytes of the files listed, and the drive's free bytes with its volume. | [Appendix J](appendix-j-command-reference.md#dir-and-type), `drivers/shelldir.asm:240-280` |
| `[more]` | DIR or TYPE paused at a screenful. An ordinary key continues. Esc, Q, q and `;` stop the listing. `^C` and `#` also drop the remaining line because the comparison clears bit 5. The pause is the shell's, and without the shell DIR and TYPE do not pause. | `drivers/shellio.asm:450-502` |
| `ALL (Y/N)?` | ERA's or DEL's pattern is all wildcards. A line starting with Y or y confirms the erase in the current user area. Other lines and Return alone cancel without failure. Confirming does not override file/volume protection or disk errors. | `src/cpm/ccpmut.asm:18-67`, `src/text.asm:56-57` |
| `COPIED nnnn` | COPY completed and closed its destination. The four hexadecimal digits count records. | `drivers/shellcmd.asm:130-143`, `drivers/shellcmd.asm:219` |
| `CON: TTY:`, `CON: CRT:`, `CON: UC1:` | The effective console after CON. An unavailable CRT falls back to TTY. A returned UC1 load failure leaves the previous mode. `CON: BAT:` is generated but discarded. | [Chapter 7](07-choose-a-console.md), `src/cpm/ccpcmd.asm:187-211`, `src/loader.asm:873-887`, `src/console.asm:75-133`, `345-353` |
| `NAME n` | SERVICES lists names and resident pages, newest first. SERVICES is the shell's command. | [Chapter 5](05-drives-and-user-areas.md), `drivers/shellcmd.asm:15-50` |
| `d:LABEL` from CD | The drive and the volume now on it, also when it was already there. | `drivers/shellcd.asm:118-133` |
| `LABEL d:` from `CD ?` | One of the card's volumes and its drive, in the card's order. | `drivers/shellcd.asm:135-141`, `drivers/shellcd.asm:166-258` |
