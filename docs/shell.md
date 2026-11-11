# The shell: SHELL.SVC and the ROM's shell hook

The CCP in ROM is minimal. It runs a `.COM` or a `.SVC`, changes drive, and
has CP/M's built-ins `DIR`, `ERA`, `REN`, `TYPE`, `SAVE` and `USER`, with
`CON` and `UNLOAD`. It reads one line of `A:STARTUP.CMD` after a reset.

`SHELL.SVC` is a resident service that takes over the prompt through the
ROM's shell hook. It holds what left the ROM:

- the command history, ^W and ^N;
- `COPY`, `DEL` and `SERVICES`;
- the pager, `[more]` in `TYPE` and `DIR`;
- lines of several commands joined by `!` and `&`;
- `.CMD` scripts, and the rest of `STARTUP.CMD`.

Every other command it hands back to the ROM to run. The starter card's
`STARTUP.CMD` starts with `SHELL.SVC`, so the shell is in after every reset.
A key held through reset skips `STARTUP.CMD`, and the bare prompt comes back.

`SHELL.SVC` takes 10 pages: 2,560 bytes in memory, image and extra RAM
together. Its history is a 256-byte ring in its own last page. Its own stack
is 32 bytes, of which the census's workload uses 16 (`test/shell.test.mjs`,
which reads a guard pattern laid under it). It declares 6
bytes of the BDOS's stack and none of the BIOS's or the CCP's, so `GLCD.SVC`
and `MON3.SVC` install beside it. With the shell alone the word at 0006h is
AF00h, a TPA of 44,544 bytes on the starter card.

## With no shell

The bare prompt behaves as a CP/M 2.2 CCP:

- `!` and `&` are ordinary characters. `DIR!TYPE X` is one word, refused as
  `DIR!TYPE?`.
- `COPY`, `DEL` and `SERVICES` are names like any other: `NAME?` with FF00h,
  unless a `.COM` of the name exists.
- A typed `NAME.CMD` runs `NAME.COM`, and says `NAME.CMD?` if there is none.
- A function 47 line is echoed after the prompt and runs whole, as one
  command: `TYPE X!TYPE Y` is `TYPE` with the tail `X!TYPE Y`.
- `DIR` and `TYPE` list without pausing.
- Only the first line of `STARTUP.CMD` runs.

TED's build line, `A:TAS NAME!A:TED`, needs the shell to come back to TED. With
no shell the ROM runs such a line whole: TAS gets the rest as its tail and
still builds, and the prompt comes back in place of TED.

## Lines and separators

A line is split into pieces at separators, and each piece runs in turn:

- `!` always separates. After it the next piece runs whatever the last
  command returned, as in CP/M 3. `TAS X!TED X.ASM` comes back to TED after a
  failed build.
- `&` separates only after a blank (a space or a tab) or another separator.
  After it the next piece runs only if the last command did not fail: a
  failure is a code from FF00h to FFFEh, CP/M 3's range, read with BDOS 108.
  `TAS X &X` runs `X` only if the build succeeded.
- An `&` inside a word is text: `OK&TYPE` is one name, and a tail such as
  `MBASIC /M:&HE000` passes whole.
- A run of separators and blanks is one separator. It is conditional when it
  holds only `&`, and unconditional when it holds any `!`: `A &&B` is
  conditional, `A &!B` and `A !&B` run B.
- A skipped piece leaves the code as it is, so the next `&` tests the same
  code: in `A &B &C` with A failing, B and C are both skipped; in `A &B !C`, C
  runs. A skipped piece is not echoed: typed after a failed build, `TAS X &X`
  shows the line, TAS's message and the next prompt, and no `A>X`.
- A refused command and the built-ins' failures (`NO FILE`, `NO SPACE`, a bad
  `REN` and the rest) set FF00h, as they always have.
- Each new line runs whatever the last line returned. A line whose first
  character after blanks and `!` is `&` is refused, `&WORD?` with FF00h, and
  none of it runs: it would test the last line's code.
- Each piece after the first is echoed after its own prompt, up to its
  separator. A piece ends before the blanks that come before its separator, so
  `TAS X &X` gives `TAS` the tail ` X`, and `OK<tab>&X` runs `OK` as `OK &X`
  does.
- A line holds at most 127 characters, typed, from a script or by function 47.
  A function 47 line takes the same rules.
- ^C at a program's line input, a BDOS error's exit and a write lost at warm
  boot drop the rest of the line; so does ^C at `[more]`. Esc and `Q` at
  `[more]` stop only the listing. A drop ends only the current line: a script,
  or the rest of `STARTUP.CMD`, goes on with its next line.

### Two departures from CP/M 3

- `&` is a separator after a blank. CP/M 3 has no `&`, so a CP/M 3 command line
  that holds ` &` is split here.
- CP/M 3's `:` prefix, a conditional command, is gone. `&` takes its place
  between pieces. A piece starting `:` is refused as a bad name, with FF00h.

## `.CMD` scripts

Typed with the shell, `NAME.CMD` runs a script:

1. The file is read from the drive named, else the current one, in the current
   user, with no fallback to A:. With no file the shell says `NAME.CMD?`, with
   FF00h.
2. It is text, read 128 bytes at a time, as many records as it has. It ends at
   1Ah, a zero byte or the end of its last record.
3. A line ends at CR, LF or CR LF. Its first 127 characters are kept; the rest of
   it is read and dropped.
4. Empty lines, lines of only blanks and `!`, and lines whose first character is
   `;` are passed over and not echoed. A `;` after blanks is not a comment: the
   CCP refuses it as a bad name.
5. Each line is echoed whole after the prompt, then runs as a typed line, so no
   startup quiet path holds.
6. Scripts do not nest yet: a `NAME.CMD` piece in a script, or one with pieces
   after it, is refused (`NAME.CMD?`, FF00h) and the next line runs. Text after
   `NAME.CMD` is ignored.

Programs read the keyboard as usual while a script runs, and the shell takes no
typed line until the script ends. The script's record is read again by number
into 0080h at each line, so programs and `COPY` may use 0080h between lines.

## `STARTUP.CMD`

After a reset, and never at a warm boot, the ROM reads the first record of
`A:STARTUP.CMD` and runs its first line that is neither empty nor starting with
`;`: at most 127 characters, ending at CR, LF, 1Ah, a zero or the record's end.
That line has the startup line's quiet paths: a device's absence and the PICO
width line are not refused. A keypad key held through reset skips the file.

When that line installs `SHELL.SVC`, the shell reads the rest of the file, every
record, from the line after it, with the same quiet paths. A later `SHELL.SVC`
line enters the shell again and the file goes on from the line after it. Without
the shell only the first line runs. Typing `STARTUP.CMD` runs the whole file
again, as a typed script.

## The built-ins

- `COPY SOURCE DEST` copies one file, as it did in ROM
  ([compatibility.md](compatibility.md)).
- `DEL` is `ERA` by another name: the shell hands `ERA` to the ROM.
- `SERVICES` lists the residents from the lowest owner up, each name and its
  pages.
- The pager pauses `TYPE` and `DIR` one row before a full screen, with the
  geometry `TNINFO` gives (80 by 24 on the serial terminal).
- The history ring keeps the lines typed at the prompt; ^W shows the one before
  and ^N the one after. A line equal to the newest is not stored again. A
  program's line input is CP/M 2.2's: ^W and ^N go into its buffer.

## Loading, `UNLOAD` and recovery

`SHELL.SVC`'s execution record asks to be entered when it installs, so typing
`SHELL.SVC`, or naming it in `STARTUP.CMD`, installs it and enters it. Its entry
claims the hook. The first entry keeps the table it replaced; a later one, typed
or from a later line of `STARTUP.CMD`, takes the hook back from any shell
installed after it and changes nothing else.

`UNLOAD` removes the lowest resident only. With the shell installed last it goes,
and the prompt returns to the shell or the bare prompt it replaced. Installed
earlier, the services installed after it go first, and the shell keeps the
prompt meanwhile. Its `REMOVE` gives its kept table back only if it holds the
hook; with another shell holding it, the hook stays with that one.

If a shell crashes, hangs or is overwritten, a reset recovers: cold boot clears
the hook and forgets every service, and a key held through reset skips
`STARTUP.CMD`.

## The shell hook

`TNSHELL`, service 16 through `ABICALL` at C008h (`src/abi.inc`, and
[rom-services.md](rom-services.md)), sets the hook. HL is a shell's table, or 0
to give the prompt back. A table must lie in a resident's pages, at or above
`PZTOP`'s page and below the stub's page, and must not cross a page (L at most
F8h); any other nonzero HL returns `TNEBAD` with carry, and the hook is
unchanged. Otherwise it returns HL = the table it replaced (0 for none), A = 0,
carry clear. BC, IX and IY are kept; DE changes. It makes no BDOS call.

The table is four words in the shell's own pages: `LINE`, `PAGE`, `HREC` and
`HSTORE`.

**`LINE`: the next command line.** The ROM calls it at every prompt in place of
its own prompt and line input: after each warm boot, built-in, drive change and
empty line.

- On entry A holds the ROM's flags, which are then cleared: 1 when a function 47
  line is in the buffer, 2 when the rest of the line was dropped (^C at a
  program's line input, a BDOS error, a write lost at warm boot), and 0
  otherwise. B is the lowest owner's page (0 for none) and C the stub's page. DE
  is the ROM's 128-byte line buffer. SP is the CCP's stack, two words below its
  top; a shell takes its own stack at once.
- The last command's code is read with BDOS 108, DE = FFFFh.
- On return: a zero-ended line of at most 127 characters at DE, and A = its
  origin, FFh for a line of `STARTUP.CMD` so that its quiet paths hold, and 0
  otherwise. The ROM writes a zero at the buffer's last byte, then runs the line
  as a typed one. An empty line brings the next prompt. `LINE` must return.
- The first BDOS 10 after a `LINE` call offers ^W and ^N through `HREC` and
  stores the finished line through `HSTORE`. A program's BDOS 10 does neither.

**`PAGE`: the pager.** `TYPE` sends every byte of a file through it, and `DIR`
its row breaks. E is the byte; carry stops the listing. AF, DE and HL change,
and BC on a pause. It is called on the CCP's stack. With no shell the ROM prints
the byte.

**`HREC` and `HSTORE`: the history.** BDOS 10 calls them on the BDOS's stack,
and neither may call the BDOS.

- `HREC`: C = ^W (older) or ^N (newer). Carry: nothing to show. Otherwise HL is
  a zero-ended line of at most 127, which the ROM shows in place of the line
  being typed: it erases that line and copies this one in.
- `HSTORE`: DE is a finished, nonempty line and B its length.

The ROM keeps the table's address in its workspace, not published. The release
sweep in `PZSWP`, at every warm boot and every release of pages, drops a table
lying below `PZTOP`'s page, so a `REMOVE` that leaves the hook gives the bare
prompt back.

A shell's stack declarations are a share of the loader's allowance, `SVCLIM`'s
8 (BDOS), 12 (BIOS) and 6 (CCP), summed over the residents. `SHELL.SVC` declares
6, 0 and 0 and `GLCD.SVC` 2, 0 and 6, so together they take the whole of the
BDOS's and the CCP's. A second shell beside both must declare none on either.

## Enter on install

A service's execution record ([services.md](services.md)) has state bit 1, set
in the file, when the service asks to be entered as it installs. Typing
`NAME.SVC [tail]`:

1. enters the one installed service whose ready record has bit 1 and holds
   `NAME`, reading no file;
2. refuses two or more such copies, `NAME.SVC?` with FF00h;
3. otherwise installs the file, then enters it if its record has bit 1, or
   removes it and refuses the line if its `INIT` never set ready.

The entry gets A = FFh when the line came from `STARTUP.CMD`, else 0, and the
tail as a `.COM`'s. A service with no record, or with bit 1 clear, installs
only, and each typing installs another copy. No switch is parsed: an old
`NAME.SVC /E` line enters the service with `/E` as its tail.
