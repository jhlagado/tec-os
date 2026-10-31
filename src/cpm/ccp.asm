; Portable CP/M Console Command Processor, CP/M 2.2 interface profile.
;
; This is an independent implementation against the public CP/M interfaces
; and reviewed black-box CCP fixtures. ATOM is its assembler.
;
; TEC-OS ROM-resident adaptation (see PROVENANCE.md). The code and text are in
; ROM; the command buffers, scratch FCBs and stack are in the RAM block at the
; end of this file. The transient ceiling is the page of the BDOS entry jump
; (the byte at 0007h), rather than the CCP origin.

CCPBAS:

BDOS    EQU     $0005
WBOOT   EQU     $0000
CURDSK  EQU     $0004
FCBONE  EQU     $005C
FCBTWO  EQU     $006C
CMDTAIL EQU     $0080
TPA     EQU     $0100


; Cold and warm boot both enter here with C holding the CP/M 2.2 page-zero
; byte: user number in bits 4-7, drive in bits 0-3. The BIOS has just reset
; the BDOS state, so rebuild the disk state and restore both before prompting.
CCPENT:
        LD      SP,CSTKTOP
        LD      A,C
        AND     $0F
        LD      (BOOTDRV),A
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
        ADD     A,'A'
        LD      E,A
        CALL    PUTCHAR
        LD      E,'>'
        CALL    PUTCHAR
	CALL	STLINE		; startup's next line
        JR      NC,MLGOT
        LD      DE,CMDBUF
        LD      HL,HFLAG        ; history for this line
        LD      (HL),$FF
        LD      C,10
        CALL    BDOS

MLGOT:  LD      A,(CMDLEN)
        OR      A
        JR      Z,STARTED
        LD      B,A
        LD      HL,CMDTXT

UPLOOP:
        LD      A,(HL)
        CP      'a'
        JR      C,UPNEXT
        CP      'z'+1
        JR      NC,UPNEXT
        AND     $DF
        LD      (HL),A

UPNEXT:
        INC     HL
        DJNZ    UPLOOP
        XOR     A
        LD      (HL),A

        LD      HL,CMDTXT
        CALL    SKIPSP
        LD      A,(HL)
        OR      A
        JR      Z,STARTED
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
        LD      HL,CMDTXT
        CALL    CMDSKIP
        CALL    CMDPARSE
        LD      (ARGSTRT),HL
        LD      DE,DIRKEY
        CALL    ISCMD
        JP      Z,CMDDIR
        LD      DE,TYPEKEY
        CALL    ISCMD
        JP      Z,CMDTYPE
        LD      DE,ERAKEY
        CALL    ISCMD
        JP      Z,CMDERA
        LD      DE,RENKEY
        CALL    ISCMD
        JP      Z,CMDREN
        LD      DE,SAVEKEY
        CALL    ISCMD
        JP      Z,CMDSAVE
        LD      DE,USERKEY
        CALL    ISCMD
        JP      Z,CMDUSER
        LD      DE,CONKEY
        CALL    ISCMD
        JP      Z,CMDCON
        LD      DE,COPYKEY
        CALL    ISCMD
        JP      Z,CMDCOPY
        LD      DE,UNLKEY
        CALL    ISCMD
        JP      Z,CMDUNL
        LD      DE,DRVKEY
        CALL    ISCMD
        JP      Z,CMDDRV
        LD      DE,CMDFCB
        CALL    UNAMBIG
        JR      C,BADCMD
        LD      HL,(CMDFCB+9)   ; NAME.DRV installs
        LD      DE,'R'*256+'D'
        SBC     HL,DE
        JR      NZ,CMDCOM
        LD      A,(CMDFCB+11)
        CP      'V'
        JR      NZ,CMDCOM
        CALL    DRVGO
        JR      C,BADCMD
        JP      STARTED
CMDCOM: LD      A,'C'
        LD      (CMDFCB+9),A
        LD      A,'O'
        LD      (CMDFCB+10),A
        LD      A,'M'
        LD      (CMDFCB+11),A
        CALL    LOADCOM
        JR      NC,CMDRUN
        JR      NZ,BADCMD       ; there, but it would not load
        LD      HL,'R'*256+'P'  ; no NAME.COM: NAME.PRL
        LD      (CMDFCB+9),HL
        LD      A,'L'
        LD      (CMDFCB+11),A
        CALL    LOADCOM
        JR      C,BADCMD
        CALL    PRLGO
        JR      C,BADCMD
CMDRUN: CALL    PREPPAGE
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
        PUSH    HL
        CALL    PUTCHAR
        POP     HL
        INC     HL
        JR      BADLOOP

BADEND:
        LD      E,'?'
        CALL    PUTCHAR
        LD      DE,CRLFMSG
PRTGO:
        CALL    PUTSTR
        JP      STARTED

; Load an ordinary COM image through the public BDOS FCB/DMA interface.
; Carry reports missing, unreadable, or oversized input.
LOADCOM:
        LD      DE,CMDFCB
        LD      C,15
        CALL    BDOS
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
        LD      C,26
        CALL    BDOS
        LD      DE,CMDFCB
        LD      C,20
        CALL    BDOS
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
        LD      C,26
        CALL    BDOS
        LD      DE,CMDFCB
        LD      C,20
        CALL    BDOS
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
        LD      DE,CMDFCB
        LD      C,16
        CALL    BDOS
        OR      A
        RET

LOADBAD:
        SCF
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
        LD      (DIRANY),A
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
        LD      DE,CMDFCB
        LD      C,17
        CALL    BDOS

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
        LD      (DIRENTP),HL
        LD      A,(DIRCOL)
        OR      A
        JR      Z,DIRHEAD
        LD      E,SPACE
        CALL    PUTCHAR
        JR      DIRNAME

DIRHEAD:
        LD      A,(DIRANY)
        OR      A
        JR      Z,DIRNAME
        CALL    PGCRLF
        JP      C,STARTED       ; stopped at a page pause

; One entry as NAME.EXT, padded to 12 unless it ends the line.
DIRNAME:
        LD      A,1
        LD      (DIRANY),A
        LD      HL,(DIRNUM)
        INC     HL
        LD      (DIRNUM),HL
        LD      HL,(DIRENTP)
        INC     HL
        LD      B,8
        LD      C,0             ; characters printed
        CALL    PUTTRIM
        LD      A,(HL)
        AND     $7F
        CP      SPACE
        JR      Z,DIRPAD
        PUSH    HL
        PUSH    BC
        LD      E,'.'
        CALL    PUTCHAR
        POP     BC
        POP     HL
        INC     C
        LD      B,3
        CALL    PUTTRIM
DIRPAD:
        LD      A,(DIRCOL)
        INC     A
        LD      HL,DIRNCOL
        CP      (HL)
        JR      C,DIRPADL
        XOR     A
        LD      (DIRCOL),A
        JR      DIRNEXT
DIRPADL:
        LD      (DIRCOL),A
DIRPADC:
        LD      A,C
        CP      12
        JR      NC,DIRNEXT
        PUSH    BC
        LD      E,SPACE
        CALL    PUTCHAR
        POP     BC
        INC     C
        JR      DIRPADC

DIRNEXT:
        LD      DE,CMDFCB
        LD      C,18
        CALL    BDOS
        JP      DIRLOOP

DIRDONE:
        LD      A,(DIRANY)
        OR      A
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
        LD      A,(CMDFCB)      ; count free blocks on the listed drive
        OR      A
        JR      Z,DIRFREE
        DEC     A
        LD      E,A
        LD      C,14
        CALL    BDOS
DIRFREE:
        LD      C,31
        CALL    BDOS
        PUSH    HL
        POP     IX              ; IX -> DPB
        LD      C,27
        CALL    BDOS            ; HL -> allocation vector
        LD      E,(IX+5)
        LD      D,(IX+6)
        INC     DE              ; DE = blocks on the drive
        LD      BC,0            ; free blocks
        LD      A,$80           ; bit within the current byte
DIRFBIT:
        PUSH    AF
        AND     (HL)
        JR      NZ,DIRFUSED
        INC     BC
DIRFUSED:
        POP     AF
        RRCA
        JR      NC,DIRFSAME
        INC     HL
DIRFSAME:
        DEC     DE
        PUSH    AF
        LD      A,D
        OR      E
        JR      Z,DIRFEND
        POP     AF
        JR      DIRFBIT
DIRFEND:
        POP     AF
        LD      H,B             ; kilobytes = blocks << (BSH - 3)
        LD      L,C
        LD      A,(IX+2)
        SUB     3
        JR      Z,DIRFKB
DIRFSH:
        ADD     HL,HL
        DEC     A
        JR      NZ,DIRFSH
DIRFKB:
        CALL    PUTDEC
        LD      DE,FREEMSG
        CALL    PUTSTR
        LD      A,(CURDSK)      ; back to the current drive
        AND     $0F
        LD      E,A
        LD      C,14
        CALL    BDOS
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
        JR      Z,PGSTOP
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
PGSTOP:
        SCF
        RET

; Print up to B characters from HL, stopping at a space; count them in C.
; Leaves HL after the field.
PUTTRIM:
        LD      A,(HL)
        AND     $7F
        CP      SPACE
        JR      Z,PUTTSK
        PUSH    BC
        PUSH    HL
        LD      E,A
        CALL    PUTCHAR
        POP     HL
        POP     BC
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

PUTNAME:
        LD      A,(HL)
        AND     $7F
        LD      E,A
        PUSH    BC
        PUSH    HL
        CALL    PUTCHAR
        POP     HL
        POP     BC
        INC     HL
        DJNZ    PUTNAME
        RET

; TYPE streams public 128-byte records and stops at CP/M text EOF.
CMDTYPE:
        CALL    ARGSKIP
        JR      Z,FILENO
        CALL    ONENAME
        LD      DE,CMDFCB
        LD      C,15
        CALL    BDOS
        INC     A
        JR      Z,FILENO
        LD      DE,LOADBUF
        LD      C,26
        CALL    BDOS
        CALL    PGINIT

TYPEREAD:
        LD      DE,CMDFCB
        LD      C,20
        CALL    BDOS
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
        LD      DE,CMDFCB
        LD      C,16
        CALL    BDOS
        JP      STARTED

FILENO:
        LD      DE,NOFILE
        JP      PRTGO

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
        AND     $DF
        LD      (ERAANS),A

ERADRAIN:
        LD      C,1
        CALL    BDOS
        CP      CR
        JR      NZ,ERADRAIN
        LD      A,(ERAANS)
        CP      'Y'
        JP      NZ,STARTED
        LD      A,1
        LD      (ERAALL),A

ERADEL:
        LD      DE,CMDFCB
        LD      C,19
        CALL    BDOS
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
        LD      DE,CMDFCB
        LD      C,23
        CALL    BDOS
        INC     A
        JP      Z,FILENO
        JP      MAINLOOP

RENEXIST:
        LD      DE,FILEEX
        JP      PRTGO

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
        LD      C,15
        CALL    CPSRC
        INC     A
        LD      DE,CPNOSRC
        JR      Z,CPFAIL
        LD      C,19
        CALL    CPDST
        LD      C,22
        CALL    CPDST
        INC     A
        LD      DE,CPNODST
        JR      Z,CPFAIL
        LD      HL,0
        LD      (DIRNUM),HL
CPLOOP:
        LD      C,20
        CALL    CPSRC
        OR      A
        JR      NZ,CPDONE
        LD      C,21
        CALL    CPDST
        OR      A
        LD      DE,CPWRITE
        JR      NZ,CPFAIL
        LD      HL,(DIRNUM)
        INC     HL
        LD      (DIRNUM),HL
        JR      CPLOOP
CPDONE:
        LD      C,16
        CALL    CPDST
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
CPFAIL:
        JP      PRTGO

; BDOS function C on the source or the destination.
CPSRC:
        LD      DE,CMDFCB
        JP      BDOS
CPDST:
        LD      DE,RENFCB
        JP      BDOS

CPHEX:
        PUSH    AF
        RRCA
        RRCA
        RRCA
        RRCA
        CALL    CPNIB
        POP     AF
CPNIB:
        AND     $0F
        ADD     A,$90
        DAA
        ADC     A,$40
        DAA
        LD      E,A
        JP      PUTCHAR

; UNLOAD: the lowest resident goes, or the command comes back with a question
; mark.
CMDUNL:	CALL	DRVUNL
	JP	NC,STARTED	; carry: DRVUNL refused
	JP	BADCMD

; TEC-OS: CON shows the console in use; CON TTY, CRT, BAT or UC1 (a colon
; may follow) sets the IOBYTE CON: field. The BIOS switches at the next
; console call, so the report appears on the new console, and names the
; serial terminal when the chosen display or keyboard is missing.
CMDCON:
        CALL    ARGSKIP         ; an error names the argument
        JR      Z,CONSHOW
        LD      DE,CONNAMS
        LD      B,0
CONNXT:
        PUSH    HL
        LD      C,3
CONCMP:
        LD      A,(DE)
        CP      (HL)
        JR      NZ,CONNO
        INC     HL
        INC     DE
        DEC     C
        JR      NZ,CONCMP
        POP     AF              ; matched: drop the saved text pointer
        LD      A,(HL)
        CP      ':'
        JR      NZ,CONEND
        INC     HL
CONEND:
        CALL    ENDCHK
        LD      A,(IOBYTE)
        AND     $FC
        OR      B
        LD      (IOBYTE),A
        LD      A,B             ; UC1: the GLCD's driver, if it is not in
        CP      CMUC1
        CALL    Z,GLCLD
CONSHOW:
        LD      DE,CONHDR
        CALL    PUTSTR
        LD      A,(CONMOD)
        ADD     A,A
        LD      L,A
        LD      H,0
        LD      DE,CONMSGS
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        CALL    PUTSTR
        LD      DE,CRLFMSG
        CALL    PUTSTR
        JP      MAINLOOP
CONNO:
        POP     HL
CONSKIP:
        INC     DE              ; to the next name
        DEC     C
        JR      NZ,CONSKIP
        INC     B
        LD      A,B
        CP      4
        JR      NZ,CONNXT
        JP      BADCMD

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

        LD      DE,CMDFCB
        LD      C,19
        CALL    BDOS
        LD      DE,CMDFCB
        LD      C,22
        CALL    BDOS
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
        LD      DE,CMDFCB
        LD      C,21
        CALL    BDOS
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
        LD      DE,CMDFCB
        LD      C,16
        CALL    BDOS
        INC     A
        JR      Z,SAVENOSP
        JP      MAINLOOP

SAVENOSP:
        LD      DE,NOSPACE
        JP      PRTGO

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
        CALL    BDOS
        RET

; Parse one CP/M file reference into the first 16 bytes of an FCB. HL points
; at the first token byte and returns at its delimiter. A '*' expands to '?'
; through the remainder of its current field.
PARSEFCB:
        LD      (FCBBASE),DE
        PUSH    HL
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
        POP     HL

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
        PUSH    HL
        LD      HL,(FCBBASE)
        LD      DE,9
        ADD     HL,DE
        EX      DE,HL
        POP     HL
        LD      B,3
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
        LD      A,(HL)
        OR      A
        JR      Z,PLEND
        CP      SPACE
        JR      Z,PLEND
        CP      '='
        JR      Z,PLEND
        CP      '.'
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
        JR      Z,UNAMBAD
        LD      B,11

UNAMLOOP:
        LD      A,(HL)
        CP      '?'
        JR      Z,UNAMBAD
        INC     HL
        DJNZ    UNAMLOOP
        POP     BC
        POP     HL
        OR      A
        RET

UNAMBAD:
        POP     BC
        POP     HL
        SCF
        RET

; CP/M 2.2 reserves these characters inside filename and filetype fields.
; Dot and equals are handled as grammar delimiters, while question mark and
; asterisk remain available to the ambiguous DIR and ERA forms.
VALIDCHR:
        PUSH    HL
        PUSH    BC
        LD      HL,BADCHARS
        LD      B,13

VLDLOOP:
        CP      (HL)
        JR      Z,VALIDBAD
        INC     HL
        DJNZ    VLDLOOP
        POP     BC
        POP     HL
        OR      A
        RET

VALIDBAD:
        POP     BC
        POP     HL
        SCF
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

PUTCHAR:
        LD      C,2
        JP      BDOS
