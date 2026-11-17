// The T-states of each call to a routine on machine M: entry to the return
// that takes SP back above the entry's. Used by the packed font's time rows.

/** Start timing calls to the address AT() on M; returns the list the durations go into. */
export function callTimes(m, at) {
  const calls = [];
  const open = [];
  const prev = m.mvWatch;
  m.mvWatch = (pc) => {
    if (pc === at()) open.push({ sp: m.cpu.cpu.sp, at: m.cycles });
    while (open.length && m.cpu.cpu.sp > open[open.length - 1].sp) calls.push(m.cycles - open.pop().at);
    prev?.(pc);
  };
  return calls;
}

/** Type LINE and run to the CCP's prompt, answering [more] with a space. */
export function runLine(m, line) {
  const mark = m.output.length;
  m.type(`${line}\r`);
  const prompt = /\r\n[A-P](:\S*)?>$/;
  for (let i = 0; i < 400; i += 1) {
    const end = m.cycles + 20_000_000;
    m.runUntil(() => m.cycles >= end || (m.waitingForInput() && prompt.test(m.text(mark))), 30_000_000, line);
    if (prompt.test(m.text(mark)) && m.waitingForInput()) return m.text(mark);
    if (m.waitingForInput()) m.type(/\[more\]$/.test(m.text(mark)) ? " " : "\r");
  }
  throw new Error(`no prompt after ${line}`);
}
