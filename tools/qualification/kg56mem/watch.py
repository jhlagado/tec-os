"""KG56 prospective Linux private-group watchdog. UNRUN, not an allocation.

No application file I/O/log/hash/helper work in the parent after ENTRY.
timerfd dispatch is polling, not asynchronous protection against a stalled OS.
"""
import ctypes
import os
import signal
import sys

if not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode):
    raise RuntimeError('isolated no-site no-bytecode interpreter required')
if sys.platform != 'linux' or sys.byteorder != 'little' or ctypes.sizeof(ctypes.c_long) != 8 or ctypes.sizeof(ctypes.c_void_p) != 8:
    raise RuntimeError('reviewed Linux little-endian LP64 ABI required')


class Timespec(ctypes.Structure):
    _fields_ = [('sec', ctypes.c_long), ('nsec', ctypes.c_long)]


class Itimerspec(ctypes.Structure):
    _fields_ = [('interval', Timespec), ('value', Timespec)]


class Pollfd(ctypes.Structure):
    _fields_ = [('fd', ctypes.c_int), ('events', ctypes.c_short), ('revents', ctypes.c_short)]


libc = ctypes.CDLL('/usr/lib/x86_64-linux-gnu/libc.so.6', use_errno=True)
libc.clock_gettime.argtypes = [ctypes.c_int, ctypes.POINTER(Timespec)]
libc.clock_gettime.restype = ctypes.c_int
libc.timerfd_create.argtypes = [ctypes.c_int, ctypes.c_int]
libc.timerfd_create.restype = ctypes.c_int
libc.timerfd_settime.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.POINTER(Itimerspec), ctypes.c_void_p]
libc.timerfd_settime.restype = ctypes.c_int
libc.poll.argtypes = [ctypes.POINTER(Pollfd), ctypes.c_ulong, ctypes.c_int]
libc.poll.restype = ctypes.c_int
NS = 1_000_000_000


def now():
    value = Timespec()
    if libc.clock_gettime(7, ctypes.byref(value)):
        raise OSError(ctypes.get_errno(), 'CLOCK_BOOTTIME')
    if value.sec < 0 or not 0 <= value.nsec < NS:
        raise RuntimeError('invalid kernel timestamp')
    return value.sec * NS + value.nsec


ENTRY = now()
DEADLINE = ENTRY + 120 * NS
GROUP = os.getpid()
GUARD = int(os.environ.get('ORIGO_GUARD', '0'))
if GUARD <= 0 or os.getppid() != GUARD or os.getpgrp() != GROUP:
    raise RuntimeError('actual direct guard/private group required')
if len(sys.argv) != 4:
    raise RuntimeError('exact binding, closed job and exclusive supervision output required')
JOBS = ('warm', 'inert-healthy', 'inert-barrier-delay', 'inert-prearm-refusal',
        'inert-finalization-expiry-short', 'inert-shutdown-expiry-short',
        'inert-interruption', 'inert-node-error', 'inert-whole-expiry',
        'inert-adoption-capability')
JOB = sys.argv[2]
if JOB not in JOBS:
    raise RuntimeError('closed job required')
if os.fstat(1).st_mode & 0o170000 != 0o010000:
    raise RuntimeError('external continuously drained stdout pipe required')
os.set_blocking(1, False)
child = None
status = None
release_tick = 0
marker_count = 0
fds = []


def marker(reason):
    global marker_count
    if marker_count >= 4:
        return False
    marker_count += 1
    record = ('KG56W1 ' + reason + ' ' + str(GROUP) + ' ' + str(GUARD) + ' '
              + str(ENTRY) + ' ' + str(now()) + ' ' + str(child or 0) + ' '
              + str(status if status is not None else -1) + ' '
              + str(release_tick) + '\n').encode('ascii')
    if len(record) > 256:
        return False
    try:
        return os.write(1, record) == len(record)
    except OSError:
        return False


def stop(reason):
    try:
        try:
            marker(reason)
        except BaseException:
            pass
        os.killpg(GROUP, signal.SIGKILL)
    finally:
        os._exit(124)


def arm(fd, tick):
    value = Itimerspec()
    if tick is not None:
        value.value.sec, value.value.nsec = divmod(tick, NS)
    if libc.timerfd_settime(fd, 1, ctypes.byref(value), None):
        raise OSError(ctypes.get_errno(), 'timerfd_settime')


def counter(fd):
    try:
        value = os.read(fd, 8)
    except (BlockingIOError, InterruptedError):
        return False
    if len(value) != 8 or int.from_bytes(value, 'little') <= 0:
        raise RuntimeError('invalid timer counter')
    return True


def setup_bound():
    if now() >= DEADLINE:
        raise RuntimeError('original deadline during setup')


try:
    setup_bound()
    whole = libc.timerfd_create(7, os.O_CLOEXEC | os.O_NONBLOCK)
    if whole < 0:
        raise OSError(ctypes.get_errno(), 'timerfd_create')
    fds.append(whole)
    setup_bound()
    if JOB == 'inert-prearm-refusal':
        marker('INERT_PREARM_REFUSAL')
        os.close(whole)
        os._exit(78)
    arm(whole, DEADLINE)
    setup_bound()
    short = None
    short_tick = None
    if JOB in ('inert-finalization-expiry-short', 'inert-shutdown-expiry-short'):
        short = libc.timerfd_create(7, os.O_CLOEXEC | os.O_NONBLOCK)
        if short < 0:
            raise OSError(ctypes.get_errno(), 'inert timerfd_create')
        fds.append(short)
        short_tick = ENTRY + 5 * NS
        arm(short, short_tick)
        setup_bound()
    ready_r, ready_w = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
    fds.extend((ready_r, ready_w))
    setup_bound()
    for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(sig, lambda signum, frame: stop('PARENT_SIGNAL'))
    setup_bound()
    child = os.fork()
except BaseException:
    if child is None:
        try:
            marker('SETUP_REFUSAL')
        except BaseException:
            pass
        for fd in fds:
            try:
                os.close(fd)
            except OSError:
                pass
        os._exit(78)
    stop('FORK_OR_SETUP_FAILURE')

if child:
    try:
        os.close(ready_r)
        if JOB == 'inert-adoption-capability':
            os.set_blocking(0, False)
        timers = [whole] + ([] if short is None else [short])
        polled = (Pollfd * len(timers))(*(Pollfd(fd, 1, 0) for fd in timers))

        def dispatch():
            if counter(whole) or now() >= DEADLINE:
                stop('WHOLE_EXPIRED')
            if short is not None and (counter(short) or now() >= short_tick):
                stop('INERT_SHORT_TIMER_EXPIRED')

        def poll_once():
            dispatch()
            for item in polled:
                item.revents = 0
            result = libc.poll(polled, len(timers), 10)
            if result < 0:
                if ctypes.get_errno() == 4:
                    return
                raise OSError(ctypes.get_errno(), 'poll')
            if any(item.revents & (8 | 32) for item in polled):
                raise RuntimeError('timer descriptor error')
            dispatch()

        if not marker('ARMED_BARRIER'):
            stop('MARKER_FAILURE')
        while JOB == 'inert-barrier-delay' and now() < ENTRY + NS:
            poll_once()
        dispatch()
        release_tick = now()
        if release_tick >= DEADLINE or os.write(ready_w, b'R' + release_tick.to_bytes(8, 'little')) != 9:
            raise RuntimeError('release failure')
        os.close(ready_w)
        if not marker('RELEASED'):
            stop('MARKER_FAILURE')
        while True:
            poll_once()
            if status is None:
                observed, ending = os.waitpid(child, os.WNOHANG)
                if observed:
                    status = ending
            dispatch()
            if status is None:
                continue
            if os.waitstatus_to_exitcode(status) != 0:
                stop('SUPERVISOR_FAILED')
            # Capability-only private ACK from the existing outer collector,
            # after actual adopted-child wait0. No timing grace substitutes
            # for that wait: guard would kill the group after we exit.
            if JOB == 'inert-adoption-capability':
                try:
                    ack = os.read(0, 9)
                except (BlockingIOError, InterruptedError):
                    continue
                if ack != b'ADOPTED0':
                    stop('ADOPTION_ACK_REJECTED')
            dispatch()
            for fd in timers:
                arm(fd, None)
                os.close(fd)
            final_bound = min(DEADLINE, short_tick if short_tick is not None else DEADLINE)
            if now() >= final_bound:
                stop('LATE_TERMINAL')
            if not marker('SUCCESS') or now() >= final_bound:
                os._exit(1)
            os._exit(0)
    except BaseException:
        stop('PARENT_EXCEPTION')
else:
    # No application/hash/verification import before the explicit release.
    for fd in [ready_w, whole] + ([] if short is None else [short]):
        os.close(fd)
    for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(sig, signal.SIG_DFL)
    try:
        poller = Pollfd(ready_r, 1, 0)
        while True:
            if now() >= DEADLINE:
                os._exit(1)
            try:
                token = os.read(ready_r, 10)
            except (BlockingIOError, InterruptedError):
                result = libc.poll(ctypes.byref(poller), 1, 10)
                if result < 0 and ctypes.get_errno() != 4:
                    os._exit(1)
                continue
            if len(token) != 9 or token[:1] != b'R':
                os._exit(1)
            released = int.from_bytes(token[1:], 'little')
            first_supervised = now()
            if not ENTRY <= released <= first_supervised < DEADLINE or os.getppid() != GROUP:
                os._exit(1)
            break
        os.close(ready_r)
        import runpy
        runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'super.py'),
                      init_globals={'CLOCK_NOW': now, 'ENTRY_TICK': ENTRY, 'DEADLINE_TICK': DEADLINE,
                                    'RELEASE_TICK': released, 'FIRST_SUPERVISED_TICK': first_supervised,
                                    'WATCHDOG_PID': GROUP, 'GUARD_PID': GUARD, 'JOB': JOB}, run_name='__main__')
        # Natural interpreter shutdown is awaited by the live independent parent.
    except SystemExit:
        raise
    except BaseException:
        # Keep the original supervised error/traceback. Any blocked error
        # output or natural interpreter ending remains under the live parent.
        raise
