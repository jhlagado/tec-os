# 4. Cards and volumes

Checked against TEC-OS 98c6416, with the starter card's `EDIT.COM` from Edit
845d062, whose copy on the card has the SHA-256
`ed88337e6dfa2626dd37a225a0ec09332f4927a0bde62114bbf8661d2d0fdc78`.

TEC-OS reads everything but its own code from one SD card: the programs it
runs, its drivers, its startup file and your own files. This chapter
describes how the card is laid out, in a container of volumes, and how you
build and change a card on a PC with `tecvol`. It then describes how TEC-OS
uses the card: putting its volumes on drives with `MOUNT`, what each drive
costs in memory, the block cache through which every drive reads the card,
what a reset keeps, and how a card is written from a PC and recovered after
a power cut.

## The container and its volumes

A CP/M 2.2 disk is small: CP/M addresses at most 8 MiB on one drive, and
most CP/M machines had floppy disks of a few hundred KiB. An SD card holds
thousands of times that. TEC-OS divides the card into volumes, each one an
ordinary CP/M disk of fixed size, and holds them in a container: a header in
the card's first 512-byte block, followed by the volumes. A volume has a
label of up to 11 characters, a number that identifies it in the container,
a size, and the drive TEC-OS puts it on at cold boot, if any. The header
holds the description of each volume, its descriptor, with the block where
the volume starts.

`tecvol`, the card tool in the repository's `tools/` directory, works on an
image of a card, a file on the PC holding the card's blocks in order. Its
`info` command prints the container and its volumes. For the starter card it
prints this:

```sh
node tools/tecvol.mjs info dist/starter.img
```

```text
container: format 1.0, 20480 blocks (10485760 bytes), 2 volume(s)
  A: SYSTEM      id 1 G1M start 2048 rw 12 file(s), 1009664 bytes free
  B: WORK        id 2 G8M start 4096 rw wb 0 file(s), 8372224 bytes free
```

The container is 20,480 blocks, 10 MiB. `SYSTEM` starts at block 2,048, 1
MiB into the card, and is 1 MiB long; `WORK` starts at block 4,096 and is 8
MiB long. `tecvol` starts each volume on a multiple of 2,048 blocks by
default, a boundary at which SD cards commonly erase, so the 1 MiB below
`SYSTEM` holds only the header. Each line gives the volume's drive, its
label, its number (`id`), its size, its first block, whether it can be
written (`rw`) or not (`ro`), and `wb` if it is written behind, which the
section on the block cache explains. The rest of the line counts the files
and the free space, in bytes, as `tecvol` reads them from the volume's
directory.

A container holds up to 127 volumes, and up to four of them are on drives at
a time, as drives A to D. The header's format number, 1.0 or 1.1, sets how
many: a 1.0 container holds up to 8 volumes, and a container of more than 8
is format 1.1, which continues the table of descriptors into blocks 1 to 7.
Format 1.1 also has a field for the number of drives the card is to have,
which the section on memory explains. Appendix E gives the header and the
descriptor byte by byte.

Before it mounts anything, cold boot checks the header: its name, its
version, its checksum and each descriptor. A card that fails any check
mounts nothing, and cold boot stops at the diagnostic prompt with the code
of the check, as Chapter 1 showed; Appendix D lists the codes.

## The two geometries

Every volume has one of two geometries, the CP/M disk parameters that set
its size and the layout of its directory:

| Geometry | Size | Allocation block | Directory entries |
| --- | --- | --- | --- |
| G1M | 1 MiB | 2 KiB | 256 |
| G8M | 8 MiB | 4 KiB | 512 |

CP/M gives space to a file in allocation blocks, so the smallest file takes
2 KiB on a G1M volume and 4 KiB on a G8M volume. A directory entry describes
up to 16 KiB of a file on a G1M volume and 32 KiB on a G8M volume, and a
larger file takes more than one. The directory is at the start of the
volume, in its first allocation blocks: 8 KiB on G1M and 16 KiB on G8M,
which is why an empty G8M volume has 8,372,224 bytes free, 16 KiB less than
8 MiB. Both geometries have 128-byte records, the unit in which CP/M reads
and writes, four of them to a 512-byte block of the card.

A volume's contents are an ordinary CP/M 2.2 directory and data area, so a
PC tool that reads CP/M disks, such as cpmtools, reads a volume copied out
of the image, given the geometry's parameters. Appendix E lists them.

## Building a card with tecvol

`tecvol create` makes a new image with empty volumes. Each `--volume` gives
one volume as its geometry, its label and, if it is to be on one, its drive,
separated by colons; `:ro` after the drive makes the volume read-only, and
`:wb` makes it written behind. One volume at most is written behind, and
never a read-only one. This card has four volumes, two of them on no drive,
and `--drives 4` gives it four drives, which makes it format 1.1:

```sh
node tools/tecvol.mjs create my.img --volume G1M:SYSTEM:A --volume G8M:WORK:B:wb --volume G8M:GAMES --volume G1M:SPARE --drives 4
```

`create` fails if the image exists already. A card must have a volume on
drive A, and no two volumes on one drive.

`tecvol put` copies a file from the PC onto a volume, named by its drive
letter or its label, and `tecvol dir` lists a volume. A PC's file name
becomes the CP/M name in capitals, and a fourth argument gives another name.
`--text` turns each line feed into a carriage return and line feed and ends
the file with `^Z`, CP/M's end of a text file, which is the form in which
CP/M programs and `TYPE` read text. These commands put two programs on
`SYSTEM`, one on `GAMES` and a text file, `hello.txt`, holding the line
`Hello from the PC.`, on `SPARE`:

```sh
node tools/tecvol.mjs put my.img A dist/files/VOLS.COM
node tools/tecvol.mjs put my.img A dist/files/MOUNT.COM
node tools/tecvol.mjs put my.img GAMES dist/files/TERM.COM
node tools/tecvol.mjs put my.img SPARE hello.txt --text
node tools/tecvol.mjs dir my.img
```

The last of them lists drive A, the default, with each file's user area and
its size in bytes:

```text
 0 MOUNT.COM         512
 0 VOLS.COM          384
```

The sizes are whole records of 128 bytes: `VOLS.COM` is 266 bytes on the PC
and takes three records. CP/M records a file's length only in records, and
`tecvol get`, which copies a file back to the PC, gives back all three. With
`--text`, `get` stops at the first `^Z` and turns each carriage return and
line feed back into a line feed. `tecvol era` erases a file. `put`, `get`
and `era` work in user area 0 unless `--user N` names another, `dir` lists
every user area unless `--user N` names one, and `put` takes `--ro` and
`--sys` to set the file's read-only and system attributes.

`put` writes to a volume only if the volume can be written, so a read-only
volume made by `create` stays empty. A read-only volume with files on it
comes from a recipe, which the next section describes.

`tecvol` never edits an image in place. It writes the changed image to a new
file beside the old one, checks it as a container, and renames it over the
old one, so an interrupted change leaves the old image whole. `tecvol info`
shows the result:

```text
container: format 1.1, 38912 blocks (19922944 bytes), 4 volume(s), 4 drive(s) wanted
  A: SYSTEM      id 1 G1M start 2048 rw 2 file(s), 1036288 bytes free
  B: WORK        id 2 G8M start 4096 rw wb 0 file(s), 8372224 bytes free
  -: GAMES       id 3 G8M start 20480 rw 1 file(s), 8368128 bytes free
  -: SPARE       id 4 G1M start 36864 rw 1 file(s), 1038336 bytes free
```

`GAMES` and `SPARE` have `-` for their drive: TEC-OS puts them on no drive
at cold boot. `tecvol verify` prints the same lines and also checks each
volume's directory, as the last section of this chapter describes.

## Recipes and the starter card

A recipe is a JSON file that describes a whole card: its volumes, and each
file to put on them with its size and SHA-256. `tecvol recipe` builds the
image from it, fetching each file from a path relative to the recipe's
directory or from a URL, and stops if a file's size or SHA-256 differs from
the recipe's. The starter card is built from `dist/starter.recipe.json`,
which `npm run media` writes, and the same recipe builds the same image byte
for byte:

```sh
node tools/tecvol.mjs recipe dist/starter.recipe.json mystarter.img
```

Its volumes, written here one to a line, are these:

```json
"volumes": [
  { "geometry": "G1M", "label": "SYSTEM", "mount": "A" },
  { "geometry": "G8M", "label": "WORK", "mount": "B", "writeBehind": true }
]
```

and each file has an entry such as this one:

```json
{
  "name": "VOLS.COM",
  "url": "files/VOLS.COM",
  "drive": "A",
  "bytes": 266,
  "sha256": "d2914530cdf5ae7e8e71f30adc623c4b0728551e7b8ba511dd6734436e5f1432"
}
```

A volume in a recipe can have `"readOnly": true`. `tecvol recipe` writes
every file first and sets the read-only flags last, so a recipe is the way
to make a read-only volume that holds files. The web page's "New starter
card" builds its card from the same recipe and checks the same SHA-256s.

## Drives, VOLS and MOUNT

A drive is the letter through which programs reach a volume. Cold boot puts
each volume on the drive its descriptor names, and prints the drives that
have one. On `my.img` the boot prints this, and there is no startup file on
the card, so the prompt follows at once:

<!-- node book/capture.mjs --card my.img -->
```text
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
B: WORK       

A>
```

Two programs from the starter card, which `my.img` has too, work with the
volumes while TEC-OS runs. `VOLS` lists every volume in the container with
its index, its label, its geometry and the drive it is on, and `MOUNT` puts
a volume on a drive, by label or by the index `VOLS` prints:

<!-- node book/capture.mjs --card my.img VOLS "MOUNT C: GAMES" "MOUNT D: 3" VOLS "DIR C:" "TYPE D:HELLO.TXT" "MOUNT C: SPARE" -->
```text
A>VOLS
00 SYSTEM      G1M A:
01 WORK        G8M B:
02 GAMES       G8M
03 SPARE       G1M

A>MOUNT C: GAMES
C: GAMES      

A>MOUNT D: 3
D: SPARE      

A>VOLS
00 SYSTEM      G1M A:
01 WORK        G8M B:
02 GAMES       G8M C:
03 SPARE       G1M D:

A>DIR C:
TERM.COM    
1 file, 8172K free
A>TYPE D:HELLO.TXT
Hello from the PC.

A>MOUNT C: SPARE
Cannot mount: in use or too large

A>
```

The transcript leaves out the boot before the first `VOLS`. `MOUNT C: SPARE`
fails because `SPARE` is on drive D already, and a volume is on one drive at
most. `MOUNT B:`, with no volume, takes the volume off drive B, and `MOUNT`
alone prints how it is used. Drive A always has a volume: `MOUNT A:` prints
`Cannot unmount`, and a volume can be mounted on drive A only in place of
the one there.

`MOUNT` changes only TEC-OS's memory. The card's header still names the
drives it named before, and a power cycle puts the volumes back on them.
Before a drive's volume changes, TEC-OS writes to the card every change the
block cache holds, and the drive's next use reads its directory again.

A drive with no volume can't be selected. On the starter card, where drive C
has none, `C:` gives a BDOS error, and a key returns to the prompt on drive
A:

<!-- node book/capture.mjs "@start C:" "@key x" -->
```text
A>C:
Bdos Err On C: Select
A>
```

## Drives and their cost in memory

For each drive that has a volume, the BDOS keeps an allocation vector: one
bit for each allocation block of the volume, set when a file uses the block.
It is the map of the drive's free space, built from the directory when the
drive is first used, and it is how the BDOS finds a free block without
reading the directory. A G1M volume's vector is 64 bytes and a G8M volume's
256 bytes.

The vectors are in the memory just below the BDOS, and so they come out of
the memory programs have. Cold boot gives out the space in one of two ways.
A card in format 1.0, or one in format 1.1 whose header gives no number of
drives, gets a vector for each drive cold boot puts a volume on, sized for
that volume. The starter card's two drives take 64 and 256 bytes, the word
at `0006h` is `B806h`, and programs have 46,854 bytes. Drives C and D get no
vector, so on the starter card no volume can be mounted on them. A drive
keeps its vector when `MOUNT` empties it, and drive B's, of 256 bytes, can
take a G1M or a G8M volume:

<!-- node book/capture.mjs "MOUNT B:" "MOUNT C: WORK" "MOUNT B: WORK" -->
```text
A>MOUNT B:
Unmounted

A>MOUNT C: WORK
Cannot mount: in use or too large

A>MOUNT B: WORK
B: WORK       

A>
```

A drive A with a 64-byte vector can likewise take only a G1M volume.

A card in format 1.1 whose header gives N drives, as `tecvol create --drives
N` makes it, gets a 256-byte vector for each of drives A to the Nth, whether
a volume is on it at cold boot or not, so that any of those drives can take
any volume later. `my.img`'s header gives four, and its vectors take 1,024
bytes: the word at `0006h` is `B506h`, and programs have 46,086 bytes, 768
fewer than on the starter card. A drive past the Nth gets no vector, and a
card whose header puts a volume on such a drive fails the checks at cold
boot. Chapter 7 describes the memory programs have, and Chapter 13 the rest
of the map.

## The block cache and the volume written behind

TEC-OS keeps up to 30 blocks read from the card, 15 KiB, in EXPAND 1, the
half of the board's second RAM chip that is TEC-OS's own. Every drive's
reads go through this block cache: a block TEC-OS read before and still
holds is copied from memory, and only a block it doesn't hold is read from
the card. A block written to the card is also brought up to date in the
cache, so the cache never holds a stale copy.

On every volume but one, a write reaches the card before TEC-OS reports it
done: when a program writes a record, TEC-OS writes the record's whole block
to the card and waits until the card reports it accepted. The exception is
the one volume whose descriptor marks it written behind, `WORK` on the
starter card. Its writes go into the cache and stay there, and TEC-OS writes
them to the card later:

- when a program writes to the volume's directory, for instance by closing a
  file, TEC-OS first writes every data block the cache holds changed, and
  then the directory block;
- when every block in the cache holds changes and TEC-OS needs a block for
  something else;
- at every warm boot, so `^C` at the prompt, or the end of any program,
  writes everything;
- when `MOUNT` changes a drive.

Writing behind saves card writes when a program writes a file a record at a
time: the four records of a block reach the card in one write of the block,
and a block written many times between two flushes reaches the card once.
The order of the writes keeps the card's directory true to its data: TEC-OS
writes a directory block only after every changed data block the cache
holds, so the directory never names a block whose data isn't on the card.

When a changed block can't be written, it stays in the cache, and each warm
boot tries it again and prints `Write lost` while the write still fails. A
reset or a power cut discards it.

## What a reset keeps

A reset runs cold boot, and cold boot rebuilds TEC-OS's memory: the cache,
the drivers, the command history and the open files are all gone after it,
and so is any change in the cache that hadn't reached the card. The one
thing a reset can keep is the drives' volumes. If TEC-OS had reached a
prompt before the reset, and each volume on a drive is still on the card, at
the same place and of the same size and kind, the drives hold the same
volumes after the reset as before it:

<!-- node book/capture.mjs --card my.img "MOUNT C: GAMES" "MOUNT B:" "@reset" VOLS -->
```text
A>MOUNT C: GAMES
C: GAMES      

A>MOUNT B:
Unmounted

A>
TEC-OS 0.1 for TEC-1G
A: SYSTEM     
C: GAMES      

A>VOLS
00 SYSTEM      G1M A:
01 WORK        G8M
02 GAMES       G8M C:
03 SPARE       G1M

A>
```

The transcript leaves out the boot before the first `MOUNT`. If any of the
volumes doesn't match a descriptor on the card in the socket, the whole
choice is dropped and the drives get the volumes the header names, as after
a power cycle. Turning the board off always gives the header's drives, since
the choice is held only in RAM. Chapter 14 describes how cold boot tells a
reset from a power-on.

The changes in the cache are what a reset loses, so a `^C` at the prompt
before pressing reset, turning the board off or taking the card out puts
them all on the card.

## Putting an image on a card

`tecvol install` writes an image to a card from the PC, from the card's
first block:

```sh
node tools/tecvol.mjs install my.img /dev/rdiskN --yes
```

`/dev/rdiskN` stands for the card's device, which on a Mac is a name of that
form and on Linux one such as `/dev/sdb`. `install` overwrites the device
from block 0 and does nothing without `--yes`, so the device name needs
checking twice before the command runs. The card must be at least as large
as the container; TEC-OS can't read the card's size, and a volume that runs
past the end of a smaller card fails with a disk error when TEC-OS reaches
the missing blocks. The web page's "Open image" loads an image file from the
PC into the page's card, and "Download image" saves the page's card as one,
so the same image runs in the page and on a board.

TEC-OS and the PC must never write the same card at the same time, and a
card changed on a PC needs a reset when it goes back into the board. TEC-OS
starts the card only at cold boot, and across warm boots it keeps each
drive's allocation vector and the cache's copies of blocks. A card changed
on the PC doesn't match them, and a warm boot doesn't read the card again to
find out.

## After a power cut

CP/M writes a file's data blocks first and its directory entry after them,
and TEC-OS adds no journal. A file is safe on the card once it is closed. A
power cut or a reset can lose a file still being written, in one of these
ways:

- On a volume written through, a cut between the data and the directory
  leaves new data in blocks the directory doesn't name. The file reads back
  as it was before, and the blocks are free space again the next time the
  drive's allocation vector is built.
- On the volume written behind, every change since the last directory write,
  warm boot or `MOUNT` is still in the cache and is lost. A cut during a
  flush leaves some new data blocks that no directory entry names, as above,
  and never an entry naming a block whose data isn't there.
- A cut during the write of one block can leave that block with old, new or
  mixed contents. If the block is part of a directory, it holds 16 directory
  entries, and any of them can be damaged.

To recover a card after a cut, copy it to the PC first and work on the copy.
On Linux, `dd` copies the starter card's 20,480 blocks:

```sh
dd if=/dev/sdb of=card.img bs=512 count=20480
node tools/tecvol.mjs verify card.img
```

`tecvol verify` reads each volume's directory and reports the faults that
would make files share or lose blocks: a block that two files claim, a block
number past the end of the volume, two directory entries for the same part
of a file, an entry with a record count above 128, and an entry that names
more blocks than its records need. It exits with status 1 if it found a
problem. What it can read, `tecvol get` copies off, and a fresh image built
with `create` and `put`, or from a recipe, goes back on the card with
`install`.
