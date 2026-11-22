# TMON design plan

TMON is a proposed resident TEC-OS debugger for ordinary CP/M programs.
It owns the character LCD and matrix keyboard while stopped. The program
stays in the TPA and keeps its 9918 display. MON3.SVC remains the
console-based MON-3 compatibility service in TEC-OS. Thorium, alongside
TAS and TED, is the proposed home for TMON.SVC. Share statically linked
decoder and memory routines where practical. TEC-OS owns the polled
break interface and service lifecycle.

TMON should feel like a debugger alongside the machine. A stopped game
can still be seen on the 9918 while its CPU state is inspected on the
LCD. This avoids saving and restoring up to 16 KB of VRAM plus video
state on every stop. While execution is stopped, the LCD and keyboard
are the working surface. When execution resumes, keyboard control returns
to the program. A program that also uses the character LCD needs an
explicit ownership and redraw policy. Test this with an LCD-using .COM
before promising transparent handback.

The service is useful for both a program you are writing and a binary
you are trying to understand. The ordinary workflow should work with
only the executable. Symbol information can make addresses easier to
recognize later. The primary interaction is navigating views and
selecting actions, with short text fields for the few actions that
need an address, a value, or a filename. Serial is lower priority.
Consider optional diagnostic output such as a stop reason, saved
registers, or a memory excerpt. Keep logging bounded or user-triggered
so it does not dominate stepping time. Serial control can be revisited
after the LCD workflow is proven.

## Launch and regain control

1. Start with an explicit TMON launch of a normal .COM. Reuse the TEC-OS
   launch conventions for address 0100h, command tail, FCBs, stack and
   exit. Set up the initial stopped context before the first instruction.
   Keep the service and its private stack above the TPA.
2. From the LCD, single-step or toggle a breakpoint and run at full
   speed. Restore the original instruction byte and bring control back
   with the program still in memory. Preserve the saved CPU and interrupt
   state on resume. Use a small .COM in the Viewer to verify entry, step,
   breakpoint, resume, and normal exit. Check that the monitor leaves the
   9918 untouched throughout.
3. Add a TEC-OS roadmap item for one polled break chord. An installed TMON
   registers it and removes the binding on unload. The shared matrix
   routine latches one request per press. TEC-OS delivers it on a safe
   return to the program, once active OS work has unwound. Test normal
   program launch, chord, LCD stop, breakpoint, and resume. A shared
   matrix call is required to see the chord. Direct port readers and
   loops that skip polling can use preset breakpoints.
4. Explore Restart as a fresh launch with the original file and arguments.
   Determine how to record launches through the normal shell before
   offering Restart after a hotkey stop. Breakpoints can be reapplied
   after a successful reload. External effects such as file writes
   survive a restart. Measure coexistence with SHELL.SVC before deciding
   whether an optional launcher replaces it in low-memory setups.

### Two ways in from the normal shell

- **Arm the next launch.** From the normal prompt, use a chord or an
  explicit arm action, then type the usual program command. A one-shot
  loader handoff would stop the next successfully loaded .COM at 0100h
  before it executes, with the usual arguments intact. Compare a CCP
  launch hook with a SHELL.SVC integration and see which callers each
  covers. Prefer handing TMON the prepared entry context if the loader
  can supply it. An entry breakpoint is another option if the launch
  path exposes a suitable trap. Define what happens when a load fails
  and provide a visible way to cancel the armed state.
- **Break into an existing run.** Start the program normally and press
  the polled chord when you want to inspect it. Bring up the LCD at the
  first safe handoff. Validate that the chord is consumed once, that
  the next normal key still reaches the program, and that the monitor's
  own keyboard polling cannot request a nested stop. A general binding
  registry can follow if more services need it. There is no dependency
  on a periodic housekeeping interrupt for this path.

A typical session starts stopped at 0100h. Read forward, select an
interesting loop, toggle a breakpoint, and run the game at full speed.
When execution reaches the selected address, inspect the registers or
memory and continue the same run. Start with address-based execution
breakpoints. Treat conditions, hit counts, and breaks on memory access
as design questions. Timing and feasibility on real hardware need
checking before any of those become milestones.

### Execution semantics

Start execution work with Step Into and breakpoint toggling. Add Step
Over and Step Out after testing calls, conditional branches and returns.
A temporary breakpoint strategy needs explicit handling for targets in
ROM, self-loops, and any instruction that would overwrite the trap.
An interrupt-driven break is later work. Keep the selected Code row
distinct from PC so browsing and breakpoint placement never move the
execution point. Define Step Over as continuing past a call and Step
Out as stopping when the current invocation returns. Exercise nested
calls, recursion, and conditional returns before claiming those
operations work generally. Breakpoint removal, program exit, and
service unload must leave the original bytes and any claimed vectors
in a consistent state.

## TEC-OS facilities for resident input and debugger entry

A resident service sits above the TPA while the transient program owns
the CPU. TDB needs three facilities from TEC-OS: a way to request entry,
a safe handoff with the interrupted context, and temporary exclusive
keyboard input while the service is active. The following is a proposed
OS contract. Exact ABI names and entry points are open.

### Request entry while the program runs

- **Register a chord with an owner.** Start with one binding associated
  with a loaded service. Detect conflicts, allow removal, and clear
  registration and pending requests on unload or reset. A recognized
  chord is consumed before console translation and ANSI arrow queuing.
- **Use the common matrix scan.** Both the console status poll and the
  blocking read reach the matrix scanner. Match the supported modifier
  and key on a completed scan, and latch one request per press. The
  current scanner compares the last ordinary key with KBLAST, so test
  modifier-first and key-first presses before choosing chord semantics.
  The scanner records a request and continues its OS work.
- **Provide a safe transfer point.** For a transient program, capture a
  resumable context at the program boundary after OS work unwinds.
  Preserve the pending console call's state. In particular, a chord
  inside a blocking read should enter the debugger without fabricating
  a character or waiting for another key. On resume, the read should
  finish normally. Decide how the CCP prompt handles the same request.
  An arm-next-launch action there could use a separate loader hook.
- **Keep explicit entry available.** A launch hook and an execution
  breakpoint cover programs that bypass the shared scan or never poll.
  A future interrupt source can post to the same request mechanism once
  TEC-OS has a suitable interrupt and context contract.

### Take the keyboard and give it back

While stopped, let the service claim a matrix event stream and poll it
from its own stack. Provide key identity and supported modifiers so the
debugger can handle arrows, Tab, and release or repeat consistently.
Keep the foreground program's translated input and any queued arrow
suffixes separate from the service's keys. Mask the activation chord
during capture so the service cannot interrupt itself.

On Continue, exit, or abort, release the claim and synchronize held-key
state so a debugger key cannot turn into a fresh program key. Preserve
ordinary input already queued for the program where possible. Review
the existing KBLAST handback convention used by MON3.SVC alongside
RXFULL and the pending arrow bytes before choosing the implementation.
Treat LCD ownership separately from keyboard ownership. The debugger
uses the LCD while the program's 9918 display stays active.

### Acceptance cases for the TEC-OS handoff

Use the Viewer to verify a console status poll, a blocking read, and the
normal shell prompt. Hold and release the activation chord, type inside
the debugger, then resume and confirm the program receives its next
ordinary key exactly once. Exercise unload, warm boot and an aborted
session to check that ownership and pending requests are cleared. Test
a directly polling program with an explicit breakpoint to verify the
alternate entry path.

## LCD views

| View | Interaction |
| --- | --- |
| Code | One address and decoded instruction per row. Scroll by instruction, select a row to toggle a breakpoint, or jump back to the saved PC. Browse from an arbitrary address or saved pointer. Keep known instruction boundaries when scrolling back. |
| Registers | Two columns of four entries for PC, SP, AF, BC, DE, HL, IX and IY. Highlight the selection and indicate recent changes. Enter on PC opens Code. Enter on a pointer opens Memory. Edit uses a separate action. Alternate pairs and I/R can live on a lower-priority page. |
| Memory | Four aligned bytes per row, with the selected byte marked and neighboring rows visible. Left/Right moves a byte and Up/Down moves a row. Holding an arrow repeats. Keep one fixed-address view and pointer views for BC, DE, HL, IX, IY, SP and PC. SP can highlight the two bytes at the top of the stack. Follow the saved pointer on each stop while retaining any browse offset. Back restores the selected register. |
| Commands | A scrolling list of named actions with shortcuts beside them where space permits. Offer launch, go to address, breakpoint and execution actions from here as appropriate to the current state. |
| Help | A short scrollable key reference, accessible from any view. |

### Fit and navigation

On a 20×4 LCD an eight-character field such as `PC: 0100` leaves room
for two fields and a selection mark per row. In the two-column register
list, try moving down through the first column and then the second.
Left and Right can provide a direct move between columns. The main
registers fit on one page. Save a separate selection for each view
and make Back from a pointer view return directly to the Registers
selection that opened it.

A classic MON-3 memory row such as `4000: 21 34>12 C9` takes 17
columns. The marker occupies the separator before the byte. Try that
marker or LCD reverse video if the hardware supports it. Display
four-byte aligned rows before and after the selection where the address
range allows. Memory stays fixed when you watch an absolute address.
A register-relative view can follow changes after each step. For
example, a PUSH moves SP and the stack view then highlights the newly
pushed little-endian word. Recenter returns a scrolled pointer view to
its current saved address.

Code and Memory share addresses. Code scrolls by variable-length Z80
instruction and Memory scrolls by bytes or rows. A Code row such as
`4000: LD A,34` leaves 14 columns after the address prefix for decoded
text. Provide a way to view operands that need more room. Use Memory
for the raw bytes and let a jump from Code highlight the first byte of
the selected instruction. Decode forward from a known address. Going
backward from an arbitrary byte can land inside an instruction, so
retain boundaries from the current browse session.

Classic MON-3 provides a useful reference for a title and three scrolling
menu items, selection marks, nested menus, and compact data views.
TMON should update changed LCD cells when practical. A future 40×4 LCD
can show more context with the same navigation.

## Keyboard and text input

Try Tab and Shift+Tab to switch views. Arrows move the selection.
Enter opens or follows it, Esc goes back or cancels, and Space toggles
a breakpoint on a selected Code row. Try R for Run, S for Step Into,
E for Edit, and H for Help. Verify which keys and chords are exposed by
the matrix and the Viewer before fixing the bindings. Keep execution keys
consistent across Code, Registers and Memory. A step updates the active
view, so a user can watch SP or another pointer without leaving Memory.
The matrix keyboard has a Fn modifier. Make the main path usable with
ordinary arrows, Tab, Enter, Space, Esc, and a few mnemonic letters
before assigning modifier chords. Commands and Help give a discoverable
route to the same actions. Try the key map in the Viewer with someone
who has never used TMON, then adjust it based on which actions they
find and which shortcuts they remember.

Use a temporary TED-style input row for Go to, register edits, and
breakpoint addresses. Prefill an edit with the current value. Enter
validates and commits. Esc restores the previous row and selection.
Accept hex addresses and explicit saved-register references such as
@DE in both Memory and Code. Plain DE is hexadecimal 00DEh. Reserve
QWERTY shortcuts for navigation mode while the input row is closed.
Keep invalid input available for correction. Use one row in most
cases and borrow a second only when the prompt needs it. The focused
view should still identify the item being edited. The console view
discussed earlier can wait until the menu and edit row have proved
insufficient for a concrete task.

## TAS debug metadata and annotated disassembly

Inspect the existing TAS .DBG format before extending it. For TMON the
first useful addition is an optional symbol table with the resolved
address and original name of each label or named data location. Keep
constants distinguishable from address labels where TAS can supply
that distinction. Up to eight-character TAS names such as LOOP3 can
work in Go to, breakpoint fields, and operand display. Define a way
to disambiguate symbols that look like hex, and preserve the numeric
address when a symbol is missing or several labels share an address.

Look for a matching sidecar when launching an executable and allow
manual selection as well. Tie the metadata to the exact executable
and its address layout so stale labels or comments cannot be applied
silently. A binary without metadata still supports the full numeric
debugging flow. Keep richer metadata opt-in and measure assembler
time, sidecar size, and the resident RAM cost before choosing defaults.
Consider indexed sections so TMON can read annotations for the current
address range as needed.

A richer TAS output could attach source comments to emitted address
ranges and record which ranges came from data directives. That would
let Code show a label on a row of its own, substitute names into
operands, and place comments to the right of the instruction. The
20-column LCD could scroll horizontally to the comment or use a
detail row for the selected instruction. A symbolic layout could
temporarily hide the address column to make room for names. Keep the
numeric address available for breakpoint placement and comparison
with Memory. A 40-column LCD can show more of the same annotation
at once. Instructions still come from the live bytes, so edits and
self-modifying code are visible. Mark or suppress original annotations
when the corresponding bytes have changed. Test this presentation in
the TEC-OS Viewer before trying it on hardware.

### TAS coding-agent wishlist

Keep this list in the plan until the debugger prototype shows which
writer changes are worth doing. Start symbol lookup with the existing
TAS globals. TAS and its debugger reader can move together under one
agreed format contract, with matching fixtures and tool updates.

1. **Pair metadata with the executable.** Make the sidecar easy to
   discover when TAS builds a differently named output or writes it
   to another drive. Agree on the naming rule with TED and the debugger.
   Record the image origin, exact byte span, and a fingerprint stronger
   than the current byte sum. Define how to exclude CP/M record padding.
2. **Make local symbols unambiguous.** Record each private label's scope
   owner explicitly. Preserve label versus equate, aliases, and several
   names at the same address. Keep eight-character TAS names for now.
3. **Keep debug generation cheap.** Measure the time and disk writes for
   a normal and an include-heavy build. Consider a switch to omit the
   sidecar while preserving TED's build-and-debug workflow. Include
   failed builds and stale sidecars in the tests.
4. **Add listing metadata when needed.** Record exact emitted spans so
   TDB can distinguish code, data, and reserved gaps. Try reading
   comments from the original source through the existing map first.
   If portable annotations prove useful, consider an optional comment
   payload and a way to verify the source matches the build.

Conditional breakpoints and watch expressions can use the same
symbols. Their syntax and evaluation belong in the debugger.

### Breakpoint conditions and watches

Once address breakpoints work, consider a small shared expression
evaluator for saved registers, symbols, hex values, and explicit
byte or word reads. A condition is evaluated when its execution
breakpoint is reached. If it is false, TMON resumes, so a frequently
hit conditional breakpoint can still slow execution. A watch
expression displays its value at each stop or step. Continuous
monitoring and breaking on a memory write are separate features.
Start by testing useful cases such as stopping at LOOP3 only when
BC is zero, or watching the byte at a named counter.

## Existing Thorium TDB

A review of Thorium at `78c224e` suggests the LCD debugger could be the
next TDB. Keep TMON as the working name while deciding how to ship the
service and the existing TDB.COM.

- **Reuse candidates.** `TDECODE` returns a structured instruction record
  with length, operands and control flow. `TSUCC` uses that record and
  saved registers to compute step targets. Review their boundary cases
  in the Viewer before adopting them as a pair. The listing's operand
  formatting and symbol lookup are worth mining for the LCD views.
- **Adapt run control.** TDB already starts a .COM stopped at 0100h,
  builds the CP/M command tail and FCBs, saves machine state, patches
  and restores breakpoint bytes, and computes temporary step targets.
  Carry those behaviors and test cases into the service. Rework vector
  ownership, saved-context handoff, warm boot and unload around TEC-OS
  service conventions.
- **Replace the front end and deployment.** Use the LCD views, direct
  matrix keys and edit row in place of the command-driven console UI.
  Use the TEC-OS service loader in place of the standalone .COM
  relocator and its fixed BDOS and BIOS placement assumptions.
- **Start symbols with the current TAS format.** Existing TDB reads
  format 1 and refuses the format 2 emitted by current TAS. Review
  existing indexes and record caching for ideas, then start with
  format 2 symbol lookup. Comments and source reconstruction can wait.

### Execution baseline

Built the pinned Thorium TDB.COM at 78c224e and ran it in the headless
TEC-OS emulator with a 13-byte .COM and no debug sidecar. The run stopped
at 0100h, stepped through LD HL, PUSH and POP, stepped over a call, and
ran a branch to a breakpoint at 010Ch. Checked SP and the two bytes of
the pushed word directly in RAM, verified that TDB restored the original
RET opcode at the breakpoint, then resumed and quit to the CCP.

The standalone build matched Thorium's recorded 9,221-byte artifact
and reported an 8,184-byte resident body including variables, before
its separate debug arena. This baseline covers the existing console
debugger. The resident service and LCD/keyboard workflow still need
their own Viewer validation.

## References

- [Original MON-3 LCD data and disassembly views](https://github.com/jhlagado/debug80-tec1g-mon3/blob/000c052/roms/tec1g/mon-3/mon3.z80#L760)
- [Original MON-3 menu driver](https://github.com/jhlagado/debug80-tec1g-mon3/blob/000c052/roms/tec1g/mon-3/mon3.z80#L2682)
- [TEC-OS service conventions](services.md)
- [Thorium TDB implementation notes](https://github.com/jhlagado/thorium/blob/78c224e/docs/tdb.md)
- [Thorium TAS debug file format](https://github.com/jhlagado/thorium/blob/78c224e/docs/format.md)
- [TEC-OS keyboard scanner](../src/keyboard.asm)
- [TEC-OS console input paths](../src/console.asm)
