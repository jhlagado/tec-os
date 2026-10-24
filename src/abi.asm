; Native ABI entry table at a fixed ROM address. Signature, ABI version,
; native bank count, then the service entry. The layout of this table is part
; of ABI version 1.

        ORG     $FF00
ABITAB: DB      "TNA"           ; FF00h signature
        DB      1               ; FF03h ABI major version
        DB      0               ; FF04h ABI minor version
        DB      NBANKS          ; FF05h native banks
        JP      NATSVC          ; FF06h service entry: C = service
ABIEND:
