---
title: "F. `tecvol`"
parent: TEC-OS
nav_order: 106
nav_group: "Reference"
---

# Appendix F. `tecvol`

<!-- Checked against TEC-OS c4ec0f4950446f92b658643ee23b63e2c02bb33b (main),
     ROM SHA-256 a65b6e4523b5f7bab612810370ec13d4c0056deeab574acda80ef9a8e5d358d1.
     Unprefixed source citations use this revision. Explicit historical
     prefixes retain their stated revisions. Host-model capture recipes and
     raw output/hash receipts are retained in Origo
     studies/p3-tec-os/evidence/book-shell2/.
     The tool inputs are the pinned TAS host 3d16b30 and TED a2fe556;
     Baza is the qualified 50dc512 payload. Source-derived excerpts are
     labelled separately from console captures. -->

`tecvol` edits TEC-OS card images on a PC. It creates volumes, inspects their
files and directories, copies files and writes an image to a physical device.
Run it from a repository clone as `node tools/tecvol.mjs`. The package also
names the command `tecvol` (`package.json:11-13`). Chapter 6 gives the working
procedures and recovery precautions. Appendix E defines the container format.

## Common rules

The nine commands have these arguments (`tools/tecvol.mjs:4-15`):

```text
tecvol create IMAGE --volume G1M:SYSTEM:A [--volume G8M:WORK:B:ro] [--align N] [--drives N]
tecvol info IMAGE
tecvol verify IMAGE
tecvol dir IMAGE [DRIVE] [--user N]
tecvol put IMAGE DRIVE FILE [CPMNAME] [--user N] [--text] [--ro] [--sys] [--force]
tecvol get IMAGE DRIVE CPMNAME [OUTFILE] [--user N] [--text]
tecvol era IMAGE DRIVE CPMNAME [--user N] [--force]
tecvol recipe RECIPE.json IMAGE
tecvol install IMAGE DEVICE --yes
```

Options can appear anywhere after the command. An unknown `--` option is a
usage error. Argument parsing checks `--user`, `--align` and `--drives`
before opening or changing an image (`tools/tecvol.mjs:33-61`). Except for
`create` and `recipe`, commands open an existing image and validate its
container first. That validation is separate from the directory checks made
by `info` and `verify` (`tools/tecvol.mjs:71-80`, `tools/tecvol.mjs:107-195`).

`DRIVE` selects a volume by drive letter, with or without a colon, then by
label and finally by id. The first matching form wins. A label or id reaches
a volume that has no assigned drive (`tools/lib/container.mjs:194-201`).
There is no CCP program-search fallback in a host file operation.

`--user N` takes one or two decimal digits with a value from 0 to 15.
Without it `put`, `get` and `era` use area 0 while `dir` lists all areas.
A malformed user value stops before the image is opened
(`tools/tecvol.mjs:45-49`, `tools/tecvol.mjs:105`,
`tools/tecvol.mjs:140-172`).

Successful commands exit with status 0. A usage error prints its reason and
the usage line and exits with status 2. An absent file in `era` is a usage
error too. Other failures print `tecvol: ` and the reason and exit with
status 1. `verify` also returns 1 for reported directory problems
(`tools/tecvol.mjs:27-31`, `tools/tecvol.mjs:137`,
`tools/tecvol.mjs:171`, `tools/tecvol.mjs:199-204`).

Image replacement validates the changed bytes in memory, writes a temporary
file beside the image and renames that file over it. A failure before the
rename leaves the original image unchanged. It does not reread the temporary
file or explicitly synchronise it to durable storage. This is distinct from
`install` writing directly to a device (`tools/tecvol.mjs:63-69`).

Never change a card on the PC while TEC-OS is using it. At the board's command
prompt, a successful `^C` flush must finish before removal. `Write lost` means
that some changes were dropped. Reset after returning a PC-changed card because
TEC-OS's cached blocks and allocation maps otherwise describe its old contents.
Chapter 6 gives the copy-first procedure.

The examples below are runs with prepared `dist/` inputs
and an existing `build/` directory. Follow their order when constructing the
worked card. `build/my.img` is this appendix's separate fixture, not Chapter 5's
four-volume `my.img`. Its figures and hashes belong to this build's media and change with it.

## create

`create IMAGE --volume SPEC ...` makes an empty image and rejects an output
path that already exists (`tools/tecvol.mjs:107-112`). Each `--volume` adds
one descriptor in the given order:

| Part of `GEOMETRY:LABEL:DRIVE[:ro]` | Meaning |
| --- | --- |
| `GEOMETRY` | `G1M` or `G8M` |
| `LABEL` | Capitalised and limited to 11 characters. The resulting labels must differ |
| `DRIVE` | A–D or empty for a volume on no drive |
| `:ro` | Read-only volume |

Any other flag, `:wb` among them, is refused. No volume is marked written
behind: TEC-OS writes behind the drive you are on, and descriptor byte 15 is
reserved and written zero
([Appendix E](appendix-e-container-format.md#the-header))

`--align N` places volumes at multiples of N card blocks. The decimal value must
be from 1 to 16,777,215 and must also be a multiple of 8. The default is 2,048
blocks or 1 MiB. A value outside the decimal range gives a usage error. A value
inside it that is not a multiple of 8 fails container creation with
`alignment must be a multiple of 8 blocks` and status 1
(`tools/tecvol.mjs:33-37`, `tools/tecvol.mjs:50-51`,
`tools/lib/container.mjs:87-97`).

`--drives N` takes 1 to 4 and records the number of drive slots to reserve
at cold boot. Supplying it or requesting more than eight volumes selects
format 1.1. Otherwise creation uses 1.0. One volume must be assigned to A.
Each payload is filled with `E5h`, producing an empty CP/M directory and data
area (`tools/lib/container.mjs:78-122`).

This fixture has SYSTEM on A, WORK on B and a read-only ARCHIVE on no drive:

```sh
node tools/tecvol.mjs create build/my.img --volume G1M:SYSTEM:A --volume G8M:WORK:B --volume G1M:ARCHIVE::ro
```

Successful creation prints nothing.

## info and verify

`info IMAGE` prints the container and then every volume
(`tools/tecvol.mjs:113-138`):

```sh
node tools/tecvol.mjs info build/my.img
```

```text
container: format 1.0, 22528 blocks (11534336 bytes), 3 volume(s)
  A: SYSTEM      id 1 G1M start 2048 rw 0 file(s), 1040384 bytes free
  B: WORK        id 2 G8M start 4096 rw 0 file(s), 8372224 bytes free
  -: ARCHIVE     id 3 G1M start 20480 ro 0 file(s), 1040384 bytes free
```

The container line gives format, block/byte length and volume count. A
format-1.1 card gives its requested drive count when that field is nonzero. Each volume line gives
drive or `-`, label, id, geometry, start block, protection, file count and
free space. WORK ends at exclusive block 20,480, where ARCHIVE
starts. G1M's free space is its 512 allocation blocks less four directory
blocks, at 2 KiB each.

At the inspected source, directory faults are printed as `problem:` lines.
If duplicate allocations or a block beyond DSM prevent a free-space count,
the volume line says `free unknown` and later volumes are still listed.
These are source-derived reporting rules, not new output added to the
healthy-card example (`tools/tecvol.mjs:117-136`,
`tools/lib/cpmfs.mjs:78-89`, `tools/lib/cpmfs.mjs:241-267`).

`verify IMAGE` prints the same report and returns status 1 if any directory
problem was found. `info` does not turn those reported problems alone into
a failing status. A malformed container fails either command before its report.
This header-check example gives status 1, after `dd`'s own report on stderr:

```sh
cp dist/starter.img build/badsum.img
printf 'X' | dd of=build/badsum.img bs=1 seek=25 conv=notrunc
node tools/tecvol.mjs verify build/badsum.img
```

```text
tecvol: header checksum mismatch
```

## dir

`dir IMAGE [DRIVE]` lists A by default. Each line gives user area, filename and
record-rounded byte length. `R/O` and `SYS` mark file attributes
(`tools/tecvol.mjs:140-147`). CP/M records are 128 bytes so the listing includes
padding rather than a PC file's original byte length. The starter card's A
directory is:

```sh
node tools/tecvol.mjs dir dist/starter.img A
```

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
 0 TIMES.BAS         640
```

SHELL.SVC is 3,655 bytes in `dist/files` and occupies 29 records, 3,712
bytes, on the card. The fourteen files are those of `tools/media.mjs:209-240` and
`tools/lib/starter.mjs:10-22`, and STARTUP.CMD holds `SHELL.SVC` and
`GLCD.SVC` (`test/starter.test.mjs:48-81`).

## put

`put IMAGE DRIVE FILE [CPMNAME]` copies a PC file to the selected volume.
The card name is `CPMNAME` or the capitalised PC basename. The host validates
that name as an 8.3 spelling (`tools/tecvol.mjs:148-155`,
`tools/lib/cpmfs.mjs:15-20`).

A file of the same name in the same area is replaced unless its read-only
attribute blocks the operation. `--force` overrides that file attribute but
never a read-only volume. Insufficient data blocks or directory entries stop
the copy before the image is replaced (`tools/lib/cpmfs.mjs:180-206`).

Binary files are padded with zero bytes to complete their final record. `--text`
converts LF and CR LF endings to CR LF, appends `^Z` and pads with `^Z`. `--ro`
and `--sys` set the two file attributes and `--user N` selects the destination
area (`tools/lib/cpmfs.mjs:180-188`, `tools/lib/cpmfs.mjs:216-218`). These
commands make a text file and copy the prepared binaries:

```sh
printf 'hello\nworld\n' > build/hello.txt
printf 'SHELL.SVC\n' > build/startup.cmd
node tools/tecvol.mjs put build/my.img A build/hello.txt --text
node tools/tecvol.mjs put build/my.img A dist/files/SHELL.SVC
node tools/tecvol.mjs put build/my.img A build/startup.cmd --text
node tools/tecvol.mjs put build/my.img B dist/files/TAS.COM --user 3
```

Copying to the read-only volume fails without changing the image:

```sh
node tools/tecvol.mjs put build/my.img ARCHIVE build/hello.txt
```

```text
tecvol: volume is read-only
```

The invalid user value is rejected with status 2 before opening the image:

```sh
node tools/tecvol.mjs put build/my.img A build/hello.txt --user 1.5
```

```text
tecvol: --user "1.5": a user number 0 to 15
usage: tecvol create|info|verify|dir|put|get|era|recipe|install ... (see tools/tecvol.mjs)
```

## get

`get IMAGE DRIVE CPMNAME [OUTFILE]` extracts a file into OUTFILE or writes
its bytes to standard output when no output path is supplied. Without `--text`
it returns whole records, including padding. With it extraction stops at
the first `^Z` and converts CR LF to LF (`tools/tecvol.mjs:157-165`,
`tools/lib/cpmfs.mjs:128-150`).

Each directory entry supplies records only through its recorded extent/count.
Records not held by an entry remain zero, including holes from sparse random
writes. A block number above DSM is damaged metadata. Extraction then fails
with status 1 before writing an output file, with the filename, extent, entry
and block in the error (`tools/lib/cpmfs.mjs:128-150`).

```sh
node tools/tecvol.mjs get build/my.img A HELLO.TXT --text
```

```text
hello
world
```

## era

`era IMAGE DRIVE CPMNAME` erases the file in area 0 or the area given by
`--user`. An absent name gives usage status 2. A read-only file fails with
status 1 unless `--force` is supplied. The volume itself must be writable
(`tools/tecvol.mjs:167-173`, `tools/lib/cpmfs.mjs:157-173`).

```sh
node tools/tecvol.mjs era build/my.img B TAS.COM
node tools/tecvol.mjs era build/my.img B TAS.COM --user 3
```

```text
tecvol: TAS.COM not found
usage: tecvol create|info|verify|dir|put|get|era|recipe|install ... (see tools/tecvol.mjs)
```

The first command searches area 0, where TAS is absent. The second erases
its area-3 copy and prints nothing. The next sequence separately exercises
the file's read-only attribute:

```sh
node tools/tecvol.mjs put build/my.img B build/hello.txt NOTE.TXT --ro
node tools/tecvol.mjs put build/my.img B build/hello.txt NOTE.TXT
node tools/tecvol.mjs era build/my.img B NOTE.TXT
node tools/tecvol.mjs era build/my.img B NOTE.TXT --force
```

```text
tecvol: 0/NOTE.TXT is read-only
tecvol: 0/NOTE.TXT is read-only
```

The middle two operations fail without changing the image. The last erases
NOTE.TXT with `--force`.

## recipe

`recipe RECIPE.json IMAGE` constructs an image from the
`tecos-file-recipe-v1` JSON schema. A recipe lists volumes and components
separately. Volume entries give geometry, label, `mount` and optional
`readOnly`. A volume naming `writeBehind` is refused: write-behind follows
the logged drive. Components contain files. File entries give
name, URL/path, `drive`,
byte size, SHA-256 and optional user area (`tools/lib/recipe.mjs:14-26`).
Unlike `create`, this command can replace an existing output image
(`tools/tecvol.mjs:175-180`).

An `http://` or `https://` URL is fetched from that address. A relative
file path is resolved from the recipe's directory. Each fetched component
must match its size and SHA-256 before placement. Read-only volume flags
are applied after the files are written (`tools/tecvol.mjs:90-99`,
`tools/lib/recipe.mjs:14-44`). The web page uses the same recipe function
for New starter card.

`npm run media` prepares `dist/starter.recipe.json` and its image. That recipe, at revision 13, is the only one: the web page builds
the same card, and media removes a `dist/page.recipe.json` left by an older
build (`tools/media.mjs:242-266`, `278-281`). Chapter 27
describes that preparation. The rebuild produced these matching hashes:

```sh
node tools/tecvol.mjs recipe dist/starter.recipe.json build/book-fresh.img
sha256sum build/book-fresh.img dist/starter.img
```

```text
dd44f1c28c3b9296c6348e5723720dc0088f34d984028f4072e1785e36f3cebe  build/book-fresh.img
dd44f1c28c3b9296c6348e5723720dc0088f34d984028f4072e1785e36f3cebe  dist/starter.img
```

The image construction uses fixed placement, fill bytes and file contents.
With the same recipe and matching inputs its bytes do not depend on the PC's
clock. The printed hashes identify this recipe's result at `c4ec0f4`.

## install

`install IMAGE DEVICE --yes` validates the image as a container, opens the
device and writes from offset 0. Without `--yes` it gives a usage error
(`tools/tecvol.mjs:182-193`).

```sh
node tools/tecvol.mjs install dist/starter.img /dev/rdiskN --yes
```

`/dev/rdiskN` is a placeholder for the identified removable card's raw Mac
device. A Linux device may have a name such as `/dev/sdX`. Check its identity
and capacity and unmount its filesystems before writing. Opening it usually
requires administrator rights. `--yes` authorises the overwrite, not device
identification or a backup. The tool does not check whether the named device
is the intended card. Naming the PC's disk overwrites that disk instead.

This is a direct write, unlike temporary-file replacement. An interrupted
operation can leave a partial card. Chapter 6 gives the backup and physical card
transfer procedure.

## The worked card

Following the commands from create through era leaves HELLO, the shell and
its startup file on A.
The final directory is:

```sh
node tools/tecvol.mjs dir build/my.img A
```

```text
 0 HELLO.TXT         128
 0 SHELL.SVC        3712
 0 STARTUP.CMD       128
```

The same card's TEC-OS capture reads the text and lists all volumes:

<!-- TEC-OS c4ec0f4: node tools/capture.mjs --card build/my.img DIR 'TYPE HELLO.TXT' 'CD ?'. Boot rows included in this complete serial transcript. -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM
B: WORK

A>SHELL.SVC

A:SYSTEM>DIR

HELLO   .TXT     128
SHELL   .SVC    3712
STARTUP .CMD     128
3 files, 3968 bytes
1032192 free on A:SYSTEM
A:SYSTEM>TYPE HELLO.TXT
hello
world

A:SYSTEM>CD ?

SYSTEM      A:
WORK        B:
ARCHIVE
A:SYSTEM>
```

The startup file loads the shell, so the prompt shows the drive's volume and
DIR lists sizes. `CD ?` lists ARCHIVE too, even though it has no assigned
drive.
