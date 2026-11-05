# C13 correctness repair qualification

The measured production and named-test pin is
`071d6d7de743afcca18da10b285e0ad9b57390bc`, from current base
`fe2097f4bad3f7578aa41b8bce8aa571c451dbc7`. Subsequent branch commits
add qualification controllers, records and the measured documentation.
Independent driver measurement and result review remain required before
landing. No standing gate or resource floor is changed.

## Strict measurement

[The corrected exact-tip run](revised/strict.log) passed all 726 cases,
726 passes, zero failures, zero cancellations and zero skips. This is the
existing 719-case set plus six registry regressions and one repeated CLI
regression. [All names and results](revised/test-results.json) are retained.

The 900 MB shared guard recorded 819.3 seconds, 621 MB peak and at most
11 processes. The run finished at 09:10:13 UTC on 5 November 2026, before
the original absolute deadline of 09:15:02 UTC. The 30-minute deadline was
not extended when qualification restarted. Preparation executed the setup
block extracted from the pinned README, with toolchain overrides unset.
The local host, runner, lock, runtime and selected application binaries were
verified through the normal pin checker. The strict trace shows TAS
production builds and live copied-source builds. Historical and test-only
ATOM paths remain explicit.

Fresh stack readings are BDOS 30/54, CCP 18/32 and BIOS 18/40.
The table's bases are 30, 18 and 18, and its limits are 8, 6 and 12.
The combined figures are 38/54, 24/32 and 30/40. The new table assertion
passed. [Stack census](revised/stack-census.json) and
[hardware-service census](revised/hwsvc-stacks.json) are retained.

## Comparison and negative control

[The bounded comparison](revised/comparison.log) passed in 37.8 seconds,
210 MB peak and at most five processes under the same shared guard,
with a 120-second hard deadline. Its guard reports no wait. Repeated
fresh TAS outputs agree. An independent checkout of the same source pin
built with explicit ATOM and matched ROMs, censuses, media, service
relocation and D8 semantics outside generator provenance.
Both executable paths used the normal verified application pin selection,
relayed explicitly to the reference checkout. No alternate lock was used.

The actual unchanged `V_REFUSE=1` test rejected a temporary fixture that
sets `RESULT=2` but omits the seven `OLDCO` hook-restoration instructions.
Its prior checks for natural SP return, `rc=2`, marker 2 and retained
pages were reached. The state comparison differs specifically at the
actual hook, 46936 instead of 52175. The production ROM and named
assertion source were unchanged. [Fixture diff](hook-mutant/fixture.patch),
[command and hashes](hook-mutant/result.json), and
[expected assertion failure](hook-mutant/output.log) are retained.
The expected mutant exit 1 is separate from the zero-failure strict run.

## Interrupted attempt and proof correction

The first attempt used code/test pin
`00410a48c364ee9f40912f9364c653424ba5d70e`.
Its observer read `RAMBIOS+10`, the CONIN word. The fixture modifies
the word at `(0001h)+HOOKAT`: the warm-boot entry is `RAMBIOS+3` and
HOOKAT is 10, so the affected CONOUT word is at `RAMBIOS+13`.
The marker check was valid, but the observation did not prove restoration
of the actual hook.

That attempt was intentionally terminated with process-group SIGTERM,
then the observer alone was corrected. The test-runner cancellation and
pending-promise diagnostics in [the interrupted log](strict.log) follow
that intentional stop. They are not evidence of a Node/runtime failure.
No result from this attempt qualifies the corrected test.
[Attempt identities](attempts.json) preserve the distinction.
The separate bounded survey's earlier runtime deadlock observations
remain their own evidence.

## Resources and documentation

The measured ROM uses 16,020 bytes, two above the base, with 364 free,
108 above the standing 256-byte floor. Starter TPA is 47,268 and
four-G8M TPA 46,564. Workspace and stack reservations are unchanged.
Diagnostic ROM, GLCD.SVC, MOUNT.COM and DEMO.COM retain the qualified
binary readings.

The main ROM SHA-256 is
`2b719d6cbcfc50d48498a5d2a8a7449b23df82306d989c1d7018e4830edf7f09`.
[Artifact and census hashes](revised/artifact-hashes.json) record the
strict run. [Final TAS/ATOM hashes and documentation](revised/final-hashes.json)
also record the independent reference.

Media regenerated the memory map and the ROM space spans. The inventory's
loader row and total are then reconciled from the measured D8 map and
census to 744 and 16,020. Its source-file rows sum to the census.
[Inventory reading](revised/inventory-reading.json) records that check.
The raw media-generated documentation delta is kept separately in
[generated-docs.patch](revised/generated-docs.patch). This documentation
update does not change production assembly or named test definitions.

## Commands and records

- [Strict command](strict.sh), [extracted README setup](revised/setup.sh),
  [strict guard](revised/strict-guard.jsonl) and
  [production trace](revised/strict-trace.jsonl).
- [Comparison command](compare.sh), [comparison guard](revised/comparison-guard.jsonl),
  [repeat trace](revised/repeat-trace.jsonl),
  [ATOM trace](revised/atom-trace.jsonl),
  [comparison trace](revised/comparison-trace.jsonl) and
  [selected inputs](revised/resolved-inputs.json).
- [Hard deadline controller](deadline.py). The strict invocation uses
  `@1793870102`, the original absolute deadline. The comparison uses
  a separate 120-second deadline.
