// Quantiles on the logit scale (v2).
//
//   median_i = forecast rate, clamped to [0.01, 99.99]
//   q_tau    = inv_logit(logit(median_i) + z_tau * sigma_total_i)
//
// The spread has five components (computed in the adoption module):
// trend (extrapolation random walk), refresh (Poisson future jumps,
// scaled by the share of a jump the rate keeps: 1 - gamma), count
// (small earner counts), lag (the snapshot's staleness is random with
// std 1/lambda days, times the adoption speed), and gamma (the
// estimation error of gamma itself, times the expected jump total).
// A global calibration multiplier CAL_M scales the total.
//
// The fan is ASYMMETRIC: refreshes only ever dilute a rate, so the
// lower quantiles are widened by (1 + A) and the upper ones narrowed
// by (1 - A). The median itself is already shifted down by the
// expected dilution, so the asymmetry is about the shape of the
// remaining uncertainty, not a second median shift.
//
// Saturated trophies keep a tight symmetric fan around logit(99.99);
// near-saturated trophies a slightly wider one. Guardrails: cummax
// enforces non-decreasing quantiles, every value is clamped to
// [0, 100] and rounded to 4 decimals.

import type { EarnerForecast } from "./adoption.ts";
import { ASYM_A, CAL_M, SAT_SIGMA } from "./params.ts";

export const Z_SCORES = [-1.645, -0.674, 0, 0.674, 1.645];

export function clampRate(pct: number): number {
  return Math.min(99.99, Math.max(0.01, pct));
}

export function logitOf(pct: number): number {
  const c = clampRate(pct);
  return Math.log(c / (100 - c));
}

export function invLogit(l: number): number {
  return 100 / (1 + Math.exp(-l));
}

export function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

export function quantilesFor(forecast: EarnerForecast): number[] {
  const median = clampRate(forecast.ratePct);
  const sigma =
    forecast.saturated || forecast.nearSaturated
      ? forecast.sigmaRaw
      : CAL_M * forecast.sigmaRaw;
  const centre = logitOf(median);
  const raw = Z_SCORES.map((z, j) => {
    // Lower tail (j = 0, 1) widens, upper tail (j = 3, 4) narrows;
    // the median (j = 2) is untouched. Saturated trophies stay
    // symmetric: their rate cannot dilute below the pool.
    if (forecast.saturated || forecast.nearSaturated) {
      return invLogit(centre + z * sigma);
    }
    const stretched = j < 2 ? z * (1 + ASYM_A) : z * (1 - ASYM_A);
    return invLogit(centre + stretched * sigma);
  });
  const out: number[] = [];
  let running = -Infinity;
  for (const v of raw) {
    const clamped = Math.min(100, Math.max(0, v));
    const rounded = round4(clamped);
    running = Math.max(running, rounded);
    out.push(running);
  }
  return out;
}

export function saturatedSigma(): number {
  return SAT_SIGMA;
}
