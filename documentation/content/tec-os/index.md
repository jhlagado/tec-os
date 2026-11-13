---
title: TEC-OS
nav_order: 13
has_children: true
nav_exclude: true
---

# TEC-OS on the TEC-1G

<!-- Opening profile: KD-243 / KS48, TEC Compact at 40 columns.
     Current revision: TEC-OS c4ec0f4 (main, ROM a65b6e45,
     14,875 bytes used and 1,509 free) has the minimal ROM CCP with the shell hook and
     SHELL.SVC on the card, which STARTUP.CMD loads first: history, COPY,
     DEL, SERVICES, the [more] pager, .CMD scripts and lines joined by !
     (always) and & (on success, after a blank), with CP/M 3's : gone.
     MON3.SVC (4,606 bytes, 18 pages) is entered on install, with no /E.
     TAS is the only assembler. The card's fourteen files include the 15-page SHELL.SVC; TAS.COM is Thorium 3d1e2c0 (e648a1d0), TED.COM
     Thorium a2fe556 (c6c8374a, stopping a name and ARGS at an & after a
     blank), BAZA Baza 50dc512 (280ee372, 13,184 bytes,
     a compile spinner) and BOUNCE.BAS (615693a5) takes the arrow keys;
     TIMES.BAS and BOUNCE.BAS have keywords in capitals and names in lower
     case. The logged drive writes behind and other drives coalesce. Every
     directory write flushes data first; every console read flushes changes. The web page gives a card saved before the shell the starter's
     SHELL.SVC, and MON3.SVC in place of an old one, at power-on. Every
     chapter and appendix is checked against c4ec0f4; a
     passage that cites an earlier revision names it. Earlier revisions of
     these notes are in the book's history. -->

With TEC-OS in its ROM the TEC-1G starts at a command prompt. You can list
files on an SD card and run a supplied program before using the editor,
the assembler or the BASIC compiler to make one of your own. TEC-OS provides the CP/M 2.2 programming
interface and calls for the board's devices.

## Starting with a prepared machine

The first session uses a 40-column PICO9918 display and the matrix keyboard,
with the Matrix switch enabled. The board needs a 32,768-byte RAM chip in U9,
the 4 MHz FAST setting, the TEC-OS ROM and a prepared starter card. The keypad
non-maskable interrupt (NMI) jumper is off. SYSTEM is on drive A and WORK is on
drive B. Hardware preparation is described in
[Appendix G](appendix-g-tec-1g.md).

[First session](01-first-session.md) begins with that preparation complete.
[Make a small program](02-make-a-small-program.md)
continues with a short banner entered in TED. You save it, build it with TAS,
change its text and run it again.
[Build a BASIC program](03-build-a-basic-program.md) compiles the supplied
TIMES.BAS with BAZA and builds it from TED with the same keys. These sessions
introduce the keys and commands they use without requiring an earlier CP/M,
BASIC or assembly course.

The banner is a guided copy-and-change exercise. Its instructions and data
are explained beside the listing. The later programming chapters assume you
can read a short Z80 listing with labels, registers and branches. They explain
the TEC-OS call, buffer and stack contracts before examples depend on them.

Serial terminals, the graphics LCD and other display widths have their own
configuration chapter. The web page is an optional way to use the software
machine, with its controls and card-saving rules in
[Appendix I](appendix-i-web-page.md).

## Runs and source

The demonstrations and measurements are from the Debug80 TEC-1G host model,
a software implementation of the machine. They are not physical-board runs.
The diagnostics chapter
separates what a test establishes in software from what a board report can
establish about that board.

Each chapter records the source revision used to check its claims. A retained
historical capture also records the revision and inputs that produced it.
Source references name the file and lines for the stated revision. A source
change may move those lines even when the assembled program is unchanged.
When the prose and its stated source disagree, the source is the authority
and the prose needs correction.

A transcript includes the prompt and the command typed after it, followed by
the output. It may begin at an already-running prompt. Any other omitted output
is identified with the example. Control keys are written with a caret: `^C`
means Ctrl and C together. Reproducing the runs on a PC requires the setup and tools in
[The host model as evidence](29-the-host-model-as-evidence.md).

Addresses and bytes use hexadecimal with a trailing `h`, as in `0100h`.
Sizes in bytes are decimal. A KiB is 1,024 bytes and a MiB is 1,024 KiB.

## Using the machine

| Chapter | Use |
| --- | --- |
| [1. First session](01-first-session.md) | Power on, find files, run supplied SAMPLE and the card's other programs and preserve work |
| [2. Make a small program](02-make-a-small-program.md) | Enter, save, build, change and run a banner |
| [3. Build a BASIC program](03-build-a-basic-program.md) | Compile and run TIMES.BAS with BAZA and build it from TED |
| [4. Work with files](04-work-with-files.md) | Read, copy, rename and erase files and control long listings |
| [5. Drives and user areas](05-drives-and-user-areas.md) | Locate programs, select volumes, use resident services and run MON-3 programs |
| [6. Cards on the PC](06-cards-on-the-pc.md) | Copy, check, recover and prepare card images |
| [7. Choose a console](07-choose-a-console.md) | Select a display or serial terminal and its settings |
| [8. Commands at startup](08-commands-at-startup.md) | Set up a startup file and bypass it when necessary |

## Writing programs

| Chapter | Use |
| --- | --- |
| [9. Call TEC-OS](09-call-tec-os.md) | Read keys and print through the BDOS |
| [10. Read and write a file](10-read-and-write-a-file.md) | Use file control blocks and record buffers |
| [11. Memory for programs](11-memory-for-programs.md) | Allocate program space and stacks and use raw BIOS calls |
| [12. Use the board's devices](12-use-the-boards-devices.md) | Call hardware services and share the display |
| [13. Results and command chains](13-results-and-command-chains.md) | Report a result and start the next command |
| [14. Write a resident service](14-write-a-resident-service.md) | Install a hook, publish routines and remove the service |

## Inside TEC-OS

| Chapter | Mechanism |
| --- | --- |
| [15. State and memory](15-state-and-memory.md) | Workspace, banks, stacks and state lifetimes |
| [16. Reset and boot](16-reset-and-boot.md) | Reset recognition, cold boot and warm boot |
| [17. Console paths](17-console-paths.md) | BIOS routing, keyboard, serial and terminal code |
| [18. Card blocks and volumes](18-card-blocks-and-volumes.md) | Card commands, container checks and record mapping |
| [19. Cache and persistence](19-cache-and-persistence.md) | Read reuse, write ordering and failed writes |
| [20. A file through the BDOS](20-a-file-through-the-bdos.md) | Directory entries, allocation and file operations |
| [21. From prompt to program](21-from-prompt-to-program.md) | Parsing, lookup and program launch |
| [22. Chains across a warm boot](22-chains-across-warm-boot.md) | Retained command text and conditional continuation |
| [23. The history ring](23-the-history-ring.md) | Bounded storage and recall of command lines |
| [24. Numbered-service dispatch](24-numbered-service-dispatch.md) | Register handling and device routines |
| [25. Loading and removing services](25-loading-and-removing-services.md) | Relocation, publication and rollback |
| [26. Startup inside the CCP](26-startup-inside-the-ccp.md) | Reading lines and handling absent displays |
| [27. Build the ROM and media](27-build-the-rom-and-media.md) | Source, generated data and qualified artifacts |
| [28. Diagnose the machine](28-diagnose-the-machine.md) | Card errors and the board diagnostics loaded by MON-3 |
| [29. The host model as evidence](29-the-host-model-as-evidence.md) | Host machine, captures, tests and their limits |

## Reference

| Appendix | Lookup |
| --- | --- |
| [A. BDOS functions](appendix-a-bdos-functions.md) | Registers, effects and errors by function number |
| [B. ROM interfaces](appendix-b-rom-services.md) | Numbered services, the PICO record and font |
| [C. Memory map](appendix-c-memory-map.md) | Addresses and the state cleared at each boot |
| [D. Messages and recovery](appendix-d-error-messages.md) | Causes, partial results and next actions |
| [E. Container format](appendix-e-container-format.md) | Header, descriptors, checks and geometries |
| [F. tecvol](appendix-f-tecvol.md) | Host commands and options |
| [G. Hardware preparation](appendix-g-tec-1g.md) | Required setup, ports and hardware constraints |
| [H. Service format](appendix-h-service-file-format.md) | Header fields, dependencies and relocation data |
| [I. Web page](appendix-i-web-page.md) | Controls, input, saved cards and imports |
| [J. Command reference](appendix-j-command-reference.md) | Exact syntax, names, wildcards and search rules |
