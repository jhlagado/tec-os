<!-- Maintained copy of the TEC-OS specification. Decisions adopted against it
are recorded in decisions.md; this text keeps its original status labels. -->

# TEC-OS project specification

Implementation brief  
Draft 1.0 · 24 October 2026

## 1 Purpose and authority

Build TEC-OS for the TEC-1G: a ROM-resident operating system with CP/M 2.2 application compatibility, SD-backed virtual disks and a separate bank-aware native application interface. The first useful result is a bootable system that runs a classic COM program, saves a file and reopens that file after reset. Native banking follows as a separate, observable milestone.

This is an implementation specification with explicit decision gates. It does not claim that a ROM build, hardware driver or compatibility suite already exists. The implementation must verify the hardware and source baseline before assigning ports, selecting banks or finalising addresses.

**Status labels apply throughout.** Confirmed means stated in the governing request or the recoverable conversation. Derived means a technical consequence of those requirements. Proposed means a recommended implementation choice awaiting adoption. Open means evidence or a decision is missing. Proposed details must not silently become historical requirements.

**Source limitation.** The retrieved design conversation, “Discuss CPM 3”, contains five visible request turns. Its replies contain reference markers rather than readable text. The governing request therefore governs the detailed memory and storage goals. The recovered text confirms TEC-OS as the name, identifies stack hazards during banking and suggests a constrained stack in fixed low RAM. It also states that bank-aware applications need not work with classic CP/M applications. No unavailable reply has been reconstructed as fact.

## 2 Confirmed requirements

| ID | Requirement | Authority |
| --- | --- | --- |
| R01 | Name the project TEC-OS, with no slash | Recovered conversation |
| R02 | Target the TEC-1G and provide ROM-resident CP/M 2.2 compatibility | Governing request |
| R03 | Use 32 KiB fixed RAM at 0000h–7FFFh | Governing request |
| R04 | Use a 16 KiB banked RAM window at 8000h–BFFFh | Governing request |
| R05 | Use 16 KiB ROM at C000h–FFFFh | Governing request |
| R06 | Boot through a 2 KiB ROM overlay at zero | Governing request |
| R07 | Provide SD virtual volumes and a PC-managed container | Governing request |
| R08 | Define a bank-aware native ABI and address memory and stack safety | Governing request |
| R09 | Treat CP/M 3 features as optional scope | Governing request |
| R10 | Native bank-aware applications need not interoperate with classic applications | Recovered conversation |
| R11 | Use ATOM for assembly source, generated artifacts and production builds | Development instructions |

R10 permits separate execution profiles. It does not establish multitasking, concurrent execution or a requirement for separate filesystems. A fixed native stack in low memory is a supported direction, but its address and size remain open.

## 3 Scope and first release

**Proposed release boundary.** Implement one foreground application at a time. Provide a ROM command processor, CP/M-compatible disk services, console I/O, a COM loader, SD block access and PC tools for preparing and inspecting virtual disks. Define the native ABI before loading native applications, but complete classic file persistence first.

The core operating-system executable code belongs in ROM. Writable state belongs in RAM. ROM residency does not mean zero RAM overhead or that unmodified CP/M source can execute from ROM. Audit mutable code, embedded variables, relocation assumptions and self-modification before choosing an existing implementation or writing a compatible replacement.

Do not make full CP/M 3 binary compatibility, a 64 KiB writable address space, arbitrary CP/M application compatibility or hardware memory protection release claims. These capabilities are not established by the requested architecture. Preserve extension points for later work without charging their speculative code to the first release.

## 4 Hardware and address space

| CPU addresses | Size | Runtime role | Status |
| --- | --- | --- | --- |
| 0000h–07FFh at reset | 2 KiB | Boot ROM overlay over low addresses | Confirmed window, exact mapping open |
| 0000h–7FFFh after overlay removal | 32 KiB | Fixed RAM shared across bank changes | Confirmed |
| 8000h–BFFFh | 16 KiB visible | Selected RAM bank | Confirmed |
| C000h–FFFFh | 16 KiB | Resident operating-system ROM | Confirmed |

**Derived capacity.** After overlay removal, the CPU can address 48 KiB of writable memory at once. Total physical RAM is 32 KiB plus N × 16 KiB, where N is the number of distinct installed banks. N is not yet specified. A 16 KiB window describes the visible size, not total expansion capacity. ROM remains outside the writable application space.

The TEC-1G hardware repository describes a default 32K RAM and 16K ROM configuration with shadowing and expansion options. It does not establish the exact target bank controller or fitted expansion. Treat the requested map as the project contract and verify its implementation against the actual board revision. [TEC-1G hardware repository](https://github.com/MarkJelic/TEC-1G)

**Open hardware contract.** Record board revision, CPU clock, installed memory, bank count, reset bank, bank-select encoding, port decoding, shadow-disable control, ROM aliasing, RAM write protection and interrupt wiring. Verify whether bank selection is readable and whether control bits share a latch with unrelated hardware. Preserve unrelated latch bits using an authoritative shadow value when necessary.

Also record console hardware and terminal convention, SD interface and signalling, card initialisation requirements, reset behaviour and NMI sources. Existing MON-3 RAM reservations are not automatically TEC-OS reservations. Reusing monitor services requires an explicit residency and workspace agreement.

## 5 Reset and warm boot

**Proposed cold-boot sequence.**

1. Enter through the overlay reset vector. Establish the maskable-interrupt policy and avoid stack operations until writable stack memory is available.
2. Transfer execution to the permanent ROM mapping before removing the low overlay. Confirm that the next instruction fetch remains valid across the control write.
3. Establish a temporary stack in verified fixed RAM outside the overlay. Do not assume writes through the active overlay reach underlying RAM.
4. Disable the overlay, initialise fixed RAM state and establish the selected execution profile. Install page-zero vectors and interrupt entry state before enabling any relevant interrupt source.
5. Initialise console and SD with bounded waits. Validate the container and mount the default virtual volume only after bounds and geometry checks.
6. Enter the ROM command processor. An absent or invalid card should leave a usable diagnostic console where the configured hardware permits it.

The exact ordering of steps 2–4 depends on overlay and NMI behaviour. Prove the sequence using the verified hardware contract, including a reset with a non-default prior bank. Do not use CALL, PUSH or interrupt entry with an uninitialised or ROM-backed stack.

**Proposed warm-boot contract.** Return through a fixed mapping, restore the classic bank and stack, rebuild required vectors and reset transient application state. Define current drive and user-area handling. Complete pending storage writes before a controlled restart where possible. A physical reset may interrupt a write and must follow the documented recovery policy. ROM code does not require reloading from disk, but RAM state still requires reinitialisation.

## 6 Classic CP/M compatibility

### 6.1 Compatibility contract

**Confirmed target, proposed measurable definition.** Run unmodified COM applications that use the documented CP/M 2.2 interfaces, fit the advertised transient program area and match the available terminal. Define compatibility by behaviour rather than by the identity of an internal BDOS implementation.

Implement the documented CP/M 2.2 BDOS calls through function 40 with their parameter and return conventions. Preserve reserved function numbers 38 and 39 and the documented out-of-range behaviour. Publish function-level status during development. Cover console and auxiliary devices, disk selection, FCB file operations, sequential and random records, directory search, user areas, attributes and disk state. Unsupported physical devices need documented CP/M-consistent behaviour rather than accidental hangs. Report the 2.2 version in the classic profile. [Digital Research CP/M operating-system manual](https://www.icl1900.co.uk/unix4fun/z80pack/cpm2/ch5.htm)

Maintain the base-page contract: warm boot at 0000h, the BDOS vector at 0005h, default FCB locations at 005Ch and 006Ch, and the command tail/default DMA area at 0080h. Load COM programs at 0100h. Preserve IOBYTE and current-drive semantics. Provide the standard BIOS jump-table shape for software that follows the warm-boot vector to discover it. Hardware-specific binaries and programs that patch BDOS internals require separate qualification. [Digital Research alteration guide](https://www.icl1900.co.uk/unix4fun/z80pack/cpm2/ch6.htm)

The command processor should provide DIR, TYPE, ERA, REN, SAVE and drive selection with documented syntax, plus COM loading and command-tail/FCB setup. Establish the exact CCP compatibility target before claiming batch-command or SUBMIT compatibility.

### 6.2 Writable top of memory

**Derived hazard.** Code residency and the advertised application limit are different contracts. A CP/M program may use the BDOS vector to derive an upper memory boundary or initial stack position. A vector into ROM can produce an unusable writable limit. A smaller initial SP supplied by the loader does not solve programs that calculate their own SP.

**Proposed solution.** Reserve a page-aligned region at the top of the classic writable area. Put a BDOS entry stub at its lower boundary and point 0005h there. The stub transfers control to ROM. Allocate resident writable workspace and the OS stack above the advertised TPA limit. Keep the BIOS-discovery path coherent with the chosen layout. Final addresses depend on an assembled byte and RAM census.

An illustrative reservation starting at B000h would leave 0100h–AFFFh, or 44,800 bytes, for the TPA. This is an example, not an adopted address or a compatibility claim. A stack initially set to B000h grows into application RAM. Reserving RAM at B000h reduces capacity from the theoretical 48 KiB and places classic OS workspace in the selected bank.

**Proposed first-release restriction.** Keep the classic bank selected throughout ordinary CP/M operation. The SD driver must not switch it out while executing on a classic stack or reading classic FCB/DMA pointers. If future code needs another bank, first establish fixed code, stack and context storage, then copy through fixed buffers and restore the original mapping before returning.

Test programs that initialise SP from the BDOS vector, discover the BIOS through page zero, use the default DMA buffer and terminate by RET, warm boot and BDOS function 0. Do not infer compatibility from a single console-output demonstration.

## 7 ROM and RAM accounting

**Derived ROM ceiling.** The full ROM image must fit 16,384 bytes. Count reset code, kernel, CP/M services, command processor, SD driver, native entry code, constants, tables, diagnostic text and padding. Determine whether the 2 KiB overlay aliases bytes in that same image or requires another physical image. Do not assume 18 KiB of independent code capacity.

Publish separate accounts for ROM code, immutable data, fixed RAM state, bank-resident state, transfer buffers, application capacity and each stack. Include interrupt nesting and error paths in stack measurements. Mark projected budgets as estimates until ATOM emits the image and symbol map.

**Proposed profile separation.** Classic mode reserves RAM to match the advertised CP/M boundary. Native mode uses an explicit low-memory layout with bounded application and OS stacks. A mode transition reinitialises the layout through ROM and abandons the previous application. Avoid allocating native fixed workspace invisibly inside a classic COM program’s contiguous TPA.

Use build-time assertions for region overlaps, entry-table placement, image size and stack reservations. ROM-resident routines must not write their own code, literals or tables. Trace every writable object from source to its allocated RAM region.

## 8 SD virtual volumes and the PC container

### 8.1 Storage layers

**Confirmed goal.** A PC manages a container that holds SD-backed virtual volumes for TEC-OS. **Open format decision.** The request does not establish whether the container is a normal host-filesystem file, a raw partition region or another representation. Select this before implementing sector translation.

**Proposed baseline.** Use a host-managed, contiguous raw SD region containing a versioned header and fixed-offset virtual-disk payloads. A PC utility creates and updates the container and installs it to the card. TEC-OS reads the header and volume data without implementing a host filesystem. This reduces ROM cost but requires the PC tool to identify the target region safely. It is a proposal, not a recovered conversation decision.

**Alternative.** A named container file on FAT is more convenient for desktop copying. It adds filesystem code or a verified extent-discovery mechanism. Treat fragmentation, relocation and host edits explicitly. Never assume a file stays at a constant LBA after a desktop copy. Compare both designs for ROM bytes, RAM, usability and failure recovery before adoption.

Keep the layers distinct: CP/M records and directories, virtual-volume geometry, container byte offsets, then physical SD blocks. A classic CP/M volume should retain a documented CP/M directory and allocation format so the PC utility can exchange its files. A container header is outside each CP/M payload.

### 8.2 Container contract

**Proposed fields.** Define magic bytes, format version, byte order, header length, integrity check, volume count and descriptor size. Each descriptor records a stable volume identifier, payload offset, payload length, geometry/profile identifier and read-only flags. Specify byte widths and units in a separate adopted binary-format contract before generating media.

Reject unknown mandatory versions, bad integrity checks, duplicate invalid identifiers, overlapping payloads, misalignment and truncated regions. Compute bounds without integer wraparound. A CP/M drive letter is a mount assignment, not necessarily the permanent identifier. Freeze the initial drive count and geometry only after calculating directory and allocation-vector RAM costs.

Validate each volume’s disk parameter block against its payload capacity. Publish record numbering, track/sector translation, allocation block size, directory capacity, extent rules and any reserved tracks. Never derive a write address from unvalidated geometry.

### 8.3 Records and physical writes

**Proposed driver rule.** Adapt CP/M’s 128-byte logical records to the verified SD block interface. For a 512-byte block interface, four logical records share a physical block. A partial update needs a correctly keyed read-modify-write buffer unless the whole block is already authoritative. [Digital Research blocking and deblocking algorithms](https://www.icl1900.co.uk/unix4fun/z80pack/cpm2/axg.htm)

Key a cache entry by volume and physical block. Flush before replacement, media reassignment and successful completion boundaries defined by the write policy. Honour directory-write and unallocated-block hints only after their CP/M semantics are verified. Never overwrite adjacent records with stale buffer contents.

**Proposed first-release policy.** Prefer synchronous write-through for predictable visibility and a small dirty-state model. Complete and check the SD operation before reporting BIOS success. This does not make a directory/allocation update atomic across power loss. Document the resulting corruption window, recovery procedure and any unverified card-internal durability behaviour. Add journalling only through a separate costed decision.

Use finite initialisation and I/O timeouts. Propagate failed reads and writes through the appropriate compatibility interface. Reject read-only writes and out-of-range requests before modifying media. Define card removal as an I/O failure requiring remount or restart, rather than silently continuing with cached geometry.

### 8.4 PC management workflow

**Proposed utility commands.** Create, inspect, verify and list containers and volumes. Import and export files with explicit drive/user selection. Support 8.3 naming, attributes, CP/M record padding and text-versus-binary transfer choices. Provide format and volume replacement as deliberate destructive operations with backups or atomic output-file replacement where the host permits it.

Use one authoritative geometry/format definition for firmware and host tools. Validate host changes before replacing a container. Document that the PC and TEC-OS must not write the same mounted volume concurrently. The acceptance workflow is PC import, TEC-OS read and edit, clean completion, reset, then PC export and comparison of defined file bytes.

## 9 Bank aware native ABI

### 9.1 Execution model

**Confirmed direction.** Native applications can use banking without classic application interoperability. **Proposed ABI v1.** Run one native application with an explicit fixed-RAM allocation, a bounded stack in fixed low RAM and a set of granted banks. Define native loading and termination separately from the classic COM contract.

Use a versioned ROM entry table with a signature, ABI version and capability query. Exact addresses, service numbers and executable format remain open. Publish the entry mechanism, argument registers, preserved registers, flags, error results, permitted interrupt state and re-entrancy policy for every service. Do not make native service discovery depend on the classic TPA boundary stub.

### 9.2 Bank and pointer rules

**Proposed services.** Query bank capacity, reserve/release banks, copy between banks, invoke code in a bank and return to the launcher. Provide console and file services directly or through explicitly documented wrappers. Begin with managed operations rather than unrestricted application writes to the bank latch.

A near pointer is valid only in its documented mapping. A far pointer includes a bank identifier and an address or offset with an explicit length. Validate the bank, ownership and range before use. Define fixed RAM and ROM pointer forms separately. Reject transfers across 8000h or C000h unless the service explicitly splits them. Specify zero-length behaviour and overlapping-copy semantics.

A bank selector must execute outside the switched window. A call into another bank must save the original bank and return context in fixed memory, select the destination, invoke it and restore the source before returning to its address. A plain RET cannot restore a previous mapping. Validate nested calls against a bounded context capacity and preserve the caller’s bank on every recoverable error.

Transfers between two banks visible through the same window require a fixed-RAM bounce buffer or an equivalent proven mechanism. Buffers, saved SP values and bank-call frames must remain accessible during both mappings. A file service must capture the intended bank with each buffer descriptor so later selection cannot redirect an outstanding operation.

### 9.3 Interrupts and transitions

**Proposed initial policy.** Native services are non-re-entrant. Interrupt handlers do not call filesystem or bank-management services. Bank updates use short critical sections with a defined interrupt-enable restoration rule. Interrupt entry code, required data and stack storage remain in fixed mappings.

DI does not suppress NMI. Verify whether the target can generate an NMI during bank or overlay transitions. Either support it with a fixed-vector handler and stable stack or establish a hardware condition that prevents it. Define IM mode and vector ownership before enabling interrupts.

Termination returns through ROM, restores a known bank and stack, completes the storage policy and releases application banks. A crash or stack-guard failure uses a recovery path that does not depend on the damaged application stack. Returning to classic mode rebuilds the classic memory contract.

## 10 Memory and stack safety

The Z80 PUSH and CALL instructions decrement SP. A fixed-location stack still grows downward. The low-memory proposal fixes its reservation and bounds rather than changing the processor’s stack behaviour.

**Proposed native layout rule.** Reserve separate ranges for page zero/vectors, kernel state, OS stack, native application stack, transfer buffers and application fixed data. Assign symbolic bounds only after a RAM census. Set the initial SP at the exclusive upper bound of its allocation. Keep every active native stack entirely below 8000h and outside the boot overlay while it is active.

Check lengths and address arithmetic before writes, including FCB/DMA transfers, command tails, filename conversion and loader bounds. Count return addresses, saved registers, nested bank calls, interrupt frames and worst-case error handling in stack capacity. Service entry must preserve the original caller SP before switching stacks.

Use guard bytes and high-water measurements in diagnostic builds. Guards detect some overruns after they occur and do not provide hardware isolation. Native code can still corrupt RAM or I/O when it violates the ABI. Avoid presenting software ownership checks as protection against arbitrary application instructions.

Test each boundary with exact bytes and return state: the first and last valid address, zero length, one byte beyond capacity, wrapping lengths, ROM destinations, invalid banks, full bank-call depth and a damaged stack guard. Check SP, restored bank, return PC and interrupt state after success, failure and abort.

## 11 Optional CP/M 3 features

CP/M 3 is optional feature inspiration unless a separate compatibility target is adopted. Its banking model is not established merely by having a switchable window. A port needs a fresh placement and BIOS assessment against this machine’s fixed low RAM, middle window and upper ROM.

| Candidate | Proposed treatment | Dependency or cost |
| --- | --- | --- |
| Additional disk buffers | Consider after baseline correctness | Bank-safe copies, RAM and flush policy |
| File timestamps | Optional extension | Clock source, directory format and host-tool agreement |
| Richer console or device configuration | Separate extension | Interface and ROM budget |
| Extended file attributes and passwords | Defer | Format compatibility and defined semantics |
| CP/M 3 application calls or RSX support | Separate compatibility project | New APIs, loader and memory model |

Digital Research documents both banked and nonbanked CP/M 3 systems and additional file metadata facilities. These are reference capabilities, not confirmed TEC-OS requirements. Do not report a CP/M 3 version until the corresponding public contract is implemented and tested. [CP/M Plus Programmer’s Guide](https://www.bitsavers.org/pdf/digitalResearch/cpm_plus/CPM_Plus_Programmers_Guide_Jan83.pdf)

## 12 Implementation sequence and acceptance

All milestone details below are proposed acceptance criteria for the confirmed goals. Maintain a requirement-to-test map and report measured results separately from expectations.

| Stage | Deliverable | Evidence required |
| --- | --- | --- |
| M0 | Verified hardware and source contract | Ports, reset state, bank count, overlay behaviour, console/SD interface and adopted decisions |
| M1 | ATOM ROM boot and diagnostic console | Reset overlay exit, fixed stack, repeated cold/warm starts and ROM/RAM map |
| M2 | Container tools and SD volume I/O | Round trip records, geometry checks, corrupt/truncated input rejection and timeout behaviour |
| M3 | Classic CP/M application workflow | COM load, command arguments, file create/read/write/close, directory and persistence after reset |
| M4 | Native banking demonstration | Distinct bank contents, nested calls, fixed stack, bank copies and state restoration on errors |
| M5 | Qualified first release | Reproducible image, size census, compatibility matrix and installation/recovery instructions |

Use small discriminating probes for each BDOS function and BIOS entry. Include sequential/random file access, extent boundaries, full disk, full directory, failed reads/writes, read-only media and drive/user changes. Preserve neighbouring logical records during partial SD-block updates. Verify PC-to-TEC and TEC-to-PC transfers as both text and binary files.

Run a representative unmodified editor or utility that fits the actual TPA. Record its exact version, console configuration and tested operations. A program launch alone is insufficient. Demonstrate edit, save, exit, reset and reopen, then compare exported contents. Record any unsupported direct-hardware or BDOS-patching behaviour precisely.

Use an emulator or harness configured to the requested map for early checks. Confirm reset, latch, SD and interrupt behaviour on physical TEC-1G hardware before claiming hardware completion. Distinguish harness evidence, emulator evidence and physical-board evidence in the release notes.

Deliver source, ATOM build instructions and version, ROM binary, symbol/memory map, host tools, an example container, native ABI reference, function coverage and known limitations. Review source provenance and distribution terms before packaging third-party CP/M components. AZM may be an isolated temporary migration oracle only. Remove it from the production path after comparison.

## 13 Decisions and unresolved questions

Resolve blocking decisions before the affected implementation. Record the evidence, chosen option and date in the maintained project specification.

| ID | Decision or missing evidence | Required before |
| --- | --- | --- |
| Q01 | Exact board revision, bank hardware, bank count and control ports | Hardware access and native bank allocator |
| Q02 | Overlay physical source, write-through behaviour, reset mapping and disable mechanism | Boot code and ROM packaging |
| Q03 | Console hardware, terminal convention and monitor coexistence | Console driver and application qualification |
| Q04 | SD electrical/interface contract, capacity addressing and timeout policy | Block driver |
| Q05 | Raw-region container versus host-filesystem file | Container format and PC utility |
| Q06 | Container binary layout, volume count, geometry and drive mapping | Media creation and DPBs |
| Q07 | Existing CP/M-compatible source versus new implementation, including ROM suitability | Core architecture and size commitments |
| Q08 | TPA boundary, RAM stub location, writable state and classic stack budget | Compatibility claim and loader |
| Q09 | Native fixed layout, stack sizes, bank ownership and interrupt/NMI rules | ABI freeze |
| Q10 | Native executable format, relocation, entry table and error encoding | Native loader and SDK |
| Q11 | Exact flush guarantees and recovery workflow after interrupted writes | Writable release |
| Q12 | Representative applications and minimum useful TPA | First-release qualification |
| Q13 | Whether any CP/M 3 features belong in the first release | Extension work |

**Working assumptions pending verification.** The target CPU is a Z80. The ROM remains visible during bank changes. Low RAM becomes writable after overlay removal. At least one writable expansion bank is installed. The system runs one foreground application. The initial SD path can use fixed-memory transfers. These assumptions guide investigation and are not substitutes for hardware evidence.

## 14 Implementation handoff

Begin with M0 and a short written decision record. Inspect the actual repository and hardware definitions before creating an implementation. Progress independently through reversible work supported by the confirmed contract. Escalate only decisions that evidence cannot settle and that change the hardware, storage format, compatibility boundary or public ABI.

Use ATOM for every production assembly path. Keep bank operations and public interfaces explicit. Measure the complete ROM and RAM cost before freezing placement. Do not fill unresolved port numbers, bank counts or binary-format fields with plausible guesses. Keep proposals visibly labelled until adopted.

The first implementation is complete when a cold boot reaches the command processor, an unmodified qualifying COM application saves a file and the file reopens after reset. The native milestone additionally requires a fixed-stack application that accesses distinct banks and returns with its original mapping and stack intact. Report exactly which results have been proved and on which execution surface.

## 15 Sources and provenance

The governing request and development instructions are the governing project authority. Technical references explain existing interfaces and hardware context. They do not override project-specific decisions.

- “Discuss CPM 3”, a prior design conversation retrieved 24 October 2026. Only the visible request turns were used as evidence of prior decisions.
- [TEC-1G hardware repository](https://github.com/MarkJelic/TEC-1G), board context. Exact fitted hardware remains to be verified.
- [Digital Research CP/M Operating System Manual](https://www.icl1900.co.uk/unix4fun/z80pack/cpm2/ch5.htm), interface reference mirrored from the original manual.
- [CP/M 2 alteration guide](https://www.icl1900.co.uk/unix4fun/z80pack/cpm2/ch6.htm), BIOS and page-zero reference, verified through the accessible manual mirror.
- [CP/M blocking and deblocking algorithms](https://www.icl1900.co.uk/unix4fun/z80pack/cpm2/axg.htm), logical-record adaptation reference, verified through the accessible manual mirror.
- [CP/M Plus Programmer’s Guide](https://www.bitsavers.org/pdf/digitalResearch/cpm_plus/CPM_Plus_Programmers_Guide_Jan83.pdf), reference for optional CP/M 3 scope. Search excerpts were accessible during preparation, but direct retrieval was blocked.

No schematic, installed expansion, existing TEC-OS source tree or assembled image was inspected when this draft was written. Hardware behaviour, exact placement and measured resource budgets remain implementation evidence to obtain.
