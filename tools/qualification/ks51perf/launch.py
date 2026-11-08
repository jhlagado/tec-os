"""Own one ordinary KS51 invocation.
Root grants each exact allocation.
"""
import time
BEGAN = time.monotonic_ns()
import ctypes
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
DEADLINE = None

def whole_now():
    return time.clock_gettime_ns(time.CLOCK_BOOTTIME)

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
        print('KS51 HELD: ' + reason + '; retaining actual child ownership', file=sys.stderr, flush=True)


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
    """Concrete retained host inventory, excluding site-packages under -S."""
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
    # None also means a pre-existing live child, not an empty child set.
    raise RuntimeError('pre-existing child accounting before launch: ' + str(ready))


def identity(pid):
    # Only a PID returned by this process's actual WNOWAIT may be inspected.
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
    """Sole WNOWAIT/pending specific consuming path, including adopted orphans.

    No Popen.poll/wait competitor, group kill or PID/name census. Handlers only
    latch. Numeric signal authority is irrevocably revoked BEFORE consumption;
    ECHILD/lost ownership cannot recreate it. Unknown live children stay owned.
    """
    global DIRECT_SIGNAL_ALLOWED, DIRECT_REAP_STARTED, FINAL_ECHILD
    forwarded = False
    pending = None
    while True:
        if DEADLINE is not None and whole_now() >= DEADLINE - 1000000000:
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
                    # Internal suppression only; no fabricated observed status.
                    DIRECT.returncode = 255
                    hold('DIRECT_STATUS_LOST_ECHILD')
                return
            except OSError:
                hold('WAITID_UNKNOWN_OWNERSHIP_RETAINED')
                time.sleep(.01); continue
            if ready is None:
                FINAL_ECHILD = False
                if HELD:
                    # Retain actual subreaper ownership, without deadline/price/
                    # extinction credit, until a real child exit/ECHILD.
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
            # Authority was already revoked before the kernel consumed status.
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


COMMANDS = {'ks51pc01': 'prompt', 'ks51ru01': 'rulers', 'ks51te01': 'cell'}


def bounded_json(path, bound):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_size <= bound, 'bounded regular JSON')
    return json.loads(path.read_bytes())


def exclusive(path, value, bound):
    raw = (json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n').encode()
    require(len(raw) <= bound, 'complete retained record bound')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        rest = memoryview(raw)
        while rest:
            n = os.write(fd, rest)
            require(n > 0, 'complete record write')
            rest = rest[n:]
        os.fsync(fd)
    finally:
        os.close(fd)
    return dict(path=str(path), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), mode='0o600')


def closed_inputs(offer):
    for tree in offer['closedTrees']:
        root = Path(tree['path'])
        require(root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode) and
                oct(stat.S_IMODE(root.stat().st_mode)) == tree['rootMode'], 'canonical bound-mode input root')
        files, directories = set(), set()
        for current, dirs, names in os.walk(root, followlinks=False):
            for name in dirs + names:
                p = Path(current) / name
                st = p.lstat()
                rel = p.relative_to(root).as_posix()
                if stat.S_ISREG(st.st_mode):
                    files.add(rel)
                elif stat.S_ISDIR(st.st_mode):
                    require(oct(stat.S_IMODE(st.st_mode)) == tree['directoryMode'], 'bound input directory mode')
                    directories.add(rel)
                else:
                    raise ValueError('input link or special member')
        require(files == set(tree['files']) and directories == set(tree['directories']), 'exact input tree')
    for name in offer['absentPaths']:
        require(not os.path.lexists(name), 'declared absent input')


def capture(path, limit):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and stat.S_IMODE(st.st_mode) == 0o600 and st.st_size <= limit,
            'bounded private capture')
    return dict(path=str(path), bytes=st.st_size, sha256=digest(path), mode='0o600')


def accepted(row, kind, seal):
    require(isinstance(row, dict) and row.get('rootAccepted') is True and
            isinstance(row.get('acceptanceCommit'), str) and len(row['acceptanceCommit']) == 40 and
            all(c in '0123456789abcdef' for c in row['acceptanceCommit']), 'published root acceptance required')
    path = Path(row['path'])
    require(digest(path) == row['sha256'], 'accepted prerequisite hash')
    value = bounded_json(path, 65536)
    require(value.get('kind') == kind and value.get('rootAccepted') is True and value.get('sourceSealSha256') == seal,
            'exact ordinary source prerequisite')
    return value


def output_records(root, limits):
    require(root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode) and
            stat.S_IMODE(root.stat().st_mode) == 0o700, 'private result directory')
    require(set(os.listdir(root)) == set(limits), 'exact complete result files')
    rows = []
    total = 0
    for name, limit in limits.items():
        p = root / name
        row = capture(p, limit)
        total += row['bytes']
        require(total <= 335544320, 'complete output total bound')
        fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        rows.append(dict(row, relative=name))
    fd = os.open(root, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return rows


def validate_output(offer, allocation, stdout):
    seal = digest(HERE / 'seal.dat')
    if offer['job'] == 'prompt':
        require(not os.path.lexists(offer['work']), 'pure controls create no guest output')
        lines = stdout.decode().splitlines()
        selected = [line for line in lines if line.startswith('KS51_PROMPT_CONTROLS ')]
        require(len(selected) == 1 and len(lines) == 3 and all(line.startswith('mem-guard ') for line in lines if line not in selected),
                'complete control marker and shared guard chatter')
        report = json.loads(selected[0].split(' ', 1)[1])
        require(report['kind'] == 'PROMPT_OBSERVATION_SYNTHETIC_CONTROLS_ONLY' and report['begins'] == 16 and
                report['ordinaryHostFaultIdentityPreserved'] is True and report['guestExecutions'] == 0 and
                report['baselineSamples'] == 0 and report['productionCredit'] == 0, 'ordinary synthetic scope')
        require(report['cases'] == offer['expectedPromptCases'] and report['extractedSourceSHA256'] == offer['ordinaryKeysSha256'],
                'all22 actual ordinary controls')
        node = report['actualNode']
        require(type(node['pid']) is int and node['pid'] > 0 and type(node['parent']) is int and node['parent'] > 0 and
                node['pid'] != node['parent'] and node['guard'] == str(node['parent']) and
                node['argv'] == offer['leafArgv'] and node['executable'] == offer['node'] and node['execArgv'] == [] and
                node['nodeOptions'] == '--max-old-space-size=64', 'actual guarded prompt-control Node')
        inherited = report['inherited']
        require(len(inherited['cases']) == 9 and all(r['actual'] is r['expected'] for r in inherited['cases']) and
                inherited['originalJoinedScreenRejectsValidPrompt'] is True and inherited['hostErrorPropagated'] is True and
                len(inherited['checkpointErrorControls']['cases']) == 3, 'inherited endpoint/error controls')
        return dict(kind='ORDINARY_PROMPT_SOURCE_CONTROLS_REVIEW_REQUIRED', sourceSealSha256=seal,
                    actualReport=report, guestExecutions=0, baselineSamples=0, outputRows=[])
    root = Path(offer['work'])
    if offer['job'] == 'rulers':
        limits = {'status.json': 524288, 'rulers.json': 16777216, 'wrong-valid-ROM.rom': 16384}
    else:
        limits = {'status.json': 524288}
        for index in range(5):
            for mode in ('none', 'aggregate', 'detailed'):
                limits[f'{mode}-{index}-initial.img'] = 2097152
                limits[f'{mode}-{index}-card.img'] = 2097152
                limits[f'{mode}-{index}-reading.json'] = 16777216
    records = output_records(root, limits)
    status = bounded_json(root / 'status.json', 524288)
    require(status['status'] == 'PASSED' and status['packetSeal'] == seal and status['command'] == offer['command'],
            'PASSED exact new ordinary seal/command')
    node = status['actualNode']
    require(type(node['pid']) is int and type(node['parent']) is int and node['pid'] != node['parent'] and
            node['guard'] == str(node['parent']) and node['executable'] == offer['node'] and
            node['argv'] == offer['leafArgv'] and node['execArgv'] == [] and
            node['nodeOptions'] == '--max-old-space-size=64' and status['promptObservationCorrected'] is True,
            'actual guarded ordinary Node configuration')
    if offer['job'] == 'rulers':
        ruler = bounded_json(root / 'rulers.json', 16777216)
        require(ruler['status'] == 'RULERS_PASSED_RUNTIME_ONLY' and ruler['hostFaultPropagated'] is True,
                'new-seal ruler status')
        require([(v['name'], v['actual'], v['expected']) for v in ruler['readings']] ==
                [(f'LDIR-{n}', 21 * n - 5, 21 * n - 5) for n in (1, 2, 128, 512)] + [('NOP', 4, 4)], 'all five timing readings')
        require([v['name'] for v in ruler['controls']] == offer['expectedRulerControls'] and
                all(v['rejected'] is True for v in ruler['controls']), 'all36 specific ruler refusals')
        return dict(kind='ORDINARY_RULERS_REVIEW_REQUIRED', sourceSealSha256=seal, actualNode=node,
                    outputRows=records, statusSha256=digest(root / 'status.json'), readings=5, controls=36)
    result = status['result']
    require(result['cell'] == offer['selectedCell'] and result['capacityClosed'] is True and len(result['samples']) == 15,
            'PASSED AND capacityClosed for intended below cell')
    summaries, footprints = [], []
    for index in range(5):
        for mode in ('none', 'aggregate', 'detailed'):
            ident = f'{mode}-{index}'
            value = bounded_json(root / (ident + '-reading.json'), 16777216)
            require(value['cell'] == offer['selectedCell'] and value['mode'] == mode and value['index'] == index and
                    value['prime'] is None and [p['name'] for p in value['phases']] == offer['phases'],
                    'complete cold sample/six phases')
            require((root / (ident + '-initial.img')).stat().st_size == 2097152 and
                    (root / (ident + '-card.img')).stat().st_size == 2097152 and
                    digest(root / (ident + '-initial.img')) == value['initialCardSha256'] and
                    digest(root / (ident + '-card.img')) == value['final']['card'], 'full initial/final card joins')
            measured = value['reading']
            require(type(measured['cycles']) is int and measured['cycles'] > 0, 'positive integral guest cycles')
            if mode != 'none':
                timed = sorted(int(x) for x in measured['lbaReferences'])
                boot = sorted(int(x) for x in value['bootReading']['lbaReferences'])
                require(len(timed) == measured['completeWorkingSet'] < 30 and measured['capacityClass'] == 'below' and
                        0 < measured['eventCount'] <= 25000 and
                        len(measured['events']) == (measured['eventCount'] if mode == 'detailed' else 0), 'complete enabled below30 trace')
                if mode == 'detailed':
                    references = {}
                    for event in measured['events']:
                        if event.get('kind') == 'lba-reference':
                            lba = event['lba']
                            require(type(lba) is int and 0 <= lba <= 4294967295, 'absolute LBA event')
                            references[str(lba)] = references.get(str(lba), 0) + 1
                    require(references == measured['lbaReferences'], 'every detailed LBA event joins full references')
                require(sum(measured['buckets'].values()) == measured['cycles'] ==
                        sum(p['cycles'] for p in measured['phaseAccounts'].values()), 'exclusive bucket/phase sums')
                for phase in measured['phaseAccounts'].values():
                    require(sum(phase['buckets'].values()) == phase['cycles'], 'phase bucket partition')
                footprints.append(dict(id=ident, timed=timed, boot=boot, bootTimedUnion=sorted(set(boot) | set(timed)),
                    initialPopulatedTags=[v for v in value['stateBefore']['cache']['tags'] if v != 4294967295],
                    recurring=measured['recurringWorkingSet'], eventCount=measured['eventCount']))
            summaries.append(dict(id=ident, cycles=measured['cycles'], final=value['final'], counts=measured.get('counts'),
                                  readingSha256=digest(root / (ident + '-reading.json'))))
    for index in range(5):
        trio = summaries[3 * index:3 * index + 3]
        require(all(v['cycles'] == trio[0]['cycles'] and v['final'] == trio[0]['final'] for v in trio) and
                trio[1]['counts'] == trio[2]['counts'], 'three-mode cycle/state/count equivalence')
    enabled = summaries[1::3]
    require(all(v['cycles'] == enabled[0]['cycles'] and v['counts'] == enabled[0]['counts'] for v in enabled) and
            result['cyclesMedian'] == enabled[0]['cycles'] and result['cyclesMAD'] == 0, 'five-repeat deterministic cycles/counts')
    return dict(kind='ORDINARY_EDITOR_CELL_REVIEW_REQUIRED', sourceSealSha256=seal, actualNode=node, outputRows=records,
                statusSha256=digest(root / 'status.json'), samples=15, phases=6, capacityConjunction=True,
                fullEnabledFootprints=footprints, summaryHashes=[v['readingSha256'] for v in summaries],
                hardwareQualified=False, optimizationSelected=False)


def main():
    global DIRECT, DIRECT_SIGNAL_ALLOWED, LAUNCH_STARTED, DEADLINE
    require(len(sys.argv) == 2 and 'ORIGO_GUARD' not in os.environ and sys.platform == 'linux' and
            sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, 'isolated Linux outer outside guard')
    require(dict(os.environ) == {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TMPDIR': '/tmp'},
            'exact original outer environment')
    os.umask(0o077)
    namespace = Path(sys.argv[1]).stem
    require(namespace in COMMANDS and str(Path(sys.argv[1])) == '/workspace/scratch/' + namespace + '.alc', 'one closed command allocation')
    offer_path = HERE / (COMMANDS[namespace] + '.dat')
    offer = bounded_json(offer_path, 2097152)
    require(sys.executable == offer['python'], 'exact isolated Python executable')
    require(offer['budget']['nodeOldSpaceMiB'] == 64 and
            offer['budget']['nodeOldSpaceMaximumMiB'] == 450, 'effective64 under standing450 maximum')
    allocation = bounded_json(Path(sys.argv[1]), 16384)
    require(offer['runtimeAuthority'] is False and offer['allocationIssued'] is False and
            allocation.get('kind') == 'P3_C21_ORDINARY_ALLOCATION' and allocation.get('runtimeAuthority') is True and
            allocation.get('offerSha256') == digest(offer_path) and allocation.get('launcherSha256') == digest(Path(__file__)) and
            allocation.get('budget') == offer['budget'] and isinstance(allocation.get('packetCommit'), str) and
            len(allocation['packetCommit']) == 40 and all(c in '0123456789abcdef' for c in allocation['packetCommit']), 'separate exact published allocation')
    prepath = Path(offer['preflight'])
    require(digest(prepath) == allocation['preflightSha256'], 'original preflight hash')
    pre = bounded_json(prepath, 32768)
    require(pre['kind'] == 'P3_C21_ORDINARY_ROOT_PREFLIGHT' and pre['completedBeforePythonLaunch'] is True and
            pre['originalGuardAbsent'] is True and pre['allSourceProvidersTreesVerified'] is True and
            pre['originalFreshNamespaceVerified'] is True and pre['offerSha256'] == digest(offer_path) and
            pre['launcherSha256'] == digest(Path(__file__)) and pre['sourceSealSha256'] == digest(HERE / 'seal.dat') and
            pre['bootId'] == Path('/proc/sys/kernel/random/boot_id').read_text().strip() and
            type(pre['originalWholeEntryTick']) is int and pre['deadlineTick'] == pre['originalWholeEntryTick'] + 120000000000,
            'original before-start whole120/source/provider observation')
    require(allocation['rootAuthorizationSha256'] == pre['rootAuthorizationSha256'] ==
            digest(Path(offer['rootAuthorization'])), 'same original root preflight authority')
    DEADLINE = pre['deadlineTick']
    require(0 < whole_now() - pre['originalWholeEntryTick'] < 4000000000, 'whole startup/preflight four-second allowance')
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    for number in (signal.SIGALRM, signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(number, latch)
    signal.setitimer(signal.ITIMER_REAL, (DEADLINE - 1000000000 - whole_now()) / 1e9)
    runtime_before = verify_runtime()
    members(offer)
    closed_inputs(offer)
    env = dict(offer['environment'])
    if offer['job'] != 'prompt':
        accepted(allocation.get('acceptedPromptControls'), 'P3_C21_ORDINARY_PROMPT_ACCEPTANCE', digest(HERE / 'seal.dat'))
    if offer['job'] == 'cell':
        proof = accepted(allocation.get('acceptedRulers'), 'P3_C21_ORDINARY_RULER_ACCEPTANCE', digest(HERE / 'seal.dat'))
        ruler_path = Path(offer['rulerStatusPath'])
        require(proof['rulerStatusSha256'] == allocation['rulerStatusSha256'] == digest(ruler_path), 'root accepted exact new ruler status')
        ruler_status = bounded_json(ruler_path, 524288)
        require(ruler_status['status'] == 'PASSED' and ruler_status['packetSeal'] == digest(HERE / 'seal.dat') and
                ruler_status['command'] == ['rulers'], 'new ordinary seal ruler prerequisite')
        env.update(KS51_RULER_RESULT=str(ruler_path), KS51_RULER_SHA256=allocation['rulerStatusSha256'])
    paths = [Path(offer[k]) for k in ('stdout', 'stderr', 'receipt', 'guardLog', 'account')]
    require(len(set(paths)) == 5 and all(not os.path.lexists(p) for p in paths + [Path(offer['work'])]) and
            all(p.parent.resolve() == Path('/workspace/scratch') for p in paths), 'fresh exact result namespace')
    operations = subreaper()
    require(not LATCHED and whole_now() + 111000000000 <= DEADLINE - 5000000000, '110+1 target and five cleanup seconds inside original120')
    receipt = dict(state='HELD_INCOMPLETE', allocation=allocation, allocationSha256=digest(Path(sys.argv[1])),
        offerSha256=digest(offer_path), sourceSealSha256=digest(HERE / 'seal.dat'), runtimePreflight=runtime_before,
        preflightSha256=digest(prepath), originalWholeEntryTick=pre['originalWholeEntryTick'], deadlineTick=DEADLINE,
        subreaperOperations=operations, argv=offer['argv'], cwd=offer['cwd'], environment=env,
        sampledScope='Node workload subtree only; five-role whole price is separate', nativeIntegration=False)
    code = 70
    try:
        with paths[0].open('xb') as out, paths[1].open('xb') as err:
            LAUNCH_STARTED = True
            DIRECT = subprocess.Popen(offer['argv'], cwd=offer['cwd'], env=env, stdin=subprocess.DEVNULL,
                                      stdout=out, stderr=err, start_new_session=True, umask=0o077)
            DIRECT_SIGNAL_ALLOWED = True
            receipt['directPid'] = DIRECT.pid
            own_all_children()
            out.flush(); err.flush(); os.fsync(out.fileno()); os.fsync(err.fileno())
        receipt['captures'] = [capture(p, 1048576) for p in paths[:2]]
        require(FINAL_ECHILD and not HELD and not LATCHED and len(WAITS) == 1 and
                WAITS[0]['pid'] == DIRECT.pid and WAITS[0]['rawStatus'] == 0 and WAITS[0]['terminal'] == 0 and
                WAITS[0]['identity']['state'] == 'Z' and WAITS[0]['identity']['cmdlineHex'] == '', 'sole raw0/ECHILD normal ending')
        require(paths[3].stat().st_size <= 65536, 'guard log bound before read')
        guard_rows = [json.loads(line) for line in paths[3].read_text().splitlines()]
        require(len(guard_rows) == 2 and
                [v['event'] for v in guard_rows] == ['start', 'end'] and
                all(v['name'] == offer['guardName'] and v['command'] == offer['guardShownCommand'] and
                    v['limitMB'] == 600 and v['heapMB'] == 64 for v in guard_rows) and
                guard_rows[0]['waitedSeconds'] == 0 and guard_rows[1]['code'] == 0 and guard_rows[1]['outcome'] == 'exit 0',
                'exact guard ending/envelope')
        receipt['guardCapture'] = capture(paths[3], 65536)
        account = validate_output(offer, allocation, paths[0].read_bytes())
        receipt['account'] = exclusive(paths[4], account, 4194304)
        members(offer)
        closed_inputs(offer)
        receipt['runtimePostflight'] = verify_runtime()
        require(digest(prepath) == allocation['preflightSha256'] and
                digest(Path(offer['rootAuthorization'])) == allocation['rootAuthorizationSha256'] and
                digest(Path(sys.argv[1])) == receipt['allocationSha256'], 'postflight original authority/observation')
        for key in ('acceptedPromptControls', 'acceptedRulers'):
            item = allocation.get(key)
            if item is not None:
                require(digest(Path(item['path'])) == item['sha256'], 'postflight prerequisite identity')
        if offer['job'] == 'cell':
            require(digest(Path(offer['rulerStatusPath'])) == allocation['rulerStatusSha256'], 'postflight actual ruler status')
        require(digest(offer_path) == allocation['offerSha256'] and digest(Path(__file__)) == allocation['launcherSha256'], 'postflight command source')
        require(not LATCHED and whole_now() < DEADLINE - 1000000000, 'original whole interval before price')
        O = resource.getrusage(resource.RUSAGE_SELF)
        own = O.ru_maxrss * 1024
        descendant = WAITS[0]['rusage']['ru_maxrss'] * 1024
        require(own > 0 and descendant > 0, 'actual SELF and specific waited peaks')
        upper = own + 4 * descendant + 8388608
        require(type(pre['dataSelfPeakBytes']) is int and pre['dataSelfPeakBytes'] > 0, 'sequential preflight price')
        receipt['normalWholePrice'] = dict(actorBound=5, selfRawKiB=O.ru_maxrss, selfPeakBytes=own,
            specificTimeoutWaitPeakBytes=descendant, finalTailReserveBytes=8388608, conservativeBytes=upper,
            sequentialDataPreflightBytes=pre['dataSelfPeakBytes'], containingBytes=max(upper, pre['dataSelfPeakBytes']),
            limitBytes=629145600, aggregateChildrenNotSubtracted=True)
        require(max(upper, pre['dataSelfPeakBytes']) <= 629145600, 'whole price held')
        receipt['state'] = 'ORDINARY_SOURCE_RESULT_PENDING_INDEPENDENT_REVIEW'
        code = 0
    except BaseException as error:
        hold(type(error).__name__ + ': ' + str(error))
        print('HELD: ' + str(error), file=sys.stderr, flush=True)
    finally:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('EXCEPTIONAL_OWNERSHIP_DRAIN')
            own_all_children()
        receipt.update(waits=WAITS, finalECHILD=FINAL_ECHILD, signals=sorted(LATCHED), held=HELD,
            nativeIntegration=False, resourceReleaseAccepted=False, nextJobAllocated=False,
            elapsedWholeBeforeReceiptNs=whole_now() - pre['originalWholeEntryTick'])
        if HELD or LATCHED:
            code = 70
            receipt['state'] = 'HELD_ACTUAL_WAITED_ENDING_PENDING_REVIEW'
        receipt['terminalReturned'] = code
        exclusive(paths[2], receipt, 65536)
        after = whole_now()
        print(json.dumps(dict(state='OUTER_RECEIPT_FSYNCED', terminal=code,
            elapsedWholeNs=after - pre['originalWholeEntryTick'], under120=after < DEADLINE)), flush=True)
        if LATCHED or whole_now() >= DEADLINE - 1000000000:
            code = 70
        signal.setitimer(signal.ITIMER_REAL, 0)
    return code


if __name__ == '__main__':
    try:
        result = main()
    except BaseException:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('TOPLEVEL_EXCEPTION_OWNERSHIP_DRAIN')
            own_all_children()
        raise
    else:
        sys.exit(result)
