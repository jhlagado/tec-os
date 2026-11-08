"""Only the watchdog's released fork child invokes this exact source."""
import atexit
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

if os.getppid() != WATCHDOG_PID or os.getpgrp() != WATCHDOG_PID:
    raise RuntimeError('retained watchdog child/group required')
if not ENTRY_TICK <= RELEASE_TICK <= FIRST_SUPERVISED_TICK < DEADLINE_TICK:
    raise RuntimeError('prearmed release ordering required')


def check():
    if CLOCK_NOW() >= DEADLINE_TICK:
        raise RuntimeError('original120-second deadline')


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            check()
            value.update(block)
    return value.hexdigest()


def rows(items):
    for row in items:
        check()
        path = Path(row['path'])
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or str(path.resolve()) != row['realpath'] or info.st_size != row['bytes'] or format(stat.S_IMODE(info.st_mode), '04o') != row['mode'] or digest(path) != row['sha256']:
            raise RuntimeError('input mismatch: ' + str(path))


def links(items):
    for link in items:
        path = Path(link['path'])
        if not path.is_symlink() or os.readlink(path) != link['target'] or str(path.resolve()) != link['realpath']:
            raise RuntimeError('runtime symlink changed')


def durable(path, data):
    check()
    with path.open('x') as stream:
        json.dump(data, stream, indent=2, allow_nan=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    check()


def event(kind, pid):
    message = ('KG56S1 ' + kind + ' ' + str(os.getpid()) + ' ' + str(pid)
               + ' ' + str(WATCHDOG_PID) + ' ' + str(ENTRY_TICK) + ' '
               + str(CLOCK_NOW()) + '\n').encode('ascii')
    if len(message) > 256 or os.write(1, message) != len(message):
        raise RuntimeError('identity event incomplete')


def main():
    check()
    binding_path = Path(sys.argv[1])
    if digest(binding_path) != os.environ['KG56_BINDING_SHA256']:
        raise RuntimeError('exact allocation-named binding required')
    binding = json.loads(binding_path.read_bytes())
    if binding['job'] != JOB or binding['watchdogSeconds'] != 120:
        raise RuntimeError('closed job/original deadline required')
    for name in ('registered', 'sourceReviewAccepted', 'commandHostContractAccepted', 'runtimeInputClosureAccepted', 'allocationIssued'):
        if binding.get(name) is not True:
            raise RuntimeError('inactive admission: ' + name)
    if JOB not in ('inert-healthy', 'inert-barrier-delay', 'inert-prearm-refusal', 'inert-adoption-capability') and not binding['subreaperCapabilityAccepted']:
        raise RuntimeError('actual positive subreaper capability required before failure controls/warm')
    if JOB == 'inert-whole-expiry' and not binding['cheapControlPricesAccepted']:
        raise RuntimeError('accepted cheap control prices required before full120 expiry offer')
    rows(binding['supervisedInputs'])
    links(binding['supervisedSymlinks'])
    rows(binding['registeredGateFiles'])
    check()
    out = Path(sys.argv[3])
    os.umask(0o077)
    out.mkdir(mode=0o700)
    context = dict(job=JOB, watchdogPid=WATCHDOG_PID, supervisorPid=os.getpid(), guardPid=GUARD_PID,
                   group=os.getpgrp(), entryTick=ENTRY_TICK, deadlineTick=DEADLINE_TICK,
                   releaseTick=RELEASE_TICK, firstSupervisedTick=FIRST_SUPERVISED_TICK,
                   clock='CLOCK_BOOTTIME7 integer nanoseconds', wholeSeconds=120,
                   bindingSha256=os.environ['KG56_BINDING_SHA256'], nativeAcceptance=False,
                   productAcceptance=False, resourceReleaseAccepted=False)
    durable(out / 'released-invocation.json', context)
    if JOB == 'inert-adoption-capability':
        # One closed inert child replaces the Node actor in this separate job.
        # Parent exits normally; child must report actual kernel adoption.
        collector = int(os.environ['KG56_COLLECTOR_PID'])
        adopted = os.fork()
        if adopted == 0:
            while CLOCK_NOW() < min(DEADLINE_TICK, FIRST_SUPERVISED_TICK + 5_000_000_000):
                if os.getppid() == collector:
                    data = ('KG56A1 ADOPTED ' + str(os.getpid()) + ' ' + str(collector) + '\n').encode('ascii')
                    try:
                        complete = os.write(1, data) == len(data)
                    except OSError:
                        complete = False
                    os._exit(0 if complete else 71)
                time.sleep(.001)
            os._exit(72)
        event('ADOPTION_CHILD', adopted)
        durable(out / 'adoption-parent.json', dict(context, inertChildPid=adopted, expectedCollectorPid=collector))
        return 0
    argv = binding['nodeArgv']
    if argv[0] != binding['node']['realpath'] or '--max-old-space-size=64' not in argv:
        raise RuntimeError('fixed pinned Node and heap required')
    child = None
    terminal = None
    try:
        check()
        child = subprocess.Popen(argv, cwd=binding['cwd'], env=binding['nodeEnvironment'] | {'ORIGO_GUARD': str(GUARD_PID), 'KG56_BINDING_SHA256': os.environ['KG56_BINDING_SHA256']}, stdin=subprocess.DEVNULL)
        event('NODE_START', child.pid)
        terminal = child.wait()  # Independent parent remains armed throughout.
        check()
        if JOB in ('inert-finalization-expiry-short', 'inert-shutdown-expiry-short'):
            durable(out / 'node-exited-before-delay.json', dict(context, nodePid=child.pid, nodeTerminal=terminal, stage='before supervisor finalization/shutdown'))
        if JOB == 'inert-finalization-expiry-short':
            time.sleep(7)  # Explicit inert delay, not an actual stalled disk syscall.
        if JOB == 'inert-interruption':
            durable(out / 'before-interruption.json', dict(context, nodePid=child.pid, nodeTerminal=terminal))
            os.kill(WATCHDOG_PID, signal.SIGTERM)  # Exact retained actual parent only.
            time.sleep(4)
        rows(binding['supervisedInputs'])
        links(binding['supervisedSymlinks'])
        rows(binding['registeredGateFiles'])
        durable(out / 'supervisor-result.json', dict(context, nodePid=child.pid, nodeTerminal=terminal, finalizationTick=CLOCK_NOW(), state='CHILD_EXIT_AND_IO_COMPLETE_INTERPRETER_SHUTDOWN_PENDING', targetSemanticKillClaimed=False))
        if JOB == 'inert-shutdown-expiry-short':
            atexit.register(lambda: time.sleep(7))
        return terminal if terminal >= 0 else 128-terminal
    except BaseException:
        if child is not None and child.poll() is None:
            child.terminate()
            child.wait()  # A stuck child still belongs to live watchdog's group.
        raise


if __name__ == '__main__':
    sys.exit(main())  # Natural child interpreter ending remains supervised.
