# CCP inline BDOS call model

This is a model against production snapshot `304d268`, not a second production
landing. The archived incumbent has 14,577 used ROM bytes and a 2,452-byte CCP.
The first model measured 14,562 and 2,437 respectively: 15 additional bytes
saved, with RAM 396 and starter TPA 46,869 unchanged. Its ROM SHA-256 is
`43c4b99c57860a89f703197ac2a90962aa798d1fdc0627dd530ee424521c11b2`.

The first figures and the exact runner behind their digest are retained under
`test/model/ccp-calls/`. The runnable tool now uses repository-relative imports
and adds stronger observations; those additions need their own executed result.
Do not transfer a first-run pass to an unexecuted observation.

The 21 ordinary calls each replace a two-byte function load plus three-byte
call with a three-byte call and one-byte descriptor. The old wrappers total
12 bytes and the dispatcher is 18. The former terminal jump becomes
CALL/descriptor/RET, still five bytes. Net saving: 21 − (18 − 12) = 15.

The descriptor is `function*2+destination`, where destination zero selects
CMDFCB and one selects RENFCB. EX (SP),HL accesses and advances the caller's
return PC while restoring HL. SRL decodes C and the FCB bit. BENTRY replaces
incoming flags with CP before dispatch; returning BDOS flags remain untouched.
Ordinary source calls add 52 T-states and destination calls 72. The converted
READSRC terminal path adds 69 T-states and holds an extra two-byte return
address until its final RET. Its loader boundary/error proof is mandatory.

Run under the shared memory guard, limit 800 MB and heap 384 MB, with
`MODEL_JOBS=1`:

```
node tools/ccp-call-model.mjs build/ccp-call-figures.json
node tools/ccp-load-proof.mjs build/ccp-calls-model/incumbent build/ccp-calls-model/descriptor-shared build/ccp-call-load.json
node tools/ccp-pager-proof.mjs build/ccp-calls-model/incumbent build/ccp-calls-model/descriptor-shared build/ccp-call-pager.json
node tools/ccp-dir-proof.mjs build/ccp-calls-model/incumbent build/ccp-calls-model/descriptor-shared build/ccp-call-dir.json
```

Then run chain, history, startup, COPY, search and stack tests from the
`build/ccp-calls-model/descriptor-shared` directory. These are focused model checks;
the production stage gate separately requires qualification at its selected
source tip. The loader Bad Sector injection enters the real read handler's
error exit to check frame abandonment, not the SD transport's fault handling.

## Selected model and remaining opportunities

The full model/proof run at `07daed7` selected the shared final JP: a 17-byte
helper, 16 net ROM bytes saved. Used ROM is 14,561, CCP 2,436, SHA-256
`ab2d0c6b8a8d5d36ad3c51af3ef22cfb166890cc412f51bb9352b7a80cb27ed6`.
Its source/destination dispatch costs 91/96 T-states: ordinary calls add
64/69 and the former terminal path adds 81. The small COPY session adds
468 T-states; the worst tested ceiling-sized load adds 30,081 (7.52 ms at
4 MHz). The 18-byte alternative remains in the model and its figures.

All 2,972 parser observations, 33 complete sessions and startup, actual BDOS
return-register/flag traces, and three actual startup mutants pass. Eight
loader pairs include EOF, ceiling refusal and a Bad Sector exit through warm
boot, with and without a resident. READSEQ entry use rises from 10 to 12 stack
bytes; loader peak remains 12. Six pager pairs and five DIR cases/controls
pass. The 79 focused tests pass with no failures or skips; the broad stack
workload remains CCP 22/30, BDOS 32/54 and BIOS 16/38. The guarded run took
233.5 seconds at 352 MB peak. Evidence is in the Origo SOT under
`studies/p3-tec-os/evidence/ccp-calls/model/`. These are model results, pending
production promotion and qualification under a registered second gate.

The remaining bounded alternatives have explicit costs:

- A common command-source provider costs 35 bytes against the existing 26,
  nine bytes larger with another frame. Chain echo is already shared in
  17 bytes. Reject for this size task.
- A generic read/write record helper saves only one byte while adding a
  frame and cycles on the write path. Reject that trade.
- POP HL / LD C,(HL) / INC HL / PUSH HL saves 17 T-states against the exchange
  sequence but saves no bytes and relaxes the preserved-HL contract. Retain
  the stronger reviewed contract.
- Selecting the destination by changing E alone is invalid: CMDFCB at BCEBh
  and RENFCB at BD0Fh lie on different pages.

DIRANY and DIRENTP leave three reserved RAM bytes unused; integration can
consider them in workspace packing. They are not counted as ROM savings.
Previous-command recall remains Ctrl-W/Ctrl-N and passes the focused history
suite. Batch support is an optional separate feature decision.
