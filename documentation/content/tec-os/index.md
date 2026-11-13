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

TEC-OS lets you keep programs and their source as named files on an SD card.
After power-on the TEC-1G displays a command prompt. From there you can find a
file, run a program or reopen source that you saved in an earlier session.
You can change that source in the editor and build another executable on the
TEC-1G itself.

The supplied tools include TED for editing, TAS for assembly and BAZA for
BASIC. The first exercises use these tools to save, build and run a program
before the programming chapters explain its operating-system calls.

CP/M was a disk operating system used on early microcomputers. TEC-OS
implements its CP/M 2.2 file and console interfaces. Programs written to
use those common calls can therefore run on TEC-OS as well as programs
written specifically for this board. Compatibility depends on the calls
a program uses, available memory and its console and hardware requirements.
TEC-OS also provides additional calls for the board's devices.

## Starting with a prepared machine

The first session uses a 40-column PICO9918 display and the matrix keyboard
with the Matrix switch enabled. The board needs a 32,768-byte RAM chip in U9,
the 4 MHz FAST setting, the TEC-OS ROM and a prepared starter card. The keypad
non-maskable interrupt (NMI) jumper is off. SYSTEM is on drive A and WORK is on
drive B. [Appendix G](appendix-g-tec-1g.md) describes the hardware preparation.

[First session](01-first-session.md) begins at power-on with that preparation
complete. You find the supplied files and run programs from the card.
In [Make a small program](02-make-a-small-program.md) you enter a banner in
TED, save it and assemble it with TAS. Changing its text and running it again
connects the source file to the result on screen.
[Build a BASIC program](03-build-a-basic-program.md) uses BAZA to compile
TIMES.BAS, then uses TED's same build keys. No earlier CP/M or BASIC course
is required for these sessions.

You can copy and change the banner without already knowing assembly.
The explanation beside the listing covers the instructions and data it uses.
The later programming chapters assume you can read a short Z80 listing with
labels, registers and branches. Each TEC-OS call, buffer and stack contract
is explained before an example depends on it.

Other displays and serial terminals have a separate configuration chapter.
You can also use the software machine in a browser. Its controls and
card-saving rules are in [Appendix I](appendix-i-web-page.md).

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

## Runs and source

The demonstrations and measurements use the Debug80 TEC-1G host model,
a software implementation of the machine. They are not physical-board runs.
The diagnostics chapter distinguishes software-test results from evidence
collected on a particular board.

Each chapter names the source revision used to check its claims. Historical
captures also name the revision and inputs that produced them. Each source citation identifies a file and position at that revision.
Later edits may move the cited passage.

A transcript shows the prompt, the command typed after it and the output.
It may start at an already-running prompt. Any other omitted output is
identified beside the example. A caret denotes a control key: `^C` means
Ctrl and C together. [The host model as evidence](29-the-host-model-as-evidence.md)
describes the PC setup and tools for reproducing the runs.

Addresses and bytes use hexadecimal with a trailing `h`, as in `0100h`.
Sizes in bytes are decimal. A KiB is 1,024 bytes and a MiB is 1,024 KiB.
