"""Inactive KG56 offer launcher/collector; existing actor becomes subreaper.

All target calls need a separately hash-named allocation. No PID-name kills.
After abnormal tail timeout this collector stays held/reap-only while it still
owns children; it does not abandon them to container PID1 or claim release.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import sys
import time

TARGET_LAUNCH_STARTED = False
RETAINED_GUARD = None
GUARD_REAP_STARTED = False


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            value.update(block)
    return value.hexdigest()


def verify(offer):
    for link in offer['symlinks']:
        path = Path(link['path'])
        if not path.is_symlink() or os.readlink(path) != link['target'] or str(path.resolve()) != link['realpath']:
            raise RuntimeError('runtime symlink changed')
    for name in offer['absentPaths']:
        if Path(name).exists() or Path(name).is_symlink():
            raise RuntimeError('unexpected optional executable')
    for row in offer['members']:
        path = Path(row['path'])
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or str(path.resolve()) != row['realpath'] or info.st_size != row['bytes'] or format(stat.S_IMODE(info.st_mode), '04o') != row['mode'] or digest(path) != row['sha256']:
            raise RuntimeError('input identity mismatch: ' + str(path))
    for tree in offer['closedTrees']:
        root = Path(tree['path'])
        paths = []
        for current, directories, files in os.walk(root, followlinks=False):
            if Path(current) == root:
                directories[:] = [d for d in directories if d not in tree.get('excludedTopDirectories', [])]
            paths.extend(Path(current) / name for name in directories + files)
        observed_files = set()
        observed_directories = set()
        for path in paths:
            kind = path.lstat().st_mode
            name = str(path.relative_to(root))
            if stat.S_ISREG(kind):
                observed_files.add(name)
            elif stat.S_ISDIR(kind):
                observed_directories.add(name)
            else:
                # No-follow type check rejects links and every special entry.
                raise RuntimeError('closed source tree contains a non-regular entry')
        if observed_files != set(tree['files']) or observed_directories != set(tree['directories']):
            raise RuntimeError('closed source tree changed')


def enable_subreaper():
    if sys.platform != 'linux' or ctypes.sizeof(ctypes.c_void_p) != 8 or ctypes.sizeof(ctypes.c_ulong) != 8 or ctypes.sizeof(ctypes.c_int) != 4:
        raise RuntimeError('reviewed Linux LP64 ABI required')
    api = ctypes.CDLL('/usr/lib/x86_64-linux-gnu/libc.so.6', use_errno=True)
    api.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    api.prctl.restype = ctypes.c_int
    records = []
    ctypes.set_errno(0)
    result = api.prctl(36, 1, 0, 0, 0)
    records.append(dict(operation=36, argument=1, result=result, errno=ctypes.get_errno()))
    if result != 0:
        raise RuntimeError('subreaper SET failed before launch')
    value = ctypes.c_int(-1)
    ctypes.set_errno(0)
    result = api.prctl(37, ctypes.addressof(value), 0, 0, 0)
    records.append(dict(operation=37, result=result, errno=ctypes.get_errno(), observedValue=value.value))
    if result != 0 or value.value != 1:
        raise RuntimeError('subreaper GET failed before launch')
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    try:
        os.wait4(-1, os.WNOHANG)
    except ChildProcessError:
        return records
    raise RuntimeError('pre-existing child accounting; refuse before guard')


def identity(pid):
    # pid came from this collector's actual waitid(WNOWAIT): it cannot be
    # recycled until this sole wait path reaps it. Missing identity is held.
    try:
        with Path('/proc/' + str(pid) + '/stat').open('rb') as source:
            raw_stat = source.read(8193)
        text = raw_stat.decode('ascii')
        end = text.rfind(')')
        fields = text[end + 2:].split()
        with Path('/proc/' + str(pid) + '/cmdline').open('rb') as source:
            cmd = source.read(8193)
        if len(text) + len(cmd) > 8192:
            raise RuntimeError('bounded child identity overflow')
        return dict(available=True, pid=pid, state=fields[0], ppid=int(fields[1]), pgid=int(fields[2]), session=int(fields[3]), birthTick=int(fields[19]), cmdlineHex=cmd.hex(), zombieArgvUnavailable=not bool(cmd))
    except (OSError, ValueError, IndexError, RuntimeError, UnicodeError):
        return dict(available=False, pid=pid)


def main():
    global TARGET_LAUNCH_STARTED, RETAINED_GUARD, GUARD_REAP_STARTED
    if len(sys.argv) != 3 or 'ORIGO_GUARD' in os.environ:
        raise RuntimeError('exact offer/allocation outside a guard required')
    offer_path, allocation_path = map(Path, sys.argv[1:])
    offer = json.loads(offer_path.read_bytes())
    allocation = json.loads(allocation_path.read_bytes())
    if offer['active'] is not True or allocation.get('runtimeAuthority') is not True or allocation.get('kind') != 'P3_KG56_COMMAND02_ALLOCATION' or allocation.get('offerSha256') != digest(offer_path) or allocation.get('launcherSha256') != digest(Path(__file__)) or allocation.get('budget') != offer['budget'] or allocation.get('job') != offer['job']:
        raise RuntimeError('inactive/mismatched exact allocation')
    verify(offer)
    paths = [Path(offer[k]) for k in ('stdout', 'stderr', 'receipt', 'guardLog', 'workerOutput', 'supervisionOutput')]
    if len(set(paths)) != 6 or any(p.exists() or p.is_symlink() for p in paths):
        raise RuntimeError('fresh exclusive outputs required')
    os.umask(0o077)
    subreaper = enable_subreaper()
    signals = set()
    old_handlers = {}
    for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        old_handlers[signum] = signal.signal(signum, lambda number, frame: signals.add(number))
    env = dict(offer['environment'], KG56_COLLECTOR_PID=str(os.getpid()))
    guard = None
    waits = []
    held = []
    outcome_fragments = bytearray()
    guard_ending_tick = None
    forwarded = False
    guard_reap_started = False
    capture_failed = False
    ended_echild = False
    adoption_ack_sent = False
    streams_eof = set()
    start = time.clock_gettime_ns(7)

    def hold(reason):
        if reason not in held and len(held) < 16:
            held.append(reason)

    with paths[0].open('xb') as stdout, paths[1].open('xb') as stderr:
        if signals:
            raise RuntimeError('interrupted before launch')
        TARGET_LAUNCH_STARTED = True
        guard = subprocess.Popen(offer['argv'], cwd=offer['cwd'], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        RETAINED_GUARD = guard
        os.set_blocking(guard.stdin.fileno(), False)
        selector = selectors.DefaultSelector()
        for stream, target, label in ((guard.stdout, stdout, 'stdout'), (guard.stderr, stderr, 'stderr')):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, (target, label))
        try:
            while True:
                # Signals are latched, then forwarded only while the known
                # guard child remains unreaped. No Popen.poll/wait competitor.
                if (signals or held) and not forwarded and guard.returncode is None and not guard_reap_started:
                    os.kill(guard.pid, signal.SIGTERM)
                    forwarded = True
                    if signals:
                        hold('OUTER_INTERRUPTED')
                for unused in range(16):
                    try:
                        ready = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
                    except InterruptedError:
                        break
                    except ChildProcessError:
                        ended_echild = True
                        break
                    if ready is None:
                        ended_echild = False
                        break
                    info = identity(ready.si_pid)
                    if ready.si_pid == guard.pid:
                        # Never signal the PID after this sole reaper starts
                        # consuming its status, even if later bookkeeping fails.
                        guard_reap_started = True
                        GUARD_REAP_STARTED = True
                    try:
                        pid, raw, usage = os.wait4(ready.si_pid, os.WNOHANG)
                    except InterruptedError:
                        break
                    if pid != ready.si_pid:
                        raise RuntimeError('actual wait identity changed')
                    if pid == guard.pid:
                        guard.returncode = os.waitstatus_to_exitcode(raw)
                        guard_ending_tick = time.clock_gettime_ns(7)
                    record = dict(identity=info, pid=pid, rawStatus=raw, terminal=os.waitstatus_to_exitcode(raw), rawRusage=list(usage))
                    if len(waits) < 16:
                        waits.append(record)
                    else:
                        hold('WAIT_RECORD_OVERFLOW')
                    if not info['available'] or info.get('ppid') != os.getpid():
                        hold('UNCONFIRMED_OWNED_CHILD_IDENTITY')
                for key, mask in selector.select(.01):
                    try:
                        data = os.read(key.fileobj.fileno(), 65536)
                    except (BlockingIOError, InterruptedError):
                        continue
                    target, label = key.data
                    if not data:
                        streams_eof.add(label)
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                    else:
                        if not capture_failed:
                            try:
                                target.write(data)
                            except OSError:
                                capture_failed = True
                                hold('CAPTURE_WRITE_ERROR')
                        if label == 'stdout':
                            if len(outcome_fragments) + len(data) > 65536:
                                hold('OUTCOME_PREFIX_OVERFLOW')
                            if len(outcome_fragments) < 65536:
                                outcome_fragments.extend(data[:65536-len(outcome_fragments)])
                if offer['job'] == 'inert-adoption-capability' and not adoption_ack_sent:
                    # Only the exact emitted toy PID may join a kernel-owned
                    # unreaped identity/wait. This pipe is inherited stdin
                    # through unchanged guard; no other actor writes it.
                    lines = outcome_fragments.decode('ascii', errors='replace').split('\n')[:-1]
                    declared = [line.split() for line in lines if line.startswith('KG56S1 ADOPTION_CHILD ')]
                    adopted = [line.split() for line in lines if line.startswith('KG56A1 ADOPTED ')]
                    released = [line.split() for line in lines if line.startswith('KG56W1 RELEASED ')]
                    if len(declared) > 1 or len(adopted) > 1 or len(released) > 1:
                        hold('AMBIGUOUS_ADOPTION_EVENTS')
                    if len(declared) == 1 and len(declared[0]) == 7:
                        if any(w['pid'] == int(declared[0][3]) and w['terminal'] != 0 for w in waits):
                            hold('ADOPTION_CHILD_FAILED')
                    if len(declared) == 1 and len(adopted) == 1 and len(released) == 1 and not held:
                        d, a = declared[0], adopted[0]
                        r = released[0]
                        if len(d) != 7 or len(a) != 4 or len(r) != 9:
                            raise RuntimeError('invalid adoption event')
                        if int(r[3]) != guard.pid or r[6] != d[2] or r[2] != d[4] or r[4] != d[5]:
                            raise RuntimeError('actual release/supervisor identity join failed')
                        toy = int(d[3])
                        if toy != int(a[2]) or int(a[3]) != os.getpid():
                            raise RuntimeError('adoption identity join failed')
                        matched = [w for w in waits if w['pid'] == toy and w['pid'] != guard.pid]
                        if matched:
                            w = matched[0]
                            if w['terminal'] != 0 or not w['identity']['available'] or w['identity']['ppid'] != os.getpid() or w['identity']['pgid'] != int(d[4]):
                                raise RuntimeError('actual adopted child wait rejected')
                            if os.write(guard.stdin.fileno(), b'ADOPTED0') != 8:
                                raise RuntimeError('private adoption acknowledgement failed')
                            adoption_ack_sent = True
                            guard.stdin.close()
                if guard_ending_tick is not None and time.clock_gettime_ns(7) >= guard_ending_tick + 5_000_000_000 and not (ended_echild and len(streams_eof) == 2):
                    if 'UNKNOWN_HELD_TAIL' not in held:
                        hold('UNKNOWN_HELD_TAIL')
                        print('KG56 collector UNKNOWN_HELD_TAIL: retaining reap-only ownership until actual ECHILD/EOF', file=sys.stderr, flush=True)
                    # No further workload and no exit abandoning owned children.
                    # Per-dispatch work stays bounded; kernel-delay duration is
                    # not asserted finite or silently accepted as release.
                if guard.returncode is not None and ended_echild and len(streams_eof) == 2:
                    break
                if guard_ending_tick is not None and ended_echild and time.clock_gettime_ns(7) >= guard_ending_tick + 5_000_000_000:
                    # All owned children have been reaped, but EOF is unknown.
                    # Failure may end without abandoning any child; no EOF or
                    # process-extinction success is invented.
                    hold('UNKNOWN_EOF_AFTER_ALL_CHILDREN_WAITED')
                    break
            stdout.flush()
            stderr.flush()
            os.fsync(stdout.fileno())
            os.fsync(stderr.fileno())
        except BaseException:
            hold('COLLECTOR_EXCEPTION')
            if guard.returncode is None and not guard_reap_started:
                try:
                    os.kill(guard.pid, signal.SIGTERM)
                except OSError:
                    hold('GUARD_SIGNAL_UNCONFIRMED')
            # Emergency actual-child drain, not a PID lookup/signal fallback.
            # Identity detail can be unavailable, so this path never passes.
            # Retain the reaper role while actual kernel children remain.
            while True:
                try:
                    pid, raw, usage = os.wait4(-1, os.WNOHANG)
                except InterruptedError:
                    continue
                except ChildProcessError:
                    break
                except OSError:
                    time.sleep(.01)
                    continue
                if pid:
                    if pid == guard.pid:
                        guard.returncode = os.waitstatus_to_exitcode(raw)
                    if len(waits) < 16:
                        waits.append(dict(pid=pid, rawStatus=raw, terminal=os.waitstatus_to_exitcode(raw), rawRusage=list(usage), identity=dict(available=False, reason='EMERGENCY_KERNEL_CHILD_WAIT')))
                else:
                    time.sleep(.01)
            raise  # External failed ending/partial captures, no receipt promise.
        finally:
            selector.close()
            for signum, handler in old_handlers.items():
                signal.signal(signum, handler)
    # All real children are waited. Missing EOF is explicitly held above.
    verify(offer)
    raw_outcomes = [line for line in outcome_fragments.decode('ascii', errors='replace').splitlines() if line.startswith(('KG56W1 ', 'KG56S1 ', 'KG56A1 '))]
    receipt = dict(state='ACTUAL_WAITED_ENDING_PENDING_INDEPENDENT_REVIEW' if not held else 'HELD_ACTUAL_WAITED_ENDING_PENDING_REVIEW', job=offer['job'], allocation=allocation, offerSha256=digest(offer_path), collectorPid=os.getpid(), guardPid=guard.pid, subreaperOperations=subreaper, waits=waits, finalECHILD=ended_echild, actualEOF=sorted(streams_eof), guardTerminal=guard.returncode, adoptionAcknowledged=adoption_ack_sent, signals=sorted(signals), held=held, rawOutcomeLines=raw_outcomes, elapsedNs=time.clock_gettime_ns(7)-start, processExtinctionClaimed=False, resourceReleaseAccepted=False, targetSemanticKillClaimed=False, nativeAcceptance=False, productAcceptance=False)
    with paths[2].open('x') as output:
        json.dump(receipt, output, indent=2, allow_nan=False)
        output.write('\n')
        output.flush()
        os.fsync(output.fileno())
    return 70 if held else guard.returncode if guard.returncode >= 0 else 128-guard.returncode


if __name__ == '__main__':
    try:
        result_code = main()
    except BaseException:
        if TARGET_LAUNCH_STARTED:
            # Also covers Popen/selector setup faults before the normal loop.
            # Constructor failure may supply no handle: do not guess one.
            if RETAINED_GUARD is not None and RETAINED_GUARD.returncode is None and not GUARD_REAP_STARTED:
                try:
                    os.kill(RETAINED_GUARD.pid, signal.SIGTERM)
                except OSError:
                    pass
            while True:
                try:
                    pid, raw, usage = os.wait4(-1, os.WNOHANG)
                except ChildProcessError:
                    break
                except InterruptedError:
                    continue
                except OSError:
                    time.sleep(.01)
                    continue
                if pid and RETAINED_GUARD is not None and pid == RETAINED_GUARD.pid:
                    RETAINED_GUARD.returncode = os.waitstatus_to_exitcode(raw)
                if not pid:
                    time.sleep(.01)
        raise
    else:
        sys.exit(result_code)
