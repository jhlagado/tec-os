# Writing the TEC-OS book

This guide is for the people writing and revising the book's chapters. The
book has one job: to take a reader from the first prompt to a working
understanding of TEC-OS, with every statement true of the code. Chapter 1 is
the model chapter; where this guide and Chapter 1 differ, the guide is right
and Chapter 1 is to be fixed.

## Truth

**Each chapter names its commit.** Under its title a chapter carries one line,
`Checked against TEC-OS <commit>.`, with the short hash of the commit whose
code the chapter's claims were checked against. When the chapter's examples
depend on a file from outside the repository, such as the starter card's
`EDIT.COM`, the same line names that file's build and SHA-256. A revision that
rechecks the chapter against a later commit changes the line.

**The code is the authority.** Every number, address, message, file name and
behaviour in a chapter is checked against the source at the named commit, not
against the documents in `docs/` or an earlier book. The documents show where
to look, and they are sometimes out of date. A claim that can't be checked is
left out. A claim of common knowledge, such as CP/M's history, is kept to what
a reference on CP/M would state, and the writer keeps its uncertainty and
scope: "most", "about" and "on the model" stay where they are true.

**Examples are real.** Each example of TEC-OS's output was produced by a run,
on the host model or on the web page, from the named commit, and is copied
into the chapter unchanged. `book/capture.mjs` produces it from the host
model:

```sh
npm run build && npm run media
node book/capture.mjs DIR "TYPE README.TXT"
node book/capture.mjs --board pico --screen CON
node book/capture.mjs --card none --lcd H
```

The script's header lists its options (the board, the card, the ROM, and the
LCD, screen or serial output) and its special lines (a control key, a key to
stop a program, a program that runs until a key, a pause and the reset
button). Its clock starts at 1 November 2026, 12:00, so a run gives the same
output on any machine. The script prints the card's SHA-256, and the starter
card's `EDIT.COM` build, on stderr.

**Each example names its run.** The capture command for an example is given in
the sentence that introduces it, or in an HTML comment on the line before the
example, `<!-- node book/capture.mjs ... -->`. A transcript may start at the
prompt where its first command is typed, leaving out the boot before it. When
it leaves out anything else, such as lines between two commands, the text
says what is missing.

**Part II cites the source.** In Part II each claim about the code carries a
reference to the file and line it rests on, as `src/boot.asm:22`, at the
named commit. Part I names files where a reader would want them, without
line numbers.

## The reader and the route

The reader knows the TEC-1G or a similar Z80 board. In Chapters 1 to 5 they
may never have used CP/M; from Chapter 6 they read Z80 assembly. Each term is
explained where it is first used, in the sentence that uses it or the one
before: *warm boot*, *TPA*, *IOBYTE*, *FCB*, *volume*, *driver*. A later
chapter may use a term without explaining it again, and it names the chapter
that explained it when the reader may have skipped there.

**Point of view.** The book addresses the reader as *you*, for what the reader
types, sees and decides. It doesn't use *we*. The writer stays out of the text.

**Motivation, then mechanism.** A section starts from something the reader
wants to do or has just seen, and then explains the mechanism behind it. Each
section rests on what earlier sections explained. The text reads as a guide
and a reader going through the subject together: each paragraph leads into
the next, and connected explanation is preferred to a run of separate correct
statements.

**Openings and endings.** A chapter begins with its subject and the reader's
route through it, in a sentence or two, and then starts on the subject. It
ends on its last substantive point, with no recap of what it said and no
forecast of the next chapter. A forward reference is kept when it gives the
reader a useful expectation, written as "Chapter 4 explains the cache", never
as a topic arriving or waiting.

## Sentences

Plain, direct sentences in the active voice, each carrying a fact, a step or
a connection the reader needs. Long sentences are fine when the thought needs
them, and so are short ones; neither is a quota.

**The deletion test.** The writer reads each sentence in order, removes it in
thought, and rereads the paragraph without it and across into the next one. A
sentence whose removal loses nothing is deleted; it isn't rewritten, since a
rewritten empty sentence is usually a longer empty sentence. A sentence stays
when its removal loses a fact, a step, a distinction, the antecedent of a
later *it* or *this*, or the bridge into the next paragraph. The same test
applies to a paragraph within its section and a section within the chapter.
After the cuts the writer reads the whole chapter again in order and repairs
broken transitions; where the sentence-level test and that read-back
disagree, the read-back wins.

**`Is` and `has`.** A thing *is* or *has* something. It doesn't *serve as*,
*stand as*, *function as*, *feature* or *offer* it.

**People act; programs operate.** Only people have perception, memory,
judgment, desire, emotion, moral standing and social intentions, and only
people act on themselves. TEC-OS, the ROM, a program, a driver, a file, a
card, the book and its chapters have none of these, not even as a figure of
speech or a familiar shorthand. So none of them knows, believes, understands,
thinks, remembers, notices, wonders, decides, chooses, cares, wants, wishes,
prefers, hopes, expects, agrees, deserves, owes, demands, forgives, asks,
promises, tells, teaches, learns, tries, sees, faces, offers, declines,
earns, observes, forgets, refuses or gives way. Something *owns* a resource
only where the code defines the ownership, as a driver's pages are recorded
against it. For a person, name the person: *you* or *the programmer*. For a
mechanism, use the verb for what it does: TEC-OS *reads*, *writes*, *stores*,
*checks*, *tests*, *compares*, *selects*, *copies*, *reports*, *rejects*,
*requires*, *calls* and *waits*. "The loader refuses the file" becomes "the
load fails" or "the loader rejects the file"; "TEC-OS remembers the drive"
becomes "TEC-OS stores the drive at `0004h`".

**Operation idioms.** Verbs that name a real mechanism stay: the CCP *waits
for* a line, a byte *arrives* at the serial port, a driver *takes* the
console. A borderline phrase is tested in both directions: when the literal
replacement is stranger or less exact and the phrase gives the artifact no
mind, the phrase stays.

**The book's own verbs.** A chapter may *say*, *state*, *explain*, *describe*
or *list*. It doesn't *want*, *look at* or *discuss itself*, and topics don't
*move*, *arrive* or *wait* in the book.

**Positive statements.** Say what is the case: "the history holds 256 bytes",
not "the history is not unlimited". A negative stays when it is the fact a
reader needs: a prohibition ("never change a card on a PC while the TEC-1G is
using it"), a correction of a likely mistake, a contrast between two real
alternatives, or an exact state (`NO FILE`). Softened negatives, such as
*rather than*, *instead of*, *without* and *no longer*, get the same test.

**No praise, no scene-setting.** No *powerful*, *elegant*, *seamless*,
*robust*, *simply*, *just*, *crucial*, *key*, *significant*, *honest* or
*honestly*, and no "it is worth noting" or "not just X but Y". No clause added
after a comma to say that something matters. State the property: "the copy
puts the latch and the interrupt state back as they were" says more than "the
copy is safe".

**Hollow landings.** A sentence that begins *This*, *That* or *It* at the end
of a paragraph, and only restates or admires what came before ("This shows
how compact TEC-OS is"), is deleted.

**No staged questions.** A question the text asks only to answer it in the
next sentence is replaced by the answer.

**Named sources.** No "it is often said", "many users find" or "it is
generally agreed". A claim names its source, or it is a claim the writer
checked.

**Explanation instead of commands.** Teaching prose says what an action does,
why it is done and what the reader sees after it: "`DIR` lists the files on
the current drive, and on the starter card it shows twelve." Literal commands
in code blocks, the steps of a procedure and short safety warnings stay as
commands. Attention directions such as *Notice*, *Look closely* and *Keep in
mind* are left out; the detail goes in the sentence itself.

**Figures of speech** earn their place only when the reader reuses their
structure. If the literal half of a sentence carries the whole meaning, the
figure goes.

**Punctuation.** Dashes are rare; a comma, a colon or a new sentence usually
does the work. No bold inside running prose except for a term at its
definition in a reference list.

## Structure

Headings are noun phrases: "The first prompt", "Drives and memory". A heading
is never a clause of the form "What X does" or "How X works"; a question
heading is allowed only when it is a real question with a question mark and
the section answers it.

Prose carries arguments and explanations. Lists and tables are for material
that has the shape of a list: a set of commands, a table of addresses, the
controls of the web page, the steps of a procedure. A paragraph has one job.

## Conventions

- Hexadecimal numbers have a trailing `h`, as `0100h`; sizes in bytes are
  decimal, with a comma in thousands, as `46,854`. KiB and MiB are powers of
  two.
- Times are in T-states, the Z80's clock cycles; at the TEC-1G's 4 MHz,
  4,000,000 T-states is one second.
- Control keys are written with a caret: `^C` is Ctrl and C together.
- A transcript shows the prompt and what the reader types on one line, and
  TEC-OS's output after it, exactly as captured, in a `text` block.
  Commands for a PC's shell go in an `sh` block, and Z80 source in an `asm`
  block.
- File names in the text are as TEC-OS shows them, in capitals: `README.TXT`,
  `PICO.DRV`.

## What the book leaves out

The book describes the product as it is at each chapter's commit. It gives no
account of how TEC-OS was developed: no internal plans, no work records and
no numbering from them. History belongs in the book only where it explains
the product as it is, such as the reason for a `RET` at `C01Dh`. The book
never mentions the tools used to write it.

## Writing a chapter

Drafting and editing are separate passes. The writer first checks the
chapter's examples by running them, then drafts generously, with motivation,
worked examples and transitions, and doesn't line-edit while drafting. Then,
in order:

1. A search of the draft for the patterns above: mind verbs with a
   non-human subject, *serves as* and its kin, the praise words, *honest*,
   staged questions, attention directions, fused-relative headings, and
   topics that move through the book. Each hit is resolved by rewording or
   kept on purpose.
2. A reading, paragraph by paragraph, that keeps each paragraph only if it
   moves the reader on or lets them use what they have.
3. The deletion test, sentence by sentence, in order.
4. A read-back of the whole chapter in the reader's order, repairing what the
   cuts broke.
5. A check of every claim, number, message and example against the named
   commit, and the search of step 1 again.

Before the chapter is handed in, the writer answers these questions from the
text:

- Does the opening state the subject and the route without a generic preview?
- Does each section use only terms and ideas already explained?
- Is every claim checked against the named commit, and every example captured
  from a run whose command is given?
- Does every Part II claim about the code carry a file and line?
- Does any sentence give a program, a file or the book a mind or a wish?
- Did any edit weaken a condition, an exception, a prohibition or an
  uncertainty?
- Does each paragraph have one job, and is each heading a noun phrase?
- Does the ending land on a substantive point?
