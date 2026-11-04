; Portable CP/M Console Command Processor, CP/M 2.2 interface profile.
;
; This is an independent implementation against the public CP/M interfaces
; and reviewed black-box CCP fixtures. ATOM is its assembler.
;
; TEC-OS ROM-resident adaptation (see PROVENANCE.md). The code and text are in
; ROM; the command buffers, scratch FCBs and stack are in src/ram.asm. The transient ceiling is the page of the BDOS entry jump
; (the byte at 0007h), rather than the CCP origin.

CCPBAS:

BDOS    EQU     $0005
WBOOT   EQU     $0000
CURDSK  EQU     $0004
FCBONE  EQU     $005C
FCBTWO  EQU     $006C
CMDTAIL EQU     $0080
TPA     EQU     $0100
RCFAIL  EQU     255*256         ; FF00h, function 108's code for a failure


; Cold and warm boot both enter here with C holding the CP/M 2.2 page-zero
; byte: user number in bits 4-7, drive in bits 0-3. The BIOS has just reset
; the BDOS state, so rebuild the disk state and restore both before prompting.
; TEC-OS: a drive with no volume, unmounted or past D:, cannot be selected,
; and its Select error would warm boot back here to fail again; the CCP takes
; A: instead, and the prompt's 0004h then says so.
CCPENT:
        LD      SP,CSTKTOP
        LD      A,C
        AND     $0F
        CP      MAXDRV
        JR      NC,CCPDA
        LD      E,A
        LD      D,0
        LD      HL,DRVIDX
        ADD     HL,DE
        LD      A,(HL)          ; its volume's index + 1, 0 for none
        OR      A
        LD      A,E
        JR      NZ,CCPDR
CCPDA:  XOR     A
CCPDR:  LD      (BOOTDRV),A
        LD      A,C
        RRCA
        RRCA
        RRCA
        RRCA
        AND     $0F
        PUSH    AF
        LD      HL,WRFLAG       ; the reset that keeps unchanged drives logged
        LD      (HL),$FF
        LD      C,13
        CALL    BDOS
        POP     AF
        LD      E,A
        LD      C,32
        CALL    BDOS
        CALL    STBOOT          ; once after cold boot
        LD      A,(BOOTDRV)
        OR      A
        JR      Z,STARTED
        LD      E,A
        LD      C,14
        CALL    BDOS

STARTED:
        LD      DE,CRLFMSG
        CALL    PUTSTR

MAINLOOP:
        LD      SP,CSTKTOP
MLREAD: CALL    SAVEDU
	PUSH	AF		; the user first, as CP/M 3 does, unless 0:
	LD	A,B		; 3A>
	RRCA
	RRCA
	RRCA
	RRCA
	OR	A
	JR	Z,MLDRV
	LD	L,A
	LD	H,0
	CALL	PUTDEC
MLDRV:	POP	AF
        ADD     A,'A'
        LD      E,A
        CALL    PUTCHAR
        LD      E,'>'
        CALL    PUTCHAR
        CALL    CHSKIP          ; a chained line's next piece, before all else
        JR      NZ,MLECHO
        LD      (CHPOS),A       ; none: A = 0
	CALL	STLINE		; startup's next line
	CCF			; STFLAG: FFh a line from the file, 0 a
	SBC	A,A		; typed one; a chained piece keeps it
	LD	(STFLAG),A
	JR	NZ,MLGOT
        LD      DE,CMDBUF
        LD      HL,HFLAG        ; history for this line
        LD      (HL),$FF
        LD      C,10
        CALL    BDOS

; A line, typed or startup's, CMDLEN long in CMDTXT: a 0 after it, and its
; first piece taken as a chained line's would be.
MLGOT:  LD      HL,CMDLEN
        LD      E,(HL)
        LD      D,0
        INC     HL
        ADD     HL,DE
        LD      (HL),D
        LD      HL,CMDTXT       ; CHPOS was cleared before acquiring this line
        CALL    CHSK1
        JR      Z,STARTED       ; nothing but spaces and !
        JR      MLTAKE

; A chained piece, echoed as STLINE echoes a line, up to its ! or the end.
MLECHO: PUSH    HL
MLEC1:  LD      A,(HL)
        OR      A
        JR      Z,MLEC2
        CP      '!'
        JR      Z,MLEC2
        LD      E,A
        CALL    PUTCHAR
        INC     HL
        JR      MLEC1
MLEC2:  POP     HL

; Take the piece at HL. One that starts with : runs only if the last
; command succeeded: its code, function 108's, is not FF00h to FFFEh; after a
; failure the rest of the line goes. Then upper case up to its ! or the
; line's end, the ! made its end and CHPOS the next piece's, or 0 at the end,
; and the code cleared, before the command is looked for. ARGSTRT holds it.
MLTAKE: LD      A,(HL)
        CP      ':'
        JR      NZ,MLTK0
        LD      DE,(PRGCODE)
        LD      A,D
        INC     A
        JR      NZ,MLTKC        ; below FF00h
        LD      A,E
        INC     A
        JR      Z,MLTKC         ; FFFFh
        XOR     A               ; failed: the rest of the line dropped
        LD      (CHPOS),A
        JP      STARTED
MLTKC:  INC     HL
MLTK0:  LD      (ARGSTRT),HL
MLTK1:  LD      A,(HL)
        OR      A
        JR      Z,MLTK3         ; the line's end: CHPOS 0
        CP      '!'
        JR      Z,MLTK2
        CP      'a'
        JR      C,MLTKN
        CP      'z'+1
        JR      NC,MLTKN
        AND     $DF
        LD      (HL),A
MLTKN:  INC     HL
        JR      MLTK1
MLTK2:  LD      (HL),0
        INC     HL
        LD      A,L
        SUB     LOW(CMDTXT-1)
MLTK3:  LD      (CHPOS),A
        LD      HL,0
        LD      (PRGCODE),HL
        LD      HL,(ARGSTRT)
        CALL    SKIPSP
        OR      A
        JP      Z,STARTED       ; a : and nothing after it
        CP      'A'
        JR      C,NOTDRIVE
        CP      'P'+1
        JR      NC,NOTDRIVE
        LD      B,A
        INC     HL
        LD      A,(HL)
        CP      ':'
        JR      NZ,NOTDRIVE
        INC     HL
        CALL    SKIPSP
        LD      A,(HL)
        OR      A
        JR      NZ,NOTDRIVE
        LD      A,B
        SUB     'A'
        LD      (BOOTDRV),A
        LD      E,A
        LD      C,14
        CALL    BDOS
        CALL    SAVEDU
        JP      STARTED

; HL = a chained line's next piece, past spaces and !, from CHPOS; A its
; first character, with Z when none is left (A = 0). Destroys DE.
CHSKIP: LD      A,(CHPOS)
        OR      A
        RET     Z
        LD      E,A
        LD      D,0
        LD      HL,CMDTXT-1
        ADD     HL,DE
CHSK1:  LD      A,(HL)
        CP      SPACE
        JR      Z,CHSK2
        CP      '!'
        JR      NZ,CHSK3
CHSK2:  INC     HL
        JR      CHSK1
CHSK3:  OR      A
        RET

; Record the current user and drive in the page-zero byte at $0004 so a warm
; boot restores both. Returns the drive in A.
SAVEDU:
        LD      E,$FF
        LD      C,32
        CALL    BDOS
        ADD     A,A
        ADD     A,A
        ADD     A,A
        ADD     A,A
        LD      B,A
        PUSH    BC
        LD      C,25
        CALL    BDOS
        POP     BC
        LD      C,A
        OR      B
        LD      (CURDSK),A
        LD      A,C
        RET

NOTDRIVE:
        LD      DE,CRLFMSG
        CALL    PUTSTR
        LD      HL,(ARGSTRT)    ; the piece
        CALL    CMDSKIP
        CALL    CMDPARSE
        LD      (ARGSTRT),HL
	LD	DE,KEYTAB	; the built-in commands' words
KEYNXT:	CALL	ISCMD		; DE at the mismatch or the word's 0
	EX	DE,HL		; skip only the unmatched suffix
	JR	NZ,KEYSK
	INC	HL
	LD	A,(HL)		; the handler's address, low byte first
	INC	HL
	LD	H,(HL)
	LD	L,A
	JP	(HL)		; it takes the line from ARGSTRT itself
KEYSK:	LD	A,(HL)		; past the word and its 0,
	INC	HL
	OR	A
	JR	NZ,KEYSK
	INC	HL		; and its handler
	INC	HL
	EX	DE,HL
	LD	A,(DE)
	OR	A
	JR	NZ,KEYNXT	; another word; a 0 ends the table
        LD      DE,CMDFCB
        CALL    UNAMBIG
	JP	C,BADCMD
        LD      HL,(CMDFCB+9)   ; NAME.SVC installs
        LD      DE,'V'*256+'S'
        SBC     HL,DE
        JR      NZ,CMDCOM
        LD      A,(CMDFCB+11)
        CP      'C'
        JR      NZ,CMDCOM
        CALL    SVCGO
        JR      NC,SVCOK
	LD	HL,(SVCRC)	; L = SVCRC, H = SVCRA: an INIT that
	LD	A,(STFLAG)	; found its device absent, in a line from
	AND	H		; STARTUP.CMD, is quiet, and PRGCODE stays
	XOR	TNENODV		; 0, so a : line after it runs (KD-173);
	DEC	L		; typed, or for any other cause, it says
	OR	L		; NAME? as before
	JR	NZ,BADCMD
SVCOK:	JP	STARTED
CMDCOM: LD      A,'C'
        LD      (CMDFCB+9),A
        LD      A,'O'
        LD      (CMDFCB+10),A
        LD      A,'M'
        LD      (CMDFCB+11),A
	CALL	LOADA		; the named or current drive: user, user 0
        JR      NC,CMDRUN
        JR      NZ,BADCMD       ; there, but it would not load
	LD	HL,CMDFCB	; not here: A:'s, if no drive was named
	LD	A,(HL)
	OR	A
	JR	NZ,BADCMD	; B:NAME looks on B: only
	LD	A,(PZDU)	; and the current drive isn't A:
	AND	$0F
	JR	Z,BADCMD
	INC	(HL)		; the FCB's drive 1, A:
	CALL	LOADA		; its current user, then user 0
	JR	C,BADCMD
CMDRUN: CALL    PREPPAGE
	LD	A,(CMDFCB)	; the drive the program came from, as
	LD	(PZLDRV),A	; CP/M 3 keeps it: 0 the current, 1 A:
        ; Keep the return word outside default DMA ($0080..$00FF). The
        ; resident stack supplies 28 free bytes beneath this two-byte word.
        LD      SP,CSTKTOP
        LD      HL,WBOOT
        PUSH    HL
        JP      TPA

; An argument: from ARGSTRT, or from HL at CMDSKIP, past its spaces, noted
; for an error. A holds its first character, with Z at the end of the line.
ARGSKIP:
        LD      HL,(ARGSTRT)
CMDSKIP:
        CALL    SKIPSP
        LD      (CMDSTRT),HL
        OR      A
        RET

; One unambiguous name at HL into CMDFCB, and nothing after it.
ONENAME:
        CALL    CMDPARSE
        CALL    CPCHK
; A bad command unless only spaces are left. B is kept.
ENDCHK:
        CALL    SKIPSP
        OR      A
        RET     Z
        JR      BADCMD

; The name at HL into CMDFCB, or into the FCB at DE, or a bad command.
CMDPARSE:
        LD      DE,CMDFCB
FCBPARSE:
        CALL    PARSEFCB
        RET     NC
BADCMD:
        LD      HL,(CMDSTRT)

BADLOOP:
        LD      A,(HL)
        OR      A
        JR      Z,BADEND
        CP      SPACE
        JR      Z,BADEND
        LD      E,A
        CALL    PUTCHAR
        INC     HL
        JR      BADLOOP

BADEND:
        LD      E,'?'
        CALL    PUTCHAR
        LD      DE,CRLFMSG
; A command's error message at DE: the code FF00h, a failure for a piece
; that starts with :, then the message and the prompt.
ERRGO:  LD      HL,RCFAIL
        LD      (PRGCODE),HL
PRTGO:
        CALL    PUTSTR
        JP      STARTED

; LOADA: LOADCOM on CMDFCB's drive, in the current user and then, if it
; isn't there and the user isn't 0, in user 0 (A7): no SYS attribute needed.
; The user is put back before it returns. Carry as LOADCOM's: Z for not found.
LOADA:	CALL	LOADCOM
	RET	NC		; loaded in the current user
	RET	NZ		; there, but it would not load
	LD	A,(PZDU)	; the user, in the high nibble
	AND	$F0
	SCF
	RET	Z		; user 0 already: not found
	PUSH	AF
	LD	E,0		; BDOS function 32: user 0
	LD	C,32
	CALL	BDOS
	CALL	LOADCOM
	POP	BC		; B = the user in the high nibble
	PUSH	AF		; LOADCOM's result, across the restore
	LD	A,B
	RRCA			; the user back to bits 0-3
	RRCA
	RRCA
	RRCA
	LD	E,A		; and back into the BDOS
	LD	C,32
	CALL	BDOS
	POP	AF
	RET

; Load an ordinary COM image through the public BDOS FCB/DMA interface.
; Carry reports missing, unreadable, or oversized input.
LOADCOM:
        CALL    DOSSEQ
        DB      15*2+0    ; BDOS 15, source FCB
        INC     A
        SCF
        RET     Z
        LD      HL,TPA

LOADLOOP:
        LD      A,(PZBDOS+2)    ; up to the BDOS entry's page
        CP      H
        JR      Z,LOADLIM
        PUSH    HL
        EX      DE,HL
        CALL    READSRC
        POP     HL
        OR      A
        JR      NZ,LOADEND
        LD      DE,128
        ADD     HL,DE
        JR      LOADLOOP

; One scratch read distinguishes an exact-TPA image from an oversized image
; without allowing a further record to overwrite the resident CCP.
LOADLIM:
        PUSH    HL
        LD      DE,LOADBUF
        CALL    READSRC
        POP     HL
        CP      1
        JR      Z,LOADOK
        SCF
        RET

LOADEND:
        CP      1
        JR      NZ,LOADBAD

LOADOK:
        LD      (LOADTOP),HL    ; retain record-rounded extent before CLOSE
        CALL    DOSSEQ
        DB      16*2+0    ; BDOS 16, source FCB
        OR      A
        RET

LOADBAD:
        SCF
        RET

; DE is the next record's DMA address. Set DMA, then read the source FCB.
; Each BDOS call holds this helper's return word plus its own return word.
READSRC:
        LD      C,26
        CALL    BDOS
        CALL    DOSSEQ
        DB      20*2+0    ; BDOS 20, source FCB
        RET

; DIR uses only search-first/search-next and the public DMA directory record.
CMDDIR:
        CALL    ARGSKIP
        CALL    CMDPARSE
        CALL    ENDCHK
        LD      A,(CMDFCB+1)    ; no name, with or without a drive: every file
        CP      SPACE
        JR      NZ,DIRREADY
        LD      HL,CMDFCB+1
        LD      B,11
        LD      A,'?'

DIRWILD:
        LD      (HL),A
        INC     HL
        DJNZ    DIRWILD

DIRREADY:
        LD      DE,LOADBUF
        LD      C,26
        CALL    BDOS
        XOR     A
        LD      (DIRCOL),A
        LD      H,A
        LD      L,A
        LD      (DIRNUM),HL
        LD      A,(VWID)        ; TEC-OS: columns of 13 that fit the console
        OR      A
        JR      NZ,DIRWID
        LD      A,80            ; serial only: assume 80
DIRWID:
        LD      B,0
DIRWDIV:
        SUB     13
        JR      C,DIRWSET
        INC     B
        JR      DIRWDIV
DIRWSET:
        LD      A,B
        OR      A
        JR      NZ,DIRWOK
        INC     A
DIRWOK:
        LD      (DIRNCOL),A
        CALL    PGINIT
        CALL    DOSSEQ
        DB      17*2+0    ; BDOS 17, source FCB

DIRLOOP:
        INC     A
        JP      Z,DIRDONE
        DEC     A
        LD      L,A
        LD      H,0
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        ADD     HL,HL
        LD      DE,LOADBUF
        ADD     HL,DE
        PUSH    HL
        LD      DE,10
        ADD     HL,DE
        BIT     7,(HL)
        POP     HL
        JR      NZ,DIRNEXT
        PUSH    HL              ; live until DIRNAME; abort resets SP
        LD      A,(DIRCOL)
        OR      A
        JR      Z,DIRHEAD
        LD      E,SPACE
        CALL    PUTCHAR
        JR      DIRNAME

DIRHEAD:
        LD      A,(DIRNCOL)    ; columns remaining in this row
        LD      (DIRCOL),A
        LD      HL,(DIRNUM)
        LD      A,H
        OR      L
        JR      Z,DIRNAME
        CALL    PGCRLF
        JP      C,STARTED       ; stopped at a page pause

; One entry as NAME.EXT, padded to 12 unless it ends the line.
DIRNAME:
        LD      HL,(DIRNUM)
        INC     HL
        LD      (DIRNUM),HL
        POP     HL
        INC     HL
        LD      B,8
        LD      C,0             ; characters printed
        CALL    PUTTRIM
        LD      A,(HL)
        AND     $7F
        CP      SPACE
        JR      Z,DIRPAD
        LD      E,'.'
        CALL    PUTCHAR
        INC     C
        LD      B,3
        CALL    PUTTRIM
DIRPAD:
        LD      HL,DIRCOL
        DEC     (HL)
        JR      Z,DIRNEXT
DIRPADC:
        LD      A,C
        CP      12
        JR      NC,DIRNEXT
        LD      E,SPACE
        CALL    PUTCHAR
        INC     C
        JR      DIRPADC

DIRNEXT:
        CALL    DOSSEQ
        DB      18*2+0    ; BDOS 18, source FCB
        JP      DIRLOOP

DIRDONE:
        LD      HL,(DIRNUM)
        LD      A,H
        OR      L
        JP      Z,FILENO

; Footer: "n files, nK free" for the drive listed.
        CALL    PGCRLF
        JP      C,STARTED
        LD      HL,(DIRNUM)
        CALL    PUTDEC
        LD      DE,FILESMSG
        LD      HL,(DIRNUM)
        DEC     HL
        LD      A,H
        OR      L
        JR      NZ,DIRSUM2
        LD      DE,FILEMSG
DIRSUM2:
        CALL    PUTSTR
	LD	A,(CMDFCB)	; the listed drive's free records, from
	DEC	A		; function 46, into LOADBUF, the DMA
	JP	P,DIRFREE	; address: a drive named, or the current
	LD	A,(CURDSK)
	AND	$0F
DIRFREE:LD	E,A
	LD	C,46
	CALL	BDOS
	LD	HL,(LOADBUF)	; kilobytes = records / 8
	LD	A,(LOADBUF+2)
	LD	B,3
DIRFK:	SRL	A
	RR	H
	RR	L
	DJNZ	DIRFK
        CALL    PUTDEC
        LD      DE,FREEMSG
        CALL    PUTSTR
        JP      STARTED

; ---- Page pauses (TEC-OS) --------------------------------------------------
; TYPE and DIR count the lines they print, including lines that wrap at the
; console width. One line short of a full screen they show [more] and wait for
; a key: ^C, Esc or Q stops the listing, anything else shows the next screen.
; The size comes from the console geometry; a serial-only console is 80 x 24.

PGINIT:
        XOR     A
        LD      (PGLINE),A
        LD      (PGCOL),A
        LD      A,(VHGT)
        OR      A
        JR      NZ,PGIH
        LD      A,24
PGIH:
        DEC     A               ; the last row holds the pause prompt
        LD      (PGROWS),A
        LD      A,(VWID)
        OR      A
        JR      NZ,PGIW
        LD      A,80
PGIW:
        LD      (PGWID),A
        RET

; Print CR LF through the pager. Carry set when the user stops the listing.
PGCRLF:
        LD      E,CR
        CALL    PGPUT
        RET     C
        LD      E,LF

; Print E, counting lines and pausing when the screen is full. Carry set
; when the user stops the listing.
PGPUT:
        LD      A,E
        CP      LF
        JR      Z,PGLF
        CP      CR
        JR      Z,PGCR
        CP      8
        JR      Z,PGBS
        CP      9
        JR      Z,PGTAB
        CP      SPACE
        JR      C,PGOUT         ; other control bytes take no room
        LD      A,(PGCOL)
        LD      HL,PGWID
        CP      (HL)
        JR      C,PGINC
        PUSH    DE              ; this character starts a wrapped line
        CALL    PGNEWL
        POP     DE
        RET     C
        XOR     A
PGINC:
        INC     A
PGSETC:
        LD      (PGCOL),A
PGOUT:
        CALL    PUTCHAR
        OR      A               ; carry clear
        RET
PGCR:
        XOR     A
        JR      PGSETC
PGBS:
        LD      A,(PGCOL)
        OR      A
        JR      Z,PGOUT
        DEC     A
        JR      PGSETC
PGTAB:
        LD      A,(PGCOL)
        OR      7
        INC     A
        JR      PGSETC
PGLF:
        CALL    PUTCHAR
; A new line begins. Pause first if the screen is full.
PGNEWL:
        LD      A,(PGLINE)
        INC     A
        LD      HL,PGROWS
        CP      (HL)
        JR      C,PGNL1
        LD      DE,MOREMSG
        CALL    PUTSTR
PGWAIT:
        LD      E,$FF           ; direct console input, no echo
        LD      C,6
        CALL    BDOS
        OR      A
        JR      Z,PGWAIT
        PUSH    AF
        LD      DE,UNMORE
        CALL    PUTSTR
        POP     AF
        AND     $DF             ; upper case; ^C and Esc are unaffected
        CP      3
        JR      Z,PGDROP
        CP      $1B
        JR      Z,PGSTOP
        CP      'Q'
        JR      Z,PGSTOP
        XOR     A
PGNL1:
        LD      (PGLINE),A
        XOR     A
        LD      (PGCOL),A
        RET
; ^C drops the rest of a chained line, as it does at a program's line input;
; Esc and Q stop only the listing.
PGDROP:
        XOR     A
        LD      (CHPOS),A
PGSTOP:
        SCF
        RET

; Print up to B characters from HL, passing over spaces; count those printed in C.
; Leaves HL after the field.
PUTTRIM:
        LD      A,(HL)
        AND     $7F
        CP      SPACE
        JR      Z,PUTTSK
        LD      E,A
        CALL    PUTCHAR
        INC     C
PUTTSK:
        INC     HL
        DJNZ    PUTTRIM
        RET

; Print HL in decimal without leading zeros: the remainders of division by
; 10 go on the stack above a 10, which no digit equals, and print in reverse.
PUTDEC: LD      DE,10
        PUSH    DE
PUTDL:  CALL    DIV16
        PUSH    HL
        EX      DE,HL
        OR      L               ; A = H: DIV16 leaves A = D
        LD      DE,10
        JR      NZ,PUTDL
PUTDP:  POP     HL
        LD      A,L
        CP      10
        RET     Z
        ADD     A,'0'
        LD      E,A
        CALL    PUTCHAR
        JR      PUTDP

; TYPE streams public 128-byte records and stops at CP/M text EOF.
CMDTYPE:
        CALL    ARGSKIP
        JR      Z,FILENO
        CALL    ONENAME
        CALL    DOSSEQ
        DB      15*2+0    ; BDOS 15, source FCB
        INC     A
        JR      Z,FILENO
        LD      DE,LOADBUF
        LD      C,26
        CALL    BDOS
        CALL    PGINIT

TYPEREAD:
        CALL    DOSSEQ
        DB      20*2+0    ; BDOS 20, source FCB
        OR      A
        JR      NZ,TYPEEND
        LD      HL,LOADBUF
        LD      B,128

TYPEBYTE:
        LD      A,(HL)
        CP      $1A
        JR      Z,TYPEEND
        LD      E,A
        PUSH    BC
        PUSH    HL
        CALL    PGPUT
        POP     HL
        POP     BC
        JR      C,TYPEEND       ; stopped at a page pause
        INC     HL
        DJNZ    TYPEBYTE
        JR      TYPEREAD

TYPEEND:
        CALL    DOSSEQ
        DB      16*2+0    ; BDOS 16, source FCB
        JP      STARTED

FILENO:
        LD      DE,NOFILE
        JP      ERRGO

; ERA deletes through BDOS only after the complete operand has parsed.
CMDERA:
        CALL    ARGSKIP
        JP      Z,BADCMD
        CALL    CMDPARSE
        CALL    ENDCHK
        XOR     A
        LD      (ERAALL),A
        LD      HL,CMDFCB+1
        LD      B,11

ERACHK:
        LD      A,(HL)
        CP      '?'
        JR      NZ,ERADEL
        INC     HL
        DJNZ    ERACHK
        LD      DE,ALLQUERY
        CALL    PUTSTR
        LD      C,1
        CALL    BDOS
        CP      CR              ; Return alone is no, and is
        JP      Z,STARTED       ; compared before the case is folded
        AND     $DF
        LD      (ERAANS),A

ERADRAIN:
        LD      C,1
        CALL    BDOS
        CP      CR
        JR      NZ,ERADRAIN

ERAGOT:
        LD      A,(ERAANS)
        CP      'Y'
        JP      NZ,STARTED
        LD      A,1
        LD      (ERAALL),A

ERADEL:
        CALL    DOSSEQ
        DB      19*2+0    ; BDOS 19, source FCB
        INC     A
        JR      Z,FILENO
        LD      A,(ERAALL)
        OR      A
        JP      NZ,STARTED
        JP      MAINLOOP

; REN's public syntax is NEW=OLD. A separate destination FCB permits an
; existence check before the function-23 mutation FCB is assembled.
CMDREN:
        CALL    ARGSKIP
        JP      Z,BADCMD
        CP      '='
        JP      Z,BADCMD
        LD      DE,RENFCB
        CALL    FCBPARSE
        CALL    CPCHK
        LD      A,(HL)
        CP      '='
        JP      NZ,BADCMD
        INC     HL
        LD      A,(HL)
        OR      A
        JP      Z,BADCMD
        CP      SPACE
        JP      Z,BADCMD
        CP      '='
        JP      Z,BADCMD
        CALL    ONENAME

        LD      HL,CMDFCB       ; one drive for both names: the new name's,
        LD      A,(RENFCB)      ; or the old's, and two are a bad command
        OR      A
        JR      Z,RENOLD
        CP      (HL)
        JR      Z,RENTEST
        LD      B,A
        LD      A,(HL)
        OR      A
        JP      NZ,BADCMD
        LD      (HL),B
RENOLD:
        LD      A,(HL)
        LD      (RENFCB),A
RENTEST:
        LD      DE,LOADBUF
        LD      C,26
        CALL    BDOS
        LD      DE,RENFCB
        LD      C,17
        CALL    BDOS
        INC     A
        JR      NZ,RENEXIST

        LD      HL,RENFCB
        LD      DE,CMDFCB+16
        LD      BC,12
        LDIR
        CALL    DOSSEQ
        DB      23*2+0    ; BDOS 23, source FCB
        INC     A
        JP      Z,FILENO
        JP      MAINLOOP

RENEXIST:
        LD      DE,FILEEX
        JP      ERRGO

; TEC-OS: COPY SOURCE DEST copies a file a record at a time through the
; default DMA record, as COPY.COM does: open the source, erase and make the
; destination, read and write to the end, close, and print COPIED nnnn
; (records, hex) or the same error text. Nothing in the TPA is touched.
; DEST may be a drive alone, or a blank name with a type: the source's whole
; name is used. Both names carry their drive, the current one if none was
; given, and a destination that names the source is a bad command, with
; nothing opened.
; Parse the next name at HL into the FCB at DE, unambiguous (CPNAME); parse
; it (CPPARSE), keeping DE, with the current drive from 0004h in a 0 drive
; byte; check the FCB just parsed is unambiguous (CPCHK). A bad command
; otherwise. PARSEFCB clears the rest of the FCB.
CPNAME:
        CALL    CPPARSE
CPCHK:
        CALL    UNAMBIG
        JR      C,CPBAD
        RET
CPPARSE:
        CALL    SKIPSP
        PUSH    DE
        CALL    PARSEFCB
        POP     DE
        JR      C,CPBAD
        LD      A,(DE)
        OR      A
        RET     NZ
	LD	A,(CURDSK)	; the drive in use
        AND     $0F
        INC     A
        LD      (DE),A
        RET

CMDCOPY:
        LD      HL,(ARGSTRT)
        LD      DE,CMDFCB
        CALL    CPNAME
        LD      DE,RENFCB
        CALL    CPPARSE         ; DE kept
        INC     DE
        LD      A,(DE)
        CP      SPACE
        JR      NZ,CPD1
        LD      HL,CMDFCB+1     ; a drive alone: the source's name
        LD      BC,11
        LDIR
CPD1:
        CALL    CPCHK
        LD      HL,CMDFCB       ; the source itself?
        LD      DE,RENFCB
        LD      B,12
CPSAME:
        LD      A,(DE)
        CP      (HL)
        JR      NZ,CPGO
        INC     HL
        INC     DE
        DJNZ    CPSAME
CPBAD:
        JP      BADCMD
CPGO:
        LD      DE,DEFDMA
        LD      C,26
        CALL    BDOS
        CALL    DOSSEQ
        DB      15*2+0    ; BDOS 15, source FCB
        INC     A
        LD      DE,CPNOSRC
        JR      Z,CPFAIL
        CALL    DOSSEQ
        DB      19*2+1    ; BDOS 19, destination FCB
        CALL    DOSSEQ
        DB      22*2+1    ; BDOS 22, destination FCB
        INC     A
        LD      DE,CPNODST
        JR      Z,CPFAIL
        LD      HL,0
        LD      (DIRNUM),HL
CPLOOP:
        CALL    DOSSEQ
        DB      20*2+0    ; BDOS 20, source FCB
        OR      A
        JR      NZ,CPDONE
        CALL    DOSSEQ
        DB      21*2+1    ; BDOS 21, destination FCB
        OR      A
        LD      DE,CPWRITE
        JR      NZ,CPFAIL
        LD      HL,(DIRNUM)
        INC     HL
        LD      (DIRNUM),HL
        JR      CPLOOP
CPDONE:
        CALL    DOSSEQ
        DB      16*2+1    ; BDOS 16, destination FCB
        INC     A
        LD      DE,CPCLOSE
        JR      Z,CPFAIL
        LD      DE,CPCOPIED
        CALL    PUTSTR
        LD      A,(DIRNUM+1)
        CALL    CPHEX
        LD      A,(DIRNUM)
        CALL    CPHEX
        LD      DE,CRLFMSG
        JP      PRTGO
CPFAIL:
        JP      ERRGO

; One inline byte after CALL: BDOS function*2 + destination bit (0=CMDFCB,
; 1=RENFCB). Advance the return PC past it, preserving HL, B and A. BDOS owns
; DE/C and its normal result registers/flags. SRL changes incoming flags;
; BENTRY overwrites them with CP before any handler dispatch. No frame is
; added here; the READSRC terminal CALL/byte/RET holds one extra return word.
DOSSEQ:
        EX      (SP),HL
        LD      C,(HL)
        INC     HL
        EX      (SP),HL
        SRL     C
        LD      DE,CMDFCB
        JR      NC,DOSGO
        LD      DE,RENFCB
DOSGO:  JP      BDOS

; Print A as two hex digits by BDOS function 2, through console.asm's HEXHL.
; Destroys AF, BC, DE, HL.
CPHEX:	LD	HL,CPHEXC	; each digit through PUTCHAR
	JP	HEXHL
CPHEXC:	LD	E,A		; function 2 takes the character in E
	JP	PUTCHAR

; UNLOAD: the lowest resident goes, or the command comes back with a question
; mark.
CMDUNL:	CALL	SVCUNL
	JP	NC,STARTED	; carry: SVCUNL refused
	JP	BADCMD

; CON's name loop: not this name, so the next, or a bad command after six.
CONNO:
        POP     HL
CONSKIP:
        INC     DE              ; to the next name
        DEC     C
        JR      NZ,CONSKIP
        INC     B
        LD      A,B
        CP      6
        JR      NZ,CONNXT
        JP      BADCMD

; TEC-OS: CON shows the console in use; CON TTY, CRT, BAT or UC1 (a colon
; may follow), or PICO for CRT: and GLCD for UC1:, sets the IOBYTE CON: field.
; After CRT or PICO a width, 80, 40 or 32, goes to the ROM's PICO9918 console
; through its table's PICOWID entry (KD-174); with that console not started,
; or any other width, the command is refused. The BIOS switches at the next
; console call, so the report appears on the new console, and names the serial
; terminal when the chosen display or keyboard is missing.
CMDCON:
        CALL    ARGSKIP         ; an error names the argument
	JP	Z,CONSHOW
        LD      DE,CONNAMS
        LD      B,0
CONNXT:
        PUSH    HL
        LD      C,4
CONCMP:
        LD      A,(DE)
	CP	':'
	JR	Z,CONMAT	; a three-letter name's end
        CP      (HL)
        JR      NZ,CONNO
        INC     HL
        INC     DE
        DEC     C
        JR      NZ,CONCMP
CONMAT:	POP	AF		; matched: drop the saved text pointer
	LD	A,B		; GLCD (4) is UC1:, PICO (5) CRT:, 11 - 2B
	CP	4
	JR	C,CONHIT
	ADD	A,A
	CPL
	ADD	A,12
	LD	B,A
CONHIT:	LD	A,(HL)
        CP      ':'
	JR	NZ,CONEND
        INC     HL
CONEND:	LD	A,(HL)		; a width only after a space: CRT80 is
	CP	SPACE		; a bad name, and its end ENDCHK's
	JR	NZ,CONNW
	CALL	CMDSKIP		; the width, named by an error
	JR	Z,CONNW		; spaces alone: no width
	LD	A,B
	CP	CMCRT
	JP	NZ,BADCMD	; a width after CRT: alone
	LD	A,(HL)		; two decimal digits: the columns, which
	SUB	'0'		; TMSWID judges (80, 40 or 32)
	CP	10
	JP	NC,BADCMD
	LD	C,A
	ADD	A,A
	ADD	A,A
	ADD	A,C
	ADD	A,A		; the tens
	LD	C,A
	INC	HL
	LD	A,(HL)
	SUB	'0'
	CP	10
	JP	NC,BADCMD
	ADD	A,C
	INC	HL
	PUSH	AF
	CALL	ENDCHK
	LD	DE,CONNAMS+20	; "PICO    " at version 3
	LD	BC,PICOVER*256+TNFIND
	CALL	ABICALL
	POP	BC		; B = the columns
	JP	C,BADCMD	; none in that takes a width
	LD	DE,PICOWID
	ADD	HL,DE
	LD	A,(HL)
	INC	HL
	LD	H,(HL)
	LD	L,A
	LD	A,B
	CALL	VHLJP		; A = the columns: carry if refused
	JP	C,BADCMD
	LD	B,CMCRT
	JR	CONFL
CONNW:	CALL	ENDCHK
CONFL:	CALL	CONFLD
        LD      A,B             ; UC1: the GLCD's driver, if it is not in
        CP      CMUC1
        CALL    Z,GLCLD
CONSHOW:
        LD      DE,CONHDR
        CALL    PUTSTR          ; the BIOS acts on the field: CONMOD next
        LD      A,(CONMOD)
        ADD     A,A
        ADD     A,A
        LD      L,A
        LD      H,0
        LD      DE,CONNAMS      ; its name and colon, four bytes
        ADD     HL,DE
        LD      B,4
CONSH1: LD      E,(HL)
        CALL    PUTCHAR         ; keeps BC and HL
        INC     HL
        DJNZ    CONSH1
        LD      DE,CRLFMSG
        CALL    PUTSTR
        JP      MAINLOOP

; USER accepts one decimal user number in the CP/M 2.2 range 0..15.
CMDUSER:
        CALL    ARGSKIP
        CP      '0'
        JP      C,BADCMD
        CP      '9'+1
        JP      NC,BADCMD
        SUB     '0'
        LD      B,A
        INC     HL
        LD      A,(HL)
        CP      '0'
        JR      C,USERDONE
        CP      '9'+1
        JR      NC,USERDONE
        LD      A,B
        CP      1
        JP      NZ,BADCMD
        LD      A,(HL)
        CP      '6'
        JP      NC,BADCMD
        SUB     '0'-10
        LD      B,A
        INC     HL

USERDONE:
        CALL    ENDCHK
        LD      E,B
        LD      C,32
        CALL    BDOS
        JP      MAINLOOP

; SAVE writes 256-byte pages from the TPA. A count reaching the page of the
; BDOS entry jump is rejected rather than saving it or the workspace.
CMDSAVE:
        CALL    ARGSKIP
        CP      '0'
        JP      C,BADCMD
        CP      '9'+1
        JP      NC,BADCMD
        LD      B,0

SAVENUM:
        LD      A,(HL)
        CP      '0'
        JR      C,SAVENEND
        CP      '9'+1
        JR      NC,SAVENEND
        SUB     '0'
        LD      E,A
        LD      A,B
        ADD     A,A
        JP      C,BADCMD
        LD      D,A
        ADD     A,A
        ADD     A,A
        ADD     A,D
        JP      C,BADCMD
        ADD     A,E
        JP      C,BADCMD
        LD      B,A
        INC     HL
        JR      SAVENUM

SAVENEND:
        CP      SPACE
        JP      NZ,BADCMD
        LD      A,(PZBDOS+2)
        LD      C,A
        LD      A,B
        CP      C
        JP      NC,BADCMD
        LD      (SAVEPGS),A
        CALL    SKIPSP
        LD      A,(HL)
        OR      A
        JP      Z,BADCMD
        CALL    ONENAME

        CALL    DOSSEQ
        DB      19*2+0    ; BDOS 19, source FCB
        CALL    DOSSEQ
        DB      22*2+0    ; BDOS 22, source FCB
        INC     A
        JR      Z,SAVENOSP
        LD      HL,TPA
        LD      (SAVEADR),HL

SAVELOOP:
        LD      A,(SAVEPGS)
        OR      A
        JR      Z,SAVECLS
        CALL    SAVE128
        JR      C,SAVENOSP
        CALL    SAVE128
        JR      C,SAVENOSP
        LD      A,(SAVEPGS)
        DEC     A
        LD      (SAVEPGS),A
        JR      SAVELOOP

SAVE128:
        LD      DE,(SAVEADR)
        LD      C,26
        CALL    BDOS
        CALL    DOSSEQ
        DB      21*2+0    ; BDOS 21, source FCB
        OR      A
        SCF
        RET     NZ
        LD      HL,(SAVEADR)
        LD      DE,128
        ADD     HL,DE
        LD      (SAVEADR),HL
        OR      A
        RET

SAVECLS:
        CALL    DOSSEQ
        DB      16*2+0    ; BDOS 16, source FCB
        INC     A
        JR      Z,SAVENOSP
        JP      MAINLOOP

SAVENOSP:
        LD      DE,NOSPACE
        JP      ERRGO

; Publish only documented page-zero transient state after loading succeeds.
PREPPAGE:
        LD      HL,(ARGSTRT)
        PUSH    HL
        CALL    SKIPSP
        LD      DE,FCBONE
        CALL    PARSEFCB
        CALL    SKIPSP
        LD      DE,FCBTWO
        CALL    PARSEFCB
        POP     HL

        LD      DE,CMDTAIL+1
        LD      B,0

TAILLOOP:
        LD      A,(HL)
        OR      A
        JR      Z,TAILDONE
        LD      (DE),A
        INC     HL
        INC     DE
        INC     B
        JR      TAILLOOP

TAILDONE:
        LD      A,B
        LD      (CMDTAIL),A
        XOR     A
        LD      (DE),A
        LD      DE,CMDTAIL
        LD      C,26
        JP      BDOS

; Parse one CP/M file reference into a cleared 36-byte FCB. HL points
; at the first token byte and returns at its delimiter. A '*' expands to '?'
; through the remainder of its current field.
PARSEFCB:
        LD      (FCBBASE),DE
        PUSH    DE
        XOR     A
        LD      (DE),A
        INC     DE
        LD      B,11
        LD      A,SPACE

FCBSPACE:
        LD      (DE),A
        INC     DE
        DJNZ    FCBSPACE
        XOR     A
        ; A parsed FCB is reusable command state, so reset the complete tail:
        ; EX/S1/S2/RC, the allocation map, CR, and the random-record fields.
        ; Leaving CR behind makes the command after TYPE begin loading at
        ; record one rather than at the start of its COM file.
        LD      B,24

FCBZERO:
        LD      (DE),A
        INC     DE
        DJNZ    FCBZERO
        POP     DE

        LD      A,(HL)
        OR      A
        RET     Z
        INC     HL
        LD      A,(HL)
        DEC     HL
        CP      ':'
        JR      NZ,FCBNAME
        LD      A,(HL)
        CP      'A'
        JR      C,FCBDRBAD
        CP      'Q'
        JR      NC,FCBDRBAD
        SUB     'A'-1
        LD      (DE),A
        INC     HL
        INC     HL

FCBNAME:
        INC     DE
        LD      B,8
        CALL    PARFLD
        RET     C
        LD      A,(HL)
        CP      '.'
        JR      Z,FCBDOT
        OR      A
        RET

FCBDOT:
        INC     HL
        LD      A,E             ; B is the unfilled part of the name field
        ADD     A,B
        LD      E,A
        JR      NC,FCBTYP
        INC     D
FCBTYP: LD      B,3
        JR      PARFLD

FCBDRBAD:
        SCF
        RET

PARFLD:
        CALL    FCBEND
        RET     Z
        CP      '*'
        JR      Z,PARSTAR
        CALL    VALIDCHR
        RET     C
        LD      (DE),A
        INC     DE
        INC     HL
        DJNZ    PARFLD

PARSKIP:
        CALL    FCBEND
        RET     Z

PARLONG:
        INC     HL
        CALL    FCBEND
        JR      NZ,PARLONG

PLEND:
        SCF
        RET

; Commands that name exactly one file reject an empty name or either wildcard.
; Preserve the parser's delimiter pointer in HL; FCBBASE identifies the FCB
; because PARSEFCB advances DE while filling it.
UNAMBIG:
        PUSH    HL
        PUSH    BC
        LD      HL,(FCBBASE)
        INC     HL
        LD      A,(HL)
        CP      SPACE
        JR      Z,CHRRET
        LD      BC,11
        LD      A,'?'
        CPIR                    ; equality means an ambiguous name
        JR      CHRRET

; CP/M 2.2 reserves these characters inside filename and filetype fields.
; Dot and equals are handled as grammar delimiters, while question mark and
; asterisk remain available to the ambiguous DIR and ERA forms.
VALIDCHR:
        PUSH    HL
        PUSH    BC
        LD      HL,BADCHARS
        LD      BC,13
        CPIR                    ; equality means a forbidden byte
; Both scans preserve HL/BC and return carry for a match (invalid/ambiguous).
CHRRET: POP     BC
        POP     HL
        SCF
        RET     Z
        OR      A
        RET

PARSTAR:
        LD      A,'?'

STARLOOP:
        LD      (DE),A
        INC     DE
        DJNZ    STARLOOP
        INC     HL

PARIGN:
        CALL    FCBEND
        RET     Z
        INC     HL
        JR      PARIGN

; Z at the end of a name: a zero, a space, '=' or '.'. A holds the character.
FCBEND: LD      A,(HL)
        OR      A
        RET     Z
        CP      SPACE
        RET     Z
        CP      '='
        RET     Z
        CP      '.'
        RET

SKIPSP:
        LD      A,(HL)
        CP      SPACE
        RET     NZ
        INC     HL
        JR      SKIPSP

; Compare the parsed command word with a zero-terminated keyword. Equality
; requires a command delimiter or end immediately after the keyword.
ISCMD:
        LD      HL,(CMDSTRT)

KEYLOOP:
        LD      A,(DE)
        OR      A
        JR      Z,KEYEND
        CP      (HL)
        RET     NZ
        INC     DE
        INC     HL
        JR      KEYLOOP

KEYEND:
        LD      A,(HL)
        OR      A
        RET     Z
        CP      SPACE
        RET

PUTSTR:
        LD      C,9
        JP      BDOS

; Print E by BDOS function 2, through OUTCHAR's column count and ^P echo.
; Keeps BC and HL, which every caller wants kept. Destroys AF and DE.
PUTCHAR:
	PUSH	BC
	PUSH	HL
        LD      C,2
	CALL	BDOS
	POP	HL
	POP	BC
	RET

; SERVICES: each service's name and pages, from the owner list.
CMDSVC: LD      A,(SVCHEAD)
CMDDL:  OR      A
        JP      Z,MAINLOOP
        LD      H,A
        LD      L,DNAM
        LD      B,8
        CALL    PUTTRIM
        LD      E,' '
        CALL    PUTCHAR
        PUSH    HL
        LD      L,DOWN
        LD      A,(HL)
        CALL    SVCABV
        SUB     H
        LD      L,A
        LD      H,0
        CALL    PUTDEC
        LD      DE,CRLFMSG
        CALL    PUTSTR
        POP     HL
        LD      L,DOWN
        LD      A,(HL)
        JR      CMDDL

; Startup. Once after cold boot one record of A:STARTUP.CMD is read, the
; position marked finished first, so that a failure can't repeat. STPOS is 0
; until then, the next byte + 1 in the file, and 80h up once it is finished.
STBOOT:	LD	HL,STPOS
	LD	A,(HL)
	OR	A
	RET	NZ		; cold boot has passed here already
	SET	7,(HL)		; finished, whatever follows
	IN	A,(STSPORT)	; a keypad key held skips it: bit 6 low
	AND	$40
	RET	Z
	LD	HL,STFCB	; the file's name, for the BDOS
	LD	DE,CMDFCB
	LD	BC,12
	LDIR
	LD	DE,STREC	; the record goes where STLINE reads it
	LD	C,26
	CALL	BDOS
        CALL    DOSSEQ
        DB      15*2+0    ; BDOS 15, source FCB
	INC	A
	JR	Z,STBDMA
        CALL    DOSSEQ
        DB      20*2+0    ; BDOS 20, source FCB
	OR	A
	JR	NZ,STBDMA
	INC	A		; STPOS 1, the file's first byte
	LD	(STPOS),A
STBDMA:	LD	HL,DEFDMA	; the DMA address programs expect
	LD	(CURDMA),HL
	RET

; With a line left: it goes in the command buffer, echoed as if
; typed, and carry clear. Lines end at CR or LF and blank ones are passed
; over; a line's characters after its 127th are passed over too, as a typed
; line has no more. ^Z, a zero or the record's last byte ends the
; file. Otherwise carry set, once the file has finished.
; Destroys AF, B, DE, HL.
STLINE:	LD	HL,STPOS
	LD	A,(HL)
	RLCA			; top bit to carry: the file is finished
	RET	C		; the file finished: a line is typed
	RRCA			; the position again
	ADD	A,LOW(STREC)-1
	LD	L,A
	LD	H,HIGH(STREC)
	LD	DE,CMDTXT
	LD	B,127		; the characters a line may hold
STL1:	LD	A,L
	CP	LOW(STREC+128)
	JR	Z,STLE		; the record has run out
	LD	A,(HL)
	INC	HL
	OR	A
	JR	Z,STLE		; a zero ends the file
	CP	26
	JR	Z,STLE		; and so does ^Z
	CP	13
	JR	Z,STL2
	CP	10
	JR	Z,STL2
	INC	B
	DEC	B
	JR	Z,STL1		; past the 127th: passed over
	LD	(DE),A		; a character of the line
	INC	DE
	DEC	B
	JR	STL1
STLE:	LD	L,LOW(STLAST)	; STPOS 80h, finished
STL2:	LD	A,L
	SUB	LOW(STREC)-1	; the next byte + 1
	LD	(STPOS),A
	LD	A,E
	SUB	LOW(CMDTXT)
	JR	Z,STLINE	; a blank line: the next one
	LD	(CMDLEN),A
	EX	DE,HL
	LD	(HL),13		; ends the line for the CCP, and
	INC	HL
	LD	(HL),'$'	; for the echo
	LD	DE,CMDTXT
	CALL	PUTSTR
	OR	A
	RET

