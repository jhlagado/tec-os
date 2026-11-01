// A model's figures against a recorded figures.json: for every key the record
// has, its value, the value measured, and whether it reproduces. Printed to
// stderr, one key a line; the counts last.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => (v === undefined ? "(none)" : JSON.stringify(v));

/** The record's leaves: [path, value], arrays whole. */
function leaves(value, path = []) {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length)
    return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
  return [[path, value]];
}

const at = (obj, path) => path.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);

/**
 * Compare RECORDED with MEASURED. CARRIED: path prefixes whose values the
 * model carries from the record rather than measures. MUTANTS false: the
 * mutants weren't run. Returns the rows.
 */
export function against(recorded, measured, { carried = [], mutants = true } = {}) {
  const rows = [];
  for (const [path, want] of leaves(recorded)) {
    const key = path.join(".");
    const got = at(measured, path);
    let status;
    if (!mutants && /^mutant/.test(key)) status = "not run (--mutants)";
    else if (carried.some((c) => key === c || key.startsWith(`${c}.`))) status = same(want, got) ? "carried" : "carried, differs";
    else if (same(want, got)) status = "reproduced";
    else if (typeof want === "number" && typeof got === "number") status = `differs by ${Math.round((got - want) * 1e6) / 1e6}`;
    else status = "differs";
    rows.push({ key, recorded: want, measured: got, status });
  }
  for (const r of rows) console.error(`${r.status.padEnd(22)} ${r.key}: ${show(r.recorded)}${r.status === "reproduced" || r.status === "carried" ? "" : ` -> ${show(r.measured)}`}`);
  const count = {};
  for (const r of rows) count[r.status.replace(/ by .*/, "")] = (count[r.status.replace(/ by .*/, "")] ?? 0) + 1;
  console.error(JSON.stringify(count));
  return rows;
}
