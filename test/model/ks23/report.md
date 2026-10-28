# KS23's model: COPY to a drive, and never onto itself

Run on TEC-OS `b8c7214`, on the Debug80 model. `model.mjs` builds two
trees from that commit in `build/model-ks23/`: the base, and the draft with
COPY's section of `src/cpm/ccp.asm` replaced by `copy.asm`. It runs every
case on both and writes `figures.json`. No product source changes.

## The draft

`copy.asm` is the brief's design, untrimmed:

- `CPNAME` is split into `CPPARSE`, which parses, keeps `DE` and writes
  `BOOTDRV + 1` into a 0 drive byte, and `CPCHK`, which runs `UNAMBIG`.
  `CPNAME` is the two in turn, for the source.
- The destination is parsed. If its first name byte is a space, all eleven
  of the source's name bytes are copied in. Then `CPCHK` runs on it, so
  `COPY X.COM *.COM` stays a bad command.
- Bytes 0 to 11 of the two FCBs are compared before the open. Equal goes to
  `BADCMD`, with nothing opened.
- The parse routines sit before `CMDCOPY`, so their refusals reach the
  shared `JP BADCMD` with a relative jump. The rest of `CMDCOPY` and its
  text are as at `b8c7214`.

## Bytes, as KG12 counts them

COPY's code from its first label to `CMDCON`, the keyword, the dispatch and
the text.

| Build | Code | Keyword | Dispatch | Text | Total | Free below `FF00h` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `b8c7214` | 171 | 5 | 9 | 67 | **252** | 490 |
| Draft | 219 | 5 | 9 | 67 | **300** | 442 |

The draft adds 48 bytes, against the review's 55 to 60. The ROM's free space
below `FF00h` falls by the same 48.

## The cases

Each case starts from a fresh card: SYSTEM on A:, WORK on B: written
behind as on the starter card, and ARCHIVE on C:, read-only. A: holds
`X.COM`, `X.DAT`, `S.DAT` (SYS), `R.DAT` (R/O) and, in user 1, another
`X.DAT`. B: holds its own `X.COM` and `X.DAT`. The TPA `0100h–B405h` is
filled with a pattern before the command and checked after it. Then `^C`
warm boots, so B:'s lines reach the card, and the card is read.

- A copy passes when the destination equals the source byte for byte, the
  TPA is kept, and, for the first three cases, it prints what the full-name
  form prints (`COPY X.COM B:X.COM`, `COPY B:X.COM A:X.COM`).
- A refusal passes when it prints `COPY?`, the card is byte for byte as it
  was and the TPA is kept.

| Case | Command | Draft prints | Draft | `b8c7214` prints | `b8c7214` |
| --- | --- | --- | --- | --- | --- |
| a drive alone, A: to B: | `COPY X.COM B:` | COPIED 0018 | pass | COPY? | fail |
| a drive alone, B: to A: | `COPY B:X.COM A:` | COPIED 0015 | pass | COPY? | fail |
| a blank name with a type | `COPY X.COM B:.TXT` | COPIED 0018 | pass | COPY? | fail |
| onto itself | `COPY X.DAT X.DAT` | COPY? | pass | COPIED 000C | fail |
| onto itself, the destination's drive named | `COPY X.DAT A:X.DAT` | COPY? | pass | COPIED 000C | fail |
| onto itself, the source's drive named | `COPY A:X.DAT X.DAT` | COPY? | pass | COPIED 000C | fail |
| onto its own drive alone | `COPY X.DAT A:` | COPY? | pass | COPY? | pass |
| no destination | `COPY X.DAT` | COPY? | pass | COPY? | pass |
| onto itself, SYS | `COPY S.DAT S.DAT` | COPY? | pass | COPIED 0008 | fail |
| onto itself, R/O | `COPY R.DAT R.DAT` | COPY? | pass | Bdos Err On A: File R/O | fail |
| onto itself on B: | `COPY B:X.DAT X.DAT` | COPY? | pass | COPIED 000B | fail |
| onto itself in user 1 | `COPY X.DAT A:X.DAT` | COPY? | pass | COPIED 0009 | fail |
| A: to B:, same name | `COPY X.DAT B:X.DAT` | COPIED 000C | pass | COPIED 000C | pass |
| A: to B:, run on B: | `COPY A:X.DAT X.DAT` | COPIED 000C | pass | COPIED 000C | pass |

At `b8c7214`, the drive-alone forms are bad commands (KB-17). The copies
onto themselves print `COPIED` and change the card, or, for R/O, stop on
a BDOS error (KE-71). `COPY X.DAT A:` and `COPY X.DAT` are refused at
both.

KG12's 18 cases (files of 0, 1, 128, 157 and 300 records within A:, A: to
B: and B: to A:, a destination that exists, no source, a read-only
destination) give the same card and text as `COPY.COM` on both builds,
with the TPA kept: 18 of 18 on the draft, 18 of 18 at `b8c7214`.

## Totals

Draft: 32 of 32 cases pass. `b8c7214`: 22 of 32.

The full strict suite on the draft tree passes 155 of 156. The ATOM and Edit
tests were run with `ATOM_COM` and `EDIT_COM` set, since the tree sits
deeper than the repository. The one left is Edit on Triptych's CP/M 2.2,
which runs no TEC-OS ROM and doesn't find its pinned Triptych package from
the tree's depth.
