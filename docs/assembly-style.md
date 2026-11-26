# Assembly source style

Assembly should remain readable on the machine and fit its editor. Keep each
source within 24,576 bytes and use an 8.3 filename: at most eight characters,
a three-letter type and no hyphen. Preserve case-sensitive include paths.
Historical model inputs, generated includes, font data and notices keep their
own exact source and provenance; they are not formatting targets.

The ROM sources under `src/`, `drivers/glcd.asm`, `programs/SAMPLE.ASM`,
`programs/DEMO.ASM`, the diagnostics in `diag/`, `test/programs/mon3stub.asm`,
`test/programs/area.asm`, `test/programs/area3.asm` and `test/programs/put.asm`
use the compact layout.
Other live test programs retain their existing layout. A comment edit does not
authorize a layout migration; names move as Names says.

## Names

Names come first, because a source is read more often than it is written
and a name is read more often than any comment (Origo MD-16, in Origo's
`bindings/z80-cpm/assembly-style.md`). A name in capitals, such as `EXRMV`,
hides where its words begin and what they are.

- Never all capitals. TAS takes names in any case (`Loop` and `LOOP` are one
  name), so case costs no byte and changes no symbol; it only shows the words.
- A label, which names an address of code or data, is camel case: a short
  lowercase prefix for its module, then capitalised words, such as `kbSeek`,
  `kbTails`, `svcUnld` or `hstRing`.
- A constant, defined by `EQU`, is Pascal case, such as `ExRemove`, `HistLen`
  or `SysLatch`. Lowercase first is an address; a capital first is a value.
- A routine's own branches use private labels, `.loop`, `.next` or `.done`. A
  global label is a routine's entry, a shared tail or data.
- Spend the eight characters on words, not clipped consonants. Where letters
  must go, shorten the later words and keep each word's capital.
- A name is unique by its letters: `kbTail` and `KbTail` are one name.
- `abi.inc`'s names are published, so they keep their letters; their case may
  follow this style.
- Existing code moves when it is next reworked. A case-only respelling must
  assemble to the same ROM and the same symbol map. A rename that changes
  letters is its own change, with its callers, tests and documents.

## Compact layout

- Use two literal spaces before instructions and one mnemonic/operand separator.
  Mnemonics, registers and condition codes are lowercase. Labels and constants
  follow Names, above. Preserve string and character literal contents exactly.
- Put code labels on their own lines, with a blank above each. Data labels and
  `EQU` names can share their declaration. Separate a left-margin comment block
  from surrounding source with a blank; one blank separates a header and label.
- Target 40 columns. Inline semicolons start at column 18, with at least two
  spaces after code and one after the semicolon. Align an inline continuation
  with its first semicolon. Move longer explanations to the left margin.
- Break prose at useful phrases. Preserve paragraphs, tables, examples and
  diagrams. Aim for headers of 15 lines or fewer, retaining necessary contracts.
  Exact longer-line/header exceptions are in `tools/compact-exceptions.json`;
  callable routine names are in `tools/compact-routines.json`.

## Comments and preservation

A routine header explains purpose, inputs, results, flags, clobbers and relevant
ownership, lifetime or failure effects. Read the implementation, shared tails
and actual callers before changing it. Explain non-obvious ordering, branch
conditions and magic values; remove repetition and instruction paraphrases.
Aim for a comment on nearly every code line, saying what the line does in the
program's terms (Origo MD-16); a checker's floor is a minimum, not the aim.
Do not retain empty commentary to reach a count or drop a necessary contract
to shorten a block. A shorter but inaccurate explanation is a regression.

The standing mechanical rules include at least 40 percent of instruction lines
with comments and no more than four uncommented instructions in sequence.
If a useful deletion conflicts with those rules, review that conflict explicitly;
do not silently weaken a check or add filler. The checker cannot judge meaning.

Comment changes preserve executable instructions, declarations, literals,
reserves, native bytes and symbol meanings. Changed source sizes, coordinates,
source-copy hashes and their consumers need their own correspondence. Source
comments can be data: the `LATCHV` caption in `src/abi.inc` feeds the memory-map
document, while raw-source digests affect fixture caches. Shipped `SAMPLE.ASM`,
`DEMO.ASM` and `HELLO3.ASM` (from `test/programs/hello3.asm`) also change
when their comments change, and `test/ks40.test.mjs` pins `DEMO.ASM`'s and
`HELLO3.ASM`'s hashes. Never replace functional source with an
older complete file merely because that file's wording was reviewed.

`tools/style-check.mjs` selects the compact checker for its owned sources. The
shared reader in `tools/lib/style.mjs` also retains `checkSource` and `toTabs`
for the earlier tabbed layout. `tools/style-tabs.mjs` is that legacy in-place
formatter; it must not be used to convert current compact sources back to tabs.
