// Local validation helpers for gta6-trophy-rarity-forecast-01 (NOT part of
// the entry; the entry never imports this file). Pinball loss on the logit
// scale, exactly as RULES defines it, plus the output-shape validator the
// grader's format gate enforces.

export const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

export function clampRate(pct) {
  return Math.min(99.99, Math.max(0.01, pct));
}

export function logitOf(pct) {
  const c = clampRate(pct);
  return Math.log(c / (100 - c));
}

export function pinballOne(yTruePct, qPct, tau) {
  const d = logitOf(yTruePct) - logitOf(qPct);
  return 2 * Math.max(tau * d, (tau - 1) * d);
}

// truthPct: true rate per trophy, in the case's trophy order.
// rows: parsed {"trophies":[{"id","q":[...]}]}.
export function scoreForecast(truthPct, rows) {
  const byId = new Map(rows.map((r) => [r.id, r.q]));
  let total = 0;
  let covered = 0;
  let worst = 0;
  let worstId = -1;
  for (let i = 0; i < truthPct.length; i++) {
    const q = byId.get(i + 1);
    if (q === undefined) continue;
    let trophyLoss = 0;
    for (let j = 0; j < LEVELS.length; j++) {
      trophyLoss += pinballOne(truthPct[i], q[j], LEVELS[j]);
    }
    trophyLoss /= LEVELS.length;
    total += trophyLoss;
    if (trophyLoss > worst) {
      worst = trophyLoss;
      worstId = i + 1;
    }
    const y = clampRate(truthPct[i]);
    if (q[0] <= y && y <= q[4]) covered++;
  }
  const n = truthPct.length;
  return {
    loss: Math.round((total / Math.max(1, n)) * 1e6) / 1e6,
    coverage90: n > 0 ? covered / n : 0,
    worstTrophyLoss: Math.round(worst * 1e6) / 1e6,
    worstTrophyId: worstId,
  };
}

// Returns a list of violations; empty means the output is format-valid.
export function validateOutput(parsed, trophyCount, trophyIds) {
  const problems = [];
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return ["output is not a JSON object"];
  }
  if (Object.keys(parsed).length !== 1 || !("trophies" in parsed)) {
    problems.push("top-level keys must be exactly {trophies}");
  }
  const rows = parsed.trophies;
  if (!Array.isArray(rows)) return [...problems, "trophies is not an array"];
  if (rows.length !== trophyCount) {
    problems.push(`expected ${trophyCount} rows, got ${rows.length}`);
  }
  const seen = new Set();
  for (const row of rows) {
    if (Object.keys(row).length !== 2 || !("id" in row) || !("q" in row)) {
      problems.push(`row keys must be exactly {id,q}: ${JSON.stringify(row)}`);
      continue;
    }
    if (seen.has(row.id)) problems.push(`duplicate id ${row.id}`);
    seen.add(row.id);
    if (!Array.isArray(row.q) || row.q.length !== 5) {
      problems.push(`id ${row.id}: q must have 5 numbers`);
      continue;
    }
    for (let j = 0; j < 5; j++) {
      const v = row.q[j];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
        problems.push(`id ${row.id}: q[${j}] = ${v} out of [0,100]`);
      }
      if (j > 0 && row.q[j] < row.q[j - 1]) {
        problems.push(`id ${row.id}: q not non-decreasing`);
      }
    }
  }
  for (const id of trophyIds) {
    if (!seen.has(id)) problems.push(`missing id ${id}`);
  }
  return problems;
}
