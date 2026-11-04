// Additional bounded BDOS alternatives from the reviewed brief addendum.
import { patch } from "./model.mjs";
const edit=(d,a,b)=>patch(d,"src/cpm/bdos.asm",a,b);
export function offset(d){edit(d,`        LD      C,(HL)          ; EXM
        LD      DE,12
        CALL    FCBOFF`, `        LD      C,(HL)          ; EXM
        CALL    FCBEX`);}
export function publish(d){
  for(const field of ["FSIZE","CAND"]){
    edit(d,`        LD      DE,33
        CALL    FCBOFF
        LD      A,(${field}0)
        LD      (HL),A
        INC     HL
        LD      A,(${field}1)
        LD      (HL),A
        INC     HL
        LD      A,(${field}2)
        LD      (HL),A`, `        LD      DE,${field}0
        CALL    PUBRR`);
  }
  edit(d,"; Convert an FCB-shaped EX/S2 position at HL to its 24-bit record base.", `; Publish three bytes from DE to the caller's random-record field.
; HL/DE/BC are scratch; the callers finish through RETA or RETZERO.
PUBRR:  LD      HL,(PARAM)
        LD      BC,33
        ADD     HL,BC
        EX      DE,HL
        LD      C,3             ; B is already zero
        LDIR
        RET

; Convert an FCB-shaped EX/S2 position at HL to its 24-bit record base.`);
}
function body(prefix,operation){return `        LD      A,(IX+6)
        OR      A
        LD      A,16
        JR      Z,${prefix}COUNT
        LD      A,8
${prefix}COUNT:
        LD      (ALLEFT),A
${prefix}CELL:
        LD      E,(HL)
        LD      D,0
        INC     HL
        LD      A,(IX+6)        ; BITPTR preserves/reloads this drive's DPB
        OR      A
        JR      Z,${prefix}HAVE
        LD      D,(HL)
        INC     HL
${prefix}HAVE:
        PUSH    HL
        CALL    ${operation}
        POP     HL
        LD      A,(ALLEFT)
        DEC     A
        LD      (ALLEFT),A
        JR      NZ,${prefix}CELL
        RET`};}
export function walkers(d){
  // Exact source regions, not a permissive instruction-pattern substitution.
  const parent=`        LD      DE,(DPBPTR)
        INC     DE
        INC     DE
        INC     DE
        INC     DE
        INC     DE
        INC     DE
        LD      A,(DE)
        OR      A
        JR      NZ,PARWORD
        LD      A,16
        LD      (ALLEFT),A

PARBYTE:
        LD      E,(HL)
        LD      D,0
        INC     HL
        PUSH    HL
        CALL    MARKBLK
        POP     HL
        LD      A,(ALLEFT)
        DEC     A
        LD      (ALLEFT),A
        JR      NZ,PARBYTE
        RET

PARWORD:
        LD      A,8
        LD      (ALLEFT),A

PARWLOOP:
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        INC     HL
        PUSH    HL
        CALL    MARKBLK
        POP     HL
        LD      A,(ALLEFT)
        DEC     A
        LD      (ALLEFT),A
        JR      NZ,PARWLOOP
        RET`;
  const free=`        LD      A,(IX+6)
        OR      A
        JR      NZ,FREEWORD
        LD      A,16
        LD      (ALLEFT),A

FREEBYTE:
        LD      E,(HL)
        LD      D,0
        INC     HL
        PUSH    HL
        CALL    CLRBLK
        POP     HL
        LD      A,(ALLEFT)
        DEC     A
        LD      (ALLEFT),A
        JR      NZ,FREEBYTE
        RET

FREEWORD:
        LD      A,8
        LD      (ALLEFT),A

FREEWLOP:
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        INC     HL
        PUSH    HL
        CALL    CLRBLK
        POP     HL
        LD      A,(ALLEFT)
        DEC     A
        LD      (ALLEFT),A
        JR      NZ,FREEWLOP
        RET`;
  edit(d,parent,"        LD      IX,(DPBPTR)\n"+body("PAR","MARKBLK"));
  edit(d,free,body("FREE","CLRBLK"));
}
