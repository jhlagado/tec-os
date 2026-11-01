# Appendix F. `tecvol`

Checked against TEC-OS 98c6416, with the starter card's `EDIT.COM` from Edit
845d062, whose card copy has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

`tecvol` is the repository's tool for TEC-OS cards on a PC. It makes a card
image, lists and checks one, copies files to and from its volumes, builds a
card from a recipe and writes an image to a card. It runs with Node.js from a
clone of the repository, as `node tools/tecvol.mjs`, and `package.json` also
names it as the command `tecvol` (`package.json:11-13`). This appendix lists
its nine commands with their options, and each with an example. Appendix E
describes the container the commands work on.

## Common rules

The commands and their arguments, as the comment at the top of
`tools/tecvol.mjs` gives them (`tools/tecvol.mjs:4-15`):

```text
tecvol create IMAGE --volume G1M:SYSTEM:A [--volume G8M:WORK:B:ro] [--align N] [--drives N]
tecvol info IMAGE
tecvol verify IMAGE
tecvol dir IMAGE [DRIVE] [--user N]
tecvol put IMAGE DRIVE FILE [CPMNAME] [--user N] [--text] [--ro] [--sys]
tecvol get IMAGE DRIVE CPMNAME [OUTFILE] [--user N] [--text]
tecvol era IMAGE DRIVE CPMNAME [--user N]
tecvol recipe RECIPE.json IMAGE
tecvol install IMAGE DEVICE --yes
```

The options may come anywhere after the command, and an unknown option is an
error (`tools/tecvol.mjs:33-50`). Every command but `create` and `recipe`
opens an existing image and checks it as a container first, with the checks
Appendix E lists; an image that fails is not used (`tools/tecvol.mjs:60-63`).
A command that changes an image writes the result to a temporary file beside
it, checks that file as a container, and only then renames it over the image,
so a failure leaves the image as it was (`tools/tecvol.mjs:17-19`,
`tools/tecvol.mjs:52-58`).

`DRIVE` names a volume by its drive letter, with or without a colon, by its
label or by its id, tried in that order (`tools/lib/container.mjs:198-206`). A
volume on no drive is reached by its label or id. `--user N` selects user area
`N`, 0 to 15; without it `put`, `get` and `era` use user area 0, and `dir`
lists every user area (`tools/tecvol.mjs:94`, `tools/tecvol.mjs:123`).

A mistake in the command line prints the reason, then a line of usage, and
ends with exit status 2. Any other failure, such as a bad container, a full
volume or a missing file, prints `tecvol: ` and the reason, and ends with exit
status 1 (`tools/tecvol.mjs:27-31`, `tools/tecvol.mjs:179-184`).

`tecvol` and TEC-OS must never change the same card at the same time
(`tools/tecvol.mjs:18-19`). TEC-OS holds each drive's map of free space in
memory, and a card changed on the PC is no longer the card the map describes.
Change a card on the PC only after a `^C` at the prompt and with the board off
or the card out, and press reset after putting it back.

## create

`create IMAGE --volume SPEC ...` makes a new image
(`tools/tecvol.mjs:96-101`). It fails if the image already exists. Each
`--volume` adds one volume, in the order given, from a spec of the form
`GEOMETRY:LABEL:DRIVE[:ro][:wb]` (`tools/tecvol.mjs:72-76`):

- `GEOMETRY` is `G1M` or `G8M`;
- `LABEL` is up to 11 characters, put in capitals, and labels must differ;
- `DRIVE` is `A` to `D`, or empty for a volume on no drive;
- `:ro` makes the volume read-only, and `:wb` makes it written behind, for at
  most one volume and never with `:ro`.

`--align N` places each volume at a multiple of `N` blocks, which must be a
multiple of 8; it is 2,048, 1 MiB, by default (`tools/lib/container.mjs:12`,
`tools/lib/container.mjs:87-97`). `--drives N`, 1 to 4, records in the header
the number of drives TEC-OS is to set up at cold boot. With `--drives`, or
with more than 8 volumes, the card is format 1.1, and otherwise 1.0
(`tools/lib/container.mjs:77-78`). Every payload is filled with `E5h`, so each
volume starts as an empty CP/M disk. One volume must be on drive A.

This card has a system volume on A, a work volume written behind on B and a
read-only volume on no drive:

```sh
node tools/tecvol.mjs create build/my.img --volume G1M:SYSTEM:A --volume G8M:WORK:B:wb --volume G1M:ARCHIVE::ro
```

`create` prints nothing when it succeeds.

## info and verify

`info IMAGE` prints the container's format, its length and its number of
volumes, with the number of drives a 1.1 card gives, and then one line for
each volume: its drive or `-`, its label, its id, its geometry, its start
block, `rw` or `ro`, `wb` for a volume written behind, its number of files and
its free bytes (`tools/tecvol.mjs:102-119`). Under a volume whose CP/M
directory has a fault, such as a block given to two files, it prints a line
for each fault, starting `problem:` (`tools/lib/cpmfs.mjs:224-251`).

```sh
node tools/tecvol.mjs info build/my.img
```

```text
container: format 1.0, 22528 blocks (11534336 bytes), 3 volume(s)
  A: SYSTEM      id 1 G1M start 2048 rw 0 file(s), 1040384 bytes free
  B: WORK        id 2 G8M start 4096 rw wb 0 file(s), 8372224 bytes free
  -: ARCHIVE     id 3 G1M start 20480 ro 0 file(s), 1040384 bytes free
```

`WORK` ends at block 20,480, a multiple of 2,048, so the third volume starts
there. A G1M volume's free bytes are its 512 blocks less the directory's four,
at 2 KiB each.

`verify IMAGE` prints the same lines, and ends with exit status 1 if any
volume has a fault. A container that fails its own checks fails both commands
before they print anything. Chapter 24's card with a changed header byte
gives:

```sh
node tools/tecvol.mjs verify build/badsum.img
```

```text
tecvol: header checksum mismatch
```

## put

`put IMAGE DRIVE FILE [CPMNAME]` copies a file from the PC to a volume
(`tools/tecvol.mjs:128-136`). The name on the card is `CPMNAME`, or the PC
file's own name in capitals. It must be a CP/M name: up to 8 characters, then
optionally a full stop and up to 3 (`tools/lib/cpmfs.mjs:15-20`). A file of
the same name in the same user area is replaced. The copy fails if the volume
is read-only, or if its blocks or its directory entries run out, and then the
image is left as it was (`tools/lib/cpmfs.mjs:157-190`).

The file is stored in whole records of 128 bytes. A binary file's last record
is padded with zeros. With `--text`, each line end becomes CR LF, a `^Z` is
added at the end, and the last record is padded with `^Z`, as CP/M text files
are kept (`tools/lib/cpmfs.mjs:161-173`). `--ro` sets the file's read-only
attribute and `--sys` its system attribute. `--user N` puts it in user area
`N`.

```sh
printf 'hello\nworld\n' > build/hello.txt
node tools/tecvol.mjs put build/my.img A build/hello.txt --text
node tools/tecvol.mjs put build/my.img A dist/files/VOLS.COM
node tools/tecvol.mjs put build/my.img B dist/files/TERM.COM --user 3
```

A copy to the read-only volume fails:

```sh
node tools/tecvol.mjs put build/my.img ARCHIVE build/hello.txt
```

```text
tecvol: volume is read-only
```

## dir

`dir IMAGE [DRIVE]` lists a volume's files, drive A's by default, one line
each: the user area, the name and the size (`tools/tecvol.mjs:120-127`). The
size is in whole records, 128 bytes each, since CP/M records no size more
exact. `R/O` and `SYS` follow a file with those attributes.

```sh
node tools/tecvol.mjs dir build/my.img A
node tools/tecvol.mjs dir build/my.img B
```

```text
 0 HELLO.TXT         128
 0 VOLS.COM          384
 3 TERM.COM          128
```

`TERM.COM` is 95 bytes on the PC, and one record on the card.

## get

`get IMAGE DRIVE CPMNAME [OUTFILE]` copies a file from a volume to the PC,
into `OUTFILE`, or to the standard output with none
(`tools/tecvol.mjs:137-146`). Without `--text` the copy is every record,
padding included. With `--text` it stops at the first `^Z` and turns each CR
LF into a line feed (`tools/lib/cpmfs.mjs:123-142`).

```sh
node tools/tecvol.mjs get build/my.img A HELLO.TXT --text
```

```text
hello
world
```

## era

`era IMAGE DRIVE CPMNAME` erases a file from one user area, 0 or the one
`--user` gives (`tools/tecvol.mjs:147-154`). A name not found there is a
mistake in the command line, with exit status 2.

```sh
node tools/tecvol.mjs era build/my.img B TERM.COM
node tools/tecvol.mjs era build/my.img B TERM.COM --user 3
```

```text
tecvol: TERM.COM not found
usage: tecvol create|info|verify|dir|put|get|era|recipe|install ... (see tools/tecvol.mjs)
```

The first command searched user area 0, which has no `TERM.COM`; the second
erased the file from user area 3 and printed nothing.

## The card on the board

After those commands, the card boots with its two drives, and the text file
reads back with TEC-OS's `TYPE`:

<!-- node book/capture.mjs --card build/my.img DIR "TYPE HELLO.TXT" VOLS -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>DIR
HELLO.TXT    VOLS.COM    
2 files, 1012K free
A>TYPE HELLO.TXT
hello
world

A>VOLS
00 SYSTEM      G1M A:
01 WORK        G8M B:
02 ARCHIVE     G1M R/O

A>
```

The card has no `STARTUP.CMD`, so no lines follow the volumes before the first
prompt. `VOLS` lists all three volumes, `ARCHIVE` on no drive.

## recipe

`recipe RECIPE.json IMAGE` builds a card from a recipe, a JSON file that lists
the volumes and the files to put on them (`tools/tecvol.mjs:155-161`). `npm
run media` writes the starter card's recipe as `dist/starter.recipe.json` and
builds `dist/starter.img` from it (`tools/media.mjs:218-237`). A recipe has
the schema `tecos-file-recipe-v1`, a list of `volumes` in `create`'s terms (a
geometry, a label, a drive, and `readOnly` or `writeBehind`), and a list of
`components`, each with `files`. Each file has a name, a `url`, a drive, a
size in `bytes`, a `sha256` and optionally a user area
(`tools/lib/recipe.mjs:13-26`).

`tecvol` reads a file's `url` as a web address if it starts `http://` or
`https://`, and otherwise as a path from the recipe's own folder
(`tools/tecvol.mjs:78-88`). It checks each file's size and SHA-256 against the
recipe and stops at the first that differs. The read-only flags go on last,
after every file is written (`tools/lib/recipe.mjs:27-34`). The web page
builds its "New starter card" with the same function.

```sh
node tools/tecvol.mjs recipe dist/starter.recipe.json build/fresh.img
sha256sum build/fresh.img dist/starter.img
```

```text
2d77a418db8d0bdaba60f346605c58357c47f84bff88363606ffee20422c6710  build/fresh.img
2d77a418db8d0bdaba60f346605c58357c47f84bff88363606ffee20422c6710  dist/starter.img
```

The two images are the same to the byte, since a recipe gives the same card
from the same files every time.

## install

`install IMAGE DEVICE --yes` writes the image to a device, from its first
block (`tools/tecvol.mjs:162-173`). It checks the image as a container and
writes it whole, over whatever the device held; without `--yes` it stops with
a usage error:

```sh
node tools/tecvol.mjs install dist/starter.img /dev/rdiskN --yes
```

`/dev/rdiskN` stands for the card's raw device on a Mac; on Linux it is a
device such as `/dev/sdX`. Opening a device usually needs the PC's
administrator rights. `install` checks nothing about the device, so the device
name needs checking twice before the command runs: given the PC's own disk, it
overwrites that disk's first blocks.
