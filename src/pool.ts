// Pool model P(t) (build-spec Langkah 3) + refresh-share gamma.
//
//   log P(t) = a + b * log(1 + t) + sum of refresh level-shifts
//
// A refresh is a discrete jump: consecutive epochs whose log player count
// rises by more than JUMP_LOG (0.2) mark a refresh epoch, and the jump size
// is taken out of the trend before fitting a and b by least squares, then
// added back for the forecast. No refresh is ever forecast into the future:
// future refreshes are uncertainty, not a rise in P-hat (that is v2's
// sigma_refresh). Two guardrails bind the extrapolation: the fitted slope is
// clamped to [0, 1.5], and P-hat is floored at the last observed pool and
// capped at 20x it.
//
// Gamma is the single GLOBAL refresh share: how much of a pool jump earners
// follow, E ~ P^gamma. It is estimated at runtime from the aggregate totals
// across each observed refresh (delta log trophies_earned over delta log
// players), averaged with weights equal to the jump sizes. With no refresh
// observed (the K = 1 kit case) gamma is the neutral prior 0.5, and the
// sensitivity of the result to gamma in {0, 0.5, 1} is a v1 reporting duty,
// not a fitted number.

import type { Epoch } from "./types.ts";

export const JUMP_LOG = 0.2;
export const POOL_SLOPE_PRIOR = 0.7;
export const POOL_CAP_MULTIPLE = 20;
export const GAMMA_PRIOR = 0.5;

export interface PoolFit {
  a: number;
  b: number;
  // Cumulative refresh jump (in log units) at each epoch, same order.
  jumpsCumulative: number[];
  totalJump: number;
  gamma: number;
  pLast: number;
  tLast: number;
  refreshCount: number;
}

function leastSquares(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < n; k++) {
    sx += xs[k];
    sy += ys[k];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    sxx += (xs[k] - mx) * (xs[k] - mx);
    sxy += (xs[k] - mx) * (ys[k] - my);
  }
  if (sxx <= 1e-12) return { a: my, b: POOL_SLOPE_PRIOR };
  return { a: my - (sxy / sxx) * mx, b: sxy / sxx };
}

export function fitPool(epochs: Epoch[]): PoolFit {
  const jumpsCumulative: number[] = [];
  let running = 0;
  for (let k = 0; k < epochs.length; k++) {
    if (k > 0) {
      const step = Math.log(epochs[k].players) - Math.log(epochs[k - 1].players);
      if (step > JUMP_LOG) running += step;
    }
    jumpsCumulative.push(running);
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < epochs.length; k++) {
    xs.push(Math.log(1 + epochs[k].tHours));
    ys.push(Math.log(epochs[k].players) - jumpsCumulative[k]);
  }
  let fit: { a: number; b: number };
  if (epochs.length === 1) {
    // Anchor the line on the single epoch's own time, not on t = 0:
    // a is log P at log(1 + t) = 0, so it must subtract the slope's share
    // at the epoch's time. (Treating P_0 as the value at t = 0 would
    // inflate every forecast whenever the epoch sits hours after launch.)
    fit = {
      a: Math.log(epochs[0].players) - POOL_SLOPE_PRIOR * Math.log(1 + epochs[0].tHours),
      b: POOL_SLOPE_PRIOR,
    };
  } else {
    fit = leastSquares(xs, ys);
  }
  const b = Math.min(1.5, Math.max(0, fit.b));
  const a = epochs.length === 1 ? fit.a : fit.a + (fit.b - b) * (xs.reduce((s, x) => s + x, 0) / xs.length);

  // Gamma from aggregate totals across observed refreshes. Trophies that
  // are saturated in every epoch (E == P throughout) are excluded from the
  // aggregate: their earners jump with the pool by construction, so leaving
  // them in would drag gamma toward 1 whatever the other trophies do.
  const nT = epochs[0].earners.length;
  const saturatedMask: boolean[] = [];
  for (let i = 0; i < nT; i++) {
    saturatedMask.push(epochs.every((ep) => ep.earners[i] === ep.players));
  }
  const aggTotal = (ep: Epoch): number => {
    let s = 0;
    for (let i = 0; i < nT; i++) {
      if (!saturatedMask[i]) s += ep.earners[i];
    }
    return s;
  };
  let gammaNum = 0;
  let gammaDen = 0;
  let refreshCount = 0;
  for (let k = 1; k < epochs.length; k++) {
    const dLogP =
      Math.log(epochs[k].players) - Math.log(epochs[k - 1].players);
    if (dLogP <= JUMP_LOG) continue;
    refreshCount++;
    const dLogT =
      Math.log(Math.max(1, aggTotal(epochs[k]))) -
      Math.log(Math.max(1, aggTotal(epochs[k - 1])));
    gammaNum += dLogP * dLogT;
    gammaDen += dLogP * dLogP;
  }
  const gamma =
    gammaDen > 0
      ? Math.min(1, Math.max(0, gammaNum / gammaDen))
      : GAMMA_PRIOR;

  const last = epochs[epochs.length - 1];
  return {
    a,
    b,
    jumpsCumulative,
    totalJump: running,
    gamma,
    pLast: last.players,
    tLast: last.tHours,
    refreshCount,
  };
}

export function forecastPool(fit: PoolFit, tTargetHours: number): number {
  const raw = Math.exp(
    fit.a + fit.b * Math.log(1 + tTargetHours) + fit.totalJump,
  );
  const floored = Math.max(raw, fit.pLast);
  return Math.min(floored, fit.pLast * POOL_CAP_MULTIPLE);
}
