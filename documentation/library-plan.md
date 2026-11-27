# The TEC-OS library: plan

This is the plan for the books published at tec-os.org. It lives outside
`content/`, so it is not published. It records what the library holds, the
order the books are written in and the rules every tutorial follows.

## The products

TEC-OS ships with a core toolkit. Every volume on the starter card carries
it, so whichever volume is on A: you can edit, assemble, run and debug:

| Product | File | What it is |
| --- | --- | --- |
| TEC-OS | the ROM | The operating system: the CCP's prompt, the BDOS, the BIOS and the ROM services |
| The shell | `SHELL.SVC` | A small set of extra commands on the prompt: `CD`, `COPY`, `DEL`, `DIR` and the rest |
| TED | `TED.COM` | The text editor, which also builds and runs a program |
| TAS | `TAS.COM` | The Z80 assembler |
| TBUG | `TBUG.SVC`, `TBUG.HLP` | The debugger, on the LCD |

Two further products are for particular readers:

| Product | File | What it is |
| --- | --- | --- |
| BASIC | `BAZ.COM`, `BAZC.COM`, `BAZC.RTL` | BAZ, the BASIC interpreter, and BAZC, the compiler, which turns a finished program into a faster `.COM` file |
| MON3 | `MON3.SVC` | Runs TEC-1G programs written for the MON-3 monitor under TEC-OS |

The Baza repository is to be renamed Baz. The books call the language and the interpreter BAZ
and treat BAZC, the compiler, as an advanced step: you develop a program in the
interpreter and compile it once it works, to make it run faster.

## The books

Tutorials come first. Each teaches by building something that works, one
chapter at a time. Reference manuals come later, once the tutorials have
settled what each tool is.

### Start here

A short book that takes one small program through the whole toolkit:
power on, type a few commands, write the program in TED, assemble it with
TAS, run it, then step through it in TBUG. An afternoon's work. Every other
book assumes it.

### The core books

In the order they are written:

1. **Using TEC-OS.** The prompt and the shell, files, drives and volumes,
   startup files, consoles and cards. The shell is part of this book: to a
   user it is simply the command line, plus a few more commands. Built from
   chapters 1–8 of the current TEC-OS book.
2. **TED, the editor.** Editing, the keys, files and sessions, and building
   and running from inside the editor.
3. **Z80 programming with TAS.** Assembly language on TEC-OS, from a first
   `.COM` program to files, the board's devices and resident services. It
   uses TBUG throughout to show what a program is doing. Built partly from
   chapters 9–14 of the current TEC-OS book.
4. **TBUG, the debugger.** The existing book, updated.

### The specialist books

5. **BASIC on TEC-OS.** One book for BAZ and BAZC: write and try programs
   in BAZ, then compile a finished program with BAZC to speed
   it up. Caverns is the closing project.
6. **MON3 programs under TEC-OS.** For readers writing TEC-1G programs that
   run under MON-3.

### The reference shelf, later

7. **Inside TEC-OS.** The design of the system, for readers who want it:
   chapters 15–29 of the current TEC-OS book, largely as they stand.
8. **Reference manuals.** The current appendices (BDOS functions, ROM
   services, memory map, error messages, file formats, commands), and a
   reference volume for each tool.

## Rules for every tutorial

- **Every chapter is a project.** It says what you will build, has you type
  it, shows the real output and ends with something that works. A command or
  key is taught when a problem calls for it, not in a list.
- **One continuing example.** The program from Start here comes back in the
  TAS and TBUG books, so a reader meets familiar code in each tool.
- **Real output only.** Screens and transcripts are captured from the
  machine or the Viewer at a stated TEC-OS commit, never typed by hand.
- **Try it in the Viewer.** Each chapter links to the TEC-OS Viewer, so a
  reader can follow it without a board.
- **Version notes at the end.** Each chapter ends with a short "checked
  against" note naming the commits it was checked on. The opening pages
  carry no commit hashes or test records.
- **Link, don't repeat.** A book points to another for a topic that book
  owns: the TAS book sends readers to the TBUG book for stepping, and so on.
- **The house style.** The prose follows the existing books: plain
  sentences, the active voice, hexadecimal with a trailing `h`, and file
  names in capitals.

## Order of work

1. **The library's shape.** The shelf in `books.json` with the books above,
   the Start here book, and the TEC-OS book split into Using TEC-OS, Inside
   TEC-OS and the reference appendices. Fix the old `A>` and `B>` prompts in
   the TBUG book (now `A:SYSTEM>` and `B:WORK>`), and replace the outdated
   Thorium page, since TAS and TED now have their own repositories.
2. **TED and TAS.** The two remaining core tutorials.
3. **BASIC, then MON3.**
4. **The reference manuals.**

## Sources

The books draw on the design notes kept beside each product. They are
sources for the books, not reading for users:

- TEC-OS: `docs/` in this repository, including `shell.md`, `mon3.md`,
  `console.md`, `services.md` and `rom-services.md`.
- TED: `docs/` in the TED repository.
- TAS: `docs/language.md` and the other TAS notes.
- TBUG: the TBUG repository and its help file.
- BASIC: `docs/language.md`, `docs/differences.md` and the rest of `docs/`
  in the Baza repository.
