---
title: Cards on the PC
parent: TEC-OS
nav_order: 6
nav_group: "Using the machine"
---

# 6. Cards on the PC

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

A card image keeps a copy of your work on the PC. You can extract source
from it, add files or prepare another card while keeping the original
unchanged. The `tecvol` tool reads and edits an image as the card's
512-byte blocks stored in order. This chapter begins with making a copy
and recovering the BANNER source saved in Chapter 2.

## The host tools

`tecvol` needs a clone of the TEC-OS repository and Node.js 20 or later,
the minimum in `package.json`. The commands below run from the repository
root. `node tools/tecvol.mjs` invokes the tool directly, so no command
needs to be installed on the shell's search path.
[Appendix F](appendix-f-tecvol.md) lists the full syntax.

Some later examples use `dist/starter.img` or files in `dist/files/`.
These need a prepared media set for the matching ROM. A Git clone
contains the source, not these generated files. `npm ci` installs locked
dependencies. It does not build the ROM or card.
[Chapter 27](27-build-the-rom-and-media.md) describes input preparation
and `npm run media`, which writes the ROM, starter image, recipes and
components to `dist/`. It also contains the complete PC HELLO example.
A host-built COM file is copied onto a card with the same `put` command
as another binary. Sizes, hashes and free-space totals here apply to
the particular example card.

## A copy before a change

Before removing a card from the TEC-1G, wait for the command prompt. Every
time TEC-OS waits for a key it writes every change it holds, on every drive,
so at the prompt everything is on the card. `Write lost` means that some
writes failed, not that the card is up to date.
Never change a card on a PC while TEC-OS is using it. Its cached blocks and
free-space maps would no longer match the card. Reset after returning a
PC-changed card to the board. Warm boot retains those old copies in memory.
[Chapter 19](19-cache-and-persistence.md) explains the persistence rules.

The card reader appears on the PC as a device. On a Mac its raw-device name
has the form `/dev/rdiskN`, on Linux a name such as `/dev/sdb`. These are
placeholders, not names to copy unchanged. Identify the removable card and
its capacity with the PC's disk tools before reading or writing it. A raw
write goes to the named device even if that device contains your PC's files.
Unmount its filesystems before a raw write so the PC is not also writing
through a mounted filesystem.

The starter container occupies 13 MiB. This recovery command copies its
first 26,624 blocks into `card.img` and then checks the image:

```sh
dd if=/dev/rdiskN of=card.img bs=512 count=26624
node tools/tecvol.mjs verify card.img
```

That count belongs to the starter container. A larger custom container needs
all its blocks copied. Keep the first copy unchanged and use another image
for edits or recovery. `verify` checks the container and directory structure,
not whether a file still contains the text you intended to save.

## Listing and extracting saved work

`node tools/tecvol.mjs dir card.img` lists A's files with their user
areas and lengths rounded to 128-byte records. An additional argument
selects a volume. It is matched as a drive letter first, then as a label
and finally as an id. A label or id can select an unassigned volume.

`get` copies a named file to the PC. Its optional output-file argument gives the
destination. A named destination is overwritten if it already exists so use a
new path for a recovered copy. Without that argument the bytes go to standard
output. Binary extraction includes every recorded 128-byte record, including
padding in the last one. With `--text`, extraction stops before the first `^Z`
and converts carriage-return/line-feed pairs to line feeds. A lone carriage
return is retained. Without `^Z`, all recorded bytes undergo that conversion,
including any padding.

`get` selects user area 0 by default, while `dir` lists all areas.
`--user N` selects an area for either command. N must be a whole number
from 0 to 15. `oops`, `1.5` and `16` stop the command before any image
change. Listing and extraction both leave `card.img` unchanged.

### Recovering BANNER

BANNER can be extracted in two forms: raw records or editable PC text.
This example uses `saved-banner-card.img`, saved after the edited source,
TED exit and successful prompt flush in Chapter 2. That run began with a
fresh starter card, separately from Chapter 1's SAMPLE run. Your A may
also contain SAMPLE.COM and SAMPLE.DBG if you continued on the same card.

A fresh starter image has no BANNER. Use new destinations for the backup and
extracted files. Neither `card.img` nor the `recovered/` directory may already
exist.

Extraction begins from a working copy. `cmp` compares it with the saved
image and prints nothing for equal bytes. `verify` then checks the copy's
container and directories:

```sh
cp saved-banner-card.img card.img
cmp saved-banner-card.img card.img
mkdir recovered
node tools/tecvol.mjs verify card.img
```

The verified copy has this layout and directory summary:

```text
container: format 1.1, 26624 blocks (13631488 bytes), 5 volume(s), 4 drive(s) wanted
  A: SYSTEM      id 1 G1M start 2048 rw 16 file(s), 931840 bytes free
  B: WORK        id 2 G8M start 4096 rw 3 file(s), 8359936 bytes free
  C: PROJECTS    id 3 G1M start 20480 rw 0 file(s), 1040384 bytes free
  -: GAMES       id 4 G1M start 22528 rw 0 file(s), 1040384 bytes free
  -: SPARE       id 5 G1M start 24576 rw 0 file(s), 1040384 bytes free
```

The first command lists A by default. The second selects B, which
contains the saved banner:

```sh
node tools/tecvol.mjs dir card.img
node tools/tecvol.mjs dir card.img B
```

A's complete listing contains the fourteen starter files plus TED's
project and session files:

```text
 0 BAZA.COM        13184
 0 BAZA.RTL        12032
 0 BOUNCE.BAS       5376
 0 DEMO.ASM        15360
 0 GLCD.SVC          896
 0 HELLO3.ASM       2176
 0 HELLO3.BIN        256
 0 MON3.SVC         5120
 0 SAMPLE.ASM       4608
 0 SHELL.SVC        3712
 0 STARTUP.CMD       128
 0 TAS.COM         10368
 0 TED.COM         12416
 0 THOR.PRJ          128
 0 THOR.SES          128
 0 TIMES.BAS         640
```

B's listing contains the source, executable and debug file:

```text
 0 BANNER.ASM        384
 0 BANNER.COM        128
 0 BANNER.DBG        384
```

These commands explicitly select user area 0 on B. They save that
listing before extracting BANNER as raw records and as text:

```sh
node tools/tecvol.mjs dir card.img B --user 0 > recovered/B-user0.txt
cat recovered/B-user0.txt
node tools/tecvol.mjs get card.img B BANNER.ASM recovered/BANNER.REC --user 0
node tools/tecvol.mjs get card.img B BANNER.ASM recovered/BANNER.ASM --user 0 --text
wc -c recovered/BANNER.REC recovered/BANNER.ASM
```

The filtered listing contains the same three B entries. `wc` reports
the extracted file sizes:

```text
     384 recovered/BANNER.REC
     273 recovered/BANNER.ASM
     657 total
```

`BANNER.REC` is a PC file containing the three raw records from B.
They hold 286 bytes of source with CRLF endings, then 98 bytes of `1Ah`
padding. Text extraction stops at the first `1Ah` and converts 13 CRLF
pairs to LF. This produces 273 bytes of editable source:

```sh
cat recovered/BANNER.ASM
```

```asm
  org $0100

; Print one line to the console.
; Takes nothing. Returns to the CCP.
; Changes AF, BC, DE and HL.

START:
  ld de,MSG      ; Text for BDOS.
  ld c,9         ; $ ends the text.
  call 5
  ret            ; CCP warm boot.

MSG: db "Hello from TEC-OS!",13,10,"$"
```

The saved user-0 listing has no `MISSING.ASM`. Requesting that absent
name tests the failure path. The PC destination `recovered/MISSING.ASM`
must also be absent before this check:

```sh
missing_status=0
node tools/tecvol.mjs get card.img B MISSING.ASM recovered/MISSING.ASM --user 0 > recovered/missing.stdout 2> recovered/missing.stderr || missing_status=$?
printf 'missing get exit: %s\n' "$missing_status"
cat recovered/missing.stderr
```

```text
missing get exit: 1
tecvol: 0/MISSING.ASM not found
```

The error is printed on standard error. The command creates no PC
file named `MISSING.ASM`. Listing and both successful extractions also leave
the image unchanged. A final comparison after the failure check found
no difference:

```sh
cmp saved-banner-card.img card.img
```

The saved image, working copy and both extracted files remain available.
These checks used image files on the host. They establish no physical-card
read or write.

## The container and its volumes

Each volume is a fixed-size CP/M disk containing files such as programs,
services and source. CP/M 2.2 addresses at most 8 MiB per drive. A card
can hold many volumes, even though only four can be assigned to drives
at once. This separates the card's capacity from the size of a disk
available to a CP/M program.

The first 512-byte block contains a header and the first volume
descriptors. Each descriptor records a volume's number, label of up to
11 characters, geometry, size, starting block and optional default drive.
Further descriptors can follow the header block. The container supports
up to 127 volumes, with up to four assigned to A through D.

`info` displays the container layout and directory totals. On the
prepared starter image this command produces:

```sh
node tools/tecvol.mjs info dist/starter.img
```

```text
container: format 1.1, 26624 blocks (13631488 bytes), 5 volume(s), 4 drive(s) wanted
  A: SYSTEM      id 1 G1M start 2048 rw 14 file(s), 935936 bytes free
  B: WORK        id 2 G8M start 4096 rw 0 file(s), 8372224 bytes free
  C: PROJECTS    id 3 G1M start 20480 rw 0 file(s), 1040384 bytes free
  -: GAMES       id 4 G1M start 22528 rw 0 file(s), 1040384 bytes free
  -: SPARE       id 5 G1M start 24576 rw 0 file(s), 1040384 bytes free
```

The container occupies 26,624 blocks or 13 MiB. SYSTEM begins at block
2,048 and occupies 1 MiB. WORK starts at 4,096 and occupies 8 MiB.
PROJECTS, GAMES and SPARE each occupy another 1 MiB. Each volume begins
on a multiple of 2,048 blocks, the default alignment. The header requests
four equal drive slots, including the initially empty D drive.

A volume row gives its drive, label, number (`id`), geometry and starting
block. `rw` means writable and `ro` means read-only. File counts and free
bytes come from the directory. Write-behind applies to the logged drive,
not a flag stored for the volume.

Cold boot validates the header's name, version and checksum and the volume
descriptors. A failed check leaves no drive mounted and stops at the
diagnostic prompt. [Chapter 28](28-diagnose-the-machine.md)
explains that prompt and [Appendix D](appendix-d-error-messages.md) lists
the codes. [Appendix E](appendix-e-container-format.md) gives every field.

## Record sizes and allocated space

The two supported geometries specify a volume's capacity, allocation
unit and directory size:

| Geometry | Size | Allocation block | Directory entries |
| --- | --- | --- | --- |
| G1M | 1 MiB | 2 KiB | 256 |
| G8M | 8 MiB | 4 KiB | 512 |

Three storage units appear in file sizes. CP/M transfers 128-byte
records and the card transfers 512-byte blocks, each holding four records.
Space for a file is reserved in larger allocation blocks. A file with data
uses at least 2 KiB on G1M or 4 KiB on G8M. A 128-byte STARTUP.CMD on WORK
therefore uses 4 KiB of allocated space.

One directory entry describes up to 16 KiB on G1M or 32 KiB on G8M.
A larger file needs further entries. The directory occupies the first
allocation blocks, 8 KiB on G1M or 16 KiB on G8M. An empty G8M volume
therefore has 8,372,224 bytes free, 16 KiB less than 8 MiB.

The volume payload is an ordinary CP/M 2.2 directory and data area. A CP/M
disk tool such as cpmtools can read a volume copied out of the image when
given its geometry parameters. Appendix E lists those parameters.

## Replacing files

`put` copies a PC file onto a volume. Its basename becomes the CP/M name
in capitals unless you supply another name after the path. For text,
`--text` converts line endings to CRLF, adds `^Z` and pads the final
record with `^Z`. Binary files receive zero padding. The CP/M directory
still records whole records, not the PC file's original byte length.

Without `--text`, a text file receives zero padding instead of `^Z`.
TED on the starter card, Thorium `a2fe556`, recognises trailing `00h`
through the rest of the last record as the file's end. It opens this
form without an error. A rejected byte elsewhere ends the editor with
`EDIT error 03` and its line and column, such as `EDIT error 03 L3 C5`
(TEC-OS b3134cf `docs/compatibility.md`, Thorium a2fe556 `README.md`).
The older Thorium `967678c` TED rejects that padding with error 03
and reports no position.

`era` erases a named file. Like `get`, `put` and `era` use user area 0 unless
`--user N` selects another.

`put --ro` sets the file's read-only attribute and `put --sys` sets its
system attribute. TEC-OS's `DIR` omits system files, though the files remain
available by name in their user area. The host `dir` lists them with `SYS`.
`put` and `era` leave a read-only file alone unless `--force` is given.
That override applies to the file attribute, not a read-only volume.

An image change replaces the whole image file. A failure before replacement
leaves the original unchanged. Keep the untouched backup because replacement
does not guarantee preservation through a PC power failure. Writing an image
to a physical device with `install` has a different failure consequence,
described below.

## Preparing a card of your own

`create` builds an image containing empty volumes. In this example,
`my.img` has SYSTEM on A, WORK on B and unassigned GAMES and SPARE.
Each `--volume` argument supplies a geometry, label and optional drive,
separated by colons. `:ro` after the drive makes the volume read-only.
`--drives 4` reserves slots for all four drives at cold boot, including
the two initially empty ones:

```sh
node tools/tecvol.mjs create my.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G8M:GAMES --volume G1M:SPARE --drives 4
```

`create` stops if the image already exists. Every card needs a volume on A.
Two volumes cannot share a drive or a label. `--drives` takes a whole number
from 1 to 4. `--align` replaces the default 2,048-block alignment with a
positive whole number up to 16,777,215 that is a multiple of 8. An invalid
value or unsupported flag such as `:wb` stops creation before an image
is written. Write-behind applies to the drive you are on, regardless
of the volume configuration
([Chapter 19](19-cache-and-persistence.md)).

The image needs the matching media's `dist/files/SHELL.SVC` and
`dist/files/TAS.COM`. A startup file loads the shell to provide `CD`.
A short `hello.txt` supplies text for SPARE: `Hello from the PC.` followed
by a line feed. These commands create the two text inputs:

```sh
printf 'SHELL.SVC\n' > startup.cmd
printf 'Hello from the PC.\n' > hello.txt
```

These commands put the shell and its startup file on SYSTEM, TAS on GAMES
and the text file on SPARE, then list A:

```sh
node tools/tecvol.mjs put my.img A dist/files/SHELL.SVC
node tools/tecvol.mjs put my.img A startup.cmd --text
node tools/tecvol.mjs put my.img GAMES dist/files/TAS.COM
node tools/tecvol.mjs put my.img SPARE hello.txt --text
node tools/tecvol.mjs dir my.img
```

```text
 0 SHELL.SVC        3712
 0 STARTUP.CMD       128
```

After those puts, `node tools/tecvol.mjs info my.img` prints this:

```text
container: format 1.1, 38912 blocks (19922944 bytes), 4 volume(s), 4 drive(s) wanted
  A: SYSTEM      id 1 G1M start 2048 rw 2 file(s), 1034240 bytes free
  B: WORK        id 2 G8M start 4096 rw 0 file(s), 8372224 bytes free
  -: GAMES       id 3 G8M start 20480 rw 1 file(s), 8359936 bytes free
  -: SPARE       id 4 G1M start 36864 rw 1 file(s), 1038336 bytes free
```

The `-` means no default drive. GAMES and SPARE stay unassigned at cold boot
until a retained selection or `CD` assigns them. A card with more than eight
volumes or an explicit `--drives` count uses format 1.1. Both `info` and
`verify` check each volume's directory and print problems under its line.
`verify` also exits with status 1 for directory problems.

## Recipes and read-only volumes

A recipe records the inputs for reproducing a complete card. Its JSON
lists volumes and component files with byte counts and SHA-256 hashes.
The `recipe` command fetches each component from a URL or a path relative
to the recipe. A size or hash mismatch stops the build. The same recipe
and matching inputs produce identical image bytes.

`npm run media` produces `dist/starter.recipe.json` as part of the media
preparation described in Chapter 27. The card-building command is:

```sh
node tools/tecvol.mjs recipe dist/starter.recipe.json mystarter.img
```

The recipe's volume list is:

```json
"volumes": [
  { "geometry": "G1M", "label": "SYSTEM", "mount": "A" },
  { "geometry": "G8M", "label": "WORK", "mount": "B" },
  { "geometry": "G1M", "label": "PROJECTS", "mount": "C" },
  { "geometry": "G1M", "label": "GAMES" },
  { "geometry": "G1M", "label": "SPARE" }
]
```

A file inside a component's `files` list has an entry such as this shell
entry:

```json
{
  "name": "SHELL.SVC",
  "url": "files/SHELL.SVC",
  "drive": "A",
  "bytes": 3663,
  "sha256": "3609c78ef2ee459ca076bf6fa0073dec9f2153159bf51a5ec0055f92aabe9a78"
}
```

This byte count and hash identify the binary used in this build. A
different binary needs its own values. The recipe supplied with a prepared
media set records the identities for that set.

A recipe can populate a read-only volume by writing its files before
applying `"readOnly": true`. In contrast, `create` makes an empty
read-only volume that `put` cannot populate. Volume protection applies
to all its files independently of their attributes.

The browser's New starter card uses `starter.recipe.json` too. The
page's card and `dist/starter.img` therefore have the same inputs and
checks. Recipe revision 13 places fourteen files on A, including
SHELL.SVC, DEMO.ASM and BOUNCE.BAS. It also includes MON3.SVC with
HELLO3.BIN and HELLO3.ASM. `TAS DEMO` builds DEMO.COM on the card.
Media preparation writes no separate page recipe
(TEC-OS b3134cf `tools/media.mjs`, `web/build.mjs`). The browser checks
the same sizes and SHA-256 hashes.

## A protection example

This example separates protection of a volume from protection of a
file. It requires prepared media files and an existing `build/` directory.
WORK on B is writable but its STARTUP.CMD is read-only. ARCHIVE on C
is an empty read-only volume:

```sh
node tools/tecvol.mjs create build/errs.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G1M:ARCHIVE:C:ro
node tools/tecvol.mjs put build/errs.img B dist/files/STARTUP.CMD --ro
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card build/errs.img '@start SAVE 1 C:X.COM' '@key x' '@start ERA B:STARTUP.CMD' '@key x' 'DIR B:'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: ARCHIVE     (read-only)

A>SAVE 1 C:X.COM

Bdos Err On C: R/O
A>ERA B:STARTUP.CMD

Bdos Err On B: File R/O
A>DIR B:
STARTUP.CMD
1 file, 8172K free
A>
```

`SAVE` made no file on C and `ERA` left B's file in place. In the default
BDOS error mode each message waits for a key before ending the command.
Here the capture supplies `x`. A program can also make a drive temporarily
read-only. Warm boot clears that temporary protection
but preserves a volume's read-only flag. Chapter 5 explains the operator
effects and [Appendix D](appendix-d-error-messages.md) gives the messages.

## Writing the physical card

`install` copies an image to a physical device starting at block 0.
The overwrite requires an explicit `--yes`:

```sh
node tools/tecvol.mjs install my.img /dev/rdiskN --yes
```

The device must be the identified removable card, with capacity for the
whole container. `--yes` confirms the overwrite but does not identify the
device for you or make a backup. Unlike image replacement, a device write
can leave a partial result if interrupted. TEC-OS and the PC must have
exclusive use of the card in turn. Reset after putting the changed card
back in the board.

TEC-OS does not read the card's capacity. A valid header can therefore
describe blocks beyond a smaller card's end. The short-card
example cuts the starter image to 4,110 blocks, 14 blocks into WORK and
inside its directory:

```sh
cp dist/starter.img short.img
truncate -s 2104320 short.img
```

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card short.img '@start DIR B:' '@key x'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK
C: PROJECTS

A>SHELL.SVC

A:SYSTEM>GLCD.SVC

A:SYSTEM>DIR B:

Bdos Err On B: Bad Sector
A:SYSTEM>
```

The host model accepts that short byte array and the ROM reaches the
missing directory blocks. A card ending after the directory can fail later
when a file write reaches a missing block. On a volume written behind the
failure can surface at close when pending data is flushed. The
write-failure demonstration is in Chapter 19.

Standard-capacity cards use byte addresses. The ROM can name their first
4 GiB, through block `7FFFFFh`. A volume may end immediately after that
block but may not include block `800000h` or above. A descriptor outside
that limit fails mounting with code `27h` and no volume mounts. Validation
does not write the card.

## Browser images and physical limits

Open image loads an image file into the browser's card. Download image
saves that card as a file that the PC tools can inspect or install. Download
it while TEC-OS waits at its prompt, where every change is already in the
image. Downloading does not itself write the emulated cache.

The page also prepares `STARTUP.CMD` for its selected display when it can.
Keep an untouched copy if you need the original startup text. The exact
rewrite, protection and failed-preparation rules are in
[Appendix I](appendix-i-web-page.md). Importing a complete image differs
from importing files into one volume.

The browser uses a high-capacity card model so it does not exercise the
standard-capacity byte-address limit. Open image also validates the whole
container and rejects an image shorter than its declared size. It therefore
cannot reproduce the short-image capture above through that control. These
exclusions do not remove every cause of ROM code `27h`: the ROM also rejects a
volume end that overflows 32 bits or exceeds the container's declared size.
Browser validation rejects those malformed descriptors before the ROM receives
an opened image.

## Recovery after a power cut

TEC-OS adds no journal to CP/M's writes. Data is written before the directory
entry that names it. When close writes a modified file's directory entry
successfully, its preceding data writes have also succeeded. Before that
close, some writes may have reached the card and others may remain only in
memory. A failed close is not proof of preservation and nothing automatically
restores the old file.

On a drive other than the one you are on, a record write goes into the
cache's copy of its 512-byte card block and returns. The block reaches the
card at the next flush point: the file's close, any directory request, a
write to another block, a console read, function 48, a drive change, `CD` or
a warm boot.
A cut before that point loses the records written into that one block since
it was last written, at most four records, and the card keeps the block's
old contents. A cut before the directory update can leave newly allocated
data blocks with no entry naming them. They become free again when TEC-OS
rebuilds the drive's free-space map. Overwriting a record already in a file
replaces it when its block is written. A cut can leave new records alongside
old records that the program had not reached, with no saved copy of the
original file.

On the drive you are on, the logged drive, writes are held behind: a cut
loses the changes still in the cache, at most those since the program's last
key wait or directory write. Blocks written early to make cache space and
blocks written by a completed part of a flush remain on the card. Newly allocated blocks may again have no directory entry.
Overwritten blocks contain the new data. The directory write follows successful
data writes so an interrupted flush does not publish a new allocation map before
those data writes succeed.

A cut during a single block write can leave old, new or mixed contents in
that block. A directory block holds sixteen 32-byte entries, any of which
can be damaged. Write ordering does not make that physical transfer atomic.

Recovery starts with the copy described at the beginning of this chapter.
`verify` checks each volume's directory for these faults:

- An allocation block claimed twice.
- An allocation block number beyond the volume.
- Two entries for the same group of file extents.
- An entry with a record count above 128.
- An entry naming allocation blocks beyond the records it describes.

It reports problems and exits with status 1 when it finds one. A directory
that passes can still contain an incomplete or overwritten file. `get`
copies off readable files but an out-of-range allocation reference stops
that file's extraction with an error. It does not recover the missing bytes.
A fresh image made with `create` and `put` or from a recipe can then replace
the damaged card through `install` while the original copy remains available.
