# Caverns native code and TPA size audit

This document retains the pre-optimisation 39,680-byte baseline. The 38,272-byte
build after it, from compact source-location emission, is in
[compact emission](caverns-compact-emission.md). The compiler-only build reached 29,056 bytes with Baza `eee4ee6`.
The restored-prose build is 37,248 bytes; its current measurements are in
[prose restoration](caverns-prose-restoration.md) and the
[book handover](caverns-book-handover.md).
The audit tool measures its current checkout; use the historical baseline commit
to reproduce the older numbers below.

Read-only investigation prompted by the author's priority: shrink compiled
BASIC before adding file handling; consider shell unloading separately.
No compiler/runtime or gameplay optimisation is implemented by this audit.

Measured executable SHA-256:
`841e208da7603054ed3e86d9f52a58c7de87f0a7a4c29e5d1f41599971733ee0`.
`tools/caverns-size-audit.mjs` recompiles it natively on a disposable card,
checks identical COM bytes and observes the matching compiler's selection
flags before exit. It also queries resident services and performs UNLOAD on
that disposable machine. It changes no source or active user card.

## Reconciled file layout

| Component | Bytes |
|---|---:|
| Generated application instructions, inline metadata and data | 31,715 |
| Linked runtime code, startup and work areas | 7,760 |
| BASIC scalar/descriptor cells | 88 |
| Entry jump | 3 |
| Footer | 10 |
| CP/M file padding | 104 |
| **COM file** | **39,680** |

The logical runtime image is 39,576 bytes; the last 104 bytes are file padding.
The runtime is approximately 20% of the file, not the whole 12,800-byte RTL
library. BAZA.COM is not resident while the generated game is running.

Within the 31,715-byte application region:

| Content | Bytes |
|---|---:|
| Encoded DATA, including numeric forms and block headers | 7,096 |
| Other literal text bytes | 2,996 |
| 669 source-context emission sites, nine bytes each | 6,021 |
| Remaining instructions and inline metadata | 15,602 |

DATA contains 4,499 string-content bytes. The DATA figures are derived from
its documented native tag/length/numeric/block encoding; context sites are
counted in the executable against its relocated RT_SRC target. These are
subcategories of the application, not additional memory allocations.
The file contains native instructions and necessary strings/DATA, not the
original BASIC listing or a tokenised BASIC program awaiting interpretation.

## Actual runtime selections

Native compiler flags: MODMATH=253, numeric display=1, arrays=1, strings=1,
DATA=1, string INPUT=2, RND=1. VAL=0, numeric INPUT=0, DEF FN=0, general maths=0.

Consequently the 389-byte RND-only module is selected and the 1,946-byte general
maths/trig/log module is excluded. The 1,212-byte VAL/decimal parser and 632-byte
numeric INPUT module are also excluded. These sizes describe library groups;
the total runtime additionally includes shared startup/work areas.

Finer reachability may still help inside selected groups: integer conversion/
multiply/divide/hex helpers (483 bytes), FOR handling (826), array operations
(678), strings (920), numeric formatter (769), f32 core (742). Those are whole
group sizes, not predicted savings. Caverns genuinely uses much of their code;
removing unused functions must preserve shared dependencies, bounds checking,
numeric results, error context and register contracts.

## TPA and the shell

Measured PICO9918/80-column starter profile:

| Configuration | TPA |
|---|---:|
| SHELL resident | 42,496 |
| After UNLOAD | 46,533 |
| Reclaimed | 4,037 |

SERVICES reports only `SHELL 15`: 15 pages, 3,840 bytes. The additional 197-byte
difference is page alignment: the bare ceiling B6C5h is rounded down to B600h
for service allocation, then the 15 pages leave A700h. No unidentified service
accounts for that difference in this measured configuration.
These rows measured the fifteen-page shell of TEC-OS `fdca626`, before sized
`DIR`, on a ROM that still had `SAVE`; the current shell takes seventeen pages.

The current mapping has 16 KiB ROM above the 48 KiB RAM window. Page zero and
resident BDOS/BIOS/cache/allocation-vector workspace also sit outside TPA; the
ROM CCP is not an extra RAM copy occupying the application's space. See
memory-map.md and shell.md for the current configuration.

The game reserves 768 bytes for CPU stack. From the logical image, the
shell-resident TPA leaves 2,920 bytes, or 2,152 after that stack reservation,
for dynamic arrays/strings/control allocations. This is not all free space:
the running game already allocates from it.

UNLOAD already works, but JP 0 returns to the ROM CCP; it does not by itself
reload an explicitly unloaded SHELL.SVC. A deliberate launcher/reload policy
would be a separate implementation. The author placed that avenue after
compiled-code efficiency.

## Recommended investigation order

1. **Compact diagnostic emission.** GENCTX currently emits LD DE,line;
   LD BC,statement; CALL RT_SRC: nine bytes before each active statement.
   A CALL plus inline four-byte context would use seven bytes per site,
   saving 1,338 bytes here before the new helper's cost. A six-byte form could
   save 2,007 if an eight-bit statement number is proved safe under the language
   contract. Neither estimate is an implemented saving. Preserve useful line
   diagnostics, ERL/error behaviour, register preservation and call continuations.
2. **Profile and extend native emission fast paths.** INTLET and INTCOND already
   emit direct integer assignments/relations. Examine their fallbacks for
   compound integer expressions, typed one-dimensional indexing, repeated
   operand/slot setup and branch sequences. Preserve BASIC evaluation order;
   AND/OR cannot casually become C-style short-circuit evaluation.
3. **Finer runtime helper dependencies.** Split only where measured call
   reachability proves a function unused, e.g. division/hex versus conversions,
   integer versus floating FOR paths, or arithmetic operators within a shared
   core. Measure code, relocation metadata, workspace, stack and compiler cost.
4. **Inspect DATA encoding.** Integer DATA currently retains text plus a
   predecoded f32 value. A compact exact-integer representation may help, but
   READ into strings must retain lexical behaviour and new conversion dependencies
   must not erase the saving. No DATA compatibility change is assumed here.
5. **Then price file handling against the smaller game.** Continue selective
   linking and bounded active-channel storage. Do not reserve all possible
   channel buffers for a game that opens one at a time.

A handwritten 22,896-byte assembly game is a useful comparison, but it is not
an identical implementation carrying all BASIC's general string/array/numeric
semantics. Several kilobytes of improvement look worth investigating; there is
no measured promise of a 20 KiB BASIC build. Use compiler microbenchmarks and
the frozen-baseline/480-command game comparison to qualify each change.

[Raw measurement](evidence/caverns-size-audit/measurement.json) and
[native audit output](evidence/caverns-size-audit/native-audit.log).
