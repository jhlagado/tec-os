# Normal process count and price

The normal path has these seven processes:

1. The product-owned meter.
2. The byte-exact product collector, its directly retained child.
3. The unchanged Node guard, waited by the collector.
4. The product prearmed watchdog, waited by the guard.
5. The watchdog's supervisor fork, waited by the watchdog.
6. The warm Node worker, waited by the supervisor.
7. At most one synchronous guard query at a time.

The initial shell must exec the fixed env/interpreter surface. env then execs
Python. The collector's env/interpreter launch also replaces that process image.
These sequential exec images add no concurrent process. No timeout wrapper,
bootstrap, new timer helper, pool or extra worker is present. The warm helper
factories call the in-process Machine and CPU APIs. Frozen tests/checkers are
read as text and are never imported whole. The selected Machine/provider code
contains no host child or Worker API. Node's threads remain charged to its
process RSS. The guard's ps/sysctl queries use spawnSync serially.

For this exact normal path, Linux specific wait rusage propagates each normally
reaped child's highwater through its parent. Node is waited by supervisor, then
supervisor by watchdog, watchdog by guard, guard by collector and collector by
meter. The guard also waits its synchronous query. Collector wait4 peak T
therefore bounds each of the six descendant roles individually. Meter SELF O
is measured after all source, context, semantic and retention reads and hashes.
The prospective upper sum is:

    O + 6*T + 8*1024*1024 <= 600*1024*1024

This is a source-qualified conservative process sum, not sampled simultaneous
RSS. No inherited RUSAGE_CHILDREN maximum is subtracted. The exact specific
collector wait PID/raw status/full rusage and final SELF scalar are retained.
Collector's actual guard wait highwater must fit T as an additional raw join.
The original DATA preflight runs and exits before the meter. Its actual SELF
peak is retained and the maximum of that sequential peak and the process sum
must fit the same 600 MiB cap. It adds no concurrent slot.

The three old inert reserve slots are not silently removed from an old result.
This is a new prospective warm-command price for a closed seven-process source
path with explicit exec semantics. Every original ten-slot inert price/result
remains unchanged. A different reviewer must establish this complete count and
Linux propagation before allocation. No old price or sampled 225 MB diagnostic
result establishes the warm worker's T. Guard/family heap 450 remains. Worker old-space is fixed at 64. Neither caps
RSS, buffer storage, runtime memory or the guard.

Normal acceptance requires actual collector raw 0, actual sole guard raw 0 with
pre-reap owned zombie identity, final ECHILD, two EOFs and no extra/adopted/lost
status, holds or signals. It also requires the exact four success markers and
released/finalized supervisor context after actual Node 0. Any incomplete or
exceptional path lacks a normal price. The original collector retains its
subreaper and sole-wait responsibility on unknown endings.

Input verification streams through one reused 64 KiB buffer. The 126,939,688-byte
Node executable is hashed completely with its exact declared length. This
retains the old streamed allocation and predicts no warm price.

The seventeen-row result has a 1 MiB read bound. Source/runtime references have
4MiB per-reference bounds and are streamed where possible. The raw captures
and guard log have 64 KiB bounds and collector metadata 256 KiB. All complete raw
observations and errors remain in the worker file. The meter checks exact
private directory contents and fsyncs the worker's closed file before O.
The raw specific-wait receipt has a 4 KiB cap and is written before these reads.
Every input/reference postflight, semantic parse, raw-output read and hash
finishes before O.

After O only scalar arithmetic and bounded projections remain. The final
record contains a fixed 16-field raw wait account, seventeen compact row
summaries, four protocol lines, small identity/context/hash fields and the
price. Its complete encoded size must fit 8 KiB. Exclusive full write/fsync/close
is followed by at most 512 bytes binding the receipt hash and after-close
BOOTTIME sample, then another original-interval check. The unchanged 8 MiB
reserve covers that bounded normal serialization/I/O tail. It is not a bound
on arbitrary allocator, kernel or failed filesystem behaviour.

The original 120-second independent watchdog is not replaced with an inner 112
or a renewed deadline. It is prearmed before child verification and remains
active through interpreter shutdown. The meter main ENTRY sample follows Python module imports. Its unchanged
120-second interval contains subsequent setup, pre/postflight, wait and ending,
not interpreter or module startup before main. The separate continuous root
external 120 interval starts before original preflight and interpreter startup
and ends after actual terminal, capture closure and the receipt tail. Original full 120
expiry is unobserved and its optional infeasible offer stays inactive. The
accepted short 5 result qualifies only its labelled dispatch/known-ending scope.
No physical cutoff, IRQ/NMI, hardware or universal cleanup claim is made.

Root retains the entire original source/provider/authority/offer/allocation
closure and every actual raw/contained output and external response. Offline
packaging is separate DATA work. Resource release and any successor remain
root decisions after independent actual review. A late or failed ending
overrides matching semantic rows and cannot be repaired by a retry.

Current-candidate qualification remains held for XR-04 and the separate profile/
current-map account. Frozen 7f475029… and approved e4d8… remain fixed reference
inputs. This meter supplies no display-policy disposition or current-source
qualification. Historical ROM 814 is unaffected.

The memory successor changes no role, multiplier, wait or clock placement.
Its fifteen setup-history root releases do not erase an earlier peak or force
collection. The original deferred cell retains its complete histories. Fixed
worker64 is one new exact offer under the standing450 ceiling, while actual
guard/family450 remains unchanged. No failed warm01 price is recomputed.
