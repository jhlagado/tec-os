; RINGFIL [R]: puts EXPAND 1 in view and back, as a program that uses the
; bank itself does. With no tail it only reads the history page at BD00h;
; with any tail it writes 'R' over all 256 bytes of it. Interrupts are off
; and the stack is not used while the bank is in view: the CCP's stack is in
; EXPAND 0. Prints OK.
%INCLUDE "../../src/abi.inc"

BDOS    EQU     $0005
HRING   EQU     $BD00

        ORG     $0100
        LD      A,($0080)       ; the tail's length: 0 reads only
        LD      E,A
        DI
        LD      A,(LATCHV)
        OR      LATEXP
        OUT     (SYSLAT),A      ; EXPAND 1 in view
        LD      HL,HRING
        LD      B,0
FILL:   LD      A,(HL)          ; a read either way
        INC     E
        DEC     E
        JR      Z,NEXT          ; no tail: read only
        LD      (HL),'R'
NEXT:   INC     L
        DJNZ    FILL            ; all 256 bytes
        LD      A,(LATCHV)
        OUT     (SYSLAT),A      ; EXPAND 0 again
        EI
        LD      DE,MSG
        LD      C,9
        JP      BDOS
MSG:    DB      "OK$"
