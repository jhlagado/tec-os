# Writing the TEC-OS book

This guide is for the people writing and revising the book's chapters. The
book has one job: to take a reader from the first prompt to a working
understanding of TEC-OS, with every statement true of the code. Chapter 1 is the model chapter; when this guide and
Chapter 1 seem to differ, the guide is right and Chapter 1 is to be fixed.

## Truth

**Each chapter names its commit.** Under its title a chapter carries one line,
`Checked against TEC-OS <commit>.`, with the short hash of the commit whose
code the chapter's claims were checked against. A revision that rechecks the
chapter against a later commit changes the line.

**The code is the authority.** Every number, address, message, file name and
behaviour in a chapter is checked against the source at the named commit, not
against the documents in `docs/` or an earlier book. The documents are a good
guide to where to look, and they are sometimes out of date. A claim that can't
be checked is left out.

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

The script's header lists its options: the board (serial only, PICO9918 or
GLCD), the card, the 20 × 4 LCD's rows, the display's text, a key to stop a
program and the reset button. Its clock starts at 1 November 2026, 12:00, so
a run gives the same output on any machine. When an example leaves out part
of a run, such as the startup lines before a prompt, the text says so.

**Part II cites the source.** In Part II each claim about the code carries a
reference to the file and line it rests on, as `src/boot.asm:22`, at the
named commit. Part I names files where a reader would want them, and needs
no line numbers.

## The reader

The reader knows the TEC-1G or a similar Z80 board. In Part I they may never
have used CP/M; from Chapter 6 they read Z80 assembly. Each term is explained
where it is first used, in the sentence that uses it or the one before:
*warm boot*, *TPA*, *IOBYTE*, *FCB*, *volume*, *driver*. A later chapter may
use a term without explaining it again, and it names the chapter that
explained it when the reader may have skipped there.

A chapter begins with its subject and the reader's route through it, in a
sentence or two, and goes straight in. It ends on its last substantive point:
no recap of what it said and no forecast of the next chapter. A forward
reference is kept when it gives the reader a useful expectation, written as
"Chapter 4 explains the cache", never as a topic arriving or waiting.

## Sentences

Plain, direct sentences in the active voice, each carrying a fact, a step or
a connection the reader needs. A sentence that can be deleted with nothing
lost is deleted. Long sentences are fine when the thought needs them, and so
are short ones; neither is a quota.

**`Is` and `has`.** A thing *is* or *has* something. It doesn't *serve as*,
*stand as*, *function as*, *feature* or *offer* it.

**People act; programs operate.** Only people know, want, decide, choose,
remember, notice, expect, prefer, try, ask, offer, refuse or see. TEC-OS, the
ROM, a program, a file, a card, the book and its chapters do none of these,
not even as a figure of speech. For a person, name the person: *you* or *the
programmer*. For a mechanism, use the verb for what it does: TEC-OS *reads*,
*writes*, *stores*, *checks*, *tests*, *compares*, *selects*, *copies*,
*reports*, *rejects*, *requires*, *calls* and *waits*. "The loader refuses the
file" becomes "the load fails" or "the loader rejects the file"; "TEC-OS
remembers the drive" becomes "TEC-OS stores the drive at `0004h`". A chapter
may *say*, *state*, *explain* or *list*; it doesn't *want*, *look at* or
*discuss itself*, and topics don't *move*, *arrive* or *wait* in the book.

**Positive statements.** Say what is the case: "the history holds 256 bytes",
not "the history is not unlimited". A negative stays when it is the fact a
reader needs: a prohibition ("never change a card on a PC while the TEC-1G is
using it"), a correction of a likely mistake, or an exact state ("`NO FILE`").

**No praise, no scene-setting.** No *powerful*, *elegant*, *seamless*,
*robust*, *simply*, *just*, *honest* or *honestly*, no "it is worth noting",
no "not just X but Y", and no clause added after a comma to tell the reader
that something matters. State the property: "the copy puts the latch and the interrupt state back
as they were" says more than "the copy is safe".

**Explanation instead of commands.** Teaching prose says what an action does,
why it is done and what the reader sees after it: "`DIR` lists the files on
the current drive, and on the starter card it shows twelve." Literal commands
in code blocks, the steps of a procedure and short safety warnings stay as
commands. Attention directions such as *Notice*, *Look closely* and *Keep in
mind* are left out; the detail goes in the sentence itself.

**Figures of speech** earn their place only when the reader reuses their
structure. If the literal half of a sentence carries the whole meaning, the
figure goes.

## Structure

Headings are noun phrases: "The first prompt", "Drives and memory". A heading
is never a clause of the form "What X does" or "How X works"; a question
heading is allowed only when it is a real question with a question mark and
the section answers it.

Prose carries arguments and explanations. Lists and tables are for material
that has the shape of a list: a set of commands, a table of addresses, the
steps of a procedure. A paragraph has one job.

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

The book describes the product as it is at each chapter's commit. It says
nothing about how TEC-OS came to be built or the process behind it: no stage
names, decision records, defect numbers or internal plans. History belongs in
the book only where it explains the product as it is, such as the reason for
a `RET` at `C01Dh`. The book never mentions the tools used to write it.

## Before a chapter is handed in

The writer reads the chapter through in the reader's order and answers these
questions from the text:

- Does the opening state the subject and the route without a generic preview?
- Does each section use only terms and ideas already explained?
- Is every claim checked against the named commit, and every example captured
  from a run?
- Does every Part II claim about the code carry a file and line?
- Does any sentence give a program, a file or the book a mind or a wish?
- Does each paragraph have one job, and is each heading a noun phrase?
- Does the ending land on a substantive point?
