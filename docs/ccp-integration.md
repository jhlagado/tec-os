# CCP integration handoff

The isolated work is on `ccp-calls`, with `ccp-potential` as the integration
handoff branch. Main has not been merged or modified. The qualified source
is `420d8f28899ad9f74b909c3357fe84ff07f226b3`; subsequent changes update
accounts, this handoff and the historical KG42 model's default revision.

| Account | KS38b baseline | First increment | Selected result |
| --- | ---: | ---: | ---: |
| Used ROM | 14,645 | 14,577 | 14,561 |
| Free ROM | 1,739 | 1,807 | 1,823 |
| CCP extent | 2,520 | 2,452 | 2,436 |
| CCP instruction bytes | 2,520 | 2,452 | 2,414 |
| CCP inline immutable bytes | 0 | 0 | 22 |

The total saving is **84 ROM bytes**. The second increment removes 38
instruction bytes and adds 22 descriptor bytes, saving 16 net. ROM outside
the CCP extent remains 12,125 bytes. CCP RAM remains 396 bytes, including
its 30-byte stack, and starter TPA remains 46,869 bytes. DIRANY and DIRENTP
leave three reserved bytes unused for a later workspace-packing decision;
they are not counted as ROM savings.

The selected ROM SHA-256 is
`ab2d0c6b8a8d5d36ad3c51af3ef22cfb166890cc412f51bb9352b7a80cb27ed6`.
ATOM 0.3.7 produced it twice byte-identically. At the qualified tip, all
632 strict tests passed with no failures or skips, followed by media and
web builds. The complete guarded pipeline took 723.8 seconds at 607 MB
peak. Stack high-water marks remain CCP 22/30, BDOS 32/54 and BIOS 16/38.
Ctrl-W/Ctrl-N recall, editing recalled lines, ring wrap, warm-boot history
and complete chained-line replay pass.

The implementation preserves the current TEC-OS baseline. It compacts
parsing, directory state/paging, command dispatch and source handling,
then shares the BDOS function/FCB call setup. It adds no user-facing
features. The final descriptor helper preserves HL, B and A before BDOS,
advances the return PC over one inline byte and retains BDOS's normal
results. The former READSRC tail holds one extra return word; measured
loader peak remains 12 bytes, including EOF, ceiling refusal and an
injected read-handler Bad Sector exit through warm boot.

Relative to the first increment, ordinary source/destination calls add
64/69 T-states and the former tail path adds 81. The small COPY session
adds 468 T-states; the worst tested ceiling-sized load adds 30,081
(7.52 ms at 4 MHz). The earlier parser compaction has a separate worst
malformed-input cost of 1,751 T-states (0.438 ms). The measured alternatives
and costed rejections are retained in [the model notes](../tools/ccp-call-model.md).

The Origo SOT contains the two registered gates and their evidence under
`studies/p3-tec-os/evidence/ccp-compact/` and
`studies/p3-tec-os/evidence/ccp-calls/`. Models use the pinned incumbent as
the behavioral oracle. The separate `ccp-oracle` branch is offered as
historical-reference tooling, not merged here; original CP/M differences,
including batch support, are separate feature decisions rather than new
parity requirements.

For integration, reconcile this branch against current main and rerun the
relevant full qualification there: main's ongoing storage/workspace work
may change addresses and whole-ROM totals. Keep KG42's historical check
pinned to its registered artifacts (`7935507` and `626ee41`); do not broaden
its masks to accept later CCP changes. The historical mutant tool now
also defaults to `626ee41` and retains its original mutation selectors.
