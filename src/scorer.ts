// Pinball loss on the logit scale (build-spec Langkah 4).
//
// Local backtest use ONLY: this module is not imported by the entry's
// forecast path, so it can never change an output. It must match the RULES
// definition exactly:
//
//   clamp each rate to [0.01, 99.99];  logit(x) = ln(x / (100 - x))
//   d = logit(y_true) - logit(q_tau)
//   pinball_tau = 2 * max(tau * d, (tau - 1) * d)
//   loss = mean over every trophy x every tau, to 6 decimals
//
// Coverage90 is the share of trophies whose true rate lies inside
// [q05, q95].

import { clampRate, logitOf } from "./quantiles.ts";

export const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

export function pinballOne(
  yTruePct: number,
  qPct: number,
  tau: number,
): number {
  const d = logitOf(yTruePct) - logitOf(qPct);
  return 2 * Math.max(tau * d, (tau - 1) * d);
}

export function scoreForecast(
  truthPct: number[],
  rows: Array<{ id: number; q: number[] }>,
): { loss: number; coverage90: number; worstTrophyLoss: number } {
  const byId = new Map<number, number[]>();
  for (const row of rows) byId.set(row.id, row.q);
  let total = 0;
  let items = 0;
  let covered = 0;
  let worst = 0;
  for (let i = 0; i < truthPct.length; i++) {
    const q = byId.get(i + 1);
    if (q === undefined) continue;
    let trophyLoss = 0;
    for (let j = 0; j < LEVELS.length; j++) {
      trophyLoss += pinballOne(truthPct[i], q[j], LEVELS[j]);
      items++;
    }
    trophyLoss /= LEVELS.length;
    total += trophyLoss;
    if (trophyLoss > worst) worst = trophyLoss;
    if (q[0] <= clampRate(truthPct[i]) && clampRate(truthPct[i]) <= q[4]) {
      covered++;
    }
  }
  const n = truthPct.length;
  return {
    loss: Math.round((total / Math.max(1, n)) * 1e6) / 1e6,
    coverage90: n > 0 ? covered / n : 0,
    worstTrophyLoss: Math.round(worst * 1e6) / 1e6,
  };
}
