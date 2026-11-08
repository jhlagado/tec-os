"""Retain one root-authorised preflight.
This source never launches the workload.
"""
import time
ENTRY = time.clock_gettime_ns(7)
import hashlib
import json
import os
from pathlib import Path
import resource
import stat
import sys

HERE = Path(__file__).resolve().parent
JOBS = {'ks51pc01': 'prompt', 'ks51ru01': 'rulers', 'ks51te01': 'cell'}


def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(131072), b''):
            value.update(block)
    return value.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def regular(row):
    p = Path(row['path'])
    st = p.lstat()
    require(stat.S_ISREG(st.st_mode) and str(p.resolve()) == row['realpath'] and
            st.st_size == row['bytes'] and oct(stat.S_IMODE(st.st_mode)) == row['mode'] and sha(p) == row['sha256'],
            'exact original member ' + str(p))


def put(path, value):
    raw = (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()
    require(len(raw) <= 32768, 'bounded original authority/observation')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        pending = memoryview(raw)
        while pending:
            n = os.write(fd, pending)
            require(n > 0, 'complete original record')
            pending = pending[n:]
        os.fsync(fd)
    finally:
        os.close(fd)
    return hashlib.sha256(raw).hexdigest()


require(sys.platform == 'linux' and sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode and
        len(sys.argv) == 2 and sys.argv[1] in JOBS and 'ORIGO_GUARD' not in os.environ,
        'isolated original DATA preflight outside guard')
namespace = sys.argv[1]
offer_path = HERE / (JOBS[namespace] + '.dat')
offer = json.loads(offer_path.read_text())
require(sys.executable == offer['python'] and dict(os.environ) ==
        {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TMPDIR': '/tmp'},
        'exact original preflight interpreter and environment')
authority_path = Path('/workspace/scratch/' + namespace + '.aut')
st = authority_path.lstat()
require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and stat.S_IMODE(st.st_mode) == 0o600 and
        st.st_size <= 16384, 'separate bounded private root preflight authority')
authority = json.loads(authority_path.read_text())
require(authority.get('kind') == 'P3_C21_ORIGINAL_PREFLIGHT_AUTHORIZATION' and authority.get('runtimeAuthority') is True and
        authority.get('offerSha256') == sha(offer_path) and authority.get('launcherSha256') == sha(HERE / 'launch.py') and
        authority.get('preflightSourceSha256') == sha(Path(__file__)) and
        authority.get('sourceSealSha256') == sha(HERE / 'seal.dat') and
        isinstance(authority.get('packetCommit'), str) and len(authority['packetCommit']) == 40 and
        all(c in '0123456789abcdef' for c in authority['packetCommit']), 'exact published root preflight authority')
runtime = json.loads((HERE / 'runtime.dat').read_text())
for row in offer['members'] + runtime['members']:
    regular(row)
for row in runtime['symlinks']:
    p = Path(row['path'])
    require(p.is_symlink() and os.readlink(p) == row['target'] and str(p.resolve()) == row['realpath'], 'exact runtime link')
for name in runtime['absentPaths'] + offer['absentPaths']:
    require(not os.path.lexists(name), 'original absent provider ' + name)
for tree in runtime['closedTrees'] + offer['closedTrees']:
    root = Path(tree['path'])
    require(root.resolve() == root and stat.S_ISDIR(root.lstat().st_mode), 'canonical original tree')
    if 'rootMode' in tree:
        require(oct(stat.S_IMODE(root.stat().st_mode)) == tree['rootMode'], 'original input root mode')
    files, directories = set(), set()
    for current, dirs, names in os.walk(root, followlinks=False):
        if Path(current) == root:
            dirs[:] = [n for n in dirs if n not in tree.get('excludedTopDirectories', [])]
        for name in dirs + names:
            p = Path(current) / name
            st = p.lstat()
            relative = p.relative_to(root).as_posix()
            if stat.S_ISREG(st.st_mode):
                files.add(relative)
            elif stat.S_ISDIR(st.st_mode):
                if 'directoryMode' in tree:
                    require(oct(stat.S_IMODE(st.st_mode)) == tree['directoryMode'], 'original input directory mode')
                directories.add(relative)
            else:
                raise ValueError('special original tree entry ' + str(p))
    require(files == set(tree['files']) and directories == set(tree['directories']), 'exact original tree set')
for key in ('work', 'allocation', 'preflight', 'stdout', 'stderr', 'receipt', 'guardLog', 'account'):
    require(not os.path.lexists(offer[key]), 'original fresh namespace ' + key)
for key in ('acceptedPromptControls', 'acceptedRulers'):
    selected = authority.get(key)
    if selected is not None:
        require(selected.get('rootAccepted') is True and isinstance(selected.get('acceptanceCommit'), str) and
                len(selected['acceptanceCommit']) == 40 and sha(Path(selected['path'])) == selected['sha256'],
                'exact prerequisite root record')
if offer['job'] != 'prompt':
    require(authority.get('acceptedPromptControls') is not None, 'ordinary prompt acceptance prerequisite')
if offer['job'] == 'cell':
    require(authority.get('acceptedRulers') is not None and
            authority.get('rulerStatusSha256') == sha(Path(offer['rulerStatusPath'])), 'exact actual new ruler status')
boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
require(boot == offer['hostContext']['bootId'] and
        Path('/proc/sys/kernel/osrelease').read_text().strip() == offer['hostContext']['kernelRelease'], 'exact prospective host context')
preflight = dict(kind='P3_C21_ORDINARY_ROOT_PREFLIGHT', completedBeforePythonLaunch=True,
    originalGuardAbsent=True, allSourceProvidersTreesVerified=True, originalFreshNamespaceVerified=True,
    offerSha256=sha(offer_path), launcherSha256=sha(HERE / 'launch.py'), sourceSealSha256=sha(HERE / 'seal.dat'),
    rootAuthorizationSha256=sha(authority_path), preflightSourceSha256=sha(Path(__file__)),
    bootId=boot, originalWholeEntryTick=ENTRY, deadlineTick=ENTRY + 120000000000,
    interpreterBootstrapBeforeEntryCoveredByExternal120=True,
    dataSelfPeakBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
    elapsedNs=time.clock_gettime_ns(7) - ENTRY, subjectWorkloadExecuted=False)
prehash = put(Path(offer['preflight']), preflight)
allocation = dict(offer['futureAllocationTemplate'])
allocation.update(runtimeAuthority=True, offerSha256=sha(offer_path), launcherSha256=sha(HERE / 'launch.py'),
    preflightSha256=prehash, packetCommit=authority['packetCommit'], rootAuthorizationSha256=sha(authority_path),
    acceptedPromptControls=authority.get('acceptedPromptControls'), acceptedRulers=authority.get('acceptedRulers'),
    rulerStatusSha256=authority.get('rulerStatusSha256'))
allocation_hash = put(Path(offer['allocation']), allocation)
print(json.dumps(dict(state='ORIGINAL_PREFLIGHT_REVIEW_REQUIRED', preflightSha256=prehash,
    allocationSha256=allocation_hash, originalWholeEntryTick=ENTRY, noWorkloadLaunched=True)))
