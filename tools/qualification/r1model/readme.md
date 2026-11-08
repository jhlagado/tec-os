# Direct R1 fallback model

This inactive packet compares the current 29-byte PICO interrupt-clear helper, PIICLR with the
admitted 28-byte bare fallback design. Root allocated source construction in
Origo 9a1ed300 under KD-255. No canonical firmware, test, profile, map, media,
KG56 reference or consumer pin changes here. A different complete source and
command review must precede any execution allocation.

Read bytes.dat for the manual instructions and synthetic address map, then
model.mjs for the public CPU/device callbacks and separate policy oracle.
run.mjs checks inputs before importing those APIs and retains each observation.
launch.py contains the actual child wait, output validation and whole price.
cases.dat retains all 32 positive and six fault declarations unchanged.

Only six direct cases and four applicable fault discriminators are implemented.
The six cases execute both old and proposed helpers. Three disposable mutants
add three observations, making 15. The old-C0 discriminator reuses the already
validated old bare observation. The 21 warm and five cold positives and two
warm faults remain incomplete. No partial result closes XR-04.

The CPU is the actual debug80-runtime 0.3.3 public z80/cpu API. Its initCpu and
execute exports accept the inspected CPU object and four memory/I/O callbacks.
The public platforms/tec1g/tms9918 device supplies createTms9918, register writes
and stateSnapshot. The exact existing 219-file package and its closed tree are
bound. There is no package install, synthetic CPU interpreter or invented API.
The deterministic module paths identify public exported subpaths. No interrupt
delivery API or VDP frame clock is called. This checks software register effects
with interrupt delivery excluded, not physical IRQ/NMI behaviour.

bytes.dat is a manually relocated model projection, not an assembled ROM.
Its old29 instructions are joined to the exact frozen 7f475029 helper by six
explicit operand relocations. VPAIR writes a control pair and IFFGET samples interrupt flip-flops. Their bytes are also joined
to that ROM. Their instructions remain unchanged. The proposed28 bytes use the
admitted separate 80h fallback and JR+5. Synthetic addresses do not describe the
current ROM/RAM layout and no new ROM hash is created. Current source and the
frozen historical source/map remain separate bound subjects.

Each observation executes a real CALL and returns to the fixed caller stop.
It retains every instruction boundary, cycles, minimum SP, memory write and
full 16-bit I/O port. It includes full before/after 64 KiB fixture memory,
eight VDP registers and 16 KiB VRAM. Setup uses supported device methods before
observation. The absent device is seeded before setActive(false), so its valid
nonzero table fixture can discriminate missing presence gating independently
of device output. No console installation or HWSVID call is claimed by these
direct RAM fixtures.

The separate oracle checks actual return, exact standard cycles, unchanged
BC/DE/I/IFF/claim/pointers, owned stack/shadow writes and unchanged other VDP
registers/VRAM. Then it checks full R1, zero shadow and exact control pair.
Old bare C0 is a legacy positive before the new80 fault assertion. Each mutant
must complete bounded CPU/setup checks before its named policy assertion.
Only R1OracleFailure with the declared code supplies fault credit. CPU, setup,
provider, write, timeout or generic exceptions stop the whole candidate.

The four direct discriminators are old-C0, a blanked real32 table, a skipped
PITIE store and a missing absent return. They retain exact disposable bytes in
their readings. Warm caller bypass and other-console teardown mutants stay
unimplemented with their warm/cold prerequisites. Installed C0/D0 tables,
current ABI5.1/PICO4/minimum-width3, zero added RAM/stack and BIOS40 remain
preservation requirements, not newly qualified product results.

Node child creation is denied before model/provider import. Wildcard filesystem
permissions allow the sealed inputs and fresh outputs and are not a filesystem
sandbox. Every output uses exclusive public O_SYNC writes with checked full
progress and mode0600 in private0700 directories. The outer audits actual
closed files through fsync/EOF/hash and directories before SELF. Complete first
failure artifacts remain at their actual paths, including incomplete files
that never entered the Node inventory. There is no retry or automatic queue.

Normal output is exactly 28 files: ten source copies, 15 readings and three
aggregate files. A separate fail.dat prevents normal acceptance. Root retains
all source/provider identities, raw captures, actual allocation, original host
preflight and every external response through terminal. The inactive offer
supplies no observation, price, capability, resource release or complete gate
acceptance. Its fixed fresh namespace must be rechecked at actual startup.

The retained TMS renderer does not enforce display-enable bit40h in its
Graphics I rendering path. This model reads register state and never uses a
picture as a blanking oracle. Full R1=80h is not proof of a blank physical
screen or Graphics I mode. The old 7f/e4 reference, current7293 profile,
historical ROM814 and every failed result remain unchanged.
