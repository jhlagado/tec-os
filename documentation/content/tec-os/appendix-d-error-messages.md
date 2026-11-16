---
title: D. Error messages
parent: TEC-OS
nav_order: 104
nav_group: "Reference"
---

# Appendix D. Error messages

<!-- Checked against TEC-OS 46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee (retained recovery baseline),
     ROM SHA-256 ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-recovery-core/ and
     studies/p3-tec-os/evidence/book-recovery-host/.
     The tool inputs are the pinned TAS host 3d16b30 and TED 20339b8;
     Baza is the qualified 45f2598 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A failed command may have changed nothing or left part of a file written.
Recovery depends on where it stopped. The tables pair each printed message
with its cause and the action still available. They follow cold boot, the
diagnostic prompt, the LCD, the command processor and the BDOS, then block
cache and `CD` failures. Ordinary status lines have a separate table at the end.

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
| `TEC-OS needs 64K RAM` | The bank window at `8000h–BFFFh` failed the RAM patterns or the bank probe did not find EXPAND 1 behind it. | Fit the required 32 KiB RAM chip in U9 and check the configuration, then reset. | [Appendix G](appendix-g-tec-1g.md), `241b438:src/boot.asm:435-488`, `241b438:src/text.asm:11` |

## The diagnostic prompt

A card that can't be started or mounted stops cold boot after the banner:

```text
No volume mounted, error nn
R retry>
```

The prompt uses the ROM PICO9918 console when the PICO9918 responded at cold
boot and the Matrix switch enabled the matrix keyboard. Otherwise it uses
serial. This is a switch-enable test, not a keyboard-presence probe
(`241b438:src/console.asm:42-45`, `241b438:src/video.asm:18-24`, `241b438:src/pico.asm:53-68`).
The LCD's last row shows `CARD?` (`241b438:src/boot.asm:650-658`, `241b438:src/text.asm:14-16`).
`R` starts the LCD, card and mount again. A corrected or newly inserted card
can therefore mount without reset. The key is echoed as typed and `r`
retries too. Any other key gives the prompt again
(`241b438:src/boot.asm:92-101`, `241b438:src/boot.asm:646-657`).
[Chapter 28](28-diagnose-the-machine.md) explains the prompt.

Codes `01h` to `04h` and `0Bh` come from `SDINIT`, the start of the card
(`241b438:src/boot.asm:97-101`):

| Code | Cause | Remedy | See |
| --- | --- | --- | --- |
| `01` | `CMD0` did not return idle reply `01h` in 10 tries. An empty socket gives this code. | Insert a card and press `R`. | [Chapter 18](18-card-blocks-and-volumes.md), `241b438:src/sd.asm:190-217` |
| `02` | `ACMD41` did not return ready in 256 tries or `CMD55` returned an error bit. | Retry with `R`. If the fault persists, use another card. | [Chapter 18](18-card-blocks-and-volumes.md), `241b438:src/sd.asm:250-286` |
| `03` | `CMD58`, which reads the addressing type from the OCR, failed. | Retry, then use another card if it still fails. | `241b438:src/sd.asm:296-325` |
| `04` | `CMD16` failed to set a standard-capacity card's block length to 512 bytes. | Retry, then use another card if it still fails. | `241b438:src/sd.asm:311-322` |
| `0B` | The `CMD8` reply echoed a voltage range other than 2.7 to 3.6 V or a check pattern other than `AAh`. | Use another card. | `241b438:src/sd.asm:228-247` |

Codes `05h` to `0Ah` are the SD card driver's codes for a block read or write
(`241b438:src/sd.asm:18-26`, `241b438:src/sd.asm:336-347`). They do not reach this prompt directly.
The driver stores them in `SDERR`, with no later reader in the ROM. A failed
table read during mounting becomes code `20h`. A failed BDOS transfer gives
a disk error; failed acknowledged warm-flush data remains queued with separate
pending/clear/error notices (`a40d482:src/cache.asm:638-649`). The
`CD` command's refusals are in their own table below.

| Code | Meaning |
| --- | --- |
| `05` | The card rejected the command |
| `06` | No read data token arrived within 65,536 polls |
| `07` | The write response was not accepted, including no response within 16 polls |
| `08` | The card stayed busy for 65,536 polls |
| `09` | The block is 4 GiB or more into a standard-capacity card, rejected before any command |
| `0A` | A non-`FFh` byte other than the `FEh` start token arrived while waiting for read data |

These are polling bounds, not measured deadlines (`241b438:src/sd.asm:397-431`,
`241b438:src/sd.asm:664-736`). Code 05 precedes block-data transfer. Codes 07 and 08 can follow
transmission of all 512 bytes so neither establishes rollback of a write.

Codes `20h` to `2Ah` come from the ROM's `MOUNT` routine, its check of the
container. The first check to fail stops the mount and no drive stays mounted
(`241b438:src/vol.asm:360-365`, `241b438:src/volutil.asm:10-20`).
[Appendix E](appendix-e-container-format.md#the-checks-and-their-codes) gives
every check in order and
[Chapter 18](18-card-blocks-and-volumes.md) explains them.

| Code | Cause | Constant |
| --- | --- | --- |
| `20` | Block 0 or an extension block of the volume table could not be read. | `241b438:src/vol.asm:46-48`, `241b438:src/vol.asm:165-171`, `241b438:src/vol.asm:200-204` |
| `21` | Block 0 does not begin with `TECOSVOL`. | `241b438:src/vol.asm:51-62` |
| `22` | The container's major version is unsupported. | `241b438:src/vol.asm:64-71` |
| `23` | The header or descriptor size is wrong or the applicable drives field exceeds 4. | `241b438:src/vol.asm:74-87`, `241b438:src/vol.asm:143-147` |
| `24` | The volume count is zero, above 8 for format 1.0 or above 127. | `241b438:src/vol.asm:89-106` |
| `25` | The header checksum or applicable extension-table sum differs. | `241b438:src/vol.asm:112-115`, `241b438:src/vol.asm:152-182` |
| `26` | Bad descriptor fields: zero id, invalid flags or geometry, length differing from its geometry or a zero/misaligned start. | `241b438:src/vol.asm:204-244`, `241b438:src/vol.asm:357-360` |
| `27` | A volume's exclusive end overflows 32 bits, exceeds the declared container or exceeds `800000h` on a standard-capacity card. That card's last addressable block is `7FFFFFh`, within its first 4 GiB. | `241b438:src/vol.asm:254-296` |
| `28` | A volume starts before the preceding volume's end. | `241b438:src/vol.asm:245-252` |
| `29` | A drive is invalid, exceeds the header's requested drive count or is assigned twice. | `241b438:src/vol.asm:307-329` |
| `2A` | No volume is assigned to drive A. | `241b438:src/vol.asm:343-353` |

`R` retries a read that failed with `20h`. A repeated read failure or a
structural fault requires inspection of the card. Preserve a copy before
changing it, following the procedure in
[Chapter 6](06-cards-on-the-pc.md#recovery-after-a-power-cut).

`tecvol verify` checks both container and directory faults. `get` validates
the container before extracting anything, so a failed container check
prevents a file read. It does not perform `verify`'s complete directory
check. `create` and `put`, or a starter recipe, can construct a fresh image
(`241b438:tools/tecvol.mjs:71-81`, `241b438:tools/tecvol.mjs:113-137`, `241b438:tools/tecvol.mjs:157-164`).

The browser uses a high-capacity card model and rejects truncated images
before opening them. It therefore does not reproduce the standard-capacity
limit or Chapter 6's short-image failure through Open image. Other code
27 causes remain ROM checks, including end overflow and the declared
container bound (`241b438:host/machine.mjs:49`, `241b438:web/src/main.mjs:604-630`,
`241b438:tools/lib/container.mjs:146-149`, `241b438:tools/lib/container.mjs:171`, `241b438:src/vol.asm:254-296`).

## The LCD's words

A board without a terminal can still report a boot or display problem on
the 20 × 4 LCD. TEC-OS uses its last row for the two words below.
[Chapter 26](26-startup-inside-the-ccp.md#recovery-words-and-row-ownership)
explains when they are written and cleared.

| Word | Cause | Remedy | See |
| --- | --- | --- | --- |
| `CARD?` | Cold boot stopped at the diagnostic prompt. | `R` clears the LCD before retrying. A successful retry leaves the word cleared. | [Chapter 28](28-diagnose-the-machine.md), `241b438:src/boot.asm:92-101`, `241b438:src/boot.asm:636-656`, `241b438:src/text.asm:16` |
| `GLCD?` | `CON UC1` received a failure from loading or installing `A:GLCD.SVC`. Examples include a missing or invalid file, insufficient service space, a failed controller probe or a disabled Matrix switch. The old console mode is restored. A fatal BDOS disk error instead aborts the command before this path. | Check the file on A, board configuration and installed services. A successful GLCD load, a later console take or reset clears the ROM's word. Program text on that row has separate ownership. | [Chapter 26](26-startup-inside-the-ccp.md#recovery-words-and-row-ownership), `241b438:src/loader.asm:873-943`, `241b438:drivers/glcd.asm:60-73`, `241b438:src/video.asm:142-166` |

## The CCP's failures

Each failure in this section sets the return code to `FF00h`. Under the
shell an `&` piece after it is then skipped, and a `!` piece still runs
(`241b438:src/cpm/ccp.asm:609-616`, `241b438:src/cpm/ccp.asm:256-273`, `241b438:docs/shell.md:53-89`).
[Chapter 13](13-results-and-command-chains.md)
explains the code. COPY, DEL and SERVICES are the
shell's commands, and the shell prints its own refusals in the same form,
the word and a question mark (`241b438:drivers/shell.asm:554-602`).

| Message | Cause | Remedy | See |
| --- | --- | --- | --- |
| `NO FILE` | `DIR` matched no visible file, including a match consisting only of system files. `TYPE` found no file or had no name. `ERA` matched nothing. `REN` found no old name. | Check the name, drive and user area. | [Chapter 4](04-work-with-files.md), `241b438:src/cpm/ccpfile.asm:98-104`, `241b438:src/cpm/ccpfile.asm:203-207`, `241b438:src/cpm/ccpfile.asm:347-361`, `241b438:src/cpm/ccpfile.asm:412-420`, `241b438:src/cpm/ccpmut.asm:57-61`, `241b438:src/cpm/ccpmut.asm:134-137`, `241b438:src/text.asm:25-26` |
| `FILE EXISTS` | `REN` found the new name already in the current user area on that drive. | Choose another name or erase the unwanted file first. | [Chapter 4](04-work-with-files.md), `241b438:src/cpm/ccpmut.asm:126-149`, `241b438:src/text.asm:52-53` |
| `NO SOURCE` | `COPY` did not find its source in the current user area on the specified drive. No destination has changed. | Check the name, drive and user area. | [Chapter 4](04-work-with-files.md), `241b438:drivers/shellcmd.asm:93-99`, `241b438:drivers/shellcmd.asm:215` |
| `CANNOT MAKE DEST` | `COPY` could not allocate the destination's directory entry. An old destination has already been erased. | Free directory space or copy to another drive. | `241b438:drivers/shellcmd.asm:100-106`, `241b438:drivers/shellcmd.asm:216` |
| `WRITE ERROR` | `COPY` received a nonzero sequential-write result, such as no free block or no entry for the next extent. It attempts to close the destination before printing this message. That close can also fail. A successful close preserves the records already copied. | Inspect or erase the partial destination, free space and copy again. | `241b438:drivers/shellcmd.asm:113-121`, `241b438:drivers/shellcmd.asm:148-154`, `241b438:src/cpm/bdosrec.asm:94-135`, `241b438:drivers/shellcmd.asm:217` |
| `CLOSE ERROR` | After reading the source, `COPY` received `FFh` from close because no directory entry matched the destination file control block (FCB). A fatal disk error aborts through the BDOS instead. | Inspect the destination and repeat the copy after correcting the cause. | `241b438:drivers/shellcmd.asm:130-135`, `241b438:src/cpm/bdosfile.asm:252-287`, `241b438:drivers/shellcmd.asm:218` |

A host-model run of `COPY STARTUP.CMD B:NOTES.TXT` that changed the first
letter of the destination's name in the FCB just before the close printed
`CLOSE ERROR`. `NOTES.TXT` was then still listed on B, made but not closed.
This is a constructed failure, not a claim that ordinary copies have been
exhaustively tested.

### `NAME?`

The CCP prints the word it stopped at, up to the next space, with a question
mark and a blank line (`241b438:src/cpm/ccp.asm:582-616`). For a program, a service,
`COPY` and `UNLOAD` the word is the command's own. Other built-ins normally
print the first argument even when a later argument was wrong. CON updates
that position when it starts parsing a separated width so a width error
names the width (`241b438:src/cpm/ccpcmd.asm:105-118`, `241b438:src/cpm/ccp.asm:529-537`).
A missing required argument normally gives the question mark alone. TYPE
instead gives `NO FILE` (`241b438:src/cpm/ccpfile.asm:354-361`).
[Chapter 4](04-work-with-files.md) has examples. Each row for a program or
service gives a distinct cause.

| Word or command | Cause | Remedy | See |
| --- | --- | --- | --- |
| A program's name | No `NAME.COM` was found on the named/current drive in the current area or area 0. A command with no explicit drive can also fall back to A in those two areas. Any type other than `.SVC` becomes COM so `PICO.DRV` searches for `PICO.COM`. | Check the name, drive and area or use an explicit drive such as `B:NAME`. See the [old-card procedure](#a-card-from-an-older-tec-os) for obsolete display files. | [Chapter 21](21-from-prompt-to-program.md), `241b438:src/cpm/ccp.asm:468-486`, `241b438:src/cpm/ccp.asm:648-673` |
| A program's name | An ambiguous, empty, overlong or invalid name or a drive beyond P. | Correct the name. | [Appendix J](appendix-j-command-reference.md), `241b438:src/cpm/ccpcmd.asm:457-592`, `241b438:src/cpm/ccpcmd.asm:618-636` |
| A program's name | The COM image would extend into the page containing the BDOS entry at `0006h`. | Remove a removable service with `UNLOAD` if that provides enough space or use a smaller program. | `241b438:src/cpm/ccp.asm:681-730` |
| `NAME.SVC` | The file is missing or its load returns a failure before installation. A default-mode BDOS disk error instead prints its disk message and aborts through `CHDROP`. | Check the name, drive and card. Services have no area-0 or drive-A lookup fallback. | [Chapter 25](25-loading-and-removing-services.md), `241b438:src/loader.asm:901-907`, `241b438:src/cpm/ccp.asm:431-455`, `241b438:src/cpm/bdoscon.asm:47-64` |
| `NAME.SVC` | The file lacks the service magic or format 4 or fails another loader check before `INIT`, such as size, entry, space, dependency, relocation or stack checks. A format-4 file is not rejected merely for its former `.DRV` type. | Use a matching service file. See the old-card procedure before replacing a whole card. | `241b438:src/loader.asm:140-258`, `241b438:src/loader.asm:251-301`, `241b438:src/abi.inc:247` |
| `NAME.SVC` | `INIT` returned carry. Failed cleanup can retain reserved pages without published records. | Check the board and `SERVICES` before retrying. | `241b438:src/loader.asm:365-370`, `241b438:src/loader.asm:422-466` |
| `GLCD.SVC` | Its controller did not respond, the Matrix switch disabled the keyboard, the UC1 table is occupied or the ROM predates application binary interface (ABI) 5.1. These are INIT failures, not an exhaustive list of load failures. | Check the configuration and `SERVICES`. | `241b438:drivers/glcd.asm:60-73`, `241b438:src/services.asm:543-575`, `241b438:src/video.asm:142-166` |
| `PICO.SVC` | An old driver passed a CRT table to `DRVR`, which accepts only UC1. | Remove its startup line. The ROM supplies the PICO console. | `241b438:src/services.asm:543-549` |
| `NAME.SVC` | Record validation failed after successful `INIT`. The status is cleared so startup also prints the name regardless of INIT's returned `A`. | Check `SERVICES`. The cleanup outcome determines whether pages remain reserved. | `241b438:src/loader.asm:373-480` |
| `UNLOAD` | The newest service cannot be removed or none exists. Reasons include an active INIT/REMOVE, a mismatched top, a non-removable flag or carry from REMOVE. | Remove services newest first and investigate the retained service. | [Chapter 5](05-drives-and-user-areas.md), `241b438:src/cpm/ccpcmd.asm:13-18`, `241b438:src/loader.asm:97-114` |
| `COPY` | A missing/ambiguous name, identical source and destination or text after the destination. The shell checks these conditions. Without the shell `COPY` is an unknown program name. | Give one source and a different destination with no further operand. | `241b438:drivers/shellcmd.asm:54-92` |
| `ERA` | A missing, extra or invalid name. `DEL`, the shell's other name for ERA, fails on the same conditions with the same output. | `ERA NAME` or `DEL NAME`. | `241b438:src/cpm/ccpmut.asm:10-14`, `241b438:drivers/shell.asm:543-552` |
| `&WORD` | A typed, script or startup line whose first piece starts with `&`. None of the line runs. | Remove the `&`: a new line runs whatever the last line returned. | `241b438:docs/shell.md:75-77` |
| `:WORD` | A piece starting with CP/M 3's `:` prefix, which TEC-OS does not provide. | Join the pieces with ` &` instead. | `241b438:docs/shell.md:91-96` |
| `NAME.CMD` | Under the shell: no such script on the named or current drive in the current user, a script named inside another script, or a script name with further pieces after it. With no shell a typed `NAME.CMD` runs `NAME.COM`, and this is the program's missing name. | Check the name and drive, and run a script from its own line. | `241b438:docs/shell.md:98-120`, `241b438:drivers/shell.asm:609-645` |
| `REN` | Invalid `NEW=OLD` syntax, a missing/ambiguous name or two different explicit drives. | Put a drive on one name or the same drive on both. | `241b438:src/cpm/ccpmut.asm:81-116` |
| `USER` | The argument is not a single number from 0 to 15. | `USER n`. | `241b438:src/cpm/ccpcmd.asm:223-246` |
| `CON` | The device name is not TTY, CRT, BAT, UC1, PICO or GLCD, optionally followed by a colon, or the remaining text is invalid. CRT/PICO may take a separated width. | Use a supported name and width form. | [Chapter 7](07-choose-a-console.md), `241b438:src/cpm/ccpcmd.asm:55-211` |
| `CON`, the width | An unsupported width after CRT/PICO or a width joined to the name. `CON CRT80` prints `CRT80?`, not `80?`. | Separate a width of 80, 40 or 32 with a space, as in `CON PICO 40`. | `241b438:src/cpm/ccpcmd.asm:105-168`, `241b438:src/pico.asm:104-118` |
| `CON`, the width | A width follows another device name. | Put a width only after CRT or PICO. | `241b438:src/cpm/ccpcmd.asm:111-115` |
| `CON`, the width | The ROM PICO console did not start or an active claim prevents the width change. | The PICO must respond and the Matrix switch must enable the keyboard at cold boot. Release a program's claim before changing width. | `241b438:src/console.asm:42-45`, `241b438:src/pico.asm:53-68`, `241b438:src/pico.asm:81-94` |
| `DIR` or `TYPE` | Invalid or extra operands. TYPE also rejects a wildcard or an empty name part. With no operand TYPE gives `NO FILE`. | Use one filename for TYPE or one pattern for DIR. | [Chapter 4](04-work-with-files.md), `241b438:src/cpm/ccpfile.asm:17-20`, `241b438:src/cpm/ccpfile.asm:347-361` |

The bad characters in a name are `<>,;:[]%|()/\`, from `BADCHARS`
(`241b438:src/text.asm:58-59`).

Startup suppresses an installation failure only when INIT returned `TNENODV`
and cleanup left nothing resident: `SVCRC` is 1 and `SVCRA` is 2. A missing
graphics controller can take that path. Startup registration while CRT is
active returns the same absent-device status so that line installs nothing
and prints nothing. With both displays and the matrix keyboard enabled, a
successful typed GLCD load keeps the active PICO console selected. It does
not select that console again (`241b438:src/cpm/ccp.asm:449-458`,
`241b438:src/services.asm:551-567`, `241b438:src/loader.asm:901-922`).

A startup width line is also quiet when FIND returns no PICO console.
The typed equivalent prints the width with `?`
(`241b438:src/cpm/ccpcmd.asm:134-150`).
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
GLCD display choice, as Appendix I describes (`241b438:host/card.mjs:26-48`).

New starter card on the web page or a new image from `npm run media`
replaces the card's contents. The other way keeps the card: rename
`GLCD.DRV` to `GLCD.SVC` and change `STARTUP.CMD` to match. That works when
the file's format, its second byte, is 4, the format this ROM loads. An older
card's `PICO.SVC` doesn't install under any name because the ROM's table no
longer takes a driver for the PICO9918. The retained historical recipe below
copies the starter card and adds two display drivers under the old type: a
historical `PICO.SVC` fixture and the card's own `GLCD.SVC`. Its startup file,
like an older card's, has no `SHELL.SVC` line. The recipe's
`test/fixtures/8f50c61/PICO.SVC` is not tracked in either the declared recovery
Git tree or source revision `241b438`. Both Git trees instead track the 843-byte binary
`test/fixtures/e5154ad/PICO.SVC` as blob
`da08056ba88128bac6f3b79578b1ddea621dfd0e`. That verified ownership does
not by itself establish equivalence to the recipe's missing historical path.
Fresh reproduction needs that identity check. The retained transcript is not
a new execution result:

```sh
cp dist/starter.img old.img
node tools/tecvol.mjs put old.img A test/fixtures/8f50c61/PICO.SVC PICO.DRV
node tools/tecvol.mjs put old.img A dist/files/GLCD.SVC GLCD.DRV
node tools/tecvol.mjs era old.img A GLCD.SVC
printf 'PICO.DRV\nGLCD.DRV\n' > startup.cmd
node tools/tecvol.mjs put old.img A startup.cmd --text
```

The retained graphics-LCD host-model run starts without a shell. The ROM
runs only the first startup line and that line fails. Renaming does not make
PICO installable, so its next attempt still leaves no service installed.
GLCD installs and selects its console. `SERVICES` also fails because that
command requires the shell:

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
startup file unchanged (`241b438:host/card.mjs:30-53`, `241b438:host/card.mjs:109-146`, `241b438:host/card.mjs:205-220`).
A `GLCD.SVC` of an older format fails under the new name too, as
`GLCD.SVC?`. A matching copy from a new starter card or one put on the card
with `tecvol` replaces it.

## The BDOS's errors

The BDOS prints these messages when a disk operation can't be done at all.
Each starts a new line. By default the BDOS then waits for a key and ends the
program or command by warm boot with the rest of a chained line dropped,
whatever the key returned by input (`241b438:src/cpm/bdos.asm:103-105`,
`241b438:src/cpm/bdoscon.asm:47-64`, `241b438:src/cpm/bdoscon.asm:99-127`). An ordinary key retained during
message output can satisfy that wait. Output-time `^S` and `^P` still have
their separate console effects (`241b438:src/cpm/bdoscon.asm:300-331`).
A program can take the errors itself with BDOS function 45. With `E` = `FFh`
the error returns with `A` = `FFh`, `H` the code in the table and no message.
With `FEh` the message is printed first and the error returns the same way.
Returning an error preserves the remaining chain. A sequential read or write
that returns an error leaves
the FCB on the record it didn't read or write. Every warm boot puts the default
back (`241b438:src/cpm/bdos.asm:225-237`, `241b438:src/ram.asm:222-223`).
[Chapter 20](20-a-file-through-the-bdos.md#errors-returned-or-reported) explains them and
[Appendix A](appendix-a-bdos-functions.md#the-errors) lists them by function.

| Message | Code | Cause | Remedy | See |
| --- | ---: | --- | --- | --- |
| `Bdos Err On d: Select` | 4 | No volume on the drive, a drive past D or `?` in an FCB drive byte outside function 17. On warm entry the CCP falls back to A if the saved drive has no volume. | Mount a volume on a usable drive or select another. | [Chapter 5](05-drives-and-user-areas.md), `241b438:src/bios.asm:61-92`, `241b438:src/cpm/bdosfile.asm:176-195`, `241b438:src/cpm/ccp.asm:50-64`, `241b438:src/text.asm:73` |
| `Bdos Err On d: R/O` | 2 | A write, make, delete, rename or attribute change on a drive protected by function 28. Close instead succeeds without writing. | Warm boot clears temporary protection. Correct a program that protects a drive before changing it. | `241b438:src/cpm/bdosfn.asm:122-135`, `241b438:src/cpm/bdosfile.asm:30-35`, `241b438:src/cpm/bdosfile.asm:247-253`, `241b438:src/cpm/bdoslog.asm:741-750` |
| `Bdos Err On d: R/O` | 2 | A change to a volume marked read-only, including ERA, REN or COPY's destination. That volume is not written. | Use a writable volume. Its protection is an on-card property, reapplied at login. | `241b438:src/cpm/bdoslog.asm:211-216`, `241b438:src/cpm/bdoslog.asm:733-750`, `241b438:src/text.asm:75` |
| `Bdos Err On d: File R/O` | 3 | Delete, rename or sequential/random write reached a read-only file. ERA, REN and COPY can reach this check. Earlier matching entries in a wildcard ERA remain erased. | Set attributes with BDOS 30 or extract the file with tecvol and put it back with --force and without --ro. The CCP has no attribute-setting command. | `241b438:src/cpm/bdosfile.asm:355-366`, `241b438:src/cpm/bdosfile.asm:393-413`, `241b438:src/cpm/bdosfile.asm:539-545`, `241b438:src/cpm/bdosfile.asm:556-560`, `241b438:src/cpm/bdosfile.asm:592-599`, `241b438:src/cpm/bdosrec.asm:274-283`, `241b438:tools/lib/cpmfs.mjs:157-191`, `241b438:src/text.asm:76-77` |
| `Bdos Err On d: Bad Sector` | 1 | A data or directory transfer failed. ERA's earlier successful directory writes remain applied, including entries of the same file or earlier wildcard matches. The failing entry and later entries are not confirmed erased. A physical partial write can damage the failing card block. | Copy first and run tecvol verify on the copy. Inspect recoverable files and replace a persistently failing card. | [Chapter 6](06-cards-on-the-pc.md#recovery-after-a-power-cut), `241b438:src/cpm/bdosfile.asm:387-407`, `241b438:src/cpm/bdoslog.asm:83-108`, `241b438:src/cpm/bdosrec.asm:69-82`, `241b438:src/cpm/bdosrec.asm:222-225` |
| `Bdos Err On d: Bad Sector` | 1 | A volume extends beyond the card and the card rejects the command. The ROM reports that rejection before transferring block data. The source of a host-model test checks that no image byte changes in this case. | Use a card large enough for the container or build a smaller container with create. | [Chapter 18](18-card-blocks-and-volumes.md), `241b438:src/sd.asm:397-405`, `241b438:src/sd.asm:437-454`, `241b438:src/sd.asm:664-672`, `241b438:test/sd-range.test.mjs:86-107` |
| `Bdos Err On d: Bad Sector` | 1 | A file's allocation map names a block beyond the volume. Login and delete skip that invalid reference rather than indexing outside the vector. Access to the block fails. | ERA can remove the damaged entry if the required directory writes succeed. Verify a copy before further changes. | [Chapter 20](20-a-file-through-the-bdos.md), `241b438:src/cpm/bdosrec.asm:699-700`, `241b438:src/cpm/bdoslog.asm:577-605`, `241b438:src/cpm/bdoscon.asm:76-92` |

<a id="write-lost"></a>

## `Write pending`, `Cache clear` and `Write error`

Failed acknowledged data now stays dirty and queued, including through warm
boot. Separate notices describe that queue without replacing an unrelated
operation's return registers:

| Notice | Meaning |
| --- | --- |
| `Write pending` | Once per failed-write episode while dirty retries remain |
| `Cache clear` | A previously reported episode's queue has drained successfully |
| `Write error` | An otherwise unreported failure has no dirty retry left, such as rejected metadata; not successful recovery |

Silent function-45 `FFh` mode defers reporting without losing the event.
An operation's metadata error is separate from the queue's episode state
(`a40d482:src/hk.asm:204-237`, `a40d482:src/text.asm:94-96`).

Warm boot cancels continuation on failed flushing but retains acknowledged data.
Rejected directory metadata is still dropped and cannot later be published by
queue retries. Cache clear is not file closure, repaired rejected metadata,
browser persistence or physical power-loss durability
(`a40d482:src/cache.asm:550-569`, `a40d482:src/cache.asm:638-649`).

After Write pending, a prompt alone is insufficient. Resolve the original
initialised backend failure and await successful completion; cold reset still
discards pending RAM. Card reinsertion does not initialise or identify it and
Enter does not authorise replay onto a stranger
(`a40d482:docs/recovery.md:206-222`).

## `Disk reset failed` and `Enter retries`

These words belong to the bootstrap recovery console after returned disk-reset
or saved-drive selection failure. Incomplete LOGINV/WARMV and command
continuation are cleared, while acknowledged data survives. No normal command,
shell LINE or program starts until disk defaults are valid
(`a40d482:src/cpm/ccp.asm:75-134`).

Only CR retries reset. LF, ordinary keys and input Ctrl-C are ignored. Existing
Ctrl-S output pause followed by Ctrl-C remains the deliberate warm-boot escape.
Output/input can still attempt writes before Enter; the retry controls disk
reset, not every SD opportunity. No SDINIT occurs here. A cold-start line
buffered before saved-drive refusal waits and runs once after recovery succeeds.
This console is distinct from cold mount's diagnostic R retry prompt.

## `CD`

A failed `CD` leaves the drive's volume in place. Each rejection sets the
return code to `FF00h`, so a following `&` piece is skipped
(`241b438:drivers/shellcd.asm:17-165`, `241b438:docs/shell.md:142-198`). The shell prints the
messages below.
[Chapter 5](05-drives-and-user-areas.md#changing-a-drive-s-volume) gives the
operator commands and [Chapter 18](18-card-blocks-and-volumes.md) explains
the volume services.

| Message | Cause | Remedy | See |
| --- | --- | --- | --- |
| `CD?` | A name of more than 11 characters, a drive past D, text after the name or after `?`, or CD of the drive the running script is read from. A script goes on to its next line. | `CD ?` lists the card's volumes. In a script, put the volume on another drive. | `241b438:drivers/shellcd.asm:17-82`, `241b438:docs/shell.md:194-198` |
| `NAME?` | No volume on the card has that label. | List the labels with `CD ?`. | `241b438:drivers/shellcd.asm:99-103`, `241b438:drivers/shellcd.asm:143-152` |
| `NAME is on B:` | The volume is already on another drive. A volume is never on two drives. | Use that drive, or put another volume there first. | `241b438:drivers/shellcd.asm:104-109`, `241b438:drivers/shellcd.asm:154-163` |
| `CD FAILED` | The ROM's `MOUNT` service refused: the volume is too large for the drive's slot, or the flush before the change failed. Failed acknowledged data stays queued; notice reporting retains its own episode policy (`a40d482:docs/recovery.md:69-84`, `a40d482:src/hk.asm:204-237`). | Choose a drive whose slot fits, or recover the card if a write failed. | `241b438:drivers/shellcd.asm:110-117`, `241b438:drivers/shellcd.asm:164`, `241b438:src/volsvc.asm:211-265`, `241b438:src/volsvc.asm:360-389` |

## TED's load error

The starter card's TED (Thorium `20339b8`) prints this
line and returns to the prompt when the file it is opening holds a byte it
rejects
(`Thorium 20339b8:README.md:25-30`, `241b438:docs/compatibility.md:231`,
`241b438:test/ted.test.mjs:94-122`). An older TED, Thorium `cc4044b`, also rejects `00h` padding at the end of a file and gives
error 03 without a line or column
(`Thorium cc4044b:ted/src/load.asm:48-53`, `121-125`).

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
| `?` | The `MON3>` line is not `LOAD`, `GO` or `EXIT` in a form they take. For `LOAD`: a drive beyond P, a name or type too long or holding `?` or `*`, a file not found or empty, bytes outside `0100h` to the BDOS entry's page or inside `0800h–08FFh`, or a fault anywhere in a HEX file. `GO` with no address prints it when no load has ended well. `GO` also prints it, and runs nothing, while a card write is pending. A refused load writes nothing and leaves nothing runnable. | Correct the line, the file or the address. After `Write pending`, resolve the card's refusal; `GO` runs again once the console shows `Cache clear`. | [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session), `241b438:docs/mon3.md:61-98`, `TEC-OS 1f1117336b7a9bb468b4efc9c6b1c1fd81bff53e:docs/mon3.md:117-124` |
| `RST nn held: UNLOAD or reset` | At entry a restart slot from `08h` to `30h` holds a `JP`: a service's claim, or a jump into ROM that a program left. The entry is refused with return code FF00h and nothing changed. | `UNLOAD` the service that holds the slot, or reset. | `241b438:docs/mon3.md:198-201` |
| `RST 38 held: no interrupts` | `0038h` held a `JP` at entry, which the session leaves alone. A program's interrupts through MON-3's `USER_INT` are not delivered. | The session runs without them. | `241b438:docs/mon3.md:185`, `241b438:docs/mon3.md:232` |
| `MON3 active` | A program in a session called the service's entry. The call returns to the program with FF00h. | None. | `241b438:docs/mon3.md:202-203` |
| `BRK nnnn` | The program ran `RST 30h`, MON-3's breakpoint. The session prints `BRK` with the address and returns to `MON3>`. There is no resume. | None: the session is at `MON3>`. | `241b438:docs/mon3.md:138-140`, `241b438:docs/mon3.md:231` |
| `Tables damaged: EXIT and reset` | After the program returned, the checksum over the service and TEC-OS's RAM BIOS table differed from the one `GO` took. Every later `LOAD` prints it again and is refused without opening the file, and each re-entry prints it. `GO` and `EXIT` still run. | `EXIT`, then press reset, which also removes the service. | `241b438:docs/mon3.md:146-160`, `241b438:drivers/mon3.asm:1191-1192` |
| MON-3's error display on the digits | The program called an `RST 10h` or `RST 18h` function that the session does not build, or a number beyond MON-3's calls. The call's outputs are not written. | Press a key. The call returns to the program as a key press would. | [Chapter 5](05-drives-and-user-areas.md#a-mon-3-session), `241b438:docs/mon3.md:227-228`, `241b438:docs/mon3.md:264-274`, `241b438:docs/mon3.md:320-329` |

## Lines that report no fault

The following lines report ordinary progress or request input. They do not
indicate a fault and need no recovery action.

| Line | Meaning | See |
| --- | --- | --- |
| `TEC-OS 0.1 for TEC-1G` | The cold-boot console banner. The LCD banner is `TEC-OS 0.1  TEC-1G`. | [Chapter 1](01-first-session.md), `241b438:src/text.asm:12`, `241b438:src/text.asm:79`, `241b438:tools/build.mjs:28` |
| `d: LABEL` | A mounted drive and volume at cold boot, with ` (read-only)` for a protected volume. LCD rows 1 and 2 show A and B without that suffix. | `241b438:src/boot.asm:500-527`, `241b438:src/lcd.asm:104-168`, `241b438:src/text.asm:13` |
| `n files, nK free` | The ROM's DIR, `DIR /W` under the shell: its listed-file count and free space. The singular is `1 file, nK free`. | [Chapter 4](04-work-with-files.md), `241b438:src/cpm/ccpfile.asm:198-254`, `241b438:src/text.asm:27-32` |
| `n files, n bytes` and `n free on d:LABEL` | The shell's DIR: the count and bytes of the files listed, and the drive's free bytes with its volume. | [Appendix J](appendix-j-command-reference.md#dir-and-type), `241b438:drivers/shelldir.asm:240-280` |
| `[more]` | DIR or TYPE paused at a screenful. An ordinary key continues. Esc, Q, q and `;` stop the listing. `^C` and `#` also drop the remaining line because the comparison clears bit 5. The pause is the shell's, and without the shell DIR and TYPE do not pause. | `241b438:drivers/shellio.asm:450-502` |
| `ALL (Y/N)?` | ERA's or DEL's pattern is all wildcards. A line starting with Y or y confirms the erase in the current user area. Other lines and Return alone cancel without failure. Confirming does not override file/volume protection or disk errors. | `241b438:src/cpm/ccpmut.asm:18-67`, `241b438:src/text.asm:56-57` |
| `COPIED nnnn` | COPY completed and closed its destination. The four hexadecimal digits count records. | `241b438:drivers/shellcmd.asm:130-143`, `241b438:drivers/shellcmd.asm:219` |
| `CON: TTY:`, `CON: CRT:`, `CON: UC1:` | The effective console after CON. An unavailable CRT falls back to TTY. A returned UC1 load failure leaves the previous mode. `CON: BAT:` is generated but discarded. | [Chapter 7](07-choose-a-console.md), `241b438:src/cpm/ccpcmd.asm:187-211`, `241b438:src/loader.asm:873-887`, `241b438:src/console.asm:75-133`, `241b438:src/console.asm:345-353` |
| `NAME n` | SERVICES lists names and resident pages, newest first. SERVICES is the shell's command. | [Chapter 5](05-drives-and-user-areas.md), `241b438:drivers/shellcmd.asm:15-50` |
| `d:LABEL` from CD | The drive and the volume now on it, also when it was already there. | `241b438:drivers/shellcd.asm:118-133` |
| `LABEL d:` from `CD ?` | One of the card's volumes and its drive, in the card's order. | `241b438:drivers/shellcd.asm:135-141`, `241b438:drivers/shellcd.asm:166-258` |
