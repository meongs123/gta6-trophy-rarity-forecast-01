// Two-regime pool model P(t) (v2).
//
//   log P(t) = a_r + b_r * log(1 + t) + (refresh level-shifts)
//
// The pool is NOT one curve: the launch spike (19-20 Nov) grows at a
// different rate from the steady state (21-26 Nov), and the final
// horizon sits entirely in the steady regime. So the log-time slope is
// fitted separately per regime, split at POOL_SPLIT_HOURS (48h after
// launch), after removing refresh jumps. A regime with fewer than two
// epochs borrows the other regime's slope; with a single epoch overall
// the slope is the prior and the line is anchored on that epoch.
//
// A refresh is a discrete jump, not organic growth: consecutive epochs
// whose log player count rises by more than JUMP_LOG mark a refresh.
// Jump sizes are measured AFTER removing the organic growth between the
// two epochs (two passes: flag on the raw step, fit the slope on the
// jump-corrected series, then re-size the jumps with the fitted slope).
// No refresh is ever forecast into the future: future refreshes are
// uncertainty (they feed sigma_refresh and the dilution shift in the
// adoption module), not a rise in P-hat.
//
// The pool fit also yields the refresh PROCESS the rest of the model
// needs: how often refreshes arrive (lambda, Poisson rate with a
// one-pseudo-refresh prior shrink) and how big they are (mean and mean
// square of the log jump sizes). P-hat itself matters in v2 only
// through the earners ceiling (E-hat = R-hat * P-hat) and the
// count-noise term — the medians come from the adoption model, not
// from extrapolating P.

import type { Epoch, Refresh } from "./types.ts";
import {
  JUMP_LOG,
  LAMBDA_PRIOR_PER_DAY,
  JUMP_SIZE_PRIOR,
  POOL_CAP,
  POOL_SLOPE_MAX,
  POOL_SLOPE_PRIOR,
  POOL_SPLIT_HOURS,
  POOL_TWO_REGIME,
} from "./params.ts";

export interface PoolFit {
  // Steady-regime line (used for the forecast).
  aSteady: number;
  bSteady: number;
  bLaunch: number;
  totalJump: number;
  refreshes: Refresh[];
  refreshCount: number;
  // Poisson refresh rate, refreshes per day (prior-shrunk).
  lambdaPerDay: number;
  // Mean / mean-square of observed log jump sizes (prior when none).
  jumpMean: number;
  jumpMeanSq: number;
  pLast: number;
  tLast: number;
  tFirst: number;
}

function leastSquaresSlope(
  xs: number[],
  ys: number[],
): { a: number; b: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let k = 0; k < n; k++) {
    mx += xs[k];
    my += ys[k];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    sxx += (xs[k] - mx) * (xs[k] - mx);
    sxy += (xs[k] - mx) * (ys[k] - my);
  }
  if (sxx <= 1e-12) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

function clampSlope(b: number): number {
  return Math.min(POOL_SLOPE_MAX, Math.max(0, b));
}

export function fitPool(epochs: Epoch[]): PoolFit {
  const n = epochs.length;
  const last = epochs[n - 1];
  const logP = epochs.map((e) => Math.log(e.players));
  const logT = epochs.map((e) => Math.log(1 + e.tHours));

  // Pass 1: flag jumps on the raw log step.
  const flagged: boolean[] = new Array<boolean>(n).fill(false);
  for (let k = 1; k < n; k++) {
    if (logP[k] - logP[k - 1] > JUMP_LOG) flagged[k] = true;
  }
  // Jump-corrected log pool, then a pooled slope for the organic part.
  const corrected: number[] = [];
  {
    let running = 0;
    for (let k = 0; k < n; k++) {
      if (flagged[k]) running += logP[k] - logP[k - 1];
      corrected.push(logP[k] - running);
    }
  }
  const pooled = leastSquaresSlope(logT, corrected);
  const bOrganic = pooled !== null ? clampSlope(pooled.b) : POOL_SLOPE_PRIOR;

  // Pass 2: re-size jumps with the organic part removed; unflag steps
  // that turn out to be organic growth, not a refresh.
  const refreshes: Refresh[] = [];
  {
    let running = 0;
    for (let k = 1; k < n; k++) {
      const step = logP[k] - logP[k - 1];
      const organic = bOrganic * (logT[k] - logT[k - 1]);
      const size = step - organic;
      if (flagged[k] && size > JUMP_LOG) {
        refreshes.push({
          epochIndex: k,
          jumpLog: size,
          dtHours: epochs[k].tHours - epochs[k - 1].tHours,
        });
        running += size;
      } else if (flagged[k]) {
        // Raw step looked like a jump but the slope explains it.
        flagged[k] = false;
      }
    }
    void running;
  }
  // Recompute the corrected series with the final jump set, per regime.
  const jumpAt = new Map<number, number>();
  let totalJump = 0;
  for (const r of refreshes) {
    jumpAt.set(r.epochIndex, r.jumpLog);
    totalJump += r.jumpLog;
  }
  const correctedFinal: number[] = [];
  {
    let running = 0;
    for (let k = 0; k < n; k++) {
      running += jumpAt.get(k) ?? 0;
      correctedFinal.push(logP[k] - running);
    }
  }

  // Two-regime slopes on the corrected series.
  const launchIdx: number[] = [];
  const steadyIdx: number[] = [];
  for (let k = 0; k < n; k++) {
    if (epochs[k].tHours < POOL_SPLIT_HOURS) launchIdx.push(k);
    else steadyIdx.push(k);
  }
  const fitFor = (idx: number[]): { a: number; b: number } | null => {
    if (idx.length < 2) return null;
    return leastSquaresSlope(
      idx.map((k) => logT[k]),
      idx.map((k) => correctedFinal[k]),
    );
  };
  let bLaunch = POOL_SLOPE_PRIOR;
  let bSteady = POOL_SLOPE_PRIOR;
  if (POOL_TWO_REGIME) {
    const fl = fitFor(launchIdx);
    const fs = fitFor(steadyIdx);
    if (fl !== null) bLaunch = clampSlope(fl.b);
    if (fs !== null) bSteady = clampSlope(fs.b);
    // A regime with one epoch borrows the other regime's fitted slope.
    if (fl === null && fs !== null) bLaunch = bSteady;
    if (fs === null && fl !== null) bSteady = bLaunch;
  } else {
    const fp = leastSquaresSlope(logT, correctedFinal);
    const b = fp !== null ? clampSlope(fp.b) : POOL_SLOPE_PRIOR;
    bLaunch = b;
    bSteady = b;
  }
  // Steady intercept: anchor the steady line on the steady epochs if
  // any exist, else on the last epoch (so P-hat starts at P_last).
  let aSteady: number;
  if (steadyIdx.length > 0) {
    let s = 0;
    for (const k of steadyIdx) s += correctedFinal[k] - bSteady * logT[k];
    aSteady = s / steadyIdx.length;
  } else {
    aSteady =
      correctedFinal[n - 1] - bSteady * logT[n - 1];
  }

  // Refresh process: Poisson rate with one pseudo-refresh of prior
  // weight, so a history with no refresh still yields a sane rate.
  // The span is the READ window (first read to last read), not the
  // state-time span: the rate is about how often refreshes arrive in
  // wall-clock time, and the last epoch's state is frozen at its
  // refresh, hours before the last read.
  const spanDays = Math.max(
    0.5,
    (last.readEndHours - epochs[0].readStartHours) / 24,
  );
  const lambdaPerDay =
    (refreshes.length + 1) / (spanDays + 1 / LAMBDA_PRIOR_PER_DAY);
  let jumpMean = JUMP_SIZE_PRIOR;
  let jumpMeanSq = JUMP_SIZE_PRIOR * JUMP_SIZE_PRIOR;
  if (refreshes.length > 0) {
    let s1 = 0;
    let s2 = 0;
    for (const r of refreshes) {
      s1 += r.jumpLog;
      s2 += r.jumpLog * r.jumpLog;
    }
    jumpMean = s1 / refreshes.length;
    jumpMeanSq = s2 / refreshes.length;
  }

  return {
    aSteady,
    bSteady,
    bLaunch,
    totalJump,
    refreshes,
    refreshCount: refreshes.length,
    lambdaPerDay,
    jumpMean,
    jumpMeanSq,
    pLast: last.players,
    tLast: last.tHours,
    tFirst: epochs[0].tHours,
  };
}

export function forecastPool(fit: PoolFit, tTargetHours: number): number {
  const raw = Math.exp(
    fit.aSteady +
      fit.bSteady * Math.log(1 + tTargetHours) +
      fit.totalJump,
  );
  const floored = Math.max(raw, fit.pLast);
  return Math.min(floored, fit.pLast * POOL_CAP);
}
