---
title: Cards on the PC
parent: TEC-OS
nav_order: 6
nav_group: "Using the machine"
---

# 6. Cards on the PC

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

A copy of the card on your PC lets you extract work and prepare another card
without changing the original. `tecvol` reads and edits that image, a file
holding the card's 512-byte blocks in order.

## The host tools

`tecvol` runs from a clone of the TEC-OS repository with Node.js 20 or later,
the minimum declared by its `package.json`. The shell commands here use the
repository root as their working directory. `node tools/tecvol.mjs` runs the
card tool directly without installing a command on your shell's search path.
[Appendix F](appendix-f-tecvol.md) gives its complete command syntax.

The examples that use `dist/starter.img` and `dist/files/` require a prepared
media set made with the matching TEC-OS ROM. These generated files are not
included in a Git clone. `npm ci` installs the locked host dependencies but
does not itself produce the ROM or media.
[Chapter 27](27-build-the-rom-and-media.md) gives the source/input preparation
and build route through `npm run media`, which writes the ROM, starter image,
recipes and component files into `dist/`. A host-assembled COM program reaches
a card through the same `put` command as any other binary. The complete
PC HELLO recipe and its output are together in Chapter 27. Each example's
sizes, hashes and free-space totals belong to that example's card.

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

For the 13 MiB starter container, the recovery recipe copies its first
26,624 blocks and checks the copy:

```sh
dd if=/dev/rdiskN of=card.img bs=512 count=26624
node tools/tecvol.mjs verify card.img
```

That count belongs to the starter container. A larger custom container needs
all its blocks copied. Keep the first copy unchanged and use another image
for edits or recovery. `verify` checks the container and directory structure,
not whether a file still contains the text you intended to save.

## Listing and extracting saved work

`node tools/tecvol.mjs dir card.img` lists drive A by default, including each
file's user area and length in bytes, rounded to whole 128-byte records.
A volume argument names another volume by drive letter, label or id, tried
in that order. A label or id also reaches a volume that is on no drive.

`get` copies a named file to the PC. Its optional output-file argument gives the
destination. A named destination is overwritten if it already exists so use a
new path for a recovered copy. Without that argument the bytes go to standard
output. Binary extraction includes every recorded 128-byte record, including
padding in the last one. With `--text`, extraction stops before the first `^Z`
and converts carriage-return/line-feed pairs to line feeds. A lone carriage
return is retained. Without `^Z`, all recorded bytes undergo that conversion,
including any padding.

`get` reads user area 0 unless `--user N` selects another. `dir` lists all
areas unless that option limits it. `N` must be a whole number from 0 to 15.
Values such as `oops`, `1.5` and `16` stop the command before the image changes.
Listing and extraction leave `card.img` unchanged.

### Recovering BANNER

Chapter 2's saved BANNER can be recovered as raw records or editable PC text.
This example uses `saved-banner-card.img`, the persisted image after saving the
edited program, quitting TED and successfully flushing at the prompt. This
BANNER card began as a fresh starter card, separately from the SAMPLE
run in Chapter 1. If you continued on the same card, A may also contain
SAMPLE.COM and SAMPLE.DBG.

A fresh starter image has no BANNER. Use new destinations for the backup and
extracted files. Neither `card.img` nor the `recovered/` directory may already
exist.

First make a working copy and compare it with the saved image. The comparison
prints nothing when the bytes match. Verification then checks that copy's
container and directories before extraction:

```sh
cp saved-banner-card.img card.img
cmp saved-banner-card.img card.img
mkdir recovered
node tools/tecvol.mjs verify card.img
```

The verification succeeds:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
container: format 1.1, 26624 blocks (13631488 bytes), 5 volume(s), 4 drive(s) wanted
  A: SYSTEM      id 1 G1M start 2048 rw 15 file(s), 933888 bytes free
  B: WORK        id 2 G8M start 4096 rw 3 file(s), 8359936 bytes free
  C: PROJECTS    id 3 G1M start 20480 rw 0 file(s), 1040384 bytes free
  -: GAMES       id 4 G1M start 22528 rw 0 file(s), 1040384 bytes free
  -: SPARE       id 5 G1M start 24576 rw 0 file(s), 1040384 bytes free
```

Listing without a volume selects A. The next command lists B, where the
banner was saved:

```sh
node tools/tecvol.mjs dir card.img
node tools/tecvol.mjs dir card.img B
```

The complete A listing includes TED's project and session files:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
 0 BAZA.COM        13184
 0 BAZA.RTL        12032
 0 BOUNCE.BAS       5376
 0 DEMO.ASM        15360
 0 GLCD.SVC          896
 0 HELLO3.ASM       2176
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

These are the starter card's thirteen files and TED's two.

B contains the source, program and debug file:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
 0 BANNER.ASM        384
 0 BANNER.COM        128
 0 BANNER.DBG        384
```

An explicit user-area filter establishes which copy will be read. These
commands save B's user-0 listing before extracting BANNER in both forms:

```sh
node tools/tecvol.mjs dir card.img B --user 0 > recovered/B-user0.txt
cat recovered/B-user0.txt
node tools/tecvol.mjs get card.img B BANNER.ASM recovered/BANNER.REC --user 0
node tools/tecvol.mjs get card.img B BANNER.ASM recovered/BANNER.ASM --user 0 --text
wc -c recovered/BANNER.REC recovered/BANNER.ASM
```

The filtered listing repeats the three B entries above. The byte counts are:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
384 recovered/BANNER.REC
273 recovered/BANNER.ASM
657 total
```

`BANNER.REC` is the raw PC copy, not another file on B. Its three records
contain 286 bytes of source with CRLF endings followed by 98 `1Ah` bytes.
Text extraction stops at the first `1Ah` and changes the 13 CRLF pairs to LF.
The resulting 273-byte file matches the complete edited source:

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

A missing name produces an error rather than an empty recovered file. The
saved user-0 listing contains no `MISSING.ASM`. With that name absent and
`recovered/MISSING.ASM` still absent, the check is:

```sh
missing_status=0
node tools/tecvol.mjs get card.img B MISSING.ASM recovered/MISSING.ASM --user 0 > recovered/missing.stdout 2> recovered/missing.stderr || missing_status=$?
printf 'missing get exit: %s\n' "$missing_status"
cat recovered/missing.stderr
```

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
missing get exit: 1
tecvol: 0/MISSING.ASM not found
```

The command produces no standard output and creates no `MISSING.ASM` on the
PC. Listing and both extractions also leave the image unchanged. Comparing
the working copy with the saved card after the missing-file check again
completed without a difference:

```sh
cmp saved-banner-card.img card.img
```

The original image remains available alongside the working copy and both
recovered files. This host-image example does not establish a physical-card
read or write.

## The container and its volumes

The card holds programs, resident services, `STARTUP.CMD` and your files. Each
drive uses a volume, an ordinary CP/M disk of a fixed size. CP/M 2.2 addresses
at most 8 MiB on a drive. Most CP/M machines used floppy disks of a few hundred
KiB while an SD card can hold many volumes.

The container records where those volumes are. Its first 512-byte block
holds a header and the first volume descriptors. A descriptor gives a
volume's number, label of up to 11 characters, geometry, size, starting block
and default drive, if any. Further descriptors can occupy blocks after the
header. A container holds up to 127 volumes, with at most four assigned to
drives A to D at a time.

`info` prints the container layout and each volume's directory totals. For
the starter image it prints:

```sh
node tools/tecvol.mjs info dist/starter.img
```

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
container: format 1.1, 26624 blocks (13631488 bytes), 5 volume(s), 4 drive(s) wanted
  A: SYSTEM      id 1 G1M start 2048 rw 13 file(s), 937984 bytes free
  B: WORK        id 2 G8M start 4096 rw 0 file(s), 8372224 bytes free
  C: PROJECTS    id 3 G1M start 20480 rw 0 file(s), 1040384 bytes free
  -: GAMES       id 4 G1M start 22528 rw 0 file(s), 1040384 bytes free
  -: SPARE       id 5 G1M start 24576 rw 0 file(s), 1040384 bytes free
```

The container occupies 26,624 blocks or 13 MiB. SYSTEM begins at block
2,048 and occupies 1 MiB. WORK starts at 4,096 and occupies 8 MiB;
PROJECTS, GAMES and SPARE each occupy another 1 MiB. Each volume begins
on a multiple of 2,048 blocks, the default alignment. The header requests
four equal drive slots, including the initially empty D drive.

Each volume line gives its drive, label, number (`id`), geometry and first
block. `rw` means writable and `ro` means read-only. The remaining fields
count files and free bytes from the directory. Write-behind follows the
logged drive; the card does not mark a volume for it.

Cold boot validates the header's name, version and checksum and the volume
descriptors. A failed check leaves no drive mounted and stops at the
diagnostic prompt. [Chapter 28](28-diagnose-the-machine.md)
explains that prompt and [Appendix D](appendix-d-error-messages.md) lists
the codes. [Appendix E](appendix-e-container-format.md) gives every field.

## Record sizes and allocated space

A geometry specifies the size and directory layout of a volume:

| Geometry | Size | Allocation block | Directory entries |
| --- | --- | --- | --- |
| G1M | 1 MiB | 2 KiB | 256 |
| G8M | 8 MiB | 4 KiB | 512 |

CP/M reads and writes 128-byte records. Four records fit a 512-byte card block.
Space is allocated to files in larger allocation blocks so a file with any data
occupies at least 2 KiB on G1M or 4 KiB on G8M. The one-record `STARTUP.CMD`
therefore occupies 4 KiB on WORK even though its recorded length is only 128
bytes.

One directory entry describes up to 16 KiB on G1M or 32 KiB on G8M.
A larger file needs further entries. The directory occupies the first
allocation blocks, 8 KiB on G1M or 16 KiB on G8M. An empty G8M volume
therefore has 8,372,224 bytes free, 16 KiB less than 8 MiB.

The volume payload is an ordinary CP/M 2.2 directory and data area. A CP/M
disk tool such as cpmtools can read a volume copied out of the image when
given its geometry parameters. Appendix E lists those parameters.

## Replacing files

`put` copies a PC file onto a volume. The PC basename becomes the CP/M name
in capitals unless an additional name follows the PC path. `--text` converts
line endings to carriage return and line feed, appends `^Z` and pads the
last record with `^Z`. Binary padding is zero. These are file conversions,
not a way to preserve a PC file's original byte length in a CP/M directory.

A text file put without `--text` therefore ends in zero bytes, not `^Z`.
The starter card's TED (Thorium `a2fe556`) takes a run
of `00h` that fills the rest of the last record as the end of the file, so
such a file opens without an error. A byte that TED rejects elsewhere stops
it at the prompt with `EDIT error 03` and the byte's line and column, as in
`EDIT error 03 L3 C5` (TEC-OS b3134cf `docs/compatibility.md`, Thorium
a2fe556 `README.md`). An older TED, Thorium `967678c`, rejects that padding and stops with error 03 without a line or
column.

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

`create` makes a card of your own volumes, empty. This example makes
`my.img`, with SYSTEM and WORK assigned to A and B and GAMES and SPARE
initially unassigned. Each `--volume` gives the geometry, label and optional
drive separated by colons. `:ro` after the drive makes a volume read-only.
`--drives 4` reserves usable slots for all four drives at cold boot,
including the two initially empty ones:

```sh
node tools/tecvol.mjs create my.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G8M:GAMES --volume G1M:SPARE --drives 4
```

`create` stops if the image already exists. Every card needs a volume on A.
Two volumes cannot share a drive or a label. `--drives` takes a whole number
from 1 to 4. `--align` replaces the default 2,048-block alignment with a
positive whole number up to 16,777,215 that is a multiple of 8. An invalid
value, or a flag it does not know such as `:wb`, stops creation before an
image is written. No volume is marked written behind: TEC-OS writes behind
the drive you are on, whatever the card says
([Chapter 19](19-cache-and-persistence.md)).

The preparation uses the matching media's `dist/files/SHELL.SVC` and
`dist/files/TAS.COM`. Its other inputs are a startup file that loads the
shell, so the card has `CD`, and `hello.txt`, containing the line
`Hello from the PC.` followed by a line feed:

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

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
```text
 0 SHELL.SVC        3712
 0 STARTUP.CMD       128
```

After those puts, `node tools/tecvol.mjs info my.img` prints this:

<!-- TEC-OS 46cf3f1: Host-tool output; exact raw receipts in Origo book-recovery-host. -->
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

A recipe is a JSON description of a whole card. It lists the volumes and
component files with their byte counts and SHA-256 hashes. `recipe` fetches
each file from a URL or a path relative to the recipe's directory. It checks
both size and hash before placing the file in the image. A mismatch stops
the build. The same recipe with the same matching inputs produces the same
image bytes.

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

<!-- TEC-OS 46cf3f1: Source-derived SHELL.SVC object from the generated starter recipe. -->
```json
{
  "name": "SHELL.SVC",
  "url": "files/SHELL.SVC",
  "drive": "A",
  "bytes": 3660,
  "sha256": "5beea5051f93853f43ac54143665f741a19db6ddba873fe0a2c8834aab31c4c4"
}
```

The byte count and hash identify this build's binary. They are not values
to copy onto a different build's file. The actual recipe accompanying a
prepared media set records its own component identities.

A volume declared read-only by `create` stays empty because `put` cannot
write to it. A recipe can populate a protected volume: it writes the files
first and applies `"readOnly": true` last. The protection then belongs to
the whole volume, independently of each file's attributes.

The browser's New starter card uses the same `starter.recipe.json`, so the
page's card and `dist/starter.img` are one card. Its thirteen files on A
include the shell `SHELL.SVC`, the demo's source `DEMO.ASM`, the BASIC game
`BOUNCE.BAS`, MON3.SVC and the source-only HELLO3.ASM example,
at recipe revision 14. Media preparation no longer writes a separate page
recipe (TEC-OS b3134cf `tools/media.mjs`, `web/build.mjs`). `TAS DEMO`
builds DEMO.COM on the card. The page uses the same size and SHA-256
checks.

## A protection example

The following fixture separates volume protection from a file
attribute. It uses prepared media files and an existing `build/` directory.
The commands make writable WORK on B with a read-only `STARTUP.CMD` and
an empty read-only ARCHIVE volume on C:

```sh
node tools/tecvol.mjs create build/errs.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G1M:ARCHIVE:C:ro
node tools/tecvol.mjs put build/errs.img B dist/files/STARTUP.CMD --ro
```

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card build/errs.img '@start SAVE 1 C:X.COM' '@key x' '@start ERA B:STARTUP.CMD' '@key x' 'DIR B:'. Complete captured console transcript. -->
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

`install` writes an image to a device from block 0. It requires `--yes`:

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

<!-- TEC-OS 46cf3f1: node tools/capture.mjs --card short.img '@start DIR B:' '@key x'. Complete captured console transcript. -->
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
