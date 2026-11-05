import os
import signal
import subprocess
import sys
import time

seconds = float(sys.argv[1][1:]) - time.time() if sys.argv[1].startswith("@") else int(sys.argv[1])
if seconds <= 0:
    print("Hard deadline already reached", flush=True)
    sys.exit(124)
started = time.monotonic()
child = subprocess.Popen(sys.argv[2:], start_new_session=True)
try:
    code = child.wait(timeout=seconds)
except subprocess.TimeoutExpired:
    os.killpg(child.pid, signal.SIGKILL)
    child.wait()
    print(f"Hard deadline reached after {seconds} seconds", flush=True)
    sys.exit(124)
print(f"Command exit {code}, wall {time.monotonic() - started:.3f} seconds", flush=True)
sys.exit(code)
