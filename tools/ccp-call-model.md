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
node tools/ccp-load-proof.mjs build/ccp-calls-model/incumbent build/ccp-calls-model/descriptor build/ccp-call-load.json
node tools/ccp-pager-proof.mjs build/ccp-calls-model/incumbent build/ccp-calls-model/descriptor build/ccp-call-pager.json
node tools/ccp-dir-proof.mjs build/ccp-calls-model/incumbent build/ccp-calls-model/descriptor build/ccp-call-dir.json
```

Then run chain, history, startup, COPY, search and stack tests from the
`build/ccp-calls-model/descriptor` directory. These are focused model checks;
the production stage gate separately requires qualification at its selected
source tip. The loader Bad Sector injection enters the real read handler's
error exit to check frame abandonment, not the SD transport's fault handling.
