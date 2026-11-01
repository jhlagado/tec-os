# 21. PRL relocation

Checked against TEC-OS 98c6416.

A `.COM` file holds code assembled for one address, `0100h`, and runs only
there. Code that is to run at an address chosen when it is loaded has to carry
a list of the bytes that hold addresses, so that the loader can change them.
TEC-OS reads two files of that kind. A `.PRL` file is Digital Research's page
relocatable format, and the CCP runs one as a program at `0100h`. A `.DRV`
file is TEC-OS's own, and the driver loader places it in whole pages below the
BDOS. This chapter describes a `.PRL` file from the tool that makes it to the
jump to `0100h`, and then a `.DRV` file's relocation data from the tool to the
bytes in memory. Chapter 10 describes both files from a programmer's side, and
Chapter 20 the rest of a driver's load.

## Relocation by pages

Both formats move code by whole pages of 256 bytes. When code assembled for
one page is placed some number of pages higher, the low byte of every address
in it stays the same, and the high byte rises by that number. A loader
therefore needs only the positions of the high bytes of addresses, and it adds
the same number to each of them.

The tools in the repository find those bytes by assembling the source twice.
`assembleAt` in `tools/lib/prl.mjs:12` assembles a copy of the source with its
`ORG $0100` line changed to another origin, and `makePrl` and `makeDrv` both
assemble at `0000h` and at `0100h`. A byte that is the same in the two
assemblies holds no address of the program's own, and is left alone. A byte
that is one greater in the second assembly is the high byte of an address. Any
other difference is an error, reported as `byte N is not relocatable`
(`tools/lib/prl.mjs:35`, `tools/lib/drv.mjs:75`): it comes from an expression
the page rule can't follow, such as half an address or an address's low byte,
which differ between the two assemblies by something other than one.

An absolute address outside the program, such as `0005h`, is the same in both
assemblies and is never marked. That is how a program's `CALL 0005h` stays a
call to the BDOS wherever the code is put.

## The PRL file

`makePrl` in `tools/lib/prl.mjs:27` writes a PRL file in three parts:

- a header of 256 bytes, all zero except the code's length `n` as a word at
  offset 1 (`tools/lib/prl.mjs:39`);
- the `n` bytes of code assembled for `0100h` (`tools/lib/prl.mjs:40`);
- a bitmap of `n / 8` bytes, rounded up, with one bit for each byte of code,
  the most significant bit of each byte first, set for each byte that is the
  high byte of an address (`tools/lib/prl.mjs:32` to `37`).

The test program `test/programs/say.asm` is a small example. It prints `PRL`
through BDOS function 9 and returns:

```asm
BDOS    EQU     $0005

        ORG     $0100
        LD      DE,MSG
        LD      C,9
        CALL    BDOS
        RET
MSG:    DB      "PRL$"
```

From a clone of the repository with `npm run build` done, one Node.js command
makes its PRL file, and `od` shows it:

```sh
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { makePrl } from "./tools/lib/prl.mjs";
writeFileSync("build/SAY.PRL", await makePrl("test/programs/say.asm", "build/prl"));
'
od -A x -t x1 build/SAY.PRL
```

```text
000000 00 0d 00 00 00 00 00 00 00 00 00 00 00 00 00 00
000010 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
*
000100 11 09 01 0e 09 cd 05 00 c9 50 52 4c 24 20 00
00010f
```

The header's word at offset 1 is `000Dh`: 13 bytes of code. The code at offset
`100h` begins `11 09 01`, `LD DE,0109h`, the address of `MSG` when the code is
at `0100h`. The two bytes after the code are the bitmap. Its first byte,
`20h`, has the third bit from the top set, marking byte 2 of the code, the
`01h` of `LD DE,0109h`. The `CALL 0005h` at bytes 5 to 7 is unmarked, and so
is everything else. The second byte of the bitmap covers bytes 8 to 15, and
since the code ends at byte 12, its last bits cover nothing.

Digital Research's header also has a word at offset 4, the extra data memory
the program needs beyond its code (`src/prl.asm:2`). `makePrl` leaves it 0,
and TEC-OS's loader doesn't read it.

## A PRL program at 0100h

The CCP opens `NAME.PRL` only after an open of `NAME.COM` has failed
(`src/cpm/ccp.asm:193` to `206`). If `NAME.COM` is on the drive but doesn't
load, because it is too large or a read fails, the command fails there, with
no search for the PRL (`src/cpm/ccp.asm:201`). With `SAY.PRL` copied to the
starter card, the command `SAY` runs it:

```sh
cp dist/starter.img build/say.img
node tools/tecvol.mjs put build/say.img A build/SAY.PRL
```

<!-- node book/capture.mjs --card build/say.img SAY -->
```text
A>SAY
PRL
A>
```

`LOADCOM` (`src/cpm/ccp.asm:271`) reads the file the same way for both types.
It opens the file, then reads it one record of 128 bytes at a time into memory
from `0100h` up (`src/cpm/ccp.asm:280` to `296`), and it stops at the page
given by the high byte of the word at `0006h`, the page holding the BDOS's
entry (`src/cpm/ccp.asm:281`). A file with more records than that is read one
record further into a scratch buffer, so that a file that exactly fills the
space is told apart from one that is too large (`src/cpm/ccp.asm:300` to
`312`). For a file that fits, `LOADCOM` stores the address just past its last
record in `LOADTOP` (`src/cpm/ccp.asm:319`, `src/ram.asm:226`). For a PRL file
the CCP then calls `PRLGO` (`src/cpm/ccp.asm:208`).

At that moment the whole file is in memory: the header at `0100h`, the code at
`0200h` and the bitmap after it. The code was assembled for `0100h`, one page
below where it lies, and the program runs at `0100h`. So `PRLGO` moves the
code down by one page and changes no byte of it (`src/prl.asm:5` and `6`, `54`
to `57`). `PRLGO` checks that the bitmap was read, and never reads it.

Before the move `PRLGO` checks the file in five steps, and returns carry set
for the first one that fails (`src/prl.asm:14` to `53`):

1. The records read must cover the whole header page: `LOADTOP` at `0200h` or
   above.
2. The code's length `n` must not be 0, since `LDIR` with a count of 0 copies
   65,536 bytes.
3. `0200h` plus `n` must not pass `FFFFh`.
4. The bitmap's end, `0200h` plus `n` plus `n / 8` rounded up, must not pass
   `FFFFh`, and must be at or below `LOADTOP`, so that the code and the bitmap
   were both in the records read. The rounding is done as `(n − 1) / 8 + 1`,
   which can't overflow as `n + 7` can (`src/prl.asm:29` to `36`).
5. The code's end at its destination, `0100h` plus `n`, must be at or below
   the start of the page holding the BDOS's entry.

A check that fails changes nothing, and the CCP prints the command with a
question mark, as for a command it can't find (`src/cpm/ccp.asm:208` and
`209`, `245` to `267`). A check that passes leads to the `LDIR`, and then the
CCP sets up page zero and jumps to `0100h` as it does for a `.COM` file
(`src/cpm/ccp.asm:210` to `216`).

The file is in memory whole before the code moves, so a PRL program has less
room than a `.COM` file. On the starter card with no driver installed the load
stops at `B800h`, and the file, from `0100h`, can be up to 46,848 bytes. Its
header takes 256 of them and its bitmap one byte for every eight of code,
which leaves room for at most 41,415 bytes of code. A PRL file of 41,416 bytes
of code ends with its command printed back with a question mark.

## The DRV file and its relocation data

A driver is the code that does move. The loader puts it in whole pages
immediately below the current top of the program area, at a page that depends
on the drivers already installed. `makeDrv` in `tools/lib/drv.mjs:87`
assembles the driver's source at `0000h` and at `0100h` and keeps the first
assembly, made for page 0, with the driver's 25-byte header at its start
(`tools/lib/drv.mjs:103` to `113`). Placed at page `p`, every address in it
needs `p` added to its high byte.

The fixups are found by the same comparison as a PRL's (`tools/lib/drv.mjs:71`
to `80`). A difference inside the 25-byte header is an error
(`tools/lib/drv.mjs:76`), since the relocation data can mark only bytes of the
image. Each fixup is counted from the end of the header, so fixup 0 is the
image's first byte.

The fixups are recorded as a list of gaps (`tools/lib/drv.mjs:37` to `47`).
Each byte of the list is the distance from one fixup to the next, the first
counted from the byte before the image. A gap of 255 or more is written as
bytes of 255, each moving 255 bytes on with nothing fixed, and then the rest.
Fixups at image bytes 2 and 9 become the list `3 7`, and one fixup at byte 600
becomes `255 255 91`: 601 bytes from the byte before the image, 255 and 255
and 91 more (`test/drv.test.mjs:323` and `324`). When the rest is 0, the last
byte of the list for that fixup is 0, a gap of 0 that fixes the byte the two
255s reached.

`PICO.DRV` on the starter card shows the list in a real file. Its header gives
the size of the header and image, `0515h` or 1,301 bytes, at offset 6, and the
length of the relocation data, `003Bh` or 59 bytes, at offset 10. It has no
dependencies, so the relocation data starts at offset 1,301, `515h`:

```sh
od -A x -t x1 -N 48 dist/files/PICO.DRV
od -A x -t x1 -j 1301 dist/files/PICO.DRV
```

```text
000000 44 03 00 01 5d 00 15 05 00 00 3b 00 00 00 00 43
000010 00 50 49 43 4f 20 20 20 20 79 01 84 01 8d 01 9c
000020 00 3f 01 68 01 77 00 50 18 e5 00 ed 00 fa 00 08
000030
000515 02 02 02 02 02 02 02 04 02 02 02 0d 13 07 03 23
000525 04 04 03 06 05 0b 12 03 03 03 06 13 1e 0c 0e 27
000535 08 08 06 04 03 03 04 06 03 03 0b 03 03 0a 03 07
000545 03 0a 03 0e 03 07 04 05 05 11 06
000550
```

The image starts at offset 25, `19h`, with the table of words the driver
passes to the ROM's terminal: `0179h`, `0184h`, `018Dh` and so on, addresses
in an image made for page 0. The list's first gap, 2, counts from offset 24 to
offset 26, the high byte of `0179h`, and each of the next six 2s reaches the
next word's high byte. The 59 bytes mark 59 fixups. A bitmap for the same
1,276 bytes of image would take 160.

## The loader's relocation pass

`DRVLOAD` (`src/drv.asm:57`) works on the file where `LOADCOM` read it, at
`0100h`, and relocates it there before it moves it. It first checks the magic,
`44h` and format 3 (`src/drv.asm:11`, `62` to `65`), and that the header and
image lie within the records read (`src/drv.asm:66` to `69`).

The page is chosen from the size. The loader adds the extra memory named in
the header, the word at offset 8, to the size of the header and image,
subtracts one and takes the high byte (`src/drv.asm:76` to `79`). The driver's
page is the current top's page, less one, less that high byte
(`src/drv.asm:80` to `82`). `PZTOP` holds the current top, the word that warm
boot puts at `0006h` (`src/ram.asm:224`). A driver larger than the space below
the top fails the load (`src/drv.asm:83`), and so does a page below `80h`
(`src/drv.asm:84` and `85`). The page goes into `PRLDL` (`src/drv.asm:86`,
`src/ram.asm:228`). For `PICO.DRV` on the starter card, the top is `B806h`,
and 1,301 bytes less one is `0514h`, so the page is `B7h − 05h`, `B2h`.

The relocation data follows the image and the dependencies, and it must lie
within the records read too (`src/drv.asm:110` to `113`). The pass is at
`src/drv.asm:133` to `161`. `HL` starts at `0118h`, the file's offset 24, the
byte before the image (`src/drv.asm:136`), and `BC` counts the bytes of the
list. For each byte, the loader:

1. adds the gap to `HL` (`src/drv.asm:141` to `146`);
2. checks that `HL` is still inside the header and image, below `0100h` plus
   the size at offset 6, and fails the load if not (`src/drv.asm:148` to
   `155`);
3. if the gap was 255, goes on to the next byte with nothing fixed
   (`src/drv.asm:147`, `156` and `157`);
4. otherwise adds `PRLDL` to the byte at `HL` (`src/drv.asm:158` to `160`).

The check in step 2 is made for a gap of 255 too, so a list can't step past
the image even with nothing fixed. A failure here leaves the file at `0100h`
partly relocated, and nothing else changed: the driver's pages, `0006h` and
`PZTOP` are as they were. The CCP reports it with the command's name and a
question mark.

When the list is used up, the loader writes its own fields into the header
(`src/drv.asm:163` to `171`). Offsets 0 to 2 take the registry's head and the
lowest driver's page from before this load, and offset 6 takes a `JP` to the
old top, written over the size that the pass needed until then. Then one
`LDIR` moves the header and image together to the chosen page, and `0006h`
becomes that page's `xx06h`, where the `JP` now is (`src/drv.asm:172` to
`179`).

On the web page's board the startup file installs `PICO.DRV` at `B200h`. After
the move the image's table there reads `B379h`, `B384h`, `B38Dh`, each high
byte raised by `B2h`. Offset 6 holds `JP B806h`, a jump to the BDOS entry that
was the top before the driver, and offsets 12 to 14 hold `08h`, `0Ch` and
`06h`, the room left on each of the three stacks, which the loader wrote over
the driver's declared use (`src/drv.asm:114` to `130`). The word at `0006h` is
`B206h`, and `DRIVERS` lists the driver with its pages:

<!-- node book/capture.mjs --board pico DRIVERS -->
```text
A>DRIVERS
PICO 6
A>
```

`DRIVERS` prints each page count as the page above the driver, the high byte
of the `JP`'s address at offset 8, less the driver's own page
(`src/drv.asm:314` to `319`). That byte is the old top's page, `B8h`, so the
count includes the part of the last page the driver doesn't fill: `PICO.DRV`'s
1,301 bytes take six pages, 1,536 bytes of the program area.
