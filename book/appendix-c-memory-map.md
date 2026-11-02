# Appendix C. Memory map

Checked against TEC-OS 08da4d6.

This appendix gives the addresses TEC-OS uses: the CPU's address space, the
ROM, page zero, the resident workspace at the top of EXPAND 0, EXPAND 1 and
the stacks. Chapter 13 explains the layout and Chapter 7 describes it from a
program's side. The figures are those of the debug80 build at 08da4d6, whose
ROM has the SHA-256
`524b9440f7bb628f519915a1601159eff824d9186596430da1a39d79536cd4b5`; the
build's four profile names give the same image. Where the figures depend on
the card they are those of the starter card, with a G1M volume on drive A and
a G8M volume on drive B, and no driver installed.

## Taking the figures from the build

`npm run media` writes the summary tables to `docs/memory-map.md` from the
build's census, `build/debug80/census.json` (`tools/media.mjs:78-177`,
`tools/media.mjs:238`). The address of any label is in the build's symbol
file, `build/debug80/tecos.d8.json`; this command prints those of the labels
named after it:

```sh
node -e '
const s = JSON.parse(require("fs").readFileSync("build/debug80/tecos.d8.json", "utf8")).symbols;
for (const n of process.argv.slice(1)) {
  const x = s.find((y) => y.name === n);
  console.log(n, (x.address ?? x.value).toString(16).toUpperCase() + "h");
}' CMDTXT PRGCODE CHPOS
```

```text
CMDTXT BD35h
PRGCODE BF57h
CHPOS BFE5h
```

Every address in the workspace tables below comes from that file. A change to
the source can move any of them, except the few the code fixes: page zero,
`BF00h` for the RAM BIOS table, the table at `C003h`, and EXPAND 1's cache,
cache table and history page.

## The CPU's address space

The Z80's 64 KiB are three windows:

| Addresses | Contents |
| --- | --- |
| `0000h–7FFFh` | MAIN 0, or MAIN 1 while bit 3 of the latch is set, on a board that has it |
| `8000h–BFFFh` | EXPAND 0, or EXPAND 1 while bit 2 of the latch is set |
| `C000h–FFFFh` | the ROM |

At reset the first 2 KiB of the ROM also appear at `0000h–07FFh`, until cold
boot sets bit 0 of the latch (`src/reset.asm:1-3`, `src/boot.asm:11-12`). With
MAIN 0 and EXPAND 0 in view, TEC-OS uses them in this way:

| Addresses | Contents |
| --- | --- |
| `0000h–00FFh` | page zero |
| `0100h–B805h` | the TPA, 46,854 bytes |
| `B806h–BFFFh` | the BDOS entry jump and the resident workspace, in EXPAND 0 |
| `C000h–FFFFh` | the ROM |

The latch is the system latch at port `FFh`, which TEC-OS writes from the copy
it keeps at `0040h` (`src/layout.asm:13-23`). Its value while TEC-OS runs is
`01h`: the copy of the ROM at `0000h` off, MAIN 0 and EXPAND 0 in view. It is
`81h` while the matrix keyboard's Caps Lock is on, which sets bit 7
(`src/console.asm:392-397`).

The TPA ends below the BDOS entry jump, whose address is in the word at
`0006h`. Cold boot places the jump below the allocation vectors of the card's
drives: it takes the lowest vector's address, subtracts 9 and sets the low
byte to 6 (`src/vol.asm:571-576`). A driver goes in whole pages below the jump
and lowers the word at `0006h` to its own jump, at offset 6 of its first page.

| Card | Vectors | BDOS entry | TPA |
| --- | ---: | --- | ---: |
| the starter card, G1M on A and G8M on B | 320 bytes | `B806h` | 46,854 bytes |
| four G8M volumes | 1,024 bytes | `B506h` | 46,086 bytes |

## The ROM

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `C000h–C002h` | 3 | the reset jump, `JP COLD` |
| `C003h–C017h` | 21 | the table of ROM services |
| `C018h–C33Ch` | 805 | the read-only data, `ROMDATA` to `ROMCODE` |
| `C33Dh–F982h` | 13,894 | the code |
| `F983h–FFFFh` | 1,661 | free |

Within the code, the CCP is at `D795h–E0C9h`, 2,357 bytes, and the BDOS at
`E0CAh–EFE0h`, 3,863 bytes, in the order `src/rom.asm` includes them
(`src/rom.asm:24-26`). The ROM's own copy of the BIOS jump table is in the
data, at `BIOSBAS`, and is never called: cold boot copies it to `BF00h`
(`src/data.asm:20-36`, `src/boot.asm:45-48`). The byte at `C01Dh` is a `RET`
(`src/data.asm:8-13`).

## Page zero

| Address | Contents |
| --- | --- |
| `0000h` | `JP BF03h`, warm boot through the RAM BIOS table |
| `0003h` | the IOBYTE; TEC-OS acts on its console field, bits 0 and 1 |
| `0004h` | the current drive in bits 0–3 and the user number in bits 4–7 |
| `0005h` | `JP` to the BDOS entry or the lowest driver; the word at `0006h` is the top of the TPA |
| `0008h–0037h` | restart vectors 1 to 6: each a `RET` after seven zeros, unless it holds a jump into the ROM |
| `0038h` | `EI`, `RETI`, for restart 7 and the interrupt of mode 1 |
| `0040h–004Fh` | TEC-OS's state, below |
| `005Ch` | the default FCB |
| `006Ch` | the second FCB, overlapping the first's last 20 bytes |
| `0080h–00FFh` | the command tail and the default DMA record |

Cold boot clears page zero, and `PZINIT` writes it at cold boot and at every
warm boot, leaving the IOBYTE and the drive and user byte as they are
(`src/boot.asm:15-21`, `src/boot.asm:215-265`). The CCP writes the byte at
`0004h` at each prompt and the FCBs and the tail before it runs a program
(`src/cpm/ccp.asm:192-211`, `src/cpm/ccp.asm:1261-1294`).

TEC-OS's own bytes are the sixteen that CP/M 2.2 leaves to the BIOS
(`src/layout.asm:35-52`):

| Address | Name | Contents |
| --- | --- | --- |
| `0040h` | `LATCHV` | the copy of the system latch |
| `0041h` | `MAINS` | MAIN regions fitted, 1 or 2 |
| `0042h` | `RXFULL` | nonzero while a console byte waits in `RXCHAR` |
| `0043h` | `RXCHAR` | that byte |
| `0044h` | `EXPANDS` | EXPAND regions fitted, always 2 |
| `0045h` | `CONDEV` | the console devices present, a bit each |
| `0046h` | `VROW` | the video terminal's cursor row |
| `0047h` | `VCOL` | and column |
| `0048h` | `VWID` | the video console's columns, 0 on the serial terminal |
| `0049h` | `VHGT` | its rows |
| `004Ah` | `ESCST` | the escape parser's state |
| `004Bh` | `ESCP1` | its first numeric parameter |
| `004Ch` | `ESCP2` | its second |
| `004Dh` | `KBLAST` | the matrix key held at the last poll, `FFh` for none |
| `004Eh` | `VATTR` | `80h` while reverse video is on |
| `004Fh` | `VCURV` | 1 while the cursor cell is inverted |

## The resident workspace

From the BDOS entry jump to `BFFFh`, on the starter card:

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `B806h–B808h` | 3 | the BDOS entry jump, `JP BENTRY` |
| `B809h–B817h` | 15 | unused |
| `B818h–B957h` | 320 | the allocation vectors: B's 256 bytes at `B818h`, then A's 64 at `B918h` |
| `B958h–BCC4h` | 877 | the BIOS's disk state and buffers, the mount service's scratch and the video terminal's state |
| `BCC5h–BCEAh` | 38 | the BIOS stack |
| `BCEBh–BE76h` | 396 | the CCP's state and stack |
| `BE77h–BEFFh` | 137 | the BDOS's state and stack |
| `BF00h–BF32h` | 51 | the RAM BIOS table, 17 jumps |
| `BF33h–BFE5h` | 179 | the SD card's, cache's, keyboard's, video drivers', loaders', startup's and chained line's state |
| `BFE6h–BFFFh` | 26 | unused |

The part from `WSBASE`, `B958h`, to `BEFFh` has the same addresses on every
card; the build places `WSBASE` so that it ends at `BF00h`
(`src/gen/config.asm:2`, `src/layout.asm:69-72`). The part above the table
starts at `BF33h`, 51 bytes after `BF00h` (`src/ram.asm:192`). Cold boot
clears the workspace from `WSBASE` up to `WSEND`, `B958h` to `BFE5h`
(`src/boot.asm:23-27`). Warm boot clears the part from `CCPCLR` to the end of
the BDOS's block and leaves the rest (`src/boot.asm:270-289`).

### The BIOS's block

`src/ram.asm:8-62`:

| Addresses | Bytes | Name | Contents |
| --- | ---: | --- | --- |
| `B958h` | 1 | `DSKCUR` | the drive the BIOS has selected |
| `B959h–B95Eh` | 6 | `DSKTRK`, `DSKSEC`, `DSKDMA` | the track, sector and DMA address the BDOS last set |
| `B95Fh–B961h` | 3 | `BLKOFF`, `BLKSLOT` | the block within the volume and the record within the block |
| `B962h–B965h` | 4 | `BUFOK`, `BUFDRV`, `BUFBLK` | the deblocking buffer's state and key |
| `B966h–BB65h` | 512 | `BLKBUF` | the deblocking buffer |
| `BB66h–BB85h` | 32 | `DRVTAB` | the drive table, 8 bytes a drive |
| `BB86h–BB89h` | 4 | `DRVIDX` | each drive's volume, its index + 1 |
| `BB8Ah–BB8Dh` | 4 | `DRVSLOT` | each drive's vector slot |
| `BB8Eh–BBCDh` | 64 | `DPHTAB` | the four DPHs, 16 bytes each |
| `BBCEh–BBCFh` | 2 | `LOGINV` | the BDOS's logged-in drives |
| `BBD0h–BC4Fh` | 128 | `DIRBUF` | the directory buffer every drive shares |
| `BC50h–BC51h` | 2 | `CSVDUM` | the unused check vector |
| `BC52h–BC53h` | 2 | `STUBAD` | the BDOS entry jump's address |
| `BC54h–BC61h` | 14 | `MNTCNT` to `MNTCB` | the mount service's scratch |
| `BC62h–BCB1h` | 80 | `LINEBUF` | one display row, for scrolling |
| `BCB2h–BCBFh` | 14 | `VPUTV` to `VFNV` | the seven vectors into the video driver |
| `BCC0h–BCC4h` | 5 | `VSTOP` to `CONMOD` | the scroll region, the console field acted on, the PICO9918's claim and the console mode |
| `BCC5h–BCEAh` | 38 | `BSTKB` | the BIOS stack, up to `BSTK` |

### The CCP's block

`src/ram.asm:67-128`. Warm boot keeps the bytes below `CCPCLR`, `BDB5h`, and
clears the rest:

| Addresses | Bytes | Name | Contents |
| --- | ---: | --- | --- |
| `BCEBh–BD0Eh` | 36 | `CMDFCB` | the command's FCB |
| `BD0Fh–BD32h` | 36 | `RENFCB` | the second FCB of `REN` and `COPY` |
| `BD33h` | 1 | `CMDBUF` | function 10's maximum, 127 |
| `BD34h` | 1 | `CMDLEN` | the line's length |
| `BD35h–BDB4h` | 128 | `CMDTXT` | the command line |
| `BDB5h` | 1 | `BOOTDRV` | the drive at the CCP's entry |
| `BDB6h–BDCBh` | 22 | `CMDSTRT` to `ERAALL` | the parser's pointers and the state of `DIR`, the pager, `SAVE` and `ERA` |
| `BDCCh–BE4Bh` | 128 | `LOADBUF` | the CCP's scratch record |
| `BE4Ch–BE58h` | 13 | `STKGUARD` | the CCP stack's guard, `A5h` in each byte |
| `BE59h–BE76h` | 30 | `CSTKBAS` | the CCP's stack, up to `CSTKTOP` |

### The BDOS's block

`src/ram.asm:130-190`:

| Addresses | Bytes | Name | Contents |
| --- | ---: | --- | --- |
| `BE77h–BE7Ah` | 4 | `OLDSP`, `PARAM` | the caller's stack pointer and `DE` |
| `BE7Bh–BE7Eh` | 4 | `COLUMN`, `LISTEN`, `PENDING`, `PENDCHR` | the console column, the `^P` copy and the kept character |
| `BE7Fh–BE84h` | 6 | `LINPTR` to `HPOS` | function 10's state, `HFLAG` and the history line shown |
| `BE85h–BE8Ah` | 6 | `CURDRV` to `DEFALV` | the bound drive and the default drive with its DPB and vector |
| `BE8Bh` | 1 | `USERNO` | the user number |
| `BE8Ch` | 1 | `WRFLAG` | set by the CCP for its reset |
| `BE8Dh–BE8Eh` | 2 | `WARMV` | the drives to rebuild to their mark |
| `BE8Fh–BE90h` | 2 | `ROVEC` | the read-only vector |
| `BE91h–BE92h` | 2 | `CURDMA` | the DMA address |
| `BE93h–BE9Ch` | 10 | `DPHPTR` to `XLTPTR` | the bound drive's DPH, DPB, directory buffer, vector and translation table |
| `BE9Dh–BEC9h` | 45 | `CURTRK` to `DIRSEC` | the directory search, the scan and the file position |
| `BECAh–BEFFh` | 54 | `STKBASE` | the BDOS's stack, up to `STKTOP` |

### Above the RAM BIOS table

`src/ram.asm:192-242`:

| Addresses | Bytes | Name | Contents |
| --- | ---: | --- | --- |
| `BF33h–BF3Dh` | 11 | `SDBYTE` to `SDXB` | the SD card driver's state |
| `BF3Eh–BF43h` | 6 | `CNEXT` to `CIFF` | the block cache's state |
| `BF44h–BF4Ah` | 7 | `KBMASK` to `KBT2` | the matrix keyboard's scan |
| `BF4Bh–BF4Eh` | 4 | `PIVEC`, `GLVEC` | the video drivers' tables |
| `BF4Fh` | 1 | `HHEAD` | the history's head |
| `BF50h–BF54h` | 5 | `XMDST` to `XMARK` | `XMOVE`'s banks and EXPAND 1's low mark |
| `BF55h–BF56h` | 2 | `PZTOP` | the word warm boot puts at `0006h` |
| `BF57h–BF58h` | 2 | `PRGCODE` | function 108's return code |
| `BF59h–BF5Dh` | 5 | `LOADTOP` to `PRLDL` | the CCP's and the PRL loader's figures |
| `BF5Eh–BF63h` | 6 | `DRVBSY` to `DRVRC` | the driver loader's and registry's state |
| `BF64h` | 1 | `STPOS` | startup's position |
| `BF65h–BFE4h` | 128 | `STREC` | the record of `A:STARTUP.CMD` |
| `BFE5h` | 1 | `CHPOS` | the chained line's next piece |

## EXPAND 1

Cold boot clears all of it. No BDOS or BIOS call gives a program a range in
it: `MOVE` rejects every range in bank 1 (`src/xmove.asm:1-7`). A program that
writes the latch can still switch it in, and the jump at `BF03h` is for one
that ends that way.

| Addresses | Bytes | Contents |
| --- | ---: | --- |
| `8000h–BBFFh` | 15,360 | the block cache's 30 lines, 512 bytes each |
| `BC00h–BC77h` | 120 | `CTAB`: each line's card block, 4 bytes, `FFFFFFFFh` while empty |
| `BC78h–BC7Fh` | 8 | unused |
| `BC80h–BC9Dh` | 30 | `CDIRTY`: each line's dirty byte |
| `BC9Eh–BCFFh` | 98 | unused |
| `BD00h–BDFFh` | 256 | `HRING`: the command history |
| `BE00h–BEFFh` | 256 | unused |
| `BF00h–BFFFh` | 256 | reserved; warm boot writes a jump at `BF03h` |

The cache's addresses are in `src/layout.asm:24-26` and the history's page in
`src/history.asm:14`. The jump at `BF03h` is `JP WBOOTR`
(`src/boot.asm:59-65`).

## The stacks

| Stack | Addresses | Bytes | Used by |
| --- | --- | ---: | --- |
| boot | below `8000h` | | cold boot, until the workspace is cleared (`src/layout.asm:68`, `src/boot.asm:10`) |
| BIOS | `BCC5h–BCEAh` | 38 | cold boot after the RAM check, warm boot and the diagnostic prompt |
| CCP | `BE59h–BE76h` | 30 | the CCP, and a program from its start, with `0000h` pushed |
| BDOS | `BECAh–BEFFh` | 54 | every BDOS function and the BIOS calls it makes |

The sizes are `BIOSSTN`, `CCPSTN` and `BDOSSTN` in `src/layout.asm:76-82`. A
loaded driver runs on its caller's stack, and `DRVLIM` gives what the drivers
together may add: 8 bytes to the BDOS's, 12 to the BIOS's and 6 to the CCP's
(`src/data3.asm:112`).
