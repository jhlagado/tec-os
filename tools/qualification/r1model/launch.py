"""Price the direct R1 model command.
Retain each actual child through wait.
"""
import time
BEGAN = time.monotonic_ns()
import ctypes
import base64
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import stat
import subprocess
import sys

HERE = Path(__file__).resolve().parent
LATCHED = set()
DIRECT = None
DIRECT_SIGNAL_ALLOWED = False
DIRECT_REAP_STARTED = False
WAITS = []
HELD = []
FINAL_ECHILD = False
LAUNCH_STARTED = False


def require(condition, message):
    if not condition:
        raise ValueError(message)


def hold(reason):
    if reason not in HELD and len(HELD) < 32:
        HELD.append(reason)
        print('R1 MODEL HELD: ' + reason + '; retaining actual child ownership', file=sys.stderr, flush=True)


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(131072), b''):
            value.update(block)
    return value.hexdigest()


def members(offer):
    for row in offer['members']:
        path = Path(row['path']); value = path.lstat()
        require(stat.S_ISREG(value.st_mode) and value.st_size == row['bytes'] and
                oct(stat.S_IMODE(value.st_mode)) == row['mode'] and digest(path) == row['sha256'], 'member mismatch: ' + str(path))



def verify_runtime():
    """Check exact host files and trees.

    Skip only declared site-packages.
    """
    runtime = json.loads((HERE / 'runtime.dat').read_text())
    for link in runtime['symlinks']:
        path = Path(link['path'])
        require(path.is_symlink() and os.readlink(path) == link['target'] and str(path.resolve()) == link['realpath'], 'runtime link changed')
    for name in runtime['absentPaths']:
        path = Path(name)
        require(not path.exists() and not path.is_symlink(), 'optional runtime path appeared')
    for row in runtime['members']:
        path = Path(row['path']); value = path.lstat()
        require(stat.S_ISREG(value.st_mode) and str(path.resolve()) == row['realpath'] and value.st_size == row['bytes'] and
                oct(stat.S_IMODE(value.st_mode)) == row['mode'] and digest(path) == row['sha256'], 'runtime input changed: ' + str(path))
    for tree in runtime['closedTrees']:
        root = Path(tree['path'])
        require(stat.S_ISDIR(root.lstat().st_mode) and root.resolve() == root, 'plain canonical runtime root')
        files, dirs = set(), set()
        for current, directories, names in os.walk(root, followlinks=False):
            if Path(current) == root:
                directories[:] = [name for name in directories if name not in tree.get('excludedTopDirectories', [])]
            for name in directories + names:
                path = Path(current) / name; mode = path.lstat().st_mode
                if stat.S_ISREG(mode): files.add(path.relative_to(root).as_posix())
                elif stat.S_ISDIR(mode): dirs.add(path.relative_to(root).as_posix())
                else: raise RuntimeError('runtime tree non-regular entry')
        require(files == set(tree['files']) and dirs == set(tree['directories']), 'complete scoped runtime tree changed')
    return dict(manifestSha256=digest(HERE / 'runtime.dat'), members=len(runtime['members']),
                scopedStdlibFiles=976, sitePackagesExcluded=True, links=len(runtime['symlinks']), absences=len(runtime['absentPaths']))

def save(path, value):
    with path.open('x') as target:
        json.dump(value, target, indent=2, allow_nan=False)
        target.write('\n'); target.flush(); os.fsync(target.fileno())


def latch(number, _frame):
    LATCHED.add(number)


def subreaper():
    require(sys.platform == 'linux' and ctypes.sizeof(ctypes.c_void_p) == 8 and
            ctypes.sizeof(ctypes.c_ulong) == 8 and ctypes.sizeof(ctypes.c_int) == 4, 'Linux LP64 ABI required')
    api = ctypes.CDLL('/usr/lib/x86_64-linux-gnu/libc.so.6', use_errno=True)
    api.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    api.prctl.restype = ctypes.c_int
    operations = []
    ctypes.set_errno(0); result = api.prctl(36, 1, 0, 0, 0)
    operations.append(dict(operation=36, argument=1, result=result, errno=ctypes.get_errno()))
    require(result == 0, 'subreaper SET refused before launch')
    value = ctypes.c_int(-1)
    ctypes.set_errno(0); result = api.prctl(37, ctypes.addressof(value), 0, 0, 0)
    operations.append(dict(operation=37, result=result, errno=ctypes.get_errno(), observedValue=value.value))
    require(result == 0 and value.value == 1, 'subreaper GET refused before launch')
    try:
        ready = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    except ChildProcessError:
        return operations
    # Only ECHILD means no child exists.
    raise RuntimeError('pre-existing child accounting before launch: ' + str(ready))


def identity(pid):
    # Inspect the actual WNOWAIT child.
    try:
        with Path('/proc/' + str(pid) + '/stat').open('rb') as source:
            raw = source.read(8193)
        text = raw.decode('ascii'); end = text.rfind(')'); fields = text[end+2:].split()
        with Path('/proc/' + str(pid) + '/cmdline').open('rb') as source:
            command = source.read(8193)
        require(end >= 0 and len(raw) + len(command) <= 8192, 'bounded owned identity')
        return dict(available=True, pid=pid, state=fields[0], ppid=int(fields[1]),
                    pgid=int(fields[2]), session=int(fields[3]), birthTick=int(fields[19]),
                    cmdlineHex=command.hex(), zombieArgvUnavailable=not bool(command))
    except (OSError, ValueError, IndexError, UnicodeError):
        return dict(available=False, pid=pid)


def own_all_children():
    """Wait for every actual child.

    Signal authority ends before status
    consumption and cannot be recreated.
    Unknown children stay held through
    their actual wait. No competing wait
    or PID/name census is used.
    """
    global DIRECT_SIGNAL_ALLOWED, DIRECT_REAP_STARTED, FINAL_ECHILD
    forwarded = False
    pending = None
    while True:
        if time.monotonic_ns() - BEGAN >= 118000000000:
            hold('LAUNCHER_DEADLINE_HELD_REAP_ONLY')
        if LATCHED:
            hold('OUTER_INTERRUPTION_OR_ALARM')
        if (HELD or LATCHED) and DIRECT is not None and DIRECT_SIGNAL_ALLOWED and not DIRECT_REAP_STARTED and not forwarded:
            try:
                os.kill(DIRECT.pid, signal.SIGTERM)
            except ProcessLookupError:
                hold('ANCHORED_DIRECT_SIGNAL_NOT_DELIVERED')
            forwarded = True
        if pending is None:
            try:
                ready = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            except InterruptedError:
                continue
            except ChildProcessError:
                DIRECT_SIGNAL_ALLOWED = False; DIRECT_REAP_STARTED = True
                FINAL_ECHILD = True
                if DIRECT is not None and DIRECT.returncode is None:
                    # Suppress Popen's wait.
                    # This is not a status.
                    DIRECT.returncode = 255
                    hold('DIRECT_STATUS_LOST_ECHILD')
                return
            except OSError:
                hold('WAITID_UNKNOWN_OWNERSHIP_RETAINED')
                time.sleep(.01); continue
            if ready is None:
                FINAL_ECHILD = False
                if HELD:
                    # Keep the wait obligation.
                    pass
                time.sleep(.01); continue
            info = identity(ready.si_pid)
            pending = dict(pid=ready.si_pid, identity=info)
            if DIRECT is not None and ready.si_pid == DIRECT.pid:
                DIRECT_SIGNAL_ALLOWED = False; DIRECT_REAP_STARTED = True
        try:
            pid, raw, usage = os.wait4(pending['pid'], 0)
        except InterruptedError:
            continue  # same pending identity; no clock reset or signal revival
        except ChildProcessError:
            if DIRECT is not None and pending['pid'] == DIRECT.pid:
                DIRECT_SIGNAL_ALLOWED = False; DIRECT_REAP_STARTED = True
                DIRECT.returncode = 255
            hold('PENDING_OWNED_STATUS_LOST_ECHILD')
            pending = None; continue
        except OSError:
            hold('PENDING_WAIT_UNKNOWN_REAP_ONLY')
            time.sleep(.01); continue
        if DIRECT is not None and pid == DIRECT.pid:
            # Authority ended before wait4.
            DIRECT.returncode = os.waitstatus_to_exitcode(raw)
        require(pid == pending['pid'], 'actual consuming child identity changed')
        row = dict(pid=pid, rawStatus=raw, terminal=os.waitstatus_to_exitcode(raw),
                   identity=pending['identity'], rusage={name: getattr(usage, name) for name in dir(usage) if name.startswith('ru_')})
        if len(WAITS) < 32:
            WAITS.append(row)
        else:
            hold('WAIT_RETENTION_OVERFLOW')
        if not pending['identity']['available'] or pending['identity'].get('ppid') != os.getpid():
            hold('OWNED_IDENTITY_UNCONFIRMED')
        if DIRECT is None or pid != DIRECT.pid:
            hold('UNEXPECTED_ADOPTED_CHILD_WAITED')
        pending = None


def durable_regular(path, maximum, mode):
    value = path.lstat()
    require(stat.S_ISREG(value.st_mode) and value.st_nlink == 1 and
            stat.S_IMODE(value.st_mode) == mode and value.st_size <= maximum and
            path.resolve() == path, 'bounded plain durable output')
    def identity(info):
        return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size,
                info.st_mtime_ns, info.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(identity(before) == identity(value), 'opened output identity')
        os.fsync(fd)
        count = 0; hashed = hashlib.sha256()
        while True:
            block = os.read(fd, min(131072, maximum + 1 - count))
            if block == b'': break
            count += len(block); require(count <= maximum, 'durable output cap')
            hashed.update(block)
        require(count == before.st_size and identity(os.fstat(fd)) == identity(before) ==
                identity(path.lstat()), 'durable output stable through actual EOF')
    finally:
        os.close(fd)
    return dict(bytes=count, sha256=hashed.hexdigest(), regularFileReadEOF=True, fsyncCompleted=True)


def durable_directories(root, relatives):
    ordered = sorted(relatives, key=lambda name: (len(Path(name).parts), name), reverse=True) + ['']
    for relative in ordered:
        path = root / relative; before = path.lstat()
        require(stat.S_ISDIR(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o700 and
                path.resolve() == path, 'bounded plain output directory')
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd)
            expected = (before.st_dev, before.st_ino, before.st_mode)
            require((opened.st_dev, opened.st_ino, opened.st_mode) == expected, 'opened directory identity')
            os.fsync(fd)
            after = path.lstat(); retained = os.fstat(fd)
            require((after.st_dev, after.st_ino, after.st_mode) == expected ==
                    (retained.st_dev, retained.st_ino, retained.st_mode), 'directory identity after fsync')
        finally:
            os.close(fd)
    return len(ordered)


def verify_inputs(offer):
    members(offer)
    for name in offer['absentPaths']:
        require(not os.path.lexists(name), 'absent module-scope metadata')
    for tree in offer['closedTrees']:
        root = Path(tree['path']); files = set(); directories = set()
        require(root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode), 'plain input root')
        for here, dirs, names in os.walk(root, followlinks=False):
            for name in dirs + names:
                path = Path(here) / name; mode = path.lstat().st_mode; relative = str(path.relative_to(root))
                if stat.S_ISREG(mode): files.add(relative)
                elif stat.S_ISDIR(mode): directories.add(relative)
                else: raise ValueError('non-regular closed input')
        require(files == set(tree['files']) and directories == set(tree['directories']), 'closed input tree')


def output_limits(offer):
    limits = {'source/' + row['path']: offer['caps']['sourceFile'] for row in offer['sourceRows']}
    limits['source/offer.dat'] = offer['caps']['sourceFile']
    limits.update({'readings/d' + str(i).zfill(2) + '.dat': offer['caps']['reading'] for i in range(1, 16)})
    limits.update({name: offer['caps'][cap] for name, cap in
                   [('inputs.dat','inputs'), ('result.dat','result'), ('files.dat','inventory'), ('fail.dat','failure')]})
    require(len(limits) == 29, '28 normal outputs plus first failure')
    return limits


def durable_outputs(offer):
    root = Path(offer['work'])
    if not root.exists(): return dict(rootCreated=False, files=0, directories=0)
    require(root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode) and
            stat.S_IMODE(root.stat().st_mode) == 0o700, 'plain private output root')
    limits = output_limits(offer); allowed_dirs = {'source','readings'}
    rows = []; seen_dirs = set(); total = 0
    for here, dirs, names in os.walk(root, followlinks=False):
        require(len(dirs) + len(names) <= 31, 'bounded output directory entries')
        for name in dirs + names:
            path = Path(here) / name; relative = str(path.relative_to(root)); value = path.lstat()
            if stat.S_ISDIR(value.st_mode):
                require(relative in allowed_dirs and stat.S_IMODE(value.st_mode) == 0o700, 'private evidence directory')
                seen_dirs.add(relative)
            else:
                require(relative in limits, 'declared finite evidence file')
                audit = durable_regular(path, limits[relative], 0o600)
                total += audit['bytes']; require(total <= offer['caps']['total'], 'complete output cap')
                rows.append(dict(path=relative, **audit))
            require(len(rows) + len(seen_dirs) <= 31, 'bounded whole output tree')
    return dict(rootCreated=True, files=len(rows), bytes=total, rows=rows,
                directories=durable_directories(root, seen_dirs), fileFsyncAndEOFCompleted=True,
                directoryFsyncCompleted=True, scope='post-wait finite evidence before SELF')


def load_output(root, name, cap):
    path = root / name
    require(0 < path.stat().st_size <= cap, 'positive bounded JSON output')
    return json.loads(path.read_bytes())


def output_tree(offer):
    root = Path(offer['work']); limits = output_limits(offer); expected = set(limits) - {'fail.dat'}
    actual = {str(path.relative_to(root)) for path in root.rglob('*') if path.is_file()}
    require(actual == expected and len(actual) == 28, 'complete normal set without failure')
    inventory = load_output(root,'files.dat',offer['caps']['inventory'])
    require(inventory['kind'] == 'R1_OUTPUT_INVENTORY' and inventory['excludesOnlySelf'] == 'files.dat' and
            {row['path'] for row in inventory['rows']} == expected - {'files.dat'} and len(inventory['rows']) == 27,
            'full output inventory')
    for row in inventory['rows']:
        path = root / row['path']
        require(0 < path.stat().st_size <= limits[row['path']] and path.stat().st_size == row['bytes'] and
                digest(path) == row['sha256'], 'actual retained output identity')
    sources = offer['sourceRows'] + [dict(path='offer.dat',bytes=(HERE/'offer.dat').stat().st_size,sha256=digest(HERE/'offer.dat'))]
    for row in sources:
        path = root/'source'/row['path']
        require(path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'exact source copy')
    cases = json.loads((HERE/'cases.dat').read_bytes()); projection = json.loads((HERE/'bytes.dat').read_bytes())
    direct = {row['id']:row for row in cases['positive'] if row['phase'] == 'direct'}
    result = load_output(root,'result.dat',offer['caps']['result'])
    require(result['kind'] == 'R1_DIRECT_MODEL_PENDING_REVIEW' and result['directCases'] == 6 and
            result['cpuObservations'] == 15 and result['faultDiscriminators'] == 4 and
            result['declaredPositiveCases'] == 32 and result['declaredFaultCases'] == 6,
            'exact partial coverage')
    require(result['incompletePositiveIDs'] == cases['incompletePositiveIDs'] and
            result['incompleteFaultIDs'] == cases['incompleteFaultIDs'] and
            all(result[k] is False for k in ['completeDeclaredCoverage','assembled','physicalHardware',
                'nativeIntegration','currentCandidateQualified']) and result['modelProjectionNotROM'] is True,
            'unchanged incomplete qualification scope')
    expected_reads = offer['expected']['readings']
    require(len(result['readings']) == len(expected_reads) == 15, '15 ordered observations')
    by_path = {}
    for summary, spec in zip(result['readings'],expected_reads):
        require(all(summary[k] == spec[k] for k in ['path','caseID','variant','fault']), 'ordered reading binding')
        row = load_output(root,spec['path'],offer['caps']['reading']); declaration = direct[spec['caseID']]
        require(row['kind'] == 'R1_DIRECT_CPU_OBSERVATION' and
                all(row[k] == spec[k] for k in ['caseID','variant','fault']) and
                row['modelProjectionNotROM'] is True and row['assembled'] is False and row['interruptDeliveryInvoked'] is False,
                'actual observation identity/scope')
        require(row['helper'] == spec['helper'] and row['cycles'] == spec['cycles'] == summary['cycles'] and
                row['stackBytes'] == spec['stackBytes'] == summary['stackBytes'], 'exact manual input/cost observation')
        before = row['before']; after = row['after']; at = projection['addresses']
        require(after['cpu']['pc'] == at['stop'] and after['cpu']['sp'] == at['stack'] and
                row['minimumSP'] == at['stack'] - spec['stackBytes'], 'real return and minimum stack')
        require(len(row['trace']) <= projection['limits']['stepsPerObservation'] and
                sum(step['cycles'] for step in row['trace']) == row['cycles'] and
                row['trace'][0]['pc'] == at['caller'] and row['trace'][-1]['nextPC'] == at['stop'], 'bounded actual instruction trace')
        require(all(after['cpu'][k] == before['cpu'][k] for k in ['b','c','d','e','i','iff1','iff2']) and
                all(after[k] == before[k] for k in ['claim','regptr','pivec']), 'kept registers and fixture state')
        require(before['shadow'] == 32 and after['shadow'] == spec['shadow'] and
                before['video']['registers'][1] == declaration['seedR1'] and
                after['video']['registers'][1] == spec['r1'], 'full R1/shadow oracle')
        require(before['video']['active'] is declaration['device'] and after['video']['active'] is declaration['device'] and
                after['video']['vram'] == before['video']['vram'] and
                all(after['video'][k] == before['video'][k] for k in ['videoStandard','frameCount','status']) and
                all(after['video']['registers'][k] == before['video']['registers'][k] for k in [0,2,3,4,5,6,7]),
                'other VDP bytes preserved')
        require([r['value'] for r in row['ports']] == spec['ports'] and
                all(r['low'] == 0xbf and r['port'] == (r['value'] << 8 | 0xbf) for r in row['ports']), 'full actual control pair')
        require((after['cpu']['h'] == 0x81 and after['cpu']['l'] == row['ports'][0]['value']) if row['ports'] else
                (after['cpu']['h'] == before['cpu']['h'] and after['cpu']['l'] == before['cpu']['l']), 'helper HL result')
        left = base64.b64decode(before['memory'],validate=True)
        right = base64.b64decode(after['memory'],validate=True)
        require(len(left) == len(right) == 65536 and base64.b64encode(left).decode() == before['memory'] and
                base64.b64encode(right).decode() == after['memory'], 'full canonical fixture memory')
        require(list(left[at['helper']:at['helper']+len(spec['helper'])]) == spec['helper'] and
                list(left[at['caller']:at['stop']]) == projection['caller'] and
                list(left[at['pair']:at['pair']+len(projection['vpair'])]) == projection['vpair'] and
                list(left[at['iff']:at['iff']+len(projection['iffget'])]) == projection['iffget'], 'exact manual executable fixture')
        for width, table in projection['tables'].items():
            wanted = list(table)
            if spec['fault'] == 'table' and width == '32': wanted[1] = 0x80
            address = at['tables'][width]
            require(list(left[address:address+8]) == wanted, 'exact mode-table fixture')
        pointer = at['tables'][str(declaration.get('width',32))] if declaration.get('width') or not declaration['device'] else 0
        require(before['regptr'] == pointer and before['pivec'] == (0x6500 if pointer else 0) and
                before['claim'] == declaration['claim'] and left[at['condev']] == (2 if declaration['device'] else 0), 'exact presence/pointer/claim fixture')
        initial = dict(pc=at['caller'],sp=at['stack'],b=0x12,c=0x34,d=0x56,e=0x78,h=0xa4,l=0xb5,i=0x5b,
                       iff1=int(declaration.get('iff',False)),iff2=int(declaration.get('iff',False)))
        require(all(before['cpu'][k] == v for k,v in initial.items()) and
                before['video']['registers'] == [0x13,declaration['seedR1'],0x2a,0x35,9,0x1b,7,0x31], 'exact CPU/VDP seed')
        vram = base64.b64decode(before['video']['vram'],validate=True)
        require(len(vram) == 16384 and all(v == ((i*17+3)&255) for i,v in enumerate(vram)), 'full seeded VRAM fixture')
        require(all(step['nextPC'] == following['pc'] and step['nextSP'] == following['sp']
                    for step,following in zip(row['trace'],row['trace'][1:])) and
                all(type(step['cycles']) is int and step['cycles'] > 0 and
                    step['bytes'] == list(left[step['pc']:step['pc']+4]) for step in row['trace']), 'complete instruction-boundary joins')
        writable = {at['shadow'],at['stack']-1,at['stack']-2,at['stack']-3,at['stack']-4}
        require(all(left[i] == right[i] for i in range(65536) if i not in writable) and
                len(row['writes']) <= 32 and all(w['address'] in writable for w in row['writes']), 'owned stack/shadow writes only')
        by_path[spec['path']] = row
    require([f['id'] for f in result['faults']] == offer['expected']['faultIDs'], 'four applicable fault IDs')
    for fault, expected_fault in zip(result['faults'],offer['expected']['faults']):
        require(fault == expected_fault and fault['reading'] in by_path, 'specific fault result without generic exception')
    inputs = load_output(root,'inputs.dat',offer['caps']['inputs'])
    require(inputs['kind'] == 'R1_ACTUAL_INPUT_JOINS' and inputs['bindingSha256'] == digest(HERE/'bind.dat') and
            inputs['offerSha256'] == digest(HERE/'offer.dat') and inputs['providerImported'] is True and
            inputs['modelImported'] is True and inputs['memberJoins'] == offer['bindingMemberCount'], 'actual provider/source import joins')
    require(result['childDenied'] is True and result['pid'] > 1 and result['ppid'] > 1 and
            result['guard'] == str(result['ppid']) and result['pid'] != result['ppid'] and
            result['pid'] != DIRECT.pid and result['ppid'] != DIRECT.pid, 'genuine direct guard/leaf identities')
    require(result['argv'] == [offer['node'],str(HERE/'run.mjs')] and result['execArgv'] == offer['nodeFlags'] and
            result['environment'] == dict(offer['environment'],R1_OFFER_SHA=digest(HERE/'offer.dat'),
                ORIGO_GUARD=result['guard'],NODE_OPTIONS='--max-old-space-size=64'), 'actual closed command/environment')
    return dict(files=28,sourceCopies=len(sources),cpuObservations=15,directCases=6,faults=4,
                completeDeclaredCoverage=False,nativeIntegration=False,currentCandidateQualified=False,
                modelPid=result['pid'],guardPid=result['ppid'],resultSha256=digest(root/'result.dat'))


def main():
    global DIRECT, DIRECT_SIGNAL_ALLOWED, LAUNCH_STARTED
    require(len(sys.argv) == 2 and 'ORIGO_GUARD' not in os.environ and sys.platform == 'linux', 'Linux allocation outside guard')
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    for number in (signal.SIGALRM, signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(number, latch)
    remaining = 118 - (time.monotonic_ns() - BEGAN) / 1e9
    require(remaining > 0, 'deadline before setup')
    signal.setitimer(signal.ITIMER_REAL, remaining)
    offer = json.loads((HERE / 'offer.dat').read_text())
    allocation_path = Path(sys.argv[1]); require(str(allocation_path) == offer['allocation'], 'exact allocation path')
    require(allocation_path.stat().st_size <= 16384, 'bounded allocation')
    allocation = json.loads(allocation_path.read_text())
    require(allocation.get('kind') == 'R1_DIRECT15_ALLOCATION' and allocation.get('runtimeAuthority') is True and
            allocation.get('offerSha256') == digest(HERE / 'offer.dat') and allocation.get('launcherSha256') == digest(Path(__file__)) and
            allocation.get('budget') == offer['budget'] and allocation.get('sourceBasisCommit') == offer['sourceBasisCommit'], 'exact root allocation')
    require(isinstance(allocation.get('packetCommit'), str) and len(allocation['packetCommit']) == 40 and
            all(ch in '0123456789abcdef' for ch in allocation['packetCommit']), 'actual published identity')
    preflight_path = Path(offer['runtimePreflight'])
    require(preflight_path.stat().st_size <= 32768 and digest(preflight_path) == allocation['runtimePreflightSha256'], 'root pre-start host observation')
    preflight = json.loads(preflight_path.read_text())
    require(preflight['kind'] == 'R1_ROOT_DATA_HOST_PREFLIGHT' and preflight['completedBeforePythonLaunch'] is True and
            preflight['originalOuterGuardEnvironmentAbsent'] is True and
            preflight['offerSha256'] == digest(HERE/'offer.dat') and preflight['launcherSha256'] == digest(Path(__file__)) and
            preflight['runtimeManifestSha256'] == digest(HERE / 'runtime.dat') and
            preflight['allMemberBytesModesRealpathsVerified'] is True and preflight['allScopedTreeSetsTypesVerified'] is True and
            preflight['allRuntimeLinksAndAbsencesVerified'] is True and
            type(preflight['dataSelfPeakBytes']) is int and 0 < preflight['dataSelfPeakBytes'] <= 600*1024*1024,
            'pre-start runtime predicates and sequential DATA peak')
    require(dict(os.environ) == offer['environment'] and sys.flags.isolated == 1 and sys.flags.no_site == 1 and sys.dont_write_bytecode, 'exact isolated cleared launch')
    require(sys.executable == offer['python'] and sys.argv == [str(HERE/'launch.py'), offer['allocation']], 'exact outer argv')
    runtime_before = verify_runtime(); verify_inputs(offer)
    paths = [Path(offer[k]) for k in ('stdout','stderr','receipt','guardLog')]
    require(len(set(paths)) == 4 and not any(p.exists() or p.is_symlink() for p in paths + [Path(offer['work'])]), 'fresh first-result namespace')
    require(all(str(p.parent.resolve()) == '/workspace/scratch' for p in paths), 'capture parent')
    subreaper_operations = subreaper()
    require(not LATCHED and time.monotonic_ns() - BEGAN < 5000000000, 'prelaunch five-second reserve or signal')
    receipt = dict(state='HELD_INCOMPLETE', allocation=dict(path=str(allocation_path), packetCommit=allocation['packetCommit'], kind=allocation['kind']),
                   allocationSha256=digest(allocation_path), offerSha256=digest(HERE / 'offer.dat'),
                   rootPrestartHostPreflight=dict(path=str(preflight_path), sha256=digest(preflight_path)),
                   runtimePreflight=runtime_before, subreaperOperations=subreaper_operations,
                   argv=offer['argv'], cwd=offer['cwd'], environment=offer['environment'],
                   sampledScope='single child-denied direct R1 model Node subtree; outer/timeout/guard/prepost excluded',
                   nativeExecution=False, wholeIntervalRequiresExternalReadback=True)
    code = 70
    try:
        with paths[0].open('xb') as out, paths[1].open('xb') as err:
            os.fchmod(out.fileno(), 0o600); os.fchmod(err.fileno(), 0o600)
            LAUNCH_STARTED = True
            DIRECT = subprocess.Popen(offer['argv'], cwd=offer['cwd'], env=dict(offer['environment'], R1_OFFER_SHA=digest(HERE/'offer.dat')),
                                      stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True, umask=0o077)
            DIRECT_SIGNAL_ALLOWED = True; receipt['outerChildPid'] = DIRECT.pid
            own_all_children()
            out.flush(); err.flush(); os.fsync(out.fileno()); os.fsync(err.fileno())
        receipt['launchThroughCaptureCloseNs'] = time.monotonic_ns() - BEGAN
        require(FINAL_ECHILD and not HELD and not LATCHED, 'ending held')
        require(len(WAITS) == 1 and WAITS[0]['pid'] == DIRECT.pid, 'normal sole direct wait topology')
        waited = WAITS[0]; code = waited['terminal']; receipt['terminal'] = code
        verify_inputs(offer); receipt['runtimePostflight'] = verify_runtime()
        receipt['captures'] = [dict(path=str(p), **durable_regular(p, 4*1024*1024, 0o600)) for p in paths[:2]]
        guard_audit = durable_regular(paths[3], 65536, 0o600)
        receipt['guardCapture'] = dict(path=str(paths[3]), **guard_audit)
        receipt['durableOutputAudit'] = durable_outputs(offer)
        require(code == 0 and os.WIFEXITED(waited['rawStatus']) and os.WEXITSTATUS(waited['rawStatus']) == 0 and
                waited['identity']['state'] == 'Z' and waited['identity']['cmdlineHex'] == '', 'normal exact raw terminal')
        require(paths[3].stat().st_size <= 65536, 'bounded complete guard log')
        guard_rows = [json.loads(line) for line in paths[3].read_text().splitlines()]
        require(len(guard_rows) == 2 and [r['event'] for r in guard_rows] == ['start','end'] and
                all(r['limitMB'] == 600 and r['heapMB'] == 64 for r in guard_rows) and
                all(isinstance(r['at'],str) and len(r['at']) == 24 for r in guard_rows) and
                all(r['name'] == offer['guardName'] and r['command'] == offer['normalizedLeaf'] for r in guard_rows) and
                guard_rows[0]['waitedSeconds'] == 0 and guard_rows[1]['code'] == 0 and guard_rows[1]['outcome'] == 'exit 0', 'normal guard joins')
        receipt['guardRows'] = [{k:r[k] for k in ('event','at','limitMB','heapMB')} for r in guard_rows]
        receipt['outputRetention'] = output_tree(offer)
        descendant = waited['rusage']['ru_maxrss'] * 1024
        require(descendant > 0, 'specific waited descendant maximum')
        # Finish large reads before SELF.
        own_usage = resource.getrusage(resource.RUSAGE_SELF); own = own_usage.ru_maxrss * 1024
        price = own + 4 * descendant + 8 * 1024 * 1024
        receipt['normalWholeActorPrice'] = dict(actorBound=5, launcherSelfRawKiB=own_usage.ru_maxrss,
            launcherSelfRawUsage={n:getattr(own_usage,n) for n in dir(own_usage) if n.startswith('ru_')},
            launcherSelfPeakBytes=own, outerWaitedPeakBytes=descendant, timeoutGuardControlQueryMultiplier=4,
            finalIoReserveBytes=8*1024*1024, conservativeBytes=price, limitBytes=600*1024*1024,
            rootSequentialDataPeakBytes=preflight['dataSelfPeakBytes'], maxSequentialBytes=max(price,preflight['dataSelfPeakBytes']),
            formula='O + 4*T + 8MiB', basis='Five sealed normal roles; sole exact wait, actual ECHILD, no adoption or lost status; bounded final tail')
        require(price <= 600*1024*1024 and not LATCHED and time.monotonic_ns()-BEGAN < 118000000000, 'whole price/deadline held')
        receipt['state'] = 'R1_DIRECT_TERMINAL_PENDING_REVIEW'
    except BaseException as error:
        hold(type(error).__name__ + ': ' + str(error)); code = 70
        print('HELD: ' + str(error), file=sys.stderr, flush=True)
    finally:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('EXCEPTIONAL_OWNERSHIP_DRAIN'); own_all_children()
        receipt.update(waits=WAITS, finalECHILD=FINAL_ECHILD, signals=sorted(LATCHED), held=HELD,
                       processExtinctionClaimed=False, resourceReleaseAccepted=False,
                       elapsedBeforeReceiptWriteNs=time.monotonic_ns()-BEGAN)
        if HELD or LATCHED:
            receipt['state'] = 'HELD_ACTUAL_WAITED_ENDING_PENDING_REVIEW'; code = 70
        receipt['terminalReturned'] = code
        final_blob = (json.dumps(receipt,separators=(',', ':'),allow_nan=False)+'\n').encode('utf8')
        require(len(final_blob) <= 65536, '64 KiB final outer cap')
        with paths[2].open('xb') as target:
            os.fchmod(target.fileno(), 0o600)
            target.write(final_blob); target.flush(); os.fsync(target.fileno())
        after = time.monotonic_ns()-BEGAN
        if LATCHED or after >= 118000000000:
            hold('FINALISATION_DEADLINE_OR_INTERRUPTION'); code = 70
        print(json.dumps(dict(state='OUTER_RECEIPT_FSYNCED',terminal=code,
                              elapsedThroughReceiptFsyncNs=after,under120Seconds=after < 120000000000)),flush=True)
        if LATCHED or time.monotonic_ns()-BEGAN >= 118000000000: code = 70
        signal.setitimer(signal.ITIMER_REAL,0)
    return code if code >= 0 else 128-code


if __name__ == '__main__':
    try:
        result = main()
    except BaseException:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('TOPLEVEL_EXCEPTION_OWNERSHIP_DRAIN'); own_all_children()
        raise
    else:
        sys.exit(result)
