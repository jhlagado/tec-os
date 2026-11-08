"""Check the complete warm result.
Root allocates each guarded run.
"""
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
READY = HERE
ALLOCATION = Path('/workspace/scratch/kg56wm01.mac')
RECEIPT = Path('/workspace/scratch/kg56wm01.met')
WAIT_RECEIPT = Path('/workspace/scratch/kg56wm01.wat')
PREFLIGHT = Path('/workspace/scratch/kg56wm01.pre')
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TMPDIR': '/tmp'}
RETAINED = None
LAUNCH_STARTED = False
ACTUAL_WAITED = False
ACTUAL = None


def now():
    return time.clock_gettime_ns(7)


def read(path, bound):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        a = os.fstat(fd)
        if not stat.S_ISREG(a.st_mode) or not 0 <= a.st_size <= bound:
            raise ValueError('regular bounded data required')
        raw = os.read(fd, bound + 1)
        b = os.fstat(fd)
        if len(raw) != a.st_size or (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) != (b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns):
            raise ValueError('bounded data changed')
        return raw
    finally:
        os.close(fd)


def digest(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        a = os.fstat(fd)
        if not stat.S_ISREG(a.st_mode) or a.st_size > 4 * 1024 * 1024:
            raise ValueError('reference bound')
        h = hashlib.sha256()
        total = 0
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            total += len(block)
            if total > 4 * 1024 * 1024:
                raise ValueError('reference grew')
            h.update(block)
        b = os.fstat(fd)
        if total != a.st_size or (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) != (b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns):
            raise ValueError('reference changed')
        return h.hexdigest()
    finally:
        os.close(fd)


def hold():
    try:
        os.write(2, b'KG56_METER_UNKNOWN_HELD_UNCONSUMED_WAIT\n')
    except BaseException:
        pass
    while True:
        time.sleep(1)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same(actual, expected):
    return json.dumps(actual, sort_keys=True, allow_nan=False) == json.dumps(expected, sort_keys=True, allow_nan=False)


def save(path, value, bound):
    payload = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')
    require(len(payload) <= bound, 'bounded complete receipt')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        rest = memoryview(payload)
        while rest:
            count = os.write(fd, rest)
            require(count > 0, 'complete receipt write')
            rest = rest[count:]
        os.fsync(fd)
    finally:
        os.close(fd)
    return hashlib.sha256(payload).hexdigest()


def durable_result(path):
    # The worker closes its result file.
    # Fsync it before the final price.
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                stat.S_IMODE(before.st_mode) == 0o600 and before.st_size <= 1048576, 'bounded private worker result')
        raw = bytearray()
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            raw.extend(block)
            require(len(raw) <= 1048576, 'complete worker result bound')
        os.fsync(fd)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and
                (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), 'stable complete worker result')
        return bytes(raw)
    finally:
        os.close(fd)


def private_directory(path, names):
    value = path.lstat()
    require(stat.S_ISDIR(value.st_mode) and stat.S_IMODE(value.st_mode) == 0o700 and
            set(os.listdir(path)) == set(names), 'exact private output directory')
    for name in names:
        child = (path / name).lstat()
        require(stat.S_ISREG(child.st_mode) and child.st_nlink == 1 and
                stat.S_IMODE(child.st_mode) == 0o600, 'private regular contained receipt')


def checkpoint(row, width, held, end, contract):
    require(set(row) == {'piwid', 'vwid', 'claimed', 'ie', 'shadow', 'sp', 'pc'}, 'complete actual checkpoint')
    require(all(type(row[k]) is int and 0 <= row[k] <= 255 for k in ('piwid', 'vwid', 'claimed', 'ie', 'shadow')) and
            all(type(row[k]) is int and 0 <= row[k] <= 65535 for k in ('sp', 'pc')), 'actual checkpoint widths')
    if end:
        require(row['pc'] == contract['PZINIT'] and row['ie'] == 0 and row['shadow'] == 0, 'real warm endpoint and cleared IE')
    else:
        require(row['piwid'] == width and row['vwid'] == width and bool(row['claimed']) is held and
                row['ie'] == 32 and row['shadow'] == 32, 'actual selected console and armed IE')


def measurement(row, width, held, contract):
    checkpoint(row['before'], width, held, False, contract)
    checkpoint(row['after'], width, held, True, contract)
    require(type(row['depth']) is int and row['depth'] >= 0 and row['window'] == contract['window'] and
            row['nmiSuppressed'] is True, 'actual warm prefix and software suppression scope')


def semantic_result(result, contract):
    require(set(result) == {'state', 'gate', 'candidate', 'nodePid', 'nodeParent', 'guard', 'sourceOnlyAcceptance', 'nativeAcceptance',
            'productAcceptance', 'newCoverage', 'nmiSuppressed', 'nmiQualified', 'extractions',
            'active', 'deferred', 'addedFrame', 'errors'}, 'complete warm result shape')
    require(result['state'] == 'CONTROL_WORKLOAD_COMPLETED_PENDING_INDEPENDENT_RESULT_AND_RESOURCE_REVIEW' and
            result['gate'] == 'KG56' and result['candidate'] == 'b597c3bf212a965004b28cb3f8137f400203b8cf' and
            all(result[k] is False for k in ('sourceOnlyAcceptance', 'nativeAcceptance', 'productAcceptance', 'nmiQualified')) and
            result['nmiSuppressed'] is True and type(result['newCoverage']) is int and result['newCoverage'] == 0 and
            result['errors'] == [] and same(result['extractions'], contract['extractions']), 'exact source extractions and completed scope')
    cells = [(setup, width, held) for setup in ('fresh', 'reused') for width in (32, 40, 80) for held in (False, True)]
    require(len(result['active']) == 12 and len(result['deferred']) == 2 and len(result['addedFrame']) == 3, 'all seventeen observations')
    summaries = []
    for row, (setup, width, held) in zip(result['active'], cells):
        require(set(row) == {'setup', 'width', 'held', 'before', 'after', 'depth', 'window', 'nmiSuppressed'} and
                row['setup'] == setup and type(row['width']) is int and row['width'] == width and row['held'] is held,
                'complete ordered fresh/reused console cell')
        measurement(row, width, held, contract)
        require(row['depth'] == (12 if held else 4) and row['depth'] <= (12 if held else 4), 'same exact active bound')
        summaries.append([setup, width, held, row['depth']])
    for row, held, depth in zip(result['deferred'], (False, True), (4, 10)):
        require(set(row) == {'claimed', 'cycles', 'stack'} and row['claimed'] is held and
                type(row['cycles']) is int and row['cycles'] > 0 and type(row['stack']) is int and row['stack'] == depth,
                'original ordered deferred4/10 observations')
        summaries.append(['deferred', held, row['stack']])
    for row, width in zip(result['addedFrame'], (32, 40, 80)):
        require(set(row) == {'width', 'patch', 'before', 'after', 'depth', 'window', 'nmiSuppressed', 'rejection', 'classification'} and
                type(row['width']) is int and row['width'] == width and same(row['patch'], contract['expectedPatch']), 'actual disposable CALL patch')
        measurement(row, width, True, contract)
        healthy = next(r for r in result['active'] if r['setup'] == 'fresh' and r['width'] == width and r['held'] is True)
        require(row['depth'] == healthy['depth'] + 2 and row['depth'] > 12 and
                row['classification'] == 'completed-observation bound rejection', 'completed additional frame rejects the same bound')
        failure = row['rejection']
        require(set(failure) == {'name', 'code', 'message', 'actual', 'expected', 'operator', 'stack'} and
                failure['code'] == 'ERR_ASSERTION' and failure['actual'] is False and failure['expected'] is True and
                'KG56 active warm-prefix bound' in failure['message'] and
                all(isinstance(failure[k], str) and failure[k] for k in ('name', 'message', 'operator', 'stack')),
                'specific completed-depth assertion, not a setup or host error')
        summaries.append(['added-frame', width, row['depth']])
    return summaries


def known_normal(state, leaf, offer, pid):
    require(state['state'] == 'ACTUAL_WAITED_ENDING_PENDING_INDEPENDENT_REVIEW' and state['job'] == 'warm' and
            state['collectorPid'] == pid and state['offerSha256'] == offer['readyOfferSha256'] and same(state['allocation'], leaf) and
            state['finalECHILD'] is True and state['actualEOF'] == ['stderr', 'stdout'] and state['held'] == [] and
            state['signals'] == [] and state['adoptionAcknowledged'] is False and
            type(state['guardTerminal']) is int and state['guardTerminal'] == 0 and len(state['waits']) == 1,
            'complete normal collector ending, with no extra or adopted waits')
    require(state['subreaperOperations'] == [{'operation': 36, 'argument': 1, 'result': 0, 'errno': 0},
            {'operation': 37, 'result': 0, 'errno': 0, 'observedValue': 1}], 'actual successful subreaper SET/GET')
    guard = state['waits'][0]
    require(guard['pid'] == state['guardPid'] and type(guard['terminal']) is int and guard['terminal'] == 0 and
            os.WIFEXITED(guard['rawStatus']) and os.WEXITSTATUS(guard['rawStatus']) == 0 and
            guard['identity']['available'] is True and guard['identity']['pid'] == guard['pid'] and
            guard['identity']['ppid'] == pid and guard['identity']['state'] == 'Z' and
            guard['identity']['cmdlineHex'] == '' and type(guard['identity']['birthTick']) is int and
            guard['identity']['birthTick'] > 0 and len(guard['rawRusage']) == 16 and guard['rawRusage'][2] > 0,
            'actual anchored sole guard raw-zero wait')
    return guard


def context_and_outputs(offer, state, entry, waited):
    stdout = read(Path(offer['stdout']), 65536)
    stderr = read(Path(offer['stderr']), 65536)
    protocol = [line for line in stdout.decode('ascii').splitlines() if line.startswith(('KG56W1 ', 'KG56S1 ', 'KG56A1 '))]
    require(protocol == state['rawOutcomeLines'] and len(protocol) == 4, 'complete raw protocol and collector join')
    split = [line.split() for line in protocol]
    by_kind = {r[1]: r for r in split if len(r) >= 2}
    require(len(by_kind) == 4 and set(by_kind) == {'ARMED_BARRIER', 'RELEASED', 'NODE_START', 'SUCCESS'}, 'exact normal protocol branches')
    a, r, n, s = [by_kind[k] for k in ('ARMED_BARRIER', 'RELEASED', 'NODE_START', 'SUCCESS')]
    require([len(x) for x in (a, r, n, s)] == [9, 9, 7, 9] and
            all(x[0] == 'KG56W1' for x in (a, r, s)) and n[0] == 'KG56S1', 'complete marker token shapes')
    for row in (a, r, n, s):
        require(all(v.isdecimal() for v in row[2:] if v != '-1'), 'integral source marker fields')
    watch, guard, start, armed, supervisor, arm_status, arm_release = map(int, a[2:])
    rw, rg, re, released_marker, rs, released_status, release = map(int, r[2:])
    nw, node, group, ne, node_marker = map(int, n[2:])
    sw, sg, se, success, ss, final_status, sr = map(int, s[2:])
    require(watch == rw == group == sw and guard == rg == sg == state['guardPid'] and
            start == re == ne == se and supervisor == rs == nw == ss and arm_status == released_status == -1 and
            arm_release == 0 and release == sr and final_status == 0 and
            len({os.getpid(), state['collectorPid'], guard, watch, supervisor, node}) == 6 and
            all(v > 0 for v in (watch, guard, supervisor, node)), 'actual normal identities and statuses')
    require(entry <= start <= armed <= release <= released_marker <= success < start + 120000000000 and
            release <= node_marker <= success <= waited, 'original watchdog clock and partial order')
    private_directory(Path(offer['supervisionOutput']), ['released-invocation.json', 'supervisor-result.json'])
    released_raw = read(Path(offer['supervisionOutput']) / 'released-invocation.json', 4096)
    final_raw = read(Path(offer['supervisionOutput']) / 'supervisor-result.json', 4096)
    released = json.loads(released_raw)
    first = released['firstSupervisedTick']
    require(type(first) is int and release <= first <= node_marker, 'actual released child start')
    context = dict(job='warm', watchdogPid=watch, supervisorPid=supervisor, guardPid=guard, group=watch,
            entryTick=start, deadlineTick=start + 120000000000, releaseTick=release, firstSupervisedTick=first,
            clock='CLOCK_BOOTTIME7 integer nanoseconds', wholeSeconds=120, bindingSha256=offer['bindingSha256'],
            nativeAcceptance=False, productAcceptance=False, resourceReleaseAccepted=False)
    require(same(released, context), 'exact released invocation context')
    final = json.loads(final_raw)
    tick = final['finalizationTick']
    require(type(tick) is int and node_marker <= tick <= success and same(final, dict(context, nodePid=node,
            nodeTerminal=0, finalizationTick=tick, state='CHILD_EXIT_AND_IO_COMPLETE_INTERPRETER_SHUTDOWN_PENDING',
            targetSemanticKillClaimed=False)), 'actual Node wait and complete supervisor finalization')
    guard_raw = read(Path(offer['guardLog']), 65536)
    guard_rows = [json.loads(line) for line in guard_raw.splitlines()]
    require(len(guard_rows) == 2 and [x['event'] for x in guard_rows] == ['start', 'end'] and
            all(x['name'] == offer['guardName'] and x['command'] == offer['guardShownCommand'] and
                x['limitMB'] == 600 and x['heapMB'] == 450 for x in guard_rows) and
            guard_rows[0]['waitedSeconds'] == 0 and guard_rows[1]['code'] == 0 and
            guard_rows[1]['outcome'] == 'exit 0' and type(guard_rows[1]['processes']) is int and
            0 <= guard_rows[1]['processes'] <= 3, 'complete normal guard envelope and source role count')
    private_directory(Path(offer['workerOutput']), ['control-result.json'])
    worker_raw = durable_result(Path(offer['workerOutput']) / 'control-result.json')
    contract = json.loads(read(HERE / 'extract.dat', 16384))
    result = json.loads(worker_raw)
    require(type(result['nodePid']) is int and type(result['nodeParent']) is int and
            result['nodePid'] == node and result['nodeParent'] == supervisor and result['guard'] == str(guard),
            'actual worker PID/parent/guard joins')
    summaries = semantic_result(result, contract)
    return dict(identities=dict(guard=guard, watchdog=watch, supervisor=supervisor, node=node),
            protocol=protocol, summaries=summaries, workerResultSha256=hashlib.sha256(worker_raw).hexdigest(),
            workerResultBytes=len(worker_raw), workerResultFsyncCompleted=True,
            containedReceiptHashes=[hashlib.sha256(x).hexdigest() for x in (released_raw, final_raw)],
            stdoutSha256=hashlib.sha256(stdout).hexdigest(), stderrSha256=hashlib.sha256(stderr).hexdigest(),
            guardLogSha256=hashlib.sha256(guard_raw).hexdigest())


def main():
    global RETAINED, LAUNCH_STARTED, ACTUAL_WAITED, ACTUAL
    entry = now()
    require(sys.argv[1:] == [str(ALLOCATION)] and sys.platform == 'linux' and dict(os.environ) == ENV,
            'exact isolated Linux allocation and environment')
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, 'requires -I -S -B')
    raw = read(HERE / 'meter.dat', 65536)
    offer = json.loads(raw)
    pin = hashlib.sha256(raw).hexdigest()
    own_hash = digest(Path(__file__))
    leaf_raw = read(Path(offer['leafAllocation']), 16384)
    leaf = json.loads(leaf_raw)
    preflight_raw = read(PREFLIGHT, 32768)
    preflight_hash = hashlib.sha256(preflight_raw).hexdigest()
    preflight = json.loads(preflight_raw)
    require(preflight['kind'] == 'P3_KG56_WARM01_ROOT_PREFLIGHT' and
            preflight['completedBeforeMeterStartup'] is True and preflight['originalGuardAbsent'] is True and
            preflight['allEffectiveFilesAndProvidersVerified'] is True and preflight['allTreesLinksAbsencesVerified'] is True and
            preflight['allSourceProjectionAndOutputNamesVerified'] is True and preflight['meterOfferSha256'] == pin and
            preflight['leafOfferSha256'] == offer['readyOfferSha256'] and preflight['meterSha256'] == own_hash and
            type(preflight['dataSelfPeakBytes']) is int and 0 < preflight['dataSelfPeakBytes'] <= 600 * 1024 * 1024 and
            preflight['bootId'] == Path('/proc/sys/kernel/random/boot_id').read_text().strip(), 'original before-start source/provider observation')
    expected = dict(kind='P3_KG56_WARM01_METER_ALLOCATION', runtimeAuthority=True, job='warm',
            meterSha256=own_hash, meterOfferSha256=pin, readyOfferSha256=offer['readyOfferSha256'],
            collectorSha256=offer['collectorSha256'], leafAllocationSha256=hashlib.sha256(leaf_raw).hexdigest(),
            preflightSha256=preflight_hash, packetCommit=preflight['packetCommit'])
    require(len(expected['packetCommit']) == 40 and all(c in '0123456789abcdef' for c in expected['packetCommit']) and
            same(json.loads(read(ALLOCATION, 4096)), expected), 'separate exact published meter allocation')
    require(leaf.get('runtimeAuthority') is True and leaf.get('kind') == 'P3_KG56_COMMAND02_ALLOCATION' and
            leaf.get('job') == 'warm' and leaf.get('offerSha256') == offer['readyOfferSha256'] and
            leaf.get('launcherSha256') == offer['collectorSha256'] and leaf.get('budget') == offer['budget'], 'separate exact warm leaf allocation')
    require(sys.executable == offer['python'] and offer['receipt'] == str(RECEIPT) and
            offer['waitReceipt'] == str(WAIT_RECEIPT) and offer['preflight'] == str(PREFLIGHT), 'fixed interpreter and output identities')
    for row in offer['references']:
        require(digest(Path(row['path'])) == row['sha256'], 'reviewed source reference changed')
    for path in [str(RECEIPT), str(WAIT_RECEIPT)] + offer['leafOutputs']:
        require(not os.path.lexists(path), 'fresh exclusive outputs')
    os.umask(0o077)
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    inherited = list(resource.getrusage(resource.RUSAGE_CHILDREN))
    started = now()
    require(started - entry < 120000000000, 'original containing meter interval before launch')
    LAUNCH_STARTED = True
    RETAINED = subprocess.Popen(offer['launchSurface'], cwd=offer['cwd'], env=ENV, stdin=subprocess.DEVNULL)
    if RETAINED.returncode is not None:
        hold()
    while True:
        try:
            pid, raw_status, usage = os.wait4(RETAINED.pid, 0)
            break
        except InterruptedError:
            if now() - entry >= 120000000000:
                hold()
    if pid != RETAINED.pid:
        hold()
    ACTUAL_WAITED = True
    terminal = os.waitstatus_to_exitcode(raw_status)
    RETAINED.returncode = terminal
    waited = now()
    ACTUAL = dict(job='warm', meterPid=os.getpid(), specificWaitedPid=pid, rawWaitStatus=raw_status,
            terminal=terminal, rawWait4Rusage=list(usage), inheritedAggregateChildrenNotUsed=inherited,
            entryTick=entry, startedTick=started, actualWaitTick=waited, clock='CLOCK_BOOTTIME7 ns',
            meterSha256=own_hash, meterOfferSha256=pin, preflightSha256=preflight_hash,
            normalPriceComputed=False, nativeAcceptance=False, productAcceptance=False, resourceReleaseAccepted=False)
    wait_hash = save(WAIT_RECEIPT, ACTUAL, 4096)
    require(terminal == 0 and os.WIFEXITED(raw_status) and os.WEXITSTATUS(raw_status) == 0, 'actual normal collector raw zero')
    collector_raw = read(Path(offer['collectorReceipt']), 262144)
    state = json.loads(collector_raw)
    guard = known_normal(state, leaf, offer, pid)
    outcome = context_and_outputs(offer, state, entry, waited)
    for row in offer['references']:
        require(digest(Path(row['path'])) == row['sha256'], 'post-wait source reference changed')
    require(digest(Path(__file__)) == own_hash and hashlib.sha256(read(HERE / 'meter.dat', 65536)).hexdigest() == pin,
            'post-wait meter source and offer')
    require(now() - entry <= 120000000000, 'complete meter interval before price')
    self_peak = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024
    child_peak = int(usage.ru_maxrss) * 1024
    require(self_peak > 0 and child_peak > 0 and guard['rawRusage'][2] * 1024 <= child_peak, 'actual specific-wait propagation')
    upper = self_peak + 6 * child_peak + 8388608
    containing_upper = max(preflight['dataSelfPeakBytes'], upper)
    record = dict(state='WARM17_NORMAL_RESULT_PRICE_CANDIDATE_REVIEW_REQUIRED', normalPriceComputed=True,
            currentCandidateQualificationAccepted=False, xr04DisplayPolicyQualifiedByThisRun=False, actualWait=ACTUAL,
            actualWaitReceiptSha256=wait_hash, actualOutcome=outcome, collectorReceiptSha256=hashlib.sha256(collector_raw).hexdigest(),
            selfPeakBytesAfterRead=self_peak, specificCollectorWait4PeakBytes=child_peak,
            actorBound=7, descendantActorMultiplier=6, finalTailReserveBytes=8388608,
            conservativeNormalActorBytes=upper, sequentialInitialDataPreflightPeakBytes=preflight['dataSelfPeakBytes'],
            containingKnownActorBytes=containing_upper, within600MiB=containing_upper <= 600 * 1024 * 1024,
            normalTopologyCandidate=True, nativeAcceptance=False, productAcceptance=False,
            resourceReleaseAccepted=False, nextJobAllocated=False, beforeReceiptTick=now())
    receipt_hash = save(RECEIPT, record, 8192)
    final_tick = now()
    final = (json.dumps(dict(kind='KG56_WARM01_FINAL_SAMPLE', meterPid=os.getpid(),
            afterReceiptClosedTick=final_tick, elapsedNs=final_tick - entry,
            within120=final_tick - entry <= 120000000000, meterReceiptSha256=receipt_hash), sort_keys=True) + '\n').encode('ascii')
    require(len(final) <= 512 and os.write(1, final) == len(final), 'complete final sample')
    os._exit(0 if containing_upper <= 600 * 1024 * 1024 and now() - entry <= 120000000000 else 70)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        try:
            os.write(2, (type(error).__name__ + ': ' + str(error)[:256] + '\n').encode('ascii', 'backslashreplace'))
        except BaseException:
            pass
        if LAUNCH_STARTED and not ACTUAL_WAITED:
            hold()
        if ACTUAL_WAITED and not os.path.lexists(RECEIPT):
            try:
                save(RECEIPT, dict(state='FAILED_WARM_CANDIDATE_REVIEW_REQUIRED', actualWait=ACTUAL,
                        reason=type(error).__name__ + ': ' + str(error)[:256], normalPriceComputed=False,
                        nativeAcceptance=False, productAcceptance=False, resourceReleaseAccepted=False), 8192)
            except BaseException:
                pass
        os._exit(70)


