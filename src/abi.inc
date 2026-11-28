; Public Tecos ABI 5.5: eight bytes at
; C003h..C00Ah, containing TNA, major,
; minor and JP SVCDSP. Test TNA at
; ABITAB and major 5 at ABIMAJ before
; calling ABICALL. A new major may
; renumber services. A minor appends
; services. An interface may also change
; in place with the version fields
; unchanged, as TNSHELL was appended at
; minor 1. The ROM includes these
; declarations before emitting the
; table. The build checks its bytes and
; addresses.

; signature "TNA"

ABITAB EQU $C003

; major version, 5

ABIMAJ EQU $C006

; minor version, 5

ABIMIN EQU $C007

; CALL: the service numbered in C

ABICALL EQU $C008

; the table's end: 8 bytes

ABIEND EQU $C00B

; Numbered calls take C=service and
; arguments in B/DE/HL, never A.
; Ordinary success returns A=0, Z and
; carry clear. Failure returns a status
; with carry. FIND/LIST instead return
; generation A and a carry result.
; Unnamed result registers may be
; destroyed.
; Calls use the caller's stack and
; preserve interrupt state, IX/IY and
; alternates, except
; MOUNT/UNMOUNT/DESCRIBE may change IX
; and alternates. Only MOUNT/UNMOUNT
; call BDOS to reset drives. Call them
; outside other BDOS calls.
; Stack figures are upper bounds below
; the return address, including
; dispatch. Numbers >=TNCOUNT return
; TNEBAD with B/DE/HL preserved. Refusal
; effects are service-specific:
; workspace, cache or hardware state may
; already have changed.

; INFO: B=CONDEV OR VCLAIM, DE=ROMVER,
; L=columns and H=rows, zero for serial.
; Read stored state without device
; access. Stack bound 6.

TNINFO EQU 0

; DIGIT: HL points to six segment bytes,
; leftmost first. Scan all six, turning
; each off before the next latch. Finish
; all off with TX idle and HL advanced
; six. Stack bound 4.

TNDIGIT EQU 1

; LCD: B=row 0..3, HL points to exactly
; twenty bytes, including zeros. Invalid
; row returns TNEBAD before output. Row
; 3 clears CDWRD. Advance HL twenty.
; Stack bound 10.

TNLCD EQU 2

; VIDEO: B=1 claims PICO9918, B=0
; releases. Other B returns TNEBAD,
; absent PICO returns TNENODV. Claim
; suppresses ROM console drawing on
; PICO9918 while CRT is effective. UC1
; output continues. Release only a held
; claim: clear VCLAIM, call PIVEC's
; restore if present, then blank only
; effective CRT. Stack bound 12.

TNVIDEO EQU 3

; TONE: B is the delay count, DE half
; cycles. Each half cycle includes 16*B
; plus loop overhead. With B=0, execute
; 256 delay iterations. For DE=0, return
; without tone output. Keep TX idle and
; finish speaker low. Stack bound 4.

TNTONE EQU 4

; JOY: return complemented joystick byte
; in B, one bits for pressed controls.
; Stack bound 4.

TNJOY EQU 5

; KEYS: HL points to eight writable row
; bytes. Store complemented active-low
; matrix input and advance HL eight.
; Stack bound 4.

TNKEYS EQU 6

; PUTAT: D=row, E=column, B=count,
; HL=characters. Require video routing
; and no held PICO claim for effective
; CRT, otherwise TNENODV before drawing.
; Zero count reads no source and leaves
; cursor state alone. Clip to screen and
; right edge, preserving cursor
; coordinates. Stack bound 22.

TNPUTAT EQU 7

; RTC: B=0 reads, 1 sets seven BCD bytes
; at HL: seconds, minutes, hours, date,
; month, weekday and year. Other B
; returns TNEBAD before clock access.
; Probe seconds<60h for presence. On
; absence return TNENODV. No BCD
; validity check. Set disables write
; protection, then restores it in burst
; control. Advance HL seven on success.
; Stack bound 8.

TNRTC EQU 8

; MOUNT: B=drive 0..3, E=container
; index. Require valid descriptor,
; unmounted volume and sufficient fixed
; vector slot. An existing mount on the
; same drive is also refused. Flush
; before publishing replacement, reset
; with BDOS 37 and reselect with 14 if
; default. Invalid input,
; descriptor/flush failure returns
; TNEBAD. Stack bound 24.

TNMOUNT EQU 9

; UNMOUNT: B=drive 1..3. A: cannot be
; emptied. Flush all dirty lines before
; clearing selection and reset through
; BDOS 37. Invalid drive or flush error
; returns TNEBAD. Stack bound 24.

TNUNMNT EQU 10

; DESCRIBE: E=container index, HL points
; to 32 writable bytes. Copy its
; descriptor with mount byte replaced by
; current drive or FFh. Invalid index or
; read failure returns TNEBAD before
; caller-buffer copy. Scratch/cache
; effects may precede refusal. Stack
; bound 24.

TNDESC EQU 11

; DRIVER: only B=3 (UC1). HL points to
; seven routine words then columns/rows,
; sixteen bytes total. Acceptance
; returns HL=LINEBUF. An occupied UC1
; slot or disabled matrix returns
; TNEBAD. Nonzero table during
; STFLAG=FFh startup with IOBYTE CON=CRT
; returns TNENODV. HL=0 drops the table,
; bypassing those checks after B
; validation, and may invalidate CONMOD
; for lazy routing. Stack bound 4.

TNDRVR EQU 12

; FIND: DE points to eight space-padded
; name bytes, B=minimum version. Search
; newest first, at most 256 records.
; Success: table HL, generation A, carry
; clear. Failure: carry set, no ordinary
; status/Z result. Registry pointers
; refer to resident storage. Reconsider
; them after removal/generation change.
; Eight-bit generation repeats after 256
; removals. Stack bound 8.

TNFIND EQU 13

; LIST: B=newest-first index from zero.
; Success: record HL, generation A,
; carry clear. Failure: carry set.
; Record layout: link word, eight name
; bytes, version byte, table word.
; FIND's pointer lifetime and generation
; limit apply. Stack bound 8.

TNLIST EQU 14

; FONT: added at minor 1, refused from
; minor 2 with TNEBAD and carry, HL
; unchanged: the ROM's font is packed
; and has no eight-byte table. GLYPH
; gives a glyph's rows.

TNFONT EQU 15

; SHELL: HL = a shell's table, its one
; word LINE (four words, LINE, PAGE,
; HREC and HSTORE, before ABI 5.6, when
; the ROM took the pager and history),
; or 0 to give the prompt back. Returns
; HL = the table it replaced, 0 for
; none. A table must lie in a
; resident's pages, below the stub's
; page, with L at most F8h; any other
; nonzero HL returns TNEBAD with carry
; and the hook unchanged. BC, IX and IY
; are kept. Stack bound 4.

TNSHELL EQU 16

; GLYPH: B=character, HL points to
; eight writable bytes: its rows, top
; first, five pixels in bits 7..3. Bit
; 7 of B complements all eight bits;
; low seven bits below 20h give a
; space. Advance HL eight. Keeps DE.
; Never a housekeeping point. Not for
; an interrupt or NMI handler: it is a
; foreground call, its stack bound
; assumes a foreground caller. Added
; at ABI minor 2. Stack bound 4.

TNGLYPH EQU 17

; PARSE: the CCP's name parser. HL = a
; name, as d:NAME.TYP, DE = a 36-byte
; FCB, whose drive, name, type and rest
; are cleared first; * fills a field
; with ?. Carry for a bad name or
; drive. Returns HL at the delimiter: a
; zero, a space, = or a byte the name
; can't hold. AF, B and DE change; C is
; the function. Never a housekeeping
; point: it reads and writes memory
; only. Added at ABI minor 4. Stack
; bound 10.

TNPARSE EQU 18

; PAGE: E through the ROM's pager, as
; TYPE and DIR use it: the row and
; column kept, [more] one row short of
; a full screen. Carry: the listing
; stopped, ^C also dropping the rest of
; the line. Each prompt starts a page.
; Added at ABI minor 6.

TNPAGE EQU 19

; PROMPT: drive E as d:NAME, its
; volume's label read afresh, as the
; bare prompt shows it. Changes all.
; Added at ABI minor 6.

TNPRMPT EQU 20

; TNCOUNT is the exclusive service
; bound, not callable. Failures return
; status A with carry:
; TNEBAD=invalid/refused operation,
; TNENODV=unavailable device/routing. A
; failure does not imply unchanged
; workspace, cache or hardware.

TNCOUNT EQU 21

TNEBAD EQU 1

TNENODV EQU 2

; Service header format byte after 'D'.
; The loader rejects other formats
; before INIT. A new ABI major may move
; table entries.

SVCFMT EQU 4

; Execution record state bit 2: remove
; at the next warm boot. The service
; sets it before its exit, and only as
; the lowest resident. At the warm boot
; the CCP clears it and removes the
; lowest resident as UNLOAD does; a
; refusal leaves it installed. Added at
; ABI minor 5: an older ROM ignores it.

EXRMV EQU 2

; INFO B flags. Matrix is switch enable,
; not a presence probe. PICO/RTC flags
; are cold probe results. Other bits
; reflect current state.

HWBMTX EQU $01   ; matrix enabled
HWBPICO EQU $02  ; cold PICO probe
HWBGLCD EQU $04  ; GLCD installed
HWBRTC EQU $08   ; cold RTC probe
HWBCLM EQU $10   ; PICO claim held
HWBWRD EQU $80   ; LCD row 3 ROM word

; Version 2 PICO table offsets. Hold the
; claim before calling these direct
; entries. Unlike numbered dispatch,
; they accept A arguments. AF/BC/DE/HL
; may change. Zero payload counts still
; program the VRAM address.

PICOREG EQU 16   ; register B = A
PICOFIL EQU 18   ; DE bytes of A from
                 ; VRAM address HL
PICOWR EQU 20    ; BC bytes from DE to
                 ; VRAM address HL
PICORD EQU 22    ; BC bytes from VRAM
                 ; address HL to DE

; Version 3 adds PICOWID (KS39).
; A=80/40/32 selects width without
; taking a claim. Invalid width or a
; held claim returns carry. Success
; updates memory. Only effective CRT is
; invalidated for later console
; reselection and clearing.

PICOWVER EQU 3
PICOVER EQU 4    ; current ROM record
PICOWID EQU 24   ; width entry,
                 ; A=columns

; State offsets from the PICO table
; returned by TNFIND, in PIBLK. Its ROM
; registry record persists. Page values
; are zero or PITPG's high-byte offset.

PICOVRB EQU 36   ; record version byte
PICOTPD EQU 41   ; drawn page high
                 ; offset
PICOTPS EQU 42   ; shown page high
                 ; offset

; Shared hardware and debugger values.

SYSLAT EQU $FF   ; write-only system
                 ; latch
LATEXP EQU $04   ; EXPAND: EXPAND 1 at
                 ; 8000h-BFFFh

; shadow copy of the system latch

LATCHV EQU $0040

; Tecos's last matrix key: the
; highest-numbered key down, row * 8 +
; column, FFh for none. Its scan takes
; a key as new only when it differs. A
; service that scans the matrix itself
; writes that key here.

KBLAST EQU $BFEF

; The armed COM launch, a word, 0 when
; none. A resident service sets it to a
; callback in its own pages; CMDRUN
; calls it for a COM entered at 0100h,
; after page zero is prepared, with
; HL=0100h, DE=the image's end, BC=the
; closed loader FCB (drive and name) and
; A=the user the COM was loaded from. A
; return leaves the launch to the CCP;
; an owner never returns, and the COM's
; exit warm boots. The service clears it
; when it takes the launch, when the arm
; is cancelled and at REMOVE. Warm boot
; and page release clear it when its
; page is freed. Added at ABI minor 3:
; test ABIMIN 3 or above before using
; it.

COMVEC EQU $BF62
LCDCMD EQU $04   ; command write, busy
                 ; flag and address read
LCDDAT EQU $84   ; character data
VDPDAT EQU $BE
VDPCTL EQU $BF

; IE-off R1 bases for 80/40/32 columns.

PIR180 EQU $D0
PIR140 EQU $D0
PIR132 EQU $C0

; Version 4 reserves 3000h..37FFh from
; console writes at every width. These
; aliases allocate no new memory.
; Release before changing width, then
; re-read geometry and redraw: pixels
; need not survive the change. Monitor
; R2 is 0Fh at 80 columns, 0Ch at 40/32.
; Use version 4 for these guarantees;
; width-only clients can request 3.

PINT80 EQU $3000
PINT40 EQU $3000
PINT32 EQU $3000
PICOMNT EQU $3000
